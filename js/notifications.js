import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

async function initializeNotifications() {
    const notificationBell = document.getElementById('notification-bell');
    const notificationIndicator = document.getElementById('notification-indicator');
    const notificationPanel = document.getElementById('notification-panel');
    const notificationList = document.getElementById('notification-list');

    if (!notificationBell || !notificationIndicator || !notificationPanel || !notificationList) {
        console.warn("Notification UI elements not found. Aborting initialization.");
        return;
    }

    onAuthStateChanged(auth, user => {
        if (user) {
            fetchAndRenderNotifications();
        }
    });

    async function fetchAndRenderNotifications() {
        try {
            const getNotifications = httpsCallable(functions, 'getNotifications');
            const result = await getNotifications();
            const { notifications } = result.data;

            let unreadCount = notifications.filter(n => !n.read).length;

            renderNotifications(notifications, unreadCount);

        } catch (error) {
            console.error("Error fetching notifications:", error);
            notificationList.innerHTML = '<p class="px-4 py-2 text-sm text-red-400">Could not load notifications.</p>';
        }
    }

    function formatNotificationDate(timestamp) {
        if (!timestamp) return '';
        if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString();
        if (timestamp._seconds) return new Date(timestamp._seconds * 1000).toLocaleString();
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) return date.toLocaleString();
        return 'Date unavailable';
    }

    // --- NEW: Standalone function to mark as read without navigating ---
    async function markAsRead(notification) {
        try {
            const notifRef = doc(db, "notifications", notification.id);
            await updateDoc(notifRef, { read: true });
            // Refresh the list to update UI (remove badge/button)
            fetchAndRenderNotifications();
        } catch (error) {
            console.error("Error marking notification as read:", error);
        }
    }

    function renderNotifications(notifications, unreadCount) {
        notificationList.innerHTML = ''; // Clear existing notifications
        if (notifications.length === 0) {
            notificationList.innerHTML = '<p class="px-4 py-2 text-sm text-gray-400">No notifications yet.</p>';
        } else {
            notifications.forEach(notification => {
                const item = document.createElement('div');
                // Added 'group' class for hover effects
                item.className = `px-4 py-3 border-b border-slate-700/50 last:border-0 cursor-pointer transition-colors group relative ${notification.read ? 'hover:bg-slate-700' : 'bg-blue-900/30 hover:bg-blue-800/50'}`;
                
                const dateString = formatNotificationDate(notification.timestamp);

                // --- NEW: Action Button HTML (Only for unread items) ---
                const actionButton = !notification.read ? `
                    <button class="mark-read-btn absolute top-3 right-3 p-1 text-gray-400 hover:text-green-400 hover:bg-slate-700/50 rounded-full transition-colors z-10" title="Mark as read">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                ` : '';

                const badge = !notification.read ? '<span class="text-[10px] text-blue-300 bg-blue-900/50 px-1.5 py-0.5 rounded ml-2">NEW</span>' : '';

                item.innerHTML = `
                    <div class="flex justify-between items-start pr-8"> <div class="w-full">
                            <div class="flex items-center mb-1">
                                <p class="text-sm text-white font-semibold">${notification.title}</p>
                                ${badge}
                            </div>
                            <p class="text-xs text-gray-400 mb-1">${notification.message}</p>
                            <p class="text-[10px] text-gray-500">${dateString}</p>
                        </div>
                    </div>
                    ${actionButton}
                `;

                // 1. Main Click: Navigate
                item.addEventListener('click', () => handleNotificationClick(notification));

                // 2. Button Click: Mark Read (Stop Propagation)
                const btn = item.querySelector('.mark-read-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation(); // <--- Prevents the row click (navigation)
                        markAsRead(notification);
                    });
                }

                notificationList.appendChild(item);
            });
        }

        if (unreadCount > 0) {
            notificationIndicator.classList.remove('hidden');
        } else {
            notificationIndicator.classList.add('hidden');
        }
    }

    async function handleNotificationClick(notification) {
        // Mark as read if it's unread
        if (!notification.read) {
            await markAsRead(notification);
        }

        // Navigate if there's a link
        if (notification.link) {
            if (notification.isExternalLink) {
                window.open(notification.link, '_blank');
            } else {
                window.location.href = notification.link;
            }
        }
    }

    // Toggle panel visibility
    notificationBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationPanel.classList.toggle('hidden');
    });

    // Close panel if clicking outside
    document.addEventListener('click', (e) => {
        if (!notificationPanel.contains(e.target) && !notificationBell.contains(e.target)) {
            notificationPanel.classList.add('hidden');
        }
    });
}

const clearNotificationsBtn = document.getElementById('clear-notifications-btn');

if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', async (e) => {
        // Prevent the dropdown from closing immediately if needed
        e.stopPropagation();

        if (!auth.currentUser) return;

        try {
            clearNotificationsBtn.textContent = "Clearing...";
            clearNotificationsBtn.disabled = true;
            clearNotificationsBtn.classList.add('opacity-50', 'cursor-not-allowed');

            // 1. Get all notifications for this user
            const q = query(
                collection(db, "notifications"), 
                where("recipientUid", "==", auth.currentUser.uid)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                // Nothing to delete
                clearNotificationsBtn.textContent = "Clear All";
                clearNotificationsBtn.disabled = false;
                clearNotificationsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                return;
            }

            // 2. Batch Delete
            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log("All notifications cleared.");

            // 3. UI Cleanup (Optional: The onSnapshot listener should handle this automatically, but we can force it)
            const list = document.getElementById('notification-list');
            if (list) {
                list.innerHTML = '<p class="px-4 py-2 text-sm text-gray-400">No new notifications</p>';
            }
            const indicator = document.getElementById('notification-indicator');
            if (indicator) {
                indicator.classList.add('hidden');
            }

        } catch (err) {
            console.error("Error clearing notifications:", err);
            alert("Failed to clear notifications.");
        } finally {
            clearNotificationsBtn.textContent = "Clear All";
            clearNotificationsBtn.disabled = false;
            clearNotificationsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

// Auto-initialize on script load
document.addEventListener('DOMContentLoaded', initializeNotifications);
