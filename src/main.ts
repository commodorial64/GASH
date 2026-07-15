import './gash.css';
import { VirtualFileSystem } from './core/filesystem';
import { CommandRegistry } from './core/types';
import { Editor } from './core/editor';
import { registerAllCommands } from './core/commands';
import { createProcessCommand, createProcessCommandSync, expandVars } from './core/shell-parser';
import {
  loadState, saveFunctions, savePackages,
  saveAliases, saveConfig, saveHistory
} from './core/state';
import { TabManager, TabState } from './core/tabs';

const VERSION = '2.1.0';

const reg = new CommandRegistry();
const editor = new Editor();
const tabManager = new TabManager(editor, VERSION);

// ─── GLOBAL SHARED STATE ────────────────────────────────────────

let fs: VirtualFileSystem | null = null;
const aliases: Record<string, string> = {};
const config = { theme: 'default', prompt: 'GASH' };
const gashFunctions: Record<string, string[]> = {};
const gashPackages: Record<string, any> = {};
const hostname = 'gashbox';
const cronTimers: Record<string, number> = {};
let cronInterval: ReturnType<typeof setInterval> | undefined;
let globalNextJobId = 1;

// Load persisted state
const loaded = loadState();
if (loaded.gashFunctions) Object.assign(gashFunctions, loaded.gashFunctions);
if (loaded.gashPackages) Object.assign(gashPackages, loaded.gashPackages);
if (loaded.aliases) Object.assign(aliases, loaded.aliases);
if (loaded.config) Object.assign(config, loaded.config);

// ─── PER-TAB STATE CREATION ─────────────────────────────────────

const tabStates = new Map<number, any>();

function getTabState(tab: TabState): any {
  if (tabStates.has(tab.id)) return tabStates.get(tab.id);

  const state: any = {
    version: VERSION,
    vars: tab.vars,
    aliases,
    config,
    history: tab.history,
    historyIndex: tab.history.length,
    socket: null,
    waitingForFunction: null,
    gashFunctions,
    gashPackages,
    editorMode: false,
    filteredHistory: [],
    historySearchMode: false,
    historySearchQuery: '',
    jobs: {},
    get nextJobId() { return globalNextJobId; },
    set nextJobId(v: number) { globalNextJobId = v; },
    hostname,
    fs,
    inputHook: null,
    editor,
    _cronTimers: cronTimers,
    _cronInterval: cronInterval,

    addToConsole: tab.addToConsole,
    _clearConsole: tab._clearConsole,
    _updatePrompt: tab._updatePrompt,
    _saveFunctions: () => saveFunctions(gashFunctions),
    _savePackages: () => savePackages(gashPackages),
    _saveAliases: () => saveAliases(aliases),
    _saveConfig: () => saveConfig(config),
    _saveHistory: () => saveHistory(tab.history),
    _loadState: () => {},
    expandVars: (text: string) => text,
    _execSubCommand: (_cmd: string) => '',
    processCommand: async () => {},
    processCommandSync: (_input: string) => '',
    init: async () => {},
    _startCron: () => {},
  };

  const processCommandFn = createProcessCommand(state, reg);
  const processCommandSyncFn = createProcessCommandSync(state, reg);
  state.processCommand = processCommandFn;
  state.processCommandSync = processCommandSyncFn;
  state.expandVars = (text: string) => expandVars(text, state.vars, state._execSubCommand);
  state._execSubCommand = (cmd: string) => {
    try {
      let result = '';
      const oldAddToConsole = state.addToConsole;
      state.addToConsole = (text: string) => { result += text.replace(/^> ?/gm, '') + '\n'; };
      processCommandSyncFn(cmd);
      state.addToConsole = oldAddToConsole;
      return result.trim();
    } catch {
      return '';
    }
  };

  tabStates.set(tab.id, state);
  return state;
}

// ─── TAB INPUT EVENT SETUP ──────────────────────────────────────

function setupTabInput(tab: TabState): void {
  const inputEl = tab.inputEl;
  const state = getTabState(tab);
  let tabSuggestions: string[] = [];
  let tabIndex = 0;

  function getTabCompletions(prefix: string): string[] {
    if (!prefix) return [];
    const commands = Object.keys(reg.commands);
    const matches = commands.filter(c => c.startsWith(prefix.toLowerCase()));
    if (matches.length === 0 && fs && fs.ready) {
      const savedCwd = fs.cwd;
      fs.cwd = tab.vars.PWD;
      const normalized = fs.normalizePath(prefix);
      fs.cwd = savedCwd;
      const parent = normalized.split('/').slice(0, -1).join('/') || '/';
      const partial = normalized.split('/').pop() || '';
      fs.cwd = tab.vars.PWD;
      fs.readdir(parent).then(entries => {
        fs!.cwd = savedCwd;
        const fileMatches = entries.map(e => e.name).filter(name => name.startsWith(partial));
        if (fileMatches.length > 0) {
          showTabSuggestions(fileMatches);
        }
      }).catch(() => { fs!.cwd = savedCwd; });
    }
    return matches;
  }

  function showTabSuggestions(suggestions: string[]): void {
    if (!suggestions || suggestions.length === 0) return;
    tabSuggestions = suggestions;
    tabIndex = 0;
    if (suggestions.length === 1) {
      completeWith(suggestions[0]);
      tabSuggestions = [];
    } else {
      tab.addToConsole('> ' + suggestions.join('  '), 'help-output');
    }
  }

  function completeWith(completion: string): void {
    const words = inputEl.value.split(' ');
    words[words.length - 1] = completion + ' ';
    inputEl.value = words.join(' ');
    const len = inputEl.value.length;
    inputEl.setSelectionRange(len, len);
    tabSuggestions = [];
  }

  inputEl.addEventListener('input', () => {
    if (tab.historySearchMode) {
      tab.historySearchQuery = inputEl.value;
      if (tab.historySearchQuery) {
        tab.filteredHistory = tab.history.filter(cmd =>
          cmd.toLowerCase().includes(tab.historySearchQuery.toLowerCase())
        );
      } else {
        tab.filteredHistory = [];
      }
    }
  });

  inputEl.addEventListener('keydown', async (event: KeyboardEvent) => {
    const key = event.key;

    if (tab.editorMode) {
      if (key === 'Enter') {
        event.preventDefault();
        const val = inputEl.value;
        inputEl.value = '';
        const result = editor.processCommand(val);
        if (result) {
          if (result.saveAndContinue) {
            await editor.save(fs!);
            tab.addToConsole(`> saved ${editor.filename}`);
            tab._updatePrompt();
          } else if (result.saveAndQuit) {
            await editor.save(fs!);
            tab.addToConsole(`> saved and closed ${editor.filename}`);
            editor.active = false;
            tab.editorMode = false;
            tab._updatePrompt();
          } else if (!result.stayOpen) {
            editor.active = false;
            tab.editorMode = false;
            tab._updatePrompt();
          }
          if (result.output) {
            tab.addToConsole(result.output);
          }
        }
      }
      return;
    }

    if (tab.inputHook) {
      if (key === 'Enter') {
        event.preventDefault();
        const val = inputEl.value.trim();
        inputEl.value = '';
        tabSuggestions = [];
        if (val) await tab.inputHook(val);
      }
      if (key === 'Escape') {
        event.preventDefault();
        inputEl.value = '';
        tab.addToConsole('> Type exit() to quit current mode');
      }
      return;
    }

    if (tab.historySearchMode) {
      if (key === 'Enter') {
        event.preventDefault();
        tab.historySearchMode = false;
        const cmd = tab.filteredHistory.length > 0 ? tab.filteredHistory[0] : inputEl.value;
        inputEl.value = '';
        tab._updatePrompt();
        if (cmd.trim()) {
          tab.addToConsole(cmd.trim());
          await state.processCommand(cmd.trim());
        }
        return;
      }
      if (key === 'Escape') {
        tab.historySearchMode = false;
        tab.historySearchQuery = '';
        inputEl.value = '';
        tab._updatePrompt();
        return;
      }
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      const val = inputEl.value.trim();
      inputEl.value = '';
      tabSuggestions = [];

      if (tab.waitingForFunction) {
        if (typeof tab.waitingForFunction === 'object' && tab.waitingForFunction.type === 'wipe') {
          if (val === tab.waitingForFunction.code) {
            localStorage.clear();
            tab.addToConsole('> Local storage wiped!');
          } else if (val === 'no') {
            tab.addToConsole('> Wipe cancelled.');
          } else {
            tab.addToConsole('> Invalid confirmation. Wipe cancelled.');
          }
          tab.waitingForFunction = null;
        } else if (val === 'endfunc') {
          tab.addToConsole(`> Function "${tab.waitingForFunction}" saved.`);
          saveFunctions(gashFunctions);
          tab.waitingForFunction = null;
        } else {
          gashFunctions[tab.waitingForFunction as string].push(val);
        }
        tab._updatePrompt();
        return;
      }

      if (val) {
        tab.addToConsole(val);
        await state.processCommand(val);
      }
      return;
    }

    if (key === 'Tab') {
      event.preventDefault();
      const words = inputEl.value.split(' ');
      const prefix = words[words.length - 1];
      const matches = getTabCompletions(prefix);
      if (matches.length === 1) {
        words[words.length - 1] = matches[0] + ' ';
        inputEl.value = words.join(' ');
        const len = inputEl.value.length;
        inputEl.setSelectionRange(len, len);
      } else if (matches.length > 1) {
        tabSuggestions = matches;
        tabIndex = (tabIndex + 1) % matches.length;
        tab.addToConsole('> ' + matches.join('  '), 'help-output');
      }
      return;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      if (tab.history.length > 0) {
        if (state.historyIndex > 0) state.historyIndex--;
        inputEl.value = tab.history[state.historyIndex] || '';
        const len = inputEl.value.length;
        inputEl.setSelectionRange(len, len);
      }
      return;
    }

    if (key === 'ArrowDown') {
      event.preventDefault();
      if (state.historyIndex < tab.history.length - 1) {
        state.historyIndex++;
        inputEl.value = tab.history[state.historyIndex] || '';
      } else {
        state.historyIndex = tab.history.length;
        inputEl.value = '';
      }
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
      return;
    }

    if ((key === 'r' || key === 'R') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      tab.historySearchMode = true;
      tab.historySearchQuery = '';
      tab.filteredHistory = [];
      inputEl.value = '';
      tab.addToConsole('> (history search) type to search...');
      tab._updatePrompt();
      return;
    }

    if (key === 't' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const newTab = tabManager.createTab();
      tabManager.switchTab(newTab.id);
      setupTabInput(newTab);
      return;
    }

    if (key === 'w' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (tabManager.getTabCount() > 1) {
        tabManager.closeTab(tab.id);
      }
      return;
    }
  });

  tab.panel.addEventListener('click', () => {
    inputEl.focus();
  });
}

// ─── REGISTER COMMANDS ──────────────────────────────────────────

registerAllCommands(reg, {
  jobs: {},
  version: VERSION,
  inputHook: null
});

// ─── EDITOR CLOSE CALLBACK ──────────────────────────────────────

editor.setCloseCallback(() => {
  const activeTab = tabManager.getActiveTab();
  if (activeTab) {
    activeTab.editorMode = false;
    activeTab._updatePrompt();
  }
});

// ─── INITIALIZATION ─────────────────────────────────────────────

async function init() {
  fs = new VirtualFileSystem();
  try {
    await fs.init();
  } catch (err) {
    console.error('VFS init error:', err);
  }

  let needsSetup = false;
  try { needsSetup = !(await fs.exists('/etc/passwd')); }
  catch { needsSetup = true; }

  let username = 'gashuser';

  if (needsSetup) {
    username = prompt('Enter username:', 'gashuser') || 'gashuser';
    const rootPass = prompt('Set root password:', 'root') || 'root';
    await fs.populateDefaultStructure(username, rootPass);
    localStorage.setItem('gashUser', username);
    localStorage.setItem('gashRootHash', btoa(rootPass));
  } else {
    username = localStorage.getItem('gashUser') || 'gashuser';
  }

  try {
    const sysEntries = await fs.readdir('/sys/bin');
    for (const e of sysEntries) {
      if (e.type === 'file' && e.name.endsWith('.js')) {
        const pkgName = e.name.slice(0, -3);
        if (!gashPackages[pkgName]) {
          const code = await fs.readFile('/sys/bin/' + e.name);
          gashPackages[pkgName] = { code, url: '/sys/bin/' + e.name, installed: Date.now() };
        }
      }
    }
  } catch { /* /sys/bin not ready yet */ }

  const firstTab = tabManager.createTab();
  firstTab.vars.USER = username;
  firstTab.vars.HOME = '/home/' + username;
  fs.cwd = '/home/' + username;
  firstTab.vars.PWD = '/home/' + username;

  const tabState = getTabState(firstTab);
  setupTabInput(firstTab);

  const gashGlobal = {
    register: reg.register.bind(reg),
    commands: reg.commands,
    commandCategories: reg.commandCategories,
    addToConsole: firstTab.addToConsole,
    version: VERSION,
    Editor
  };
  (window as any).GASH = gashGlobal;

  let pkgCount = 0;
  for (const pn in gashPackages) {
    try {
      const fn = new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', gashPackages[pn].code);
      fn(gashGlobal, tabState, [], console, document, window);
      pkgCount++;
    } catch (e) {
      console.error('Package re-execution failed:', pn, e);
    }
  }

  firstTab._clearConsole();
  firstTab._updatePrompt();
  firstTab.addToConsole('> \ud83d\udfe2 GASH v' + VERSION + ' loaded. Virtual filesystem ready.');
  if (pkgCount > 0) firstTab.addToConsole('> \ud83d\udce6 ' + pkgCount + ' package(s) loaded.');
  firstTab.addToConsole('> Type "help" to get started.');
  firstTab.addToConsole('> Press Ctrl+T for new tab, Ctrl+W to close tab.');

  startCron();
}

function startCron() {
  if (cronInterval) return;
  cronInterval = setInterval(async () => {
    if (!fs || !fs.ready) return;
    try {
      const entries = await fs.readdir('/var/spool/cron');
      for (const e of entries) {
        if (e.type !== 'file') continue;
        const content = await fs.readFile('/var/spool/cron/' + e.name);
        const parts = content.split(' ');
        const interval = parseInt(parts[0]);
        if (isNaN(interval) || interval < 1) continue;
        const cmd = parts.slice(1).join(' ');
        const lastRun = cronTimers[e.name] || 0;
        const now = Date.now();
        if (now - lastRun >= interval * 1000) {
          cronTimers[e.name] = now;
          const activeTab = tabManager.getActiveTab();
          if (activeTab) {
            const state = getTabState(activeTab);
            await state.processCommand(cmd);
          }
        }
      }
    } catch { /* /var/spool/cron may not exist */ }
  }, 5000);
}

// ─── START ──────────────────────────────────────────────────────

init().catch(err => {
  console.error('GASH init error:', err);
});
