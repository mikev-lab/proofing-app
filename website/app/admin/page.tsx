'use client';

import React, { useEffect, useState } from 'react';
import { functions, httpsCallable } from '../firebase/config';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminDashboard() {
  // Stats state
  const [revenue, setRevenue] = useState<string>('...');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isMedusaLive, setIsMedusaLive] = useState(false);
  const [medusaError, setMedusaError] = useState<string | null>(null);

  // Firebase Realtime State
  const [activeProjectsCount, setActiveProjectsCount] = useState<number | string>('...');
  const [awaitingFilesCount, setAwaitingFilesCount] = useState<number | string>('...');
  const [productionQueue, setProductionQueue] = useState<any[]>([]);
  const [firebaseStatus, setFirebaseStatus] = useState<'initializing' | 'connected' | 'disconnected'>('initializing');

  // Fetch Medusa Data (Cloud Function)
  useEffect(() => {
    const loadStats = async (user: any) => {
        if (!user) return;
        try {
            const getStats = httpsCallable(functions, 'medusa_getAdminStats');
            const result = await getStats();
            const stats = result.data as any;

            if (stats.isConnected) {
                setRevenue(stats.revenue);
                setPendingCount(stats.pendingCount);
                setRecentOrders(stats.recentOrders);
                setIsMedusaLive(true);
                setMedusaError(null);
            }
        } catch (e: any) {
            console.error("Medusa Cloud Function Error:", e);
            setMedusaError(e.message || "Unknown Error");
            setIsMedusaLive(false);
        }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) loadStats(user);
    });
    return () => unsubscribeAuth();
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
            ) : (
                <span className="bg-red-900/50 text-red-400 text-xs px-2 py-1 rounded border border-red-700">Medusa: Error</span>
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
        {medusaError && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6 mb-8 flex flex-col items-start gap-4">
                 <div className="flex items-start gap-4">
                     <div className="bg-red-900/50 p-2 rounded-full text-red-400 mt-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                     </div>
                     <div>
                         <h3 className="text-white font-bold text-lg">Medusa Connection Failed</h3>
                         <p className="text-gray-400 text-sm mt-1">
                             {medusaError}
                         </p>
                         {medusaError.includes("API_TOKEN") && (
                             <p className="text-yellow-500 text-xs mt-2 font-mono bg-black/20 p-2 rounded">
                                 Action Required: Add `MEDUSA_API_TOKEN` to your Firebase Functions environment variables.
                             </p>
                         )}
                     </div>
                </div>
            </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm opacity-90">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Revenue</p>
                        <h3 className="text-2xl font-bold text-white mt-1">
                            {revenue}
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
                             {pendingCount}
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
                        {recentOrders.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                    {isMedusaLive ? "No recent orders found." : "Waiting for connection..."}
                                </td>
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
