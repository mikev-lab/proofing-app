'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export default function RegisterPage() {
  const router = useRouter();
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Create Authentication User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create User Document in Firestore
      // Replicating legacy logic: users/{uid} with email, company, and default role
      await setDoc(doc(db, 'users', user.uid), {
        email: email,
        company: company, // Note: In legacy this might have been mapped to companyId or name. Keeping it simple as 'company' string for now or usually 'name'?
                          // The input placeholder says "Company / Studio Name".
                          // Legacy schema often had 'name' for the person and 'companyId' for the org.
                          // Here we act as if the user is the company rep.
        name: company,    // Using company name as display name for now to align with single-field input
        role: 'client_user',
        createdAt: new Date().toISOString()
      });

      // 3. Redirect
      router.push('/admin'); // Redirect to admin/dashboard area

    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Email is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Create an Account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Or{' '}
            <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
              log in to existing account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="company-name" className="sr-only">Company Name</label>
              <input
                id="company-name"
                name="company"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Company / Studio Name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
             <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded border border-red-900/50">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          </div>
        </form>

         <div className="mt-6 text-center">
             <p className="text-xs text-gray-500">
                 By registering, you agree to our Terms of Service and Privacy Policy.
             </p>
             <div className="mt-4">
                <a href="/legacy-portal/register.html" className="text-sm font-medium text-gray-400 hover:text-white underline">
                    Return to Legacy Registration
                </a>
            </div>
        </div>
      </div>
    </div>
  );
}
