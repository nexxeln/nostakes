# Fair shuffle: design report

Labels: "run" means I ran it here and give the output. "inferred" means reasoning or outside facts I did not run or check from this machine.

## 0. The short version

- The biggest threat is not a rigged deck. The operator runs the server, and the server knows every hole card the moment it deals. Today it also stores the whole deck in the event log. An operator who plays, or who tips off a friend, sees your cards. Designs A, B and D below do nothing about that. Only C (mental poker) does, and C breaks the rule that a sleeping phone must never stall a hand.
- What the recommended design (A + public beacon + cut-and-choose) does give: the order comes from a public beacon round named in the seal, applied to a deck sealed before that round existed. Every card a player is shown is the card sealed at the place the rules dealt it from. A swapped card, a stacked deck, a grind over beacon rounds, a replayed seal, a card dealt out of order, and a split seal are each caught or neutralised. Nothing folded or mucked is ever revealed.
- **The sentence: "Provably fair" in nostakes means that, for each hand, any player can check that every card they were shown was sealed before the order was known, at the position that the beacon round named in the seal assigns to that card's place in the deal. It does not mean the server could not see your cards.**

## Facts from the code (read, not inferred)

- The engine deals with no burn cards. With n players dealt in, in deal order from the button, the player at deal-order index i gets deck[i] and deck[n+i] (packages/engine/src/forced-bets.ts `holeCards`). Streets take the next cards (betting.ts `nextStreet`). Runs take further cards, run by run (run-outs.ts `dealRuns`). A rabbit hunt shows the next undealt board cards (pots.ts `undealtBoard`).
- Today the server's entropy bytes become the deck (room/src/dealing.ts `deckFromBytes`, 128 bytes from poker-room.ts `DEAL_SHUFFLE_BYTES`). The whole deck sits in the stored HandStarted event, and `redact` strips it from every player's feed (room/src/views.ts). The operator can read every card, live or later.

## 1. Threat model

| Adversary | Sees | Can do | Wants | What the current system allows |
| --- | --- | --- | --- | --- |
| Operator: runs the Worker, the Durable Object storage, and the deploy; may sit at the table | Everything: the full deck in memory and in the stored log, every hole card in real time, every command | Change server code; read and rewrite storage; choose the entropy; delay or drop any message; lie about presence and timeouts; restart a room; show different players different things | Know hidden cards; choose the deck; change a card after seeing bets; bias the order toward a seat | All four. Nothing is committed, so a swap leaves no trace. The server picks the deck. Hole cards are readable at any time. |
| Player colluding with the operator | Own cards plus whatever the operator passes on (all hole cards, the future board) | Everything a player can do, timed with the operator's knowledge; withhold or time their own messages | Win pots with information others lack; get dealt good hands | All of it: the operator can relay every card. |
| Player acting alone | Own hole cards, public cards, shown hands, presence | Send commands, go silent, disconnect, replay old messages, try to read others' cards from what the server sends | Read others' hole cards; bias their own deal; stall a hand they are losing | Nothing beyond protocol bugs. Redaction strips others' hole cards, the entropy is server-side, and clocks force a timeout action. |
| Outsider on the network | TLS-encrypted traffic, timing, message sizes | Drop or delay a player's connection; with a broken TLS setup, read or alter frames | Read cards; knock a player off | Can drop a player (the clock then folds or checks for them). Cannot read cards without breaking TLS. |

Two notes on the operator:

- In every design here except C, the operator can read every folded and mucked card from storage. The hard constraint ("never reveal a card the rules did not make public") is about what the protocol reveals to players. Against the operator, only C keeps it.
- Seeing hole cards in real time is worth far more to a cheating operator than any deck bias. A design that stops deck bias but not this must not be sold as "cheat-proof".

## 2. The designs compared

n = the number of contributions the server holds for one hand (at most 9).

|  | A: server seals each card | B: A + player randomness | C: mental poker | D1: A + public beacon | D2: VRF | D3: ZK proof that the sealed deck is a permutation |
| --- | --- | --- | --- | --- | --- | --- |
| Operator swaps a card after bets | Detected at once by every player shown the card | Same as A | Prevented: cards are encrypted to everyone | Same as A | Same as A | Same as A |
| Operator chooses the deck | **Not addressed.** The server picks the order outright and nobody can tell | Limited to choosing among up to 2^n − 1 deals (511 at a full table). Each honest exclusion shows on that player's screen | Prevented unless enough key holders collude | **Prevented.** One deal per seal; only a visible abort is left | **Useless.** The operator holds the key (attack below) | Proves distinct cards only, nothing about order |
| Operator sees hole cards | Not addressed | Not addressed | **Prevented**, unless the operator colludes with enough key holders | Not addressed | Not addressed | Not addressed |
| Operator + one colluder | As the operator | Undetected: 4 deals (the operator's seat and the colluder each send or withhold). Up to 511 if it accepts that honest players see exclusions | Colluders below the threshold learn nothing | One deal; the colluder adds nothing | As the operator | - |
| Player alone | Learns nothing new: salted leaves hide unopened cards | Cannot bias: their value is fixed before they see others' (hash chain). Withholding only drops their own value | Can stall every card by going silent (n-of-n) | Nothing | Nothing | Nothing |
| Outsider | Can only make checks fail | Can drop a player's value (no bias, since the outsider does not know the deck) | Can stall the hand by cutting off any key holder | Nothing | - | - |
| Prevented or detected | Swaps detected | Swaps detected; an excluded player sees their own exclusion (nobody else does) | Prevented | Swaps and round grinding detected; order choice prevented | - | Bad deck detected outright |
| Round trips before a deal | 0 | 1 (reveal, with a hash chain committed at sit-down) or 2 (commit and reveal per hand) | n sequential shuffle passes, then 1 round per dealing step (hole cards, flop, turn, river, each run, each rabbit) | 0 from players. The server waits for the next beacon round: at most one period (3 s, inferred), hidden in the 5 s between-hands pause | 0 | 0 |
| A phone is offline | No effect | Its value is left out; the deal goes on | n-of-n: the hand stalls. t-of-n: tolerates n−t sleepers, but any t colluders see everything | No effect | No effect | No effect |
| What it reveals | Only cards the rules made public, plus Merkle paths (hashes of salted leaves) | Same, plus the players' random values | Nothing beyond public cards | Same as A, plus the spare deck, which is never dealt | - | Proof bytes only |
| Practical today? | Yes; built here | Yes; `combine` accepts player values. The hash chain is not built | Not without a curve library, a key-generation protocol, and shuffle proofs (inferred: a separate project of weeks, with custom crypto) | Yes. The Worker fetches a drand round over HTTPS. The client verifies it (a BLS library, or by fetching the round itself) | Possible but pointless | Curve-based shuffle arguments need a library and custom proof code. A SNARK over SHA-256 Merkle leaves is millions of constraints (inferred: not practical in a Worker) |

### A: seal each card

Commit to 52 salted leaves under one RFC 6962 Merkle root before the hand. Open a card (card, salt, inclusion path) to whoever the rules show it to. Binding (SHA-256 collision resistance) stops a swap after the seal. Hiding (32-byte salts) keeps the unopened leaves secret. Nothing proves the order: the server can stack the deck and seal the stacked deck. On its own, A is honest bookkeeping, not fairness.

### B: players add randomness after the seal

The order is a public permutation of the sealed positions, drawn from seed = H(roots, contributions). If at least one contribution was unknown to the server when it sealed, the sealed order stops mattering.

The variants, and what each one allows:

- **Plain values, no commitment.** The server relays the honest values to a colluder, who sends last and grinds. Each candidate costs one seed hash plus a short stream (about 10 SHA-256 blocks), so a phone tries well over 10^4 per second (inferred). That is full control: pocket aces for the colluder every hand. Rejected.
- **Commit, then reveal, per hand.** A colluder can no longer grind, but the server is the hub. It sees every reveal before it decides which ones "arrived", so it can include any subset and claim the rest timed out. That is up to 2^n − 1 different deals: **511 at a full table** (run: test "a server holding nine player values can choose among 511 different deals"). The best of 511 random deals gives the colluder pocket aces with probability 1 − (220/221)^511 ≈ 0.90, against 1/221 for one deal. It costs two round trips before every deal.
- **Hash chain (the best form of B).** At sit-down, each device commits to the tail y0 = H^N(x) of a hash chain, then reveals y_k for hand k (anyone checks H(y_k) = y_(k−1)). No commit round per hand, and the colluder's values were fixed long before the deck. The subset choice remains: 2^n − 1.
- **Why the subset grind is not free.** Every excluded value shows on its owner's screen (MyContributionLeftOut, tested). Dropping only players who really are asleep gains nothing, because they sent no value. So the undetected choice is the operator's own seat and the colluder each sending or withholding: **4 deals** (2 if the operator does not sit). Choosing among 511 means several awake players see exclusions every hand. Only the excluded player detects it, and they cannot prove it: the server can always claim the message was late.
- A contributor who refuses to reveal drops only their own value. The protocol must never restart a hand over a missing reveal, because a restart is a free re-roll for the server.

### C: mental poker

What it would take (inferred): an elliptic-curve group from an audited library (a new dependency); a joint key per night (n-of-n keys with proofs of knowledge, or a threshold key generation); a verifiable shuffle, where each device in turn re-encrypts and permutes the 52 ciphertexts and proves it (for example Bayer–Groth); and per-card decryption shares with Chaum–Pedersen proofs. Dealing a hole card needs a share from every other key holder, and every board card needs shares from all of them. With n-of-n keys, one sleeping phone stalls the hand, which the brief forbids. With t-of-n, n−t phones may sleep, but any t players together see every card, and the shuffle is still n sequential passes before each hand. It is the only design that hides cards from the operator, and it is a separate, large project.

### D: beacon, VRF, ZK

- **Public beacon (drand quicknet; details inferred, not checked from here):** a threshold BLS signature every 3 s from the League of Entropy (Cloudflare, Protocol Labs, EPFL and others); randomness = SHA-256(signature). The seal names round r. The server must deliver the seal before round r is published. Each client that receives it in time can confirm, from its own clock or by fetching the latest round, that r was still in the future. Once round r is out, nobody has a choice left. The server can only (a) abort the sealed hand, which every player who saw the seal sees as a sealed hand that was never dealt, or (b) show players different seals, which fails as soon as a shared board card is dealt (run: test "a server showing two players different seals cannot show them the same board"). A Worker can fetch a round over HTTPS. A client checks the value by verifying the BLS signature (needs a pairing library such as @noble/curves) or by fetching the same round from a relay itself, which means trusting the relay's TLS and the League of Entropy.
- **VRF:** useless against this operator. The operator holds the secret key, so before sealing hand k it can compute VRF(sk, k), and with it the order, and then seal whatever deck makes that order deal what it wants. If the VRF input includes the root, the operator grinds salts until the output suits it. A VRF only helps when the key holder is not the adversary.
- **ZK proof of a permutation:** would prove the sealed deck is 52 distinct cards. Curve-based shuffle arguments need a library and custom proof code, and a SNARK over SHA-256 leaves is millions of constraints (inferred). Neither fits today. **Cut-and-choose** does the job with hashes only. Seal two independent decks, let the seed pick which one is dealt, and open the other in full. A deck that is not 52 distinct cards is caught publicly with probability 1/2 per hand, and the opened spare reveals nothing about the dealt deck (independent order and salts). Built here.

### How does a player know the sealed deck holds 52 distinct cards?

For the dealt deck, they cannot tell from openings alone. What they do get:

1. Cut-and-choose: the spare deck is opened in full and checked as a permutation (SpareDeckRepeatsCard). A server that seals bad decks is caught by every player in half of those hands.
2. Within the dealt deck, a player shown the same card twice (their hole card on the board, or in a shown hand) holds two valid openings of one card at two positions. That is transferable proof (CardSeenTwice).
3. Once the order comes from a beacon, a bad dealt deck buys the server little. It cannot aim a duplicate at a seat; it only changes the deck's make-up, which a colluder can exploit slightly, and only in hands where the bad deck is not the spare.

## 3. Recommendation: A + D1 (beacon) + cut-and-choose; B (hash chains) only as a marked fallback

### Message flow for hand k

1. **Seal (server, as hand k−1 ends).** Draw two secret decks D0 and D1 (as today, from entropy through `deckFromBytes`) and a 32-byte salt secret. Each salt is HMAC-SHA-256(secret, slot ‖ position). Each leaf is RFC6962-leaf(framed("nostakes/shuffle/v1/card", room, k, slot, position, card, salt)). This gives roots R0 and R1. Pick beacon round r, the first round at least about 2 s after now (margin inferred). Store D0, D1 and the secret in the log (server-only), and broadcast the seal {R0, R1, r} as a public event.
2. **Client, on receiving the seal:** records whether it arrived before round r's scheduled time.
3. **Beacon (server).** After round r is published, fetch its 32-byte randomness and pass it to the room as data in the Deal command.
4. **Order (pure room).** seed = H("seed", room, k, R0, R1, beacon(r, randomness)). The first draw picks the dealt slot s. A Fisher–Yates shuffle over the 52 positions gives order[deal index] = sealed position. The engine receives the deck D_s[order[0..51]] and is otherwise unchanged.
5. **Deal.** Each card that is dealt, shown, or hunted is paired with its opening: hole cards only to their holder, public cards to everyone, shown hands to everyone. The spare deck D_(1−s) and its salts are published in full when the hand starts.
6. **Client check (no UI action needed).** Confirm beacon round r, by fetching it from a relay or verifying its BLS signature, then run `verifyHand` on what the client saw. The result becomes a per-hand badge.

### The exact claim a player can check

For hand k, with seal (R0, R1, r) that my device received before beacon round r was published:

- the order came from beacon round r and from nothing the server chose after the seal;
- every card I was shown (my hole cards, the board, every run, every rabbit card, every hand shown at showdown) opens against the dealt root at exactly the position that order gives its place in the deal;
- the spare deck is the one that was sealed, and it holds 52 distinct cards;
- no card I saw appears at two places.

### What it does not cover

- The operator, and anyone they tell, can see every hole card and every future card. Nothing here prevents or detects that.
- Nobody else checks a colluder's unshown hole cards. The server could deal a colluder cards from the wrong positions and only the colluder would know. It cannot win a showdown that way, because everyone checks shown cards.
- The dealt deck may repeat a card. The spare catches that in half the hands; otherwise only a player who sees both copies does.
- A player whose device was offline when the seal arrived cannot check the timing themselves. They can check everything else after reconnecting.
- A sealed hand that is aborted and never dealt is visible in the log, but the per-hand verifier does not look for it. That check is client-level and not built.
- If drand is unreachable, or its threshold group colludes with the operator, the order check is lost. Fallback: deal with player hash-chain values (B, with its 2^n − 1 bound and visible exclusions) and mark the hand that way. A hand with no outside randomness is never shown as checked (NoOutsideRandomness).

### A delayed reveal as a host setting (argued separately, not the base design)

A host could opt in to "reveal every deck at the end of the night". That would let the table audit folded hands for collusion patterns, but it breaks the hard constraint for everyone in the room and gives nothing against the operator, who can already read storage. I would not offer it. If it is ever offered, it must be visible to every player before they sit down, and it must be all-or-nothing for the night.

## 4. The prototype (packages/shuffle)

Pure functions. No I/O, no clock, and no randomness read inside: decks, salt secrets, beacon values and player values all arrive as data.

| Function | Does |
| --- | --- |
| `sha256`, `hmacSha256` | FIPS 180-4 and RFC 2104, synchronous, in-repo |
| `sealDeck`, `sealCards`, `sealHand` | Seal one deck from a Deck and a salt secret (or from raw cards and salts, which is how the cheat tests build bad decks); seal both decks for a hand |
| `openCard`, `openDeck`, `openDealt`, `openSpare` | Opening for one position, a full deck, a deal index, the spare |
| `verifyOpening` | One opening against a root: card, salt, position, slot, room and hand are all bound |
| `combine` | Seed from the seal and contributions; rejects duplicates, a round other than the sealed one, and no outside randomness |
| `dealingPlan` | Seed → dealt slot, spare slot, and order[deal index] = sealed position |
| `dealIndexOf` | Role → deal index: Hole{turn, pass} = pass·n + turn; Community{drawn} = 2n + drawn |
| `verifyHand` | What one player saw → Verified {seed, dealt slot, cards checked}, or the first exact reason it fails (12 tagged errors) |

### Tests: properties and proofs (run)

61 tests, about 10–15 s for the package, all passing at 0774125.

- SHA-256: FIPS 180-2 examples including a million `a`s; Web Crypto at every length from 0 to 192; 500 random messages per run. HMAC: RFC 4231 cases 1, 2 and 6, and 300 random key/message pairs against Web Crypto per run. `pnpm verify`: 100,000 random messages of up to 4 KiB matched Web Crypto (run).
- Merkle: reproduces the Certificate Transparency reference roots for 1–8 leaves and four reference inclusion paths; proves every leaf of every tree from 1 to 64 leaves; the precomputed paths equal the RFC 6962 definition for 1–64 leaves; a damaged path node, a short or padded path, or the wrong index fails.
- Every honest hand verifies from any subset of its cards, including none.
- Changing one card, salt, position, contribution, beacon round, or the order of two cards fails with the right reason (property per change). One exception: a changed contribution is proved to fail only for a player who saw every card. For a player who saw s cards it slips through with probability about ½·(1/52)^s (inferred, not tested).
- The verifier never needs a card the player was not shown. `PlayerSaw` has no field for one, and the honest-hand property passes for every subset.
- Two hands, two rooms, or the two decks of one hand never share a root, even with the same cards and secret; an opening replayed against the next hand fails.
- Uniformity:
  - Exhaustive (a proof for small decks): the shuffle step asks for n, n−1, …, 2 choices, and its draw sequences map one to one onto all n! orderings for n = 3, 4, 5, 6. The same code runs for 52, so exact draws give an exactly uniform order.
  - Draws: rejection below the largest multiple of n under 2^32, so with uniform 32-bit words every residue is exactly equally likely (by construction).
  - Statistical, on fixed seeds, so the results are deterministic: 20,000 seeds in the tests (dealt slot; deals 0, 1, 8, 26 and 51 over all 52 positions), and 400,000 seeds in `pnpm verify` (all 52 deals, plus deals 0 and 1 jointly over 2,652 cells). Run: slot z 0.98; worst single-deal chi-square 65.5 against a bound of 114.5 (df 51, p = 1e-6); joint chi-square 2,637.7 against 3,011.7 (df 2,651).
  - What these show: no gross bias in where any deal lands, a fair slot choice, and independence of the first two deals, at about 1–2 % per cell in the verify run. What they cannot show: uniformity over all 52! orderings, biases below that resolution, or unpredictability (an assumption about SHA-256), and they say nothing about the beacon.
- Planted bugs (run, then restored). Caught: a wrong SHA-256 rotation, a missing hand number in the leaf, two Merkle proof bugs, removal of each of four verifier checks (position, own contribution, spare repeat, card seen twice), Sattolo's off-by-one (by the exhaustive test, once it also checked the requested ranges), a fixed slot, and a top-heavy draw. A byte-modulo bias passed the 20,000-seed tests and was caught by the 400,000-seed verify run (chi-square 371.8). Not caught by any test: zeroing the high word of the SHA-256 length field, which only matters for messages over 512 MB.

## 5. Planted-cheat table

Unless marked otherwise, every row is a test in test/cheats.test.ts or test/verify.test.ts, run and passing.

| Cheat (threat row) | Caught? | By whom, when | Reason the verifier gives | Test |
| --- | --- | --- | --- | --- |
| Swap a card after the bets (operator) | Yes | Every player shown that card, at once | OpeningMismatch {position, slot} | "a card swapped after the bets fails for everyone shown it"; properties for a changed card and a changed salt |
| Deal a real sealed card out of order to a friend (operator + colluder) | Yes, once the friend's hand is shown | Every player who sees the showdown | WrongPosition {deal, expected, opened} | "a real sealed card dealt out of order to a friend fails for everyone once that hand is shown"; property "names both positions…" |
| Same, but the friend never shows | **No** | Only the colluder holds those openings | - | none (no honest player holds the evidence) |
| Swap two dealt cards with each other | Yes | Whoever sees either card | WrongPosition at the earlier deal | property "catches two dealt cards swapped…" |
| Stack the sealed deck (choose the deck) | **Neutralised, not detected** | - | The beacon order sends each deal to every sealed position equally often | test/order.test.ts (20,000 seeds) and the verify run (400,000) |
| Order from a beacon round other than the sealed one (grind rounds) | Yes | Every player | BeaconRoundMismatch {sealed, used} | cheat test plus property |
| Fake the beacon value | **Not by verifyHand** | The client, by fetching the round or verifying BLS (not built, inferred) | - | - |
| Seal delivered after round r was published | **Not by verifyHand** | Each client that receives the seal, by its receive time (not built, inferred) | - | - |
| Replay last hand's seal and openings | Yes | Every player | SpareDeckMismatch (leaves bind room, hand and slot); a lone replayed opening gives OpeningMismatch | "last hand's seal and openings replayed as this hand fail"; commitment property |
| Spare deck with a repeated card | Yes | Every player | SpareDeckRepeatsCard {card, slot} | "a spare deck holding a card twice fails for every player" |
| Dealt deck with a repeated card | Sometimes: half the time the spare check catches the bad deck; otherwise only a player who sees both copies | That player; the two openings are proof | CardSeenTwice {card, first, second} | "a dealt deck holding cards twice fails for a player shown both copies of one" (also shows that a player who saw one copy passes) |
| Open a spare deck other than the sealed one | Yes | Every player | SpareDeckMismatch {slot} | cheat test plus property |
| Show a card other than the sealed one | Yes | Whoever sees it | ShownCardDiffers {deal, shown, opened} | cheat test plus property |
| Deal with no outside randomness | Yes, shown as "not fair" | Every player | NoOutsideRandomness | cheat test plus property |
| Show two players different seals | Yes, at the first shared board card | The player whose seal the board does not match | ShownCardDiffers or WrongPosition | "a server showing two players different seals cannot show them the same board" |
| Change another source's contribution | Yes, for a player who saw every card; for one who saw s cards, missed with probability about ½·(1/52)^s (inferred) | Players who see cards | SpareDeckMismatch or WrongPosition | property "fails for an observer of every card…" |
| B: drop or alter a player's value | Only the player who sent it | That player | MyContributionLeftOut / MyContributionAltered | "a dropped contribution shows only on the screen of the player who sent it"; property |
| B: grind over subsets of player values | **No** | - | 511 distinct deals measured for 9 values; 1 with a beacon | "a server holding nine player values can choose among 511 different deals…" |
| List one source twice | Yes | Every player | DuplicateContribution | property |
| Show a card in a place that does not exist | Yes | Whoever sees it | RoleOutOfRange | property |
| Operator reads hole cards or tells a friend | **No, in A, B or D** | - | - | - (only C stops it) |
| Abort a sealed hand after seeing the beacon | Not by verifyHand | Every client that saw the seal: a seal with no deal (not built, inferred) | - | - |

## 6. How it would fit (not built)

- **engine:** no change. It still receives a 52-card deck in StartHand.
- **room: commands and events.**
  - New server command `SealHand { at, decks: two shuffle-byte blocks, saltSecret, beaconRound }`, issued when a hand ends or the game starts. It emits a `HandSealed { hand, roots, beaconRound }` event whose stored form also holds the decks and the secret. Room state keeps `sealed: Option<…>`.
  - `Deal` takes `beacon: { round, randomness }` in place of `shuffleBytes`. The room refuses a round other than the sealed one, computes `combine` and `dealingPlan`, and passes D_s in plan order to the engine.
  - `nextDeadline` for DealDue becomes max(the between-hands time, beacon round r's time).
  - New room event `CardOpened { role, opening, audience: Public | Seat }`, emitted beside each engine event that deals, runs out, hunts, or shows cards. No opening is emitted for mucked hands or folded cards.
- **What a view and a redacted event must carry.** `redact` passes Public openings to everyone and Seat openings only to that seat (the same rule as HoleCardsDealt), and strips the stored decks and secret from HandSealed. The public HandStarted carries the seal, the beacon round and its randomness, and the spare opening. `viewFor` must include the openings a player is entitled to, so a reconnecting client can verify the hand it rejoined. Wire cost per hand (inferred from sizes): the spare is 52 × 33 bytes raw (about 2.3 KB as base64 JSON), broadcast once. Each opening is card + 32-byte salt + 4–6 path nodes of 32 bytes (path lengths run): about 300 bytes as JSON.
- **What the server stores and does.** `entropyFor` grows: the seal needs two deck byte blocks and a 32-byte secret. A new `Beacon` Effect service fetches round r from a drand relay, with live and test layers. The DealDue alarm fires at the beacon time. Storage grows by the second deck, the secret, the openings events, and the spare, roughly 4 KB per hand (inferred). The log keeps every card, so the operator can still read them.
- **What the client does without the UI asking.** On HandSealed, record the receive time (Clock service) against round r's scheduled time. When the hand ends, collect the seal, the beacon, the spare, and every opening it received; fetch round r through a `Beacon` service (or verify BLS); run `verifyHand`; and store a verdict per hand in client state. This runs as a declared Effect actor, off the connection machine's critical path. After a reconnect it rebuilds from catch-up events and marks timing as "not observed" for seals it missed.
- **What the UI could show.** A per-hand badge: "Checked: 7 cards, beacon round 4,200,000"; "Checked, but your device was offline when the deck was sealed"; or, in red, "This hand failed: <reason message>" with a "copy proof" button (seal plus openings as JSON). A night line: "All 143 hands you played checked out." A short seal fingerprint (a few words from the root) that players can compare out loud.
- **A hand in progress when a player drops.** Nothing waits for them. With the beacon, the server never needs a message from a player to deal. Their openings sit in the log and reach them in catch-up; their client verifies on return, except for the timing of seals it missed.
- **Round trips and silent players.** Beacon design: 0 extra player round trips. Silent players change nothing. The server waits up to one beacon period after sealing (3 s, inferred), hidden inside the 5 s between-hands pause because the seal goes out as the previous hand ends. The first hand of a night waits up to about 3 s + margin. B fallback: 1 extra message per player (the hash-chain reveal) with a short deadline. A silent player's value is left out, the hand goes on, and their screen says so.

## 7. Dependencies

- **None added.** The prototype uses only `effect` (already pinned).
- **Would swap in, with owner sign-off:** `@noble/hashes` (audited, synchronous) behind `sha256` and `hmacSha256` in src/sha256.ts. The signatures stay the same, and the file's `oxlint-disable no-bitwise` directive goes away with it.
- **Would add for production, with owner sign-off:** `@noble/curves`, to verify drand BLS signatures in the client. It is optional if clients fetch the round from a relay themselves and accept trusting that relay.
- **Fence note:** src/sha256.ts carries one file-level `oxlint-disable no-bitwise` with its reason. `pnpm debt` went from 15 to 16 entries, and this is the only directive under packages/ or apps/. A new package needs owner sign-off under AGENTS.md; the brief asked for this one.

## 8. Constructions and where they come from

- Hash: SHA-256 (FIPS 180-4). PRF for salts: HMAC-SHA-256 (RFC 2104), keyed by a per-hand secret over (slot, position).
- Framing: every field carries a 4-byte big-endian length prefix, and the first field is the domain tag "nostakes/shuffle/v1/<purpose>". The idea is TupleHash's (NIST SP 800-185); the function is not.
- Merkle: RFC 6962 §2.1 (leaf prefix 0x00, node prefix 0x01, split at the largest power of two below n), with inclusion proofs checked per RFC 9162 §2.1.3.2. The prefixes make it second-preimage safe.
- Order: SHA-256 in counter mode over the seed as a stream; unbiased draws by rejection; Fisher–Yates (Durstenfeld).
- Distinctness: cut-and-choose over two sealed decks.
- Where I am not sure: nothing novel is used. The one assumption worth naming is that SHA-256 in counter mode over a public seed behaves as a random function. That is the standard random-oracle use, not a proven property. The seed is public, so the order is unpredictable only because the beacon is.

## 9. Not built in this task

Beacon fetch and BLS verification, the client timing check, the hash chain for B, the "seal with no deal" check, and every room, server, and client change in section 6. `dealIndexOf` mirrors the engine's layout (hole cards at i and n+i, then community cards in draw order). If the engine ever burns cards, `dealIndexOf` must change with it.
