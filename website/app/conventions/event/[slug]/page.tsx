import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import eventsData from '../../../../data/events.json';
import ConventionTimeline from '../../../components/ConventionTimeline';

// Ensure typed import
const events: Array<{
  id: string;
  name: string;
  slug: string;
  location: string;
  dates: any;
  stats?: {
      attendees: string;
      artistAlley: string;
      website: string;
  };
  description?: string;
  category?: string;
}> = eventsData;

// Generate params for static export
export async function generateStaticParams() {
  return events.map((event) => ({
    slug: event.id, // Using 'id' as the slug for the URL (e.g. anime-expo-2025)
  }));
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = events.find(e => e.id === slug);

  if (!event) {
    notFound();
  }

  // Determine "Convention Type" based on slug/name for category link (simple heuristic)
  let categorySlug = 'general';
  if (event.slug.includes('anime') || event.slug.includes('sakura') || event.slug.includes('comiket')) categorySlug = 'anime';
  else if (event.slug.includes('comic')) categorySlug = 'comic';
  else if (event.slug.includes('anthro') || event.slug.includes('furry')) categorySlug = 'furry';

  return (
    <div className="bg-slate-900 min-h-screen">

      {/* Event Hero */}
      <section className="relative py-20 bg-slate-800 border-b border-slate-700">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm mb-4 block">Printing Guide for</span>
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6">
               {event.name} Printing
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
               The ultimate guide to production deadlines, shipping dates, and products for {event.name} in {event.location}.
            </p>
            {event.description && (
                <p className="mt-4 text-gray-400 max-w-3xl mx-auto italic border-l-4 border-indigo-500 pl-4 bg-slate-800/50 py-2 rounded-r">
                    "{event.description}"
                </p>
            )}
         </div>
      </section>

      {/* Event Stats Grid */}
      {event.stats && (
          <section className="py-10 bg-slate-900 border-b border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 text-center">
                        <div className="text-indigo-400 font-bold uppercase text-xs tracking-wider mb-2">Last Year's Attendance</div>
                        <div className="text-3xl font-extrabold text-white">{event.stats.attendees}</div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 text-center">
                        <div className="text-indigo-400 font-bold uppercase text-xs tracking-wider mb-2">Artist Alley Vibe</div>
                        <div className="text-xl font-bold text-white">{event.stats.artistAlley}</div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 text-center flex flex-col justify-center">
                        <div className="text-indigo-400 font-bold uppercase text-xs tracking-wider mb-2">Official Website</div>
                        <a href={`https://${event.stats.website}`} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-white hover:text-indigo-400 hover:underline">
                            {event.stats.website} &rarr;
                        </a>
                    </div>
                </div>
            </div>
          </section>
      )}

      {/* Widget Section (Reused but contextualized) */}
      <section className="py-12 bg-slate-950">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Note: The ConventionTimeline component is currently client-side stateful.
                  For a static page, we might ideally pass props to pre-select this event.
                  However, based on the current implementation of ConventionTimeline.tsx,
                  it doesn't accept props.

                  Strategy: We will render the timeline widget as is (it allows finding ANY convention),
                  BUT below it we will render a static, SEO-friendly summary of THIS event's dates.
              */}
              {/* Event Timeline */}
              <div className="mb-12">
                   <h2 className="text-2xl font-bold text-white mb-6 text-center">Important Deadlines</h2>
                   <ConventionTimeline eventId={event.id} />
              </div>
          </div>
      </section>

      {/* Recommended Products */}
      <section className="py-16 bg-slate-900">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             <h2 className="text-3xl font-bold text-white mb-8 text-center">Top Products for this Event</h2>
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                 {/* Hardcoded recommendations based on generic types, since events.json doesn't store products yet */}
                 <Link href="/products/perfect-bound-books" className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-indigo-500 transition-all">
                      <h3 className="text-xl font-bold text-white">Books & Manga</h3>
                      <p className="text-gray-400 text-sm mt-2">The standard for Artist Alley tables.</p>
                 </Link>
                 <Link href="/products/art-prints" className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-indigo-500 transition-all">
                      <h3 className="text-xl font-bold text-white">Art Prints</h3>
                      <p className="text-gray-400 text-sm mt-2">High quality stock for your artwork.</p>
                 </Link>
                 <Link href="/products/business-cards" className="block p-6 bg-slate-800 rounded-lg border border-slate-700 hover:border-indigo-500 transition-all">
                      <h3 className="text-xl font-bold text-white">Business Cards</h3>
                      <p className="text-gray-400 text-sm mt-2">Networking essentials.</p>
                 </Link>
             </div>

             <div className="mt-12 text-center">
                 <Link href={`/conventions/${categorySlug}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                    View full {categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1)} Convention Guide &rarr;
                 </Link>
             </div>
         </div>
      </section>

    </div>
  );
}
