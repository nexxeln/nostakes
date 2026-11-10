# Fair shuffle: design report

Labels: "run" means I ran it here and give the output. "inferred" means reasoning or outside facts I did not run or check from this machine.

## 0. The short version

- The biggest threat is not a rigged deck. The operator runs the server, and the server knows every hole card the moment it deals. Today it also stores the whole deck in the event log. An operator who plays, or who tips off a friend, sees your cards. Designs A, B and D below do nothing about that. Only C (mental poker) does, and C breaks the rule that a sleeping phone must never stall a hand.
- What the recommended design (A + public beacon + cut-and-choose) does give: the order comes from a public beacon round named in the seal, applied to a deck sealed before that round existed. Every card a player is shown is the card sealed at the place the rules dealt it from. A swapped card, a stacked deck, a grind over beacon rounds, a faked beacon value, a late seal, a change of who is dealt in, a replayed seal, a card dealt out of order, and a split seal are each caught or neutralised. A cancelled sealed hand and a claimed beacon outage are shown to every player. Nothing folded or mucked is ever revealed.
- **The sentence: "Provably fair" in nostakes means that, for each hand, any player can check that every card they were shown was sealed before the order was known, at the position that the drand beacon round named in the seal assigns to that card's place in the deal, and that the beacon value is drand's own. It does not mean the server could not see your cards.**

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
| Round trips before a deal | 0 | 1 (reveal, with a hash chain committed at sit-down) or 2 (commit and reveal per hand) | n sequential shuffle passes, then 1 round per dealing step (hole cards, flop, turn, river, each run, each rabbit) | 0 from players. The server waits 3.5 to 6.5 s after sealing (section 4), mostly hidden in the 5 s between-hands pause | 0 | 0 |
| A phone is offline | No effect | Its value is left out; the deal goes on | n-of-n: the hand stalls. t-of-n: tolerates n−t sleepers, but any t colluders see everything | No effect | No effect | No effect |
| What it reveals | Only cards the rules made public, plus Merkle paths (hashes of salted leaves) | Same, plus the players' random values | Nothing beyond public cards | Same as A, plus the spare deck, which is never dealt | - | Proof bytes only |
| Practical today? | Yes; built here | Possible, but not built: the owner chose no player-randomness fallback, and `combine` was deleted | Not without a curve library, a key-generation protocol, and shuffle proofs (inferred: a separate project of weeks, with custom crypto) | Yes, built: the Worker fetches a drand round over HTTPS, and the client checks its BLS signature with @noble/curves (section 4) | Possible but pointless | Curve-based shuffle arguments need a library and custom proof code. A SNARK over SHA-256 Merkle leaves is millions of constraints (inferred: not practical in a Worker) |

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

- **Public beacon (drand quicknet; parameters read and checked in section 4):** a threshold BLS signature every 3 s from the League of Entropy (Cloudflare, Protocol Labs, EPFL and others); randomness = SHA-256(signature). The seal names round r. The server must deliver the seal before round r is published. Each client that receives it in time can confirm, from its own clock or by fetching the latest round, that r was still in the future. Once round r is out, nobody has a choice left. The server can only (a) abort the sealed hand, which every player who saw the seal sees as a sealed hand that was never dealt, or (b) show players different seals, which fails as soon as a shared board card is dealt (run: test "a server showing two players different seals cannot show them the same board"). A Worker can fetch a round over HTTPS. A client checks the value by verifying the BLS signature (needs a pairing library such as @noble/curves) or by fetching the same round from a relay itself, which means trusting the relay's TLS and the League of Entropy.
- **VRF:** useless against this operator. The operator holds the secret key, so before sealing hand k it can compute VRF(sk, k), and with it the order, and then seal whatever deck makes that order deal what it wants. If the VRF input includes the root, the operator grinds salts until the output suits it. A VRF only helps when the key holder is not the adversary.
- **ZK proof of a permutation:** would prove the sealed deck is 52 distinct cards. Curve-based shuffle arguments need a library and custom proof code, and a SNARK over SHA-256 leaves is millions of constraints (inferred). Neither fits today. **Cut-and-choose** does the job with hashes only. Seal two independent decks, let the seed pick which one is dealt, and open the other in full. A deck that is not 52 distinct cards is caught publicly with probability 1/2 per hand, and the opened spare reveals nothing about the dealt deck (independent order and salts). Built here.

### How does a player know the sealed deck holds 52 distinct cards?

For the dealt deck, they cannot tell from openings alone. What they do get:

1. Cut-and-choose: the spare deck is opened in full and checked as a permutation (SpareDeckRepeatsCard). A server that seals bad decks is caught by every player in half of those hands.
2. Within the dealt deck, a player shown the same card twice (their hole card on the board, or in a shown hand) holds two valid openings of one card at two positions. That is transferable proof (CardSeenTwice).
3. Once the order comes from a beacon, a bad dealt deck buys the server little. It cannot aim a duplicate at a seat; it only changes the deck's make-up, which a colluder can exploit slightly, and only in hands where the bad deck is not the spare.

## 3. Recommendation: A + D1 (beacon) + cut-and-choose, with no player-randomness fallback

The owner decided against B as a fallback. If drand cannot be reached, the hand is dealt from server entropy and every player sees "not checked: beacon unavailable". `combine`, the player contributions, their four rejections (DuplicateContribution, MyContributionLeftOut, MyContributionAltered, NoOutsideRandomness) and their tests are deleted. Section 2 keeps B only as the record of why it was not built.

### Message flow for hand k

1. **Seal (server, as hand k−1 ends).** Draw two secret decks D0 and D1 (as today, from entropy through `deckFromBytes`) and a 32-byte salt secret. Each salt is HMAC-SHA-256(secret, slot ‖ position). Each leaf is RFC6962-leaf(framed("nostakes/shuffle/v1/card", room, k, slot, position, card, salt)). This gives roots R0 and R1. Fix the seats dealt in, in deal order from the button. Name beacon round r = `roundToSeal(QUICKNET, now)`, the first quicknet round due at least 3.5 s from now. Store D0, D1 and the secret in the log (server-only), and broadcast the seal {R0, R1, r, seats} as a public event.
2. **Client, on receiving the seal:** records `Live { at }` with its own clock if the page was in the foreground on a live connection, else `CaughtUp { at }`.
3. **Withdraw or deal.** If the hand can no longer be dealt (the table broke up, the night ended), the server withdraws the seal before round r is due. Otherwise it deals.
4. **Beacon (server).** When round r is due, fetch it from a relay, check it with `verifyBeacon` (a relay can lie too), and pass {round, signature} to the room in the Deal command. If it has nothing after `BEACON_WAIT_LIMIT_MS` (10 s), it deals from its own entropy and marks the hand "beacon unavailable".
5. **Order (pure room).** seed = `seedOf(context, seal, beacon)` = H("seed", room, k, R0, R1, seats, r, randomness). The first draw picks the dealt slot s. A Fisher–Yates shuffle over the 52 positions gives order[deal index] = sealed position. The engine receives the deck D_s[order[0..51]] and is otherwise unchanged.
6. **Deal.** Each card that is dealt, shown, or hunted is paired with its opening: hole cards only to their holder, public cards to everyone, shown hands to everyone. The spare deck D_(1−s) and its salts are published in full when the hand starts, with the beacon signature.
7. **Client check (no UI action needed).** `judgeHand` on what the device saw gives the verdict. `sealsWithNoDeal` over the seals it saw names any sealed hand that was neither dealt nor withdrawn in time.

### The exact claim a player can check

For hand k, with seal (R0, R1, r, seats) that my device received live, by its own clock more than 1.5 s before beacon round r was due (`InTime`):

- round r's randomness is drand's: its BLS signature checks against quicknet's public key;
- the seal reached me before anyone could know round r, if my clock is within 1 s of true time;
- the order came from beacon round r, the sealed roots and the sealed seats, and from nothing the server chose after the seal;
- every card I was shown (my hole cards, the board, every run, every rabbit card, every hand shown at showdown) opens against the dealt root at exactly the position that order gives its place in the deal;
- the spare deck is the one that was sealed, and it holds 52 distinct cards;
- no card I saw appears at two places.

### What it does not cover

- The operator, and anyone they tell, can see every hole card and every future card. Nothing here prevents or detects that.
- Nobody else checks a colluder's unshown hole cards. The server could deal a colluder cards from the wrong positions and only the colluder would know. It cannot win a showdown that way, because everyone checks shown cards.
- The dealt deck may repeat a card. The spare catches that in half the hands; otherwise only a player who sees both copies does.
- A device that was away when the seal arrived, or got it too close to round r, checks every card but cannot confirm the timing itself. Its verdict says so (`NotWatched`, `TooCloseToCall`).
- A phone whose clock is more than 1 s slow could call a late seal "in time" (section 4). The other players' phones would not.
- "Beacon unavailable" is the server's second way out, next to cancelling: it can see round r, dislike the deal, claim drand was down, and deal from its own entropy. Every player sees the hand as not checked, and this package cannot prove the claim false. A client that fetches round r itself and gets it could (not built; inferred). Count these hands per night.
- If the drand threshold group (12 of 22 League of Entropy nodes at quicknet's launch, per drand's October 2023 post; inferred as current) colludes with the operator, the order check is lost.

### A delayed reveal as a host setting (argued separately, not the base design)

A host could opt in to "reveal every deck at the end of the night". That would let the table audit folded hands for collusion patterns, but it breaks the hard constraint for everyone in the room and gives nothing against the operator, who can already read storage. I would not offer it. If it is ever offered, it must be visible to every player before they sit down, and it must be all-or-nothing for the night.

## 4. The beacon

### The chain: drand quicknet

| Parameter | Value | Where it was read (2026-11-10) |
| --- | --- | --- |
| Public key (G2, 96 bytes) | `83cf0f28…ece45a` (full value in src/drand.ts) | `https://api.drand.sh/52db9ba7…e971/info` and `https://api.drand.sh/v2/beacons/quicknet/info` |
| Chain hash | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` | same |
| Genesis seed (group hash) | `f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e` | same |
| Genesis time | 1692803367 (2023-08-23 15:09:27 UTC) | same |
| Period | 3 s | same |
| Scheme | `bls-unchained-g1-rfc9380` | same; definition in drand `crypto/schemes.go` `NewPedersenBLSUnchainedG1` |
| Signed message | SHA-256 of the round as 8 big-endian bytes | drand `crypto/schemes.go` (`DigestFunc`) |
| Hash-to-curve DST | `BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_` | same |
| Randomness | SHA-256 of the signature | drand `crypto/schemes.go` `RandomnessFromSignature` |
| Round r is due at | genesis + (r − 1) · period | drand `common/time.go` `TimeOfRound`, `NextRound` |

A test recomputes the chain hash from period, genesis, key, seed and beacon id the way drand's `common/chain/info.go` `Hash()` does, so a typo in any constant fails. The same test passes for quicknet-t, the testnet chain.

Why quicknet: a 3 s period, against 30 s for drand's chained `default` network, so the wait between seal and deal fits the pause between hands; unchained, so one round checks on its own without the previous signature; RFC 9380 hash-to-curve; 48-byte signatures. evmnet uses BN254 for Ethereum contracts and gains nothing here.

### Verification

`verifyBeacon(chain, round, signature)` decodes the 48-byte G1 signature with `@noble/curves` (which checks the point is on the curve and in the subgroup), checks the pairing against the chain's G2 key over the hashed round, and returns SHA-256 of the signature as the randomness. A signature that does not decode fails as `BeaconSignatureMalformed`. One that decodes and does not check fails as `BeaconSignatureInvalid`.

Fixtures (test/fixtures/drand-rounds.ts): quicknet rounds 1, 2, 1,000,000, 20,000,000 and 33,000,000 from `api.drand.sh`, with identical signature and randomness served by `drand.cloudflare.com` (run); the same rounds from quicknet-t (`pl-us.testnet.drand.sh`); one round of the chained default network; and three "latest" rounds with the local send and receive times.

### Two margins

**When drand rounds appear (measured).** Over 71 rounds polled on `api.drand.sh`, `api2.drand.sh` and `drand.cloudflare.com` (this machine's clock was 7 ms ± 114 ms from time.apple.com), no relay ever served a round before it was due. A response carrying round r arrived between 233 ms and 1.8 s after r was due. drand nodes each sign a round when their own clock reaches it, and accept a partial signature up to one round early "because of small clock drifts" (drand `internal/chain/beacon/node.go`). So a round can exist early only if a threshold of nodes run fast clocks. `BEACON_EARLY_MS` = 500 ms budgets for that.

**The client's clock tolerance: 1 s each way.** Phones on automatic time sync by NTP and usually sit within tens of milliseconds (time-nuts reports, the GoodClock project); carrier time (NITZ) and old OS bugs have produced errors of seconds (inferred from those reports; I found no systematic study). The check fails safe in one direction and not the other:

- A fast clock makes seals look late. A false "arrived after the round" needs an honest seal delayed by more than the margin plus the tolerance minus delivery, about 4 s.
- A slow clock makes seals look early. A phone more than 1 s slow, plus the time the cheating server needs to see the round, could call a late seal in time.

1 s covers phones on automatic time with a wide margin. A larger tolerance costs waiting time at every hand (below).

**The sealing margin: 3.5 s** = 2 × the phone tolerance (1 s) + `BEACON_EARLY_MS` (0.5 s) + `SERVER_CLOCK_BUDGET_MS` (0.5 s; a Worker's `Date.now()` is the time of its last I/O, inferred to be within that) + `SEAL_DELIVERY_BUDGET_MS` (0.5 s to a live phone). With those budgets, every phone within tolerance calls an honest seal in time (property, run). The round named is the first one due at least 3.5 s after the seal, so the deal waits 3.5 to 6.5 s after the seal. Against the 5 s pause between hands, that adds nothing half the time and about 0.4 s per hand on average (arithmetic, inferred until the room is wired).

### The client's timing check

`sealTiming(chain, round, arrival)`, from the device's clock, with "due" the time round r is due:

| Arrival | Outcome |
| --- | --- |
| `CaughtUp` (offline, reconnecting, or the page was in the background), at any time | `NotWatched`: cards still checked, timing not observed |
| `Live`, and at + 1 s + 0.5 s < due | `InTime` |
| `Live`, and at − 1 s ≥ due | `ArrivedAfterRound`: the hand fails with `SealArrivedAfterRound` |
| `Live`, otherwise | `TooCloseToCall`: cards checked, timing not confirmed |

Guarantee (property, run): a seal that reached the device after round r could exist is never `InTime` for any clock within tolerance. A late seal therefore never earns the full badge; it shows as "not confirmed" or as failed. A single `ArrivedAfterRound` is not proof of a cheat, since the network can hold a message up, so the message says so: if other players got it in time, the connection was slow; if nobody did, the server sealed late.

The embedding app must only pass `Live` when it handled the seal promptly. A backgrounded page with an open socket can process a frame seconds after it arrived, which would be a false alarm.

### A seal with no deal

`sealsWithNoDeal(chain, now, seen)` lists every sealed hand that was not dealt and either (a) was never withdrawn and is past its round by more than the server's 10 s wait for the beacon, or (b) was withdrawn, but the withdrawal did not reach this device in time by the same rule as a seal ("after the round", "too close to the round", or "while away"). A withdrawal that arrives before the round could exist costs the server nothing to allow, because the server did not know the deal yet. Without that rule, every night's end and every broken table would raise a false alarm. Run it only on a log that has caught up.

### The verdict

`judgeHand(evidence)` returns one of:

- `Checked { round, seed, dealtSlot, cardsChecked, timing }`, where timing is `InTime`, `TooCloseToCall` or `NotWatched`. Only `InTime` earns the full claim above.
- `NotChecked { round, reason: "beacon unavailable" }`: a different variant with no seed and no card count, so code cannot mistake it for a checked hand.
- `Failed { reason }`, with the first failure in this order: `BeaconSignatureMalformed`, `BeaconSignatureInvalid`, `SealArrivedAfterRound`, `BeaconRoundMismatch`, `DealtSeatsDiffer`, `SpareDeckRepeatsCard`, `SpareDeckMismatch`, `RoleOutOfRange`, `WrongPosition`, `OpeningMismatch`, `ShownCardDiffers`, `CardSeenTwice`. Each carries its context and a message a player can read.

### Cost on a device

- Speed (run, Node 24.22.1, Apple M4, shared machine at load 4.5): 13.3 ms per `verifyBeacon` warm (200 checks, three runs), about 80 ms for the first check while noble builds its tables. A phone is slower; at 3 to 10 times slower (inferred), that is 40 to 130 ms per hand, and up to about 0.8 s for the first. One check per hand, run after the hand off the critical path, is reasonable. Verifying many hands at once, for example after a reconnect, should go to a worker or an idle callback.
- Bundle (run, Vite 8 with rolldown, minified, es2022): the part of `@noble/curves` this package uses (`bls12_381.shortSignatures`, `G2.Point`), with the SHA-256 it pulls in, is 92.8 KB raw and 28.6 KB gzipped. Compared with `@noble/hashes` (SHA-256 and HMAC) alone, it adds 85.6 KB raw and 25.6 KB gzipped. The whole package API, Effect included, bundles to 222.7 KB raw and 64.5 KB gzipped. src/beacon.ts reads `bls12_381.shortSignatures` at module level, so the curve code is not tree-shaken from an import of `verifyHand` alone.

### Where it runs

One Vite bundle of the package checked real quicknet round 33,000,000, refused its signature for round 33,000,001, and matched Web Crypto for SHA-256 and HMAC in each place:

- Node 24.22.1 (run): every test, and the bundle.
- A browser (run): headless Chromium 156 (Playwright's headless shell), the bundle loaded as a module from a local page.
- Cloudflare Workers (run): `workerd test` on workerd 2026-10-26, the bundle as an ES module worker.

The noble READMEs say "We support all major platforms and runtimes" and name no runtime in particular, so the three runs above are the evidence.

## 5. The package (packages/shuffle)

Pure functions. No I/O, no clock, and no randomness read inside: decks, salt secrets, beacon signatures and times all arrive as data.

| Function | Does |
| --- | --- |
| `sha256`, `hmacSha256` | FIPS 180-4 and RFC 2104, synchronous, from `@noble/hashes` |
| `sealDeck`, `sealCards`, `sealHand` | Seal one deck from a Deck and a salt secret (or from raw cards and salts, which is how the cheat tests build bad decks); seal both decks for a hand with its beacon round and seats |
| `openCard`, `openDeck`, `openDealt`, `openSpare` | Opening for one position, a full deck, a deal index, the spare |
| `verifyOpening` | One opening against a root: card, salt, position, slot, room and hand are all bound |
| `QUICKNET`, `roundTime`, `firstFutureRound` | The chain as data; when a round is due; the first round still in the future at a time |
| `verifyBeacon` | A round's BLS signature → its 32 bytes of randomness, or a tagged error |
| `seedOf` | Seed from the hand, the seal and a beacon |
| `dealingPlan` | Seed → dealt slot, spare slot, and order[deal index] = sealed position |
| `dealIndexOf` | Role → deal index: Hole{turn, pass} = pass·n + turn; Community{drawn} = 2n + drawn |
| `roundToSeal`, `sealTiming`, `sealsWithNoDeal` | The round a seal names; the device's timing check; sealed hands with no deal |
| `verifyHand` | The openings, order, round and seats for a beacon already checked |
| `judgeHand` | The whole verdict for one device: Checked, NotChecked, or Failed with a reason |

### Tests: properties and proofs (run)

110 tests in about 7 to 17 s for the package, depending on machine load:

- SHA-256 and HMAC: FIPS 180-2 examples including a million `a`s, Web Crypto at every length from 0 to 192, 500 random messages, RFC 4231 cases 1, 2 and 6, and 300 random HMAC key/message pairs. They now guard the wiring to `@noble/hashes`. `pnpm verify` adds 100,000 random messages; it runs on GitHub (`.github/workflows/verify.yml`, target `shuffle`).
- Merkle: the Certificate Transparency reference roots and paths, every leaf of every tree from 1 to 64 leaves, and damaged paths.
- Every honest hand verifies from any subset of its cards, including none. Changing a card, a salt, a position, the beacon's randomness, the beacon round, the seats, or the order of two cards fails with the right reason.
- The drand chain constants hash to the published chain hash; round time and first future round agree by property and against three relay-served rounds; five real rounds verify to their published randomness, and neighbouring rounds, changed bytes, quicknet-t signatures and a default-chain signature fail.
- The sealed round cannot exist yet; an honest seal within budgets is in time for every phone within tolerance; a seal that arrived after its round could exist is never in time; a caught-up seal is never judged.
- `judgeHand` checks honest hands (including one ordered by real quicknet round 33,000,000), never calls a beacon-unavailable hand checked, and fails a self-signed beacon, a next-round signature, a late seal, and a changed card.
- Uniformity of the order: exhaustive for 3 to 6 cards, 20,000 seeds in the tests, 400,000 in `pnpm verify` (on GitHub).

### Planted bugs (each run, seen to fail, then restored)

| Planted bug | Tests that failed |
| --- | --- |
| HMAC called with key and message swapped | the three RFC 4231 cases and the Web Crypto HMAC property |
| SHA-256 of the message minus its first byte | the FIPS examples and both Web Crypto checks |
| The signature check skipped (signature decoded, pairing not checked) | beacon.test.ts "rejects quicknet round N's signature offered for a neighbouring round" (5) and "rejects the quicknet-t signature of round N offered as quicknet's, and the other way round" (5). The one-byte-change property alone does not catch it: a changed byte almost never decodes to a valid point. |
| The wrong round's message hashed (round + 1) | the 10 real-round tests and 4 neighbouring-round tests |
| The round as little-endian bytes | the 10 real-round tests and "signs the SHA-256 of the round as eight big-endian bytes" |
| The randomness taken from the signature without checking it (in `judgeHand`) | verdict.test.ts "fails a hand ordered by a beacon the server signed itself, though every card opens" and "fails a real signature for the next round…" |
| Round time off by one period | drand.test.ts both round-time properties, the three relay-served rounds, and "puts round 1 at quicknet's genesis…" |
| The timing check returns `InTime` for a seal past the round | timing.test.ts "never calls a seal in time when it reached the device after the round could exist…", "says a seal arrived after the round…", "draws its three lines a millisecond apart", and the call-off test |
| The timing check ignores the clock tolerance and drand's early margin | "never calls a seal in time…" and "draws its three lines…" |
| A caught-up seal judged by its arrival time | "gives a seal that reached the device in a catch-up its own answer…" and the call-off test |
| The sealing margin cut to 2.5 s | "reaches every phone within tolerance in time…" |
| An overdue seal never reported | "is not reported while the deal may still come, and is once…" and "explains itself to a player" |
| `judgeHand` lets an `ArrivedAfterRound` seal through | verdict.test.ts "fails a hand whose seal reached this live device after its round was due" |
| An unchecked hand reported as checked | verdict.test.ts "never shows it as checked, whenever the seal arrived" |
| The seat check skipped | verify.test.ts "rejects a deal to seats other than the sealed ones…" and cheats.test.ts "dealing to other seats than the sealed ones after seeing the beacon fails for every player" |

From the first round of work (before the beacon): a missing hand number in the leaf, two Merkle proof bugs, removal of each verifier check, Sattolo's off-by-one, a fixed slot, and a top-heavy draw were caught; a byte-modulo bias was caught only by the 400,000-seed verify run.

## 6. Planted-cheat table

Every row is a test in test/cheats.test.ts, test/verify.test.ts, test/verdict.test.ts or test/timing.test.ts, run and passing, unless marked otherwise.

| Cheat (threat row) | Caught? | By whom, when | Reason given | Test |
| --- | --- | --- | --- | --- |
| Swap a card after the bets (operator) | Yes | Every player shown that card, at once | OpeningMismatch {position, slot} | "a card swapped after the bets fails for everyone shown it"; properties for a changed card and salt; "still fails a card changed after the seal" |
| Deal a real sealed card out of order to a friend (operator + colluder) | Yes, once the friend's hand is shown | Every player who sees the showdown | WrongPosition {deal, expected, opened} | "a real sealed card dealt out of order to a friend fails for everyone once that hand is shown" |
| Same, but the friend never shows | **No** | Only the colluder holds those openings | - | none (no honest player holds the evidence) |
| Swap two dealt cards with each other | Yes | Whoever sees either card | WrongPosition at the earlier deal | property "catches two dealt cards swapped…" |
| Stack the sealed deck (choose the deck) | **Neutralised, not detected** | - | The beacon order sends each deal to every sealed position equally often | test/order.test.ts (20,000 seeds) and the verify run (400,000) |
| Order from a beacon round other than the sealed one (grind rounds) | Yes | Every player | BeaconRoundMismatch {sealed, used} | "an order taken from a beacon round other than the sealed one fails"; property; "fails a real signature for the next round…" |
| **Fake the beacon value** | **Yes (was: not by verifyHand)** | Every player, when the hand is judged | BeaconSignatureInvalid {beaconId, round}, or BeaconSignatureMalformed | "a beacon value the server made up fails for every player, though every card opens"; "fails a hand ordered by a beacon the server signed itself…"; beacon.test.ts real-round, neighbouring-round, testnet and default-chain tests |
| **Seal delivered after round r was published** | **Yes (was: not by verifyHand).** No device within its clock tolerance shows it as sealed in time. A device that got it at least 1 s (its tolerance) after r was due fails the hand; closer than that, the hand shows "timing not confirmed" | Every device that was connected | SealArrivedAfterRound {arrivedAt, round, roundAt, tolerance}, or timing TooCloseToCall | "a deck sealed after its round was out is never shown as sealed in time, and fails on a device that got it a second after"; timing.test.ts "never calls a seal in time…"; verdict.test.ts "fails a hand whose seal reached this live device after its round was due" |
| **Abort a sealed hand after seeing the beacon** | **Yes (was: not built).** Shown, not proved: the server can always claim a reason | Every device that was connected; a device that was away is told it cannot tell | SealWithNoDeal {hand, round, withdrawal: never / after the round / too close to the round / while away} | "a sealed hand the server cancels after its round shows on every connected player's screen"; timing.test.ts "a seal with no deal" |
| Claim the beacon was unavailable and deal from server entropy | Shown on every screen as not checked; not proved a lie | Every player | NotChecked {round, reason: "beacon unavailable"} | "a hand the server says it dealt without the beacon is never shown as checked to anyone"; verdict.test.ts "never shows it as checked, whenever the seal arrived" |
| Change who is dealt in after seeing the beacon | Yes (new; the first design did not bind the seats) | Every player | DealtSeatsDiffer {sealed, dealt} | "dealing to other seats than the sealed ones after seeing the beacon fails for every player"; property in verify.test.ts |
| Replay last hand's seal and openings | Yes | Every player | SpareDeckMismatch (leaves bind room, hand and slot); a lone replayed opening gives OpeningMismatch | "last hand's seal and openings replayed as this hand fail" |
| Spare deck with a repeated card | Yes | Every player | SpareDeckRepeatsCard {card, slot} | "a spare deck holding a card twice fails for every player" |
| Dealt deck with a repeated card | Sometimes: half the time the spare check catches the bad deck; otherwise only a player who sees both copies | That player; the two openings are proof | CardSeenTwice {card, first, second} | "a dealt deck holding cards twice fails for a player shown both copies of one" |
| Open a spare deck other than the sealed one | Yes | Every player | SpareDeckMismatch {slot} | "a spare deck other than the sealed one fails" |
| Show a card other than the sealed one | Yes | Whoever sees it | ShownCardDiffers {deal, shown, opened} | "a table showing a card other than the sealed one fails" |
| Show two players different seals | Yes, at the first shared board card | The player whose seal the board does not match | ShownCardDiffers or WrongPosition | "a server showing two players different seals cannot show them the same board" |
| Show a card in a place that does not exist | Yes | Whoever sees it | RoleOutOfRange | property |
| Operator reads hole cards or tells a friend | **No, in A, B or D** | - | - | - (only C stops it) |

Removed with B: "drop or alter a player's value", "grind over subsets of player values" (511 deals), "list one source twice" and "deal with no outside randomness".

## 7. How it would fit (not built)

- **engine:** no change. It still receives a 52-card deck in StartHand.
- **room: commands and events.**
  - New server command `SealHand { at, decks: two shuffle-byte blocks, saltSecret, beaconRound }`, issued when a hand ends or the game starts. The room fixes the seats dealt in at that moment, in deal order; anyone who sits down or comes back after the seal waits for the next hand. It emits `HandSealed { hand, roots, beaconRound, seats }`, whose stored form also holds the decks and the secret. Room state keeps `sealed: Option<…>`.
  - New server command `WithdrawSeal`, allowed only while the round is not yet due, for a table that can no longer deal the sealed hand.
  - `Deal` takes `beacon: FromBeacon { round, signature } | Unavailable` in place of `shuffleBytes`. The room refuses a round other than the sealed one, checks the signature, computes `seedOf` and `dealingPlan`, and passes D_s in plan order to the engine.
  - `nextDeadline` for DealDue becomes max(the between-hands time, beacon round r's time); the server's fetch gives up after `BEACON_WAIT_LIMIT_MS`.
  - New room event `CardOpened { role, opening, audience: Public | Seat }`, emitted beside each engine event that deals, runs out, hunts, or shows cards. No opening is emitted for mucked hands or folded cards.
- **What a view and a redacted event must carry.** `redact` passes Public openings to everyone and Seat openings only to that seat, and strips the stored decks and secret from HandSealed. The public HandStarted carries the beacon signature and the spare opening. `viewFor` must include the openings a player is entitled to, so a reconnecting client can verify the hand it rejoined. Wire cost per hand (inferred from sizes): the spare is 52 × 33 bytes raw (about 2.3 KB as base64 JSON), broadcast once; the beacon signature is 48 bytes; each opening is about 300 bytes as JSON.
- **What the server stores and does.** `entropyFor` grows: the seal needs two deck byte blocks and a 32-byte secret. A new `Beacon` Effect service fetches round r from a drand relay, with live and test layers, and the server checks it with `verifyBeacon` before dealing. Storage grows by roughly 4 KB per hand (inferred). The log keeps every card, so the operator can still read them.
- **What the client does without the UI asking.** On HandSealed, record `Live { at }` (Clock service) if the page is visible and the connection live, else `CaughtUp`. When the hand ends, run `judgeHand` as a declared Effect actor, off the connection machine's critical path, and keep the verdict per hand. Run `sealsWithNoDeal` over the caught-up log. Optionally fetch round r itself when the server says the beacon was unavailable.
- **What the UI could show.** "Checked: 7 cards, beacon round 4,200,000" only for `InTime`; "Cards checked; your device could not confirm the seal came first" for `TooCloseToCall` and `NotWatched`; "Not checked: beacon unavailable"; in red, "This hand failed: <reason message>" with a "copy proof" button; and a night line counting each kind, including cancelled sealed hands.

## 8. Dependencies

- `@noble/hashes` `2.4.0` (latest, published 2026-08-27; MIT; no dependencies) behind `sha256` and `hmacSha256`. Audited by Cure53 at 1.0.0 (January 2022); the authors report AI-assisted self-audits since April 2026. The in-repo SHA-256 and its `oxlint-disable no-bitwise` directive are gone; `pnpm debt` is back to main's count.
- `@noble/curves` `2.4.0` (latest, published 2026-08-27; MIT; its only dependency is `@noble/hashes` 2.4.0, exact) for the BLS check. Audited by Trail of Bits at 2.3.0 (August 2026, whole library) and by Cure53 at 1.6.0 (September 2024, bls12-381 in scope).
- Both approved by the owner.

## 9. Constructions and where they come from

- Hash: SHA-256 (FIPS 180-4). PRF for salts: HMAC-SHA-256 (RFC 2104), keyed by a per-hand secret over (slot, position).
- Framing: every field carries a 4-byte big-endian length prefix, and the first field is the domain tag "nostakes/shuffle/v1/<purpose>". The idea is TupleHash's (NIST SP 800-185); the function is not.
- Merkle: RFC 6962 §2.1 (leaf prefix 0x00, node prefix 0x01, split at the largest power of two below n), with inclusion proofs checked per RFC 9162 §2.1.3.2.
- Order: SHA-256 in counter mode over the seed as a stream; unbiased draws by rejection; Fisher–Yates (Durstenfeld).
- Distinctness: cut-and-choose over two sealed decks.
- Beacon: drand quicknet, BLS signatures on BLS12-381 G1 with RFC 9380 hash-to-curve (section 4).
- The assumption worth naming: SHA-256 in counter mode over a public seed behaves as a random function. The seed is public, so the order is unpredictable only because the beacon is.

## 10. What changed once the beacon was real

- **The seal must bind the seats.** With the order public, who is dealt in was the last thing the server could change after seeing the beacon: dropping or adding one player moves every hole card. The seal now names the seats in deal order, the seed hashes them, and `DealtSeatsDiffer` catches a change. The room must fix the seats when it seals.
- **"Arrived before round r's time" is not one comparison.** The client needs a clock tolerance and drand's early margin, and gets four answers, not two. A seal that arrives late on a live connection is not proof of a cheat; a backgrounded page can make it look late; and a phone more than 1 s slow can be fooled.
- **The margin is 3.5 s, not about 2 s**, derived from those budgets.
- **"A seal with no deal" needs a withdrawal rule.** A plain "sealed and never dealt" check fires at the end of every night and whenever a table breaks up between seal and deal. A withdrawal that arrives before the round is harmless and clears it.
- **"Beacon unavailable" is a second escape hatch**, as strong as cancelling a hand. It is visible on every screen but not provable by this package.
- **The server must check the beacon too.** A relay can serve a bad value; dealing from it would fail every player's check.
- **The client does not need a relay to check the beacon**: the signature is enough.

## 11. Not built in this task

Every room, server, and client change in section 7, and a client fetch of round r to disprove a "beacon unavailable" claim. `dealIndexOf` mirrors the engine's layout (hole cards at i and n+i, then community cards in draw order). If the engine ever burns cards, `dealIndexOf` must change with it.
