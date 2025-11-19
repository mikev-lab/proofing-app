import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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


    function renderNotifications(notifications, unreadCount) {
        notificationList.innerHTML = ''; // Clear existing notifications
        if (notifications.length === 0) {
            notificationList.innerHTML = '<p class="px-4 py-2 text-sm text-gray-400">No notifications yet.</p>';
        } else {
            notifications.forEach(notification => {
                const item = document.createElement('div');
                item.className = `px-4 py-3 border-b border-slate-700/50 last:border-0 cursor-pointer transition-colors group ${notification.read ? 'hover:bg-slate-700' : 'bg-blue-900/30 hover:bg-blue-800/50'}`;
                item.innerHTML = `
                    <div class="flex justify-between items-start">
                        <p class="text-sm text-white font-semibold">${notification.title}</p>
                        ${!notification.read ? '<span class="text-[10px] text-blue-300 bg-blue-900/50 px-1.5 py-0.5 rounded">NEW</span>' : ''}
                    </div>
                    <p class="text-xs text-gray-400 mt-1">${notification.message}</p>
                    <p class="text-[10px] text-gray-500 mt-1">${new Date(notification.timestamp.seconds * 1000).toLocaleString()}</p>
                `;

                item.addEventListener('click', () => handleNotificationClick(notification));
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
            const notifRef = doc(db, "notifications", notification.id);
            await updateDoc(notifRef, { read: true });
            // Re-fetch to update the UI
            fetchAndRenderNotifications();
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

// Auto-initialize on script load
document.addEventListener('DOMContentLoaded', initializeNotifications);
