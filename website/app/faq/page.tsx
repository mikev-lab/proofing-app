import React from 'react';
import faqs from '../../data/faq.json';

export const metadata = {
  title: 'FAQ | MCE Printing',
  description: 'Frequently asked questions about shipping, file prep, and conventions.',
};

export default function FAQPage() {
  return (
    <div className="bg-slate-900 min-h-screen py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold text-white text-center mb-12">Frequently Asked Questions</h1>

        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-2">{faq.question}</h3>
              <p className="text-gray-300 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
            <p className="text-gray-400">Still have questions?</p>
            <a href="mailto:support@mceprinting.com" className="text-indigo-400 font-medium hover:text-indigo-300 mt-2 inline-block">Contact Support &rarr;</a>
        </div>
      </div>
    </div>
  );
}
