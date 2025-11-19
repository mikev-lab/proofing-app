// js/dashboard.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Get DOM elements
const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const projectsList = document.getElementById('projects-list');
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');

function fetchNotifications() {
    // Placeholder function for fetching notifications
    console.log("Fetching notifications...");
}

/**
 * Formats a Firebase Timestamp into a readable date string.
 * @param {Timestamp} fbTimestamp - The Firebase Timestamp object.
 * @returns {string} A formatted date string (e.g., "Oct 21, 2025").
 */
function formatTimestamp(fbTimestamp) {
    if (!fbTimestamp) {
        return "Date not set";
    }
    try {
        const jsDate = fbTimestamp.toDate();
        return jsDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch (error) {
        console.error("Error formatting timestamp:", error);
        return "Invalid Date";
    }
}

/**
 * Returns an HTML string for a status badge based on the project status.
 * @param {string} status - The status of the project (e.g., "pending").
 * @returns {string} HTML string for the badge.
 */
function getStatusBadge(status) {
    status = status || 'unknown';
    let classes = "px-3 py-1 rounded-full text-xs font-medium";
    let text = status.charAt(0).toUpperCase() + status.slice(1);

    switch (status.toLowerCase()) {
        case 'pending':
            classes += " bg-yellow-500/20 text-yellow-300";
            text = "Pending";
            break;
        case 'approved':
            classes += " bg-green-500/20 text-green-300";
            break;
        case 'changes_requested':
            classes += " bg-red-500/20 text-red-300";
            text = "Changes Requested";
            break;
        default:
            classes += " bg-gray-500/20 text-gray-300";
            text = "Unknown";
            break;
    }
    return `<span class="${classes}">${text}</span>`;
}

/**
 * Fetches projects from Firestore for the given user ID.
 * Includes backward-compatibility for 'clientId' and a retry for new user race condition.
 * @param {string} uid - The user's unique ID from Firebase Auth.
 * @param {number} [retryCount=0] - Internal counter for retries.
 */
async function fetchProjects(uid, retryCount = 0) {
    try {
        // Show loading spinner, hide other states
        loadingSpinner.classList.remove('hidden');
        emptyState.classList.add('hidden');
        projectsList.classList.add('hidden');

        // --- ADD RETRY LOGIC: START ---
        // Step 1: Get the user's document to find their companyId
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);

        // Step 2: Handle race condition for new users
        if (!userDocSnap.exists()) {
            if (retryCount < 5) {
                // User doc isn't ready. Wait 1.5 seconds and try again.
                console.warn(`User doc not found for ${uid}, retrying... (${retryCount + 1}/5)`);
                setTimeout(() => fetchProjects(uid, retryCount + 1), 1500);
                return; // Exit function, wait for retry
            } else {
                // Failed after 5 retries, show empty state
                console.error("User doc not found after 5 retries. Cannot fetch projects.");
                loadingSpinner.classList.add('hidden');
                emptyState.classList.remove('hidden');
                return; // Exit function, show error state
            }
        }

        const userCompanyId = userDocSnap.data().companyId;
        // --- ADD RETRY LOGIC: END ---

        const projectsRef = collection(db, "projects");
        const queries = [];

        // Query 1: New projects by companyId
        // --- MODIFY: Check if userCompanyId exists before adding query ---
        if (userCompanyId) {
            queries.push(getDocs(query(projectsRef, where("companyId", "==", userCompanyId))));
        }

        // Query 2: Old projects by clientId
        queries.push(getDocs(query(projectsRef, where("clientId", "==", uid))));

        const snapshots = await Promise.all(queries);

        const projectsMap = new Map();
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                projectsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
        });

        const projects = Array.from(projectsMap.values());

        // Sort projects by 'createdAt' timestamp, newest first
        projects.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        // Hide loading spinner
        loadingSpinner.classList.add('hidden');

        if (projects.length === 0) {
            // Show empty state if no projects are found
            emptyState.classList.remove('hidden');
        } else {
            // Render projects if found
            renderProjects(projects);
            projectsList.classList.remove('hidden');
        }

    } catch (error) {
        console.error("Error fetching projects:", error);
        loadingSpinner.classList.add('hidden');
        // Display error message in the empty state section
        emptyState.innerHTML = `<p class="text-red-400">Error loading projects: ${error.message}</p>`;
        emptyState.classList.remove('hidden');
    }
}

/**
 * Renders the list of project cards onto the page.
 * @param {Array} projects - An array of project objects.
 */
function renderProjects(projects) {
    projectsList.innerHTML = ''; // Clear any existing content

    projects.forEach(project => {
        const formattedDate = formatTimestamp(project.createdAt);
        const statusBadge = getStatusBadge(project.status);

        // This is the clickable card for each project
        const cardHtml = `
            <a href="proof.html?id=${project.id}"
               class="block bg-slate-800/60 hover:bg-slate-700/80 rounded-lg shadow-xl p-6 transition-all duration-200 ease-in-out transform hover:-translate-y-1">

                <div class="flex justify-between items-center">
                    <h3 class="text-xl font-semibold text-white truncate" title="${project.projectName || 'Untitled Project'}">
                        ${project.projectName || 'Untitled Project'}
                    </h3>
                    ${statusBadge}
                </div>
                <p class="mt-2 text-sm text-gray-400">
                    Created: ${formattedDate}
                </p>
            </a>
        `;
        projectsList.innerHTML += cardHtml;
    });
}

// --- Main execution ---

// Listen for authentication state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        console.log('User is logged in:', user.uid);

        // Show user's email
        userEmailSpan.textContent = user.email;
        userEmailSpan.classList.remove('hidden');

        // Fetch this user's projects
        fetchProjects(user.uid);
        fetchNotifications();

    } else {
        // User is signed out. Redirect to login page.
        console.log('User is not logged in. Redirecting to index.html');
        window.location.href = 'index.html';
    }
});

// Add click listener for the logout button
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        console.error('Sign out error', error);
    });
    window.location.href = 'index.html';
});

