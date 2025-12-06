'use client';

import React, { useEffect, useState } from 'react';
import { medusaAdmin } from '../lib/medusa-admin';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

export default function AdminDashboard() {
  // Stats state
  const [revenue, setRevenue] = useState<string>('...');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isMedusaLive, setIsMedusaLive] = useState(false);
  const [medusaAuthRequired, setMedusaAuthRequired] = useState(false);

  // Firebase Realtime State
  const [activeProjectsCount, setActiveProjectsCount] = useState<number | string>('...');
  const [awaitingFilesCount, setAwaitingFilesCount] = useState<number | string>('...');
  const [productionQueue, setProductionQueue] = useState<any[]>([]);
  const [firebaseStatus, setFirebaseStatus] = useState<'initializing' | 'connected' | 'disconnected'>('initializing');

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
                setMedusaAuthRequired(false);
            }
        } catch (e: any) {
            console.error("Medusa Fetch Error:", e);
            if (e.response && e.response.status === 401) {
                setMedusaAuthRequired(true);
            } else {
                // Handle other errors (network, etc.)
                console.warn("Medusa unreachable or other error.");
            }
        }
    };
    fetchMedusaStats();
  }, []);

  // Fetch Firebase Data
  useEffect(() => {
    let unsubscribeActive: (() => void) | undefined;
    let unsubscribeAwaiting: (() => void) | undefined;
    let unsubscribeQueue: (() => void) | undefined;

    setFirebaseStatus('initializing');

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            setFirebaseStatus('connected');

            // 1. Active Projects Count (Not 'Completed' or 'Archived')
            const projectsRef = collection(db, 'projects');

            // Query for Awaiting Files
            const qAwaiting = query(projectsRef, where('status', '==', 'Awaiting Client Upload'));
            unsubscribeAwaiting = onSnapshot(qAwaiting, (snap) => {
                setAwaitingFilesCount(snap.size);
            });

            // Query for Active Projects
            const qAllActive = query(projectsRef);
            unsubscribeActive = onSnapshot(qAllActive, (snap) => {
                const projects = snap.docs.map(d => d.data());

                // Active = Not Complete, Not Archived, Not Awaiting Upload
                const active = projects.filter(p =>
                    !['Complete', 'Archived', 'Awaiting Client Upload'].includes(p.status)
                );
                setActiveProjectsCount(active.length);

                // Build Production Queue (Top 3 recent active)
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
            setFirebaseStatus('disconnected');
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
                <span className="bg-green-900/50 text-green-400 text-xs px-2 py-1 rounded border border-green-700">Medusa: Connected</span>
            ) : medusaAuthRequired ? (
                 <span className="bg-red-900/50 text-red-400 text-xs px-2 py-1 rounded border border-red-700">Medusa: Auth Required</span>
            ) : (
                <span className="bg-gray-800 text-gray-500 text-xs px-2 py-1 rounded border border-gray-700">Medusa: Connecting...</span>
            )}

            {firebaseStatus === 'connected' ? (
                <span className="bg-indigo-900/50 text-indigo-400 text-xs px-2 py-1 rounded border border-indigo-700">Firebase: Connected</span>
            ) : firebaseStatus === 'initializing' ? (
                <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-1 rounded border border-yellow-700 animate-pulse">Firebase: Connecting...</span>
            ) : (
                <span className="bg-red-900/50 text-red-400 text-xs px-2 py-1 rounded border border-red-700">Firebase: Disconnected</span>
            )}
        </div>

        {/* Auth Error Banner */}
        {medusaAuthRequired && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                     <div className="bg-red-900/50 p-2 rounded-full text-red-400 mt-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                     </div>
                     <div>
                         <h3 className="text-white font-bold text-lg">Medusa Authentication Required</h3>
                         <p className="text-gray-400 text-sm mt-1">
                             This dashboard connects directly to your Medusa backend. Your browser session has expired or is invalid.
                             <br/>Please log in to the Medusa Admin panel in a new tab to restore connectivity.
                         </p>
                     </div>
                </div>
                <a
                    href={`${MEDUSA_BACKEND_URL}/app`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors whitespace-nowrap shadow-lg"
                >
                    Log In to Medusa
                </a>
            </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm opacity-90">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Revenue</p>
                        <h3 className="text-2xl font-bold text-white mt-1">
                            {medusaAuthRequired ? <span className="text-gray-600">Locked</span> : revenue}
                        </h3>
                    </div>
                    {isMedusaLive && <span className="bg-green-900/30 text-green-400 text-xs font-bold px-2 py-1 rounded">+12%</span>}
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Medusa</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm opacity-90">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Orders</p>
                        <h3 className="text-2xl font-bold text-white mt-1">
                             {medusaAuthRequired ? <span className="text-gray-600">Locked</span> : pendingCount}
                        </h3>
                    </div>
                    {isMedusaLive && <span className="bg-yellow-900/30 text-yellow-400 text-xs font-bold px-2 py-1 rounded">Action Req</span>}
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Medusa</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Projects</p>
                        <h3 className="text-2xl font-bold text-white mt-1">
                            {firebaseStatus === 'initializing' ? <span className="animate-pulse">...</span> : activeProjectsCount}
                        </h3>
                    </div>
                    <span className="bg-indigo-900/30 text-indigo-400 text-xs font-bold px-2 py-1 rounded">Production</span>
                </div>
                <p className="text-xs text-gray-500 mt-4">Source: Firebase</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Awaiting Files</p>
                        <h3 className="text-2xl font-bold text-white mt-1">
                            {firebaseStatus === 'initializing' ? <span className="animate-pulse">...</span> : awaitingFilesCount}
                        </h3>
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

                {medusaAuthRequired ? (
                    <div className="p-12 text-center text-gray-500">
                        <p className="mb-2">Authentication Required</p>
                        <p className="text-xs">Log in to view recent orders.</p>
                    </div>
                ) : (
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
                            {recentOrders.length === 0 && isMedusaLive ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No recent orders found.</td>
                                </tr>
                            ) : (
                                recentOrders.map((order) => (
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
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Active Production (Firebase) */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Production Queue</h2>
                    <span className="text-xs font-mono text-gray-500">firestore/projects</span>
                </div>
                <div className="p-6 space-y-4">
                    {firebaseStatus === 'initializing' && (
                        <div className="text-center text-gray-500 py-4 animate-pulse">Loading queue...</div>
                    )}

                    {firebaseStatus !== 'initializing' && productionQueue.length === 0 ? (
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
