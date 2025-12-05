'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { db, auth } from '../firebase/config';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function PDFViewer({ fileUrl, project, projectId }: { fileUrl: string, project: any, projectId: string }) {
  const [user, setUser] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState(1.0);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  const pageContainerRef = useRef<HTMLDivElement>(null);

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

  const handlePageClick = (e: React.MouseEvent) => {
      if (!isAnnotating) return;
      if (tempAnnotation) return;

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      setTempAnnotation({ x, y, page: pageNumber });
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
          setIsAnnotating(false);
      } catch (e) {
          console.error("Failed to save annotation", e);
          alert("Error saving comment.");
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-10 flex-shrink-0">
            <div className="flex items-center gap-4">
                <a href="/dashboard" className="text-gray-400 hover:text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </a>
                <div>
                    <h1 className="text-white font-bold truncate max-w-xs">{project.projectName}</h1>
                    <span className="text-xs text-gray-400">Beta Viewer</span>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-900 rounded-lg p-1 border border-slate-700">
                <button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-sm text-gray-300 font-mono w-16 text-center">{pageNumber} / {numPages}</span>
                <button onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))} disabled={pageNumber >= numPages} className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={() => setIsAnnotating(!isAnnotating)}
                    className={`px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${isAnnotating ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-gray-300 hover:text-white'}`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    {isAnnotating ? 'Click to Comment' : 'Add Comment'}
                </button>
                <div className="h-6 w-px bg-slate-600 mx-1"></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="text-gray-400 hover:text-white p-1">-</button>
                    <span className="text-xs text-gray-400 w-8 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="text-gray-400 hover:text-white p-1">+</button>
                </div>
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
            <aside className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col z-20 flex-shrink-0">
                <div className="p-4 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Comments</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {annotations.length === 0 ? (
                        <div className="text-center text-gray-600 text-sm py-8">No comments yet.</div>
                    ) : (
                        annotations.map(note => (
                            <div key={note.id} className="bg-slate-800 p-3 rounded border border-slate-700 hover:border-indigo-500 cursor-pointer transition-colors"
                                 onClick={() => setPageNumber(note.pageNumber)}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-indigo-400">{note.author}</span>
                                    <span className="text-xs text-gray-500">Page {note.pageNumber}</span>
                                </div>
                                <p className="text-sm text-gray-300">{note.text}</p>
                            </div>
                        ))
                    )}
                </div>
            </aside>

            <main className="flex-1 bg-slate-950 overflow-auto flex justify-center p-8 relative">
                <div className="relative shadow-2xl" ref={pageContainerRef}>
                    <Document
                        file={fileUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={<div className="text-white">Loading PDF...</div>}
                        error={<div className="text-red-400">Failed to load PDF.</div>}
                    >
                        <div
                            className="relative"
                            onClick={handlePageClick}
                            style={{ cursor: isAnnotating ? 'crosshair' : 'default' }}
                        >
                            <Page
                                pageNumber={pageNumber}
                                scale={scale}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                            />

                            {annotations.filter(a => a.pageNumber === pageNumber).map(note => (
                                <div
                                    key={note.id}
                                    className="absolute w-6 h-6 -ml-3 -mt-3 bg-indigo-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold z-10 hover:scale-110 transition-transform cursor-pointer"
                                    style={{ left: note.x * scale, top: note.y * scale }}
                                    title={`${note.author}: ${note.text}`}
                                >
                                    !
                                </div>
                            ))}

                            {tempAnnotation && tempAnnotation.page === pageNumber && (
                                <div
                                    className="absolute bg-slate-800 p-3 rounded shadow-xl border border-indigo-500 z-50 w-64"
                                    style={{ left: tempAnnotation.x * scale, top: tempAnnotation.y * scale }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <textarea
                                        autoFocus
                                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm mb-2 focus:outline-none focus:border-indigo-500"
                                        rows={3}
                                        placeholder="Type comment..."
                                        value={commentText}
                                        onChange={e => setCommentText(e.target.value)}
                                    ></textarea>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setTempAnnotation(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                                        <button onClick={saveAnnotation} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500">Save</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Document>
                </div>
            </main>
        </div>
    </div>
  );
}
