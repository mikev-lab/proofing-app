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
            <div className="mt-6 flex items-start space-x-2">
                 <svg className="h-5 w-5 text-indigo-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                 </svg>
                 <div className="text-sm text-gray-400">
                    <p className="font-semibold text-white">Free Local Pickup</p>
                    <p>Available at our Washington facility.</p>
                 </div>
            </div>
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
              <li><Link href="/conventions" className="text-base text-gray-400 hover:text-white transition-colors">Convention Guide</Link></li>
              <li><Link href="/conventions/partner" className="text-base text-gray-400 hover:text-white transition-colors">Partner Program</Link></li>
              <li><Link href="/faq" className="text-base text-gray-400 hover:text-white transition-colors">FAQ</Link></li>
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
