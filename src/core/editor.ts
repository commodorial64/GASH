import type { VirtualFileSystem } from './filesystem';
import type { GashConfig } from './types';

interface EditorResult {
  output?: string | null;
  stayOpen?: boolean;
  saveAndContinue?: boolean;
  saveAndQuit?: boolean;
  saved?: boolean;
}

export interface TabDomRefs {
  consoleEl: HTMLElement;
  promptEl: HTMLElement;
  inputEl: HTMLInputElement;
}

export class Editor {
  active = false;
  filename = '';
  lines: string[] = [];
  modified = false;
  overlay: HTMLElement | null = null;
  textarea: HTMLTextAreaElement | null = null;
  mode = 'visual';
  fs: VirtualFileSystem | null = null;
  private _config: GashConfig | null = null;
  private _onClose: (() => void) | null = null;
  private _tabDom: TabDomRefs | null = null;

  setCloseCallback(cb: () => void): void {
    this._onClose = cb;
  }

  async open(filename: string, fs: VirtualFileSystem, mode: string, config?: GashConfig, tabDom?: TabDomRefs): Promise<string> {
    this.filename = filename;
    this.active = true;
    this.modified = false;
    this.fs = fs;
    this.mode = mode || 'visual';
    this._config = config || null;
    this._tabDom = tabDom || null;
    try {
      if (await fs.exists(filename)) {
        const content = await fs.readFile(filename);
        this.lines = content ? content.split('\n') : [''];
      } else {
        this.lines = [''];
      }
    } catch {
      this.lines = [''];
    }
    if (this.mode === 'visual') {
      this._createOverlay();
      return '> \u270F opened ' + filename + ' (visual mode)';
    }
    return this._render();
  }

  private _createOverlay(): void {
    if (this._tabDom) {
      this._tabDom.consoleEl.style.display = 'none';
      this._tabDom.promptEl.style.display = 'none';
    } else {
      const consoleEl = document.querySelector('.tab-panel.active .console-output') as HTMLElement;
      const promptEl = document.querySelector('.tab-panel.active .prompt') as HTMLElement;
      if (consoleEl) consoleEl.style.display = 'none';
      if (promptEl) promptEl.style.display = 'none';
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'editor-overlay';

    const header = document.createElement('div');
    header.id = 'editor-header';
    header.innerHTML = '\u270F <span id="editor-filename">' + this._esc(this.filename) + '</span><span id="editor-status"></span>';

    this.textarea = document.createElement('textarea');
    this.textarea.id = 'editor-textarea';
    this.textarea.value = this.lines.join('\n');
    this.textarea.spellcheck = false;

    const footer = document.createElement('div');
    footer.id = 'editor-footer';
    footer.textContent = 'Ctrl+S save  |  Esc save && quit  |  Tab: 4 spaces';

    this.overlay.appendChild(header);
    this.overlay.appendChild(this.textarea);
    this.overlay.appendChild(footer);

    if (this._config && this._config.theme && this._config.theme !== 'default') {
      this.overlay.className = 'theme-' + this._config.theme;
    }

    document.body.appendChild(this.overlay);
    this.textarea.focus();
    this.textarea.addEventListener('keydown', this._onKey.bind(this));
  }

  private _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private _onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this._saveVisual();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this._closeVisual();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.textarea!.selectionStart;
      const end = this.textarea!.selectionEnd;
      this.textarea!.value = this.textarea!.value.substring(0, start) + '    ' + this.textarea!.value.substring(end);
      this.textarea!.selectionStart = this.textarea!.selectionEnd = start + 4;
      return;
    }
  }

  private _status(msg: string): void {
    const el = document.getElementById('editor-status');
    if (el) { el.textContent = '  (' + msg + ')'; }
  }

  private async _saveVisual(): Promise<void> {
    try {
      await this.fs!.writeFile(this.filename, this.textarea!.value);
      this.lines = this.textarea!.value.split('\n');
      this.modified = false;
      this._status('saved');
      setTimeout(() => this._status(''), 2000);
    } catch (e: any) {
      this._status('save failed: ' + e.message);
    }
  }

  private async _closeVisual(): Promise<void> {
    await this._saveVisual();
    this._destroyOverlay();
    this.active = false;
    if (this._onClose) this._onClose();
    this._onClose = null;
  }

  private _destroyOverlay(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.textarea = null;
    if (this._tabDom) {
      this._tabDom.consoleEl.style.display = '';
      this._tabDom.promptEl.style.display = '';
      this._tabDom.inputEl.focus();
    } else {
      const activePanel = document.querySelector('.tab-panel.active');
      if (activePanel) {
        const consoleEl = activePanel.querySelector('.console-output') as HTMLElement;
        const promptEl = activePanel.querySelector('.prompt') as HTMLElement;
        if (consoleEl) consoleEl.style.display = '';
        if (promptEl) promptEl.style.display = '';
        const inp = activePanel.querySelector('.input-field') as HTMLInputElement;
        if (inp) inp.focus();
      }
    }
    this._tabDom = null;
  }

  private _render(): string {
    let out = '> \u270F EDITING: ' + this.filename + '\n';
    if (this.modified) out += '> (modified)\n';
    out += '> ' + '\u2500'.repeat(50) + '\n';
    const lw = String(this.lines.length).length;
    for (let i = 0; i < this.lines.length; i++) {
      out += '> ' + String(i + 1).padStart(lw, ' ') + ' | ' + this.lines[i] + '\n';
    }
    out += '> ' + '\u2500'.repeat(50) + '\n';
    out += '> :h for help, :v for visual mode';
    return out;
  }

  processCommand(input: string): EditorResult | null {
    if (!this.active) return null;
    const trimmed = input.trim();
    if (!trimmed.startsWith(':')) {
      return { output: '> Editor: commands must start with ":"\n> :h for help', stayOpen: true };
    }
    const cmd = trimmed.slice(1).trim();
    const parts = cmd.split(/\s+/);
    const action = parts[0];
    const args = parts.slice(1);

    switch (action) {
      case 'h':
      case 'help': {
        const help = [
          'Editor Commands:',
          '  :i <line> <text>   - Insert text at line number',
          '  :a <text>          - Append text to end of file',
          '  :d <line>          - Delete line by number',
          '  :r <line> <text>   - Replace line at number',
          '  :w                 - Save file',
          '  :q                 - Quit without saving',
          '  :wq                - Save and quit',
          '  :p                 - Print file with line numbers',
          '  :n                 - Show number of lines',
          '  :c                 - Clear all lines',
          '  :v                 - Switch to visual (textarea) mode',
          '  :h                 - Show this help'
        ].join('\n');
        return { output: '> ' + help.split('\n').join('\n> '), stayOpen: true };
      }

      case 'v':
      case 'visual': {
        this._createOverlay();
        return { output: null, stayOpen: false };
      }

      case 'p':
      case 'print':
        return { output: this._render(), stayOpen: true };

      case 'n':
      case 'lines':
        return { output: '> ' + this.lines.length + ' lines', stayOpen: true };

      case 'c':
      case 'clear':
        this.lines = [''];
        this.modified = true;
        return { output: '> all lines cleared', stayOpen: true };

      case 'i':
      case 'insert': {
        const lineNum = parseInt(args[0]);
        if (isNaN(lineNum) || lineNum < 1)
          return { output: '> usage: :i <line> <text>', stayOpen: true };
        const text = args.slice(1).join(' ');
        const idx = Math.min(lineNum - 1, this.lines.length);
        this.lines.splice(idx, 0, text);
        this.modified = true;
        return { output: '> inserted at line ' + lineNum + '\n' + this._render(), stayOpen: true };
      }

      case 'a':
      case 'append': {
        const text = args.join(' ');
        this.lines.push(text);
        this.modified = true;
        return { output: '> appended line ' + this.lines.length + '\n' + this._render(), stayOpen: true };
      }

      case 'd':
      case 'delete': {
        const lineNum = parseInt(args[0]);
        if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length)
          return { output: '> invalid line: ' + args[0], stayOpen: true };
        const deleted = this.lines.splice(lineNum - 1, 1)[0];
        if (this.lines.length === 0) this.lines = [''];
        this.modified = true;
        return { output: '> deleted line ' + lineNum + ': ' + deleted + '\n' + this._render(), stayOpen: true };
      }

      case 'r':
      case 'replace': {
        const lineNum = parseInt(args[0]);
        if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length)
          return { output: '> invalid line: ' + args[0], stayOpen: true };
        const text = args.slice(1).join(' ');
        this.lines[lineNum - 1] = text;
        this.modified = true;
        return { output: '> replaced line ' + lineNum + '\n' + this._render(), stayOpen: true };
      }

      case 'w':
      case 'save':
        return { output: null, stayOpen: true, saveAndContinue: true };

      case 'q':
      case 'quit':
        if (this.modified)
          return { output: '> file modified! Use :wq to save and quit, :q! to force quit', stayOpen: true };
        this.active = false;
        return { output: '> closed editor (' + this.filename + ')', stayOpen: false, saved: false };

      case 'q!':
      case 'quit!':
        this.active = false;
        return { output: '> closed editor without saving (' + this.filename + ')', stayOpen: false, saved: false };

      case 'wq':
      case 'x':
      case 'savequit':
        return { output: null, stayOpen: false, saveAndQuit: true };

      default:
        return { output: '> unknown editor command: :' + action + '\n> :h for help', stayOpen: true };
    }
  }

  async save(fs: VirtualFileSystem): Promise<void> {
    const content = this.lines.join('\n');
    await fs.writeFile(this.filename, content);
    this.modified = false;
  }
}
