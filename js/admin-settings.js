// js/admin-settings.js
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { SHEET_SIZES } from './imposition-logic.js';
import { STANDARD_PAPER_SIZES } from './guides.js';

export function initializeSettings(db) {
    const rulesContainer = document.getElementById('imposition-rules');
    const addRuleButton = document.getElementById('add-rule-button');
    let rules = [];

    const defaultsCollection = collection(db, 'impositionDefaults');

    onSnapshot(defaultsCollection, (snapshot) => {
        rules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRules();
    });

    function renderRules() {
        rulesContainer.innerHTML = '';
        rules.forEach(rule => {
            const ruleEl = document.createElement('div');
            ruleEl.className = 'flex items-center space-x-4 p-4 mb-2 bg-slate-700/50 rounded-md';

            const docSizeSelect = document.createElement('select');
            STANDARD_PAPER_SIZES.forEach(s => docSizeSelect.add(new Option(s.name, s.name)));
            docSizeSelect.value = rule.docSize;

            const sheetSizeSelect = document.createElement('select');
            SHEET_SIZES.forEach(s => sheetSizeSelect.add(new Option(s.name, s.name)));
            sheetSizeSelect.value = rule.pressSheet;

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'bg-red-600 hover:bg-red-500 text-white font-semibold py-1 px-3 rounded-md text-sm';
            deleteButton.onclick = () => deleteDoc(doc(db, 'impositionDefaults', rule.id));

            ruleEl.append('If document is ', docSizeSelect, ' use sheet ', sheetSizeSelect, deleteButton);
            rulesContainer.appendChild(ruleEl);

            docSizeSelect.onchange = () => setDoc(doc(db, 'impositionDefaults', rule.id), { ...rule, docSize: docSizeSelect.value });
            sheetSizeSelect.onchange = () => setDoc(doc(db, 'impositionDefaults', rule.id), { ...rule, pressSheet: sheetSizeSelect.value });
        });
    }

    addRuleButton.addEventListener('click', () => {
        addDoc(defaultsCollection, {
            docSize: STANDARD_PAPER_SIZES[0].name,
            pressSheet: SHEET_SIZES[0].name
        });
    });
}
