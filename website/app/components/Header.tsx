'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import CartIcon from './CartIcon';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Header() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
                setRole(userDoc.data().role);
            }
        } catch (e) {
            console.error("Failed to fetch user role", e);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
      await signOut(auth);
      window.location.href = '/login';
  };

  return (
    <header className="bg-slate-900 border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="text-xl font-bold text-white tracking-tight">
              MCE Printing
            </Link>
          </div>
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Home
            </Link>
            <Link href="/products" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Products
            </Link>
            <div className="relative group">
              <Link href="/conventions" className="text-gray-300 group-hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center transition-colors">
                <span>Conventions</span>
                <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Link>
              <div className="absolute left-0 mt-2 w-48 rounded-md shadow-lg bg-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none hidden group-hover:block border border-slate-700">
                <div className="py-1">
                   <Link href="/conventions" className="block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white font-semibold">All Events & Deadlines</Link>
                   <div className="border-t border-slate-700 my-1"></div>
                  <Link href="/conventions/anime" className="block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Anime Conventions</Link>
                  <Link href="/conventions/furry" className="block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Furry Conventions</Link>
                  <Link href="/conventions/comic" className="block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Comic Conventions</Link>
                  <Link href="/conventions/general" className="block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">General Events</Link>
                  <div className="border-t border-slate-700 my-1"></div>
                  <Link href="/conventions/partner" className="block px-4 py-2 text-sm text-indigo-400 hover:bg-slate-700 hover:text-indigo-300">Partner with Us</Link>
                </div>
              </div>
            </div>
            <Link href="/publishers" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Publishers
            </Link>
             <Link href="/tools" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Tools
            </Link>
             <Link href="/faq" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              FAQ
            </Link>
             <Link href="/resources" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Resources
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            {loading ? (
                <div className="h-8 w-20 bg-slate-800 rounded animate-pulse"></div>
            ) : user ? (
                <div className="flex items-center gap-4">
                    {role === 'admin' && (
                        <Link href="/admin" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                            Admin Panel
                        </Link>
                    )}
                    <span className="text-gray-300 text-sm">{user.email}</span>
                    <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm">
                        Log out
                    </button>
                </div>
            ) : (
                <>
                    <Link href="/login" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    Log in
                    </Link>
                    <Link href="/register" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
                    Register
                    </Link>
                </>
            )}
            <div className="border-l border-slate-700 pl-4 ml-2">
                <CartIcon />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
