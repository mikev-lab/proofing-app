'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, orderBy, query, serverTimestamp, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { fetchAdminProducts, AdminProductSummary } from '../../../actions/medusa-actions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PaperSize {
    id: string;
    name: string;
    width: number;
    height: number;
    unit: 'in' | 'mm';
    isActive: boolean;
}

// Draggable Item Component
function SortableItem(props: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: props.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-slate-700 p-3 mb-2 rounded border border-slate-600 flex justify-between items-center cursor-move hover:bg-slate-600 transition-colors">
            <span className="text-white font-medium">{props.name}</span>
            <span className="text-xs text-gray-400">{props.width} x {props.height} {props.unit}</span>
        </div>
    );
}

export default function PaperLedger() {
    const [activeTab, setActiveTab] = useState<'ledger' | 'products'>('ledger');
    const [sizes, setSizes] = useState<PaperSize[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Product Assignment State
    const [products, setProducts] = useState<AdminProductSummary[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [assignedSizeIds, setAssignedSizeIds] = useState<string[]>([]); // Ordered list of IDs
    const [loadingAssignments, setLoadingAssignments] = useState(false);

    // Form State
    const [currentSize, setCurrentSize] = useState<PaperSize>({
        id: '',
        name: '',
        width: 0,
        height: 0,
        unit: 'in',
        isActive: true
    });

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                // 1. Fetch Sizes
                const q = query(collection(db, 'settings', 'paper_sizes', 'items'), orderBy('name'));
                const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
                    const items = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as PaperSize[];
                    setSizes(items);
                    setLoading(false);
                });

                // 2. Fetch Products
                fetchAdminProducts().then(setProducts);

                return () => unsubscribeSnapshot();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    // Fetch assignments when product selected
    useEffect(() => {
        if (!selectedProduct) {
            setAssignedSizeIds([]);
            return;
        }

        const loadAssignments = async () => {
            setLoadingAssignments(true);
            try {
                const docRef = doc(db, 'settings', 'product_sizes', 'items', selectedProduct);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setAssignedSizeIds(snap.data().allowedSizeIds || []);
                } else {
                    setAssignedSizeIds([]);
                }
            } catch (error) {
                console.error("Error loading product assignments:", error);
            } finally {
                setLoadingAssignments(false);
            }
        };

        loadAssignments();
    }, [selectedProduct]);

    // --- Actions ---

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

    // --- Drag and Drop Logic ---

    const handleDragEnd = (event: any) => {
        const { active, over } = event;

        if (!over) return;

        if (active.id !== over.id) {
            setAssignedSizeIds((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const addToAssigned = (sizeId: string) => {
        if (!assignedSizeIds.includes(sizeId)) {
            setAssignedSizeIds([...assignedSizeIds, sizeId]);
        }
    };

    const removeFromAssigned = (sizeId: string) => {
        setAssignedSizeIds(assignedSizeIds.filter(id => id !== sizeId));
    };

    const saveAssignments = async () => {
        if (!selectedProduct) return;
        setSubmitting(true);
        try {
            await setDoc(doc(db, 'settings', 'product_sizes', 'items', selectedProduct), {
                allowedSizeIds: assignedSizeIds,
                updatedAt: serverTimestamp()
            });
            alert("Product sizing rules saved!");
        } catch (error) {
            console.error("Error saving assignments:", error);
            alert("Failed to save assignments.");
        } finally {
            setSubmitting(false);
        }
    };

    // --- Derived Data for DND ---
    const assignedSizes = assignedSizeIds
        .map(id => sizes.find(s => s.id === id))
        .filter(Boolean) as PaperSize[];

    const availableSizes = sizes
        .filter(s => !assignedSizeIds.includes(s.id))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Paper Ledger</h1>
                    <p className="text-gray-400 mt-2">Manage standard trim sizes available in the estimator.</p>
                </div>

                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Size Definitions
                    </button>
                    <button
                         onClick={() => setActiveTab('products')}
                         className={`px-4 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'products' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Product Assignments
                    </button>
                </div>
            </div>

            {activeTab === 'ledger' && (
                <>
                <div className="flex justify-end mb-4">
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
                </>
            )}

            {activeTab === 'products' && (
                <div className="space-y-6">
                    {/* Product Selector */}
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Select Product to Configure</label>
                        <select
                            value={selectedProduct}
                            onChange={(e) => setSelectedProduct(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="">-- Select a Product --</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                        </select>
                    </div>

                    {selectedProduct && (
                         <div className="grid grid-cols-2 gap-8">
                             {/* Available Sizes */}
                             <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                                 <h3 className="text-lg font-bold text-white mb-4">Available Sizes</h3>
                                 <div className="space-y-2">
                                     {availableSizes.map(size => (
                                         <div key={size.id} className="bg-slate-800 p-3 rounded border border-slate-700 flex justify-between items-center opacity-75 hover:opacity-100 transition-opacity">
                                             <div>
                                                 <div className="text-gray-300 font-medium">{size.name}</div>
                                                 <div className="text-xs text-gray-500">{size.width} x {size.height} {size.unit}</div>
                                             </div>
                                             <button onClick={() => addToAssigned(size.id)} className="p-1 hover:bg-slate-700 rounded text-green-400">
                                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                             </button>
                                         </div>
                                     ))}
                                     {availableSizes.length === 0 && <p className="text-gray-500 text-sm italic">All sizes assigned.</p>}
                                 </div>
                             </div>

                             {/* Assigned / Sorted Sizes */}
                             <div className="bg-slate-800 p-6 rounded-xl border border-indigo-500/30 ring-1 ring-indigo-500/20">
                                 <div className="flex justify-between items-center mb-4">
                                     <h3 className="text-lg font-bold text-white">Assigned & Recommended</h3>
                                     <button
                                        onClick={saveAssignments}
                                        disabled={submitting || loadingAssignments}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-lg transition-colors disabled:opacity-50"
                                     >
                                         {submitting ? 'Saving...' : 'Save Order'}
                                     </button>
                                 </div>
                                 <p className="text-xs text-gray-400 mb-4">Drag to reorder. The top items will appear first in the estimator.</p>

                                 {loadingAssignments ? (
                                     <div className="text-center py-8 text-gray-500">Loading assignments...</div>
                                 ) : (
                                     <DndContext
                                         sensors={sensors}
                                         collisionDetection={closestCenter}
                                         onDragEnd={handleDragEnd}
                                     >
                                         <SortableContext
                                             items={assignedSizeIds}
                                             strategy={verticalListSortingStrategy}
                                         >
                                             <div className="space-y-2 min-h-[200px]">
                                                 {assignedSizes.map((size) => (
                                                     <div key={size.id} className="relative group">
                                                         <SortableItem
                                                             id={size.id}
                                                             name={size.name}
                                                             width={size.width}
                                                             height={size.height}
                                                             unit={size.unit}
                                                         />
                                                          <button
                                                             onClick={() => removeFromAssigned(size.id)}
                                                             className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700/80 rounded"
                                                         >
                                                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                         </button>
                                                     </div>
                                                 ))}
                                                 {assignedSizes.length === 0 && (
                                                     <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-lg text-gray-500 text-sm">
                                                         No sizes assigned. <br/> Add from the left list.
                                                     </div>
                                                 )}
                                             </div>
                                         </SortableContext>
                                     </DndContext>
                                 )}
                             </div>
                         </div>
                    )}
                </div>
            )}

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
