import React from 'react';
import Link from 'next/link';
import { getAllProducts, ProductData } from '../lib/medusa-products';

// Helper to group products by category
const groupProducts = (productList: ProductData[]) => {
  const grouped: Record<string, ProductData[]> = {};
  productList.forEach(p => {
    if (!grouped[p.category]) {
      grouped[p.category] = [];
    }
    grouped[p.category].push(p);
  });
  return grouped;
};

export default async function ProductsIndex() {
  const products = await getAllProducts();
  const grouped = groupProducts(products);
  const categories = Object.keys(grouped).sort();

  return (
    <>
      {/* Hero Section */}
      <section className="bg-slate-900 py-16 sm:py-20 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            Our Products
          </h1>
          <p className="mt-4 text-xl text-gray-400 max-w-2xl mx-auto">
            Professional printing solutions tailored for creators. From manga and art books to posters and marketing materials.
          </p>
        </div>
      </section>

      {/* Product Grid Grouped by Category */}
      <div className="bg-slate-950 min-h-screen py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">

          {categories.map((category) => (
            <section key={category}>
               <h2 className="text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-indigo-600">
                 {category}
               </h2>
               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {grouped[category].map((product) => (
                    <Link
                      key={product.id}
                      href={`/products/${product.slug}`}
                      className="group bg-slate-900 rounded-lg border border-slate-800 hover:border-indigo-500 hover:bg-slate-800/80 transition-all overflow-hidden flex flex-col"
                    >
                      <div className="aspect-w-16 aspect-h-9 bg-slate-800 relative">
                         {/* Placeholder for image */}
                         <div className="absolute inset-0 flex items-center justify-center text-slate-700 group-hover:text-indigo-900/30 transition-colors">
                            <svg className="h-12 w-12" fill="currentColor" viewBox="0 0 24 24">
                               <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                         </div>
                      </div>
                      <div className="p-4 flex-grow flex flex-col justify-between">
                         <div>
                            <h3 className="text-sm md:text-base font-bold text-white group-hover:text-indigo-400 line-clamp-2 mb-1">
                               {product.name}
                            </h3>
                            <p className="text-xs text-gray-500 line-clamp-2">
                               {product.shortDescription}
                            </p>
                         </div>
                         <div className="mt-3 flex items-center text-xs text-indigo-400 font-medium">
                            View Specs <span className="ml-1">&rarr;</span>
                         </div>
                      </div>
                    </Link>
                  ))}
               </div>
            </section>
          ))}

        </div>
      </div>
    </>
  );
}
