import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Initializes the annotation feature.
 * @param {function} jumpToPage - Function to change the viewer page (formerly rerenderCanvas).
 */
export function initializeAnnotations(db, auth, projectId, canvas, commentsContainer, getCurrentPageNumber, jumpToPage, setOnPageRenderedCallback, getTransformState, getPdfRenderInfo, isGuest, getGuestDisplayName) {
    console.log("Initializing annotations for project:", projectId, "Is Guest:", isGuest);

    // --- DOM Elements ---
    const modal = document.getElementById('annotation-modal');
    const modalCloseButton = document.getElementById('modal-close-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const annotationForm = document.getElementById('annotation-form');
    const annotationText = document.getElementById('annotation-text');
    const tooltip = document.getElementById('annotation-tooltip');

    if (!modal || !modalCloseButton || !modalCancelButton || !annotationForm || !annotationText) {
        console.warn("Annotation modal elements not found.");
    }

    // --- State ---
    let newAnnotationData = null;
    let allAnnotations = [];
    let focusedAnnotationId = null; // Tracks which annotation was clicked in the sidebar

    // --- Drawing Logic ---
    function drawAnnotations() {
        if (!canvas || !canvas.getContext) {
            return;
        }
        const context = canvas.getContext('2d');
        const currentPage = getCurrentPageNumber();
        const transform = getTransformState();
        const pdfInfo = getPdfRenderInfo();

        context.save();
        
        // Apply transformations
        context.translate(transform.pan.x, transform.pan.y);
        context.scale(transform.zoom, transform.zoom);
        context.translate(pdfInfo.x, pdfInfo.y);

        allAnnotations.forEach(annotation => {
            if (annotation.pageNumber === currentPage) {
                context.beginPath();
                
                // Base radius for the dot
                const radius = 8 / transform.zoom; 
                
                if (radius > 0) {
                    // Check if this is the focused annotation
                    if (annotation.id === focusedAnnotationId) {
                        // Draw active style (Red dot with ring)
                        context.fillStyle = '#EF4444'; // Tailwind red-500
                        context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
                        context.fill();

                        // Draw outer ring
                        context.beginPath();
                        context.lineWidth = 2 / transform.zoom; // Scale stroke width
                        context.strokeStyle = '#EF4444';
                        context.arc(annotation.x, annotation.y, radius * 1.8, 0, Math.PI * 2);
                        context.stroke();
                    } else {
                        // Draw default style (Yellow dot)
                        context.fillStyle = '#FACC15'; // Tailwind yellow-400
                        context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
                        context.fill();
                    }
                }
            }
        });

        context.restore();
    }

    // Register drawing function
    setOnPageRenderedCallback(drawAnnotations);

    // --- Modal Handling ---
    function showModal() {
        if (modal) modal.classList.remove('hidden');
    }

    function hideModal() {
        if (modal) modal.classList.add('hidden');
        if (annotationText) annotationText.value = '';
        newAnnotationData = null;
    }

    if (modalCloseButton) modalCloseButton.addEventListener('click', hideModal);
    if (modalCancelButton) modalCancelButton.addEventListener('click', hideModal);


    // --- Canvas Interactions (Click & Hover) ---
    if (canvas) {
        // 1. CLICK (Add Annotation)
        canvas.addEventListener('click', (event) => {
            const rect = canvas.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;

            const transform = getTransformState();
            const pdfInfo = getPdfRenderInfo();

            const xPanned = clickX - transform.pan.x;
            const yPanned = clickY - transform.pan.y;
            const xZoomed = xPanned / transform.zoom;
            const yZoomed = yPanned / transform.zoom;
            const pdfX = xZoomed - pdfInfo.x;
            const pdfY = yZoomed - pdfInfo.y;

            if (pdfX >= 0 && pdfX <= pdfInfo.width && pdfY >= 0 && pdfY <= pdfInfo.height) {
                newAnnotationData = {
                    x: pdfX,
                    y: pdfY,
                    pageNumber: getCurrentPageNumber()
                };
                
                // Clear focus when adding new annotation
                focusedAnnotationId = null;
                jumpToPage(getCurrentPageNumber()); // Re-render to remove highlights

                if (modal && annotationText) {
                    showModal();
                    annotationText.focus();
                }
            } else {
                newAnnotationData = null;
                // Clicked outside PDF, clear focus
                focusedAnnotationId = null;
                jumpToPage(getCurrentPageNumber());
            }
        });

        // 2. HOVER (Tooltip)
        if (tooltip) {
            canvas.addEventListener('mousemove', (event) => {
                if (event.buttons === 1) {
                    hideTooltip();
                    return;
                }

                const rect = canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;

                const transform = getTransformState();
                const pdfInfo = getPdfRenderInfo();
                const currentPage = getCurrentPageNumber();

                let foundAnnotation = null;

                for (let i = allAnnotations.length - 1; i >= 0; i--) {
                    const annotation = allAnnotations[i];
                    if (annotation.pageNumber !== currentPage) continue;

                    const screenX = transform.pan.x + transform.zoom * (pdfInfo.x + annotation.x);
                    const screenY = transform.pan.y + transform.zoom * (pdfInfo.y + annotation.y);

                    const dist = Math.sqrt(Math.pow(mouseX - screenX, 2) + Math.pow(mouseY - screenY, 2));

                    if (dist <= 10) { 
                        foundAnnotation = annotation;
                        break;
                    }
                }

                if (foundAnnotation) {
                    showTooltip(event.clientX, event.clientY, foundAnnotation);
                } else {
                    hideTooltip();
                }
            });

            canvas.addEventListener('mouseleave', hideTooltip);
        }
    }

    function showTooltip(x, y, annotation) {
        if (!tooltip) return;
        const dateStr = annotation.createdAt ? new Date(annotation.createdAt.seconds * 1000).toLocaleDateString() : '';
        tooltip.innerHTML = `
            <div class="flex justify-between items-baseline mb-1">
                <span class="font-bold text-indigo-300">${annotation.author || 'Anonymous'}</span>
                <span class="text-xs text-gray-400 ml-2">${dateStr}</span>
            </div>
            <div class="text-gray-100 whitespace-pre-wrap leading-tight">${annotation.text}</div>
        `;
        tooltip.style.left = `${x + 15}px`;
        tooltip.style.top = `${y + 15}px`;
        tooltip.classList.remove('hidden');
    }

    function hideTooltip() {
        if (tooltip) tooltip.classList.add('hidden');
    }


    // --- Firestore Submit ---
    if (annotationForm) {
        annotationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const text = annotationText.value.trim();
            if (!newAnnotationData || !text) return;

            let authorName = auth.currentUser?.displayName || auth.currentUser?.email || "Anonymous";
            let authorUid = auth.currentUser?.uid;

            if (isGuest) {
                authorName = getGuestDisplayName();
            }

            try {
                await addDoc(collection(db, "projects", projectId, "annotations"), {
                    ...newAnnotationData,
                    text: text,
                    author: authorName,
                    authorUid: authorUid,
                    createdAt: serverTimestamp()
                });
                hideModal();
            } catch (error) {
                console.error("Error adding annotation: ", error);
                alert("Could not add your comment. Please try again.");
            }
        });
    }

    // --- Sidebar Comments List ---
    function updateCommentsList() {
        if (!commentsContainer) return;
        commentsContainer.innerHTML = '';

        if (allAnnotations.length === 0) {
            commentsContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No comments yet.</p>';
            return;
        }

        // Sort: Oldest first so conversations read logically, or Newest first. 
        // Let's stick to Newest First as per previous code.
        const sortedAnnotations = [...allAnnotations].sort((a, b) => 
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

        sortedAnnotations.forEach(annotation => {
            const commentEl = document.createElement('div');
            // Add conditional styling if this is the focused annotation
            const isFocused = annotation.id === focusedAnnotationId;
            const activeClass = isFocused ? 'border-l-4 border-l-indigo-500 bg-slate-700' : 'bg-slate-700/50 hover:border-indigo-500';
            
            commentEl.className = `p-3 rounded-lg border border-slate-600 transition-all duration-200 cursor-pointer ${activeClass}`;
            
            const dateStr = annotation.createdAt ? new Date(annotation.createdAt.seconds * 1000).toLocaleString() : 'Just now';
            
            commentEl.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="font-semibold text-indigo-300 text-sm">${annotation.author || 'Anonymous'}</span>
                    <span class="text-xs text-gray-400">${dateStr}</span>
                </div>
                <p class="text-gray-200 text-sm whitespace-pre-wrap">${annotation.text}</p>
                <p class="text-xs text-gray-500 mt-2 flex justify-between">
                    <span>Page ${annotation.pageNumber}</span>
                </p>
            `;
            
            // CLICK HANDLER: Jump & Highlight
            commentEl.addEventListener('click', () => {
                 focusedAnnotationId = annotation.id;
                 
                 // Force re-render (this draws the highlight) and change page if needed
                 jumpToPage(annotation.pageNumber);

                 // Re-render sidebar to show active state on the card
                 updateCommentsList(); 
            });

            commentsContainer.appendChild(commentEl);
        });
    }

    // --- Real-time Listener ---
    const annotationsQuery = query(collection(db, "projects", projectId, "annotations"), orderBy("createdAt", "asc"));

    onSnapshot(annotationsQuery, (snapshot) => {
        allAnnotations = [];
        snapshot.forEach((doc) => {
            allAnnotations.push({ 
                id: doc.id, 
                ...doc.data() 
            });
        });
        
        // Refresh view
        jumpToPage(getCurrentPageNumber());
        updateCommentsList();
    }, (error) => {
        console.error("Error fetching annotations:", error);
    });
}