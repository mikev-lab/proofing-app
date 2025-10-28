// js/admin.js
import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc, Timestamp, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const projectsTableContainer = document.getElementById('projects-table-container');
const projectsList = document.getElementById('projects-list');
const statusFilter = document.getElementById('status-filter');
const sortBy = document.getElementById('sort-by');
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');
const shareModal = document.getElementById('share-modal');
const shareModalCloseButton = document.getElementById('share-modal-close-button');
const shareModalCancelButton = document.getElementById('share-modal-cancel-button');
const shareLinkForm = document.getElementById('share-link-form');
const generateLinkButton = document.getElementById('generate-link-button');
const shareModalContent = document.getElementById('share-modal-content');
const shareModalResult = document.getElementById('share-modal-result');
const generatedLinkUrlInput = document.getElementById('generated-link-url');
const copyLinkButton = document.getElementById('copy-link-button');
const copyStatusMessage = document.getElementById('copy-status-message');
let currentProjectId = null;

function formatTimestamp(fbTimestamp) {
    if (!fbTimestamp) return "Date not set";
    return fbTimestamp.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status) {
    status = status || 'unknown';
    let classes = "px-3 py-1 rounded-full text-xs font-medium";
    let text = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    switch (status) {
        case 'pending': classes += " bg-yellow-500/20 text-yellow-300"; break;
        case 'approved': classes += " bg-green-500/20 text-green-300"; break;
        case 'changes_requested': classes += " bg-red-500/20 text-red-300"; break;
        case 'awaiting_upload': classes += " bg-blue-500/20 text-blue-300"; break;
        default: classes += " bg-gray-500/20 text-gray-300"; text = "Unknown"; break;
    }
    return `<span class="${classes}">${text}</span>`;
}

function fetchNotifications() {
    // Placeholder function for fetching notifications
    console.log("Fetching notifications...");
}

async function fetchAllProjects() {
    try {
        loadingSpinner.classList.remove('hidden');
        emptyState.classList.add('hidden');
        projectsTableContainer.classList.add('hidden');
        projectsList.innerHTML = ''; // Clear previous results

        const selectedStatus = statusFilter.value;
        const [sortField, sortDirection] = sortBy.value.split('-');

        let projectsRef = collection(db, "projects");
        let q;

        const statusValueMap = {
            "Changes Requested": "changes_requested",
            "Awaiting Upload": "awaiting_upload"
        };
        const dbStatus = statusValueMap[selectedStatus] || (selectedStatus !== "All" ? selectedStatus.toLowerCase() : null);

        // Base query
        let queries = [];
        if (dbStatus) {
            queries.push(where("status", "==", dbStatus));
        }

        // Sorting - cannot sort by company name on the server directly
        if (sortField !== 'companyName') {
            queries.push(orderBy(sortField, sortDirection));
        } else {
            // Default sort when sorting by company name client-side
            queries.push(orderBy("createdAt", "desc"));
        }

        q = query(projectsRef, ...queries);

        const querySnapshot = await getDocs(q);

        let projects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Create a map of company IDs to company names for efficient lookup
        const companyIds = [...new Set(projects.map(p => p.companyId).filter(id => id))];
        const companyPromises = companyIds.map(id => getDoc(doc(db, "companies", id)));
        const companySnapshots = await Promise.all(companyPromises);
        const companyMap = companySnapshots.reduce((map, snap) => {
            if (snap.exists()) {
                map[snap.id] = snap.data().companyName;
            }
            return map;
        }, {});

        // Add companyName to each project object for sorting
        projects.forEach(p => {
            if (p.companyId && companyMap[p.companyId]) {
                p.companyName = companyMap[p.companyId];
            } else if (p.clientName) { // Backward compatibility
                p.companyName = p.clientName;
            } else {
                p.companyName = 'N/A';
            }
        });

        // Client-side sorting
        projects.sort((a, b) => {
            const aIsArchived = a.status === 'archived';
            const bIsArchived = b.status === 'archived';
            if (aIsArchived && !bIsArchived) return 1;
            if (!aIsArchived && bIsArchived) return -1;

            if (sortField === 'companyName') {
                const nameA = a.companyName.toUpperCase();
                const nameB = b.companyName.toUpperCase();
                if (nameA < nameB) return sortDirection === 'asc' ? -1 : 1;
                if (nameA > nameB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            }
            if (sortField === 'projectName') {
                const nameA = a.projectName.toUpperCase();
                const nameB = b.projectName.toUpperCase();
                if (nameA < nameB) return sortDirection === 'asc' ? -1 : 1;
                if (nameA > nameB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            }
            // Fallback to createdAt for other sorts
            const dateA = a.createdAt?.toMillis() || 0;
            const dateB = b.createdAt?.toMillis() || 0;
            return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
        });


        loadingSpinner.classList.add('hidden');

        if (projects.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            renderProjects(projects, companyMap);
            projectsTableContainer.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error fetching projects:", error);
        loadingSpinner.classList.add('hidden');
        projectsTableContainer.innerHTML = `<p class="text-red-400 text-center py-8">Error loading projects.</p>`;
        projectsTableContainer.classList.remove('hidden');
    }
}

function renderProjects(projects, companyMap) {
    projectsList.innerHTML = '';
    projects.forEach(project => {
        const companyName = project.companyName || 'N/A';
        const formattedDate = formatTimestamp(project.createdAt);
        const statusBadge = getStatusBadge(project.status);
        const isArchived = project.status === 'archived';

        // --- NEW: Check for processing statuses in versions ---
        let statusIndicator = '';
        if (project.versions && project.versions.length > 0) {
            const isProcessing = project.versions.some(v => v.processingStatus === 'processing');
            const hasError = project.versions.some(v => v.processingStatus === 'error');

            if (isProcessing) {
                statusIndicator = `
                    <svg class="animate-spin h-4 w-4 text-blue-400 ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>`;
            } else if (hasError) {
                statusIndicator = `
                    <svg class="h-5 w-5 text-red-400 ml-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>`;
            }
        }
        // --- END: Status check ---

        const row = document.createElement('tr');
        row.className = `hover:bg-slate-800 transition-colors duration-150 ${isArchived ? 'opacity-50' : ''}`;
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                <div class="flex items-center">
                    <span>${project.projectName || 'Untitled'}</span>
                    ${statusIndicator}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${companyName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${statusBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${formattedDate}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                <a href="admin_project.html?id=${project.id}" class="text-indigo-400 hover:text-indigo-300">View</a>
                <button class="share-btn text-purple-400 hover:text-purple-300" data-id="${project.id}">Share</button>
                ${isArchived ?
                    `<button class="recover-btn text-green-400 hover:text-green-300" data-id="${project.id}">Recover</button>` :
                    `<button class="archive-btn text-yellow-400 hover:text-yellow-300" data-id="${project.id}">Archive</button>`
                }
                <button class="delete-btn text-red-400 hover:text-red-300" data-id="${project.id}">Delete</button>
            </td>
        `;
        projectsList.appendChild(row);
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailSpan.textContent = user.email;
        userEmailSpan.classList.remove('hidden');
        fetchAllProjects();
        fetchNotifications(); // Call the placeholder
    } else {
        window.location.href = 'index.html';
    }
});
// Temporarily call fetchAllProjects directly for verification
// fetchAllProjects();

logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => console.error('Sign out error', error));
    window.location.href = 'index.html';
});

projectsList.addEventListener('click', async (e) => {
    const target = e.target;
    const projectId = target.dataset.id;

    if (target.classList.contains('archive-btn')) {
        if (confirm('Are you sure you want to archive this project?')) {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, { status: 'archived', deleteAt: null });
            fetchAllProjects();
        }
    }

    if (target.classList.contains('delete-btn')) {
        if (confirm('Are you sure you want to delete this project? It will be permanently deleted in 30 days.')) {
            const projectRef = doc(db, "projects", projectId);
            const deleteAt = new Date();
            deleteAt.setDate(deleteAt.getDate() + 30);
            await updateDoc(projectRef, { status: 'archived', deleteAt: Timestamp.fromDate(deleteAt) });
            fetchAllProjects();
        }
    }

    if (target.classList.contains('recover-btn')) {
        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, { status: 'active', deleteAt: null });
        fetchAllProjects();
    }

    if (target.classList.contains('share-btn')) {
        currentProjectId = projectId;
        openShareModal();
    }
});

function openShareModal() {
    shareModal.classList.remove('hidden');
    shareModalContent.classList.remove('hidden');
    shareModalResult.classList.add('hidden');
    shareLinkForm.reset();
    generateLinkButton.disabled = false;
    copyStatusMessage.textContent = '';
}

function closeShareModal() {
    shareModal.classList.add('hidden');
}

shareModalCloseButton.addEventListener('click', closeShareModal);
shareModalCancelButton.addEventListener('click', closeShareModal);

shareLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    generateLinkButton.disabled = true;
    generateLinkButton.textContent = 'Generating...';

    const permissions = {
        canApprove: document.getElementById('permission-approve').checked,
        canAnnotate: document.getElementById('permission-annotate').checked,
        canSeeComments: document.getElementById('permission-see-comments').checked
    };

    try {
        const generateGuestLink = httpsCallable(functions, 'generateGuestLink');
        const result = await generateGuestLink({ projectId: currentProjectId, permissions });

        if (result.data.success) {
            const fullUrl = new URL(result.data.url);
            generatedLinkUrlInput.value = `${window.location.origin}/proof.html${fullUrl.search}`;
            shareModalContent.classList.add('hidden');
            shareModalResult.classList.remove('hidden');
        } else {
            throw new Error('Cloud function returned an error.');
        }
    } catch (error) {
        console.error("Error generating guest link:", error);
        alert(`Error: ${error.message || 'Could not generate link.'}`);
        generateLinkButton.textContent = 'Generate Link';
        generateLinkButton.disabled = false;
    }
});

copyLinkButton.addEventListener('click', () => {
    generatedLinkUrlInput.select();
    document.execCommand('copy');
    copyStatusMessage.textContent = 'Copied!';
    setTimeout(() => { copyStatusMessage.textContent = ''; }, 2000);
});

// Event Listeners for controls
statusFilter.addEventListener('change', fetchAllProjects);
sortBy.addEventListener('change', fetchAllProjects);
notificationBell.addEventListener('click', () => {
    notificationPanel.classList.toggle('hidden');
});

// Hide panel if clicking outside
document.addEventListener('click', function(event) {
    if (!notificationBell.contains(event.target) && !notificationPanel.contains(event.target)) {
        notificationPanel.classList.add('hidden');
    }
});
