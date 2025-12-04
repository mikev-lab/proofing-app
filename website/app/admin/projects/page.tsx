'use client';

import React, { useState, useEffect } from 'react';
import { db, httpsCallable, functions, auth } from '../../firebase/config';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentShareProject, setCurrentShareProject] = useState<string | null>(null);
  const [sharePermissions, setSharePermissions] = useState({ canApprove: false, canAnnotate: false, canSeeComments: true, isOwner: false });
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // New Project State
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Filter/Sort State
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('createdAt-desc');

  // Fetch Data
  useEffect(() => {
    let unsubscribeProjects: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(false);
      if (user) {
        // Fetch Companies first for mapping
        try {
            const companySnap = await getDocs(collection(db, 'companies'));
            const companyList = companySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCompanies(companyList);
        } catch (e) {
            console.error("Failed to load companies", e);
        }

        // Subscribe to Projects
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
        unsubscribeProjects = onSnapshot(q, (snapshot) => {
          const projs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setProjects(projs);
          setLoading(false);
        });
      } else {
        setProjects([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProjects) unsubscribeProjects();
    };
  }, []);

  // --- Actions ---

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setGeneratedLink(null);

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        const projectRef = await addDoc(collection(db, 'projects'), {
            projectName: newProjectName,
            status: 'Awaiting Client Upload',
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            isAwaitingClientUpload: true,
            systemVersion: 2
        });

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
        alert("Failed to create project.");
    } finally {
        setCreating(false);
    }
  };

  const closeModal = () => {
      setIsModalOpen(false);
      setGeneratedLink(null);
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
      try {
          await updateDoc(doc(db, 'projects', projectId), { status: newStatus });
      } catch (e) {
          console.error("Failed to update status", e);
          alert("Update failed.");
      }
  };

  const handleCompanyChange = async (projectId: string, companyId: string) => {
      try {
          const assignProjectToCompany = httpsCallable(functions, 'assignProjectToCompany');
          // If companyId is empty string, pass null to unassign
          await assignProjectToCompany({ projectId, companyId: companyId || null });
      } catch (e: any) {
          console.error("Failed to assign company", e);
          alert(`Assignment failed: ${e.message}`);
      }
  };

  const handleDelete = async (projectId: string, status: string) => {
      if (status === 'archived') {
          if (confirm("Permanently delete this project? This cannot be undone.")) {
              try {
                  await deleteDoc(doc(db, 'projects', projectId));
              } catch (e) { alert("Delete failed"); }
          }
      } else {
          if (confirm("Archive this project?")) {
              try {
                  const deleteAt = new Date();
                  deleteAt.setDate(deleteAt.getDate() + 30);
                  await updateDoc(doc(db, 'projects', projectId), {
                      status: 'archived',
                      deleteAt: Timestamp.fromDate(deleteAt)
                  });
              } catch (e) { alert("Archive failed"); }
          }
      }
  };

  const handleRecover = async (projectId: string) => {
      try {
          await updateDoc(doc(db, 'projects', projectId), { status: 'active', deleteAt: null }); // 'active' might need to be specific like 'Pending'
      } catch (e) { alert("Recovery failed"); }
  };

  const openShare = (projectId: string) => {
      setCurrentShareProject(projectId);
      setSharePermissions({ canApprove: false, canAnnotate: false, canSeeComments: true, isOwner: false });
      setShareLink(null);
      setIsShareModalOpen(true);
  };

  const generateShareLink = async () => {
      if (!currentShareProject) return;
      setGeneratingLink(true);
      try {
          const generateGuestLink = httpsCallable(functions, 'generateGuestLink');
          const result = await generateGuestLink({
              projectId: currentShareProject,
              permissions: sharePermissions
          });
          // Construct full URL (assuming result returns relative or full, ensuring consistency)
          const data = result.data as any;
          // The Cloud Function returns 'url' which might be hardcoded to a domain.
          // We should ideally use window.location.origin to match the current environment (preview vs prod).
          const urlObj = new URL(data.url);
          const finalUrl = `${window.location.origin}/proof.html${urlObj.search}`;

          setShareLink(finalUrl);
      } catch (e) {
          alert("Failed to generate link");
      } finally {
          setGeneratingLink(false);
      }
  };

  // --- Filtering & Sorting ---
  const filteredProjects = projects.filter(p => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Archived') return p.status === 'archived';
      if (statusFilter === 'Active') return p.status !== 'archived' && p.status !== 'Complete';
      return p.status === statusFilter;
  }).sort((a, b) => {
      const [field, dir] = sortBy.split('-');
      const dirVal = dir === 'asc' ? 1 : -1;

      let valA = a[field];
      let valB = b[field];

      if (field === 'createdAt') {
          valA = a.createdAt?.seconds || 0;
          valB = b.createdAt?.seconds || 0;
      } else if (field === 'projectName') {
          valA = (valA || '').toLowerCase();
          valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return -1 * dirVal;
      if (valA > valB) return 1 * dirVal;
      return 0;
  });

  if (authLoading) return <div className="text-center py-12 text-gray-400">Verifying access...</div>;

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Production Projects</h1>
            <div className="flex gap-4">
                <select
                    className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="All">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                    <option value="Awaiting Client Upload">Awaiting Upload</option>
                    <option value="Approved">Approved</option>
                    <option value="In Production">In Production</option>
                </select>
                <select
                    className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="createdAt-desc">Newest First</option>
                    <option value="createdAt-asc">Oldest First</option>
                    <option value="projectName-asc">Name (A-Z)</option>
                </select>
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
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Project Name</th>
                            <th className="px-6 py-4">Company</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Created</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {filteredProjects.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No projects found.</td>
                            </tr>
                        )}
                        {filteredProjects.map((proj) => (
                            <tr key={proj.id} className={`hover:bg-slate-700/50 transition-colors ${proj.status === 'archived' ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-white">{proj.projectName}</div>
                                    <div className="text-xs text-gray-500">ID: {proj.id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        className="bg-transparent border-b border-gray-600 focus:border-indigo-500 text-gray-300 text-sm py-1 focus:outline-none"
                                        value={proj.companyId || ''}
                                        onChange={(e) => handleCompanyChange(proj.id, e.target.value)}
                                    >
                                        <option value="">-- Unassigned --</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>{c.companyName}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        className={`bg-transparent border-b border-gray-600 focus:border-indigo-500 text-xs font-medium py-1 focus:outline-none ${
                                            proj.status === 'Approved' ? 'text-green-400' :
                                            proj.status === 'Awaiting Client Upload' ? 'text-blue-400' :
                                            'text-gray-300'
                                        }`}
                                        value={proj.status}
                                        onChange={(e) => handleStatusChange(proj.id, e.target.value)}
                                    >
                                        <option value="Awaiting Client Upload">Awaiting Upload</option>
                                        <option value="Pending Review">Pending Review</option>
                                        <option value="Changes Requested">Changes Requested</option>
                                        <option value="Approved">Approved</option>
                                        <option value="In Production">In Production</option>
                                        <option value="Complete">Complete</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 text-white">
                                    {proj.createdAt?.seconds ? new Date(proj.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <a href={`/legacy-portal/admin_project.html?id=${proj.id}`} className="text-indigo-400 hover:text-white text-xs uppercase font-bold tracking-wider">Manage</a>
                                    <button onClick={() => openShare(proj.id)} className="text-purple-400 hover:text-purple-300 text-xs uppercase font-bold tracking-wider">Share</button>
                                    {proj.status === 'archived' ? (
                                        <button onClick={() => handleRecover(proj.id)} className="text-green-400 hover:text-green-300 text-xs uppercase font-bold tracking-wider">Recover</button>
                                    ) : (
                                        <button onClick={() => handleDelete(proj.id, proj.status)} className="text-red-400 hover:text-red-300 text-xs uppercase font-bold tracking-wider">Delete</button>
                                    )}
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
                                <button type="submit" disabled={creating} className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500 disabled:opacity-50">
                                    {creating ? 'Creating...' : 'Create & Get Link'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-4">
                            <h3 className="text-lg font-bold text-white mb-2">Project Created!</h3>
                            <div className="bg-slate-900 p-3 rounded border border-slate-600 text-sm text-white break-all select-all">
                                {generatedLink}
                            </div>
                            <button onClick={closeModal} className="mt-6 w-full py-2 bg-slate-700 text-white rounded hover:bg-slate-600">Done</button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Share Modal */}
        {isShareModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-4">Share Project</h2>
                    {!shareLink ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2 text-gray-300">
                                    <input type="checkbox" checked={sharePermissions.isOwner} onChange={e => setSharePermissions({...sharePermissions, isOwner: e.target.checked})} className="rounded bg-slate-700 border-slate-600 text-indigo-600" />
                                    <span>Full Ownership (Can Upload/Approve)</span>
                                </label>
                                <label className="flex items-center space-x-2 text-gray-300">
                                    <input type="checkbox" checked={sharePermissions.canApprove} disabled={sharePermissions.isOwner} onChange={e => setSharePermissions({...sharePermissions, canApprove: e.target.checked})} className="rounded bg-slate-700 border-slate-600 text-indigo-600 disabled:opacity-50" />
                                    <span>Can Approve</span>
                                </label>
                                <label className="flex items-center space-x-2 text-gray-300">
                                    <input type="checkbox" checked={sharePermissions.canAnnotate} disabled={sharePermissions.isOwner} onChange={e => setSharePermissions({...sharePermissions, canAnnotate: e.target.checked})} className="rounded bg-slate-700 border-slate-600 text-indigo-600 disabled:opacity-50" />
                                    <span>Can Comment/Annotate</span>
                                </label>
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <button onClick={() => setIsShareModalOpen(false)} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
                                <button onClick={generateShareLink} disabled={generatingLink} className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500 disabled:opacity-50">
                                    {generatingLink ? 'Generating...' : 'Generate Link'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <h3 className="text-lg font-bold text-white mb-2">Link Ready</h3>
                            <div className="bg-slate-900 p-3 rounded border border-slate-600 text-sm text-white break-all select-all">
                                {shareLink}
                            </div>
                            <button onClick={() => setIsShareModalOpen(false)} className="mt-6 w-full py-2 bg-slate-700 text-white rounded hover:bg-slate-600">Close</button>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}
