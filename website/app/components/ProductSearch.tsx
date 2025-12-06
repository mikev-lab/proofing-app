'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductData } from '../lib/medusa-products';

interface ProductSearchProps {
  products: ProductData[];
}

export default function ProductSearch({ products }: ProductSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filteredProducts = query === ''
    ? []
    : products.filter((product) =>
        product.name.toLowerCase().includes(query.toLowerCase())
      );

  const handleSelect = (slug: string) => {
    router.push(`/products/${slug}`);
  };

  return (
    <div className="relative max-w-lg mx-auto mt-8">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-lg leading-5 bg-slate-800 text-gray-300 placeholder-gray-400 focus:outline-none focus:bg-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm shadow-lg transition-colors"
          placeholder="Search for a product (e.g. Manga, Posters)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query !== '' && (
        <div className="absolute mt-1 w-full bg-slate-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm z-50 border border-slate-700">
          {filteredProducts.length === 0 ? (
             <div className="cursor-default select-none relative py-2 px-4 text-gray-400">
               No products found.
             </div>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-indigo-600 hover:text-white text-gray-300 transition-colors"
                onClick={() => handleSelect(product.slug)}
              >
                <div className="flex items-center">
                  <span className="font-normal truncate block">{product.name}</span>
                  <span className="ml-2 text-xs text-gray-500 group-hover:text-indigo-200 uppercase tracking-wide">{product.category}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
