'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { functions, httpsCallable } from '../firebase/config';

interface ProductData {
    id: string;
    name: string;
    slug: string;
    category: string;
    type?: string;
    specs: {
        minPages?: number;
        maxPages?: number;
        paperStocks?: string[];
        sizes?: string[];
    };
}

interface InstantQuoteProps {
    product: ProductData;
    onQuoteGenerated?: (price: number) => void;
}

export default function InstantQuote({ product }: InstantQuoteProps) {
    const { addItem } = useStore();

    // Determine the builder mode based on product type
    const productType = product.type || 'print_builder';
    const isBookBuilder = productType === 'book_builder';

    // Legacy Category Flags (still useful for Merch vs Print logic if type is generic)
    const isMerch = product.category === 'Merch';

    // State
    const [quantity, setQuantity] = useState<number>(100);
    const [size, setSize] = useState<string>(product.specs.sizes?.[0] || '5.5 x 8.5');

    // Book Builder Specifics
    const [pageCount, setPageCount] = useState<number>(product.specs.minPages || 32);
    const [interiorPaper, setInteriorPaper] = useState<string>(product.specs.paperStocks?.[0] || '80lb Gloss Text');
    const [coverPaper, setCoverPaper] = useState<string>('100lb Gloss Cover');
    const [lamination, setLamination] = useState<string>('Gloss');
    const [bindingType, setBindingType] = useState<string>(product.name.includes('Saddle') ? 'Saddle Stitch' : 'Perfect Bound');

    // Print Builder Specifics
    const [paperStock, setPaperStock] = useState<string>(product.specs.paperStocks?.[0] || '100lb Gloss Text');

    const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cover Stock Options (Hardcoded for now as they aren't in specs yet)
    const COVER_STOCKS = [
        "100lb Gloss Cover",
        "100lb Matte Cover",
        "12pt C1S"
    ];

    // Lamination Options
    const LAMINATIONS = [
        "Gloss",
        "Matte",
        "Soft Touch"
    ];

    // Debounce calculation
    useEffect(() => {
        const timer = setTimeout(() => {
            calculatePrice();
        }, 500);
        return () => clearTimeout(timer);
    }, [quantity, size, pageCount, interiorPaper, coverPaper, lamination, bindingType, paperStock, isBookBuilder]);

    const calculatePrice = async () => {
        setIsCalculating(true);
        setError(null);
        try {
            const calculateEstimate = httpsCallable(functions, 'estimators_calculateEstimate');

            // Map frontend state to backend expected structure
            // Backend expects: { items: [...], bindingType: ..., quantity: ... }
            // Item structure: { type: 'Interior', pages: ..., ... }

            // Note: This is a simplified mapping. Real logic might need more robust dimension parsing.
            // Using logic similar to admin_estimator.js

            // Resolve dimensions from string (e.g. "5.5 x 8.5")
            let width = 5.5;
            let height = 8.5;
            if (size.includes('x')) {
                const parts = size.split('x').map(s => parseFloat(s.trim()));
                if (parts.length === 2) {
                    width = parts[0];
                    height = parts[1];
                }
            } else if (size === 'A4') { width = 8.27; height = 11.69; }
            else if (size === 'A5') { width = 5.83; height = 8.27; }

            const items = [];

            if (isBookBuilder) {
                // Book Logic: Interior + Cover
                items.push({
                    type: 'Interior',
                    pages: pageCount,
                    stockName: interiorPaper,
                    colorType: 'Color',
                    doubleSided: true
                });
                items.push({
                    type: 'Cover',
                    pages: 4,
                    stockName: coverPaper,
                    colorType: 'Color',
                    doubleSided: false,
                    finish: lamination
                });
            } else {
                // Flat Item Logic (Prints, Posters)
                items.push({
                    type: 'Flat',
                    pages: 2, // Front/Back assumed for flat prints
                    stockName: paperStock,
                    colorType: 'Color',
                    doubleSided: true
                });
            }

            const requestData = {
                quantity: quantity,
                bindingType: isBookBuilder ? bindingType : 'None',
                finishedWidth: width,
                finishedHeight: height,
                items: items
            };

            const result = await calculateEstimate(requestData);
            const data = result.data as any;

            if (data.totalPrice) {
                setEstimatedPrice(data.totalPrice);
            } else {
                // Fallback for mock/error
                console.warn("No price returned, using fallback");
                setEstimatedPrice(null);
            }
        } catch (err) {
            console.error("Estimate error:", err);
            // Fallback for demo if backend not reachable
            // Rough calculation: $0.10 per page * pages * qty + $2 * qty
            const rough = (0.05 * pageCount * quantity) + (2 * quantity);
            setEstimatedPrice(rough);
            setError("Live quote unavailable (using offline estimate)");
        } finally {
            setIsCalculating(false);
        }
    };

    const handleStartProject = () => {
        // Placeholder functionality as requested
        alert("Builder coming soon! This will launch the project setup wizard.");
    };

    return (
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Instant Quote
            </h3>

            <div className="space-y-4">
                {/* Quantity */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Quantity</label>
                    <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                        min="1"
                    />
                </div>

                {/* Size - Common to both */}
                {!isMerch && (
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Size</label>
                        <select
                            value={size}
                            onChange={(e) => setSize(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            {product.specs.sizes?.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}

                {/* BOOK BUILDER CONTROLS */}
                {isBookBuilder && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Page Count</label>
                            <input
                                type="number"
                                value={pageCount}
                                onChange={(e) => setPageCount(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                                min={product.specs.minPages || 8}
                                max={product.specs.maxPages || 600}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Interior Paper</label>
                            <select
                                value={interiorPaper}
                                onChange={(e) => setInteriorPaper(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                            >
                                {product.specs.paperStocks?.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Cover Paper</label>
                            <select
                                value={coverPaper}
                                onChange={(e) => setCoverPaper(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                            >
                                {COVER_STOCKS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Lamination</label>
                            <select
                                value={lamination}
                                onChange={(e) => setLamination(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                            >
                                {LAMINATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </>
                )}

                {/* PRINT BUILDER CONTROLS */}
                {!isBookBuilder && !isMerch && (
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Paper Stock</label>
                        <select
                            value={paperStock}
                            onChange={(e) => setPaperStock(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            {product.specs.paperStocks?.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Price Display */}
            <div className="mt-6 pt-6 border-t border-slate-700">
                <div className="flex justify-between items-end mb-4">
                    <span className="text-gray-400 text-sm">Estimated Total</span>
                    <div className="text-right">
                        {isCalculating ? (
                            <span className="text-gray-500 text-sm animate-pulse">Calculating...</span>
                        ) : (
                            <>
                                <span className="text-3xl font-bold text-green-400 block">
                                    ${estimatedPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {estimatedPrice && (
                                    <span className="text-xs text-gray-500">
                                        ${(estimatedPrice / quantity).toFixed(2)} / unit
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {error && <p className="text-xs text-yellow-500 mb-4">{error}</p>}

                <div className="grid grid-cols-1 gap-3">
                    <button
                        onClick={handleStartProject}
                        disabled={isCalculating || !estimatedPrice}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex items-center justify-center w-full"
                    >
                        Start Your Project
                    </button>
                </div>
            </div>
        </div>
    );
}
