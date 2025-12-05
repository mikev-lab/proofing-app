'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db, auth } from '../firebase/config';
import { doc, onSnapshot, getDoc, collection, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const PDFViewer = dynamic(() => import('../components/PDFViewer'), {
    ssr: false,
    loading: () => <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading PDF Engine...</div>
});

function ProofViewerContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // File State
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribeProject = onSnapshot(doc(db, 'projects', projectId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setProject({ id: docSnap.id, ...data });

            // Initial Load Logic: Prioritize Preview
            let url = null;

            // 1. Check for optimized preview from latest version
            if (data.versions && data.versions.length > 0) {
                const latestVer = data.versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
                // Check processing status
                if (latestVer.processingStatus === 'complete' && latestVer.previewURL) {
                    url = latestVer.previewURL;
                } else if (latestVer.processingStatus === 'complete' && latestVer.fileURL) {
                    url = latestVer.fileURL; // Fallback to raw if no preview but complete
                }
                // If processing, we might want to show a loader, but here we just don't set a URL yet
            }

            setFileUrl(url);
        }
        setLoading(false);
    });

    return () => unsubscribeProject();
  }, [projectId]);

  if (loading) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Project...</div>;
  if (!project) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Project not found.</div>;

  // Handle processing state explicitly
  const latestVersion = project.versions?.sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
  if (latestVersion && latestVersion.processingStatus === 'processing') {
      return (
          <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-center">
                  <h2 className="text-xl font-bold">Processing Proof</h2>
                  <p className="text-gray-400">Optimizing your file for web viewing...</p>
              </div>
          </div>
      );
  }

  if (!fileUrl) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">No proof file available.</div>;

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
