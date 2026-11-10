import {
  Activities,
  clientCodec,
  roomClient,
  webSocketTransport,
} from "@nostakes/client";
import type { ClientSchemas, ClientState, RoomClient } from "@nostakes/client";
import { ActionSchema, SeatIndexSchema } from "@nostakes/engine";
import { HttpRefusalSchema, RoomPassSchema } from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
  RoomRejectionSchema,
  RoomViewSchema,
  RoomViews,
  SeenEventSchema,
} from "@nostakes/room";
import type {
  MemberCommand,
  RoomRejection,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import {
  Console,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Schedule,
  Schema,
  Stream,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

interface SmokeTypes {
  readonly Command: MemberCommand;
  readonly Event: SeenEvent;
  readonly View: RoomView;
  readonly Rejection: RoomRejection;
}

const schemas: ClientSchemas<SmokeTypes> = {
  command: Schema.toCodecJson(MemberCommandSchema),
  event: Schema.toCodecJson(SeenEventSchema),
  rejection: Schema.toCodecJson(RoomRejectionSchema),
  view: Schema.toCodecJson(RoomViewSchema),
};

const replies = clientCodec(schemas).reply;

const Commands = MemberCommandSchema.cases;

const STEP_SECONDS = 60;

const BUY_IN = ChipAmountSchema.make(100);

const READY_WAIT_SECONDS = 5;

const READY_ATTEMPTS = 36;

const USAGE =
  "usage: pnpm smoke <base-url> [--origin=<origin>], for example pnpm smoke https://nostakes.club";

class SmokeFailed extends Schema.TaggedError<
  SmokeFailed,
  { readonly brand: unique symbol }
>()("SmokeFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The smoke check failed at "${this.step}": ${this.detail}.`;
  }
}

const failed = (step: string, detail: string) =>
  new SmokeFailed({ detail, step });

const check = (step: string, holds: boolean, detail: string) =>
  holds ? Effect.void : Effect.fail(failed(step, detail));

const encodeOpen = Schema.encodeSync(Schema.toCodecJson(OpenRequestSchema));

const encodeJoin = Schema.encodeSync(Schema.toCodecJson(JoinRequestSchema));

const settings = Effect.gen(function* readSettings() {
  const [base = "", ...flags] = process.argv.slice(2);

  if (!URL.canParse(base)) {
    return yield* failed("read the base URL", USAGE);
  }

  const baseUrl = new URL(base);

  const origin = Option.fromUndefinedOr(
    flags
      .find((flag) => flag.startsWith("--origin="))
      ?.slice("--origin=".length)
  ).pipe(Option.getOrElse(() => baseUrl.origin));

  return { base: baseUrl, origin };
});

const socketUrl = (base: URL, code: string) => {
  const url = new URL(`/rooms/${code}/socket`, base);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
};

const fetchPage = (step: string, url: URL) =>
  HttpClient.get(url).pipe(
    Effect.flatMap((response) =>
      response.text.pipe(
        Effect.map((text) => ({
          html: (response.headers["content-type"] ?? "").includes("text/html"),
          status: response.status,
          text,
        }))
      )
    ),
    Effect.mapError((cause) => failed(step, String(cause))),
    Effect.filterOrFail(
      ({ html, status }) => status === 200 && html,
      ({ status }) => failed(step, `answered ${status} instead of the page`)
    )
  );

const AnswerSchema = Schema.Union([RoomPassSchema, HttpRefusalSchema]);

type Answer = typeof AnswerSchema.Type;

interface Answered {
  readonly answer: Answer;
  readonly status: number;
}

const isPass = Schema.is(RoomPassSchema);

const isRefusal = Schema.is(HttpRefusalSchema);

const roomUnavailable = ({ answer }: Answered) =>
  isRefusal(answer) && answer.refusal === "RoomUnavailable";

const answerFrom = (
  step: string,
  url: URL,
  origin: string,
  body: Schema.Json
) =>
  HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeader("origin", origin),
    HttpClientRequest.bodyJsonUnsafe(body),
    HttpClient.execute,
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.map((json) => ({ json, status: response.status }))
      )
    ),
    Effect.mapError((cause) => failed(step, String(cause))),
    Effect.flatMap(({ json, status }) =>
      Schema.decodeUnknownEffect(AnswerSchema)(json).pipe(
        Effect.map((answer): Answered => ({ answer, status })),
        Effect.mapError(() =>
          failed(step, `answered ${status} ${JSON.stringify(json)}`)
        )
      )
    )
  );

const passOf =
  (step: string) =>
  ({ answer, status }: Answered) =>
    isPass(answer)
      ? Effect.succeed(answer)
      : Effect.fail(
          failed(step, `answered ${status} ${JSON.stringify(answer)}`)
        );

const passFrom = (step: string, url: URL, origin: string, body: Schema.Json) =>
  answerFrom(step, url, origin, body).pipe(Effect.flatMap(passOf(step)));

const openClient = (base: URL, origin: string, pass: RoomPass) =>
  roomClient(schemas, {
    token: pass.token,
    url: socketUrl(base, pass.code),
  }).pipe(
    Effect.provide(
      webSocketTransport((url) => new WebSocket(url, { headers: { origin } }))
    ),
    Effect.tap((client) => client.start)
  );

type SmokeClient = RoomClient<SmokeTypes>;

type SmokeState = ClientState<SmokeTypes>;

const waitFor = <A>(
  client: SmokeClient,
  step: string,
  pick: (state: SmokeState) => Option.Option<A>
) =>
  client.states.pipe(
    Stream.map(pick),
    Stream.filter(Option.isSome),
    Stream.runHead,
    Effect.flatMap((found) =>
      found.pipe(
        Option.flatten,
        Effect.fromOption,
        Effect.mapError(() => failed(step, "the client stopped first"))
      )
    ),
    Effect.timeoutOrElse({
      duration: Duration.seconds(STEP_SECONDS),
      orElse: () =>
        Effect.fail(failed(step, `nothing after ${STEP_SECONDS} seconds`)),
    })
  );

const openView = (state: SmokeState) =>
  state.view.pipe(Option.filter(RoomViews.$is("Open")));

const closedView = (state: SmokeState) =>
  state.view.pipe(Option.filter(RoomViews.$is("Closed")));

const isDealtFromBeacon = SeenEventSchema.guards.DealtFromBeacon;

const isDealtWithoutBeacon = SeenEventSchema.guards.DealtWithoutBeacon;

const dealLine = (event: SeenEvent) => {
  if (isDealtFromBeacon(event)) {
    return Option.some(
      `the first hand was dealt from drand round ${event.round}`
    );
  }

  if (isDealtWithoutBeacon(event)) {
    return Option.some(
      `the first hand was dealt without the beacon (${event.reason}) for round ${event.round}`
    );
  }

  return Option.none();
};

const firstDeal = (client: SmokeClient) =>
  client.activity.pipe(
    Stream.map((activity) =>
      Activities.$is("Applied")(activity)
        ? dealLine(activity.event)
        : Option.none()
    ),
    Stream.filter(Option.isSome),
    Stream.runHead,
    Effect.map(Option.flatten)
  );

const ask = (client: SmokeClient, step: string, command: MemberCommand) =>
  client.send(command).pipe(
    Effect.mapError((failure) => failed(step, failure._tag)),
    Effect.filterOrFail(replies.guards.Accepted, (reply) =>
      failed(step, `the room answered ${JSON.stringify(reply)}`)
    )
  );

const smoke = Effect.gen(function* smoke() {
  const { base, origin } = yield* settings;
  const started = performance.now();

  const note = (line: string) =>
    Console.log(
      `${((performance.now() - started) / 1000).toFixed(1).padStart(5)} s  ${line}`
    );

  yield* note(`smoke check against ${base.origin} as origin ${origin}`);

  yield* fetchPage("load the home page", base);
  yield* note("the home page loads");

  const anaPass = yield* answerFrom(
    "open a room",
    new URL("/rooms", base),
    origin,
    encodeOpen({ avatar: "fox", name: "Ana" })
  ).pipe(
    Effect.tap((answered) =>
      roomUnavailable(answered)
        ? note(
            `the server answered RoomUnavailable, so no room is reachable yet; asking again in ${READY_WAIT_SECONDS} s`
          )
        : Effect.void
    ),
    Effect.repeat({
      schedule: Schedule.spaced(Duration.seconds(READY_WAIT_SECONDS)),
      times: READY_ATTEMPTS - 1,
      while: roomUnavailable,
    }),
    Effect.flatMap(passOf("open a room"))
  );

  yield* note(`Ana opened room ${anaPass.code}`);

  yield* fetchPage("load the room link", new URL(`/r/${anaPass.code}`, base));
  yield* note("the room link loads the page");

  const benPass = yield* passFrom(
    "join the room",
    new URL(`/rooms/${anaPass.code}/members`, base),
    origin,
    encodeJoin({ avatar: "owl", name: "Ben" })
  );

  yield* note("Ben joined");

  const ana = yield* openClient(base, origin, anaPass);
  const ben = yield* openClient(base, origin, benPass);

  yield* waitFor(ana, "connect Ana's socket", openView);
  yield* waitFor(ben, "connect Ben's socket", openView);
  yield* note("both sockets are live");

  const deal = yield* firstDeal(ana).pipe(Effect.forkScoped);

  yield* ask(
    ana,
    "seat Ana",
    Commands.RequestSeat.make({ buyIn: BUY_IN, seat: SeatIndexSchema.make(0) })
  );
  yield* ask(
    ben,
    "seat Ben",
    Commands.RequestSeat.make({ buyIn: BUY_IN, seat: SeatIndexSchema.make(1) })
  );
  yield* ask(ana, "start the game", Commands.StartGame.make({}));
  yield* note("both sat down and the game started");

  const toAct = (state: SmokeState) =>
    openView(state).pipe(
      Option.filter(({ legal }) => Option.isSome(legal)),
      Option.map(({ code }) => code)
    );

  const [first] = yield* Effect.raceFirst(
    waitFor(ana, "deal the first hand", toAct).pipe(
      Effect.map((seen) => [ana, seen] as const)
    ),
    waitFor(ben, "deal the first hand", toAct).pipe(
      Effect.map((seen) => [ben, seen] as const)
    )
  );

  yield* note(
    Option.getOrElse(
      yield* Fiber.join(deal),
      () => "the first hand was dealt without a sealed deal event"
    )
  );

  yield* ask(ana, "queue the close", Commands.CloseRoom.make({}));
  yield* ask(
    first,
    "fold the first hand",
    Commands.Act.make({ action: ActionSchema.cases.Fold.make({}) })
  );

  const settlement = yield* waitFor(ana, "close the room", closedView);

  yield* waitFor(ben, "show Ben the closed room", closedView);

  const nets = settlement.settlement.balances.map(({ net }) => net);
  const sum = nets.reduce((total, net) => total + net, 0);

  yield* check(
    "read the settlement",
    settlement.settlement.balances.length === 2 && sum === 0,
    `expected two balances that sum to zero, got ${JSON.stringify(settlement.settlement)}`
  );

  yield* note(
    `the room closed with nets ${nets.join(" and ")} and ${settlement.settlement.transfers.length} transfer`
  );

  yield* ana.stop;
  yield* ben.stop;

  const again = yield* openClient(base, origin, anaPass);
  const reread = yield* waitFor(again, "read the settlement again", closedView);

  yield* check(
    "read the settlement again",
    JSON.stringify(reread.settlement) === JSON.stringify(settlement.settlement),
    "a fresh connection saw a different settlement"
  );

  yield* again.stop;
  yield* note("a fresh connection reads the same settlement");
});

const outcome = await Effect.runPromiseExit(
  smoke.pipe(
    Effect.scoped,
    Effect.tapError((failure) => Console.error(failure.message)),
    Effect.provide(FetchHttpClient.layer)
  )
);

process.exitCode = Exit.isSuccess(outcome) ? 0 : 1;
