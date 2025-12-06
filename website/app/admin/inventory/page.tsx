'use client';

import React, { useState, useEffect } from 'react';
import { db, httpsCallable, functions, auth } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, getDocs, where, limit, doc } from 'firebase/firestore';
import { medusaAdmin } from '../../lib/medusa-admin';
import { onAuthStateChanged } from 'firebase/auth';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<'raw' | 'finished'>('raw');

  // Raw Materials (Firebase) State
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingFirebase, setLoadingFirebase] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [purchaseHistories, setPurchaseHistories] = useState<Record<string, any[]>>({});

  // Cost History Modal State
  const [costHistoryItem, setCostHistoryItem] = useState<any>(null);
  const [costHistoryData, setCostHistoryData] = useState<any>(null);

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
      brand: '', color: '', availableForBuilders: []
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

        const q = query(collection(db, 'inventory'), orderBy('name'));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setInventoryItems(items);
            setLoadingFirebase(false);
        });

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

  const toggleRow = async (itemId: string) => {
      const newSet = new Set(expandedRows);
      if (newSet.has(itemId)) {
          newSet.delete(itemId);
      } else {
          newSet.add(itemId);
          if (!purchaseHistories[itemId]) {
              // Load history
              try {
                  const itemRef = doc(db, 'inventory', itemId);
                  const q = query(
                      collection(db, 'inventoryPurchases'),
                      where('inventoryItemRef', '==', itemRef),
                      orderBy('purchaseDate', 'desc'),
                      limit(10)
                  );
                  const snap = await getDocs(q);
                  const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                  setPurchaseHistories(prev => ({ ...prev, [itemId]: history }));
              } catch (e) {
                  console.error("Failed to load history", e);
              }
          }
      }
      setExpandedRows(newSet);
  };

  const openCostHistory = async (item: any) => {
      setCostHistoryItem(item);

      // Fetch full history for chart
      try {
          const itemRef = doc(db, 'inventory', item.id);
          const q = query(
              collection(db, 'inventoryPurchases'),
              where('inventoryItemRef', '==', itemRef),
              orderBy('purchaseDate', 'asc')
          );
          const snap = await getDocs(q);
          const data = snap.docs.map(d => d.data());

          setCostHistoryData({
              labels: data.map(d => d.purchaseDate?.toDate().toLocaleDateString() || 'N/A'),
              datasets: [{
                  label: 'Cost per M',
                  data: data.map(d => d.costPerM_atPurchase),
                  borderColor: 'rgba(99, 102, 241, 1)',
                  backgroundColor: 'rgba(99, 102, 241, 0.2)',
                  tension: 0.2
              }]
          });
      } catch (e) { console.error(e); }
  };

  const handleAddItem = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
          const upsertInventoryItem = httpsCallable(functions, 'upsertInventoryItem');
          await upsertInventoryItem(newItem);
          alert('Item saved successfully');
          setIsItemModalOpen(false);
          setNewItem({
             name: '', manufacturerSKU: '', type: 'Text', weight: '', finish: 'Matte',
             thickness_caliper: '', sheetsPerPackage: '', location: '', reorderPoint: '',
             dimensions: { width: '', height: '', unit: 'in' }, grainDirection: 'long',
             brand: '', color: '', availableForBuilders: []
          });
      } catch (err: any) {
          alert(`Error: ${err.message}`);
      } finally {
          setSubmitting(false);
      }
  };

  const handleReceiveInventory = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
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
                        <button onClick={() => setIsReceiveModalOpen(true)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm font-medium hover:bg-slate-600 border border-slate-600">
                            Receive Inventory
                        </button>
                        <button onClick={() => setIsItemModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500">
                            Add New Item
                        </button>
                     </>
                 )}
            </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-slate-800 p-1 rounded-lg mb-6 w-fit border border-slate-700">
            <button onClick={() => setActiveTab('raw')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'raw' ? 'bg-slate-700 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-slate-700/50'}`}>Raw Materials (Firebase)</button>
            <button onClick={() => setActiveTab('finished')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'finished' ? 'bg-slate-700 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-slate-700/50'}`}>Finished Goods (Medusa)</button>
        </div>

        {/* Content */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            {activeTab === 'raw' ? (
                loadingFirebase ? <div className="p-8 text-center text-gray-500 animate-pulse">Loading inventory...</div> : (
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
                            {inventoryItems.map((item) => (
                                <React.Fragment key={item.id}>
                                    <tr className="hover:bg-slate-700/50 cursor-pointer" onClick={() => toggleRow(item.id)}>
                                        <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                                        <td className="px-6 py-4 text-white">{item.quantityInPackages}</td>
                                        <td className="px-6 py-4">{item.quantityLooseSheets}</td>
                                        <td className="px-6 py-4">{item.dimensions ? `${item.dimensions.width}x${item.dimensions.height} ${item.dimensions.unit}` : '-'}</td>
                                        <td className="px-6 py-4">{item.weight || '-'}</td>
                                        <td className="px-6 py-4">{item.thickness_caliper ? `${item.thickness_caliper}pt` : '-'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); setNewItem({ ...item, itemId: item.id }); setIsItemModalOpen(true); }} className="text-indigo-400 hover:text-indigo-300">Edit</button>
                                        </td>
                                    </tr>
                                    {expandedRows.has(item.id) && (
                                        <tr className="bg-slate-900/50">
                                            <td colSpan={7} className="p-4">
                                                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className="text-sm font-bold text-white">Purchase History</h4>
                                                        <button onClick={() => openCostHistory(item)} className="text-xs bg-indigo-900/50 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-900">View Cost Graph</button>
                                                    </div>
                                                    <table className="w-full text-xs text-gray-400">
                                                        <thead>
                                                            <tr className="border-b border-slate-700">
                                                                <th className="pb-2 text-left">Date</th>
                                                                <th className="pb-2 text-left">Qty (Pkgs)</th>
                                                                <th className="pb-2 text-left">Total Cost</th>
                                                                <th className="pb-2 text-left">Cost / M</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {purchaseHistories[item.id]?.map((ph: any) => (
                                                                <tr key={ph.id} className="border-b border-slate-700/50">
                                                                    <td className="py-2">{ph.purchaseDate?.toDate().toLocaleDateString()}</td>
                                                                    <td className="py-2">{ph.quantityPurchasedInPackages}</td>
                                                                    <td className="py-2">${ph.totalCost?.toFixed(2)}</td>
                                                                    <td className="py-2 text-indigo-300">${ph.costPerM_atPurchase?.toFixed(2)}</td>
                                                                </tr>
                                                            ))}
                                                            {(!purchaseHistories[item.id] || purchaseHistories[item.id].length === 0) && (
                                                                <tr><td colSpan={4} className="py-2 text-center italic">No history found.</td></tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                )
            ) : (
                loadingMedusa ? <div className="p-8 text-center text-gray-500 animate-pulse">Loading products...</div> : (
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
                            {products.map((prod) => (
                                <tr key={prod.id} className="hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-white">{prod.title}</td>
                                    <td className="px-6 py-4">{prod.collection?.title || '—'}</td>
                                    <td className="px-6 py-4">{prod.status}</td>
                                    <td className="px-6 py-4">{prod.variants?.length || 0}</td>
                                    <td className="px-6 py-4">{prod.variants?.reduce((acc: number, v: any) => acc + (v.inventory_quantity || 0), 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )
            )}
        </div>

        {/* Cost History Graph Modal */}
        {costHistoryItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-4xl border border-slate-700 h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white">Cost History: {costHistoryItem.name}</h3>
                        <button onClick={() => { setCostHistoryItem(null); setCostHistoryData(null); }} className="text-gray-400 hover:text-white">Close</button>
                    </div>
                    <div className="flex-1 relative">
                        {costHistoryData ? (
                            <Line data={costHistoryData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#334155' } }, x: { grid: { display: false } } } }} />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">Loading graph...</div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Add/Edit Modal (Expanded) */}
        {isItemModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-4xl border border-slate-700 shadow-2xl my-8">
                    <h2 className="text-xl font-bold text-white mb-4">{newItem.itemId ? 'Edit Item' : 'Add New Item'}</h2>
                    <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Column 1 */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Item Name</label>
                                <input required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Manufacturer SKU</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.manufacturerSKU} onChange={e => setNewItem({...newItem, manufacturerSKU: e.target.value})} />
                            </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Sheets Per Package</label>
                                <input type="number" required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.sheetsPerPackage} onChange={e => setNewItem({...newItem, sheetsPerPackage: e.target.value})} />
                            </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Location</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.location} onChange={e => setNewItem({...newItem, location: e.target.value})} />
                            </div>
                        </div>

                        {/* Column 2 */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Dimensions (W x H)</label>
                                <div className="flex items-center space-x-2">
                                     <input type="number" step="any" required placeholder="W" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                        value={newItem.dimensions?.width || ''} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, width: e.target.value}})} />
                                     <span className="text-gray-400">x</span>
                                     <input type="number" step="any" required placeholder="H" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                        value={newItem.dimensions?.height || ''} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, height: e.target.value}})} />
                                     <select className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                        value={newItem.dimensions?.unit || 'in'} onChange={e => setNewItem({...newItem, dimensions: {...newItem.dimensions, unit: e.target.value}})}>
                                         <option value="in">in</option>
                                         <option value="mm">mm</option>
                                     </select>
                                </div>
                            </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Grain Direction</label>
                                <select className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.grainDirection} onChange={e => setNewItem({...newItem, grainDirection: e.target.value})}>
                                    <option value="long">Long</option>
                                    <option value="short">Short</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Weight</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Thickness / Caliper (pt)</label>
                                <input type="number" step="any" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.thickness_caliper} onChange={e => setNewItem({...newItem, thickness_caliper: e.target.value})} />
                            </div>
                        </div>

                        {/* Column 3 */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Type</label>
                                <input placeholder="e.g. Cover, Text" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Finish</label>
                                <input placeholder="e.g. Gloss, Matte" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.finish} onChange={e => setNewItem({...newItem, finish: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Brand (Optional)</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.brand} onChange={e => setNewItem({...newItem, brand: e.target.value})} />
                            </div>
                             <div>
                                <label className="block text-xs text-gray-400 mb-1">Color (Optional)</label>
                                <input className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                                    value={newItem.color} onChange={e => setNewItem({...newItem, color: e.target.value})} />
                            </div>
                        </div>

                        {/* Column 4: Builder Availability (Full Width) */}
                        <div className="col-span-1 md:col-span-3 bg-slate-900/50 p-4 rounded border border-slate-700">
                            <h4 className="text-sm font-bold text-gray-300 mb-3">Available In Builders</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {['book_builder', 'print_builder', 'large_format_builder', 'saddle_stitch_builder'].map(builder => (
                                    <label key={builder} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="form-checkbox text-indigo-600 rounded bg-slate-800 border-slate-600"
                                            checked={newItem.availableForBuilders?.includes(builder) || false}
                                            onChange={(e) => {
                                                const current = newItem.availableForBuilders || [];
                                                if (e.target.checked) {
                                                    setNewItem({ ...newItem, availableForBuilders: [...current, builder] });
                                                } else {
                                                    setNewItem({ ...newItem, availableForBuilders: current.filter((b: string) => b !== builder) });
                                                }
                                            }}
                                        />
                                        <span className="text-sm text-gray-400 capitalize">{builder.replace(/_/g, ' ')}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="col-span-1 md:col-span-3 flex justify-end gap-3 mt-4 pt-4 border-t border-slate-700">
                            <button type="button" onClick={() => setIsItemModalOpen(false)} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
                            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500">
                                {submitting ? 'Saving...' : 'Save Item'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Receive Inventory Modal (Unchanged) */}
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
