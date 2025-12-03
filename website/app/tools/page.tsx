import React from 'react';
import Link from 'next/link';
import tools from '../../data/tools.json';

// Helper to group tools by category
const groupTools = (toolsList: typeof tools) => {
  const grouped: Record<string, typeof tools> = {};
  toolsList.forEach(tool => {
    if (!grouped[tool.category]) {
      grouped[tool.category] = [];
    }
    grouped[tool.category].push(tool);
  });
  return grouped;
};

export default function ToolsIndex() {
  const groupedTools = groupTools(tools);
  const categories = Object.keys(groupedTools).sort();

  return (
    <div className="bg-slate-900 min-h-screen py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-extrabold text-white sm:text-5xl">Print Tools & Calculators</h1>
          <p className="mt-4 text-xl text-gray-400">
            Professional resources to help you prepare your files for print.
          </p>
        </div>

        <div className="space-y-16">
          {categories.map(category => (
            <section key={category}>
              <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-2">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedTools[category].map((tool) => (
                  <Link
                    key={tool.id}
                    href={`/tools/${tool.slug}`}
                    className="block bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-indigo-500 hover:bg-slate-750 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">{tool.name}</h3>
                        <svg className="h-5 w-5 text-gray-500 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </div>
                    <p className="mt-2 text-sm text-gray-400">{tool.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
