/**
 * Initializes viewer controls for zooming and panning.
 * @param {HTMLDivElement} viewer The main container for the PDF viewer.
 * @param {HTMLCanvasElement} canvas The canvas element for PDF rendering.
 * @param {function} onTransformChange A function to call to re-render the canvas with new transformations.
 * @param {function} getCurrentTool A function that returns the currently active tool ('pan' or 'comment').
 */
export function initializeViewerControls(viewer, canvas, onTransformChange, getCurrentTool) {
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
    let pointerStart = { x: 0, y: 0 };
    let lastPanPoint = { x: 0, y: 0 };

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
        // Mouse position relative to the viewer
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // The point on the canvas that the mouse is over
        const canvasX = (mouseX / transform.zoom) - transform.pan.x;
        const canvasY = (mouseY / transform.zoom) - transform.pan.y;

        const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, transform.zoom * zoomFactor));

        // New pan is calculated to keep the same canvas point under the mouse
        const newPanX = (mouseX / newZoom) - canvasX;
        const newPanY = (mouseY / newZoom) - canvasY;


        updateTransform({
            zoom: newZoom,
            pan: { x: newPanX, y: newPanY }
        });
    }

    // --- Pan Logic ---
    function handlePointerDown(event) {
        isPointerDown = true;
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
                    // Pan needs to be scaled by the current zoom level
                    x: lastPanPoint.x + dx / transform.zoom,
                    y: lastPanPoint.y + dy / transform.zoom
                }
            });
        }
    }

    function handlePointerUp(event) {
        // Only dispatch a click for annotation if the comment tool is active and it wasn't a pan
        if (!isPanning && getCurrentTool() === 'comment') {
            // It's a click, not a drag. Dispatch a custom event for annotations.
            const annotationClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY
            });
            canvas.dispatchEvent(annotationClickEvent);
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

            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, transform.zoom * zoomFactor));
            const newPanX = transform.pan.x - (centerX - transform.pan.x) * (newZoom / transform.zoom - 1);
            const newPanY = transform.pan.y - (centerY - transform.pan.y) * (newZoom / transform.zoom - 1);

            updateTransform({ zoom: newZoom, pan: { x: newPanX, y: newPanY } });

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
        handleWheelZoom({ preventDefault: () => {}, deltaY: -1, clientX: viewer.clientWidth / 2, clientY: viewer.clientHeight / 2 });
    });

    zoomOutButton.addEventListener('click', () => {
        handleWheelZoom({ preventDefault: () => {}, deltaY: 1, clientX: viewer.clientWidth / 2, clientY: viewer.clientHeight / 2 });
    });

    zoomResetButton.addEventListener('click', () => {
        updateTransform({ zoom: 1.0, pan: { x: 0, y: 0 } });
    });


    // --- Registering Event Listeners ---
    viewer.addEventListener('wheel', handleWheelZoom, { passive: false });
    viewer.addEventListener('mousedown', handlePointerDown);
    viewer.addEventListener('mousemove', handlePointerMove);
    viewer.addEventListener('mouseup', handlePointerUp);

    // Touch Events
    viewer.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewer.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewer.addEventListener('touchend', handleTouchEnd);
    viewer.addEventListener('touchcancel', handleTouchEnd);

    // Initial setup
    updateCursor();
}
