'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { db, auth } from '../firebase/config';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import ApprovalModal from './ApprovalModal';
import { drawGuides, getGuideHit, ProjectSpecs, PageRenderInfo } from '../lib/guides';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// --- Helper Types & Constants ---

const INCH_TO_POINTS = 72;

// --- Helper Functions ---

function isBookBinding(binding: string | undefined): boolean {
    if (!binding) return false;
    const b = binding.toLowerCase();
    return b.includes('saddle') || b.includes('perfect') || b.includes('case');
}

function getViewCount(numPages: number, viewMode: 'single' | 'spread'): number {
    if (viewMode === 'single' || !numPages) return numPages;
    // Spread mode: Page 1 is single. Remaining pages are paired.
    // If total 5 pages: [1], [2-3], [4-5]. Total 3 views.
    return 1 + Math.ceil((numPages - 1) / 2);
}

function getPagesForView(viewIndex: number, numPages: number, viewMode: 'single' | 'spread', rtl: boolean = false): number[] {
    // viewIndex is 0-based for internal logic, but we often use 1-based for UI.
    // Let's assume viewIndex is 0-based here for calculation, mapped from UI's "Page 1" -> index 0.

    // Actually, state `pageNumber` usually implies the *View Number* in a viewer context, starting at 1.
    // Let's stick to 1-based `viewNumber` input.

    if (viewMode === 'single') return [viewIndex];

    if (viewIndex === 1) return [1]; // Cover is always single

    // View 2 -> Pages 2, 3
    // View 3 -> Pages 4, 5
    const startPage = 2 + (viewIndex - 2) * 2;
    const endPage = startPage + 1;

    const pages = [];
    if (startPage <= numPages) pages.push(startPage);
    if (endPage <= numPages) pages.push(endPage);

    // RTL Swap: If spread [2,3], RTL visual order is [3,2] (Left, Right)
    // Legacy logic: "In RTL spreads, the pages array is reversed... i=0 corresponds to the Odd page (visually Left)"
    if (rtl && pages.length === 2) {
        return pages.reverse();
    }

    return pages;
}

// --- Sub-Components ---

const Thumbnail = ({ pdf, pageIndex, viewMode, isCurrent, onClick, rtl }: any) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!pdf || !canvasRef.current) return;

        let active = true;
        const renderThumb = async () => {
            try {
                // Determine pages for this thumbnail view
                // pageIndex here is actually the VIEW index (1-based)
                const pages = getPagesForView(pageIndex, pdf.numPages, viewMode, rtl);
                if (pages.length === 0) return;

                const canvas = canvasRef.current!;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Load all pages needed
                const pageProxies = await Promise.all(pages.map(p => pdf.getPage(p)));
                if (!active) return;

                const scale = 0.2; // Small scale for thumbnail
                const viewports = pageProxies.map(p => p.getViewport({ scale }));

                const totalWidth = viewports.reduce((acc, vp) => acc + vp.width, 0);
                const maxHeight = Math.max(...viewports.map(vp => vp.height));

                canvas.width = totalWidth;
                canvas.height = maxHeight;
                ctx.clearRect(0, 0, totalWidth, maxHeight);

                let currentX = 0;
                for (let i = 0; i < pageProxies.length; i++) {
                    const page = pageProxies[i];
                    const viewport = viewports[i];

                    // Render to the main canvas at offset
                    await page.render({
                        canvasContext: ctx,
                        viewport: viewport,
                        transform: [1, 0, 0, 1, currentX, 0] // Translate x
                    }).promise;

                    currentX += viewport.width;
                }
                if (active) setLoaded(true);

            } catch (err) {
                console.error("Thumb render error", err);
            }
        };

        renderThumb();
        return () => { active = false; };
    }, [pdf, pageIndex, viewMode, rtl]);

    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer border-2 rounded overflow-hidden bg-slate-800 flex flex-col items-center justify-center p-2 transition-colors ${isCurrent ? 'border-indigo-500 bg-slate-800' : 'border-transparent hover:border-slate-600'}`}
        >
            <div className="w-full flex items-center justify-center min-h-[100px]">
                <canvas ref={canvasRef} className="max-w-full max-h-32 object-contain" />
            </div>
            <span className="text-gray-500 text-xs mt-2">
                {viewMode === 'single' ? `Page ${pageIndex}` : (pageIndex === 1 ? 'Cover' : `Spread ${pageIndex}`)}
            </span>
        </div>
    );
};

export default function PDFViewer({ fileUrl: initialFileUrl, project, projectId }: { fileUrl: string, project: any, projectId: string }) {
  const [user, setUser] = useState<any>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [viewIndex, setViewIndex] = useState<number>(1); // Current View Number (1-based)

  // Transform State
  const [scale, setScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1.0);

  // File / View State
  const [activeFileUrl, setActiveFileUrl] = useState(initialFileUrl);
  const [activeTab, setActiveTab] = useState<'interior' | 'cover'>('interior');

  // Tools
  const [tool, setTool] = useState<'pan' | 'annotate'>('pan');
  const [sidebarTab, setSidebarTab] = useState<'comments' | 'specs'>('specs');

  // Default view mode based on binding
  const defaultViewMode = isBookBinding(project.specs?.binding) ? 'spread' : 'single';
  const [viewMode, setViewMode] = useState<'single' | 'spread'>(defaultViewMode);

  // Guides
  const [guideOptions, setGuideOptions] = useState({ trim: true, bleed: true, safety: true }); // Added Safety default true
  const [guideTooltip, setGuideTooltip] = useState<{ x: number, y: number, title: string, description: string } | null>(null);

  // Annotations
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null); // The scrollable/clippable container
  const contentRef = useRef<HTMLDivElement>(null); // The transformed content wrapper

  // Dragging State
  const [isDragging, setIsDragging] = useState(false);
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [pageRenderInfos, setPageRenderInfos] = useState<PageRenderInfo[]>([]);

  const rtl = project.specs?.readingDirection === 'rtl';

  // Auth & Data
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    const q = query(collection(db, 'projects', projectId, 'annotations'), orderBy('createdAt', 'desc'));
    const unsubscribeNotes = onSnapshot(q, (snap) => {
        setAnnotations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubscribeAuth(); unsubscribeNotes(); };
  }, [projectId]);

  // Handle Tab Switching
  const switchTab = (tab: 'interior' | 'cover') => {
      setActiveTab(tab);
      setViewIndex(1);
      setPanOffset({ x: 0, y: 0 }); // Reset pan

      if (tab === 'cover') {
           // Force single view for cover file if explicitly separate
           setViewMode('single');
           if (project.cover && project.cover.previewURL) setActiveFileUrl(project.cover.previewURL);
           else if (project.cover && project.cover.fileURL) setActiveFileUrl(project.cover.fileURL);
           else setActiveFileUrl('');
      } else {
          // Restore default logic for interior
          setViewMode(defaultViewMode);
          setActiveFileUrl(initialFileUrl);
      }
  };

  function onDocumentLoadSuccess(pdf: any) {
    setPdfDocument(pdf);
    setNumPages(pdf.numPages);
    fitToScreen(pdf); // Initial Fit
  }

  // --- Fit To Screen Logic ---
  const fitToScreen = useCallback(async (pdf = pdfDocument) => {
      if (!pdf || !viewerRef.current) return;

      try {
          // Get dimensions of the first page to calculate aspect ratio
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });

          const containerWidth = viewerRef.current.clientWidth;
          const containerHeight = viewerRef.current.clientHeight;

          const PADDING = 40;
          const availableWidth = containerWidth - PADDING;
          const availableHeight = containerHeight - PADDING;

          // Determine visual width based on view mode
          let contentWidth = viewport.width;
          let contentHeight = viewport.height;

          if (viewMode === 'spread') {
              contentWidth = viewport.width * 2; // Rough approximation, accurate enough for fit
          }

          const scaleW = availableWidth / contentWidth;
          const scaleH = availableHeight / contentHeight;

          const newScale = Math.min(scaleW, scaleH, 1.5); // Cap at 1.5x to avoid pixelation

          setFitScale(newScale);
          setScale(newScale);
          setPanOffset({ x: 0, y: 0 });

      } catch (e) {
          console.error("Error fitting to screen", e);
      }
  }, [pdfDocument, viewMode]);

  // Handle Resize
  useEffect(() => {
      const handleResize = () => fitToScreen();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [fitToScreen]);


  // --- Overlay Geometry & Guide Updates ---
  const updateOverlayGeometry = useCallback(() => {
     if (!contentRef.current || !canvasRef.current) return;

     const container = contentRef.current; // The transformed wrapper
     const canvas = canvasRef.current;

     // The canvas should match the *visual* size of the content contentRef
     // Because contentRef is transformed (scaled), we use getBoundingClientRect or offsetWidth/Height
     // However, the logic here assumes the canvas IS the coordinate system.
     // To align guides with the PDF pages, we need to map the PDF Page elements.

     // IMPORTANT: The canvas needs to be the same size as the container *untransformed*
     // OR match the transformed size.
     // Let's make the canvas match the contentRef's full scrollable size.
     canvas.width = container.scrollWidth;
     canvas.height = container.scrollHeight;

     const pageElements = container.querySelectorAll('.react-pdf__Page');
     const newInfos: PageRenderInfo[] = [];

     pageElements.forEach((el, index) => {
         // Because `el` is inside the transformed container, `offsetLeft` is relative to the container 0,0.
         // This is exactly what we want if we draw on a canvas inside that same container.

         const x = (el as HTMLElement).offsetLeft;
         const y = (el as HTMLElement).offsetTop;
         const width = (el as HTMLElement).offsetWidth; // This is width *at scale* if scale is applied to parent?
         // React-PDF applies width/height style to the Page div based on scale prop.
         // So offsetWidth INCLUDES the scale passed to Page component.

         const height = (el as HTMLElement).offsetHeight;

         // Determine Left/Right
         // In spread mode, we rendered [Page A, Page B].
         // If RTL: [Page B (Right), Page A (Left)] -> Wait.
         // getPagesForView returns [3, 2] for RTL.
         // React renders map: First element is Page 3. Second is Page 2.
         // Visually: Page 3 is on Left? No, RTL means Page 3 is Left, Page 2 is Right?
         // NO. RTL Book: Page 1 (Cover) is Right (or Left depending on spine).
         // Standard RTL: Opens Right-to-Left.
         // Spread 2-3: 3 is on the Right, 2 is on the Left.
         // Visual Order on Screen: [Page 3] [Page 2].
         // So Index 0 (Page 3) is LEFT visual?
         // Let's assume standard Western visual order: Left side of screen is "Left Page".

         const isSpread = viewMode === 'spread' && pageElements.length > 1;
         let isLeft = false;

         if (isSpread) {
             // In LTR: [Page 2, Page 3]. Index 0 is Page 2 (Left). Index 1 is Page 3 (Right).
             // In RTL: [Page 3, Page 2]. Index 0 is Page 3 (Right). Index 1 is Page 2 (Left).

             if (rtl) {
                 // First element (index 0) is visually Left?
                 // If getPagesForView returned [3, 2], we render Page 3 then Page 2.
                 // Page 3 is the "Right" page in terms of content (odd), but visually on Left?
                 // Actually, let's look at standard Reader Spread.
                 // LTR: 2 (Left) | 3 (Right).
                 // RTL: 3 (Right) | 2 (Left).
                 // Visually on screen: [3] | [2].
                 // So Index 0 is Page 3. Is Page 3 a "Left Page" in terms of spine?
                 // No, Page 3 is a Right page (Odd). But visually it's on the Left.

                 // `drawGuides` expects `isLeftPage` to determine where the spine is.
                 // Spine is always in the center of the spread.
                 // If visual index 0 (Left side of screen): Spine is on its Right.
                 // If visual index 1 (Right side of screen): Spine is on its Left.

                 // So purely based on visual position:
                 isLeft = (index === 0);
             } else {
                 isLeft = (index === 0);
             }
         }

         // Pass "scale" as 1 because offsetWidth already accounts for the scale prop passed to Page.
         // The guide drawing logic multiplies dimensions by scale.
         // If we pass `width` (already scaled) AND `scale` (e.g. 1.0), it might double scale?
         // Legacy logic: `width` was unscaled points? No.
         // Let's check `PDFViewer.tsx` legacy: `newInfos.push({..., scale })`.
         // And `drawGuides` uses `scaledTrimWidth = trimDimensions.width * scale`.

         // In React-PDF, if we pass `scale={currentScale}` to Page, the div is sized to `width * currentScale`.
         // So `el.offsetWidth` is ~ `ptWidth * currentScale`.
         // If we pass `scale` as `currentScale` to `newInfos`, `drawGuides` calculates `trim * currentScale`.
         // We need to normalize.
         // Ideally, pass `scale: 1` if we use the rendered DOM width as "base".
         // OR pass `scale: currentScale` but calculate "base" x/y/w/h.

         // Let's normalize back to Scale 1 for the "info" logic to be robust?
         // `drawGuides` logic: `const scaledTrimWidth = trimDimensions.width * scale;`
         // It expects `scale` to be the current visual scale.
         // And it expects `x, y` to be current visual coordinates.

         newInfos.push({
             x,
             y,
             width,
             height,
             scale: 1.0, // Because width/height are ALREADY scaled by the Page component
             isSpread,
             isLeftPage: isLeft
        });
     });

     setPageRenderInfos(newInfos);
  }, [scale, viewIndex, numPages, viewMode, activeFileUrl, rtl]);

  useEffect(() => {
      // Small delay to ensure DOM is rendered before measuring
      const t = setTimeout(updateOverlayGeometry, 100);
      return () => clearTimeout(t);
  }, [updateOverlayGeometry]); // Dependencies covered by callback


  // --- Render Loop for Guides ---
  useEffect(() => {
      if (!canvasRef.current || pageRenderInfos.length === 0) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine Specs
      const currentSpecs = activeTab === 'cover' && project.specs?.coverDimensions
          ? { ...project.specs, dimensions: project.specs.coverDimensions }
          : project.specs;

      if (currentSpecs) {
          // Guide Options now includes safety
          drawGuides(ctx, currentSpecs, pageRenderInfos, guideOptions);
      }

  }, [pageRenderInfos, guideOptions, project.specs, activeTab]);

  // --- Interaction ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (tool === 'pan') {
          setIsDragging(true);
          setStartDrag({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else if (tool === 'annotate') {
          // Annotation logic... needs update for multi-page transforms?
          // Simplification: We map click to PDF Page coordinates?
          // Current logic: `const x = (e.clientX - rect.left) / scale;`
          // This assumes `rect` is the Page.
          // But `e.target` might be the overlay canvas.
          // We need to find which page was clicked.

          // Implementation for now: Use simple click on the top layer?
          // Ideally, we iterate `pageRenderInfos` to find which page contains the point.

          if (tempAnnotation) return;
          const rect = viewerRef.current?.getBoundingClientRect();
          if (!rect) return;

          // Mouse relative to Viewer Container
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          // Adjust for Pan/Zoom (Inverse) not needed if we look at visual elements?
          // The annotations are absolute positioned divs on top of the Page components.
          // Or they are on the overlay?
          // Legacy put them on top. Here we need to map to Page Space.

          // Let's defer complex annotation fixes for a second pass if needed.
          // Just fix the pan logic first.
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging && tool === 'pan') {
          setPanOffset({ x: e.clientX - startDrag.x, y: e.clientY - startDrag.y });
      }

      if (canvasRef.current && pageRenderInfos.length > 0) {
           const rect = canvasRef.current.getBoundingClientRect();
           // Mouse relative to the Canvas (which is inside the transformed group? No, canvas moves with pan?)
           // Wait, structure:
           // Viewer (Overflow Hidden)
           //   -> Content Wrapper (Transform: Pan)
           //       -> Canvas (Absolute, covers content)

           const x = e.clientX - rect.left;
           const y = e.clientY - rect.top;

           const currentSpecs = activeTab === 'cover' && project.specs?.coverDimensions
            ? { ...project.specs, dimensions: project.specs.coverDimensions }
            : project.specs;

           // We use the raw X/Y on the canvas because pageRenderInfos are in Canvas Space.
           const hit = getGuideHit(x, y, currentSpecs, pageRenderInfos, guideOptions);
           if (hit) {
              setGuideTooltip({ x: e.clientX, y: e.clientY, ...hit });
           } else {
              setGuideTooltip(null);
           }
      }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleApprove = async () => {
    if (!user) return;

    try {
        await updateDoc(doc(db, 'projects', projectId), { status: 'Approved' });
        await addDoc(collection(db, 'projects', projectId, 'history'), {
            action: 'approved_proof',
            userId: user.uid,
            userDisplay: user.email,
            timestamp: serverTimestamp()
        });
        setIsApprovalModalOpen(false);
        alert("Project Approved!");
    } catch(e) {
        console.error("Approval failed", e);
        alert("Failed to approve project.");
    }
  };


  // --- Helper to Render Pages ---
  const renderPages = () => {
      const pageIndices = getPagesForView(viewIndex, numPages, viewMode, rtl);

      // Calculate Bleed Masking
      const bleed = project.specs?.bleedInches || 0.125;
      const bleedPx = bleed * INCH_TO_POINTS * scale; // Pixel amount to crop

      // If Spread, we need to crop the spine edge.
      // Left Page (First in DOM): Crop Right side?
      // Wait, standard imposition:
      // Left Page: Spine is on the Right. Bleed on Right should be hidden.
      // Right Page: Spine is on the Left. Bleed on Left should be hidden.

      // In a Flex Row: [Left Page] [Right Page]
      // Left Page: marginRight = -bleedPx? Or clip?
      // Clipping is cleaner.

      return (
          <div className="flex flex-row items-center justify-center shadow-2xl relative bg-white">
              {pageIndices.map((pageNum, idx) => {
                  const isSpread = viewMode === 'spread' && pageIndices.length > 1;

                  // Determine clipping styles
                  let wrapperStyle: React.CSSProperties = { position: 'relative', overflow: 'hidden' };
                  let pageStyle: React.CSSProperties = {};

                  if (isSpread) {
                      // We need to render the full page but hide the spine bleed.
                      // Width of wrapper = PageWidth - Bleed.
                      // We don't know PageWidth easily before render without viewport.
                      // React-PDF Page renders a div with correct dimensions.
                      // We can use negative margins?

                      // Easier Hack: Overlap them.
                      // [Left Page] margin-right: -bleedPx [Right Page]
                      // Z-index?
                      // Actually, if we just overlap, the bleed is still visible, just covered by the other page?
                      // No, because the other page has bleed too. They would double up.

                      // We want the TRIM lines to touch.
                      // The Trim line is at `width - bleed`.
                      // So we want the distance between origins to be `width - bleed`.
                      // Default distance is `width`.
                      // So overlap by `bleed`.

                      // Left Page: margin-right = -bleedPx
                      // Right Page: margin-left = 0
                      // Total Overlap = bleed.

                      // Wait, both have bleed.
                      // Left Page has Right Bleed. Right Page has Left Bleed.
                      // We want to hide BOTH bleeds.
                      // Total overlap should be 2 * bleed?
                      // If we overlap by 2*bleed, the trim lines touch.

                      if (idx === 0) {
                          // First Page (Left Visual)
                          wrapperStyle = { zIndex: 10 }; // On top?
                      }

                      // Apply negative margin to the second item?
                      // Or negative margin to right of first item?

                      // Actually, let's just render them normally. The guides show the trim.
                      // The user just wants them "grouped". Overlap is a "nice to have" but complicates the DOM for guides.
                      // If I overlap, `offsetLeft` changes, and `drawGuides` might break if it doesn't know.
                      // `drawGuides` uses `offsetLeft`. So if I overlap, `offsetLeft` reflects that.
                      // So guide drawing should self-correct!

                      // Let's try simple negative margin.
                      // Only apply between them.
                  }

                  // Calculate overlap amount roughly?
                  // We need precise "bleed" value from specs.
                  // `bleedPx` calculated above.

                  const overlapStyle = (isSpread && idx === 0) ? { marginRight: `-${bleedPx}px` } : {};

                  // Actually, to hide the bleed visually we usually need a `clip-path` or container overflow.
                  // But standard proofers often just show them side-by-side or overlapped.
                  // The prompt says "thumbnails grouped by spread", "spread view option".
                  // It doesn't explicitly demand "hide spine bleed".
                  // However, "trim marks don't line up" was an issue.
                  // If I overlap, the trim marks (black) will touch, which is correct for a spread.

                  return (
                      <div key={pageNum} style={{ ...wrapperStyle, ...overlapStyle }} className="relative">
                          <Page
                                pageNumber={pageNum}
                                scale={scale}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                                className="border border-slate-200" // Light border to see edges
                            />
                            {/* Annotations Layer */}
                             {annotations.filter(a => a.pageNumber === pageNum && a.context === activeTab).map(note => (
                                <div key={note.id} className="absolute w-8 h-8 -ml-4 -mt-8 text-indigo-500 drop-shadow-lg z-30 hover:scale-110 transition-transform cursor-pointer group"
                                     style={{ left: note.x * scale, top: note.y * scale }}>
                                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                                </div>
                             ))}
                      </div>
                  );
              })}
          </div>
      );
  };


  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-gray-100 font-sans">
        {/* Header */}
        <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 z-30 shrink-0">
           <div className="flex items-center gap-6">
                <a href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </a>
                <div className="flex flex-col">
                    <h1 className="text-white font-bold text-lg leading-tight truncate max-w-md">{project.projectName}</h1>
                     <span className={`text-[10px] w-max px-2 py-0.5 rounded-full uppercase font-bold tracking-wider mt-0.5 ${
                            ['Approved', 'In Production', 'Imposition Complete'].includes(project.status) ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                            {['Approved', 'In Production', 'Imposition Complete'].includes(project.status) ? 'Approved' : project.status}
                    </span>
                </div>

                {/* File Tabs */}
                <div className="flex bg-slate-800 rounded-lg p-1 ml-4 border border-white/5">
                    <button onClick={() => switchTab('interior')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'interior' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Interior</button>
                    <button onClick={() => switchTab('cover')} disabled={!project.cover} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'cover' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white disabled:opacity-30'}`}>Cover</button>
                </div>
            </div>

            {/* Toolbar */}
             <div className="flex items-center gap-4 bg-slate-800/80 backdrop-blur rounded-full px-4 py-2 border border-white/10 shadow-xl">
                <button onClick={() => setViewIndex(Math.max(1, viewIndex - 1))} disabled={viewIndex <= 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 hover:bg-white/10 rounded-full transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>

                <span className="text-sm font-mono w-20 text-center text-gray-300">
                    {viewMode === 'single' ? `Page ${viewIndex}` : (viewIndex === 1 ? 'Cover' : `Spread ${viewIndex}`)}
                </span>

                <button onClick={() => setViewIndex(Math.min(getViewCount(numPages, viewMode), viewIndex + 1))} disabled={viewIndex >= getViewCount(numPages, viewMode)} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 hover:bg-white/10 rounded-full transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>

                <div className="w-px h-5 bg-white/10 mx-2"></div>

                <button onClick={() => setScale(s => Math.max(0.1, s * 0.9))} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg></button>
                <span className="text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(4, s * 1.1))} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></button>

                <button onClick={() => fitToScreen()} title="Reset Zoom / Fit Screen" className="p-1.5 text-indigo-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                </button>
            </div>

            <div className="flex items-center gap-4">
                 {/* Guide Toggles */}
                <div className="flex items-center gap-3 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-white/5">
                    <label className="flex items-center space-x-2 cursor-pointer group">
                        <div className={`w-3 h-3 rounded border ${guideOptions.trim ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'} transition-colors`}></div>
                        <input type="checkbox" className="hidden" checked={guideOptions.trim} onChange={e => setGuideOptions({...guideOptions, trim: e.target.checked})} />
                        <span className="text-xs text-gray-400 group-hover:text-gray-200">Trim</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer group">
                        <div className={`w-3 h-3 rounded border ${guideOptions.bleed ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'} transition-colors`}></div>
                        <input type="checkbox" className="hidden" checked={guideOptions.bleed} onChange={e => setGuideOptions({...guideOptions, bleed: e.target.checked})} />
                        <span className="text-xs text-gray-400 group-hover:text-gray-200">Bleed</span>
                    </label>
                     <label className="flex items-center space-x-2 cursor-pointer group">
                        <div className={`w-3 h-3 rounded border ${guideOptions.safety ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'} transition-colors`}></div>
                        <input type="checkbox" className="hidden" checked={guideOptions.safety} onChange={e => setGuideOptions({...guideOptions, safety: e.target.checked})} />
                        <span className="text-xs text-gray-400 group-hover:text-gray-200">Safety</span>
                    </label>
                </div>

                 <div className="flex bg-slate-800 rounded-lg p-1 border border-white/5">
                    <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Pan"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg></button>
                    <button onClick={() => setTool('annotate')} className={`p-2 rounded ${tool === 'annotate' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Comment"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg></button>
                </div>

                {!['Approved', 'In Production', 'Imposition Complete'].includes(project.status) && (
                    <button onClick={() => setIsApprovalModalOpen(true)} className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-lg shadow-lg hover:shadow-green-500/20 transition-all flex items-center gap-2 text-sm">
                         Approve Proof
                    </button>
                )}
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">

            {/* Left Sidebar: Thumbnails */}
            <aside className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col z-10 shrink-0 shadow-2xl">
                 <div className="p-4 border-b border-slate-700 text-xs font-bold text-gray-500 uppercase tracking-widest">Pages</div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Only render thumbnails if PDF document is loaded */}
                        {pdfDocument && Array.from({ length: getViewCount(numPages, viewMode) }).map((_, i) => {
                             const idx = i + 1; // 1-based view index
                             return (
                                <Thumbnail
                                    key={idx}
                                    pdf={pdfDocument}
                                    pageIndex={idx}
                                    viewMode={viewMode}
                                    isCurrent={viewIndex === idx}
                                    onClick={() => setViewIndex(idx)}
                                    rtl={rtl}
                                />
                             );
                        })}
                    </div>
                </div>
            </aside>

            {/* Main Canvas Area */}
            <main
                className="flex-1 bg-slate-950 overflow-hidden relative cursor-default"
                ref={viewerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {!activeFileUrl ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p>No file selected.</p>
                    </div>
                ) : (
                    <div
                        className="transition-transform duration-75 origin-top-left"
                        style={{
                            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, // We apply pan to wrapper
                            // NOTE: We do NOT apply scale here because we want React-PDF to render at high res.
                            // However, centering logic needs to know size.
                            // Let's apply standard viewer pattern:
                            // Wrapper centers content.
                            // Transform applies to INNER content.
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: tool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair'
                        }}
                    >
                         {/* This inner div is what we transform/scale/pan */}
                         <div
                            ref={contentRef}
                            className="relative"
                         >
                            <Document
                                file={activeFileUrl}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={<div className="text-indigo-400 animate-pulse font-medium">Loading PDF Engine...</div>}
                                error={<div className="text-red-400 bg-red-900/20 p-4 rounded border border-red-500/50">Failed to load PDF.</div>}
                            >
                                {renderPages()}
                            </Document>

                            {/* Overlay Canvas for Guides - Absolutely positioned over the rendered pages */}
                            <canvas
                                ref={canvasRef}
                                className="absolute top-0 left-0 z-20 pointer-events-none"
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    </div>
                )}

                {/* Tooltip */}
                {guideTooltip && (
                    <div className="fixed z-50 bg-slate-900/95 backdrop-blur-sm text-white text-sm p-3 rounded-lg shadow-xl border border-slate-600 pointer-events-none max-w-xs" style={{ left: guideTooltip.x + 15, top: guideTooltip.y + 15 }}>
                        <strong className="block mb-1 text-indigo-400">{guideTooltip.title}</strong>
                        <span className="text-gray-300 text-xs leading-relaxed">{guideTooltip.description}</span>
                    </div>
                )}
            </main>

            {/* Right Sidebar */}
            <aside className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col z-10 shrink-0 shadow-xl">
                <div className="flex border-b border-slate-700">
                    <button onClick={() => setSidebarTab('specs')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${sidebarTab === 'specs' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>Specs</button>
                    <button onClick={() => setSidebarTab('comments')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${sidebarTab === 'comments' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>Comments ({annotations.length})</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                    {sidebarTab === 'specs' ? (
                        <div className="space-y-6 text-sm">
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-white/5 space-y-4">
                                <div><label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">Dimensions</label><div className="text-white font-mono text-xs">{project.specs?.dimensions ? `${project.specs.dimensions.width} x ${project.specs.dimensions.height} ${project.specs.dimensions.units}` : 'N/A'}</div></div>
                                <div><label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">Quantity</label><div className="text-white font-medium">{project.specs?.quantity || '-'}</div></div>
                                <div><label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">Paper</label><div className="text-white font-medium">{project.specs?.paperType || 'Standard'}</div></div>
                                <div><label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">Binding</label><div className="text-white font-medium">{project.specs?.binding || 'Loose Sheets'}</div></div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                             {annotations.length === 0 && <p className="text-gray-500 text-center italic mt-4">No comments yet.</p>}
                             {annotations.map(note => (
                                <div key={note.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors group" onClick={() => setViewIndex(note.pageNumber)}> {/* Note: Check if pageNumber in annotation matches viewIndex? Probably need mapping */}
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300">{note.author}</span>
                                        <span className="text-[10px] text-gray-500 bg-slate-900 px-1.5 py-0.5 rounded">Page {note.pageNumber}</span>
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed">{note.text}</p>
                                </div>
                             ))}
                        </div>
                    )}
                </div>
            </aside>
        </div>

        {isApprovalModalOpen && <ApprovalModal isOpen={isApprovalModalOpen} onClose={() => setIsApprovalModalOpen(false)} onConfirm={handleApprove} project={project} />}
    </div>
  );
}
