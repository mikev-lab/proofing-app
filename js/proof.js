import { auth, db, functions, generateGuestLink } from './firebase.js';
import { onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeSharedViewer } from './viewer.js';
import { STANDARD_PAPER_SIZES } from './guides.js';
// [UPDATE] Added 'query' and 'orderBy' to the imports
import { doc, onSnapshot, updateDoc, collection, getDocs, Timestamp, addDoc, getDoc, arrayUnion, serverTimestamp, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as pdfjsLib from "https://mozilla.github.io/pdf.js/build/pdf.mjs";

// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://mozilla.github.io/pdf.js/build/pdf.worker.mjs";

// --- PARSE URL PARAMS ONCE AT SCRIPT LOAD ---
const urlParams = new URLSearchParams(window.location.search);
const initialGuestToken = urlParams.get('guestToken');
const initialProjectId = urlParams.get('id') || urlParams.get('projectId');
console.log(`[Init] Parsed URL Params - Guest Token: ${initialGuestToken}, Project ID: ${initialProjectId}`);
// --- END PARSE URL PARAMS ---


const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');
const loadingSpinner = document.getElementById('loading-spinner');
const proofContent = document.getElementById('proof-content');
const projectName = document.getElementById('project-name');
// const approvalForm = document.getElementById('approval-form'); // Defined later, inside onSnapshot
const decisionButtons = document.getElementById('decision-buttons');
const confirmationSection = document.getElementById('confirmation-section');
const approvalModal = document.getElementById('approval-modal');
const approvalFormModal = document.getElementById('approval-modal-form');
const modalCancelBtn = document.getElementById('modal-approval-cancel');
const modalConfirmBtn = document.getElementById('modal-approval-confirm');
const signatureInput = document.getElementById('signature-input');
const approvalSpecsText = document.getElementById('approval-specs-text');
// Select all approval checkboxes
const approvalCheckboxes = document.querySelectorAll('#approval-modal-form input[type="checkbox"]');
const approvedStatuses = ['Approved', 'approved', 'In Production', 'Imposition Complete'];

const headerShareButton = document.getElementById('header-share-button');
const navEditBuilderButton = document.getElementById('nav-edit-builder-button');
const shareModal = document.getElementById('share-modal');
const shareModalCloseBtn = document.getElementById('share-modal-close-button');
const shareModalCancelBtn = document.getElementById('share-modal-cancel-button');
const shareLinkForm = document.getElementById('share-link-form');
const generateLinkBtn = document.getElementById('generate-link-button');
const shareModalContent = document.getElementById('share-modal-content');
const shareModalResult = document.getElementById('share-modal-result');
const generatedLinkUrlInput = document.getElementById('generated-link-url');
const copyLinkBtn = document.getElementById('copy-link-button');
const copyStatusMsg = document.getElementById('copy-status-message');

let currentProjectId = initialProjectId; // Use the initially parsed ID
let actionToConfirm = null;
let unsubscribeProjectListener = null;
// [NEW] Listener variable for history
let unsubscribeHistoryListener = null;
let isGuest = false;
let guestPermissions = {};

// --- Helper: Find Standard Size Name ---
function findMatchingStandardSize(dims) {
    if (!dims || !dims.width || !dims.height) return null;

    // Convert to points for comparison (1 in = 72 pts, 1 mm = 2.83465 pts)
    const wPoints = dims.units === 'mm' ? dims.width * 2.83465 : dims.width * 72;
    const hPoints = dims.units === 'mm' ? dims.height * 2.83465 : dims.height * 72;
    const tolerance = 3; // ~1mm tolerance

    for (const [key, std] of Object.entries(STANDARD_PAPER_SIZES)) {
        const stdW = std.width_mm * 2.83465;
        const stdH = std.height_mm * 2.83465;

        // Exact Match (Portrait)
        if (Math.abs(wPoints - stdW) < tolerance && Math.abs(hPoints - stdH) < tolerance) return key;
        // Rotated Match (Landscape)
        if (Math.abs(wPoints - stdH) < tolerance && Math.abs(hPoints - stdW) < tolerance) return key;
    }
    return null;
}
// Define these functions in the main script scope
function showApproveConfirmation(projectData) {
    if (!approvalModal) return;

    const specs = projectData.specs || {};
    
    // 1. Populate Trim Size
    const trimTextEl = document.getElementById('approval-trim-text');
    if (trimTextEl) {
        let dimString = "N/A";
        if (specs.dimensions) {
            if (typeof specs.dimensions === 'string') {
                // If stored as string key, look up name
                const std = STANDARD_PAPER_SIZES[specs.dimensions];
                // [FIX] Include the group name (e.g. "A4 (ISO A)")
                dimString = std ? `${std.name} (${std.group})` : specs.dimensions;
            } else if (specs.dimensions.width && specs.dimensions.height) {
                // If stored as object, check for match or format nicely
                const matchKey = findMatchingStandardSize(specs.dimensions);
                
                if (matchKey) {
                    const std = STANDARD_PAPER_SIZES[matchKey];
                    // [FIX] Include the group name
                    dimString = `${std.name} (${std.group})`;
                } else {
                    // Custom: Clean up the decimals
                    const w = parseFloat(specs.dimensions.width);
                    const h = parseFloat(specs.dimensions.height);
                    const unit = specs.dimensions.units || 'in';
                    // Format to max 3 decimal places
                    const wStr = Number(w.toFixed(3)).toString();
                    const hStr = Number(h.toFixed(3)).toString();
                    dimString = `${wStr} x ${hStr} ${unit}`;
                }
            }
        }
        trimTextEl.innerHTML = `Confirm Trim Size: <span class="font-bold text-white">${dimString}</span>`;
    }

    // 2. Populate Interior Paper
    const interiorPaperEl = document.getElementById('approval-interior-paper-text');
    if (interiorPaperEl) {
        const paper = specs.paperType || "Standard";
        const direction = specs.readingDirection === 'rtl' ? 'Right to Left' : 'Left to Right';
        interiorPaperEl.innerHTML = `
            Confirm Interior Paper: <span class="font-bold text-white">${paper}</span>
            <br/><span class="text-xs text-gray-300 block mt-1">Reading Direction: <span class="font-bold text-white">${direction}</span></span>
        `;
    }

    // 3. Populate Cover Paper (Hide if not applicable)
    const coverContainer = document.getElementById('container-cover-paper');
    const coverPaperEl = document.getElementById('approval-cover-paper-text');
    const coverCheckbox = document.getElementById('check-cover-paper');
    
    if (coverContainer && coverPaperEl && coverCheckbox) {
        if (specs.coverPaperType) {
            coverContainer.classList.remove('hidden');
            coverPaperEl.innerHTML = `Confirm Cover Paper: <span class="font-bold text-white">${specs.coverPaperType}</span>`;
            // Ensure it's required
            coverCheckbox.required = true;
            // Reset state
            coverCheckbox.checked = false;
            coverCheckbox.disabled = false;
        } else {
            // Hide and disable so it doesn't block validation
            coverContainer.classList.add('hidden');
            coverCheckbox.checked = true; // Auto-check hidden fields to pass "every()" validation
            coverCheckbox.disabled = true; 
        }
    }

    // 4. Reading Direction Acknowledgment
    const readingDirContainer = document.getElementById('container-reading-direction');
    const readingDirCheckbox = document.getElementById('check-reading-direction');
    const readingDirText = document.getElementById('approval-reading-direction-text');

    if (readingDirContainer && readingDirCheckbox) {
        if (specs.binding === 'loose' || !specs.binding) {
            readingDirContainer.classList.add('hidden');
            readingDirCheckbox.disabled = true;
            readingDirCheckbox.checked = true;
        } else {
            readingDirContainer.classList.remove('hidden');
            readingDirCheckbox.disabled = false;
            readingDirCheckbox.checked = false;
            const dirText = specs.readingDirection === 'rtl' ? 'Right to Left' : 'Left to Right';
            if (readingDirText) readingDirText.innerHTML = `I acknowledge the book reads <strong>${dirText}</strong>.`;
        }
    }

    // 5. Reset the form
    approvalFormModal.reset();
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.classList.add('opacity-50', 'cursor-not-allowed');

    // 5. Show the modal
    approvalModal.classList.remove('hidden');
}

function showRequestChangesConfirmation() {
    showConfirmation('request-changes');
}

function checkApprovalValidity() {
    const allChecked = Array.from(approvalCheckboxes).every(cb => cb.checked);
    const isSigned = signatureInput.value.trim().length > 0;
    
    if (allChecked && isSigned) {
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// Attach listeners to all checkboxes and the signature input
if (approvalCheckboxes) {
    approvalCheckboxes.forEach(cb => cb.addEventListener('change', checkApprovalValidity));
}
if (signatureInput) {
    signatureInput.addEventListener('input', checkApprovalValidity);
}

// Handle Cancel Button
if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
        approvalModal.classList.add('hidden');
    });
}

// Handle Form Submission (The actual approval)
if (approvalFormModal) {
    approvalFormModal.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Disable button to prevent double-clicks
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = "Processing...";

        // Record the approval event in history with the signature
        try {
            const recordHistory = httpsCallable(functions, 'recordHistory');
            await recordHistory({
                projectId: currentProjectId,
                action: 'approved_proof',
                details: {
                    signature: signatureInput.value.trim()
                }
            });
        } catch (error) {
            console.error("Error recording approval history:", error);
            // Optionally, show an error to the user and re-enable the form
        }

        // Call your existing update status function
        await updateProjectStatus('Approved'); // Use 'Approved' to match admin side

        // Close modal
        approvalModal.classList.add('hidden');
    });
}


// --- Guest Authentication Flow ---
async function handleGuestAccess(projectId, guestToken) {
    console.log(`[Guest Flow] Starting for projectId: ${projectId}, token: ${guestToken}`);
    try {
        // 1. Fetch Guest Link Details (Keep this for UI feedback)
        console.log('[Guest Flow] Attempting to read guest link document...');
        const linkRef = doc(db, "projects", projectId, "guestLinks", guestToken);
        const linkSnap = await getDoc(linkRef);

        if (!linkSnap.exists()) {
            throw new Error("This share link is invalid.");
        }

        const linkData = linkSnap.data();
        const now = Timestamp.now();
        if (linkData.expiresAt.seconds < now.seconds) {
            throw new Error("This share link has expired.");
        }

        // Update view history (This works because of your firestore.rules line 45)
        updateDoc(linkRef, {
            viewHistory: arrayUnion({
                timestamp: Timestamp.now(),
                userAgent: navigator.userAgent || 'Unknown'
            })
        }).catch(err => console.warn("[Guest Flow] Failed to record view:", err));

        // Set local flags
        isGuest = true; 
        guestPermissions = linkData.permissions;

        // 2. Authenticate via Cloud Function (The Fix)
        // Instead of writing to a restricted collection, we ask the server for a token
        console.log('[Guest Flow] Calling authenticateGuest Cloud Function...');
        const authenticateGuest = httpsCallable(functions, 'authenticateGuest');
        const response = await authenticateGuest({ projectId, guestToken });
        
        if (!response.data || !response.data.token) {
            throw new Error("Failed to obtain access token.");
        }

        // 3. Sign in with the Custom Token
        // This gives the user the 'guestProjectId' and 'guestPermissions' claims required by firestore.rules
        console.log('[Guest Flow] Signing in with custom token...');
        const userCredential = await signInWithCustomToken(auth, response.data.token);
        const user = userCredential.user;
        console.log('[Guest Flow] Sign-in successful. User UID:', user.uid);

        // 4. Apply Guest UI Mode
        console.log('[Guest Flow] Enabling Guest UI...');
        const notificationBell = document.getElementById('notification-bell');
        if (notificationBell) notificationBell.classList.add('hidden');

        const dashboardLinks = document.querySelectorAll('a[href="dashboard.html"]');
        dashboardLinks.forEach(link => link.classList.add('hidden'));
        
        const accountButton = document.querySelector('a[href="account.html"]');
        if(accountButton) accountButton.classList.add('hidden');

        // 5. Load Project
        loadProjectForUser(user);

    } catch (error) {
        console.error("[Guest Flow] Detailed guest access error:", error);
        loadingSpinner.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    }
}

// --- UI Helper Functions ---
function showConfirmation(action) {
    const confirmationMessage = document.getElementById('confirmation-message');
    const confirmActionButton = document.getElementById('confirm-action-button');
    const localDecisionButtons = document.getElementById('decision-buttons');
    const localConfirmationSection = document.getElementById('confirmation-section');

    if (!confirmationMessage || !confirmActionButton || !localDecisionButtons || !localConfirmationSection) {
         console.error("Confirmation UI elements not found.");
         return;
    }

    actionToConfirm = action;
    confirmationMessage.textContent = action === 'approve'
        ? 'Are you sure you want to approve this proof?'
        : 'Are you sure you want to request changes for this proof?';
    confirmActionButton.textContent = action === 'approve' ? 'Confirm Approval' : 'Confirm Request';
    confirmActionButton.className = `w-full text-center rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-150 ease-in-out ${action === 'approve' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`;
    confirmActionButton.disabled = false;
    localDecisionButtons.classList.add('hidden');
    localConfirmationSection.classList.remove('hidden');
}

function hideConfirmation() {
     const localDecisionButtons = document.getElementById('decision-buttons');
     const localConfirmationSection = document.getElementById('confirmation-section');
     if (!localDecisionButtons || !localConfirmationSection) {
         console.error("Confirmation UI elements not found.");
         return;
     }
    actionToConfirm = null;
    localDecisionButtons.classList.remove('hidden');
    localConfirmationSection.classList.add('hidden');
}

async function updateProjectStatus(status) {
    console.log(`[Update Status] Attempting to update project ${currentProjectId} to ${status}`);
    const projectRef = doc(db, "projects", currentProjectId);
     const confirmActionButton = document.getElementById('confirm-action-button');

    try {
         await updateDoc(projectRef, { status: status });
         console.log(`[Update Status] Successfully updated project ${currentProjectId} to ${status}`);
         if (!isGuest) {
           window.location.href = 'dashboard.html';
         } else {
             const actionPanel = document.querySelector('#approval-form')?.parentElement;
             if(actionPanel) {
               actionPanel.innerHTML = `<p class="text-center text-lg font-semibold ${status === 'approved' ? 'text-green-400' : 'text-red-400'}">Status updated to ${status}.</p>`;
             }
             hideConfirmation();
         }
    } catch (error) {
        console.error("[Update Status] Error updating status:", error);
        alert(`Failed to update status: ${error.message}`);
         if (confirmActionButton) {
            confirmActionButton.disabled = false;
            confirmActionButton.textContent = actionToConfirm === 'approve' ? 'Confirm Approval' : 'Confirm Request';
         }
        hideConfirmation();
    }
}
// --- End of UI Helper Functions ---


// --- Project Data Loader ---
// Keep track of previous state to prevent unnecessary re-renders
let lastVersionCount = 0;
let lastStatus = null;
let lastProcessingStatus = null;

function loadProjectForUser(user) {
    console.log(`[Load Project] Starting for user: ${user?.uid || 'anonymous/unknown'}, projectId: ${currentProjectId}`);
    const projectRef = doc(db, "projects", currentProjectId);

    if (unsubscribeHistoryListener) { unsubscribeHistoryListener(); unsubscribeHistoryListener = null; }
    const historyQuery = query(collection(db, "projects", currentProjectId, "history"), orderBy("timestamp", "desc"));
    unsubscribeHistoryListener = onSnapshot(historyQuery, (snapshot) => {
        const historyList = document.getElementById('project-history-list');
        if (historyList) {
            historyList.innerHTML = '';
            if (snapshot.empty) { historyList.innerHTML = '<p class="text-gray-400">No history events found.</p>'; return; }
            snapshot.forEach(doc => {
                const event = doc.data();
                const eventTime = event.timestamp ? new Date(event.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                const signature = event.details && event.details.signature ? `<span class="italic text-gray-400"> - E-Signature: ${event.details.signature}</span>` : '';
                let actionText = event.action ? event.action.replace(/_/g, ' ') : 'Unknown Action';
                actionText = actionText.charAt(0).toUpperCase() + actionText.slice(1);
                const item = document.createElement('div');
                item.className = 'p-3 bg-slate-700/50 rounded-md text-sm border border-slate-600/30';
                item.innerHTML = `<div class="flex justify-between items-start"><p class="font-semibold text-white">${actionText}</p><span class="text-[10px] text-gray-500">${eventTime}</span></div><p class="text-gray-300 text-xs mt-1">by <span class="font-medium text-indigo-300">${event.userDisplay || 'System'}</span>${signature}</p>`;
                historyList.appendChild(item);
            });
        }
    }, (error) => { console.error("[Load Project] Error fetching history:", error); });

    if (unsubscribeProjectListener) { unsubscribeProjectListener(); unsubscribeProjectListener = null; }

    unsubscribeProjectListener = onSnapshot(projectRef, (docSnap) => {
        if (docSnap.exists()) {
            const projectData = docSnap.data();
            
            const currentVersions = projectData.versions || [];
            const latestVersion = currentVersions.length > 0 
                ? currentVersions.reduce((prev, current) => (prev.versionNumber > current.versionNumber) ? prev : current) 
                : null;

            const currentVersionCount = currentVersions.length;
            const currentStatus = projectData.status;
            const currentProcessingStatus = latestVersion ? latestVersion.processingStatus : 'complete';
            
            // Detect Changes
            const shouldReInit = (currentVersionCount !== lastVersionCount) || (currentStatus !== lastStatus);
            
            lastVersionCount = currentVersionCount;
            lastStatus = currentStatus;
            lastProcessingStatus = currentProcessingStatus;

            if(projectName) projectName.textContent = projectData.projectName;

            // --- Actions Panel Logic ---
            const actionPanel = document.querySelector('#approval-form')?.parentElement;
            const commentTool = document.getElementById('tool-comment');
            const approvalBanner = document.getElementById('approval-banner');
            if (actionPanel && commentTool && approvalBanner) {
                 actionPanel.innerHTML = `<h3 class="text-xl font-semibold text-white mb-4">Actions</h3><form id="approval-form"><div id="decision-buttons"><button type="button" id="approve-button" class="w-full text-center rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold leading-6 text-white shadow-md hover:bg-green-500 transition-all duration-150 ease-in-out">Approve</button><button type="button" id="request-changes-button" class="mt-3 w-full text-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold leading-6 text-white shadow-md hover:bg-red-500 transition-all duration-150 ease-in-out">Request Changes</button></div><div id="confirmation-section" class="hidden mt-4"><p id="confirmation-message" class="text-center text-gray-300 mb-4"></p><button type="submit" id="confirm-action-button" class="w-full text-center rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-150 ease-in-out">Confirm</button><button type="button" id="cancel-action-button" class="mt-3 w-full text-center rounded-lg bg-gray-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-gray-500 transition-all duration-150 ease-in-out">Cancel</button></div></form>`;
                 const newApprovalForm = document.getElementById('approval-form');
                 if(newApprovalForm) { newApprovalForm.addEventListener('submit', (e) => { e.preventDefault(); const confirmBtn = document.getElementById('confirm-action-button'); if (actionToConfirm && confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Processing...'; updateProjectStatus(actionToConfirm === 'approve' ? 'approved' : 'changes_requested'); } else { hideConfirmation(); } }); }
                 
                 let isEditor = !isGuest || (isGuest && guestPermissions.isOwner);
                 if (isGuest) {
                    actionPanel.style.display = guestPermissions.canApprove ? 'block' : 'none';
                    commentTool.style.display = guestPermissions.canAnnotate ? 'block' : 'none';
                    if (guestPermissions.isOwner && headerShareButton) headerShareButton.classList.remove('hidden');
                 } else { actionPanel.style.display = 'block'; commentTool.style.display = 'block'; }

                 const currentBuilderBtn = document.getElementById('nav-edit-builder-button');
                 if (isEditor && currentBuilderBtn) {
                    currentBuilderBtn.classList.remove('hidden');
                    const newBtn = currentBuilderBtn.cloneNode(true);
                    if (currentBuilderBtn.parentNode) {
                        currentBuilderBtn.parentNode.replaceChild(newBtn, currentBuilderBtn);
                        newBtn.addEventListener('click', () => {
                            let url = `guest_upload.html?projectId=${currentProjectId}`;
                            if (isGuest && initialGuestToken) url += `&guestToken=${initialGuestToken}`;
                            window.location.href = url;
                        });
                    }
                 } else if (currentBuilderBtn) { currentBuilderBtn.classList.add('hidden'); }

                 if (approvedStatuses.includes(projectData.status)) {
                     approvalBanner.classList.remove('hidden');
                     approvalBanner.className = "mb-6 bg-green-800/50 border border-green-500 text-green-200 px-4 py-3 rounded-lg relative";
                     approvalBanner.innerHTML = '<strong class="font-bold">Proof Approved!</strong> <span class="block sm:inline">This project is locked for printing and cannot be modified.</span>';
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold text-green-400">Proof Approved</p>`;
                     commentTool.style.display = 'none';
                 } else if (projectData.status === 'Waiting Admin Review') {
                     approvalBanner.classList.remove('hidden');
                     approvalBanner.className = "mb-6 bg-blue-900/50 border border-blue-500 text-blue-200 px-4 py-3 rounded-lg relative";
                     approvalBanner.innerHTML = '<strong class="font-bold">Under Review.</strong> <span class="block sm:inline">An administrator is reviewing your submission.</span>';
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold text-blue-400">Waiting for Review</p>`;
                     commentTool.style.display = 'none'; 
                 } else if (projectData.status === 'changes_requested') {
                     approvalBanner.classList.add('hidden');
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold text-red-400">Changes Requested</p>`;
                     commentTool.style.display = 'none';
                 } else {
                    approvalBanner.classList.add('hidden');
                     const approveButton = document.getElementById('approve-button');
                     const requestChangesButton = document.getElementById('request-changes-button');
                     const cancelActionButton = document.getElementById('cancel-action-button');
                     if (approveButton) approveButton.addEventListener('click', () => showApproveConfirmation(projectData));
                     if (requestChangesButton) requestChangesButton.addEventListener('click', showRequestChangesConfirmation);
                     if (cancelActionButton) cancelActionButton.addEventListener('click', hideConfirmation);
                 }
            }

            // --- [FIX] LOADING STATE HANDLING (Async Gap Protection) ---
            // We show the spinner if:
            // 1. Status is explicitly 'Processing Upload' (set by guest_upload.js)
            // 2. A new upload happened (lastUploadAt) but the latest version in 'versions' array is OLDER than that (backend hasn't finished optimizing yet).
            // 3. The latest version exists but is marked as 'processing'.
            
            const isProcessingStatus = currentStatus === 'Processing Upload';
            
            let isNewVersionPending = false;
            if (projectData.lastUploadAt && latestVersion && latestVersion.createdAt) {
                // If the latest version on file is OLDER than the last upload timestamp, the new one isn't ready yet.
                // Note: seconds comparison is usually sufficient.
                isNewVersionPending = latestVersion.createdAt.seconds < projectData.lastUploadAt.seconds;
            }

            const isOptimizationRunning = currentProcessingStatus === 'processing' && (!latestVersion || !latestVersion.fileURL);

            if (isProcessingStatus || isNewVersionPending || isOptimizationRunning) {
                loadingSpinner.classList.remove('hidden');
                proofContent.classList.add('hidden');
                loadingSpinner.innerHTML = `
                    <div class="flex flex-col items-center gap-4">
                        <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <div class="text-center">
                            <p class="text-indigo-400 font-bold text-lg animate-pulse">Optimizing PDF for viewing...</p>
                            <p class="text-gray-400 text-sm mt-1">This may take a minute.</p>
                        </div>
                    </div>
                `;
                return; 
            }
            // ---------------------------------------

            if (shouldReInit) {
                console.log('[Load Project] Update detected. Initializing viewer.');
                
                const versionSelector = document.getElementById('version-selector');
                const selectedVersion = versionSelector ? parseInt(versionSelector.value, 10) : null;
                const maxVersion = latestVersion ? latestVersion.versionNumber : 0;
                
                if (selectedVersion && maxVersion > selectedVersion) {
                     if (versionSelector) versionSelector.value = ""; 
                }

                initializeSharedViewer({
                    db, auth, projectId: currentProjectId,
                    projectData: projectData,
                    isAdmin: false, isGuest: isGuest, guestPermissions: guestPermissions
                });
            }

            loadingSpinner.classList.add('hidden');
            proofContent.classList.remove('hidden');
        } else {
            loadingSpinner.innerHTML = '<p class="text-red-400">Error: Project not found.</p>';
        }
    }, (error) => { console.error("[Load Project] Error:", error); });
}
// --- End loadProjectForUser ---


// --- AUTHENTICATION STATE MANAGER ---
let isProcessingGuestLink = false; // Flag to prevent multiple concurrent guest handling attempts

onAuthStateChanged(auth, (user) => {
    // Use the constants initialGuestToken and initialProjectId parsed outside
    console.log(`[Auth State] Fired. User: ${user ? user.uid + (user.isAnonymous ? ' (anon)' : '') : 'null'}, Initial Guest Token: ${initialGuestToken}, Initial Project ID: ${initialProjectId}, isProcessing: ${isProcessingGuestLink}, isGuest: ${isGuest}`);

    // Clear previous listener if it exists and we are changing context
    // Note: We do NOT unsubscribe if we are merely processing a guest link for an existing user, as that would kill the view we are trying to build.
     if (unsubscribeProjectListener && !isProcessingGuestLink && (!initialGuestToken || !initialProjectId)) {
         console.log('[Auth State] Unsubscribing existing project listener due to context change.');
         unsubscribeProjectListener();
         unsubscribeProjectListener = null;
     }

     // [NEW] Also unsubscribe history listener
     if (unsubscribeHistoryListener && !isProcessingGuestLink && (!initialGuestToken || !initialProjectId)) {
         unsubscribeHistoryListener();
         unsubscribeHistoryListener = null;
     }
     
     // Reset guest status at the start unless we are actively processing a guest link
     if (!isProcessingGuestLink && !initialGuestToken) {
        isGuest = false;
        guestPermissions = {};
     }


    // --- PRIORITY 1: Handle Guest Link (For ANY user state) ---
    // We use the constants parsed at the top of the script
    if (initialGuestToken && initialProjectId) {
        console.log('[Auth State] Condition MET: Initial guestToken and projectId found.');
        
        if (!isProcessingGuestLink) {
            isProcessingGuestLink = true;
            console.log('[Auth State] Starting guest link processing. Preserving current auth state.');

            // We simply pass whatever user state exists (logged in or not) to handleGuestAccess.
            // It will handle signing in anonymously IF needed.
            handleGuestAccess(initialProjectId, initialGuestToken).finally(() => { 
                isProcessingGuestLink = false;
                console.log('[Auth State] Guest link processing complete. isProcessingGuestLink = false.');
            });
        } else {
             console.log('[Auth State] Guest processing already in progress. Skipping duplicate call.');
        }
        return; // Stop further checks; handleGuestAccess drives the flow from here.
    }

    // --- PRIORITY 2: Handle Regular Logged-In User (only if no guest token) ---
    else if (user && !user.isAnonymous) {
        console.log('[Auth State] Condition MET: Regular user (no guest token). Loading project.');
        isGuest = false; 
        loadProjectForUser(user);
    }

    // --- PRIORITY 3: Handle Stray Anonymous User (no guest token) ---
    else if (user && user.isAnonymous && !initialGuestToken) {
        console.warn('[Auth State] Condition MET: Anonymous user (no guest token). Signing out and redirecting.');
        signOut(auth);
        window.location.href = 'index.html';
        return; 
    }

    // --- PRIORITY 4: No User, No Guest Token (Redirect) ---
    else if (!user && !initialGuestToken) {
        console.log('[Auth State] Condition MET: No user and no guest token. Redirecting.');
        window.location.href = 'index.html';
    }

    // --- Fallback ---
    else {
        console.error(`[Auth State] Reached unexpected final else. User: ${user}, Token: ${initialGuestToken}`);
    }
}); // --- End onAuthStateChanged ---

// --- Share Modal Logic (Owner Only) ---
if (headerShareButton) {
    headerShareButton.addEventListener('click', () => {
        if (shareModal) {
            shareModal.classList.remove('hidden');
            shareModalContent.classList.remove('hidden');
            shareModalResult.classList.add('hidden');
            shareLinkForm.reset();
        }
    });
}

function closeShareModal() {
    if (shareModal) shareModal.classList.add('hidden');
}

if (shareModalCloseBtn) shareModalCloseBtn.addEventListener('click', closeShareModal);
if (shareModalCancelBtn) shareModalCancelBtn.addEventListener('click', closeShareModal);

if (shareLinkForm) {
    shareLinkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        generateLinkBtn.disabled = true;
        generateLinkBtn.textContent = 'Generating...';

        const permissions = {
            canApprove: document.getElementById('permission-approve').checked,
            canAnnotate: document.getElementById('permission-annotate').checked,
            canSeeComments: document.getElementById('permission-see-comments').checked
            // Note: We typically don't allow guests to create other "Owners"
        };

        try {
            const result = await generateGuestLink({ 
                projectId: currentProjectId, 
                permissions 
            });

            if (result.data.success) {
                const fullUrl = new URL(result.data.url);
                generatedLinkUrlInput.value = `${window.location.origin}/proof.html${fullUrl.search}`;
                shareModalContent.classList.add('hidden');
                shareModalResult.classList.remove('hidden');
            } else {
                throw new Error('Cloud function returned an error.');
            }
        } catch (error) {
            console.error("Error generating link:", error);
            alert(`Error: ${error.message || 'Could not generate link.'}`);
        } finally {
            generateLinkBtn.textContent = 'Generate Link';
            generateLinkBtn.disabled = false;
        }
    });
}

if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
        generatedLinkUrlInput.select();
        document.execCommand('copy');
        copyStatusMsg.textContent = 'Copied!';
        setTimeout(() => { copyStatusMsg.textContent = ''; }, 2000);
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', () => {
         console.log('[Logout] Button clicked.');
        signOut(auth);
    });
} else {
     console.warn('[Init] Logout button not found.');
}