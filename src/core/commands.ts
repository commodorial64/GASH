import type { CommandRegistry, CommandHandler, Job, GashContext } from './types';

const VERSION = '2.1.0';

export interface GashRuntime {
  jobs: Record<number, Job>;
  version: string;
  inputHook: ((line: string) => void | Promise<void>) | null;
  hookLabel?: string;
}

const REGISTRY_URL = 'https://raw.githubusercontent.com/galaxyg144/GASH/main/packages/registry.json';

// ─── HELP STRINGS ─────────────────────────────────────────────────

const HELP_FS = `File System Commands:
  ls [path]        - List directory contents
  cd <path>        - Change directory
  pwd              - Print working directory
  mkdir <path>     - Create directory
  touch <path>     - Create empty file
  cat <path>       - Display file contents
  rm [-r] <path>   - Remove file (-r for recursive)
  rmdir <path>     - Remove empty directory
  mv <src> <dest>  - Move/rename file
  cp <src> <dest>  - Copy file
  write <path> <content> - Write text to file
  find <path> <pat> - Find files matching pattern
  tree [path]      - Show directory tree`;

const HELP_TEXT = `Text Processing Commands (supports piping):
  head [-n N] [path] - Show first N lines (default 10)
  tail [-n N] [path] - Show last N lines (default 10)
  wc [path]          - Word/line/char count
  sort               - Sort lines (piped input)
  uniq               - Unique lines (piped input)
  grep <pattern> [path] - Search for pattern
  reverse <text>     - Reverse text
  tr <from> <to>     - Translate characters
  cut -d<delim> -f<n> - Cut fields from input`;

const HELP_NET = `Networking Commands:
  int get <url> [-o <path>]       - HTTP GET request (use -o to save to file)
  int post <url> <data>           - HTTP POST request
  int put <url> <data>            - HTTP PUT request
  int delete <url>                - HTTP DELETE request
  int file <url> <path>           - Download URL to file
  int headers <key>: <value>      - Set request header
  int headers clear               - Clear all headers
  int ws connect <url>            - Connect to WebSocket
  int ws send <message>           - WebSocket send message
  int ws disconnect               - Close WebSocket

  ip [public]                     - Show network info & public IP
  ping <url>                      - Measure round-trip time
  dig <domain> [type]             - DNS lookup (A, AAAA, MX, TXT, etc.)
  netstat                         - Show network connections & status`;

const HELP_SCRIPT = `Scripting & Variables:
  set <name>=<value>   - Set shell variable
  export <name>=<value> - Set environment variable
  env                  - List all variables
  unset <name>         - Unset variable
  source <file>        - Execute commands from file
  Use $VAR or \${VAR} in commands for variable expansion
  Use $(command) for command substitution`;

const HELP_ENV = `Environment Commands:
  alias <name>=<cmd>   - Create command alias
  unalias <name>       - Remove alias
  aliases              - List all aliases
  theme <name>         - Change theme (default, light, blue, red, purple, green)
  prompt <text>        - Set prompt label`;

const HELP_PKG = `Function & Package Commands:
  func create <name>        - Create a GASH function
  func list                 - List functions
  func delete <name>        - Delete a function
  func run <name>           - Run a function
  func show <name>          - Show function code
  func export <name>        - Export function as JSON

  pkg install <name>        - Install from registry
  pkg install <name> <url>  - Install from URL
  pkg install -u <url>      - Install from URL (name from file)
  pkg run <name> [args]     - Execute a package
  pkg list                  - List installed packages
  pkg remove <name>         - Remove a package
  pkg create <name>         - Scaffold a new package from template
  pkg show <name>           - Show package source code
  pkg search <query>        - Search registry
  pkg info <name>           - Show package details from registry
  Flags for install:
    -a/--author <author>    - Filter by author
    -u/--url <url>          - Install from URL instead of registry`;

const HELP_EDIT = `Editor Commands:
  edit <path> - Open file in line editor
    Editor commands (type at prompt):
    :i <line> <text>   - Insert text at line
    :a <text>          - Append text to end
    :d <line>          - Delete line
    :r <line> <text>   - Replace line
    :w                 - Save file
    :q                 - Quit without saving
    :wq                - Save and quit
    :p                 - Print file with line numbers
    :n                 - Show line count
    :c                 - Clear all lines
    :h                 - Show editor help`;

const HELP_UTIL = `Utility Commands:
  echo <text>         - Print text (supports $VAR expansion)
  calc <op> <nums>    - Calculator (add, sub, mul, div, pow, sqrt, sin, cos)
  flip                - Flip a coin
  time                - Show current time
  date                - Show current date
  clear               - Clear console
  help [cmd/cat]      - Show help
  man <cmd>           - Show detailed command help
  about               - About GASH
  history             - Command history
  updlog              - Update log
  exit                - Close GASH
  sleep <ms>          - Delay for milliseconds
  seq <count>         - Print sequence of numbers
  which <cmd>         - Locate a command
  type <cmd>          - Show command type
  app run <name>      - Run an app from src/apps/
  localstr <op>       - Local storage operations
  figlet <text>       - Generate ASCII art banner
  weather [city]      - Show weather forecast
  top                 - Show system information
  base64 encode/decode <text> - Base64 operations
  hash <algo> <text>  - Hash text (sha-256, sha-1, md5)
  uuid                - Generate UUID v4
  json <op> <args>    - JSON operations (format, minify, validate, get)
  diff <f1> <f2>      - Compare two files line by line
  fortune             - Random fortune cookie
  cowsay <text>       - Cow says text
  watch <sec> <cmd>   - Repeat command every N seconds
  timeout <ms> <cmd>  - Run command with timeout
  xargs <cmd>         - Build commands from piped input

Job Control:
  cmd &               - Run command in background
  jobs                - List background jobs
  ps                  - Alias for jobs
  fg <jobid>          - Bring job to foreground
  bg <jobid>          - Resume job in background
  kill <jobid>        - Terminate a job

System Commands:
  sudo <cmd>          - Run command as root (prompts for password)
  whoami              - Show current username
  id                  - Show user identity
  hostname [name]     - Show or set hostname
  passwd              - Change account password
  cron list|add|rm    - Scheduler (tasks stored in /var/spool/cron/)
  serve [port]        - Start HTTP file server (via Service Worker)
  pkg create <name>   - Scaffold a new package from template`;

const HELP_SYS = `System Commands:
  sudo <cmd>     - Run command as root (prompts for password)
  whoami         - Show current username
  id             - Show user identity
  hostname [n]   - Show or set hostname
  passwd         - Change account password`;

const FORTUNES = [
  'The best way to predict the future is to invent it.',
  'A journey of a thousand miles begins with a single step.',
  'In the middle of difficulty lies opportunity.',
  'Code is like humor. When you have to explain it, it\'s bad.',
  'First, solve the problem. Then, write the code.',
  'Any sufficiently advanced technology is indistinguishable from magic.',
  'Talk is cheap. Show me the code. - Linus Torvalds',
  'The only way to do great work is to love what you do.',
  'Simplicity is the soul of efficiency.',
  'Make it work, make it right, make it fast.',
  'Premature optimization is the root of all evil.',
  'There are only two hard things in CS: cache invalidation and naming things.',
  'It works on my machine.',
  'Have you tried turning it off and on again?',
  'The code is documentation enough... said no one ever.',
  'Debugging is twice as hard as writing the code in the first place.',
  'There is no place like 127.0.0.1',
  'To understand recursion, you must first understand recursion.',
  'A good programmer is someone who always looks both ways before crossing a one-way street.',
  'Deleted code is debugged code.',
  'The best error message is the one that never shows up.',
  'Functions do one thing, they do it well, they do it only once.',
  'Before software can be reusable it first has to be usable.',
  'Fix the cause, not the symptom.',
  'Optimism is an occupational hazard of programming: feedback is the treatment.',
  'Unix is user friendly. It\'s just very selective about who its friends are.',
  'It\'s not a bug, it\'s an undocumented feature.',
  'Weeks of coding can save you hours of planning.',
  'Code never lies, comments sometimes do.',
  'Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.',
];

export function registerAllCommands(reg: CommandRegistry, runtime?: GashRuntime): void {
  const R = runtime;

  // ─── FILE SYSTEM COMMANDS ────────────────────────────────────────

  reg.register('ls', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const path = args[0] || '.';
    try {
      const entries = await ctx.fs.readdir(path);
      if (!entries.length) return '>';
      let output = '';
      for (const e of entries) {
        const icon = e.type === 'directory' ? '\ud83d\udcc1' : '\ud83d\udcc4';
        const size = e.type === 'file' ? ` (${e.size}B)` : '';
        output += `> ${icon} ${e.name}${size}\n`;
      }
      return output.trimEnd();
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('cd', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const path = args[0] || '/';
    try {
      const normalized = ctx.fs.normalizePath(path);
      const exists = await ctx.fs.exists(normalized);
      if (!exists) return `> error: directory not found: ${normalized}`;
      const isDir = await ctx.fs.isDirectory(normalized);
      if (!isDir) return `> error: not a directory: ${normalized}`;
      ctx.fs.cwd = normalized;
      ctx.vars.PWD = normalized;
      ctx._updatePrompt();
      return null;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('pwd', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    return `> ${ctx.fs.cwd}`;
  }, HELP_FS, 'fs');

  reg.register('mkdir', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: mkdir <path>';
    const recursive = args[0] === '-p';
    if (recursive) args.shift();
    const path = args[0];
    if (!path) return '> error: usage: mkdir <path>';
    try {
      if (recursive) {
        await ctx.fs.mkdirp(path);
      } else {
        await ctx.fs.mkdir(path);
      }
      return `> created directory: ${ctx.fs.normalizePath(path)}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('touch', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: touch <path>';
    try {
      const normalized = ctx.fs.normalizePath(args[0]);
      if (await ctx.fs.exists(normalized)) {
        return `> ${normalized} already exists`;
      }
      await ctx.fs.writeFile(args[0], '');
      return `> created: ${normalized}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('cat', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) {
      if (ctx.pipeInput != null) return `> ${ctx.pipeInput}`;
      return '> error: usage: cat <path>';
    }
    try {
      const content = await ctx.fs.readFile(args[0]);
      if (!content) return '> (empty)';
      return '> ' + content.split('\n').join('\n> ');
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('rm', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: rm [-r] <path>';
    const recursive = args[0] === '-r';
    if (recursive) args.shift();
    if (!args.length) return '> error: usage: rm [-r] <path>';
    try {
      if (recursive) {
        await ctx.fs.rmrf(args[0]);
      } else {
        await ctx.fs.delete(args[0]);
      }
      return `> removed: ${ctx.fs.normalizePath(args[0])}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('rmdir', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: rmdir <path>';
    try {
      await ctx.fs.delete(args[0]);
      return `> removed directory: ${ctx.fs.normalizePath(args[0])}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('mv', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: mv <src> <dest>';
    try {
      await ctx.fs.rename(args[0], args[1]);
      return `> renamed: ${args[0]} -> ${args[1]}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('cp', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: cp <src> <dest>';
    try {
      await ctx.fs.copy(args[0], args[1]);
      return `> copied: ${args[0]} -> ${args[1]}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('write', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: write <path> <content>';
    const path = args[0];
    const content = args.slice(1).join(' ');
    try {
      await ctx.fs.writeFile(path, content);
      return `> wrote ${content.length} bytes to ${ctx.fs.normalizePath(path)}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('find', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: find <path> <pattern>';
    try {
      const results = await ctx.fs.find(args[0], args[1]);
      if (!results.length) return '> no matches found';
      return '> ' + results.join('\n> ');
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  reg.register('tree', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const path = args[0] || '.';
    try {
      const normalized = ctx.fs.normalizePath(path);
      const name = normalized === '/' ? '/' : normalized.split('/').pop();
      let output = '> ' + name + '\n';
      output += await ctx.fs.tree(normalized);
      return output.trimEnd();
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  // ─── TEXT PROCESSING ─────────────────────────────────────────────

  reg.register('head', async function (args: string[], ctx: GashContext): Promise<string | null> {
    let n = 10;
    let input = ctx.pipeInput;
    if (args[0] === '-n' && args[1]) {
      n = parseInt(args[1]) || 10;
      args.splice(0, 2);
    }
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err: any) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    const lines = input.split('\n').slice(0, n);
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  reg.register('tail', async function (args: string[], ctx: GashContext): Promise<string | null> {
    let n = 10;
    let input = ctx.pipeInput;
    if (args[0] === '-n' && args[1]) {
      n = parseInt(args[1]) || 10;
      args.splice(0, 2);
    }
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err: any) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    const lines = input.split('\n');
    return '> ' + lines.slice(Math.max(0, lines.length - n)).join('\n> ');
  }, HELP_TEXT, 'text');

  reg.register('wc', async function (args: string[], ctx: GashContext): Promise<string | null> {
    let input = ctx.pipeInput;
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err: any) { return `> error: ${err.message}`; }
    }
    if (input == null) input = '';
    const lines = input.split('\n').length;
    const words = input.split(/\s+/).filter(Boolean).length;
    const chars = input.length;
    return `> ${lines} lines  ${words} words  ${chars} chars`;
  }, HELP_TEXT, 'text');

  reg.register('sort', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const input = ctx.pipeInput;
    if (input == null) return '> error: sort requires piped input';
    const lines = input.split('\n').sort();
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  reg.register('uniq', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const input = ctx.pipeInput;
    if (input == null) return '> error: uniq requires piped input';
    const lines = input.split('\n');
    const result = lines.filter((v, i, a) => i === 0 || v !== a[i - 1]);
    return '> ' + result.join('\n> ');
  }, HELP_TEXT, 'text');

  reg.register('grep', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: grep <pattern> [path]';
    const pattern = args[0];
    let input = ctx.pipeInput;
    if (!input && args.length > 1) {
      try { input = await ctx.fs.readFile(args[1]); }
      catch (err: any) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    let re: RegExp;
    try { re = new RegExp(pattern, 'g'); }
    catch (err: any) { return `> error: invalid regex: ${err.message}`; }
    const lines = input.split('\n').filter(line => re.test(line));
    if (!lines.length) return '> no matches';
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  reg.register('reverse', async function (args: string[], ctx: GashContext): Promise<string | null> {
    let input = ctx.pipeInput;
    if (!input && args.length) {
      input = args.join(' ');
    }
    if (input == null) return '> error: usage: reverse <text>';
    return '> ' + input.split('').reverse().join('');
  }, 'Reverse text\n  reverse <text>     Reverse provided text\n  <text> | reverse   Reverse piped input', 'text');

  reg.register('tr', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: tr <from> <to>';
    const from = args[0];
    const to = args[1];
    let input = ctx.pipeInput;
    if (!input) return '> error: tr requires piped input or text argument';
    let result = '';
    for (const ch of input) {
      const idx = from.indexOf(ch);
      if (idx !== -1 && idx < to.length) {
        result += to[idx];
      } else {
        result += ch;
      }
    }
    return '> ' + result;
  }, 'Translate characters\n  tr <from> <to>    Translate characters in piped input', 'text');

  reg.register('cut', async function (args: string[], ctx: GashContext): Promise<string | null> {
    let input = ctx.pipeInput;
    if (!input) return '> error: cut requires piped input';
    let delimiter = '\t';
    let fields: number[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('-d') && args[i].length > 2) {
        delimiter = args[i].slice(2);
      } else if (args[i] === '-d' && args[i + 1]) {
        delimiter = args[i + 1];
        i++;
      } else if (args[i].startsWith('-f') && args[i].length > 2) {
        fields = args[i].slice(2).split(',').map(Number).filter(n => !isNaN(n) && n > 0);
      } else if (args[i] === '-f' && args[i + 1]) {
        fields = args[i + 1].split(',').map(Number).filter(n => !isNaN(n) && n > 0);
        i++;
      }
    }
    if (!fields.length) return '> error: usage: cut -d<delimiter> -f<fields>';
    const lines = input.split('\n');
    const result = lines.map(line => {
      const parts = line.split(delimiter);
      return fields.map(f => parts[f - 1] || '').join(delimiter);
    });
    return '> ' + result.join('\n> ');
  }, 'Cut fields from input\n  cut -d<delimiter> -f<fields>', 'text');

  // ─── NETWORKING ─────────────────────────────────────────────────

  reg.register('int', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: int <get|post|put|delete|file|headers|ws>';

    const sub = args[0];

    if (sub === 'headers') {
      if (args[1] === 'clear') {
        ctx.vars._intHeaders = '{}';
        return '> headers cleared';
      }
      const headerStr = args.slice(1).join(' ');
      const idx = headerStr.indexOf(':');
      if (idx === -1) return '> error: usage: int headers <key>: <value>';
      const key = headerStr.slice(0, idx).trim();
      const val = headerStr.slice(idx + 1).trim();
      if (!key) return '> error: invalid header';
      let headers: Record<string, string> = {};
      try { headers = JSON.parse(ctx.vars._intHeaders || '{}'); } catch (e) { headers = {}; }
      headers[key] = val;
      ctx.vars._intHeaders = JSON.stringify(headers);
      return `> header set: ${key}: ${val}`;
    }

    if (sub === 'file') {
      const url = args[1];
      const filePath = args[2];
      if (!url || !filePath) return '> error: usage: int file <url> <path>';
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return '> error: URL must start with http:// or https://';
      }
      try {
        const res = await fetch(url);
        if (!res.ok) return `> error: HTTP ${res.status} ${res.statusText}`;
        const text = await res.text();
        await ctx.fs.writeFile(filePath, text);
        return `> downloaded ${text.length} bytes from ${url} to ${ctx.fs.normalizePath(filePath)}`;
      } catch (err: any) {
        return `> error: ${err.message}`;
      }
    }

    if (sub === 'ws') {
      const action = args[1];
      if (action === 'connect') {
        const url = args[2];
        if (!url) return '> error: usage: int ws connect <ws://url>';
        try {
          ctx.socket = new WebSocket(url);
          ctx.socket.addEventListener('open', () => ctx.addToConsole(`> connected to WebSocket: ${url}`));
          ctx.socket.addEventListener('message', (e: MessageEvent) => ctx.addToConsole(`> WS message: ${e.data}`));
          ctx.socket.addEventListener('close', () => { ctx.addToConsole('> WebSocket closed'); ctx.socket = null; });
          ctx.socket.addEventListener('error', () => ctx.addToConsole('> WebSocket error'));
          return `> connecting to ${url}...`;
        } catch (err: any) {
          return `> error: ${err.message}`;
        }
      } else if (action === 'send') {
        const msg = args.slice(2).join(' ');
        if (!ctx.socket || ctx.socket.readyState !== WebSocket.OPEN) {
          return '> error: no active WebSocket connection';
        }
        ctx.socket.send(msg);
        return `> sent: ${msg}`;
      } else if (action === 'disconnect') {
        if (!ctx.socket) return '> error: no active WebSocket';
        ctx.socket.close();
        ctx.socket = null;
        return '> disconnected';
      } else {
        return '> usage: int ws <connect|send|disconnect>';
      }
    }

    const method = sub.toUpperCase();
    const url = args[1];
    if (!url) return `> error: usage: int ${sub} <url> [data] [-o <path>]`;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return '> error: URL must start with http:// or https://';
    }

    let outputPath: string | null = null;
    const flagIdx = args.indexOf('-o');
    if (flagIdx !== -1 && flagIdx + 1 < args.length) {
      outputPath = args[flagIdx + 1];
      args.splice(flagIdx, 2);
    }

    const data = args.slice(2).join(' ');
    let headers: Record<string, string> = {};
    try { headers = JSON.parse(ctx.vars._intHeaders || '{}'); } catch (e) { headers = {}; }

    try {
      const fetchOpts: RequestInit = { method, headers };
      if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOpts.body = data;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'text/plain';
          fetchOpts.headers = { ...headers };
        }
      }
      fetchOpts.headers = headers;

      const res = await fetch(url, fetchOpts);
      const text = await res.text();

      if (outputPath) {
        await ctx.fs.writeFile(outputPath, text);
        return `> saved ${text.length} bytes from ${url} to ${ctx.fs.normalizePath(outputPath)} (${res.status} ${res.statusText})`;
      }

      let preview = text.slice(0, 500);
      try {
        preview = JSON.stringify(JSON.parse(text), null, 2);
        if (preview.length > 500) preview = preview.slice(0, 500) + '\n... (truncated)';
      } catch (e) { /* not JSON, show raw */ }
      return `> ${method} ${url}\n> Status: ${res.status} ${res.statusText}\n> ${preview}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_NET, 'net');

  // ─── IP ────────────────────────────────────────────────────────────

  reg.register('ip', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args[0] === 'public') {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return '> Public IP: ' + data.ip;
      } catch (e: any) {
        return '> error: ' + e.message;
      }
    }
    let out = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      out += '> Public IP: ' + data.ip + '\n';
    } catch (e: any) {
      out += '> Public IP: unavailable\n';
    }
    const conn = (navigator as any).connection;
    if (conn) {
      out += '> Connection: ' + conn.effectiveType + '\n';
      out += '> Downlink: ' + conn.downlink + ' Mbps\n';
      out += '> RTT: ' + conn.rtt + ' ms\n';
    }
    out += '> Host: ' + (ctx.hostname || 'gashbox') + '\n';
    out += '> UA: ' + navigator.userAgent;
    return out.trimEnd();
  }, 'Show network info\n  ip                    - Show all network info\n  ip public             - Show public IP only', 'net');

  // ─── PING ──────────────────────────────────────────────────────────

  reg.register('ping', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: ping <url>';
    let target = args[0];
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    const start = performance.now();
    try {
      const res = await fetch(target, { method: 'HEAD' });
      const ms = performance.now() - start;
      return '> PING ' + target + ' - ' + ms.toFixed(1) + ' ms (status: ' + res.status + ' ' + res.statusText + ')';
    } catch (e: any) {
      const ms = performance.now() - start;
      return '> PING ' + target + ' - unreachable (' + ms.toFixed(1) + ' ms)';
    }
  }, 'Ping a host\n  ping <url>    Measure round-trip time via HEAD request', 'net');

  // ─── DIG ──────────────────────────────────────────────────────────

  reg.register('dig', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: dig <domain> [type]';
    const domain = args[0];
    const type = (args[1] || 'A').toUpperCase();
    const url = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=' + type;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
      if (!res.ok) return '> error: DNS query failed (HTTP ' + res.status + ')';
      const data = await res.json();
      if (!data.Answer || !data.Answer.length) {
        return '> no ' + type + ' records found for ' + domain;
      }
      let out = '> ' + domain + ' (' + type + '):\n';
      for (let i = 0; i < data.Answer.length; i++) {
        const a = data.Answer[i];
        out += '>   ' + a.name + '  ' + a.ttl + 's  ' + a.type + '  ' + a.data + '\n';
      }
      return out.trimEnd();
    } catch (e: any) {
      return '> error: ' + e.message;
    }
  }, 'DNS lookup via Cloudflare DoH\n  dig <domain> [type]    Look up DNS records (A, AAAA, MX, TXT, etc.)', 'net');

  // ─── NETSTAT ───────────────────────────────────────────────────────

  reg.register('netstat', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    let out = '';
    const conn = (navigator as any).connection;
    if (conn) {
      out += '> Connection: ' + conn.effectiveType + '\n';
      out += '> Downlink: ' + conn.downlink + ' Mbps\n';
      out += '> RTT: ' + conn.rtt + ' ms\n';
    } else {
      out += '> Connection API: not available\n';
    }
    out += '> WebSocket: ' + (ctx.socket ? 'connected' : 'none') + '\n';
    out += '> UA: ' + navigator.userAgent;
    return out;
  }, 'Show network connections and status', 'net');

  // ─── SCRIPTING & VARIABLES ───────────────────────────────────────

  reg.register('set', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: set <name>=<value>';
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return '> error: usage: set <name>=<value>';
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid variable name';
    ctx.vars[name] = val;
    return `> ${name}=${val}`;
  }, HELP_SCRIPT, 'script');

  reg.register('export', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: export <name>=<value>';
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return '> error: usage: export <name>=<value>';
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid variable name';
    ctx.vars[name] = val;
    ctx.vars['exported_' + name] = '1';
    return `> ${name}=${val}`;
  }, HELP_SCRIPT, 'script');

  reg.register('env', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    const keys = Object.keys(ctx.vars).filter(k => !k.startsWith('_') && !k.startsWith('exported_'));
    if (!keys.length) return '> (no variables)';
    return '> ' + keys.map(k => `${k}=${ctx.vars[k]}`).join('\n> ');
  }, HELP_SCRIPT, 'script');

  reg.register('unset', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: unset <name>';
    delete ctx.vars[args[0]];
    return `> unset ${args[0]}`;
  }, HELP_SCRIPT, 'script');

  reg.register('source', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: source <file>';
    try {
      const content = await ctx.fs.readFile(args[0]);
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        ctx.addToConsole(`> \u00b7 ${line}`);
        await ctx.processCommand(line.trim());
      }
      return `> executed ${lines.length} commands from ${args[0]}`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_SCRIPT, 'script');

  // ─── ENVIRONMENT ─────────────────────────────────────────────────

  reg.register('alias', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) {
      const keys = Object.keys(ctx.aliases);
      if (!keys.length) return '> no aliases set';
      return '> ' + keys.map(k => `${k}=${ctx.aliases[k]}`).join('\n> ');
    }
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) {
      if (ctx.aliases[arg]) return `> ${arg}=${ctx.aliases[arg]}`;
      return `> alias not found: ${arg}`;
    }
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid alias name';
    ctx.aliases[name] = val;
    ctx._saveAliases();
    return `> alias ${name}=${val}`;
  }, HELP_ENV, 'env');

  reg.register('unalias', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: unalias <name>';
    if (ctx.aliases[args[0]]) {
      delete ctx.aliases[args[0]];
      ctx._saveAliases();
      return `> removed alias: ${args[0]}`;
    }
    return `> alias not found: ${args[0]}`;
  }, HELP_ENV, 'env');

  reg.register('aliases', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    const keys = Object.keys(ctx.aliases);
    if (!keys.length) return '> no aliases set';
    return '> ' + keys.map(k => `${k}=${ctx.aliases[k]}`).join('\n> ');
  }, HELP_ENV, 'env');

  reg.register('theme', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const themes = ['default', 'light', 'blue', 'red', 'purple', 'green'];
    if (!args.length) return `> usage: theme <name> (${themes.join(', ')})`;
    const t = args[0].toLowerCase();
    if (!themes.includes(t)) return `> unknown theme: ${t} (${themes.join(', ')})`;
    document.body.className = t === 'default' ? '' : 'theme-' + t;
    ctx.config.theme = t;
    ctx._saveConfig();
    return `> theme set to: ${t}`;
  }, HELP_ENV, 'env');

  reg.register('prompt', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return `> current prompt: ${ctx.config.prompt}`;
    const text = args.join(' ');
    ctx.config.prompt = text;
    ctx._saveConfig();
    ctx._updatePrompt();
    return `> prompt set to: ${text}`;
  }, HELP_ENV, 'env');

  // ─── FUNCTIONS ────────────────────────────────────────────────────

  reg.register('func', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> usage: func <create|delete|list|run|show|export> [name]';
    const sub = args[0];

    if (sub === 'create') {
      const name = args[1];
      if (!name) return '> error: usage: func create <name>';
      ctx.gashFunctions[name] = [];
      ctx.waitingForFunction = name;
      ctx._updatePrompt();
      ctx.addToConsole(`> creating function "${name}"... type function code, end with "endfunc"`);
      return null;
    }

    if (sub === 'list') {
      const names = Object.keys(ctx.gashFunctions);
      if (!names.length) return '> no functions defined';
      return '> ' + names.join('\n> ');
    }

    if (sub === 'delete') {
      const name = args[1];
      if (!name) return '> error: usage: func delete <name>';
      if (ctx.gashFunctions[name]) {
        delete ctx.gashFunctions[name];
        ctx._saveFunctions();
        return `> function "${name}" deleted`;
      }
      return `> function "${name}" not found`;
    }

    if (sub === 'run') {
      const name = args[1];
      if (!name) return '> error: usage: func run <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      ctx.addToConsole(`> running function "${name}"...`);
      for (const cmd of fn) {
        await ctx.processCommand(cmd);
      }
      return null;
    }

    if (sub === 'show') {
      const name = args[1];
      if (!name) return '> error: usage: func show <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      return '> ' + fn.join('\n> ');
    }

    if (sub === 'export') {
      const name = args[1];
      if (!name) return '> error: usage: func export <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      return '> ' + JSON.stringify({ name, commands: fn });
    }

    return '> usage: func <create|delete|list|run|show|export>';
  }, HELP_PKG, 'pkg');

  // ─── PACKAGE MANAGER (vanilla JS packages) ─────────────────────

  reg.register('pkg', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> usage: pkg <install|run|list|remove|show|search|info|create>';
    const sub = args[0];

    const disclaimer = function () {
      ctx.addToConsole('> \u26a0 Galaxy is NOT responsible for any GASHware you install or run.', 'error-output');
      ctx.addToConsole('> Your browser sandboxes everything \u2014 you\'ll be fine, but don\'t be dumb.', 'error-output');
    };

    async function fetchRegistry() {
      const res = await fetch(REGISTRY_URL);
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
      const data = await res.json();
      return (data.packages || []) as Array<{ name: string; url: string; author: string; version: string; description: string }>;
    }

    function resolveUrl(url: string): string {
      if (url.startsWith('/')) return window.location.origin + url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return window.location.origin + '/' + url;
      return url;
    }

    async function fetchCode(url: string): Promise<string> {
      const resolved = resolveUrl(url);
      const res = await fetch(resolved);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.code) return json.code;
      } catch (e) { /* raw JS */ }
      return text;
    }

    async function installFromUrl(name: string, url: string, meta?: { author?: string; version?: string; description?: string }): Promise<string> {
      const resolved = resolveUrl(url);
      disclaimer();
      const code = await fetchCode(url);
      ctx.gashPackages[name] = { code, url: resolved, installed: Date.now(), ...meta };
      ctx._savePackages();
      try {
        await ctx.fs.mkdirp('/sys/bin');
        await ctx.fs.writeFile('/sys/bin/' + name + '.js', code);
      } catch (e) { /* VFS not available */ }
      try {
        const fn = new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', code);
        fn((window as any).GASH, ctx, [], console, document, window);
      } catch (e: any) {
        ctx.addToConsole(`> package execution warning: ${e.message}`, 'error-output');
      }
      if (meta && meta.description) {
        ctx.addToConsole(`> \ud83d\udce6 ${name} v${meta.version || '?'} by ${meta.author || '?'}`);
      }
      return `> installed package "${name}" (${code.length} chars)`;
    }

    if (sub === 'install') {
      const rest = args.slice(1);

      const urlFlagIdx = rest.indexOf('-u') !== -1 ? rest.indexOf('-u') : rest.indexOf('--url');
      if (urlFlagIdx !== -1) {
        const url = rest[urlFlagIdx + 1];
        if (!url) return '> error: -u/--url requires a URL argument';
        const name = rest[0] !== '-u' && rest[0] !== '--url' ? rest[0] : url.split('/').pop()!.replace(/\.\w+$/, '');
        return await installFromUrl(name, url);
      }

      const authorFlagIdx = rest.indexOf('-a') !== -1 ? rest.indexOf('-a') : rest.indexOf('--author');
      let authorFilter: string | null = null;
      let positionalArgs: string[];
      if (authorFlagIdx !== -1) {
        authorFilter = rest[authorFlagIdx + 1];
        positionalArgs = rest.slice(0, authorFlagIdx);
      } else {
        positionalArgs = rest;
      }

      const name = positionalArgs[0];
      const url = positionalArgs[1];

      if (name && url) {
        return await installFromUrl(name, url);
      }

      if (!name) return '> error: usage: pkg install <name> [-a <author>] [-u <url>]';
      try {
        const registry = await fetchRegistry();
        let matches = registry.filter(p => p.name === name);

        if (authorFilter) {
          matches = matches.filter(p => p.author === authorFilter);
        }

        if (matches.length === 0) {
          return `> no package "${name}" found in registry${authorFilter ? ` by "${authorFilter}"` : ''}`;
        }

        if (matches.length > 1) {
          let msg = `> multiple packages named "${name}":\n`;
          matches.forEach((p, i) => {
            msg += `>   ${i + 1}. ${p.name} v${p.version} by ${p.author} - ${p.description}\n`;
          });
          msg += `> use -a <author> to pick one`;
          return msg.trimEnd();
        }

        const pkg = matches[0];
        return await installFromUrl(pkg.name, pkg.url, {
          author: pkg.author,
          version: pkg.version,
          description: pkg.description
        });
      } catch (err: any) {
        return `> registry error: ${err.message}`;
      }
    }

    if (sub === 'search') {
      const query = args.slice(1).join(' ').toLowerCase();
      if (!query) return '> usage: pkg search <query>';
      try {
        const registry = await fetchRegistry();
        const matches = registry.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query)
        );
        if (!matches.length) return '> no matching packages found';
        let msg = `> ${matches.length} result(s) for "${query}":\n`;
        matches.forEach(p => {
          msg += `>   ${p.name} v${p.version} by ${p.author} - ${p.description}\n`;
        });
        return msg.trimEnd();
      } catch (err: any) {
        return `> registry error: ${err.message}`;
      }
    }

    if (sub === 'info') {
      const name = args[1];
      if (!name) return '> usage: pkg info <name>';

      const installed = ctx.gashPackages[name];
      let msg = '';
      if (installed) {
        msg += `> \ud83d\udce6 ${name} (installed)\n`;
        msg += `>   size: ${installed.code.length} chars\n`;
        msg += `>   from: ${installed.url}\n`;
        msg += `>   installed: ${new Date(installed.installed).toLocaleString()}\n`;
        if (installed.author) msg += `>   author: ${installed.author}\n`;
        if (installed.version) msg += `>   version: ${installed.version}\n`;
        if (installed.description) msg += `>   description: ${installed.description}\n`;
      }

      try {
        const registry = await fetchRegistry();
        const matches = registry.filter(p => p.name === name);
        if (matches.length > 0) {
          if (installed) msg += '>\n';
          matches.forEach(p => {
            msg += `> \ud83d\udcc1 ${p.name} v${p.version} by ${p.author}\n`;
            msg += `>   ${p.description}\n`;
            msg += `>   ${p.url}\n`;
          });
        }
      } catch (e) { /* registry offline, show installed info only */ }

      if (!msg) return `> no info for "${name}"`;
      return msg.trimEnd();
    }

    if (sub === 'run') {
      const name = args[1];
      if (!name) return '> error: usage: pkg run <name> [args]';
      const pkg = ctx.gashPackages[name];
      if (!pkg) return `> package "${name}" not found (try "pkg install ${name}" first)`;
      disclaimer();
      try {
        const fn = new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', pkg.code);
        const result = fn((window as any).GASH, ctx, args.slice(2), console, document, window);
        if (result !== undefined) {
          const str = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          return '> ' + str.split('\n').join('\n> ');
        }
        return '> (no return value)';
      } catch (err: any) {
        return `> error: ${err.message}`;
      }
    }

    if (sub === 'list') {
      const names = Object.keys(ctx.gashPackages);
      if (!names.length) return '> no packages installed';
      const lines = names.map(n => {
        const p = ctx.gashPackages[n];
        const tag = p.author ? ` by ${p.author}` : '';
        return `${n}${tag} (${p.code.length} chars)`;
      });
      return '> ' + lines.join('\n> ');
    }

    if (sub === 'remove') {
      const name = args[1];
      if (!name) return '> error: usage: pkg remove <name>';
      if (ctx.gashPackages[name]) {
        delete ctx.gashPackages[name];
        ctx._savePackages();
        try { await ctx.fs.delete('/sys/bin/' + name + '.js'); } catch (e) { /* ignore */ }
        return `> removed package "${name}"`;
      }
      return `> package "${name}" not found`;
    }

    if (sub === 'create') {
      const name = args[1];
      if (!name) return '> error: usage: pkg create <name>';
      if (ctx.gashPackages[name]) return `> package "${name}" already exists`;

      const template = `(function () {
  const G = GASH;

  const HELP = \`${name} - A GASH package

  Usage:
    ${name} --help    Show this help\`;

  G.register('${name}', async function (args, ctx) {
    if (!args.length || args[0] === '--help') {
      return '> ' + HELP.split('\\n').join('\\n> ');
    }

    // Your code here
    return '> hello from ${name}!';
  }, HELP, 'pkg');

  G.addToConsole('> \\ud83d\\udce6 ${name} package loaded. Try: ${name} --help');
})();`;

      ctx.gashPackages[name] = { code: template, url: '', installed: Date.now() };
      ctx._savePackages();
      try {
        await ctx.fs.mkdirp('/sys/bin');
        await ctx.fs.writeFile('/sys/bin/' + name + '.js', template);
      } catch (e) { /* VFS not available */ }
      try {
        (new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', template))((window as any).GASH, ctx, [], console, document, window);
      } catch (e: any) {
        return '> error executing template: ' + e.message;
      }
      return `> created package "${name}" (${template.length} chars). Try: ${name}`;
    }

    if (sub === 'show') {
      const name = args[1];
      if (!name) return '> error: usage: pkg show <name>';
      const pkg = ctx.gashPackages[name];
      if (!pkg) return `> package "${name}" not found`;
      return '> ' + pkg.code.split('\n').join('\n> ');
    }

    return '> usage: pkg <install|run|list|remove|show|search|info|create>';
  }, HELP_PKG, 'pkg');

  // ─── EDITOR ─────────────────────────────────────────────────────

  reg.register('edit', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: edit <path>';
    if (!ctx.editor) return '> error: editor not available';
    const mode = args.includes('--visual') || args.includes('-v') ? 'visual' : 'line';
    const out = await ctx.editor.open(args[0], ctx.fs, mode, ctx.config);
    ctx.editorMode = true;
    ctx._updatePrompt();
    return out;
  }, HELP_EDIT, 'edit');

  // ─── UTILITIES ───────────────────────────────────────────────────

  reg.register('echo', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '>';
    return '> ' + args.join(' ');
  }, HELP_UTIL, 'util');

  reg.register('calc', async function (args: string[]): Promise<string | null> {
    if (args.length < 2) return '> error: usage: calc <op> <nums...>';
    const op = args[0].toLowerCase();
    const nums = args.slice(1).map(Number);
    if (nums.some(isNaN)) return '> error: invalid number';

    let result: number;
    switch (op) {
      case 'add': result = nums.reduce((a, b) => a + b, 0); break;
      case 'sub':
      case 'subtract': result = nums.reduce((a, b) => a - b); break;
      case 'mul':
      case 'multiply': result = nums.reduce((a, b) => a * b, 1); break;
      case 'div':
      case 'divide': result = nums.reduce((a, b) => a / b); break;
      case 'pow':
      case 'power': result = nums.reduce((a, b) => Math.pow(a, b)); break;
      case 'sqrt': result = Math.sqrt(nums[0]); break;
      case 'sin': result = Math.sin(nums[0]); break;
      case 'cos': result = Math.cos(nums[0]); break;
      case 'avg':
      case 'average': result = nums.reduce((a, b) => a + b, 0) / nums.length; break;
      case 'min': result = Math.min(...nums); break;
      case 'max': result = Math.max(...nums); break;
      default: return `> unknown operation: ${op} (add, sub, mul, div, pow, sqrt, sin, cos, avg, min, max)`;
    }
    return `> ${result}`;
  }, HELP_UTIL, 'util');

  reg.register('flip', async function (): Promise<string | null> {
    return `> ${Math.random() > 0.5 ? 'Heads' : 'Tails'}`;
  }, HELP_UTIL, 'util');

  reg.register('time', async function (): Promise<string | null> {
    return `> ${new Date().toLocaleTimeString()}`;
  }, HELP_UTIL, 'util');

  reg.register('date', async function (): Promise<string | null> {
    return `> ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  }, HELP_UTIL, 'util');

  reg.register('clear', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    ctx._clearConsole();
    return null;
  }, HELP_UTIL, 'util');

  reg.register('help', async function (args: string[]): Promise<string | null> {
    if (args.length) {
      const topic = args[0].toLowerCase();
      if (topic === 'fs' || topic === 'filesystem') return '> ' + HELP_FS.split('\n').join('\n> ');
      if (topic === 'text' || topic === 'text processing') return '> ' + HELP_TEXT.split('\n').join('\n> ');
      if (topic === 'net' || topic === 'networking') return '> ' + HELP_NET.split('\n').join('\n> ');
      if (topic === 'script' || topic === 'scripting') return '> ' + HELP_SCRIPT.split('\n').join('\n> ');
      if (topic === 'env' || topic === 'environment') return '> ' + HELP_ENV.split('\n').join('\n> ');
      if (topic === 'pkg' || topic === 'packages') return '> ' + HELP_PKG.split('\n').join('\n> ');
      if (topic === 'edit' || topic === 'editor') return '> ' + HELP_EDIT.split('\n').join('\n> ');
      if (topic === 'util' || topic === 'utilities') return '> ' + HELP_UTIL.split('\n').join('\n> ');
      if (topic === 'sys' || topic === 'system') return '> ' + HELP_SYS.split('\n').join('\n> ');

      const cmd = reg.commands[topic];
      if (cmd) return '> ' + (cmd.help || `No help available for "${topic}"`).split('\n').join('\n> ');
      return `> no help for "${topic}"`;
    }

    let output = '> \ud83d\udda5 GASH - Galaxy\'s Developer Shell\n> Type "help <category>" for details:\n';
    const cats: Record<string, string> = {
      fs: 'File System', text: 'Text Processing', net: 'Networking',
      script: 'Scripting', env: 'Environment', pkg: 'Functions/Packages',
      edit: 'Editor', util: 'Utilities', sys: 'System'
    };
    for (const [key, label] of Object.entries(cats)) {
      output += `> \n> [${label}]\n>   help ${key}\n`;
    }
    output += '\n> Special: up/down arrows for history, Tab for completion, Ctrl+R to search history';
    return output;
  }, HELP_UTIL, 'util');

  reg.register('about', async function (): Promise<string | null> {
    return `> \ud83d\udda5 GASH - Galaxy's Developer Shell\n> Version ${R?.version || VERSION}\n> Web-based shell with virtual filesystem, scripting, networking, and more.`;
  }, HELP_UTIL, 'util');

  reg.register('history', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    if (!ctx.history || !ctx.history.length) return '> (empty)';
    const lines = ctx.history.map((cmd, i) => `${i + 1}  ${cmd}`);
    return '> ' + lines.join('\n> ');
  }, HELP_UTIL, 'util');

  reg.register('updlog', async function (): Promise<string | null> {
    return `> GASH 2.1 - The Appendix Upgrade
> - TypeScript rewrite (fully typed codebase)
> - New text processing: reverse, tr, cut
> - New utilities: base64, hash, uuid, json
> - New fun commands: fortune, cowsay
> - New system commands: diff, watch, timeout, xargs
> - Continued stability improvements
>
> GASH 2.0 - The Intestine Upgrade
> - Virtual File System (persistent, IndexedDB)
> - Tab completion for commands and paths
> - Command piping (|) and output redirect (>)
> - Environment variables ($VAR, $(cmd))
> - Text editor (edit command)
> - Enhanced networking (POST, PUT, DELETE, headers)
> - Theme switching (6 themes)
> - Aliases, scripting, package manager
> - Text processing (grep, sort, head, tail, wc, uniq)
> - And more!`;
  }, HELP_UTIL, 'util');

  reg.register('exit', async function (): Promise<string | null> {
    setTimeout(() => window.close(), 2500);
    return '> Exiting GASH...';
  }, HELP_UTIL, 'util');

  reg.register('sleep', async function (args: string[]): Promise<string | null> {
    const ms = parseInt(args[0]) || 1000;
    return new Promise(resolve => {
      setTimeout(() => resolve(`> slept for ${ms}ms`), ms);
    });
  }, HELP_UTIL, 'util');

  reg.register('seq', async function (args: string[]): Promise<string | null> {
    const n = parseInt(args[0]) || 10;
    const nums: number[] = [];
    for (let i = 1; i <= n; i++) nums.push(i);
    return '> ' + nums.join('\n> ');
  }, HELP_UTIL, 'util');

  // ─── SYSTEM COMMANDS ─────────────────────────────────────────────

  reg.register('sudo', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: sudo <command>';
    const rootHash = localStorage.getItem('gashRootHash');
    if (!rootHash) return '> error: root password not set (re-run setup)';
    const pass = prompt('[sudo] password for root:');
    if (btoa(pass!) !== rootHash) return '> error: incorrect root password';
    ctx.addToConsole('> \u269b running as root');
    await ctx.processCommand(args.join(' '));
    return null;
  }, HELP_SYS, 'sys');

  reg.register('whoami', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    return '> ' + (ctx.vars.USER || 'gashuser');
  }, 'Show current username', 'sys');

  reg.register('id', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    const user = ctx.vars.USER || 'gashuser';
    return '> uid=1000(' + user + ') gid=1000(' + user + ') groups=1000(' + user + ')';
  }, 'Show user identity', 'sys');

  reg.register('hostname', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length) {
      ctx.hostname = args[0];
      try { await ctx.fs.writeFile('/etc/hostname', args[0]); } catch (e) { /* ignore */ }
      ctx._updatePrompt();
      return '> hostname set to ' + args[0];
    }
    const h = ctx.hostname || 'gashbox';
    return '> ' + h;
  }, 'Show or set hostname', 'sys');

  reg.register('passwd', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    const currentHash = localStorage.getItem('gashRootHash');
    if (!currentHash) return '> error: root password not set';
    const old = prompt('Current password:');
    if (btoa(old!) !== currentHash) return '> error: incorrect password';
    const new1 = prompt('New password:');
    const new2 = prompt('Retype new password:');
    if (new1 !== new2) return '> error: passwords do not match';
    localStorage.setItem('gashRootHash', btoa(new1!));
    try {
      const shadow = await ctx.fs.readFile('/etc/shadow');
      const lines = shadow.split('\n');
      const rootLine = lines.findIndex(l => l.startsWith('root:'));
      if (rootLine !== -1) {
        lines[rootLine] = 'root:' + btoa(new1!) + ':19000:0:99999:7:::';
        await ctx.fs.writeFile('/etc/shadow', lines.join('\n'));
      }
    } catch (e) { /* ignore */ }
    return '> password updated';
  }, 'Change account password', 'sys');

  // ─── SSH: WebSocket SSH proxy client ────────────────────────────

  reg.register('ssh', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> usage: ssh <host> | --proxy <url> | --show-proxy';

    if (args[0] === '--proxy') {
      if (!args[1]) return '> error: --proxy requires a URL';
      ctx.vars._sshProxy = args[1];
      return '> SSH proxy set to ' + args[1];
    }

    if (args[0] === '--show-proxy') {
      return '> SSH proxy: ' + (ctx.vars._sshProxy || '(not set)');
    }

    if (R?.inputHook) return '> already in a session (type exit to disconnect)';

    const host = args[0];
    const proxy = ctx.vars._sshProxy;
    if (!proxy) return '> error: no SSH proxy set. Use: ssh --proxy <wss://url>';

    ctx.addToConsole('> Connecting to ' + host + ' via ' + proxy + '...');

    let ws: WebSocket;
    try {
      ws = new WebSocket(proxy + '/' + host);
    } catch (e: any) {
      return '> error: ' + e.message;
    }

    let connected = false;
    const savedUpdatePrompt = ctx._updatePrompt;

    function cleanup() {
      if (R) {
        R.inputHook = null;
        R.hookLabel = undefined;
      }
      ctx._updatePrompt();
    }

    ws.addEventListener('open', () => {
      connected = true;
      ctx.addToConsole('> Connected to ' + host);
      ctx.addToConsole('> Type exit to disconnect.');

      if (R) {
        R.inputHook = (line: string) => {
          if (line === 'exit' || line === 'quit') {
            ws.close();
            return;
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(line + '\n');
          }
        };
        R.hookLabel = 'ssh> ';
      }

      ctx._updatePrompt();
    });

    ws.addEventListener('message', (e: MessageEvent) => {
      ctx.addToConsole('> ' + String(e.data).replace(/\n$/, '').split('\n').join('\n> '));
    });

    ws.addEventListener('close', () => {
      cleanup();
      ctx.addToConsole('> Disconnected from ' + host);
    });

    ws.addEventListener('error', () => {
      if (!connected) {
        ctx.addToConsole('> Connection failed to ' + host, 'error-output');
      } else {
        cleanup();
      }
    });

    return null;
  }, 'SSH client via WebSocket proxy\n  ssh <host>           Connect to host via SSH proxy\n  ssh --proxy <url>    Set WebSocket proxy URL\n  ssh --show-proxy     Show current proxy URL', 'sys');

  // ─── JOB CONTROL ──────────────────────────────────────────────────

  reg.register(['jobs', 'ps'], async function (): Promise<string | null> {
    if (!R) return '> error: runtime not available';
    const ids = Object.keys(R.jobs);
    if (!ids.length) return '> no running jobs';
    const lines = ids.map(id => {
      const j = R.jobs[parseInt(id)];
      const elapsed = Math.round((Date.now() - j.timestamp) / 1000) + 's';
      return '[' + id + '] ' + j.status + '  ' + elapsed + '  ' + j.command;
    });
    return '> ' + lines.join('\n> ');
  }, 'List background jobs', 'sys');

  reg.register('fg', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: fg <jobid>';
    if (!R) return '> error: runtime not available';
    const id = parseInt(args[0]);
    const job = R.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    if (job.status !== 'running' && job.status !== 'suspended') return '> error: job ' + id + ' is ' + job.status;
    ctx.addToConsole('> waiting for job [' + id + ']...');
    try { await job.promise; } catch (e) { /* ignore */ }
    return null;
  }, 'Bring job to foreground\n  fg <jobid>    Wait for a background job to complete', 'sys');

  reg.register('bg', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: bg <jobid>';
    if (!R) return '> error: runtime not available';
    const id = parseInt(args[0]);
    const job = R.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    job.status = 'running';
    return '> job [' + id + '] resumed in background';
  }, 'Resume job in background\n  bg <jobid>', 'sys');

  reg.register('kill', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: kill <jobid>';
    if (!R) return '> error: runtime not available';
    const id = parseInt(args[0]);
    const job = R.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    delete R.jobs[id];
    return '> job [' + id + '] terminated';
  }, 'Terminate a job\n  kill <jobid>', 'sys');

  // ─── WHICH / TYPE ───────────────────────────────────────────────

  reg.register('which', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: which <command>';
    const cmd = args[0];
    if (reg.commands[cmd]) return `> ${cmd} is a built-in command (${reg.commands[cmd].category})`;
    if (ctx.aliases[cmd]) return `> ${cmd} is aliased to \`${ctx.aliases[cmd]}\``;
    if (ctx.gashFunctions[cmd]) return `> ${cmd} is a user-defined function`;
    return `> ${cmd} not found`;
  }, HELP_UTIL, 'util');

  reg.register('type', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: type <command>';
    const cmd = args[0];
    if (reg.commands[cmd]) return `> ${cmd} is a shell builtin`;
    if (ctx.aliases[cmd]) return `> ${cmd} is an alias`;
    if (ctx.gashFunctions[cmd]) return `> ${cmd} is a function`;
    const exists = await ctx.fs.exists(ctx.fs.normalizePath(cmd));
    if (exists) return `> ${cmd} is a file`;
    return `> ${cmd} not found`;
  }, HELP_UTIL, 'util');

  // ─── APP ────────────────────────────────────────────────────────

  reg.register('app', async function (args: string[]): Promise<string | null> {
    if (args[0] !== 'run' || !args[1]) return '> usage: app run <name>';
    const name = args[1];
    const appPath = `src/apps/${name}.html`;
    try {
      const res = await fetch(appPath, { method: 'HEAD' });
      if (res.ok) {
        window.open(appPath, '_blank');
        return `> opened ${name}.html`;
      }
      return `> error: app "${name}.html" not found in src/apps/`;
    } catch (err: any) {
      return `> error: ${err.message}`;
    }
  }, HELP_UTIL, 'util');

  // ─── LOCALSTR ───────────────────────────────────────────────────

  reg.register('localstr', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> usage: localstr <set|get|list|del|wipe> [args]';
    const sub = args[0];

    if (sub === 'set') {
      if (args.length < 3) return '> usage: localstr set <key> <value>';
      const key = args[1];
      const val = args.slice(2).join(' ');
      localStorage.setItem(key, val);
      return `> stored '${val}' under key '${key}'`;
    }

    if (sub === 'get') {
      const key = args[1];
      if (!key) return '> usage: localstr get <key>';
      const val = localStorage.getItem(key);
      return val != null ? `> ${key}: ${val}` : `> key '${key}' not found`;
    }

    if (sub === 'list') {
      const keys = Object.keys(localStorage);
      if (!keys.length) return '> no keys in local storage';
      return '> ' + keys.map(k => `${k}: ${localStorage.getItem(k)}`).join('\n> ');
    }

    if (sub === 'del' || sub === 'delete') {
      const key = args[1];
      if (!key) return '> usage: localstr del <key>';
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        return `> deleted key '${key}'`;
      }
      return `> key '${key}' not found`;
    }

    if (sub === 'wipe') {
      const captcha = Math.random().toString(36).slice(2, 8);
      ctx.addToConsole(`> Are you sure? Type '${captcha}' to confirm or 'no' to cancel.`);
      ctx.waitingForFunction = { type: 'wipe', code: captcha };
      return null;
    }

    return '> usage: localstr <set|get|list|del|wipe>';
  }, HELP_UTIL, 'util');

  // ─── FIGLET ──────────────────────────────────────────────────────

  reg.register('figlet', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: figlet <text>';
    const text = args.join(' ');
    const chars = text.toUpperCase().split('');
    const lines = ['', '', '', '', ''];
    const font: Record<string, string[]> = {
      'A': [' AA ', 'A  A', 'AAAA', 'A  A', 'A  A'],
      'B': ['BBB ', 'B  B', 'BBB ', 'B  B', 'BBB '],
      'C': [' CCC', 'C   ', 'C   ', 'C   ', ' CCC'],
      'D': ['DDD ', 'D  D', 'D  D', 'D  D', 'DDD '],
      'E': ['EEEE', 'E   ', 'EEE ', 'E   ', 'EEEE'],
      'F': ['FFFF', 'F   ', 'FFF ', 'F   ', 'F   '],
      'G': [' GGG', 'G   ', 'G GG', 'G  G', ' GGG'],
      'H': ['H  H', 'H  H', 'HHHH', 'H  H', 'H  H'],
      'I': ['III', ' I ', ' I ', ' I ', 'III'],
      'J': ['  JJ', '   J', '   J', 'J  J', ' JJ '],
      'K': ['K  K', 'K K ', 'KK  ', 'K K ', 'K  K'],
      'L': ['L   ', 'L   ', 'L   ', 'L   ', 'LLLL'],
      'M': ['M   M', 'MM MM', 'M M M', 'M   M', 'M   M'],
      'N': ['N  N', 'NN N', 'N NN', 'N  N', 'N  N'],
      'O': [' OO ', 'O  O', 'O  O', 'O  O', ' OO '],
      'P': ['PPP ', 'P  P', 'PPP ', 'P   ', 'P   '],
      'Q': [' QQ ', 'Q  Q', 'Q  Q', 'Q QQ', ' QQ '],
      'R': ['RRR ', 'R  R', 'RRR ', 'R R ', 'R  R'],
      'S': [' SSS', 'S   ', ' SS ', '   S', 'SSS '],
      'T': ['TTTT', '  T ', '  T ', '  T ', '  T '],
      'U': ['U  U', 'U  U', 'U  U', 'U  U', ' UU '],
      'V': ['V  V', 'V  V', 'V  V', ' VV ', '  V '],
      'W': ['W   W', 'W   W', 'W W W', 'W W W', ' W W '],
      'X': ['X  X', ' X X', '  X ', ' X X', 'X  X'],
      'Y': ['Y  Y', 'Y  Y', ' YY ', '  Y ', '  Y '],
      'Z': ['ZZZZ', '   Z', '  Z ', ' Z  ', 'ZZZZ'],
      ' ': ['    ', '    ', '    ', '    ', '    '],
      '!': ['!', '!', '!', ' ', '!'],
      '?': ['???', '  ?', ' ? ', '   ', ' ? '],
      '0': ['000', '0 0', '0 0', '0 0', '000'],
      '1': [' 1 ', ' 11', ' 1 ', ' 1 ', '111'],
      '2': ['222', '  2', '222', '2  ', '222'],
      '3': ['333', '  3', '333', '  3', '333'],
      '4': ['4 4', '4 4', '444', '  4', '  4'],
      '5': ['555', '5  ', '555', '  5', '555'],
      '6': ['666', '6  ', '666', '6 6', '666'],
      '7': ['777', '  7', '  7', ' 7 ', '7  '],
      '8': ['888', '8 8', '888', '8 8', '888'],
      '9': ['999', '9 9', '999', '  9', '999']
    };
    for (let row = 0; row < 5; row++) {
      for (let ci = 0; ci < chars.length; ci++) {
        const f = font[chars[ci]];
        lines[row] += f ? f[row] : ' ?? ';
        if (ci < chars.length - 1) lines[row] += ' ';
      }
    }
    return '> ' + lines.join('\n> ');
  }, 'Generate ASCII art banner\n  figlet <text>', 'util');

  // ─── WEATHER ────────────────────────────────────────────────────

  reg.register('weather', async function (args: string[]): Promise<string | null> {
    const city = args.join(' ') || '';
    const url = city ? 'https://wttr.in/' + encodeURIComponent(city) + '?format=4' : 'https://wttr.in?format=4';
    try {
      const res = await fetch(url);
      if (!res.ok) return '> error: HTTP ' + res.status;
      const text = await res.text();
      return '> ' + text.trim();
    } catch (e: any) {
      return '> error: ' + e.message;
    }
  }, 'Show weather forecast\n  weather [city]', 'util');

  // ─── TOP ──────────────────────────────────────────────────────────

  reg.register('top', async function (_args: string[], ctx: GashContext): Promise<string | null> {
    const jobsCount = R ? Object.keys(R.jobs).length : 0;
    let fsCount = 0;
    try { const all = await (ctx.fs as any)._getAll(); fsCount = all.length; } catch (e) { /* ignore */ }
    const uptime = Math.round((Date.now() - performance.timing.navigationStart) / 1000) + 's';
    const mem = (navigator as any).deviceMemory ? (navigator as any).deviceMemory + 'GB' : 'N/A';
    const conn = (navigator as any).connection ? (navigator as any).connection.effectiveType : 'N/A';
    return '> ' + [
      'GASH v' + (R?.version || VERSION) + '  |  uptime: ' + uptime,
      'user: ' + (ctx.vars.USER || 'gashuser') + '  |  hostname: ' + (ctx.hostname || 'gashbox'),
      'CWD: ' + ctx.fs.cwd,
      'VFS files: ' + fsCount + '  |  jobs: ' + jobsCount,
      'RAM: ' + mem + '  |  connection: ' + conn,
      'history: ' + ctx.history.length + ' entries'
    ].join('\n> ');
  }, 'Show system information\n  top', 'util');

  // ─── MAN ──────────────────────────────────────────────────────────

  reg.register('man', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: man <command>';
    const topic = args[0].toLowerCase();
    const cmd = reg.commands[topic];
    if (!cmd) return '> no manual entry for ' + topic;
    const help = cmd.help || 'No help available.';
    const category = cmd.category || 'unknown';
    return '> ' + [
      '',
      topic + '(' + category + ')',
      '',
      help
    ].join('\n> ');
  }, 'Show detailed command help\n  man <command>', 'util');

  // ─── CRON ─────────────────────────────────────────────────────────

  reg.register('cron', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> usage: cron <list|add|rm> [args]';
    const sub = args[0];

    if (sub === 'list') {
      try {
        const entries = await ctx.fs.readdir('/var/spool/cron');
        if (!entries.length) return '> no cron jobs';
        const out: string[] = [];
        for (let ei = 0; ei < entries.length; ei++) {
          const e = entries[ei];
          if (e.type === 'file') {
            const content = await ctx.fs.readFile('/var/spool/cron/' + e.name);
            out.push(e.name + ': ' + content);
          }
        }
        return '> ' + out.join('\n> ');
      } catch (e) { return '> no cron jobs'; }
    }

    if (sub === 'add') {
      if (args.length < 3) return '> error: usage: cron add <interval_sec> <command>';
      const interval = parseInt(args[1]);
      if (isNaN(interval) || interval < 1) return '> error: interval must be a positive number';
      const cmdStr = args.slice(2).join(' ');
      const name = 'cron_' + Date.now();
      try {
        await ctx.fs.mkdirp('/var/spool/cron');
        await ctx.fs.writeFile('/var/spool/cron/' + name, interval + ' ' + cmdStr);
        return '> installed cron job: ' + name + ' (every ' + interval + 's)';
      } catch (e: any) { return '> error: ' + e.message; }
    }

    if (sub === 'rm' || sub === 'remove') {
      if (!args[1]) return '> error: usage: cron rm <jobname>';
      const path = '/var/spool/cron/' + args[1];
      try {
        if (await ctx.fs.exists(path)) {
          await ctx.fs.delete(path);
          return '> removed cron job: ' + args[1];
        }
        return '> cron job not found: ' + args[1];
      } catch (e: any) { return '> error: ' + e.message; }
    }

    return '> usage: cron <list|add|rm>';
  }, 'Scheduler (tasks stored in /var/spool/cron/)\n  cron add <sec> <cmd>    Add a recurring command\n  cron list               List cron jobs\n  cron rm <name>          Remove a cron job', 'sys');

  // ─── SERVE (HTTP via Service Worker) ──────────────────────────

  reg.register('serve', async function (args: string[], ctx: GashContext): Promise<string | null> {
    const port = args[0] || '8080';
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      ctx.addToConsole('> Service Worker active. Serving VFS on port ' + port + '...');
      ctx.addToConsole('> (open DevTools > Application > Service Workers to see status)');
      return null;
    } else if ('serviceWorker' in navigator) {
      ctx.addToConsole('> Registering Service Worker for HTTP serving...');
      try {
        const swReg = await navigator.serviceWorker.register('/sw.js');
        ctx.addToConsole('> SW registered. VFS files should be served at origin.');
        ctx.addToConsole('> Note: requires sw.js in the root directory.');
      } catch (e: any) {
        return '> error: ' + e.message;
      }
      return null;
    }
    return '> Service Workers not supported in this browser.';
  }, 'Start HTTP file server (via Service Worker)\n  serve [port]', 'sys');

  // ─── BASE64 ───────────────────────────────────────────────────

  reg.register('base64', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: base64 encode|decode <text>';
    const op = args[0];
    const text = args.slice(1).join(' ');
    if (op === 'encode') {
      try { return '> ' + btoa(unescape(encodeURIComponent(text))); }
      catch (e: any) { return `> error: ${e.message}`; }
    }
    if (op === 'decode') {
      try { return '> ' + decodeURIComponent(escape(atob(text))); }
      catch (e: any) { return `> error: invalid base64: ${e.message}`; }
    }
    return '> error: usage: base64 encode|decode <text>';
  }, 'Base64 encode/decode\n  base64 encode <text>   Base64 encode text\n  base64 decode <text>   Base64 decode text', 'util');

  // ─── HASH ──────────────────────────────────────────────────────

  reg.register('hash', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: hash <algorithm> <text>';
    const algo = args[0].toLowerCase();
    const text = args.slice(1).join(' ');
    const algoMap: Record<string, string> = {
      'sha-256': 'SHA-256', 'sha256': 'SHA-256',
      'sha-1': 'SHA-1', 'sha1': 'SHA-1',
      'md5': 'MD5',
      'sha-384': 'SHA-384', 'sha384': 'SHA-384',
      'sha-512': 'SHA-512', 'sha512': 'SHA-512'
    };
    const webAlgo = algoMap[algo];
    if (!webAlgo && algo !== 'simple') {
      return `> error: unknown algorithm: ${algo} (use sha-256, sha-1, md5, or simple)`;
    }
    if (algo === 'simple') {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const chr = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
      }
      return '> ' + (hash >>> 0).toString(16).padStart(8, '0');
    }
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest(webAlgo!, data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return '> ' + hashHex;
    } catch (e: any) {
      return `> error: hashing failed: ${e.message}`;
    }
  }, 'Hash text\n  hash <algorithm> <text>\n  Algorithms: sha-256, sha-1, md5, sha-384, sha-512, simple', 'util');

  // ─── UUID ──────────────────────────────────────────────────────

  reg.register('uuid', async function (): Promise<string | null> {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return '> ' + crypto.randomUUID();
    }
    return '> ' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }, 'Generate UUID v4\n  uuid', 'util');

  // ─── JSON OPS ──────────────────────────────────────────────────

  reg.register('json', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: json <format|minify|validate|get> [args]';
    const op = args[0];

    if (op === 'format' || op === 'pretty') {
      let input = ctx.pipeInput || args.slice(1).join(' ');
      if (!input) return '> error: provide JSON text or pipe it';
      try {
        const parsed = JSON.parse(input);
        return '> ' + JSON.stringify(parsed, null, 2);
      } catch (e: any) {
        return `> error: invalid JSON: ${e.message}`;
      }
    }

    if (op === 'minify') {
      let input = ctx.pipeInput || args.slice(1).join(' ');
      if (!input) return '> error: provide JSON text or pipe it';
      try {
        const parsed = JSON.parse(input);
        return '> ' + JSON.stringify(parsed);
      } catch (e: any) {
        return `> error: invalid JSON: ${e.message}`;
      }
    }

    if (op === 'validate') {
      let input = ctx.pipeInput || args.slice(1).join(' ');
      if (!input) return '> error: provide JSON text or pipe it';
      try {
        JSON.parse(input);
        return '> valid JSON';
      } catch (e: any) {
        return `> invalid JSON: ${e.message}`;
      }
    }

    if (op === 'get') {
      if (args.length < 3 && !ctx.pipeInput) return '> error: usage: json get <path> <json>';
      const jsonPath = args[1];
      const input = ctx.pipeInput || args.slice(2).join(' ');
      if (!input) return '> error: provide JSON text or pipe it';
      try {
        const parsed = JSON.parse(input);
        const parts = jsonPath.split('.').filter(Boolean);
        let current: any = parsed;
        for (const part of parts) {
          if (current == null) return `> error: cannot access "${part}" on null/undefined`;
          current = current[part];
        }
        if (current === undefined) return `> undefined`;
        if (typeof current === 'object') return '> ' + JSON.stringify(current, null, 2);
        return '> ' + String(current);
      } catch (e: any) {
        return `> error: ${e.message}`;
      }
    }

    return '> error: usage: json <format|minify|validate|get> [args]';
  }, 'JSON operations\n  json format <text>    Format/prettify JSON\n  json minify <text>    Minify JSON\n  json validate <text>  Validate JSON\n  json get <path> <json> Get value at JSON path (e.g. json get foo.bar <json>)', 'util');

  // ─── DIFF ──────────────────────────────────────────────────────

  reg.register('diff', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: diff <file1> <file2>';
    let content1: string;
    let content2: string;
    try { content1 = await ctx.fs.readFile(args[0]); } catch (err: any) { return `> error: ${err.message}`; }
    try { content2 = await ctx.fs.readFile(args[1]); } catch (err: any) { return `> error: ${err.message}`; }
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    const maxLen = Math.max(lines1.length, lines2.length);
    const output: string[] = [];
    let diffs = 0;
    for (let i = 0; i < maxLen; i++) {
      const l1 = lines1[i];
      const l2 = lines2[i];
      if (l1 === undefined) {
        output.push(`> + ${l2}`);
        diffs++;
      } else if (l2 === undefined) {
        output.push(`> - ${l1}`);
        diffs++;
      } else if (l1 !== l2) {
        output.push(`> - ${l1}`);
        output.push(`> + ${l2}`);
        diffs++;
      }
    }
    if (!diffs) return '> files are identical';
    return output.join('\n');
  }, 'Compare two files line by line\n  diff <file1> <file2>', 'util');

  // ─── FORTUNE ───────────────────────────────────────────────────

  reg.register('fortune', async function (): Promise<string | null> {
    const idx = Math.floor(Math.random() * FORTUNES.length);
    return '> ' + FORTUNES[idx];
  }, 'Random fortune cookie message\n  fortune', 'util');

  // ─── COWSAY ────────────────────────────────────────────────────

  reg.register('cowsay', async function (args: string[]): Promise<string | null> {
    if (!args.length) return '> error: usage: cowsay <text>';
    const text = args.join(' ');
    const maxLen = Math.min(text.length, 40);
    const border = '-'.repeat(maxLen + 2);
    let wrapped = text;
    if (text.length > 40) {
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > 40) {
          lines.push(current.trim());
          current = word;
        } else {
          current += ' ' + word;
        }
      }
      if (current.trim()) lines.push(current.trim());
      wrapped = lines.join('\n');
    }
    const wrappedLines = wrapped.split('\n');
    const bubble = wrappedLines.length === 1
      ? ` ${wrapped} `
      : wrappedLines.map((l, i) => {
          if (i === 0) return ` ${'_'.repeat(l.length + 1)}`;
          if (i === wrappedLines.length - 1) return ` ${l} ` + '\\'.padStart(1, ' ') + '\n  ' + '-'.repeat(l.length + 1);
          return `| ${l} |`;
        }).join('\n');
    return ` ${'-'.repeat(wrappedLines[0].length + 2)}\n${bubble}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`;
  }, 'Cow says text\n  cowsay <text>', 'util');

  // ─── WATCH ─────────────────────────────────────────────────────

  reg.register('watch', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: watch <interval_seconds> <command>';
    const interval = parseInt(args[0]);
    if (isNaN(interval) || interval < 1) return '> error: interval must be a positive number';
    const cmdStr = args.slice(1).join(' ');
    const maxRuns = 10;
    let runs = 0;
    ctx.addToConsole(`> watching "${cmdStr}" every ${interval}s (max ${maxRuns} runs)...`);
    return new Promise<string | null>(resolve => {
      const timer = setInterval(async () => {
        runs++;
        ctx.addToConsole(`> [watch ${runs}/${maxRuns}] $ ${cmdStr}`);
        try {
          await ctx.processCommand(cmdStr);
        } catch (e) {
          // ignore errors in watched commands
        }
        if (runs >= maxRuns) {
          clearInterval(timer);
          resolve(`> watch completed after ${maxRuns} runs`);
        }
      }, interval * 1000);
    });
  }, 'Repeat command every N seconds (limited to 10 runs)\n  watch <seconds> <command>', 'util');

  // ─── TIMEOUT ───────────────────────────────────────────────────

  reg.register('timeout', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (args.length < 2) return '> error: usage: timeout <milliseconds> <command>';
    const ms = parseInt(args[0]);
    if (isNaN(ms) || ms < 1) return '> error: timeout must be a positive number';
    const cmdStr = args.slice(1).join(' ');
    const timeoutPromise = new Promise<string | null>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    });
    try {
      const result = await Promise.race([
        ctx.processCommandSync(cmdStr),
        timeoutPromise
      ]);
      return result;
    } catch (e: any) {
      if (e.message === 'timeout') return `> error: command timed out after ${ms}ms`;
      return `> error: ${e.message}`;
    }
  }, 'Run command with a timeout\n  timeout <milliseconds> <command>', 'util');

  // ─── XARGS ─────────────────────────────────────────────────────

  reg.register('xargs', async function (args: string[], ctx: GashContext): Promise<string | null> {
    if (!args.length) return '> error: usage: xargs <command>';
    const input = ctx.pipeInput;
    if (!input) return '> error: xargs requires piped input';
    const cmdBase = args.join(' ');
    const lines = input.split('\n').filter(l => l.trim());
    const output: string[] = [];
    for (const line of lines) {
      const cmd = cmdBase + ' ' + line;
      ctx.addToConsole(`> $ ${cmd}`);
      try {
        await ctx.processCommand(cmd);
      } catch (e) {
        // continue processing
      }
    }
    return null;
  }, 'Build commands from piped input (one line per invocation)\n  <text> | xargs <command>', 'util');

  // ─── EASTER EGGS ───────────────────────────────────────────────

  reg.register('game', async function (): Promise<string | null> {
    return '> ' + 'A'.repeat(200);
  }, 'hidden', 'util');

  reg.register('us4', async function (args: string[]): Promise<string | null> {
    if (args[0] === 'link') {
      window.open('https://voucan.github.io/link-hub', '_blank');
      return '> opening US4 link hub...';
    }
    if (args[0] === 'open') {
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const rl = letters[Math.floor(Math.random() * letters.length)];
      window.open(`https://us4-${rl}.global.ssl.fastly.net/cloak`, '_blank');
      return '> opening US4 unblocked games...';
    }
    return '> usage: us4 <link|open>';
  }, 'hidden', 'util');

  reg.register('JaydenDash6', async function (): Promise<string | null> {
    alert('what.');
    return '> how do you know my geometry dash name?!';
  }, 'hidden', 'util');
}
