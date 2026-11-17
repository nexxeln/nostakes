# Variants: the seams as built

The engine plays button-and-board games: every card is either one seat's hidden hole card or a shared board card, forced bets are set by position, the first to act is set by position, and the streets are preflop, a flop of three, a turn, and a river. A variant is a row of data that this one reducer reads, plus a few named rules. There is no plugin registry, no strategy object, and no second engine.

## On the wire: names

Two table rules, each through `setting()` so a stored config without them decodes to hold'em, no limit:

- `game` (`GameSchema` in `src/variants.ts`): `Holdem` or `Omaha`. It names a row in `VARIANTS`.
- `limit` (`BettingLimitSchema` in `src/rules.ts`): `NoLimit` or `PotLimit`, a tagged union so a `FixedLimit` with its own fields can join without changing what the others encode to.

They are independent: pot-limit hold'em and no-limit Omaha come free. The hand says its game: `HandStarted.game` is present when the game is not hold'em, so moments, replays, and clips, which read only a spectator's events, rank each hand by its own rule, and a rules change between hands changes nothing about a hand already dealt.

## Inside the engine: the seams

| Seam | Where | Hold'em | Omaha |
| --- | --- | --- | --- |
| Hole cards dealt | `Variant.holeCards`, dealt by passes in `forced-bets.ts` `holeCards` (pass p, turn i gets deck[p·n + i]) | 2 | 4 |
| How a hand is made | `Variant.playsFromHole` (`least` and `most` hole cards, the rest from the board), read by `rankHand`, `handRanker`, `bestHand`, `handsMadeFrom` | 0 to 2: any five | exactly 2, with exactly 3 from the board |
| What a hand costs to rank | `Variant.evaluationCost`, which divides the room's equity budget | 1 | 10 (60 five-card ranks a hand, measured about 36 times a hold'em rank) |
| The betting structure | `TableConfig.limit`, matched in `betting.ts` `legalFor` | `NoLimit`: the top of the range is the stack | `PotLimit`: the bet, plus every chip in the middle, plus the call, or the stack when less |
| The deck | `cards.ts` `DECK_SIZE` and the shuffle's `DECK_SIZE` | 52 | 52 |
| How a pot is won | `showdown.ts` `awardPart` and `rankOnBoard`: the best single `HandRank` takes it, split with `shareAmong` | high only | high only |

Every place that ranks a hand goes through `rankHand(game, hole, board)`, `handRanker(game, hole)` for a hot loop, or `bestHand(game, hole, board)` for the five cards that play. The boundary rule `nostakes-boundaries/no-hand-evaluation-outside-engine` stops product code in any other package or app from importing `evaluate`, which ranks any five cards and so would misread an Omaha hand. The seven-deuce bounty needs no rule of its own: a seven-deuce is a two-card hand (`isSevenDeuce`), so no Omaha hand is one.

Pot-limit counts in integers and never divides: `legalFor` sums every seat's `committedTotal` and the hand's `deadMoney` (antes, dead small blinds, the big-blind ante), adds the seat's call and the current bet, and keeps the minimum raise legal when the pot is smaller than it (`max(minTo, cap)`). A raise is all in when it takes the whole stack, not when it reaches the top of the range. `test/pot-limit.test.ts` recounts the cap from the public events at every decision of generated sessions.

## The next variants

| Variant | What it takes |
| --- | --- |
| Five-card Omaha (PLO5) | A row in `VARIANTS`: `holeCards: 5`, `playsFromHole: { least: 2, most: 2 }`, an `evaluationCost`. `MOST_HOLE_CARDS` and the shuffle's `MOST_HOLE_CARDS` already allow five, `runCap` already caps the runs by the cards left (nine-handed, a preflop all-in runs once), and the seal already binds the hole-card count. The work is the table drawing five cards and the PokerKit replay's hand type. |
| Fixed-limit betting | A `FixedLimit` case in `BettingLimitSchema` (with a raise cap) and its branch in `legalFor`, plus a raise count in `Round`. Min equals max, so the bet control becomes a button. A short all-in under a fixed limit has its own completion rule, which needs a brief. |
| Short deck | A deck axis: a 36-card deck in the engine and the shuffle (`DECK_SIZE`, the Merkle trees, the spare-deck check), and a second ranking in `evaluation.ts` (a flush beats a full house, A-6-7-8-9 is a straight), chosen by the variant row. |
| Omaha hi-lo | A pot-side axis: `awardPart`, `showOrMuck`, `shownAcrossRuns`, and `showing-down.ts` `standingAgainst` compare two sides, a low that may not qualify, and quartering, with a named rule for the odd chip between halves; `PotAwarded` names a side, and equity becomes two half-shares. This is the only variant here that changes how a pot is won. |

What does not fit: seven-card stud (face-up cards owned by one seat, a bring-in set by cards) and five-card draw (no board, a draw from the deck after the deal). Each would be a second engine package sharing the chips, pots, seating, ledger, room, and seal.

## How the tests extend

The session generators in `test/sessions.ts`, the room's generated nights, and the simulator draw `game` and `limit`, so chip conservation, the pot oracle, the secrecy checks, the bounty, bomb pots (single and double board), and the table model run over every variant with no new test. The showdown oracle (`test/hand-oracle.ts`) makes an Omaha hand independently of `rankHand`. A new variant row is reached the same way: draw it in the generators and teach the oracle its rule for making a hand.
