// VoyageAI — Profile & Settings Page
import { getSettings, saveSettings, getAllTrips, saveTrip, deleteTrip, clearAllData, generateId } from '../store.js';
import { testConnection, DEFAULT_MODELS } from '../ai/provider.js';
import { ALL_COUNTRIES } from '../ai/prompts.js';
import { navigate, showToast } from '../app.js';


const CURRENCIES = [
  'AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'NZD', 'CAD',
  'CHF', 'HKD', 'THB', 'VND', 'IDR', 'MYR', 'PHP', 'KRW', 'INR', 'CNY'
];

const STATUS_LABELS = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed'
};

const STATUS_COLORS = {
  draft: 'bg-outline/20 text-on-surface-variant',
  planned: 'bg-tertiary-container text-on-tertiary-container',
  confirmed: 'bg-primary-container text-on-primary-container',
  completed: 'bg-primary text-on-primary'
};

let saveTimer = null;
let currentSettings = null;

function debounce(fn, ms = 600) {
  return (...args) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => fn(...args), ms);
  };
}

const debouncedSave = debounce(async () => {
  if (!currentSettings) return;
  try {
    await saveSettings(currentSettings);
  } catch (e) {
    console.error('Failed to save settings:', e);
    showToast('Failed to save settings', 'error');
  }
});

function updateSetting(key, value) {
  if (!currentSettings) return;
  currentSettings[key] = value;
  debouncedSave();
}

async function saveImmediately() {
  clearTimeout(saveTimer);
  if (!currentSettings) return;
  try {
    await saveSettings(currentSettings);
  } catch (e) {
    console.error('Failed to save settings:', e);
    showToast('Failed to save settings', 'error');
  }
}

export async function renderProfile(container) {
  // Use in-memory settings if available (avoids DB timing issues on re-render)
  if (!currentSettings) {
    currentSettings = await getSettings();
  }
  const trips = await getAllTrips();
  container.innerHTML = buildHTML(currentSettings, trips);

  bindAIProviderEvents(container);
  bindPersonalInfoEvents(container);
  bindVisitedCountriesEvents(container);
  bindSavedTripsEvents(container, trips);
  bindClearDataEvents(container);
}

function buildHTML(settings, trips) {
  return `
    <div class="pb-28 px-margin-mobile">
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile pt-6 pb-4">Profile & Settings</h1>

      ${buildAIProviderSection(settings)}
      ${buildPersonalInfoSection(settings)}
      ${buildVisitedCountriesSection(settings)}
      ${buildSavedTripsSection(trips)}
      ${buildClearDataSection()}
    </div>
  `;
}

// ─── AI Provider Settings ────────────────────────────────────────────────────

function buildAIProviderSection(settings) {
  const provider = settings.provider || 'anthropic';
  const models = DEFAULT_MODELS[provider] || [];
  const selectedModel = settings.model || models[0]?.id || '';

  return `
    <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
      <h2 class="font-headline-md text-headline-md mb-4">AI Provider</h2>

      <div class="mb-4">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2">Provider</label>
        <div class="flex gap-2">
          <label class="flex items-center gap-2 cursor-pointer flex-1 bg-surface-container-low rounded-xl py-3 px-3 ${provider === 'anthropic' ? 'ring-2 ring-primary' : ''}">
            <input type="radio" name="ai-provider" value="anthropic" ${provider === 'anthropic' ? 'checked' : ''}
              class="w-4 h-4 accent-primary" />
            <span class="text-body-sm">Anthropic</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer flex-1 bg-surface-container-low rounded-xl py-3 px-3 ${provider === 'openai' ? 'ring-2 ring-primary' : ''}">
            <input type="radio" name="ai-provider" value="openai" ${provider === 'openai' ? 'checked' : ''}
              class="w-4 h-4 accent-primary" />
            <span class="text-body-sm">OpenAI</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer flex-1 bg-surface-container-low rounded-xl py-3 px-3 ${provider === 'azure' ? 'ring-2 ring-primary' : ''}">
            <input type="radio" name="ai-provider" value="azure" ${provider === 'azure' ? 'checked' : ''}
              class="w-4 h-4 accent-primary" />
            <span class="text-body-sm">Azure OpenAI</span>
          </label>
        </div>
        </div>
      </div>

      <div class="mb-4 ${provider === 'azure' ? '' : 'hidden'}" id="base-url-section">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2" for="base-url-input">Endpoint URL</label>
        <input type="url" id="base-url-input" value="${escapeAttr(settings.baseUrl || '')}"
          placeholder="https://your-resource.openai.azure.com"
          class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" />
        <p id="base-url-hint" class="text-body-sm text-on-surface-variant mt-1">Your Azure OpenAI resource endpoint (e.g. https://myresource.openai.azure.com)</p>
      </div>

      <div class="mb-4" id="api-key-section">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2" for="api-key-input">API Key</label>
        <div class="relative">
          <input type="password" id="api-key-input" value="${escapeAttr(settings.apiKey || '')}"
            placeholder="Enter your API key"
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 pr-12 text-body-base focus:ring-2 focus:ring-primary" />
          <button id="toggle-api-key" type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined text-xl">visibility</span>
          </button>
        </div>
      </div>

      <div class="mb-4" id="model-section">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2">
          ${provider === 'azure' ? 'DEPLOYMENT NAME' : 'MODEL'}
        </label>
        ${provider === 'azure' ? `
          <input type="text" id="model-input" value="${escapeAttr(selectedModel)}"
            placeholder="e.g. gpt-4.1"
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" />
          <p class="text-body-sm text-on-surface-variant mt-1">Exact deployment name from your Azure portal (lowercase)</p>
        ` : `
          <select id="model-input"
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary appearance-none">
            ${models.map(m => `<option value="${escapeAttr(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${escapeHTML(m.name)}</option>`).join('')}
          </select>
        `}
      </div>

      <button id="test-connection-btn" type="button"
        class="w-full bg-primary text-white py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform">
        Test Connection
      </button>
      <div id="test-connection-result" class="mt-2 text-body-sm hidden"></div>
    </section>
  `;
}

function bindAIProviderEvents(container) {
  const radios = container.querySelectorAll('input[name="ai-provider"]');
  const modelInput = container.querySelector('#model-input');
  const apiKeyInput = container.querySelector('#api-key-input');
  const toggleBtn = container.querySelector('#toggle-api-key');
  const testBtn = container.querySelector('#test-connection-btn');
  const testResult = container.querySelector('#test-connection-result');
  const baseUrlSection = container.querySelector('#base-url-section');
  const baseUrlInput = container.querySelector('#base-url-input');

  radios.forEach(radio => {
    radio.addEventListener('change', async () => {
      const provider = radio.value;
      updateSetting('provider', provider);
      await saveImmediately();
      // Re-render the whole page to swap model input/select and show/hide fields
      await renderProfile(container);
    });
  });

  baseUrlInput.addEventListener('input', () => {
    updateSetting('baseUrl', baseUrlInput.value.trim());
  });

  apiKeyInput.addEventListener('input', () => {
    updateSetting('apiKey', apiKeyInput.value);
  });

  toggleBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleBtn.querySelector('.material-symbols-outlined').textContent = isPassword ? 'visibility_off' : 'visibility';
  });

  modelInput.addEventListener('input', () => {
    updateSetting('model', modelInput.value.trim());
  });
  modelInput.addEventListener('change', () => {
    updateSetting('model', modelInput.value.trim());
  });

  testBtn.addEventListener('click', async () => {
    const provider = currentSettings.provider || 'anthropic';
    const apiKey = currentSettings.apiKey || '';
    const model = currentSettings.model || '';

    if (!apiKey) {
      testResult.classList.remove('hidden');
      testResult.className = 'mt-2 text-body-sm text-error';
      testResult.textContent = 'Please enter an API key first.';
      return;
    }
    if (provider === 'azure' && !currentSettings.baseUrl) {
      testResult.classList.remove('hidden');
      testResult.className = 'mt-2 text-body-sm text-error';
      testResult.textContent = 'Please enter your Azure OpenAI endpoint URL.';
      return;
    }
    if (provider === 'azure' && !model) {
      testResult.classList.remove('hidden');
      testResult.className = 'mt-2 text-body-sm text-error';
      testResult.textContent = 'Please enter your deployment name.';
      return;
    }

    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg align-middle mr-1">progress_activity</span> Testing...';
    testResult.classList.add('hidden');

    await saveImmediately();

    const baseUrl = currentSettings.baseUrl || '';
    const result = await testConnection(provider, apiKey, model, baseUrl);

    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
    testResult.classList.remove('hidden');

    if (result.success) {
      testResult.className = 'mt-2 text-body-sm text-primary';
      testResult.textContent = result.message;
    } else {
      testResult.className = 'mt-2 text-body-sm text-error';
      testResult.textContent = result.message;
    }
  });
}

// ─── Personal Info ───────────────────────────────────────────────────────────

function buildPersonalInfoSection(settings) {
  return `
    <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
      <h2 class="font-headline-md text-headline-md mb-4">Personal Info</h2>

      <div class="mb-4">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2" for="home-city">Home City</label>
        <input type="text" id="home-city" value="${escapeAttr(settings.homeCity || '')}"
          placeholder="e.g. Melbourne"
          class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" />
      </div>

      <div class="mb-4">
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2" for="home-country">Home Country</label>
        <input type="text" id="home-country" value="${escapeAttr(settings.homeCountry || '')}"
          placeholder="e.g. Australia"
          class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" />
      </div>

      <div>
        <label class="font-label-caps text-label-caps text-on-surface-variant block mb-2" for="home-currency">Home Currency</label>
        <select id="home-currency"
          class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary appearance-none">
          ${CURRENCIES.map(c => `<option value="${c}" ${c === (settings.homeCurrency || 'AUD') ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </section>
  `;
}

function bindPersonalInfoEvents(container) {
  const cityInput = container.querySelector('#home-city');
  const countryInput = container.querySelector('#home-country');
  const currencySelect = container.querySelector('#home-currency');

  cityInput.addEventListener('input', () => updateSetting('homeCity', cityInput.value));
  countryInput.addEventListener('input', () => updateSetting('homeCountry', countryInput.value));
  currencySelect.addEventListener('change', () => updateSetting('homeCurrency', currencySelect.value));
}

// ─── Visited Countries ──────────────────────────────────────────────────────

function buildVisitedCountriesSection(settings) {
  const visited = settings.visitedCountries || [];
  const count = visited.length;
  const pct = ((count / 195) * 100).toFixed(1);

  return `
    <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
      <h2 class="font-headline-md text-headline-md mb-1">Visited Countries</h2>
      <p id="visited-counter" class="text-body-sm text-on-surface-variant mb-3">
        ${count} of 195 countries visited (${pct}%)${getVisitedFlair(count)}
      </p>

      <div class="flex gap-2 mb-3">
        <div class="flex-1 relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">search</span>
          <input type="text" id="country-search" placeholder="Search countries..."
            class="w-full bg-surface-container-low border-none rounded-xl py-3 pl-10 pr-4 text-body-base focus:ring-2 focus:ring-primary" />
        </div>
        <button id="toggle-visited-filter" type="button"
          class="bg-surface-container-low rounded-xl px-4 py-3 text-body-sm text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap"
          data-filter="all">
          Show all
        </button>
      </div>

      <div id="countries-list" class="max-h-64 overflow-y-auto space-y-0.5">
        ${buildCountryList(ALL_COUNTRIES, visited, '', 'all')}
      </div>
    </section>
  `;
}

function buildCountryList(countries, visited, search, filter) {
  const query = search.toLowerCase().trim();
  let filtered = countries;

  if (query) {
    filtered = filtered.filter(c => c.toLowerCase().includes(query));
  }
  if (filter === 'visited') {
    filtered = filtered.filter(c => visited.includes(c));
  }

  if (filtered.length === 0) {
    return '<p class="text-body-sm text-on-surface-variant py-4 text-center">No countries found</p>';
  }

  return filtered.map(country => {
    const checked = visited.includes(country);
    return `
      <label class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors">
        <input type="checkbox" value="${escapeAttr(country)}" ${checked ? 'checked' : ''}
          class="country-checkbox w-5 h-5 rounded accent-primary" />
        <span class="text-body-base ${checked ? 'text-on-surface' : 'text-on-surface-variant'}">${escapeHTML(country)}</span>
      </label>
    `;
  }).join('');
}

function getVisitedFlair(count) {
  if (count === 0) return ' — time to start exploring!';
  if (count < 5) return ' — just getting started!';
  if (count < 15) return ' — seasoned traveller!';
  if (count < 30) return ' — globetrotter!';
  if (count < 50) return ' — world explorer!';
  if (count < 100) return ' — legendary wanderer!';
  if (count < 150) return ' — almost there!';
  if (count >= 195) return ' — you have seen it ALL!';
  return ' — incredible!';
}

function bindVisitedCountriesEvents(container) {
  const searchInput = container.querySelector('#country-search');
  const filterBtn = container.querySelector('#toggle-visited-filter');
  const listEl = container.querySelector('#countries-list');
  const counterEl = container.querySelector('#visited-counter');

  let currentFilter = 'all';

  function refreshList() {
    const visited = currentSettings.visitedCountries || [];
    listEl.innerHTML = buildCountryList(ALL_COUNTRIES, visited, searchInput.value, currentFilter);
    attachCheckboxListeners();
  }

  function updateCounter() {
    const count = (currentSettings.visitedCountries || []).length;
    const pct = ((count / 195) * 100).toFixed(1);
    counterEl.textContent = `${count} of 195 countries visited (${pct}%)${getVisitedFlair(count)}`;
  }

  function attachCheckboxListeners() {
    listEl.querySelectorAll('.country-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const country = cb.value;
        let visited = currentSettings.visitedCountries || [];
        if (cb.checked) {
          if (!visited.includes(country)) visited.push(country);
        } else {
          visited = visited.filter(c => c !== country);
        }
        currentSettings.visitedCountries = visited;
        debouncedSave();
        updateCounter();

        // Update text color beside checkbox
        const span = cb.parentElement.querySelector('span');
        if (span) {
          span.classList.toggle('text-on-surface', cb.checked);
          span.classList.toggle('text-on-surface-variant', !cb.checked);
        }
      });
    });
  }

  searchInput.addEventListener('input', () => refreshList());

  filterBtn.addEventListener('click', () => {
    currentFilter = currentFilter === 'all' ? 'visited' : 'all';
    filterBtn.textContent = currentFilter === 'all' ? 'Show all' : 'Show visited';
    filterBtn.dataset.filter = currentFilter;
    refreshList();
  });

  attachCheckboxListeners();
}

// ─── Saved Trips ─────────────────────────────────────────────────────────────

function buildSavedTripsSection(trips) {
  if (trips.length === 0) {
    return `
      <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
        <h2 class="font-headline-md text-headline-md mb-4">Saved Trips</h2>
        <p class="text-body-sm text-on-surface-variant text-center py-6">No trips yet. Head to Explore to plan your first adventure!</p>
      </section>
    `;
  }

  return `
    <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
      <h2 class="font-headline-md text-headline-md mb-4">Saved Trips</h2>
      <div class="space-y-2" id="saved-trips-list">
        ${trips.map(trip => buildTripRow(trip)).join('')}
      </div>
    </section>
  `;
}

function buildTripRow(trip) {
  const status = trip.status || 'draft';
  const statusLabel = STATUS_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.draft;
  const dest = trip.selectedDestination || {};
  const destination = dest.country ? `${dest.country} — ${(dest.cities || []).join(', ')}` : (trip.destination || trip.country || 'Untitled Trip');
  const date = trip.updatedAt ? formatDate(trip.updatedAt) : '';

  return `
    <div class="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-surface-container-low transition-colors" data-trip-id="${escapeAttr(trip.id)}">
      <div class="flex-1 min-w-0">
        <p class="text-body-base font-medium truncate">${escapeHTML(destination)}</p>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-label-caps font-label-caps px-2 py-0.5 rounded-full ${statusColor}">${statusLabel}</span>
          <span class="text-body-sm text-on-surface-variant">${date}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button class="trip-open p-2 rounded-lg hover:bg-surface-container-low transition-colors" title="Open" data-id="${escapeAttr(trip.id)}">
          <span class="material-symbols-outlined text-xl text-on-surface-variant">open_in_new</span>
        </button>
        <button class="trip-duplicate p-2 rounded-lg hover:bg-surface-container-low transition-colors" title="Duplicate" data-id="${escapeAttr(trip.id)}">
          <span class="material-symbols-outlined text-xl text-on-surface-variant">content_copy</span>
        </button>
        <button class="trip-delete p-2 rounded-lg hover:bg-error-container transition-colors" title="Delete" data-id="${escapeAttr(trip.id)}">
          <span class="material-symbols-outlined text-xl text-error">delete</span>
        </button>
      </div>
    </div>
  `;
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function bindSavedTripsEvents(container, trips) {
  container.querySelectorAll('.trip-open').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(`/itinerary/${btn.dataset.id}`);
    });
  });

  container.querySelectorAll('.trip-duplicate').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tripId = btn.dataset.id;
      const original = trips.find(t => t.id === tripId);
      if (!original) return;

      const copy = JSON.parse(JSON.stringify(original));
      copy.id = generateId();
      copy.status = 'draft';
      copy.createdAt = null;
      copy.updatedAt = null;
      if (copy.destination) {
        copy.destination = copy.destination + ' (copy)';
      } else if (copy.country) {
        copy.country = copy.country + ' (copy)';
      }

      try {
        await saveTrip(copy);
        showToast('Trip duplicated as draft', 'success');
        const updatedTrips = await getAllTrips();
        const section = container.querySelector('#saved-trips-list');
        if (section) {
          section.innerHTML = updatedTrips.map(t => buildTripRow(t)).join('');
          bindSavedTripsEvents(container, updatedTrips);
        }
      } catch (e) {
        showToast('Failed to duplicate trip', 'error');
      }
    });
  });

  container.querySelectorAll('.trip-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tripId = btn.dataset.id;
      const trip = trips.find(t => t.id === tripId);
      const name = trip?.destination || trip?.country || 'this trip';

      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

      try {
        await deleteTrip(tripId);
        showToast('Trip deleted', 'success');
        const updatedTrips = await getAllTrips();
        const listEl = container.querySelector('#saved-trips-list');
        if (listEl) {
          if (updatedTrips.length === 0) {
            listEl.closest('section').innerHTML = `
              <h2 class="font-headline-md text-headline-md mb-4">Saved Trips</h2>
              <p class="text-body-sm text-on-surface-variant text-center py-6">No trips yet. Head to Explore to plan your first adventure!</p>
            `;
          } else {
            listEl.innerHTML = updatedTrips.map(t => buildTripRow(t)).join('');
            bindSavedTripsEvents(container, updatedTrips);
          }
        }
      } catch (e) {
        showToast('Failed to delete trip', 'error');
      }
    });
  });
}

// ─── Clear All Data ──────────────────────────────────────────────────────────

function buildClearDataSection() {
  return `
    <section class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-4">
      <h2 class="font-headline-md text-headline-md mb-2">Danger Zone</h2>
      <p class="text-body-sm text-on-surface-variant mb-4">
        This will permanently delete all your settings, trips, expenses, and cached data. This action cannot be undone.
      </p>
      <button id="clear-all-data-btn" type="button"
        class="w-full bg-error text-on-error py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform">
        Clear All Data
      </button>
    </section>
  `;
}

function bindClearDataEvents(container) {
  const btn = container.querySelector('#clear-all-data-btn');
  btn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL data? This cannot be undone.')) return;
    if (!confirm('This is your final warning. All trips, settings, and expenses will be permanently deleted. Continue?')) return;

    try {
      await clearAllData();
      currentSettings = null;
      showToast('All data cleared', 'success');
      navigate('/profile');
    } catch (e) {
      showToast('Failed to clear data', 'error');
    }
  });
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
