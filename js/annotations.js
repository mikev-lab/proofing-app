import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Initializes the annotation feature.
 */
export function initializeAnnotations(db, auth, projectId, canvas, commentsContainer, getCurrentPageNumber, jumpToPage, setOnPageRenderedCallback, getTransformState, getPdfRenderInfo, isGuest, getGuestDisplayName, getCurrentTool) {
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
    let focusedAnnotationId = null;

    // Drawing State
    let isInteractionActive = false; 
    let isDragMode = false;          
    let startCoords = null;          
    let currentCoords = null;        

    // --- Helper: Get PDF Coordinates (Normalized to PDF Points) ---
    function getPdfCoordinate(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const xRel = clientX - rect.left;
        const yRel = clientY - rect.top;

        const transform = getTransformState();
        const pdfInfo = getPdfRenderInfo();

        // 1. Untranslate Pan
        const xPanned = xRel - transform.pan.x;
        const yPanned = yRel - transform.pan.y;

        // 2. Unscale User Zoom
        const xZoomed = xPanned / transform.zoom;
        const yZoomed = yPanned / transform.zoom;

        // 3. Untranslate PDF Offset (Black Padding)
        const xOffset = xZoomed - pdfInfo.x;
        const yOffset = yZoomed - pdfInfo.y;

        // 4. Unscale Base PDF Scale (Convert Pixels -> PDF Points)
        // This is the critical fix for cross-device alignment
        const pdfX = xOffset / pdfInfo.scale;
        const pdfY = yOffset / pdfInfo.scale;

        return { x: pdfX, y: pdfY };
    }

    // --- Drawing Logic ---
    function drawAnnotations() {
        if (!canvas || !canvas.getContext) return;
        
        const context = canvas.getContext('2d');
        const currentPage = getCurrentPageNumber();
        const transform = getTransformState();
        const pdfInfo = getPdfRenderInfo();

        context.save();
        
        // Apply transforms to match PDF coordinate space
        context.translate(transform.pan.x, transform.pan.y);
        context.scale(transform.zoom, transform.zoom);
        context.translate(pdfInfo.x, pdfInfo.y);
        context.scale(pdfInfo.scale, pdfInfo.scale); // Scale to PDF Points

        // Calculate display scales (to keep line widths consistent on screen)
        const totalScale = transform.zoom * pdfInfo.scale;
        const lineWidthBase = 2 / totalScale;
        const lineWidthFocused = 3 / totalScale;
        const radiusBase = 10 / totalScale;

        // 1. Draw Existing Annotations
        allAnnotations.forEach(annotation => {
            if (annotation.pageNumber === currentPage) {
                const isFocused = annotation.id === focusedAnnotationId;
                const w = annotation.width || 0;
                const h = annotation.height || 0;
                const type = annotation.type || 'dot';

                context.beginPath();
                
                let fillColor = isFocused ? '#EF4444' : '#FACC15';
                let strokeColor = isFocused ? '#EF4444' : '#FACC15';
                let boxFill = isFocused ? 'rgba(239, 68, 68, 0.3)' : 'rgba(250, 204, 21, 0.3)';

                // A. BOX
                if (w > 0 && h > 0) {
                    context.fillStyle = boxFill;
                    context.strokeStyle = strokeColor;
                    context.lineWidth = lineWidthFocused;
                    context.fillRect(annotation.x, annotation.y, w, h);
                    context.strokeRect(annotation.x, annotation.y, w, h);
                } 
                // B. ICONS
                else {
                    context.fillStyle = fillColor;
                    context.strokeStyle = strokeColor;
                    context.lineWidth = lineWidthBase;

                    if (type === 'flag') {
                        context.moveTo(annotation.x, annotation.y);
                        context.lineTo(annotation.x, annotation.y - (radiusBase * 2.5));
                        context.stroke();
                        context.beginPath();
                        context.moveTo(annotation.x, annotation.y - (radiusBase * 2.5));
                        context.lineTo(annotation.x + (radiusBase * 1.5), annotation.y - (radiusBase * 2));
                        context.lineTo(annotation.x, annotation.y - (radiusBase * 1.5));
                        context.fill();
                    } 
                    else if (type === 'x') {
                        context.lineWidth = lineWidthFocused;
                        context.beginPath();
                        context.moveTo(annotation.x - radiusBase, annotation.y - radiusBase);
                        context.lineTo(annotation.x + radiusBase, annotation.y + radiusBase);
                        context.moveTo(annotation.x + radiusBase, annotation.y - radiusBase);
                        context.lineTo(annotation.x - radiusBase, annotation.y + radiusBase);
                        context.stroke();
                    } 
                    else {
                        // Dot
                        context.beginPath();
                        context.arc(annotation.x, annotation.y, radiusBase, 0, Math.PI * 2);
                        context.fill();
                        if (isFocused) {
                            context.beginPath();
                            context.lineWidth = lineWidthBase;
                            context.arc(annotation.x, annotation.y, radiusBase * 1.4, 0, Math.PI * 2);
                            context.stroke();
                        }
                    }
                }
            }
        });

        // 2. Draw Drag Box
        if (isInteractionActive && isDragMode && startCoords && currentCoords) {
            const w = currentCoords.x - startCoords.x;
            const h = currentCoords.y - startCoords.y;

            context.beginPath();
            context.fillStyle = 'rgba(250, 204, 21, 0.3)'; 
            context.strokeStyle = '#FACC15';
            context.lineWidth = lineWidthBase;
            
            context.fillRect(startCoords.x, startCoords.y, w, h);
            context.strokeRect(startCoords.x, startCoords.y, w, h);
        }

        context.restore();
    }

    setOnPageRenderedCallback(drawAnnotations);

    // --- Modal Handling ---
    function showModal() {
        if (modal) modal.classList.remove('hidden');
    }

    function hideModal() {
        if (modal) modal.classList.add('hidden');
        if (annotationText) annotationText.value = '';
        newAnnotationData = null;
        
        isInteractionActive = false;
        isDragMode = false;
        startCoords = null;
        currentCoords = null;
        jumpToPage(getCurrentPageNumber()); 
    }

    if (modalCloseButton) modalCloseButton.addEventListener('click', hideModal);
    if (modalCancelButton) modalCancelButton.addEventListener('click', hideModal);


    // --- Canvas Interactions ---
    if (canvas) {
        
        // 1. MOUSE DOWN
        canvas.addEventListener('mousedown', (event) => {
            if (typeof getCurrentTool === 'function' && getCurrentTool() !== 'comment') return;

            // Need raw dimensions for boundary check (converted to points)
            const pdfInfo = getPdfRenderInfo();
            const pdfWidthPoints = pdfInfo.width / pdfInfo.scale;
            const pdfHeightPoints = pdfInfo.height / pdfInfo.scale;

            const coords = getPdfCoordinate(event.clientX, event.clientY);

            if (coords.x >= 0 && coords.x <= pdfWidthPoints && coords.y >= 0 && coords.y <= pdfHeightPoints) {
                isInteractionActive = true;
                isDragMode = false;
                startCoords = coords;
                currentCoords = coords;
                
                focusedAnnotationId = null;
                jumpToPage(getCurrentPageNumber()); 

                window.addEventListener('mousemove', handleWindowMouseMove);
                window.addEventListener('mouseup', handleWindowMouseUp);
            }
        });

        // 2. MOUSE MOVE (Hover Tooltips)
        canvas.addEventListener('mousemove', (event) => {
            if (isInteractionActive) return; 

            if (tooltip) {
                const coords = getPdfCoordinate(event.clientX, event.clientY);
                const found = findAnnotationAt(coords);

                if (found) {
                    showTooltip(event.clientX, event.clientY, found);
                } else {
                    hideTooltip();
                }
            }
        });
        
        canvas.addEventListener('mouseleave', () => hideTooltip());
    }

    function findAnnotationAt(coords) {
        const currentPage = getCurrentPageNumber();
        const transform = getTransformState();
        const pdfInfo = getPdfRenderInfo();
        const totalScale = transform.zoom * pdfInfo.scale;
        
        for (let i = allAnnotations.length - 1; i >= 0; i--) {
            const ann = allAnnotations[i];
            if (ann.pageNumber !== currentPage) continue;

            const w = ann.width || 0;
            const h = ann.height || 0;

            if (w > 0 && h > 0) {
                // Box Hit
                const rx = w < 0 ? ann.x + w : ann.x;
                const ry = h < 0 ? ann.y + h : ann.y;
                const rw = Math.abs(w);
                const rh = Math.abs(h);
                if (coords.x >= rx && coords.x <= rx + rw && coords.y >= ry && coords.y <= ry + rh) {
                    return ann;
                }
            } else {
                // Point Hit
                const hitRadius = 12 / totalScale; // Scaled radius
                const dist = Math.sqrt(Math.pow(coords.x - ann.x, 2) + Math.pow(coords.y - ann.y, 2));
                if (dist <= hitRadius) {
                    return ann;
                }
            }
        }
        return null;
    }

    function handleWindowMouseMove(event) {
        if (!isInteractionActive) return;
        
        const coords = getPdfCoordinate(event.clientX, event.clientY);
        currentCoords = coords;

        const dx = Math.abs(currentCoords.x - startCoords.x);
        const dy = Math.abs(currentCoords.y - startCoords.y);
        
        // Threshold (in PDF Points)
        if (!isDragMode && (dx > 5 || dy > 5)) {
            isDragMode = true;
        }

        if (isDragMode) {
            jumpToPage(getCurrentPageNumber());
        }
    }

    async function handleWindowMouseUp(event) {
        if (!isInteractionActive) return;

        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);

        if (isDragMode) {
            // --- CREATE BOX ---
            const rawWidth = currentCoords.x - startCoords.x;
            const rawHeight = currentCoords.y - startCoords.y;
            
            const finalX = rawWidth < 0 ? currentCoords.x : startCoords.x;
            const finalY = rawHeight < 0 ? currentCoords.y : startCoords.y;
            const finalW = Math.abs(rawWidth);
            const finalH = Math.abs(rawHeight);

            newAnnotationData = {
                x: finalX, y: finalY, width: finalW, height: finalH,
                pageNumber: getCurrentPageNumber(),
                type: 'box'
            };
            openModal();
        } else {
            // --- CLICK ---
            const clickedAnn = findAnnotationAt(startCoords);

            if (clickedAnn) {
                // Toggle Icon Type
                if (!clickedAnn.width) {
                    const types = ['dot', 'flag', 'x'];
                    const currentType = clickedAnn.type || 'dot';
                    const nextType = types[(types.indexOf(currentType) + 1) % types.length];

                    try {
                        const annRef = doc(db, "projects", projectId, "annotations", clickedAnn.id);
                        await updateDoc(annRef, { type: nextType });
                    } catch (e) {
                        console.error("Error updating annotation type:", e);
                    }
                }
            } else {
                // Create Dot
                newAnnotationData = {
                    x: startCoords.x, y: startCoords.y, 
                    width: 0, height: 0,
                    pageNumber: getCurrentPageNumber(),
                    type: 'dot'
                };
                openModal();
            }
        }

        isInteractionActive = false;
        isDragMode = false;
    }

    function openModal() {
        if (modal && annotationText) {
            showModal();
            annotationText.focus();
        }
    }


    // --- Tooltip Functions ---
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


    // --- Firestore Submit (Create) ---
    if (annotationForm) {
        annotationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const text = annotationText.value.trim();
            if (!newAnnotationData || !text) return;

            let authorName = auth.currentUser?.displayName || auth.currentUser?.email || "Anonymous";
            let authorUid = auth.currentUser?.uid;

            if (isGuest) authorName = getGuestDisplayName();

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

    // --- Sidebar List ---
    function updateCommentsList() {
        if (!commentsContainer) return;
        commentsContainer.innerHTML = '';

        if (allAnnotations.length === 0) {
            commentsContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No comments yet.</p>';
            return;
        }

        const sortedAnnotations = [...allAnnotations].sort((a, b) => 
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

        sortedAnnotations.forEach(annotation => {
            const commentEl = document.createElement('div');
            const isFocused = annotation.id === focusedAnnotationId;
            const activeClass = isFocused ? 'border-l-4 border-l-indigo-500 bg-slate-700' : 'bg-slate-700/50 hover:border-indigo-500';
            
            commentEl.className = `p-3 rounded-lg border border-slate-600 transition-all duration-200 relative group ${activeClass}`;
            
            const dateStr = annotation.createdAt ? new Date(annotation.createdAt.seconds * 1000).toLocaleString() : 'Just now';
            
            commentEl.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="font-semibold text-indigo-300 text-sm">${annotation.author || 'Anonymous'}</span>
                    <span class="text-xs text-gray-400">${dateStr}</span>
                </div>
                <p class="text-gray-200 text-sm whitespace-pre-wrap pr-6">${annotation.text}</p>
                <p class="text-xs text-gray-500 mt-2 flex justify-between">
                    <span>Page ${annotation.pageNumber}</span>
                    ${annotation.type ? `<span class="uppercase text-[10px] bg-slate-800 px-1 rounded border border-slate-600">${annotation.type}</span>` : ''}
                </p>
            `;

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'absolute top-2 right-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
            deleteBtn.title = "Delete Annotation";
            
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                if (confirm("Delete this annotation?")) {
                    try {
                        await deleteDoc(doc(db, "projects", projectId, "annotations", annotation.id));
                    } catch (err) {
                        console.error("Error deleting annotation:", err);
                        alert("Failed to delete.");
                    }
                }
            });

            commentEl.appendChild(deleteBtn);
            
            commentEl.addEventListener('click', () => {
                 focusedAnnotationId = annotation.id;
                 if (getCurrentPageNumber() !== annotation.pageNumber) {
                     jumpToPage(annotation.pageNumber);
                 } else {
                     jumpToPage(getCurrentPageNumber());
                 }
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
        jumpToPage(getCurrentPageNumber());
        updateCommentsList();
    }, (error) => {
        console.error("Error fetching annotations:", error);
    });
}