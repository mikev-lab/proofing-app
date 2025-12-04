import React from 'react';
import Link from 'next/link';

export async function generateStaticParams() {
  return [
    { id: '1024' },
    { id: '1023' },
    { id: '1022' },
    { id: '1021' },
  ];
}

export default async function OrderDetailMock({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Order {id}</h1>
            <div className="space-x-3">
                <button className="px-4 py-2 bg-slate-800 text-white rounded border border-slate-600 hover:bg-slate-700">Sync to Production</button>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500">Capture Payment</button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column: Medusa Order Data */}
            <div className="lg:col-span-2 space-y-8">
                {/* Line Items */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-700">
                        <h2 className="text-lg font-bold text-white">Line Items</h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="flex items-start">
                            <div className="h-16 w-16 bg-slate-700 rounded mr-4"></div>
                            <div className="flex-1">
                                <h3 className="text-white font-medium">Custom Hardcover Book</h3>
                                <p className="text-sm text-gray-400">Variant: 500 Copies</p>
                                <div className="mt-2 text-xs text-indigo-400 bg-indigo-900/20 inline-block px-2 py-1 rounded border border-indigo-500/30">
                                    Linked Project: proj_123_abc
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-white font-medium">$4,500.00</p>
                                <p className="text-sm text-gray-400">x1</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="h-16 w-16 bg-slate-700 rounded mr-4"></div>
                            <div className="flex-1">
                                <h3 className="text-white font-medium">Shipping Protection</h3>
                                <p className="text-sm text-gray-400">Variant: Standard</p>
                            </div>
                            <div className="text-right">
                                <p className="text-white font-medium">$15.00</p>
                                <p className="text-sm text-gray-400">x1</p>
                            </div>
                        </div>
                    </div>
                    <div className="px-6 py-4 bg-slate-900 border-t border-slate-700 flex justify-between items-center text-white font-bold">
                        <span>Total</span>
                        <span>$4,515.00</span>
                    </div>
                </div>

                {/* Customer Info */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Customer & Shipping</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500">Email</p>
                            <p className="text-white">alex@studio.com</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Phone</p>
                            <p className="text-white">+1 (555) 012-3456</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-gray-500">Shipping Address</p>
                            <p className="text-white">123 Artist Alley Way<br/>Los Angeles, CA 90012<br/>United States</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Linked Production Project (Firebase) */}
            <div className="lg:col-span-1">
                <div className="bg-slate-900 border border-indigo-500/50 rounded-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-bl">
                        LIVE SYNC
                    </div>
                    <div className="p-6 border-b border-slate-800">
                        <h2 className="text-lg font-bold text-white">Production Status</h2>
                        <p className="text-xs text-gray-400">Source: Firestore /projects/proj_123_abc</p>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Status Stepper */}
                        <div>
                            <div className="flex items-center mb-2">
                                <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                                <span className="text-white font-medium">Pre-Press</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '40%' }}></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Files approved. Imposition in progress.</p>
                        </div>

                        {/* File Assets */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">Assets</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                                    <span className="text-xs text-white truncate">interior_final_v2.pdf</span>
                                    <button className="text-xs text-indigo-400 hover:text-indigo-300">View</button>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                                    <span className="text-xs text-white truncate">cover_spread_print.pdf</span>
                                    <button className="text-xs text-indigo-400 hover:text-indigo-300">View</button>
                                </div>
                            </div>
                        </div>

                        {/* Specs */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">Specs</h3>
                            <ul className="text-xs text-gray-400 space-y-1">
                                <li><span className="text-gray-500">Qty:</span> 500</li>
                                <li><span className="text-gray-500">Pages:</span> 120</li>
                                <li><span className="text-gray-500">Paper:</span> 80lb Gloss</li>
                                <li><span className="text-gray-500">Binding:</span> Case Bound</li>
                            </ul>
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <Link href="/admin/projects" className="block w-full text-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded border border-slate-600 transition-colors">
                                Open in Project Manager
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Audit Log Mock */}
                <div className="mt-6 bg-slate-800 rounded-xl p-4 border border-slate-700">
                    <h3 className="text-sm font-bold text-white mb-3">Activity Log</h3>
                    <ul className="space-y-3">
                        <li className="flex text-xs">
                            <span className="text-gray-500 w-12 flex-shrink-0">10:42a</span>
                            <span className="text-gray-300">Order placed in Medusa</span>
                        </li>
                        <li className="flex text-xs">
                            <span className="text-gray-500 w-12 flex-shrink-0">10:43a</span>
                            <span className="text-gray-300">Firebase Project created via Webhook</span>
                        </li>
                        <li className="flex text-xs">
                            <span className="text-gray-500 w-12 flex-shrink-0">11:00a</span>
                            <span className="text-gray-300">User uploaded files</span>
                        </li>
                    </ul>
                </div>
            </div>

        </div>
    </div>
  );
}
