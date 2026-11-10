import {
  Actions,
  Antes,
  ChipsSchema,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
  decide,
  describe,
  evaluate,
  evolve,
  handCategory,
  initialTable,
  pendingDecisions,
  rankOf,
  suitOf,
} from "@nostakes/engine";
import type {
  Action,
  Card,
  Command,
  Event,
  HandCategory,
  LegalActions,
  SeatIndex,
  TableState,
} from "@nostakes/engine";
import {
  Audiences,
  MOMENT_KINDS,
  RoomEvents,
  SeenEvents,
  TIERS,
  boardCategory,
  headline,
  millis,
  momentsOf,
  redact,
} from "@nostakes/room";
import type { Moment, SeenTableEvent } from "@nostakes/room";
import { Console, Effect, Option, Predicate, Result, Schema } from "effect";

const DEFAULT_SEED = 20_261_111;

const DEFAULT_NIGHTS = 300;

const HANDS_PER_NIGHT = 100;

const BIG_BLIND = 10;

const STACK = 100 * BIG_BLIND;

const LEADS_PER_NIGHT = { least: 2, most: 12 };

const LOUDEST_PER_NIGHT = 0.5;

class MomentsCheckFailed extends Schema.TaggedError<
  MomentsCheckFailed,
  { readonly brand: unique symbol }
>()("MomentsCheckFailed", {
  detail: Schema.String,
  seed: Schema.Int,
}) {
  override get message() {
    return `Seed ${this.seed}: ${this.detail}`;
  }
}

const OUT_OF_BAND =
  "Moments are meant to be rare enough to feel like events and common enough that a night of a hundred hands sees a handful. Look at the table printed above, then at the thresholds in packages/room/src/moments.ts, before you move the band.";

const argument = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = Number(process.argv[index + 1]);

  return index !== -1 && Number.isSafeInteger(value) ? value : fallback;
};

const randomSource = (seed: number) => {
  let state = (Math.abs(Math.trunc(seed)) % 2_147_483_646) + 1;

  const below = (bound: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, bound);
  };

  return { below, chance: (percent: number) => below(1000) < percent * 10 };
};

type Random = ReturnType<typeof randomSource>;

const chips = (amount: number) => ChipsSchema.make(amount);

const seatAt = (index: number) => SeatIndexSchema.make(index);

const config = TableConfigSchema.make({
  ante: Antes.NoAnte(),
  bigBlind: chips(BIG_BLIND),
  maxRuns: RunCountSchema.make(2),
  rabbitHunt: false,
  showdown: "Automatic",
  smallBlind: chips(BIG_BLIND / 2),
  straddle: { button: false, underTheGun: 0 },
});

interface Player {
  readonly aggression: number;
  readonly bluffs: number;
  readonly heroCalls: number;
  readonly loose: number;
  readonly runsTwice: number;
  readonly showsBluffs: number;
  readonly showsWinners: number;
}

const playerFrom = (random: Random): Player => ({
  aggression: 30 + random.below(50),
  bluffs: 4 + random.below(14),
  heroCalls: 2 + random.below(10),
  loose: random.below(5),
  runsTwice: random.below(70),
  showsBluffs: 10 + random.below(40),
  showsWinners: random.below(25),
});

const shuffledDeck = (random: Random) => {
  const cards = Array.from({ length: 52 }, (_, index) => index);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = random.below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return Schema.decodeSync(DeckSchema)(cards);
};

const RANK_POINTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];

const startingScore = (hole: readonly Card[]) => {
  const [first = 0, second = 0] = hole
    .map((card) => rankOf(card))
    .toSorted((left, right) => right - left);

  const suits = new Set(hole.map((card) => suitOf(card)));
  const suited = hole.length === 2 && suits.size === 1;

  if (first === second) {
    return Math.max(5, (RANK_POINTS[first] ?? 0) * 2);
  }

  const gap = first - second - 1;
  const gapPenalty = [0, 1, 2, 4][gap] ?? 5;
  const connected = gap <= 1 && first < 10 ? 1 : 0;

  return (RANK_POINTS[first] ?? 0) + (suited ? 2 : 0) - gapPenalty + connected;
};

const CATEGORY_ORDER: readonly HandCategory[] = [
  "HighCard",
  "OnePair",
  "TwoPair",
  "ThreeOfAKind",
  "Straight",
  "Flush",
  "FullHouse",
  "FourOfAKind",
  "StraightFlush",
  "RoyalFlush",
];

const level = (category: HandCategory) => CATEGORY_ORDER.indexOf(category);

const flushDraw = (hole: readonly Card[], board: readonly Card[]) =>
  [0, 1, 2, 3].some(
    (suit) =>
      hole.some((card) => suitOf(card) === suit) &&
      [...hole, ...board].filter((card) => suitOf(card) === suit).length === 4
  );

const madeStrength = (hole: readonly Card[], board: readonly Card[]) => {
  const rank = evaluate([...hole, ...board]);
  const category = handCategory(rank);
  const own = level(category) - level(boardCategory(board));
  const top = Math.max(...board.map((card) => rankOf(card)));

  if (own <= 0) {
    return board.length < 5 && flushDraw(hole, board) ? 0.5 : 0;
  }

  if (level(category) >= level("ThreeOfAKind")) {
    return 4;
  }

  if (category === "TwoPair") {
    return 3;
  }

  const [pair = 0] = describe(rank).ranks;

  return pair >= top ? 2 : 1;
};

interface Spot {
  readonly board: readonly Card[];
  readonly hole: readonly Card[];
  readonly legal: LegalActions;
  readonly pot: number;
  readonly stack: number;
  readonly street: string;
  readonly toCall: number;
}

const raiseTo = (spot: Spot, wanted: number): Action =>
  Option.match(spot.legal.raise, {
    onNone: () =>
      Option.isSome(spot.legal.call) ? Actions.Call() : Actions.Check(),
    onSome: ({ maxTo, minTo }) =>
      Actions.RaiseTo({
        to: chips(
          wanted * 5 >= maxTo * 3
            ? maxTo
            : Math.min(maxTo, Math.max(minTo, Math.floor(wanted)))
        ),
      }),
  });

const passive = (spot: Spot): Action =>
  spot.legal.canCheck ? Actions.Check() : Actions.Fold();

const callOrCheck = (spot: Spot): Action =>
  Option.isSome(spot.legal.call) ? Actions.Call() : Actions.Check();

const preflop = (spot: Spot, player: Player, random: Random): Action => {
  const score = startingScore(spot.hole);
  const facing = spot.toCall;
  const raised = facing > BIG_BLIND;
  const play = 7 - player.loose;

  if (score >= 12 && raised) {
    return raiseTo(spot, facing * 3 + spot.pot);
  }

  if (score >= 10 && !raised) {
    return raiseTo(spot, BIG_BLIND * 3 + spot.pot / 2);
  }

  if (score >= 10 || (score >= play + 2 && facing <= spot.stack / 6)) {
    return callOrCheck(spot);
  }

  if (score >= play && !raised) {
    return random.chance(player.aggression / 3)
      ? raiseTo(spot, BIG_BLIND * 3)
      : callOrCheck(spot);
  }

  return passive(spot);
};

const unopened = (spot: Spot, player: Player, random: Random): Action => {
  const strength = madeStrength(spot.hole, spot.board);
  const river = spot.board.length === 5;
  const betSize = Math.floor((spot.pot * 2) / 3);

  if (strength >= 2 && random.chance(40 + player.aggression / 2)) {
    return raiseTo(spot, betSize);
  }

  if (strength < 1 && random.chance(player.bluffs + (strength > 0 ? 15 : 0))) {
    return raiseTo(spot, river && random.chance(30) ? spot.pot : betSize);
  }

  return Actions.Check();
};

const facingBet = (spot: Spot, player: Player, random: Random): Action => {
  const strength = madeStrength(spot.hole, spot.board);
  const river = spot.board.length === 5;
  const share = spot.toCall / (spot.pot + spot.toCall);
  const reraise = raiseTo(spot, spot.toCall * 3 + spot.pot);

  if (strength >= 3) {
    return random.chance(
      strength >= 4 ? player.aggression : player.aggression / 4
    )
      ? reraise
      : callOrCheck(spot);
  }

  if (strength >= 2) {
    return share <= 0.4 || random.chance(50)
      ? callOrCheck(spot)
      : passive(spot);
  }

  if (strength >= 1) {
    return share <= 0.25 || (river && random.chance(player.heroCalls))
      ? callOrCheck(spot)
      : passive(spot);
  }

  const drawing = strength > 0 && !river && share <= 0.3;

  return drawing || (river && random.chance(player.heroCalls / 3))
    ? callOrCheck(spot)
    : passive(spot);
};

const postflop = (spot: Spot, player: Player, random: Random): Action =>
  spot.toCall === 0
    ? unopened(spot, player, random)
    : facingBet(spot, player, random);

const stackAt = (state: TableState, seat: SeatIndex) => {
  const occupant = state.seats[seat];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.stack
    : 0;
};

const betFor = (
  state: TableState,
  legal: LegalActions,
  players: readonly Player[],
  random: Random
): Action => {
  if (!TableStates.$is("InHand")(state)) {
    return Actions.Fold();
  }

  const { hand } = state;
  const me = hand.players.find((each) => each.seat === legal.seat);
  let pot: number = hand.deadMoney;

  for (const each of hand.players) {
    pot += each.committedTotal;
  }

  const spot: Spot = {
    board: hand.board,
    hole: me?.holeCards ?? [],
    legal,
    pot,
    stack: stackAt(state, legal.seat),
    street: hand.street,
    toCall: Option.getOrElse(legal.call, () => 0),
  };

  const player = players[legal.seat] ?? playerFrom(random);

  return hand.board.length === 0
    ? preflop(spot, player, random)
    : postflop(spot, player, random);
};

const commandFor = (
  state: TableState,
  players: readonly Player[],
  random: Random
): Option.Option<Command> =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        Commands.Act({
          action: betFor(state, legal, players, random),
          seat: legal.seat,
        })
      ),
    ChooseRuns: ({ seats }) => {
      const [seat = seatAt(0)] = seats;

      return Option.some(
        Commands.ChooseRuns({
          runs: RunCountSchema.make(
            random.chance(players[seat]?.runsTwice ?? 0) ? 2 : 1
          ),
          seat,
        })
      );
    },
    Nothing: () => Option.none(),
    Show: ({ choices }) =>
      Option.some(Commands.TableHand({ seat: choices.seat })),
  });

interface Table {
  readonly events: Event[];
  state: TableState;
}

const apply = (table: Table, command: Command) => {
  const decision = decide(table.state, command);

  if (Result.isFailure(decision)) {
    return Option.some(
      new MomentsCheckFailed({
        detail: `the table refused ${command._tag} with ${decision.failure._tag}. The home-game players in scripts/moments.ts only send legal commands, so their policy has a bug.`,
        seed: 0,
      })
    );
  }

  for (const event of decision.success) {
    table.state = evolve(table.state, event);
    table.events.push(event);
  }

  return Option.none();
};

const showsAfter = (
  state: TableState,
  events: readonly Event[],
  players: readonly Player[],
  random: Random
): readonly Command[] => {
  if (!TableStates.$is("BetweenHands")(state)) {
    return [];
  }

  const lastBettor = events.findLast(Events.$is("RaisedTo"));

  return Option.match(state.lastHand, {
    onNone: () => [],
    onSome: (lastHand) =>
      lastHand.players.flatMap((each) => {
        const hidden = each.holeCards.filter(
          (card) => !each.publicCards.includes(card)
        );

        const player = players[each.seat];
        const bluffed = lastBettor?.seat === each.seat;

        const percent = bluffed
          ? (player?.showsBluffs ?? 0)
          : (player?.showsWinners ?? 0) / 4;

        return hidden.length === 2 && !each.folded && random.chance(percent)
          ? [
              Commands.ShowCards({
                cards: ShownCardsSchema.make(hidden),
                seat: each.seat,
              }),
            ]
          : [];
      }),
  });
};

const EXAMPLES = argument("examples", 0);

const EXAMPLE_KIND =
  process.argv[process.argv.indexOf("--kind") + 1] ?? "BigHand";

const story = (feed: readonly SeenTableEvent[], moments: readonly Moment[]) =>
  [
    ...feed.flatMap((event) =>
      Events.$is("HoleCardsDealt")(event) ? [] : [JSON.stringify(event)]
    ),
    `=> ${JSON.stringify(moments)}`,
  ].join("\n");

const spectatorFeed = (events: readonly Event[]): readonly SeenTableEvent[] =>
  events.flatMap((event) => {
    const seen = redact(
      RoomEvents.Table({ at: millis(0), event }),
      Audiences.Spectator()
    );

    return SeenEvents.$is("Table")(seen) ? [seen.event] : [];
  });

const toppedUp = (table: Table) => {
  for (let index = 0; index < table.state.seats.length; index += 1) {
    const stack = stackAt(table.state, seatAt(index));
    const occupant = table.state.seats[index];

    if (
      occupant !== undefined &&
      Seats.$is("Occupied")(occupant) &&
      stack < STACK / 2
    ) {
      apply(
        table,
        Commands.AddChips({ amount: chips(STACK - stack), seat: seatAt(index) })
      );
    }
  }
};

interface Tally {
  readonly examples: string[];
  readonly every: Map<string, number>;
  readonly leads: Map<string, number>;
  readonly leadsPerNight: number[];
  readonly loudNights: number[];
  showdowns: number;
  allIns: number;
}

const counted = (map: Map<string, number>, key: string) => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

const playNight = (seed: number, tally: Tally) => {
  const random = randomSource(seed);
  const seated = 6 + random.below(4);
  const players = Array.from({ length: 9 }, () => playerFrom(random));
  const table: Table = { events: [], state: initialTable(config) };
  let leads = 0;
  let loud = 0;

  for (let index = 0; index < seated; index += 1) {
    apply(
      table,
      Commands.SitDown({
        buyIn: chips(STACK),
        player: PlayerIdSchema.make(`p${index}`),
        seat: seatAt(index),
      })
    );
  }

  for (let hand = 0; hand < HANDS_PER_NIGHT; hand += 1) {
    toppedUp(table);
    table.events.length = 0;

    const refused = apply(
      table,
      Commands.StartHand({ deck: shuffledDeck(random), straddles: [] })
    );

    if (Option.isSome(refused)) {
      return refused;
    }

    for (
      let next = commandFor(table.state, players, random);
      Option.isSome(next);
      next = commandFor(table.state, players, random)
    ) {
      const failed = apply(table, next.value);

      if (Option.isSome(failed)) {
        return failed;
      }
    }

    for (const show of showsAfter(table.state, table.events, players, random)) {
      apply(table, show);
    }

    const feed = spectatorFeed(table.events);
    const moments = momentsOf(feed);

    if (feed.some(Events.$is("ShowdownReached"))) {
      tally.showdowns += 1;
    }

    if (feed.some(Events.$is("RunsAgreed"))) {
      tally.allIns += 1;
    }

    for (const moment of moments) {
      counted(tally.every, `${moment._tag} ${moment.tier}`);
    }

    if (
      moments.some((moment) => Predicate.isTagged(moment, EXAMPLE_KIND)) &&
      tally.examples.length < EXAMPLES
    ) {
      tally.examples.push(story(feed, moments));
    }

    const shown = headline(moments, "All");

    if (Option.isSome(shown)) {
      const { lead } = shown.value;

      counted(tally.leads, `${lead._tag} ${lead.tier}`);
      leads += 1;
      loud += lead.tier === 3 ? 1 : 0;
    }
  }

  tally.leadsPerNight.push(leads);
  tally.loudNights.push(loud);

  return Option.none<MomentsCheckFailed>();
};

const sum = (counts: readonly number[]) => {
  let total = 0;

  for (const count of counts) {
    total += count;
  }

  return total;
};

const perHundred = (count: number, hands: number) =>
  ((count * 100) / hands).toFixed(2).padStart(7);

const program = Effect.gen(function* frequencies() {
  const seed = argument("seed", DEFAULT_SEED);
  const nights = argument("nights", DEFAULT_NIGHTS);
  const started = performance.now();

  const tally: Tally = {
    allIns: 0,
    every: new Map(),
    examples: [],
    leads: new Map(),
    leadsPerNight: [],
    loudNights: [],
    showdowns: 0,
  };

  for (let night = 0; night < nights; night += 1) {
    const refused = playNight(seed + night, tally);

    if (Option.isSome(refused)) {
      return yield* refused.value;
    }
  }

  const hands = nights * HANDS_PER_NIGHT;
  const seconds = (performance.now() - started) / 1000;

  yield* Console.log(
    `seed ${seed}: ${nights} nights of ${HANDS_PER_NIGHT} hands, ${hands} hands in ${seconds.toFixed(1)} s; showdowns ${perHundred(tally.showdowns, hands)} and all-in run-outs ${perHundred(tally.allIns, hands)} per 100 hands`
  );

  for (const example of tally.examples) {
    yield* Console.log(`${example}\n`);
  }

  yield* Console.log("kind        tier   leads/100  any/100");

  for (const kind of MOMENT_KINDS) {
    for (const tier of TIERS[kind]) {
      const key = `${kind} ${tier}`;

      yield* Console.log(
        `${kind.padEnd(11)} ${String(tier).padStart(4)} ${perHundred(tally.leads.get(key) ?? 0, hands)}  ${perHundred(tally.every.get(key) ?? 0, hands)}`
      );
    }
  }

  const leads = sum(tally.leadsPerNight);
  const loud = sum(tally.loudNights);
  const quiet = tally.leadsPerNight.filter((count) => count === 0).length;
  const loudNights = tally.loudNights.filter((count) => count > 0).length;
  const perNight = leads / nights;

  yield* Console.log(
    `moments shown per night of 100 hands: ${perNight.toFixed(2)} on average, fewest ${Math.min(...tally.leadsPerNight)}, most ${Math.max(...tally.leadsPerNight)}, ${quiet} nights with none; the loudest tier led ${loud} times, on ${loudNights} of ${nights} nights`
  );

  if (perNight < LEADS_PER_NIGHT.least || perNight > LEADS_PER_NIGHT.most) {
    return yield* new MomentsCheckFailed({
      detail: `a night of ${HANDS_PER_NIGHT} hands showed ${perNight.toFixed(2)} moments on average, outside ${LEADS_PER_NIGHT.least} to ${LEADS_PER_NIGHT.most}. ${OUT_OF_BAND}`,
      seed,
    });
  }

  if (loud / nights > LOUDEST_PER_NIGHT) {
    return yield* new MomentsCheckFailed({
      detail: `the loudest tier led ${loud} times in ${nights} nights, more than once every ${1 / LOUDEST_PER_NIGHT} nights. ${OUT_OF_BAND}`,
      seed,
    });
  }

  return yield* Console.log("moments stay rare enough to feel like events");
});

await Effect.runPromise(program);
