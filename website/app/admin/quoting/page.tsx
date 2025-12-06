'use client';

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function AdminQuoting() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    clickCostColor: 0.04,
    clickCostBW: 0.009,
    laborRate: 50,
    markupPercent: 35,
    spoilagePercent: 5
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch settings
        try {
          const docRef = doc(db, 'settings', 'globalEstimatorDefaults');
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setSettings({
              clickCostColor: data.clickCostColor ?? 0.04,
              clickCostBW: data.clickCostBW ?? 0.009,
              laborRate: data.laborRate ?? 50,
              markupPercent: data.markupPercent ?? 35,
              spoilagePercent: data.spoilagePercent ?? 5
            });
          }
        } catch (error) {
          console.error("Error fetching settings:", error);
        } finally {
          setLoading(false);
        }
      } else {
        // Not authenticated, redirect or handled by guard
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'globalEstimatorDefaults');
      await setDoc(docRef, settings, { merge: true });
      alert('Settings saved successfully.');
    } catch (error: any) {
      console.error("Error saving settings:", error);
      alert(`Error saving settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Quoting Settings</h1>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Click Costs */}
            <div className="col-span-1 md:col-span-2">
              <h2 className="text-lg font-semibold text-white mb-4 border-b border-slate-700 pb-2">Click Costs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Cost Per Color Click ($)</label>
                  <input
                    type="number"
                    step="0.0001"
                    name="clickCostColor"
                    value={settings.clickCostColor}
                    onChange={handleChange}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Cost Per B/W Click ($)</label>
                  <input
                    type="number"
                    step="0.0001"
                    name="clickCostBW"
                    value={settings.clickCostBW}
                    onChange={handleChange}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* General Estimator Settings */}
            <div className="col-span-1 md:col-span-2">
              <h2 className="text-lg font-semibold text-white mb-4 border-b border-slate-700 pb-2">General Variables</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Labor Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="laborRate"
                    value={settings.laborRate}
                    onChange={handleChange}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Default Markup (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="markupPercent"
                    value={settings.markupPercent}
                    onChange={handleChange}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Spoilage Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="spoilagePercent"
                    value={settings.spoilagePercent}
                    onChange={handleChange}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
