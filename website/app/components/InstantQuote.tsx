'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { functions, httpsCallable, db } from '../firebase/config';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc } from 'firebase/firestore';

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
        // Sizes are now managed via Firestore
    };
}

interface InstantQuoteProps {
    product: ProductData;
    onQuoteGenerated?: (price: number) => void;
}

interface PaperStock {
    id: string;
    name: string;
    type: string;
    finish: string;
}

interface PaperSize {
    id: string;
    name: string;
    width: number;
    height: number;
    unit: string;
}

export default function InstantQuote({ product }: InstantQuoteProps) {
    const { addItem } = useStore();

    // Determine the builder mode
    const productType = product.type || 'print_builder';
    const isBookBuilder = productType === 'book_builder';
    const isSaddleStitch = productType === 'saddle_stitch_builder';
    const isLargeFormat = productType === 'large_format_builder';
    const isMerch = product.category === 'Merch';

    // --- State: Data from Firestore ---
    const [availablePapers, setAvailablePapers] = useState<PaperStock[]>([]);
    const [allSizes, setAllSizes] = useState<PaperSize[]>([]); // All definitions
    const [allowedSizeIds, setAllowedSizeIds] = useState<string[]>([]); // Ordered IDs for this product
    const [loadingData, setLoadingData] = useState(true);

    // --- State: User Selections ---
    const [quantity, setQuantity] = useState<number>(100);

    // Dimensions
    const [selectedSizeName, setSelectedSizeName] = useState<string>('');
    const [customWidth, setCustomWidth] = useState<number>(8.5);
    const [customHeight, setCustomHeight] = useState<number>(11);
    const [isCustomSize, setIsCustomSize] = useState(false);
    const [customUnit, setCustomUnit] = useState<'in' | 'mm'>('in');

    // Books / Saddle Stitch
    const [pageCount, setPageCount] = useState<number>(product.specs.minPages || (isSaddleStitch ? 8 : 32));
    const [bindingType, setBindingType] = useState<string>('Perfect Bound');
    const [lamination, setLamination] = useState<string>('None');

    // Paper Selections
    const [interiorPaper, setInteriorPaper] = useState<PaperStock | null>(null);
    const [coverPaper, setCoverPaper] = useState<PaperStock | null>(null);
    const [paperStock, setPaperStock] = useState<PaperStock | null>(null);

    // Saddle Stitch Specific
    const [hasSeparateCover, setHasSeparateCover] = useState(false);

    // Calculation State
    const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const LAMINATIONS = ["None", "Gloss", "Matte"];

    // --- 1. Fetch Data ---
    useEffect(() => {
        let unsubscribeSizes: () => void;
        let unsubscribeProductRules: () => void;

        const fetchData = async () => {
            setLoadingData(true);
            try {
                // A. Fetch All Paper Size Definitions
                const sizesQuery = query(collection(db, 'settings', 'paper_sizes', 'items'), orderBy('name'));
                unsubscribeSizes = onSnapshot(sizesQuery, (snapshot) => {
                    const sizes = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PaperSize[];
                    setAllSizes(sizes);
                });

                // B. Fetch Product Specific Rules (Strict Mode)
                if (product.id) {
                    const productRef = doc(db, 'settings', 'product_sizes', 'items', product.id);
                    unsubscribeProductRules = onSnapshot(productRef, (docSnap) => {
                         if (docSnap.exists()) {
                             const data = docSnap.data();
                             setAllowedSizeIds(data.allowedSizeIds || []);
                         } else {
                             // Strict Mode: If no doc exists, NO sizes are allowed (except custom)
                             setAllowedSizeIds([]);
                         }
                    });
                }

                // C. Fetch Inventory
                const getPublicPaperList = httpsCallable(functions, 'estimators_getPublicPaperList');
                const result = await getPublicPaperList();
                const allPapers = (result.data as any).papers || [];

                const papers: PaperStock[] = [];
                allPapers.forEach((p: any) => {
                    const builders = p.availableForBuilders || [];
                    if (builders.includes(productType)) {
                        papers.push({
                            id: p.sku,
                            name: p.name,
                            type: p.type,
                            finish: p.finish
                        });
                    }
                });

                setAvailablePapers(papers);

                // Default Papers
                if (papers.length > 0) {
                    setInteriorPaper(papers[0]);
                    setPaperStock(papers[0]);
                    const cover = papers.find(p => p.type === 'Cover' || p.name.includes('Cover')) || papers[0];
                    setCoverPaper(cover);
                }

            } catch (err) {
                console.error("Failed to load estimator data", err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchData();

        if (isBookBuilder) setBindingType('Perfect Bound');
        if (isSaddleStitch) setBindingType('Saddle Stitch');

        return () => {
            if (unsubscribeSizes) unsubscribeSizes();
            if (unsubscribeProductRules) unsubscribeProductRules();
        };
    }, [productType, product.id]);


    // --- Derived State: Filtered & Sorted Sizes ---
    const filteredSizes = useMemo(() => {
        // Map allowed IDs to actual size objects, preserving order of allowedSizeIds
        const result: PaperSize[] = [];

        allowedSizeIds.forEach(id => {
            const found = allSizes.find(s => s.id === id);
            if (found) result.push(found);
        });

        return result;
    }, [allSizes, allowedSizeIds]);

    // --- Set Default Size ---
    useEffect(() => {
        if (!loadingData && filteredSizes.length > 0 && !selectedSizeName) {
            // Select the first recommended size
            const first = filteredSizes[0];
            setSelectedSizeName(first.name);
            setCustomWidth(first.width);
            setCustomHeight(first.height);
            setIsCustomSize(false);
        } else if (!loadingData && filteredSizes.length === 0 && !isCustomSize) {
             // If no sizes allowed, force custom
             setSelectedSizeName('Custom');
             setIsCustomSize(true);
        }
    }, [filteredSizes, loadingData, selectedSizeName, isCustomSize]);


    // --- 2. Handle Size Selection ---
    const handleSizeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'Custom') {
            setIsCustomSize(true);
            setSelectedSizeName('Custom');
        } else {
            const sizeObj = filteredSizes.find(s => s.name === val);
            if (sizeObj) {
                setSelectedSizeName(sizeObj.name);
                setCustomWidth(sizeObj.width);
                setCustomHeight(sizeObj.height);
                setIsCustomSize(false);
            }
        }
    };

    // --- 3. Trigger Calculation ---
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!loadingData) calculatePrice();
        }, 500);
        return () => clearTimeout(timer);
    }, [
        quantity, customWidth, customHeight, pageCount,
        interiorPaper, coverPaper, paperStock,
        lamination, bindingType, hasSeparateCover,
        loadingData, customUnit
    ]);

    const calculatePrice = async () => {
        if (loadingData) return;
        setIsCalculating(true);
        setError(null);

        try {
            const calculateEstimate = httpsCallable(functions, 'estimators_calculateEstimate');

            const items = [];

            if (isBookBuilder) {
                items.push({
                    type: 'Interior',
                    pages: pageCount,
                    stockName: interiorPaper?.name || 'Unknown',
                    colorType: 'Color',
                    doubleSided: true
                });
                items.push({
                    type: 'Cover',
                    pages: 4,
                    stockName: coverPaper?.name || 'Unknown',
                    colorType: 'Color',
                    doubleSided: false,
                    finish: lamination !== 'None' ? lamination : undefined
                });
            } else if (isSaddleStitch) {
                if (hasSeparateCover) {
                    items.push({
                        type: 'Interior',
                        pages: pageCount,
                        stockName: interiorPaper?.name || 'Unknown',
                        colorType: 'Color',
                        doubleSided: true
                    });
                    items.push({
                        type: 'Cover',
                        pages: 4,
                        stockName: coverPaper?.name || 'Unknown',
                        colorType: 'Color',
                        doubleSided: false,
                        finish: lamination !== 'None' ? lamination : undefined
                    });
                } else {
                    items.push({
                        type: 'Interior',
                        pages: pageCount,
                        stockName: interiorPaper?.name || 'Unknown',
                        colorType: 'Color',
                        doubleSided: true
                    });
                }
            } else {
                items.push({
                    type: 'Flat',
                    pages: 2,
                    stockName: paperStock?.name || 'Unknown',
                    colorType: 'Color',
                    doubleSided: true
                });
            }

            let finalWidth = customWidth;
            let finalHeight = customHeight;

            if (isCustomSize && customUnit === 'mm') {
                finalWidth = customWidth / 25.4;
                finalHeight = customHeight / 25.4;
            }

            const requestData = {
                quantity: quantity,
                bindingType: (isBookBuilder || isSaddleStitch) ? bindingType : 'None',
                finishedWidth: finalWidth,
                finishedHeight: finalHeight,
                items: items,
                laminationType: lamination.toLowerCase()
            };

            const result = await calculateEstimate(requestData);
            const data = result.data as any;

            if (data.totalPrice) {
                setEstimatedPrice(data.totalPrice);
            } else {
                setEstimatedPrice(null);
            }
        } catch (err) {
            console.error("Estimate error:", err);
            const rough = (0.05 * pageCount * quantity) + (2 * quantity);
            setEstimatedPrice(rough);
            setError("Live quote unavailable (offline mode)");
        } finally {
            setIsCalculating(false);
        }
    };

    const handleStartProject = () => {
        alert("Builder coming soon!");
    };

    const handlePageCountChange = (val: number) => {
        let step = 2;
        if (isSaddleStitch) step = 4;
        const remainder = val % step;
        if (remainder !== 0) {
            val = val + (step - remainder);
        }
        setPageCount(val);
    };

    return (
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
             <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Instant Quote
            </h3>

            <div className="space-y-6">

                {/* 1. Quantity */}
                <div>
                    <label className="block text-sm font-bold text-gray-300 mb-2">Quantity</label>
                    <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-3 text-white focus:ring-2 focus:ring-indigo-500 font-medium text-lg"
                        min="1"
                    />
                </div>

                {/* 2. Trim Size */}
                {!isMerch && (
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">Trim Size</label>

                        <select
                            value={selectedSizeName}
                            onChange={handleSizeSelect}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-3 text-white focus:ring-2 focus:ring-indigo-500 font-medium mb-3"
                        >
                            {/* Only show allowed sizes */}
                            {filteredSizes.map(size => (
                                <option key={size.id} value={size.name}>
                                    {size.name} ({size.width}" x {size.height}")
                                </option>
                            ))}
                            <option value="Custom">Custom Size</option>
                        </select>

                        {isCustomSize && (
                            <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Dimensions</span>
                                    <div className="flex bg-slate-800 rounded p-1 border border-slate-600">
                                        <button
                                            onClick={() => {
                                                if (customUnit !== 'in') {
                                                    setCustomUnit('in');
                                                    setCustomWidth(w => parseFloat((w / 25.4).toFixed(3)));
                                                    setCustomHeight(h => parseFloat((h / 25.4).toFixed(3)));
                                                }
                                            }}
                                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${customUnit === 'in' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            IN
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (customUnit !== 'mm') {
                                                    setCustomUnit('mm');
                                                    setCustomWidth(w => parseFloat((w * 25.4).toFixed(1)));
                                                    setCustomHeight(h => parseFloat((h * 25.4).toFixed(1)));
                                                }
                                            }}
                                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${customUnit === 'mm' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            MM
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Width</label>
                                        <input
                                            type="number" step="0.125"
                                            value={customWidth}
                                            onChange={e => setCustomWidth(parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Height</label>
                                        <input
                                            type="number" step="0.125"
                                            value={customHeight}
                                            onChange={e => setCustomHeight(parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-medium"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. Page Count */}
                {(isBookBuilder || isSaddleStitch) && (
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">Page Count</label>
                        <input
                            type="number"
                            value={pageCount}
                            onChange={(e) => handlePageCountChange(Number(e.target.value))}
                            step={isSaddleStitch ? 4 : 2}
                            min={isSaddleStitch ? 8 : 4}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-3 text-white focus:ring-2 focus:ring-indigo-500 font-medium"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Must be a multiple of {isSaddleStitch ? '4' : '2'}.
                        </p>
                    </div>
                )}

                {/* 4. Binding Style */}
                {(isBookBuilder || isSaddleStitch) && (
                    <div>
                         <label className="block text-sm font-bold text-gray-300 mb-2">Binding</label>
                         <div className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-gray-400 text-sm cursor-not-allowed opacity-75">
                             {bindingType}
                         </div>
                    </div>
                )}

                {/* 5. Paper Selection - FLAT */}
                {(!isBookBuilder && !isSaddleStitch) && (
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">Paper Stock</label>
                        <div className="grid grid-cols-1 gap-2">
                            {availablePapers.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setPaperStock(p)}
                                    className={`px-4 py-3 rounded text-left text-sm font-medium transition-colors border flex justify-between items-center ${
                                        paperStock?.id === p.id
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-slate-900 border-slate-600 text-gray-300 hover:bg-slate-700'
                                    }`}
                                >
                                    <span>{p.name}</span>
                                    <span className="text-xs opacity-75 uppercase bg-black/20 px-2 py-1 rounded">{p.finish}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 6. Paper Selection - BOOK / SADDLE */}
                {(isBookBuilder || isSaddleStitch) && (
                    <div className="space-y-4">
                        <div>
                             <label className="block text-sm font-bold text-gray-300 mb-2">Interior Paper</label>
                             <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {availablePapers.filter(p => !p.name.includes("Cover")).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setInteriorPaper(p)}
                                        className={`px-4 py-3 rounded text-left text-sm font-medium transition-colors border flex justify-between items-center ${
                                            interiorPaper?.id === p.id
                                            ? 'bg-indigo-600 border-indigo-500 text-white'
                                            : 'bg-slate-900 border-slate-600 text-gray-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>{p.name}</span>
                                        <span className="text-xs opacity-75 uppercase bg-black/20 px-2 py-1 rounded">{p.finish}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isSaddleStitch && (
                            <div className="flex items-center space-x-3 bg-slate-900/50 p-3 rounded border border-slate-700">
                                <label className="text-sm font-medium text-gray-300">Add separate cover stock?</label>
                                <button
                                    onClick={() => setHasSeparateCover(!hasSeparateCover)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        hasSeparateCover ? 'bg-indigo-600' : 'bg-slate-700'
                                    }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        hasSeparateCover ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                                </button>
                            </div>
                        )}

                        {(isBookBuilder || (isSaddleStitch && hasSeparateCover)) && (
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-2">Cover Paper</label>
                                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                    {availablePapers.filter(p => p.name.includes("Cover") || p.type === "Cover").map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCoverPaper(p)}
                                            className={`px-4 py-3 rounded text-left text-sm font-medium transition-colors border flex justify-between items-center ${
                                                coverPaper?.id === p.id
                                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                                : 'bg-slate-900 border-slate-600 text-gray-300 hover:bg-slate-700'
                                            }`}
                                        >
                                            <span>{p.name}</span>
                                            <span className="text-xs opacity-75 uppercase bg-black/20 px-2 py-1 rounded">{p.finish}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Cover Lamination</label>
                            <div className="flex gap-2">
                                {LAMINATIONS.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setLamination(opt)}
                                        className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                                            lamination === opt
                                            ? 'bg-indigo-600 border-indigo-500 text-white'
                                            : 'bg-slate-900 border-slate-600 text-gray-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-700">
                <div className="flex justify-between items-end mb-4">
                    <span className="text-gray-400 text-sm">Estimated Total</span>
                    <div className="text-right">
                        {isCalculating ? (
                            <span className="text-gray-500 text-sm animate-pulse">Calculating...</span>
                        ) : (
                            <>
                                <span className="text-4xl font-bold text-green-400 block">
                                    ${estimatedPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {estimatedPrice && (
                                    <span className="text-sm text-gray-500">
                                        ${(estimatedPrice / quantity).toFixed(2)} per unit
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {error && <p className="text-sm text-yellow-500 mb-4 bg-yellow-900/20 p-2 rounded border border-yellow-700/50">{error}</p>}

                <button
                    onClick={handleStartProject}
                    disabled={isCalculating || !estimatedPrice}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg shadow-lg transition-all flex items-center justify-center text-lg"
                >
                    Start Project
                </button>
            </div>
        </div>
    );
}
