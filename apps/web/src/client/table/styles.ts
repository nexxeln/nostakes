export const tableCss = `
:host {
  display: block; position: relative; overflow: hidden; contain: strict;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: pinch-zoom;
}
* { box-sizing: border-box; }
.room {
  position: absolute; inset: 0; isolation: isolate; background: var(--color-page);
  color: var(--color-ink); font-family: var(--font-body); font-weight: var(--weight-body); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}
.felt, .label .line .act, .rail .fill { pointer-events: none; }

.felt {
  position: absolute; z-index: 0; border-radius: 50%; background: var(--color-felt); box-shadow: var(--shadow-felt);
  transition: opacity var(--duration-2) var(--ease);
}
.in-strip .felt { opacity: 0; }
.strip { position: absolute; z-index: 1; border-radius: var(--radius-mat); background: var(--color-strip); box-shadow: var(--shadow-strip); opacity: 0; }
.in-strip .strip { opacity: 1; }

.paper-chip {
  --chip: var(--color-chip);
  border-radius: 50%;
  background:
    radial-gradient(closest-side, var(--color-chip-stock) 0 40%, var(--chip) 41% 46%, var(--color-chip-stock) 47% 56%, transparent 57%),
    radial-gradient(closest-side, var(--chip) 0 72%, transparent 73% 96%, var(--chip) 97%),
    repeating-conic-gradient(from 6deg, var(--color-chip-stock) 0 18deg, var(--chip) 18deg 60deg);
  box-shadow: var(--shadow-sheet-1);
}
.chip-0 { --chip: var(--house-red); }
.chip-1 { --chip: var(--house-blue); }
.chip-2 { --chip: var(--house-yellow); }
.chip-3 { --chip: var(--house-green); }
.chip-4 { --chip: var(--house-pink); }

.tile {
  position: absolute; left: 0; top: 0; width: var(--t); height: var(--t);
  transform-origin: 50% 50%; will-change: transform; z-index: 2;
}
.tile.active { z-index: 5; }
.frame {
  position: absolute; inset: 0; border-radius: var(--radius-face); background: var(--color-face);
  box-shadow: var(--shadow-face); transition: box-shadow var(--duration-2) var(--ease);
}
.pic {
  position: absolute; left: 0; top: -5%; width: 100%; height: 100%; display: grid; place-items: center; color: var(--color-face-ink);
  font-size: calc(var(--t) * 0.34); font-weight: var(--weight-body); letter-spacing: 0.01em;
  transition: color var(--duration-3) var(--ease), transform var(--duration-3) var(--ease);
}
.pic svg { width: 100%; height: 100%; display: block; overflow: visible; }
.unlit .pic { color: var(--color-face-ink-unlit); }
.folded .pic { color: var(--color-face-ink-folded); }
.pic svg { transition: filter var(--duration-3) var(--ease); }
.unlit .pic svg { filter: var(--filter-face-unlit); }
.folded .pic svg { filter: var(--filter-face-folded); }
.away .frame, .away .pic { opacity: var(--opacity-away); }
.tile.empty, .tile.pickable { cursor: pointer; }
.tile.empty .frame { background: transparent; box-shadow: none; border: 1.5px dashed var(--color-line-strong); }
.tile.empty .pic { top: 0; color: var(--color-ink-muted); font-size: var(--text-3); font-weight: var(--weight-body); }
.tile.empty .label { display: none; }

.label {
  position: absolute; left: 50%; top: calc(100% + var(--space-2)); transform: translateX(-50%);
  text-align: center; white-space: nowrap; line-height: var(--leading-tight); z-index: 1;
}
.label .name { font-size: var(--text-2); font-weight: var(--weight-body); color: var(--color-ink); max-width: calc(var(--t) * 1.3); overflow: hidden; text-overflow: ellipsis; }
.label .line { position: relative; height: 1.2em; margin-top: 2px; font-size: var(--text-2); }
.label .st, .label .act {
  position: absolute; left: 50%; top: 0; white-space: nowrap;
  transition: opacity var(--duration-2) var(--ease), transform var(--duration-2) var(--ease);
}
.label .st { color: var(--color-ink-muted); transform: translate(-50%, 0); }
.label .act { color: var(--color-ink); font-weight: var(--weight-strong); opacity: 0; transform: translate(-50%, 5px); }
.label .act.quiet { color: var(--color-ink-muted); font-weight: var(--weight-body); }
.label .act.hot { color: var(--color-accent-ink); }
.label .note { position: absolute; left: 50%; top: 0; white-space: nowrap; color: var(--color-ink-muted); opacity: 0; transform: translate(-50%, 0); transition: opacity var(--duration-2) var(--ease); }
.noted .label .st { opacity: 0; }
.noted .label .note { opacity: 1; }
.acting .label .note { opacity: 0; }
.acting .label .st { opacity: 0; transform: translate(-50%, -5px); }
.acting .label .act { opacity: 1; transform: translate(-50%, 0); }
.folded .label .name { color: var(--color-ink-muted); }

.ring { position: absolute; overflow: visible; pointer-events: none; opacity: 0; transition: opacity var(--duration-2) var(--ease); }
.ring rect { fill: none; stroke-width: var(--width-ring); }
.ring .track { stroke: var(--color-ring-track); stroke-width: calc(var(--width-ring) - 0.5px); }
.ring .run { stroke: var(--color-ring); stroke-linecap: round; transition: stroke var(--duration-2) var(--ease); }
.ring.low .run { stroke: var(--color-alert); }
.on-clock .ring, .won .ring { opacity: 1; }
.won .ring .run { stroke: var(--color-win); }

.tab {
  position: absolute; left: 50%; top: -13px; z-index: 4; min-width: 48px; height: 22px; padding: 0 8px; translate: -50% 0;
  display: grid; place-items: center; border-radius: var(--radius-tab); background: var(--color-win); color: var(--color-on-accent);
  font-size: 0.84375rem; font-weight: var(--weight-strong); white-space: nowrap; box-shadow: var(--shadow-sheet-2);
  opacity: 0; scale: 0.6; pointer-events: none; transition: opacity var(--duration-2) var(--ease), scale var(--duration-3) var(--ease-back);
}
.won .tab { opacity: 1; scale: 1; }

.shown { position: absolute; left: 50%; top: calc(var(--t) * 0.5); z-index: 3; display: flex; gap: 3px; transform: translateX(-50%); }

.pile {
  position: absolute; left: 0; top: 0; z-index: 6; display: flex; flex-direction: row; align-items: center; gap: 6px;
  pointer-events: none; transition: opacity var(--duration-1) var(--ease);
}
.pile.empty { opacity: 0; }
.pile .dot { position: relative; width: 14px; height: 14px; }
.pile .dot::before { content: ""; position: absolute; inset: 0; translate: 0 -3px; background: inherit; box-shadow: inherit; }
.pile .dot, .pile .dot::before { border-radius: 50%; }
.pile .amt { font-size: var(--text-2); font-weight: var(--weight-strong); color: var(--color-ink); }

.pot {
  position: absolute; width: var(--pot-w, 88px); height: var(--pot-h, 66px); transform: translate(-50%, -50%); z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: var(--radius-3); background: var(--color-pot); color: var(--color-on-pot); box-shadow: var(--shadow-sheet-1);
  transition: opacity var(--duration-2) var(--ease);
}
.pot .k { font-size: var(--text-1); font-weight: var(--weight-body); letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.75; line-height: 1.2; }
.pot .v {
  font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display);
  font-size: min(calc(var(--pot-h, 66px) * 0.46), calc(var(--pot-w, 88px) * 1.5 / var(--pot-len, 2))); letter-spacing: -0.02em; line-height: 1;
}
.pot.split .v { font-size: min(calc(var(--pot-h, 66px) * 0.34), calc(var(--pot-w, 88px) * 1.4 / var(--pot-len, 2))); }
.pot.flat { flex-direction: row; gap: 0.4em; width: auto; min-width: var(--pot-w, 88px); padding: 0 0.7em; }
.pot.flat .v { font-size: calc(var(--pot-h, 66px) * 0.56); }
.pot.flat .side { margin-top: 0; }
.pot .side { font-size: var(--text-1); white-space: nowrap; opacity: 0.85; margin-top: 2px; }
.pot.zero { opacity: 0; }
.slot { position: absolute; border-radius: calc(var(--cw) * 0.1); border: 1.4px dashed var(--color-line); transform: translate(-50%, -50%); z-index: 1; }
.room:not(.in-strip) .slot { border-color: color-mix(in srgb, var(--color-ink) 45%, transparent); }
.room .slot:has(.card) { border-color: transparent; }
.slot .card { position: absolute; left: -0.4px; top: -0.4px; }
.slot.hunt { cursor: pointer; border-color: var(--color-line-strong); }
.slot.hunt[data-hint]::after { content: attr(data-hint); position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--text-1); font-weight: var(--weight-strong); color: var(--color-ink-muted); }
.card.rabbit { opacity: 0.55; }
.runs { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.runs .card { position: absolute; }
.runs .card.shared { opacity: 0.45; }

.card { position: relative; width: var(--w); height: calc(var(--w) * 1.4); font-size: var(--w); transform-style: preserve-3d; }
.card .face, .card .back { position: absolute; inset: 0; border-radius: var(--radius-card); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.card .face { background: var(--color-card); color: var(--color-card-ink); box-shadow: var(--shadow-card); transform: rotateY(180deg); }
.card.up .face { transform: none; }
.card.up .back { transform: rotateY(180deg); }
.card .face svg { display: block; width: 100%; height: 100%; fill: currentColor; }
.card .face text { font-family: var(--font-card); font-weight: var(--weight-strong); font-variation-settings: "opsz" 20; }
.card .face.suit-s { color: var(--color-suit-spade); }
.card .face.suit-h { color: var(--color-suit-heart); }
.card .face.suit-d { color: var(--color-suit-diamond); }
.card .face.suit-c { color: var(--color-suit-club); }
.card .back { background: var(--color-card); box-shadow: var(--shadow-card-back); }
.card .back::after {
  content: ""; position: absolute; inset: var(--inset-card-pattern); border-radius: 0.06em;
  background: repeating-linear-gradient(-45deg, var(--color-card-back-line) 0 1.6px, transparent 1.6px 5px), var(--color-card-back);
}

.self { position: absolute; z-index: 6; }
.self.gone, .chipctl.gone, .hand.away { visibility: hidden; }
.dealer {
  --b: 28px;
  position: absolute; left: 0; top: 0; z-index: 7; width: var(--b); height: var(--b); margin: calc(var(--b) / -2) 0 0 calc(var(--b) / -2);
  border-radius: 50%; background: var(--color-dealer); color: var(--color-dealer-ink); display: grid; place-items: center;
  font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display);
  font-size: calc(var(--b) * 0.5); line-height: 1; letter-spacing: -0.02em; pointer-events: none;
  box-shadow:
    inset 0 0 0 calc(var(--b) * 0.085) var(--color-dealer-ink),
    inset 0 0 0 calc(var(--b) * 0.14) var(--color-dealer),
    inset 0 0 0 calc(var(--b) * 0.165) var(--color-dealer-rule),
    var(--shadow-sheet-2);
  transition: opacity var(--duration-2) var(--ease);
}
.dealer.gone { opacity: 0; }
.pile .posted-tag { display: none; }
.pile.posted .posted-tag {
  position: absolute; display: inline-grid; place-items: center; height: 20px; min-width: 30px; padding: 0 6px; border-radius: 6px;
  background: var(--color-raised); color: var(--color-raised-ink); box-shadow: var(--shadow-sheet-1);
  font-size: var(--text-1); font-weight: var(--weight-strong); letter-spacing: 0.03em; white-space: nowrap;
  transition: background-color var(--duration-3) var(--ease), color var(--duration-3) var(--ease), box-shadow var(--duration-3) var(--ease);
}
.posted-tag.before { top: 50%; right: calc(100% + 4px); translate: 0 -50%; }
.posted-tag.after { top: 50%; left: calc(100% + 4px); translate: 0 -50%; }
.posted-tag.below { top: calc(100% + 4px); left: 50%; translate: -50% 0; }
.posted-tag.above { bottom: calc(100% + 4px); left: 50%; translate: -50% 0; }
.pile.posted .posted-tag.settled { background: transparent; color: var(--color-ink-muted); box-shadow: none; padding: 0 2px; }

.hand { position: absolute; z-index: 6; perspective: 800px; cursor: grab; }
.hand.gone { visibility: hidden; }
.hand.dragging, .hand.armed { z-index: 9; }
.hand .hc { position: absolute; left: 0; top: 0; transition: transform 0.32s var(--ease); }
.hand .hc .card { transition: transform 0.32s var(--ease), opacity var(--duration-2) var(--ease); }
.hand .hc .face, .hand .hc .back { transition: transform 0.32s var(--ease); }
.hand .hc .face, .hand .hc .back { box-shadow: var(--shadow-sheet-2); }
.hand.peek .hc .card .face, .hand.open .hc .card .face { transform: none; }
.hand.peek .hc .card .back, .hand.open .hc .card .back { transform: rotateY(180deg); }
.hand .hc:nth-child(1) { transform: translate(0px, 0px) rotate(-5deg); }
.hand .hc:nth-child(2) { transform: translate(var(--spread), 3px) rotate(4deg); }
.hand.peek .hc:nth-child(1), .hand.open .hc:nth-child(1) { transform: translate(-12px, -28px) rotate(-8deg); }
.hand.peek .hc:nth-child(2), .hand.open .hc:nth-child(2) { transform: translate(calc(var(--spread) + 12px), -25px) rotate(7deg); }
.hand.armed .hc .card { opacity: 0.45; }
.hand .hc.up .card .face { transform: none; }
.hand .hc.up .card .back { transform: rotateY(180deg); }
.hand .hc.up::before {
  content: "Shown"; position: absolute; z-index: 3; left: 50%; top: calc(var(--cw-hand, 60px) * 1.4 - 9px); translate: -50% 0; height: 18px; padding: 0 7px;
  display: grid; place-items: center; border-radius: 6px; background: var(--color-toast); color: var(--color-on-toast);
  font-size: var(--text-1); font-weight: var(--weight-strong); letter-spacing: 0.02em; box-shadow: var(--shadow-sheet-1); white-space: nowrap;
}
.hand.open .hc.up::before { display: none; }
.hand.offering { cursor: pointer; }
.hand.beckon { animation: beckon 1.4s ease-in-out infinite; }
@keyframes beckon { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
.hand-label {
  position: absolute; left: 50%; bottom: calc(100% + var(--space-3)); transform: translateX(-50%); white-space: nowrap; z-index: 2;
  font-size: var(--text-2); font-weight: var(--weight-strong); color: var(--color-ink); opacity: 0; transition: opacity var(--duration-2) var(--ease); text-align: center;
}
.open .hand-label { bottom: calc(100% + 40px); }
.hand-label.on { opacity: 1; }
.hand-label .say, .hand-label .sub { display: block; }
.hand-label:has(.sub:not(.gone)) { bottom: calc(100% + 4px); }
.hand-label:has(.sub:not(.gone)) .until { display: none; }
.hand-label .sub { font-size: var(--text-1); color: var(--color-ink-muted); font-weight: var(--weight-body); margin-top: 2px; }
.hand-label .gone { display: none !important; }
.hand-label .until { display: block; width: 72px; height: 3px; margin: 5px auto 0; border-radius: 2px; background: var(--color-ring-track); overflow: hidden; }
.hand-label .until::after { content: ""; display: block; height: 100%; width: calc(var(--left, 1) * 100%); background: var(--color-ink-muted); border-radius: 2px; }
.armed .hand-label { padding: var(--space-1) var(--space-3); border-radius: var(--radius-3); background: var(--color-toast); color: var(--color-on-toast); box-shadow: var(--shadow-sheet-2); }

.entry {
  position: absolute; z-index: 6; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  text-align: center; line-height: var(--leading-tight); text-wrap: balance;
}
.entry.gone, .entry .note.gone { display: none; }
.entry .line { font-size: var(--text-2); font-weight: var(--weight-strong); color: var(--color-ink); }
.entry .post-action {
  font: inherit; font-size: var(--text-2); font-weight: var(--weight-strong); line-height: var(--leading-tight); min-height: 44px; max-width: 100%;
  padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--radius-3); cursor: pointer;
  background: var(--color-raised); color: var(--color-raised-ink); box-shadow: var(--shadow-sheet-2);
  transition: translate var(--duration-1) var(--ease), box-shadow var(--duration-1) var(--ease);
}
.entry .post-action:active { translate: var(--press-2); box-shadow: var(--shadow-sheet-0); }
.entry .post-action:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
.entry.posting .post-action { background: transparent; box-shadow: none; color: var(--color-ink-muted); font-weight: var(--weight-body); text-decoration: underline; text-underline-offset: 3px; min-height: 36px; }
.entry .note { font-size: var(--text-1); color: var(--color-ink-muted); }
.chipctl { position: absolute; z-index: 9; width: var(--c); height: var(--c); cursor: grab; border: 0; padding: 0; background: none; font: inherit; color: inherit; }
.chipctl:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 50%; }
.chipctl .disc {
  position: absolute; inset: 0; border-radius: 50%; background: var(--color-accent); box-shadow: var(--shadow-action);
  transition: background-color var(--duration-2) var(--ease), box-shadow var(--duration-2) var(--ease), opacity var(--duration-2) var(--ease), translate var(--duration-1) var(--ease);
}
.chipctl.idle .disc { background: transparent; box-shadow: none; border: 1.5px dashed var(--color-line-strong); }
.chipctl.paper .disc { background: var(--color-raised); box-shadow: var(--shadow-sheet-2); }
.chipctl.paper:active .disc { translate: var(--press-2); box-shadow: var(--shadow-sheet-0); }
.chipctl.paper .lbl { color: var(--color-raised-ink); }
.chipctl.live .disc { box-shadow: var(--shadow-action), 0 0 0 calc(var(--c) * 0.095) var(--color-action-halo); }
.chipctl.live:active .disc { translate: var(--press-2); box-shadow: var(--shadow-sheet-0), 0 0 0 calc(var(--c) * 0.095) var(--color-action-halo); }
.chipctl .lbl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--color-on-accent); line-height: 1.15; pointer-events: none; }
.chipctl.idle .lbl { color: var(--color-ink-muted); }
.chipctl .lbl .a { font-size: 1.0625rem; font-weight: var(--weight-body); }
.chipctl .lbl .b { font-size: var(--text-3); font-weight: var(--weight-strong); }

.rail { position: absolute; inset: 0; z-index: 8; pointer-events: none; opacity: 0; transition: opacity var(--duration-1) var(--ease); }
.rail.on { opacity: 1; }
.rail .scrim { position: absolute; inset: 0; background: var(--color-scrim); }
.in-strip .rail .scrim { display: none; }
.rail .track {
  position: absolute; width: 12px; margin-left: -6px; border-radius: 6px; background: var(--color-raised); box-shadow: var(--shadow-sheet-1);
  transform: scaleY(0); transform-origin: 50% 100%; transition: transform var(--duration-2) var(--ease-back);
}
.rail.on .track { transform: none; }
.rail .fill { position: absolute; width: 6px; margin-left: -3px; border-radius: 3px; background: var(--color-accent); }
.rail .held {
  position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
  background: var(--color-accent); box-shadow: var(--shadow-sheet-3);
}
.rail .held::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; border: 2px solid var(--color-accent); opacity: 0.35; }
.rail .det {
  position: absolute; display: flex; align-items: center; transform: translateY(-50%);
  opacity: 0; translate: 6px 0; transition: opacity var(--duration-2) var(--ease), translate var(--duration-2) var(--ease-back);
  transition-delay: calc(var(--i, 0) * 40ms);
}
.rail.on .det { opacity: 1; translate: 0 0; }
.rail .det .tag {
  display: inline-flex; align-items: center; gap: 0.3em; height: 22px; padding: 0 9px; border-radius: 7px;
  background: var(--color-raised); box-shadow: var(--shadow-sheet-1);
  font-size: 0.78125rem; color: var(--color-ink-muted); white-space: nowrap; transition: color var(--duration-1) var(--ease), background-color var(--duration-1) var(--ease);
}
.rail .det b { color: var(--color-raised-ink); font-weight: var(--weight-display); }
.rail .det::after { content: ""; width: 11px; height: 1.4px; margin-left: 1px; background: var(--color-ink-muted); transition: background-color var(--duration-1) var(--ease); }
.rail .det.hit .tag { color: var(--color-raised-ink); }
.rail .det.hit::after { background: var(--color-accent); }
.rail .readout { position: absolute; left: 24px; transform: translateY(-50%); white-space: nowrap; transition: opacity var(--duration-1) var(--ease); }
.rail .readout.end { transform: translate(-100%, -50%); text-align: right; }
.rail .readout.mid { transform: translate(-50%, -50%); text-align: center; }
.rail .readout .k { font-size: var(--text-2); color: var(--color-ink-muted); }
.rail .readout .v {
  font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display);
  font-size: var(--text-6); letter-spacing: -0.02em; color: var(--color-accent); line-height: 1.05;
}
.rail .readout.mid .v { font-size: 4rem; line-height: 1.1; }
.rail .readout.off .v { color: var(--color-alert); }
.rail .readout .note { font-size: 0.8125rem; color: var(--color-ink-muted); margin-top: var(--space-1); display: flex; flex-wrap: wrap; gap: 2px var(--space-1); align-items: center; justify-content: flex-start; }
.rail .readout.end .note { justify-content: flex-end; }
.rail .readout.mid .note { justify-content: center; }
.rail .readout .note .row { flex-basis: 100%; }
.rail .readout .note .row + .row { font-size: var(--text-1); }
.rail .cancel { position: absolute; transform: translate(-50%, 0); font-size: var(--text-1); color: var(--color-ink-muted); white-space: nowrap; }

.fx { position: absolute; inset: 0; pointer-events: none; z-index: 7; overflow: hidden; }
.fly { position: absolute; left: 0; top: 0; will-change: transform; }
.fchip { width: 20px; height: 20px; margin: -10px 0 0 -10px; }
.fcard { width: 30px; height: 42px; margin: -21px 0 0 -15px; }
.reaction { position: absolute; font-size: var(--text-5); line-height: 1; opacity: 0; will-change: transform, opacity; }
.reactions { position: absolute; z-index: 8; display: flex; gap: var(--space-1); padding: var(--space-1); transform: translate(-50%, calc(-100% - var(--space-2))); border-radius: var(--radius-round); background: var(--color-raised); box-shadow: var(--shadow-sheet-2); }
.reactions.gone { display: none; }
.reaction-choice { font: inherit; font-size: var(--text-4); line-height: 1; padding: var(--space-1); border: 0; border-radius: var(--radius-round); background: transparent; cursor: pointer; }
.reaction-choice:focus-visible { outline: 2px solid var(--color-accent); }
.self .frame { cursor: pointer; }
.banner { position: absolute; left: 50%; z-index: 9; transform: translate(-50%, -50%); text-align: center; pointer-events: none; opacity: 0; white-space: nowrap; }
.banner .v {
  font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display);
  font-size: var(--text-6); line-height: 1.05; letter-spacing: -0.02em; color: var(--color-win);
}
.banner .k { font-size: var(--text-2); color: var(--color-ink-muted); margin: 2px 0; }

.hint {
  position: absolute; z-index: 11; font-size: 0.8125rem; font-weight: var(--weight-body); color: var(--color-ink-muted); white-space: nowrap;
  opacity: 0; pointer-events: none; transform: translate(-50%, 4px);
  transition: opacity var(--duration-3) var(--ease), transform var(--duration-3) var(--ease);
}
.hint.on { opacity: 1; transform: translate(-50%, 0); }
.ghost { position: absolute; z-index: 11; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; background: var(--color-accent); box-shadow: var(--shadow-sheet-1); opacity: 0; pointer-events: none; }

.keys {
  position: absolute; z-index: 8; display: none; gap: var(--space-3); transform: translate(-50%, 0); white-space: nowrap;
  font-size: 0.78125rem; color: var(--color-ink-muted); opacity: 0; transition: opacity var(--duration-2) var(--ease); pointer-events: none;
}
.keys.on { opacity: 1; }
.keys.start { transform: none; }
.keys span { display: inline-flex; align-items: center; gap: 6px; }
kbd {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-1);
  font: var(--weight-strong) var(--text-1)/1 var(--font-body); color: var(--color-ink); box-shadow: inset 0 0 0 1.1px var(--color-ink-muted);
}
@media (hover: hover) and (pointer: fine) { .keys { display: flex; } }
@media (any-pointer: coarse), (max-width: 30rem) { .keys { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .hand .hc, .hand .hc .card, .hand .hc .face, .hand .hc .back, .pile .posted-tag, .chipctl, .chipctl .disc, .hint, .label .st, .label .act, .pic, .rail .track, .rail .det, .rail .held, .tab { transition-duration: 0.01ms !important; transition-delay: 0s !important; }
  .hand.beckon { animation: none; }
}
`;
