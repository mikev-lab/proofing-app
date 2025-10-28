import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');

function fetchNotifications() {
    // Placeholder function for fetching notifications
    console.log("Fetching notifications...");
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }
        document.getElementById('user-email').textContent = user.email;
        loadData();
        fetchNotifications();
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('logout-button').addEventListener('click', () => {
    signOut(auth);
    window.location.href = 'index.html';
});

notificationBell.addEventListener('click', () => {
    notificationPanel.classList.toggle('hidden');
});

// Hide panel if clicking outside
document.addEventListener('click', function(event) {
    if (!notificationBell.contains(event.target) && !notificationPanel.contains(event.target)) {
        notificationPanel.classList.add('hidden');
    }
});

async function loadData() {
    // Load companies and users in parallel
    const [companies, users] = await Promise.all([
        getDocs(collection(db, "companies")),
        getDocs(collection(db, "users"))
    ]);

    const companiesMap = new Map();
    companies.forEach(doc => companiesMap.set(doc.id, doc.data()));

    const usersMap = new Map();
    users.forEach(doc => usersMap.set(doc.id, doc.data()));

    renderCompanies(companies, usersMap);
    renderUsers(users, companiesMap);
}

async function renderCompanies(companiesSnapshot, usersMap) {
    const listEl = document.getElementById('companies-list');
    listEl.innerHTML = '';
    for (const doc of companiesSnapshot.docs) {
        const company = doc.data();
        const owner = usersMap.get(company.ownerUid);
        const ownerEmail = owner ? owner.email : 'N/A';
        listEl.innerHTML += `
            <tr class="hover:bg-slate-800">
                <td class="px-6 py-4 text-sm text-white">${company.companyName}</td>
                <td class="px-6 py-4 text-sm text-gray-300">${ownerEmail}</td>
                <td class="px-6 py-4 text-right">
                    <button class="delete-company-button text-red-400 hover:text-red-300 text-sm" data-id="${doc.id}">Delete</button>
                </td>
            </tr>`;
    }
    document.querySelectorAll('.delete-company-button').forEach(b => b.addEventListener('click', deleteCompany));
}

function renderUsers(usersSnapshot, companiesMap) {
    const listEl = document.getElementById('users-list');
    listEl.innerHTML = '';
    usersSnapshot.forEach(doc => {
        const user = doc.data();
        const company = companiesMap.get(user.companyId);
        const companyName = company ? company.companyName : 'N/A';
        listEl.innerHTML += `
            <tr class="hover:bg-slate-800">
                <td class="px-6 py-4 text-sm text-white">${user.name}</td>
                <td class="px-6 py-4 text-sm text-gray-300">${user.email}</td>
                <td class="px-6 py-4 text-sm text-gray-300">${companyName}</td>
                <td class="px-6 py-4 text-sm text-gray-300">${user.role}</td>
                <td class="px-6 py-4 text-right">
                    <a href="admin_edit_user.html?id=${doc.id}" class="text-indigo-400 hover:text-indigo-300 text-sm">Edit</a>
                    <button class="delete-user-button text-red-400 hover:text-red-300 text-sm ml-4" data-id="${doc.id}">Delete</button>
                </td>
            </tr>`;
    });
    document.querySelectorAll('.delete-user-button').forEach(b => b.addEventListener('click', deleteUser));
}

async function deleteCompany(e) {
    const companyId = e.target.dataset.id;
    if (confirm('Are you sure you want to delete this company? This is irreversible.')) {
        await deleteDoc(doc(db, "companies", companyId));
        loadData();
    }
}

async function deleteUser(e) {
    const userId = e.target.dataset.id;
    if (confirm('Are you sure you want to delete this user? This will delete their auth account and cannot be undone.')) {
        // In a real app, you would need a cloud function to delete the Firebase Auth user.
        // Deleting the Firestore doc is all we can do from the client.
        await deleteDoc(doc(db, "users", userId));
        loadData();
    }
}
