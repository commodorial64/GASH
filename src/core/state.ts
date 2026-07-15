import type { GashConfig, PackageInfo } from './types';
import type { VirtualFileSystem } from './filesystem';

const DEFAULT_CONFIG: GashConfig = { theme: 'default', prompt: 'GASH' };

export interface GashStateData {
  vars: Record<string, string>;
  aliases: Record<string, string>;
  config: GashConfig;
  history: string[];
  gashFunctions: Record<string, string[]>;
  gashPackages: Record<string, PackageInfo>;
  hostname: string;
}

export function createDefaultState(): GashStateData {
  return {
    vars: {
      PWD: '/',
      HOME: '/',
      USER: 'gashuser',
      SHELL: 'GASH',
      _intHeaders: '{}'
    },
    aliases: {},
    config: { ...DEFAULT_CONFIG },
    history: [],
    gashFunctions: {},
    gashPackages: {},
    hostname: 'gashbox'
  };
}

export function loadState(): Partial<GashStateData> {
  const state: Partial<GashStateData> = {};

  try {
    const fns = localStorage.getItem('gashFunctions');
    if (fns) state.gashFunctions = JSON.parse(fns);
  } catch { /* ignore */ }

  try {
    const pkgs = localStorage.getItem('gashPackages');
    if (pkgs) state.gashPackages = JSON.parse(pkgs);
  } catch { /* ignore */ }

  try {
    const als = localStorage.getItem('gashAliases');
    if (als) state.aliases = JSON.parse(als);
  } catch { /* ignore */ }

  try {
    const cfg = localStorage.getItem('gashConfig');
    if (cfg) {
      state.config = JSON.parse(cfg);
      if (state.config!.theme && state.config!.theme !== 'default') {
        document.body.className = 'theme-' + state.config!.theme;
      }
    }
  } catch { /* ignore */ }

  try {
    const hist = localStorage.getItem('gashHistory');
    if (hist) state.history = JSON.parse(hist);
  } catch { /* ignore */ }

  return state;
}

export function saveFunctions(fns: Record<string, string[]>): void {
  try { localStorage.setItem('gashFunctions', JSON.stringify(fns)); } catch { /* ignore */ }
}

export function savePackages(pkgs: Record<string, PackageInfo>): void {
  try { localStorage.setItem('gashPackages', JSON.stringify(pkgs)); } catch { /* ignore */ }
}

export function saveAliases(aliases: Record<string, string>): void {
  try { localStorage.setItem('gashAliases', JSON.stringify(aliases)); } catch { /* ignore */ }
}

export function saveConfig(config: GashConfig): void {
  try { localStorage.setItem('gashConfig', JSON.stringify(config)); } catch { /* ignore */ }
}

export function saveHistory(history: string[]): void {
  try {
    const trimmed = history.length > 500 ? history.slice(-500) : history;
    localStorage.setItem('gashHistory', JSON.stringify(trimmed));
  } catch { /* ignore */ }
}
