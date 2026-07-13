// VoyageAI — Expenses Page
import { getTrip, getAllTrips, saveTrip, saveExpense, getExpense, getExpensesForTrip, deleteExpense, getFxRates, saveFxRates, getSettings, generateId } from '../store.js';
import { showToast, isOnline, getCurrentTripId, setCurrentTripId } from '../app.js';

const CATEGORIES = [
  { key: 'Accommodation', icon: 'hotel', color: '#0058be' },
  { key: 'Transport', icon: 'directions_car', color: '#505f76' },
  { key: 'Food & Drink', icon: 'restaurant', color: '#755800' },
  { key: 'Activities', icon: 'confirmation_number', color: '#2170e4' },
  { key: 'Shopping', icon: 'shopping_bag', color: '#936f00' },
  { key: 'Other', icon: 'more_horiz', color: '#727785' }
];

function categoryMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function daysBetween(start, end) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.max(1, Math.ceil((e - s) / 86400000) + 1);
}

function convert(amount, fromCurrency, toCurrency, rates) {
  if (fromCurrency === toCurrency) return amount;
  if (!rates) return null;
  // rates are keyed from USD base
  const fromRate = fromCurrency === 'USD' ? 1 : (rates[fromCurrency] || null);
  const toRate = toCurrency === 'USD' ? 1 : (rates[toCurrency] || null);
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

async function fetchAndCacheRates() {
  try {
    const resp = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (!resp.ok) throw new Error('FX fetch failed');
    const data = await resp.json();
    await saveFxRates('USD', data.rates);
    return { rates: data.rates, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.warn('FX fetch error:', e);
    return null;
  }
}

async function getRatesWithCache() {
  const cached = await getFxRates('USD');
  if (isOnline()) {
    const fresh = await fetchAndCacheRates();
    if (fresh) return fresh;
  }
  return cached || null;
}

function budgetTierPerDay(trip) {
  // trip.budgetTier might be a string like 'budget', 'mid-range', 'luxury' or a number
  if (trip.dailyBudget) return Number(trip.dailyBudget);
  if (trip.budgetTier) {
    const tiers = { budget: 50, 'mid-range': 150, midrange: 150, luxury: 350, ultra: 500 };
    if (typeof trip.budgetTier === 'number') return trip.budgetTier;
    return tiers[trip.budgetTier.toLowerCase()] || 100;
  }
  return 100; // fallback USD per day
}

function generateCSV(expenses, trip) {
  const header = 'Date,Category,Amount,Currency,Note,CreatedAt';
  const rows = expenses.map((e) => {
    const note = (e.note || '').replace(/"/g, '""');
    return `${e.date},${e.category},${e.amount},${e.currency},"${note}",${e.createdAt || ''}`;
  });
  return header + '\n' + rows.join('\n');
}

function downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ─── Main render ───────────────────────────────────────────────

export async function renderExpenses(container) {
  const settings = await getSettings();
  const homeCurrency = settings.homeCurrency || 'AUD';
  const allTrips = await getAllTrips();
  // A generated itinerary is enough to start recording costs. Confirmation is
  // still useful, but should not hide an otherwise saved trip from this page.
  const eligibleTrips = allTrips.filter((t) => t.itinerary || t.status === 'confirmed' || t.status === 'completed');

  if (eligibleTrips.length === 0) {
    container.innerHTML = `
      <section class="px-margin-mobile mt-lg text-center">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant mb-4">account_balance_wallet</span>
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile mb-2">No Trips Yet</h1>
        <p class="font-body-sm text-body-sm text-on-surface-variant">Generate an itinerary first, then track expenses here.</p>
      </section>`;
    return;
  }

  // State
  const activeTripId = getCurrentTripId();
  let selectedTripId = eligibleTrips.some((t) => t.id === activeTripId)
    ? activeTripId
    : eligibleTrips[0].id;
  setCurrentTripId(selectedTripId);
  let editingExpenseId = null;
  let fxData = null;

  // Fetch FX
  fxData = await getRatesWithCache();

  // Build shell
  container.innerHTML = `
    <section class="px-margin-mobile mt-lg" id="exp-root">
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile mb-4">Expenses</h1>

      <!-- Trip selector -->
      <div class="mb-4" id="exp-trip-selector"></div>

      <!-- FX info -->
      <div id="exp-fx-info" class="mb-4"></div>

      <!-- Quick-add form -->
      <div id="exp-form-card" class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-6"></div>

      <!-- Budget vs Actual -->
      <div id="exp-budget" class="mb-6"></div>

      <!-- Category breakdown -->
      <div id="exp-categories" class="mb-6"></div>

      <!-- Trip report (completed only) -->
      <div id="exp-report" class="mb-6"></div>

      <!-- Export -->
      <div id="exp-export" class="mb-4"></div>

      <!-- Expense list -->
      <div id="exp-list" class="mb-24"></div>
    </section>`;

  // Selectors
  const root = container.querySelector('#exp-root');

  function el(id) { return root.querySelector('#' + id); }

  // ─── Trip selector ───
  function renderTripSelector() {
    const wrap = el('exp-trip-selector');
    wrap.innerHTML = `
      <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Trip</label>
      <select id="exp-trip-select" class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary">
        ${eligibleTrips.map((t) => `<option value="${t.id}" ${t.id === selectedTripId ? 'selected' : ''}>${t.destination || t.title || t.selectedDestination?.country || 'Untitled Trip'}${t.status === 'completed' ? ' (completed)' : ''}</option>`).join('')}
      </select>`;
    wrap.querySelector('#exp-trip-select').addEventListener('change', async (e) => {
      selectedTripId = e.target.value;
      setCurrentTripId(selectedTripId);
      editingExpenseId = null;
      await refreshAll();
    });
  }

  // ─── FX info ───
  function renderFxInfo() {
    const wrap = el('exp-fx-info');
    if (!fxData) {
      wrap.innerHTML = `<p class="font-body-sm text-body-sm text-on-surface-variant">No exchange rates available. Connect to the internet to fetch rates.</p>`;
      return;
    }
    const d = new Date(fxData.fetchedAt);
    wrap.innerHTML = `<p class="font-body-sm text-body-sm text-on-surface-variant">Rates as of ${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>`;
  }

  // ─── Quick-add form ───
  function renderForm(trip, expense) {
    const card = el('exp-form-card');
    const defaultCurrency = (expense && expense.currency) || trip.currency || trip.destinationCurrency || homeCurrency;
    const defaultDate = (expense && expense.date) || todayISO();
    const defaultAmount = expense ? expense.amount : '';
    const defaultCategory = (expense && expense.category) || 'Food & Drink';
    const defaultNote = (expense && expense.note) || '';

    card.innerHTML = `
      <h2 class="font-headline-md text-headline-md mb-3">${editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h2>
      <form id="exp-add-form" autocomplete="off">
        <div class="mb-3">
          <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Amount</label>
          <input type="number" id="exp-amount" step="0.01" min="0" placeholder="0.00" value="${defaultAmount}"
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary"
            style="font-size:1.5rem;font-weight:600;" inputmode="decimal" required />
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Currency</label>
            <select id="exp-currency" class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary">
              ${buildCurrencyOptions(defaultCurrency)}
            </select>
          </div>
          <div>
            <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Category</label>
            <select id="exp-category" class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary">
              ${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === defaultCategory ? 'selected' : ''}>${c.key}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mb-3">
          <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Note (optional)</label>
          <input type="text" id="exp-note" value="${escapeAttr(defaultNote)}" placeholder="e.g. Dinner at..."
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" />
        </div>
        <div class="mb-4">
          <label class="font-label-caps text-label-caps text-on-surface-variant block mb-1">Date</label>
          <input type="date" id="exp-date" value="${defaultDate}"
            class="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-body-base focus:ring-2 focus:ring-primary" required />
        </div>
        <button type="submit" class="w-full bg-primary text-white py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform">
          ${editingExpenseId ? 'Update Expense' : 'Add Expense'}
        </button>
        ${editingExpenseId ? `<button type="button" id="exp-cancel-edit" class="w-full mt-2 py-3 rounded-xl font-headline-md text-on-surface-variant active:scale-95 transition-transform">Cancel</button>` : ''}
      </form>`;

    const form = card.querySelector('#exp-add-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(form.querySelector('#exp-amount').value);
      if (!amount || amount <= 0) { showToast('Enter a valid amount', 'warning'); return; }

      const expObj = {
        id: editingExpenseId || generateId(),
        tripId: selectedTripId,
        amount,
        currency: form.querySelector('#exp-currency').value,
        category: form.querySelector('#exp-category').value,
        note: form.querySelector('#exp-note').value.trim(),
        date: form.querySelector('#exp-date').value,
        createdAt: editingExpenseId ? (expense && expense.createdAt) || new Date().toISOString() : new Date().toISOString()
      };

      await saveExpense(expObj);
      showToast(editingExpenseId ? 'Expense updated' : 'Expense added', 'success');
      editingExpenseId = null;
      await refreshAll();
    });

    const cancelBtn = card.querySelector('#exp-cancel-edit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        editingExpenseId = null;
        await refreshAll();
      });
    }
  }

  function buildCurrencyOptions(selected) {
    // Common travel currencies
    const currencies = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'NZD', 'SGD', 'HKD', 'THB', 'IDR', 'MYR', 'PHP', 'VND', 'KRW', 'CNY', 'INR', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'PLN', 'HUF', 'TRY', 'ZAR', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN'];
    // Ensure selected is in list
    if (selected && !currencies.includes(selected)) currencies.unshift(selected);
    return currencies.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  }

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Budget vs Actual ───
  function renderBudget(trip, expenses) {
    const wrap = el('exp-budget');
    const rates = fxData ? fxData.rates : null;
    const tripCurrency = trip.currency || trip.destinationCurrency || 'USD';
    const budgetPerDay = budgetTierPerDay(trip);
    const travelers = trip.travelers || trip.travelerCount || 1;
    const startDate = trip.startDate || trip.departureDate;
    const endDate = trip.endDate || trip.returnDate;
    const numDays = (startDate && endDate) ? daysBetween(startDate, endDate) : 1;

    // Convert all expenses to home currency
    let totalHome = 0;
    let todayHome = 0;
    const today = todayISO();
    for (const exp of expenses) {
      const converted = convert(exp.amount, exp.currency, homeCurrency, rates);
      const val = converted !== null ? converted : exp.amount;
      totalHome += val;
      if (exp.date === today) todayHome += val;
    }

    // Budget in home currency
    const budgetPerDayHome = convert(budgetPerDay, tripCurrency, homeCurrency, rates);
    const dailyBudget = (budgetPerDayHome !== null ? budgetPerDayHome : budgetPerDay) * travelers;
    const totalBudget = dailyBudget * numDays;

    // AI estimate total (if trip has it)
    const aiEstimate = trip.estimatedTotalCost || trip.aiEstimate || trip.estimatedCost || null;
    const aiEstimateHome = aiEstimate ? (convert(aiEstimate, tripCurrency, homeCurrency, rates) || aiEstimate) : null;

    function progressBar(label, current, max) {
      const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
      const overPct = max > 0 ? (current / max) * 100 : 0;
      let barColor = 'bg-green-500';
      if (overPct >= 100) barColor = 'bg-red-500';
      else if (overPct >= 75) barColor = 'bg-amber-500';

      return `
        <div class="mb-3">
          <div class="flex justify-between mb-1">
            <span class="font-body-sm text-body-sm text-on-surface-variant">${label}</span>
            <span class="font-body-sm text-body-sm ${overPct >= 100 ? 'text-red-600' : 'text-on-surface-variant'}">${formatCurrency(current, homeCurrency)} / ${formatCurrency(max, homeCurrency)}</span>
          </div>
          <div class="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all" style="width:${pct}%"></div>
          </div>
        </div>`;
    }

    let html = `<div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm">
      <h2 class="font-headline-md text-headline-md mb-3">Budget vs Actual</h2>
      ${progressBar("Today's spend", todayHome, dailyBudget)}
      ${progressBar('Trip total', totalHome, totalBudget)}
      ${aiEstimateHome ? progressBar('vs AI Estimate', totalHome, aiEstimateHome) : ''}
    </div>`;

    wrap.innerHTML = html;
  }

  // ─── Category breakdown ───
  function renderCategoryBreakdown(expenses) {
    const wrap = el('exp-categories');
    const rates = fxData ? fxData.rates : null;

    const totals = {};
    let grandTotal = 0;
    for (const cat of CATEGORIES) totals[cat.key] = 0;
    for (const exp of expenses) {
      const converted = convert(exp.amount, exp.currency, homeCurrency, rates);
      const val = converted !== null ? converted : exp.amount;
      totals[exp.category] = (totals[exp.category] || 0) + val;
      grandTotal += val;
    }

    if (grandTotal === 0) {
      wrap.innerHTML = '';
      return;
    }

    let barsHtml = '';
    // Stacked bar
    let stackedSegments = '';
    for (const cat of CATEGORIES) {
      if (totals[cat.key] <= 0) continue;
      const pct = (totals[cat.key] / grandTotal) * 100;
      stackedSegments += `<div style="width:${pct}%;background:${cat.color};min-width:2px" class="h-full" title="${cat.key}: ${pct.toFixed(1)}%"></div>`;
    }

    let legendHtml = '';
    for (const cat of CATEGORIES) {
      if (totals[cat.key] <= 0) continue;
      const pct = (totals[cat.key] / grandTotal) * 100;
      legendHtml += `
        <div class="flex items-center gap-2 mr-4 mb-1">
          <span class="inline-block w-3 h-3 rounded-sm flex-shrink-0" style="background:${cat.color}"></span>
          <span class="font-body-sm text-body-sm text-on-surface-variant">${cat.key}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant ml-auto">${formatCurrency(totals[cat.key], homeCurrency)} (${pct.toFixed(0)}%)</span>
        </div>`;
    }

    wrap.innerHTML = `
      <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm">
        <h2 class="font-headline-md text-headline-md mb-3">Spending by Category</h2>
        <div class="w-full h-4 rounded-full overflow-hidden flex mb-3">${stackedSegments}</div>
        <div>${legendHtml}</div>
      </div>`;
  }

  // ─── Expense list ───
  function renderExpenseList(expenses) {
    const wrap = el('exp-list');
    const rates = fxData ? fxData.rates : null;

    if (expenses.length === 0) {
      wrap.innerHTML = `<p class="text-center font-body-sm text-body-sm text-on-surface-variant py-8">No expenses recorded yet. Add one above!</p>`;
      return;
    }

    // Group by date
    const groups = {};
    for (const exp of expenses) {
      const key = exp.date || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(exp);
    }

    // Sort dates descending
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    let html = '<h2 class="font-headline-md text-headline-md mb-3">All Expenses</h2>';
    for (const date of sortedDates) {
      const dayExpenses = groups[date];
      const dayTotal = dayExpenses.reduce((sum, e) => {
        const c = convert(e.amount, e.currency, homeCurrency, rates);
        return sum + (c !== null ? c : e.amount);
      }, 0);

      html += `<div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="font-label-caps text-label-caps text-on-surface-variant">${formatDate(date)}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant">${formatCurrency(dayTotal, homeCurrency)}</span>
        </div>`;

      for (const exp of dayExpenses) {
        const meta = categoryMeta(exp.category);
        const converted = convert(exp.amount, exp.currency, homeCurrency, rates);
        const convertedStr = (converted !== null && exp.currency !== homeCurrency) ? ` (${formatCurrency(converted, homeCurrency)})` : '';

        html += `
        <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm mb-2 flex items-start gap-3">
          <span class="material-symbols-outlined text-2xl flex-shrink-0 mt-0.5" style="color:${meta.color}">${meta.icon}</span>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start">
              <div>
                <span class="font-headline-md text-headline-md">${formatCurrency(exp.amount, exp.currency)}</span>
                <span class="font-body-sm text-body-sm text-on-surface-variant">${convertedStr}</span>
              </div>
            </div>
            <div class="font-body-sm text-body-sm text-on-surface-variant">${meta.key}${exp.note ? ' &middot; ' + escapeHtml(exp.note) : ''}</div>
            ${exp.createdAt ? `<div class="font-body-sm text-body-sm text-on-surface-variant">${formatTime(exp.createdAt)}</div>` : ''}
          </div>
          <div class="flex flex-col gap-1 flex-shrink-0">
            <button class="exp-edit-btn p-1 rounded-lg active:bg-surface-container-low transition-colors" data-id="${exp.id}" aria-label="Edit expense">
              <span class="material-symbols-outlined text-xl text-on-surface-variant">edit</span>
            </button>
            <button class="exp-delete-btn p-1 rounded-lg active:bg-surface-container-low transition-colors" data-id="${exp.id}" aria-label="Delete expense">
              <span class="material-symbols-outlined text-xl text-error">delete</span>
            </button>
          </div>
        </div>`;
      }

      html += '</div>';
    }

    wrap.innerHTML = html;

    // Wire edit/delete buttons
    wrap.querySelectorAll('.exp-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        editingExpenseId = btn.dataset.id;
        await refreshAll();
        el('exp-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    wrap.querySelectorAll('.exp-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = confirm('Delete this expense?');
        if (!confirmed) return;
        await deleteExpense(btn.dataset.id);
        if (editingExpenseId === btn.dataset.id) editingExpenseId = null;
        showToast('Expense deleted', 'info');
        await refreshAll();
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ─── Export CSV ───
  function renderExport(trip, expenses) {
    const wrap = el('exp-export');
    if (expenses.length === 0) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <button id="exp-csv-btn" class="w-full bg-primary text-white py-3 rounded-xl font-headline-md shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2">
        <span class="material-symbols-outlined">download</span> Export CSV
      </button>`;
    wrap.querySelector('#exp-csv-btn').addEventListener('click', () => {
      const csv = generateCSV(expenses, trip);
      const name = (trip.destination || 'trip').replace(/[^a-zA-Z0-9]/g, '_');
      downloadCSV(csv, `voyageai_expenses_${name}_${todayISO()}.csv`);
      showToast('CSV downloaded', 'success');
    });
  }

  // ─── Trip report (completed) ───
  function renderTripReport(trip, expenses) {
    const wrap = el('exp-report');
    if (trip.status !== 'completed') { wrap.innerHTML = ''; return; }

    const rates = fxData ? fxData.rates : null;
    const tripCurrency = trip.currency || trip.destinationCurrency || 'USD';

    // Actual totals by category in home currency
    const actuals = {};
    for (const cat of CATEGORIES) actuals[cat.key] = 0;
    for (const exp of expenses) {
      const converted = convert(exp.amount, exp.currency, homeCurrency, rates);
      actuals[exp.category] = (actuals[exp.category] || 0) + (converted !== null ? converted : exp.amount);
    }

    // AI estimates by category (if trip has breakdown)
    const estimates = trip.estimatedCostBreakdown || trip.costBreakdown || trip.aiCostBreakdown || null;

    let html = `
      <div class="bg-surface-light border border-border-light rounded-2xl p-sm shadow-sm">
        <h2 class="font-headline-md text-headline-md mb-3">Trip Report: AI Estimate vs Actual</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-border-light">
                <th class="font-label-caps text-label-caps text-on-surface-variant py-2 pr-2">Category</th>
                ${estimates ? `<th class="font-label-caps text-label-caps text-on-surface-variant py-2 pr-2 text-right">Estimate</th>` : ''}
                <th class="font-label-caps text-label-caps text-on-surface-variant py-2 pr-2 text-right">Actual</th>
                ${estimates ? `<th class="font-label-caps text-label-caps text-on-surface-variant py-2 text-right">Diff</th>` : ''}
              </tr>
            </thead>
            <tbody>`;

    let totalEstimate = 0;
    let totalActual = 0;

    for (const cat of CATEGORIES) {
      const actual = actuals[cat.key];
      totalActual += actual;
      let estVal = null;
      if (estimates) {
        // Try matching category key case-insensitively
        const estKey = Object.keys(estimates).find((k) => k.toLowerCase() === cat.key.toLowerCase()) || cat.key;
        const raw = estimates[estKey];
        if (raw !== undefined && raw !== null) {
          estVal = convert(Number(raw), tripCurrency, homeCurrency, rates);
          if (estVal === null) estVal = Number(raw);
          totalEstimate += estVal;
        }
      }

      if (actual === 0 && estVal === null) continue;

      const diff = estVal !== null ? actual - estVal : null;
      const diffColor = diff !== null ? (diff > 0 ? 'text-red-600' : 'text-green-600') : '';
      const diffSign = diff !== null && diff > 0 ? '+' : '';

      html += `
              <tr class="border-b border-border-light">
                <td class="py-2 pr-2 font-body-sm text-body-sm flex items-center gap-1">
                  <span class="material-symbols-outlined text-base" style="color:${cat.color}">${cat.icon}</span>
                  ${cat.key}
                </td>
                ${estVal !== null ? `<td class="py-2 pr-2 text-right font-body-sm text-body-sm text-on-surface-variant">${formatCurrency(estVal, homeCurrency)}</td>` : (estimates ? '<td class="py-2 pr-2 text-right font-body-sm text-body-sm text-on-surface-variant">-</td>' : '')}
                <td class="py-2 pr-2 text-right font-body-sm text-body-sm">${formatCurrency(actual, homeCurrency)}</td>
                ${diff !== null ? `<td class="py-2 text-right font-body-sm text-body-sm ${diffColor}">${diffSign}${formatCurrency(Math.abs(diff), homeCurrency)}</td>` : (estimates ? '<td class="py-2 text-right font-body-sm text-body-sm text-on-surface-variant">-</td>' : '')}
              </tr>`;
    }

    // Totals row
    const totalDiff = estimates ? totalActual - totalEstimate : null;
    const totalDiffColor = totalDiff !== null ? (totalDiff > 0 ? 'text-red-600' : 'text-green-600') : '';
    const totalDiffSign = totalDiff !== null && totalDiff > 0 ? '+' : '';

    html += `
              <tr class="font-headline-md">
                <td class="py-2 pr-2">Total</td>
                ${estimates ? `<td class="py-2 pr-2 text-right">${formatCurrency(totalEstimate, homeCurrency)}</td>` : ''}
                <td class="py-2 pr-2 text-right">${formatCurrency(totalActual, homeCurrency)}</td>
                ${totalDiff !== null ? `<td class="py-2 text-right ${totalDiffColor}">${totalDiffSign}${formatCurrency(Math.abs(totalDiff), homeCurrency)}</td>` : (estimates ? '<td class="py-2"></td>' : '')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;

    wrap.innerHTML = html;
  }

  // ─── Refresh all sections ───
  async function refreshAll() {
    const trip = await getTrip(selectedTripId);
    if (!trip) return;
    const expenses = await getExpensesForTrip(selectedTripId);
    const editExp = editingExpenseId ? await getExpense(editingExpenseId) : null;

    renderForm(trip, editExp);
    renderBudget(trip, expenses);
    renderCategoryBreakdown(expenses);
    renderExpenseList(expenses);
    renderExport(trip, expenses);
    renderTripReport(trip, expenses);
  }

  // Initial render
  renderTripSelector();
  renderFxInfo();
  await refreshAll();
}
