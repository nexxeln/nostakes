# Vision

nostakes is poker night with your friends, in the browser. One person opens a room and drops the link in the group chat. Up to nine friends join, build an avatar, sit down, and play no-limit hold'em. When the night ends, the app says who pays whom.

It should feel like sitting in the same room. It should not feel like an online casino.

`AGENTS.md` is the law for how code is written here. This file says what the code is for. When the two seem to disagree, fix the one that is wrong.

## Who it is for

A group of friends who already play together, or would if they lived closer. They trust each other. Some of them settle in real money afterwards, outside the app. The app never touches money. It keeps the count.

## What must be true

1. **The chips are right.** Every chip is an integer and is accounted for after every hand. A wrongly awarded pot is a real loss between friends. The rules are checked against an independent poker implementation, and whole nights are played by bots on every push.
2. **Nobody sees a card they should not.** A player's device receives only what that seat may see. Folded and mucked hands stay hidden for good, as they would at a real table.
3. **It plays the way the group already plays.** Antes, straddles, running it more than once, rabbit hunts, showing one card, mucking, conceding face down. Everything outside core hold'em is a host setting with a sensible default. We do not pick one house rule and hard-code it.
4. **Your friends' faces are the interface.** Faces sit around the table. They look at their cards, take their time, react. You hold to peek, drag a chip to raise, tap to call, flick your cards away to fold. That interaction is settled. New work fits into it.
5. **Calm, cute, and simple.** A light and a dark theme from one set of tokens. Avatars people enjoy making. One primary action on a screen. When in doubt, remove something.
6. **A bad connection never costs a hand.** Phones sleep, lose signal, and switch networks in the middle of a bet. The client reconnects, catches up without missing or repeating anything, and never loses an action the player took.
7. **The deck can be checked.** The person who runs the server may also be playing. Each hand's deck is sealed before its order is known, the order comes from a public randomness beacon, and every player's device verifies the cards it was shown. This proves the deck was not rigged or changed. It does not hide cards from whoever controls the server, and we say so.
8. **Settling up is one glance.** Each player's net for the night, and the fewest transfers that square everyone.

## How it is built

- Pure cores with no I/O: `engine` (the rules of a hand), `ledger` (the money across a night), `room` (one poker night as a reducer), `shuffle` (the sealed deck and its proofs). Commands go in, events come out, and state is rebuilt from events.
- One Cloudflare Durable Object per room hosts the room core, stores its event log, and speaks a small protocol over one WebSocket. Infrastructure is declared with Alchemy.
- A headless client holds the connection. A Foldkit web app wraps it.
- Effect for the hard parts. A lint and type fence that makes the easy path the right one. The conventions come from [rat-stack](https://ratstack.sh).
- Trunk-based. Small commits land on `main` as soon as the hook passes. Long checks run on CI after landing, and failures are fixed forward.

## What it is not

- Not a casino, not a place to play strangers, and not a way to move money.
- Not a tournament director. Cash games among friends first.
- Not a rules lawyer. Where the group's habit and a tournament rulebook differ, the host's setting wins.

## Status

Pre-release. The backend plays whole nights under test. The web app plays a real hand locally. Nothing is deployed yet.
