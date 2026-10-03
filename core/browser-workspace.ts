import { exportWorkspace, importWorkspace, type Workspace } from './workspace.js';

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser workspace storage failed.'));
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error('Browser workspace write was aborted.'));
  });
}

/** Local metadata with revision checks; another tab cannot silently overwrite a saved build. */
export class BrowserWorkspaceStore {
  private constructor(private readonly database: IDBDatabase) {
    database.onversionchange = () => database.close();
  }
  static async open(name = 'scrapmind-workbench'): Promise<BrowserWorkspaceStore> {
    if (typeof indexedDB === 'undefined')
      throw new Error('Browser workspace storage is unavailable.');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other SCRAPMIND tabs and retry opening storage.'));
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open browser workspace.'));
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(new BrowserWorkspaceStore(request.result));
      };
    });
  }
  async load(): Promise<{ workspace: Workspace; revision: number } | undefined> {
    const transaction = this.database.transaction('workspace', 'readonly');
    const completed = done(transaction);
    void completed.catch(() => {});
    const entry = await result(transaction.objectStore('workspace').get('active'));
    await completed;
    if (entry === undefined) return undefined;
    if (
      !Number.isSafeInteger(entry.revision) ||
      entry.revision < 1 ||
      typeof entry.json !== 'string'
    )
      throw new Error('Stored workspace revision is damaged. Import a saved bundle to recover.');
    return { workspace: importWorkspace(entry.json), revision: entry.revision };
  }
  async save(workspace: Workspace, expectedRevision: number): Promise<number> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error('Invalid expected browser revision.');
    const json = exportWorkspace(workspace);
    const transaction = this.database.transaction('workspace', 'readwrite');
    const completed = done(transaction);
    void completed.catch(() => {});
    const store = transaction.objectStore('workspace');
    try {
      const entry = await result(store.get('active'));
      if ((entry?.revision ?? 0) !== expectedRevision) {
        transaction.abort();
        throw new Error(
          'Another tab changed this workspace. Reload before editing; export this tab first if needed.',
        );
      }
      const revision = expectedRevision + 1;
      await result(store.put({ json, revision }, 'active'));
      await completed;
      return revision;
    } catch (error) {
      await completed.catch(() => {});
      throw error;
    }
  }
  close(): void {
    this.database.close();
  }
}
