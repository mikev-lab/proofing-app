/**
 * Initializes viewer controls for zooming and panning.
 * @param {HTMLDivElement} viewer The main container for the PDF viewer.
 * @param {HTMLCanvasElement} canvas The canvas element for PDF rendering.
 * @param {function} onTransformChange A function to call to re-render the canvas with new transformations.
 * @param {function} getCurrentTool A function that returns the currently active tool ('pan' or 'comment').
 * @param {function} getPdfRenderInfo A function that returns the PDF's last render position and dimensions.
 */
export function initializeViewerControls(viewer, canvas, onTransformChange, getCurrentTool, getPdfRenderInfo, zoomLevelDisplay) {
    console.log('Initializing viewer controls...');

    const zoomInButton = document.getElementById('zoom-in-button');
    const zoomOutButton = document.getElementById('zoom-out-button');
    const zoomResetButton = document.getElementById('zoom-reset-button');

    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 5.0;
    const PAN_THRESHOLD = 5; // Pixels

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
     * This function is a capturing event listener that stops click events from propagating
     * if the user was just panning, or if the pan tool is active. This prevents the
     * annotation module from incorrectly interpreting a click.
     */
    function handleSuppression(event) {
        if (wasPanning || getCurrentTool() === 'pan') {
            event.stopPropagation();
            event.preventDefault();
        }
        // Reset for the next complete gesture.
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
    // Expose updateCursor globally so the main script can call it
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

        // The point in the un-transformed canvas space under the mouse.
        // Formula: Canvas = (Screen - Pan) / Zoom
        const canvasX = (screenX - transform.pan.x) / oldZoom;
        const canvasY = (screenY - transform.pan.y) / oldZoom;

        // New pan to keep the same canvas point under the mouse.
        // Formula: newPan = Screen - Canvas * newZoom
        const newPanX = screenX - canvasX * newZoom;
        const newPanY = screenY - canvasY * newZoom;

        updateTransform({
            zoom: newZoom,
            pan: { x: newPanX, y: newPanY }
        });

        console.log("Checking zoomLevelDisplay inside zoomAtPoint:", zoomLevelDisplay);

        if (zoomLevelDisplay) {
            zoomLevelDisplay.textContent = `${Math.round(newZoom * 100)}%`;
        }
    }

    // --- Pan Logic ---
    function handlePointerDown(event) {
        isPointerDown = true;
        wasPanning = false; // Reset wasPanning on new interaction
        pointerStart.x = event.clientX;
        pointerStart.y = event.clientY;
        lastPanPoint = { ...transform.pan };
    }

    function handlePointerMove(event) {
        if (!isPointerDown) return;

        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;

        if (!isPanning && (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD)) {
            isPanning = true;
        }

        if (isPanning) {
            updateCursor(); // to 'grabbing'
            updateTransform({
                zoom: transform.zoom,
                pan: {
                    // For a scale-then-translate model, pan is in screen space, so we just add the delta.
                    x: lastPanPoint.x + dx,
                    y: lastPanPoint.y + dy
                }
            });
        }
    }

    function handlePointerUp(event) {
        // If we were panning, flag it to suppress the upcoming click.
        if (isPanning) {
            wasPanning = true;
        }

        isPointerDown = false;
        isPanning = false;
        updateCursor();

        // Dispatch a generic click event that can be suppressed by the capturing listener.
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY
        });
        canvas.dispatchEvent(clickEvent);
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
            event.preventDefault(); // Prevent page scroll
        } else if (event.touches.length === 1) {
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
    zoomInButton.addEventListener('click', () => {
        zoomAtPoint(viewer.clientWidth / 2, viewer.clientHeight / 2, 1.25);
    });

    zoomOutButton.addEventListener('click', () => {
        zoomAtPoint(viewer.clientWidth / 2, viewer.clientHeight / 2, 1 / 1.25);
    });

    zoomResetButton.addEventListener('click', () => {
        updateTransform({ zoom: 1.0, pan: { x: 0, y: 0 } });
        if (zoomLevelDisplay) zoomLevelDisplay.textContent = `100%`;
    });


    // --- Registering Event Listeners ---
    viewer.addEventListener('wheel', handleWheelZoom, { passive: false });
    viewer.addEventListener('mousedown', handlePointerDown);
    viewer.addEventListener('mousemove', handlePointerMove);
    viewer.addEventListener('mouseup', handlePointerUp);
    // Add a capturing click listener to suppress unwanted annotation triggers
    canvas.addEventListener('click', handleSuppression, true);

    // Touch Events
    viewer.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewer.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewer.addEventListener('touchend', handleTouchEnd);
    viewer.addEventListener('touchcancel', handleTouchEnd);

    // Initial setup
    updateCursor();
}
