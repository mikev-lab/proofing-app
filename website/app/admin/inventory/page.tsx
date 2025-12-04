'use client';

import React, { useState, useEffect } from 'react';
import { db, httpsCallable, functions, auth } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, getDocs, doc, runTransaction, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { medusaAdmin } from '../../lib/medusa-admin';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<'raw' | 'finished'>('raw');

  // Raw Materials (Firebase) State
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingFirebase, setLoadingFirebase] = useState(true);

  // Finished Goods (Medusa) State
  const [products, setProducts] = useState<any[]>([]);
  const [loadingMedusa, setLoadingMedusa] = useState(true);
  const [medusaConnected, setMedusaConnected] = useState(false);

  // Modals
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);

  // Form State
  const [newItem, setNewItem] = useState<any>({
      name: '', manufacturerSKU: '', type: 'Text', weight: '', finish: 'Matte',
      thickness_caliper: '', sheetsPerPackage: '', location: '', reorderPoint: '',
      dimensions: { width: '', height: '', unit: 'in' }, grainDirection: 'long',
      brand: '', color: ''
  });
  const [receiveData, setReceiveData] = useState({ inventoryItemId: '', packagesQuantity: '', totalCost: '' });
  const [submitting, setSubmitting] = useState(false);

  // Init Data Fetching
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
            setLoadingFirebase(false);
            return;
        }

        // 1. Firebase Inventory
        const q = query(collection(db, 'inventory'), orderBy('name'));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setInventoryItems(items);
            setLoadingFirebase(false);
        });

        // 2. Medusa Products
        fetchMedusaProducts();
    });

    return () => {
        authUnsubscribe();
        if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchMedusaProducts = async () => {
      try {
          const { products } = await medusaAdmin.admin.product.list();
          if (products) {
              setProducts(products);
              setMedusaConnected(true);
          }
      } catch (e) {
          console.warn("Medusa product fetch failed", e);
          setMedusaConnected(false);
      } finally {
          setLoadingMedusa(false);
      }
  };

  // --- Handlers ---

  const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
          // Cloud Functions exist for this, so we use them to ensure backend validation
          const upsertInventoryItem = httpsCallable(functions, 'upsertInventoryItem');
          await upsertInventoryItem(newItem);
          alert('Item saved successfully');
          setIsItemModalOpen(false);
          setNewItem({ // Reset
             name: '', manufacturerSKU: '', type: 'Text', weight: '', finish: 'Matte',
             thickness_caliper: '', sheetsPerPackage: '', location: '', reorderPoint: '',
             dimensions: { width: '', height: '', unit: 'in' }, grainDirection: 'long',
             brand: '', color: ''
          });
      } catch (err: any) {
          console.error("Error saving item:", err);
          alert(`Error: ${err.message}`);
      } finally {
          setSubmitting(false);
      }
  };

  const handleReceiveInventory = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
          // Cloud Functions exist for this, so we use them for transactional integrity
          const receiveInventory = httpsCallable(functions, 'receiveInventory');
          await receiveInventory({
              inventoryItemId: receiveData.inventoryItemId,
              packagesQuantity: parseInt(receiveData.packagesQuantity),
              totalCost: parseFloat(receiveData.totalCost)
          });
          alert('Inventory received successfully');
          setIsReceiveModalOpen(false);
          setReceiveData({ inventoryItemId: '', packagesQuantity: '', totalCost: '' });
      } catch (err: any) {
          console.error("Error receiving inventory:", err);
          alert(`Error: ${err.message}`);
      } finally {
          setSubmitting(false);
      }
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Inventory Management</h1>
            <div className="flex gap-4">
                 {activeTab === 'raw' && (
                     <>
                        <button
                            onClick={() => setIsReceiveModalOpen(true)}
                            className="px-4 py-2 bg-slate-700 text-white rounded text-sm font-medium hover:bg-slate-600 border border-slate-600"
                        >
                            Receive Inventory
                        </button>
                        <button
                            onClick={() => setIsItemModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500"
                        >
                            Add New Item
                        </button>
                     </>
                 )}
            </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-slate-800 p-1 rounded-lg mb-6 w-fit border border-slate-700">
            <button
                onClick={() => setActiveTab('raw')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === 'raw'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
                Raw Materials (Firebase)
            </button>
            <button
                onClick={() => setActiveTab('finished')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === 'finished'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
                Finished Goods (Medusa)
            </button>
        </div>

        {/* Content */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            {activeTab === 'raw' ? (
                loadingFirebase ? <div className="p-8 text-center text-gray-500">Loading inventory...</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">In Stock (Pkgs)</th>
                                <th className="px-6 py-4">Loose Sheets</th>
                                <th className="px-6 py-4">Dimensions</th>
                                <th className="px-6 py-4">Weight</th>
                                <th className="px-6 py-4">Caliper</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {inventoryItems.length === 0 && (
                                <tr><td colSpan={7} className="px-6 py-4 text-center">No items found.</td></tr>
                            )}
                            {inventoryItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                                    <td className="px-6 py-4 text-white">{item.quantityInPackages}</td>
                                    <td className="px-6 py-4">{item.quantityLooseSheets}</td>
                                    <td className="px-6 py-4">
                                        {item.dimensions ? `${item.dimensions.width}x${item.dimensions.height} ${item.dimensions.unit}` : '-'}
                                    </td>
                                    <td className="px-6 py-4">{item.weight || '-'}</td>
                                    <td className="px-6 py-4">{item.thickness_caliper ? `${item.thickness_caliper}pt` : '-'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => {
                                                setNewItem({ ...item, itemId: item.id }); // Populate form for edit
                                                setIsItemModalOpen(true);
                                            }}
                                            className="text-indigo-400 hover:text-indigo-300"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )
            ) : (
                // Finished Goods (Medusa)
                loadingMedusa ? <div className="p-8 text-center text-gray-500">Loading products...</div> : (
                <>
                {!medusaConnected && (
                    <div className="p-8 text-center text-red-400 bg-red-900/10 border-b border-red-900/20">
                        Medusa API not connected.
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Product Name</th>
                                <th className="px-6 py-4">Collection</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Variants</th>
                                <th className="px-6 py-4">Inventory</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {products.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-4 text-center">No products found.</td></tr>
                            )}
                            {products.map((prod) => (
                                <tr key={prod.id} className="hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-white">{prod.title}</td>
                                    <td className="px-6 py-4">{prod.collection?.title || '—'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            prod.status === 'published' ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                                        }`}>
                                            {prod.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">{prod.variants?.length || 0}</td>
                                    <td className="px-6 py-4">
                                        {/* Summing inventory of variants */}
                                        {prod.variants?.reduce((acc: number, v: any) => acc + (v.inventory_quantity || 0), 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
                )
            )}
        </div>

        {/* Add/Edit Item Modal */}
        {isItemModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl border border-slate-700 shadow-2xl my-8">
                    <h2 className="text-xl font-bold text-white mb-4">{newItem.itemId ? 'Edit Item' : 'Add New Item'}</h2>
                    <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">Item Name</label>
                            <input required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">SKU</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.manufacturerSKU} onChange={e => setNewItem({...newItem, manufacturerSKU: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Type</label>
                            <select className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})}>
                                <option value="Text">Text</option>
                                <option value="Cover">Cover</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Weight</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Finish</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.finish} onChange={e => setNewItem({...newItem, finish: e.target.value})} />
                        </div>
                        <div className="col-span-2 grid grid-cols-3 gap-2">
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Width</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.dimensions.width} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, width: e.target.value}})} />
                             </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Height</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.dimensions.height} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, height: e.target.value}})} />
                             </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Unit</label>
                                <select className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.dimensions.unit} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, unit: e.target.value}})}>
                                    <option value="in">in</option>
                                    <option value="mm">mm</option>
                                </select>
                             </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Sheets Per Package</label>
                            <input type="number" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.sheetsPerPackage} onChange={e => setNewItem({...newItem, sheetsPerPackage: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Thickness (pt)</label>
                            <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={newItem.thickness_caliper} onChange={e => setNewItem({...newItem, thickness_caliper: e.target.value})} />
                        </div>

                        <div className="col-span-2 flex justify-end gap-3 mt-4">
                            <button type="button" onClick={() => setIsItemModalOpen(false)} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
                            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500">
                                {submitting ? 'Saving...' : 'Save Item'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Receive Inventory Modal */}
        {isReceiveModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-4">Receive Inventory</h2>
                    <form onSubmit={handleReceiveInventory} className="space-y-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Item</label>
                            <select required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={receiveData.inventoryItemId} onChange={e => setReceiveData({...receiveData, inventoryItemId: e.target.value})}>
                                <option value="">Select Item</option>
                                {inventoryItems.map(item => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Quantity (Packages)</label>
                            <input type="number" required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={receiveData.packagesQuantity} onChange={e => setReceiveData({...receiveData, packagesQuantity: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Total Cost ($)</label>
                            <input type="number" step="0.01" required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                value={receiveData.totalCost} onChange={e => setReceiveData({...receiveData, totalCost: e.target.value})} />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button type="button" onClick={() => setIsReceiveModalOpen(false)} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
                            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500">
                                {submitting ? 'Processing...' : 'Receive'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
}
