import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Register | MCE Printing',
  description: 'Create a new account with MCE Printing.',
};

export default function RegisterPage() {
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
        <form className="mt-8 space-y-6" action="#" method="POST">
          <input type="hidden" name="remember" value="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="company-name" className="sr-only">Company Name</label>
              <input id="company-name" name="company" type="text" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Company / Studio Name" />
            </div>
             <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input id="email-address" name="email" type="email" autoComplete="email" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Email address" />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-700 placeholder-gray-500 text-white bg-slate-800 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Password" />
            </div>
          </div>

          <div>
            <button type="submit" className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Register
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
