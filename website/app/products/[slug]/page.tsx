import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import productsData from '../../../data/products.json';
import conventionsData from '../../../data/conventions.json';
import AddToCartButton from '../../components/AddToCartButton';

const conventions: Record<string, any> = conventionsData;

interface ProductData {
    id: string;
    name: string;
    slug: string;
    category: string;
    shortDescription: string;
    description: string;
    features: string[];
    specs: {
        minPages?: number;
        maxPages?: number;
        paperStocks?: string[];
        sizes?: string[];
    };
    relevantConventions: string[];
}

const products: ProductData[] = productsData as ProductData[];

export async function generateStaticParams() {
  return products.map((product) => ({
    slug: product.slug,
  }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((p) => p.slug === slug);

  if (!product) {
    notFound();
  }

  return (
    <div className="bg-slate-900 min-h-screen pb-20">
      {/* Breadcrumb */}
      <div className="bg-slate-800 border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <nav className="flex text-sm font-medium text-gray-400">
                  <Link href="/" className="hover:text-white">Home</Link>
                  <span className="mx-2">/</span>
                  <span className="text-white">{product.name}</span>
              </nav>
          </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 lg:items-start">
            {/* Left: Image Placeholder & Features */}
            <div>
                <div className="aspect-w-3 aspect-h-2 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 mb-8 flex items-center justify-center">
                    <span className="text-slate-600 text-lg">Product Image Placeholder</span>
                </div>

                <h3 className="text-xl font-bold text-white mb-4">Key Features</h3>
                <ul className="space-y-3">
                    {product.features.map((feature, i) => (
                        <li key={i} className="flex items-center text-gray-300">
                            <svg className="h-5 w-5 text-green-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {feature}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Right: Info & Actions */}
            <div className="mt-10 lg:mt-0">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">{product.name}</h1>
                <div className="mt-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-900 text-indigo-200 capitalize">
                        {product.category}
                    </span>
                </div>

                <div className="mt-6">
                    <h3 className="sr-only">Description</h3>
                    <p className="text-base text-gray-300 leading-relaxed">{product.description}</p>
                </div>

                <div className="mt-8 border-t border-slate-700 pt-8">
                    <h3 className="text-lg font-medium text-white mb-4">Specifications</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        {product.specs.minPages && product.specs.maxPages && (
                            <div>
                                <dt className="text-sm font-medium text-gray-400">Page Count Range</dt>
                                <dd className="mt-1 text-sm text-white">{product.specs.minPages} - {product.specs.maxPages} pages</dd>
                            </div>
                        )}
                        {product.specs.sizes && (
                             <div>
                                <dt className="text-sm font-medium text-gray-400">Available Sizes</dt>
                                <dd className="mt-1 text-sm text-white">{product.specs.sizes.join(", ")}</dd>
                            </div>
                        )}
                        {product.specs.paperStocks && (
                            <div className="sm:col-span-2">
                                 <dt className="text-sm font-medium text-gray-400">Paper Stocks</dt>
                                 <dd className="mt-1 text-sm text-white">{product.specs.paperStocks.join(", ")}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                <div className="mt-10 flex flex-col gap-4">
                    {/* Flow B: Add to Cart (Mock) */}
                    <div className="bg-slate-800 p-4 rounded border border-slate-700">
                        <p className="text-sm text-gray-400 mb-2">Ready to order? Add a deposit to cart.</p>
                        <AddToCartButton productName={product.name} />
                    </div>

                    <div className="flex gap-4">
                        <a href="/legacy-portal/index.html" className="flex-1 bg-slate-700 border border-transparent rounded-md py-3 px-8 flex items-center justify-center text-base font-medium text-white hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-slate-500">
                            Custom Quote
                        </a>
                        <Link href="/tools" className="flex-1 bg-slate-700 border border-transparent rounded-md py-3 px-8 flex items-center justify-center text-base font-medium text-white hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-slate-500">
                            Check Specs
                        </Link>
                    </div>
                </div>

                {product.relevantConventions && product.relevantConventions.length > 0 && (
                    <div className="mt-12 border-t border-slate-700 pt-8">
                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Popular for these events</h4>
                        <div className="flex flex-wrap gap-3">
                            {product.relevantConventions.map(conSlug => {
                                const con = conventions[conSlug];
                                if (!con) return null;
                                return (
                                    <Link key={conSlug} href={`/conventions/${conSlug}`} className="inline-flex items-center px-3 py-1.5 rounded-full border border-slate-600 bg-slate-800 text-sm font-medium text-gray-300 hover:bg-slate-700 hover:text-white hover:border-indigo-500 transition-colors">
                                        {con.title}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
