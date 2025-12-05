'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ProofOldContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');

  if (!projectId) return <div className="text-white text-center p-10">No Project ID</div>;

  return (
    <div className="w-full h-[calc(100vh-64px)] bg-slate-900">
      <iframe
        src={`/legacy-portal/proof.html?id=${projectId}`}
        className="w-full h-full border-none"
        title="Legacy Proof Viewer"
      />
    </div>
  );
}

export default function ProofPageOld() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>}>
      <ProofOldContent />
    </Suspense>
  );
}
