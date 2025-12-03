import React from 'react';
import ConventionTimeline from '../components/ConventionTimeline';
import Link from 'next/link';

export const metadata = {
  title: 'Convention Printing Guide | MCE Printing',
  description: 'Find production timelines and shipping deadlines for your next convention.',
};

export default function ConventionsIndex() {
  return (
    <div className="bg-slate-900 min-h-screen">

      {/* Hero */}
      <section className="bg-slate-900 py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl">Convention Printing Guide</h1>
          <p className="mt-4 text-xl text-gray-400 max-w-2xl mx-auto">
            Never miss a deadline. Check our production schedules for major events and ensure your inventory arrives on time.
          </p>
          <div className="mt-8">
            <Link href="/conventions/partner" className="text-indigo-400 font-medium hover:text-indigo-300">
              Are you an event organizer? Partner with us &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Widget Section */}
      <section className="py-12 bg-slate-950">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <ConventionTimeline />
          </div>
      </section>

      {/* Convention Types Grid */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Browse by Category</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Anime Conventions', slug: 'anime', color: 'from-pink-500 to-rose-500' },
              { name: 'Furry Conventions', slug: 'furry', color: 'from-orange-500 to-amber-500' },
              { name: 'Comic Cons', slug: 'comic', color: 'from-blue-500 to-cyan-500' },
              { name: 'General Events', slug: 'general', color: 'from-slate-500 to-gray-500' },
            ].map((con) => (
              <Link key={con.slug} href={`/conventions/${con.slug}`} className="group relative block overflow-hidden rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-all duration-300">
                <div className={`h-2 bg-gradient-to-r ${con.color}`}></div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{con.name}</h3>
                  <p className="mt-2 text-sm text-gray-400">Tailored printing solutions and guides.</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
