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

1. `packages/engine/scripts/export-hands.ts` plays seeded tables through the real engine. Tables have two to nine seats, every ante kind, single, double, and button straddles, `maxRuns` from 1 to 4, and churn between hands. It also tries illegal actions and run choices. It prints one JSON object per hand: rules, seats and stacks, the previous button, the deck, the straddle list, every command with the pending decision before it and whether the engine accepted it, the events, after-hand shows and rabbit hunts, and the final stacks.
2. `replay.py` rebuilds each hand in PokerKit with the same stacks, blinds, antes, and straddles. It deals every card explicitly from the exported deck, applies the same actions, and compares:
   - whose turn it is at every decision,
   - the call amount and the minimum and maximum raise at every decision,
   - that every accepted action is legal in PokerKit and every rejected action is illegal there,
   - antes, blinds, straddles, hole cards, and board cards, run by run,
   - who is asked for a run count,
   - the show and muck order at showdown and the hands tabled in an all-in,
   - the pots and their eligible seats, each award by run and seat, and the final stacks to the chip.

## Configured to match the brief

PokerKit can follow these engine rules when the replay sets it up a certain way. These hands count as compared in full. The reasons live in `CONFIGURATIONS` in `replay.py`.

- `no-burn-cards`: streets have no burn cards and every card comes from the exported deck.
- `straddle-sizes-preflop-raise`: the pre-flop minimum raise is the last straddle.
- `big-blind-ante-blind-first`: a short big blind pays its blind before the big-blind ante.
- `runs-agreed-smallest`: every run selector gets the smallest number anyone chose.
- `one-run-no-choice`: with `maxRuns` 1 the replay answers PokerKit's run question with no preference.
- `complete-board-show-or-muck`: at a complete-board showdown each seat shows only if PokerKit's `can_win_now` says it might win, even when someone is all in.
- `pokerkit-dead-check`: when PokerKit gives a seat a turn that the engine skips because no other seat can act, the replay checks for it.
- `heads-up-equal-blinds-opener`: heads-up with equal blinds the button acts first before the flop.

## Named exclusions

PokerKit cannot follow these rules. Each exclusion skips only the affected comparison and is counted. The reasons live in `EXCLUSIONS` in `replay.py`.

- `short-big-blind`: the brief keeps the call at the full big blind when the big blind posts short. PokerKit uses the chips posted. Pre-flop is compared up to the first decision where the sizes differ.
- `pokerkit-short-all-in-reopens`: PokerKit counts the first short all-in of a street as a full raise and reopens the betting. TDA Rule 49-A does not.
- `pokerkit-forgets-added-short-all-ins`: PokerKit restarts its sum of short all-ins once it reaches a full raise, so a later short all-in closes the betting again. TDA Rule 49-A counts them all.
- `pokerkit-refuses-raise-nobody-can-call`: PokerKit refuses a raise that no other live seat can call. The engine allows it and returns the uncalled excess. The replay plays the raise as a call.
- `odd-chip-spread`: PokerKit gives a whole remainder to the first run and the first winner. The brief hands leftover chips out one at a time. Awards are compared against the brief's split of PokerKit's own pots and winners.
- `pokerkit-unmatched-folded-chips`: PokerKit cannot pay a pot no live seat is eligible for. The engine returns those chips to the folders.

## Gaps

PokerKit has no model of these. The replay checks them with its own arithmetic from the brief, which is not an independent implementation:

- the button, the blinds, and who is dealt in (rules 1 and 2),
- which straddle lists are legal (rule 8),
- the cap on the number of runs (rule 19),
- rabbit hunting (rule 27),
- voluntary shows after the hand (rule 26).

## Findings

Each finding is the smallest hand the generator produced for that category, trimmed by `--findings` and re-checked. Replay a finding file to see the difference again.

### `dead-decision-after-short-big-blind`

File: `findings/dead-decision-after-short-big-blind.json`.

Heads-up, blinds 5 and 10, an every-player ante of 9. Seat 2 is the big blind with 14 chips. It posts the ante of 9 and then 5 of its big blind, and is all in. Seat 1 is the button and posts the ante of 9 and the small blind of 5. Both seats now have 14 in the pot, so neither can win a chip the other has not matched.

- **Expected.** Seat 1 has no decision. The hands are tabled and the board runs out, and the better hand takes the 28-chip pot. PokerKit asks nobody to act here.
- **Actual.** The engine asks seat 1 to call 5 more, up to the full big blind of 10, and accepts a fold. In this hand seat 1 folded and seat 2 took all 28 chips without a showdown. A call would also have changed nothing: rule 15 hands back every chip of it. Rule 29 makes a timeout a fold, so a player who steps away loses chips that should have gone to a showdown.
- **Which side is wrong.** The engine, through a gap in brief rule 7. Rule 7 keeps the call at the full big blind so that other seats can still contest a side pot. It does not cover the case where no other live seat can match anything, and rule 13 then waits for a seat that cannot change the outcome except by folding. TDA Rule 17 (2026 Rules, version 1.1) says: "All hands will be tabled without delay once a player is all-in and all betting action by all other players in the hand is complete." No other seat can bet here, so the hands should be tabled and run out.
- **Seen.** 18 of 100,000 hands at seed 20261110, all heads-up after the big blind posted short or not at all. The same decision appears multiway once everyone else has folded to the small blind (inferred from the rule, not seen in this run).

## PokerKit behaviour found along the way

These are PokerKit problems, not engine findings. They matter to anyone who upgrades the oracle.

- `State.select_runout_count(runout_count, player_index)` passes `player_index` to the verifier as the run count. With index 0 it fails with "The runout count 0 is not positive". With any other index the verifier picks the first selector. The replay never passes a player index.
- PokerKit counts the first short all-in of a street as a full raise, and it restarts its sum of short all-ins once that sum reaches a full raise. Both disagree with TDA Rule 49-A and are the two reopening exclusions above.
- Heads-up with equal blinds PokerKit opens with the big blind, against TDA Rule 36-C.
