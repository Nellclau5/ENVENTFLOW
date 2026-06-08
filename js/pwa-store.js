/**
 * EventFlow Africa — Stockage local PWA (IndexedDB) pour billets et file de sync
 */

const PWAStore = {
  DB_NAME: 'eventflow-pwa-v1',
  DB_VERSION: 1,

  openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB non supporté'));
        return;
      }
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tickets')) {
          db.createObjectStore('tickets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getMeta(key) {
    const db = await this.openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  async setMeta(key, value) {
    const db = await this.openDB();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value, updatedAt: Date.now() });
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  },

  async cacheTickets(userId, tickets = []) {
    try {
      const db = await this.openDB();
      const tx = db.transaction(['tickets', 'meta'], 'readwrite');
      const store = tx.objectStore('tickets');
      store.clear();
      tickets
        .filter(t => t.status === TICKET_STATUS.VALID || t.status === 'valid')
        .forEach(t => store.put({ ...t, userId, cachedAt: Date.now() }));
      tx.objectStore('meta').put({ key: 'lastUserId', value: userId, updatedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'ticketsCount', value: tickets.length, updatedAt: Date.now() });
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (e) {
      console.warn('PWAStore.cacheTickets:', e);
    }
  },

  async getCachedTickets(userId = null) {
    try {
      const db = await this.openDB();
      const meta = await this.getMeta('lastUserId');
      if (userId && meta?.value && meta.value !== userId) return [];
      return new Promise((resolve) => {
        const tx = db.transaction('tickets', 'readonly');
        const req = tx.objectStore('tickets').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  },

  async getCachedTicketCount() {
    const tickets = await this.getCachedTickets();
    return tickets.length;
  },

  async addSyncItem(type, payload) {
    try {
      const db = await this.openDB();
      const tx = db.transaction('syncQueue', 'readwrite');
      tx.objectStore('syncQueue').add({ type, payload, createdAt: Date.now() });
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (e) {
      console.warn('PWAStore.addSyncItem:', e);
    }
  },

  async getSyncQueue() {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('syncQueue', 'readonly');
        const req = tx.objectStore('syncQueue').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  },

  async removeSyncItem(id) {
    const db = await this.openDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').delete(id);
    return new Promise((res) => { tx.oncomplete = res; });
  },

  async processSyncQueue() {
    const queue = await this.getSyncQueue();
    let processed = 0;
    for (const item of queue) {
      try {
        if (item.type === 'scan' && typeof OrganizerService !== 'undefined') {
          await OrganizerService.syncOfflineQueue();
        }
        await this.removeSyncItem(item.id);
        processed++;
      } catch (_) { /* garder en file */ }
    }
    if (typeof OrganizerService !== 'undefined') {
      await OrganizerService.syncOfflineQueue();
    }
    return processed;
  }
};

window.PWAStore = PWAStore;
