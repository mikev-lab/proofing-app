import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import conventionsData from '../../../data/conventions.json';

// Define the shape of the convention data
interface ConventionData {
  title: string;
  slug: string;
  heroHeadline: string;
  heroSubhead: string;
  description: string;
  popularProducts: string[];
  tips: string[];
}

// Ensure the JSON import is treated as a typed record
const conventions: Record<string, ConventionData> = conventionsData as Record<string, ConventionData>;

// Generate static params for export
export async function generateStaticParams() {
  return Object.keys(conventions).map((slug) => ({
    slug: slug,
  }));
}

export default async function ConventionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = conventions[slug];

  if (!data) {
    notFound();
  }

  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero Header */}
      <div className="bg-slate-800 border-b border-slate-700 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-indigo-900 text-indigo-300 mb-4">
                Convention Guide
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">{data.heroHeadline}</h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">{data.heroSubhead}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Main Content */}
            <div className="lg:col-span-2 space-y-12">
                <section>
                    <h2 className="text-2xl font-bold text-white mb-4">Overview</h2>
                    <p className="text-gray-400 leading-relaxed text-lg">
                        {data.description}
                    </p>
                </section>

                <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center">
                        <svg className="h-6 w-6 text-indigo-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        Direct-to-Hotel Shipping
                    </h3>
                    <p className="text-gray-300 mb-4">
                        Travel light! We can ship your books and prints directly to your hotel or convention center pickup location. Just select "Ship to Convention" at checkout and provide the hotel details.
                    </p>
                    <div className="text-sm text-gray-400 bg-slate-900 p-3 rounded border border-slate-800">
                        <strong>Note:</strong> Be sure to check with your hotel about their package holding policies and fees before ordering.
                    </div>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mb-6">Essential Products for {data.title}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {data.popularProducts.map((prodSlug) => (
                            <Link href={`/products/${prodSlug}`} key={prodSlug} className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-indigo-500 hover:bg-slate-750 transition-all">
                                <h3 className="text-lg font-semibold text-white capitalize">{prodSlug.replace(/-/g, ' ')}</h3>
                                <p className="text-sm text-gray-400 mt-2">View specs & pricing &rarr;</p>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>

            {/* Sidebar / Tips */}
            <div className="lg:col-span-1">
                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-6 sticky top-24">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pro Tips
                    </h3>
                    <ul className="space-y-4">
                        {data.tips.map((tip, idx) => (
                            <li key={idx} className="flex items-start">
                                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold mr-3 mt-0.5">{idx + 1}</span>
                                <p className="text-gray-300 text-sm">{tip}</p>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-8 pt-6 border-t border-indigo-500/30">
                        <Link href="/tools" className="block w-full text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium transition-colors">
                            Check Specs with Tools
                        </Link>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}
