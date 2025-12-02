// js/admin-settings.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { STANDARD_PAPER_SIZES } from './guides.js';

const loadingSpinner = document.getElementById('loading-spinner');
const settingsContent = document.getElementById('settings-content');

// --- Global Defaults ---
const globalDefaultsForm = document.getElementById('global-defaults-form');
const bleedInchesInput = document.getElementById('bleed-inches');
const safetyInchesInput = document.getElementById('safety-inches');

// --- Estimator Defaults ---
const estimatorForm = document.getElementById('estimator-defaults-form');
const estimatorStatus = document.getElementById('estimator-status');
const markupTiersContainer = document.getElementById('markup-tiers-container');
const addMarkupTierBtn = document.getElementById('add-markup-tier-btn');

// --- Sheet Sizes ---
const sheetSizesList = document.getElementById('sheet-sizes-list');
const addSheetSizeForm = document.getElementById('add-sheet-size-form');
const newSheetNameInput = document.getElementById('new-sheet-name');
const newSheetLongInput = document.getElementById('new-sheet-long');
const newSheetShortInput = document.getElementById('new-sheet-short');

// --- Imposition Rules ---
const impositionRulesList = document.getElementById('imposition-rules-list');
const addImpositionRuleForm = document.getElementById('add-imposition-rule-form');
const newRuleDocSizeSelect = document.getElementById('new-rule-doc-size');
const newRulePressSheetSelect = document.getElementById('new-rule-press-sheet');
const newRuleTypeSelect = document.getElementById('new-rule-type');
const newRuleSlipSheetSelect = document.getElementById('new-rule-slip-sheet');
const newRuleHGutterInput = document.getElementById('new-rule-h-gutter');
const newRuleVGutterInput = document.getElementById('new-rule-v-gutter');


async function loadGlobalDefaults() {
    const docRef = doc(db, 'settings', 'globalImpositionDefaults');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        bleedInchesInput.value = data.bleedInches || 0.125;
        safetyInchesInput.value = data.safetyInches || 0.125;
    } else {
        bleedInchesInput.value = 0.125;
        safetyInchesInput.value = 0.125;
    }
}

async function saveGlobalDefaults(e) {
    e.preventDefault();
    const data = {
        bleedInches: parseFloat(bleedInchesInput.value),
        safetyInches: parseFloat(safetyInchesInput.value)
    };
    await setDoc(doc(db, 'settings', 'globalImpositionDefaults'), data);
    alert('Global defaults saved!');
}

async function loadSheetSizes() {
    const q = collection(db, 'settings', 'sheetSizes', 'sizes');
    const querySnapshot = await getDocs(q);
    sheetSizesList.innerHTML = '';
    newRulePressSheetSelect.innerHTML = '';
    querySnapshot.forEach((doc) => {
        renderSheetSize(doc.id, doc.data());
    });
}

function renderSheetSize(id, data) {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 bg-slate-700/50 rounded-md';
    div.innerHTML = `
        <span>${data.name} (${data.longSideInches}" x ${data.shortSideInches}")</span>
        <button data-id="${id}" class="delete-sheet-btn text-red-400 hover:text-red-300">Delete</button>
    `;
    sheetSizesList.appendChild(div);

    const option = document.createElement('option');
    // FIX: Set value to ID, but keep text as Name
    option.value = id; 
    option.textContent = data.name;
    // Store name in dataset so we can save it for display purposes later
    option.dataset.name = data.name; 
    newRulePressSheetSelect.appendChild(option);
}

async function addSheetSize(e) {
    e.preventDefault();
    const data = {
        name: newSheetNameInput.value,
        longSideInches: parseFloat(newSheetLongInput.value),
        shortSideInches: parseFloat(newSheetShortInput.value)
    };
    if (!data.name || !data.longSideInches || !data.shortSideInches) {
        alert('Please fill out all fields for the new sheet size.');
        return;
    }
    const docRef = await addDoc(collection(db, 'settings', 'sheetSizes', 'sizes'), data);
    renderSheetSize(docRef.id, data);
    addSheetSizeForm.reset();
}

async function deleteSheetSize(e) {
    if (e.target.classList.contains('delete-sheet-btn')) {
        const id = e.target.dataset.id;
        if (confirm('Are you sure you want to delete this sheet size?')) {
            await deleteDoc(doc(db, 'settings', 'sheetSizes', 'sizes', id));
            e.target.parentElement.remove();
        }
    }
}

function populateDocSizeSelect() {
    for (const key in STANDARD_PAPER_SIZES) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = STANDARD_PAPER_SIZES[key].name;
        newRuleDocSizeSelect.appendChild(option);
    }
}

async function loadImpositionRules() {
    const q = collection(db, 'impositionDefaults');
    const querySnapshot = await getDocs(q);
    impositionRulesList.innerHTML = '';
    querySnapshot.forEach((doc) => {
        renderImpositionRule(doc.id, doc.data());
    });
}

function renderImpositionRule(id, data) {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 bg-slate-700/50 rounded-md';
    const sheetName = data.pressSheetName || data.pressSheet || data.pressSheetId || 'Unknown';
    
    // Format extra settings for display
    const typeLabel = data.impositionType ? `(${data.impositionType})` : '';
    const slipLabel = data.slipSheetColor && data.slipSheetColor !== 'none' ? `[${data.slipSheetColor} Slip]` : '';
    
    // NEW: Format Gutter Label
    const hGut = parseFloat(data.horizontalGutter) || 0;
    const vGut = parseFloat(data.verticalGutter) || 0;
    const gutterLabel = (hGut > 0 || vGut > 0) ? `| Gutters: H:${hGut}" V:${vGut}"` : '';
    
    div.innerHTML = `
        <div class="text-sm">
            <strong>${data.docSize}</strong> &rarr; <strong>${sheetName}</strong> 
            <span class="text-gray-400 text-xs ml-2">${typeLabel} ${slipLabel} ${gutterLabel}</span>
        </div>
        <button data-id="${id}" class="delete-rule-btn text-red-400 hover:text-red-300 text-sm">Delete</button>
    `;
    impositionRulesList.appendChild(div);
}

async function addImpositionRule(e) {
    e.preventDefault();
    
    const selectedOption = newRulePressSheetSelect.options[newRulePressSheetSelect.selectedIndex];
    
    const data = {
        docSize: newRuleDocSizeSelect.value,
        pressSheetId: newRulePressSheetSelect.value,
        pressSheetName: selectedOption.dataset.name || selectedOption.text,
        impositionType: newRuleTypeSelect.value,
        slipSheetColor: newRuleSlipSheetSelect.value,
        // NEW: Save Gutter Values
        horizontalGutter: parseFloat(newRuleHGutterInput.value) || 0,
        verticalGutter: parseFloat(newRuleVGutterInput.value) || 0
    };
    
    if (!data.docSize || !data.pressSheetId) {
        alert('Please select both a document size and a press sheet.');
        return;
    }
    const docRef = await addDoc(collection(db, 'impositionDefaults'), data);
    renderImpositionRule(docRef.id, data);
}

async function deleteImpositionRule(e) {
    if (e.target.classList.contains('delete-rule-btn')) {
        const id = e.target.dataset.id;
        if (confirm('Are you sure you want to delete this imposition rule?')) {
            await deleteDoc(doc(db, 'impositionDefaults', id));
            e.target.parentElement.remove();
        }
    }
}

// --- Estimator Defaults Logic ---
function renderMarkupTier(tierData = { maxQuantity: 100, markupPercent: 50 }) {
    const div = document.createElement('div');
    div.className = 'flex items-center space-x-2';
    div.innerHTML = `
        <span class="text-gray-400 text-sm">Up to</span>
        <input type="number" class="tier-qty form-input w-24" placeholder="Qty" value="${tierData.maxQuantity}">
        <span class="text-gray-400 text-sm">units:</span>
        <input type="number" class="tier-pct form-input w-20" placeholder="%" value="${tierData.markupPercent}">
        <span class="text-gray-400 text-sm">%</span>
        <button type="button" class="remove-tier-btn text-red-400 hover:text-red-300 ml-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    // Attach listener
    div.querySelector('.remove-tier-btn').addEventListener('click', () => div.remove());
    markupTiersContainer.appendChild(div);
}

async function loadEstimatorDefaults() {
    if (!estimatorForm) return;
    const estimatorDefaultsRef = doc(db, "settings", "globalEstimatorDefaults");
    try {
        const docSnap = await getDoc(estimatorDefaultsRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('default-labor-rate').value = data.laborRate || 50;
            document.getElementById('default-markup').value = data.markupPercent || 35;
            document.getElementById('default-spoilage').value = data.spoilagePercent || 5;

            markupTiersContainer.innerHTML = '';
            if (data.markupTiers && Array.isArray(data.markupTiers)) {
                data.markupTiers.forEach(tier => renderMarkupTier(tier));
            } else {
                // Default if missing
                renderMarkupTier({ maxQuantity: 10, markupPercent: 200 });
                renderMarkupTier({ maxQuantity: 100, markupPercent: 100 });
                renderMarkupTier({ maxQuantity: 1000000, markupPercent: 30 });
            }
        } else {
            document.getElementById('default-labor-rate').value = 50;
            document.getElementById('default-markup').value = 35;
            document.getElementById('default-spoilage').value = 5;
            renderMarkupTier({ maxQuantity: 100, markupPercent: 50 });
        }
    } catch (err) {
        console.error(err);
        estimatorStatus.textContent = "Error loading defaults.";
    }
}

async function saveEstimatorDefaults(e) {
    e.preventDefault();
    estimatorStatus.textContent = "Saving...";

    // Gather Tiers
    const tiers = [];
    const tierDivs = markupTiersContainer.children;
    for (let div of tierDivs) {
        const qty = parseInt(div.querySelector('.tier-qty').value);
        const pct = parseFloat(div.querySelector('.tier-pct').value);
        if (!isNaN(qty) && !isNaN(pct)) {
            tiers.push({ maxQuantity: qty, markupPercent: pct });
        }
    }
    // Sort by quantity
    tiers.sort((a, b) => a.maxQuantity - b.maxQuantity);

    try {
        const data = {
            laborRate: parseFloat(document.getElementById('default-labor-rate').value),
            markupPercent: parseFloat(document.getElementById('default-markup').value),
            spoilagePercent: parseFloat(document.getElementById('default-spoilage').value),
            markupTiers: tiers
        };
        const estimatorDefaultsRef = doc(db, "settings", "globalEstimatorDefaults");
        await setDoc(estimatorDefaultsRef, data, { merge: true });
        estimatorStatus.textContent = "Defaults saved!";
    } catch (err) {
        console.error(err);
        estimatorStatus.textContent = "Error saving defaults.";
    }
}

if (addMarkupTierBtn) {
    addMarkupTierBtn.addEventListener('click', () => renderMarkupTier());
}


onAuthStateChanged(auth, (user) => {
    if (user) {
        Promise.all([
            loadGlobalDefaults(),
            loadSheetSizes(),
            loadImpositionRules(),
            populateDocSizeSelect(),
            loadEstimatorDefaults()
        ]).then(() => {
            loadingSpinner.classList.add('hidden');
            settingsContent.classList.remove('hidden');
        });
    } else {
        window.location.href = 'index.html';
    }
});

globalDefaultsForm.addEventListener('submit', saveGlobalDefaults);
addSheetSizeForm.addEventListener('submit', addSheetSize);
sheetSizesList.addEventListener('click', deleteSheetSize);
addImpositionRuleForm.addEventListener('submit', addImpositionRule);
impositionRulesList.addEventListener('click', deleteImpositionRule);

if (estimatorForm) {
    estimatorForm.addEventListener('submit', saveEstimatorDefaults);
}
