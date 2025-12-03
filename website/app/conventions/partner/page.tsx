import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Partner with MCE | Convention Organizers',
  description: 'Exclusive shipping and printing benefits for convention organizers and their attendees.',
};

export default function ConventionPartnerPage() {
  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-32 bg-indigo-900/20">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">For Event Organizers</span>
            <h1 className="mt-4 text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">
               Partner with MCE Printing
            </h1>
            <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
               Enhance your Artist Alley experience. We offer direct-to-convention shipping, exclusive attendee discounts, and dedicated support for your event.
            </p>
            <div className="mt-10">
               <a href="mailto:partners@mceprinting.com" className="inline-block bg-white text-indigo-900 font-bold py-3 px-8 rounded-md hover:bg-gray-100 transition-colors">
                  Contact Our Partnership Team
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Direct Shipping Logistics</h3>
                  <p className="text-gray-400">
                     We handle the heavy lifting. We work with your logistics team to palletize and deliver artist inventory directly to the convention hall, saving your attendees from carrying heavy boxes.
                  </p>
               </div>
               <div>
                  <div className="h-12 w-12 bg-pink-600 rounded-lg flex items-center justify-center mb-6">
                     <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Exclusive Discounts</h3>
                  <p className="text-gray-400">
                     Offer value to your vendors. We provide custom promo codes for your approved artists and dealers, making their setup costs lower.
                  </p>
               </div>
               <div>
                  <div className="h-12 w-12 bg-purple-600 rounded-lg flex items-center justify-center mb-6">
                     <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Dedicated Support</h3>
                  <p className="text-gray-400">
                     A dedicated account manager for your event to ensure all shipments arrive on time and any last-minute printing needs (programs, signage) are met.
                  </p>
               </div>
            </div>
         </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-800">
         <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-white">Ready to upgrade your Artist Alley?</h2>
            <div className="mt-8 flex justify-center gap-4">
                <Link href="/conventions" className="text-gray-300 hover:text-white font-medium px-6 py-3 border border-slate-600 rounded-md">
                    View Supported Events
                </Link>
                <a href="mailto:partners@mceprinting.com" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-md shadow-lg">
                    Get in Touch
                </a>
            </div>
         </div>
      </section>
    </div>
  );
}
