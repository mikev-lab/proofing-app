/**
 * Initializes viewer controls for zooming and panning.
 * @param {HTMLDivElement} viewer The main container for the PDF viewer.
 * @param {HTMLCanvasElement} canvas The canvas element for PDF rendering.
 * @param {function} onTransformChange A function to call to re-render the canvas with new transformations.
 * @param {function} getCurrentTool A function that returns the currently active tool ('pan' or 'comment').
 * @param {function} getPdfRenderInfo A function that returns the PDF's last render position and dimensions.
 * @param {HTMLElement} zoomDisplaySpan Element to display zoom percentage.
 */
export function initializeViewerControls(viewer, canvas, onTransformChange, getCurrentTool, getPdfRenderInfo, zoomDisplaySpan) {
    console.log('Initializing viewer controls...');

    const zoomInButton = document.getElementById('zoom-in-button');
    const zoomOutButton = document.getElementById('zoom-out-button');
    const zoomResetButton = document.getElementById('zoom-reset-button');

    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 5.0;
    const PAN_THRESHOLD = 5; // Pixels to move before pan starts

    let transform = {
        zoom: 1.0,
        pan: { x: 0, y: 0 }
    };

    let isPointerDown = false;
    let isPanning = false;
    let wasPanning = false; // Flag to track if a pan occurred, to suppress clicks
    let pointerStart = { x: 0, y: 0 };
    let lastPanPoint = { x: 0, y: 0 };

    /**
     * Capturing event listener to stop clicks if we just panned or are in pan mode.
     */
    function handleSuppression(event) {
        if (wasPanning || getCurrentTool() === 'pan') {
            event.stopPropagation();
            event.preventDefault();
        }
        wasPanning = false;
    }

    function updateTransform(newTransform) {
        transform = newTransform;
        onTransformChange(transform);
        updateCursor();
    }

    function updateCursor() {
        const tool = getCurrentTool();
        if (tool === 'pan') {
            canvas.style.cursor = isPointerDown ? 'grabbing' : 'grab';
        } else if (tool === 'comment') {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'default';
        }
    }
    
    // Expose globally so main script can update cursor on tool change
    window.updateCursor = updateCursor;

    // --- Zoom Logic ---
    function handleWheelZoom(event) {
        event.preventDefault();
        const rect = viewer.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAtPoint(mouseX, mouseY, zoomFactor);
    }

    function zoomAtPoint(screenX, screenY, zoomFactor) {
        const oldZoom = transform.zoom;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * zoomFactor));

        // Calculate canvas point under mouse
        const canvasX = (screenX - transform.pan.x) / oldZoom;
        const canvasY = (screenY - transform.pan.y) / oldZoom;

        // Calculate new pan to keep point stable
        const newPanX = screenX - canvasX * newZoom;
        const newPanY = screenY - canvasY * newZoom;

        updateTransform({
            zoom: newZoom,
            pan: { x: newPanX, y: newPanY }
        });

        if (zoomDisplaySpan) {
            zoomDisplaySpan.textContent = `${Math.round(newZoom * 100)}%`;
        }
    }

    // --- Pan Logic ---
    function handlePointerDown(event) {
        // 🛑 CRITICAL FIX: Do not start panning logic if we are in 'comment' mode
        if (getCurrentTool() !== 'pan') return;

        isPointerDown = true;
        wasPanning = false;
        pointerStart.x = event.clientX;
        pointerStart.y = event.clientY;
        lastPanPoint = { ...transform.pan };
        
        // Update cursor immediately to grabbing
        updateCursor();
    }

    function handlePointerMove(event) {
        if (!isPointerDown) return;

        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;

        // Threshold check to avoid jitter
        if (!isPanning && (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD)) {
            isPanning = true;
        }

        if (isPanning) {
            updateTransform({
                zoom: transform.zoom,
                pan: {
                    x: lastPanPoint.x + dx,
                    y: lastPanPoint.y + dy
                }
            });
        }
    }

    function handlePointerUp(event) {
        if (isPanning) {
            wasPanning = true;
        }

        isPointerDown = false;
        isPanning = false;
        updateCursor();
    }


    // --- Touch Logic (Pinch-to-Zoom) ---
    let lastTouchDistance = null;

    function getTouchDistance(event) {
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
    }

    function handleTouchStart(event) {
        if (event.touches.length === 2) {
            lastTouchDistance = getTouchDistance(event);
            event.preventDefault();
        } else if (event.touches.length === 1) {
            // Pass to standard pointer handler (which will now check tool type)
            handlePointerDown(event.touches[0]);
        }
    }

    function handleTouchMove(event) {
        if (event.touches.length === 2) {
            event.preventDefault();
            const newDist = getTouchDistance(event);
            const zoomFactor = newDist / lastTouchDistance;
            lastTouchDistance = newDist;

            const rect = viewer.getBoundingClientRect();
            const t1 = event.touches[0];
            const t2 = event.touches[1];
            const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
            const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;

            zoomAtPoint(centerX, centerY, zoomFactor);

        } else if (event.touches.length === 1) {
            handlePointerMove(event.touches[0]);
        }
    }

    function handleTouchEnd(event) {
        if (event.touches.length < 2) {
            lastTouchDistance = null;
        }
        if (event.touches.length < 1) {
            handlePointerUp(event.changedTouches[0]);
        }
    }


    // --- UI Button Event Listeners ---
    if (zoomInButton) {
        zoomInButton.addEventListener('click', () => {
            zoomAtPoint(viewer.clientWidth / 2, viewer.clientHeight / 2, 1.25);
        });
    }

    if (zoomOutButton) {
        zoomOutButton.addEventListener('click', () => {
            zoomAtPoint(viewer.clientWidth / 2, viewer.clientHeight / 2, 1 / 1.25);
        });
    }

    if (zoomResetButton) {
        zoomResetButton.addEventListener('click', () => {
            updateTransform({ zoom: 1.0, pan: { x: 0, y: 0 } });
            if (zoomDisplaySpan) zoomDisplaySpan.textContent = `100%`;
        });
    }


    // --- Register Listeners ---
    viewer.addEventListener('wheel', handleWheelZoom, { passive: false });
    viewer.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove); // Use window to catch drags outside canvas
    window.addEventListener('mouseup', handlePointerUp);
    
    // Capture click to suppress interaction if panned
    canvas.addEventListener('click', handleSuppression, true);

    // Touch Events
    viewer.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewer.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewer.addEventListener('touchend', handleTouchEnd);
    viewer.addEventListener('touchcancel', handleTouchEnd);

    // Initial setup
    updateCursor();
}