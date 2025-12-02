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

    // Formatting helper
    const row = (label, val) => `<div class="flex justify-between"><dt class="text-gray-400">${label}</dt><dd class="text-white text-right">${val}</dd></div>`;
    const cost = (label, val) => row(label, (val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

    let specsHtml = '';
    specsHtml += row('Quantity', d.quantity);
    specsHtml += row('Dimensions', `${d.finishedWidth}" x ${d.finishedHeight}"`);
    specsHtml += row('Pages (B&W)', d.bwPages);
    specsHtml += row('Pages (Color)', d.colorPages);
    specsHtml += row('Paper (Interior)', d.bwPaperSku || d.colorPaperSku || 'N/A');
    if (d.hasCover) {
        specsHtml += row('Cover Stock', d.coverPaperSku);
        specsHtml += row('Lamination', d.laminationType);
    }
    specsHtml += row('Binding', d.bindingMethod);

    let costsHtml = '';
    costsHtml += cost('Paper Cost', (quote.bwPaperCost + quote.colorPaperCost + quote.coverPaperCost));
    costsHtml += cost('Click Cost', (quote.bwClickCost + quote.colorClickCost + quote.coverClickCost));
    costsHtml += cost('Labor', quote.laborCost);
    costsHtml += cost('Markup', quote.markupAmount);
    costsHtml += cost('Shipping', quote.shippingCost);
    costsHtml += `<div class="border-t border-slate-600 mt-2 pt-2 flex justify-between font-bold text-emerald-400"><dt>Total</dt><dd>${(quote.totalCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</dd></div>`;

    modalSpecs.innerHTML = specsHtml;
    modalCosts.innerHTML = costsHtml;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
