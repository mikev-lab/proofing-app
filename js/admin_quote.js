import { db, auth, functions } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { STANDARD_PAPER_SIZES } from './guides.js';
import { MARKUP_TIERS } from './admin/markup_strategy.js';

// --- State ---
const state = {
    currentStep: 1,
    totalSteps: 5,
    projectType: null, // 'booklet' | 'loose'
    paperList: [], // Loaded from backend
    selections: {
        inkType: null,
        paperFinish: null,
        paperWeight: null,
        coverFinish: null,
        coverWeight: null,
        lamination: 'none',
        binding: null
    },
    markupTiers: MARKUP_TIERS // Fallback, will try to load from DB
};

// --- Elements ---
const form = document.getElementById('quote-form');
const steps = document.querySelectorAll('.wizard-step');
const indicators = document.querySelectorAll('.step-indicator');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const sizePresetsContainer = document.getElementById('size-presets');
const customSizeInputs = document.getElementById('custom-size-inputs');
const paperWeightContainer = document.getElementById('paper-weight-container');
const coverWeightContainer = document.getElementById('cover-weight-container');
const bindingOptionsContainer = document.getElementById('binding-options');
const summaryList = document.getElementById('summary-list');
const resultContainer = document.getElementById('quote-result');
const calculateBtn = document.getElementById('calculate-btn');
const saveBtn = document.getElementById('save-quote-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        // Load Data
        await Promise.all([
            loadPaperList(),
            loadSettings()
        ]);

        initUI();
    });
});

async function loadPaperList() {
    const getPublicPaperList = httpsCallable(functions, 'estimators_getPublicPaperList');
    try {
        const result = await getPublicPaperList({});
        state.paperList = result.data.papers || [];
        console.log('Papers loaded:', state.paperList.length);
    } catch (e) {
        console.error("Failed to load papers:", e);
        alert("Error loading paper inventory. Calculations may fail.");
    }
}

async function loadSettings() {
    try {
        const defaultsDoc = await getDoc(doc(db, 'settings', 'globalEstimatorDefaults'));
        if (defaultsDoc.exists() && defaultsDoc.data().markupTiers) {
            state.markupTiers = defaultsDoc.data().markupTiers;
        }
    } catch (e) {
        console.warn("Using default markup tiers.", e);
    }
}

function initUI() {
    renderSizePresets();
    setupEventListeners();
    updateStepVisibility();
}

// --- Render Functions ---

function renderSizePresets() {
    sizePresetsContainer.innerHTML = '';
    const presets = ['US_Letter', 'A4', 'US_Business_Card', 'US_Postcard'];

    // Add presets
    presets.forEach(key => {
        const size = STANDARD_PAPER_SIZES[key];
        const btn = document.createElement('div');
        btn.className = 'option-card p-3 rounded-lg text-center text-sm';
        btn.dataset.name = 'sizePreset';
        btn.dataset.value = key;
        btn.innerHTML = `<span class="block font-bold text-white">${size.name}</span><span class="text-xs text-gray-400">Standard</span>`;
        btn.addEventListener('click', () => {
            selectOption('sizePreset', key, btn);
            customSizeInputs.classList.add('hidden');
            // Clear custom inputs to avoid confusion
            form.querySelector('[name="customWidth"]').value = '';
            form.querySelector('[name="customHeight"]').value = '';
        });
        sizePresetsContainer.appendChild(btn);
    });

    // Add Custom Button
    const customBtn = document.createElement('div');
    customBtn.className = 'option-card p-3 rounded-lg text-center text-sm';
    customBtn.dataset.name = 'sizePreset';
    customBtn.dataset.value = 'custom';
    customBtn.innerHTML = `<span class="block font-bold text-white">Custom</span><span class="text-xs text-gray-400">Enter Size</span>`;
    customBtn.addEventListener('click', () => {
        selectOption('sizePreset', 'custom', customBtn);
        customSizeInputs.classList.remove('hidden');
    });
    sizePresetsContainer.appendChild(customBtn);
}

function renderWeights(type, container, isCover = false) {
    container.innerHTML = '';
    const selectedFinish = state.selections[isCover ? 'coverFinish' : 'paperFinish'];
    if (!selectedFinish) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Select a finish first.</p>';
        return;
    }

    // New Filter Logic based on inventory properties:
    // Type: 'Cover' or 'Text' (or sometimes 'Uncoated'/'Coated' depending on data source logic, but we prioritize Text/Cover)
    // Finish: 'Opaque' (for Uncoated), 'Silk', 'Gloss'

    const relevantPapers = state.paperList.filter(p => {
        // 1. Filter by Type (Text vs Cover)
        // Check if 'type' field explicitly says Cover/Text, otherwise fallback to heuristics
        // Note: The backend 'estimators_getPublicPaperList' pushes data.type.
        // If data.type in Firestore is 'Cover' or 'Text', we use that.
        // If it uses 'Coated'/'Uncoated', we might need to rely on name or weight.
        // Let's assume standard 'Text' vs 'Cover' distinction exists in p.type or p.name.

        let isCoverItem = false;
        if (p.type && p.type.toLowerCase().includes('cover')) isCoverItem = true;
        else if (p.name.toLowerCase().includes('cover')) isCoverItem = true;
        else if (p.gsm >= 200) isCoverItem = true; // Fallback heuristic

        if (isCover && !isCoverItem) return false;
        if (!isCover && isCoverItem) return false;

        // 2. Filter by Finish
        // UI Selection: 'Uncoated', 'Matte' (Silk), 'Gloss'
        // Inventory Finish: 'Opaque', 'Uncoated', 'Silk', 'Matte', 'Gloss'
        const pFinish = (p.finish || '').toLowerCase();

        if (selectedFinish === 'Uncoated') {
            return pFinish.includes('opaque') || pFinish.includes('uncoated') || pFinish.includes('bond');
        }
        if (selectedFinish === 'Matte') { // Maps to Silk/Matte
            return pFinish.includes('silk') || pFinish.includes('matte') || pFinish.includes('satin');
        }
        if (selectedFinish === 'Gloss') {
            return pFinish.includes('gloss');
        }

        return false;
    });

    if (relevantPapers.length === 0) {
        container.innerHTML = '<p class="text-yellow-500 text-sm">No papers found for this selection.</p>';
        return;
    }

    // Sort by weight (GSM)
    relevantPapers.sort((a, b) => a.gsm - b.gsm);

    relevantPapers.forEach(paper => {
        const btn = document.createElement('div');
        btn.className = `option-card px-4 py-2 rounded-lg text-sm ${state.selections[isCover ? 'coverWeight' : 'paperWeight'] === paper.sku ? 'selected' : ''}`;
        btn.dataset.sku = paper.sku;
        // Display simplified name or weight if available
        // If name is "100lb Gloss Text", maybe just show "100lb"
        // But for safety, showing full name is better to avoid ambiguity
        btn.textContent = paper.name;

        btn.addEventListener('click', () => {
            // Deselect siblings
            Array.from(container.children).forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected');
            state.selections[isCover ? 'coverWeight' : 'paperWeight'] = paper.sku;
        });
        container.appendChild(btn);
    });
}

function renderBindingOptions() {
    bindingOptionsContainer.innerHTML = '';
    const opts = [];
    if (state.projectType === 'booklet') {
        opts.push({ id: 'saddleStitch', label: 'Saddle Stitch (Stapled)' });
        opts.push({ id: 'perfectBound', label: 'Perfect Bound (Glued)' });
    } else {
        opts.push({ id: 'none', label: 'No Binding (Loose)', selected: true });
    }

    opts.forEach(opt => {
        const div = document.createElement('div');
        div.className = `option-card p-4 rounded-lg text-center ${opt.selected ? 'selected' : ''}`;
        if(opt.selected) state.selections.binding = opt.id;

        div.textContent = opt.label;
        div.addEventListener('click', () => {
            Array.from(bindingOptionsContainer.children).forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            state.selections.binding = opt.id;
        });
        bindingOptionsContainer.appendChild(div);
    });
}

// --- Interaction Handlers ---

function selectOption(groupName, value, element) {
    // Visual Update
    const siblings = document.querySelectorAll(`.option-card[data-name="${groupName}"]`);
    siblings.forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    // State Update
    state.selections[groupName] = value;

    // Trigger Side Effects
    if (groupName === 'projectType') {
        state.projectType = value;
        // Toggle Page Count visibility
        const pcContainer = document.getElementById('page-count-container');
        if (value === 'loose') {
            pcContainer.classList.add('hidden');
            // Hide Cover Step? Or simplify it?
            // For simplified wizard, let's keep cover logic but maybe auto-hide cover step if loose?
            // Loose sheets generally don't have a separate cover unless it's a card.
            // Let's assume loose sheets = no cover step for this simple wizard.
        } else {
            pcContainer.classList.remove('hidden');
        }
        renderBindingOptions();
    }

    if (groupName === 'paperFinish') {
        renderWeights(null, paperWeightContainer, false);
    }
    if (groupName === 'coverFinish') {
        renderWeights(null, coverWeightContainer, true);
    }
}

function setupEventListeners() {
    // Generic Option Cards
    document.querySelectorAll('.option-card[data-name]').forEach(card => {
        card.addEventListener('click', () => {
            selectOption(card.dataset.name, card.dataset.value, card);
        });
    });

    // Navigation
    nextBtn.addEventListener('click', () => changeStep(1));
    prevBtn.addEventListener('click', () => changeStep(-1));

    // Advanced Toggle
    const advToggle = document.getElementById('advanced-interior-toggle');
    advToggle.addEventListener('change', (e) => {
        const simpleMode = document.getElementById('simple-ink-mode');
        const advMode = document.getElementById('advanced-ink-mode');
        if (e.target.checked) {
            simpleMode.classList.add('hidden');
            advMode.classList.remove('hidden');
        } else {
            simpleMode.classList.remove('hidden');
            advMode.classList.add('hidden');
        }
    });

    // Cover Toggle
    const coverToggle = document.getElementById('has-cover-toggle');
    coverToggle.addEventListener('change', (e) => {
        const opts = document.getElementById('cover-options');
        if (e.target.checked) {
            opts.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            opts.classList.add('opacity-50', 'pointer-events-none');
        }
    });

    // Calculate
    calculateBtn.addEventListener('click', calculateQuote);
    saveBtn.addEventListener('click', saveQuote);
}

function changeStep(dir) {
    if (!validateStep(state.currentStep)) return;

    const newStep = state.currentStep + dir;
    if (newStep < 1 || newStep > state.totalSteps) return;

    // Special Skip Logic
    // If Loose Sheets, skip Cover Step (4)
    if (state.projectType === 'loose' && newStep === 4) {
        state.currentStep = dir > 0 ? 5 : 3;
    } else {
        state.currentStep = newStep;
    }

    updateStepVisibility();
}

function updateStepVisibility() {
    steps.forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${state.currentStep}`).classList.add('active');

    // Indicators
    indicators.forEach(ind => {
        const stepNum = parseInt(ind.dataset.step);
        ind.classList.remove('active', 'completed');
        if (stepNum === state.currentStep) ind.classList.add('active');
        if (stepNum < state.currentStep) ind.classList.add('completed');
    });

    // Buttons
    prevBtn.classList.toggle('hidden', state.currentStep === 1);
    nextBtn.textContent = state.currentStep === state.totalSteps ? 'Start Over' : 'Next \u2192';
    if(state.currentStep === state.totalSteps) {
        nextBtn.classList.add('hidden'); // Hide next on final step
    } else {
        nextBtn.classList.remove('hidden');
    }

    if (state.currentStep === 5) {
        updateSummary();
    }
}

function validateStep(step) {
    // Basic validation
    if (step === 1 && !state.projectType) {
        alert('Please select a project type.');
        return false;
    }
    // Add more validation as needed
    return true;
}

function updateSummary() {
    const qty = form.querySelector('[name="quantity"]').value;
    const sizeVal = state.selections.sizePreset || 'Custom';
    let sizeStr = sizeVal;
    if (sizeVal === 'custom') {
        const w = form.querySelector('[name="customWidth"]').value;
        const h = form.querySelector('[name="customHeight"]').value;
        sizeStr = `${w}" x ${h}"`;
    } else if (STANDARD_PAPER_SIZES[sizeVal]) {
        sizeStr = STANDARD_PAPER_SIZES[sizeVal].name;
    }

    summaryList.innerHTML = `
        <dt class="text-gray-500">Project Type</dt>
        <dd class="text-right text-white font-medium capitalize">${state.projectType}</dd>

        <dt class="text-gray-500">Quantity</dt>
        <dd class="text-right text-white font-medium">${qty}</dd>

        <dt class="text-gray-500">Size</dt>
        <dd class="text-right text-white font-medium">${sizeStr}</dd>

        <dt class="text-gray-500">Interior Paper</dt>
        <dd class="text-right text-white font-medium">${state.selections.paperWeight || '-'} ${state.selections.paperFinish || '-'}</dd>
    `;

    // Reset Result
    resultContainer.classList.add('hidden');
    calculateBtn.classList.remove('hidden');
    saveBtn.classList.add('hidden');
}

// --- Calculation Logic ---

function getMarkupPercent(qty) {
    // Find matching tier
    // Tiers are sorted by quantity ascending in admin settings, but let's ensure
    const tiers = state.markupTiers.sort((a, b) => a.maxQuantity - b.maxQuantity);
    for (const tier of tiers) {
        if (qty <= tier.maxQuantity) return tier.markupPercent;
    }
    return 30; // Fallback
}

async function calculateQuote() {
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Calculating...';

    const qty = parseInt(form.querySelector('[name="quantity"]').value);
    const useAdvanced = document.getElementById('advanced-interior-toggle').checked;

    // Resolve Pages
    let bwPages = 0, colorPages = 0;
    if (useAdvanced) {
        bwPages = parseInt(form.querySelector('[name="bwPages"]').value) || 0;
        colorPages = parseInt(form.querySelector('[name="colorPages"]').value) || 0;
    } else {
        const total = parseInt(form.querySelector('[name="pageCount"]').value) || 0;
        // For loose sheets, usually 1 or 2 pages. The prompt implies we ask 'page count' only for books.
        // If loose sheets, maybe assume 2 (front/back) or 1?
        // Let's assume pageCount input is valid.
        const effectivePages = state.projectType === 'loose' ? (form.querySelector('[name="coverPrintsOnBothSides"]')?.checked ? 2 : 1) : total;

        // Wait, Loose Sheets logic in Step 1/2 didn't ask for page count explicitly?
        // Step 2 has "Page Count" visible always? No, I should fix that.
        // Assuming user enters total pages.

        if (state.selections.inkType === 'color') colorPages = effectivePages;
        else bwPages = effectivePages;
    }

    // Resolve Size
    let width, height;
    if (state.selections.sizePreset === 'custom') {
        width = parseFloat(form.querySelector('[name="customWidth"]').value);
        height = parseFloat(form.querySelector('[name="customHeight"]').value);
    } else {
        // Mock resolution or send preset string
        // The backend resolves string presets, but we need numeric for shipping calc if frontend does it?
        // Actually backend does everything.
        const preset = STANDARD_PAPER_SIZES[state.selections.sizePreset];
        if(preset) {
            width = preset.width_mm / 25.4;
            height = preset.height_mm / 25.4;
        } else {
            width = 8.5; height = 11;
        }
    }

    // Build Payload
    const markup = getMarkupPercent(qty);

    const payload = {
        quantity: qty,
        finishedWidth: width,
        finishedHeight: height,
        bwPages: bwPages,
        colorPages: colorPages,
        bwPaperSku: state.selections.paperWeight,
        colorPaperSku: state.selections.inkType === 'color' ? state.selections.paperWeight : null, // If full color, use same paper?
        // Actually, if 'Simple Mode', we assume same paper for whole book.
        // If InkType is Color, we assign 'colorPaperSku' = selected paper. 'bwPaperSku' = null?
        // The backend logic sums them up. If we have 0 B&W pages, bwPaperSku is ignored.
        // If we have 0 Color pages, colorPaperSku is ignored.
        // So safe to pass same SKU to both if we don't know differentiation.

        // Cover
        hasCover: document.getElementById('has-cover-toggle').checked,
        coverPaperSku: state.selections.coverWeight,
        coverPrintColor: 'COLOR', // Assume color cover for now or add input
        laminationType: state.selections.lamination,
        bindingMethod: state.selections.binding,

        markupPercent: markup,
        calculateShipping: true,

        // Flags
        saveQuote: false // Don't save yet
    };

    // Edge case fix for Simple Mode + Full Color:
    // If user selected "Color" ink and "80lb Text" paper:
    // we set colorPages = total, colorPaperSku = 'SKU'.
    // If user selected "B&W", bwPages = total, bwPaperSku = 'SKU'.
    if (!useAdvanced) {
        if (state.selections.inkType === 'color') {
            payload.colorPaperSku = state.selections.paperWeight;
            payload.bwPaperSku = null;
        } else {
            payload.bwPaperSku = state.selections.paperWeight;
            payload.colorPaperSku = null;
        }
    }

    try {
        const calculateFunc = httpsCallable(functions, 'estimators_calculateEstimate');
        const result = await calculateFunc(payload);
        const data = result.data;

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        // Display
        document.getElementById('final-price-display').textContent = data.totalPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        document.getElementById('price-per-unit-display').textContent = data.pricePerUnit.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) + ' / unit';
        document.getElementById('shipping-display').textContent = data.shippingCost > 0 ? `+ ${data.shippingCost.toLocaleString('en-US', {style:'currency', currency:'USD'})} Shipping` : 'Free Shipping / Pickup';

        resultContainer.classList.remove('hidden');
        calculateBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');

        // Store payload for saving
        state.lastPayload = payload;
        state.lastResult = data;

    } catch (e) {
        console.error(e);
        alert('Calculation failed. See console.');
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = '⚡ Calculate Quote';
    }
}

async function saveQuote() {
    if (!state.lastPayload) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    // We re-run calculation with save flag? Or just insert directly?
    // Backend `estimators_calculateEstimate` handles saving if flag is true.
    // It's safer to re-run to ensure server-side validation is logged.

    const payload = { ...state.lastPayload, saveQuote: true };

    try {
        const calculateFunc = httpsCallable(functions, 'estimators_calculateEstimate');
        await calculateFunc(payload);
        alert('Quote saved to history!');
        window.location.href = 'admin_quotes_history.html';
    } catch (e) {
        console.error(e);
        alert('Failed to save.');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Quote';
    }
}
