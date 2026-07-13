// VoyageAI — SPA Router & Init
import { renderPlan } from './pages/plan.js';
import { renderItinerary } from './pages/itinerary.js';
import { renderExpenses } from './pages/expenses.js';
import { renderProfile } from './pages/profile.js';

const routes = {
  '/plan': { render: renderPlan, nav: 'explore', label: 'Explore', icon: 'search' },
  '/itinerary': { render: renderItinerary, nav: 'itinerary', label: 'Itinerary', icon: 'event_note' },
  '/expenses': { render: renderExpenses, nav: 'expenses', label: 'Expenses', icon: 'account_balance_wallet' },
  '/profile': { render: renderProfile, nav: 'profile', label: 'Profile', icon: 'person' }
};

let currentRoute = null;
const ACTIVE_TRIP_KEY = 'voyageai.activeTripId';

function getHash() {
  return window.location.hash.replace('#', '') || '/plan';
}

function getRouteBase(hash) {
  // Support /itinerary/tripId style routes
  const parts = hash.split('/').filter(Boolean);
  return '/' + (parts[0] || 'plan');
}

export function navigate(hash) {
  const parts = hash.split('/').filter(Boolean);
  if (parts[1] && (parts[0] === 'itinerary' || parts[0] === 'expenses')) {
    setCurrentTripId(parts[1]);
  }
  window.location.hash = '#' + hash;
}

export function setCurrentTripId(tripId) {
  try {
    if (tripId) localStorage.setItem(ACTIVE_TRIP_KEY, tripId);
    else localStorage.removeItem(ACTIVE_TRIP_KEY);
  } catch (e) {
    console.warn('Could not persist active trip:', e);
  }
}

export function getCurrentTripId() {
  const hash = getHash();
  const parts = hash.split('/').filter(Boolean);
  if (parts[1]) {
    setCurrentTripId(parts[1]);
    return parts[1];
  }
  try {
    return localStorage.getItem(ACTIVE_TRIP_KEY);
  } catch {
    return null;
  }
}

async function router() {
  const hash = getHash();
  const routeBase = getRouteBase(hash);
  const route = routes[routeBase] || routes['/plan'];

  const main = document.getElementById('app-main');
  if (!main) return;

  // Update nav
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const navId = el.dataset.nav;
    if (navId === route.nav) {
      el.classList.add('bg-primary-container', 'text-on-primary-container', 'rounded-xl');
      el.classList.remove('text-on-secondary-container');
      el.querySelector('.material-symbols-outlined')?.setAttribute('style', "font-variation-settings: 'FILL' 1;");
    } else {
      el.classList.remove('bg-primary-container', 'text-on-primary-container', 'rounded-xl');
      el.classList.add('text-on-secondary-container');
      el.querySelector('.material-symbols-outlined')?.setAttribute('style', '');
    }
  });

  // Render page
  main.innerHTML = '<div class="flex items-center justify-center h-64"><span class="material-symbols-outlined text-primary animate-spin text-4xl">progress_activity</span></div>';
  try {
    await route.render(main);
  } catch (e) {
    console.error('Route render error:', e);
    main.innerHTML = `<div class="px-4 py-8 text-center"><p class="text-error font-headline-md text-headline-md">Something went wrong</p><p class="text-on-surface-variant text-body-sm mt-2">${e.message}</p></div>`;
  }
}

// Check online status
export function isOnline() {
  return navigator.onLine;
}

// Show toast notification
export function showToast(message, type = 'info') {
  const existing = document.getElementById('voyage-toast');
  if (existing) existing.remove();

  const colors = {
    info: 'bg-primary text-on-primary',
    success: 'bg-primary-container text-on-primary-container',
    error: 'bg-error text-on-error',
    warning: 'bg-tertiary-container text-on-tertiary-container'
  };

  const toast = document.createElement('div');
  toast.id = 'voyage-toast';
  toast.className = `fixed top-16 left-4 right-4 z-[100] ${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg font-body-base text-body-base transition-all transform translate-y-0 opacity-100`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('-translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Init
async function init() {
  window.addEventListener('hashchange', router);
  window.addEventListener('online', () => showToast('You\'re back online!', 'success'));
  window.addEventListener('offline', () => showToast('You\'re offline. Some features may be limited.', 'warning'));

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }

  router();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
