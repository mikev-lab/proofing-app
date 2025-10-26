import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { STANDARD_PAPER_SIZES } from './guides.js';
import { SHEET_SIZES } from './constants.js';

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

const rulesContainer = document.getElementById('imposition-rules-container');
const addRuleButton = document.getElementById('add-rule-button');

let rules = [];

async function fetchRules() {
    const querySnapshot = await getDocs(collection(db, "impositionDefaults"));
    rules = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRules();
}

function renderRules() {
    rulesContainer.innerHTML = '';
    rules.forEach(rule => {
        const ruleEl = document.createElement('div');
        ruleEl.className = 'flex items-center space-x-4';

        const sourceOptions = STANDARD_PAPER_SIZES.map(s => `<option value="${s.name}" ${s.name === rule.sourceSize ? 'selected' : ''}>${s.name}</option>`).join('');
        const sheetOptions = SHEET_SIZES.map(s => `<option value="${s.name}" ${s.name === rule.pressSheet ? 'selected' : ''}>${s.name}</option>`).join('');

        ruleEl.innerHTML = `
            <select class="source-size w-1/2 bg-slate-700 rounded p-2">${sourceOptions}</select>
            <span>-></span>
            <select class="press-sheet w-1/2 bg-slate-700 rounded p-2">${sheetOptions}</select>
            <button class="save-rule text-green-400 hover:text-green-300" data-id="${rule.id}">Save</button>
            <button class="delete-rule text-red-400 hover:text-red-300" data-id="${rule.id}">Delete</button>
        `;
        rulesContainer.appendChild(ruleEl);
    });
}

addRuleButton.addEventListener('click', () => {
    const newRule = { id: `rule_${Date.now()}`, sourceSize: STANDARD_PAPER_SIZES[0].name, pressSheet: SHEET_SIZES[0].name };
    rules.push(newRule);
    renderRules();
});

rulesContainer.addEventListener('click', async (e) => {
    const target = e.target;
    const ruleId = target.dataset.id;

    if (target.classList.contains('save-rule')) {
        const ruleEl = target.parentElement;
        const sourceSize = ruleEl.querySelector('.source-size').value;
        const pressSheet = ruleEl.querySelector('.press-sheet').value;

        await setDoc(doc(db, "impositionDefaults", ruleId), { sourceSize, pressSheet });
        alert('Rule saved!');
        fetchRules();
    }

    if (target.classList.contains('delete-rule')) {
        if (confirm('Are you sure you want to delete this rule?')) {
            await deleteDoc(doc(db, "impositionDefaults", ruleId));
            alert('Rule deleted!');
            fetchRules();
        }
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        fetchRules();
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('logout-button').addEventListener('click', () => {
    signOut(auth);
});
