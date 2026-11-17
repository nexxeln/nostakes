---
name: nostakes-copy
description: The standard for every word a nostakes player reads, hears, or gets read aloud. Use when writing or changing UI copy in apps/web, the landing, /learn, /privacy, /terms, link previews, the manifest, aria labels, or rejection and error lines.
---

# nostakes copy

The reader is a friend at a home game, often on a phone, often mid-hand. They should find what they need, understand it on the first read, and know what to do next. That is plain language as ISO 24495-1 defines it: relevant, findable, understandable, usable.

Plain language is the floor, not the ceiling. nostakes has a voice, and the fix for copy that is too long is fewer words with the same character, never blander words. Every line must be clear and usable first. Then it can have a wink.

## The voice

- Short declarative sentences. One idea each.
- Casual and warm, like the person dealing. Never corporate, never a casino.
- Say "you" to the player. Say "the host", "the room", "the table" for the rest. Never "we" for the app, never "the user".
- Poker words a regular uses: blinds, straddle, run it twice, muck, bomb pot. Explain one only where a beginner meets it, in a few words, the first time.
- Sentence case everywhere: titles, buttons, tabs, labels.
- Numbers as digits: "2 players", "Seat 3", "10 minutes". Spell out a number that starts a sentence: "Two minutes, and you can sit at a friend's table."
- No em dashes or en dashes. Use a period or a comma.
- Contractions: can't, don't, you're, it's. "Cannot" sounds like a form.
- Straight quotes and apostrophes in code (`'`, `"`).
- Few words. The House look is restraint. If a line still works without a word, cut the word. If a screen still works without a line, cut the line.

## Personality

Keep the wit, the poker flavour, and the warm home-game feel. Cut the excess: long explanations, stacked clauses, a thing said twice, careful hedging, and help text nobody needs at that moment. One idea per line. Of two phrasings, take the punchier one.

|  | Line | Verdict |
| --- | --- | --- |
| Too long | Your seat plays out this hand, then your chips are counted for the settle-up. You can come back as yourself. | Two clauses and a passive. |
| Too plain | Your seat finishes this hand. Then your chips are counted. You may return later. | Clear, and nobody's talking. |
| Just right | Your seat finishes this hand, then your chips go to the settle-up. Come back any time. |  |
| Too long | A bomb pot is a hand where every player puts the same amount in before the cards are dealt, the flop comes out at once, and the betting starts on the flop. | Three facts in one breath. |
| Too plain | A bomb pot is a hand with antes and no preflop betting. | Correct and dead. |
| Just right | Everyone antes, the flop comes out, and the betting starts there. |  |
| Too plain | Use gestures to play. | Says nothing. |
| Just right | No buttons to hunt for. Your hands already know how. | Keep lines like this. |

Lines that already land stay: "Your friends moved. Poker night didn't.", "Deal your friends in.", "Your house, your rules." Don't rewrite a good line to prove the pass happened.

## Microcopy rules

- **Buttons say what happens.** A verb and its object: "Open a room", "Sit down", "End the night", "Let in". Not "OK", "Submit", "Continue". The busy form of a button names the same action: "Opening…", "Letting them in…".
- **Errors say what went wrong and what to do.** One sentence for each, plain words, no blame. "That name is taken. Pick another." Not "Name collision" and never a code or tag.
- **No internal words on screen.** Never show a tag, enum, close reason, or identifier (`TooManySockets`, `RoomHalted`). Map it to a sentence.
- **Empty and waiting states guide.** Say what the player is waiting for and what will happen: "Waiting for a second player to sit."
- **Labels are short nouns.** "Your name", "Buy-in", "Small blind". Help text goes under a label only where a beginner needs it.
- **Confirmations say the consequence.** A sheet that asks before an action says what happens after it, then offers the action and a way out.
- **Same thing, same word.** A seat is a seat, not a spot. The host is the host. Chips are chips. Pick one word per action and keep it.

## Accessibility

- An aria label is the button's job in words: "Change your face", not "Face button".
- Icon-only controls always carry a label.
- Live-region text stays short and says only the change: "Eyes: big", not a paragraph.
- Picture alt text says what the picture shows, in one or two sentences.

## Unslop

Apply `pstack-unslop` to every string. The usual offenders in UI copy:

- Filler: "simply", "just", "please note", "in order to", "it's important to".
- Fancy verbs: "utilize", "facilitate", "leverage", "ensure". Use "use", "help", "make sure".
- Passive voice that hides who acts: "Your seat was taken" becomes "Kit took your seat" when the copy knows who.
- Hedging: "may possibly", "could potentially".
- Padding for search engines. A guide page gives a short intro line, the rule, an example, and stops. Short and useful beats long.
- Exclamation marks, emoji in copy, "Oops!", "Uh oh!".

## Fixed lines

- The legal pages (`/privacy`, `/terms`) may be reworded, never changed in substance. Keep every fact, limit, and promise. List each change for the owner.
- Room schema annotations are wire contract. Never word them for the screen. Screen words live in `rules-copy.ts` and `rejections.ts`.
- Code identifiers, log lines, and analytics names are not copy.

## Before and after

| Before | After | Why |
| --- | --- | --- |
| Refused: TooManySockets | Too many people are connecting to this room. Try again in a moment. | Never show a tag. Say what to do. |
| Chips to bring, 400 to 2000 | Buy-in, 400 to 2000 | The word a regular uses. |
| The door could not be checked: offline. Trying again. | Can't reach the room. Trying again. | Plain words, active voice. |
| Use standard | Use standard rules | A button names its object. |
| You cannot check. It costs 20 chips to call. | You can't check. It's 20 chips to call. | Contractions, same facts. |
| The host didn't let you in. You can knock again in 10 min. | The host didn't let you in. You can knock again in 10 minutes. | No abbreviations in a sentence. |

## Where copy lives

- Landing: `apps/web/index.html`, `src/features/landing/view.ts` (`LANDING_WORDS`), `src/features/landing/prerender.ts`.
- Screens and sheets: `src/features/*-view.ts`, `view.ts`, `chrome.ts`, `door.ts`, `halted.ts`, `stuck-line.ts`.
- Rules: `src/features/rules-copy.ts`. Rejections: `src/features/rejections.ts`.
- Guides: `apps/web/hand-rankings.html`, `host-a-poker-night.html`, `rules/*.html`, with titles and descriptions in `src/features/guides.ts`.
- Table: `src/features/table/*.ts`, `src/client/table/element.ts`.
- Learn: `src/features/learn/*.ts`, `src/client/learn/*.ts`, `learn.html`.
- Previews and titles: `src/features/link-preview.ts`, `structured-data.ts`, `public/manifest.webmanifest`.

Browser scripts in `apps/web/scripts/` find elements by their text. When a string changes, search the scripts for it and update them in the same commit.
