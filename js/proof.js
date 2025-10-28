import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeSharedViewer } from './viewer.js';
import { doc, onSnapshot, updateDoc, collection, getDocs, Timestamp, addDoc, getDoc, arrayUnion, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as pdfjsLib from "https://mozilla.github.io/pdf.js/build/pdf.mjs";

// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://mozilla.github.io/pdf.js/build/pdf.worker.mjs";

// --- PARSE URL PARAMS ONCE AT SCRIPT LOAD ---
const urlParams = new URLSearchParams(window.location.search);
const initialGuestToken = urlParams.get('guestToken');
const initialProjectId = urlParams.get('id');
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


let currentProjectId = initialProjectId; // Use the initially parsed ID
let actionToConfirm = null;
let unsubscribeProjectListener = null;
let isGuest = false;
let guestPermissions = {};

// Define these functions in the main script scope
function showApproveConfirmation() {
    showConfirmation('approve');
}
function showRequestChangesConfirmation() {
    showConfirmation('request-changes');
}


// --- Guest Authentication Flow ---
async function handleGuestAccess(projectId, guestToken) {
    console.log(`[Guest Flow] Starting for projectId: ${projectId}, token: ${guestToken}`);
    try {
        // 1. Fetch Guest Link Details
        console.log('[Guest Flow] Attempting to read guest link document...');
        const linkRef = doc(db, "projects", projectId, "guestLinks", guestToken);
        const linkSnap = await getDoc(linkRef);
        console.log('[Guest Flow] Guest link document read attempt complete.');

        if (!linkSnap.exists()) {
            console.error("[Guest Flow] Guest link document does not exist.");
            throw new Error("This share link is invalid.");
        }

        const linkData = linkSnap.data();
        console.log('[Guest Flow] Guest link data:', linkData);
        const now = Timestamp.now();
        if (linkData.expiresAt.seconds < now.seconds) {
            console.error("[Guest Flow] Guest link has expired.");
            throw new Error("This share link has expired.");
        }

        isGuest = true; // Set isGuest flag HERE after validation succeeds
        guestPermissions = linkData.permissions;
        console.log('[Guest Flow] Set guest permissions:', guestPermissions);

        // 2. Sign In Anonymously (Ensure we only do this if not already anon)
        let userCredential;
        if (!auth.currentUser || !auth.currentUser.isAnonymous) {
            console.log('[Guest Flow] Attempting anonymous sign-in...');
            userCredential = await signInAnonymously(auth);
            const guestUid = userCredential.user.uid;
            console.log('[Guest Flow] Anonymous sign-in successful, UID:', guestUid);
        } else {
            userCredential = { user: auth.currentUser }; // Use existing anon user
            console.log('[Guest Flow] Using existing anonymous user, UID:', userCredential.user.uid);
        }


        // 3. Create a 'claim' to link anon UID to the token for security rules
        console.log('[Guest Flow] Attempting to create guest claim document...');
        const claimRef = doc(db, "guest_claims", userCredential.user.uid);
        // Ensure projectId passed here is the one from the function argument
        await setDoc(claimRef, { projectId: projectId, guestToken: guestToken });
        console.log('[Guest Flow] Guest claim document created successfully.');


        // 4. Log the view event
        console.log('[Guest Flow] Skipping view history update for debugging.');
        // updateDoc(linkRef, { ... }).catch(...)

        // 5. Hide unnecessary UI for guests
        console.log('[Guest Flow] Hiding guest UI elements...');
        document.querySelector('nav')?.classList.add('hidden');
        const backButton = document.querySelector('a[href="dashboard.html"]');
        if(backButton) backButton.classList.add('hidden');
        const accountButton = document.querySelector('a[href="account.html"]');
        if(accountButton) accountButton.classList.add('hidden');


        // 6. Proceed with loading the project
        console.log('[Guest Flow] Calling loadProjectForUser...');
        loadProjectForUser(userCredential.user); // Pass the anonymous user object

    } catch (error) {
        console.error("[Guest Flow] Detailed guest access error:", error);
        loadingSpinner.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
    }
} // --- End handleGuestAccess ---


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

            if (actionPanel && commentTool) {
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

                // Apply Guest Permissions
                if (isGuest) {
                    actionPanel.style.display = guestPermissions.canApprove ? 'block' : 'none';
                    commentTool.style.display = guestPermissions.canAnnotate ? 'block' : 'none';
                    console.log(`[Load Project] Guest UI set: canApprove=${guestPermissions.canApprove}, canAnnotate=${guestPermissions.canAnnotate}`);
                } else {
                    actionPanel.style.display = 'block';
                    commentTool.style.display = 'block';
                }

                // Check Project Status (AFTER resetting HTML)
                if (projectData.status === 'approved' || projectData.status === 'changes_requested') {
                     actionPanel.innerHTML = `<p class="text-center text-lg font-semibold ${projectData.status === 'approved' ? 'text-green-400' : 'text-red-400'}">${projectData.status === 'approved' ? 'Proof Approved' : 'Changes Requested'}</p>`;
                     commentTool.style.display = 'none';
                     console.log(`[Load Project] Project status is ${projectData.status}, hiding action buttons and comment tool.`);
                 } else {
                     // Status is pending, add listeners to the (now existing) buttons
                     console.log(`[Load Project] Project status is ${projectData.status}, adding button listeners.`);
                     const approveButton = document.getElementById('approve-button');
                     const requestChangesButton = document.getElementById('request-changes-button');
                     const cancelActionButton = document.getElementById('cancel-action-button');

                     if (approveButton) approveButton.addEventListener('click', showApproveConfirmation);
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
     if (unsubscribeProjectListener && (isProcessingGuestLink || (initialGuestToken && initialProjectId) || (user && !user.isAnonymous))) {
         console.log('[Auth State] Unsubscribing existing project listener.');
         unsubscribeProjectListener();
         unsubscribeProjectListener = null;
     }
     // Reset guest status at the start unless we are already processing a guest link
     if (!isProcessingGuestLink) {
        isGuest = false;
        guestPermissions = {};
     }


    // --- PRIORITY 1: Handle Guest Link ---
    // We use the constants parsed at the top of the script
    if (initialGuestToken && initialProjectId) {
        console.log('[Auth State] Condition MET: Initial guestToken and projectId found.');
        if (!isProcessingGuestLink) {
            isProcessingGuestLink = true;
            console.log('[Auth State] Setting isProcessingGuestLink = true.');

            if (user && !user.isAnonymous) {
                console.log('[Auth State] Signing out existing non-anonymous user for guest flow...');
                signOut(auth).then(() => {
                    console.log('[Auth State] Sign out complete. Proceeding with handleGuestAccess.');
                    // handleGuestAccess will call signInAnonymously, triggering another auth state change
                    handleGuestAccess(initialProjectId, initialGuestToken).finally(() => { // Use initial values
                        isProcessingGuestLink = false;
                        console.log('[Auth State] Reset isProcessingGuestLink = false (after signout flow).');
                    });
                }).catch(err => {
                    console.error('[Auth State] Error signing out before guest flow:', err);
                    loadingSpinner.innerHTML = `<p class="text-red-400">Error preparing guest access. Please try again.</p>`;
                    isProcessingGuestLink = false;
                    console.log('[Auth State] Reset isProcessingGuestLink = false (on signout error).');
                });
            } else {
                // User is null or already anonymous, proceed
                console.log('[Auth State] User is null or anonymous. Proceeding directly with handleGuestAccess.');
                handleGuestAccess(initialProjectId, initialGuestToken).finally(() => { // Use initial values
                    isProcessingGuestLink = false;
                    console.log('[Auth State] Reset isProcessingGuestLink = false (after direct guest flow).');
                });
            }
        } else {
            console.log('[Auth State] Guest token found, but isProcessingGuestLink is true. Skipping handleGuestAccess call.');
            // This block will run when signInAnonymously completes
            if (user && user.isAnonymous) {
                 console.log('[Auth State] Processing guest, anonymous user confirmed. Calling loadProjectForUser.');
                 isGuest = true; // Make sure isGuest is set (handleGuestAccess might not have set it yet if it's still running)
                 loadProjectForUser(user);
            }
        }
        return; // Stop further checks if guest token exists
    }

    // --- PRIORITY 2: Handle Regular Logged-In User (only if no guest token) ---
    else if (user && !user.isAnonymous) {
        console.log('[Auth State] Condition MET: Regular user (no guest token). Loading project.');
        isGuest = false; // Ensure flag is correct
        loadProjectForUser(user);
    }

    // --- PRIORITY 3: Handle Stray Anonymous User (no guest token) ---
    else if (user && user.isAnonymous && !initialGuestToken) {
        console.warn('[Auth State] Condition MET: Anonymous user (no guest token). Signing out and redirecting.');
        signOut(auth);
        window.location.href = 'index.html';
        return; // Exit
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


if (logoutButton) {
    logoutButton.addEventListener('click', () => {
         console.log('[Logout] Button clicked.');
        signOut(auth);
    });
} else {
     console.warn('[Init] Logout button not found.');
}


// Notification Bell Logic
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');

if(notificationBell && notificationPanel){
    notificationBell.addEventListener('click', () => {
        notificationPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', (event) => {
        if (!notificationBell.contains(event.target) && !notificationPanel.contains(event.target)) {
            notificationPanel.classList.add('hidden');
        }
    });
} else {
     console.warn('[Init] Notification elements not found.');
}
