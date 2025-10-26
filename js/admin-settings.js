// js/admin-settings.js
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { SHEET_SIZES } from './imposition-logic.js';

// Flatten the grouped standard sizes into a single array for easier use
const STANDARD_SIZES_FLAT = Object.values({
    "US Sizes": [
        { "name": "US Letter", "group": "US Sizes", "width_in": 8.5, "height_in": 11 },
        { "name": "US Legal", "group": "US Sizes", "width_in": 8.5, "height_in": 14 },
        { "name": "US Tabloid", "group": "US Sizes", "width_in": 11, "height_in": 17 }
    ],
    "A Series": [
        { "name": "A5", "group": "A Series", "width_mm": 148, "height_mm": 210 },
        { "name": "A4", "group": "A Series", "width_mm": 210, "height_mm": 297 },
        { "name": "A3", "group": "A Series", "width_mm": 297, "height_mm": 420 }
    ],
    "B Series": [
        { "name": "B5", "group": "B Series", "width_mm": 176, "height_mm": 250 },
        { "name": "B4", "group": "B Series", "width_mm": 250, "height_mm": 353 }
    ],
    "Other": [
       { "name": "Business Card", "group": "Other", "width_in": 3.5, "height_in": 2 }
    ]
}).flat();


export function initializeSettings(db) {
    const rulesContainer = document.getElementById('imposition-rules');
    const addRuleButton = document.getElementById('add-rule-button');
    const saveGlobalButton = document.getElementById('save-global-settings');
    const globalSettingsForm = document.getElementById('global-settings-form');

    const rulesCollection = collection(db, 'impositionDefaults');
    const globalSettingsDocRef = doc(db, 'settings', 'globalImpositionDefaults');

    // --- Load and Render Global Settings ---
    getDoc(globalSettingsDocRef).then((docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            globalSettingsForm.querySelector('#global-bleed').value = data.bleedInches || 0.125;
            globalSettingsForm.querySelector('#global-gutter').value = data.gutterInches || 0.25;
            globalSettingsForm.querySelector('#crop-mark-style').value = data.cropMarkStyle || 'standard';
        }
    });

    saveGlobalButton.addEventListener('click', () => {
        const data = {
            bleedInches: parseFloat(globalSettingsForm.querySelector('#global-bleed').value),
            gutterInches: parseFloat(globalSettingsForm.querySelector('#global-gutter').value),
            cropMarkStyle: globalSettingsForm.querySelector('#crop-mark-style').value,
        };
        setDoc(globalSettingsDocRef, data, { merge: true })
            .then(() => alert('Global settings saved!'))
            .catch(err => alert(`Error: ${err.message}`));
    });

    // --- Load and Render Imposition Rules ---
    onSnapshot(rulesCollection, (snapshot) => {
        const rules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRules(rules);
    });

    function renderRules(rules) {
        rulesContainer.innerHTML = ''; // Clear existing rows
        if (rules.length === 0) {
            rulesContainer.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">No rules defined. Add a rule to get started.</td></tr>`;
        }
        rules.forEach(rule => {
            const ruleRow = document.createElement('tr');
            ruleRow.id = `rule-${rule.id}`;

            // 1. Document Size Select
            const docSizeCell = document.createElement('td');
            docSizeCell.className = 'px-6 py-4 whitespace-nowrap';
            const docSizeSelect = createSelect(STANDARD_SIZES_FLAT.map(s => s.name), rule.docSize);
            docSizeSelect.onchange = () => updateRule(rule.id, { docSize: docSizeSelect.value });
            docSizeCell.appendChild(docSizeSelect);

            // 2. Press Sheet Select
            const sheetSizeCell = document.createElement('td');
            sheetSizeCell.className = 'px-6 py-4 whitespace-nowrap';
            const sheetSizeSelect = createSelect(SHEET_SIZES.map(s => s.name), rule.pressSheet);
            sheetSizeSelect.onchange = () => updateRule(rule.id, { pressSheet: sheetSizeSelect.value });
            sheetSizeCell.appendChild(sheetSizeSelect);

            // 3. Columns Input
            const columnsCell = document.createElement('td');
            columnsCell.className = 'px-6 py-4 whitespace-nowrap';
            const columnsInput = createNumberInput(rule.columns, 1);
            columnsInput.oninput = () => updateRule(rule.id, { columns: parseInt(columnsInput.value, 10) });
            columnsCell.appendChild(columnsInput);

            // 4. Rows Input
            const rowsCell = document.createElement('td');
            rowsCell.className = 'px-6 py-4 whitespace-nowrap';
            const rowsInput = createNumberInput(rule.rows, 1);
            rowsInput.oninput = () => updateRule(rule.id, { rows: parseInt(rowsInput.value, 10) });
            rowsCell.appendChild(rowsInput);

            // 5. Orientation Select
            const orientationCell = document.createElement('td');
            orientationCell.className = 'px-6 py-4 whitespace-nowrap';
            const orientationSelect = createSelect(['portrait', 'landscape', 'auto'], rule.orientation);
            orientationSelect.onchange = () => updateRule(rule.id, { orientation: orientationSelect.value });
            orientationCell.appendChild(orientationSelect);

            // 6. Actions Cell
            const actionsCell = document.createElement('td');
            actionsCell.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'text-red-500 hover:text-red-700';
            deleteButton.onclick = () => {
                if(confirm('Are you sure you want to delete this rule?')) {
                    deleteDoc(doc(db, 'impositionDefaults', rule.id));
                }
            };
            actionsCell.appendChild(deleteButton);

            ruleRow.append(docSizeCell, sheetSizeCell, columnsCell, rowsCell, orientationCell, actionsCell);
            rulesContainer.appendChild(ruleRow);
        });
    }

    function createSelect(options, selectedValue) {
        const select = document.createElement('select');
        select.className = 'form-select block w-full rounded-md border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        options.forEach(opt => select.add(new Option(opt, opt)));
        select.value = selectedValue || options[0];
        return select;
    }

    function createNumberInput(value, min) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.className = 'form-input block w-20 rounded-md border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';
        input.value = value || min;
        return input;
    }

    async function updateRule(id, data) {
        const ruleRef = doc(db, 'impositionDefaults', id);
        try {
            await setDoc(ruleRef, data, { merge: true });
        } catch (error) {
            console.error("Error updating rule:", error);
        }
    }

    addRuleButton.addEventListener('click', () => {
        addDoc(rulesCollection, {
            docSize: STANDARD_SIZES_FLAT[0].name,
            pressSheet: SHEET_SIZES[0].name,
            columns: 2,
            rows: 1,
            orientation: 'landscape'
        });
    });
}
