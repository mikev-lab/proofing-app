'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

interface Event {
  id: string;
  name: string;
  slug: string;
  location: string;
  dates: {
    eventStart: string;
  };
  stats?: {
    attendees: string;
  };
  category?: string;
}

interface ConventionFinderProps {
  events: Event[];
}

export default function ConventionFinder({ events }: ConventionFinderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'name', 'attendees'

  const categories = useMemo(() => {
    const cats = new Set(events.map(e => e.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            event.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date') return new Date(a.dates.eventStart).getTime() - new Date(b.dates.eventStart).getTime();
      // Attendees sort is rough string parsing, maybe skip for now or do basic
      return 0;
    });
  }, [events, searchTerm, selectedCategory, sortBy]);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Find Your Event</h2>

        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <input
                type="text"
                placeholder="Search events or locations..."
                className="bg-slate-800 border border-slate-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
                className="bg-slate-800 border border-slate-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
            >
                <option value="all">All Categories</option>
                {categories.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c} className="capitalize">{c}</option>
                ))}
            </select>

            <select
                className="bg-slate-800 border border-slate-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
            >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
            </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEvents.map(event => (
            <Link key={event.id} href={`/conventions/event/${event.id}`} className="block bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500 rounded-lg p-5 transition-all">
                <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        event.category === 'anime' ? 'bg-pink-900 text-pink-200' :
                        event.category === 'furry' ? 'bg-orange-900 text-orange-200' :
                        event.category === 'comic' ? 'bg-blue-900 text-blue-200' :
                        'bg-gray-700 text-gray-300'
                    }`}>
                        {event.category || 'General'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                        {new Date(event.dates.eventStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1 truncate">{event.name}</h3>
                <p className="text-sm text-gray-400 mb-4 flex items-center">
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {event.location}
                </p>

                {event.stats && (
                    <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between text-xs text-gray-500">
                        <span>{event.stats.attendees} Attendees</span>
                        <span className="text-indigo-400 hover:underline">View Guide &rarr;</span>
                    </div>
                )}
            </Link>
        ))}
        {filteredEvents.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
                No events found matching your criteria.
            </div>
        )}
      </div>
    </div>
  );
}
