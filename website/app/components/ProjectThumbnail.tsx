'use client';

import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function ProjectThumbnail({ url }: { url: string }) {
    // DEBUG: Log the URL being attempted
    React.useEffect(() => {
        if (url) console.log(`[Thumbnail] Attempting to load: ${url}`);
        else console.warn("[Thumbnail] No URL provided");
    }, [url]);

    if (!url) return <div className="w-full h-full bg-slate-700 flex items-center justify-center text-gray-500 text-xs">No Preview</div>;

    const isPdf = url.toLowerCase().includes('.pdf') || url.startsWith('blob:');

    if (!isPdf) {
        return <img src={url} alt="Preview" className="w-full h-full object-cover" />;
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-white flex items-center justify-center">
            <Document
                file={url}
                loading={<div className="w-full h-full bg-slate-800 animate-pulse"></div>}
                onLoadError={(error) => {
                    console.error("[Thumbnail] PDF Load Error:", error);
                    console.error("[Thumbnail] Error Details:", { message: error.message, name: error.name });
                }}
                error={<div className="text-xs text-red-400 p-2 text-center">Preview Error (Check Console)</div>}
            >
                <Page
                    pageNumber={1}
                    width={300}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadError={(error) => console.error("[Thumbnail] Page Load Error:", error)}
                />
            </Document>
        </div>
    );
}
