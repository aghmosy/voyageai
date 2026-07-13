# VoyageAI — Product Requirements Document

**Version:** 1.0 · **Date:** July 2026 · **Owner:** Mostafa
**Purpose:** A personal-gift travel planning + expense tracking app for a single trusted user. Built as an installable PWA with no backend.

---

## 1. Overview

VoyageAI is an AI-powered travel planner and trip expense logger. The user describes trip parameters, the AI recommends countries/cities/activities within budget, the user refines the itinerary conversationally, and during the trip logs all expenses against the planned budget — fully offline-capable.

### Goals
- Installable on Android and iPhone from a single URL ("Add to Home Screen").
- Zero backend, zero hosting cost. Static files on GitHub Pages or Cloudflare Pages.
- User brings their own AI API key (OpenAI **or** Anthropic — support both).
- All user data (trips, expenses, API key, visited countries) stored on-device only.
- Expense logging works fully offline (airplane mode).

### Non-Goals
- No user accounts, no login, no multi-user sync.
- No real bookings/payments — suggestions and links only.
- No app store distribution.
- No server-side key storage or proxy.

---

## 2. Architecture

| Concern | Decision |
|---|---|
| App type | PWA: static HTML/JS + Tailwind (CDN or built), manifest.json, service worker |
| Hosting | GitHub Pages or Cloudflare Pages (free, HTTPS required for PWA) |
| Storage | IndexedDB via a thin wrapper (e.g. `idb` library) — trips, expenses, settings |
| AI calls | Direct browser → provider API. Provider abstraction layer supports both:<br>• Anthropic Messages API (requires `anthropic-dangerous-direct-browser-access: true` header for CORS)<br>• OpenAI Responses/Chat API |
| Web search (restaurants, activities, weather) | Use the **provider's built-in web search tool** (Anthropic `web_search` tool / OpenAI web search tool). No Google API key needed. |
| Structured output | All recommendation calls request strict JSON (schema in prompt or tool/response_format). Frontend renders cards from parsed JSON — never from prose. |
| Offline | Service worker caches app shell + last itinerary. Expenses page must work with no network. AI features show a friendly "you're offline" state. |
| Routing | Single-page app with hash routing (`#/plan`, `#/itinerary`, `#/expenses`, `#/profile`) or 4 static pages sharing a JS core — implementer's choice, SPA preferred. |

### Repo layout (suggested)
```
voyageai/
  index.html
  manifest.json
  sw.js
  /src
    app.js            # router + init
    store.js          # IndexedDB wrapper (trips, expenses, settings)
    ai/provider.js    # provider abstraction (anthropic.js, openai.js)
    ai/prompts.js     # system prompts + JSON schemas
    pages/plan.js
    pages/itinerary.js
    pages/expenses.js
    pages/profile.js
  /styles             # tailwind config / tokens from existing pages
  /assets
```

### Existing assets
Two HTML mockups define the visual system (Material-3-style tokens, Plus Jakarta Sans + Inter, card layouts, bottom nav): `voyage-dashboard.html` (Plan page) and `detailed-itinerary.html` (Itinerary page). Reuse their Tailwind config, colors, spacing, and component patterns exactly.

---

## 3. Pages & Features

### 3.1 Plan (Explore) — Page 1

**Section A — Inputs** (persisted per trip draft):
1. **Travel Region** — combo box, exact list: Western Europe, Eastern Europe, South East Asia, South Asia, North America, South America, Africa, Middle East, South Pacific, Australasia.
2. **Group size & ages** — number of travellers + age for each (repeatable rows or comma list).
3. **Duration** — days (number).
4. **Home location** — home city text input (default from Profile).
5. **New locations only?** — toggle. If ON, AI must exclude countries in the Profile visited-countries list.
6. **Travel interests** — multi-select chips, exact list: Culture, Museums, Architecture, Markets, Food Markets, Adventure, Beach / Swimming, Spa, Nature, Hiking.
7. **Month of travel** — combo box, Jan–Dec.
8. **Budget per day** — combo box: Budget $150 · Mid level $400 · Expensive $600 · Luxury $1000+.
9. **AI instructions** — free-text textarea.
10. **Generate** button.

**Section B — AI Output:** list of recommended country + city combinations rendered as the existing destination cards. Each card shows:
- Country and cities
- 3–5 highly rated activities matched to selected interests
- Estimated total trip cost (flights from home city + accommodation + food + activities, scaled to group size, duration, budget tier)
- Weather/seasonality note for the chosen month
- Visa note relative to the traveller's passport (from Profile home country)

Selecting a card → creates a Trip record → navigates to Itinerary.

### 3.2 Itinerary — Page 2

For the selected trip, AI generates and the page renders (reuse existing mockup components):
- **Route summary table** — cities + date ranges.
- **Transport** — best options between each city (flight/train/bus/transfer) as transport cards.
- **Accommodation** — options fitting the budget tier, located near suggested activities. Horizontal-scroll hotel cards.
- **Daily activities** — matched to interests; day-by-day highlights.
- **Dinner restaurants (dinner only)** — sourced via the AI's **web search tool**: query for restaurants rated highly by chefs / food critics and known to be frequented by locals in each city. Results must include the source/citation link on each card.
- **Budget breakdown card** — accommodation / transport / activities+dining / total.
- **Refinement chat** — replace the one-shot textarea with a persistent conversation thread per trip. Each message re-calls the AI with full trip state + chat history; AI returns an updated itinerary JSON plus a short text reply. "Confirm itinerary" button freezes it and sets trip status to `confirmed`.

### 3.3 Expenses — Page 3 (new)

- **Quick-add form:** amount, currency (default = destination currency, changeable), category (Accommodation, Transport, Food & Drink, Activities, Shopping, Other), optional note, date (default today). Optimised for ≤5-second entry.
- **Budget vs actual:** progress bar of daily spend against the trip's budget tier, and trip-total vs AI estimate.
- **Currency conversion:** convert to home currency (AUD default). Fetch FX rates when online and cache them; use cached rates offline with a "rates as of {date}" label. (Free source: e.g. frankfurter.app — no key.)
- **Category breakdown:** simple chart or stacked bars per category.
- **List view:** reverse-chronological, grouped by day, swipe/tap to edit or delete.
- **Export:** download CSV of all trip expenses.
- **Must work 100% offline.**
- **Post-trip:** "Trip report" comparing AI estimate vs actual by category.

### 3.4 Profile / Settings — Page 4

- **AI provider:** radio (Anthropic / OpenAI) + API key field (password input, stored in IndexedDB only) + "Test connection" button + model picker with sensible defaults.
- **Home city & country**, **home currency**.
- **Visited countries:** searchable checklist of all countries (powers the "new locations" toggle; also a fun scratch-map-style counter).
- **Saved trips list:** open, duplicate, or delete past trips.
- Clear-all-data option.

---

## 4. AI Integration Spec

- `provider.js` exposes one interface: `complete({system, messages, tools, jsonSchema}) → parsed result`, with `anthropic.js` and `openai.js` implementations behind it.
- **Recommendation call (Plan):** system prompt encodes all inputs; response must be strict JSON: `{destinations: [{country, cities[], activities[], estimatedTotalUSD, costBreakdown, weatherNote, visaNote, whyItFits}]}`. Strip markdown fences before `JSON.parse`; on parse failure, one automatic retry asking for JSON only.
- **Itinerary call:** input = selected destination + all trip parameters + chat history; output = strict JSON itinerary object (route[], transport[], accommodation[], days[], restaurants[], budget{}).
- **Restaurant search:** performed inside the itinerary/refinement call by enabling the provider's web search tool; prompt instructs "dinner only; prioritise places praised by chefs/critics and popular with locals; include source URLs."
- **Cost control:** show a small token/cost hint in settings; default to a mid-tier model (e.g. claude-sonnet / gpt-4.1-mini class), overridable.
- **Error states:** invalid key, rate limit, offline — each gets a clear inline message, never a silent failure.

## 5. Data Models (IndexedDB)

```
settings: { provider, apiKey, model, homeCity, homeCountry, homeCurrency, visitedCountries[] }
trips:    { id, status: draft|planned|confirmed|completed, inputs{...}, selectedDestination,
            itinerary{...}, chatHistory[], createdAt, updatedAt }
expenses: { id, tripId, amountOriginal, currency, amountHome, fxRate, fxDate,
            category, note, date, createdAt }
fxCache:  { base, rates{}, fetchedAt }
```

---

## 6. Task List (phased for Claude Code)

Work phase by phase; each phase ends in a testable state. Attach only this PRD + relevant existing files per session to keep context small.

### Phase 0 — Scaffold & PWA shell
- [ ] Init repo, folder structure above, extract shared Tailwind config/tokens from the two mockups into one place.
- [ ] `index.html` SPA shell with bottom nav (Explore / Itinerary / Expenses / Profile) + hash router.
- [ ] `manifest.json` (name, icons, standalone display, theme color `#0058be`).
- [ ] `sw.js`: cache-first for app shell, network-first for FX; verify installability (Lighthouse PWA check).
- [ ] `store.js` IndexedDB wrapper with the four stores + basic CRUD.
- [ ] Deploy pipeline: push-to-main → GitHub/Cloudflare Pages. Confirm "Add to Home Screen" works on a real Android phone.

### Phase 1 — Settings & AI plumbing
- [ ] Profile page: provider select, API key entry, model picker, Test-connection button.
- [ ] `provider.js` abstraction + `anthropic.js` (with browser-access header) + `openai.js`.
- [ ] JSON-mode helper: fence stripping, parse, single retry on failure.
- [ ] Home city/country/currency fields; visited-countries checklist with search.

### Phase 2 — Plan page (full input spec)
- [ ] Rebuild `voyage-dashboard.html` form to the exact 9 inputs in §3.1 (regions list, ages, month, budget tiers, new-countries toggle, AI textarea).
- [ ] Wire Generate → recommendation call → render destination cards from JSON (reuse existing card design; placeholder images fine).
- [ ] Card select → create trip record → navigate to Itinerary.
- [ ] Loading, offline, and API-error states.

### Phase 3 — Itinerary page
- [ ] Port `detailed-itinerary.html` components; render from itinerary JSON (route table, transport cards, hotel cards, daily highlights, budget card).
- [ ] Restaurant cards with citation links (web search tool enabled in the call).
- [ ] Refinement chat thread with persistent history; each turn updates itinerary JSON.
- [ ] Confirm-itinerary → status `confirmed`; itinerary cached for offline viewing.

### Phase 4 — Expenses page
- [ ] Quick-add form + expense list grouped by day; edit/delete.
- [ ] FX fetch + cache; conversion to home currency with "rates as of" label.
- [ ] Budget-vs-actual bars (daily and trip total vs AI estimate); category breakdown.
- [ ] CSV export.
- [ ] Verify full offline flow in airplane mode.

### Phase 5 — Polish & gift-readiness
- [ ] Trip report (estimate vs actual by category) on completed trips.
- [ ] Saved trips management on Profile; duplicate trip.
- [ ] Empty states, haptics (`navigator.vibrate`), touch micro-interactions from mockups.
- [ ] App icon + splash; first-run onboarding (2–3 screens: welcome → enter API key → home city).
- [ ] Final Lighthouse pass (PWA, performance, a11y); test on Android Chrome + iOS Safari.

## 7. Acceptance Criteria (v1 done when…)
1. Installs from URL on Android and iPhone; opens standalone with icon.
2. With a valid API key, Generate returns ≥3 destination cards matching all 9 inputs, including cost estimate, weather and visa notes.
3. "New locations" toggle demonstrably excludes visited countries.
4. Itinerary shows route, transport, accommodation, activities, dinner restaurants **with source links**, and budget breakdown; refinement chat updates it.
5. In airplane mode: confirmed itinerary is viewable and expenses can be added, edited, and exported.
6. All data survives app restarts; wiping the site data clears everything (no server traces).

## 8. Risks / Notes
- **CORS:** Anthropic needs the `anthropic-dangerous-direct-browser-access: true` header; OpenAI allows direct browser calls. If a provider tightens CORS later, fallback = 30-line Cloudflare Worker proxy (out of scope for v1).
- **API key on device:** acceptable for a single trusted user; never commit keys; key lives only in IndexedDB.
- **iOS PWA quirks:** storage can be evicted if the app is unused for weeks — mention CSV export as the backup habit.
- **Restaurant quality claims:** always render the citation so "chef-rated / local favourite" is verifiable, not asserted.
