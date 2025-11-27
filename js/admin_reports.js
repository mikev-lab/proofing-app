import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// DOM
const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// KPIs
const kpiCompletedToday = document.getElementById('kpi-completed-today');
const kpiNewWeek = document.getElementById('kpi-new-week');
const kpiPipeline = document.getElementById('kpi-pipeline');
const kpiOntime = document.getElementById('kpi-ontime');

// Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                window.location.href = 'index.html';
                return;
            }
            userEmailSpan.textContent = user.email;
            userEmailSpan.classList.remove('hidden');
            loadReports();
        } catch (error) {
            console.error(error);
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    signOut(auth);
    window.location.href = 'index.html';
});

async function loadReports() {
    try {
        const getStats = httpsCallable(functions, 'getProductionStats');
        const result = await getStats();
        const data = result.data;

        // Render KPIs
        kpiCompletedToday.textContent = data.completedToday;
        kpiNewWeek.textContent = data.newThisWeek;
        kpiPipeline.textContent = data.activePipeline;
        kpiOntime.textContent = `${data.onTimeRate}%`;

        // Render Charts
        renderThroughputChart(data.throughputHistory);
        renderVolumeChart(data.volumeHistory);

    } catch (e) {
        console.error("Failed to load stats", e);
    }
}

function renderThroughputChart(history) {
    const ctx = document.getElementById('chart-throughput').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: history.labels, // ['Mon', 'Tue'...]
            datasets: [{
                label: 'Jobs Completed',
                data: history.data,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderVolumeChart(history) {
    const ctx = document.getElementById('chart-volume').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.labels,
            datasets: [{
                label: 'New Projects',
                data: history.data,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { display: false } }
            }
        }
    });
}
