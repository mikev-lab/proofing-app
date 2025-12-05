'use client';

import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export default function ProjectThumbnail({ url }: { url: string }) {
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
                error={<div className="text-xs text-red-400 p-2 text-center">Preview Error</div>}
            >
                <Page
                    pageNumber={1}
                    width={300}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                />
            </Document>
        </div>
    );
}
