import { auth, functions } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const tableBody = document.getElementById('history-table-body');
const modal = document.getElementById('detail-modal');
const modalSpecs = document.getElementById('modal-specs');
const modalCosts = document.getElementById('modal-costs');

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadHistory();
        } else {
            window.location.href = 'index.html';
        }
    });

    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
});

async function loadHistory() {
    try {
        const getHistory = httpsCallable(functions, 'estimators_getQuoteHistory');
        const result = await getHistory();
        renderTable(result.data.quotes);
    } catch (e) {
        console.error(e);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-400">Failed to load history.</td></tr>`;
    }
}

function renderTable(quotes) {
    if (!quotes || quotes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No quotes found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = quotes.map(quote => {
        const date = new Date(quote.createdAt).toLocaleDateString() + ' ' + new Date(quote.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const details = quote.clientDetails || {};
        const type = details.bindingMethod === 'none' ? 'Loose Sheets' : 'Booklet';
        const qty = details.quantity || 0;
        const total = (quote.totalCost || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const unit = (quote.pricePerUnit || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

        return `
            <tr class="hover:bg-slate-700/50 transition border-b border-slate-700">
                <td class="px-6 py-4 font-medium text-white whitespace-nowrap">${date}</td>
                <td class="px-6 py-4">${type}</td>
                <td class="px-6 py-4">${qty}</td>
                <td class="px-6 py-4 text-right font-bold text-emerald-400">${total}</td>
                <td class="px-6 py-4 text-right text-gray-400">${unit}</td>
                <td class="px-6 py-4 text-center">
                    <button class="view-btn text-indigo-400 hover:text-indigo-300 text-sm font-medium" data-id="${quote.id}">View Details</button>
                </td>
            </tr>
        `;
    }).join('');

    // Add listeners
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const quote = quotes.find(q => q.id === btn.dataset.id);
            openModal(quote);
        });
    });
}

function openModal(quote) {
    const d = quote.clientDetails || {};
    const b = quote.laborTimeBreakdown || {};

    // Formatting helpers
    const formatCurrency = (val) => (val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const formatTime = (mins) => {
        if (!mins) return '0m';
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const row = (label, val) => `<div class="flex justify-between py-1 border-b border-slate-700/50 last:border-0"><dt class="text-gray-400">${label}</dt><dd class="text-white text-right font-medium">${val}</dd></div>`;
    const costRow = (label, val) => row(label, formatCurrency(val));
    const sectionHeader = (title) => `<h4 class="text-indigo-400 font-semibold mb-2 mt-4 uppercase text-xs tracking-wider">${title}</h4>`;

    // --- LEFT COLUMN: SPECS & PRODUCTION ---
    let specsHtml = '';

    // 1. Specs
    specsHtml += sectionHeader('Job Specifications');
    specsHtml += row('Quantity', d.quantity);
    specsHtml += row('Dimensions', `${d.finishedWidth}" x ${d.finishedHeight}"`);
    specsHtml += row('Pages (B&W)', d.bwPages || 0);
    specsHtml += row('Pages (Color)', d.colorPages || 0);
    specsHtml += row('Paper (Interior)', d.bwPaperSku || d.colorPaperSku || 'N/A');
    if (d.hasCover) {
        specsHtml += row('Cover Stock', d.coverPaperSku || 'N/A');
        specsHtml += row('Lamination', d.laminationType || 'None');
    }
    specsHtml += row('Binding', d.bindingMethod || 'None');

    // 2. Production Stats
    specsHtml += sectionHeader('Production Metrics');
    specsHtml += row('Total Press Sheets', (quote.bwPressSheets + quote.colorPressSheets + quote.coverPressSheets).toLocaleString());
    specsHtml += row('Total Clicks', (quote.totalClicks || 0).toLocaleString());
    specsHtml += row('Imposition (B&W)', `${quote.bwImposition || 0}-up`);
    specsHtml += row('Imposition (Color)', `${quote.colorImposition || 0}-up`);
    specsHtml += row('Spoilage Added', `${d.spoilagePercent || 0}%`);

    // 3. Labor Breakdown
    specsHtml += sectionHeader('Labor Time');
    specsHtml += row('Printing', formatTime(b.printingTimeMins));
    specsHtml += row('Binding', formatTime(b.bindingTimeMins));
    specsHtml += row('Cutting/Trimming', formatTime(b.trimmingTimeMins));
    specsHtml += row('Setup & Misc', formatTime(b.setupTimeMins + (b.wastageTimeMins || 0)));
    specsHtml += row('Total Hours', `${(quote.productionTimeHours || 0).toFixed(2)} hrs`);

    // --- RIGHT COLUMN: COST & PRICING ---
    let costsHtml = '';

    // 1. Hard Costs
    costsHtml += sectionHeader('Expense Breakdown');
    costsHtml += costRow('Paper (Interior)', quote.bwPaperCost + quote.colorPaperCost);
    if (d.hasCover) costsHtml += costRow('Paper (Cover)', quote.coverPaperCost);
    costsHtml += costRow('Clicks / Meter', quote.bwClickCost + quote.colorClickCost + quote.coverClickCost);
    costsHtml += costRow('Lamination Material', quote.laminationCost);
    costsHtml += costRow('Labor Cost', quote.laborCost);
    costsHtml += `<div class="flex justify-between py-1 border-t border-slate-600 font-semibold mt-1"><dt class="text-gray-300">Subtotal (Cost)</dt><dd class="text-white">${formatCurrency(quote.subtotal)}</dd></div>`;

    // 2. Pricing Factors
    costsHtml += sectionHeader('Pricing Factors');
    costsHtml += row('Labor Rate Applied', formatCurrency(d.laborRate) + '/hr');
    costsHtml += row('Markup Percentage', `${d.markupPercent}%`);
    costsHtml += costRow('Markup Amount', quote.markupAmount);
    costsHtml += costRow('Shipping', quote.shippingCost);

    // 3. Final Total
    costsHtml += `<div class="border-t border-emerald-500/50 mt-6 pt-3 flex justify-between items-end">
        <dt class="text-xl font-bold text-white">Total Price</dt>
        <div class="text-right">
            <dd class="text-2xl font-bold text-emerald-400">${formatCurrency(quote.totalCost)}</dd>
            <span class="text-xs text-gray-500 block">${formatCurrency(quote.pricePerUnit)} / unit</span>
        </div>
    </div>`;

    modalSpecs.innerHTML = specsHtml;
    modalCosts.innerHTML = costsHtml;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
