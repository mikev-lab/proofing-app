import { auth, db, storage, generatePreviews, generateFinalPdf } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, onSnapshot, getDoc, updateDoc, Timestamp, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { initializeSharedViewer } from './viewer.js';
import { STANDARD_PAPER_SIZES } from './guides.js';
import { initializeImpositionUI } from './imposition-ui.js';

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
fileUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = fileInput.files;
    if (!files.length) {
        alert('Please select one or more files to upload.');
        return;
    }

    uploadButton.disabled = true;
    generatePdfButton.disabled = true;
    uploadStatusContainer.innerHTML = ''; // Clear previous statuses

    // Create status elements for each file
    const statusElements = Array.from(files).map(file => {
        const statusEl = document.createElement('div');
        statusEl.className = 'p-2 bg-slate-700/50 rounded-md text-sm flex justify-between items-center';
        statusEl.innerHTML = `
            <span class="truncate mr-2">${file.name}</span>
            <span class="font-medium text-gray-400">Waiting...</span>
        `;
        uploadStatusContainer.appendChild(statusEl);
        return statusEl;
    });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const statusEl = statusElements[i];
        const statusSpan = statusEl.querySelector('.font-medium');

        try {
            // 1. Upload file to temp location
            statusSpan.textContent = 'Uploading...';
            statusSpan.className = 'font-medium text-blue-400';
            const storagePath = `uploads/${projectId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file);

            // 2. Call Cloud Function to generate previews
            statusSpan.textContent = 'Processing...';
            statusSpan.className = 'font-medium text-yellow-400 animate-pulse';
            const result = await generatePreviews({
                projectId: projectId,
                originalFilePath: storagePath,
                originalFileName: file.name
            });

            // 3. Update UI with new pages
            // This function needs to be created in the next step.
            // For now, we assume it exists and works correctly.
            addPagesToThumbnailList(result.data);

            statusSpan.textContent = 'Complete';
            statusSpan.className = 'font-medium text-green-400';
            statusEl.classList.remove('animate-pulse');

        } catch (error) {
            console.error("Error processing file:", file.name, error);
            const errorMessage = error.message || 'An unknown error occurred.';
            statusSpan.textContent = `Error: ${errorMessage}`;
            statusSpan.className = 'font-medium text-red-400';
            statusEl.classList.remove('animate-pulse');
        }
    }

    // Re-enable buttons and clear input
    uploadButton.disabled = false;
    generatePdfButton.disabled = false;
    fileInput.value = ''; // Clear the file input
});

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
        const generateGuestLink = httpsCallable(functions, 'generateGuestLink');
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

// --- "Generate PDF" Button Logic ---
generatePdfButton.addEventListener('click', async () => {
    generatePdfButton.disabled = true;
    uploadButton.disabled = true;
    const originalButtonText = generatePdfButton.textContent;
    generatePdfButton.textContent = 'Generating...';

    try {
        // 1. Get ordered list of page IDs from the UI
        const thumbnailList = document.getElementById('thumbnail-list');
        const pageElements = thumbnailList.querySelectorAll('[data-page-id]');
        const pageIds = Array.from(pageElements).map(el => el.dataset.pageId);

        if (!pageIds.length) {
            throw new Error("No pages found. Please add source files before generating a PDF.");
        }

        // 2. Call Cloud Function
        const result = await generateFinalPdf({
            projectId: projectId,
            pageIds: pageIds
        });

        // 3. Get download URL for the final PDF
        const { finalPdfPath } = result.data;
        if (!finalPdfPath) {
            throw new Error("The cloud function did not return a valid file path.");
        }
        const pdfRef = ref(storage, finalPdfPath);
        const downloadURL = await getDownloadURL(pdfRef);

        // 4. Trigger download/opening in new tab
        window.open(downloadURL, '_blank');

    } catch (error) {
        console.error("Error generating final PDF:", error);
        alert(`An error occurred while generating the PDF: ${error.message}`);
    } finally {
        generatePdfButton.disabled = false;
        uploadButton.disabled = false;
        generatePdfButton.textContent = originalButtonText;
    }
});
