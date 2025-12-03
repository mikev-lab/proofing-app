import React from 'react';
import Link from 'next/link';
import products from '../../data/products.json';

export default function ProductsIndex() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-slate-900 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            Our Products
          </h1>
          <p className="mt-4 text-xl text-gray-400 max-w-2xl mx-auto">
            Professional printing solutions tailored for creators. From manga and art books to posters and marketing materials.
          </p>
        </div>
      </section>

      {/* Product Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <div key={product.id} className="bg-slate-900 rounded-lg border border-slate-800 hover:border-indigo-500/50 transition-colors overflow-hidden group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-900/50 text-indigo-200">
                    {product.category}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                  {product.name}
                </h3>
                <p className="text-gray-400 text-sm mb-6 line-clamp-3">
                  {product.shortDescription}
                </p>

                <div className="space-y-3 mb-6">
                  {product.features.slice(0, 3).map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-300">
                      <svg className="h-4 w-4 text-indigo-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </div>
                  ))}
                </div>

                <Link
                  href={`/products/${product.slug}`}
                  className="block w-full text-center bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
