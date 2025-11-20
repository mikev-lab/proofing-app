import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { firebaseConfig } from "./firebase.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// DOM Elements
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const uploadContainer = document.getElementById('upload-container');
const successState = document.getElementById('success-state');
const projectNameEl = document.getElementById('project-name');
const singleUploadSection = document.getElementById('single-upload-section');
const bookletUploadSection = document.getElementById('booklet-upload-section');
const uploadForm = document.getElementById('upload-form');
const submitButton = document.getElementById('submit-button');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');

// State
let projectId = null;
let guestToken = null;
let projectType = 'single'; // Default
let selectedFiles = {};

// --- Helper: Parse URL Params ---
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        projectId: params.get('projectId'),
        guestToken: params.get('guestToken')
    };
}

// --- Helper: Show Error ---
function showError(msg) {
    loadingState.classList.add('hidden');
    uploadContainer.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorMessage.textContent = msg;
}

// --- Helper: Update File Name Display ---
function updateFileName(inputId, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            display.textContent = e.target.files[0].name;
            selectedFiles[inputId] = e.target.files[0];
        } else {
            display.textContent = '';
            delete selectedFiles[inputId];
        }
        validateForm();
    });
}

// --- Helper: Setup Drag and Drop ---
function setupDropZone(inputId) {
    const input = document.getElementById(inputId);
    const dropZone = input.closest('.drop-zone');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        input.files = files;
        input.dispatchEvent(new Event('change'));
    }
}

function validateForm() {
    let isValid = false;
    if (projectType === 'booklet') {
        // Booklet needs at least interior pages
        if (selectedFiles['file-interior']) isValid = true;
    } else {
        // Single needs the main file
        if (selectedFiles['file-single']) isValid = true;
    }

    if (isValid) {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');
    }
}


// --- Main Initialization ---
async function init() {
    const params = getUrlParams();
    projectId = params.projectId;
    guestToken = params.guestToken;

    if (!projectId || !guestToken) {
        showError('Invalid link parameters.');
        return;
    }

    try {
        // 1. Authenticate via Backend (Custom Token)
        const authenticateGuest = httpsCallable(functions, 'authenticateGuest');
        const authResult = await authenticateGuest({ projectId, guestToken });

        if (!authResult.data || !authResult.data.token) {
            throw new Error("Failed to obtain access token.");
        }

        // Sign in with the custom token which contains claims: { guestProjectId: '...', guestPermissions: {...} }
        await signInWithCustomToken(auth, authResult.data.token);

        // 2. Fetch Project Details
        // Now that we are authenticated with the right claims, we can read the project doc
        // (assuming firestore.rules allows it based on the claim)

        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            showError('Project not found or access denied.');
            return;
        }

        const projectData = projectSnap.data();
        projectNameEl.textContent = projectData.projectName;
        projectType = projectData.projectType || 'single'; // Default to single if not set

        // 5. Setup UI based on type
        loadingState.classList.add('hidden');
        uploadContainer.classList.remove('hidden');

        if (projectType === 'booklet') {
            bookletUploadSection.classList.remove('hidden');
            setupDropZone('file-interior');
            setupDropZone('file-cover-front');
            setupDropZone('file-spine');
            setupDropZone('file-cover-back');

            updateFileName('file-interior', 'file-name-interior');
            updateFileName('file-cover-front', 'file-name-cover-front');
            updateFileName('file-spine', 'file-name-spine');
            updateFileName('file-cover-back', 'file-name-cover-back');
        } else {
            singleUploadSection.classList.remove('hidden');
            setupDropZone('file-single');
            updateFileName('file-single', 'file-name-single');
        }

        validateForm();

    } catch (err) {
        console.error('Init Error:', err);
        let msg = 'An error occurred while loading the page. Please try again.';
        if (err.message.includes('expired')) msg = 'This link has expired.';
        if (err.message.includes('Invalid')) msg = 'Invalid guest link.';
        showError(msg);
    }
}


// --- Upload Handler ---
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Disable inputs
    submitButton.disabled = true;
    submitButton.textContent = 'Uploading...';
    uploadProgress.classList.remove('hidden');

    const filesToUpload = [];

    if (projectType === 'single') {
        if (selectedFiles['file-single']) {
            filesToUpload.push({ file: selectedFiles['file-single'], type: 'main' });
        }
    } else {
        if (selectedFiles['file-interior']) filesToUpload.push({ file: selectedFiles['file-interior'], type: 'interior' });
        if (selectedFiles['file-cover-front']) filesToUpload.push({ file: selectedFiles['file-cover-front'], type: 'cover_front' });
        if (selectedFiles['file-spine']) filesToUpload.push({ file: selectedFiles['file-spine'], type: 'cover_spine' });
        if (selectedFiles['file-cover-back']) filesToUpload.push({ file: selectedFiles['file-cover-back'], type: 'cover_back' });
    }

    if (filesToUpload.length === 0) return;

    let completed = 0;
    const total = filesToUpload.length;
    const uploadedPaths = [];

    try {
        for (const item of filesToUpload) {
            const file = item.file;
            const timestamp = Date.now();
            const ext = file.name.split('.').pop();

            // Naming convention: proofs/{projectId}/{timestamp}_{type}.{ext}
            // IMPORTANT: Must match storage rules (e.g., proofs/{projectId}/...)
            // The user might be restricted to 'uploads/' or 'proofs/' depending on rules.
            // My read of storage.rules showed:
            // match /proofs/{projectId}/{allPaths=**} { allow read, write: if canAccessProjectFiles... || hasGuestUploadAccess... }
            // So 'proofs/' is correct.

            const storagePath = `proofs/${projectId}/${timestamp}_${item.type}.${ext}`;
            const storageRef = ref(storage, storagePath);

            progressText.textContent = `Uploading ${file.name}...`;

            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        // Calculate individual progress, but we'll show overall steps
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });

            uploadedPaths.push(storagePath);
            completed++;
            const percent = (completed / total) * 100;
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }

        // Call Backend to Finalize
        progressText.textContent = 'Finalizing...';
        const submitGuestUpload = httpsCallable(functions, 'submitGuestUpload');
        await submitGuestUpload({ projectId: projectId });

        // Show Success
        uploadContainer.classList.add('hidden');
        successState.classList.remove('hidden');

    } catch (err) {
        console.error("Upload failed:", err);
        alert("Upload failed: " + err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Start Upload';
        uploadProgress.classList.add('hidden');
    }
});

// Initialize
init();
