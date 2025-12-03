import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Crowdfunding Fulfillment & Printing | MCE Printing',
  description: 'Complete printing and fulfillment solutions for Kickstarter, Indiegogo, and BackerKit campaigns.',
};

export default function CrowdfundingPage() {
  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero */}
      <section className="relative py-20 bg-indigo-900/20 border-b border-indigo-500/10">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="text-green-400 font-bold tracking-wide uppercase text-sm mb-4 block">Kickstarter & Crowdfunding Support</span>
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6">
               Funded? Now let's ship.
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
               You handled the campaign, let us handle the rest. We provide end-to-end printing and direct-to-customer fulfillment for successful crowdfunding projects.
            </p>
         </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 bg-slate-900">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-6">More than just a printer.</h2>
                    <div className="space-y-8">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                </div>
                            </div>
                            <div className="ml-4">
                                <h3 className="text-lg leading-6 font-medium text-white">Bulk Printing</h3>
                                <p className="mt-2 text-base text-gray-400">
                                    We print your books, comics, and merch at scale. From 100 to 100,000 units, we ensure consistent quality for every backer.
                                </p>
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-shrink-0">
                                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="ml-4">
                                <h3 className="text-lg leading-6 font-medium text-white">Kitting & Add-ons</h3>
                                <p className="mt-2 text-base text-gray-400">
                                    Have stretch goals? We can bundle your book with stickers, bookmarks, and prints into a single package.
                                </p>
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-shrink-0">
                                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="ml-4">
                                <h3 className="text-lg leading-6 font-medium text-white">Direct-to-Backer Fulfillment</h3>
                                <p className="mt-2 text-base text-gray-400">
                                    Skip the garage full of boxes. We ship directly to your customers worldwide using discounted postage rates.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 p-8 rounded-xl border border-slate-700">
                    <h3 className="text-2xl font-bold text-white mb-4">Get a Fulfillment Quote</h3>
                    <p className="text-gray-400 mb-6">
                        Tell us about your campaign. We'll build a custom package for print and shipping.
                    </p>
                    <form className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Campaign Name</label>
                            <input type="text" className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500" placeholder="My Awesome Graphic Novel" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Estimated Backers</label>
                            <input type="number" className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500" placeholder="500" />
                        </div>
                        <button type="button" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-md transition-colors">
                            Request Quote
                        </button>
                        <p className="text-xs text-gray-500 text-center pt-2">
                            This is a demo form. For real inquiries, please email sales@mceprinting.com.
                        </p>
                    </form>
                </div>
            </div>
         </div>
      </section>

      {/* Platforms */}
      <section className="py-16 bg-slate-950 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 text-center">
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase mb-8">Supported Platforms</h3>
              <div className="flex justify-center gap-12 grayscale opacity-50">
                  <span className="text-2xl font-bold text-white">Kickstarter</span>
                  <span className="text-2xl font-bold text-white">Indiegogo</span>
                  <span className="text-2xl font-bold text-white">BackerKit</span>
                  <span className="text-2xl font-bold text-white">Patreon</span>
              </div>
          </div>
      </section>
    </div>
  );
}
