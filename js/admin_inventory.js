// js/admin_inventory.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const loadingSpinner = document.getElementById('loading-spinner');
const inventoryContent = document.getElementById('inventory-content');
const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// --- Form & Table Elements ---
const inventoryForm = document.getElementById('inventory-form');
const vendorSelect = document.getElementById('vendor-select');
const inventoryList = document.getElementById('inventory-list');

/**
 * Fetches vendors and populates the vendor dropdown select.
 */
async function populateVendors() {
    vendorSelect.innerHTML = '<option value="">Select a vendor</option>'; // Clear existing options
    const vendorsCollection = collection(db, 'vendors');
    const vendorSnapshot = await getDocs(vendorsCollection);
    vendorSnapshot.forEach(doc => {
        const vendor = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = vendor.vendorName;
        vendorSelect.appendChild(option);
    });
}

/**
 * Fetches all inventory items, resolves their vendor references, and renders them in the table.
 */
async function loadInventory() {
    inventoryList.innerHTML = ''; // Clear the table before loading new data
    try {
        const inventoryCollection = collection(db, 'inventory');
        const inventorySnapshot = await getDocs(inventoryCollection);

        for (const itemDoc of inventorySnapshot.docs) {
            const item = itemDoc.data();
            const internalId = itemDoc.id; // The ID is the internalId

            let vendorName = 'N/A';
            if (item.vendorRef) {
                try {
                    const vendorDoc = await getDoc(item.vendorRef);
                    if (vendorDoc.exists()) {
                        vendorName = vendorDoc.data().vendorName;
                    }
                } catch (e) {
                    console.error(`Could not fetch vendor for item ${internalId}`, e);
                }
            }

            const lastVerifiedDate = item.lastVerified ? item.lastVerified.toDate().toLocaleDateString() : 'Never';

            const row = document.createElement('tr');
            row.className = 'bg-slate-800/50 hover:bg-slate-700/50';
            row.innerHTML = `
                <td class="px-6 py-4 font-mono text-xs">${internalId}</td>
                <td class="px-6 py-4">${item.name || ''}</td>
                <td class="px-6 py-4">${vendorName}</td>
                <td class="px-6 py-4">${item.location || ''}</td>
                <td class="px-6 py-4">${item.quantity !== undefined ? item.quantity : ''}</td>
                <td class="px-6 py-4">${item.currentCostPerSheet !== undefined ? `$${item.currentCostPerSheet.toFixed(2)}` : ''}</td>
                <td class="px-6 py-4">${lastVerifiedDate}</td>
                <td class="px-6 py-4 text-right">
                    <button data-id="${internalId}" class="edit-btn font-medium text-indigo-400 hover:text-indigo-300 mr-4">Edit</button>
                    <button data-id="${internalId}" class="delete-btn font-medium text-red-400 hover:text-red-300">Delete</button>
                </td>
            `;
            inventoryList.appendChild(row);
        }
    } catch (error) {
        console.error("Error loading inventory:", error);
        inventoryList.innerHTML = '<tr><td colspan="8" class="text-center py-4">Error loading inventory.</td></tr>';
    }
}

/**
 * Main function to load all necessary data when the page is accessed by an admin.
 * It populates the vendors dropdown and then loads the inventory table.
 */
async function loadPageData() {
    await populateVendors();
    await loadInventory();
}


/**
 * Auth state listener.
 * Verifies the user is an admin before loading the page content.
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().role === 'admin') {
            userEmailSpan.textContent = user.email;
            await loadPageData();
            loadingSpinner.classList.add('hidden');
            inventoryContent.classList.remove('hidden');
        } else {
            console.log("User is not an admin, redirecting.");
            alert("You do not have permission to access this page.");
            window.location.href = 'index.html';
        }
    } else {
        console.log("No user signed in, redirecting.");
        window.location.href = 'index.html';
    }
});

/**
 * Logout button event listener.
 */
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => console.error("Sign out error", error));
});

/**
 * Handles form submission to save or update an inventory item.
 * @param {Event} e The form submission event.
 */
async function saveInventory(e) {
    e.preventDefault();
    const internalId = document.getElementById('internalId').value;
    if (!internalId) {
        alert("Internal ID is required.");
        return;
    }

    const vendorId = vendorSelect.value;
    if (!vendorId) {
        alert("Please select a vendor.");
        return;
    }

    // Construct the data object from form inputs
    const data = {
        name: document.getElementById('name').value,
        manufacturerSKU: document.getElementById('manufacturerSKU').value,
        vendorRef: doc(db, 'vendors', vendorId),
        type: document.getElementById('type').value,
        weight: Number(document.getElementById('weight').value) || null,
        finish: document.getElementById('finish').value,
        thickness_caliper: Number(document.getElementById('thickness_caliper').value) || null,
        currentCostPerSheet: Number(document.getElementById('currentCostPerSheet').value) || null,
        location: document.getElementById('location').value,
        quantity: Number(document.getElementById('quantity').value) || null,
        reorderPoint: Number(document.getElementById('reorderPoint').value) || null,
    };

    try {
        // Use setDoc to create or overwrite the document
        await setDoc(doc(db, 'inventory', internalId), data);
        alert(`Item ${internalId} saved successfully.`);
        inventoryForm.reset();
        await loadInventory(); // Refresh the table to show the changes
    } catch (error) {
        console.error("Error saving inventory item:", error);
        alert("Failed to save item. See console for details.");
    }
}

/**
 * Populates the form with data from an existing item for editing.
 * @param {string} internalId The document ID of the item to edit.
 */
async function populateFormForEdit(internalId) {
    try {
        const itemDocRef = doc(db, 'inventory', internalId);
        const itemDoc = await getDoc(itemDocRef);

        if (itemDoc.exists()) {
            const data = itemDoc.data();
            // Populate all form fields
            document.getElementById('internalId').value = internalId;
            document.getElementById('name').value = data.name || '';
            document.getElementById('manufacturerSKU').value = data.manufacturerSKU || '';
            if (data.vendorRef) {
                vendorSelect.value = data.vendorRef.id;
            } else {
                 vendorSelect.value = '';
            }
            document.getElementById('type').value = data.type || '';
            document.getElementById('weight').value = data.weight || '';
            document.getElementById('finish').value = data.finish || '';
            document.getElementById('thickness_caliper').value = data.thickness_caliper || '';
            document.getElementById('currentCostPerSheet').value = data.currentCostPerSheet || '';
            document.getElementById('location').value = data.location || '';
            document.getElementById('quantity').value = data.quantity || '';
            document.getElementById('reorderPoint').value = data.reorderPoint || '';

            // Scroll to the top of the page to make the form visible
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert("Item to edit was not found.");
        }
    } catch (error) {
        console.error("Error fetching item for edit:", error);
        alert("Could not fetch item details. See console for details.");
    }
}

/**
 * Deletes an inventory item after user confirmation.
 * @param {string} internalId The document ID of the item to delete.
 */
async function deleteInventory(internalId) {
    if (confirm(`Are you sure you want to delete item ${internalId}?`)) {
        try {
            await deleteDoc(doc(db, 'inventory', internalId));
            alert(`Item ${internalId} deleted successfully.`);
            await loadInventory(); // Refresh the table
        } catch (error) {
            console.error("Error deleting item:", error);
            alert("Failed to delete item. See console for details.");
        }
    }
}

/**
 * Handles click events on the inventory table, delegating to edit or delete functions.
 * @param {Event} e The click event.
 */
function handleTableClick(e) {
    const target = e.target;
    if (target.classList.contains('edit-btn')) {
        const internalId = target.dataset.id;
        populateFormForEdit(internalId);
    } else if (target.classList.contains('delete-btn')) {
        const internalId = target.dataset.id;
        deleteInventory(internalId);
    }
}

// --- Attach Event Listeners ---
inventoryForm.addEventListener('submit', saveInventory);
inventoryList.addEventListener('click', handleTableClick);
