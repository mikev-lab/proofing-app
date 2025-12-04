'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { medusaAdmin } from '../../../lib/medusa-admin';

export default function OrderDetailClient({ id }: { id: string }) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      const fetchOrder = async () => {
          try {
              const { order } = await medusaAdmin.admin.order.retrieve(id);
              setOrder(order);
              setLoading(false);
          } catch (e) {
              console.log("Admin: Using mock order details.");
              // Fallback mock
              setOrder({
                  id: id,
                  display_id: id,
                  items: [
                      { title: 'Custom Hardcover Book', quantity: 1, unit_price: 450000, metadata: { firebaseProjectId: 'proj_123_abc' }, variant: { title: '500 Copies' } },
                      { title: 'Shipping Protection', quantity: 1, unit_price: 1500, variant: { title: 'Standard' } }
                  ],
                  total: 451500,
                  tax_total: 45000,
                  shipping_total: 2500,
                  email: 'alex@studio.com',
                  shipping_address: {
                      address_1: '123 Artist Alley Way',
                      city: 'Los Angeles',
                      province: 'CA',
                      postal_code: '90012',
                      country_code: 'us'
                  }
              });
              setLoading(false);
          }
      };
      if (id) fetchOrder();
  }, [id]);

  if (loading) return <div className="text-white p-8">Loading Order...</div>;

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Order #{order.display_id}</h1>
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
                        {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-start">
                                <div className="h-16 w-16 bg-slate-700 rounded mr-4"></div>
                                <div className="flex-1">
                                    <h3 className="text-white font-medium">{item.title}</h3>
                                    <p className="text-sm text-gray-400">Variant: {item.variant?.title}</p>
                                    {item.metadata?.firebaseProjectId && (
                                        <div className="mt-2 text-xs text-indigo-400 bg-indigo-900/20 inline-block px-2 py-1 rounded border border-indigo-500/30">
                                            Linked Project: {item.metadata.firebaseProjectId}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-medium">${(item.unit_price / 100).toFixed(2)}</p>
                                    <p className="text-sm text-gray-400">x{item.quantity}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-6 py-4 bg-slate-900 border-t border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-sm text-gray-400">
                            <span>Shipping</span>
                            <span>${(order.shipping_total / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-400">
                            <span>Tax</span>
                            <span>${(order.tax_total / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-white font-bold pt-2 border-t border-slate-800">
                            <span>Total</span>
                            <span>${(order.total / 100).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Customer Info */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Customer & Shipping</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500">Email</p>
                            <p className="text-white">{order.email}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-gray-500">Shipping Address</p>
                            <p className="text-white">
                                {order.shipping_address?.address_1}<br/>
                                {order.shipping_address?.city}, {order.shipping_address?.province} {order.shipping_address?.postal_code}<br/>
                                {order.shipping_address?.country_code?.toUpperCase()}
                            </p>
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
                        <p className="text-xs text-gray-400">Source: Firestore</p>
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
            </div>

        </div>
    </div>
  );
}
