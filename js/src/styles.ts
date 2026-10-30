export const STYLES: string = `
:host { all: initial; }
dialog {
  --primary: #4f6bd8; --primary-dark: #3f58bd; --ink: #1f2430; --muted: #4a5263; --line: #e3e7ee; --field: #d5dae3;
  box-sizing: border-box; width: min(510px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
  margin: auto; padding: 23px 25px 25px; border: 1px solid var(--line); border-radius: 12px; background: #fff;
  color: var(--ink); font: 13px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 20px 50px rgba(31, 36, 48, 0.25);
}
dialog::backdrop { background: rgba(31, 36, 48, 0.35); }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
h2 { margin: 0; font-size: 21px; line-height: 26px; font-weight: 700; letter-spacing: -0.01em; }
.subtitle { margin: 3px 0 0; color: var(--muted); }
.icon-button { flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font-size: 20px; line-height: 1; }
.icon-button:hover { background: #eef1f6; color: var(--ink); }
.tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 16px; padding: 3px; border-radius: 8px; background: #eef1f6; }
.tab { height: 32px; border: 0; border-radius: 6px; background: transparent; color: #5b6475; font-size: 13px; font-weight: 600; }
.tab:hover { color: var(--ink); }
.tab[aria-selected="true"] { background: var(--primary); color: #fff; box-shadow: 0 1px 2px rgba(31, 36, 48, 0.18); }
.label { display: block; margin: 17px 0 3px; font-size: 12.5px; font-weight: 600; }
.label small { font-weight: 400; color: #6b7385; font-size: inherit; }
textarea { display: block; width: 100%; border: 1px solid var(--field); border-radius: 6px; background: #fff; padding: 8px 10px; font-size: 13px; }
textarea { height: 116px; resize: vertical; line-height: 19px; }
textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79, 107, 216, 0.2); }
.shot { margin-top: 17px; display: flex; gap: 12px; align-items: flex-start; }
.shot-preview { flex: none; width: 120px; height: 75px; border: 1px solid var(--line); border-radius: 6px; background: #f9fafb center / cover no-repeat; display: flex; align-items: center; justify-content: center; color: #6b7385; font-size: 11px; text-align: center; padding: 4px; }
.shot-preview a { display: block; width: 100%; height: 100%; }
.shot-preview img { width: 100%; height: 100%; object-fit: cover; object-position: top left; border-radius: 5px; }
.shot-body { min-width: 0; }
.check { display: flex; gap: 8px; align-items: center; font-size: 12.5px; font-weight: 600; }
.check input { width: 15px; height: 15px; accent-color: var(--primary); margin: 0; }
.hint { margin: 2px 0 0; font-size: 11px; color: #5b6475; }
.link { border: 0; padding: 0; background: none; color: var(--primary); font-size: 11.5px; font-weight: 600; }
.link:hover { text-decoration: underline; }
.drop { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 69px; padding: 0 12px; border: 1px dashed #c9cfda; border-radius: 6px; background: #f9fafb; text-align: center; cursor: pointer; }
.drop:hover, .drop.dragging { border-color: var(--primary); background: #eef1fb; }
.drop strong { color: var(--primary); font-size: 13px; }
.drop span { margin-top: 2px; color: var(--muted); font-size: 11px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.files { list-style: none; margin: 6px 0 0; padding: 0; }
.files li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.files .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { width: 80px; height: 4px; border-radius: 99px; background: #e3e7ee; overflow: hidden; }
.bar span { display: block; height: 100%; width: 0; background: var(--primary); transition: width 0.15s; }
.error { margin: 12px 0 0; padding: 8px 12px; border-radius: 6px; background: #fce8e6; color: #b42318; font-size: 12px; font-weight: 500; }
.foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.button { height: 35px; padding: 0 18px; border-radius: 6px; font-size: 14px; font-weight: 700; border: 1px solid var(--field); background: #fff; }
.button:hover { background: #f7f8fa; }
.button.primary { border-color: var(--primary); background: var(--primary); color: #fff; padding: 0 22px; }
.button.primary:hover { background: var(--primary-dark); }
.button:disabled { cursor: wait; opacity: 0.7; }
.sent { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 14px 8px 2px; }
.sent-close { position: absolute; top: -10px; right: -12px; }
.sent-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: #e3f4ea; color: #1f8a4c; margin-bottom: 14px; }
.sent h2 { font-size: 19px; line-height: 24px; }
.sent p { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; }
.sent p strong { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; padding: 1px 6px; border-radius: 4px; background: #eef1f6; }
.sent-actions { display: flex; gap: 8px; margin-top: 22px; }
`;
