import { db, auth, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-button');
    const userEmailSpan = document.getElementById('user-email');

    // Auth state listener
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userEmailSpan.textContent = user.email;
            // Fetch user role and show/hide admin elements if needed
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                // Redirect non-admins
                window.location.href = 'index.html';
            } else {
                // Admin is logged in, initialize the page
                initializeApp();
            }
        } else {
            // No user is signed in.
            window.location.href = 'index.html';
        }
    });

    // Logout functionality
    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Sign Out Error', error);
        });
    });
});

async function initializeApp() {
    console.log("Admin user authenticated. Initializing estimator page...");

    // Get callable functions
    const getPublicPaperList = httpsCallable(functions, 'estimators_getPublicPaperList');
    const calculateEstimate = httpsCallable(functions, 'estimators_calculateEstimate');
    const getQuantityAnalysis = httpsCallable(functions, 'estimators_getQuantityAnalysis');

    // Fetch initial data
    await Promise.all([
        populatePaperSelects(getPublicPaperList),
        populateEstimatorDefaults()
    ]);

    // Form change listener
    const form = document.getElementById('estimator-form');
    form.addEventListener('input', debounce(handleFormChange, 500));

    // Initial calculation
    handleFormChange();

    async function handleFormChange() {
        const details = getJobDetailsFromForm();

        try {
            const result = await calculateEstimate(details);
            renderCostSummary(result.data);

            const analysisResult = await getQuantityAnalysis({ details, isOwnersLabor: false }); // Assuming isOwnersLabor is false for now
            renderQuantityAnalysis(analysisResult.data);

        } catch (error) {
            console.error("Error calculating estimate:", error);
            const costSummaryContainer = document.getElementById('cost-summary-container');
            costSummaryContainer.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    }
}

function getJobDetailsFromForm() {
    const form = document.getElementById('estimator-form');
    const formData = new FormData(form);
    const details = {};
    for (const [key, value] of formData.entries()) {
        const numValue = parseFloat(value);
        if (key.includes('Pages') || key.includes('quantity') || key.includes('Rate') || key.includes('Percent') || key.includes('Width') || key.includes('Height')) {
            details[key] = isNaN(numValue) ? 0 : numValue;
        } else if (key.includes('hasCover') || key.includes('coverPrintsOnBothSides') || key.includes('calculateShipping')) {
             details[key] = form.querySelector(`[name="${key}"]`).checked;
        }
        else {
            details[key] = value;
        }
    }
    return details;
}

function renderCostSummary(data) {
    const container = document.getElementById('cost-summary-container');
    if (!data || data.error) {
        container.innerHTML = `<p class="text-red-400">${data.error || 'An unknown error occurred.'}</p>`;
        return;
    }

    const formatCurrency = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    const totalPaperCost = data.bwPaperCost + data.colorPaperCost + data.coverPaperCost;
    const totalClickCost = data.bwClickCost + data.colorClickCost + data.coverClickCost;

    container.innerHTML = `
        <dl class="space-y-2">
            <div class="flex justify-between"><dt class="text-gray-400">Paper Cost</dt><dd class="text-white">${formatCurrency(totalPaperCost)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Click Cost</dt><dd class="text-white">${formatCurrency(totalClickCost)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Lamination Cost</dt><dd class="text-white">${formatCurrency(data.laminationCost)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Labor Cost</dt><dd class="text-white">${formatCurrency(data.laborCost)}</dd></div>
            <div class="flex justify-between font-semibold pt-2 border-t border-slate-700/50"><dt class="text-gray-300">Subtotal</dt><dd class="text-white">${formatCurrency(data.subtotal)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Markup</dt><dd class="text-white">${formatCurrency(data.markupAmount)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Shipping</dt><dd class="text-white">${formatCurrency(data.shippingCost)}</dd></div>
            <div class="flex justify-between font-bold text-lg pt-2 border-t border-slate-700/50"><dt class="text-white">Total Price</dt><dd class="text-indigo-400">${formatCurrency(data.totalCost)}</dd></div>
            <div class="flex justify-between text-sm"><dt class="text-gray-400">Price Per Unit</dt><dd class="text-gray-300">${formatCurrency(data.pricePerUnit)}</dd></div>
        </dl>
    `;
}


function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

let quantityChart = null; // To hold the chart instance

function renderQuantityAnalysis(data) {
    const { chartData, summaryData } = data;
    const canvas = document.getElementById('quantity-analysis-chart');
    const summaryContainer = document.getElementById('analysis-summary-container');

    // Clear previous results
    if (quantityChart) {
        quantityChart.destroy();
    }
    summaryContainer.innerHTML = '';

    if (!chartData || chartData.labels.length === 0) {
        canvas.style.display = 'none';
        summaryContainer.innerHTML = '<p class="text-gray-400">Not enough data to generate analysis.</p>';
        return;
    }

    canvas.style.display = 'block';

    // Create Chart
    quantityChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Total Price',
                    data: chartData.totalPrice,
                    borderColor: '#818cf8',
                    backgroundColor: '#818cf8',
                    borderWidth: 2,
                    yAxisID: 'y',
                },
                {
                    label: 'Expenses',
                    data: chartData.expenses,
                    backgroundColor: '#3b82f6',
                    stack: 'Stack 0',
                },
                {
                    label: 'Labor',
                    data: chartData.labor,
                    backgroundColor: '#f59e0b',
                    stack: 'Stack 0',
                },
                {
                    label: 'Profit',
                    data: chartData.profit,
                    backgroundColor: '#10b981',
                    stack: 'Stack 0',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                },
            },
        },
    });

    // Create Summary Table
    const table = document.createElement('table');
    table.className = 'w-full text-sm text-left text-gray-400';
    table.innerHTML = `
        <thead class="text-xs text-gray-300 uppercase bg-slate-700/50">
            <tr>
                <th scope="col" class="px-6 py-3">Quantity</th>
                <th scope="col" class="px-6 py-3">Total Profit</th>
                <th scope="col" class="px-6 py-3">Profit/Hour</th>
            </tr>
        </thead>
        <tbody>
            ${summaryData.map(row => `
                <tr class="border-b border-slate-700">
                    <td class="px-6 py-4">${row.quantity.toLocaleString()}</td>
                    <td class="px-6 py-4">${row.totalProfit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    <td class="px-6 py-4">${row.profitPerHour.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    summaryContainer.appendChild(table);
}


async function populatePaperSelects(getPublicPaperList) {
    const paperSelects = [
        document.getElementById('bwPaperSku'),
        document.getElementById('colorPaperSku'),
        document.getElementById('coverPaperSku')
    ];

    try {
        const result = await getPublicPaperList({});
        const { papers } = result.data;

        paperSelects.forEach(select => {
            if (select) {
                select.innerHTML = ''; // Clear existing options
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Select Paper';
                select.appendChild(defaultOption);

                papers.forEach(paper => {
                    const option = document.createElement('option');
                    option.value = paper.sku;
                    option.textContent = `[${paper.usage}] ${paper.name}`;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error("Error fetching paper list:", error);
        alert("Could not load paper options. Please try refreshing the page.");
    }
}

async function populateEstimatorDefaults() {
    const laborRateInput = document.getElementById('laborRate');
    const markupPercentInput = document.getElementById('markupPercent');
    const spoilagePercentInput = document.getElementById('spoilagePercent');

    try {
        const defaultsDocRef = doc(db, 'settings', 'globalEstimatorDefaults');
        const defaultsDoc = await getDoc(defaultsDocRef);

        if (defaultsDoc.exists()) {
            const data = defaultsDoc.data();
            laborRateInput.value = data.laborRate || 50;
            markupPercentInput.value = data.markupPercent || 35;
            spoilagePercentInput.value = data.spoilagePercent || 5;
        } else {
            // Use hardcoded defaults if the document doesn't exist
            laborRateInput.value = 50;
            markupPercentInput.value = 35;
            spoilagePercentInput.value = 5;
        }
    } catch (error) {
        console.error("Error fetching estimator defaults:", error);
        // Use hardcoded defaults as a fallback
        laborRateInput.value = 50;
        markupPercentInput.value = 35;
        spoilagePercentInput.value = 5;
    }
}
