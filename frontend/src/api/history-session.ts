const lockName = 'presdes-mongodb-session';
const leaseStore = 'leases';
const sessionTimeoutMs = 5000;

function openLocks(signal: AbortSignal): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presdes-history-locks', 1);
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    request.onupgradeneeded = () => request.result.createObjectStore(leaseStore);
    request.onerror = () => {
      signal.removeEventListener('abort', abort);
      reject(request.error);
    };
    request.onsuccess = () => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) request.result.close();
      else resolve(request.result);
    };
  });
}

function changeLease(db: IDBDatabase, expires: number, release: boolean): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(leaseStore, 'readwrite');
    const store = transaction.objectStore(leaseStore);
    const request = store.get(lockName);
    let acquired = false;
    request.onsuccess = () => {
      if (release) {
        if (request.result === expires) store.delete(lockName);
      } else if (request.result === undefined || request.result <= Date.now()) {
        store.put(expires, lockName);
        acquired = true;
      }
    };
    transaction.oncomplete = () => resolve(acquired);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function withLease(signal: AbortSignal, establish: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const db = await openLocks(signal);
  try {
    while (!signal.aborted) {
      // Read and write in one transaction so concurrent tabs cannot both acquire the lease.
      const expires = Date.now() + sessionTimeoutMs * 2;
      if (await changeLease(db, expires, false)) {
        try {
          if (signal.aborted) throw signal.reason;
          await establish(signal);
          return;
        } finally {
          await changeLease(db, expires, true);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw signal.reason;
  } finally {
    db.close();
  }
}

let pendingSession: Promise<void> | undefined;

export function ensureHistorySession(establish: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (!pendingSession) {
    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), sessionTimeoutMs);
    const request = navigator.locks
      ? navigator.locks.request(lockName, { signal }, () => establish(signal))
      : withLease(signal, establish);
    pendingSession = request.finally(() => {
      clearTimeout(timeout);
      pendingSession = undefined;
    });
  }
  return pendingSession;
}
