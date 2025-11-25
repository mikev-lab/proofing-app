import { auth, db, storage, functions, generatePreviews, generateFinalPdf, generateGuestLink, firebaseConfig } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { doc, onSnapshot, getDoc, updateDoc, Timestamp, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { initializeSharedViewer } from './viewer.js';
import { STANDARD_PAPER_SIZES } from './guides.js';
import { HARDCODED_PAPER_TYPES } from './guest_constants.js';
import { initializeImpositionUI } from './imposition-ui.js';
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';
import * as pdfjsLib from 'https://mozilla.github.io/pdf.js/build/pdf.mjs';

// Share Modal Elements
const headerShareButton = document.getElementById('header-share-button'); // This is the new one in the header
const guestBuilderButton = document.getElementById('guest-builder-button');
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
const sendProofButton = document.getElementById('send-proof-button');

const loadingSpinner = document.getElementById('loading-spinner');
const proofContent = document.getElementById('proof-content');
const projectNameHeader = document.getElementById('project-name-header');
const fileUploadForm = document.getElementById('file-upload-form');
const fileInput = document.getElementById('file-input');
const uploadButton = fileUploadForm.querySelector('button[type="submit"]');
const uploadStatusContainer = document.getElementById('upload-status-container');
const generatePdfButton = document.getElementById('generate-pdf-button');
const coverUploadForm = document.getElementById('cover-upload-form');
const coverFileInput = document.getElementById('cover-file-input');
const coverUploadButton = coverUploadForm ? coverUploadForm.querySelector('button[type="submit"]') : null;
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
const pageCountInput = document.getElementById('specs-page-count');
const bindingSelect = document.getElementById('binding');
const readingDirectionSelect = document.getElementById('readingDirection');
const paperTypeSelect = document.getElementById('paper-type');
const saveSpecsButton = document.getElementById('save-specs-button');
const specsStatusMessage = document.getElementById('specs-status-message');

let previousImpositionCount = -1;

// --- Selectors for Cover Specs ---
const coverSpecsForm = document.getElementById('cover-specs-form');
const coverWidthInput = document.getElementById('cover-width');
const coverHeightInput = document.getElementById('cover-height');
const coverUnitsSelect = document.getElementById('cover-units');
const saveCoverSpecsButton = document.getElementById('save-cover-specs-button');
const coverSpecsStatusMessage = document.getElementById('cover-specs-status-message');

const rerunPreflightButton = document.getElementById('rerun-preflight-button');

const permissionOwnerCheckbox = document.getElementById('permission-owner');
const permissionApproveCheckbox = document.getElementById('permission-approve');
const permissionAnnotateCheckbox = document.getElementById('permission-annotate');
const permissionSeeCommentsCheckbox = document.getElementById('permission-see-comments');

// --- Function to Populate Cover Form ---
function populateCoverForm(coverData) {
    if (coverData && coverData.specs && coverData.specs.dimensions) {
        coverWidthInput.value = coverData.specs.dimensions.width || '';
        coverHeightInput.value = coverData.specs.dimensions.height || '';
        coverUnitsSelect.value = coverData.specs.dimensions.units || 'in';
    } else {
        // Clear inputs if no data exists
        coverWidthInput.value = '';
        coverHeightInput.value = '';
        coverUnitsSelect.value = 'in';
    }
}

// [NEW] Listener for "Owner" checkbox to enforce defaults
if (permissionOwnerCheckbox) {
    permissionOwnerCheckbox.addEventListener('change', () => {
        if (permissionOwnerCheckbox.checked) {
            // If Owner is checked, force check the others and disable them
            permissionApproveCheckbox.checked = true;
            permissionApproveCheckbox.disabled = true;
            permissionApproveCheckbox.classList.add('opacity-50', 'cursor-not-allowed');

            permissionAnnotateCheckbox.checked = true;
            permissionAnnotateCheckbox.disabled = true;
            permissionAnnotateCheckbox.classList.add('opacity-50', 'cursor-not-allowed');

            permissionSeeCommentsCheckbox.checked = true;
            permissionSeeCommentsCheckbox.disabled = true;
            permissionSeeCommentsCheckbox.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            // If Owner is unchecked, re-enable the others
            permissionApproveCheckbox.disabled = false;
            permissionApproveCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');

            permissionAnnotateCheckbox.disabled = false;
            permissionAnnotateCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');

            permissionSeeCommentsCheckbox.disabled = false;
            permissionSeeCommentsCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

// --- Save Cover Specs Handler ---
if (coverSpecsForm) {
    coverSpecsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Basic Validation
        const width = parseFloat(coverWidthInput.value);
        const height = parseFloat(coverHeightInput.value);

        if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
            alert("Please enter valid positive numbers for width and height.");
            return;
        }

        saveCoverSpecsButton.disabled = true;
        saveCoverSpecsButton.textContent = 'Saving...';
        coverSpecsStatusMessage.textContent = '';

        try {
            // Construct the object expected by your logic
            const dimensionsObj = {
                width: width,
                height: height,
                units: coverUnitsSelect.value
            };

            const projectRef = doc(db, "projects", projectId);
            
            // Update specific dot-notation path to avoid overwriting other cover data
            await updateDoc(projectRef, {
                "cover.specs.dimensions": dimensionsObj
            });

            coverSpecsStatusMessage.textContent = 'Cover dimensions saved successfully.';
            coverSpecsStatusMessage.className = 'mt-2 text-center text-sm text-green-400';
        } catch (error) {
            console.error("Error saving cover specs:", error);
            coverSpecsStatusMessage.textContent = `Error: ${error.message}`;
            coverSpecsStatusMessage.className = 'mt-2 text-center text-sm text-red-400';
        } finally {
            saveCoverSpecsButton.disabled = false;
            saveCoverSpecsButton.textContent = 'Save Cover Dimensions';
            setTimeout(() => { coverSpecsStatusMessage.textContent = ''; }, 4000);
        }
    });
}

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');
let currentProjectData = null; // Store current project data globally for save function

const coverPaperTypeSelect = document.getElementById('cover-paper-type');

// --- Populate Paper Selects ---
function populatePaperSelects() {
    // Clear existing
    paperTypeSelect.innerHTML = '<option value="" disabled selected>Select Interior Paper</option>';
    coverPaperTypeSelect.innerHTML = '<option value="" disabled selected>Select Cover Paper</option>';
    
    // Add "None" option for Cover
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'None / Self-Cover';
    coverPaperTypeSelect.appendChild(noneOpt);

    // Populate from Constant
    HARDCODED_PAPER_TYPES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        
        paperTypeSelect.appendChild(opt.cloneNode(true));
        coverPaperTypeSelect.appendChild(opt);
    });
}
populatePaperSelects(); // Call immediately

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

// --- Helper: Find Standard Size ---
function findMatchingStandardSize(dims) {
    if (!dims || !dims.width || !dims.height) return null;

    // Convert to points for comparison (1 in = 72 pts, 1 mm = 2.83465 pts)
    const wPoints = dims.units === 'mm' ? dims.width * 2.83465 : dims.width * 72;
    const hPoints = dims.units === 'mm' ? dims.height * 2.83465 : dims.height * 72;
    const tolerance = 3; // ~1mm tolerance

    for (const [key, std] of Object.entries(STANDARD_PAPER_SIZES)) {
        const stdW = std.width_mm * 2.83465;
        const stdH = std.height_mm * 2.83465;

        // Exact Match (Portrait)
        if (Math.abs(wPoints - stdW) < tolerance && Math.abs(hPoints - stdH) < tolerance) return key;
        // Rotated Match (Landscape)
        if (Math.abs(wPoints - stdH) < tolerance && Math.abs(hPoints - stdW) < tolerance) return key;
    }
    return null;
}

// --- Populate Form from Data ---
function populateSpecsForm(projectData) {
    if (!projectData) return;
    const specs = projectData.specs || {};
    const guestState = projectData.guestBuilderState || {};

    // 1. Dimensions Logic
    if (typeof specs.dimensions === 'object' && specs.dimensions !== null) {
        const standardKey = findMatchingStandardSize(specs.dimensions);
        if (standardKey && dimensionsSelect.querySelector(`option[value="${standardKey}"]`)) {
            dimensionsSelect.value = standardKey;
            customDimensionInputs.classList.add('hidden');
            customWidthInput.required = false;
            customHeightInput.required = false;
        } else {
            dimensionsSelect.value = 'custom';
            customDimensionInputs.classList.remove('hidden');
            customWidthInput.value = specs.dimensions.width || '';
            customHeightInput.value = specs.dimensions.height || '';
            customUnitsSelect.value = specs.dimensions.units || 'in';
            customWidthInput.required = true;
            customHeightInput.required = true;
        }
    } else if (typeof specs.dimensions === 'string') {
         if (dimensionsSelect.querySelector(`option[value="${specs.dimensions}"]`)) {
            dimensionsSelect.value = specs.dimensions;
         } else {
             dimensionsSelect.value = 'custom';
             const parts = specs.dimensions.split('x');
             if (parts.length === 2) {
                 customWidthInput.value = parseFloat(parts[0]) || '';
                 customHeightInput.value = parseFloat(parts[1]) || '';
             }
             customUnitsSelect.value = 'in';
             customDimensionInputs.classList.remove('hidden');
         }
    } else {
         dimensionsSelect.value = 'US_Letter'; 
         customDimensionInputs.classList.add('hidden');
    }

    // 2. Page Count Logic
    let count = specs.pageCount;
    if ((!count || count === 0) && guestState.pages) {
        count = guestState.pages.length;
    }
    pageCountInput.value = count || '';

    // 3. Binding Logic
    let bindingVal = specs.binding || 'Perfect Bound';
    const bindingMap = {
        'perfectBound': 'Perfect Bound',
        'saddleStitch': 'Saddle-Stitch', 
        'loose': 'Coil Bound' 
    };
    if (bindingMap[bindingVal]) bindingVal = bindingMap[bindingVal];
    
    if (bindingSelect.querySelector(`option[value="${bindingVal}"]`)) {
        bindingSelect.value = bindingVal;
    } else if (bindingSelect.querySelector(`option[value="${bindingVal.replace('-', ' ')}"]`)) {
         bindingSelect.value = bindingVal.replace('-', ' ');
    }

    // 4. Paper Type Logic (Interior)
    // [FIX] Use the specific value passed from builder, or default to first option if not set
    if (specs.paperType) {
        paperTypeSelect.value = specs.paperType;
    }

    // 5. Cover Paper Logic
    // [FIX] Use the specific value passed from builder
    if (specs.coverPaperType) {
        coverPaperTypeSelect.value = specs.coverPaperType;
    } else {
        coverPaperTypeSelect.value = ""; // None
    }

    // Other Fields
    bleedInchesInput.value = specs.bleedInches ?? 0.125;
    safetyInchesInput.value = specs.safetyInches ?? 0.125;
    readingDirectionSelect.value = specs.readingDirection || 'ltr';
}

// --- Specs Form Submit Handler ---
// --- Save Spec Changes Handler ---
specsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveSpecsButton.disabled = true;
    specsStatusMessage.textContent = 'Saving...';
    
    try {
        const updatedSpecs = {
            pageCount: parseInt(pageCountInput.value, 10) || null,
            binding: bindingSelect.value,
            readingDirection: readingDirectionSelect.value,
            // [FIX] Read from new selects
            paperType: paperTypeSelect.value,
            coverPaperType: coverPaperTypeSelect.value || null, 
            bleedInches: parseFloat(bleedInchesInput.value) || 0,
            safetyInches: parseFloat(safetyInchesInput.value) || 0,
        };

        if (dimensionsSelect.value === 'custom') {
             const width = parseFloat(customWidthInput.value);
             const height = parseFloat(customHeightInput.value);
             if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) throw new Error('Invalid custom dimensions');
             updatedSpecs.dimensions = { width, height, units: customUnitsSelect.value };
        } else {
            updatedSpecs.dimensions = dimensionsSelect.value;
        }

        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, { specs: updatedSpecs });

        specsStatusMessage.textContent = 'Specifications saved successfully!';
        specsStatusMessage.className = 'mt-2 text-center text-sm text-green-400';

        // Trigger viewer update
        if (currentProjectData) {
             currentProjectData.specs = updatedSpecs;
             initializeSharedViewer({
                 db, auth, projectId,
                 projectData: currentProjectData,
                 isAdmin: true
             });
        }

    } catch (error) {
        console.error("Error saving specs:", error);
        specsStatusMessage.textContent = `Error: ${error.message}`;
        specsStatusMessage.className = 'mt-2 text-center text-sm text-red-400';
    } finally {
        saveSpecsButton.disabled = false;
        setTimeout(() => { specsStatusMessage.textContent = ''; }, 4000);
    }
});

// --- Firestore Listener ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // [Security Check] Ensure user is an Admin
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                console.warn("Access denied: User is not an admin.");
                window.location.href = 'index.html'; // Redirect non-admins
                return;
            }
        } catch (error) {
            console.error("Error verifying admin status:", error);
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('user-email').textContent = user.email;
        if (projectId) {
            const projectRef = doc(db, "projects", projectId);
            onSnapshot(projectRef, async (docSnap) => {
                if (docSnap.exists()) {
                    currentProjectData = docSnap.data(); // Store data globally

                    // --- [FIX] PROCESSING STATE CHECK ---
                    const currentVersions = currentProjectData.versions || [];
                    const latestVersion = currentVersions.length > 0
                        ? currentVersions.reduce((prev, current) => (prev.versionNumber > current.versionNumber) ? prev : current)
                        : null;

                    const isProcessingStatus = currentProjectData.status === 'Processing Upload';
                    
                    let isNewVersionPending = false;
                    if (currentProjectData.lastUploadAt && latestVersion && latestVersion.createdAt) {
                        isNewVersionPending = latestVersion.createdAt.seconds < currentProjectData.lastUploadAt.seconds;
                    }

                    // Optional: Check if the version itself is still processing
                    const isVersionProcessing = latestVersion && latestVersion.processingStatus === 'processing';

                    if (isProcessingStatus || isNewVersionPending || isVersionProcessing) {
                        loadingSpinner.classList.remove('hidden');
                        proofContent.classList.add('hidden');
                        loadingSpinner.innerHTML = `
                            <div class="flex flex-col items-center gap-4">
                                <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <div class="text-center">
                                    <p class="text-indigo-400 font-bold text-lg animate-pulse">Processing Guest Files...</p>
                                    <p class="text-gray-400 text-sm mt-1">Generating proof PDF.</p>
                                </div>
                            </div>
                        `;
                        return; // Stop rendering the rest until status changes
                    }
                    // ------------------------------------

                    projectNameHeader.textContent = currentProjectData.projectName;
                    document.getElementById('project-name').textContent = currentProjectData.projectName;

                    if (currentProjectData.companyId) {
                        const companySnap = await getDoc(doc(db, "companies", currentProjectData.companyId));
                        if (companySnap.exists()) {
                            document.getElementById('company-name').textContent = companySnap.data().companyName;
                        }
                    }

                    // Populate the specs form
                    populateSpecsForm(currentProjectData);

                    // Populate the manual cover specs form
                    populateCoverForm(currentProjectData.cover);

                    renderImpositions(currentProjectData.impositions);

                    // --- Real-time Update Logic (Smart Version Switching) ---
                    const versionSelector = document.getElementById('version-selector');
                    
                    const maxVersion = currentVersions.length > 0
                        ? Math.max(...currentVersions.map(v => v.versionNumber))
                        : 0;

                    const selectedVersion = versionSelector ? parseInt(versionSelector.value, 10) : null;
                    let targetVersion = selectedVersion;

                    if (selectedVersion && maxVersion > selectedVersion) {
                        console.log(`[Auto-Update] New version detected (v${maxVersion}). Switching from v${selectedVersion}.`);
                        targetVersion = null; // Force viewer.js to pick latest
                        if (versionSelector) versionSelector.value = ""; 
                    }

                    // Re-initialize the viewer.
                    initializeSharedViewer({
                        db,
                        auth,
                        projectId,
                        projectData: currentProjectData,
                        isAdmin: true
                    });

                    initializeImpositionUI({ projectData: currentProjectData, db, projectId });

                    // Restore selection
                    if (targetVersion && versionSelector) {
                        const versionExists = currentVersions.some(v => v.versionNumber === targetVersion);
                        if (versionExists) {
                             versionSelector.value = targetVersion;
                        }
                    }

                    // --- Button Visibility ---
                    const isApproved = currentProjectData.status === 'Approved' || 
                   currentProjectData.status === 'In Production' || 
                   currentProjectData.status === 'Imposition Complete';

                   const isWaitingReview = currentProjectData.status === 'Waiting Admin Review';

                    // Toggle buttons
                    approveButton.classList.toggle('hidden', isApproved);
                    unapproveButton.classList.toggle('hidden', !isApproved);

                    if (sendProofButton) {
                        sendProofButton.classList.toggle('hidden', !isWaitingReview);
                    }

                    // Disable forms
                    if (isApproved) {
                        if (uploadButton) {
                            uploadButton.disabled = true;
                            fileInput.disabled = true;
                            uploadButton.textContent = 'Project Approved';
                            document.getElementById('guided-tab').style.pointerEvents = 'none';
                            document.getElementById('guided-tab').style.opacity = '0.5';
                        }
                        if (coverUploadButton) {
                            coverUploadButton.disabled = true;
                            coverFileInput.disabled = true;
                            coverUploadButton.textContent = 'Project Approved';
                        }
                    } else {
                        if (uploadButton) {
                            uploadButton.disabled = false;
                            fileInput.disabled = false;
                            uploadButton.textContent = 'Upload New Version';
                            document.getElementById('guided-tab').style.pointerEvents = 'auto';
                            document.getElementById('guided-tab').style.opacity = '1';
                        }
                        if (coverUploadButton) {
                            coverUploadButton.disabled = false;
                            coverFileInput.disabled = false;
                            coverUploadButton.textContent = 'Upload Cover';
                        }
                    }

                    loadingSpinner.classList.add('hidden');
                    proofContent.classList.remove('hidden');
                    document.getElementById('project-details-tabs').classList.remove('hidden');
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


// --- File Upload Logic ---
if (fileUploadForm) {
    fileUploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleExpertUpload(fileInput.files[0], uploadStatusContainer, uploadButton, false);
    });
}

if (coverUploadForm) {
    coverUploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleExpertUpload(coverFileInput.files[0], coverUploadStatusContainer, coverUploadButton, true);
    });
}

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
    shareLinkForm.reset(); 
    
    // Reset "Owner" specific visual states when opening
    if (permissionOwnerCheckbox) {
         permissionApproveCheckbox.disabled = false;
         permissionApproveCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         permissionAnnotateCheckbox.disabled = false;
         permissionAnnotateCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         permissionSeeCommentsCheckbox.disabled = false;
         permissionSeeCommentsCheckbox.classList.remove('opacity-50', 'cursor-not-allowed');
         permissionSeeCommentsCheckbox.checked = true; 
    }

    generateLinkButton.disabled = false;
    copyStatusMessage.textContent = '';
}

function closeShareModal() {
    shareModal.classList.add('hidden');
}

// Listen on the new header button
if (headerShareButton) {
    headerShareButton.addEventListener('click', openShareModal);
}

if (guestBuilderButton) {
    guestBuilderButton.addEventListener('click', () => {
        if (!projectId) return;
        // Navigate to guest upload with admin flag
        window.location.href = `guest_upload.html?projectId=${projectId}&admin=true`;
    });
}

shareModalCloseButton.addEventListener('click', closeShareModal);
shareModalCancelButton.addEventListener('click', closeShareModal);

shareLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    generateLinkButton.disabled = true;
    generateLinkButton.textContent = 'Generating...';

    const permissions = {
        canApprove: permissionApproveCheckbox.checked,
        canAnnotate: permissionAnnotateCheckbox.checked,
        canSeeComments: permissionSeeCommentsCheckbox.checked,
        isOwner: permissionOwnerCheckbox ? permissionOwnerCheckbox.checked : false
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

// --- Firestore Listener for Project History ---
if (projectId) {
    const historyQuery = query(collection(db, "projects", projectId, "history"), orderBy("timestamp", "desc"));
    onSnapshot(historyQuery, (snapshot) => {
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
                const item = document.createElement('div');
                item.className = 'p-3 bg-slate-700/50 rounded-md text-sm';
                item.innerHTML = `
                    <p class="font-semibold text-white">${event.action.replace(/_/g, ' ')}</p>
                    <p class="text-gray-300">by <span class="font-medium">${event.userDisplay || 'System'}</span>${signature}</p>
                    <p class="text-xs text-gray-500 mt-1">${eventTime} (IP: ${event.ipAddress || 'N/A'})</p>
                `;
                historyList.appendChild(item);
            });
        }
    });
}

// --- Approve Button Logic ---
const approveButton = document.getElementById('approve-button');
const unapproveButton = document.getElementById('unapprove-button');

approveButton.addEventListener('click', async () => {
    if (!projectId) return;
    if (confirm('Are you sure you want to mark this project as approved? This will lock the project for the client.')) {
        approveButton.disabled = true;
        approveButton.textContent = 'Approving...';
        try {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, { status: 'Approved' });

            // Record history
            const recordHistory = httpsCallable(functions, 'recordHistory');
            await recordHistory({
                projectId: projectId,
                action: 'admin_approved_proof'
            });

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

unapproveButton.addEventListener('click', async () => {
    if (!projectId) return;
    if (confirm('Are you sure you want to un-approve this project? This will unlock it and allow the client to make changes.')) {
        unapproveButton.disabled = true;
        unapproveButton.textContent = 'Un-approving...';
        try {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, { status: 'Pending' }); // Revert to a neutral status

            // Record history
            const recordHistory = httpsCallable(functions, 'recordHistory');
            await recordHistory({
                projectId: projectId,
                action: 'admin_unapproved_proof'
            });

            alert('Project has been un-approved and unlocked.');
        } catch (error) {
            console.error("Error un-approving project:", error);
            alert('Could not un-approve the project. Please try again.');
        } finally {
            unapproveButton.disabled = false;
            unapproveButton.textContent = 'Unlock / Un-approve';
        }
    }
});

if (rerunPreflightButton) {
    rerunPreflightButton.addEventListener('click', async () => {
        if (!currentProjectData || !projectId) return;

        // A. Get the latest version to check
        const versions = currentProjectData.versions || [];
        if (versions.length === 0) {
            alert("No file versions found to check.");
            return;
        }

        // Sort to find the absolute latest version
        const latestVersionIndex = versions.reduce((iMax, x, i, arr) => x.versionNumber > arr[iMax].versionNumber ? i : iMax, 0);
        const latestVersion = versions[latestVersionIndex];

        if (!latestVersion.filePath) {
            alert("The latest version is missing a file path.");
            return;
        }

        // B. UI Loading State
        rerunPreflightButton.disabled = true;
        rerunPreflightButton.textContent = 'Running...';
        const statusDiv = document.getElementById('preflight-status-message');
        if(statusDiv) statusDiv.textContent = "Re-analyzing PDF...";

        try {
            // C. Call the Cloud Function
            const analyzePdfToolbox = httpsCallable(functions, 'analyzePdfToolbox');
            
            console.log(`Running preflight on: ${latestVersion.filePath}`);
            
            const result = await analyzePdfToolbox({ 
                gcsPath: latestVersion.filePath 
            });

            const analysis = result.data; // { preflightStatus, preflightResults, dimensions }

            // D. Update Firestore Safely
            const updatedVersions = [...versions];
            
            // [FIX] Construct the object step-by-step to avoid "undefined" values
            const updatedVersionEntry = {
                ...latestVersion,
                preflightStatus: analysis.preflightStatus,
                preflightResults: analysis.preflightResults
            };

            // Only update specs if we actually received dimensions. 
            // If not, we leave 'specs' alone (it stays as it was in ...latestVersion)
            if (analysis.dimensions) {
                updatedVersionEntry.specs = {
                    ...(latestVersion.specs || {}), // Handle case where specs didn't exist yet
                    dimensions: analysis.dimensions
                };
            }

            updatedVersions[latestVersionIndex] = updatedVersionEntry;
            
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, { 
                versions: updatedVersions 
            });

            alert("Preflight check complete. Results updated.");

        } catch (error) {
            console.error("Error running preflight:", error);
            alert(`Preflight failed: ${error.message}`);
            if(statusDiv) statusDiv.textContent = "Analysis failed.";
        } finally {
            // E. Reset UI
            rerunPreflightButton.disabled = false;
            rerunPreflightButton.textContent = 'Rerun Check';
        }
    });
}

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
    initializeTabs();
});

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Deactivate all buttons
            tabButtons.forEach(btn => {
                btn.classList.remove('border-indigo-500', 'text-indigo-400');
                btn.classList.add('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');
            });

            // Activate the clicked button
            button.classList.add('border-indigo-500', 'text-indigo-400');
            button.classList.remove('border-transparent', 'text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');

            // Hide all panels
            tabPanels.forEach(panel => {
                panel.classList.add('hidden');
            });

            // Show the corresponding panel
            const tabName = button.dataset.tab;
            const targetPanel = document.getElementById(`${tabName}-panel`);
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
            }
        });
    });
}

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

function renderImpositions(impositions) {
    const container = document.getElementById('imposition-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!impositions || impositions.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">No impositions generated yet.</p>';
        return;
    }

    // Sort descending by date (Newest first)
    const sorted = [...impositions].sort((a, b) => {
        const dateA = a.createdAt ? a.createdAt.seconds : 0;
        const dateB = b.createdAt ? b.createdAt.seconds : 0;
        return dateB - dateA;
    });

    sorted.forEach(imp => {
        const date = imp.createdAt ? new Date(imp.createdAt.seconds * 1000).toLocaleString() : 'Unknown Date';
        
        // Distinct styles for Auto vs Manual
        const isAuto = imp.type === 'automatic';
        const typeLabel = isAuto ? 'Auto-Imposed' : 'Manual Imposition';
        const typeClasses = isAuto 
            ? 'text-purple-300 bg-purple-900/30 border-purple-700/50' 
            : 'text-teal-300 bg-teal-900/30 border-teal-700/50';
        
        const item = document.createElement('div');
        item.className = "flex justify-between items-center p-3 bg-slate-700/30 rounded-md border border-slate-700/50 hover:bg-slate-700/60 transition-colors";
        
        item.innerHTML = `
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold px-1.5 py-0.5 rounded border ${typeClasses}">${typeLabel}</span>
                    <span class="text-xs text-gray-400">${date}</span>
                </div>
                <span class="text-xs text-gray-500 mt-1">
                    ${imp.settings?.sheet || 'Custom Sheet'} (${imp.settings?.columns}x${imp.settings?.rows})
                </span>
            </div>
            <a href="${imp.fileURL}" target="_blank" class="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded shadow-sm transition-colors">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Download
            </a>
        `;
        container.appendChild(item);
    });
}

if (sendProofButton) {
    sendProofButton.addEventListener('click', async () => {
        if (!projectId) return;
        
        const confirmSend = confirm("Are you sure the files are ready? This will unlock the proof for the client to approve.");
        if (!confirmSend) return;

        sendProofButton.disabled = true;
        sendProofButton.textContent = "Sending...";

        try {
            const projectRef = doc(db, "projects", projectId);
            // Change status to 'Pending Approval' to unlock client UI
            await updateDoc(projectRef, { status: 'Pending Approval' });

            const recordHistory = httpsCallable(functions, 'recordHistory');
            await recordHistory({
                projectId: projectId,
                action: 'admin_sent_proof'
            });
            
            alert("Proof sent to client successfully.");

        } catch (error) {
            console.error("Error sending proof:", error);
            alert("Failed to update status: " + error.message);
        } finally {
            sendProofButton.disabled = false;
            sendProofButton.textContent = "Send Proof to Client";
        }
    });
}
