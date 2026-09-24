import type { VirtualFileSystem } from './filesystem';

export interface GashConfig {
  theme: string;
  prompt: string;
}

export interface CommandHandler {
  (args: string[], ctx: GashContext): Promise<string | null> | string | null;
}

export interface CommandEntry {
  handler: CommandHandler;
  help: string;
  category: string;
}

export interface Job {
  id: number;
  command: string;
  status: string;
  timestamp: number;
  promise?: Promise<string | null>;
}

export interface PackageInfo {
  code: string;
  url: string;
  installed: number;
  author?: string;
  version?: string;
  description?: string;
}

export interface GashContext {
  fs: VirtualFileSystem;
  vars: Record<string, string>;
  aliases: Record<string, string>;
  config: GashConfig;
  history: string[];
  socket: WebSocket | null;
  gashFunctions: Record<string, string[]>;
  gashPackages: Record<string, PackageInfo>;
  waitingForFunction: string | { type: string; code: string } | null;
  pipeInput: string | null;
  editor: any;
  editorMode: boolean;
  addToConsole: (text: string, cls?: string) => void;
  processCommand: (input: string) => Promise<void>;
  processCommandSync: (input: string) => string;
  _saveFunctions: () => void;
  _savePackages: () => void;
  _saveAliases: () => void;
  _saveConfig: () => void;
  _clearConsole: () => void;
  _updatePrompt: () => void;
  hostname: string;
}

export interface GashState {
  version: string;
  vars: Record<string, string>;
  aliases: Record<string, string>;
  config: GashConfig;
  history: string[];
  historyIndex: number;
  socket: WebSocket | null;
  waitingForFunction: string | { type: string; code: string } | null;
  gashFunctions: Record<string, string[]>;
  gashPackages: Record<string, PackageInfo>;
  editorMode: boolean;
  filteredHistory: string[];
  historySearchMode: boolean;
  historySearchQuery: string;
  jobs: Record<number, Job>;
  nextJobId: number;
  hostname: string;
  fs: VirtualFileSystem | null;
  inputHook: ((line: string) => void | Promise<void>) | null;
  editor: any;
  _cronTimers: Record<string, number>;
  _cronInterval: ReturnType<typeof setInterval> | undefined;
  addToConsole: (text: string, cls?: string) => void;
  _clearConsole: () => void;
  _updatePrompt: () => void;
  _saveFunctions: () => void;
  _savePackages: () => void;
  _saveAliases: () => void;
  _saveConfig: () => void;
  _saveHistory: () => void;
  _loadState: () => void;
  expandVars: (text: string) => string;
  _execSubCommand: (cmd: string) => string;
  processCommand: (input: string) => Promise<void>;
  processCommandSync: (input: string) => string;
  init: () => Promise<void>;
  _startCron: () => void;
}

export class CommandRegistry {
  commands: Record<string, CommandEntry> = {};
  commandCategories: Record<string, string[]> = {};

  register(name: string | string[], handler: CommandHandler, help: string, category: string): void {
    const names = Array.isArray(name) ? name : [name];
    const cat = category || 'util';
    for (const n of names) {
      this.commands[n] = { handler, help: help || '', category: cat };
    }
    if (!this.commandCategories[cat]) this.commandCategories[cat] = [];
    for (const n of names) {
      if (!this.commandCategories[cat].includes(n)) this.commandCategories[cat].push(n);
    }
  }
}
