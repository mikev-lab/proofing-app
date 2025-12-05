'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            setAuthorized(true);
          } else {
            console.warn("Access denied: User is not an admin.");
            router.replace('/login'); // Redirect non-admins
          }
        } catch (e) {
          console.error("Error verifying admin status:", e);
          router.replace('/login');
        }
      } else {
        router.replace('/login'); // Redirect unauthenticated
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
            <p className="text-gray-400">Verifying privileges...</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null; // Should have redirected

  return <>{children}</>;
}
