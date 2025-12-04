'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db, httpsCallable, functions, auth } from '../../firebase/config';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Fetch Projects with Auth Guard
  useEffect(() => {
    let unsubscribeProjects: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setAuthLoading(false);
      if (user) {
        // User is logged in, now we can subscribe to projects
        // Basic query: All projects, ordered by creation (desc)
        // Note: Requires index in Firestore if using orderBy('createdAt', 'desc') with other filters
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));

        unsubscribeProjects = onSnapshot(q, (snapshot) => {
          const projs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setProjects(projs);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching projects:", error);
          setLoading(false);
          // If permission denied, it might mean the token claims haven't refreshed or rules deny it.
          // But waiting for onAuthStateChanged usually fixes the "missing permissions" due to uninitialized auth.
        });
      } else {
        // User is not logged in
        setProjects([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProjects) unsubscribeProjects();
    };
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setGeneratedLink(null);

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        // 1. Create Project Doc
        const projectRef = await addDoc(collection(db, 'projects'), {
            projectName: newProjectName,
            status: 'Awaiting Client Upload',
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            isAwaitingClientUpload: true,
            systemVersion: 2
        });

        // 2. Generate Link (Call Cloud Function)
        const generateLinkFn = httpsCallable(functions, 'generateGuestLink');
        const result = await generateLinkFn({
            projectId: projectRef.id,
            permissions: { canUpload: true, canApprove: false }
        });

        const data = result.data as any;
        setGeneratedLink(data.url);
        setNewProjectName('');

    } catch (err) {
        console.error("Failed to create project:", err);
        alert("Failed to create project. See console.");
    } finally {
        setCreating(false);
    }
  };

  const closeModal = () => {
      setIsModalOpen(false);
      setGeneratedLink(null);
  };

  if (authLoading) {
      return <div className="text-center py-12 text-gray-400">Verifying access...</div>;
  }

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Production Projects</h1>
            <div className="flex gap-4">
                <input type="text" placeholder="Search projects..." className="bg-slate-800 border border-slate-600 rounded px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500 transition-colors"
                >
                    New Project
                </button>
            </div>
        </div>

        {loading ? (
            <div className="text-center py-12 text-gray-400">Loading projects...</div>
        ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Project Name</th>
                            <th className="px-6 py-4">Company</th>
                            <th className="px-6 py-4">Created</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {projects.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No projects found.</td>
                            </tr>
                        )}
                        {projects.map((proj) => (
                            <tr key={proj.id} className="hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                        proj.status === 'Approved' ? 'bg-green-900/30 text-green-400 border-green-500/20' :
                                        proj.status === 'Awaiting Client Upload' ? 'bg-blue-900/30 text-blue-400 border-blue-500/20' :
                                        'bg-gray-800 text-gray-300 border-gray-600'
                                    }`}>
                                        {proj.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-white">{proj.projectName}</div>
                                    <div className="text-xs text-gray-500">ID: {proj.id}</div>
                                </td>
                                <td className="px-6 py-4">{proj.companyName || '—'}</td>
                                <td className="px-6 py-4 text-white">
                                    {proj.createdAt?.seconds ? new Date(proj.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-gray-400 hover:text-white">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {/* Create Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-4">Request Files</h2>

                    {!generatedLink ? (
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Project Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    placeholder="e.g. Summer Catalog"
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    {creating ? 'Creating...' : 'Create & Get Link'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-4">
                            <div className="bg-green-900/30 text-green-400 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 border border-green-500/30">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Project Created!</h3>
                            <p className="text-sm text-gray-400 mb-4">Share this link with your client:</p>
                            <div className="bg-slate-900 p-3 rounded border border-slate-600 text-sm text-white break-all select-all">
                                {generatedLink}
                            </div>
                            <button onClick={closeModal} className="mt-6 w-full py-2 bg-slate-700 text-white rounded hover:bg-slate-600">Done</button>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}
