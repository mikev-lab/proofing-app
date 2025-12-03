import React from 'react';
import Link from 'next/link';

export async function generateStaticParams() {
  return [
    { slug: 'pixel-print-converter' },
    { slug: 'paper-weight-converter' },
    { slug: 'typography-golden-ratio' },
    { slug: 'imposition-preview' },
    { slug: 'resolution-checker' },
    { slug: 'bleed-guide-generator' },
    { slug: 'bulk-price-estimator' },
    { slug: 'box-volume-calculator' },
    { slug: 'contrast-checker' },
  ];
}

export default async function ToolPlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="bg-slate-900 min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-white mb-4">{name}</h1>
            <p className="text-gray-400 mb-8">This tool is currently under development. Check back soon!</p>
            <Link href="/tools" className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors">
                Back to Tools
            </Link>
        </div>
      </div>
    </div>
  );
}
