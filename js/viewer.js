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

    // App state
    let currentTool = 'pan'; // 'pan' or 'comment'

    // State managed by viewerControls
    let transformState = { zoom: 1.0, pan: { x: 0, y: 0 } };
    let viewRenderInfo = { x: 0, y: 0, width: 0, height: 0, scale: 1.0 }; // Overall info for the current view
    let pageRenderInfos = []; // Array of render info for *each page* within the current view
    let hiddenCanvas = document.createElement('canvas');
    let currentlyLoadedURL = null; // Keep track of the currently loaded URL

    /**
     * Determines which page numbers to display for a given view.
     */
    function getPagesForView(viewNumber, totalPages) {
        if (currentViewMode === 'single' || !totalPages) {
            return [viewNumber];
        }
        if (viewNumber === 1) return [1]; // First page/cover is always single
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
                const page2Idx = pdfDoc.numPages >= 3 ? 3 : (pdfDoc.numPages >= 2 ? 2 : 1); // Use page 2 if >=2, else 1
                const page1 = await pdfDoc.getPage(page1Idx);
                const page2 = await pdfDoc.getPage(page2Idx);
                const vp1 = page1.getViewport({ scale: 1 });
                const vp2 = page2.getViewport({ scale: 1 });
                 if (page1Idx !== page2Idx) { // If we have two different pages for the spread
                    standardSpreadAspectRatio = (vp1.width + vp2.width) / Math.max(vp1.height, vp2.height);
                 } else { // If only one page available for aspect ratio calculation
                    standardSpreadAspectRatio = vp1.width / vp1.height;
                 }
             } catch(e) {
                console.warn("Could not calculate spread aspect ratio, using default.", e);
             }
        }


        for (let i = 1; i <= totalViews; i++) {
            // Get page indices for the current view
            const pagesIndices = getPagesForView(i, pdfDoc.numPages);
            // Skip if view is invalid or represents pages beyond the actual document length
            if (pagesIndices.length === 0 || pagesIndices[0] > pdfDoc.numPages) continue;

            const pagesStr = pagesIndices.join('-'); // Create string like "1" or "2-3"

            let aspectRatio;
            if (currentViewMode === 'spread') {
                 // --- Simplified spread aspect ratio logic ---
                 if (i === 1 && pagesIndices.length === 1) { // Single cover page
                     const page = await pdfDoc.getPage(1);
                     const viewport = page.getViewport({ scale: 1.0 });
                     aspectRatio = viewport.width / viewport.height;
                 } else { // All other spreads (or single last page treated as spread)
                     aspectRatio = standardSpreadAspectRatio; // Use precalculated spread ratio
                 }
                 // --- End simplified logic ---
            } else {
                // For single view, calculate dynamically for each page
                const page = await pdfDoc.getPage(pagesIndices[0]);
                const viewport = page.getViewport({ scale: 1.0 });
                aspectRatio = viewport.width / viewport.height;
            }

            // Create thumbnail item container
            const thumbItem = document.createElement('div');
            thumbItem.className = 'thumbnail-item p-2 rounded-md border-2 border-transparent hover:border-indigo-400 cursor-pointer';
            thumbItem.dataset.view = i; // Store view number

            // Set inner HTML with placeholder div and canvas
            thumbItem.innerHTML = `
                <div class="bg-black/20 flex items-center justify-center rounded-sm overflow-hidden" style="aspect-ratio: ${aspectRatio || 1}">
                     <canvas class="w-full h-full object-contain"></canvas>
                </div>
                <p class="text-center text-xs mt-2">Page ${pagesStr || 'Blank'}</p>
            `;
            thumbnailList.appendChild(thumbItem);
        }

        // Add debounced scroll handler for loading visible thumbnails
        let scrollTimeout;
        thumbnailList.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(loadVisibleThumbnails, 150); // Slightly longer debounce
        });

        // Initial load of visible thumbnails
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
            // Load thumbnails slightly outside the viewport for smoother scrolling
            const buffer = 200;
            if (item.offsetTop < containerBottom + buffer && item.offsetTop + item.offsetHeight > containerTop - buffer) {
                 if (!renderedThumbnails.has(view)) {
                    loadAndRenderThumbnail(view); // Trigger rendering if not already rendered
                }
            }
        });
    }

    /**
     * Loads and renders a specific thumbnail view using temporary canvases.
     */
    async function loadAndRenderThumbnail(viewNumber) {
        if (!pdfDoc || renderedThumbnails.has(viewNumber)) return; // Skip if already rendered or no PDF

        renderedThumbnails.add(viewNumber); // Mark as rendering started
        const thumbItem = thumbnailList.querySelector(`.thumbnail-item[data-view='${viewNumber}']`);
        if (!thumbItem) return; // Skip if item not found

        const canvas = thumbItem.querySelector('canvas');
        if (!canvas) return; // Skip if canvas not found
        const context = canvas.getContext('2d');
        const pagesToRenderIndices = getPagesForView(viewNumber, pdfDoc.numPages);
        if (pagesToRenderIndices.length === 0 || pagesToRenderIndices[0] > pdfDoc.numPages) {
            // If it's an 'empty' page placeholder (e.g., for even spread count), don't try to render
             renderedThumbnails.add(viewNumber); // Still mark as 'rendered' to avoid retries
             return;
        }


        try {
            // Fetch PDFPageProxy objects, using cache if available
            const pages = await Promise.all(
                pagesToRenderIndices.map(num => {
                    if (num > pdfDoc.numPages) return null; // Handle potential request beyond actual page count
                    if (pdfPageCache[num]) return Promise.resolve(pdfPageCache[num]);
                    return pdfDoc.getPage(num).then(page => {
                        pdfPageCache[num] = page; // Cache the page
                        return page;
                    });
                })
            ).then(results => results.filter(p => p !== null)); // Filter out nulls if a page index was invalid

             if (pages.length === 0) {
                 console.warn(`No valid pages found to render for view ${viewNumber}`);
                 return; // Exit if no valid pages were retrieved
             }


            // Use the placeholder's client rect for sizing, ensuring consistency
            const placeholder = thumbItem.querySelector('div[style*="aspect-ratio"]');
            if (!placeholder) return; // Skip if placeholder not found
            // Ensure placeholder has dimensions before proceeding
            let targetWidth = placeholder.clientWidth;
            let targetHeight = placeholder.clientHeight;

            // If dimensions are 0, try getting them after a short delay (layout might still be happening)
            if (targetWidth <= 0 || targetHeight <= 0) {
                await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms
                targetWidth = placeholder.clientWidth;
                targetHeight = placeholder.clientHeight;
            }

             if (targetWidth <= 0 || targetHeight <= 0) {
                 console.warn(`Placeholder for view ${viewNumber} still has zero dimensions after delay.`);
                 renderedThumbnails.delete(viewNumber); // Allow retry
                 return;
             }


            // Determine the combined viewport of the pages to be rendered
            const viewportsUnscaled = pages.map(p => p.getViewport({ scale: 1.0 }));
            const totalWidthUnscaled = viewportsUnscaled.reduce((sum, vp) => sum + vp.width, 0);
            const maxHeightUnscaled = Math.max(...viewportsUnscaled.map(vp => vp.height));
            if (totalWidthUnscaled === 0 || maxHeightUnscaled === 0) return; // Skip if dimensions are zero

            // Calculate scale to fit within the placeholder
            const scale = Math.min(targetWidth / totalWidthUnscaled, targetHeight / maxHeightUnscaled);
            const scaledViewports = pages.map(p => p.getViewport({ scale })); // Viewports scaled for the final layout

            // --- Render each page to a temporary canvas ---
            const tempCanvases = await Promise.all(pages.map(async (page, index) => {
                const targetViewport = scaledViewports[index]; // Use the viewport calculated for fitting
                const tempCanvas = document.createElement('canvas');
                const pixelRatio = window.devicePixelRatio || 1;
                // Set drawing size considering pixel ratio
                tempCanvas.width = Math.max(1, Math.round(targetViewport.width * pixelRatio)); // Ensure non-zero
                tempCanvas.height = Math.max(1, Math.round(targetViewport.height * pixelRatio)); // Ensure non-zero
                const tempContext = tempCanvas.getContext('2d');
                 if (!tempContext) throw new Error("Could not get 2D context for temp canvas");
                tempContext.scale(pixelRatio, pixelRatio); // Scale context for high-res

                // Get viewport scaled for rendering onto the temp canvas
                // Ensure scale isn't zero or negative
                const renderScale = Math.max(0.01, targetViewport.scale * pixelRatio);
                const renderViewport = page.getViewport({ scale: renderScale });

                await page.render({ canvasContext: tempContext, viewport: renderViewport }).promise;
                return { canvas: tempCanvas, viewport: targetViewport }; // Return canvas and final layout info
            }));

            // --- Draw temporary canvases onto the main thumbnail canvas ---
            const finalPixelRatio = window.devicePixelRatio || 1;
            canvas.width = targetWidth * finalPixelRatio;
            canvas.height = targetHeight * finalPixelRatio;
            context.scale(finalPixelRatio, finalPixelRatio);
            context.clearRect(0, 0, targetWidth, targetHeight); // Clear the main canvas

            // Recalculate centering offset based on the sum of final viewport widths
            const totalRenderWidth = tempCanvases.reduce((sum, item) => sum + item.viewport.width, 0);
            let currentX = (targetWidth - totalRenderWidth) / 2; // Center horizontally

            for (const item of tempCanvases) {
                const tempCanvas = item.canvas;
                const viewport = item.viewport;
                const offsetY = (targetHeight - viewport.height) / 2; // Center vertically

                // Draw the rendered temp canvas onto the main canvas
                 if (tempCanvas.width > 0 && tempCanvas.height > 0) { // Avoid drawing 0-size images
                    context.drawImage(tempCanvas, currentX, offsetY, viewport.width, viewport.height);
                 } else {
                     console.warn(`Skipping drawing temp canvas for view ${viewNumber} due to zero dimensions.`);
                 }
                currentX += viewport.width; // Move to the next position
            }

        } catch (error) {
            console.error(`Failed to render thumbnail for view ${viewNumber}:`, error);
            renderedThumbnails.delete(viewNumber); // Allow retrying if rendering failed
        }
    }


    /**
     * Loads a PDF document from a URL.
     */
    async function loadPdf(pdfUrl) {
        try {
            renderingThrobber.classList.remove('hidden'); // Show loading indicator
            // Safely destroy previous document instance if exists
            if (pdfDoc && typeof pdfDoc.destroy === 'function') {
                await pdfDoc.destroy().catch(e => console.warn("Error destroying previous pdfDoc:", e));
            }
            pdfDoc = null; // Reset pdfDoc
            Object.keys(pdfPageCache).forEach(key => delete pdfPageCache[key]); // Clear page cache

            // Dynamically import guides module if not already loaded
            if (!guidesModule) {
                guidesModule = await import('./guides.js');
            }
            if (guidesSection) guidesSection.classList.remove('hidden'); // Show guides section

            // Load the new PDF document
            console.log("Loading PDF from:", pdfUrl.substring(0, 100) + '...');
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            pdfDoc = await loadingTask.promise;

            // Check if pdfDoc was successfully loaded
            if (!pdfDoc) throw new Error("PDF document loading failed or returned null.");

            currentlyLoadedURL = pdfUrl; // Update the tracking variable
            console.log("PDF loaded successfully. Currently loaded URL updated.");

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
            // Get viewports scaled for high-resolution rendering to hidden canvas
            const viewports = pages.map(p => p.getViewport({ scale: pdfRenderScale }));
            const totalWidth = viewports.reduce((sum, vp) => sum + vp.width, 0);
            const maxHeight = Math.max(...viewports.map(vp => vp.height));

            // Set hidden canvas dimensions
            hiddenCanvas.width = totalWidth;
            hiddenCanvas.height = maxHeight;
            const hiddenContext = hiddenCanvas.getContext('2d');
            hiddenContext.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); // Clear hidden canvas

            // Render pages side-by-side onto the hidden canvas
            let currentX = 0;
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const viewport = viewports[i];
                // Center vertically if pages have different heights (less common)
                const offsetY = (maxHeight - viewport.height) / 2;
                hiddenContext.save();
                hiddenContext.translate(currentX, offsetY);
                await page.render({ canvasContext: hiddenContext, viewport: viewport }).promise;
                hiddenContext.restore();
                currentX += viewport.width; // Move to next page position
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
            const baseViewports = pages.map(p => p.getViewport({ scale: 1.0 }));
            const totalBaseWidth = baseViewports.reduce((sum, vp) => sum + vp.width, 0);
            const maxBaseHeight = Math.max(...baseViewports.map(vp => vp.height));
            const availableWidth = pdfViewer.clientWidth;
            const availableHeight = pdfViewer.clientHeight;
            // Calculate scale to fit, with padding
            const baseScale = Math.min(availableWidth / totalBaseWidth, availableHeight / maxBaseHeight) * 0.95;
            const viewWidth = totalBaseWidth * baseScale;
            const viewHeight = maxBaseHeight * baseScale;
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

            // --- Calculate individual page render info ---
            pageRenderInfos = []; // Reset the array
            let currentPageX = viewX; // Start at the beginning of the view's x position
            for (let i = 0; i < baseViewports.length; i++) {
                const pageBaseViewport = baseViewports[i];
                const pageWidth = pageBaseViewport.width * baseScale;
                const pageHeight = pageBaseViewport.height * baseScale;
                // Center each page vertically within the max height of the view
                const pageY = viewY + (viewHeight - pageHeight) / 2;

                pageRenderInfos.push({
                    x: currentPageX,
                    y: pageY,
                    width: pageWidth,
                    height: pageHeight,
                    scale: baseScale // Use the same base scale for guides
                });
                currentPageX += pageWidth; // Move to the next page's horizontal position
            }


            // Draw guides if applicable and module is loaded
            if (projectSpecs && guidesModule) {
                const guideOptions = {
                    trim: showTrimGuideCheckbox?.checked ?? true, // Default to true if element doesn't exist
                    bleed: showBleedGuideCheckbox?.checked ?? true,
                    safety: showSafetyGuideCheckbox?.checked ?? true
                };
                // Pass pageRenderInfos (array) to drawGuides
                guidesModule.drawGuides(visibleContext, projectSpecs, pageRenderInfos, guideOptions);
            }

            visibleContext.restore(); // Restore context state (removes zoom/pan)
            onPageRenderedCallback(); // Call annotation drawing callback

        } catch (err) {
            console.error("Error rendering page/spread:", err);
            // Optionally display error on canvas or elsewhere
            // pdfViewer.innerHTML = `<p class="text-red-400 p-4">Error rendering PDF: ${err.message}</p>`;
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
                // Scroll into view smoothly, ensuring it's visible
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
            // If a render is ongoing, queue the new page number if it's different
            if (num !== pageNum) pageNumPending = num;
        } else {
            // If no render is ongoing, start rendering the requested page
            renderPage(num);
        }
    }

    /**
     * Sets the active tool (pan or comment) and updates UI.
     */
    function setActiveTool(tool) {
        currentTool = tool;
        // Toggle background highlight for active tool button
        if(toolPanButton) toolPanButton.classList.toggle('bg-slate-600', tool === 'pan');
        if(toolCommentButton) toolCommentButton.classList.toggle('bg-slate-600', tool === 'comment');
        // Update cursor style via global function (defined in viewerControls.js)
        if (typeof window.updateCursor === 'function') window.updateCursor();
    }

    /**
     * Loads a specific version of the proof based on version number.
     */
    function loadProofByVersion(versionNumber) {
        if (!projectData || !projectData.versions) {
            console.error("Project data or versions array is missing.");
            return;
        }
        // Find the version data matching the requested version number
        const versionData = projectData.versions.find(v => v.version === versionNumber);
        if (!versionData) {
            console.error("Version not found:", versionNumber);
            return;
        }

        // Prefer previewURL if available, otherwise use fileURL
        let urlToLoad = versionData.previewURL || versionData.fileURL;

        // Only reload if the URL has changed and is valid
        if (urlToLoad && urlToLoad !== currentlyLoadedURL) {
            console.log(`Switching to version ${versionNumber}. Loading URL: ${urlToLoad.substring(0, 100)}...`);
            loadPdf(urlToLoad); // Load the PDF from the selected version's URL
        } else if (!urlToLoad) {
             console.error("No URL found for version:", versionNumber);
             if (pdfViewer) pdfViewer.innerHTML = `<p class="text-red-400 p-4">Could not find file for version ${versionNumber}.</p>`;
             if (navigationControls) navigationControls.classList.add('hidden');
             if (guidesSection) guidesSection.classList.add('hidden');
        } else {
             console.log(`Version ${versionNumber} selected, but URL is the same as currently loaded. No reload.`);
        }
    }

    // --- Initialization ---

    // Set up initial view mode based on project specs (if available)
    const isBook = projectSpecs && (projectSpecs.binding === 'Perfect Bound' || projectSpecs.binding === 'Saddle-Stitch');
    if (isBook && viewModeSelect) {
        viewModeSelect.value = 'spread';
        currentViewMode = 'spread';
    } else if (viewModeSelect) {
        viewModeSelect.value = 'single';
        currentViewMode = 'single';
    }


    // --- NEW: Function to get guest's name ---
    function getGuestDisplayName() {
        // Simple prompt, can be replaced with a more robust modal
        const name = prompt("Please enter your name to leave a comment:", "Guest");
        return name || "Guest"; // Default to "Guest" if prompt is empty or cancelled
    }

    // Initialize annotation functionality
    if (pdfCanvas && commentsSection) {
        initializeAnnotations(
            db, auth, projectId, pdfCanvas, commentsSection,
            () => pageNum, // Function to get current view number
            () => queueRenderPage(pageNum), // Function to trigger rerender
            (callback) => { onPageRenderedCallback = callback; }, // Set annotation drawing callback
            () => transformState, // Get current zoom/pan
            () => viewRenderInfo, // Get PDF render position/size info for the whole view
            isGuest, // Pass guest status
            getGuestDisplayName // Pass function to get guest name
        );
    } else {
        console.warn("Could not initialize annotations: canvas or comments section missing.");
    }

    // Initialize zoom/pan controls
    if (pdfViewer && pdfCanvas && zoomLevelDisplay) {
        initializeViewerControls(
            pdfViewer, pdfCanvas,
            (newTransform) => { // Callback on transform change
                transformState = newTransform;
                queueRenderPage(pageNum); // Rerender with new zoom/pan
            },
            () => currentTool, // Function to get current tool
            // Pass overall viewRenderInfo for controls
            () => viewRenderInfo, // Get PDF render position/size info for the whole view
            zoomLevelDisplay // Element to display zoom level
        );
    } else {
         console.warn("Could not initialize viewer controls: required elements missing.");
    }

    // --- Set up event listeners ---
    if (thumbnailList) {
        thumbnailList.addEventListener('click', (e) => {
            const item = e.target.closest('.thumbnail-item');
            if (item && item.dataset.view) {
                queueRenderPage(parseInt(item.dataset.view, 10)); // Go to clicked view
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
            // Regenerate the thumbnail list to match the new view mode
            await renderThumbnailList();
            // Render the first view of the new mode
            queueRenderPage(1);
        });
    }

    // Guide checkbox listeners
    const guideCheckboxes = [showTrimGuideCheckbox, showBleedGuideCheckbox, showSafetyGuideCheckbox];
    guideCheckboxes.forEach(checkbox => {
        if (checkbox) {
            checkbox.addEventListener('change', () => queueRenderPage(pageNum)); // Rerender on change
        }
    });


    // Admin version selector listener
    if (isAdmin && versionSelector) {
        // Populate versions dropdown (sorted newest first)
        versionSelector.innerHTML = '';
        if (projectData && projectData.versions && projectData.versions.length > 0) {
            projectData.versions.sort((a,b) => b.version - a.version).forEach(v => {
                const option = document.createElement('option');
                option.value = v.version;
                // Add "(Latest)" label to the highest version number
                const isLatest = v.version === Math.max(...projectData.versions.map(ver => ver.version));
                option.textContent = `Version ${v.version}${isLatest ? ' (Latest)' : ''}`;
                versionSelector.appendChild(option);
            });
        } else {
             versionSelector.innerHTML = '<option value="">No versions available</option>';
        }


        // Add change event listener
        versionSelector.addEventListener('change', (e) => {
             try {
                 const selectedVersion = parseInt(e.target.value, 10);
                 if (!isNaN(selectedVersion)) {
                     loadProofByVersion(selectedVersion);
                 }
             } catch (err) {
                 console.error("Error handling version change:", err);
             }
        });
    }

    // --- Initial PDF Load ---

    let versionToLoad = null;
    let targetUrlToLoad = null;

    if (projectData && projectData.versions && projectData.versions.length > 0) {
        let targetVersionNumber;
        // If it's the admin view AND the version selector exists and has a value, use that.
        if (isAdmin && versionSelector && versionSelector.value) {
             try {
                targetVersionNumber = parseInt(versionSelector.value, 10);
             } catch (e) {
                console.error("Could not parse version selector value:", versionSelector.value, e);
                // Fallback to latest if parsing fails
                targetVersionNumber = Math.max(...projectData.versions.map(v => v.version));
             }
        } else {
            // Otherwise, just find the latest version number.
            targetVersionNumber = Math.max(...projectData.versions.map(v => v.version));
        }

        // Find the version object corresponding to the target version number.
        versionToLoad = projectData.versions.find(v => v.version === targetVersionNumber);

        // If the specific version wasn't found (shouldn't happen often), fallback to the absolute latest.
        if (!versionToLoad && projectData.versions.length > 0) {
             versionToLoad = projectData.versions.reduce((latest, current) =>
                (current.version > latest.version ? current : latest), projectData.versions[0]);
             console.warn(`Target version ${targetVersionNumber} not found, falling back to latest version ${versionToLoad?.version}`);
        }

        // Now determine the URL, prioritizing previewURL
        if (versionToLoad && versionToLoad.previewURL) {
            targetUrlToLoad = versionToLoad.previewURL; // Prefer optimized preview
        } else if (versionToLoad && versionToLoad.fileURL) {
            targetUrlToLoad = versionToLoad.fileURL; // Fallback to original
        }
        console.log(`Selected version ${versionToLoad?.version}. Target URL: ${targetUrlToLoad ? targetUrlToLoad.substring(0, 100) + '...' : 'None'}`); // Log selection
    } else {
        console.warn("No versions found in projectData.");
    }


    // --- Only load if URL is new and valid ---
    if (targetUrlToLoad && targetUrlToLoad !== currentlyLoadedURL) {
        console.log("New target URL detected, loading PDF:", targetUrlToLoad.substring(0, 100) + '...');
        // currentlyLoadedURL will be updated inside loadPdf upon success
        loadPdf(targetUrlToLoad); // Load the determined URL
    } else if (!targetUrlToLoad && !currentlyLoadedURL) { // Only show 'no file' if nothing is loaded at all
        console.warn("No proof file URL found in project data.");
        if (loadingSpinner) loadingSpinner.classList.add('hidden'); // Hide spinner
        if (pdfViewer) pdfViewer.innerHTML = '<p class="text-gray-400 p-4">No proof file available for this project yet.</p>';
        if (navigationControls) navigationControls.classList.add('hidden');
        if (guidesSection) guidesSection.classList.add('hidden');
    } else if (!targetUrlToLoad && currentlyLoadedURL) {
         // A file is loaded, but the target version has no URL
         console.warn(`Target version ${versionToLoad?.version} has no URL, keeping current PDF loaded.`);
         if (loadingSpinner) loadingSpinner.classList.add('hidden'); // Hide spinner if it was shown
    } else {
        // URL is the same as already loaded, or initial load spinner is still active
        console.log("Target URL is same as currently loaded or no target URL found. No PDF reload triggered.");
         if (!pageRendering && loadingSpinner) loadingSpinner.classList.add('hidden'); // Hide spinner if rendering isn't active
    }
}