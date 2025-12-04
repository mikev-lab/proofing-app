'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { medusaAdmin } from '../lib/medusa-admin';

export default function ClientDashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let unsubscribeProjects: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // 1. Fetch Firebase Projects (logic from legacy js/dashboard.js)
        try {
            // Get user's companyId
            const userDocSnap = await getDoc(doc(db, "users", currentUser.uid));
            const companyId = userDocSnap.exists() ? userDocSnap.data().companyId : null;

            // Build Queries
            const projectsRef = collection(db, 'projects');
            let q;

            // If user has a company, fetch all company projects OR personal projects
            // Firestore doesn't support complex OR across fields easily, so we might need two listeners or one composite check.
            // Simplified: If companyId exists, query by companyId. Else query by clientId (uid).
            if (companyId) {
                q = query(projectsRef, where('companyId', '==', companyId));
            } else {
                q = query(projectsRef, where('clientId', '==', currentUser.uid));
            }

            unsubscribeProjects = onSnapshot(q, (snapshot) => {
                const projs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                setProjects(projs);
            });

        } catch (e) {
            console.error("Error fetching projects:", e);
        }

        // 2. Fetch Medusa Orders
        try {
            // Medusa Admin API doesn't allow filtering orders by email easily in the list endpoint unless using specific query params supported by the backend version.
            // Standard store API allows "my orders".
            // Admin API allows q (search).
            // We'll try searching by email.
            const { orders: medusaOrders } = await medusaAdmin.admin.order.list({
                q: currentUser.email,
                limit: 5
            });

            // Filter strictly in case 'q' is fuzzy
            const myOrders = medusaOrders.filter((o: any) => o.email === currentUser.email);
            setOrders(myOrders);
        } catch (e) {
            console.warn("Failed to fetch Medusa orders:", e);
        }

        setLoading(false);

      } else {
        window.location.href = '/login';
      }
    });

    return () => {
        unsubscribeAuth();
        if (unsubscribeProjects) unsubscribeProjects();
    };
  }, []);

  const getStatusBadge = (status: string) => {
      const s = (status || 'unknown').toLowerCase();
      let colorClass = "bg-gray-800 text-gray-400 border-gray-700";
      let label = status;

      if (['approved', 'imposition complete', 'in production'].includes(s)) {
          colorClass = "bg-green-900/30 text-green-400 border-green-500/30";
          label = "Approved"; // Mask internal status
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

      return (
          <span className={`px-2 py-1 rounded text-xs font-medium border ${colorClass}`}>
              {label}
          </span>
      );
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-900 pt-24 px-8">
              <div className="max-w-7xl mx-auto space-y-8">
                  <div className="h-8 w-48 bg-slate-800 rounded animate-pulse"></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="h-64 bg-slate-800 rounded-xl animate-pulse"></div>
                      <div className="h-64 bg-slate-800 rounded-xl animate-pulse"></div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-900 pt-8 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Client Dashboard</h1>
                    <p className="text-gray-400 mt-1">Welcome back, {user?.email}</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/quote" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-lg transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Start New Project
                    </Link>
                    <a href="/legacy-portal/guest_upload.html" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-medium rounded-md border border-slate-700 transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload Files
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Active Projects (Firebase) */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <span className="bg-indigo-500 w-1 h-6 rounded-full mr-3"></span>
                        Active Projects
                    </h2>

                    {projects.length === 0 ? (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
                            <div className="text-gray-500 mb-4">No active projects found.</div>
                            <Link href="/quote" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Get a Quote to start &rarr;</Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {projects.map(proj => (
                                <Link key={proj.id} href={`/legacy-portal/proof.html?id=${proj.id}`} className="block group">
                                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition-all shadow-md group-hover:shadow-indigo-900/10">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">{proj.projectName}</h3>
                                                <p className="text-xs text-gray-500">ID: {proj.id}</p>
                                            </div>
                                            {getStatusBadge(proj.status)}
                                        </div>
                                        <div className="flex items-center text-sm text-gray-400 mt-4">
                                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            Created {proj.createdAt?.seconds ? new Date(proj.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Orders (Medusa) */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <span className="bg-green-500 w-1 h-6 rounded-full mr-3"></span>
                        Recent Orders
                    </h2>

                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        {orders.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-sm">
                                No recent orders found.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-700">
                                {orders.map(order => (
                                    <div key={order.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-white">#{order.display_id}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                order.payment_status === 'captured' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                                            }`}>{order.payment_status}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span>{new Date(order.created_at).toLocaleDateString()}</span>
                                            <span>${(order.total / 100).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="p-3 bg-slate-900/50 border-t border-slate-700 text-center">
                            <a href="#" className="text-xs text-indigo-400 hover:text-white">View All Orders</a>
                        </div>
                    </div>

                    {/* Quick Links / Resources */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-white mb-3">Helpful Resources</h3>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/resources/file-setup-guide" className="text-gray-400 hover:text-indigo-400 transition-colors">File Setup Guide</Link></li>
                            <li><Link href="/products" className="text-gray-400 hover:text-indigo-400 transition-colors">Product Catalog</Link></li>
                            <li><Link href="/faq" className="text-gray-400 hover:text-indigo-400 transition-colors">FAQ</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
