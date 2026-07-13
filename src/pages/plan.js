// VoyageAI — Plan / Explore page
import { getSettings, saveTrip, generateId } from '../store.js';
import { complete } from '../ai/provider.js';
import { RECOMMENDATION_SYSTEM_PROMPT, REGIONS, INTERESTS, MONTHS, BUDGET_TIERS } from '../ai/prompts.js';
import { navigate, isOnline, showToast } from '../app.js';

// Gradient palettes for destination cards (no images, so use vivid gradients)
const CARD_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-lime-500 to-green-600',
];

const CARD_EMOJIS = {
  'Western Europe': '\u{1F3F0}',
  'Eastern Europe': '\u{1F3DB}\uFE0F',
  'South East Asia': '\u{1F3DD}\uFE0F',
  'South Asia': '\u{1F549}\uFE0F',
  'North America': '\u{1F5FD}',
  'South America': '\u{1F30E}',
  'Africa': '\u{1F418}',
  'Middle East': '\u{1F54C}',
  'South Pacific': '\u{1F30A}',
  'Australasia': '\u{1F998}',
};

// Session state — persisted across re-renders within the same app session
let formState = null;

function getDefaultFormState() {
  return {
    region: REGIONS[0],
    groupSize: 2,
    ages: '',
    duration: 14,
    homeLocation: '',
    excludeVisited: true,
    interests: [],
    month: MONTHS[new Date().getMonth()],
    budgetTier: Object.keys(BUDGET_TIERS)[1],
    aiInstructions: '',
  };
}

export async function renderPlan(container) {
  const settings = await getSettings();

  // Initialise form state on first load
  if (!formState) {
    formState = getDefaultFormState();
    formState.homeLocation = settings.homeCity
      ? `${settings.homeCity}${settings.homeCountry ? ', ' + settings.homeCountry : ''}`
      : '';
  }

  container.innerHTML = buildPageHTML(settings);
  attachEventListeners(container, settings);
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function buildPageHTML(settings) {
  return `
    <div class="px-margin-mobile py-lg flex flex-col gap-lg max-w-2xl mx-auto w-full">
      <!-- Page heading -->
      <div>
        <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Plan your trip</h2>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Tell us what you love and we'll find your next adventure.</p>
      </div>

      <!-- Form card -->
      <form id="plan-form" class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm flex flex-col gap-md">

        ${buildSelect('region', 'Travel Region', REGIONS, formState.region)}

        <!-- Group size + Ages -->
        <div class="grid grid-cols-2 gap-xs">
          ${buildNumberInput('groupSize', 'Group size', formState.groupSize, 1, 30)}
          ${buildTextInput('ages', 'Ages', formState.ages, 'e.g. 35, 33, 6')}
        </div>

        ${buildNumberInput('duration', 'Duration (days)', formState.duration, 1, 120)}

        ${buildTextInput('homeLocation', 'Home location', formState.homeLocation, 'City, Country')}

        <!-- New locations only toggle -->
        <div class="flex items-center justify-between">
          <div>
            <span class="font-label-caps text-label-caps text-on-surface-variant uppercase">New locations only?</span>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Exclude your visited countries</p>
          </div>
          <button type="button" id="toggle-exclude" role="switch" aria-checked="${formState.excludeVisited}"
            class="relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${formState.excludeVisited ? 'bg-primary' : 'bg-slate-300'}">
            <span class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${formState.excludeVisited ? 'translate-x-5' : 'translate-x-0'}"></span>
          </button>
        </div>

        <!-- Travel interests chips -->
        <div>
          <span class="font-label-caps text-label-caps text-on-surface-variant uppercase block mb-2">Travel interests</span>
          <div id="interest-chips" class="flex flex-wrap gap-2">
            ${INTERESTS.map((interest) => {
              const active = formState.interests.includes(interest);
              return `<button type="button" data-interest="${interest}"
                class="interest-chip ${active
                  ? 'bg-primary/10 text-primary px-3 py-1.5 rounded-full font-tag text-tag border border-primary/20'
                  : 'bg-slate-100 text-secondary px-3 py-1.5 rounded-full font-tag text-tag border border-slate-200'}
                transition-colors duration-150">${interest}</button>`;
            }).join('')}
          </div>
        </div>

        ${buildSelect('month', 'Month of travel', MONTHS, formState.month)}
        ${buildSelect('budgetTier', 'Budget per day', Object.keys(BUDGET_TIERS), formState.budgetTier)}

        <!-- AI instructions -->
        <div class="flex flex-col gap-1">
          <label for="aiInstructions" class="font-label-caps text-label-caps text-on-surface-variant uppercase">AI instructions</label>
          <textarea id="aiInstructions" name="aiInstructions" rows="3"
            class="bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base font-body-base focus:ring-2 focus:ring-primary resize-none"
            placeholder="Any extra preferences or constraints...">${formState.aiInstructions}</textarea>
        </div>

        <!-- Generate button -->
        <button type="submit" id="generate-btn"
          class="w-full bg-primary text-on-primary py-3 rounded-xl font-headline-md text-headline-md hover:bg-primary-container hover:text-on-primary-container transition-colors duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
          Generate
        </button>
      </form>

      <!-- Results area -->
      <div id="plan-results"></div>
    </div>
  `;
}

function buildSelect(name, label, options, current) {
  return `
    <div class="flex flex-col gap-1">
      <label for="${name}" class="font-label-caps text-label-caps text-on-surface-variant uppercase">${label}</label>
      <select id="${name}" name="${name}"
        class="bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base font-body-base focus:ring-2 focus:ring-primary appearance-none">
        ${options.map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>
  `;
}

function buildNumberInput(name, label, value, min, max) {
  return `
    <div class="flex flex-col gap-1">
      <label for="${name}" class="font-label-caps text-label-caps text-on-surface-variant uppercase">${label}</label>
      <input type="number" id="${name}" name="${name}" value="${value}" min="${min}" max="${max}"
        class="bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base font-body-base focus:ring-2 focus:ring-primary" />
    </div>
  `;
}

function buildTextInput(name, label, value, placeholder) {
  return `
    <div class="flex flex-col gap-1">
      <label for="${name}" class="font-label-caps text-label-caps text-on-surface-variant uppercase">${label}</label>
      <input type="text" id="${name}" name="${name}" value="${escapeAttr(value)}"
        placeholder="${placeholder}"
        class="bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base font-body-base focus:ring-2 focus:ring-primary" />
    </div>
  `;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Destination card rendering
// ---------------------------------------------------------------------------

function renderDestinationCards(destinations, resultsEl) {
  const region = formState.region;
  const emoji = CARD_EMOJIS[region] || '\u{2708}\uFE0F';

  const html = `
    <div class="flex flex-col gap-md">
      <div>
        <h3 class="font-headline-md text-headline-md text-on-surface">Recommended destinations</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Tap a card to build a full itinerary.</p>
      </div>

      <!-- Horizontal scroll container -->
      <div class="flex gap-sm overflow-x-auto pb-2 -mx-margin-mobile px-margin-mobile snap-x snap-mandatory scroll-smooth" style="scrollbar-width: none;">
        ${destinations.map((dest, i) => {
          const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
          const costFormatted = formatUSD(dest.estimatedTotalUSD);
          const cities = Array.isArray(dest.cities) ? dest.cities.join(', ') : dest.cities;
          return `
            <button type="button" data-dest-index="${i}"
              class="dest-card flex-shrink-0 w-[260px] aspect-[4/5] rounded-2xl overflow-hidden relative snap-start group focus:outline-none focus:ring-2 focus:ring-primary active:scale-[0.97] transition-transform duration-150">
              <!-- Gradient background -->
              <div class="absolute inset-0 bg-gradient-to-br ${gradient}"></div>
              <!-- Overlay gradient for readability -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
              <!-- Emoji decoration -->
              <div class="absolute top-4 right-4 text-5xl opacity-30 group-hover:opacity-50 transition-opacity">${emoji}</div>
              <!-- Content -->
              <div class="absolute inset-0 flex flex-col justify-end p-4 text-white">
                <!-- Cost badge -->
                <div class="self-start bg-white/20 backdrop-blur-md px-3 py-1 rounded-full font-tag text-tag mb-2">
                  ${costFormatted} total
                </div>
                <p class="font-label-caps text-label-caps uppercase tracking-wider text-white/80 mb-0.5">${escapeHTML(dest.country)}</p>
                <h4 class="font-headline-md text-headline-md text-white leading-tight">${escapeHTML(cities)}</h4>
                <p class="font-body-sm text-body-sm text-white/70 mt-1 line-clamp-2">${escapeHTML(dest.whyItFits || '')}</p>
                <!-- Chevron -->
                <div class="absolute bottom-4 right-4 w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <span class="material-symbols-outlined text-white text-[18px]">chevron_right</span>
                </div>
              </div>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Destination detail cards (expanded info) -->
      <div class="flex flex-col gap-sm">
        ${destinations.map((dest, i) => {
          const cities = Array.isArray(dest.cities) ? dest.cities.join(', ') : dest.cities;
          const activities = Array.isArray(dest.activities) ? dest.activities : [];
          return `
            <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <p class="font-label-caps text-label-caps text-on-surface-variant uppercase">${escapeHTML(dest.country)}</p>
                  <h4 class="font-headline-md text-headline-md text-on-surface">${escapeHTML(cities)}</h4>
                </div>
                <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-tag text-tag border border-primary/20">${formatUSD(dest.estimatedTotalUSD)}</span>
              </div>

              <!-- Activities -->
              ${activities.length > 0 ? `
                <div class="mb-3">
                  <p class="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">Activities</p>
                  <ul class="flex flex-col gap-1">
                    ${activities.map((a) => `<li class="font-body-sm text-body-sm text-on-surface-variant flex items-start gap-1.5">
                      <span class="material-symbols-outlined text-primary text-[16px] mt-0.5 flex-shrink-0">check_circle</span>
                      ${escapeHTML(a)}
                    </li>`).join('')}
                  </ul>
                </div>
              ` : ''}

              <!-- Cost breakdown -->
              ${dest.costBreakdown ? `
                <div class="mb-3">
                  <p class="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">Cost breakdown</p>
                  <div class="grid grid-cols-2 gap-1">
                    ${Object.entries(dest.costBreakdown).map(([key, val]) => `
                      <div class="flex justify-between font-body-sm text-body-sm text-on-surface-variant">
                        <span class="capitalize">${escapeHTML(key)}</span>
                        <span>${formatUSD(val)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Weather note -->
              ${dest.weatherNote ? `
                <div class="mb-3 flex items-start gap-2">
                  <span class="material-symbols-outlined text-tertiary text-[18px] mt-0.5 flex-shrink-0">thermostat</span>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHTML(dest.weatherNote)}</p>
                </div>
              ` : ''}

              <!-- Visa note -->
              ${dest.visaNote ? `
                <div class="mb-3 flex items-start gap-2">
                  <span class="material-symbols-outlined text-secondary text-[18px] mt-0.5 flex-shrink-0">badge</span>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHTML(dest.visaNote)}</p>
                </div>
              ` : ''}

              <!-- Select button -->
              <button type="button" data-dest-select="${i}"
                class="w-full mt-1 bg-primary-container text-on-primary-container py-2.5 rounded-xl font-tag text-tag hover:bg-surface-container transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">route</span>
                Build itinerary
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  resultsEl.innerHTML = html;
}

function formatUSD(amount) {
  if (amount == null || isNaN(amount)) return '$--';
  return '$' + Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function attachEventListeners(container, settings) {
  const form = container.querySelector('#plan-form');
  const resultsEl = container.querySelector('#plan-results');
  const toggleBtn = container.querySelector('#toggle-exclude');

  // Sync form inputs back to formState on change
  form.addEventListener('input', (e) => {
    const { name, value, type } = e.target;
    if (!name) return;
    if (type === 'number') {
      formState[name] = parseInt(value, 10) || 0;
    } else {
      formState[name] = value;
    }
  });

  // Toggle switch
  toggleBtn.addEventListener('click', () => {
    formState.excludeVisited = !formState.excludeVisited;
    const knob = toggleBtn.querySelector('span');
    toggleBtn.setAttribute('aria-checked', String(formState.excludeVisited));
    if (formState.excludeVisited) {
      toggleBtn.classList.replace('bg-slate-300', 'bg-primary');
      knob.classList.replace('translate-x-0', 'translate-x-5');
    } else {
      toggleBtn.classList.replace('bg-primary', 'bg-slate-300');
      knob.classList.replace('translate-x-5', 'translate-x-0');
    }
  });

  // Interest chips
  container.querySelectorAll('.interest-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const interest = chip.dataset.interest;
      const idx = formState.interests.indexOf(interest);
      if (idx >= 0) {
        formState.interests.splice(idx, 1);
        chip.className = 'interest-chip bg-slate-100 text-secondary px-3 py-1.5 rounded-full font-tag text-tag border border-slate-200 transition-colors duration-150';
      } else {
        formState.interests.push(interest);
        chip.className = 'interest-chip bg-primary/10 text-primary px-3 py-1.5 rounded-full font-tag text-tag border border-primary/20 transition-colors duration-150';
      }
    });
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleGenerate(container, settings, resultsEl);
  });
}

// ---------------------------------------------------------------------------
// Generate handler
// ---------------------------------------------------------------------------

async function handleGenerate(container, settings, resultsEl) {
  // Validate
  if (!settings.apiKey) {
    showToast('Please set your API key in Profile settings first.', 'error');
    return;
  }

  if (formState.interests.length === 0) {
    showToast('Please select at least one travel interest.', 'warning');
    return;
  }

  if (!isOnline()) {
    resultsEl.innerHTML = `
      <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm text-center">
        <span class="material-symbols-outlined text-tertiary text-4xl mb-2">cloud_off</span>
        <p class="font-headline-md text-headline-md text-on-surface mb-1">You're offline</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Connect to the internet to generate destination recommendations.</p>
      </div>
    `;
    return;
  }

  const generateBtn = container.querySelector('#generate-btn');
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Generating...';

  // Show loading skeleton
  resultsEl.innerHTML = `
    <div class="flex flex-col items-center justify-center py-12 gap-3">
      <span class="material-symbols-outlined text-primary animate-spin text-4xl">progress_activity</span>
      <p class="font-body-base text-body-base text-on-surface-variant">Searching for destinations...</p>
      <p class="font-body-sm text-body-sm text-on-surface-variant">This may take 15-30 seconds.</p>
    </div>
  `;

  const budgetInfo = BUDGET_TIERS[formState.budgetTier] || BUDGET_TIERS[Object.keys(BUDGET_TIERS)[1]];

  const inputs = {
    region: formState.region,
    groupSize: formState.groupSize,
    ages: formState.ages,
    duration: formState.duration,
    excludeVisited: formState.excludeVisited,
    interests: [...formState.interests],
    month: formState.month,
    budgetTier: budgetInfo.label,
    budgetPerDay: budgetInfo.perDay,
    aiInstructions: formState.aiInstructions,
  };

  const systemPrompt = RECOMMENDATION_SYSTEM_PROMPT(inputs, settings);

  try {
    const result = await complete({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: inputs.aiInstructions
          ? `Please recommend destinations while strictly following these mandatory instructions: ${inputs.aiInstructions}`
          : 'Please recommend destinations based on my preferences.',
      }],
      tools: null,
      // Keep destination generation in structured-output mode as well.
      jsonSchema: { type: 'object' },
    });

    let data;
    if (result.parsed && result.parsed.destinations) {
      data = result.parsed;
    } else if (result.raw) {
      // Try to parse raw text as JSON
      let cleaned = result.raw.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      data = JSON.parse(cleaned);
    } else {
      throw new Error('No response received from AI provider.');
    }

    if (!data.destinations || !Array.isArray(data.destinations) || data.destinations.length === 0) {
      throw new Error('AI returned no destinations. Please try again with different parameters.');
    }

    // Store destinations for card click handlers
    const destinations = data.destinations;

    renderDestinationCards(destinations, resultsEl);

    // Attach card click handlers
    attachCardClickHandlers(resultsEl, destinations, inputs, settings);

  } catch (err) {
    console.error('Generation error:', err);
    const isNetworkError = err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed to fetch');
    const icon = isNetworkError ? 'wifi_off' : 'error_outline';
    const title = isNetworkError ? 'Network error' : 'Generation failed';

    resultsEl.innerHTML = `
      <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm text-center">
        <span class="material-symbols-outlined text-error text-4xl mb-2">${icon}</span>
        <p class="font-headline-md text-headline-md text-on-surface mb-1">${escapeHTML(title)}</p>
        <p class="font-body-sm text-body-sm text-on-surface-variant mb-3">${escapeHTML(err.message || 'An unexpected error occurred.')}</p>
        <button type="button" id="retry-btn"
          class="bg-primary-container text-on-primary-container px-6 py-2 rounded-xl font-tag text-tag hover:bg-surface-container transition-colors">
          Try again
        </button>
      </div>
    `;

    const retryBtn = resultsEl.querySelector('#retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        handleGenerate(container, settings, resultsEl);
      });
    }
  } finally {
    const generateBtn = container.querySelector('#generate-btn');
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">auto_awesome</span> Generate';
    }
  }
}

// ---------------------------------------------------------------------------
// Card click => create trip & navigate
// ---------------------------------------------------------------------------

function attachCardClickHandlers(resultsEl, destinations, inputs, settings) {
  // Both the scroll cards and the "Build itinerary" buttons trigger trip creation
  const handleSelect = async (index) => {
    const dest = destinations[index];
    if (!dest) return;

    const tripId = generateId();
    const trip = {
      id: tripId,
      status: 'planned',
      selectedDestination: {
        country: dest.country,
        cities: dest.cities,
        activities: dest.activities,
        estimatedTotalUSD: dest.estimatedTotalUSD,
        costBreakdown: dest.costBreakdown,
        weatherNote: dest.weatherNote,
        visaNote: dest.visaNote,
        whyItFits: dest.whyItFits,
      },
      inputs: {
        region: inputs.region,
        groupSize: inputs.groupSize,
        ages: inputs.ages,
        duration: inputs.duration,
        interests: inputs.interests,
        month: inputs.month,
        budgetTier: inputs.budgetTier,
        budgetPerDay: inputs.budgetPerDay,
        aiInstructions: inputs.aiInstructions,
        excludeVisited: inputs.excludeVisited,
      },
      itinerary: null,
      chatHistory: [],
    };

    try {
      await saveTrip(trip);
      showToast(`Trip to ${dest.country} created!`, 'success');
      navigate(`/itinerary/${tripId}`);
    } catch (err) {
      console.error('Failed to save trip:', err);
      showToast('Failed to save trip. Please try again.', 'error');
    }
  };

  // Scroll cards
  resultsEl.querySelectorAll('.dest-card').forEach((card) => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.destIndex, 10);
      handleSelect(index);
    });
  });

  // "Build itinerary" buttons
  resultsEl.querySelectorAll('[data-dest-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.destSelect, 10);
      handleSelect(index);
    });
  });
}
