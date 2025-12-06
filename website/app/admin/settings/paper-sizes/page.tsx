'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface PaperSize {
    id: string;
    name: string;
    width: number;
    height: number;
    unit: 'in' | 'mm';
    isActive: boolean;
}

export default function PaperLedger() {
    const [sizes, setSizes] = useState<PaperSize[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [currentSize, setCurrentSize] = useState<PaperSize>({
        id: '',
        name: '',
        width: 0,
        height: 0,
        unit: 'in',
        isActive: true
    });

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                const q = query(collection(db, 'settings', 'paper_sizes', 'items'), orderBy('name'));
                const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
                    const items = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as PaperSize[];
                    setSizes(items);
                    setLoading(false);
                });
                return () => unsubscribeSnapshot();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    const handleEdit = (size: PaperSize) => {
        setCurrentSize(size);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setCurrentSize({
            id: '',
            name: '',
            width: 0,
            height: 0,
            unit: 'in',
            isActive: true
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this size?')) return;
        try {
            await deleteDoc(doc(db, 'settings', 'paper_sizes', 'items', id));
        } catch (error) {
            console.error("Error deleting size:", error);
            alert("Failed to delete size.");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const dataToSave = {
                name: currentSize.name,
                width: Number(currentSize.width),
                height: Number(currentSize.height),
                unit: currentSize.unit,
                isActive: currentSize.isActive,
                updatedAt: serverTimestamp()
            };

            if (currentSize.id) {
                await setDoc(doc(db, 'settings', 'paper_sizes', 'items', currentSize.id), dataToSave, { merge: true });
            } else {
                // Create new doc with auto ID
                const newDocRef = doc(collection(db, 'settings', 'paper_sizes', 'items'));
                await setDoc(newDocRef, { ...dataToSave, createdAt: serverTimestamp() });
            }

            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving size:", error);
            alert("Failed to save size.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Paper Ledger</h1>
                    <p className="text-gray-400 mt-2">Manage standard trim sizes available in the estimator.</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500 transition-colors"
                >
                    Add New Size
                </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                {loading ? (
                    <div className="p-8 text-center text-gray-500 animate-pulse">Loading sizes...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Width</th>
                                    <th className="px-6 py-4">Height</th>
                                    <th className="px-6 py-4">Unit</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {sizes.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No paper sizes defined yet.</td>
                                    </tr>
                                ) : (
                                    sizes.map((size) => (
                                        <tr key={size.id} className="hover:bg-slate-700/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-white">{size.name}</td>
                                            <td className="px-6 py-4">{size.width}</td>
                                            <td className="px-6 py-4">{size.height}</td>
                                            <td className="px-6 py-4 uppercase">{size.unit}</td>
                                            <td className="px-6 py-4 text-right space-x-4">
                                                <button
                                                    onClick={() => handleEdit(size)}
                                                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(size.id)}
                                                    className="text-red-400 hover:text-red-300 font-medium"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">
                            {currentSize.id ? 'Edit Paper Size' : 'Add New Paper Size'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="e.g. Letter, A4, Digest"
                                    value={currentSize.name}
                                    onChange={e => setCurrentSize({...currentSize, name: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Width</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        required
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={currentSize.width || ''}
                                        onChange={e => setCurrentSize({...currentSize, width: parseFloat(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Height</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        required
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={currentSize.height || ''}
                                        onChange={e => setCurrentSize({...currentSize, height: parseFloat(e.target.value)})}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Unit</label>
                                <div className="flex bg-slate-900 rounded p-1 border border-slate-600">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentSize({...currentSize, unit: 'in'})}
                                        className={`flex-1 py-1 text-xs font-medium rounded ${currentSize.unit === 'in' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Inches (in)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentSize({...currentSize, unit: 'mm'})}
                                        className={`flex-1 py-1 text-xs font-medium rounded ${currentSize.unit === 'mm' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Millimeters (mm)
                                    </button>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-700 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-300 hover:text-white text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Save Size'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
