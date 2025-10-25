import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Initializes the annotation feature on a given page.
 * @param {object} db - The Firestore database instance.
 * @param {object} auth - The Firebase auth instance.
 * @param {string} projectId - The ID of the current project.
 * @param {HTMLCanvasElement} canvas - The canvas element for PDF rendering.
 * @param {HTMLElement} commentsContainer - The container for displaying comment text.
 * @param {function} getCurrentPageNumber - A function that returns the current PDF page number.
 * @param {function} rerenderCanvas - A function that forces the canvas to be re-rendered.
 * @param {function} setOnPageRenderedCallback - A function to register the drawing callback.
 * @param {function} getTransformState - A function that returns the current zoom and pan state.
 * @param {function} getPdfRenderInfo - A function that returns the PDF's last render position and dimensions.
 */
export function initializeAnnotations(db, auth, projectId, canvas, commentsContainer, getCurrentPageNumber, rerenderCanvas, setOnPageRenderedCallback, getTransformState, getPdfRenderInfo) {
    console.log("Initializing annotations for project:", projectId);

    const modal = document.getElementById('annotation-modal');
    const modalCloseButton = document.getElementById('modal-close-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const annotationForm = document.getElementById('annotation-form');
    const annotationText = document.getElementById('annotation-text');

    // Add checks to ensure modal elements exist before adding listeners
    if (!modal || !modalCloseButton || !modalCancelButton || !annotationForm || !annotationText) {
        console.warn("Annotation modal elements not found. Annotations might not work correctly.");
        // Decide how to handle this: return early, or let other parts run?
        // For now, let other parts run, but log the warning.
        // return; // Uncomment this to completely disable annotations if modal isn't found
    }


    let newAnnotationData = null;
    let allAnnotations = [];

    // --- Drawing ---
    function drawAnnotations() {
        // ... existing code ...
        // Ensure canvas context is valid before drawing
        if (!canvas || !canvas.getContext) {
            console.error("Canvas element not ready for drawing annotations.");
            return;
        }
        const context = canvas.getContext('2d');
        const currentPage = getCurrentPageNumber();
        const transform = getTransformState();

        context.save();
        // We need to apply the same transformations as the viewer to draw annotations correctly.
        context.translate(transform.pan.x, transform.pan.y);
        context.scale(transform.zoom, transform.zoom);

        const pdfInfo = getPdfRenderInfo();
        context.translate(pdfInfo.x, pdfInfo.y);

        context.fillStyle = '#FACC15'; // Tailwind yellow-400

        allAnnotations.forEach(annotation => {
            if (annotation.pageNumber === currentPage) {
                // The annotation x/y are relative to the PDF page, so we just draw them.
                // The transformation takes care of placing them correctly on the visible canvas.
                context.beginPath();
                // The radius should appear consistent regardless of zoom.
                const radius = 8 / transform.zoom; // Calculate radius
                // Ensure radius is a positive number
                if (radius > 0) {
                  context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
                  context.fill();
                } else {
                    console.warn("Calculated annotation radius is non-positive, skipping draw.");
                }
            }
        });

        context.restore();
    }

    // Register the drawing function with the main script
    setOnPageRenderedCallback(drawAnnotations);

    // --- Modal Handling ---
    function showModal() {
        if (modal) modal.classList.remove('hidden'); // Check if modal exists
    }

    function hideModal() {
        if (modal) modal.classList.add('hidden'); // Check if modal exists
        if (annotationText) annotationText.value = ''; // Check if annotationText exists
        newAnnotationData = null;
    }

    // Add listeners only if buttons exist
    if (modalCloseButton) modalCloseButton.addEventListener('click', hideModal);
    if (modalCancelButton) modalCancelButton.addEventListener('click', hideModal);


    // --- Canvas Interaction ---
    // The 'click' event is now dispatched from viewerControls.js to distinguish clicks from pans.
    if (canvas) { // Check if canvas exists
        canvas.addEventListener('click', (event) => {
            // ... existing code ...
            // Add checks before calling showModal and focusing
            if (modal && annotationText) {
                showModal();
                annotationText.focus();
            } else {
                 console.warn("Cannot show annotation modal or focus input because elements are missing.");
            }
        });
    } else {
        console.warn("Canvas element not found for adding annotation click listener.");
    }

    // --- Firestore Interaction ---
    if (annotationForm) { // Check if form exists
        annotationForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            // Check annotationText exists here too
            if (!newAnnotationData || !annotationText || !annotationText.value.trim()) {
                return;
            }
            // ... rest of the submit logic ...
        });
    } else {
         console.warn("Annotation form not found for adding submit listener.");
    }


    // --- Comments List ---
    function updateCommentsList() {
        // ... existing code ...
        // Add check for commentsContainer
        if (!commentsContainer) {
            console.warn("Comments container not found, cannot update list.");
            return;
        }
        commentsContainer.innerHTML = ''; // Clear existing comments
        // ... rest of the update logic ...
    }

    // Listen for real-time updates on annotations
    const annotationsQuery = query(collection(db, "projects", projectId, "annotations"), orderBy("createdAt"));

    const unsubscribe = onSnapshot(annotationsQuery, (snapshot) => {
        // ... existing code ...

        // Update the text-based comments list
        updateCommentsList();
    });
}
