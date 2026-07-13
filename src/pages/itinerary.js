// VoyageAI — Itinerary Page
import { getTrip, getAllTrips, saveTrip, getSettings } from '../store.js';
import { complete } from '../ai/provider.js';
import { ITINERARY_SYSTEM_PROMPT, REFINEMENT_SYSTEM_PROMPT } from '../ai/prompts.js';
import { getCurrentTripId, setCurrentTripId, navigate, isOnline, showToast } from '../app.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function iconFor(type) {
  const map = {
    flight: 'flight',
    train: 'train',
    bus: 'directions_bus',
    transfer: 'local_taxi',
    activity: 'directions_walk',
    dining: 'restaurant',
    sightseeing: 'photo_camera',
    culture: 'museum',
    adventure: 'hiking',
    beach: 'beach_access',
    shopping: 'shopping_bag',
    spa: 'spa',
    nature: 'park',
    default: 'place',
  };
  return map[(type || '').toLowerCase()] || map.default;
}

function formatUSD(n) {
  if (n == null) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeroHeader(trip, itinerary) {
  const dest = trip.selectedDestination || {};
  const cities = (dest.cities || itinerary.route?.map((r) => r.city) || []).join(', ');
  const country = dest.country || itinerary.route?.[0]?.country || 'Unknown';
  const region = trip.inputs?.region || '';
  const duration = trip.inputs?.duration || itinerary.route?.reduce((s, r) => s + (r.nights || 0), 0) || '—';

  return `
    <section class="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary to-primary/70 mb-6">
      <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
      <div class="relative px-margin-mobile py-10">
        <h1 class="font-display text-display text-white drop-shadow-md">${esc(country)}</h1>
        <p class="font-headline-lg-mobile text-headline-lg-mobile text-white/90 mt-1">${esc(cities)}</p>
        <div class="flex flex-wrap gap-2 mt-4">
          ${region ? `<span class="bg-white/20 backdrop-blur text-white px-3 py-1 rounded-full font-tag text-tag">${esc(region)}</span>` : ''}
          <span class="bg-white/20 backdrop-blur text-white px-3 py-1 rounded-full font-tag text-tag">${esc(duration)} days</span>
        </div>
      </div>
    </section>`;
}

function renderQuickStats(trip, itinerary) {
  const groupSize = trip.inputs?.groupSize || 1;
  const budget = itinerary.budget?.total;
  return `
    <section class="px-margin-mobile mt-lg">
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm p-4 text-center">
          <span class="material-symbols-outlined text-primary text-3xl">group</span>
          <p class="font-label-caps text-label-caps text-on-surface-variant mt-1">Group Size</p>
          <p class="font-headline-md text-headline-md text-on-surface mt-1">${esc(groupSize)}</p>
        </div>
        <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm p-4 text-center">
          <span class="material-symbols-outlined text-primary text-3xl">payments</span>
          <p class="font-label-caps text-label-caps text-on-surface-variant mt-1">Est. Budget</p>
          <p class="font-headline-md text-headline-md text-on-surface mt-1">${budget != null ? formatUSD(budget) : '—'}</p>
        </div>
      </div>
    </section>`;
}

function renderRouteSummary(itinerary) {
  const route = itinerary.route || [];
  if (!route.length) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Route Summary</h2>
      <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm overflow-hidden">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-border-light">
              <th class="font-label-caps text-label-caps text-on-surface-variant px-4 py-3">City</th>
              <th class="font-label-caps text-label-caps text-on-surface-variant px-4 py-3">Dates</th>
              <th class="font-label-caps text-label-caps text-on-surface-variant px-4 py-3 text-right">Nights</th>
            </tr>
          </thead>
          <tbody>
            ${route
              .map(
                (r) => `
              <tr class="border-b border-border-light last:border-0">
                <td class="px-4 py-3 font-body-base text-body-base text-on-surface">${esc(r.city)}</td>
                <td class="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">${esc(r.startDate || '')} – ${esc(r.endDate || '')}</td>
                <td class="px-4 py-3 font-body-base text-body-base text-on-surface text-right">${r.nights ?? '—'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderTransport(itinerary) {
  const transport = itinerary.transport || [];
  if (!transport.length) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Flights &amp; Transport</h2>
      <div class="flex flex-col gap-4">
        ${transport
          .map(
            (t) => `
          <div class="relative bg-surface-light border border-border-light rounded-2xl shadow-sm p-4 pl-5 overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
            <div class="flex items-center gap-2 mb-2">
              <span class="material-symbols-outlined text-primary">${iconFor(t.type)}</span>
              <span class="font-label-caps text-label-caps text-on-surface-variant uppercase">${esc(t.type)}</span>
              ${t.code ? `<span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-tag text-tag ml-auto">${esc(t.code)}</span>` : ''}
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-headline-md text-headline-md text-on-surface">${esc(t.from)}</p>
                <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(t.departTime || '')}</p>
              </div>
              <div class="flex flex-col items-center mx-2">
                <span class="material-symbols-outlined text-on-surface-variant text-sm">arrow_forward</span>
                <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(t.duration || '')}</p>
              </div>
              <div class="text-right">
                <p class="font-headline-md text-headline-md text-on-surface">${esc(t.to)}</p>
                <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(t.arriveTime || '')}</p>
              </div>
            </div>
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-border-light">
              <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(t.carrier || '')}</p>
              <p class="font-body-base text-body-base text-primary font-semibold">${t.estimatedCostUSD != null ? formatUSD(t.estimatedCostUSD) : ''}</p>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function renderAccommodations(itinerary) {
  const acc = itinerary.accommodation || [];
  if (!acc.length) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Accommodations</h2>
      <div class="flex overflow-x-auto gap-4 no-scrollbar pb-2">
        ${acc
          .map(
            (h) => `
          <div class="min-w-[260px] max-w-[280px] flex-shrink-0 bg-surface-light border border-border-light rounded-2xl shadow-sm p-4 flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-tag text-tag">${h.rating != null ? '★ ' + h.rating : '—'}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">${h.nights ? h.nights + ' nights' : ''}</span>
            </div>
            <h3 class="font-headline-md text-headline-md text-on-surface">${esc(h.name)}</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${esc(h.area || h.city || '')}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">${esc(h.description || '')}</p>
            <div class="mt-auto pt-3 flex items-center justify-between">
              <p class="font-body-base text-body-base text-primary font-semibold">${h.pricePerNightUSD != null ? formatUSD(h.pricePerNightUSD) + '/night' : ''}</p>
              <button class="text-primary font-label-caps text-label-caps hover:underline" onclick="window.open('https://www.google.com/search?q=' + encodeURIComponent('${esc(h.name)} ${esc(h.city)} hotel'), '_blank')">Hotel Details</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function renderDailyHighlights(itinerary) {
  const days = itinerary.days || [];
  if (!days.length) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Daily Highlights</h2>
      <div class="flex flex-col gap-6">
        ${days
          .map(
            (day) => `
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-tag text-tag">Day ${day.dayNumber}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">${esc(day.date || '')} — ${esc(day.city || '')}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${(day.highlights || [])
                .map(
                  (h) => `
                <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm p-4">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-primary text-xl">${iconFor(h.type)}</span>
                    <span class="font-body-sm text-body-sm text-on-surface-variant">${esc(h.time || '')}</span>
                    ${h.duration ? `<span class="font-body-sm text-body-sm text-on-surface-variant ml-auto">${esc(h.duration)}</span>` : ''}
                  </div>
                  <p class="font-headline-md text-headline-md text-on-surface text-sm">${esc(h.activity)}</p>
                  <p class="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">${esc(h.description || '')}</p>
                </div>`
                )
                .join('')}
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function renderRestaurants(itinerary) {
  const restaurants = itinerary.restaurants || [];
  if (!restaurants.length) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Dinner Restaurants</h2>
      <div class="flex flex-col gap-4">
        ${restaurants
          .map(
            (r) => `
          <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm p-4">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-headline-md text-headline-md text-on-surface">${esc(r.name)}</h3>
              <span class="bg-primary/10 text-primary px-3 py-1 rounded-full font-tag text-tag">${esc(r.priceRange || '')}</span>
            </div>
            <p class="font-label-caps text-label-caps text-on-surface-variant">${esc(r.cuisine || '')} — ${esc(r.city || '')}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-2">${esc(r.description || '')}</p>
            ${r.whyRecommended ? `<p class="font-body-sm text-body-sm text-primary mt-1 italic">${esc(r.whyRecommended)}</p>` : ''}
            ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 mt-2 text-primary font-body-sm text-body-sm hover:underline"><span class="material-symbols-outlined text-sm">link</span>${esc(r.sourceName || 'Source')}</a>` : ''}
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function renderBudgetBreakdown(itinerary) {
  const b = itinerary.budget;
  if (!b) return '';
  return `
    <section class="px-margin-mobile mt-lg">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Budget Breakdown</h2>
      <div class="bg-inverse-surface text-inverse-on-surface rounded-2xl p-6">
        <div class="flex flex-col gap-3">
          <div class="flex justify-between">
            <span class="font-body-base text-body-base opacity-80">Accommodation</span>
            <span class="font-headline-md text-headline-md">${formatUSD(b.accommodation)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-body-base text-body-base opacity-80">Transport</span>
            <span class="font-headline-md text-headline-md">${formatUSD(b.transport)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-body-base text-body-base opacity-80">Activities &amp; Dining</span>
            <span class="font-headline-md text-headline-md">${formatUSD(b.activitiesAndDining)}</span>
          </div>
          <div class="border-t border-white/20 my-1"></div>
          <div class="flex justify-between">
            <span class="font-headline-md text-headline-md">Total</span>
            <span class="font-display text-display text-lg">${formatUSD(b.total)}</span>
          </div>
          ${b.perPersonPerDay != null ? `
          <p class="font-body-sm text-body-sm opacity-60 text-right mt-1">${formatUSD(b.perPersonPerDay)} / person / day</p>` : ''}
        </div>
      </div>
    </section>`;
}

function renderRefinementChat(chatHistory) {
  return `
    <section class="px-margin-mobile mt-lg mb-32" id="refinement-section">
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-3">Refine Your Itinerary</h2>
      <div class="bg-surface-light border border-border-light rounded-2xl shadow-sm p-4">
        <div id="chat-thread" class="flex flex-col gap-3 max-h-80 overflow-y-auto mb-4">
          ${chatHistory.length === 0
            ? `<p class="font-body-sm text-body-sm text-on-surface-variant text-center py-4">Ask me to adjust anything — swap a restaurant, add an activity, change hotels, etc.</p>`
            : chatHistory
                .map(
                  (msg) => `
              <div class="${msg.role === 'user' ? 'self-end bg-primary text-white' : 'self-start bg-surface-container text-on-surface'} max-w-[85%] px-4 py-2 rounded-2xl font-body-base text-body-base">
                ${esc(msg.content)}
              </div>`
                )
                .join('')}
        </div>
        <div class="flex flex-col gap-3">
          <textarea id="chat-input" rows="2" placeholder="e.g. Swap the second hotel for something closer to the beach..."
            class="w-full border border-border-light rounded-xl px-4 py-3 font-body-base text-body-base text-on-surface bg-surface-light resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"></textarea>
          <div class="flex gap-3">
            <button id="btn-send-refinement"
              class="flex-1 bg-primary text-white py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-xl">send</span> Send
            </button>
            <button id="btn-confirm-itinerary"
              class="flex-1 bg-primary-container text-on-primary-container py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-xl">check_circle</span> Confirm
            </button>
          </div>
          <button id="btn-export-csv"
            class="w-full mt-3 border border-primary text-primary py-3 rounded-xl font-headline-md active:scale-95 transition-transform flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-xl">download</span> Download Itinerary CSV
          </button>
        </div>
      </div>
    </section>`;
}

function renderEmptyState() {
  return `
    <div class="flex flex-col items-center justify-center px-margin-mobile py-20 text-center">
      <span class="material-symbols-outlined text-on-surface-variant text-6xl mb-4">map</span>
      <h2 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-2">No trip selected</h2>
      <p class="font-body-base text-body-base text-on-surface-variant mb-6">Pick a destination first and we'll build your itinerary.</p>
      <a href="#/plan" class="bg-primary text-white py-3 px-8 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform">Explore Destinations</a>
    </div>`;
}

function renderLoadingState(message) {
  return `
    <div class="flex flex-col items-center justify-center px-margin-mobile py-20 text-center">
      <span class="material-symbols-outlined text-primary animate-spin text-5xl mb-4">progress_activity</span>
      <p class="font-headline-md text-headline-md text-on-surface">${esc(message)}</p>
      <p class="font-body-sm text-body-sm text-on-surface-variant mt-2">This may take a minute — the AI is planning your perfect trip.</p>
    </div>`;
}

function renderErrorState(message) {
  return `
    <div class="flex flex-col items-center justify-center px-margin-mobile py-20 text-center">
      <span class="material-symbols-outlined text-error text-5xl mb-4">error</span>
      <p class="font-headline-md text-headline-md text-error mb-2">Something went wrong</p>
      <p class="font-body-base text-body-base text-on-surface-variant mb-6">${esc(message)}</p>
      <button onclick="location.reload()" class="bg-primary text-white py-3 px-8 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform">Try Again</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Itinerary generation
// ---------------------------------------------------------------------------

async function generateItinerary(trip, settings) {
  const destination = trip.selectedDestination;
  const inputs = trip.inputs;

  const system = ITINERARY_SYSTEM_PROMPT(destination, inputs, settings);
  const tools =
    settings.provider === 'anthropic'
      ? [{ type: 'web_search', name: 'web_search' }]
      : null;

  const result = await complete({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    system,
    messages: [
      {
        role: 'user',
        content: `Please create a detailed ${inputs.duration}-day itinerary for ${destination.country} visiting ${destination.cities.join(', ')}. Strictly apply these mandatory traveller instructions: ${inputs.aiInstructions || 'none'}. The transport list must begin with travel from ${settings.homeCity || 'my home city'} to the first destination and end with travel back home. Include restaurant recommendations with source links.`,
      },
    ],
    tools,
    // A non-null schema enables provider JSON mode and one automatic
    // JSON-only retry if the model still returns malformed output.
    jsonSchema: { type: 'object' },
  });

  let itinerary;
  if (result.parsed) {
    itinerary = result.parsed;
  } else if (result.raw) {
    const cleaned = result.raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    itinerary = JSON.parse(cleaned);
  } else {
    throw new Error('AI returned an empty response. Please try again.');
  }

  return itinerary;
}

async function sendRefinement(trip, settings, userMessage, chatHistory) {
  const system = REFINEMENT_SYSTEM_PROMPT(trip.itinerary, trip.inputs, settings);
  const tools =
    settings.provider === 'anthropic'
      ? [{ type: 'web_search', name: 'web_search' }]
      : null;

  const messages = chatHistory.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: userMessage });

  const result = await complete({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
    system,
    messages,
    tools,
    jsonSchema: { type: 'object' },
  });

  let parsed;
  if (result.parsed) {
    parsed = result.parsed;
  } else if (result.raw) {
    const cleaned = result.raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } else {
    throw new Error('AI returned an empty response. Please try again.');
  }

  return {
    reply: parsed.reply || 'Itinerary updated.',
    itinerary: parsed.itinerary,
  };
}

// ---------------------------------------------------------------------------
// Compose all itinerary sections
// ---------------------------------------------------------------------------

function renderItinerarySections(trip, itinerary, chatHistory) {
  return [
    renderHeroHeader(trip, itinerary),
    renderQuickStats(trip, itinerary),
    renderRouteSummary(itinerary),
    renderTransport(itinerary),
    renderAccommodations(itinerary),
    renderDailyHighlights(itinerary),
    renderRestaurants(itinerary),
    renderBudgetBreakdown(itinerary),
    renderRefinementChat(chatHistory),
  ].join('');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function renderItinerary(container) {
  let tripId = getCurrentTripId();

  // Load the active trip. For existing installations that do not have an
  // active-trip preference yet, recover the most recently saved trip.
  let trip;
  try {
    if (tripId) trip = await getTrip(tripId);
    if (!trip) {
      const trips = await getAllTrips();
      trip = trips[0] || null;
      if (trip) {
        tripId = trip.id;
        setCurrentTripId(tripId);
      }
    }
  } catch (err) {
    container.innerHTML = renderErrorState('Could not load trip data: ' + err.message);
    return;
  }

  if (!trip) {
    container.innerHTML = renderEmptyState();
    return;
  }

  // Load settings
  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    container.innerHTML = renderErrorState('Could not load settings: ' + err.message);
    return;
  }

  // Chat history lives on the trip object, persisted across renders
  if (!trip.chatHistory) trip.chatHistory = [];

  // If no itinerary yet, generate one
  if (!trip.itinerary) {
    if (!isOnline()) {
      container.innerHTML = renderErrorState('You are offline. Connect to the internet to generate an itinerary.');
      return;
    }

    if (!settings.apiKey) {
      container.innerHTML = renderErrorState('No API key configured. Go to Profile to add your AI provider key.');
      return;
    }

    if (!trip.selectedDestination) {
      container.innerHTML = renderErrorState('No destination selected for this trip. Go back to Explore and pick one.');
      return;
    }

    container.innerHTML = renderLoadingState('Generating your itinerary...');

    try {
      trip.itinerary = await generateItinerary(trip, settings);
      trip.status = 'itinerary';
      await saveTrip(trip);
    } catch (err) {
      console.error('Itinerary generation failed:', err);
      container.innerHTML = renderErrorState('Failed to generate itinerary: ' + err.message);
      return;
    }
  }

  // Render the full page
  paint(container, trip, settings);
}

// ---------------------------------------------------------------------------
// Paint (render + bind)
// ---------------------------------------------------------------------------

function paint(container, trip, settings) {
  const itinerary = trip.itinerary;
  const chatHistory = trip.chatHistory || [];

  container.innerHTML = renderItinerarySections(trip, itinerary, chatHistory);

  // Scroll chat thread to bottom
  const chatThread = container.querySelector('#chat-thread');
  if (chatThread) {
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  // Bind refinement send
  const btnSend = container.querySelector('#btn-send-refinement');
  const chatInput = container.querySelector('#chat-input');

  if (btnSend && chatInput) {
    const handleSend = async () => {
      const userMessage = chatInput.value.trim();
      if (!userMessage) return;

      if (!isOnline()) {
        showToast('You are offline. Cannot send refinement.', 'warning');
        return;
      }

      if (!settings.apiKey) {
        showToast('No API key configured. Go to Profile to set it up.', 'error');
        return;
      }

      // Add user message to history
      trip.chatHistory.push({ role: 'user', content: userMessage });
      chatInput.value = '';

      // Show sending state in chat
      const threadEl = container.querySelector('#chat-thread');
      if (threadEl) {
        threadEl.innerHTML += `
          <div class="self-end bg-primary text-white max-w-[85%] px-4 py-2 rounded-2xl font-body-base text-body-base">${esc(userMessage)}</div>
          <div id="chat-loading" class="self-start max-w-[85%] px-4 py-2 rounded-2xl bg-surface-container text-on-surface-variant font-body-base text-body-base flex items-center gap-2">
            <span class="material-symbols-outlined animate-spin text-sm">progress_activity</span> Thinking...
          </div>`;
        threadEl.scrollTop = threadEl.scrollHeight;
      }

      // Disable controls
      btnSend.disabled = true;
      btnSend.classList.add('opacity-50');
      chatInput.disabled = true;

      try {
        const { reply, itinerary: updatedItinerary } = await sendRefinement(
          trip,
          settings,
          userMessage,
          trip.chatHistory
        );

        // Update trip
        trip.chatHistory.push({ role: 'assistant', content: reply });
        if (updatedItinerary) {
          trip.itinerary = updatedItinerary;
        }
        await saveTrip(trip);

        // Re-render everything
        paint(container, trip, settings);
      } catch (err) {
        console.error('Refinement failed:', err);

        // Remove loading indicator
        const loadingEl = container.querySelector('#chat-loading');
        if (loadingEl) loadingEl.remove();

        // Re-enable controls
        btnSend.disabled = false;
        btnSend.classList.remove('opacity-50');
        chatInput.disabled = false;

        // Pop the failed user message from history
        trip.chatHistory.pop();

        showToast('Refinement failed: ' + err.message, 'error');
      }
    };

    btnSend.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Bind confirm itinerary
  const btnConfirm = container.querySelector('#btn-confirm-itinerary');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      try {
        trip.status = 'confirmed';
        await saveTrip(trip);
        showToast('Itinerary confirmed! Have an amazing trip.', 'success');
        btnConfirm.disabled = true;
        btnConfirm.classList.add('opacity-50');
        btnConfirm.innerHTML = '<span class="material-symbols-outlined text-xl">check</span> Confirmed';
      } catch (err) {
        console.error('Confirm failed:', err);
        showToast('Failed to confirm: ' + err.message, 'error');
      }
    });
  }

  // Bind CSV export
  const btnExport = container.querySelector('#btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const it = trip.itinerary;
      if (!it) {
        showToast('No itinerary to export.', 'warning');
        return;
      }
      const dest = trip.selectedDestination || {};
      const rows = [];

      // Route
      rows.push(['=== ROUTE ===']);
      rows.push(['City', 'Country', 'Start Date', 'End Date', 'Nights']);
      (it.route || []).forEach(r => rows.push([r.city, r.country, r.startDate, r.endDate, r.nights]));
      rows.push([]);

      // Transport
      rows.push(['=== TRANSPORT ===']);
      rows.push(['Type', 'From', 'To', 'Carrier', 'Code', 'Depart', 'Arrive', 'Duration', 'Cost (USD)']);
      (it.transport || []).forEach(t => rows.push([t.type, t.from, t.to, t.carrier, t.code, t.departTime, t.arriveTime, t.duration, t.estimatedCostUSD]));
      rows.push([]);

      // Accommodation
      rows.push(['=== ACCOMMODATION ===']);
      rows.push(['Name', 'City', 'Area', 'Nights', 'Rating', 'Per Night (USD)', 'Total (USD)']);
      (it.accommodation || []).forEach(a => rows.push([a.name, a.city, a.area, a.nights, a.rating, a.pricePerNightUSD, a.totalUSD]));
      rows.push([]);

      // Daily highlights
      rows.push(['=== DAILY HIGHLIGHTS ===']);
      rows.push(['Day', 'Date', 'City', 'Time', 'Activity', 'Description', 'Duration']);
      (it.days || []).forEach(d => {
        (d.highlights || []).forEach(h => rows.push([d.dayNumber, d.date, d.city, h.time, h.activity, h.description, h.duration]));
      });
      rows.push([]);

      // Restaurants
      rows.push(['=== RESTAURANTS ===']);
      rows.push(['Name', 'City', 'Cuisine', 'Description', 'Price Range', 'Source', 'Source URL']);
      (it.restaurants || []).forEach(r => rows.push([r.name, r.city, r.cuisine, r.description, r.priceRange, r.sourceName, r.sourceUrl]));
      rows.push([]);

      // Budget
      if (it.budget) {
        rows.push(['=== BUDGET ===']);
        rows.push(['Category', 'Amount (USD)']);
        rows.push(['Accommodation', it.budget.accommodation]);
        rows.push(['Transport', it.budget.transport]);
        rows.push(['Activities & Dining', it.budget.activitiesAndDining]);
        rows.push(['Total', it.budget.total]);
        rows.push(['Per Person Per Day', it.budget.perPersonPerDay]);
      }

      const csvContent = rows.map(row =>
        row.map(cell => {
          const s = String(cell ?? '');
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      ).join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VoyageAI_Itinerary_${(dest.country || 'trip').replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Itinerary CSV downloaded!', 'success');
    });
  }
}
