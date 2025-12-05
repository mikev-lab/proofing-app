'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { httpsCallable, functions } from '../firebase/config';
import { useStore } from '../context/StoreContext';

interface PlaceOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
}

export default function PlaceOrderModal({ isOpen, onClose, project }: PlaceOrderModalProps) {
    const { addItem } = useStore();
    const [quantity, setQuantity] = useState(project.specs?.quantity || 100);
    const [tiers, setTiers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addingToCart, setAddingToCart] = useState(false);
    const [currentPrice, setCurrentPrice] = useState<any>(null);

    // Fetch dynamic pricing
    useEffect(() => {
        if (!isOpen || !project) return;

        const fetchPricing = async () => {
            setLoading(true);
            try {
                const calculateEstimate = httpsCallable(functions, 'estimators_calculateEstimate');

                // Base details from project specs
                const baseDetails = {
                    ...project.specs,
                    // Ensure required fields are present
                    quantity: quantity,
                    calculateShipping: false // Speed up calculation
                };

                // Define Tiers: Current, +50, +100, +500
                const tierQuantities = [quantity, quantity + 50, quantity + 100, quantity + 500];
                const promises = tierQuantities.map(q =>
                    calculateEstimate({ ...baseDetails, quantity: q })
                );

                const results = await Promise.all(promises);

                const tierData = results.map((res: any, idx) => ({
                    quantity: tierQuantities[idx],
                    pricePerUnit: res.data.pricePerUnit,
                    totalPrice: res.data.totalPrice
                }));

                setTiers(tierData);
                setCurrentPrice(tierData[0]);

            } catch (err) {
                console.error("Pricing fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        const debounce = setTimeout(fetchPricing, 500);
        return () => clearTimeout(debounce);
    }, [quantity, isOpen, project]);

    const handleAddToCart = async () => {
        setAddingToCart(true);
        // Add to Medusa Cart via Context
        // Note: Ideally we create a custom Line Item with metadata.
        // For now, we simulate adding a product.
        // In a real app, this would call 'medusa.carts.lineItems.create' with variant_id and metadata.

        // Mock add for UI feedback
        setTimeout(() => {
            // addItem({ ... }); // Context needs implementation for custom items
            alert("Added to cart! (Mock)");
            setAddingToCart(false);
            onClose();
        }, 1000);
    };

    if (!isOpen) return null;

    // Resolve preview image
    const coverUrl = project.cover?.previewURL || project.versions?.[0]?.previewURL;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl w-full max-w-4xl border border-slate-700 shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[90vh]">

                {/* Left: Preview */}
                <div className="w-full md:w-1/3 bg-slate-900 p-6 flex items-center justify-center border-r border-slate-700 relative">
                    {coverUrl ? (
                        // Using standard img tag for external signed URLs if domain not configured in next.config
                        <img
                            src={coverUrl}
                            alt="Project Preview"
                            className="max-w-full max-h-64 object-contain shadow-lg rounded"
                        />
                    ) : (
                        <div className="text-gray-500 text-sm">No Preview Available</div>
                    )}
                    <div className="absolute top-4 left-4">
                        <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded shadow">
                            {project.projectName}
                        </span>
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="w-full md:w-2/3 p-6 flex flex-col overflow-y-auto">
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-2xl font-bold text-white">Order Details</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Specs Summary */}
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-300 mb-6 bg-slate-900/50 p-4 rounded-lg">
                        <div>
                            <span className="block text-gray-500 text-xs uppercase">Dimensions</span>
                            {project.specs?.dimensions ? `${project.specs.dimensions.width}x${project.specs.dimensions.height}` : '-'}
                        </div>
                        <div>
                            <span className="block text-gray-500 text-xs uppercase">Binding</span>
                            {project.specs?.binding || '-'}
                        </div>
                        <div>
                            <span className="block text-gray-500 text-xs uppercase">Paper</span>
                            {project.specs?.paperType || '-'}
                        </div>
                        <div>
                            <span className="block text-gray-500 text-xs uppercase">Cover</span>
                            {project.specs?.coverPaperType || '-'}
                        </div>
                    </div>

                    {/* Quantity Selector */}
                    <div className="mb-8">
                        <label className="block text-sm font-medium text-white mb-2">Quantity</label>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center border border-slate-600 rounded-lg bg-slate-900">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 10))}
                                    className="px-3 py-2 text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >-</button>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                    className="w-20 bg-transparent text-center text-white focus:outline-none py-2"
                                />
                                <button
                                    onClick={() => setQuantity(quantity + 10)}
                                    className="px-3 py-2 text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >+</button>
                            </div>
                            <div className="text-right flex-1">
                                {loading ? (
                                    <div className="h-8 w-24 bg-slate-700 rounded animate-pulse ml-auto"></div>
                                ) : (
                                    <>
                                        <div className="text-2xl font-bold text-white">${currentPrice?.totalPrice?.toFixed(2)}</div>
                                        <div className="text-xs text-gray-400">${currentPrice?.pricePerUnit?.toFixed(2)} / unit</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Volume Discounts Table */}
                    <div className="mb-8 flex-1">
                        <h4 className="text-sm font-bold text-indigo-400 mb-3 uppercase tracking-wide">Volume Savings</h4>
                        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-800 text-gray-400 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2">Quantity</th>
                                        <th className="px-4 py-2">Price Each</th>
                                        <th className="px-4 py-2 text-right">Savings</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {loading ? (
                                        [1,2,3].map(i => (
                                            <tr key={i}>
                                                <td colSpan={3} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded animate-pulse"></div></td>
                                            </tr>
                                        ))
                                    ) : (
                                        tiers.map((tier, idx) => {
                                            if (idx === 0) return null; // Skip current
                                            const saving = currentPrice.pricePerUnit - tier.pricePerUnit;
                                            return (
                                                <tr key={idx} className="hover:bg-slate-800/50 cursor-pointer group" onClick={() => setQuantity(tier.quantity)}>
                                                    <td className="px-4 py-3 text-white font-medium group-hover:text-indigo-300">
                                                        {tier.quantity} <span className="text-xs text-gray-500 ml-1">(+{tier.quantity - quantity})</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-300">${tier.pricePerUnit.toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-right text-green-400 font-medium">
                                                        -${saving.toFixed(2)} ea
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <button
                        onClick={handleAddToCart}
                        disabled={addingToCart || loading}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {addingToCart ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                </svg>
                                Add to Order - ${currentPrice?.totalPrice?.toFixed(2) || '0.00'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
