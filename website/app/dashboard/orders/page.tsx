'use client';

import React, { useEffect, useState } from 'react';
import { functions, httpsCallable } from '../../firebase/config';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import Link from 'next/link';

export default function ClientOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && currentUser.email) {
        try {
            const getOrders = httpsCallable(functions, 'medusa_getCustomerOrders');
            const result = await getOrders();
            const data = result.data as any;
            setOrders(data.orders || []);
        } catch (e) {
            console.warn("Failed to fetch Medusa orders:", e);
        } finally {
            setLoading(false);
        }
      } else if (!currentUser) {
        // Redirect if not logged in
        window.location.href = '/login';
      } else {
        // Logged in but no email?
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading orders...</div>;

  return (
    <div className="min-h-screen bg-slate-900 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center mb-8">
                <Link href="/dashboard" className="text-gray-400 hover:text-white mr-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <h1 className="text-3xl font-bold text-white">Order History</h1>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Order ID</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Items</th>
                            <th className="px-6 py-4 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {orders.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No orders found.</td></tr>
                        )}
                        {orders.map((order) => (
                            <tr key={order.id} className="hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-white">#{order.display_id}</td>
                                <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString()}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        order.payment_status === 'captured' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                                    }`}>
                                        {order.payment_status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{order.items?.length || 0} items</td>
                                <td className="px-6 py-4 text-right text-white font-medium">${(order.total / 100).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
}
