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
 */
export async function initializeSharedViewer(config) {
    const { db, auth, projectId, projectData, isAdmin = false } = config;

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
    let pdfRenderInfo = { x: 0, y: 0, width: 0, height: 0, scale: 1.0 };
    let hiddenCanvas = document.createElement('canvas');
    let currentlyLoadedURL = null;

    /**
     * Determines which page numbers to display for a given view.
     */
    function getPagesForView(viewNumber, totalPages) {
        if (currentViewMode === 'single' || !totalPages) {
            return [viewNumber];
        }
        if (viewNumber === 1) return [1];
        const page1 = (viewNumber - 2) * 2 + 2;
        const page2 = page1 + 1;
        const pages = [];
        if (page1 <= totalPages) pages.push(page1);
        if (page2 <= totalPages) pages.push(page2);
        if (projectSpecs && projectSpecs.readingDirection === 'rtl' && pages.length > 1) {
            return pages.reverse();
        }
        return pages;
    }

    /**
     * Calculates the total number of views based on the current mode.
     */
    function getViewCount(totalPages) {
        if (currentViewMode === 'single' || !totalPages) {
            return totalPages;
        }
        return totalPages > 1 ? 1 + Math.ceil((totalPages - 1) / 2) : 1;
    }

    /**
     * Renders the list of thumbnails in the left column.
     */
    async function renderThumbnailList() {
        if (!pdfDoc || !thumbnailList) return;

        thumbnailList.innerHTML = '';
        renderedThumbnails.clear();
        const totalViews = getViewCount(pdfDoc.numPages);

        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.0 });
        const aspectRatio = viewport.width / viewport.height;

        for (let i = 1; i <= totalViews; i++) {
            const pages = getPagesForView(i, pdfDoc.numPages).join('-');
            const thumbItem = document.createElement('div');
            thumbItem.className = 'thumbnail-item p-2 rounded-md border-2 border-transparent hover:border-indigo-400 cursor-pointer';
            thumbItem.dataset.view = i;

            thumbItem.innerHTML = `
                <div class="bg-black/20 flex items-center justify-center rounded-sm" style="aspect-ratio: ${aspectRatio}">
                     <canvas class="w-full h-full object-contain"></canvas>
                </div>
                <p class="text-center text-xs mt-2">Page ${pages}</p>
            `;
            thumbnailList.appendChild(thumbItem);
        }

        let scrollTimeout;
        thumbnailList.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(loadVisibleThumbnails, 100);
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
            if (item.offsetTop < containerBottom + 200 && item.offsetTop + item.offsetHeight > containerTop - 200) {
                 if (!renderedThumbnails.has(view)) {
                    loadAndRenderThumbnail(view);
                }
            }
        });
    }

    /**
     * Loads and renders a specific thumbnail view.
     */
    async function loadAndRenderThumbnail(viewNumber) {
        if (!pdfDoc || renderedThumbnails.has(viewNumber)) return;

        renderedThumbnails.add(viewNumber);
        const thumbItem = document.querySelector(`.thumbnail-item[data-view='${viewNumber}']`);
        if (!thumbItem) return;

        const canvas = thumbItem.querySelector('canvas');
        const context = canvas.getContext('2d');
        const pagesToRenderIndices = getPagesForView(viewNumber, pdfDoc.numPages);

        try {
            const pagePromises = pagesToRenderIndices.map(num => {
                if (pdfPageCache[num]) return Promise.resolve(pdfPageCache[num]);
                return pdfDoc.getPage(num).then(page => (pdfPageCache[num] = page, page));
            });
            const pages = await Promise.all(pagePromises);
            const viewports = pages.map(p => p.getViewport({ scale: 1.0 }));
            const totalWidth = viewports.reduce((sum, vp) => sum + vp.width, 0);
            const maxHeight = Math.max(...viewports.map(vp => vp.height));
            const scale = Math.min(150 / totalWidth, 150 / maxHeight);
            const scaledViewports = pages.map(p => p.getViewport({ scale }));
            canvas.width = scaledViewports.reduce((sum, vp) => sum + vp.width, 0);
            canvas.height = Math.max(...scaledViewports.map(vp => vp.height));
            let currentX = 0;
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const viewport = scaledViewports[i];
                const offsetY = (canvas.height - viewport.height) / 2;
                await page.render({ canvasContext: context, viewport: viewport, transform: [1, 0, 0, 1, currentX, offsetY] }).promise;
                currentX += viewport.width;
            }
        } catch (error) {
            console.error(`Failed to render thumbnail for view ${viewNumber}:`, error);
            renderedThumbnails.delete(viewNumber);
        }
    }

    /**
     * Loads a PDF document from a URL.
     */
    async function loadPdf(pdfUrl) {
        try {
            renderingThrobber.classList.remove('hidden');
            if (pdfDoc) {
                pdfDoc.destroy().catch(e => console.warn("Error destroying previous pdfDoc:", e));
                pdfDoc = null;
            }
            if (!guidesModule) {
                guidesModule = await import('./guides.js');
            }
            if (guidesSection) guidesSection.classList.remove('hidden');

            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            pdfDoc = await loadingTask.promise;
            if (!pdfDoc) throw new Error("PDF document loading failed.");

            const totalViews = getViewCount(pdfDoc.numPages);
            pageCountSpan.textContent = totalViews;
            navigationControls.classList.remove('hidden');
            pageNum = 1;
            transformState = { zoom: 1.0, pan: { x: 0, y: 0 } };
            if (zoomLevelDisplay) zoomLevelDisplay.textContent = `${Math.round(transformState.zoom * 100)}%`;

            renderThumbnailList();
            queueRenderPage(pageNum);

        } catch (error) {
            console.error("Error loading PDF:", error);
            pdfDoc = null;
            pdfViewer.innerHTML = `<p class="text-red-400 p-4">Error loading PDF: ${error.message}</p>`;
            navigationControls.classList.add('hidden');
            if (guidesSection) guidesSection.classList.add('hidden');
        }
    }

    /**
     * Renders a page or spread onto the canvas.
     */
    async function renderPage(viewNumber) {
        if (!pdfDoc || pageRendering) {
            if (pageRendering && viewNumber !== pageNum) pageNumPending = viewNumber;
            return;
        }

        pageRendering = true;
        renderingThrobber.classList.remove('hidden');
        pageNum = viewNumber;
        updateActiveThumbnail(viewNumber);

        const pagesToRenderIndices = getPagesForView(viewNumber, pdfDoc.numPages);
        const totalViews = getViewCount(pdfDoc.numPages);
        const displayedPagesStr = pagesToRenderIndices.join('-');
        pageNumSpan.textContent = displayedPagesStr || viewNumber;
        pageCountSpan.textContent = totalViews;
        prevPageBtn.disabled = viewNumber <= 1;
        nextPageBtn.disabled = !pdfDoc || viewNumber >= totalViews;

        if (pagesToRenderIndices.length === 0) {
            pageRendering = false;
            renderingThrobber.classList.add('hidden');
            const visibleContext = pdfCanvas.getContext('2d');
            if (visibleContext) visibleContext.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            return;
        }

        try {
            const pagePromises = pagesToRenderIndices.map(num => {
                if (pdfPageCache[num]) return Promise.resolve(pdfPageCache[num]);
                return pdfDoc.getPage(num).then(page => (pdfPageCache[num] = page, page));
            });
            const pages = await Promise.all(pagePromises);
            const pdfRenderScale = Math.max(1.5, (window.devicePixelRatio || 1) * 0.75);
            const viewports = pages.map(p => p.getViewport({ scale: pdfRenderScale }));
            const totalWidth = viewports.reduce((sum, vp) => sum + vp.width, 0);
            const maxHeight = Math.max(...viewports.map(vp => vp.height));

            hiddenCanvas.width = totalWidth;
            hiddenCanvas.height = maxHeight;
            const hiddenContext = hiddenCanvas.getContext('2d');
            hiddenContext.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);

            let currentX = 0;
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const viewport = viewports[i];
                const offsetY = (maxHeight - viewport.height) / 2;
                hiddenContext.save();
                hiddenContext.translate(currentX, offsetY);
                await page.render({ canvasContext: hiddenContext, viewport: viewport }).promise;
                hiddenContext.restore();
                currentX += viewport.width;
            }

            const visibleContext = pdfCanvas.getContext('2d');
            pdfCanvas.width = pdfViewer.clientWidth * (window.devicePixelRatio || 1);
            pdfCanvas.height = pdfViewer.clientHeight * (window.devicePixelRatio || 1);
            pdfCanvas.style.width = `${pdfViewer.clientWidth}px`;
            pdfCanvas.style.height = `${pdfViewer.clientHeight}px`;
            visibleContext.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            visibleContext.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
            visibleContext.save();

            const baseViewports = pages.map(p => p.getViewport({ scale: 1.0 }));
            const totalBaseWidth = baseViewports.reduce((sum, vp) => sum + vp.width, 0);
            const maxBaseHeight = Math.max(...baseViewports.map(vp => vp.height));
            const availableWidth = pdfViewer.clientWidth;
            const availableHeight = pdfViewer.clientHeight;
            const baseScale = Math.min(availableWidth / totalBaseWidth, availableHeight / maxBaseHeight) * 0.95;
            const baseWidth = totalBaseWidth * baseScale;
            const baseHeight = maxBaseHeight * baseScale;
            const baseX = (availableWidth - baseWidth) / 2;
            const baseY = (availableHeight - baseHeight) / 2;

            pdfRenderInfo = { x: baseX, y: baseY, width: baseWidth, height: baseHeight, scale: baseScale };

            visibleContext.translate(transformState.pan.x, transformState.pan.y);
            visibleContext.scale(transformState.zoom, transformState.zoom);
            visibleContext.drawImage(hiddenCanvas, baseX, baseY, baseWidth, baseHeight);

            if (projectSpecs && guidesModule) {
                const guideOptions = {
                    trim: showTrimGuideCheckbox.checked,
                    bleed: showBleedGuideCheckbox.checked,
                    safety: showSafetyGuideCheckbox.checked
                };
                guidesModule.drawGuides(visibleContext, projectSpecs, pdfRenderInfo, transformState, currentViewMode, pageNum, pages.length, pages[0].getViewport({ scale: 1.0 }), pages.length > 1 ? pages[1].getViewport({ scale: 1.0 }) : null);
            }

            visibleContext.restore();
            onPageRenderedCallback();

        } catch (err) {
            console.error("Error rendering page/spread:", err);
            pdfViewer.innerHTML = `<p class="text-red-400 p-4">Error rendering PDF: ${err.message}</p>`;
        } finally {
            pageRendering = false;
            renderingThrobber.classList.add('hidden');
            if (pageNumPending !== null) {
                const pending = pageNumPending;
                pageNumPending = null;
                queueRenderPage(pending);
            }
        }
    }

    function updateActiveThumbnail(currentView) {
        const items = thumbnailList.querySelectorAll('.thumbnail-item');
        items.forEach(item => {
            const view = parseInt(item.dataset.view, 10);
            if (view === currentView) {
                item.classList.add('border-indigo-400');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('border-indigo-400');
            }
        });
    }

    function queueRenderPage(num) {
        if (pageRendering) {
            if (num !== pageNum) pageNumPending = num;
        } else {
            renderPage(num);
        }
    }

    function setActiveTool(tool) {
        currentTool = tool;
        toolPanButton.classList.toggle('bg-slate-600', tool === 'pan');
        toolCommentButton.classList.toggle('bg-slate-600', tool === 'comment');
        if (typeof window.updateCursor === 'function') window.updateCursor();
    }

    function loadProofByVersion(versionNumber) {
        const versionData = projectData.versions.find(v => v.version === versionNumber);
        if (!versionData) {
            console.error("Version not found:", versionNumber);
            return;
        }

        let urlToLoad = versionData.previewURL || versionData.fileURL;
        if (urlToLoad && urlToLoad !== currentlyLoadedURL) {
            currentlyLoadedURL = urlToLoad;
            loadPdf(urlToLoad);
        }
    }

    // --- Initialization ---

    // Set up initial view mode
    const isBook = projectSpecs && (projectSpecs.binding === 'Perfect Bound' || projectSpecs.binding === 'Saddle-Stitch');
    if (isBook && viewModeSelect) {
        viewModeSelect.value = 'spread';
        currentViewMode = 'spread';
    }

    // Initialize sub-modules
    initializeAnnotations(
        db, auth, projectId, pdfCanvas, commentsSection,
        () => pageNum,
        () => queueRenderPage(pageNum),
        (callback) => { onPageRenderedCallback = callback; },
        () => transformState,
        () => pdfRenderInfo
    );

    initializeViewerControls(
        pdfViewer, pdfCanvas,
        (newTransform) => {
            transformState = newTransform;
            queueRenderPage(pageNum);
        },
        () => currentTool,
        () => pdfRenderInfo,
        zoomLevelDisplay
    );

    // Set up event listeners
    thumbnailList.addEventListener('click', (e) => {
        const item = e.target.closest('.thumbnail-item');
        if (item && item.dataset.view) {
            queueRenderPage(parseInt(item.dataset.view, 10));
        }
    });
    toolPanButton.addEventListener('click', () => setActiveTool('pan'));
    toolCommentButton.addEventListener('click', () => setActiveTool('comment'));
    prevPageBtn.addEventListener('click', () => { if (pageNum > 1) queueRenderPage(pageNum - 1); });
    nextPageBtn.addEventListener('click', () => { if (pageNum < getViewCount(pdfDoc.numPages)) queueRenderPage(pageNum + 1); });

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', (e) => {
            currentViewMode = e.target.value;
            queueRenderPage(1);
        });
    }

    if (showTrimGuideCheckbox) {
        showTrimGuideCheckbox.addEventListener('change', () => queueRenderPage(pageNum));
        showBleedGuideCheckbox.addEventListener('change', () => queueRenderPage(pageNum));
        showSafetyGuideCheckbox.addEventListener('change', () => queueRenderPage(pageNum));
    }

    if (isAdmin && versionSelector) {
        // Populate versions
        versionSelector.innerHTML = '';
        projectData.versions.sort((a,b) => b.version - a.version).forEach(v => {
            const option = document.createElement('option');
            option.value = v.version;
            option.textContent = `Version ${v.version}` + (v.version === projectData.versions.length ? ' (Latest)' : '');
            versionSelector.appendChild(option);
        });

        // Add event listener
        versionSelector.addEventListener('change', (e) => {
            loadProofByVersion(parseInt(e.target.value, 10));
        });
    }

    // Initial load
    const latestVersion = projectData.versions && projectData.versions.length > 0 ? projectData.versions[projectData.versions.length - 1] : null;
    let urlToLoad = null;
    if (latestVersion && latestVersion.previewURL) {
        urlToLoad = latestVersion.previewURL;
    } else if (latestVersion && latestVersion.fileURL) {
        urlToLoad = latestVersion.fileURL;
    }

    if (urlToLoad) {
        currentlyLoadedURL = urlToLoad;
        loadPdf(urlToLoad);
    } else {
        pdfViewer.innerHTML = '<p class="text-gray-400">No proof file available for this project.</p>';
    }
}
