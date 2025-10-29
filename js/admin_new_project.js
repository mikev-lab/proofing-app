import { auth, db, storage, functions, generatePreviews, generateFinalPdf } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDocs, Timestamp, updateDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
const guidedTab = document.getElementById('guided-tab');
const quickTab = document.getElementById('quick-tab');
const guidedPanel = document.getElementById('guided-panel');
const quickPanel = document.getElementById('quick-panel');
const guidedFileInput = document.getElementById('guided-file-input');
const uploadStatusArea = document.getElementById('upload-status-area');
const thumbnailOrganizer = document.getElementById('thumbnail-organizer');


async function addPagesToOrganizer(pages) {
    // Clear the placeholder text if it's the first successful upload
    if (thumbnailOrganizer.querySelector('p')) {
        thumbnailOrganizer.innerHTML = '';
    }

    for (const page of pages) {
        try {
            const thumbnailUrl = await getDownloadURL(ref(storage, page.thumbnailPath));
            const pageElement = document.createElement('div');
            pageElement.className = 'bg-slate-800 p-2 rounded-md flex items-center space-x-2';
            pageElement.dataset.pageId = page.pageId; // Store pageId for ordering

            const img = document.createElement('img');
            img.src = thumbnailUrl;
            img.className = 'w-16 h-16 object-contain rounded-sm';

            const pageNumber = document.createElement('span');
            pageNumber.textContent = `Page ${page.pageNumber}`;
            pageNumber.className = 'text-xs text-gray-400';

            pageElement.appendChild(img);
            pageElement.appendChild(pageNumber);
            thumbnailOrganizer.appendChild(pageElement);
        } catch (error) {
            console.error(`Error getting thumbnail for page ${page.pageId}:`, error);
        }
    }
}


guidedFileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    // Clear previous statuses
    uploadStatusArea.innerHTML = '';

    for (const file of files) {
        const statusElement = document.createElement('div');
        statusElement.className = 'flex justify-between items-center bg-slate-700 p-2 rounded-md text-sm';
        statusElement.innerHTML = `<span>${file.name}</span><span class="status-indicator text-yellow-400">Uploading...</span>`;
        uploadStatusArea.appendChild(statusElement);

        const statusIndicator = statusElement.querySelector('.status-indicator');

        try {
            // 1. Upload the file to a temporary location
            const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const uploadPath = `uploads/${tempId}/${file.name}`;
            const storageRef = ref(storage, uploadPath);
            await uploadBytes(storageRef, file);

            statusIndicator.textContent = 'Processing...';
            statusIndicator.classList.remove('text-yellow-400');
            statusIndicator.classList.add('text-blue-400');

            // 2. Call the generatePreviews Cloud Function
            const result = await generatePreviews({ filePath: uploadPath, originalName: file.name });
            const { pages } = result.data;

            // 3. Add thumbnails to the organizer
            if (pages && pages.length > 0) {
                await addPagesToOrganizer(pages);
                statusIndicator.textContent = 'Complete';
                statusIndicator.classList.remove('text-blue-400');
                statusIndicator.classList.add('text-green-400');
            } else {
                throw new Error("No pages were generated from the file.");
            }

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            statusIndicator.textContent = 'Error';
            statusIndicator.classList.remove('text-yellow-400', 'text-blue-400');
            statusIndicator.classList.add('text-red-400');
        }
    }
});


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

guidedTab.addEventListener('click', () => {
    guidedTab.classList.add('border-indigo-500', 'text-indigo-400');
    guidedTab.classList.remove('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');

    quickTab.classList.add('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');
    quickTab.classList.remove('border-indigo-500', 'text-indigo-400');

    guidedPanel.classList.remove('hidden');
    quickPanel.classList.add('hidden');
});

quickTab.addEventListener('click', () => {
    quickTab.classList.add('border-indigo-500', 'text-indigo-400');
    quickTab.classList.remove('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');

    guidedTab.classList.add('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');
    guidedTab.classList.remove('border-indigo-500', 'text-indigo-400');

    quickPanel.classList.remove('hidden');
    guidedPanel.classList.add('hidden');
});

async function handleGuidedProjectCreation(client, projectName, specs) {
    // 1. Get page IDs
    const pageIds = Array.from(thumbnailOrganizer.children).map(child => child.dataset.pageId);

    if (pageIds.length === 0) {
        throw new Error("No pages have been processed. Please upload and process files first.");
    }

    // 2. Call generateFinalPdf
    const result = await generateFinalPdf({
        projectId: `new-project-${Date.now()}`, // Temporary ID
        pageIds: pageIds
    });
    const { finalPdfPath } = result.data;

    // 3. Get download URL
    const finalPdfRef = ref(storage, finalPdfPath);
    const downloadURL = await getDownloadURL(finalPdfRef);

    // 4. Create the project doc in Firestore
    const newProjectRef = collection(db, "projects");
    const projectDoc = await addDoc(newProjectRef, {
        projectName: projectName,
        companyId: client.companyId,
        clientId: client.id,
        specs,
        status: 'pending',
        createdAt: serverTimestamp(),
        systemVersion: 2,
        versions: [{
            versionNumber: 1,
            createdAt: serverTimestamp(),
            fileURL: downloadURL,
            filePath: finalPdfPath,
            fileName: 'Generated Proof.pdf'
        }]
    });

    // 5. Redirect
    statusMessage.textContent = 'Project created successfully! Redirecting...';
    statusMessage.className = 'mt-4 text-center text-green-400';
    setTimeout(() => {
        window.location.href = `admin_project.html?id=${projectDoc.id}`;
    }, 2000);
}

async function handleAdvancedProjectCreation(client, projectName, specs) {
    const file = document.getElementById('advanced-file-input').files[0];

    if (!file) {
        throw new Error("Please select a PDF file for quick upload.");
    }

    // Create project data *without* versions initially
    const projectData = {
        projectName: projectName,
        companyId: client.companyId,
        clientId: client.id,
        specs: specs,
        createdAt: serverTimestamp(),
        versions: [],
        status: 'pending',
        isAwaitingClientUpload: false,
        systemVersion: 2
    };

    // Create the project doc FIRST to get its ID
    const docRef = await addDoc(collection(db, "projects"), projectData);
    const projectId = docRef.id;

    // Now construct the storage path using the projectId
    const timestampedFileName = `${Date.now()}_${file.name}`;
    const storagePath = `proofs/${projectId}/${timestampedFileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadResult = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(uploadResult.ref);

    // Prepare the first version entry
    const firstVersion = {
        fileName: file.name,
        fileURL: downloadURL,
        filePath: storagePath,
        uploadedAt: serverTimestamp(),
        versionNumber: 1,
        processingStatus: 'processing'
    };

    // Update the project document with the first version
    await updateDoc(docRef, {
        versions: [firstVersion]
    });

    // Redirect
    statusMessage.textContent = 'Project created successfully! Redirecting...';
    statusMessage.className = 'mt-4 text-center text-green-400';
    setTimeout(() => {
        window.location.href = `admin_project.html?id=${docRef.id}`;
    }, 2000);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    submitButton.disabled = true;
    statusMessage.textContent = "Creating project, please wait...";
    statusMessage.classList.add('text-yellow-400');
    statusMessage.classList.remove('text-red-400', 'text-green-400');

    const projectName = newProjectForm.projectName.value;
    const companyId = newProjectForm.companyId.value;
    const selectedCompanyOption = companySelect.options[companySelect.selectedIndex];
    const client = { id: companyId, companyName: selectedCompanyOption.text, companyId: companyId };

    const bleedInchesValue = parseFloat(document.getElementById('bleedInches').value);
    const safetyInchesValue = parseFloat(document.getElementById('safetyInches').value);

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
        bleedInches: bleedInchesValue,
        safetyInches: safetyInchesValue
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

    const isGuidedFlow = !guidedPanel.classList.contains('hidden');

    try {
        if (isGuidedFlow) {
            await handleGuidedProjectCreation(client, projectName, specs);
        } else {
            await handleAdvancedProjectCreation(client, projectName, specs);
        }
    } catch (error) {
        console.error("Error creating project:", error);
        statusMessage.textContent = `Error creating project: ${error.message}`;
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

// Initialize SortableJS
new Sortable(thumbnailOrganizer, {
    animation: 150,
    ghostClass: 'bg-slate-700'
});
