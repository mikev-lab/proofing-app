'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

interface PdfThumbnailProps {
  tempPreviewPath: string;
}

const PdfThumbnail: React.FC<PdfThumbnailProps> = ({ tempPreviewPath }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderPdf = async () => {
      if (!tempPreviewPath) return;

      setLoading(true);
      setError(null);

      try {
        const storage = getStorage();
        const pdfRef = ref(storage, tempPreviewPath);
        const url = await getDownloadURL(pdfRef);

        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1); // Get the first page

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const desiredWidth = 150; // Thumbnail width
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };
        await page.render(renderContext as any).promise;
        setLoading(false);
      } catch (err) {
        console.error("Error rendering PDF thumbnail:", err);
        setError("Could not load preview.");
        setLoading(false);
      }
    };

    renderPdf();
  }, [tempPreviewPath]);

  return (
    <div className="pdf-thumbnail-container" style={{ width: 150, height: 200, border: '1px solid #ccc', position: 'relative' }}>
      {loading && <div style={{ textAlign: 'center', paddingTop: '80px' }}>Loading...</div>}
      <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />
      {error && <div style={{ textAlign: 'center', paddingTop: '80px', color: 'red' }}>{error}</div>}
    </div>
  );
};

export default PdfThumbnail;
