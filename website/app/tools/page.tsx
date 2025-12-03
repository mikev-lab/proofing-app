import React from 'react';
import Link from 'next/link';

const tools = [
  { slug: 'book-spine-calculator', name: 'Book Spine Calculator', desc: 'Calculate exact spine width for softcover books.' },
  { slug: 'pixel-print-converter', name: 'Pixel to Print Converter', desc: 'Check if your image is large enough for 300dpi print.' },
  { slug: 'paper-weight-converter', name: 'Paper Weight Converter', desc: 'Convert GSM to lb (Text & Cover).' },
  { slug: 'typography-golden-ratio', name: 'Typography Calculator', desc: 'Find the perfect font sizes using the golden ratio.' },
  { slug: 'imposition-preview', name: 'Imposition Previewer', desc: 'Visualize how pages are laid out on a sheet.' },
  { slug: 'resolution-checker', name: 'Resolution Checker', desc: 'Upload an image to check its print quality.' },
  { slug: 'bleed-guide-generator', name: 'Bleed Guide Generator', desc: 'Download custom templates with bleed lines.' },
  { slug: 'bulk-price-estimator', name: 'Bulk Price Estimator', desc: 'See how volume affects unit cost.' },
  { slug: 'box-volume-calculator', name: 'Shipping Box Calculator', desc: 'Estimate shipping weight and volume.' },
  { slug: 'contrast-checker', name: 'Print Contrast Checker', desc: 'Ensure your text is readable in print.' },
];

export default function ToolsIndex() {
  return (
    <div className="bg-slate-900 min-h-screen pb-20">
      <div className="bg-slate-800 border-b border-slate-700 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-extrabold text-white mb-4">Print Production Tools</h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Free utilities to help you prepare your files, calculate costs, and plan your production run.
            </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
                <Link key={tool.slug} href={`/tools/${tool.slug}`} className="block bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 transition-all">
                    <h3 className="text-xl font-bold text-white mb-2">{tool.name}</h3>
                    <p className="text-gray-400 mb-4">{tool.desc}</p>
                    <span className="text-indigo-400 text-sm font-medium flex items-center">
                        Launch Tool &rarr;
                    </span>
                </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
