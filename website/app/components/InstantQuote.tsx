'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { functions, httpsCallable } from '../firebase/config';

interface ProductData {
    id: string;
    name: string;
    slug: string;
    category: string;
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
    const [pageCount, setPageCount] = useState<number>(32);
    const [quantity, setQuantity] = useState<number>(100);
    const [paperType, setPaperType] = useState<string>(product.specs.paperStocks?.[0] || '80lb Gloss Text');
    const [size, setSize] = useState<string>(product.specs.sizes?.[0] || '5.5 x 8.5');
    const [bindingType, setBindingType] = useState<string>('Perfect Bound'); // Default, or derive from product category

    const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounce calculation
    useEffect(() => {
        const timer = setTimeout(() => {
            calculatePrice();
        }, 500);
        return () => clearTimeout(timer);
    }, [pageCount, quantity, paperType, size, bindingType]);

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

            const requestData = {
                quantity: quantity,
                bindingType: product.category === 'Books' ? (product.slug.includes('saddle') ? 'Saddle Stitch' : 'Perfect Bound') : 'None', // infer
                finishedWidth: width,
                finishedHeight: height,
                items: [
                    {
                        type: 'Interior',
                        pages: pageCount,
                        stockName: paperType,
                        colorType: 'Color', // Defaulting to Color
                        doubleSided: true
                    },
                    {
                        type: 'Cover',
                        pages: 4,
                        stockName: '100lb Gloss Cover', // Default cover
                        colorType: 'Color',
                        doubleSided: false, // Single sided outer
                        finish: 'Gloss'
                    }
                ]
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

    const handleAddToCart = () => {
        if (estimatedPrice === null) return;

        addItem({
            title: product.name,
            quantity: 1, // 1 "Project" of X copies
            unit_price: Math.round(estimatedPrice * 100), // cents
            metadata: {
                specs: `${quantity} copies, ${pageCount} pages, ${size}, ${paperType}`,
                quantity_ordered: quantity,
                is_custom_quote: true
            },
            variant: {
                title: `${quantity} Copies`
            }
        });
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

                {/* Page Count (Only for books) */}
                {product.category === 'Books' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Page Count</label>
                        <input
                            type="number"
                            value={pageCount}
                            onChange={(e) => setPageCount(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                            min="8"
                        />
                    </div>
                )}

                {/* Size */}
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

                {/* Paper */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Paper Stock</label>
                    <select
                        value={paperType}
                        onChange={(e) => setPaperType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                    >
                        {product.specs.paperStocks?.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
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

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={handleAddToCart}
                        disabled={isCalculating || !estimatedPrice}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex items-center justify-center"
                    >
                        Add to Cart
                    </button>
                    <button
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors"
                    >
                        Start Building
                    </button>
                </div>
            </div>
        </div>
    );
}
