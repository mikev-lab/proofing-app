import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {
    const userEmailElement = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const loadingSpinner = document.getElementById('loading-spinner');
    const inventoryContent = document.getElementById('inventory-content');
    const inventoryTableBody = document.getElementById('inventory-table-body');

    // Modal elements
    const receiveInventoryModal = document.getElementById('receive-inventory-modal');
    const receiveInventoryButton = document.getElementById('receive-inventory-button');
    const cancelReceiveButton = document.getElementById('cancel-receive-button');
    const receiveInventoryForm = document.getElementById('receive-inventory-form');
    const receiveInventoryItemSelect = document.getElementById('receive-inventory-item');

    const reconcileInventoryModal = document.getElementById('reconcile-inventory-modal');
    const reconcileInventoryButton = document.getElementById('reconcile-inventory-button');
    const cancelReconcileButton = document.getElementById('cancel-reconcile-button');
    const reconcileInventoryForm = document.getElementById('reconcile-inventory-form');
    const reconcileInventoryItemSelect = document.getElementById('reconcile-inventory-item');

    const itemModal = document.getElementById('item-modal');
    const itemModalTitle = document.getElementById('item-modal-title');
    const addItemButton = document.getElementById('add-item-button');
    const cancelItemButton = document.getElementById('cancel-item-button');
    const itemForm = document.getElementById('item-form');

    const functions = getFunctions();
    const receiveInventory = httpsCallable(functions, 'receiveInventory');
    const reconcileInventory = httpsCallable(functions, 'reconcileInventory');
    const upsertInventoryItem = httpsCallable(functions, 'upsertInventoryItem');

    let inventoryItems = []; // Cache for inventory items

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userEmailElement.textContent = user.email;
            await loadInventory();
        } else {
            window.location.href = 'index.html';
        }
    });

    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Sign Out Error', error);
        });
    });

    // Event listeners for receive and reconcile buttons
    receiveInventoryButton.addEventListener('click', () => {
        populateInventoryDropdowns();
        receiveInventoryModal.classList.remove('hidden');
    });

    cancelReceiveButton.addEventListener('click', () => {
        receiveInventoryModal.classList.add('hidden');
    });

    receiveInventoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            inventoryItemId: formData.get('inventoryItem'),
            packagesQuantity: formData.get('packagesQuantity'),
            totalCost: formData.get('totalCost')
        };

        try {
            await receiveInventory(data);
            alert('Inventory received successfully!');
            loadInventory(); // Refresh the table
        } catch (error) {
            console.error('Error receiving inventory:', error);
            alert(`Error: ${error.message}`);
        }

        receiveInventoryModal.classList.add('hidden');
        e.target.reset();
    });

    reconcileInventoryButton.addEventListener('click', () => {
        populateInventoryDropdowns();
        reconcileInventoryModal.classList.remove('hidden');
    });

    cancelReconcileButton.addEventListener('click', () => {
        reconcileInventoryModal.classList.add('hidden');
    });

    reconcileInventoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            inventoryItemId: formData.get('inventoryItem'),
            totalBoxCount: formData.get('totalBoxCount')
        };

        try {
            await reconcileInventory(data);
            alert('Inventory reconciled successfully!');
            loadInventory(); // Refresh the table
        } catch (error) {
            console.error('Error reconciling inventory:', error);
            alert(`Error: ${error.message}`);
        }

        reconcileInventoryModal.classList.add('hidden');
        e.target.reset();
    });

    // Event listeners for add/edit item modal
    addItemButton.addEventListener('click', () => {
        itemModalTitle.textContent = 'Add New Item';
        itemForm.reset();
        document.getElementById('item-id').value = ''; // Ensure no ID is set for new items
        itemModal.classList.remove('hidden');
    });

    cancelItemButton.addEventListener('click', () => {
        itemModal.classList.add('hidden');
    });

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            itemId: formData.get('itemId'),
            name: formData.get('name'),
            manufacturerSKU: formData.get('manufacturerSKU'),
            sheetsPerPackage: formData.get('sheetsPerPackage'),
            type: formData.get('type'),
            weight: formData.get('weight'),
            finish: formData.get('finish'),
            thickness_caliper: formData.get('thickness_caliper'),
            location: formData.get('location'),
            reorderPoint: formData.get('reorderPoint'),
            dimensions: {
                width: formData.get('dimension-width'),
                height: formData.get('dimension-height'),
                unit: formData.get('dimension-unit')
            },
            grainDirection: formData.get('grainDirection'),
            brand: formData.get('brand'),
            color: formData.get('color')
        };

        try {
            await upsertInventoryItem(data);
            alert('Inventory item saved successfully!');
            loadInventory();
        } catch (error) {
            console.error('Error saving item:', error);
            alert(`Error: ${error.message}`);
        }

        itemModal.classList.add('hidden');
    });

    function openEditModal(itemId) {
        const item = inventoryItems.find(i => i.id === itemId);
        if (item) {
            itemModalTitle.textContent = 'Edit Item';
            itemForm.reset();
            // Populate form fields
            document.getElementById('item-id').value = item.id;
            document.getElementById('name').value = item.name || '';
            document.getElementById('sheetsPerPackage').value = item.sheetsPerPackage || '';
            document.getElementById('manufacturerSKU').value = item.manufacturerSKU || '';
            document.getElementById('location').value = item.location || '';

            if (item.dimensions) {
                document.getElementById('dimension-width').value = item.dimensions.width || '';
                document.getElementById('dimension-height').value = item.dimensions.height || '';
                document.getElementById('dimension-unit').value = item.dimensions.unit || 'in';
            }

            document.getElementById('grainDirection').value = item.grainDirection || '';
            document.getElementById('weight').value = item.weight || '';
            document.getElementById('thickness_caliper').value = item.thickness_caliper || '';
            document.getElementById('type').value = item.type || '';
            document.getElementById('finish').value = item.finish || '';
            document.getElementById('brand').value = item.brand || '';
            document.getElementById('color').value = item.color || '';

            itemModal.classList.remove('hidden');
        }
    }

    inventoryTableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-btn')) {
            const itemId = e.target.dataset.id;
            openEditModal(itemId);
        }
    });

    function populateInventoryDropdowns() {
        receiveInventoryItemSelect.innerHTML = '';
        reconcileInventoryItemSelect.innerHTML = '';
        inventoryItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            receiveInventoryItemSelect.appendChild(option.cloneNode(true));
            reconcileInventoryItemSelect.appendChild(option);
        });
    }

    async function loadInventory() {
        loadingSpinner.classList.remove('hidden');
        inventoryContent.classList.add('hidden');
        inventoryItems = []; // Reset cache

        try {
            const q = query(collection(db, "inventory"), orderBy("name"));
            const querySnapshot = await getDocs(q);
            inventoryTableBody.innerHTML = ''; // Clear existing rows
            querySnapshot.forEach((doc) => {
                const item = doc.data();
                inventoryItems.push({ id: doc.id, ...item }); // Cache item

                const dimensions = item.dimensions ? `${item.dimensions.width} x ${item.dimensions.height} ${item.dimensions.unit}` : 'N/A';

                const row = `
                    <tr>
                        <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">${item.name}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300">${item.quantityInPackages}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden sm:table-cell">${item.quantityLooseSheets}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden md:table-cell">${dimensions}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden lg:table-cell">${item.grainDirection || 'N/A'}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden xl:table-cell">${item.weight || 'N/A'}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden xl:table-cell">${item.thickness_caliper ? `${item.thickness_caliper}pt` : 'N/A'}</td>
                        <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <button data-id="${doc.id}" class="text-indigo-400 hover:text-indigo-300 edit-btn">Edit</button>
                        </td>
                    </tr>
                `;
                inventoryTableBody.innerHTML += row;
            });
        } catch (error) {
            console.error("Error loading inventory: ", error);
            inventoryTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Error loading inventory.</td></tr>';
        }

        loadingSpinner.classList.add('hidden');
        inventoryContent.classList.remove('hidden');
    }
});