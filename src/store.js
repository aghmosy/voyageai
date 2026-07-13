// IndexedDB wrapper for VoyageAI
// Stores: settings, trips, expenses, fxCache

const DB_NAME = 'voyageai';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('trips')) {
        const tripStore = db.createObjectStore('trips', { keyPath: 'id' });
        tripStore.createIndex('status', 'status', { unique: false });
        tripStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('expenses')) {
        const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expenseStore.createIndex('tripId', 'tripId', { unique: false });
        expenseStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('fxCache')) {
        db.createObjectStore('fxCache', { keyPath: 'base' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

// Generic CRUD
async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get(storeName, key) {
  const store = await tx(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(storeName) {
  const store = await tx(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllByIndex(storeName, indexName, value) {
  const store = await tx(storeName, 'readonly');
  const index = store.index(indexName);
  return new Promise((resolve, reject) => {
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function del(storeName, key) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Settings helpers
export async function getSettings() {
  const result = await get('settings', 'main');
  return result || {
    key: 'main',
    provider: 'anthropic',
    apiKey: '',
    model: '',
    baseUrl: '',
    homeCity: '',
    homeCountry: '',
    homeCurrency: 'AUD',
    visitedCountries: []
  };
}

export async function saveSettings(settings) {
  settings.key = 'main';
  return put('settings', settings);
}

// Trip helpers
export async function saveTrip(trip) {
  trip.updatedAt = new Date().toISOString();
  if (!trip.createdAt) trip.createdAt = trip.updatedAt;
  return put('trips', trip);
}

export async function getTrip(id) {
  return get('trips', id);
}

export async function getAllTrips() {
  const trips = await getAll('trips');
  return trips.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function deleteTrip(id) {
  // Also delete associated expenses
  const expenses = await getExpensesForTrip(id);
  for (const exp of expenses) {
    await del('expenses', exp.id);
  }
  return del('trips', id);
}

// Expense helpers
export async function saveExpense(expense) {
  expense.createdAt = expense.createdAt || new Date().toISOString();
  return put('expenses', expense);
}

export async function getExpense(id) {
  return get('expenses', id);
}

export async function getExpensesForTrip(tripId) {
  const expenses = await getAllByIndex('expenses', 'tripId', tripId);
  return expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function deleteExpense(id) {
  return del('expenses', id);
}

// FX Cache helpers
export async function getFxRates(base = 'USD') {
  return get('fxCache', base);
}

export async function saveFxRates(base, rates) {
  return put('fxCache', { base, rates, fetchedAt: new Date().toISOString() });
}

// Clear all data
export async function clearAllData() {
  await clearStore('settings');
  await clearStore('trips');
  await clearStore('expenses');
  await clearStore('fxCache');
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
