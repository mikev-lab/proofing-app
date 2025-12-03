import React from 'react';
import Link from 'next/link';
import resourcesData from '../../data/resources.json';

// Define the shape of the resource data
interface ResourceData {
  title: string;
  description: string;
  category: string;
  content: string;
  relatedProducts: string[];
}

const resources: Record<string, ResourceData> = resourcesData as Record<string, ResourceData>;

export default function ResourcesIndex() {
  const categories = Array.from(new Set(Object.values(resources).map(r => r.category)));

  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero Header */}
      <div className="bg-slate-800 border-b border-slate-700 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6">Print Resources & Guides</h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                Everything you need to know about file setup, paper stocks, and printing terminology to ensure your project looks perfect.
            </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Category Filters (Visual Only for now) */}
        <div className="flex flex-wrap justify-center gap-4 mb-16">
            {categories.map(cat => (
                <span key={cat} className="px-4 py-2 rounded-full bg-slate-800 border border-slate-700 text-gray-300 text-sm font-medium">
                    {cat}
                </span>
            ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Object.entries(resources).map(([slug, data]) => (
                <Link href={`/resources/${slug}`} key={slug} className="flex flex-col bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-900/20 transition-all duration-300 group">
                    <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded">
                                {data.category}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">
                            {data.title}
                        </h2>
                        <p className="text-gray-400 text-sm leading-relaxed mb-6 flex-1">
                            {data.description}
                        </p>
                        <div className="flex items-center text-indigo-400 font-medium text-sm mt-auto">
                            Read Guide <span className="ml-2 group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>

        {/* CTA Section */}
        <div className="mt-24 bg-indigo-900/20 rounded-2xl p-8 md:p-12 text-center border border-indigo-500/30">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Ready to start your project?</h2>
            <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
                Now that you know the basics, use our instant quote tools to see pricing and turnaround times.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/products" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-bold transition-colors">
                    Browse Products
                </Link>
                <Link href="/conventions" className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-bold transition-colors">
                    View Convention Deadlines
                </Link>
            </div>
        </div>

      </div>
    </div>
  );
}
