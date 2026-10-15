import type { Reading } from './domain';

const storeName = 'telemetry-outbox';
let database: Promise<IDBDatabase> | undefined;
const fallback = new Map<string, Reading>();

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('chillpath-demo', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'eventId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function enqueueReadings(readings: Reading[]) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    readings.forEach(reading => store.put(reading));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    readings.forEach(reading => fallback.set(reading.eventId, reading));
  }
}

export async function getBufferedReadings(): Promise<Reading[]> {
  try {
    const db = await openDatabase();
    const values = await new Promise<Reading[]>((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as Reading[]);
      request.onerror = () => reject(request.error);
    });
    return [...values, ...fallback.values()].filter((item, index, all) => all.findIndex(value => value.eventId === item.eventId) === index);
  } catch {
    return [...fallback.values()];
  }
}

export async function clearBufferedReadings() {
  fallback.clear();
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // The in-memory fallback was already cleared.
  }
}
