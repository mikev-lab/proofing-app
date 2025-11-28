
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeNotifications } from './notifications.js';

// Configuration
const adminLinks = [
    { name: 'All Projects', href: 'admin.html' },
    { name: 'Clients', href: 'admin_client_management.html' },
    { name: 'Inventory', href: 'admin_inventory.html' },
    { name: 'Settings', href: 'admin_settings.html' }
];

const clientLinks = [
    { name: 'Dashboard', href: 'dashboard.html' },
    { name: 'My Account', href: 'account.html' }
];

let pageContentNode = null; // Store reference to the original page content
let headerActionsQueue = []; // Queue for actions mounted before render

export function initLayout() {
    return new Promise((resolve) => {
        // 1. Capture Page Content
        if (document.getElementById('layout-initialized')) {
            resolve();
            return;
        }

        // Create a marker
        const marker = document.createElement('div');
        marker.id = 'layout-initialized';
        marker.style.display = 'none';
        document.body.appendChild(marker);

        // Create a container for the page's original content
        pageContentNode = document.createElement('main');
        pageContentNode.id = 'page-content';
        pageContentNode.className = 'flex-1 p-6';

        const children = Array.from(document.body.childNodes);
        children.forEach(child => {
            if (child === marker) return;
            document.body.appendChild(pageContentNode);
            pageContentNode.appendChild(child);
        });

        const appContainer = document.createElement('div');
        appContainer.id = 'app-container';
        appContainer.className = 'flex min-h-screen bg-gradient-to-br from-[#0f172a] to-[#334155] text-gray-100';

        document.body.prepend(appContainer);

        // 2. Auth & Role Logic
        // We resolve the promise only after the first render is complete.
        let isFirstRender = true;

        onAuthStateChanged(auth, async (user) => {
            let role = 'guest';

            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        role = userData.role === 'admin' ? 'admin' : 'client';
                    } else {
                        role = 'client';
                    }
                } catch (e) {
                    console.error("Layout: Error fetching user role", e);
                    role = 'client';
                }
            }

            renderStructure(appContainer, user, role);

            // Process queue
            if (headerActionsQueue.length > 0) {
                const container = document.getElementById('header-extra-actions');
                if (container) {
                    headerActionsQueue.forEach(item => {
                        if (typeof item === 'string') {
                            container.innerHTML = item; // Replaces previous content if string
                        } else {
                            container.appendChild(item);
                        }
                    });
                    headerActionsQueue = [];
                }
            }

            if (isFirstRender) {
                isFirstRender = false;
                resolve();
            }
        });
    });
}

function renderStructure(container, user, role) {
    container.innerHTML = '';

    // --- HTML TEMPLATES ---

    // Admin Sidebar
    const sidebar = `
        <div class="flex flex-col w-64 bg-slate-900/70 backdrop-blur-sm border-r border-slate-700/50 hidden md:flex flex-shrink-0">
            <div class="flex items-center justify-center h-16 border-b border-slate-700/50">
                <h1 class="text-2xl font-bold text-white">MCE Admin</h1>
            </div>
            <div class="flex-grow overflow-y-auto">
                <nav class="px-4 py-4 space-y-2">
                    ${adminLinks.map(link => `
                        <a href="${link.href}" class="block px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${isActive(link.href) ? 'text-white bg-slate-700/50' : 'text-gray-400 hover:text-white hover:bg-slate-800/50'}">
                            ${link.name}
                        </a>
                    `).join('')}
                </nav>
            </div>
        </div>
    `;

    let headerLeftContent = '';

    if (role === 'admin') {
        headerLeftContent = `<h2 id="header-page-title" class="text-xl font-semibold text-white"></h2>`;
    } else if (role === 'client') {
        headerLeftContent = `
            <div class="flex items-center space-x-8">
                <h1 class="text-2xl font-bold text-white">MCE Printing</h1>
                <nav class="hidden md:flex space-x-4">
                    ${clientLinks.map(link => `
                        <a href="${link.href}" class="text-sm font-semibold transition-colors ${isActive(link.href) ? 'text-white' : 'text-gray-300 hover:text-white'}">
                            ${link.name}
                        </a>
                    `).join('')}
                </nav>
            </div>
        `;
    } else { // Guest
        headerLeftContent = `<h1 class="text-2xl font-bold text-white">MCE Printing</h1>`;
    }

    let headerRightContent = '';
    if (user) {
        headerRightContent = `
            <div class="flex items-center space-x-4">
                <div id="header-extra-actions" class="flex items-center space-x-2"></div>

                <div class="relative">
                    <button id="notification-bell" class="relative text-gray-400 hover:text-white p-1">
                        <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        <span id="notification-indicator" class="hidden absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
                    </button>
                    <div id="notification-panel" class="hidden absolute right-0 mt-2 w-80 bg-slate-800 rounded-lg shadow-lg border border-slate-700/50 z-50">
                        <div class="p-3 border-b border-slate-700/50 flex justify-between items-center">
                            <h3 class="font-semibold text-white">Notifications</h3>
                            <button id="clear-notifications-btn" class="text-xs text-indigo-400 hover:text-indigo-300 hover:underline">Clear All</button>
                        </div>
                        <div id="notification-list" class="py-1 max-h-96 overflow-y-auto custom-scrollbar">
                            <p class="px-4 py-2 text-sm text-gray-400">Loading...</p>
                        </div>
                    </div>
                </div>

                <span class="text-sm text-gray-300 hidden sm:block truncate max-w-[150px]">${user.email}</span>
                <button id="logout-button" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-md text-sm transition-all">Sign Out</button>
            </div>
        `;
    } else {
        headerRightContent = `
            <div class="flex items-center space-x-4">
                <a href="index.html" class="text-gray-300 hover:text-white font-medium text-sm">Log In</a>
                <a href="register.html" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-md text-sm transition-all">Register</a>
            </div>
        `;
    }

    const header = `
        <header class="flex justify-between items-center h-16 px-6 bg-slate-800/60 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-30">
            <div>${headerLeftContent}</div>
            <div>${headerRightContent}</div>
        </header>
    `;

    // --- CONSTRUCTION ---

    if (role === 'admin') {
        container.innerHTML = sidebar;

        const contentCol = document.createElement('div');
        contentCol.className = 'flex-1 flex flex-col min-w-0';

        contentCol.innerHTML = header;
        contentCol.appendChild(pageContentNode);

        container.appendChild(contentCol);
    } else {
        const contentCol = document.createElement('div');
        contentCol.className = 'flex-1 flex flex-col min-w-0';

        contentCol.innerHTML = header;
        contentCol.appendChild(pageContentNode);

        container.appendChild(contentCol);
    }

    // --- EVENTS & INITIALIZATION ---
    if (user) {
        // [FIX] Use standard ID 'logout-button' to match existing scripts
        const logoutBtn = document.getElementById('logout-button');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                signOut(auth).then(() => window.location.href = 'index.html');
            });
        }

        initializeNotifications();
    }

    if (role === 'admin') {
        const titleEl = document.getElementById('header-page-title');
        if (titleEl) {
             let title = 'Admin';
             const path = window.location.pathname;
             if (path.includes('admin.html')) title = 'All Projects';
             else if (path.includes('client_management')) title = 'Client Management';
             else if (path.includes('inventory')) title = 'Inventory';
             else if (path.includes('settings')) title = 'Settings';
             else if (path.includes('edit_user')) title = 'Edit User';
             else if (path.includes('estimator')) title = 'Estimator';
             else if (path.includes('production')) title = 'Production';
             else if (path.includes('reports')) title = 'Reports';
             else if (path.includes('project')) title = 'Project Details';

             if (window.MCE_PAGE_TITLE) title = window.MCE_PAGE_TITLE;

             titleEl.textContent = title;
        }
    }
}

function isActive(href) {
    return window.location.pathname.endsWith(href);
}

export function setPageTitle(title) {
    const el = document.getElementById('header-page-title');
    if (el) el.textContent = title;
    window.MCE_PAGE_TITLE = title;
}

export function mountHeaderActions(elementOrHtml) {
    const container = document.getElementById('header-extra-actions');
    if (container) {
        if (typeof elementOrHtml === 'string') {
            container.innerHTML = elementOrHtml;
        } else {
            container.innerHTML = '';
            container.appendChild(elementOrHtml);
        }
    } else {
        // Queue it if the container isn't ready
        headerActionsQueue.push(elementOrHtml);
    }
}
