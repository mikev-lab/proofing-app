// In js/quote.js
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { app } from './firebase.js'; // Import your existing firebase app instance

const functions = getFunctions(app);

// --- Define our two cloud functions ---
const getPublicPaperList = httpsCallable(functions, 'estimators_getPublicPaperList');
const calculateEstimate = httpsCallable(functions, 'estimators_calculateEstimate');

// --- Get DOM Elements ---
const form = document.getElementById('quote-form');
const bwPaperSelect = document.getElementById('bw-paper');
const colorPaperSelect = document.getElementById('color-paper');
const coverPaperSelect = document.getElementById('cover-paper');
const priceDisplay = document.getElementById('price-display');
const quoteButton = document.getElementById('get-quote-button');

// --- Helper to populate dropdowns ---
function populatePaperSelects(papers) {
    bwPaperSelect.innerHTML = '<option value="">-- Select Paper --</option>';
    colorPaperSelect.innerHTML = '<option value="">-- Select Paper --</option>';
    coverPaperSelect.innerHTML = '<option value="">-- Select Paper --</option>';

    let currentGroup = "";
    papers.forEach(paper => {
        // Create the option
        const option = document.createElement('option');
        option.value = paper.sku;
        option.textContent = `(${paper.gsm}gsm ${paper.finish}) ${paper.name}`;

        // Group by usage
        if (paper.usage !== currentGroup) {
            currentGroup = paper.usage;
            const optgroup = document.createElement('optgroup');
            optgroup.label = currentGroup;
            bwPaperSelect.appendChild(optgroup.cloneNode(true));
            colorPaperSelect.appendChild(optgroup.cloneNode(true));
            coverPaperSelect.appendChild(optgroup.cloneNode(true));
        }

        // Append the option to the current group in each select
        bwPaperSelect.lastChild.appendChild(option.cloneNode(true));
        colorPaperSelect.lastChild.appendChild(option.cloneNode(true));
        coverPaperSelect.lastChild.appendChild(option.cloneNode(true));
    });
}

// --- 1. Load Papers on Page Load ---
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const result = await getPublicPaperList();
        const { papers } = result.data;
        populatePaperSelects(papers);
    } catch (error) {
        console.error(error);
        priceDisplay.innerHTML = `<p class="error">Error loading paper list. Please refresh.</p>`;
        quoteButton.disabled = true;
        quoteButton.textContent = 'Estimator Unavailable';
    }
});

// --- 2. Handle Form Submit ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    quoteButton.disabled = true;
    quoteButton.textContent = 'Calculating...';
    priceDisplay.innerHTML = '';

    try {
        // --- Build the JobDetails object (SECURE) ---
        // We only send the values the customer has control over.
        // The backend (Node C) will apply all our internal defaults.
        const jobDetails = {
            quantity: parseInt(document.getElementById('quantity').value) || 0,
            finishedWidth: parseFloat(document.getElementById('width').value) || 0,
            finishedHeight: parseFloat(document.getElementById('height').value) || 0,
            bwPages: parseInt(document.getElementById('bw-pages').value) || 0,
            bwPaperSku: document.getElementById('bw-paper').value || null,
            colorPages: parseInt(document.getElementById('color-pages').value) || 0,
            colorPaperSku: document.getElementById('color-paper').value || null,
            hasCover: document.getElementById('has-cover').checked,
            coverPaperSku: document.getElementById('cover-paper').value || null,
            laminationType: document.getElementById('lamination').value,
            bindingMethod: document.getElementById('binding').value
        };

        // --- Call the main calculator ---
        const result = await calculateEstimate(jobDetails);
        const data = result.data; // This is the public, sanitized payload

        if (data.error) {
            // Show calculation errors (e.g., "Saddle stitch needs 4 pages")
            priceDisplay.innerHTML = `<p class="error">Error: ${data.error}</p>`;
        } else {
            // --- FIX: Handle both admin (totalCost) and user (totalPrice) responses ---
            const totalPrice = data.totalPrice ?? data.totalCost;
            const pricePerUnit = data.pricePerUnit;

            // Success! Display the price.
            priceDisplay.innerHTML = `
                <h3>Your Quote</h3>
                <p>Total Price: <strong>$${totalPrice.toFixed(2)}</strong></p>
                <p>Price Per Unit: <strong>$${pricePerUnit.toFixed(2)}</strong></p>
            `;
        }
    } catch (error) {
        // Handle function call errors (e.g., network issue)
        console.error(error);
        priceDisplay.innerHTML = `<p class="error">A server error occurred. Please try again.</p>`;
    } finally {
        quoteButton.disabled = false;
        quoteButton.textContent = 'Get Quote';
    }
});
