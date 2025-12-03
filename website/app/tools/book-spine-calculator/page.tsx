'use client';

import React, { useState } from 'react';
import Link from 'next/link';

// Simple caliper constants (approximate values in inches)
const PAPER_CALIPERS: Record<string, number> = {
  '70lb Uncoated': 0.0052,
  '80lb Gloss Text': 0.0038,
  '100lb Gloss Text': 0.0048,
  '60lb Uncoated': 0.0046,
};

export default function BookSpineCalculator() {
  const [pageCount, setPageCount] = useState<number | ''>('');
  const [paperType, setPaperType] = useState<string>('80lb Gloss Text');
  const [spineWidth, setSpineWidth] = useState<number | null>(null);

  const calculateSpine = () => {
    if (!pageCount || typeof pageCount !== 'number') {
        setSpineWidth(null);
        return;
    }
    // Formula: (Pages / 2) * Caliper (since 2 pages = 1 sheet)
    // Actually, caliper is usually per sheet (2 pages). Let's assume standard caliper is per leaf (2 pages).
    // If caliper is per single sheet of paper (2 pages):
    const sheets = Math.ceil(pageCount / 2);
    const caliper = PAPER_CALIPERS[paperType] || 0.004;
    const width = sheets * caliper;
    setSpineWidth(width);
  };

  return (
    <div className="bg-slate-900 min-h-screen pb-20">
       <div className="bg-slate-800 border-b border-slate-700 py-12">
        <div className="max-w-3xl mx-auto px-4 text-center">
            <h1 className="text-3xl font-bold text-white mb-4">Book Spine Width Calculator</h1>
            <p className="text-gray-400">Enter your page count and paper stock to get the exact spine width for your cover template.</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-12">
        <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-8">
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Number of Pages</label>
                    <input
                        type="number"
                        value={pageCount}
                        onChange={(e) => setPageCount(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                        placeholder="e.g. 100"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Paper Stock</label>
                    <select
                        value={paperType}
                        onChange={(e) => setPaperType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    >
                        {Object.keys(PAPER_CALIPERS).map(stock => (
                            <option key={stock} value={stock}>{stock}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={calculateSpine}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-md transition-colors"
                >
                    Calculate Width
                </button>
            </div>

            {spineWidth !== null && (
                <div className="mt-8 pt-8 border-t border-slate-700 animate-fade-in">
                    <h3 className="text-center text-gray-400 text-sm uppercase tracking-wide">Estimated Spine Width</h3>
                    <div className="text-center mt-2 flex items-baseline justify-center gap-2">
                        <span className="text-4xl font-bold text-white">{spineWidth.toFixed(4)}"</span>
                        <span className="text-lg text-gray-500">inches</span>
                    </div>
                    <div className="text-center mt-1 text-gray-500">
                        ({(spineWidth * 25.4).toFixed(2)} mm)
                    </div>

                    <div className="mt-6 bg-yellow-900/20 border border-yellow-500/30 rounded p-4">
                        <p className="text-yellow-200 text-sm text-center">
                            <strong>Note:</strong> This is an estimate. Paper bulk can vary by batch.
                            We always recommend adding a 0.0625" safety margin.
                        </p>
                    </div>
                </div>
            )}
        </div>

        <div className="mt-8 text-center">
            <Link href="/tools" className="text-indigo-400 hover:text-indigo-300 text-sm">
                &larr; Back to all tools
            </Link>
        </div>
      </div>
    </div>
  );
}
