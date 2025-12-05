'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { medusaAdmin } from '../lib/medusa-admin';
import PlaceOrderModal from '../components/PlaceOrderModal';

// --- SSR SAFE IMPORTS ---
// We must isolate the ProjectThumbnail component which uses react-pdf
const ProjectThumbnail = dynamic(() => import('../components/ProjectThumbnail'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-slate-800 animate-pulse"></div>
});

export default function ClientDashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  useEffect(() => {
    let unsubscribeProjects: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
            const userDocSnap = await getDoc(doc(db, "users", currentUser.uid));
            const companyId = userDocSnap.exists() ? userDocSnap.data().companyId : null;
            const projectsRef = collection(db, 'projects');
            let q;
            if (companyId) {
                q = query(projectsRef, where('companyId', '==', companyId));
            } else {
                q = query(projectsRef, where('clientId', '==', currentUser.uid));
            }
            unsubscribeProjects = onSnapshot(q, (snapshot) => {
                const projs = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let preview = null;
                    if (data.cover && data.cover.previewURL) {
                        preview = data.cover.previewURL;
                    } else if (data.versions && data.versions.length > 0) {
                        const latest = data.versions.sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
                        preview = latest.previewURL || latest.fileURL;
                    }
                    return { id: doc.id, ...data, resolvedPreview: preview };
                }).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                setProjects(projs);
            });
        } catch (e) { console.error("Error fetching projects:", e); }

        try {
            const { orders: medusaOrders } = await medusaAdmin.admin.order.list({ q: currentUser.email, limit: 5 });
            const myOrders = medusaOrders.filter((o: any) => o.email === currentUser.email).slice(0, 3);
            setOrders(myOrders);
        } catch (e) { console.warn("Failed to fetch Medusa orders:", e); }
        setLoading(false);
      } else { window.location.href = '/login'; }
    });
    return () => { unsubscribeAuth(); if (unsubscribeProjects) unsubscribeProjects(); };
  }, []);

  const openPlaceOrder = (project: any) => { setSelectedProject(project); setIsOrderModalOpen(true); };

  const getStatusBadge = (status: string) => {
      const s = (status || 'unknown').toLowerCase();
      let colorClass = "bg-gray-800 text-gray-400 border-gray-700";
      let label = status;
      if (['approved', 'imposition complete', 'in production'].includes(s)) {
          colorClass = "bg-green-900/30 text-green-400 border-green-500/30";
          label = "Approved";
      } else if (s === 'pending') {
          colorClass = "bg-yellow-900/30 text-yellow-400 border-yellow-500/30";
          label = "Pending Review";
      } else if (s.includes('awaiting')) {
          colorClass = "bg-blue-900/30 text-blue-400 border-blue-500/30";
          label = "Awaiting Upload";
      } else if (s === 'changes_requested') {
          colorClass = "bg-red-900/30 text-red-400 border-red-500/30";
          label = "Changes Requested";
      }
      return <span className={`px-2 py-1 rounded text-xs font-medium border ${colorClass}`}>{label}</span>;
  };

  if (loading) return <div className="min-h-screen bg-slate-900 pt-24 px-8"><div className="max-w-7xl mx-auto space-y-8 animate-pulse"><div className="h-8 w-48 bg-slate-800 rounded"></div><div className="h-64 bg-slate-800 rounded-xl"></div></div></div>;

  return (
    <div className="min-h-screen bg-slate-900 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Client Dashboard</h1>
                    <p className="text-gray-400 mt-1">Welcome back, {user?.email}</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/quote" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-lg transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Start New Project
                    </Link>
                    <a href="/legacy-portal/guest_upload.html" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-medium rounded-md border border-slate-700 transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Upload Files
                    </a>
                </div>
            </div>
            <div className="space-y-12">
                <section>
                    <h2 className="text-xl font-bold text-white flex items-center mb-6"><span className="bg-indigo-500 w-1 h-6 rounded-full mr-3"></span>Active Projects</h2>
                    {projects.length === 0 ? (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center"><div className="text-gray-500 mb-4">No active projects found.</div><Link href="/quote" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Get a Quote to start &rarr;</Link></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map(proj => (
                                <div key={proj.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all shadow-md group flex flex-col h-full">
                                    <div className="h-48 bg-slate-900 border-b border-slate-700 relative">
                                        <ProjectThumbnail url={proj.resolvedPreview} />
                                        <div className="absolute top-2 right-2">{getStatusBadge(proj.status)}</div>
                                    </div>
                                    <div className="p-5 flex-1">
                                        <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors truncate mb-1" title={proj.projectName}>{proj.projectName || 'Untitled'}</h3>
                                        <div className="flex items-center text-sm text-gray-400 mb-4"><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>{proj.createdAt?.seconds ? new Date(proj.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</div>
                                        {proj.specs && (<div className="text-xs text-gray-500 space-y-1"><p>Size: {proj.specs.dimensions ? `${proj.specs.dimensions.width}x${proj.specs.dimensions.height}` : 'N/A'}</p><p>Qty: {proj.specs.quantity || 0}</p></div>)}
                                    </div>
                                    <div className="bg-slate-900/50 p-4 border-t border-slate-700 grid grid-cols-2 gap-3">
                                        <button onClick={() => openPlaceOrder(proj)} className="flex items-center justify-center px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded transition-colors">Place Order</button>
                                        <Link href={`/proof?id=${proj.id}`} className="flex items-center justify-center px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors">View Proof</Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
                <section>
                    <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white flex items-center"><span className="bg-green-500 w-1 h-6 rounded-full mr-3"></span>Recent Orders</h2><Link href="/dashboard/orders" className="text-sm text-indigo-400 hover:text-indigo-300">View All Orders &rarr;</Link></div>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        {orders.length === 0 ? <div className="p-8 text-center text-gray-500 text-sm">No recent orders found.</div> : (
                            <div className="divide-y divide-slate-700">
                                {orders.map(order => (
                                    <div key={order.id} className="p-4 hover:bg-slate-700/30 transition-colors flex justify-between items-center"><div><div className="text-sm font-medium text-white mb-1">Order #{order.display_id}</div><div className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</div></div><div className="flex items-center gap-6"><span className={`text-xs px-2 py-1 rounded-full ${order.payment_status === 'captured' ? 'bg-green-900/30 text-green-400' : order.payment_status === 'awaiting' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-700 text-gray-300'}`}>{order.payment_status}</span><span className="text-sm font-bold text-white w-20 text-right">${(order.total / 100).toFixed(2)}</span></div></div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
        {selectedProject && <PlaceOrderModal isOpen={isOrderModalOpen} onClose={() => setIsOrderModalOpen(false)} project={selectedProject} />}
    </div>
  );
}
