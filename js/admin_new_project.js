import { auth, db, storage } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDocs, Timestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const newProjectForm = document.getElementById('new-project-form');
const submitButton = document.getElementById('submit-button');
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');
const statusMessage = document.getElementById('status-message');
const companySelect = document.getElementById('companyId');
const dimensionsSelect = document.getElementById('dimensions');
const customDimensionInputs = document.getElementById('custom-dimension-inputs');
const customWidthInput = document.getElementById('custom-width');
const customHeightInput = document.getElementById('custom-height');
const requestFileCheckbox = document.getElementById('request-file-checkbox');
const fileInput = document.getElementById('file-input');

function fetchNotifications() {
    // Placeholder function for fetching notifications
    console.log("Fetching notifications...");
}

// Populate companies dropdown
async function loadCompanies() {
    try {
        const querySnapshot = await getDocs(collection(db, "companies"));
        companySelect.innerHTML = '<option value="">Select a company</option>';
        querySnapshot.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().companyName;
            companySelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading companies:", error);
        companySelect.innerHTML = '<option value="">Could not load companies</option>';
    }
}

// Event Listeners
dimensionsSelect.addEventListener('change', () => {
    if (dimensionsSelect.value === 'custom') {
        customDimensionInputs.classList.remove('hidden');
        customWidthInput.required = true;
        customHeightInput.required = true;
    } else {
        customDimensionInputs.classList.add('hidden');
        customWidthInput.required = false;
        customHeightInput.required = false;
    }
});

requestFileCheckbox.addEventListener('change', () => {
    fileInput.disabled = requestFileCheckbox.checked;
    fileInput.required = !requestFileCheckbox.checked;
});

async function handleFormSubmit(e) {
    e.preventDefault();
    submitButton.disabled = true;
    statusMessage.textContent = "Creating project, please wait...";
    statusMessage.classList.add('text-yellow-400');
    statusMessage.classList.remove('text-red-400', 'text-green-400'); // Reset color

    const projectName = newProjectForm.projectName.value;
    const companyId = newProjectForm.companyId.value;
    const file = fileInput.files[0];
    const isAwaitingUpload = requestFileCheckbox.checked;

    // Get bleed and safety values
    const bleedInchesValue = parseFloat(document.getElementById('bleedInches').value);
    const safetyInchesValue = parseFloat(document.getElementById('safetyInches').value);

    // Basic validation for bleed/safety
    if (isNaN(bleedInchesValue) || bleedInchesValue < 0 || isNaN(safetyInchesValue) || safetyInchesValue < 0) {
         statusMessage.textContent = 'Please enter valid, non-negative numbers for bleed and safety margins.';
         statusMessage.className = 'mt-4 text-center text-red-400';
         submitButton.disabled = false;
         return;
    }


    const specs = {
        pageCount: parseInt(newProjectForm['page-count'].value, 10),
        binding: newProjectForm.binding.value,
        readingDirection: newProjectForm.readingDirection.value,
        paperType: newProjectForm['paper-type'].value,
        bleedInches: bleedInchesValue, // Add bleed
        safetyInches: safetyInchesValue // Add safety
    };

    if (dimensionsSelect.value === 'custom') {
        const width = parseFloat(customWidthInput.value);
        const height = parseFloat(customHeightInput.value);
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            statusMessage.textContent = 'Please enter valid, positive numbers for width and height.';
            statusMessage.className = 'mt-4 text-center text-red-400';
            submitButton.disabled = false;
            return;
        }
        specs.dimensions = {
            width: width,
            height: height,
            units: document.getElementById('custom-units').value
        };
    } else {
        specs.dimensions = dimensionsSelect.value;
    }

    if (!isAwaitingUpload && !file) {
        statusMessage.textContent = 'Please select a file to upload or request one from the client.';
        statusMessage.className = 'mt-4 text-center text-red-400';
        submitButton.disabled = false;
        return;
    }
     // Additional check: Ensure safety margin isn't too large for custom dimensions
     if (specs.dimensions.units && specs.dimensions.units === 'in') {
        if (specs.safetyInches * 2 >= specs.dimensions.width || specs.safetyInches * 2 >= specs.dimensions.height) {
            statusMessage.textContent = 'Safety margin cannot be larger than half the page dimension.';
            statusMessage.className = 'mt-4 text-center text-red-400';
            submitButton.disabled = false;
            return;
        }
     } // Add similar checks for mm if needed


    try {
        // Create project data *without* versions initially if uploading
        const projectData = {
            projectName,
            companyId,
            specs, // Now includes bleed and safety
            createdAt: Timestamp.now(),
            versions: [], // Start with empty versions
            status: 'active', // Default status
            deleteAt: null // Default deleteAt
            // isAwaitingClientUpload determined later
        };

        // Create the project doc FIRST to get its ID
        const docRef = await addDoc(collection(db, "projects"), projectData);
        const projectId = docRef.id; // Get the generated project ID

        if (!isAwaitingUpload && file) {
            // Now construct the storage path using the projectId
            const timestampedFileName = `${Date.now()}_${file.name}`;
            const storagePath = `proofs/${projectId}/${timestampedFileName}`; // This is the filePath
            const storageRef = ref(storage, storagePath);
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // Prepare the first version entry
            const firstVersion = {
                fileName: file.name, // Store original filename without timestamp
                fileURL: downloadURL,
                filePath: storagePath, // <-- Store storage path
                uploadedAt: Timestamp.now(),
                version: 1,
                processingStatus: 'processing'
            };

            // Update the project document with the first version and status
            await updateDoc(docRef, {
                versions: [firstVersion],
                status: 'pending',
                isAwaitingClientUpload: false
            });
        } else if (isAwaitingUpload) {
            // Update the project document status if awaiting upload
            await updateDoc(docRef, {
                 status: 'awaiting_upload',
                 isAwaitingClientUpload: true
            });
        }

        statusMessage.textContent = 'Project created successfully! Redirecting...';
        statusMessage.className = 'mt-4 text-center text-green-400';

        setTimeout(() => {
            window.location.href = `admin_project.html?id=${docRef.id}`;
        }, 2000);

    } catch (error) {
        console.error("Error creating project:", error);
        statusMessage.textContent = 'Error creating project. Please check console for details.';
        statusMessage.className = 'mt-4 text-center text-red-400';
        submitButton.disabled = false;
    }
}

newProjectForm.addEventListener('submit', handleFormSubmit);

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        loadCompanies();
        fetchNotifications();
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('logout-button').addEventListener('click', () => {
    signOut(auth);
    window.location.href = 'index.html';
});

notificationBell.addEventListener('click', () => {
    notificationPanel.classList.toggle('hidden');
});

// Hide panel if clicking outside
document.addEventListener('click', function(event) {
    if (!notificationBell.contains(event.target) && !notificationPanel.contains(event.target)) {
        notificationPanel.classList.add('hidden');
    }
});
