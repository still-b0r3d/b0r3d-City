/* b0r3d-city dev menu -- styles.
 *
 * A string injected by panel.js rather than a stylesheet, for two reasons: this
 * webpack config has no CSS loader, and putting it in css/style.css would ship it to
 * every player, when the whole point of the separate chunk is that they never download
 * any of the menu.
 */

var DEV_CSS = [
  '#devPanel {',
  '  position: fixed; top: 48px; left: 240px; width: 360px; max-height: calc(100vh - 96px);',
  '  z-index: 1000; overflow-y: auto; resize: both; min-width: 280px; min-height: 120px;',
  '  box-sizing: border-box; padding: 0 8px 10px; background: rgba(13, 17, 23, 0.97);',
  '  border: 1px solid #3a4656; border-radius: 4px; color: #d8e2ec;',
  '  font: 11.5px/1.4 ui-monospace, Consolas, "Courier New", monospace; text-align: left;',
  '  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55); user-select: text;',
  '}',
  '#devPanel[hidden], .dv-tab[hidden] { display: none !important; }',
  '#devPanel * { box-sizing: border-box; }',
  '.dv-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;',
  '  padding: 6px 0; margin-bottom: 2px; background: rgba(13, 17, 23, 0.99); border-bottom: 1px solid #3a4656; cursor: move; }',
  '.dv-head b { color: #7fd4ff; letter-spacing: 0.12em; }',
  '.dv-head .dv-btn { margin-left: auto; cursor: pointer; }',
  '.dv-badge { color: #ff7b72; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  // In the middle of the footer bar, the one strip of screen no panel ever floats over:
  // the bottom-left corner, where the other games keep this button, is the Demand panel's.
  '.dv-btn.dv-tab { position: fixed; left: 50%; bottom: 3px; transform: translateX(-50%); z-index: 1000;',
  '  padding: 1px 10px; margin: 0; width: auto; height: auto; font: 11px/1.3 ui-monospace, Consolas, monospace;',
  '  letter-spacing: 0.08em; color: #7fd4ff; background: #0d1117; border: 1px solid #3a4656; border-radius: 3px; cursor: pointer; }',
  '.dv-tab.hot { border-color: #ff7b72; color: #ff7b72; }',
  '.dv-sec { border-bottom: 1px solid rgba(58, 70, 86, 0.6); padding: 1px 0 6px; }',
  '.dv-sec > summary { cursor: pointer; color: #8795a5; font-size: 10px; letter-spacing: 0.12em;',
  '  text-transform: uppercase; padding: 5px 0 3px; user-select: none; }',
  '.dv-sec[open] > summary { color: #e3b341; }',
  '.dv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 3px 0; }',
  '.dv-wrap { display: flex; flex-wrap: wrap; gap: 3px; margin: 3px 0; }',
  '.dv-lbl { min-width: 54px; color: #8795a5; }',
  '.dv-sub { color: #8795a5; font-size: 10px; letter-spacing: 0.08em; margin: 7px 0 2px; text-transform: uppercase; }',
  '.dv-note { color: #8795a5; font-size: 10.5px; margin: 3px 0; }',
  '.dv-note.warn { color: #ff7b72; }',
  '.dv-note.ok { color: #7ee787; }',
  '#devPanel .dv-btn { font: inherit; font-size: 11px; padding: 2px 7px; margin: 0; background: #1c2430; color: #d8e2ec;',
  '  border: 1px solid #3a4656; border-radius: 3px; cursor: pointer; white-space: nowrap; width: auto; height: auto; }',
  '#devPanel .dv-btn:hover { border-color: #e3b341; color: #e3b341; }',
  '#devPanel .dv-btn.sm { padding: 0 5px; font-size: 10px; }',
  '#devPanel .dv-btn.bad { color: #ff7b72; }',
  '#devPanel .dv-btn.on { border-color: #7fd4ff; color: #7fd4ff; }',
  '#devPanel .dv-num, #devPanel .dv-sel, #devPanel .dv-text, #devPanel .dv-textarea {',
  '  font: inherit; font-size: 11px; background: #05070a; color: #d8e2ec; border: 1px solid #3a4656;',
  '  border-radius: 3px; padding: 1px 4px; margin: 0; height: auto; width: auto; }',
  '#devPanel .dv-num { width: 70px; }',
  '#devPanel .dv-num.sm { width: 48px; }',
  '#devPanel .dv-text { width: 110px; }',
  '#devPanel .dv-sel { max-width: 100%; }',
  '#devPanel .dv-textarea { width: 100%; height: 80px; resize: vertical; font-size: 10px; }',
  '#devPanel input[type=checkbox] { margin: 0; width: auto; height: auto; }',
  '.dv-check { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer; }',
  '.dv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px; margin: 3px 0; }',
  '.dv-status { display: flex; flex-wrap: wrap; gap: 1px 10px; font-variant-numeric: tabular-nums; padding: 2px 0; }',
  '.dv-status span { white-space: nowrap; }',
  '.dv-status .warn { color: #ff7b72; }',
  '.dv-status .ok { color: #7ee787; }',
  '.dv-table { display: flex; flex-direction: column; gap: 1px; max-height: 190px; overflow-y: auto; }',
  '.dv-tr { display: flex; align-items: center; gap: 6px; padding: 0 2px; border-radius: 3px; }',
  '.dv-tr:hover { background: #1c2430; }',
  '.dv-td { white-space: nowrap; }',
  '.dv-td.name { flex: 1; overflow: hidden; text-overflow: ellipsis; }',
  '.dv-td.dim { color: #8795a5; }',
  '.dv-pre { margin: 4px 0 0; padding: 4px 6px; background: #05070a; border: 1px solid #3a4656; border-radius: 3px;',
  '  font: inherit; font-size: 10.5px; line-height: 1.35; white-space: pre-wrap; overflow: auto; max-height: 220px; }',
  '.dv-tile { display: flex; gap: 8px; align-items: flex-start; }',
  '.dv-tile canvas { image-rendering: pixelated; border: 1px solid #3a4656; background: #000; flex: none; }',
  '#devOverlay { position: absolute; pointer-events: none; }',
  '#MicropolisCanvas.dv-picking { cursor: crosshair !important; }',
  '@media (max-width: 768px), (max-height: 600px) {',
  '  #devPanel { left: 0 !important; right: 0; top: auto !important; bottom: 0; width: auto !important;',
  '    height: auto !important; max-height: 62vh; resize: none; border-radius: 4px 4px 0 0; }',
  '  .dv-head { cursor: default; }',
  '}',
  // A phone's footer is full edge to edge, so there the button goes under the header,
  // top right, clear of the Menu/Tools drawer toggles on the left.
  '@media (max-width: 768px) {',
  '  .dv-btn.dv-tab { left: auto; right: 6px; bottom: auto; top: calc(var(--headerHeight, 60px) + 6px); transform: none; }',
  '}'
].join('\n');


export { DEV_CSS };
