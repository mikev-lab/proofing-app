// js/viewer.js - Shared PDF Viewer Logic

import * as pdfjsLib from "https://mozilla.github.io/pdf.js/build/pdf.mjs";
import { initializeAnnotations } from './annotations.js';
import { initializeViewerControls } from './viewerControls.js';

// Set worker source for PDF.js once
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://mozilla.github.io/pdf.js/build/pdf.worker.mjs";

/**
 * Initializes the shared PDF viewer functionality.
 * @param {object} config - The configuration object.
 * @param {object} config.db - The Firestore database instance.
 * @param {object} config.auth - The Firebase Auth instance.
 * @param {string} config.projectId - The ID of the project to load.
 * @param {object} config.projectData - The initial project data from Firestore.
 * @param {boolean} [config.isAdmin=false] - Flag to determine if this is the admin view.
 * @param {boolean} [config.isGuest=false] - Flag to determine if the user is a guest.
 * @param {object} [config.guestPermissions={}] - The permissions object for the guest.
 */
export async function initializeSharedViewer(config) {
    const { db, auth, projectId, projectData, isAdmin = false, isGuest = false, guestPermissions = {} } = config;

    // Get DOM elements
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const pageNumSpan = document.getElementById('page-num');
    const pageCountSpan = document.getElementById('page-count');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const navigationControls = document.getElementById('navigation-controls');
    const zoomLevelDisplay = document.getElementById('zoom-level-display');
    const toolPanButton = document.getElementById('tool-pan');
    const toolCommentButton = document.getElementById('tool-comment');
    const renderingThrobber = document.getElementById('rendering-throbber');
    const thumbnailList = document.getElementById('thumbnail-list');
    const commentsSection = document.getElementById('comments-section');

    // Guide UI elements
    const guidesSection = document.getElementById('guides-section');
    const viewModeSelect = document.getElementById('view-mode-select');
    const showTrimGuideCheckbox = document.getElementById('show-trim-guide');
    const showBleedGuideCheckbox = document.getElementById('show-bleed-guide');
    const showSafetyGuideCheckbox = document.getElementById('show-safety-guide');

    // Version switching dropdown for admin
    const versionSelector = document.getElementById('version-selector');

    // Preflight check UI elements
    const preflightResultsContainer = document.getElementById('preflight-results-container');
    const preflightStatusMessage = document.getElementById('preflight-status-message');
    const preflightIssuesList = document.getElementById('preflight-issues-list');
    const preflightDataList = document.getElementById('preflight-data-list');

    // Tab elements
    const viewerTabs = document.getElementById('viewer-tabs');
    const internalsTab = document.getElementById('internals-tab');
    const coverTab = document.getElementById('cover-tab');
    let currentView = 'internals'; // 'internals' or 'cover'

    // Dynamically imported module
    let guidesModule = null;

    // Update projectSpecs based on the potentially updated projectData passed in
    let projectSpecs = projectData.specs;


    // PDF.js state
    let pdfDoc = null;
    let pageNum = 1; // Represents the current page OR view number
    let currentViewMode = 'single'; // Default view mode
    let pageRendering = false;
    let pageNumPending = null;
    let onPageRenderedCallback = () => {};
    const pdfPageCache = {}; // Cache for PDFPageProxy objects
    const renderedThumbnails = new Set(); // Keep track of rendered thumbnails

    // --- NEW: Document Cache to prevent re-downloading ---
    const documentCache = new Map();

    // App state
    let currentTool = 'pan'; // 'pan' or 'comment'

    // State managed by viewerControls
    let transformState = { zoom: 1.0, pan: { x: 0, y: 0 } };
    
    // Initialize Tooltip Element
    let guideTooltip = document.getElementById('guide-tooltip');
    if (!guideTooltip) {
        guideTooltip = document.createElement('div');
        guideTooltip.id = 'guide-tooltip';
        guideTooltip.className = 'fixed z-50 hidden max-w-xs bg-slate-900/95 backdrop-blur-sm text-white text-sm p-3 rounded-lg shadow-xl border border-slate-600 pointer-events-none transition-opacity duration-150';
        document.body.appendChild(guideTooltip);
    }

    let viewRenderInfo = { x: 0, y: 0, width: 0, height: 0, scale: 1.0 }; // Overall info for the current view
    let pageRenderInfos = []; // Array of render info for *each page* within the current view
    let hiddenCanvas = document.createElement('canvas'); // Used for main rendering compositing
    let currentlyLoadedURL = null; // Keep track of the currently loaded URL

    // [NEW] Add mousemove listener for guide tooltips
    if (pdfCanvas) {
        pdfCanvas.addEventListener('mousemove', (e) => {
            // 1. Check if we have guide module and render info
            if (!guidesModule || !pageRenderInfos.length || !projectSpecs) return;

            // 2. Calculate mouse position in "Viewer World Space"
            const rect = pdfCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; // CSS Pixels
            const mouseY = e.clientY - rect.top;  // CSS Pixels

            // Apply inverse transform: (x - pan) / zoom
            // Note: We do NOT multiply by devicePixelRatio here because pageRenderInfos 
            // and transformState are already tracked in logical CSS pixels.
            const worldX = (mouseX - transformState.pan.x) / transformState.zoom;
            const worldY = (mouseY - transformState.pan.y) / transformState.zoom;

            // 3. Get current guide options
            const guideOptions = {
                trim: showTrimGuideCheckbox?.checked ?? true,
                bleed: showBleedGuideCheckbox?.checked ?? true,
                safety: showSafetyGuideCheckbox?.checked ?? true
            };

            // 4. Check for hit
            const hit = guidesModule.getGuideHit(worldX, worldY, projectSpecs, pageRenderInfos, guideOptions);

            // 5. Show or hide tooltip
            if (hit) {
                guideTooltip.innerHTML = `<strong>${hit.title}</strong><br/><span class="text-gray-300 text-xs">${hit.description}</span>`;
                // Add a small offset so the tooltip doesn't block the cursor
                guideTooltip.style.left = `${e.clientX + 15}px`;
                guideTooltip.style.top = `${e.clientY + 15}px`;
                guideTooltip.classList.remove('hidden');
                pdfCanvas.style.cursor = 'help'; 
            } else {
                guideTooltip.classList.add('hidden');
                // Restore cursor based on current tool
                pdfCanvas.style.cursor = currentTool === 'pan' ? (transformState.zoom > 1 ? 'grab' : 'default') : 'default';
            }
        });

        // Hide tooltip on mouse leave
        pdfCanvas.addEventListener('mouseleave', () => {
            if(guideTooltip) guideTooltip.classList.add('hidden');
        });
    }

    /**
     * Determines which page numbers to display for a given view.
     */
    function getPagesForView(viewNumber, totalPages) {
        if (currentViewMode === 'single' || !totalPages) {
            return [viewNumber];
        }
        if (viewNumber === 1) return [1]; // First page/cover is always single
        // Special case for the last page if total pages (excluding cover) is odd
        const isLastView = viewNumber === getViewCount(totalPages);
        const hasOddPages = (totalPages - 1) % 2 !== 0;
        if (isLastView && hasOddPages) {
            return [totalPages]; // Last page is single if odd number of pages after cover
        }

        const page1 = (viewNumber - 2) * 2 + 2; // Calculate the first page of the spread
        const page2 = page1 + 1; // Calculate the second page of the spread
        const pages = [];
        if (page1 <= totalPages) pages.push(page1);
        if (page2 <= totalPages) pages.push(page2);
        // Handle Right-to-Left reading order if specified and it's a spread
        if (projectSpecs && projectSpecs.readingDirection === 'rtl' && pages.length > 1) {
            return pages.reverse(); // Reverse for RTL spreads
        }
        return pages;
    }


    /**
     * Calculates the total number of views based on the current mode.
     */
    function getViewCount(totalPages) {
        if (currentViewMode === 'single' || !totalPages) {
            return totalPages; // Single view count matches page count
        }
        // In spread mode, the first page is one view, subsequent pages are grouped in twos
        return totalPages > 1 ? 1 + Math.ceil((totalPages - 1) / 2) : 1;
    }

    /**
     * Renders the list of thumbnails in the left column.
     */
    async function renderThumbnailList() {
        if (!pdfDoc || !thumbnailList) return;

        thumbnailList.innerHTML = ''; // Clear existing thumbnails
        renderedThumbnails.clear(); // Clear the set tracking rendered thumbnails

        const totalViews = getViewCount(pdfDoc.numPages); // Use actual page count for view calculation

        // Determine a standard aspect ratio for spread thumbnails for consistency
        let standardSpreadAspectRatio = 1.0; // Default fallback
        if (currentViewMode === 'spread' && pdfDoc.numPages > 1) {
             try {
                // Use pages 2 and 3 if available, otherwise 1 and 2, or just 1
                const page1Idx = pdfDoc.numPages >= 2 ? 2 : 1;
                const page2Idx = pdfDoc.numPages >= 3 ? 3 : (pdfDoc.numPages >= 2 ? 2 : 1);
                const page1 = await pdfDoc.getPage(page1Idx);
                const page2 = await pdfDoc.getPage(page2Idx);
                const vp1 = page1.getViewport({ scale: 1 });
                const vp2 = page2.getViewport({ scale: 1 });
                 if (page1Idx !== page2Idx) { // If we have two different pages for the spread
                    const bleedPt = (projectSpecs?.bleedInches || 0) * 72;
                    // Aspect ratio based on *visual* width (subtracting inner bleeds)
                    standardSpreadAspectRatio = (vp1.width + vp2.width - 2 * bleedPt) / Math.max(vp1.height, vp2.height);
                 } else { // If only one page available for aspect ratio calculation
                    standardSpreadAspectRatio = vp1.width / vp1.height;
                 }
             } catch(e) {
                console.warn("Could not calculate spread aspect ratio, using default.", e);
             }
        }



        for (let i = 1; i <= totalViews; i++) {
            const pagesIndices = getPagesForView(i, pdfDoc.numPages);
            if (pagesIndices.length === 0 || pagesIndices[0] > pdfDoc.numPages) continue;

            const pagesStr = pagesIndices.join('-');

            let aspectRatio;
            if (currentViewMode === 'spread') {
                // In spread mode, ALWAYS use the calculated spread aspect ratio
                // for all thumbnails to maintain consistent height.
                aspectRatio = standardSpreadAspectRatio;
            } else { // 'single' view mode
                // Calculate aspect ratio based on the single page's natural dimensions
                const page = await pdfDoc.getPage(pagesIndices[0]);
                const viewport = page.getViewport({ scale: 1.0 });
                aspectRatio = viewport.width / viewport.height;
            }

            const thumbItem = document.createElement('div');
            thumbItem.className = 'thumbnail-item p-2 rounded-md border-2 border-transparent hover:border-indigo-400 cursor-pointer';
            thumbItem.dataset.view = i;

            thumbItem.innerHTML = `
                <div class="bg-black/20 flex items-center justify-center rounded-sm overflow-hidden" style="aspect-ratio: ${aspectRatio || 1}">
                     <canvas class="w-full h-full object-contain"></canvas>
                </div>
                <p class="text-center text-xs mt-2">Page ${pagesStr || 'Blank'}</p>
            `;
            thumbnailList.appendChild(thumbItem);
        }

        let scrollTimeout;
        thumbnailList.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(loadVisibleThumbnails, 150);
        });

        loadVisibleThumbnails();
    }

    /**
     * Checks which thumbnails are visible and triggers their rendering.
     */
    function loadVisibleThumbnails() {
        const items = thumbnailList.querySelectorAll('.thumbnail-item');
        const containerTop = thumbnailList.scrollTop;
        const containerBottom = containerTop + thumbnailList.clientHeight;

        items.forEach(item => {
            const view = parseInt(item.dataset.view, 10);
            const buffer = 200;
            if (item.offsetTop < containerBottom + buffer && item.offsetTop + item.offsetHeight > containerTop - buffer) {
                 if (!renderedThumbnails.has(view)) {
                    loadAndRenderThumbnail(view);
                }
            }
        });
    }

    /**
     * Loads and renders a specific thumbnail view using temporary canvases, reusing main render logic.
     */
    async function loadAndRenderThumbnail(viewNumber) {
        if (!pdfDoc || renderedThumbnails.has(viewNumber)) return;

        renderedThumbnails.add(viewNumber);
        const thumbItem = thumbnailList.querySelector(`.thumbnail-item[data-view='${viewNumber}']`);
        if (!thumbItem) return;

        const canvas = thumbItem.querySelector('canvas'); // The target canvas in the DOM
        if (!canvas) return;
        const targetContext = canvas.getContext('2d');
        const pagesToRenderIndices = getPagesForView(viewNumber, pdfDoc.numPages);

        if (pagesToRenderIndices.length === 0 || pagesToRenderIndices[0] > pdfDoc.numPages) {
            renderedThumbnails.add(viewNumber); // Mark as 'rendered' even if blank
            return;
        }

        try {
            const pages = await Promise.all(
                pagesToRenderIndices.map(num => {
                    if (num > pdfDoc.numPages) return null;
                    if (pdfPageCache[num]) return Promise.resolve(pdfPageCache[num]);
                    return pdfDoc.getPage(num).then(page => (pdfPageCache[num] = page, page));
                })
            ).then(results => results.filter(p => p !== null));

            if (pages.length === 0) {
                console.warn(`No valid pages for thumbnail view ${viewNumber}`);
                return;
            }

            const placeholder = thumbItem.querySelector('div[style*="aspect-ratio"]');
            if (!placeholder) return;
            let targetWidth = placeholder.clientWidth;
            let targetHeight = placeholder.clientHeight;
             // Retry getting dimensions if initially zero
            if (targetWidth <= 0 || targetHeight <= 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
                targetWidth = placeholder.clientWidth;
                targetHeight = placeholder.clientHeight;
            }
            if (targetWidth <= 0 || targetHeight <= 0) {
                 console.warn(`Placeholder for thumbnail view ${viewNumber} still has zero dimensions.`);
                 renderedThumbnails.delete(viewNumber); // Allow retry
                 return;
            }

            // Determine render scale for high quality rendering onto the intermediate canvas
            // We aim for roughly double the target display size for sharpness
            const THUMBNAIL_RENDER_SCALE_FACTOR = 2.0;
            const tempRenderScale = THUMBNAIL_RENDER_SCALE_FACTOR; // Render at a higher resolution initially

            const viewports = pages.map(p => p.getViewport({ scale: tempRenderScale }));
            const isSpread = currentViewMode === 'spread' && pages.length > 1;
            const bleedPt = (projectSpecs?.bleedInches || 0) * 72;
            const scaledBleed = bleedPt * tempRenderScale; // Bleed scaled for the temp render

            // --- Render pages with clipping onto an intermediate canvas (like hiddenCanvas in renderPage) ---
            const pageCanvases = await Promise.all(pages.map(async (page, i) => {
                const viewport = viewports[i];
                const pageCanvas = document.createElement('canvas'); // Temp canvas per page
                pageCanvas.width = viewport.width;
                pageCanvas.height = viewport.height;
                const pageCtx = pageCanvas.getContext('2d');
                await page.render({ canvasContext: pageCtx, viewport: viewport }).promise;

                let sourceX = 0;
                let sourceWidth = viewport.width;
                if (isSpread) {
                    sourceWidth -= scaledBleed;
                    if (i === 1) { // Right page
                        sourceX = scaledBleed;
                    }
                }
                return { canvas: pageCanvas, sourceX, sourceWidth, destWidth: sourceWidth, destHeight: viewport.height };
            }));

            // Composite onto a single intermediate canvas
            const intermediateTotalWidth = pageCanvases.reduce((sum, pc) => sum + pc.destWidth, 0);
            const intermediateMaxHeight = Math.max(...viewports.map(vp => vp.height));
            const intermediateCanvas = document.createElement('canvas');
            intermediateCanvas.width = intermediateTotalWidth;
            intermediateCanvas.height = intermediateMaxHeight;
            const intermediateContext = intermediateCanvas.getContext('2d');
            intermediateContext.clearRect(0, 0, intermediateCanvas.width, intermediateCanvas.height);

            let currentX = 0;
            for (const pageCanvasInfo of pageCanvases) {
                const offsetY = (intermediateMaxHeight - pageCanvasInfo.destHeight) / 2;
                intermediateContext.drawImage(
                    pageCanvasInfo.canvas,
                    pageCanvasInfo.sourceX, 0, pageCanvasInfo.sourceWidth, pageCanvasInfo.destHeight,
                    currentX, offsetY, pageCanvasInfo.destWidth, pageCanvasInfo.destHeight
                );
                currentX += pageCanvasInfo.destWidth;
            }
            // --- End intermediate canvas rendering ---


            // --- Draw the intermediate canvas onto the final thumbnail canvas, scaled to fit ---
            const finalScale = Math.min(targetWidth / (intermediateTotalWidth / tempRenderScale), targetHeight / (intermediateMaxHeight / tempRenderScale));
            const finalWidth = (intermediateTotalWidth / tempRenderScale) * finalScale;
            const finalHeight = (intermediateMaxHeight / tempRenderScale) * finalScale;

            const pixelRatio = window.devicePixelRatio || 1;
            canvas.width = targetWidth * pixelRatio;
            canvas.height = targetHeight * pixelRatio;
            targetContext.scale(pixelRatio, pixelRatio);
            targetContext.clearRect(0, 0, targetWidth, targetHeight);

            const finalDrawX = (targetWidth - finalWidth) / 2;
            const finalDrawY = (targetHeight - finalHeight) / 2;

            if (intermediateCanvas.width > 0 && intermediateCanvas.height > 0) {
                 targetContext.drawImage(intermediateCanvas,
                                    0, 0, intermediateCanvas.width, intermediateCanvas.height, // Source: full intermediate canvas
                                    finalDrawX, finalDrawY, finalWidth, finalHeight); // Destination: scaled and centered
            } else {
                 console.warn(`Skipping final draw for thumbnail view ${viewNumber} due to zero intermediate canvas dimensions.`);
            }

        } catch (error) {
            console.error(`Failed to render thumbnail for view ${viewNumber}:`, error);
            renderedThumbnails.delete(viewNumber);
        }
    }


    /**
     * Loads a PDF document from a URL, with CACHING.
     */
    async function loadPdf(pdfUrl) {
        try {
            renderingThrobber.classList.remove('hidden'); // Show loading indicator
            
            // --- UPDATED CACHING LOGIC ---
            // Reset current pdfDoc reference and page cache, but do NOT destroy the document
            // if we intend to keep it in the cache.
            pdfDoc = null; 
            Object.keys(pdfPageCache).forEach(key => delete pdfPageCache[key]); // Clear page cache

            // Dynamically import guides module if not already loaded
            if (!guidesModule) {
                guidesModule = await import('./guides.js');
            }
            if (guidesSection) guidesSection.classList.remove('hidden'); // Show guides section

            if (documentCache.has(pdfUrl)) {
                console.log("Loading PDF from cache:", pdfUrl.substring(0, 50) + '...');
                pdfDoc = await documentCache.get(pdfUrl);
            } else {
                console.log("Loading PDF from URL:", pdfUrl.substring(0, 50) + '...');
                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                
                // Cache the promise immediately
                documentCache.set(pdfUrl, loadingTask.promise);
                
                pdfDoc = await loadingTask.promise;
            }

            // Check if pdfDoc was successfully loaded
            if (!pdfDoc) throw new Error("PDF document loading failed or returned null.");

            currentlyLoadedURL = pdfUrl; // Update the tracking variable
            console.log("PDF loaded successfully.");

            // Optional: Implement simple cache cleanup (e.g. keep max 3 docs)
            if (documentCache.size > 3) {
                 const oldestKey = documentCache.keys().next().value;
                 if (oldestKey !== pdfUrl) {
                     const oldDoc = await documentCache.get(oldestKey);
                     if (oldDoc && typeof oldDoc.destroy === 'function') oldDoc.destroy();
                     documentCache.delete(oldestKey);
                 }
            }

            const totalViews = getViewCount(pdfDoc.numPages);
            pageCountSpan.textContent = totalViews; // Update total views display
            navigationControls.classList.remove('hidden'); // Show navigation controls
            pageNum = 1; // Reset to the first view
            transformState = { zoom: 1.0, pan: { x: 0, y: 0 } }; // Reset zoom/pan
            if (zoomLevelDisplay) zoomLevelDisplay.textContent = `${Math.round(transformState.zoom * 100)}%`; // Reset zoom display

            await renderThumbnailList(); // Render thumbnails for the new document
            queueRenderPage(pageNum); // Render the first page/view

        } catch (error) {
            console.error("Error loading PDF:", error);
            // If loading failed, remove from cache so we can retry later
            documentCache.delete(pdfUrl);
            
            pdfDoc = null; // Ensure pdfDoc is null on error
            currentlyLoadedURL = null; // Reset currently loaded URL on error
            if(pdfViewer) pdfViewer.innerHTML = `<p class="text-red-400 p-4">Error loading PDF: ${error.message}</p>`;
            if (navigationControls) navigationControls.classList.add('hidden'); // Hide controls
            if (guidesSection) guidesSection.classList.add('hidden'); // Hide guides
            if (thumbnailList) thumbnailList.innerHTML = ''; // Clear thumbnails
            if (renderingThrobber) renderingThrobber.classList.add('hidden'); // Hide loading indicator
        }
    }

    /**
     * Renders a page or spread onto the main canvas.
     */
    async function renderPage(viewNumber) {
        if (!pdfDoc) {
             console.warn("renderPage called but pdfDoc is null.");
             return; // Don't proceed if pdfDoc isn't loaded
        }
        if (pageRendering) {
            // If already rendering, queue the new page number if different
            if (viewNumber !== pageNum) pageNumPending = viewNumber;
            return;
        }

        pageRendering = true;
        renderingThrobber.classList.remove('hidden'); // Show loading indicator
        pageNum = viewNumber; // Update current page/view number
        updateActiveThumbnail(viewNumber); // Highlight the corresponding thumbnail

        const pagesToRenderIndices = getPagesForView(viewNumber, pdfDoc.numPages);
        const totalViews = getViewCount(pdfDoc.numPages);
        const displayedPagesStr = pagesToRenderIndices.join('-');
        if(pageNumSpan) pageNumSpan.textContent = displayedPagesStr || viewNumber; // Update page number display
        if(pageCountSpan) pageCountSpan.textContent = totalViews; // Update total views display

        // Disable/enable navigation buttons
        if(prevPageBtn) prevPageBtn.disabled = viewNumber <= 1;
        if(nextPageBtn) nextPageBtn.disabled = !pdfDoc || viewNumber >= totalViews;

        // Handle case where view has no pages (e.g., blank page added for even spread count)
        if (pagesToRenderIndices.length === 0 || pagesToRenderIndices[0] > pdfDoc.numPages) {
            pageRendering = false;
            renderingThrobber.classList.add('hidden');
            const visibleContext = pdfCanvas.getContext('2d');
            if (visibleContext) visibleContext.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height); // Clear canvas
            if (pageNumPending !== null) { // Check if another page was queued
                const pending = pageNumPending;
                pageNumPending = null;
                queueRenderPage(pending); // Render the queued page
            }
            return;
        }

        try {
            // Fetch PDFPageProxy objects for the pages in the current view
            const pagePromises = pagesToRenderIndices.map(num => {
                if (pdfPageCache[num]) return Promise.resolve(pdfPageCache[num]); // Use cache
                return pdfDoc.getPage(num).then(page => (pdfPageCache[num] = page, page)); // Fetch and cache
            });
            const pages = await Promise.all(pagePromises);

            // Determine render scale based on device pixel ratio for clarity
            const pdfRenderScale = Math.max(1.5, (window.devicePixelRatio || 1) * 1); // Adjust multiplier as needed
            const viewports = pages.map(p => p.getViewport({ scale: pdfRenderScale }));

            // --- SPREAD MASKING LOGIC ---
            const isSpread = currentViewMode === 'spread' && pages.length > 1;
            const bleedPt = (projectSpecs?.bleedInches || 0) * 72; // 72 points per inch
            const scaledBleed = bleedPt * pdfRenderScale; // Bleed scaled for rendering

            // Render each page to a temporary canvas, then composite them onto the main hidden canvas.
            const pageCanvases = await Promise.all(pages.map(async (page, i) => {
                const viewport = viewports[i];
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const tempCtx = tempCanvas.getContext('2d');
                await page.render({ canvasContext: tempCtx, viewport: viewport }).promise;

                // Determine the source area to copy from the temp canvas
                let sourceX = 0;
                let sourceWidth = viewport.width;
                if (isSpread) {
                    sourceWidth -= scaledBleed; // Reduce source width by one bleed
                    if (i === 1) { // Right page of spread, clip from left
                        sourceX = scaledBleed; // Start copying after the inner bleed
                    }
                }
                return {
                    canvas: tempCanvas,
                    sourceX,            // X start in temp canvas (scaled pixels)
                    sourceWidth,        // Width to copy from temp canvas (scaled pixels)
                    destWidth: sourceWidth, // How much horizontal space it takes in the final composition (scaled pixels)
                    destHeight: viewport.height // Full height (scaled pixels)
                };
            }));

            // Calculate final hidden canvas dimensions from the (potentially clipped) page canvases
            const totalWidth = pageCanvases.reduce((sum, pc) => sum + pc.destWidth, 0);
            const maxHeight = Math.max(...viewports.map(vp => vp.height));

            // Set hidden canvas dimensions
            hiddenCanvas.width = totalWidth;
            hiddenCanvas.height = maxHeight;
            const hiddenContext = hiddenCanvas.getContext('2d');
            hiddenContext.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); // Clear hidden canvas

            // Draw the clipped page canvases onto the main hidden canvas
            let currentX = 0;
            for (const pageCanvasInfo of pageCanvases) {
                const offsetY = (maxHeight - pageCanvasInfo.destHeight) / 2; // Center vertically
                hiddenContext.drawImage(
                    pageCanvasInfo.canvas,
                    pageCanvasInfo.sourceX, 0, // source x, y (from temp canvas)
                    pageCanvasInfo.sourceWidth, pageCanvasInfo.destHeight, // source w, h (from temp canvas)
                    currentX, offsetY, // dest x, y (on hidden canvas)
                    pageCanvasInfo.destWidth, pageCanvasInfo.destHeight // dest w, h (on hidden canvas)
                );
                currentX += pageCanvasInfo.destWidth;
            }

            // --- Render hidden canvas onto the visible canvas ---
            const visibleContext = pdfCanvas.getContext('2d');
            const devicePixelRatio = window.devicePixelRatio || 1;
            // Set visible canvas size based on container size and pixel ratio
            pdfCanvas.width = pdfViewer.clientWidth * devicePixelRatio;
            pdfCanvas.height = pdfViewer.clientHeight * devicePixelRatio;
            // Set canvas style size to match container
            pdfCanvas.style.width = `${pdfViewer.clientWidth}px`;
            pdfCanvas.style.height = `${pdfViewer.clientHeight}px`;
            visibleContext.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height); // Clear visible canvas
            visibleContext.scale(devicePixelRatio, devicePixelRatio); // Scale context for high-res drawing
            visibleContext.save(); // Save context state before applying zoom/pan

            // --- Calculate base scale and position for the entire view ---
            // Use the dimensions from the *hidden canvas* which represent the final *visual* size
            const totalBaseWidthPts = totalWidth / pdfRenderScale; // Convert back to PDF points
            const maxBaseHeightPts = maxHeight / pdfRenderScale; // Convert back to PDF points

            const availableWidth = pdfViewer.clientWidth;
            const availableHeight = pdfViewer.clientHeight;
            // Calculate scale to fit, with padding
            const baseScale = Math.min(availableWidth / totalBaseWidthPts, availableHeight / maxBaseHeightPts) * 0.95;

            const viewWidth = totalBaseWidthPts * baseScale; // Final width on visible canvas (before zoom/pan)
            const viewHeight = maxBaseHeightPts * baseScale; // Final height on visible canvas (before zoom/pan)
            // Calculate top-left position to center the entire view
            const viewX = (availableWidth - viewWidth) / 2;
            const viewY = (availableHeight - viewHeight) / 2;

            // --- Store overall view render info ---
            viewRenderInfo = { x: viewX, y: viewY, width: viewWidth, height: viewHeight, scale: baseScale };

            // Apply current pan and zoom transformations
            visibleContext.translate(transformState.pan.x, transformState.pan.y);
            visibleContext.scale(transformState.zoom, transformState.zoom);

            // --- Draw the pre-rendered content from the hidden canvas ---
            visibleContext.drawImage(hiddenCanvas, viewX, viewY, viewWidth, viewHeight);

            // --- Calculate individual page render info (needed for guides) ---
            pageRenderInfos = []; // Reset the array
            let currentPageX = viewX; // Start at the beginning of the view's x position
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const pageBaseViewport = page.getViewport({ scale: 1.0 }); // Original page viewport at scale 1
                const scaledBaseBleed = bleedPt * baseScale;

                // Width of this specific page's *visible portion* in the final view
                let pageRenderWidth = (pageCanvases[i].destWidth / pdfRenderScale) * baseScale;
                const pageRenderHeight = pageBaseViewport.height * baseScale;
                const pageY = viewY + (viewHeight - pageRenderHeight) / 2; // Center vertically within the view

                // Determine if this page is the left or right one in the view
                // This considers LTR/RTL reading direction if specified
                let isLeft = false;
                if (pages.length > 1) { // Only relevant for spreads
                    if (projectSpecs?.readingDirection === 'rtl') {
                        isLeft = (i === 1); // In RTL, the second page in the array is the left one
                    } else {
                        isLeft = (i === 0); // In LTR, the first page is the left one
                    }
                }

                pageRenderInfos.push({
                    x: currentPageX,
                    y: pageY,
                    width: pageRenderWidth,
                    height: pageRenderHeight,
                    scale: baseScale,
                    isSpread: isSpread,
                    isLeftPage: isLeft // Pass the calculated left/right status
                });
                currentPageX += pageRenderWidth; // Move to the next page's horizontal position
            }

            // Draw guides if applicable and module is loaded
            if (projectSpecs && guidesModule) {
                const guideOptions = {
                    trim: showTrimGuideCheckbox?.checked ?? true,
                    bleed: showBleedGuideCheckbox?.checked ?? true,
                    safety: showSafetyGuideCheckbox?.checked ?? true
                };
                // Pass the array of pageRenderInfos to drawGuides
                guidesModule.drawGuides(visibleContext, projectSpecs, pageRenderInfos, guideOptions);
            }

            visibleContext.restore(); // Restore context state (removes zoom/pan)
            onPageRenderedCallback(); // Call annotation drawing callback

        } catch (err) {
            console.error("Error rendering page/spread:", err);
        } finally {
            pageRendering = false; // Mark rendering as complete
            renderingThrobber.classList.add('hidden'); // Hide loading indicator
            // If another page was requested during rendering, render it now
            if (pageNumPending !== null) {
                const pending = pageNumPending;
                pageNumPending = null;
                queueRenderPage(pending);
            }
        }
    }

    /**
     * Highlights the active thumbnail and scrolls it into view.
     */
    function updateActiveThumbnail(currentView) {
        if (!thumbnailList) return;
        const items = thumbnailList.querySelectorAll('.thumbnail-item');
        items.forEach(item => {
            const view = parseInt(item.dataset.view, 10);
            if (view === currentView) {
                item.classList.add('border-indigo-400'); // Add border highlight
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } else {
                item.classList.remove('border-indigo-400'); // Remove highlight
            }
        });
    }

    /**
     * Queues a page render if one is already in progress.
     */
    function queueRenderPage(num) {
        if (pageRendering) {
            if (num !== pageNum) pageNumPending = num;
        } else {
            renderPage(num);
        }
    }

    /**
     * Sets the active tool (pan or comment) and updates UI.
     */
    function setActiveTool(tool) {
        currentTool = tool;
        if(toolPanButton) toolPanButton.classList.toggle('bg-slate-600', tool === 'pan');
        if(toolCommentButton) toolCommentButton.classList.toggle('bg-slate-600', tool === 'comment');
        if (typeof window.updateCursor === 'function') window.updateCursor();
    }

    /**
     * Handles the logic for loading a specific version, including checking its processing status.
     * This function manipulates the DOM to show loading/error states or triggers the PDF load.
     * @param {object | null} versionData - The version object from Firestore, or null if no version exists.
     */
    function loadVersion(versionData) {
        // This function centralizes the logic for handling all possible version states.

        if (!versionData) {
            // Case where no versions exist for the project.
            if (renderingThrobber) {
                // To avoid destroying the canvas, we use the throbber overlay for this message too.
                renderingThrobber.innerHTML = '<p class="text-gray-400 p-4">No proof file available for this project yet.</p>';
                renderingThrobber.classList.remove('hidden');
            }
            if (pdfCanvas) pdfCanvas.classList.add('hidden');
            if (navigationControls) navigationControls.classList.add('hidden');
            if (guidesSection) guidesSection.classList.add('hidden');
            return;
        }

        const status = versionData.processingStatus;
        const errorMsg = versionData.processingError;

        // Case 1: PDF is processing. Show a persistent loading message.
        if (status === 'processing') {
            if (renderingThrobber) {
                renderingThrobber.innerHTML = `
                    <div class="h-10 w-10 animate-spin rounded-full border-4 border-t-indigo-400 border-indigo-900" role="status"></div>
                    <p class="mt-3 text-gray-300 text-sm">Optimizing PDF for viewing, please wait...</p>
                `;
                renderingThrobber.classList.remove('hidden');
            }
            if (pdfCanvas) pdfCanvas.classList.add('hidden');
            if (navigationControls) navigationControls.classList.add('hidden');
            if (guidesSection) guidesSection.classList.add('hidden');
            return; // The onSnapshot listener will trigger a reload when status changes.
        }

        // Case 2: PDF processing resulted in an error. Show the error message.
        if (status === 'error') {
            if (renderingThrobber) {
                renderingThrobber.innerHTML = `
                    <div class="text-center p-4">
                        <h3 class="text-lg font-semibold text-red-400">Error: PDF processing failed.</h3>
                        <p class="text-gray-300 mt-2">Details: ${errorMsg || 'No error details available.'}</p>
                    </div>
                `;
                renderingThrobber.classList.remove('hidden');
            }
            if (pdfCanvas) pdfCanvas.classList.add('hidden');
            if (navigationControls) navigationControls.classList.add('hidden');
            if (guidesSection) guidesSection.classList.add('hidden');
            return;
        }

        // Case 3: Status is 'complete' or missing (legacy). Proceed to load the PDF.
        if (pdfCanvas) pdfCanvas.classList.remove('hidden');
        if (renderingThrobber) renderingThrobber.classList.add('hidden'); // Ensure any previous message is gone.

        const urlToLoad = versionData.previewURL || versionData.fileURL;

        if (urlToLoad && urlToLoad !== currentlyLoadedURL) {
            console.log(`Loading URL for version ${versionData.version}: ${urlToLoad.substring(0, 100)}...`);
            loadPdf(urlToLoad);
        } else if (!urlToLoad) {
            console.error("No URL found for version:", versionData.version);
            if (renderingThrobber) {
                renderingThrobber.innerHTML = `
                    <div class="text-center p-4">
                        <h3 class="text-lg font-semibold text-yellow-400">File Not Found</h3>
                        <p class="text-gray-300 mt-2">A file URL for this version does not exist.</p>
                    </div>
                `;
                renderingThrobber.classList.remove('hidden');
            }
            if (pdfCanvas) pdfCanvas.classList.add('hidden');
            if (navigationControls) navigationControls.classList.add('hidden');
            if (guidesSection) guidesSection.classList.add('hidden');
        } else {
            console.log(`Version ${versionData.version} selected, but URL is the same as currently loaded. No reload needed.`);
            // If URL is the same, just ensure the main UI is visible.
            if (!pageRendering && renderingThrobber) renderingThrobber.classList.add('hidden');
            if (pdfCanvas) pdfCanvas.classList.remove('hidden');
            if (navigationControls) navigationControls.classList.remove('hidden');
            if (guidesSection) guidesSection.classList.remove('hidden');
        }
    }


    /**
     * Loads a specific version of the proof based on version number.
     */
    function loadProofByVersion(versionNumber) {
        if (!projectData || !projectData.versions) {
            console.error("Project data or versions array is missing.");
            return;
        }
        const versionData = projectData.versions.find(v => v.version === versionNumber);
        if (!versionData) {
            console.error("Version not found:", versionNumber);
            return;
        }
        // Delegate all further logic to the new centralized function.
        loadVersion(versionData);
    }

    /**
     * Displays the preflight check results for a given version.
     * @param {object | null} versionData - The version object from Firestore.
     */
    function displayPreflightResults(versionData) {
        if (!isAdmin || !preflightResultsContainer) return; // Only run for admins on the correct page

        // Clear previous results
        preflightStatusMessage.textContent = '';
        preflightIssuesList.innerHTML = '';
        preflightDataList.innerHTML = '';

        if (!versionData || !versionData.preflightStatus) {
            preflightStatusMessage.textContent = 'No preflight data available for this version.';
            return;
        }

        const { preflightStatus, preflightResults } = versionData;

        // Display issues for warnings or failures
        if ((preflightStatus === 'warning' || preflightStatus === 'failed') && preflightResults) {
            const issues = [];
            for (const key in preflightResults) {
                if (preflightResults[key].status === 'warning' || preflightResults[key].status === 'failed') {
                    issues.push(preflightResults[key].details);
                }
            }
            if (issues.length > 0) {
                issues.forEach(issue => {
                    const li = document.createElement('li');
                    li.textContent = issue;
                    preflightIssuesList.appendChild(li);
                });
            } else {
                preflightStatusMessage.textContent = 'Preflight check ran, but no specific issues were reported.';
            }
        } else if (preflightStatus === 'passed') {
            preflightStatusMessage.textContent = 'All preflight checks passed successfully.';
        }

        // Display all preflight data in a key-value format
        if (preflightResults) {
            for (const key in preflightResults) {
                const result = preflightResults[key];
                const dataElement = document.createElement('div');
                dataElement.className = 'text-sm';

                let statusIcon = '';
                let statusColor = 'text-gray-400';
                if (result.status === 'passed') {
                    statusIcon = '✅';
                    statusColor = 'text-green-400';
                } else if (result.status === 'warning') {
                    statusIcon = '⚠️';
                    statusColor = 'text-yellow-400';
                } else if (result.status === 'failed') {
                    statusIcon = '❌';
                    statusColor = 'text-red-400';
                }

                // Create a more readable title from the camelCase key
                const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

                dataElement.innerHTML = `
                    <div>
                        <strong class="text-gray-300">${title}:</strong>
                        <span class="${statusColor} font-semibold">${statusIcon} ${result.status}</span>
                    </div>
                    <div class="pl-4 text-gray-400 text-xs">${result.details || ''}</div>
                `;
                preflightDataList.appendChild(dataElement);
            }
        }
    }


    // --- Initialization ---

    // Set up initial view mode based on project specs
    const isBook = projectSpecs && (projectSpecs.binding === 'Perfect Bound' || projectSpecs.binding === 'Saddle-Stitch');
    if (isBook && viewModeSelect) {
        viewModeSelect.value = 'spread';
        currentViewMode = 'spread';
    } else if (viewModeSelect) {
        viewModeSelect.value = 'single';
        currentViewMode = 'single';
    }


    // --- Function to get guest's name ---
    function getGuestDisplayName() {
        const name = prompt("Please enter your name to leave a comment:", "Guest");
        return name || "Guest";
    }

    // --- Variable to hold annotation API ---
    let annotationsManager = null;

    // Initialize annotation functionality
    if (pdfCanvas && commentsSection) {
        annotationsManager = initializeAnnotations(
            db, auth, projectId, pdfCanvas, commentsSection,
            () => pageNum,
            queueRenderPage, 
            (callback) => { onPageRenderedCallback = callback; },
            () => transformState,
            () => viewRenderInfo,
            isGuest,
            getGuestDisplayName,
            () => currentTool,
            () => currentView // <--- NEW: Pass current context ('internals' or 'cover')
        );
    } else {
        console.warn("Could not initialize annotations: canvas or comments section missing.");
    }

    // Initialize zoom/pan controls
    if (pdfViewer && pdfCanvas && zoomLevelDisplay) {
        initializeViewerControls(
            pdfViewer, pdfCanvas,
            (newTransform) => {
                transformState = newTransform;
                queueRenderPage(pageNum);
            },
            () => currentTool,
            () => viewRenderInfo, // Pass overall view info
            zoomLevelDisplay
        );
    } else {
         console.warn("Could not initialize viewer controls: required elements missing.");
    }

    // --- Set up event listeners ---
    if (thumbnailList) {
        thumbnailList.addEventListener('click', (e) => {
            const item = e.target.closest('.thumbnail-item');
            if (item && item.dataset.view) {
                queueRenderPage(parseInt(item.dataset.view, 10));
            }
        });
    }
    if (toolPanButton) toolPanButton.addEventListener('click', () => setActiveTool('pan'));
    if (toolCommentButton) toolCommentButton.addEventListener('click', () => setActiveTool('comment'));
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (pageNum > 1) queueRenderPage(pageNum - 1); });
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => { if (pdfDoc && pageNum < getViewCount(pdfDoc.numPages)) queueRenderPage(pageNum + 1); });

    // View mode change listener
    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', async (e) => {
            currentViewMode = e.target.value;
            await renderThumbnailList();
            queueRenderPage(1); // Go back to the first view when mode changes
        });
    }

    // Guide checkbox listeners
    const guideCheckboxes = [showTrimGuideCheckbox, showBleedGuideCheckbox, showSafetyGuideCheckbox];
    guideCheckboxes.forEach(checkbox => {
        if (checkbox) {
            checkbox.addEventListener('change', () => queueRenderPage(pageNum));
        }
    });


    // Admin version selector listener
    if (isAdmin && versionSelector) {
        versionSelector.innerHTML = '';
        if (projectData && projectData.versions && projectData.versions.length > 0) {
            projectData.versions.sort((a,b) => b.version - a.version).forEach(v => {
                const option = document.createElement('option');
                option.value = v.version;

                let statusIcon = '';
                if (v.preflightStatus === 'passed') {
                    statusIcon = '✅ ';
                } else if (v.preflightStatus === 'warning') {
                    statusIcon = '⚠️ ';
                } else if (v.preflightStatus === 'failed') {
                    statusIcon = '❌ ';
                }

                const isLatest = v.version === Math.max(...projectData.versions.map(ver => ver.version));
                option.textContent = `${statusIcon}Version ${v.version}${isLatest ? ' (Latest)' : ''}`;
                versionSelector.appendChild(option);
            });
        } else {
             versionSelector.innerHTML = '<option value="">No versions available</option>';
        }
        versionSelector.addEventListener('change', (e) => {
             try {
                 const selectedVersion = parseInt(e.target.value, 10);
                 if (!isNaN(selectedVersion)) {
                     const versionData = projectData.versions.find(v => v.version === selectedVersion);
                     loadProofByVersion(selectedVersion);
                     displayPreflightResults(versionData); // Update preflight details on change
                 }
             } catch (err) {
                 console.error("Error handling version change:", err);
             }
        });
    }

    // --- Tab Logic ---
    // Check for filePath, which is present as soon as the cover is uploaded.
    if (viewerTabs && projectData.cover && projectData.cover.filePath) {
        viewerTabs.classList.remove('hidden');

        const latestVersion = projectData.versions && projectData.versions.length > 0
            ? projectData.versions.reduce((latest, v) => (v.versionNumber > latest.versionNumber ? v : latest))
            : null;

        internalsTab.addEventListener('click', () => {
            currentView = 'internals';
            projectSpecs = projectData.specs; 
            internalsTab.classList.add('border-indigo-500', 'text-indigo-400');
            internalsTab.classList.remove('border-transparent', 'text-gray-400');
            coverTab.classList.add('border-transparent', 'text-gray-400');
            coverTab.classList.remove('border-indigo-500', 'text-indigo-400');
            loadVersion(latestVersion);
            displayPreflightResults(latestVersion);
            
            // --- NEW: Refresh Annotations Sidebar ---
            if (annotationsManager) annotationsManager.refresh();
        });

        coverTab.addEventListener('click', () => {
            currentView = 'cover';
            projectSpecs = projectData.cover.specs || projectData.specs;
            coverTab.classList.add('border-indigo-500', 'text-indigo-400');
            coverTab.classList.remove('border-transparent', 'text-gray-400');
            internalsTab.classList.add('border-transparent', 'text-gray-400');
            internalsTab.classList.remove('border-indigo-500', 'text-indigo-400');
            loadVersion(projectData.cover);
            displayPreflightResults(projectData.cover);

            // --- NEW: Refresh Annotations Sidebar ---
            if (annotationsManager) annotationsManager.refresh();
        });
    }


    // --- Initial PDF Load ---
    let versionToLoad = null;
    if (projectData && projectData.versions && projectData.versions.length > 0) {
        // Find the most recent version to load by default.
        // If the admin is viewing, respect the version selector's current value.
        let targetVersionNumber;
        if (isAdmin && versionSelector && versionSelector.value) {
            try {
                targetVersionNumber = parseInt(versionSelector.value, 10);
            } catch (e) {
                // Fallback to max version if parsing fails
                targetVersionNumber = Math.max(...projectData.versions.map(v => v.version));
            }
        } else {
            // For clients or if selector isn't ready, just get the latest version number.
            targetVersionNumber = Math.max(...projectData.versions.map(v => v.version));
        }

        versionToLoad = projectData.versions.find(v => v.version === targetVersionNumber);

        // Fallback just in case find fails but versions exist.
        if (!versionToLoad) {
             versionToLoad = projectData.versions.reduce((latest, current) => (current.version > latest.version ? current : latest), projectData.versions[0]);
        }
    }

    // Delegate the entire rendering logic to the centralized function.
    // It handles all cases, including when versionToLoad is null.
    loadVersion(versionToLoad);
    displayPreflightResults(versionToLoad); // Also display preflight for initial load
}