'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ProofContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center p-8 bg-slate-800 rounded-xl border border-slate-700">
            <h1 className="text-2xl font-bold mb-4">New Proof Viewer</h1>
            <p className="text-gray-400 mb-6">
                We are rebuilding the proofing experience from the ground up for better performance.
            </p>
            <div className="flex gap-4 justify-center">
                <a
                    href={`/proof_old?id=${projectId}`}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded font-medium transition-colors"
                >
                    Open Classic Viewer
                </a>
                <button disabled className="px-6 py-3 bg-slate-700 text-gray-500 rounded cursor-not-allowed">
                    Try Beta (Soon)
                </button>
            </div>
        </div>
    </div>
  );
}

export default function ProofPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>}>
      <ProofContent />
    </Suspense>
  );
}
