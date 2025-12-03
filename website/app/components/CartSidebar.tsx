'use client';

import React from 'react';
import { useStore } from '../context/StoreContext';
import Link from 'next/link';

export default function CartSidebar() {
  const { cart, isCartOpen, toggleCart, removeItem, updateQuantity, checkout } = useStore();

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden">
        {/* Backdrop */}
        <div
            className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={toggleCart}
            aria-hidden="true"
        ></div>

        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div className="pointer-events-auto w-screen max-w-md">
            <div className="flex h-full flex-col overflow-y-scroll bg-slate-900 shadow-xl border-l border-slate-700">
              <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-medium text-white" id="slide-over-title">Shopping cart</h2>
                  <div className="ml-3 flex h-7 items-center">
                    <button
                        type="button"
                        className="relative -m-2 p-2 text-gray-400 hover:text-white"
                        onClick={toggleCart}
                    >
                      <span className="absolute -inset-0.5"></span>
                      <span className="sr-only">Close panel</span>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="flow-root">
                    {!cart || cart.items.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400">Your cart is empty.</p>
                            <button
                                onClick={toggleCart}
                                className="mt-4 text-indigo-400 hover:text-indigo-300 font-medium"
                            >
                                Continue Shopping &rarr;
                            </button>
                        </div>
                    ) : (
                        <ul role="list" className="-my-6 divide-y divide-slate-700">
                        {cart.items.map((item) => (
                            <li key={item.id} className="flex py-6">
                            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-800 flex items-center justify-center">
                                {/* Placeholder for thumbnail */}
                                <span className="text-xs text-gray-500">IMG</span>
                            </div>

                            <div className="ml-4 flex flex-1 flex-col">
                                <div>
                                <div className="flex justify-between text-base font-medium text-white">
                                    <h3>
                                    <a href="#">{item.title}</a>
                                    </h3>
                                    <p className="ml-4">${(item.unit_price / 100).toFixed(2)}</p>
                                </div>
                                <p className="mt-1 text-sm text-gray-400">{item.variant?.title}</p>
                                {/* Metadata display (e.g. Project ID) */}
                                {item.metadata && item.metadata.firebaseProjectId && (
                                    <p className="mt-1 text-xs text-indigo-400">Project: {item.metadata.firebaseProjectId}</p>
                                )}
                                </div>
                                <div className="flex flex-1 items-end justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="text-gray-400 hover:text-white px-2 border border-slate-600 rounded">-</button>
                                    <p className="text-gray-300">Qty {item.quantity}</p>
                                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="text-gray-400 hover:text-white px-2 border border-slate-600 rounded">+</button>
                                </div>

                                <div className="flex">
                                    <button
                                        type="button"
                                        className="font-medium text-indigo-400 hover:text-indigo-300"
                                        onClick={() => removeItem(item.id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                                </div>
                            </div>
                            </li>
                        ))}
                        </ul>
                    )}
                  </div>
                </div>
              </div>

              {cart && cart.items.length > 0 && (
                  <div className="border-t border-slate-700 px-4 py-6 sm:px-6 bg-slate-800">
                    <div className="flex justify-between text-base font-medium text-white">
                    <p>Subtotal</p>
                    <p>${(cart.subtotal / 100).toFixed(2)}</p>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-400">Shipping and taxes calculated at checkout.</p>
                    <div className="mt-6">
                    <button
                        onClick={checkout}
                        className="flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700"
                    >
                        Checkout
                    </button>
                    </div>
                    <div className="mt-6 flex justify-center text-center text-sm text-gray-400">
                    <p>
                        or{' '}
                        <button
                            type="button"
                            className="font-medium text-indigo-400 hover:text-indigo-300"
                            onClick={toggleCart}
                        >
                        Continue Shopping
                        <span aria-hidden="true"> &rarr;</span>
                        </button>
                    </p>
                    </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
