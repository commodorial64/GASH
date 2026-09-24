import type { GashContext, GashState } from './types';
import type { CommandRegistry } from './types';
import type { VirtualFileSystem } from './filesystem';

export function makeCtx(
  state: GashState,
  reg: CommandRegistry,
  pipeInput: string | null,
  processCmd: (input: string) => Promise<void>,
  processCmdSync: (input: string) => string
): GashContext {
  return {
    fs: state.fs!,
    vars: state.vars,
    aliases: state.aliases,
    config: state.config,
    history: state.history,
    socket: state.socket,
    gashFunctions: state.gashFunctions,
    gashPackages: state.gashPackages,
    get waitingForFunction() { return state.waitingForFunction; },
    set waitingForFunction(v) { state.waitingForFunction = v; },
    pipeInput,
    editor: state.editor,
    get editorMode(): boolean { return state.editorMode; },
    set editorMode(v: boolean) { state.editorMode = v; },
    addToConsole: state.addToConsole,
    processCommand: processCmd,
    processCommandSync: processCmdSync,
    _saveFunctions: state._saveFunctions,
    _savePackages: state._savePackages,
    _saveAliases: state._saveAliases,
    _saveConfig: state._saveConfig,
    _clearConsole: state._clearConsole,
    _updatePrompt: state._updatePrompt,
    hostname: state.hostname
  };
}
