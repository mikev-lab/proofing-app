'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db, auth } from '../firebase/config';
import { doc, onSnapshot, getDoc, collection, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- SSR SAFE IMPORTS ---
// Dynamic import for the entire Viewer component to prevent ANY react-pdf code from running on server
const PDFViewer = dynamic(() => import('../components/PDFViewer'), {
    ssr: false,
    loading: () => <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading PDF Engine...</div>
});

function ProofViewerContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribeProject = onSnapshot(doc(db, 'projects', projectId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setProject({ id: docSnap.id, ...data });

            let url = null;
            if (data.impositions && data.impositions.length > 0) {
                const latestImp = data.impositions.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
                url = latestImp.fileURL;
            } else if (data.versions && data.versions.length > 0) {
                const latestVer = data.versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
                url = latestVer.previewURL || latestVer.fileURL;
            }
            setFileUrl(url);
        }
        setLoading(false);
    });

    return () => unsubscribeProject();
  }, [projectId]);

  if (loading) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Project...</div>;
  if (!project) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Project not found.</div>;
  if (!fileUrl) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">No PDF file available.</div>;

  return (
      <PDFViewer fileUrl={fileUrl} project={project} projectId={projectId!} />
  );
}

export default function ProofPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Viewer...</div>}>
            <ProofViewerContent />
        </Suspense>
    );
}
