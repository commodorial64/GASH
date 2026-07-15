import type { GashState, CommandRegistry } from './types';
import type { VirtualFileSystem } from './filesystem';
import { makeCtx } from './context';

interface Token {
  type: string;
  value: string;
}

interface Segment {
  args: string[];
  redirects: { op: string; target: string | null }[];
  background?: boolean;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let current = '';
  let inSingle = false;
  let inDouble = false;

  while (i < input.length) {
    const c = input[i];

    if (inSingle) {
      if (c === "'") { inSingle = false; }
      else { current += c; }
    } else if (inDouble) {
      if (c === '"') { inDouble = false; }
      else if (c === '\\') { current += input[i + 1] || ''; i++; }
      else { current += c; }
    } else if (c === "'") {
      inSingle = true;
    } else if (c === '"') {
      inDouble = true;
    } else if (c === '|' || c === '>' || c === ';' || c === '&') {
      if (current.trim()) {
        tokens.push({ type: 'text', value: current.trim() });
      }
      if (c === '|') {
        if (i + 1 < input.length && input[i + 1] === '|') {
          tokens.push({ type: 'or', value: '||' });
          i++;
        } else {
          tokens.push({ type: 'pipe', value: '|' });
        }
      } else if (c === '>') {
        if (i + 1 < input.length && input[i + 1] === '>') {
          tokens.push({ type: 'redirect', value: '>>' });
          i++;
        } else {
          tokens.push({ type: 'redirect', value: '>' });
        }
      } else if (c === ';') {
        tokens.push({ type: 'semicolon', value: ';' });
      } else if (c === '&') {
        if (i + 1 < input.length && input[i + 1] === '&') {
          tokens.push({ type: 'and', value: '&&' });
          i++;
        } else {
          tokens.push({ type: 'background', value: '&' });
        }
      }
      current = '';
    } else if (c === ' ' || c === '\t') {
      if (current.trim()) {
        tokens.push({ type: 'text', value: current.trim() });
      }
      current = '';
    } else {
      current += c;
    }
    i++;
  }

  if (current.trim()) {
    tokens.push({ type: 'text', value: current.trim() });
  }

  return tokens;
}

function findMatchingParen(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function expandInner(text: string, vars: Record<string, string>, execSub: (cmd: string) => string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && i + 1 < text.length) {
      if (text[i + 1] === '(') {
        const end = findMatchingParen(text, i + 1);
        if (end !== -1) {
          const subCmd = text.slice(i + 2, end);
          result += execSub(subCmd);
          i = end + 1;
        } else { result += text[i]; i++; }
      } else if (text[i + 1] === '{') {
        const end = text.indexOf('}', i + 2);
        if (end !== -1) {
          const varName = text.slice(i + 2, end);
          result += vars[varName] !== undefined ? vars[varName] : '';
          i = end + 1;
        } else { result += text[i]; i++; }
      } else {
        let end = i + 1;
        while (end < text.length && /\w/.test(text[end])) end++;
        const varName = text.slice(i + 1, end);
        result += vars[varName] !== undefined ? vars[varName] : '';
        i = end;
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

export function expandVars(text: string, vars: Record<string, string>, execSub: (cmd: string) => string): string {
  if (!text || text.includes("'")) {
    let result = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === "'") {
        const end = text.indexOf("'", i + 1);
        if (end === -1) { result += text.slice(i); break; }
        result += text.slice(i + 1, end);
        i = end + 1;
      } else if (text[i] === '"') {
        const end = text.indexOf('"', i + 1);
        if (end === -1) { result += expandInner(text.slice(i + 1), vars, execSub); break; }
        result += expandInner(text.slice(i + 1, end), vars, execSub);
        i = end + 1;
      } else if (text[i] === '$' && i + 1 < text.length) {
        if (text[i + 1] === '(') {
          const end = findMatchingParen(text, i + 1);
          if (end !== -1) {
            result += execSub(text.slice(i + 2, end));
            i = end + 1;
          } else { result += text[i]; i++; }
        } else if (text[i + 1] === '{') {
          const end = text.indexOf('}', i + 2);
          if (end !== -1) {
            const varName = text.slice(i + 2, end);
            result += vars[varName] !== undefined ? vars[varName] : '';
            i = end + 1;
          } else { result += text[i]; i++; }
        } else {
          let end = i + 1;
          while (end < text.length && /\w/.test(text[end])) end++;
          const varName = text.slice(i + 1, end);
          result += vars[varName] !== undefined ? vars[varName] : '';
          i = end;
        }
      } else {
        result += text[i];
        i++;
      }
    }
    return result;
  }
  return expandInner(text, vars, execSub);
}

interface PipelineGroup {
  segments: Segment[];
}

function parsePipelineInternal(input: string, vars: Record<string, string>, execSub: (cmd: string) => string): { groups: PipelineGroup[]; connectors: string[] } {
  const expanded = expandVars(input, vars, execSub);
  const tokens = tokenize(expanded);

  const groups: PipelineGroup[] = [];
  const connectors: string[] = [];
  let curPipe: Segment[] = [];
  let curSeg: Segment = { args: [], redirects: [] };

  function flushSeg(): void {
    if (curSeg.args.length || curSeg.redirects.length) {
      curPipe.push({ args: curSeg.args, redirects: curSeg.redirects });
      curSeg = { args: [], redirects: [] };
    }
  }

  function flushGroup(): void {
    flushSeg();
    if (curPipe.length) {
      groups.push({ segments: curPipe });
      curPipe = [];
    }
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti];
    if (t.type === 'text') {
      const redirs = curSeg.redirects;
      if (redirs.length && redirs[redirs.length - 1].target === null) {
        redirs[redirs.length - 1].target = t.value;
      } else {
        curSeg.args.push(t.value);
      }
    } else if (t.type === 'pipe') {
      flushSeg();
    } else if (t.type === 'redirect') {
      curSeg.redirects.push({ op: t.value, target: null });
    } else if (t.type === 'semicolon') {
      flushGroup();
      connectors.push(';');
    } else if (t.type === 'and') {
      flushGroup();
      connectors.push('&&');
    } else if (t.type === 'or') {
      flushGroup();
      connectors.push('||');
    } else if (t.type === 'background') {
      flushSeg();
      if (curPipe.length) {
        curPipe[curPipe.length - 1].background = true;
      }
      flushGroup();
      connectors.push('&');
    }
  }

  flushGroup();

  return { groups, connectors };
}

async function execPipeline(
  pipeline: Segment[],
  initialInput: string | null,
  state: GashState,
  reg: CommandRegistry,
  processCmd: (input: string) => Promise<void>,
  processCmdSync: (input: string) => string
): Promise<string | null> {
  let pipeOutput = initialInput;
  for (let si = 0; si < pipeline.length; si++) {
    const seg = pipeline[si];
    const args = seg.args;
    const redirects = seg.redirects;
    if (!args.length) { pipeOutput = pipeOutput || ''; continue; }

    if (state.fs) state.fs.cwd = state.vars.PWD;

    let cmdName = args[0].toLowerCase();
    if (state.aliases[cmdName]) {
      const aliasCmd = state.aliases[cmdName];
      cmdName = aliasCmd.split(/\s+/)[0].toLowerCase();
      args.splice(0, 1, ...aliasCmd.split(/\s+/).slice(1));
    }

    const cmdEntry = reg.commands[cmdName];
    if (!cmdEntry) {
      pipeOutput = 'error: unknown command: ' + cmdName;
      continue;
    }

    const ctx = makeCtx(state, reg, pipeOutput, processCmd, processCmdSync);
    let output: string | null;
    try {
      output = await cmdEntry.handler(args.slice(1), ctx);
      state.socket = ctx.socket;
      state.waitingForFunction = ctx.waitingForFunction;
    } catch (err: any) {
      output = 'error: ' + err.message;
    }

    pipeOutput = output !== null
      ? (typeof output === 'string' ? output.replace(/^> ?/gm, '').trim() : '')
      : null;

    for (let ri = 0; ri < redirects.length; ri++) {
      const redir = redirects[ri];
      if (redir.target && pipeOutput != null && state.fs) {
        try {
          const p = state.fs.normalizePath(redir.target);
          if (redir.op === '>') await state.fs.writeFile(p, pipeOutput);
          else if (redir.op === '>>') {
            let exist = '';
            try { exist = await state.fs.readFile(p); } catch { /* ignore */ }
            await state.fs.writeFile(p, exist + pipeOutput);
          }
          pipeOutput = null;
        } catch (e: any) {
          state.addToConsole('> redirect error: ' + e.message, 'error-output');
        }
      }
    }
  }
  return pipeOutput;
}

export function createProcessCommand(state: GashState, reg: CommandRegistry): (input: string) => Promise<void> {
  return async function processCommand(input: string): Promise<void> {
    if (!input || !input.trim()) return;

    state.history.push(input);
    state.historyIndex = state.history.length;
    saveHistory(state.history);

    const execSub = (cmd: string) => state._execSubCommand(cmd);
    const parsed = parsePipelineInternal(input, state.vars, execSub);
    const { groups, connectors } = parsed;

    let lastError = false;

    for (let gi = 0; gi < groups.length; gi++) {
      const pipeline = groups[gi].segments;

      if (gi > 0) {
        const prevConn = connectors[gi - 1];
        if (prevConn === '&&' && lastError) continue;
        if (prevConn === '||' && !lastError) continue;
      }

      const isBg = pipeline.some(s => s.background);
      const connector = gi < connectors.length ? connectors[gi] : null;

      if (isBg) {
        const jobId = state.nextJobId++;
        const cmdText = pipeline.map(s => s.args.join(' ')).join(' | ');
        const job: any = { id: jobId, command: cmdText, status: 'running', timestamp: Date.now() };
        state.jobs[jobId] = job;
        job.promise = execPipeline(pipeline, null, state, reg, createProcessCommand(state, reg), createProcessCommandSync(state, reg)).then((out: string | null) => {
          job.status = 'done';
          if (out != null) state.addToConsole('[job ' + jobId + '] ' + out);
          return out;
        }).catch(err => {
          job.status = 'failed';
          state.addToConsole('[job ' + jobId + '] error: ' + err.message, 'error-output');
        });
        lastError = false;
        if (connector === '&') continue;
      } else {
        const result = await execPipeline(pipeline, null, state, reg, createProcessCommand(state, reg), createProcessCommandSync(state, reg));
        lastError = !!(result && result.startsWith('error:'));

        if (gi === groups.length - 1 && result != null) {
          const cls = lastError ? 'error-output' : '';
          state.addToConsole('> ' + result, cls);
        } else if (groups.length === 1 && result != null && connector !== '|') {
          const cls2 = lastError ? 'error-output' : '';
          state.addToConsole('> ' + result, cls2);
        }

        if (connector === '&') continue;
      }
    }
  };
}

function saveHistory(history: string[]): void {
  try {
    const trimmed = history.length > 500 ? history.slice(-500) : history;
    localStorage.setItem('gashHistory', JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function createProcessCommandSync(state: GashState, reg: CommandRegistry): (input: string) => string {
  return function processCommandSync(input: string): string {
    const execSub = (cmd: string) => state._execSubCommand(cmd);
    const parsed = parsePipelineInternal(input, state.vars, execSub);
    const { groups, connectors } = parsed;
    let pipeOutput: string | null = null;
    let lastError = false;

    for (let gi = 0; gi < groups.length; gi++) {
      const pipeline = groups[gi].segments;
      if (gi > 0) {
        const prevConn = connectors[gi - 1];
        if (prevConn === '&&' && lastError) continue;
        if (prevConn === '||' && !lastError) continue;
      }
      if (pipeline.some(s => s.background)) continue;

      for (let si = 0; si < pipeline.length; si++) {
        const seg = pipeline[si];
        const args = seg.args;
        if (!args.length) continue;

        if (state.fs) state.fs.cwd = state.vars.PWD;

        let cmdName = args[0].toLowerCase();
        if (state.aliases[cmdName]) {
          cmdName = state.aliases[cmdName].split(/\s+/)[0].toLowerCase();
        }

        const cmdEntry = reg.commands[cmdName];
        if (!cmdEntry) { pipeOutput = 'error: unknown command: ' + cmdName; lastError = true; continue; }

        const ctx = makeCtx(state, reg, pipeOutput, createProcessCommand(state, reg), createProcessCommandSync(state, reg));

        const result = cmdEntry.handler(args.slice(1), ctx);
        if (result && typeof (result as any).then === 'function') {
          pipeOutput = '';
        } else if (result !== null) {
          pipeOutput = typeof result === 'string' ? (result as string).replace(/^> ?/gm, '').trim() : '';
        } else { pipeOutput = null; }
        lastError = !!(pipeOutput && pipeOutput.startsWith('error:'));
      }
    }

    return pipeOutput || '';
  };
}
