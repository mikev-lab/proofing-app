import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, orderBy, query, where, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

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

    const costHistoryModal = document.getElementById('cost-history-modal');
    const costHistoryChartCanvas = document.getElementById('cost-history-chart');
    const closeCostHistoryModalButton = document.getElementById('close-cost-history-modal');
    const costHistoryItemName = document.getElementById('cost-history-item-name');
    let costHistoryChart = null;


    // Use the 'functions' instance imported from firebase.js
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

    // *** THIS IS THE CORRECTED CLICK LISTENER ***
    inventoryTableBody.addEventListener('click', async (e) => {
        // Get the element that was clicked, even if it's text
        const targetElement = e.target.nodeType === 1 ? e.target : e.target.parentElement;

        // Handle click on cost cell for graphing
        const costCell = targetElement.closest('.cost-cell');
        if (costCell) {
            const itemId = costCell.dataset.itemId;
            await showCostHistoryGraph(itemId);
            return;
        }

        // Handle click on edit button
        const editButton = targetElement.closest('.edit-btn');
        if (editButton) {
            e.stopPropagation(); // Stop row from expanding
            const itemId = editButton.dataset.id;
            openEditModal(itemId);
            return;
        }

        // Handle row expansion/collapse
        const row = targetElement.closest('tr');
        if (row && row.classList.contains('main-row')) {
            const detailsRow = row.nextElementSibling;
            if (detailsRow && detailsRow.classList.contains('details-row')) {
                const isHidden = detailsRow.classList.contains('hidden');

                if (isHidden && !detailsRow.dataset.loaded) {
                    const itemId = row.dataset.id;
                    const contentDiv = detailsRow.querySelector('.details-content');
                    contentDiv.innerHTML = '<div class="flex justify-center items-center p-4"><div class="loader"></div></div>'; // Show loader
                    await loadPurchaseHistory(itemId, detailsRow);
                    detailsRow.dataset.loaded = 'true';
                }

                detailsRow.classList.toggle('hidden');
            }
        }
    });
    // *** END OF CORRECTION ***

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

                const mainRow = `
                    <tr class="main-row" data-id="${doc.id}" style="cursor: pointer;">
                        <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">${item.name}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300">${item.quantityInPackages}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden sm:table-cell">${item.quantityLooseSheets}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden md:table-cell">${dimensions}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden lg:table-cell">${item.grainDirection || 'N/A'}</td>
                        <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-300 hidden xl:table-cell">${item.weight || 'N/A'}</td>
                        <td class->${item.thickness_caliper ? `${item.thickness_caliper}pt` : 'N/A'}</td>
                        <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <button data-id="${doc.id}" class="text-indigo-400 hover:text-indigo-300 edit-btn">Edit</button>
                        </td>
                    </tr>
                `;

                const detailsRow = `
                    <tr class="details-row bg-slate-900/50 hidden" data-details-for="${doc.id}">
                        <td colspan="8" class="p-4">
                            <div class="details-content text-center text-gray-400">Loading details...</div>
                        </td>
                    </tr>
                `;

                inventoryTableBody.innerHTML += mainRow + detailsRow;
            });
        } catch (error) {
            console.error("Error loading inventory: ", error);
            inventoryTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Error loading inventory.</td></tr>';
        }

        loadingSpinner.classList.add('hidden');
        inventoryContent.classList.remove('hidden');
    }

    async function loadPurchaseHistory(itemId, detailsRow) {
        const contentDiv = detailsRow.querySelector('.details-content');
        try {
            const purchasesRef = collection(db, 'inventoryPurchases');
            const q = query(purchasesRef, where("inventoryItemRef", "==", doc(db, "inventory", itemId)), orderBy("purchaseDate", "desc"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                contentDiv.innerHTML = '<p class="text-gray-400">No purchase history found for this item.</p>';
                return;
            }

            const purchases = [];
            querySnapshot.forEach(doc => {
                purchases.push(doc.data());
            });

            const lastPurchase = purchases[0]; // Most recent due to ordering
            const lastPurchaseDate = lastPurchase.purchaseDate.toDate().toLocaleDateString();

            let tableHtml = `
                <div class="p-4 bg-slate-800 rounded-lg">
                    <div class="flex justify-between items-center mb-4">
                         <h4 class="text-md font-semibold text-white">Purchase History</h4>
                         <div>
                            <span class="text-sm text-gray-400">Last Purchased:</span>
                            <span class="text-sm font-medium text-white">${lastPurchaseDate}</span>
                         </div>
                    </div>
                    <table class="min-w-full divide-y divide-slate-700">
                        <thead class="bg-slate-700/50">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Packages</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total Cost</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Cost/M</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700">
                            ${purchases.map(p => `
                                <tr>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-300">${p.purchaseDate.toDate().toLocaleDateString()}</td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-300">${p.quantityPurchasedInPackages}</td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-300">$${p.totalCost.toFixed(2)}</td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer cost-cell" data-item-id="${itemId}">$${p.costPerM_atPurchase.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            contentDiv.innerHTML = tableHtml;

        } catch (error) {
            console.error("Error loading purchase history:", error);
            contentDiv.innerHTML = '<p class="text-red-400">Error loading purchase history.</p>';
        }
    }

    async function showCostHistoryGraph(itemId) {
        const item = inventoryItems.find(i => i.id === itemId);
        if (!item) return;

        costHistoryItemName.textContent = item.name;

        try {
            const purchasesRef = collection(db, 'inventoryPurchases');
            const q = query(purchasesRef, where("inventoryItemRef", "==", doc(db, "inventory", itemId)), orderBy("purchaseDate", "asc"));
            const querySnapshot = await getDocs(q);

            const labels = [];
            const data = [];
            querySnapshot.forEach(doc => {
                const purchase = doc.data();
                labels.push(purchase.purchaseDate.toDate().toLocaleDateString());
                data.push(purchase.costPerM_atPurchase);
            });

            if (costHistoryChart) {
                costHistoryChart.destroy();
            }

            costHistoryChart = new Chart(costHistoryChartCanvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Cost per M',
                        data: data,
                        borderColor: 'rgba(79, 70, 229, 1)',
                        backgroundColor: 'rgba(79, 70, 229, 0.2)',
                        tension: 0.1,
                        fill: true,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: false,
                            ticks: {
                                color: '#9ca3af' // text-gray-400
                            },
                            grid: {
                                color: '#4b5563' // border-gray-600
                            }
                        },
                        x: {
                            ticks: {
                                color: '#9ca3af'
                            },
                             grid: {
                                display: false
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });

            costHistoryModal.classList.remove('hidden');

        } catch (error) {
            console.error("Error loading purchase history for graph:", error);
            alert("Could not load cost history data.");
        }
    }

    closeCostHistoryModalButton.addEventListener('click', () => {
        costHistoryModal.classList.add('hidden');
    });

});