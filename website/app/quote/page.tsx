'use client';

import React, { useState } from 'react';

export default function QuoteCalculator() {
  const [projectType, setProjectType] = useState('booklet');
  const [size, setSize] = useState('5.5x8.5');
  const [quantity, setQuantity] = useState('100');
  const [paper, setPaper] = useState('80lb-gloss');
  const [pages, setPages] = useState('28');

  // Mock calculation logic
  const calculatePrice = () => {
    const baseRate = projectType === 'booklet' ? 2.50 : 1.50;
    const qty = parseInt(quantity);
    const pageCount = parseInt(pages);

    let total = baseRate * qty;
    if (size === '8.5x11') total *= 1.4;
    if (paper === '100lb-gloss') total *= 1.1;
    total += (pageCount * 0.05 * qty);

    return total.toFixed(2);
  };

  return (
    <div className="bg-slate-900 min-h-screen py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-white">Instant Quote Estimator</h1>
          <p className="mt-4 text-gray-400">Get a real-time price estimate for your printing project.</p>
        </div>

        <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Configuration Form */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Project Type</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="booklet">Saddle Stitch Booklet</option>
                    <option value="perfect-bound">Perfect Bound Book</option>
                    <option value="poster">Poster / Art Print</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Size</label>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="5.5x8.5">5.5" x 8.5"</option>
                    <option value="6x9">6" x 9"</option>
                    <option value="8.5x11">8.5" x 11"</option>
                    <option value="A5">A5</option>
                    <option value="A4">A4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Paper Stock</label>
                  <select
                    value={paper}
                    onChange={(e) => setPaper(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="80lb-gloss">80lb Gloss Text</option>
                    <option value="100lb-gloss">100lb Gloss Text</option>
                    <option value="70lb-uncoated">70lb Uncoated</option>
                  </select>
                </div>

                 <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Page Count</label>
                  <input
                    type="number"
                    value={pages}
                    onChange={(e) => setPages(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Estimate Result */}
              <div className="bg-slate-900 rounded-lg p-6 border border-slate-700 flex flex-col justify-between">
                 <div>
                   <h3 className="text-lg font-medium text-white mb-4">Estimated Cost</h3>
                   <div className="flex items-baseline mb-2">
                     <span className="text-4xl font-bold text-white">${calculatePrice()}</span>
                     <span className="text-gray-400 ml-2">USD</span>
                   </div>
                   <p className="text-sm text-gray-500 mb-6">
                     ${(parseFloat(calculatePrice()) / parseInt(quantity)).toFixed(2)} per unit
                   </p>

                   <div className="space-y-3 text-sm text-gray-300 border-t border-slate-800 pt-4">
                     <div className="flex justify-between">
                       <span>Binding:</span>
                       <span className="font-medium text-white">{projectType === 'booklet' ? 'Saddle Stitch' : projectType === 'perfect-bound' ? 'Perfect Bound' : 'None'}</span>
                     </div>
                     <div className="flex justify-between">
                       <span>Turnaround:</span>
                       <span className="font-medium text-white">Standard (5-7 Days)</span>
                     </div>
                   </div>
                 </div>

                 <div className="mt-8">
                   <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-500/30">
                     Proceed to Upload
                   </button>
                   <p className="text-xs text-center text-gray-500 mt-3">
                     *Final price may vary based on file specs and shipping.
                   </p>
                 </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
