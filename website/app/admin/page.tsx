'use client';

import React, { useEffect, useState } from 'react';
import { medusaAdmin } from '../lib/medusa-admin';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminDashboard() {
  // Stats state
  const [revenue, setRevenue] = useState<string>('$124,592'); // Mock default for Medusa
  const [pendingCount, setPendingCount] = useState<number>(14); // Mock default for Medusa
  const [recentOrders, setRecentOrders] = useState<any[]>([
      { id: '#1024', customer: 'Alex Chen', status: 'paid', total: '$450.00' },
      { id: '#1023', customer: 'Studio Trigger', status: 'pending', total: '$1,200.00' },
      { id: '#1022', customer: 'John Doe', status: 'paid', total: '$85.00' },
  ]); // Mock default for Medusa
  const [isMedusaLive, setIsMedusaLive] = useState(false);

  // Firebase Realtime State
  const [activeProjectsCount, setActiveProjectsCount] = useState<number | string>('...');
  const [awaitingFilesCount, setAwaitingFilesCount] = useState<number | string>('...');
  const [productionQueue, setProductionQueue] = useState<any[]>([]);
  const [isFirebaseLive, setIsFirebaseLive] = useState(false);

  // Fetch Medusa Data
  useEffect(() => {
    const fetchMedusaStats = async () => {
        try {
            // Attempt to fetch from Medusa
            const { count, orders } = await medusaAdmin.admin.order.list({ limit: 5, offset: 0 });

            if (orders) {
                setPendingCount(count);
                // Calculate simple revenue from visible orders (real logic needs proper analytics endpoint)
                const total = orders.reduce((acc: number, order: any) => acc + order.total, 0);
                setRevenue(`$${(total / 100).toFixed(2)}`);

                setRecentOrders(orders.map((o: any) => ({
                    id: o.display_id,
                    customer: `${o.customer.first_name} ${o.customer.last_name}`,
                    status: o.payment_status,
                    total: `$${(o.total / 100).toFixed(2)}`
                })));
                setIsMedusaLive(true);
            }
        } catch (e) {
            console.log("Admin: Medusa not connected or unauthenticated. Using mock data.");
        }
    };
    fetchMedusaStats();
  }, []);

  // Fetch Firebase Data
  useEffect(() => {
    let unsubscribeActive: (() => void) | undefined;
    let unsubscribeAwaiting: (() => void) | undefined;
    let unsubscribeQueue: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            setIsFirebaseLive(true);

            // 1. Active Projects Count (Not 'Completed' or 'Archived')
            // Firestore doesn't support inequality on multiple fields well, so we might need a composite index or just filter client side for now if dataset is small
            // or just count specific active statuses. Let's simplify and count "In Production" + "Printing" etc.
            // For now, let's just query everything not 'Complete' and 'Archived' if possible, or just specific statuses.
            const projectsRef = collection(db, 'projects');

            // Query for Awaiting Files
            const qAwaiting = query(projectsRef, where('status', '==', 'Awaiting Client Upload'));
            unsubscribeAwaiting = onSnapshot(qAwaiting, (snap) => {
                setAwaitingFilesCount(snap.size);
            });

            // Query for Active Projects (Total - Completed) - Simplification: Just count total non-archived for this metric or specific statuses
            // For this dash, let's say Active = "Printing", "In Production", "Pre-Press", "Approved"
            // We'll set up a listener for all non-archived to calculate both metrics locally to save reads/complexity?
            // Better: Just one snapshot for the list and filter locally for the dashboard counters
            const qAllActive = query(projectsRef); // In a real app, use where('status', '!=', 'Archived')
            unsubscribeActive = onSnapshot(qAllActive, (snap) => {
                const projects = snap.docs.map(d => d.data());

                // Active = Not Complete, Not Archived, Not Awaiting Upload
                const active = projects.filter(p =>
                    !['Complete', 'Archived', 'Awaiting Client Upload'].includes(p.status)
                );
                setActiveProjectsCount(active.length);

                // Build Production Queue (Top 3 recent active)
                // Map status to progress for visualization
                const getProgress = (s: string) => {
                    const map: Record<string, number> = { 'Pre-Press': 20, 'Queued': 40, 'Printing': 60, 'Finishing': 80, 'Complete': 100 };
                    return map[s] || 10;
                };
                const getColor = (s: string) => {
                    const map: Record<string, string> = { 'Pre-Press': 'bg-yellow-600', 'Printing': 'bg-indigo-600', 'Finishing': 'bg-green-600' };
                    return map[s] || 'bg-gray-600';
                };

                const queue = active
                    .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                    .slice(0, 3)
                    .map((p: any) => ({
                        name: p.projectName,
                        stage: p.status,
                        progress: getProgress(p.status),
                        color: getColor(p.status)
                    }));

                setProductionQueue(queue);
            });

        } else {
            setIsFirebaseLive(false);
            setActiveProjectsCount('Auth Req');
            setAwaitingFilesCount('Auth Req');
        }
    });

    return () => {
        unsubscribeAuth();
        if (unsubscribeActive) unsubscribeActive();
        if (unsubscribeAwaiting) unsubscribeAwaiting();
        if (unsubscribeQueue) unsubscribeQueue();
    };
  }, []);

  return (
    <div>
        <div className="flex items-center gap-4 mb-8">
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            {isMedusaLive ? (
                <span className="bg-green-900/50 text-green-400 text-xs px-2 py-1 rounded border border-green-700">Medusa: Live</span>
            ) : (
                <span className="bg-gray-800 text-gray-500 text-xs px-2 py-1 rounded border border-gray-700">Medusa: Mock</span>
            )}

            {isFirebaseLive ? (
                <span className="bg-indigo-900/50 text-indigo-400 text-xs px-2 py-1 rounded border border-indigo-700">Firebase: Connected</span>
            ) : (
                <span className="bg-red-900/50 text-red-400 text-xs px-2 py-1 rounded border border-red-700">Firebase: Disconnected</span>
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
                        <h3 className="text-2xl font-bold text-white mt-1">{activeProjectsCount}</h3>
                    </div>
                    <span className="bg-indigo-900/30 text-indigo-400 text-xs font-bold px-2 py-1 rounded">Production</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Firebase</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Awaiting Files</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{awaitingFilesCount}</h3>
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
                    {productionQueue.length === 0 ? (
                        <div className="text-center text-gray-500 py-4">No active production jobs.</div>
                    ) : (
                        productionQueue.map((proj, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-white font-medium">{proj.name}</span>
                                    <span className="text-gray-400">{proj.stage}</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2">
                                    <div className={`${proj.color} h-2 rounded-full`} style={{ width: `${proj.progress}%` }}></div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}
