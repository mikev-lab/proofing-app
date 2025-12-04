import React from 'react';
import Link from 'next/link';

export default function AdminProjects() {
  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Production Projects</h1>
            <div className="flex gap-4">
                <input type="text" placeholder="Search projects..." className="bg-slate-800 border border-slate-600 rounded px-4 py-2 text-white text-sm" />
                <button className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500">New Project</button>
            </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                    <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Project Name</th>
                        <th className="px-6 py-4">Company</th>
                        <th className="px-6 py-4">Linked Order</th>
                        <th className="px-6 py-4">Due Date</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                    <tr className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-400 border border-yellow-500/20">
                                Pre-Press
                            </span>
                        </td>
                        <td className="px-6 py-4">
                            <div className="font-medium text-white">Anime Expo Art Book</div>
                            <div className="text-xs text-gray-500">ID: proj_123_abc</div>
                        </td>
                        <td className="px-6 py-4">Pixel Studios</td>
                        <td className="px-6 py-4">
                            <Link href="/admin/orders/1024" className="text-indigo-400 hover:text-indigo-300 hover:underline">
                                #1024
                            </Link>
                        </td>
                        <td className="px-6 py-4 text-white">Jun 25, 2025</td>
                        <td className="px-6 py-4 text-right">
                            <button className="text-gray-400 hover:text-white">Edit</button>
                        </td>
                    </tr>

                    <tr className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-500/20">
                                Printing
                            </span>
                        </td>
                        <td className="px-6 py-4">
                            <div className="font-medium text-white">Manga Vol 1 (Reprint)</div>
                            <div className="text-xs text-gray-500">ID: proj_456_def</div>
                        </td>
                        <td className="px-6 py-4">Indie Author Inc</td>
                        <td className="px-6 py-4">
                            <Link href="/admin/orders/1022" className="text-indigo-400 hover:text-indigo-300 hover:underline">
                                #1022
                            </Link>
                        </td>
                        <td className="px-6 py-4 text-white">May 10, 2025</td>
                        <td className="px-6 py-4 text-right">
                            <button className="text-gray-400 hover:text-white">Edit</button>
                        </td>
                    </tr>

                    <tr className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-500/20">
                                Awaiting Files
                            </span>
                        </td>
                        <td className="px-6 py-4">
                            <div className="font-medium text-white">Fall Catalog 2025</div>
                            <div className="text-xs text-gray-500">ID: proj_789_ghi</div>
                        </td>
                        <td className="px-6 py-4">Corporate Events</td>
                        <td className="px-6 py-4">
                            <span className="text-gray-600 italic">No Order</span>
                        </td>
                        <td className="px-6 py-4 text-white">Aug 01, 2025</td>
                        <td className="px-6 py-4 text-right">
                            <button className="text-gray-400 hover:text-white">Edit</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  );
}
