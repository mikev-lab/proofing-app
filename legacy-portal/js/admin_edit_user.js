import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');

function fetchNotifications() {
    // Placeholder function for fetching notifications
    console.log("Fetching notifications...");
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }
        if (userId) {
            loadUserData(userId);
        }
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

async function loadUserData(uid) {
    const [userDoc, companiesSnapshot] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDocs(collection(db, "companies"))
    ]);

    if (userDoc.exists()) {
        const userData = userDoc.data();
        document.getElementById('name').value = userData.name;

        const companySelect = document.getElementById('companyId');
        companySelect.innerHTML = '';
        companiesSnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().companyName;
            if (doc.id === userData.companyId) {
                option.selected = true;
            }
            companySelect.appendChild(option);
        });
    } else {
        // Handle user not found
    }
}

document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const companyId = document.getElementById('companyId').value;

    await updateDoc(doc(db, "users", userId), { name, companyId });

    window.location.href = 'admin_client_management.html';
});
