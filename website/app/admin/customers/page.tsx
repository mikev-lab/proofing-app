'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase/config';
import { collection, query, onSnapshot, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { medusaAdmin } from '../../lib/medusa-admin';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminCustomers() {
  const [activeTab, setActiveTab] = useState<'firebase' | 'medusa'>('firebase');
  const [firebaseUsers, setFirebaseUsers] = useState<any[]>([]);
  const [medusaCustomers, setMedusaCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [medusaConnected, setMedusaConnected] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Auth Guard
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
            setLoading(false);
            return;
        }

        // 1. Fetch Firebase Users
        const q = query(collection(db, 'users'));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setFirebaseUsers(users);
            if (activeTab === 'firebase') setLoading(false);
        });

        // 2. Fetch Medusa Customers (Async)
        fetchMedusaCustomers();
    });

    return () => {
        authUnsubscribe();
        if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchMedusaCustomers = async () => {
      try {
          const { customers } = await medusaAdmin.admin.customer.list();
          if (customers) {
              setMedusaCustomers(customers);
              setMedusaConnected(true);
          }
      } catch (e) {
          console.warn("Medusa fetch failed", e);
          setMedusaConnected(false);
      } finally {
          if (activeTab === 'medusa') setLoading(false);
      }
  };

  const handleSync = async () => {
      setSyncing(true);
      try {
          // A simple sync strategy: Ensure all Firebase users exist in Medusa, and vice-versa (by email).
          // Note: Full bidirectional sync is complex (collisions, data precedence).
          // We will implement a "Greedy Sync" - if email matches, assume linked. If missing, create.

          // 1. Sync Firebase -> Medusa
          for (const fbUser of firebaseUsers) {
             const existsInMedusa = medusaCustomers.find((mc: any) => mc.email === fbUser.email);
             if (!existsInMedusa) {
                 try {
                    // Create in Medusa
                    // Note: Removed 'password' field as Medusa Admin API does not support it for customer creation.
                    // Authentication will be handled via Firebase or user must reset password in Medusa store.
                    await medusaAdmin.admin.customer.create({
                        email: fbUser.email,
                        first_name: fbUser.name || fbUser.company || 'Unknown',
                        last_name: '(Firebase Synced)'
                    });
                    console.log(`Synced ${fbUser.email} to Medusa`);
                 } catch (err) {
                     console.error(`Failed to sync ${fbUser.email} to Medusa`, err);
                 }
             }
          }

          // 2. Sync Medusa -> Firebase
          for (const mUser of medusaCustomers) {
              const existsInFb = firebaseUsers.find(fb => fb.email === mUser.email);
              if (!existsInFb) {
                  try {
                      // Create in Firebase (Firestore Only - cannot create Auth user without Admin SDK)
                      // We will create a "Shadow User" in Firestore so they appear in lists.
                      // They won't be able to login until they actually register, or we use Admin SDK in a Cloud Function.
                      // Since this is client-side, we just create the doc.
                      const fakeUid = `medusa_${mUser.id}`;
                      await setDoc(doc(db, 'users', fakeUid), {
                          email: mUser.email,
                          name: `${mUser.first_name} ${mUser.last_name}`,
                          company: mUser.company_name || 'Unspecified', // Medusa might not have this standard field
                          role: 'client_user',
                          source: 'medusa_sync',
                          createdAt: new Date().toISOString()
                      });
                      console.log(`Synced ${mUser.email} to Firebase`);
                  } catch (err) {
                      console.error(`Failed to sync ${mUser.email} to Firebase`, err);
                  }
              }
          }

          // Refresh lists
          await fetchMedusaCustomers();
          alert("Sync complete!");

      } catch (e) {
          console.error("Sync failed", e);
          alert("Sync encountered errors. Check console.");
      } finally {
          setSyncing(false);
      }
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Customer Management</h1>
            <div className="flex gap-4">
                 <button
                    onClick={handleSync}
                    disabled={syncing || !medusaConnected}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                        medusaConnected
                        ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {syncing ? 'Syncing...' : 'Sync Customers'}
                </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-slate-800 p-1 rounded-lg mb-6 w-fit border border-slate-700">
            <button
                onClick={() => setActiveTab('firebase')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === 'firebase'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
                Firebase Users ({firebaseUsers.length})
            </button>
            <button
                onClick={() => setActiveTab('medusa')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === 'medusa'
                    ? 'bg-slate-700 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
                Medusa Customers ({medusaCustomers.length})
            </button>
        </div>

        {/* Content */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            {activeTab === 'firebase' ? (
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Company</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Source</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {firebaseUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-white">{user.name || '—'}</td>
                                <td className="px-6 py-4">{user.email}</td>
                                <td className="px-6 py-4">{user.company || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className="bg-slate-700 px-2 py-1 rounded text-xs text-white">{user.role}</span>
                                </td>
                                <td className="px-6 py-4 text-xs">
                                    {user.source === 'medusa_sync' ? <span className="text-indigo-400">Synced</span> : 'Native'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <>
                {!medusaConnected && (
                    <div className="p-8 text-center text-red-400 bg-red-900/10 border-b border-red-900/20">
                        Medusa API not connected.
                    </div>
                )}
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                        <tr>
                            <th className="px-6 py-4">First Name</th>
                            <th className="px-6 py-4">Last Name</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Has Account</th>
                            <th className="px-6 py-4">Orders</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {medusaCustomers.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-medium text-white">{user.first_name || '—'}</td>
                                <td className="px-6 py-4 text-white">{user.last_name || '—'}</td>
                                <td className="px-6 py-4">{user.email}</td>
                                <td className="px-6 py-4">
                                    {user.has_account ? (
                                        <span className="text-green-400 text-xs border border-green-900 bg-green-900/20 px-2 py-1 rounded">Yes</span>
                                    ) : (
                                        <span className="text-gray-500 text-xs border border-gray-700 bg-gray-800 px-2 py-1 rounded">No</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">{user.orders ? user.orders.length : 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </>
            )}
        </div>
    </div>
  );
}
