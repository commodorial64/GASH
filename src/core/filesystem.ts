export interface VirtualFile {
  path: string;
  type: 'file' | 'directory';
  content: string;
  parent: string | null;
  created: number;
  modified: number;
}

export interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: number;
}

export class VirtualFileSystem {
  private db: IDBDatabase | null = null;
  private _cwd = '/';
  ready = false;
  private _initPromise: Promise<VirtualFileSystem> | null = null;

  async init(): Promise<VirtualFileSystem> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = new Promise<VirtualFileSystem>((resolve, reject) => {
      const req = indexedDB.open('GASH_FS', 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'path' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('parent', 'parent', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        this.ready = true;
        resolve(this);
      };
      req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
    });
    await this._initPromise;
    await this._ensureRoot();
    return this;
  }

  private async _ensureRoot(): Promise<void> {
    const exists = await this.exists('/');
    if (!exists) {
      await this._put({
        path: '/', type: 'directory', content: '',
        parent: null, created: Date.now(), modified: Date.now()
      });
    }
  }

  private _withStore(mode: IDBTransactionMode, callback: (store: IDBObjectStore, resolve: (v: any) => void, reject: (e: any) => void) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('files', mode);
      const store = tx.objectStore('files');
      callback(store, resolve, reject);
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    });
  }

  private _put(entry: VirtualFile): Promise<void> {
    return this._withStore('readwrite', (store, resolve, reject) => {
      const req = store.put(entry);
      req.onsuccess = () => resolve(undefined);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }

  private _get(path: string): Promise<VirtualFile | undefined> {
    return this._withStore('readonly', (store, resolve, reject) => {
      const req = store.get(path);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }

  private _delete(path: string): Promise<void> {
    return this._withStore('readwrite', (store, resolve, reject) => {
      const req = store.delete(path);
      req.onsuccess = () => resolve(undefined);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }

  private _getAll(): Promise<VirtualFile[]> {
    return this._withStore('readonly', (store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }

  private _getByIndex(indexName: string, value: string): Promise<VirtualFile[]> {
    return this._withStore('readonly', (store, resolve, reject) => {
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }

  normalizePath(path: string): string {
    if (!path) path = '.';
    if (!path.startsWith('/')) {
      path = this._cwd + (this._cwd.endsWith('/') ? '' : '/') + path;
    }
    const parts = path.split('/').filter(p => p && p !== '.');
    const result: string[] = [];
    for (const p of parts) {
      if (p === '..') { if (result.length) result.pop(); }
      else result.push(p);
    }
    const normalized = '/' + result.join('/');
    return normalized || '/';
  }

  get cwd(): string { return this._cwd; }
  set cwd(val: string) { this._cwd = val; }

  async exists(path: string): Promise<boolean> {
    const entry = await this._get(this.normalizePath(path));
    return !!entry;
  }

  async isDirectory(path: string): Promise<boolean> {
    const entry = await this._get(this.normalizePath(path));
    return !!(entry && entry.type === 'directory');
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const normalized = this.normalizePath(path);
    const entries = await this._getByIndex('parent', normalized);
    return entries.map(e => ({
      name: e.path.split('/').pop()!,
      type: e.type,
      size: e.type === 'file' ? (e.content || '').length : 0,
      modified: e.modified
    })).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async mkdir(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (normalized === '/') throw new Error('Cannot create root');
    if (await this.exists(normalized)) throw new Error(`Already exists: ${normalized}`);
    const parent = normalized.split('/').slice(0, -1).join('/') || '/';
    const parentEntry = await this._get(parent);
    if (!parentEntry) throw new Error(`Parent not found: ${parent}`);
    if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parent}`);
    await this._put({
      path: normalized, type: 'directory', content: '',
      parent, created: Date.now(), modified: Date.now()
    });
  }

  async mkdirp(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (normalized === '/') return;
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      if (!(await this.exists(current))) {
        await this._put({
          path: current, type: 'directory', content: '',
          parent: current.split('/').slice(0, -1).join('/') || '/',
          created: Date.now(), modified: Date.now()
        });
      }
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (normalized === '/') throw new Error('Cannot write to root');
    const parent = normalized.split('/').slice(0, -1).join('/') || '/';
    const parentEntry = await this._get(parent);
    if (!parentEntry) throw new Error(`Parent not found: ${parent}`);
    if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parent}`);
    const existing = await this._get(normalized);
    if (existing) {
      existing.content = content;
      existing.modified = Date.now();
      if (existing.type !== 'file') throw new Error(`Not a file: ${normalized}`);
      await this._put(existing);
    } else {
      await this._put({
        path: normalized, type: 'file', content,
        parent, created: Date.now(), modified: Date.now()
      });
    }
  }

  async readFile(path: string): Promise<string> {
    const normalized = this.normalizePath(path);
    const entry = await this._get(normalized);
    if (!entry) throw new Error(`File not found: ${normalized}`);
    if (entry.type === 'directory') throw new Error(`Is a directory: ${normalized}`);
    return entry.content || '';
  }

  async delete(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (normalized === '/') throw new Error('Cannot delete root');
    const entry = await this._get(normalized);
    if (!entry) throw new Error(`Not found: ${normalized}`);
    if (entry.type === 'directory') {
      const children = await this._getByIndex('parent', normalized);
      if (children.length > 0) throw new Error(`Directory not empty: ${normalized}`);
    }
    await this._delete(normalized);
  }

  async rmrf(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (normalized === '/') throw new Error('Cannot delete root');
    const all = await this._getAll();
    const toDelete = all.filter(e => e.path === normalized || e.path.startsWith(normalized + '/'));
    for (const entry of toDelete.sort((a, b) => b.path.length - a.path.length)) {
      await this._delete(entry.path);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);
    if (normalizedOld === '/') throw new Error('Cannot rename root');
    const entry = await this._get(normalizedOld);
    if (!entry) throw new Error(`Not found: ${normalizedOld}`);
    if (await this.exists(normalizedNew)) throw new Error(`Already exists: ${normalizedNew}`);

    entry.path = normalizedNew;
    entry.modified = Date.now();
    entry.parent = normalizedNew.split('/').slice(0, -1).join('/') || '/';
    await this._put(entry);
    await this._delete(normalizedOld);

    if (entry.type === 'directory') {
      const all = await this._getAll();
      const children = all.filter(e => e.path.startsWith(normalizedOld + '/'));
      for (const child of children) {
        const newChildPath = normalizedNew + child.path.slice(normalizedOld.length);
        child.path = newChildPath;
        child.parent = newChildPath.split('/').slice(0, -1).join('/') || '/';
        child.modified = Date.now();
        await this._put(child);
        await this._delete(child.path.replace(normalizedNew, normalizedOld));
      }
    }
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const normalizedSrc = this.normalizePath(srcPath);
    const normalizedDest = this.normalizePath(destPath);
    const entry = await this._get(normalizedSrc);
    if (!entry) throw new Error(`Not found: ${normalizedSrc}`);
    if (await this.exists(normalizedDest)) throw new Error(`Already exists: ${normalizedDest}`);

    if (entry.type === 'directory') {
      await this._put({
        ...entry, path: normalizedDest,
        parent: normalizedDest.split('/').slice(0, -1).join('/') || '/',
        modified: Date.now()
      });
      const all = await this._getAll();
      const children = all.filter(e => e.path.startsWith(normalizedSrc + '/'));
      for (const child of children) {
        const newChildPath = normalizedDest + child.path.slice(normalizedSrc.length);
        await this._put({
          ...child, path: newChildPath,
          parent: newChildPath.split('/').slice(0, -1).join('/') || '/',
          modified: Date.now()
        });
      }
    } else {
      await this._put({
        ...entry, path: normalizedDest,
        parent: normalizedDest.split('/').slice(0, -1).join('/') || '/',
        modified: Date.now()
      });
    }
  }

  async stat(path: string): Promise<VirtualFile & { size: number }> {
    const normalized = this.normalizePath(path);
    const entry = await this._get(normalized);
    if (!entry) throw new Error(`Not found: ${normalized}`);
    return { ...entry, size: entry.type === 'file' ? (entry.content || '').length : 0 };
  }

  async tree(path: string, indent = ''): Promise<string> {
    const normalized = this.normalizePath(path);
    const entries = await this.readdir(normalized);
    let result = '';
    for (let i = 0; i < entries.length; i++) {
      const isLast = i === entries.length - 1;
      const prefix = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
      result += indent + prefix + entries[i].name + '\n';
      if (entries[i].type === 'directory') {
        const subPath = (normalized === '/' ? '' : normalized) + '/' + entries[i].name;
        result += await this.tree(subPath, indent + (isLast ? '    ' : '\u2502   '));
      }
    }
    return result;
  }

  async find(path: string, pattern: string): Promise<string[]> {
    const normalized = this.normalizePath(path);
    const results: string[] = [];
    const all = await this._getAll();
    const entry = await this._get(normalized);
    if (!entry) throw new Error(`Not found: ${normalized}`);

    for (const e of all) {
      if (e.path.startsWith(normalized === '/' ? '/' : normalized + '/')) {
        const name = e.path.split('/').pop()!;
        if (name.includes(pattern)) {
          results.push(e.path);
        }
      }
    }
    return results;
  }

  async populateDefaultStructure(username: string, rootPass: string): Promise<void> {
    const dirs = [
      '/bin', '/dev', '/etc', '/home',
      '/mnt', '/proc', '/root', '/sys',
      '/sys/bin', '/tmp', '/usr',
      '/usr/local', '/usr/local/bin', '/var',
      '/var/log', '/var/tmp', '/var/spool', '/var/spool/cron'
    ];
    for (let i = 0; i < dirs.length; i++) {
      await this.mkdirp(dirs[i]);
    }

    const userDirs = ['Documents', 'Downloads', 'Desktop', '.local'];
    for (let j = 0; j < userDirs.length; j++) {
      await this.mkdirp('/home/' + username + '/' + userDirs[j]);
    }

    const hash = btoa(rootPass);
    const passwdContent = [
      'root:x:0:0:root:/root:/bin/bash',
      username + ':x:1000:1000:' + username + ':/home/' + username + ':/bin/bash'
    ].join('\n');
    const shadowContent = [
      'root:' + hash + ':19000:0:99999:7:::',
      username + ':!:19000:0:99999:7:::'
    ].join('\n');

    await this.writeFile('/etc/hostname', 'gashbox');
    await this.writeFile('/etc/passwd', passwdContent);
    await this.writeFile('/etc/shadow', shadowContent);
    await this.writeFile('/etc/issue', 'GASH Linux \\n \\l');
    await this.writeFile('/etc/group', 'root:x:0:\nusers:x:100:\n');
  }
}
