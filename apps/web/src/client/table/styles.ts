export const tableCss = `
:host {
  display: block; position: relative; overflow: hidden; contain: strict;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none;
}
* { box-sizing: border-box; }
.room {
  position: absolute; inset: 0; isolation: isolate; background: var(--color-page);
  color: var(--color-ink); font-family: var(--font-body); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}
.felt, .label .line .act, .rail .fill { pointer-events: none; }

.felt {
  position: absolute; z-index: 0; border-radius: 50%; background: var(--color-felt); box-shadow: var(--shadow-felt);
  transition: opacity var(--duration-2) var(--ease);
}
.in-strip .felt { opacity: 0; }
.strip { position: absolute; z-index: 1; border-radius: var(--radius-3); background: var(--color-strip); box-shadow: var(--shadow-strip); opacity: 0; }
.in-strip .strip { opacity: 1; }

.tile {
  position: absolute; left: 0; top: 0; width: var(--t); height: var(--t);
  transform-origin: 50% 50%; will-change: transform; z-index: 2;
}
.tile.active { z-index: 5; }
.frame {
  position: absolute; inset: 0; border-radius: var(--radius-face); overflow: hidden; background: var(--color-face);
  box-shadow: var(--shadow-face); transition: box-shadow var(--duration-2) var(--ease);
}
.pic {
  position: absolute; inset: 0; display: grid; place-items: center; color: var(--color-face-ink);
  font-size: calc(var(--t) * 0.34); font-weight: 500; letter-spacing: 0.01em;
  transition: color var(--duration-3) var(--ease), transform var(--duration-3) var(--ease);
}
.pic svg { width: 100%; height: 100%; display: block; }
.unlit .pic { color: var(--color-face-ink-unlit); }
.folded .pic { color: var(--color-face-ink-folded); }
.pic svg { transition: filter var(--duration-3) var(--ease); }
.unlit .pic svg { filter: var(--filter-face-unlit); }
.folded .pic svg { filter: var(--filter-face-folded); }
.away .frame { opacity: var(--opacity-away); }
.tile.empty, .tile.pickable { cursor: pointer; }
.tile.empty .frame { background: transparent; box-shadow: inset 0 0 0 1.5px var(--color-line-strong); }
.tile.empty .pic { color: var(--color-ink-muted); font-size: var(--text-3); font-weight: 600; }
.tile.empty .label { display: none; }

.label {
  position: absolute; left: 50%; top: calc(100% + var(--space-2)); transform: translateX(-50%);
  text-align: center; white-space: nowrap; line-height: var(--leading-tight); z-index: 1;
}
.label .name { font-size: var(--text-2); font-weight: 600; color: var(--color-ink); max-width: calc(var(--t) * 1.3); overflow: hidden; text-overflow: ellipsis; }
.label .line { position: relative; height: 1.2em; margin-top: 2px; font-size: var(--text-2); }
.label .st, .label .act {
  position: absolute; left: 50%; top: 0; white-space: nowrap;
  transition: opacity var(--duration-2) var(--ease), transform var(--duration-2) var(--ease);
}
.label .st { color: var(--color-ink-muted); transform: translate(-50%, 0); }
.label .act { color: var(--color-ink); font-weight: 600; opacity: 0; transform: translate(-50%, 5px); }
.label .act.quiet { color: var(--color-ink-muted); font-weight: 500; }
.label .act.hot, .label .act.win { color: var(--color-accent-ink); }
.label .note { position: absolute; left: 50%; top: 0; white-space: nowrap; color: var(--color-ink-muted); opacity: 0; transform: translate(-50%, 0); transition: opacity var(--duration-2) var(--ease); }
.noted .label .st { opacity: 0; }
.noted .label .note { opacity: 1; }
.acting .label .note { opacity: 0; }
.acting .label .st { opacity: 0; transform: translate(-50%, -5px); }
.acting .label .act { opacity: 1; transform: translate(-50%, 0); }
.folded .label .name { color: var(--color-ink-muted); }

.ring { position: absolute; overflow: visible; pointer-events: none; opacity: 0; transition: opacity var(--duration-2) var(--ease); }
.ring rect { fill: none; stroke: var(--color-ring); stroke-width: var(--width-ring); stroke-linecap: round; transition: stroke var(--duration-2) var(--ease); }
.ring.low rect { stroke: var(--color-alert); }
.on-clock .ring { opacity: 1; }

.shown { position: absolute; left: 50%; top: calc(var(--t) * 0.5); z-index: 3; display: flex; gap: 3px; transform: translateX(-50%); }

.pile {
  position: absolute; left: 0; top: 0; z-index: 6; display: flex; flex-direction: row; align-items: center; gap: 6px;
  pointer-events: none; transition: opacity var(--duration-1) var(--ease);
}
.pile.empty { opacity: 0; }
.pile .dot, .pot .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--color-chip); box-shadow: var(--shadow-chip); }
.pile .amt { font-size: var(--text-2); font-weight: 600; color: var(--color-ink); }

.pot { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; z-index: 2; transition: opacity var(--duration-2) var(--ease); }
.pot .k { font-size: var(--text-1); font-weight: 500; color: var(--color-ink-muted); letter-spacing: 0.08em; text-transform: uppercase; }
.pot .v { font-size: var(--text-4); font-weight: 600; color: var(--color-ink); letter-spacing: -0.01em; }
.pot .side { font-size: var(--text-1); color: var(--color-ink-muted); white-space: nowrap; }
.pot .dot { display: none; }
.pot.zero { opacity: 0; }
.slot { position: absolute; border-radius: calc(var(--cw) * 0.09); box-shadow: inset 0 0 0 1px var(--color-line); transform: translate(-50%, -50%); z-index: 1; }
.slot .card { position: absolute; left: 1px; top: 1px; }
.slot.hunt { cursor: pointer; box-shadow: inset 0 0 0 1.5px var(--color-line-strong); }
.slot.hunt[data-hint]::after { content: attr(data-hint); position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--text-1); font-weight: 600; color: var(--color-ink-muted); }
.card.rabbit { opacity: 0.55; }
.runs { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.runs .card { position: absolute; }

.card { position: relative; width: var(--w); height: calc(var(--w) * 1.4); font-size: var(--w); transform-style: preserve-3d; }
.card .face, .card .back { position: absolute; inset: 0; border-radius: 0.09em; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.card .face { background: var(--color-card); color: var(--color-card-ink); box-shadow: var(--shadow-card); transform: rotateY(180deg); }
.card.up .face { transform: none; }
.card.up .back { transform: rotateY(180deg); }
.card .face.red { color: var(--color-card-red); }
.card .ix { position: absolute; left: 0.1em; top: 0.07em; display: flex; flex-direction: column; align-items: center; line-height: 1; }
.card .r { font-family: var(--font-card); font-size: 0.36em; font-weight: 600; letter-spacing: -0.03em; }
.card .s { font-size: 0.25em; margin-top: 0.06em; }
.card .pip { position: absolute; right: 0.1em; bottom: 0.06em; font-size: 0.56em; line-height: 1; }
.card .back { background: var(--color-card-back); box-shadow: var(--shadow-card-back); }
.card .back::after { content: ""; position: absolute; inset: var(--inset-card-pattern); border-radius: 0.05em; background: var(--pattern-card-back); }

.self { position: absolute; z-index: 6; }
.self.gone, .chipctl.gone, .hand.away { visibility: hidden; }
.dealer {
  position: absolute; left: 0; top: 0; z-index: 7; width: 22px; height: 22px; border-radius: 50%; background: var(--color-dealer); color: var(--color-dealer-ink);
  font-size: var(--text-1); font-weight: 700; display: grid; place-items: center; box-shadow: var(--shadow-1);
  transition: transform var(--duration-3) var(--ease), opacity var(--duration-2) var(--ease);
}
.dealer.gone { opacity: 0; }

.hand { position: absolute; z-index: 6; perspective: 800px; cursor: grab; }
.hand.gone { visibility: hidden; }
.hand.dragging, .hand.armed { z-index: 9; }
.hand .hc { position: absolute; left: 0; top: 0; transition: transform 0.32s var(--ease); }
.hand .hc .card { transition: transform 0.32s var(--ease), opacity var(--duration-2) var(--ease); }
.hand .hc .face, .hand .hc .back { transition: transform 0.32s var(--ease); }
.hand.peek .hc .card .face, .hand.open .hc .card .face { transform: none; }
.hand.peek .hc .card .back, .hand.open .hc .card .back { transform: rotateY(180deg); }
.hand .hc:nth-child(1) { transform: translate(0px, 0px) rotate(-5deg); }
.hand .hc:nth-child(2) { transform: translate(var(--spread), 3px) rotate(4deg); }
.hand.peek .hc:nth-child(1), .hand.open .hc:nth-child(1) { transform: translate(-12px, -28px) rotate(-8deg); }
.hand.peek .hc:nth-child(2), .hand.open .hc:nth-child(2) { transform: translate(calc(var(--spread) + 12px), -25px) rotate(7deg); }
.hand.armed .hc .card { opacity: 0.45; }
.hand .hc.up .card .face { transform: none; }
.hand .hc.up .card .back { transform: rotateY(180deg); }
.hand.offering { cursor: pointer; }
.hand.beckon { animation: beckon 1.4s ease-in-out infinite; }
@keyframes beckon { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
.hand-label {
  position: absolute; left: 50%; bottom: calc(100% + var(--space-3)); transform: translateX(-50%); white-space: nowrap; z-index: 2;
  font-size: var(--text-2); font-weight: 600; color: var(--color-ink); opacity: 0; transition: opacity var(--duration-2) var(--ease); text-align: center;
}
.open .hand-label { bottom: calc(100% + 40px); }
.hand-label.on { opacity: 1; }
.hand-label .sub { display: block; font-size: var(--text-1); color: var(--color-ink-muted); font-weight: 500; margin-top: 2px; }
.armed .hand-label { padding: var(--space-1) var(--space-3); border-radius: var(--radius-round); background: var(--color-ink); color: var(--color-page); }

.chipctl { position: absolute; z-index: 9; width: var(--c); height: var(--c); cursor: grab; touch-action: none; border: 0; padding: 0; background: none; font: inherit; color: inherit; }
.chipctl:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; border-radius: 50%; }
.chipctl .disc {
  position: absolute; inset: 0; border-radius: 50%; background: var(--color-accent); box-shadow: var(--shadow-action);
  transition: background-color var(--duration-2) var(--ease), box-shadow var(--duration-2) var(--ease), opacity var(--duration-2) var(--ease);
}
.chipctl.idle .disc { background: transparent; box-shadow: inset 0 0 0 1.5px var(--color-line-strong); opacity: 0.6; }
.chipctl.live .disc { box-shadow: var(--shadow-action), 0 0 0 6px var(--color-action-halo); }
.chipctl .lbl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--color-on-accent); line-height: 1.15; pointer-events: none; }
.chipctl.idle .lbl { color: var(--color-ink-muted); }
.chipctl .lbl .a { font-size: var(--text-2); font-weight: 600; }
.chipctl .lbl .b { font-size: var(--text-3); font-weight: 600; }

.rail { position: absolute; inset: 0; z-index: 8; pointer-events: none; opacity: 0; transition: opacity var(--duration-1) var(--ease); }
.rail.on { opacity: 1; }
.rail .scrim { position: absolute; inset: 0; background: var(--color-scrim); }
.rail .track { position: absolute; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--color-line-strong); }
.rail .fill { position: absolute; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--color-accent); }
.rail .line { position: absolute; height: 1px; background: var(--color-line); }
.rail .det {
  position: absolute; display: flex; align-items: center; gap: var(--space-2); transform: translateY(-50%);
  font-size: var(--text-2); color: var(--color-ink-muted); white-space: nowrap; transition: color var(--duration-1) var(--ease), transform var(--duration-1) var(--ease);
}
.rail .det b { color: var(--color-ink); font-weight: 600; }
.rail .det::after { content: ""; width: 12px; height: 2px; border-radius: 2px; background: var(--color-line-strong); }
.rail .det.hit { color: var(--color-ink); transform: translateY(-50%) translateX(-4px); }
.rail .det.hit::after { background: var(--color-accent); width: 20px; }
.rail .readout { position: absolute; left: 24px; transform: translateY(-50%); white-space: nowrap; transition: opacity var(--duration-1) var(--ease); }
.rail .readout.end { transform: translate(-100%, -50%); text-align: right; }
.rail .readout .k { font-size: var(--text-2); color: var(--color-ink-muted); }
.rail .readout .v { font-size: var(--text-6); font-weight: 600; letter-spacing: -0.02em; color: var(--color-ink); line-height: 1.05; }
.rail .readout.off .v { color: var(--color-alert); }
.rail .readout .note { font-size: var(--text-1); color: var(--color-ink-muted); margin-top: var(--space-2); display: flex; gap: var(--space-1); align-items: center; justify-content: inherit; }
.rail .readout.end .note { justify-content: flex-end; }
.rail .cancel { position: absolute; transform: translate(-50%, 0); font-size: var(--text-1); color: var(--color-ink-muted); white-space: nowrap; }

.fx { position: absolute; inset: 0; pointer-events: none; z-index: 7; overflow: hidden; }
.fly { position: absolute; left: 0; top: 0; will-change: transform; }
.fchip { width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--color-chip); box-shadow: var(--shadow-chip); }
.fcard { width: 30px; height: 42px; margin: -21px 0 0 -15px; }
.banner { position: absolute; left: 50%; z-index: 9; transform: translate(-50%, -50%); text-align: center; pointer-events: none; opacity: 0; white-space: nowrap; }
.banner .v { font-size: var(--text-6); line-height: 1.05; font-weight: 600; letter-spacing: -0.02em; color: var(--color-win); }
.banner .k { font-size: var(--text-2); color: var(--color-ink-muted); margin: 2px 0; }

.hint {
  position: absolute; z-index: 11; font-size: var(--text-2); font-weight: 500; color: var(--color-ink-muted); white-space: nowrap;
  opacity: 0; pointer-events: none; transform: translate(-50%, 4px);
  transition: opacity var(--duration-3) var(--ease), transform var(--duration-3) var(--ease);
}
.hint.on { opacity: 1; transform: translate(-50%, 0); }
.ghost { position: absolute; z-index: 11; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; background: var(--color-accent); opacity: 0; pointer-events: none; }

.keys {
  position: absolute; z-index: 8; display: none; gap: var(--space-3); transform: translate(-50%, 0); white-space: nowrap;
  font-size: var(--text-1); color: var(--color-ink-muted); opacity: 0; transition: opacity var(--duration-2) var(--ease); pointer-events: none;
}
.keys.on { opacity: 1; }
.keys.start { transform: none; }
.keys span { display: inline-flex; align-items: center; gap: 6px; }
kbd {
  display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: var(--radius-1);
  font: 600 var(--text-1)/1 var(--font-body); color: var(--color-ink); box-shadow: inset 0 0 0 1px var(--color-line-strong);
}
@media (hover: hover) and (pointer: fine) { .keys { display: flex; } }
@media (prefers-reduced-motion: reduce) {
  .hand .hc, .hand .hc .card, .hand .hc .face, .hand .hc .back, .chipctl, .chipctl .disc, .hint, .label .st, .label .act, .pic { transition-duration: 0.01ms !important; }
  .hand.beckon { animation: none; }
}
`;
