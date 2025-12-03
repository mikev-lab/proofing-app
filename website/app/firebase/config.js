'use client';

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDOCAbC123dEf456GhI789jKl01-MnO2qr",
  authDomain: "proofing-application.firebaseapp.com",
  projectId: "proofing-application",
  storageBucket: "proofing-application.firebasestorage.app",
  messagingSenderId: "452256252711",
  appId: "1:452256252711:web:321abc456def7890"
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
