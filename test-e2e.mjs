// End-to-end smoke test for GASH: boots the bundled shell in jsdom and drives
// the real keyboard/console path. Run with: npm test
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import * as fakeIndexedDBModule from 'fake-indexeddb';

const fakeIDB =
  fakeIndexedDBModule.indexedDB ||
  fakeIndexedDBModule.default?.indexedDB ||
  fakeIndexedDBModule.default;

const { outputFiles } = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  write: false,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});
const bundle = outputFiles[0].text;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let checks = 0;
function check(name, cond, extra = '') {
  checks++;
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` -- ${extra}` : ''}`);
  }
}

async function until(fn, timeout = 4000) {
  const start = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = undefined; }
    if (v) return v;
    if (Date.now() - start > timeout) return v;
    await sleep(25);
  }
}

function makeDom(storage = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
      <div id="tab-bar"><button id="tab-add">+</button></div>
      <div id="tab-panels"></div>
      <div id="status-bar"></div>
    </body></html>`,
    {
      url: 'http://localhost:4173/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      virtualConsole: new VirtualConsole(),
    }
  );
  const w = dom.window;
  w.indexedDB = fakeIDB;
  w.prompt = () => 'tester';
  w.alert = () => {};
  w.close = () => {};
  w.open = () => null;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(bundle);
  return dom;
}

const activePanel = (dom) => dom.window.document.querySelector('.tab-panel.active');
const consoleText = (dom) => activePanel(dom)?.querySelector('.console-output')?.textContent || '';
const promptLabel = (dom) => activePanel(dom)?.querySelector('.prompt-label')?.textContent || '';
const activeInput = (dom) => activePanel(dom)?.querySelector('.input-field');

async function run(dom, cmd, waitMs = 120) {
  const input = activeInput(dom);
  input.value = cmd;
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(waitMs);
}

function key(dom, key, opts = {}) {
  activeInput(dom).dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  );
}

function activateTab(dom, index) {
  const btns = dom.window.document.querySelectorAll('#tab-bar .tab');
  btns[index].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

// ── boot ──────────────────────────────────────────────────────────
console.log('boot');
const dom = await makeDom();
await until(() => consoleText(dom).includes('GASH v'));
check('boots and prints banner', consoleText(dom).includes('GASH v'));
check('prompt shows seeded user', promptLabel(dom) === 'tester@gashbox:~$ ', JSON.stringify(promptLabel(dom)));

// ── basic command ─────────────────────────────────────────────────
await run(dom, 'echo hello world');
check('echo works', consoleText(dom).includes('hello world'));

await run(dom, 'mkdir -p /home/tester/docs');
await run(dom, 'touch /home/tester/docs/a.txt');
check('fs commands work', consoleText(dom).includes('created directory'));

// ── "+" tab button creates a LIVE tab (was completely dead) ───────
dom.window.document.getElementById('tab-add').dispatchEvent(
  new dom.window.MouseEvent('click', { bubbles: true })
);
await sleep(50);
check('second tab opened', dom.window.document.querySelectorAll('.tab-panel').length === 2);
check('new tab prompt uses real user/home', promptLabel(dom) === 'tester@gashbox:~$ ', JSON.stringify(promptLabel(dom)));
await run(dom, 'pwd');
check('"+" tab input actually runs commands', consoleText(dom).includes('/home/tester'),
  'console: ' + JSON.stringify(consoleText(dom).slice(0, 120)));
await run(dom, 'echo second-tab-works');
check('"+" tab executes commands', consoleText(dom).includes('second-tab-works'));

// closing a tab cleans up its state instead of leaking it
dom.window.document.querySelectorAll('#tab-bar .tab')[1].querySelector('.tab-close')
  .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await sleep(30);
check('tab closes', dom.window.document.querySelectorAll('.tab-panel').length === 1);
activateTab(dom, 0);

// ── `edit` command (was documented but never registered) ──────────
await run(dom, 'edit /home/tester/notes.txt');
check('edit opens editor', promptLabel(dom).startsWith('EDIT:'), JSON.stringify(promptLabel(dom)));
await run(dom, ':a hello from edit');
await run(dom, ':wq', 200);
check('editor saved and exited', !promptLabel(dom).startsWith('EDIT:'), JSON.stringify(promptLabel(dom)));
await run(dom, 'cat /home/tester/notes.txt');
check('edited file contents persisted', consoleText(dom).includes('hello from edit'));

// ── function capture (waitingForFunction never reached the tab) ───
await run(dom, 'func create myfn');
check('func> prompt shown', promptLabel(dom) === 'func> ', JSON.stringify(promptLabel(dom)));
await run(dom, 'echo inside function');
await run(dom, 'endfunc');
check('function body captured', consoleText(dom).includes('Function "myfn" saved'));
await run(dom, 'func run myfn');
check('function runs', consoleText(dom).includes('inside function'));

// ── background jobs (jobs/fg/kill read a different object) ────────
await run(dom, 'clear');
await run(dom, 'sleep 5 &', 50);
await run(dom, 'jobs');
check('background job visible', consoleText(dom).includes('sleep 5'), JSON.stringify(consoleText(dom).slice(0, 200)));
await run(dom, 'kill 1');
check('kill terminates job', consoleText(dom).includes('terminated'));

// ── $(...) substitution must not swallow console output on error ──
await run(dom, 'clear');
await run(dom, 'echo $(definitely-not-a-command)');
await run(dom, 'echo after-subshell');
check('console not swallowed after failing $( )', consoleText(dom).includes('after-subshell'),
  JSON.stringify(consoleText(dom).slice(0, 160)));

// ── tab completion keeps the directory prefix ─────────────────────
const input = activeInput(dom);
input.value = 'cat /home/tester/doc';
key(dom, 'Tab');
await sleep(80);
check('path completion keeps directory', input.value === 'cat /home/tester/docs/',
  JSON.stringify(input.value));

// ── output is HTML-escaped (echo <img ...> was executable) ────────
await run(dom, 'echo <img src=x onerror=alert(1)');
check('no element injected by command output', !dom.window.document.querySelector('.console-output img'));
check('payload shown literally', consoleText(dom).includes('<img src=x'));

// ── package API (window.GASH) used by python.js etc. ─────────────
const gashApi = await (async () => {
  const w = dom.window;
  const out = {};
  out.hasPromptLabel = !!w.document.getElementById('prompt-label');
  out.hasInputField = !!w.document.getElementById('input-field');
  w.GASH.addToConsole('hello from package');
  out.packageConsole = consoleText(dom).includes('hello from package');

  let hooked = null;
  w.GASH.inputHook = (line) => { hooked = line; };
  await run(dom, 'print(1+1)');
  out.hookRouted = hooked === 'print(1+1)';
  const origUpdate = w.GASH._updatePrompt;
  w.GASH._updatePrompt = function () {
    if (w.GASH.inputHook) {
      w.document.getElementById('prompt-label').textContent = '>>> ';
    } else {
      origUpdate.call(w.GASH);
    }
    const inp = w.document.getElementById('input-field');
    if (inp && w.document.activeElement !== inp) inp.focus();
  };
  try {
    w.GASH._updatePrompt();          // the exact pattern python.js uses
    out.wrapperOk = promptLabel(dom) === '>>> ';
  } catch (e) {
    out.wrapperOk = false;
    out.err = e.message;
  }
  w.GASH.inputHook = null;
  w.GASH._updatePrompt = origUpdate;
  w.GASH._updatePrompt();
  out.labelRestored = promptLabel(dom) !== '>>> ';
  return out;
})();
check('GASH.addToConsole targets active tab', gashApi.packageConsole);
check('GASH.inputHook routes input (python REPL / ssh)', gashApi.hookRouted, JSON.stringify(gashApi));
check('prompt-label id exists for packages', gashApi.hasPromptLabel && gashApi.hasInputField);
check('package prompt wrapper runs without crashing', gashApi.wrapperOk, gashApi.err || '');
check('prompt restored after hook cleared', gashApi.labelRestored);

// ── history persists across reload ────────────────────────────────
const saved = {};
for (let i = 0; i < dom.window.localStorage.length; i++) {
  const k = dom.window.localStorage.key(i);
  saved[k] = dom.window.localStorage.getItem(k);
}
check('history written to storage', (saved.gashHistory || '').includes('echo hello world'));
const dom2 = await makeDom(saved);
await until(() => consoleText(dom2).includes('GASH v'));
await run(dom2, 'history');
check('history restored after reload', consoleText(dom2).includes('echo hello world'));

// ── localstr wipe confirmation (waitingForFunction object path) ───
await run(dom, 'localstr wipe');
const m = consoleText(dom).match(/Type '([a-z0-9]+)' to confirm/);
check('wipe asks for confirmation', !!m, JSON.stringify(consoleText(dom).slice(-160)));
if (m) {
  await run(dom, m[1]);
  check('wipe accepts correct code', consoleText(dom).includes('Local storage wiped!'));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
