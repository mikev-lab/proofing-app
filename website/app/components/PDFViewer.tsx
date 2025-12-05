'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { db, auth } from '../firebase/config';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Use local worker to avoid CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function PDFViewer({ fileUrl, project, projectId }: { fileUrl: string, project: any, projectId: string }) {
  const [user, setUser] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState(1.0);

  // Tools
  const [tool, setTool] = useState<'pan' | 'annotate'>('pan');
  const [showSpecs, setShowSpecs] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'comments' | 'thumbnails'>('comments');

  // Annotations
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  // Interaction Refs
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
    });

    const q = query(collection(db, 'projects', projectId, 'annotations'), orderBy('createdAt', 'desc'));
    const unsubscribeNotes = onSnapshot(q, (snap) => {
        setAnnotations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
        unsubscribeAuth();
        unsubscribeNotes();
    };
  }, [projectId]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // --- Interaction Logic ---

  const handleMouseDown = (e: React.MouseEvent) => {
      if (tool === 'pan') {
          setIsDragging(true);
          setStartDrag({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else if (tool === 'annotate') {
          // Place annotation marker
          if (tempAnnotation) return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const x = (e.clientX - rect.left) / scale;
          const y = (e.clientY - rect.top) / scale;
          setTempAnnotation({ x, y, page: pageNumber });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging && tool === 'pan') {
          setPanOffset({
              x: e.clientX - startDrag.x,
              y: e.clientY - startDrag.y
          });
      }
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  const saveAnnotation = async () => {
      if (!tempAnnotation || !commentText || !user) return;
      try {
          await addDoc(collection(db, 'projects', projectId, 'annotations'), {
              text: commentText,
              x: tempAnnotation.x,
              y: tempAnnotation.y,
              pageNumber: pageNumber,
              author: user.email,
              authorUid: user.uid,
              createdAt: serverTimestamp(),
              resolved: false
          });
          setTempAnnotation(null);
          setCommentText('');
          setTool('pan'); // Reset to pan after commenting
      } catch (e) {
          console.error("Failed to save annotation", e);
          alert("Error saving comment.");
      }
  };

  const handleApprove = async () => {
      if (confirm("Are you sure you want to approve this proof? This will move the project to production.")) {
          await updateDoc(doc(db, 'projects', projectId), { status: 'Approved' });
          alert("Project Approved!");
      }
  };

  const handleRequestChanges = async () => {
      const reason = prompt("Please describe the changes needed:");
      if (reason) {
          await updateDoc(doc(db, 'projects', projectId), { status: 'Changes Requested' });
          // Optionally add an annotation or log
          await addDoc(collection(db, 'projects', projectId, 'annotations'), {
              text: `CHANGES REQUESTED: ${reason}`,
              x: 50, y: 50, pageNumber: 1, // Generic placement
              author: user.email,
              authorUid: user.uid,
              createdAt: serverTimestamp(),
              isSystemMessage: true
          });
          alert("Changes requested.");
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col h-screen overflow-hidden text-gray-100">

        {/* Top Bar */}
        <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-20 flex-shrink-0 shadow-md">
            <div className="flex items-center gap-4">
                <a href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </a>
                <div>
                    <h1 className="text-white font-bold text-lg truncate max-w-xs">{project.projectName}</h1>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">v{project.versions?.length || 1}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                            project.status === 'Approved' ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'
                        }`}>{project.status}</span>
                    </div>
                </div>
            </div>

            {/* Pagination & Zoom */}
            <div className="flex items-center gap-4 bg-slate-900 rounded-lg p-1.5 border border-slate-700 shadow-inner">
                <button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-sm font-mono w-16 text-center">{pageNumber} / {numPages || '-'}</span>
                <button onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))} disabled={pageNumber >= numPages} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <div className="w-px h-4 bg-slate-700 mx-1"></div>
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-slate-800">-</button>
                <span className="text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-slate-800">+</button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                    <button
                        onClick={() => setTool('pan')}
                        className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        title="Pan Tool"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    </button>
                    <button
                        onClick={() => setTool('annotate')}
                        className={`p-2 rounded ${tool === 'annotate' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                        title="Comment Tool"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                    </button>
                </div>
                <button onClick={() => setShowSpecs(!showSpecs)} className="text-gray-400 hover:text-white p-2" title="Project Specs">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </button>
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">

            {/* Sidebar */}
            <aside className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col z-10 flex-shrink-0">
                <div className="flex border-b border-slate-700">
                    <button
                        onClick={() => setSidebarTab('comments')}
                        className={`flex-1 py-3 text-sm font-medium ${sidebarTab === 'comments' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
                    >
                        Comments ({annotations.length})
                    </button>
                    <button
                        onClick={() => setSidebarTab('thumbnails')}
                        className={`flex-1 py-3 text-sm font-medium ${sidebarTab === 'thumbnails' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
                    >
                        Pages
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {sidebarTab === 'comments' ? (
                        annotations.length === 0 ? (
                            <div className="text-center text-gray-600 text-sm py-8">
                                No comments yet.<br/>Select the comment tool to add one.
                            </div>
                        ) : (
                            annotations.map(note => (
                                <div key={note.id} className="bg-slate-800 p-3 rounded border border-slate-700 hover:border-indigo-500 cursor-pointer transition-all hover:bg-slate-750 group"
                                     onClick={() => setPageNumber(note.pageNumber)}>
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                            <span className="text-xs font-bold text-gray-200">{note.author}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-500 bg-slate-900 px-1.5 rounded">Page {note.pageNumber}</span>
                                    </div>
                                    <p className="text-sm text-gray-300 pl-4">{note.text}</p>
                                </div>
                            ))
                        )
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {Array.from(new Array(numPages), (el, index) => (
                                <div
                                    key={`thumb_${index + 1}`}
                                    className={`relative cursor-pointer border-2 rounded overflow-hidden ${pageNumber === index + 1 ? 'border-indigo-500' : 'border-transparent hover:border-gray-600'}`}
                                    onClick={() => setPageNumber(index + 1)}
                                >
                                    <div className="aspect-[1/1.4] bg-white flex items-center justify-center text-gray-400 text-xs">
                                        {/* Ideally render actual thumbnail here using pdf.js, simplified for now */}
                                        Page {index + 1}
                                    </div>
                                    <div className="absolute bottom-0 w-full bg-black/50 text-center text-[10px] py-0.5 text-white">
                                        {index + 1}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Approval Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-900 space-y-3">
                    <button
                        onClick={handleApprove}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Approve Proof
                    </button>
                    <button
                        onClick={handleRequestChanges}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-medium rounded-lg border border-slate-600 transition-all"
                    >
                        Request Changes
                    </button>
                </div>
            </aside>

            {/* Main Canvas */}
            <main
                className="flex-1 bg-slate-950 overflow-hidden relative cursor-default"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    className="absolute transition-transform duration-75 origin-center"
                    style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                        cursor: tool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair'
                    }}
                    ref={pageContainerRef}
                >
                    <div className="min-h-full min-w-full flex items-center justify-center p-20">
                        <div className="relative shadow-2xl">
                            <Document
                                file={fileUrl}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={<div className="text-white animate-pulse">Loading PDF Engine...</div>}
                                error={<div className="text-red-400 bg-red-900/20 p-4 rounded border border-red-800">Failed to load PDF. Please refresh.</div>}
                            >
                                <Page
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    renderAnnotationLayer={false}
                                    renderTextLayer={false}
                                    className="border border-slate-700"
                                />

                                {/* Markers */}
                                {annotations.filter(a => a.pageNumber === pageNumber).map(note => (
                                    <div
                                        key={note.id}
                                        className="absolute w-8 h-8 -ml-4 -mt-8 text-indigo-500 drop-shadow-lg z-10 hover:scale-110 transition-transform cursor-pointer group"
                                        style={{ left: note.x * scale, top: note.y * scale }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                                            <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                        </svg>
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-max max-w-xs bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            {note.text}
                                        </div>
                                    </div>
                                ))}

                                {/* New Annotation Input */}
                                {tempAnnotation && tempAnnotation.page === pageNumber && (
                                    <div
                                        className="absolute bg-slate-800 p-3 rounded-lg shadow-2xl border border-indigo-500 z-50 w-72 animate-in fade-in zoom-in duration-200"
                                        style={{ left: tempAnnotation.x * scale, top: tempAnnotation.y * scale }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-indigo-400">New Comment</span>
                                            <button onClick={() => setTempAnnotation(null)} className="text-gray-500 hover:text-white">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                        <textarea
                                            autoFocus
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm mb-3 focus:outline-none focus:border-indigo-500 resize-none"
                                            rows={3}
                                            placeholder="Type your comment here..."
                                            value={commentText}
                                            onChange={e => setCommentText(e.target.value)}
                                        ></textarea>
                                        <div className="flex justify-end">
                                            <button onClick={saveAnnotation} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition-colors">
                                                Save Comment
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </Document>
                        </div>
                    </div>
                </div>
            </main>

            {/* Specs Slide-over */}
            {showSpecs && (
                <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-800 shadow-2xl border-l border-slate-700 z-30 p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">Project Specs</h2>
                        <button onClick={() => setShowSpecs(false)} className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="space-y-4 text-sm">
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Dimensions</label>
                            <div className="text-white font-mono bg-slate-900 p-2 rounded border border-slate-700">
                                {project.specs?.dimensions ? `${project.specs.dimensions.width} x ${project.specs.dimensions.height} ${project.specs.dimensions.units}` : 'N/A'}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Quantity</label>
                            <div className="text-white font-medium">{project.specs?.quantity || '-'}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Paper Stock</label>
                            <div className="text-white font-medium">{project.specs?.paperType || 'Standard'}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Cover Stock</label>
                            <div className="text-white font-medium">{project.specs?.coverPaperType || 'Self Cover'}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Binding</label>
                            <div className="text-white font-medium">{project.specs?.binding || 'Loose'}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
}
