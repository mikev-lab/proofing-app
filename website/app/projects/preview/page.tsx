'use client';

import React from 'react';
import { useStore } from '../../context/StoreContext';
import Link from 'next/link';

export default function ProjectPreviewPage() {
  const { addItem } = useStore();

  const handleAddProject = () => {
    addItem({
        title: "My Custom Comic Book",
        quantity: 1,
        unit_price: 15400, // $154.00
        metadata: {
            firebaseProjectId: "proj_123_abc",
            specs: "500 copies, 32 pages, Saddle Stitch"
        },
        variant: {
            title: "Custom Run"
        }
    });
  };

  return (
    <div className="bg-slate-900 min-h-screen py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl">
            <div className="border-b border-slate-700 pb-6 mb-6">
                <h1 className="text-3xl font-bold text-white">Project Review</h1>
                <p className="text-gray-400 mt-2">ID: proj_123_abc</p>
            </div>

            <div className="space-y-6 mb-8">
                <div className="flex justify-between">
                    <span className="text-gray-400">Project Name</span>
                    <span className="text-white font-medium">My Custom Comic Book</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Binding</span>
                    <span className="text-white font-medium">Saddle Stitch</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Quantity</span>
                    <span className="text-white font-medium">500</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Total Price</span>
                    <span className="text-green-400 font-bold text-xl">$154.00</span>
                </div>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={handleAddProject}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-md shadow-lg transition-all"
                >
                    Proceed to Checkout
                </button>
                <Link href="/" className="flex-none px-6 py-4 border border-slate-600 text-gray-300 rounded-md hover:text-white">
                    Edit
                </Link>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
                This demonstrates "Flow A" where a finished project is added to the Medusa cart.
            </p>
        </div>
      </div>
    </div>
  );
}
