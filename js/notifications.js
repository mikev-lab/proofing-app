// js/notifications.js
import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, query, where, getDocs, writeBatch, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// [FIX] Global flag to prevent duplicate listeners
let isNotificationListenerAttached = false;

export async function initializeNotifications() {
    const notificationBell = document.getElementById('notification-bell');
    const notificationIndicator = document.getElementById('notification-indicator');
    const notificationPanel = document.getElementById('notification-panel');
    const notificationList = document.getElementById('notification-list');
    const clearNotificationsBtn = document.getElementById('clear-notifications-btn'); // Moved inside

    if (!notificationBell || !notificationIndicator || !notificationPanel || !notificationList) {
        console.warn("Notification UI elements not found during initialization.");
        return;
    }

    // Attach click listeners only once per element instance
    if (notificationBell.dataset.initialized !== 'true') {
        notificationBell.dataset.initialized = 'true';

        notificationBell.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationPanel.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!notificationPanel.contains(e.target) && !notificationBell.contains(e.target)) {
                notificationPanel.classList.add('hidden');
            }
        });
    }

    // --- "Clear All" Logic (Moved Inside) ---
    if (clearNotificationsBtn && clearNotificationsBtn.dataset.initialized !== 'true') {
        clearNotificationsBtn.dataset.initialized = 'true';
        
        clearNotificationsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (!auth.currentUser) return;

            try {
                const originalText = clearNotificationsBtn.textContent;
                clearNotificationsBtn.textContent = "Clearing...";
                clearNotificationsBtn.disabled = true;
                clearNotificationsBtn.classList.add('opacity-50', 'cursor-not-allowed');

                const q = query(
                    collection(db, "notifications"), 
                    where("recipientUid", "==", auth.currentUser.uid)
                );
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    resetClearButton();
                    return;
                }

                // Firestore batches are limited to 500 ops. 
                // If you expect >500 notifications, you need to loop batches.
                // For now, this handles standard usage.
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                await batch.commit();

                // Update UI immediately
                if (notificationList) {
                    notificationList.innerHTML = '<p class="px-4 py-2 text-sm text-gray-400">No new notifications</p>';
                }
                if (notificationIndicator) {
                    notificationIndicator.classList.add('hidden');
                }

            } catch (err) {
                console.error("Error clearing notifications:", err);
                alert("Failed to clear notifications.");
            } finally {
                resetClearButton();
            }

            function resetClearButton() {
                clearNotificationsBtn.textContent = "Clear All";
                clearNotificationsBtn.disabled = false;
                clearNotificationsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    // [FIX] Prevent multiple auth listeners
    if (!isNotificationListenerAttached) {
        isNotificationListenerAttached = true;
        onAuthStateChanged(auth, user => {
            if (user) {
                fetchAndRenderNotifications();
            }
        });
    }

    async function fetchAndRenderNotifications() {
        try {
            const getNotifications = httpsCallable(functions, 'getNotifications');
            const result = await getNotifications();
            const { notifications } = result.data;

            let unreadCount = notifications.filter(n => !n.read).length;

            renderNotifications(notifications, unreadCount);

        } catch (error) {
            console.error("Error fetching notifications:", error);
            if (notificationList) {
                notificationList.innerHTML = '<p class="px-4 py-2 text-sm text-red-400">Could not load notifications.</p>';
            }
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

    async function markAsRead(notification) {
        try {
            const notifRef = doc(db, "notifications", notification.id);
            await updateDoc(notifRef, { read: true });
            fetchAndRenderNotifications();
        } catch (error) {
            console.error("Error marking notification as read:", error);
        }
    }

    function renderNotifications(notifications, unreadCount) {
        const currentList = document.getElementById('notification-list');
        const currentIndicator = document.getElementById('notification-indicator');

        if (!currentList) return;
        currentList.innerHTML = '';

        if (notifications.length === 0) {
            currentList.innerHTML = '<p class="px-4 py-2 text-sm text-gray-400">No new notifications</p>';
        } else {
            notifications.forEach(notification => {
                const item = document.createElement('div');
                item.className = `px-4 py-3 border-b border-slate-700/50 last:border-0 cursor-pointer transition-colors group relative ${notification.read ? 'hover:bg-slate-700' : 'bg-blue-900/30 hover:bg-blue-800/50'}`;
                
                const dateString = formatNotificationDate(notification.timestamp);

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

                item.addEventListener('click', () => handleNotificationClick(notification));

                const btn = item.querySelector('.mark-read-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        markAsRead(notification);
                    });
                }

                currentList.appendChild(item);
            });
        }

        if (currentIndicator) {
            if (unreadCount > 0) {
                currentIndicator.classList.remove('hidden');
            } else {
                currentIndicator.classList.add('hidden');
            }
        }
    }

    async function handleNotificationClick(notification) {
        if (!notification.read) {
            await markAsRead(notification);
        }

        if (notification.link) {
            if (notification.isExternalLink) {
                window.open(notification.link, '_blank');
            } else {
                window.location.href = notification.link;
            }
        }
    }
}