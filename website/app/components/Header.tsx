'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CartIcon from './CartIcon';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Login Dropdown State
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

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

    // Close dropdown on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLoginOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const currentUser = userCredential.user;

      // Fetch role for redirect
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      let userRole = 'client_user';
      if (userDoc.exists()) {
          userRole = userDoc.data().role;
      }

      setIsLoginOpen(false); // Close dropdown

      if (userRole === 'admin') {
          router.push('/admin');
      } else {
          router.push('/dashboard');
      }
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/invalid-credential') {
        setLoginError('Invalid email or password.');
      } else {
        setLoginError('Failed to sign in.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
      await signOut(auth);
      router.push('/');
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
                    {/* Unified Dashboard Button */}
                    <Link
                        href={role === 'admin' ? "/admin" : "/dashboard"}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                        Dashboard
                    </Link>

                    <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm">
                        Log out
                    </button>
                </div>
            ) : (
                <div className="relative" ref={dropdownRef}>
                    {/* Login Trigger */}
                    <button
                        onClick={() => setIsLoginOpen(!isLoginOpen)}
                        className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none"
                    >
                        Log in
                    </button>

                    {/* Login Dropdown Panel */}
                    {isLoginOpen && (
                        <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-4 z-50 transform origin-top-right transition-all">
                            <h3 className="text-white font-medium mb-3">Welcome Back</h3>
                            <form onSubmit={handleLogin} className="space-y-3">
                                <div>
                                    <input
                                        type="email"
                                        required
                                        placeholder="Email"
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Password"
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                </div>
                                {loginError && (
                                    <p className="text-xs text-red-400">{loginError}</p>
                                )}
                                <button
                                    type="submit"
                                    disabled={isLoggingIn}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {isLoggingIn ? 'Signing in...' : 'Sign In'}
                                </button>
                            </form>
                            <div className="mt-3 pt-3 border-t border-slate-700 text-center">
                                <Link
                                    href="/register"
                                    onClick={() => setIsLoginOpen(false)}
                                    className="text-xs text-indigo-400 hover:text-indigo-300"
                                >
                                    Create an account
                                </Link>
                            </div>
                        </div>
                    )}

                    <Link href="/register" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm ml-2">
                        Register
                    </Link>
                </div>
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
