# PokerKit differential

This harness checks `@nostakes/engine` against PokerKit, a no-limit hold'em implementation written by someone else. The engine's own tests and simulator share its author's reading of the rules. The differential finds the places where a second, independent reading disagrees.

## Run it

```sh
pnpm --filter @nostakes/engine differential --seed 20261110 --hands 100000
```

The command builds the engine, exports the seeded hands to a temporary directory, and replays them in PokerKit. It prints a summary and exits non-zero on any unexplained difference. Set `DIFFERENTIAL_DIR` to keep the export and the JSON report in a directory you choose.

It needs `uv` and Python 3.14. The oracle is PokerKit 0.7.7 (`pokerkit` on PyPI, source `uoftcprg/pokerkit`), MIT-licensed by the Universal, Open, Free, and Transparent Computer Poker Research Group. The PEP 723 header of `replay.py` pins the version, and `replay.py.lock` pins the wheel and sdist by sha256. Nothing is added to the pnpm lockfile.

Replay one saved hand:

```sh
uv run --locked --script tools/differential/replay.py tools/differential/findings/dead-decision-after-short-big-blind.json
```

`replay.py` also takes `--workers N`, `--report FILE` for every difference as JSON, and `--findings DIR` to write the smallest hand of each unexplained category, trimmed and re-checked.

## How it works

1. `packages/engine/scripts/export-hands.ts` plays seeded tables through the real engine. Tables have two to nine seats, every ante kind, single, double, and button straddles, `maxRuns` from 1 to 4, `showdown` Automatic or Interactive, `allInHands` FaceUp or Hidden, `runCount` Vote or Fixed, `straddleSize` Doubling or TwoBigBlinds, `showdownOrder` RiverAggressor or LastAggressor, `voluntaryShows` EitherCard or BothCards, `rabbitHunters` DealtIn or StillIn, `blindPosting` HomeGame or Casino with posting choices, the `sevenDeuce` bounty on or off with decks that deal a seven-deuce on purpose, and churn between hands. At an interactive showdown a seat tables, or mucks when it may. It also tries illegal actions, run choices, mucks of winning hands, and showdown choices out of turn. It prints one JSON object per hand: rules, seats and stacks, the previous button, the deck, the straddle list, every command with the pending decision before it and whether the engine accepted it, the events, after-hand shows and rabbit hunts, each with the rules in force when it was asked, and the final stacks. A rules change between hands can land before those shows and hunts, as a change the host queues during a hand lands when it ends.
2. `replay.py` first checks every setting in the hand's rules, its refused starts, and its after-hand commands against the settings and values it was taught. Anything else is an `unknown-setting` difference, so a new engine setting fails the run until the replay models it or names an exclusion for it. It then rebuilds each hand in PokerKit with the same stacks, blinds, antes, and straddles. It deals every card explicitly from the exported deck, applies the same actions, and compares:
   - whose turn it is at every decision,
   - the call amount and the minimum and maximum raise at every decision,
   - that every accepted action is legal in PokerKit and every rejected action is illegal there,
   - antes, blinds, straddles, hole cards, and board cards, run by run,
   - who is asked for a run count,
   - the show and muck order at showdown and the hands tabled in an all-in,
   - at an interactive showdown, whose turn it is, and whether the seat asked is beaten in every pot it can still win (PokerKit's `can_win_now`), at every choice,
   - the pots and their eligible seats, each award by run and seat, and the final stacks to the chip.

## Configured to match the brief

PokerKit can follow these engine rules when the replay sets it up a certain way. These hands count as compared in full. The reasons live in `CONFIGURATIONS` in `replay.py`.

- `no-burn-cards`: streets have no burn cards and every card comes from the exported deck.
- `straddle-sizes-preflop-raise`: the pre-flop minimum raise is the last straddle.
- `big-blind-ante-blind-first`: a short big blind pays its blind before the big-blind ante.
- `runs-agreed-smallest`: every run selector gets the smallest number anyone chose.
- `one-run-ends-choice`: as soon as one seat chooses one run the engine runs the board once (amended rule 19). The replay answers the seats the engine never asked with one run.
- `fixed-runs`: with `runCount` Fixed the engine runs the board the most times the cap allows and asks nobody. The replay answers PokerKit's run question with that count after checking it against the cap.
- `one-run-no-choice`: with `maxRuns` 1 the replay answers PokerKit's run question with no preference.
- `complete-board-show-or-muck`: at a complete-board showdown each seat shows only if PokerKit's `can_win_now` says it might win, even when someone is all in.
- `pokerkit-dead-check`: when PokerKit gives a seat a turn that the engine skips because no other seat can act, the replay checks for it.
- `uncontested-winner-unshown`: the interactive showdown never asks a seat that is the last claimant of every pot it can win. PokerKit asks every seat, so the replay shows that hand in PokerKit after checking that no other live seat shares a pot with it.
- `interactive-show-or-muck`: with `showdown` Interactive the replay passes each engine choice to PokerKit's `show_or_muck_hole_cards` in PokerKit's own showdown order, and pays the pots among the seats PokerKit still has live.
- `heads-up-equal-blinds-opener`: heads-up with equal blinds the button acts first before the flop.

## Named exclusions

PokerKit cannot follow these rules. Each exclusion skips only the affected comparison and is counted. The reasons live in `EXCLUSIONS` in `replay.py`.

- `short-big-blind`: the brief keeps the call at the full big blind when the big blind posts short and another seat can still act (rule 7). PokerKit uses the chips posted. Pre-flop is compared up to the first decision where the sizes differ. A size or turn difference at a decision where no other seat can act is not excluded: the engine must then match PokerKit.
- `pokerkit-short-all-in-reopens`: PokerKit counts the first short all-in of a street as a full raise and reopens the betting. TDA Rule 49-A does not.
- `pokerkit-forgets-added-short-all-ins`: PokerKit restarts its sum of short all-ins once it reaches a full raise, so a later short all-in closes the betting again. TDA Rule 49-A counts them all.
- `pokerkit-refuses-raise-nobody-can-call`: PokerKit refuses a raise that no other live seat can call. The engine allows it and returns the uncalled excess. The replay plays the raise as a call.
- `muck-keeps-uncontested-pot`: at an interactive showdown a seat may muck the pots other seats still contest and keep a pot every other claimant has already mucked. PokerKit's muck forfeits every pot, so that pot would have no live seat. The rest of the hand is not compared.
- `all-in-hands-hidden`: with `allInHands` Hidden the engine deals an all-in run-out without tabling and shows or mucks once the board is complete. PokerKit tables every hand before an all-in run-out. The replay lets PokerKit table and still compares the boards, the pots, and the awards. It skips the tabling, the show-or-muck order, and the interactive choices, and it skips the awards of a hand where a seat mucked at an interactive showdown after the run-out, because that muck may concede a pot.
- `showdown-order-last-aggressor`: with `showdownOrder` LastAggressor the last seat to bet or raise on any street shows first. PokerKit starts with the river's last aggressor. When the orders differ the show-or-muck order is not compared, and after an interactive showdown nothing further is, because PokerKit cannot replay the choices in the engine's order.
- `casino-blind-posting`: with `blindPosting` Casino a seat that owes a blind waits for the big blind or posts to come in, a missed small blind is posted dead, and the button is a dead button. PokerKit has no seats outside the hand, no dead money but antes, and no dead button, so a hand whose dealt-in seats, button, or blinds differ from the moving button, or that has a post to come in, is not compared, and neither are rejected starts under Casino. The engine's table model and simulator check these rules instead. Other Casino hands are compared in full.
- `odd-chip-spread`: PokerKit gives a whole remainder to the first run and the first winner. The brief hands leftover chips out one at a time. Awards are compared against the brief's split of PokerKit's own pots and winners.

## Gaps

PokerKit has no model of these. The replay checks them with its own arithmetic from the brief, which is not an independent implementation:

- the button, the blinds, and who is dealt in (rules 1 and 2),
- which straddle lists are legal (rule 8),
- the cap on the number of runs (rule 19),
- rabbit hunting (rule 27), including who may hunt under `rabbitHunters` StillIn,
- voluntary shows after the hand (rule 26), including both-or-neither under `voluntaryShows` BothCards,
- the seven-deuce bounty: the replay picks the seat from PokerKit's own pots and winners (a seven and a deuce that won, alone, every pot it was in on every board), takes each payment from PokerKit's final stacks, and compares the engine's `BountyPaid`, the cards it showed, and the final stacks with the payment added,
- that a show or hunt after the hand follows the rules in force when the seat asks, not the rules the hand was dealt under,
- at an interactive showdown, that a seat must table a hand that beats or ties the tabled hands of a pot another live seat contests, and may muck otherwise. PokerKit lets any seat muck, so the replay decides this with PokerKit's hand values.

## Findings

Each finding is the smallest hand the generator produced for that category, trimmed by `--findings` and re-checked. Replay a finding file to see the difference again.

### `dead-decision-after-short-big-blind` (fixed)

File: `findings/dead-decision-after-short-big-blind.json`. The file keeps the engine output from before the fix, so replaying it still shows the difference.

Heads-up, blinds 5 and 10, an every-player ante of 9. Seat 2 is the big blind with 14 chips. It posts the ante of 9 and then 5 of its big blind, and is all in. Seat 1 is the button and posts the ante of 9 and the small blind of 5. Both seats now have 14 in the pot, so neither can win a chip the other has not matched.

- **Expected.** Seat 1 has no decision. The hands are tabled and the board runs out, and the better hand takes the 28-chip pot. PokerKit asks nobody to act here.
- **Was.** The engine asked seat 1 to call 5 more, up to the full big blind of 10, and accepted a fold. In this hand seat 1 folded a straight and seat 2 took all 28 chips without a showdown.
- **Fix.** When no other non-folded seat is `Active`, the engine caps the bet a seat must match at the largest commitment this street among the other non-folded seats. Here that leaves nothing to call, so the street closes and the board runs out. A big blind short by less than the small blind leaves a real call of the difference. `packages/engine/test/betting.test.ts` replays this hand under "Rule 7 amended".
- **Seen before the fix.** 18 of 100,000 hands at seed 20261110 under the first harness. With `short-big-blind` narrowed, the same export shows the bug in more hands, because heads-up calls charged at the full big blind are no longer excluded. After the fix, 0.

## PokerKit behaviour found along the way

These are PokerKit problems, not engine findings. They matter to anyone who upgrades the oracle.

- `State.select_runout_count(runout_count, player_index)` passes `player_index` to the verifier as the run count. With index 0 it fails with "The runout count 0 is not positive". With any other index the verifier picks the first selector. The replay never passes a player index.
- PokerKit counts the first short all-in of a street as a full raise, and it restarts its sum of short all-ins once that sum reaches a full raise. Both disagree with TDA Rule 49-A and are the two reopening exclusions above.
- Heads-up with equal blinds PokerKit opens with the big blind, against TDA Rule 36-C.
