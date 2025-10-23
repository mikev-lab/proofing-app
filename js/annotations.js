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
 * @param {function} onPageRendered - A callback to execute after a page is rendered, for drawing.
 * @param {function} setOnPageRenderedCallback - A function to register the drawing callback.
 */
export function initializeAnnotations(db, auth, projectId, canvas, commentsContainer, getCurrentPageNumber, rerenderCanvas, setOnPageRenderedCallback) {
    console.log("Initializing annotations for project:", projectId);

    const modal = document.getElementById('annotation-modal');
    const modalCloseButton = document.getElementById('modal-close-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const annotationForm = document.getElementById('annotation-form');
    const annotationText = document.getElementById('annotation-text');

    let newAnnotationData = null;
    let allAnnotations = [];

    // --- Drawing ---
    function drawAnnotations() {
        const context = canvas.getContext('2d');
        const currentPage = getCurrentPageNumber();

        context.fillStyle = '#FACC15'; // Tailwind yellow-400

        allAnnotations.forEach(annotation => {
            if (annotation.pageNumber === currentPage) {
                context.beginPath();
                context.arc(annotation.x, annotation.y, 8, 0, Math.PI * 2); // 8px radius circle
                context.fill();
            }
        });
    }

    // Register the drawing function with the main script
    setOnPageRenderedCallback(drawAnnotations);

    // --- Modal Handling ---
    function showModal() {
        modal.classList.remove('hidden');
    }

    function hideModal() {
        modal.classList.add('hidden');
        annotationText.value = '';
        newAnnotationData = null;
    }

    modalCloseButton.addEventListener('click', hideModal);
    modalCancelButton.addEventListener('click', hideModal);

    // --- Canvas Interaction ---
    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        newAnnotationData = {
            x,
            y,
            pageNumber: getCurrentPageNumber()
        };

        showModal();
        annotationText.focus();
    });

    // --- Firestore Interaction ---
    annotationForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!newAnnotationData || !annotationText.value.trim()) {
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            console.error("User not logged in.");
            // Optionally, show an error to the user
            return;
        }

        try {
            const annotationsRef = collection(db, "projects", projectId, "annotations");
            await addDoc(annotationsRef, {
                authorUid: user.uid,
                authorEmail: user.email,
                text: annotationText.value.trim(),
                x: newAnnotationData.x,
                y: newAnnotationData.y,
                pageNumber: newAnnotationData.pageNumber,
                createdAt: serverTimestamp()
            });
            console.log("Annotation saved successfully.");
        } catch (error) {
            console.error("Error saving annotation:", error);
        } finally {
            hideModal();
        }
    });

    // --- Comments List ---
    function updateCommentsList() {
        commentsContainer.innerHTML = ''; // Clear existing comments

        if (allAnnotations.length === 0) {
            commentsContainer.innerHTML = '<p class="text-gray-400">No comments yet.</p>';
            return;
        }

        // Group comments by page number
        const commentsByPage = allAnnotations.reduce((acc, annotation) => {
            const page = annotation.pageNumber || 1;
            if (!acc[page]) {
                acc[page] = [];
            }
            acc[page].push(annotation);
            return acc;
        }, {});

        Object.keys(commentsByPage).sort((a, b) => a - b).forEach(pageNumber => {
            const pageTitle = document.createElement('h4');
            pageTitle.className = 'text-lg font-semibold text-white mt-4 border-b border-slate-700/50 pb-2';
            pageTitle.textContent = `Page ${pageNumber}`;
            commentsContainer.appendChild(pageTitle);

            commentsByPage[pageNumber].forEach(comment => {
                const commentEl = document.createElement('div');
                commentEl.classList.add('p-3', 'bg-slate-700', 'rounded-lg', 'mt-2');
                commentEl.innerHTML = `<p class="text-sm text-gray-200">${comment.text}</p><p class="text-xs text-gray-400 mt-1">_by ${comment.authorEmail}</p>`;
                commentsContainer.appendChild(commentEl);
            });
        });
    }

    // Listen for real-time updates on annotations
    const annotationsQuery = query(collection(db, "projects", projectId, "annotations"), orderBy("createdAt"));

    const unsubscribe = onSnapshot(annotationsQuery, (snapshot) => {
        allAnnotations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Received ${allAnnotations.length} annotations.`);

        // Trigger a re-render of the canvas, which will then call our drawing function
        rerenderCanvas();

        // Update the text-based comments list
        updateCommentsList();
    });
}
