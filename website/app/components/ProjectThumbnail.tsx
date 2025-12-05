'use client';

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export default function ProjectThumbnail({ url, aspectRatio, rtl }: { url: string, aspectRatio?: number, rtl?: boolean }) {
    const [pageWidth, setPageWidth] = useState(0);
    const [pageHeight, setPageHeight] = useState(0);

    if (!url) return <div className="w-full h-full bg-slate-700 flex items-center justify-center text-gray-500 text-xs">No Preview</div>;

    const isPdf = url.toLowerCase().includes('.pdf') || url.startsWith('blob:');

    if (!isPdf) {
        return <img src={url} alt="Preview" className="w-full h-full object-contain bg-black/20" />;
    }

    const onPageLoadSuccess = (page: any) => {
        const vp = page.getViewport({ scale: 1 });
        setPageWidth(vp.width);
        setPageHeight(vp.height);
    };

    // Spread Detection
    // If width > height * 1.2 (roughly), it's likely a spread.
    const isSpread = pageWidth > 0 && pageWidth > pageHeight * 1.2;

    // Style logic
    let containerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', overflow: 'hidden' };

    if (isSpread) {
        if (!rtl) {
             // LTR: Show Right Half (Cover).
             // Align Left, pull left half out.
             containerStyle.justifyContent = 'flex-start';
        } else {
             // RTL: Show Left Half (Cover).
             // Align Start. No margin needed.
             containerStyle.justifyContent = 'flex-start';
        }
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-slate-900" style={containerStyle}>
            {/* Wrapper for clipping if needed */}
            <div className={`relative ${isSpread ? 'w-[200%]' : 'w-full'} h-full flex ${!rtl && isSpread ? 'justify-start' : 'justify-center'}`} style={isSpread && !rtl ? { marginLeft: '-100%' } : {}}>
                 <div style={isSpread && !rtl ? { transform: 'translateX(-50%)' } : {}}>
                    <Document
                        file={url}
                        loading={<div className="w-full h-full bg-slate-800 animate-pulse"></div>}
                        error={<div className="text-xs text-red-400 p-2 text-center">Preview Error</div>}
                    >
                        <Page
                            pageNumber={1}
                            height={160} // Fit height of dashboard card
                            onLoadSuccess={onPageLoadSuccess}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            className={isSpread ? (rtl ? "" : "") : "mx-auto"}
                        />
                    </Document>
                 </div>
            </div>
        </div>
    );
}
