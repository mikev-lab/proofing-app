import { auth, db, storage, generatePreviews, generateFinalPdf, generateGuestLink, firebaseConfig } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, getDoc, updateDoc, Timestamp, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { initializeSharedViewer } from './viewer.js';
import { STANDARD_PAPER_SIZES } from './guides.js';
import { initializeImpositionUI } from './imposition-ui.js';
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';
import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';

// Share Modal Elements
const shareButton = document.getElementById('share-button');
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
const guestLinksList = document.getElementById('guest-links-list');

const loadingSpinner = document.getElementById('loading-spinner');
const proofContent = document.getElementById('proof-content');
const projectDetailsAccordion = document.getElementById('project-details-accordion');
const projectNameHeader = document.getElementById('project-name-header');
const fileUploadForm = document.getElementById('file-upload-form');
const fileInput = document.getElementById('file-input');
const uploadButton = fileUploadForm.querySelector('button[type="submit"]');
const uploadStatusContainer = document.getElementById('upload-status-container');
const generatePdfButton = document.getElementById('generate-pdf-button');
const coverUploadForm = document.getElementById('cover-upload-form');
const coverFileInput = document.getElementById('cover-file-input');
const coverUploadButton = coverUploadForm.querySelector('button[type="submit"]');
const coverUploadStatusContainer = document.getElementById('cover-upload-status-container');

// Spec form elements
const specsForm = document.getElementById('specs-form');
const dimensionsSelect = document.getElementById('dimensions');
const customDimensionInputs = document.getElementById('custom-dimension-inputs');
const customWidthInput = document.getElementById('custom-width');
const customHeightInput = document.getElementById('custom-height');
const customUnitsSelect = document.getElementById('custom-units');
const bleedInchesInput = document.getElementById('bleedInches');
const safetyInchesInput = document.getElementById('safetyInches');
const pageCountInput = document.getElementById('page-count');
const bindingSelect = document.getElementById('binding');
const readingDirectionSelect = document.getElementById('readingDirection');
const paperTypeSelect = document.getElementById('paper-type');
const saveSpecsButton = document.getElementById('save-specs-button');
const specsStatusMessage = document.getElementById('specs-status-message');


const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');
let currentProjectData = null; // Store current project data globally for save function

// --- Populate Dimensions Select ---
function populateDimensionsSelect() {
    dimensionsSelect.innerHTML = ''; // Clear existing
    // Add grouped standard sizes
    const groupedSizes = {};
    for (const key in STANDARD_PAPER_SIZES) {
        const size = STANDARD_PAPER_SIZES[key];
        if (!groupedSizes[size.group]) {
            groupedSizes[size.group] = document.createElement('optgroup');
            groupedSizes[size.group].label = size.group;
        }
        const option = document.createElement('option');
        option.value = key;
        // Display name and dimensions
        const dimString = size.width_mm && size.height_mm
            ? ` (${size.width_mm} x ${size.height_mm} mm)` // Assuming mm for display, adjust if needed
            : '';
        option.textContent = `${size.name}${dimString}`;
        groupedSizes[size.group].appendChild(option);
    }
    // Append optgroups to select
    Object.values(groupedSizes).forEach(group => dimensionsSelect.appendChild(group));
    // Add Custom option at the end
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom';
    dimensionsSelect.appendChild(customOption);
}
populateDimensionsSelect(); // Call on page load

// --- Handle Dimension Select Change ---
dimensionsSelect.addEventListener('change', () => {
     customDimensionInputs.classList.toggle('hidden', dimensionsSelect.value !== 'custom');
     customWidthInput.required = dimensionsSelect.value === 'custom';
     customHeightInput.required = dimensionsSelect.value === 'custom';
});

// --- Populate Form from Data ---
function populateSpecsForm(specs) {
    if (!specs) return;

    // Dimensions
    if (typeof specs.dimensions === 'object' && specs.dimensions !== null) {
        dimensionsSelect.value = 'custom';
        customDimensionInputs.classList.remove('hidden');
        customWidthInput.value = specs.dimensions.width || '';
        customHeightInput.value = specs.dimensions.height || '';
        customUnitsSelect.value = specs.dimensions.units || 'in';
        customWidthInput.required = true;
        customHeightInput.required = true;
    } else if (typeof specs.dimensions === 'string') {
         if (dimensionsSelect.querySelector(`option[value="${specs.dimensions}"]`)) {
            dimensionsSelect.value = specs.dimensions;
         } else {
             // Handle legacy string format (e.g., "5x7") - Assume inches, set to custom
             dimensionsSelect.value = 'custom';
             const parts = specs.dimensions.split('x');
             if (parts.length === 2) {
                 customWidthInput.value = parseFloat(parts[0]) || '';
                 customHeightInput.value = parseFloat(parts[1]) || '';
             }
             customUnitsSelect.value = 'in'; // Assume inches
             customDimensionInputs.classList.remove('hidden');
             customWidthInput.required = true;
             customHeightInput.required = true;
         }
    } else {
         dimensionsSelect.value = 'US_Letter'; // Default if missing/invalid
         customDimensionInputs.classList.add('hidden');
         customWidthInput.required = false;
         customHeightInput.required = false;
    }

    bleedInchesInput.value = specs.bleedInches ?? 0.125;
    safetyInchesInput.value = specs.safetyInches ?? 0.125;
    pageCountInput.value = specs.pageCount || '';
    bindingSelect.value = specs.binding || 'Perfect Bound';
    readingDirectionSelect.value = specs.readingDirection || 'ltr';
    paperTypeSelect.value = specs.paperType || 'Gloss';
}

// --- Save Spec Changes Handler ---
specsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSpecsButton.disabled = true;
    specsStatusMessage.textContent = 'Saving...';
    specsStatusMessage.className = 'mt-2 text-center text-sm text-yellow-400';

    try {
        const updatedSpecs = {
            pageCount: parseInt(pageCountInput.value, 10) || null,
            binding: bindingSelect.value,
            readingDirection: readingDirectionSelect.value,
            paperType: paperTypeSelect.value,
            bleedInches: parseFloat(bleedInchesInput.value) || 0,
            safetyInches: parseFloat(safetyInchesInput.value) || 0,
        };

        if (dimensionsSelect.value === 'custom') {
             const width = parseFloat(customWidthInput.value);
             const height = parseFloat(customHeightInput.value);
             if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
                 throw new Error('Please enter valid, positive numbers for custom width and height.');
             }
              // Basic check for safety margin vs custom dimensions
             if (customUnitsSelect.value === 'in' && (updatedSpecs.safetyInches * 2 >= width || updatedSpecs.safetyInches * 2 >= height)) {
                 throw new Error('Safety margin cannot be larger than half the page dimension.');
             } // Add similar check for mm if needed

             updatedSpecs.dimensions = {
                 width: width,
                 height: height,
                 units: customUnitsSelect.value
             };
        } else {
            updatedSpecs.dimensions = dimensionsSelect.value;
        }

         // Validate page count
         if (!updatedSpecs.pageCount || updatedSpecs.pageCount <= 0) {
             throw new Error('Please enter a valid, positive page count.');
         }

        // Update Firestore
        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, { specs: updatedSpecs });

        specsStatusMessage.textContent = 'Specifications saved successfully!';
        specsStatusMessage.className = 'mt-2 text-center text-sm text-green-400';

         // --- Trigger viewer update AFTER saving ---
         // Find the currently selected version to reload
        const currentVersionNum = parseInt(document.getElementById('version-selector')?.value, 10);
        if (!isNaN(currentVersionNum)) {
             // Temporarily update local data for immediate guide redraw
             if (currentProjectData) {
                 currentProjectData.specs = updatedSpecs;
                 initializeSharedViewer({ // Re-initialize with updated specs
                     db,
                     auth,
                     projectId,
                     projectData: currentProjectData, // Pass updated data
                     isAdmin: true
                 });
                 // Reloading the same version should now re-render with new guides
                 // loadProofByVersion(currentVersionNum); // You might not need this if initializeSharedViewer handles it
             }
        }
        // --- End trigger viewer update ---


    } catch (error) {
        console.error("Error saving specifications:", error);
        specsStatusMessage.textContent = `Error: ${error.message || 'Could not save.'}`;
        specsStatusMessage.className = 'mt-2 text-center text-sm text-red-400';
    } finally {
        saveSpecsButton.disabled = false;
        // Clear status message after a few seconds
         setTimeout(() => { specsStatusMessage.textContent = ''; }, 4000);
    }
});


// --- Firestore Listener ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        if (projectId) {
            const projectRef = doc(db, "projects", projectId);
            onSnapshot(projectRef, async (docSnap) => {
                if (docSnap.exists()) {
                    currentProjectData = docSnap.data(); // Store data globally
                    projectNameHeader.textContent = currentProjectData.projectName;
                    document.getElementById('project-name').textContent = currentProjectData.projectName;

                    if (currentProjectData.companyId) {
                        const companySnap = await getDoc(doc(db, "companies", currentProjectData.companyId));
                        if (companySnap.exists()) {
                            document.getElementById('company-name').textContent = companySnap.data().companyName;
                        }
                    }

                    // Populate the specs form
                    populateSpecsForm(currentProjectData.specs);

                    // --- Real-time Update Logic ---
                    // Check which version is currently selected in the dropdown
                    const versionSelector = document.getElementById('version-selector');
                    const selectedVersion = versionSelector ? parseInt(versionSelector.value, 10) : null;

                    // Re-initialize the viewer. The logic inside viewer.js will now handle
                    // the different processing states based on the fresh `currentProjectData`.
                    // This ensures that if the status of the *currently viewed* version
                    // changes (e.g., from 'processing' to 'complete'), the view will auto-update.
                    initializeSharedViewer({
                        db,
                        auth,
                        projectId,
                        projectData: currentProjectData,
                        isAdmin: true
                    });

                    initializeImpositionUI({ projectData: currentProjectData, db });

                    // After initialization, ensure the dropdown reflects the correct version if it exists.
                    // The viewer's internal logic selects the latest, but we might need to respect the dropdown.
                    if (versionSelector && selectedVersion) {
                        // Find if the selected version still exists in the new data
                        const versionExists = currentProjectData.versions.some(v => v.version === selectedVersion);
                        if (versionExists) {
                             versionSelector.value = selectedVersion;
                        }
                    }

                    // Disable upload forms if project is approved
                    if (currentProjectData.status === 'Approved' || currentProjectData.status === 'In Production') {
                        uploadButton.disabled = true;
                        coverUploadButton.disabled = true;
                        fileInput.disabled = true;
                        coverFileInput.disabled = true;
                        uploadButton.textContent = 'Project Approved';
                        coverUploadButton.textContent = 'Project Approved';
                    }

                    // --- End Real-time Update Logic ---

                    loadingSpinner.classList.add('hidden');
                    proofContent.classList.remove('hidden');
                    projectDetailsAccordion.classList.remove('hidden');
                } else {
                     loadingSpinner.innerHTML = '<p class="text-red-400">Error: Project not found.</p>';
                }
            });
        } else {
             loadingSpinner.innerHTML = '<p class="text-red-400">Error: No Project ID provided.</p>';
        }
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('logout-button').addEventListener('click', () => {
    signOut(auth);
    window.location.href = 'index.html';
});

// Notification Bell Logic
const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');

notificationBell.addEventListener('click', () => {
    notificationPanel.classList.toggle('hidden');
});

// Close notification panel if clicked outside
document.addEventListener('click', (event) => {
    if (!notificationBell.contains(event.target) && !notificationPanel.contains(event.target)) {
        notificationPanel.classList.add('hidden');
    }
});

// --- File Upload Logic ---
fileUploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleExpertUpload(fileInput.files[0], uploadStatusContainer, uploadButton, false);
});

coverUploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleExpertUpload(coverFileInput.files[0], coverUploadStatusContainer, coverUploadButton, true);
});

async function handleExpertUpload(file, statusContainer, button, isCover) {
    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    button.disabled = true;
    statusContainer.innerHTML = ''; // Clear previous status

    const statusEl = document.createElement('div');
    statusEl.className = 'p-2 bg-slate-700/50 rounded-md text-sm flex justify-between items-center';
    statusEl.innerHTML = `
        <span class="truncate mr-2">${file.name}</span>
        <span class="font-medium text-blue-400">Uploading...</span>
    `;
    statusContainer.appendChild(statusEl);
    const statusSpan = statusEl.querySelector('.font-medium');

    try {
        const timestamp = Date.now();
        const fileName = isCover ? `${timestamp}_cover_${file.name}` : `${timestamp}_${file.name}`;
        const storagePath = `proofs/${projectId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file);

        statusSpan.textContent = 'Processing...';
        statusSpan.className = 'font-medium text-yellow-400 animate-pulse';

        // The onObjectFinalized function will take over from here.
        // We can just wait for the Firestore onSnapshot listener to update the UI.
        // For a better user experience, we could poll the document, but for now, this is sufficient.
        setTimeout(() => {
             statusSpan.textContent = 'Upload complete. Processing may take a few minutes.';
             statusSpan.className = 'font-medium text-green-400';
             button.disabled = false;
        }, 3000);


    } catch (error) {
        console.error("Error uploading file:", file.name, error);
        const errorMessage = error.message || 'An unknown error occurred.';
        statusSpan.textContent = `Error: ${errorMessage}`;
        statusSpan.className = 'font-medium text-red-400';
        button.disabled = false;
    }
}

// --- Helper function to render new pages ---
async function addPagesToThumbnailList(newPages) {
    const thumbnailList = document.getElementById('thumbnail-list');
    if (!thumbnailList) return;

    for (const page of newPages) {
        try {
            // Get download URL for the preview image
            const previewRef = ref(storage, page.previewPath);
            const downloadURL = await getDownloadURL(previewRef);

            // Create the thumbnail element
            const thumbElement = document.createElement('div');
            thumbElement.className = "relative group bg-slate-800 rounded-md overflow-hidden shadow-lg border-2 border-transparent hover:border-blue-500 transition-all duration-150 ease-in-out cursor-pointer";
            thumbElement.dataset.pageId = page.id; // IMPORTANT

            thumbElement.innerHTML = `
                <img src="${downloadURL}" alt="Page ${page.pageNumber}" class="w-full h-auto object-cover" />
                <div class="absolute bottom-0 left-0 right-0 bg-black/50 p-1 text-center">
                    <span class="text-white text-xs font-semibold">Page ${page.pageNumber}</span>
                </div>
            `;

            thumbnailList.appendChild(thumbElement);
        } catch (error) {
            console.error(`Failed to load thumbnail for page ${page.pageNumber} (ID: ${page.id})`, error);
            const errorElement = document.createElement('div');
            errorElement.className = "relative group bg-slate-800 rounded-md overflow-hidden shadow-lg border-2 border-red-500";
            errorElement.dataset.pageId = page.id;
            errorElement.innerHTML = `
                <div class="p-4 text-center">
                    <p class="text-white text-xs font-semibold">Page ${page.pageNumber}</p>
                    <p class="text-red-400 text-xs mt-1">Error loading preview</p>
                </div>
            `;
            thumbnailList.appendChild(errorElement);
        }
    }
}

// --- Share Link Logic ---
function openShareModal() {
    shareModal.classList.remove('hidden');
    shareModalContent.classList.remove('hidden');
    shareModalResult.classList.add('hidden');
    shareLinkForm.reset(); // Reset form fields
    generateLinkButton.disabled = false;
    copyStatusMessage.textContent = '';
}

function closeShareModal() {
    shareModal.classList.add('hidden');
}

shareButton.addEventListener('click', openShareModal);
shareModalCloseButton.addEventListener('click', closeShareModal);
shareModalCancelButton.addEventListener('click', closeShareModal);

shareLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    generateLinkButton.disabled = true;
    generateLinkButton.textContent = 'Generating...';

    const permissions = {
        canApprove: document.getElementById('permission-approve').checked,
        canAnnotate: document.getElementById('permission-annotate').checked,
        canSeeComments: document.getElementById('permission-see-comments').checked
    };

    try {
        // DELETE or COMMENT OUT this line causing the error:
        // const generateGuestLink = httpsCallable(functions, 'generateGuestLink'); 

        // Call the imported function directly
        const result = await generateGuestLink({ projectId, permissions });

        if (result.data.success) {
            const fullUrl = new URL(result.data.url);
            // Use relative path for the generated URL to work on any environment
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

// --- Render Guest Links List ---
function renderGuestLinks(links) {
    guestLinksList.innerHTML = '';
    if (links.length === 0) {
        guestLinksList.innerHTML = '<p class="text-sm text-gray-500">No links generated yet.</p>';
        return;
    }

    links.forEach(link => {
        const createdAt = link.createdAt ? link.createdAt.toDate().toLocaleDateString() : 'N/A';
        const expiresAt = link.expiresAt ? link.expiresAt.toDate().toLocaleDateString() : 'N/A';
        const viewCount = link.viewHistory?.length || 0;

        const linkEl = document.createElement('div');
        linkEl.className = 'p-2 bg-slate-700/50 rounded-md text-xs';
        linkEl.innerHTML = `
            <p class="font-mono text-purple-300 break-all">...${link.id.slice(-12)}</p>
            <p class="text-gray-400">Created: ${createdAt} | Expires: ${expiresAt}</p>
            <p class="text-gray-400">Views: ${viewCount}</p>
        `;
        guestLinksList.appendChild(linkEl);
    });
}

// --- Firestore Listener for Guest Links ---
if (projectId) {
    const guestLinksQuery = query(collection(db, "projects", projectId, "guestLinks"), orderBy("createdAt", "desc"));
    onSnapshot(guestLinksQuery, (snapshot) => {
        const links = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGuestLinks(links);
    });
}

// --- Approve Button Logic ---
const approveButton = document.getElementById('approve-button');
approveButton.addEventListener('click', async () => {
    if (!projectId) return;
    if (confirm('Are you sure you want to mark this project as approved?')) {
        approveButton.disabled = true;
        approveButton.textContent = 'Approving...';
        try {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, { status: 'Approved' });
            // The onSnapshot listener will handle the UI update.
            alert('Project marked as approved.');
        } catch (error) {
            console.error("Error approving project:", error);
            alert('Could not approve the project. Please try again.');
        } finally {
            approveButton.disabled = false;
            approveButton.textContent = 'Mark as Approved';
        }
    }
});

// Accordion Logic
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const icon = header.querySelector('svg');

        if (content.style.maxHeight) {
            content.style.maxHeight = null;
            icon.classList.remove('rotate-180');
        } else {
            content.style.maxHeight = content.scrollHeight + "px";
            icon.classList.add('rotate-180');
        }
    });
});

// --- "Finalize Guided Upload" Button Logic ---
document.getElementById('finalize-guided-upload-button').addEventListener('click', async () => {
    const finalizeButton = document.getElementById('finalize-guided-upload-button');
    finalizeButton.disabled = true;
    const originalButtonText = finalizeButton.textContent;
    finalizeButton.textContent = 'Finalizing...';

    try {
        // 1. Get ordered list of temp storage paths from the UI
        const organizer = document.getElementById('thumbnail-organizer');
        const pageElements = organizer.querySelectorAll('[data-temp-storage-path]');
        const tempStoragePaths = Array.from(pageElements).map(el => el.dataset.tempStoragePath);

        if (!tempStoragePaths.length) {
            throw new Error("No pages have been processed. Please upload a file first.");
        }

        // 2. Call Cloud Function to merge PDFs
        const result = await generateFinalPdf({
            projectId: projectId,
            tempStoragePaths: tempStoragePaths
        });

        const { finalPdfPath } = result.data;
        if (!finalPdfPath) {
            throw new Error("The cloud function did not return a valid file path.");
        }

        // 3. Update the project document with the new version
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);
        const projectData = projectDoc.data();
        const newVersionNumber = projectData.versions.length + 1;

        const newVersion = {
            versionNumber: newVersionNumber,
            fileURL: `gs://${firebaseConfig.storageBucket}/${finalPdfPath}`, // Store the GS URI
            createdAt: Timestamp.now(),
            processingStatus: 'complete', // It's already processed
            preflightStatus: 'pending' // Preflight will run on this new file
        };

        const updatedVersions = [...projectData.versions, newVersion];
        await updateDoc(projectRef, { versions: updatedVersions });

        alert(`Successfully created Version ${newVersionNumber}!`);

        // Reset the guided setup UI
        document.getElementById('upload-status-area').innerHTML = '';
        document.getElementById('thumbnail-organizer').innerHTML = '<p class="text-sm text-gray-500 text-center">Thumbnails of processed pages will appear here. You can drag and drop to reorder them.</p>';
        document.getElementById('thumbnail-organizer').classList.remove('grid', 'grid-cols-4', 'gap-4');


    } catch (error) {
        console.error("Error finalizing guided upload:", error);
        alert(`An error occurred: ${error.message}`);
    } finally {
        finalizeButton.disabled = false;
        finalizeButton.textContent = originalButtonText;
    }
});

// --- NEW Guided Setup Logic ---
function initializeGuidedSetup() {
    const guidedTab = document.getElementById('guided-tab');
    const quickTab = document.getElementById('quick-tab');
    const guidedPanel = document.getElementById('guided-panel');
    const quickPanel = document.getElementById('quick-panel');
    const dropZone = document.getElementById('drop-zone');
    const guidedFileInput = document.getElementById('guided-file-input');
    const uploadStatusArea = document.getElementById('upload-status-area');
    let processedPages = []; // To store processed page data from the backend

    if (!guidedTab) return; // Exit if the elements aren't on the page

    // Tab switching logic
    guidedTab.addEventListener('click', () => {
        guidedTab.classList.add('border-indigo-500', 'text-indigo-400');
        guidedTab.classList.remove('border-transparent', 'text-gray-400');
        quickTab.classList.add('border-transparent', 'text-gray-400');
        quickTab.classList.remove('border-indigo-500', 'text-indigo-400');
        guidedPanel.classList.remove('hidden');
        quickPanel.classList.add('hidden');
    });

    quickTab.addEventListener('click', () => {
        quickTab.classList.add('border-indigo-500', 'text-indigo-400');
        quickTab.classList.remove('border-transparent', 'text-gray-400');
        guidedTab.classList.add('border-transparent', 'text-gray-400');
        guidedTab.classList.remove('border-indigo-500', 'text-indigo-400');
        quickPanel.classList.remove('hidden');
        guidedPanel.classList.add('hidden');
    });

    // Drag and drop event listeners
    dropZone.addEventListener('click', () => guidedFileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleGuidedUpload(files[0]); // Handle the first dropped file
        }
    });
    guidedFileInput.addEventListener('change', () => {
        if (guidedFileInput.files.length > 0) {
            handleGuidedUpload(guidedFileInput.files[0]);
        }
    });

    async function handleGuidedUpload(file) {
        uploadStatusArea.innerHTML = '';
        processedPages = [];

        const statusId = `status-${Date.now()}`;
        const statusElement = document.createElement('div');
        statusElement.className = 'flex justify-between items-center bg-slate-700 p-2 rounded-md text-sm';
        statusElement.innerHTML = `
            <span>${file.name}</span>
            <span id="${statusId}" class="status-indicator text-blue-400">Uploading...</span>
        `;
        uploadStatusArea.appendChild(statusElement);

        try {
            const result = await uploadAndProcessFile(file, statusId);
            processedPages = result;
            displayPageThumbnails(processedPages); // Display the thumbnails
        } catch (error) {
            console.error('Guided upload failed:', error);
            const statusIndicator = document.getElementById(statusId);
            if(statusIndicator) {
                statusIndicator.textContent = `Error: ${error.message}`;
                statusIndicator.classList.remove('text-blue-400');
                statusIndicator.classList.add('text-red-400');
            }
        }
    }
}

// Initial call
document.addEventListener('DOMContentLoaded', () => {
    // Set the workerSrc for PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.mjs`;
    initializeGuidedSetup();
});

function displayPageThumbnails(pages) {
    const organizer = document.getElementById('thumbnail-organizer');
    organizer.innerHTML = ''; // Clear placeholder text or previous thumbnails
    organizer.classList.add('grid', 'grid-cols-4', 'gap-4'); // Add grid styling

    pages.forEach(page => {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'bg-slate-800 p-1 rounded-md cursor-pointer relative';
        thumbContainer.dataset.pageId = page.pageId;
        thumbContainer.dataset.tempStoragePath = page.tempStoragePath; // Store path for final assembly

        const canvas = document.createElement('canvas');
        canvas.className = 'w-full h-auto rounded-sm';
        thumbContainer.appendChild(canvas);

        const pageNumLabel = document.createElement('span');
        pageNumLabel.className = 'absolute top-1 left-1 bg-slate-900/80 text-white text-xs px-1.5 py-0.5 rounded-full';
        pageNumLabel.textContent = page.pageNumber;
        thumbContainer.appendChild(pageNumLabel);

        organizer.appendChild(thumbContainer);

        // Asynchronously render the PDF thumbnail
        renderPdfOnCanvas(canvas, page.tempStoragePath);
    });

    // Initialize SortableJS
    new Sortable(organizer, {
        animation: 150,
        ghostClass: 'bg-blue-200/30'
    });
}

async function renderPdfOnCanvas(canvas, pdfStoragePath) {
    // Safeguard against invalid or missing paths
    if (!pdfStoragePath || typeof pdfStoragePath !== 'string') {
        console.error(`Invalid pdfStoragePath provided to renderPdfOnCanvas:`, pdfStoragePath);
        const context = canvas.getContext('2d');
        canvas.width = 150; // Default thumbnail width
        canvas.height = 200; // Default thumbnail height
        context.fillStyle = '#475569'; // slate-600
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f87171'; // red-400
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.fillText('Invalid Path', canvas.width / 2, canvas.height / 2);
        return;
    }
    try {
        // Convert the storage path to a downloadable URL
        const pdfRef = ref(storage, pdfStoragePath);
        const downloadURL = await getDownloadURL(pdfRef);

        const pdf = await pdfjsLib.getDocument(downloadURL).promise;
        const page = await pdf.getPage(1); // It's a single-page PDF

        const viewport = page.getViewport({ scale: 0.5 }); // Use a smaller scale for thumbnails
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (error) {
        console.error(`Error rendering PDF thumbnail for ${pdfStoragePath}:`, error);
        const context = canvas.getContext('2d');
        context.fillStyle = '#475569';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f87171';
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.fillText('Render Failed', canvas.width / 2, canvas.height / 2);
    }
}


async function uploadAndProcessFile(file, statusId) {
    const statusIndicator = document.getElementById(statusId);
    try {
        // 1. Upload file to a temporary location
        statusIndicator.textContent = 'Uploading...';
        statusIndicator.className = 'status-indicator text-blue-400';
        // Use a unique temporary folder for each upload session
        const tempId = `temp_${auth.currentUser.uid}_${Date.now()}`;
        const tempStoragePath = `${tempId}/${file.name}`;
        const tempStorageRef = ref(storage, tempStoragePath);
        await uploadBytes(tempStorageRef, file);

        // 2. Call the Cloud Function to process the file
        statusIndicator.textContent = 'Processing...';
        statusIndicator.className = 'status-indicator text-yellow-400 animate-pulse';
        const result = await generatePreviews({
            filePath: tempStoragePath,
            originalName: file.name
        });

        statusIndicator.textContent = 'Complete';
        statusIndicator.className = 'status-indicator text-green-400';

        // Return the array of page data from the function
        return result.data.pages;

    } catch (error) {
        console.error("Error during file upload and processing:", error);
        const errorMessage = error.details?.message || error.message || 'An unknown error occurred.';
        statusIndicator.textContent = `Error: ${errorMessage}`;
        statusIndicator.className = 'status-indicator text-red-400';
        throw new Error(errorMessage);
    }
}
