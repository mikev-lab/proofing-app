import React from 'react';
import Link from 'next/link';
import AdminGuard from '../components/AdminGuard'; // Import Guard

export const metadata = {
  title: 'MCE Admin | Unified Dashboard',
  description: 'Internal administration for orders and production.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
        <div className="min-h-screen bg-slate-900 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-950 border-r border-slate-800 flex-shrink-0 fixed h-full z-10">
            <div className="p-6">
            <Link href="/admin" className="text-xl font-extrabold text-white tracking-tight flex items-center">
                <div className="h-8 w-8 bg-indigo-600 rounded mr-3 flex items-center justify-center text-xs">MCE</div>
                Admin
            </Link>
            </div>

            <nav className="px-4 space-y-2 mt-4">
            <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Commerce (Medusa)</p>
            <Link href="/admin" className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-slate-800 hover:text-white">
                <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Dashboard
            </Link>
            <Link href="/admin/orders" className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-slate-800 hover:text-white">
                <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Orders
            </Link>
            <Link href="/admin/customers" className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-slate-800 hover:text-white">
                <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Customers
            </Link>

            <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-8 mb-2">Production (Firebase)</p>
            <Link href="/admin/projects" className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-slate-800 hover:text-white">
                <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Projects
            </Link>
            <Link href="/admin/inventory" className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-slate-800 hover:text-white">
                <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Inventory
            </Link>
            </nav>

            <div className="absolute bottom-0 w-full p-4 border-t border-slate-800">
                <Link href="/" className="flex items-center text-sm text-gray-400 hover:text-white">
                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Storefront
                </Link>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 p-8">
            {children}
        </main>
        </div>
    </AdminGuard>
  );
}
