import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, collection, getDocs, Timestamp, addDoc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyApmEJdFi96QS3TwYh7GyEDSbZrCuVpBrg",
    authDomain: "proofing-application.firebaseapp.com",
    projectId: "proofing-application",
    storageBucket: "proofing-application.firebasestorage.app",
    messagingSenderId: "452256252711",
    appId: "1:452256252711:web:68795c1e5cc9438ff05f02",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export {
    app,
    auth,
    db,
    storage,
    onAuthStateChanged,
    signOut,
    doc,
    onSnapshot,
    updateDoc,
    collection,
    getDocs,
    Timestamp,
    addDoc,
    getDoc,
    ref,
    uploadBytes,
    getDownloadURL,
    createUserWithEmailAndPassword,
    setDoc,
    serverTimestamp
};
