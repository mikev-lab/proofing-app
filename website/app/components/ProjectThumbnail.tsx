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
    const isSpread = pageWidth > pageHeight * 1.2;

    // Style logic
    let containerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', overflow: 'hidden' };
    let pageStyle: React.CSSProperties = {}; // Additional styles for the canvas wrapper if needed

    if (isSpread) {
        // Crop to Cover Half
        // If LTR: Front cover is Right Half.
        // If RTL: Front cover is Left Half.

        // We want to shift the view so only the cover is visible.
        // Container is w-32 (128px).
        // If we render the page at height 160px (container height), width might be ~240px.
        // We want to show the Right 120px.
        // Margin Left = -120px.

        // Let's use CSS translation or Flexbox alignment.
        // Justify Content: Flex-End (Right) or Flex-Start (Left).
        // If LTR (Right Half): justify-content: flex-end?
        // No, `react-pdf` renders a canvas.
        // We can put it in a wrapper with `width: 50%` and `overflow: hidden`?
        // And scroll/position it?

        // Robust way:
        // Render at a height that fills the container.
        // Then negative margin.

        // Logic:
        // Render Height = 160 (Container Height).
        // Render Width = 160 * AspectRatio.
        // If Spread: Width is double.
        // We want to hide half.
        // LTR (Show Right): marginLeft = -50% of rendered width.
        // RTL (Show Left): marginLeft = 0.

        if (!rtl) {
             // LTR: Show Right.
             // Shift left by 50% of width.
             pageStyle = { transform: 'translateX(-25%)' };
             // Wait, if centered:
             // [ Left | Right ]
             // Center is spine.
             // We want Center to be at Left Edge of container? No.
             // We want Right Half to be in the center of container.
             // Transform: translateX(-25%) works if the spread is centered in a container 2x wider?

             // Let's rely on simple negative margin relative to the CANVAS width.
             // We can't know canvas width easily in CSS module without JS state.
             // But we can use `object-position` equivalent for Flex.

             // Simplest visual hack:
             // Clip half the page.
             // Use a wrapper `div` that is `width: 50%` of the canvas?
             // No, canvas is one element.

             // Correct way:
             // margin-left: -50% (of the canvas width).
             // Since we render `height={160}`, the width is determined.
             // React-PDF `Page` accepts `className`.

             pageStyle = { marginLeft: '-50%' }; // Pulls the left half off-screen?
             // If container is centered...
             // Let's use a wrapping div with `overflow: hidden` and specific alignment.

             containerStyle.justifyContent = 'flex-start'; // Align Left
             // If we align left, and set `marginLeft: -50%`...
             // The left half disappears. The right half moves to start.
             // Perfect for LTR cover (Right side).
        } else {
             // RTL: Show Left.
             // Justify Start. No margin needed.
             containerStyle.justifyContent = 'flex-start';
             // But we want to hide the right half?
             // Just restrict container width.
        }
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-white" style={containerStyle}>
            {/* Wrapper for clipping if needed */}
            <div className={`relative ${isSpread ? 'w-[200%]' : 'w-full'} h-full flex ${!rtl && isSpread ? 'justify-start' : 'justify-center'}`} style={isSpread && !rtl ? { marginLeft: '-100%' } : {}}>
                 {/*
                    Wait, CSS logic is tricky without explicit width.
                    Let's try a safer approach:
                    Render page with `height={160}`.
                    If spread (LTR), wrapper `left: -50%`.
                 */}
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
