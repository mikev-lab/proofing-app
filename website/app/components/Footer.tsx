import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-700/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <span className="text-xl font-bold text-white tracking-tight">MCE Printing</span>
            <p className="mt-4 text-gray-400 text-sm max-w-xs">
              Specialized printing services for creators, artists, and authors.
              High-quality books, posters, and convention essentials.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200 tracking-wider uppercase">Products</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="/products/perfect-bound-books" className="text-base text-gray-400 hover:text-white transition-colors">Books & Manga</Link></li>
              <li><Link href="/products/art-prints" className="text-base text-gray-400 hover:text-white transition-colors">Posters & Prints</Link></li>
              <li><Link href="/products" className="text-base text-gray-400 hover:text-white transition-colors">Marketing Materials</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200 tracking-wider uppercase">Resources</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="/tools" className="text-base text-gray-400 hover:text-white transition-colors">Tools & Calculators</Link></li>
              <li><Link href="/conventions/general" className="text-base text-gray-400 hover:text-white transition-colors">Convention Guide</Link></li>
              <li><a href="/legacy-portal/index.html" className="text-base text-gray-400 hover:text-white transition-colors">Customer Portal</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-700/50 pt-8 flex items-center justify-between">
          <p className="text-base text-gray-500">&copy; {new Date().getFullYear()} MCE Printing. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
