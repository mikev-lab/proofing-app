// js/admin.js
import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc, Timestamp, query, where, orderBy, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
const deleteModal = document.getElementById('delete-modal');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deleteInput = document.getElementById('delete-confirmation-input');
const deleteMatchNameSpan = document.getElementById('delete-match-name');
let currentProjectId = null;
let projectToDeleteId = null;
let projectToDeleteName = null;
let cachedCompanies = [];

// ... (getStatusBadge, formatTimestamp, fetchNotifications, fetchAllProjects, renderProjects functions remain unchanged) ...
function formatTimestamp(fbTimestamp) {
    if (!fbTimestamp) return "Date not set";
    return fbTimestamp.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// --- UPDATE START: New Status Logic with Throbber ---
// --- UPDATE START: New Status Logic with Throbber ---
function getStatusBadge(status) {
    status = status || 'unknown';
    const lowerStatus = status.toLowerCase();
    
    // Base classes
    let classes = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1";
    let text = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let icon = "";

    switch (lowerStatus) {
        case 'pending':
            classes += " bg-yellow-500/20 text-yellow-300";
            text = "Pending";
            break;
        case 'approved':
            classes += " bg-green-500/20 text-green-300";
            text = "Approved";
            // Throbber Icon for processing
            icon = `<svg class="animate-spin h-3 w-3 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>`;
            break;
        case 'imposition complete':
            classes += " bg-green-500/20 text-green-300";
            text = "Approved & Imposed";
            // Checkmark Icon
            icon = `<svg class="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>`;
            break;
        case 'imposition failed':
             classes += " bg-red-500/20 text-red-300";
             text = "Imposition Failed";
             break;
        case 'changes_requested': 
            classes += " bg-red-500/20 text-red-300"; 
            break;
        case 'awaiting_upload': 
        case 'awaiting client upload': 
            classes += " bg-blue-500/20 text-blue-300";
            text = "Awaiting Upload";
            break;
        case 'pending review':
            classes += " bg-yellow-500/20 text-yellow-300";
            text = "Pending Review";
            break;
            
        // [FIX] New Statuses
        case 'waiting admin review':
            classes += " bg-purple-500/20 text-purple-300";
            text = "Needs Review"; 
            break;
        case 'pending approval':
            classes += " bg-yellow-500/20 text-yellow-300";
            text = "Client Approval";
            break;
            
        default: 
            classes += " bg-gray-500/20 text-gray-300"; 
            // Fallback: Use the capitalized text we generated at the start
            break;
    }
    return `<span class="${classes}">${text}${icon}</span>`;
}
// --- UPDATE END ---

function fetchNotifications() {
    console.log("Fetching notifications...");
}

async function fetchAllProjects() {
    try {
        loadingSpinner.classList.remove('hidden');
        emptyState.classList.add('hidden');
        projectsTableContainer.classList.add('hidden');
        projectsList.innerHTML = ''; 

        const selectedStatus = statusFilter.value;
        const [sortField, sortDirection] = sortBy.value.split('-');

        let projectsRef = collection(db, "projects");
        let q;

        const statusValueMap = {
            "Changes Requested": "changes_requested",
            "Awaiting Upload": "Awaiting Client Upload"
        };
        const dbStatus = statusValueMap[selectedStatus] || (selectedStatus !== "All" ? selectedStatus.toLowerCase() : null);

        let queries = [];
        if (dbStatus) {
            queries.push(where("status", "==", dbStatus));
        }

        if (sortField !== 'companyName') {
            queries.push(orderBy(sortField, sortDirection));
        } else {
            queries.push(orderBy("createdAt", "desc"));
        }

        q = query(projectsRef, ...queries);

        const companiesSnap = await getDocs(collection(db, 'companies'));
        cachedCompanies = companiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const companyMap = cachedCompanies.reduce((acc, c) => { acc[c.id] = c.companyName; return acc; }, {});

        const querySnapshot = await getDocs(q);

        let projects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        projects.forEach(p => {
            if (p.companyId && companyMap[p.companyId]) {
                p.companyName = companyMap[p.companyId];
            } else if (p.clientName) { 
                p.companyName = p.clientName;
            } else {
                p.companyName = 'N/A';
            }
        });

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
                <button class="delete-btn text-red-400 hover:text-red-300" 
                    data-id="${project.id}" 
                    data-status="${project.status}" 
                    data-name="${project.projectName}">Delete</button>
            </td>
        `;
        projectsList.appendChild(row);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // [Security Check] Ensure user is an Admin
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                console.warn("Access denied: User is not an admin.");
                window.location.href = 'index.html';
                return;
            }
        } catch (error) {
            console.error("Error verifying admin status:", error);
            window.location.href = 'index.html';
            return;
        }

        userEmailSpan.textContent = user.email;
        userEmailSpan.classList.remove('hidden');
        fetchAllProjects();
        fetchNotifications(); 
    } else {
        window.location.href = 'index.html';
    }
});

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
        const currentStatus = target.dataset.status;
        const projectName = target.dataset.name;

        if (currentStatus === 'archived') {
            // [UPDATE] Already archived? Show Permanent Delete Modal
            projectToDeleteId = projectId;
            projectToDeleteName = projectName;
            
            deleteMatchNameSpan.textContent = projectName;
            deleteInput.value = '';
            deleteModalConfirm.disabled = true;
            deleteModal.classList.remove('hidden');
        } else {
            // [UPDATE] Active? Use Double-Tap to Archive logic
            if (target.dataset.confirming === 'true') {
                const projectRef = doc(db, "projects", projectId);
                const deleteAt = new Date();
                deleteAt.setDate(deleteAt.getDate() + 30);
                await updateDoc(projectRef, { status: 'archived', deleteAt: Timestamp.fromDate(deleteAt) });
                fetchAllProjects();
            } else {
                const originalText = target.textContent;
                target.dataset.confirming = 'true';
                target.textContent = 'Are you sure?';
                target.classList.add('font-bold', 'underline');
                
                setTimeout(() => {
                    target.dataset.confirming = 'false';
                    target.textContent = originalText;
                    target.classList.remove('font-bold', 'underline');
                }, 3000);
            }
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

// [UPDATE] Delete Modal Logic
if (deleteInput) {
    deleteInput.addEventListener('input', () => {
        if (deleteInput.value === projectToDeleteName) {
            deleteModalConfirm.disabled = false;
            deleteModalConfirm.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            deleteModalConfirm.disabled = true;
            deleteModalConfirm.classList.add('opacity-50', 'cursor-not-allowed');
        }
    });
}

if (deleteModalCancel) {
    deleteModalCancel.addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        projectToDeleteId = null;
    });
}

if (deleteModalConfirm) {
    deleteModalConfirm.addEventListener('click', async () => {
        if (!projectToDeleteId) return;
        
        deleteModalConfirm.textContent = "Deleting...";
        try {
            await deleteDoc(doc(db, "projects", projectToDeleteId));
            deleteModal.classList.add('hidden');
            fetchAllProjects();
        } catch (err) {
            console.error("Failed to delete project:", err);
            alert("Error deleting project. check console.");
        } finally {
            deleteModalConfirm.textContent = "Delete Forever";
        }
    });
}

// --- Share Modal Logic ---
const permissionOwnerCheckbox = document.getElementById('permission-owner');
const permissionApproveCheckbox = document.getElementById('permission-approve');
const permissionAnnotateCheckbox = document.getElementById('permission-annotate');
const permissionSeeCommentsCheckbox = document.getElementById('permission-see-comments');

// Listener for "Owner" checkbox to enforce defaults
if (permissionOwnerCheckbox) {
    permissionOwnerCheckbox.addEventListener('change', () => {
        if (permissionOwnerCheckbox.checked) {
            // If Owner is checked, force check the others and disable them to prevent unchecking
            permissionApproveCheckbox.checked = true;
            permissionApproveCheckbox.disabled = true;
            permissionApproveCheckbox.classList.add('opacity-50', 'cursor-not-allowed');

            permissionAnnotateCheckbox.checked = true;
            permissionAnnotateCheckbox.disabled = true;
            permissionAnnotateCheckbox.classList.add('opacity-50', 'cursor-not-allowed');

            permissionSeeCommentsCheckbox.checked = true;
            permissionSeeCommentsCheckbox.disabled = true;
            permissionSeeCommentsCheckbox.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            // If Owner is unchecked, re-enable the others
            permissionApproveCheckbox.disabled = false;
            permissionApproveCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');

            permissionAnnotateCheckbox.disabled = false;
            permissionAnnotateCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');

            permissionSeeCommentsCheckbox.disabled = false;
            permissionSeeCommentsCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}


function openShareModal() {
    shareModal.classList.remove('hidden');
    shareModalContent.classList.remove('hidden');
    shareModalResult.classList.add('hidden');
    shareLinkForm.reset();
    
    // Reset "Owner" specific visual states when opening
    if (permissionOwnerCheckbox) {
         permissionApproveCheckbox.disabled = false;
         permissionApproveCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         permissionAnnotateCheckbox.disabled = false;
         permissionAnnotateCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         permissionSeeCommentsCheckbox.disabled = false;
         permissionSeeCommentsCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         // Ensure defaults are set if form.reset() didn't do it
         permissionSeeCommentsCheckbox.checked = true; 
    }

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

    // Capture values (even if disabled)
    const permissions = {
        canApprove: permissionApproveCheckbox.checked,
        canAnnotate: permissionAnnotateCheckbox.checked,
        canSeeComments: permissionSeeCommentsCheckbox.checked,
        isOwner: permissionOwnerCheckbox ? permissionOwnerCheckbox.checked : false
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


// --- REQUEST FILES MODAL LOGIC ---
const requestFilesButton = document.getElementById('request-files-button');
const requestFilesModal = document.getElementById('request-files-modal');
const requestModalCloseButton = document.getElementById('request-modal-close-button');
const requestModalCancelButton = document.getElementById('request-modal-cancel-button');
const requestFilesForm = document.getElementById('request-files-form');
const createRequestButton = document.getElementById('create-request-button');
const requestModalContent = document.getElementById('request-modal-content');
const requestModalResult = document.getElementById('request-modal-result');
const reqGeneratedLinkInput = document.getElementById('req-generated-link');
const reqCopyLinkButton = document.getElementById('req-copy-link-button');
const reqCopyMessage = document.getElementById('req-copy-message');
const reqDoneButton = document.getElementById('req-done-button');
const reqCompanySelect = document.getElementById('req-company-select');

function openRequestModal() {
    requestFilesModal.classList.remove('hidden');
    requestModalContent.classList.remove('hidden');
    requestModalResult.classList.add('hidden');
    requestFilesForm.reset();
    createRequestButton.disabled = false;
    createRequestButton.textContent = 'Create & Get Link';
    reqCopyMessage.textContent = '';

    // [UPDATE] Populate Company Dropdown
    reqCompanySelect.innerHTML = '<option value="">-- No Company --</option>';
    cachedCompanies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.companyName;
        reqCompanySelect.appendChild(option);
    });
}
function closeRequestModal() {
    requestFilesModal.classList.add('hidden');
}

if (requestFilesButton) {
    requestFilesButton.addEventListener('click', openRequestModal);
    requestModalCloseButton.addEventListener('click', closeRequestModal);
    requestModalCancelButton.addEventListener('click', closeRequestModal);
    reqDoneButton.addEventListener('click', () => {
        closeRequestModal();
        fetchAllProjects(); // Refresh list
    });

    requestFilesForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        createRequestButton.disabled = true;
        createRequestButton.textContent = 'Creating...';

        const projectName = document.getElementById('req-project-name').value;
        const companyId = reqCompanySelect.value;
        const clientEmail = document.getElementById('req-client-email').value;

        try {
            const createFileRequest = httpsCallable(functions, 'createFileRequest');
            const result = await createFileRequest({
                projectName,
                companyId,
                clientEmail
            });

            if (result.data.success) {
                const resultUrl = new URL(result.data.url);
                const finalUrl = `${window.location.origin}${resultUrl.pathname}${resultUrl.search}`;

                reqGeneratedLinkInput.value = finalUrl;
                requestModalContent.classList.add('hidden');
                requestModalResult.classList.remove('hidden');
            } else {
                 throw new Error('Failed to create request.');
            }

        } catch (error) {
            console.error("Error creating file request:", error);
            alert(`Error: ${error.message || 'Could not create request.'}`);
            createRequestButton.disabled = false;
            createRequestButton.textContent = 'Create & Get Link';
        }
    });

    reqCopyLinkButton.addEventListener('click', () => {
        reqGeneratedLinkInput.select();
        document.execCommand('copy');
        reqCopyMessage.textContent = 'Link Copied!';
        setTimeout(() => { reqCopyMessage.textContent = ''; }, 2000);
    });
}

statusFilter.addEventListener('change', fetchAllProjects);
sortBy.addEventListener('change', fetchAllProjects);