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
    return 1 + Math.ceil((numPages - 1) / 2);
}

function getPagesForView(viewIndex: number, numPages: number, viewMode: 'single' | 'spread', rtl: boolean = false): number[] {
    if (viewMode === 'single') return [viewIndex];
    if (viewIndex === 1) return [1]; // Cover is always single

    const startPage = 2 + (viewIndex - 2) * 2;
    const endPage = startPage + 1;

    const pages = [];
    if (startPage <= numPages) pages.push(startPage);
    if (endPage <= numPages) pages.push(endPage);

    if (rtl && pages.length === 2) {
        return pages.reverse();
    }
    return pages;
}

// --- Sub-Components ---

const Thumbnail = ({ pdf, pageIndex, viewMode, isCurrent, onClick, rtl, bleedInches = 0.125 }: any) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!pdf || !canvasRef.current) return;

        let active = true;
        const renderThumb = async () => {
            try {
                const pages = getPagesForView(pageIndex, pdf.numPages, viewMode, rtl);
                if (pages.length === 0) return;

                const canvas = canvasRef.current!;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Load all pages needed
                const pageProxies = await Promise.all(pages.map(p => pdf.getPage(p)));
                if (!active) return;

                const scale = 0.2; // Base scale for thumbnail
                const viewports = pageProxies.map(p => p.getViewport({ scale }));

                // Calculate cropped dimensions for bleed masking
                const bleedPx = bleedInches * INCH_TO_POINTS * scale;
                const isSpread = viewMode === 'spread' && pages.length > 1;

                // Total Width Calculation with Masking
                let totalWidth = 0;
                const maxHeight = Math.max(...viewports.map(vp => vp.height));

                // First pass to calculate total width
                viewports.forEach((vp, idx) => {
                    let w = vp.width;
                    if (isSpread) {
                        w -= bleedPx; // Each page in a spread loses 1 bleed width (inner spine)
                    }
                    totalWidth += w;
                });

                canvas.width = totalWidth;
                canvas.height = maxHeight;
                ctx.clearRect(0, 0, totalWidth, maxHeight);

                // Render loop with cropping
                let currentX = 0;
                for (let i = 0; i < pageProxies.length; i++) {
                    const page = pageProxies[i];
                    const viewport = viewports[i];

                    // Render page to a temporary canvas first to crop it easily
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = viewport.width;
                    tempCanvas.height = viewport.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    if (!tempCtx) continue;

                    await page.render({
                        canvasContext: tempCtx,
                        viewport: viewport
                    }).promise;

                    // Determine source cropping
                    let sourceX = 0;
                    let sourceW = viewport.width;

                    if (isSpread) {
                        sourceW = viewport.width - bleedPx; // We always take width - bleed

                        // If Left Page (First in DOM list): Crop Right (Inner). SourceX = 0.
                        // If Right Page (Second in DOM list): Crop Left (Inner). SourceX = bleedPx.
                        if (i === 1) { // Right Page
                             sourceX = bleedPx;
                        }
                        // Left Page (i===0) defaults to sourceX=0 (cropping right side implicitly by reducing width)
                    }

                    ctx.drawImage(
                        tempCanvas,
                        sourceX, 0, sourceW, viewport.height, // Source
                        currentX, 0, sourceW, viewport.height // Dest
                    );

                    currentX += sourceW;
                }
                if (active) setLoaded(true);

            } catch (err) {
                console.error("Thumb render error", err);
            }
        };

        renderThumb();
        return () => { active = false; };
    }, [pdf, pageIndex, viewMode, rtl, bleedInches]);

    const label = viewMode === 'single'
        ? `Page ${pageIndex}`
        : (pageIndex === 1 ? 'Page 1' : `Spread ${pageIndex}`); // Fixed "Cover" label to "Page 1" for Internals

    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer border-b border-slate-700 bg-slate-900 hover:bg-slate-800 transition-colors flex items-center p-3 gap-3 ${isCurrent ? 'bg-slate-800 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
        >
             {/* Thumbnail Image Container */}
            <div className="w-16 h-16 shrink-0 flex items-center justify-center bg-slate-950 rounded border border-slate-700 overflow-hidden">
                 <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
            </div>
             {/* Label */}
            <span className="text-sm font-medium text-gray-300">
                {label}
            </span>
        </div>
    );
};

export default function PDFViewer({ fileUrl: initialFileUrl, project, projectId }: { fileUrl: string, project: any, projectId: string }) {
  const [user, setUser] = useState<any>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [viewIndex, setViewIndex] = useState<number>(1);

  const [scale, setScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1.0);

  const [activeFileUrl, setActiveFileUrl] = useState(initialFileUrl);
  const [activeTab, setActiveTab] = useState<'interior' | 'cover'>('interior');

  const [tool, setTool] = useState<'pan' | 'annotate'>('pan');
  // Removed sidebarTab state, simplified sidebar

  const defaultViewMode = isBookBinding(project.specs?.binding) ? 'spread' : 'single';
  const [viewMode, setViewMode] = useState<'single' | 'spread'>(defaultViewMode);

  const [guideOptions, setGuideOptions] = useState({ trim: true, bleed: true, safety: true });
  const [guideTooltip, setGuideTooltip] = useState<{ x: number, y: number, title: string, description: string } | null>(null);

  const [annotations, setAnnotations] = useState<any[]>([]);
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [pageRenderInfos, setPageRenderInfos] = useState<PageRenderInfo[]>([]);

  const rtl = project.specs?.readingDirection === 'rtl';

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    const q = query(collection(db, 'projects', projectId, 'annotations'), orderBy('createdAt', 'desc'));
    const unsubscribeNotes = onSnapshot(q, (snap) => {
        setAnnotations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubscribeAuth(); unsubscribeNotes(); };
  }, [projectId]);

  const switchTab = (tab: 'interior' | 'cover') => {
      setActiveTab(tab);
      setViewIndex(1);
      setPanOffset({ x: 0, y: 0 });

      if (tab === 'cover') {
           setViewMode('single');
           if (project.cover && project.cover.previewURL) setActiveFileUrl(project.cover.previewURL);
           else if (project.cover && project.cover.fileURL) setActiveFileUrl(project.cover.fileURL);
           else setActiveFileUrl('');
      } else {
          setViewMode(defaultViewMode);
          setActiveFileUrl(initialFileUrl);
      }
  };

  function onDocumentLoadSuccess(pdf: any) {
    setPdfDocument(pdf);
    setNumPages(pdf.numPages);
    fitToScreen(pdf);
  }

  const fitToScreen = useCallback(async (pdf = pdfDocument) => {
      if (!pdf || !viewerRef.current) return;

      try {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });

          const containerWidth = viewerRef.current.clientWidth;
          const containerHeight = viewerRef.current.clientHeight;

          const PADDING = 40;
          const availableWidth = containerWidth - PADDING;
          const availableHeight = containerHeight - PADDING;

          let contentWidth = viewport.width;
          let contentHeight = viewport.height;

          const bleed = project.specs?.bleedInches || 0.125;
          const bleedPx = bleed * INCH_TO_POINTS;

          if (viewMode === 'spread') {
              // Width = 2 pages - 2 bleeds (inner spines masked)
              contentWidth = (viewport.width * 2) - (bleedPx * 2);
          }

          const scaleW = availableWidth / contentWidth;
          const scaleH = availableHeight / contentHeight;

          const newScale = Math.min(scaleW, scaleH, 1.5);

          setFitScale(newScale);
          setScale(newScale);
          setPanOffset({ x: 0, y: 0 });

      } catch (e) {
          console.error("Error fitting to screen", e);
      }
  }, [pdfDocument, viewMode, project.specs]);

  useEffect(() => {
      const handleResize = () => fitToScreen();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [fitToScreen]);


  // --- Overlay Geometry & Guide Updates ---
  const updateOverlayGeometry = useCallback(() => {
     if (!contentRef.current || !canvasRef.current) return;

     const container = contentRef.current;
     const canvas = canvasRef.current;

     canvas.width = container.scrollWidth;
     canvas.height = container.scrollHeight;

     // Select wrapper divs, NOT the Page canvas/div itself, to get the clipped size
     const pageWrappers = container.querySelectorAll('.page-wrapper');
     const newInfos: PageRenderInfo[] = [];

     pageWrappers.forEach((el, index) => {
         const x = (el as HTMLElement).offsetLeft;
         const y = (el as HTMLElement).offsetTop;
         const width = (el as HTMLElement).offsetWidth;
         const height = (el as HTMLElement).offsetHeight;

         const isSpread = viewMode === 'spread' && pageWrappers.length > 1;
         let isLeft = false;

         if (isSpread) {
             if (rtl) {
                 isLeft = (index === 0);
             } else {
                 isLeft = (index === 0);
             }
         }

         // We pass scale: 1.0 because 'width'/'height' from DOM are already scaled by CSS transform/content size.
         // Wait, contentRef is transformed (translated). Inside it, the Page components are scaled by prop.
         // So offsetWidth IS the scaled width.
         // However, `drawGuides` multiplies by `scale`.
         // If we pass `width` (scaled) and `scale` (e.g. 1.2), guide logic does `width * 1.2` => double scale!
         // We must pass `scale: 1.0` if we measure the DOM which is already scaled.

         // Alternatively, we can divide DOM width by scale to get "base points", then pass current scale.
         // BUT, the cropping logic relies on visual pixels.
         // If we use scale: 1.0, `drawGuides` treats `specs.dimensions` (Points) as 1:1 to Pixels.
         // This works if 1 Point = 1 Pixel at Scale 1.
         // React-PDF renders 1pt = 1px at scale 1.
         // So yes, scale: 1.0 is the correct approach for `drawGuides` when using measured DOM values.

         newInfos.push({
             x,
             y,
             width,
             height,
             scale: 1.0,
             isSpread,
             isLeftPage: isLeft
        });
     });

     setPageRenderInfos(newInfos);
  }, [scale, viewIndex, numPages, viewMode, activeFileUrl, rtl]);

  useEffect(() => {
      const t = setTimeout(updateOverlayGeometry, 100);
      return () => clearTimeout(t);
  }, [updateOverlayGeometry]);

  useEffect(() => {
      if (!canvasRef.current || pageRenderInfos.length === 0) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentSpecs = activeTab === 'cover' && project.specs?.coverDimensions
          ? { ...project.specs, dimensions: project.specs.coverDimensions }
          : project.specs;

      if (currentSpecs) {
          drawGuides(ctx, currentSpecs, pageRenderInfos, guideOptions);
      }

  }, [pageRenderInfos, guideOptions, project.specs, activeTab]);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (tool === 'pan') {
          setIsDragging(true);
          setStartDrag({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else if (tool === 'annotate') {
          if (tempAnnotation) return;

          // Find which page was clicked
          const target = e.target as HTMLElement;
          const pageWrapper = target.closest('.page-wrapper') as HTMLElement;

          if (pageWrapper && pageWrapper.dataset.pageNumber) {
              const pageNum = parseInt(pageWrapper.dataset.pageNumber, 10);
              const rect = pageWrapper.getBoundingClientRect();

              // Calculate coordinates relative to the specific page, unscaled (Points)
              // We divide by scale because the visual element is scaled by CSS/React-PDF
              const x = (e.clientX - rect.left) / scale;
              const y = (e.clientY - rect.top) / scale;

              setTempAnnotation({ x, y, page: pageNum });
          }
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging && tool === 'pan') {
          setPanOffset({ x: e.clientX - startDrag.x, y: e.clientY - startDrag.y });
      }

      if (canvasRef.current && pageRenderInfos.length > 0) {
           const rect = canvasRef.current.getBoundingClientRect();
           const x = e.clientX - rect.left;
           const y = e.clientY - rect.top;

           const currentSpecs = activeTab === 'cover' && project.specs?.coverDimensions
            ? { ...project.specs, dimensions: project.specs.coverDimensions }
            : project.specs;

           const hit = getGuideHit(x, y, currentSpecs, pageRenderInfos, guideOptions);
           if (hit) {
              setGuideTooltip({ x: e.clientX, y: e.clientY, ...hit });
           } else {
              setGuideTooltip(null);
           }
      }
  };

  const handleMouseUp = () => setIsDragging(false);

  const saveAnnotation = async () => {
      if (!tempAnnotation || !commentText || !user) return;
      try {
          // We need to map the viewer-relative click (tempAnnotation.x/y) to the specific page and its local coordinates
          // However, for this fix, we will save the viewer-relative coordinates and pageNumber as 0 or the current view index?
          // Legacy saved page-relative coordinates.
          // Since we simplified the click to be viewer-relative, we will save it as such for now,
          // but logically associate it with the current view (pageNumber = viewIndex).

          await addDoc(collection(db, 'projects', projectId, 'annotations'), {
              text: commentText,
              x: tempAnnotation.x,
              y: tempAnnotation.y,
              pageNumber: tempAnnotation.page, // Use the correct page number
              context: activeTab,
              author: user.email,
              authorUid: user.uid,
              createdAt: serverTimestamp(),
              resolved: false
          });
          setTempAnnotation(null);
          setCommentText('');
          setTool('pan');
          // Sidebar is simplified, so we don't switch tabs
      } catch (e) {
          console.error("Failed to save annotation", e);
          alert("Error saving comment.");
      }
  };

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


  const renderPages = () => {
      const pageIndices = getPagesForView(viewIndex, numPages, viewMode, rtl);

      const bleed = project.specs?.bleedInches || 0.125;
      const bleedPx = bleed * INCH_TO_POINTS * scale;

      return (
          <div className="flex flex-row items-center justify-center shadow-2xl relative bg-white">
              {pageIndices.map((pageNum, idx) => {
                  const isSpread = viewMode === 'spread' && pageIndices.length > 1;

                  // Masking Styles
                  // We use a wrapper div to clip the content
                  let clipStyle: React.CSSProperties = {
                      position: 'relative',
                      overflow: 'hidden',
                      zIndex: 1 // Default
                  };

                  // Content Style (Shift the PDF Page inside the clipped wrapper)
                  let contentStyle: React.CSSProperties = {};

                  if (isSpread) {
                      // Left Page (idx 0): Clip Right Side.
                      // Wrapper Width = Full Width - Bleed.
                      // Content Position = Left 0.

                      // Right Page (idx 1): Clip Left Side.
                      // Wrapper Width = Full Width - Bleed.
                      // Content Position = Left -Bleed.

                      // Note: We don't know exact width yet (it's dynamic).
                      // But we can use `width: calc(100% - bleed)`? No, React-PDF page sets explicit width.
                      // We can assume the Wrapper shrinks to fit children, then we force width?

                      // Better: Use `margin` and `overflow`.
                      // But `react-pdf` sets explicit width/height on the canvas/div.
                      // We can use a precise pixel reduction since we know `bleedPx`.

                      // However, we can't easily set "width = auto - bleedPx" in JS without measuring.
                      // Trick: Use a negative margin on the *Page* component?
                      // If we set `marginLeft: -bleedPx` on the Right Page, it moves left.
                      // If the container is `overflow: hidden` and width is constrained...

                      // Let's use `calc` based on the known PDF dimensions?
                      // `scale` is known. `specs.dimensions` is known.
                      // Page width = `specs.dimensions.width * scale`.
                      // Clipped Width = `(specs.dimensions.width - bleed) * scale`. (Roughly, if dimensions include bleed).

                      // WAIT. `specs.dimensions` is TRIM size usually? Or Full size?
                      // Usually Specs = Trim Size (e.g. 8.5x11).
                      // PDF File = Trim + Bleed (e.g. 8.75x11.25).
                      // So the Page Width > Specs Width.
                      // Bleed is the extra part.
                      // We want to clip the *inner* bleed.

                      // So we just need to clip `bleedPx` off the side.
                      // We can simply set the wrapper width to `calc(100% - ${bleedPx}px)`?
                      // No, React-PDF puts inline styles on the Page div.

                      // Robust Solution:
                      // Wrapper `width` is NOT set (fits content).
                      // Wrapper `maxWidth = "calc(100% - bleed)"`? No.

                      // We can set an explicit width on the wrapper if we calculate it.
                      // But React-PDF `onLoadSuccess` gives us dimensions.
                      // Simpler: Just rely on visual overlap? No, user requested "bleed mask active".

                      // CSS Clip Path!
                      // Left Page: `inset(0px ${bleedPx}px 0px 0px)`
                      // Right Page: `inset(0px 0px 0px ${bleedPx}px)`
                      // AND shift them together.

                      if (idx === 0) {
                           // Left Page: Clip Right
                           clipStyle.clipPath = `inset(0px ${bleedPx}px 0px 0px)`;
                           // No shift needed
                           clipStyle.marginRight = `-${bleedPx}px`; // Pull next element closer
                      } else {
                           // Right Page: Clip Left
                           clipStyle.clipPath = `inset(0px 0px 0px ${bleedPx}px)`;
                           // Shift left happens via negative margin of previous, or self?
                           // If previous pulls, this follows.
                      }
                  }

                  return (
                      <div key={pageNum} className="page-wrapper" style={clipStyle} data-page-number={pageNum}>
                          <div style={contentStyle}>
                            <Page
                                pageNumber={pageNum}
                                scale={scale}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                                className="" // Removed border class
                            />
                          </div>
                          {/* Annotations */}
                          {annotations.filter(a => a.pageNumber === pageNum && a.context === activeTab).map(note => (
                                <div key={note.id} className="absolute w-8 h-8 -ml-4 -mt-8 text-indigo-500 drop-shadow-lg z-30 hover:scale-110 transition-transform cursor-pointer"
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

  const label = viewMode === 'single' ? `Page ${viewIndex}` : (viewIndex === 1 ? 'Page 1' : `Spread ${viewIndex}`);

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

                <div className="flex bg-slate-800 rounded-lg p-1 ml-4 border border-white/5">
                    <button onClick={() => switchTab('interior')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'interior' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Interior</button>
                    <button onClick={() => switchTab('cover')} disabled={!project.cover} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'cover' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white disabled:opacity-30'}`}>Cover</button>
                </div>
            </div>

             <div className="flex items-center gap-4 bg-slate-800/80 backdrop-blur rounded-full px-4 py-2 border border-white/10 shadow-xl">
                <button onClick={() => setViewIndex(Math.max(1, viewIndex - 1))} disabled={viewIndex <= 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 hover:bg-white/10 rounded-full transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>

                <span className="text-sm font-mono w-20 text-center text-gray-300">
                    {label}
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
                    <div className="grid grid-cols-1 gap-4"> {/* Single Column */}
                        {pdfDocument && Array.from({ length: getViewCount(numPages, viewMode) }).map((_, i) => {
                             const idx = i + 1;
                             return (
                                <Thumbnail
                                    key={idx}
                                    pdf={pdfDocument}
                                    pageIndex={idx}
                                    viewMode={viewMode}
                                    isCurrent={viewIndex === idx}
                                    onClick={() => setViewIndex(idx)}
                                    rtl={rtl}
                                    bleedInches={project.specs?.bleedInches || 0.125}
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
                            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: tool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair'
                        }}
                    >
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

            {/* Right Sidebar - Combined Specs & Comments */}
            <aside className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col z-10 shrink-0 shadow-xl">
                <div className="p-4 border-b border-slate-700 text-xs font-bold text-gray-500 uppercase tracking-widest bg-slate-900/50">
                    Project Specs
                </div>
                <div className="p-4 border-b border-slate-700 bg-slate-800/30">
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-white/5">
                            <tr>
                                <td className="py-2 text-gray-500 text-xs uppercase pr-4">Dimensions</td>
                                <td className="py-2 text-white font-mono text-xs text-right">
                                    {project.specs?.dimensions ? `${project.specs.dimensions.width} x ${project.specs.dimensions.height} ${project.specs.dimensions.units}` : 'N/A'}
                                </td>
                            </tr>
                            <tr>
                                <td className="py-2 text-gray-500 text-xs uppercase pr-4">Quantity</td>
                                <td className="py-2 text-white font-medium text-right">{project.specs?.quantity || '-'}</td>
                            </tr>
                             <tr>
                                <td className="py-2 text-gray-500 text-xs uppercase pr-4">Paper</td>
                                <td className="py-2 text-white font-medium text-right">{project.specs?.paperType || 'Standard'}</td>
                            </tr>
                            <tr>
                                <td className="py-2 text-gray-500 text-xs uppercase pr-4">Binding</td>
                                <td className="py-2 text-white font-medium text-right">{project.specs?.binding || 'Loose Sheets'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-b border-slate-700 text-xs font-bold text-gray-500 uppercase tracking-widest bg-slate-900/50 flex justify-between items-center">
                    <span>Comments</span>
                    <span className="bg-indigo-600 text-white px-1.5 rounded-full text-[10px]">{annotations.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900">
                     {annotations.length === 0 && (
                        <div className="text-center py-8">
                             <p className="text-gray-600 text-sm italic">No comments yet.</p>
                             <p className="text-gray-700 text-xs mt-1">Select the annotate tool to leave feedback.</p>
                        </div>
                     )}
                     <div className="space-y-3">
                     {annotations.map(note => (
                        <div key={note.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors group relative" onClick={() => setViewIndex(note.pageNumber)}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300">{note.author}</span>
                                <span className="text-[10px] text-gray-500 bg-slate-900 px-1.5 py-0.5 rounded">Page {note.pageNumber}</span>
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{note.text}</p>
                            <div className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                     ))}
                     </div>
                </div>
            </aside>
        </div>

        {isApprovalModalOpen && <ApprovalModal isOpen={isApprovalModalOpen} onClose={() => setIsApprovalModalOpen(false)} onConfirm={handleApprove} project={project} />}
    </div>
  );
}
