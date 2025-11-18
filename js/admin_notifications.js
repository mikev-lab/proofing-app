import { db, auth } from './firebase.js';
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function initializeGlobalNotifications() {
    const bell = document.getElementById('notification-bell');
    const indicator = document.getElementById('notification-indicator');
    const panel = document.getElementById('notification-panel');
    const list = document.getElementById('notification-list');

    if (!bell || !panel || !list) {
        console.warn("Notification elements not found on this page.");
        return;
    }

    // Toggle Panel
    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
    });

    // Close on click outside
    document.addEventListener('click', (event) => {
        if (!bell.contains(event.target) && !panel.contains(event.target)) {
            panel.classList.add('hidden');
        }
    });

    // Listen for Notifications
    // We filter for unread OR recent read ones (last 20)
    const q = query(
        collection(db, "admin_notifications"),
        orderBy("createdAt", "desc"),
        limit(20)
    );

    onSnapshot(q, (snapshot) => {
        let unreadCount = 0;
        const changes = snapshot.docChanges();

        // Process NEW notifications for Toasts
        changes.forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                // Only toast if it's very recent (created in last 10 seconds) to avoid spam on refresh
                const isRecent = data.createdAt && (Date.now() - data.createdAt.toMillis() < 10000);
                if (isRecent && !data.read) {
                    showToast(data);
                }
            }
        });

        // Render List
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<p class="px-4 py-3 text-sm text-gray-500">No notifications.</p>';
        } else {
            snapshot.forEach(docSnap => {
                const notif = docSnap.data();
                if (!notif.read) unreadCount++;
                renderNotificationItem(docSnap.id, notif, list);
            });
        }

        // Update Bell Indicator
        if (unreadCount > 0) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    });
}

function renderNotificationItem(id, data, container) {
    const item = document.createElement('div');
    const isUnread = !data.read;
    
    item.className = `px-4 py-3 border-b border-slate-700 last:border-0 cursor-pointer transition-colors group ${isUnread ? 'bg-slate-700/50 hover:bg-slate-700' : 'hover:bg-slate-800'}`;
    
    let iconColor = 'text-blue-400';
    if (data.type === 'success') iconColor = 'text-green-400';
    if (data.type === 'warning') iconColor = 'text-yellow-400';
    if (data.type === 'error') iconColor = 'text-red-400';

    const timeStr = data.createdAt ? new Date(data.createdAt.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

    item.innerHTML = `
        <div class="flex justify-between items-start">
            <p class="text-sm text-white font-semibold ${iconColor}">${data.title}</p>
            ${isUnread ? '<span class="h-2 w-2 rounded-full bg-blue-500 mt-1"></span>' : ''}
        </div>
        <p class="text-xs text-gray-300 mt-1 line-clamp-2">${data.message}</p>
        <p class="text-[10px] text-gray-500 mt-1">${timeStr}</p>
    `;

    item.addEventListener('click', async () => {
        // Mark as read
        if (isUnread) {
            try {
                await updateDoc(doc(db, "admin_notifications", id), { read: true });
            } catch (e) { console.error(e); }
        }

        // Navigate
        if (data.link) {
            if (data.isExternalLink) {
                window.open(data.link, '_blank');
            } else {
                window.location.href = data.link;
            }
        }
    });

    container.appendChild(item);
}

function showToast(data) {
    const toast = document.createElement('div');
    toast.className = "fixed top-4 right-4 bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded shadow-2xl z-[100] animate-fade-in-down max-w-sm cursor-pointer flex items-center gap-3";
    
    let icon = '<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    if (data.type === 'success') icon = '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';

    toast.innerHTML = `
        <div>${icon}</div>
        <div>
            <p class="font-semibold text-sm">${data.title}</p>
            <p class="text-xs text-gray-300">${data.message}</p>
        </div>
    `;

    toast.onclick = () => {
        if (data.link) {
            if (data.isExternalLink) window.open(data.link, '_blank');
            else window.location.href = data.link;
        }
        toast.remove();
    };

    document.body.appendChild(toast);
    setTimeout(() => { if(toast.parentElement) toast.remove(); }, 5000);
}

// Auto-initialize when imported
document.addEventListener('DOMContentLoaded', initializeGlobalNotifications);