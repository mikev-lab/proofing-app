import { auth, db, storage, functions, generatePreviews, generateFinalPdf } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDocs, Timestamp, updateDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import * as pdfjsLib from "https://mozilla.github.io/pdf.js/build/pdf.mjs";

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


// In js/admin_new_project.js

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://mozilla.github.io/pdf.js/build/pdf.worker.mjs";

// **Step 1: Copy this helper function into your file**
// (Copied from js/admin_project.js)
async function renderPdfOnCanvas(canvas, tempPreviewPath) {
    if (!tempPreviewPath || typeof tempPreviewPath !== 'string') {
        console.error(`Invalid tempPreviewPath provided to renderPdfOnCanvas:`, tempPreviewPath);
        const context = canvas.getContext('2d');
        canvas.width = 150;
        canvas.height = 200;
        context.fillStyle = '#475569';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f87171';
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.fillText('Invalid Path', canvas.width / 2, canvas.height / 2);
        return;
    }
    try {
        const pdfRef = ref(storage, tempPreviewPath);
        const downloadURL = await getDownloadURL(pdfRef);

        // Make sure pdfjsLib is imported at the top of your file
        // import { pdfjsLib } from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';
        const pdf = await pdfjsLib.getDocument(downloadURL).promise;
        const page = await pdf.getPage(1); // It's a single-page PDF

        const viewport = page.getViewport({ scale: 0.5 }); // Use a smaller scale for thumbnails
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (error) {
        console.error(`Error rendering PDF thumbnail for ${tempPreviewPath}:`, error);
        // ... (rest of error handling) ...
    }
}

// **Step 2: Replace your existing addPagesToOrganizer function with this one**
async function addPagesToOrganizer(pages) {
    if (thumbnailOrganizer.querySelector('p')) {
        thumbnailOrganizer.innerHTML = '';
        // Add grid styling now that we have items
        thumbnailOrganizer.classList.add('grid', 'grid-cols-4', 'sm:grid-cols-6', 'lg:grid-cols-8', 'gap-4');
    }

    for (const page of pages) {
        try {
            // *** FIX: Use page.tempSourcePath which exists ***
            const pageElement = document.createElement('div');
            pageElement.className = 'bg-slate-800 p-1 rounded-md cursor-move relative shadow-lg';
            pageElement.dataset.pageId = page.pageId;
            pageElement.dataset.tempSourcePath = page.tempSourcePath; // Store temp source path
            pageElement.dataset.tempPreviewPath = page.tempPreviewPath; // Store temp preview path
            pageElement.dataset.pageNumber = page.pageNumber;

            // *** FIX: Create a CANVAS, not an IMG ***
            const canvas = document.createElement('canvas');
            canvas.className = 'w-full h-auto rounded-sm pointer-events-none bg-white/10';
            pageElement.appendChild(canvas);

            const pageNumberSpan = document.createElement('span');
            pageNumberSpan.textContent = page.pageNumber;
            pageNumberSpan.className = 'absolute top-1 left-1 bg-slate-900/80 text-white text-xs px-1.5 py-0.5 rounded-full pointer-events-none';
            pageElement.appendChild(pageNumberSpan);

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '&times;';
            deleteButton.type = 'button';
            deleteButton.className = 'absolute top-0 right-0 text-red-400 hover:text-red-300 font-bold text-lg leading-none p-1 bg-slate-900/50 rounded-bl-md';
            deleteButton.onclick = () => {
                pageElement.remove();
                // If no thumbnails are left, show placeholder
                if (!thumbnailOrganizer.querySelector('div')) {
                     thumbnailOrganizer.innerHTML = '<p class="text-sm text-gray-500 text-center">Thumbnails of processed pages will appear here. You can drag and drop to reorder them.</p>';
                     thumbnailOrganizer.classList.remove('grid', 'grid-cols-4', 'sm:grid-cols-6', 'lg:grid-cols-8', 'gap-4');
                }
            };
            pageElement.appendChild(deleteButton);

            thumbnailOrganizer.appendChild(pageElement);

            // *** FIX: Call the render function ***
            // Asynchronously render the PDF onto the canvas
            renderPdfOnCanvas(canvas, page.tempPreviewPath);

        } catch (error) {
            console.error(`Error adding page ${page.pageId} to organizer:`, error);
        }
    }
}


guidedFileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    uploadStatusArea.innerHTML = ''; // Clear previous statuses

    // 1. Create an array of promises, one for each file upload/processing task.
    const processingPromises = Array.from(files).map(async (file) => {
        const statusElement = document.createElement('div');
        statusElement.className = 'flex justify-between items-center bg-slate-700 p-2 rounded-md text-sm';
        statusElement.innerHTML = `<span>${file.name}</span><span class="status-indicator text-yellow-400">Uploading...</span>`;
        uploadStatusArea.appendChild(statusElement);
        const statusIndicator = statusElement.querySelector('.status-indicator');

        try {
            // 1. Upload to a temporary, unique path (e.g., using user ID or a random ID)
            const tempId = auth.currentUser ? auth.currentUser.uid : `anon_${Date.now()}`;
            const uploadPath = `temp_uploads/${tempId}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, uploadPath);
            await uploadBytes(storageRef, file); // This upload happens concurrently

            statusIndicator.textContent = 'Processing...';
            statusIndicator.classList.remove('text-yellow-400');
            statusIndicator.classList.add('text-blue-400');

            // 2. Call generatePreviews concurrently
            const result = await generatePreviews({
                filePath: uploadPath,
                originalName: file.name
            });
            const pagesData = result.data.pages;

            // 3. Add thumbnails using data returned from the function
            if (pagesData && pagesData.length > 0) {
                // NOTE: addPagesToOrganizer is not async-safe for concurrent writes, 
                // but since it only appends, it should generally be safe unless DOM operations conflict.
                // We'll proceed, but keep in mind DOM manipulation in a loop can be slow.
                await addPagesToOrganizer(pagesData); 
                statusIndicator.textContent = 'Complete';
                statusIndicator.classList.remove('text-blue-400');
                statusIndicator.classList.add('text-green-400');
            } else {
                throw new Error("No pages were generated from the file.");
            }

        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            statusIndicator.textContent = `Error: ${error.message.substring(0, 50)}...`;
            statusIndicator.classList.remove('text-yellow-400', 'text-blue-400');
            statusIndicator.classList.add('text-red-400');
            // Return an object indicating failure so Promise.all can still resolve
            return { success: false, fileName: file.name, error: error }; 
        }
        // Return an object indicating success
        return { success: true, fileName: file.name };
    });

    // 2. Wait for all promises (all file processing tasks) to resolve.
    // This allows all files to be uploaded and processed simultaneously.
    await Promise.all(processingPromises); 

    // All files are processed (successfully or with errors)
    console.log('All file processing tasks have completed.');
    // Optionally re-enable upload button if needed
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
    statusMessage.textContent = "Organizing pages and creating project...";
    statusMessage.className = 'mt-4 text-center text-yellow-400';

    // 1. Get ordered list of TEMPORARY SOURCE PATHS from the UI dataset
    const pageElements = thumbnailOrganizer.querySelectorAll('[data-page-id]');
    const orderedTempSourcePaths = Array.from(pageElements).map(el => el.dataset.tempSourcePath);

    if (orderedTempSourcePaths.length === 0) {
        throw new Error("No pages have been processed or organized. Please upload files and ensure processing is complete.");
    }

    // 2. Create the project document FIRST to get its ID
    const projectData = {
        projectName: projectName,
        companyId: client.companyId,
        clientId: client.id, // Keep for backward compatibility if needed
        specs: specs,
        createdAt: serverTimestamp(),
        versions: [], // Initialize versions array
        status: 'pending', // Initial status
        isAwaitingClientUpload: false,
        systemVersion: 2 // Mark as created via guided flow
    };
    const newProjectRef = await addDoc(collection(db, "projects"), projectData);
    const projectId = newProjectRef.id; // Get the actual project ID

    // 3. Call generateFinalPdf (modified) to merge PDFs from TEMP paths and save to FINAL location
    statusMessage.textContent = "Generating final proof PDF...";
    const result = await generateFinalPdf({
        projectId: projectId,              // Pass the REAL projectId now
        tempSourcePath: orderedTempSourcePaths // Pass the temporary source paths
    });
    const { finalPdfPath } = result.data; // Function should return the FINAL path ('proofs/...')

    if (!finalPdfPath) {
        throw new Error("Cloud function failed to return the final PDF path.");
    }

    // 4. Get download URL for the FINAL PDF
    const finalPdfRef = ref(storage, finalPdfPath);
    const downloadURL = await getDownloadURL(finalPdfRef);

    // 5. Prepare the first version entry using the FINAL path/URL
    const firstVersion = {
        fileName: 'Generated Proof.pdf', // Or derive a name
        fileURL: downloadURL,
        filePath: finalPdfPath,
        uploadedAt: new Date(),
        versionNumber: 1,
        processingStatus: 'processing', // Trigger optimization and preflight
        preflightStatus: null,
        preflightResults: null
    };

    // 6. Update the project document with the first version
    await updateDoc(newProjectRef, {
        versions: [firstVersion]
    });

    // (Optional: You might want a Cloud Function triggered by project creation
    // or manually call another function here to clean up the temporary files
    // in `temp_uploads`, `temp_sources`, and `temp_previews` for this `tempId`)

    // 7. Redirect
    statusMessage.textContent = 'Project created successfully! Redirecting...';
    statusMessage.className = 'mt-4 text-center text-green-400';
    setTimeout(() => {
        window.location.href = `admin_project.html?id=${projectId}`;
    }, 2000);
}

async function handleAdvancedProjectCreation(client, projectName, specs) {
    const proofFile = document.getElementById('file-input').files[0];
    const coverFile = document.getElementById('cover-file-input').files[0];

    if (!proofFile) {
        throw new Error("Please select a main proof PDF file.");
    }

    // Create project data, including an empty cover object
    const projectData = {
        projectName: projectName,
        companyId: client.companyId,
        clientId: client.id,
        specs: specs,
        createdAt: serverTimestamp(),
        versions: [],
        cover: {}, // Initialize the cover object
        status: 'pending',
        isAwaitingClientUpload: false,
        systemVersion: 2
    };

    // Create the project doc FIRST to get its ID
    const docRef = await addDoc(collection(db, "projects"), projectData);
    const projectId = docRef.id;

    // --- Upload Main Proof File ---
    const proofTimestamp = Date.now();
    const proofFileName = `${proofTimestamp}_${proofFile.name}`;
    const proofStoragePath = `proofs/${projectId}/${proofFileName}`;
    const proofStorageRef = ref(storage, proofStoragePath);
    await uploadBytes(proofStorageRef, proofFile);
    const proofDownloadURL = await getDownloadURL(proofStorageRef);

    const firstVersion = {
        fileName: proofFile.name,
        fileURL: proofDownloadURL,
        filePath: proofStoragePath,
        uploadedAt: new Date(),
        versionNumber: 1,
        processingStatus: 'processing'
    };

    const updateData = {
        versions: [firstVersion]
    };

    // --- Upload Cover File (if it exists) ---
    if (coverFile) {
        const coverTimestamp = Date.now();
        const coverFileName = `${coverTimestamp}_cover_${coverFile.name}`;
        const coverStoragePath = `proofs/${projectId}/${coverFileName}`;
        const coverStorageRef = ref(storage, coverStoragePath);
        await uploadBytes(coverStorageRef, coverFile);

        // The cover data will be updated by the `optimizePdf` cloud function.
        // We just need to upload the file with the correct name.
        // No need to set the `cover` object fields here.
    }

    // Update the project document with the new version data
    await updateDoc(docRef, updateData);

    // Redirect
    statusMessage.textContent = 'Project created successfully! Redirecting...';
    statusMessage.className = 'mt-4 text-center text-green-400';
    setTimeout(() => {
        window.location.href = `admin_project.html?id=${projectId}`;
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
