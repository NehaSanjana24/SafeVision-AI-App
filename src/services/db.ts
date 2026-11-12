/**
 * IndexedDB helper for high-capacity local storage of scans, violations, and evidence images.
 */

const DB_NAME = 'safevision_db';
const DB_VERSION = 5;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('scans')) {
        db.createObjectStore('scans', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('violations')) {
        db.createObjectStore('violations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('feedback')) {
        db.createObjectStore('feedback', { keyPath: 'id' });
      }
      // Knowledge Base stores
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
      }
      if (!db.objectStoreNames.contains('extractedFields')) {
        const fieldStore = db.createObjectStore('extractedFields', { keyPath: 'id' });
        fieldStore.createIndex('docId', 'docId', { unique: false });
      }
      if (!db.objectStoreNames.contains('searchHistory')) {
        db.createObjectStore('searchHistory', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('documentBlobs')) {
        db.createObjectStore('documentBlobs', { keyPath: 'id' });
      }
      // Milestone 3 Agent & Workflows stores
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('incidents')) {
        db.createObjectStore('incidents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('workflowRuns')) {
        const wfStore = db.createObjectStore('workflowRuns', { keyPath: 'id' });
        wfStore.createIndex('conversationId', 'conversationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('ragEvaluations')) {
        db.createObjectStore('ragEvaluations', { keyPath: 'id' });
      }
      // Milestone 4 Intelligence, Reports & Notifications stores
      if (!db.objectStoreNames.contains('correctiveActions')) {
        const caStore = db.createObjectStore('correctiveActions', { keyPath: 'id' });
        caStore.createIndex('zone', 'zone', { unique: false });
        caStore.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('reports')) {
        const repStore = db.createObjectStore('reports', { keyPath: 'id' });
        repStore.createIndex('type', 'type', { unique: false });
        repStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('reportSchedules')) {
        db.createObjectStore('reportSchedules', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notifications')) {
        const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notifStore.createIndex('userId', 'userId', { unique: false });
        notifStore.createIndex('read', 'read', { unique: false });
      }
      if (!db.objectStoreNames.contains('savedViews')) {
        const svStore = db.createObjectStore('savedViews', { keyPath: 'id' });
        svStore.createIndex('userId', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains('alertRules')) {
        db.createObjectStore('alertRules', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('reportBlobs')) {
        db.createObjectStore('reportBlobs', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function idbPut<T>(storeName: string, item: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
