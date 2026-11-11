# Blind posting: the rules as built

Setting: `TableConfig.blindPosting`, `HomeGame` (default, today's behaviour) or `Casino`. Source: Robert's Rules of Poker (Bob Ciaffone), Section 4, "Button and Blind Use", "Rules for using blinds", rules 2 to 13. Rule numbers below are that list's.

## Button rule: dead button (Robert's §4 rule 2b), with the heads-up rule (rule 3)

Robert's rule 2 allows either a moving button (2a) or a dead button (2b). A first draft used the moving button, because the engine already uses it. The simulator showed why it is not fair enough once blinds are owed: when a seat empties or sits out, the big blind can skip the next seat, and when the table shrinks one player can pay the big blind twice before another pays it once. The dead button fixes both by moving the big blind exactly one seat at a time:

- **Big blind:** the first seat after last hand's big blind that can be dealt in. It never skips a seat that can play.
- **Small blind:** the seat that had the big blind last hand. If that seat cannot be dealt in (empty, sitting out, or out of chips), there is no small blind that hand: a dead small blind.
- **Button:** the seat that had the small blind last hand, even if it is empty: a dead button. The deal and the action still go clockwise from the button seat.
- **Heads-up (rule 3):** the small blind is on the button. When play becomes heads-up, the seat that had the big blind most recently gets the button, so the big blind still moves to the other seat.
- **Fallback:** on the first hand the moving button picks the positions. When the dead-button positions collide (the big blind would land on the button seat), the hand is played on heads-up positions: the big blind goes where the rule above puts it, and the seat that had the big blind last hand takes the small blind and keeps the button, as rule 3 gives it at a heads-up table. If that seat cannot be dealt in, the small blind and the button are both dead there. Seats that come back are dealt in between them and take neither the button nor a blind, and nobody straddles that hand. This happens when a seat comes back between last hand's blinds at a table of three, and whenever a table grows after a heads-up hand, because heads-up the small blind is on the button. The next hand is an ordinary dead-button hand again. Two earlier fallbacks failed in the simulator. The moving button gave seat 1 the big blind a second time and let seat 4 skip it, after a heads-up hand between them when two seats that had busted came back at once. Seating the small blind and the button behind the big blind fixed that and put a seat that had last held the button, busted, and come back straight onto the button again.

`HomeGame` keeps the moving button exactly as today.

## The rules

1. **Setting.** `HomeGame` keeps today's rules exactly: a new or returning player is dealt in at the next hand and owes nothing. Everything below is `Casino` only.
2. **Debts.** Each occupied seat carries a debt: nothing, _entry_ (a new player), or _missed_ (a missed big blind, a missed small blind, or both). A seat owes each kind at most once.
3. **New player (rule 4).** A player who sits down owes the entry big blind, unless the table has not dealt a hand yet, or fewer than two other seats could be dealt in without owing anything. Either way that is a game being started, and nobody owes anything to start one (rule 13).
4. **Missing blinds (rule 10).** At each deal, a seat that cannot be dealt in:
   - misses the big blind, and with it the small blind, if the big blind passes over it, that is, it lies strictly between last hand's big blind and this hand's big blind. The small blind follows the big blind one hand later, so it passes the same seat;
   - misses the small blind if it is this hand's small blind seat (a dead small blind). A new player's entry debt does not grow (rule 5: letting the button pass is not a missed blind). A player with no chips misses blinds like a player sitting out (rule 12).
5. **Choosing.** A seat that owes chooses to _wait for the big blind_ (the default) or to _post_. The choice is a standing preference that the player can change at any time, including during a hand. It matters only while the seat owes.
6. **Waiting (rules 4 and 10).** A waiting seat is dealt in at the first hand where the big blind falls on it. It posts that big blind like any big blind, and its whole debt is cleared. Nothing missed is made up.
7. **Posting (rules 4 and 10).** A posting seat is dealt in at the next hand where it is neither the button seat, the small blind seat, nor a seat between them (rule 7: no new player is dealt in between the big blind and the button; they wait until the button passes). It posts after the blinds and straddles:
   - an entry debt or a missed big blind: the big blind amount, **live**. It counts toward the seat's bet, and when the action reaches it unraised it may check or raise;
   - a missed small blind: the small blind amount, **dead**. It goes into the pot and is not part of the seat's bet;
   - a seat that owes both posts both. A posting seat that the big blind falls on just posts the big blind and is square. A posting seat whose stack cannot cover its posts and any ante, with a chip to spare, waits instead.
8. **Square.** Every seat dealt into a hand is square afterwards.
9. **Too few square seats.** If fewer than two seats that could be dealt in owe nothing, every debt is forgiven and every seat that could be dealt in is (rule 13, a game being started). So a table always deals when two seats are not sitting out and have chips, and the room's deal deadline never waits on a debt.
10. **Straddles.** A seat that posts to come in may not straddle that hand. A dead button has no under-the-gun line or button straddle that hand.
11. **Rule changes.** A change to `HomeGame` clears every debt. A change to `Casino` starts every seat square.
12. **Chips.** Dead money is never part of a bet, never returned as uncalled, and belongs to the main pot. Every amount is a whole number of chips.

## What the simulator and the table model check

- Chips are conserved (the existing table total check).
- A seat dealt into a hand under `Casino` either owed nothing, or is that hand's big blind, or posted exactly what it owed (rules 6 to 8).
- A seat that cannot be dealt in owes every blind that passes it (rule 4), unless it is a new player.
- Nobody posts to come in while owing nothing, and no seat posts to come in from the button seat, the small blind seat, or between them (rule 7).
- The big blind never skips a seat: no seat dealt into both this hand and the last lies strictly between last hand's big blind and this hand's.
- Nobody pays the big blind twice in a row while another seat stays dealt in.
- Nobody plays an orbit free: a seat never holds the button twice without paying a blind, live or dead, in between. Under `HomeGame` a player can do this by sitting out through the blinds and coming back for the button.

## Worked cases

Seats are A to F clockwise. Blinds 5 and 10. "Owes" is the debt after the hand.

**A player returns between the blinds.** Hand 1: button A, small B, big C. D sits out before hand 2. Hand 2: the big blind moves from C to E and passes over D, so D owes both blinds; small C, button B. D sits back in before hand 3. Hand 3: big F, small E, button C. D lies between the button (C) and the small blind (E), so a posting D waits (rule 7) and owes nothing more. Hand 4: big A, small F, button E. D is after the big blind now, so a posting D comes in: 10 live and 5 dead. A waiting D is dealt in when the big blind reaches it: hand 5 big B, hand 6 big C, hand 7 big D. D pays 10 and owes nothing more.

**Two players return at once.** Hand 1: button A, small B, big C. D and E both sat out earlier and owe both blinds, and both post. Hand 2: big D (the first seat after C that can play), small C, button B. D just posts the big blind and is square. E is after the big blind, so E posts 10 live and 5 dead. If both waited, D would come in as the big blind of hand 2 and E as the big blind of hand 3.

**Heads-up.** Hand 1, three seats: button A, small B, big C. A busts and stands. Hand 2 is heads-up between B and C. C had the big blind most recently, so C gets the button and the small blind, and B is the big blind (rule 3). Today's moving button would give B the button and C the big blind twice in a row. A player returning to a heads-up table comes in only at a hand where it is after the big blind, so it never takes the button or the small blind on its first hand.

**A player busts on the button.** Hand 1: button A, small B, big C. A loses every chip. Hand 2: big D, small C, button B. A is behind the button, and no blind passes it. If A buys back in before the big blind comes round, A is square and is dealt in at the next hand. If the big blind passes A while A has no chips, A owes both blinds on coming back, like a player sitting out.

**The big blind leaves.** Hand 1: button A, small B, big C. C stands up after the hand. Hand 2: big D, small blind dead (C's empty seat), button B. Nobody posts a small blind, and D pays the big blind it would have paid anyway, so nobody skips it. Hand 3: big E, small D, button on C's empty seat: a dead button. If C had sat out instead of leaving, C's seat would be hand 2's small blind seat, and C would owe the small blind.
