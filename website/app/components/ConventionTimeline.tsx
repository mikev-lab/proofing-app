'use client';

import React, { useState } from 'react';
import events from '../../data/events.json';

interface EventData {
  id: string;
  name: string;
  location: string;
  dates: {
    eventStart: string;
    shipping: string;
    filesNeeded: string;
    orderBy: string;
  };
  capacity: number;
}

export default function ConventionTimeline() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) : null;

  const filteredEvents = searchQuery === ''
    ? events
    : events.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Helper to calculate position on timeline (0-100%)
  // Simple linear mapping: Start Date (Order By - 10 days) -> End Date (Event Start + 2 days)
  const getTimelineStyle = (dateStr: string, startRange: number, totalDuration: number) => {
    if (!selectedEvent) return { left: '0%' };
    const date = new Date(dateStr).getTime();
    const percent = ((date - startRange) / totalDuration) * 100;
    return { left: `${Math.max(0, Math.min(100, percent))}%` };
  };

  let timelineStart = 0;
  let timelineEnd = 0;
  let totalDuration = 1;

  if (selectedEvent) {
    const orderBy = new Date(selectedEvent.dates.orderBy).getTime();
    const eventStart = new Date(selectedEvent.dates.eventStart).getTime();
    // Add buffers
    timelineStart = orderBy - (10 * 24 * 60 * 60 * 1000); // 10 days before
    timelineEnd = eventStart + (2 * 24 * 60 * 60 * 1000); // 2 days after
    totalDuration = timelineEnd - timelineStart;
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-6 md:p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white">Find Your Convention</h2>
          <p className="text-gray-400 mt-2">See production deadlines and capacity for your next event.</p>
        </div>

        {/* Search / Select */}
        <div className="max-w-md mx-auto mb-8 relative">
           <input
            type="text"
            className="block w-full px-4 py-3 border border-slate-600 rounded-lg bg-slate-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="Type your convention (e.g. Anime Expo)..."
            value={searchQuery}
            onChange={(e) => {
                setSearchQuery(e.target.value);
                if(selectedEventId) setSelectedEventId(null); // Reset selection on search
            }}
          />
          {/* Autocomplete list */}
          {(searchQuery !== '' && !selectedEvent) && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
              {filteredEvents.map(event => (
                <div
                  key={event.id}
                  className="px-4 py-3 hover:bg-slate-700 cursor-pointer flex justify-between items-center"
                  onClick={() => {
                    setSelectedEventId(event.id);
                    setSearchQuery(event.name);
                  }}
                >
                    <span className="text-gray-200 font-medium">{event.name}</span>
                    <span className="text-xs text-gray-500">{event.location}</span>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                  <div className="px-4 py-3 text-gray-500">No events found.</div>
              )}
            </div>
          )}
        </div>

        {/* Visualization Area */}
        <div className="min-h-[300px] transition-all duration-500">
           {!selectedEvent ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50 pointer-events-none filter blur-[1px]">
                {/* Placeholder Calendar View (Visual Only) */}
                {events.slice(0, 3).map(e => (
                    <div key={e.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <div className="h-4 w-24 bg-slate-700 rounded mb-2"></div>
                        <div className="h-3 w-16 bg-slate-700 rounded"></div>
                    </div>
                ))}
             </div>
           ) : (
             <div className="animate-in fade-in zoom-in duration-300">
                {/* Event Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-slate-800/50 p-6 rounded-lg border border-slate-700/50">
                    <div>
                        <h3 className="text-2xl font-bold text-white">{selectedEvent.name}</h3>
                        <p className="text-indigo-400">{selectedEvent.location} &bull; {new Date(selectedEvent.dates.eventStart).toLocaleDateString()}</p>
                    </div>
                    <div className="mt-4 md:mt-0 text-right">
                        <p className="text-sm text-gray-400 uppercase tracking-wider">Current Capacity</p>
                        <div className="flex items-center justify-end mt-1">
                            <div className="w-32 h-3 bg-slate-700 rounded-full overflow-hidden mr-3">
                                <div className="h-full bg-indigo-500" style={{ width: `${selectedEvent.capacity}%`}}></div>
                            </div>
                            <span className="text-white font-bold">{selectedEvent.capacity}%</span>
                        </div>
                    </div>
                </div>

                {/* Timeline Graph */}
                <div className="relative pt-12 pb-24 px-4">
                   {/* Main Line */}
                   <div className="absolute top-16 left-0 w-full h-1 bg-slate-700 rounded"></div>

                   {/* Markers */}
                    {[
                        { label: 'Order By', date: selectedEvent.dates.orderBy, color: 'bg-yellow-500', text: 'text-yellow-500' },
                        { label: 'Files Needed', date: selectedEvent.dates.filesNeeded, color: 'bg-orange-500', text: 'text-orange-500' },
                        { label: 'Ships By', date: selectedEvent.dates.shipping, color: 'bg-green-500', text: 'text-green-500' },
                        { label: 'Event Start', date: selectedEvent.dates.eventStart, color: 'bg-indigo-500', text: 'text-indigo-500' },
                    ].map((point, idx) => (
                        <div
                            key={idx}
                            className="absolute top-16 transform -translate-x-1/2 flex flex-col items-center group"
                            style={getTimelineStyle(point.date, timelineStart, totalDuration)}
                        >
                            <div className={`w-4 h-4 rounded-full ${point.color} ring-4 ring-slate-900 relative z-10 group-hover:scale-125 transition-transform`}></div>
                            <div className="mt-4 text-center">
                                <span className={`block text-xs font-bold uppercase ${point.text} mb-1`}>{point.label}</span>
                                <span className="block text-sm text-gray-300 whitespace-nowrap">{new Date(point.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                            </div>
                            {/* Connector Line (Bubble effect) */}
                            <div className={`absolute bottom-full mb-2 w-0.5 h-6 bg-gradient-to-t from-slate-700 to-transparent opacity-50`}></div>
                        </div>
                    ))}

                    {/* Range Labels (Production, Shipping) - simplified visually */}
                    <div
                        className="absolute top-12 h-8 bg-blue-900/20 border border-blue-500/30 rounded flex items-center justify-center text-xs text-blue-300"
                        style={{
                            left: getTimelineStyle(selectedEvent.dates.orderBy, timelineStart, totalDuration).left,
                            right: `calc(100% - ${getTimelineStyle(selectedEvent.dates.shipping, timelineStart, totalDuration).left})`
                        }}
                    >
                        <span className="hidden sm:inline">Production Phase</span>
                    </div>

                </div>

                <div className="text-center mt-4">
                     <a href="/quote.html" className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-indigo-500/25 transition-all">
                        Start Order for {selectedEvent.name}
                     </a>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
