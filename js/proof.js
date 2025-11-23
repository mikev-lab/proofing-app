import { auth, db, functions, generateGuestLink } from './firebase.js';
import { onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { initializeSharedViewer } from './viewer.js';
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

// Define these functions in the main script scope
function showApproveConfirmation(projectData) {
    if (!approvalModal) return;

    // 1. Populate the dynamic text placeholder (Shorter version)
    const stock = projectData.specs?.paperType || projectData.specs?.stock || "Standard Stock";
    const color = projectData.specs?.colorType || projectData.specs?.ink || "Standard Color";
    
    if (approvalSpecsText) {
        // Notice the removal of "By approving this, you acknowledge that..."
        approvalSpecsText.innerHTML = `You are approving this to be printed on <span class="font-bold text-white">${stock}</span> in <span class="font-bold text-white">${color}</span>.`;
    }

    // 2. Reset the form (uncheck boxes, clear signature)
    approvalFormModal.reset();
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.classList.add('opacity-50', 'cursor-not-allowed');

    // 3. Show the modal
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
 function loadProjectForUser(user) {
    // Use currentProjectId (which should be set from initialProjectId)
    console.log(`[Load Project] Starting for user: ${user?.uid || 'anonymous/unknown'}, projectId: ${currentProjectId}, isGuest: ${isGuest}`);

    if (!currentProjectId) {
        console.error('[Load Project] No project ID available.');
        loadingSpinner.innerHTML = '<p class="text-red-400">Error: No project ID specified in URL.</p>';
        return;
    }

    if (user && !isGuest) {
         userEmailSpan.textContent = user.email;
         userEmailSpan.classList.remove('hidden');
         if(logoutButton) logoutButton.classList.remove('hidden');
    } else if (isGuest && user) {
         userEmailSpan.textContent = "Guest User";
         userEmailSpan.classList.remove('hidden');
         if(logoutButton) logoutButton.classList.add('hidden');
    } else {
        console.warn('[Load Project] loadProjectForUser called with null user.');
    }

    console.log(`[Load Project] Setting up Firestore listener for project: ${currentProjectId}`);
    const projectRef = doc(db, "projects", currentProjectId);

    // --- [NEW] Setup History Listener ---
    // Remove previous history listener if exists
    if (unsubscribeHistoryListener) {
        unsubscribeHistoryListener();
        unsubscribeHistoryListener = null;
    }

    // Create the history query
    const historyQuery = query(collection(db, "projects", currentProjectId, "history"), orderBy("timestamp", "desc"));

    // Attach the listener
    unsubscribeHistoryListener = onSnapshot(historyQuery, (snapshot) => {
        const historyList = document.getElementById('project-history-list');
        if (historyList) {
            historyList.innerHTML = '';
            if (snapshot.empty) {
                historyList.innerHTML = '<p class="text-gray-400">No history events found.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const event = doc.data();
                const eventTime = event.timestamp ? new Date(event.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                const signature = event.details && event.details.signature ? `<span class="italic text-gray-400"> - E-Signature: ${event.details.signature}</span>` : '';
                
                // Formatting action text
                let actionText = event.action ? event.action.replace(/_/g, ' ') : 'Unknown Action';
                actionText = actionText.charAt(0).toUpperCase() + actionText.slice(1);

                const item = document.createElement('div');
                item.className = 'p-3 bg-slate-700/50 rounded-md text-sm border border-slate-600/30';
                item.innerHTML = `
                    <div class="flex justify-between items-start">
                        <p class="font-semibold text-white">${actionText}</p>
                        <span class="text-[10px] text-gray-500">${eventTime}</span>
                    </div>
                    <p class="text-gray-300 text-xs mt-1">by <span class="font-medium text-indigo-300">${event.userDisplay || 'System'}</span>${signature}</p>
                `;
                historyList.appendChild(item);
            });
        }
    }, (error) => {
        console.error("[Load Project] Error fetching history:", error);
        const historyList = document.getElementById('project-history-list');
        // Only show error if it's not a permission issue that we expect for some guests (though we fixed that)
        if(historyList) historyList.innerHTML = '<p class="text-red-400 text-xs">Unable to load history.</p>';
    });
    // ------------------------------------


    if (unsubscribeProjectListener) {
        console.log('[Load Project] Unsubscribing previous listener.');
        unsubscribeProjectListener();
        unsubscribeProjectListener = null;
    }


    unsubscribeProjectListener = onSnapshot(projectRef, (docSnap) => {
        console.log(`[Load Project] onSnapshot triggered. docSnap exists: ${docSnap.exists()}`);
        if (docSnap.exists()) {
            const projectData = docSnap.data();
            console.log('[Load Project] Project data received:', projectData);

            if(projectName) projectName.textContent = projectData.projectName;

            const actionPanel = document.querySelector('#approval-form')?.parentElement;
            const commentTool = document.getElementById('tool-comment');
            const approvalBanner = document.getElementById('approval-banner');

            if (actionPanel && commentTool && approvalBanner) {
                // Reset action panel HTML to original state
                // This fixes the issue where buttons disappeared after a status change
                actionPanel.innerHTML = `
                    <h3 class="text-xl font-semibold text-white mb-4">Actions</h3>
                    <form id="approval-form">
                        <div id="decision-buttons">
                            <button type="button" id="approve-button" class="w-full text-center rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold leading-6 text-white shadow-md hover:bg-green-500 transition-all duration-150 ease-in-out">
                                Approve
                            </button>
                            <button type="button" id="request-changes-button" class="mt-3 w-full text-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold leading-6 text-white shadow-md hover:bg-red-500 transition-all duration-150 ease-in-out">
                                Request Changes
                            </button>
                        </div>
                        <div id="confirmation-section" class="hidden mt-4">
                             <p id="confirmation-message" class="text-center text-gray-300 mb-4"></p>
                             <button type="submit" id="confirm-action-button" class="w-full text-center rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-150 ease-in-out">
                                 Confirm
                             </button>
                             <button type="button" id="cancel-action-button" class="mt-3 w-full text-center rounded-lg bg-gray-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-gray-500 transition-all duration-150 ease-in-out">
                                 Cancel
                             </button>
                        </div>
                    </form>`;

                 // Re-attach the main form submit listener after resetting HTML
                 const newApprovalForm = document.getElementById('approval-form');
                 if(newApprovalForm) {
                    newApprovalForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        console.log(`[Approval Form] Re-attached submit handler. Action: ${actionToConfirm}`);
                        const confirmBtn = document.getElementById('confirm-action-button');
                        if (actionToConfirm && confirmBtn) {
                            confirmBtn.disabled = true;
                            confirmBtn.textContent = 'Processing...';
                            updateProjectStatus(actionToConfirm === 'approve' ? 'approved' : 'changes_requested');
                        } else {
                             console.warn('[Approval Form] Re-attached submit handler called but no action selected or button not found.');
                             hideConfirmation();
                        }
                    });
                 }

                // Determine if current user is an Editor/Owner
                let isEditor = false;

                if (isGuest) {
                    // Guest permissions dictate access
                    if (guestPermissions.isOwner) isEditor = true;
                } else {
                    // Authenticated user viewing their project is an editor
                    // (Admins viewing via proof page also fall here)
                    isEditor = true;
                }

                // Apply Guest Permissions
                if (isGuest) {
                    actionPanel.style.display = guestPermissions.canApprove ? 'block' : 'none';
                    commentTool.style.display = guestPermissions.canAnnotate ? 'block' : 'none';
                    console.log(`[Load Project] Guest UI set: canApprove=${guestPermissions.canApprove}, canAnnotate=${guestPermissions.canAnnotate}, isOwner=${guestPermissions.isOwner}`);

                    if (guestPermissions.isOwner && headerShareButton) {
                        headerShareButton.classList.remove('hidden');
                    }
                } else {
                    actionPanel.style.display = 'block';
                    commentTool.style.display = 'block';
                }

                // Show/Hide Builder Button
                if (isEditor && navEditBuilderButton) {
                    navEditBuilderButton.classList.remove('hidden');

                    // Setup Listener (Remove old to prevent duplicates if snapshot re-runs)
                    const newBtn = navEditBuilderButton.cloneNode(true);
                    navEditBuilderButton.parentNode.replaceChild(newBtn, navEditBuilderButton);

                    newBtn.addEventListener('click', () => {
                        let url = `guest_upload.html?projectId=${currentProjectId}`;
                        if (isGuest && initialGuestToken) {
                            url += `&guestToken=${initialGuestToken}`;
                        }
                        window.location.href = url;
                    });
                } else if (navEditBuilderButton) {
                    navEditBuilderButton.classList.add('hidden');
                }

                // Check Project Status (AFTER resetting HTML)
                 if (approvedStatuses.includes(projectData.status)) {
                     approvalBanner.classList.remove('hidden');
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold text-green-400">Proof Approved</p>`;
                     commentTool.style.display = 'none';
                     console.log(`[Load Project] Project status is ${projectData.status}, hiding action buttons and comment tool.`);
                 } else if (projectData.status === 'changes_requested') {
                     approvalBanner.classList.add('hidden');
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold text-red-400">Changes Requested</p>`;
                     commentTool.style.display = 'none'; // Still disable comments if changes are requested
                 } else {
                    approvalBanner.classList.add('hidden');
                     // Status is pending, add listeners to the (now existing) buttons
                     console.log(`[Load Project] Project status is ${projectData.status}, adding button listeners.`);
                     const approveButton = document.getElementById('approve-button');
                     const requestChangesButton = document.getElementById('request-changes-button');
                     const cancelActionButton = document.getElementById('cancel-action-button');

                     if (approveButton) approveButton.addEventListener('click', () => showApproveConfirmation(projectData));
                     if (requestChangesButton) requestChangesButton.addEventListener('click', showRequestChangesConfirmation);
                     if (cancelActionButton) cancelActionButton.addEventListener('click', hideConfirmation);
                 }

            } else {
                console.warn('[Load Project] Action panel or comment tool element not found.');
            }


            console.log('[Load Project] Initializing shared viewer...');
            // The onSnapshot listener provides real-time updates.
            // Every time the project document changes (e.g., a version's processingStatus
            // changes from 'processing' to 'complete'), this code will re-run.
            // We just need to re-initialize the viewer with the fresh `projectData`.
            // The logic inside viewer.js will handle showing the correct state.
            initializeSharedViewer({
                db,
                auth,
                projectId: currentProjectId,
                projectData: projectData,
                isAdmin: false,
                isGuest: isGuest,
                guestPermissions: guestPermissions
            });
            console.log('[Load Project] Shared viewer initialization called.');


            loadingSpinner.classList.add('hidden');
            proofContent.classList.remove('hidden');
        } else {
             console.error(`[Load Project] Project document ${currentProjectId} not found.`);
            loadingSpinner.innerHTML = '<p class="text-red-400">Error: Project not found.</p>';
        }
    }, (error) => {
        console.error("[Load Project] Firestore listener error:", error);
        loadingSpinner.innerHTML = `<p class="text-red-400">Error loading project data: ${error.message}</p>`;
         if (unsubscribeProjectListener) {
             unsubscribeProjectListener();
             unsubscribeProjectListener = null;
         }
    });
     console.log('[Load Project] Firestore listener attached.');
} // --- End loadProjectForUser ---


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