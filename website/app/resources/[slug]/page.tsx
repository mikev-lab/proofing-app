import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import resourcesData from '../../../data/resources.json';

// Define the shape of the resource data
interface ResourceData {
  title: string;
  description: string;
  category: string;
  content: string;
  relatedProducts: string[];
}

// Ensure the JSON import is treated as a typed record
const resources: Record<string, ResourceData> = resourcesData as Record<string, ResourceData>;

// Generate static params for export
export async function generateStaticParams() {
  return Object.keys(resources).map((slug) => ({
    slug: slug,
  }));
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = resources[slug];

  if (!data) {
    notFound();
  }

  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero Header */}
      <div className="bg-slate-800 border-b border-slate-700 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-emerald-900 text-emerald-300 mb-4">
                {data.category}
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">{data.title}</h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">{data.description}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Main Content */}
            <div className="lg:col-span-2">
                <article className="prose prose-invert prose-lg max-w-none text-gray-300">
                    <div dangerouslySetInnerHTML={{ __html: data.content }} />
                </article>

                <div className="mt-12 pt-8 border-t border-slate-700">
                    <Link href="/resources" className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center">
                        &larr; Back to all resources
                    </Link>
                </div>
            </div>

            {/* Sidebar / Related Products */}
            <div className="lg:col-span-1">
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 sticky top-24">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center">
                        <svg className="h-5 w-5 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        Related Products
                    </h3>
                    <div className="space-y-4">
                        {data.relatedProducts.map((prodSlug) => (
                            <Link href={`/products/${prodSlug}`} key={prodSlug} className="block group">
                                <div className="flex items-center p-3 rounded-lg hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-600">
                                    <div className="h-10 w-10 rounded bg-slate-600 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        IMG
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-white group-hover:text-indigo-300 capitalize">
                                            {prodSlug.replace(/-/g, ' ')}
                                        </p>
                                        <p className="text-xs text-gray-500">View Details</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-8 pt-6 border-t border-slate-700">
                        <Link href="/conventions" className="block w-full text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium transition-colors">
                            See Upcoming Deadlines
                        </Link>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}
