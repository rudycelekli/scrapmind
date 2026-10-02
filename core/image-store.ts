import { imageArtifactSchema, verifyImageArtifact } from './evidence.js';
import type { CapturedImage } from './camera.js';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local image storage failed.'));
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local image storage was aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Local image storage failed.'));
  });
}

/** Local browser storage. Saving is explicit; no images are sent to the loopback API. */
export class ImageStore {
  private constructor(private readonly database: IDBDatabase) {
    database.onversionchange = () => database.close();
  }

  static async open(name = 'scrapmind-images'): Promise<ImageStore> {
    if (typeof indexedDB === 'undefined')
      throw new Error('Local browser image storage is unavailable.');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let rejected = false;
      request.onupgradeneeded = () =>
        request.result.createObjectStore('images', { keyPath: 'artifact.id' });
      request.onblocked = () => {
        rejected = true;
        reject(new Error('Another tab is blocking image storage. Close it and retry.'));
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open local image storage.'));
      request.onsuccess = () => {
        if (rejected) request.result.close();
        else resolve(new ImageStore(request.result));
      };
    });
  }

  async put(image: CapturedImage): Promise<void> {
    const artifact = imageArtifactSchema.parse(image.artifact);
    if (!(await verifyImageArtifact(artifact, image.blob)))
      throw new Error('Image checksum does not match.');
    const transaction = this.database.transaction('images', 'readwrite');
    const done = transactionDone(transaction);
    // Attach a rejection handler immediately; an aborted transaction may finish
    // while the request promise is still reporting its own failure.
    void done.catch(() => {});
    const store = transaction.objectStore('images');
    try {
      const existing = await requestResult(store.get(artifact.id));
      if (existing !== undefined) {
        transaction.abort();
        await done.catch(() => {});
        throw new Error('Image artifact IDs are immutable. Use a new ID.');
      }
      await requestResult(store.add({ artifact, blob: image.blob }));
      await done;
    } catch (error) {
      await done.catch(() => {});
      throw error;
    }
  }

  async get(id: string): Promise<CapturedImage | undefined> {
    const transaction = this.database.transaction('images', 'readonly');
    const done = transactionDone(transaction);
    void done.catch(() => {});
    const value = await requestResult(transaction.objectStore('images').get(id));
    await done;
    if (value === undefined) return undefined;
    const artifact = imageArtifactSchema.parse(value.artifact);
    if (!(value.blob instanceof Blob) || !(await verifyImageArtifact(artifact, value.blob)))
      throw new Error('Stored image is damaged or does not match its checksum.');
    return { artifact, blob: value.blob };
  }

  async remove(id: string): Promise<void> {
    const transaction = this.database.transaction('images', 'readwrite');
    const done = transactionDone(transaction);
    void done.catch(() => {});
    await requestResult(transaction.objectStore('images').delete(id));
    await done;
  }

  close(): void {
    this.database.close();
  }
}
