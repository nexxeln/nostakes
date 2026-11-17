---
name: nostakes-copy
description: The standard for every word a nostakes player reads, hears, or gets read aloud. Use when writing or changing UI copy in apps/web, the landing, /learn, /privacy, /terms, link previews, the manifest, aria labels, or rejection and error lines.
---

# nostakes copy

The reader is a friend at a home game, often on a phone, often mid-hand. They should find what they need, understand it on the first read, and know what to do next. That is plain language as ISO 24495-1 defines it: relevant, findable, understandable, usable.

## The voice

- Short declarative sentences. One idea each.
- Casual and warm, like the person dealing. Never corporate, never a casino.
- Say "you" to the player. Say "the host", "the room", "the table" for the rest. Never "we" for the app, never "the user".
- Poker words a regular uses: blinds, straddle, run it twice, muck, bomb pot. Explain one only where a beginner meets it, in a few words, the first time.
- Sentence case everywhere: titles, buttons, tabs, labels.
- Numbers as digits: "2 players", "Seat 3", "10 minutes".
- No em dashes or en dashes. Use a period or a comma.
- Straight quotes and apostrophes in code (`'`, `"`).
- Few words. The House look is restraint. If a line still works without a word, cut the word. If a screen still works without a line, cut the line.

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
| No money on the table, just the count. | Play for chips. The app keeps the count. | Say what happens, not a riddle. |
| Use standard | Use standard rules | A button names its object. |
| Your seat plays out this hand, then your chips are counted for the settle-up. | Your seat finishes this hand. Then your chips count toward the settle-up. | Two short sentences, active voice. |

## Where copy lives

- Landing: `apps/web/index.html`, `src/features/landing/view.ts` (`LANDING_WORDS`), `src/features/landing/prerender.ts`.
- Screens and sheets: `src/features/*-view.ts`, `view.ts`, `chrome.ts`, `door.ts`, `halted.ts`, `stuck-line.ts`.
- Rules: `src/features/rules-copy.ts`. Rejections: `src/features/rejections.ts`.
- Table: `src/features/table/*.ts`, `src/client/table/element.ts`.
- Learn: `src/features/learn/*.ts`, `src/client/learn/*.ts`, `learn.html`.
- Previews and titles: `src/features/link-preview.ts`, `structured-data.ts`, `public/manifest.webmanifest`.

Browser scripts in `apps/web/scripts/` find elements by their text. When a string changes, search the scripts for it and update them in the same commit.
