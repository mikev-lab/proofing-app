'use client';

import React from 'react';
import { useStore } from '../context/StoreContext';

export default function CartIcon() {
  const { cart, toggleCart } = useStore();
  const itemCount = cart?.items.reduce((acc, item) => acc + item.quantity, 0) || 0;

  return (
    <button
        onClick={toggleCart}
        className="relative group p-2 text-gray-300 hover:text-white transition-colors"
    >
      <span className="sr-only">Open cart</span>
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-indigo-600 rounded-full">
              {itemCount}
          </span>
      )}
    </button>
  );
}
