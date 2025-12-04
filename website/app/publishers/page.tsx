import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Indie Publishers Partnership | MCE Printing',
  description: 'Printing solutions for indie publishers. Bulk discounts, fulfillment support, and premium book quality.',
};

export default function PublisherPartnerPage() {
  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-32 bg-indigo-900/20">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">For Indie Publishers</span>
            <h1 className="mt-4 text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">
               Scale Your Publishing House
            </h1>
            <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
               Switch to a printer that understands indie. We offer premium quality, reliable timelines, and partnership perks designed to help you grow.
            </p>
            <div className="mt-10">
               <a href="mailto:publishers@mceprinting.com" className="inline-block bg-white text-indigo-900 font-bold py-3 px-8 rounded-md hover:bg-gray-100 transition-colors">
                  Apply for Publisher Account
               </a>
            </div>
         </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-slate-900">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
               <div>
                  <div className="h-12 w-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-6">
                     <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Volume Tier Pricing</h3>
                  <p className="text-gray-400">
                     Access our lowest rates. Whether you are printing 100 copies or 10,000, our tier-based system ensures your margins stay healthy as you scale.
                  </p>
               </div>
               <div>
                  <div className="h-12 w-12 bg-pink-600 rounded-lg flex items-center justify-center mb-6">
                     <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Consistent Quality</h3>
                  <p className="text-gray-400">
                     Maintain your brand standard. We use color calibration technology to ensuring your Volume 1 matches Volume 10, regardless of when it was printed.
                  </p>
               </div>
               <div>
                  <div className="h-12 w-12 bg-purple-600 rounded-lg flex items-center justify-center mb-6">
                     <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Fulfillment Solutions</h3>
                  <p className="text-gray-400">
                     Need to ship to Kickstarter backers or distributors? We offer split shipping, kitting, and direct fulfillment options to streamline your logistics.
                  </p>
               </div>
            </div>
         </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-800">
         <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-white">Join other successful indie presses.</h2>
            <div className="mt-8 flex justify-center gap-4">
                <Link href="/products" className="text-gray-300 hover:text-white font-medium px-6 py-3 border border-slate-600 rounded-md">
                    Explore Catalog
                </Link>
                <a href="mailto:publishers@mceprinting.com" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-md shadow-lg">
                    Contact Sales
                </a>
            </div>
         </div>
      </section>
    </div>
  );
}
