'use client';

import React, { useEffect, useState } from 'react';
import { medusaAdmin } from '../lib/medusa-admin';

export default function AdminDashboard() {
  // Stats state
  const [revenue, setRevenue] = useState<string>('$124,592'); // Mock default
  const [pendingCount, setPendingCount] = useState<number>(14); // Mock default
  const [recentOrders, setRecentOrders] = useState<any[]>([
      { id: '#1024', customer: 'Alex Chen', status: 'paid', total: '$450.00' },
      { id: '#1023', customer: 'Studio Trigger', status: 'pending', total: '$1,200.00' },
      { id: '#1022', customer: 'John Doe', status: 'paid', total: '$85.00' },
  ]); // Mock default
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
        try {
            // Attempt to fetch from Medusa
            // Note: This requires an authenticated session. If CORS/Auth fails, we stay on mock.
            const { count, orders } = await medusaAdmin.admin.orders.list({ limit: 5, offset: 0 });

            if (orders) {
                setPendingCount(count);
                // Calculate simple revenue from visible orders (real logic needs proper analytics endpoint)
                const total = orders.reduce((acc, order) => acc + order.total, 0);
                setRevenue(`$${(total / 100).toFixed(2)}`);

                setRecentOrders(orders.map(o => ({
                    id: o.display_id,
                    customer: `${o.customer.first_name} ${o.customer.last_name}`,
                    status: o.payment_status,
                    total: `$${(o.total / 100).toFixed(2)}`
                })));
                setIsLive(true);
            }
        } catch (e) {
            console.log("Admin: Medusa not connected or unauthenticated. Using mock data.");
        }
    };
    fetchStats();
  }, []);

  return (
    <div>
        <div className="flex items-center gap-4 mb-8">
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            {isLive ? (
                <span className="bg-green-900/50 text-green-400 text-xs px-2 py-1 rounded border border-green-700">Live Medusa Data</span>
            ) : (
                <span className="bg-gray-800 text-gray-500 text-xs px-2 py-1 rounded border border-gray-700">Mock Data (Backend Unreachable)</span>
            )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Revenue</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{revenue}</h3>
                    </div>
                    <span className="bg-green-900/30 text-green-400 text-xs font-bold px-2 py-1 rounded">+12%</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Medusa</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Orders</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{pendingCount}</h3>
                    </div>
                    <span className="bg-yellow-900/30 text-yellow-400 text-xs font-bold px-2 py-1 rounded">Action Req</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Medusa</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Projects</p>
                        <h3 className="text-2xl font-bold text-white mt-1">8</h3>
                    </div>
                    <span className="bg-indigo-900/30 text-indigo-400 text-xs font-bold px-2 py-1 rounded">Production</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Firebase</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Awaiting Files</p>
                        <h3 className="text-2xl font-bold text-white mt-1">3</h3>
                    </div>
                    <span className="bg-red-900/30 text-red-400 text-xs font-bold px-2 py-1 rounded">Urgent</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Firebase</p>
            </div>
        </div>

        {/* Integration Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Orders (Medusa) */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Recent Orders</h2>
                    <span className="text-xs font-mono text-gray-500">api/admin/orders</span>
                </div>
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-3">Order ID</th>
                            <th className="px-6 py-3">Customer</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {recentOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-white">{order.id}</td>
                                <td className="px-6 py-4">{order.customer}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        order.status === 'paid' ? 'bg-green-900 text-green-200' : 'bg-yellow-900 text-yellow-200'
                                    }`}>
                                        {order.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{order.total}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Active Production (Firebase) */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Production Queue</h2>
                    <span className="text-xs font-mono text-gray-500">firestore/projects</span>
                </div>
                <div className="p-6 space-y-4">
                    {[
                        { name: 'Anime Expo Art Book', stage: 'Printing', progress: 60, color: 'bg-indigo-600' },
                        { name: 'Fall Catalog 2025', stage: 'Pre-Press', progress: 20, color: 'bg-yellow-600' },
                        { name: 'Manga Vol 1 (Reprint)', stage: 'Finishing', progress: 90, color: 'bg-green-600' },
                    ].map((proj, i) => (
                        <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-white font-medium">{proj.name}</span>
                                <span className="text-gray-400">{proj.stage}</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-2">
                                <div className={`${proj.color} h-2 rounded-full`} style={{ width: `${proj.progress}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
}
