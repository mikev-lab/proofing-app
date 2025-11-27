// js/admin_production.js
import { auth, db, functions } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// DOM Elements
const userEmailSpan = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');
const loadingSpinner = document.getElementById('loading-spinner');
const ganttChartContainer = document.getElementById('gantt-chart');

// Modal Elements
const jobModal = document.getElementById('job-modal');
const jobModalClose = document.getElementById('job-modal-close');
const modalProjectName = document.getElementById('modal-project-name');
const modalStatusBadge = document.getElementById('modal-status-badge');
const modalQuantity = document.getElementById('modal-quantity');
const modalDurationInput = document.getElementById('modal-duration-input');
const modalPreviewContainer = document.getElementById('modal-preview-container');
const modalPreviewImage = document.getElementById('modal-preview-image');
const modalActions = document.getElementById('modal-actions');

// View Mode Buttons
const viewDayBtn = document.getElementById('view-mode-day');
const viewWeekBtn = document.getElementById('view-mode-week');
const viewMonthBtn = document.getElementById('view-mode-month');

let gantt = null;
let projectsCache = [];
let currentProjectId = null;
let statusUnsubscribe = null;

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                window.location.href = 'index.html';
                return;
            }
            userEmailSpan.textContent = user.email;
            userEmailSpan.classList.remove('hidden');

            // Start Listening for Production Data
            subscribeToProductionProjects();
            startMockPoller(); // Start the "Live Tracking" polling loop

        } catch (error) {
            console.error("Auth Error:", error);
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    signOut(auth);
    window.location.href = 'index.html';
});

// --- Data Fetching & Real-time Updates ---

function subscribeToProductionProjects() {
    // We want all projects that are Approved OR have a productionStatus
    // Firestore "OR" queries are limited, so we'll grab "Approved" + anything with "productionStatus"
    // For simplicity in this v1, let's grab all active projects and filter client-side if needed,
    // or specifically target the 'Approved' / 'In Production' lifecycle.

    // Let's just listen to the whole collection for now but filter in the snapshot callback
    // to avoid complex index requirements.
    // Optimally: where('status', 'in', ['Approved', 'Pre-Press', 'Queued', 'Printing', 'Finishing', 'Complete'])

    const q = query(collection(db, 'projects')); // Broad query, filter locally

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const tasks = [];
        projectsCache = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // Filter: Only care about projects that have reached "Approved" or are in production pipeline
            if (data.status === 'Approved' || data.productionStatus) {
                const prodStatus = data.productionStatus || 'Pre-Press';

                // Calculate Times
                // Default Start: specific scheduled start OR approval time OR now
                let start = new Date();
                if (data.scheduledStartTime) start = data.scheduledStartTime.toDate();
                else if (data.approvedAt) start = data.approvedAt.toDate();

                // Duration: stored duration (hours) OR default 1h
                const durationHours = data.estimatedDuration || 1;
                const end = new Date(start.getTime() + (durationHours * 60 * 60 * 1000));

                // Gantt Task Object
                tasks.push({
                    id: doc.id,
                    name: data.projectName,
                    start: formatDateForGantt(start),
                    end: formatDateForGantt(end),
                    progress: getProgressFromStatus(prodStatus),
                    dependencies: '', // Could link tasks later
                    custom_class: getClassForStatus(prodStatus), // Custom CSS class
                    // Custom Data for our internal logic
                    _status: prodStatus,
                    _fieryJobId: data.fieryJobId,
                    _fieryStatus: data.fieryStatus, // Live status from poller
                    _data: data
                });

                projectsCache.push({ id: doc.id, ...data });
            }
        });

        loadingSpinner.classList.add('hidden');
        renderGantt(tasks);
    });
}

// --- Gantt Chart Logic ---

function renderGantt(tasks) {
    if (tasks.length === 0) {
        ganttChartContainer.innerHTML = '<p class="text-center text-gray-400 mt-10">No jobs in production queue.</p>';
        return;
    }

    if (!gantt) {
        gantt = new Gantt("#gantt-chart", tasks, {
            header_height: 50,
            column_width: 30,
            step: 24,
            view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
            bar_height: 30,
            bar_corner_radius: 3,
            arrow_curve: 5,
            padding: 18,
            view_mode: 'Day',
            date_format: 'YYYY-MM-DD',
            custom_popup_html: null, // We'll implement click, but maybe a custom hover later if needed

            on_click: (task) => {
                openJobModal(task.id);
            },

            on_date_change: (task, start, end) => {
                updateJobSchedule(task.id, start, end);
            },

            on_progress_change: (task, progress) => {
                // Optional: Allow manual progress drag?
            },

            on_view_change: (mode) => {
                // Update active buttons
            }
        });

        // Setup View Buttons
        viewDayBtn.addEventListener('click', () => gantt.change_view_mode('Day'));
        viewWeekBtn.addEventListener('click', () => gantt.change_view_mode('Week'));
        viewMonthBtn.addEventListener('click', () => gantt.change_view_mode('Month'));

    } else {
        gantt.refresh(tasks);
    }
}

function formatDateForGantt(date) {
    // Format: YYYY-MM-DD HH:MM
    const iso = date.toISOString();
    return iso.slice(0, 16).replace('T', ' ');
}

function getProgressFromStatus(status) {
    switch (status.toLowerCase()) {
        case 'pre-press': return 10;
        case 'queued': return 30;
        case 'printing': return 60;
        case 'finishing': return 80;
        case 'complete': return 100;
        default: return 0;
    }
}

function getClassForStatus(status) {
    // Map status to CSS classes defined in a <style> block we'll inject or use tailwind classes if the lib supports it
    // Frappe Gantt adds these as class names to the .bar-group
    // We'll define specific styles for colors
    return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}


// --- Firestore Updates ---

async function updateJobSchedule(projectId, start, end) {
    // Calculate new duration in hours
    const diffMs = end - start;
    const durationHours = diffMs / (1000 * 60 * 60);

    try {
        await updateDoc(doc(db, 'projects', projectId), {
            scheduledStartTime: start,
            estimatedDuration: durationHours
        });
        console.log(`Updated schedule for ${projectId}`);
    } catch (e) {
        console.error("Failed to update schedule", e);
        alert("Failed to save new schedule.");
    }
}

async function updateProductionStatus(projectId, newStatus, extraData = {}) {
    try {
        await updateDoc(doc(db, 'projects', projectId), {
            productionStatus: newStatus,
            ...extraData
        });

        // Notify Admins about stage change
        // (Assuming js/notifications.js logic handles generic notifications,
        // but here we might want to manually create one via the same helper the backend uses,
        // OR rely on a cloud function trigger. Let's trigger a cloud function for robustness if needed,
        // but simple doc write is easier here.)
        // We'll leave the notification trigger to the backend watcher or just simple Firestore write.

        closeJobModal();
    } catch (e) {
        console.error("Failed to update status", e);
        alert("Error updating status.");
    }
}


// --- Modal & Job Interaction ---

async function openJobModal(projectId) {
    currentProjectId = projectId;
    const project = projectsCache.find(p => p.id === projectId);
    if (!project) return;

    modalProjectName.textContent = project.projectName;
    const status = project.productionStatus || 'Pre-Press';
    modalStatusBadge.textContent = status;
    modalStatusBadge.className = `px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusColor(status)}`;

    // Fill Details
    modalQuantity.textContent = (project.specs && project.specs.quantity) ? project.specs.quantity : '-';
    modalDurationInput.value = project.estimatedDuration || 1;

    // Show Preview if Pre-Press
    if (status === 'Pre-Press') {
        modalPreviewContainer.classList.remove('hidden');
        // Find latest imposition or version preview
        let previewUrl = null;
        if (project.impositions && project.impositions.length > 0) {
            previewUrl = project.impositions[project.impositions.length - 1].fileURL;
        } else if (project.versions && project.versions.length > 0) {
            // Fallback to latest version preview
             const latest = project.versions[project.versions.length - 1];
             previewUrl = latest.previewURL;
        }

        if (previewUrl) {
            modalPreviewImage.src = previewUrl;
        } else {
            modalPreviewImage.alt = "No preview available";
        }
    } else {
        modalPreviewContainer.classList.add('hidden');
    }

    // Render Actions
    renderModalActions(status, project);

    jobModal.classList.remove('hidden');
}

function renderModalActions(status, project) {
    modalActions.innerHTML = '';

    const btnClass = "px-4 py-2 rounded-md text-white font-semibold text-sm transition-colors";

    if (status === 'Pre-Press') {
        // [Action] Send to Printer
        const btn = document.createElement('button');
        btn.textContent = "Send to Printer (Queue)";
        btn.className = `${btnClass} bg-indigo-600 hover:bg-indigo-500`;
        btn.onclick = async () => {
            // Update Duration first
            const duration = parseFloat(modalDurationInput.value);
            if (duration && duration !== project.estimatedDuration) {
                await updateDoc(doc(db, 'projects', currentProjectId), { estimatedDuration: duration });
            }

            // Call Mock API
            setModalLoading(true);
            try {
                const mockFieryAPI = httpsCallable(functions, 'mockFieryAPI');
                const result = await mockFieryAPI({
                    action: 'submitJob',
                    payload: {
                        projectId: currentProjectId,
                        projectName: project.projectName,
                        quantity: project.specs?.quantity
                    }
                });

                if (result.data.success) {
                    await updateProductionStatus(currentProjectId, 'Queued', {
                        fieryJobId: result.data.data.id,
                        fieryStatus: 'spooled'
                    });
                }
            } catch (err) {
                console.error(err);
                alert("Failed to submit to Fiery.");
            } finally {
                setModalLoading(false);
            }
        };
        modalActions.appendChild(btn);
    } else if (status === 'Queued') {
        // [Action] Start Printing
        const btn = document.createElement('button');
        btn.textContent = "Start Printing";
        btn.className = `${btnClass} bg-green-600 hover:bg-green-500`;
        btn.onclick = async () => {
             setModalLoading(true);
             try {
                 const mockFieryAPI = httpsCallable(functions, 'mockFieryAPI');
                 // We need the fieryJobId saved on the project
                 if (!project.fieryJobId) throw new Error("No Fiery Job ID found.");

                 await mockFieryAPI({
                     action: 'startJob',
                     payload: { jobId: project.fieryJobId }
                 });

                 await updateProductionStatus(currentProjectId, 'Printing', { fieryStatus: 'printing' });
             } catch(err) {
                 console.error(err);
                 alert("Failed to start print job.");
             } finally {
                 setModalLoading(false);
             }
        };
        modalActions.appendChild(btn);
    } else if (status === 'Printing') {
        // Actions: Force Fail (Simulate Jam) or Force Complete
        // Since it's live tracking, maybe just a "Cancel" button?
        const btn = document.createElement('button');
        btn.textContent = "Move to Finishing"; // Manual override if api fails
        btn.className = `${btnClass} bg-blue-600 hover:bg-blue-500`;
        btn.onclick = () => updateProductionStatus(currentProjectId, 'Finishing');
        modalActions.appendChild(btn);
    } else if (status === 'Finishing') {
        const btn = document.createElement('button');
        btn.textContent = "Mark Complete";
        btn.className = `${btnClass} bg-green-600 hover:bg-green-500`;
        btn.onclick = () => updateProductionStatus(currentProjectId, 'Complete');
        modalActions.appendChild(btn);
    } else if (status === 'Error') {
         const btn = document.createElement('button');
         btn.textContent = "Retry / Clear Error";
         btn.className = `${btnClass} bg-yellow-600 hover:bg-yellow-500`;
         btn.onclick = () => updateProductionStatus(currentProjectId, 'Queued'); // Send back to queue
         modalActions.appendChild(btn);
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'Pre-Press': return 'bg-gray-500/20 text-gray-300';
        case 'Queued': return 'bg-yellow-500/20 text-yellow-300';
        case 'Printing': return 'bg-blue-500/20 text-blue-300'; // Green if active?
        case 'Finishing': return 'bg-purple-500/20 text-purple-300';
        case 'Complete': return 'bg-green-500/20 text-green-300';
        case 'Error': return 'bg-red-500/20 text-red-300';
        default: return 'bg-gray-500/20 text-gray-300';
    }
}

function setModalLoading(isLoading) {
    if (isLoading) {
        modalActions.classList.add('opacity-50', 'pointer-events-none');
    } else {
        modalActions.classList.remove('opacity-50', 'pointer-events-none');
    }
}

function closeJobModal() {
    jobModal.classList.add('hidden');
    currentProjectId = null;
}

jobModalClose.addEventListener('click', closeJobModal);


// --- Live Tracking Poller ---

function startMockPoller() {
    // Poll every 5 seconds
    setInterval(async () => {
        // Find all projects that are currently "Printing"
        const activeProjects = projectsCache.filter(p => p.productionStatus === 'Printing' && p.fieryJobId);

        if (activeProjects.length === 0) return;

        const mockFieryAPI = httpsCallable(functions, 'mockFieryAPI');

        for (const project of activeProjects) {
            try {
                const result = await mockFieryAPI({
                    action: 'getJobStatus',
                    payload: { jobId: project.fieryJobId }
                });

                const remoteStatus = result.data.data.status; // 'printing', 'printed', 'error'

                if (remoteStatus === 'printed') {
                    // Auto-advance to Finishing
                    console.log(`Job ${project.projectName} finished printing.`);
                    await updateProductionStatus(project.id, 'Finishing', { fieryStatus: 'printed' });
                } else if (remoteStatus === 'error') {
                    console.warn(`Job ${project.projectName} reported error.`);
                    await updateProductionStatus(project.id, 'Error', {
                        fieryStatus: 'error',
                        productionError: result.data.data.error_message
                    });
                } else {
                    // Still printing, maybe update progress % if we had it
                }
            } catch (e) {
                console.error("Poller error for", project.id, e);
            }
        }
    }, 5000);
}

// --- CSS Injection for Gantt Colors ---
const style = document.createElement('style');
style.innerHTML = `
    .status-pre-press .bar { fill: #6b7280 !important; } /* Gray */
    .status-queued .bar { fill: #eab308 !important; } /* Yellow */
    .status-printing .bar { fill: #3b82f6 !important; } /* Blue */
    .status-finishing .bar { fill: #a855f7 !important; } /* Purple */
    .status-complete .bar { fill: #22c55e !important; } /* Green */
    .status-error .bar { fill: #ef4444 !important; } /* Red */

    .status-printing .bar-progress { fill: #2563eb !important; }
`;
document.head.appendChild(style);
