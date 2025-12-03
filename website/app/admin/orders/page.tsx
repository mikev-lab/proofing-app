import React from 'react';
import Link from 'next/link';

export default function AdminOrders() {
  return (
    <div>
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Orders (Medusa)</h1>
            <div className="flex gap-4">
                <input type="text" placeholder="Search orders..." className="bg-slate-800 border border-slate-600 rounded px-4 py-2 text-white text-sm" />
                <button className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500">Export CSV</button>
            </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-slate-900 text-xs uppercase font-medium text-gray-500">
                    <tr>
                        <th className="px-6 py-4">Order ID</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Fulfillment</th>
                        <th className="px-6 py-4">Total</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                    {[
                        { id: '1024', date: 'Oct 24, 2024', customer: 'Alex Chen', status: 'paid', fulfillment: 'fulfilled', total: '$4,515.00' },
                        { id: '1023', date: 'Oct 23, 2024', customer: 'Studio Trigger', status: 'pending', fulfillment: 'not_fulfilled', total: '$1,200.00' },
                        { id: '1022', date: 'Oct 22, 2024', customer: 'John Doe', status: 'paid', fulfillment: 'partial', total: '$85.00' },
                        { id: '1021', date: 'Oct 21, 2024', customer: 'Jane Smith', status: 'refunded', fulfillment: 'returned', total: '$120.00' },
                    ].map((order) => (
                        <tr key={order.id} className="hover:bg-slate-700/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-white">
                                <Link href={`/admin/orders/${order.id}`} className="hover:text-indigo-400">#{order.id}</Link>
                            </td>
                            <td className="px-6 py-4">{order.date}</td>
                            <td className="px-6 py-4">{order.customer}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    order.status === 'paid' ? 'bg-green-900 text-green-200' :
                                    order.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                                    'bg-red-900 text-red-200'
                                }`}>
                                    {order.status}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    order.fulfillment === 'fulfilled' ? 'bg-green-900 text-green-200' :
                                    order.fulfillment === 'not_fulfilled' ? 'bg-gray-700 text-gray-300' :
                                    'bg-orange-900 text-orange-200'
                                }`}>
                                    {order.fulfillment}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-white">{order.total}</td>
                            <td className="px-6 py-4 text-right">
                                <Link href={`/admin/orders/${order.id}`} className="text-indigo-400 hover:text-indigo-300 hover:underline">View</Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
}
