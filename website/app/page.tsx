import React from 'react';
import Link from 'next/link';
import ProductSearch from './components/ProductSearch';
import { getAllProducts } from './lib/medusa-products';

export default async function Home() {
  const products = await getAllProducts();

  return (
    <div className="bg-slate-900">

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-600 blur-3xl"></div>
            <div className="absolute top-1/2 left-0 w-72 h-72 rounded-full bg-purple-600 blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6">
            Printing for <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Creators</span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-300">
            Professional quality books, manga, and art prints. Built for Artist Alley, convention vendors, and independent authors.
          </p>

          {/* Product Search Widget */}
          <div className="mt-8 max-w-xl mx-auto text-left">
              <label className="block text-sm font-medium text-gray-400 mb-2 text-center">Find your product instantly:</label>
              <ProductSearch />
          </div>

          <div className="mt-10 flex justify-center gap-4">
            <Link href="/products" className="px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg transition-all shadow-lg shadow-indigo-500/30">
              Browse Catalog
            </Link>
            <Link href="/conventions" className="px-8 py-3 border border-slate-600 text-base font-medium rounded-md text-gray-300 bg-slate-800 hover:bg-slate-700 md:py-4 md:text-lg transition-all">
              Convention Guide
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products Grid */}
      <section className="py-20 bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold text-white">Popular Products</h2>
                  <p className="text-gray-400 mt-2">Everything you need for your next table.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {products.slice(0, 4).map(product => (
                      <Link key={product.id} href={`/products/${product.slug}`} className="group block bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500 transition-all">
                          <div className="h-40 bg-slate-800 flex items-center justify-center relative overflow-hidden">
                              {/* Placeholder for Product Image */}
                              <span className="text-slate-600 text-4xl group-hover:scale-110 transition-transform duration-500">
                                  {/* Icon based on category? Simplified for now */}
                                  📚
                              </span>
                          </div>
                          <div className="p-4">
                              <h3 className="text-lg font-bold text-white group-hover:text-indigo-400">{product.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{product.category}</p>
                          </div>
                      </Link>
                  ))}
              </div>
          </div>
      </section>

      {/* Tools Teaser */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="lg:flex lg:items-center lg:justify-between">
             <div className="lg:w-1/2">
                <h2 className="text-3xl font-bold text-white mb-6">Plan Your Project with Confidence</h2>
                <p className="text-gray-400 text-lg mb-8">
                  Don't guess on spine widths or bleed settings. Use our free suite of professional printing calculators and tools to get your files print-ready before you even order.
                </p>
                <Link href="/tools" className="text-indigo-400 font-semibold hover:text-indigo-300 flex items-center">
                  Explore all tools <span className="ml-2">&rarr;</span>
                </Link>
             </div>
             <div className="mt-10 lg:mt-0 lg:w-1/2 lg:pl-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-indigo-500/50 transition-colors">
                    <div className="h-10 w-10 bg-indigo-900/50 rounded-lg flex items-center justify-center mb-4 text-indigo-400">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                       </svg>
                    </div>
                    <h4 className="text-white font-bold">Spine Calculator</h4>
                    <p className="text-sm text-gray-400 mt-2">Calculate exact spine width based on page count and paper stock.</p>
                  </div>
                   <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 hover:border-indigo-500/50 transition-colors">
                    <div className="h-10 w-10 bg-indigo-900/50 rounded-lg flex items-center justify-center mb-4 text-indigo-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h4 className="text-white font-bold">Pixel Converter</h4>
                    <p className="text-sm text-gray-400 mt-2">Check if your image resolution is high enough for print.</p>
                  </div>
                </div>
             </div>
           </div>
        </div>
      </section>
    </div>
  );
}
