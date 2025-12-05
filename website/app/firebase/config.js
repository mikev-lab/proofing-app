'use client';

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const functions = getFunctions(app, 'us-central1');
const db = getFirestore(app);
const auth = getAuth(app);

// Connect to emulators if in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    // Note: We avoid importing { connectFunctionsEmulator } to keep bundle size small if tree shaking fails,
    // but typically we should. For now, rely on standard detection or manual switch.
    // Actually, let's just use the real functions for now unless explicit.
    // Or set up standard emulator connection.
    /*
    const { connectFunctionsEmulator } = require("firebase/functions");
    connectFunctionsEmulator(functions, "localhost", 5001);
    */
}

export { app, functions, db, auth, httpsCallable };
