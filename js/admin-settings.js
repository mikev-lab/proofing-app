// js/admin-settings.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { STANDARD_PAPER_SIZES } from './guides.js';

const firebaseConfig = {
    apiKey: "AIzaSyApmEJdFi96QS3TwYh7GyEDSbZrCuVpBrg",
    authDomain: "proofing-application.firebaseapp.com",
    projectId: "proofing-application",
    storageBucket: "proofing-application.firebasestorage.app",
    messagingSenderId: "452256252711",
    appId: "1:452256252711:web:68795c1e5cc9438ff05f02",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loadingSpinner = document.getElementById('loading-spinner');
const settingsContent = document.getElementById('settings-content');
const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// --- Global Defaults ---
const globalDefaultsForm = document.getElementById('global-defaults-form');
const bleedInchesInput = document.getElementById('bleed-inches');
const safetyInchesInput = document.getElementById('safety-inches');

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


async function loadGlobalDefaults() {
    const docRef = doc(db, 'settings', 'globalImpositionDefaults');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        bleedInchesInput.value = data.bleedInches || 0.125;
        safetyInchesInput.value = data.safetyInches || 0.125;
    } else {
        // Set default values if the document doesn't exist
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
    option.value = data.name;
    option.textContent = data.name;
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
    div.innerHTML = `
        <span>Document: <strong>${data.docSize}</strong> -> Press Sheet: <strong>${data.pressSheet}</strong></span>
        <button data-id="${id}" class="delete-rule-btn text-red-400 hover:text-red-300">Delete</button>
    `;
    impositionRulesList.appendChild(div);
}

async function addImpositionRule(e) {
    e.preventDefault();
    const data = {
        docSize: newRuleDocSizeSelect.value,
        pressSheet: newRulePressSheetSelect.value
    };
    if (!data.docSize || !data.pressSheet) {
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

onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailSpan.textContent = user.email;
        Promise.all([
            loadGlobalDefaults(),
            loadSheetSizes(),
            loadImpositionRules(),
            populateDocSizeSelect()
        ]).then(() => {
            loadingSpinner.classList.add('hidden');
            settingsContent.classList.remove('hidden');
        });
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    signOut(auth);
});

globalDefaultsForm.addEventListener('submit', saveGlobalDefaults);
addSheetSizeForm.addEventListener('submit', addSheetSize);
sheetSizesList.addEventListener('click', deleteSheetSize);
addImpositionRuleForm.addEventListener('submit', addImpositionRule);
impositionRulesList.addEventListener('click', deleteImpositionRule);