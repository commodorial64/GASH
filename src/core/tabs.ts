import { Editor } from './editor';

export interface TabState {
  id: number;
  name: string;
  vars: Record<string, string>;
  history: string[];
  historyIndex: number;
  waitingForFunction: string | { type: string; code: string } | null;
  editorMode: boolean;
  filteredHistory: string[];
  historySearchMode: boolean;
  historySearchQuery: string;
  socket: WebSocket | null;
  inputHook: ((line: string) => void | Promise<void>) | null;

  panel: HTMLElement;
  consoleEl: HTMLElement;
  promptEl: HTMLElement;
  promptLabel: HTMLElement;
  inputEl: HTMLInputElement;

  addToConsole: (text: string, cls?: string) => void;
  _clearConsole: () => void;
  _updatePrompt: () => void;
}

export class TabManager {
  private tabs: TabState[] = [];
  private activeTabId: number = 0;
  private nextTabId: number = 1;
  private tabBar: HTMLElement;
  private tabPanels: HTMLElement;
  private tabAddBtn: HTMLElement;
  private editor: Editor;
  private version: string;
  private onCloseCallback: ((tab: TabState) => void) | null = null;

  constructor(editor: Editor, version: string) {
    this.tabBar = document.getElementById('tab-bar')!;
    this.tabPanels = document.getElementById('tab-panels')!;
    this.tabAddBtn = document.getElementById('tab-add')!;
    this.editor = editor;
    this.version = version;

    this.tabAddBtn.addEventListener('click', () => {
      const tab = this.createTab();
      this.switchTab(tab.id);
    });
  }

  setOnCloseCallback(cb: (tab: TabState) => void): void {
    this.onCloseCallback = cb;
  }

  createTab(name?: string): TabState {
    const id = this.nextTabId++;
    const tabName = name || `Tab ${id}`;

    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.tabId = String(id);

    const consoleEl = document.createElement('div');
    consoleEl.className = 'console-output';

    const promptEl = document.createElement('div');
    promptEl.className = 'prompt';

    const promptLabel = document.createElement('span');
    promptLabel.className = 'prompt-label';
    promptLabel.textContent = 'GASH $ ';

    const inputEl = document.createElement('input');
    inputEl.className = 'input-field';
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.setAttribute('autocorrect', 'off');
    inputEl.spellcheck = false;

    promptEl.appendChild(promptLabel);
    promptEl.appendChild(inputEl);
    panel.appendChild(consoleEl);
    panel.appendChild(promptEl);
    this.tabPanels.appendChild(panel);

    const tabBtn = document.createElement('div');
    tabBtn.className = 'tab';
    tabBtn.dataset.tabId = String(id);

    const tabNameSpan = document.createElement('span');
    tabNameSpan.className = 'tab-name';
    tabNameSpan.textContent = tabName;

    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.textContent = ' \u00d7';

    tabBtn.appendChild(tabNameSpan);
    tabBtn.appendChild(tabClose);
    this.tabBar.insertBefore(tabBtn, this.tabAddBtn);

    const tab: TabState = {
      id,
      name: tabName,
      vars: {
        PWD: '/',
        HOME: '/',
        USER: 'gashuser',
        SHELL: 'GASH',
        _intHeaders: '{}'
      },
      history: [],
      historyIndex: -1,
      waitingForFunction: null,
      editorMode: false,
      filteredHistory: [],
      historySearchMode: false,
      historySearchQuery: '',
      socket: null,
      inputHook: null,
      panel,
      consoleEl,
      promptEl,
      promptLabel,
      inputEl,
      addToConsole: (text: string, cls?: string) => {
        if (text == null || text === '') return;
        const clsAttr = cls ? ` class="${cls}"` : '';
        consoleEl.innerHTML += `<div${clsAttr}><span class="prompt-gash">&gt; </span>${text}</div>`;
        consoleEl.scrollTop = consoleEl.scrollHeight;
      },
      _clearConsole: () => {
        const welcome = `Welcome to GASH - Galaxy's Developer Shell v${this.version}\nType your commands below...\nType 'help' for available commands.`;
        consoleEl.innerHTML = `<div><span class="prompt-gash">&gt; </span>${welcome.replace(/\n/g, '<br>')}</div>`;
      },
      _updatePrompt: () => {
        if (!promptLabel) return;
        if (tab.editorMode) {
          promptLabel.textContent = `EDIT:${this.editor.filename}> `;
        } else if (tab.inputHook) {
          promptLabel.textContent = `>>> `;
        } else if (tab.waitingForFunction) {
          promptLabel.textContent = `func> `;
        } else if (tab.historySearchMode) {
          promptLabel.textContent = `(search) `;
        } else {
          const cwd = tab.vars.PWD || '/';
          const user = tab.vars.USER || 'gashuser';
          const host = 'gashbox';
          const home = tab.vars.HOME || '/home/' + user;
          const display = cwd === home ? '~' : cwd;
          promptLabel.textContent = `${user}@${host}:${display}$ `;
        }
        if (inputEl && document.activeElement !== inputEl) {
          inputEl.focus();
        }
      }
    };

    this.tabs.push(tab);

    tabBtn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tab-close')) {
        this.closeTab(id);
      } else {
        this.switchTab(id);
      }
    });

    if (this.tabs.length === 1) {
      this.switchTab(id);
    }

    return tab;
  }

  switchTab(id: number): void {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    const currentTab = this.getActiveTab();
    if (currentTab) {
      currentTab.panel.classList.remove('active');
      const currentBtn = this.tabBar.querySelector(`.tab[data-tab-id="${currentTab.id}"]`);
      if (currentBtn) currentBtn.classList.remove('active');
    }

    tab.panel.classList.add('active');
    const newBtn = this.tabBar.querySelector(`.tab[data-tab-id="${tab.id}"]`);
    if (newBtn) newBtn.classList.add('active');

    this.activeTabId = id;
    tab.inputEl.focus();
    tab._updatePrompt();
  }

  closeTab(id: number): void {
    if (this.tabs.length <= 1) return;

    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    if (this.onCloseCallback) {
      this.onCloseCallback(tab);
    }

    tab.panel.remove();
    const btn = this.tabBar.querySelector(`.tab[data-tab-id="${id}"]`);
    if (btn) btn.remove();

    this.tabs = this.tabs.filter(t => t.id !== id);

    if (this.activeTabId === id) {
      const lastTab = this.tabs[this.tabs.length - 1];
      this.switchTab(lastTab.id);
    }
  }

  getActiveTab(): TabState | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  getAllTabs(): TabState[] {
    return this.tabs;
  }

  getTabCount(): number {
    return this.tabs.length;
  }

  renameTab(id: number, name: string): void {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    tab.name = name;
    const btn = this.tabBar.querySelector(`.tab[data-tab-id="${id}"] .tab-name`);
    if (btn) btn.textContent = name;
  }
}
