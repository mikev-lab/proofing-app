// js/login.js
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const errorMessageContainer = document.getElementById('error-message-container');
const errorMessage = document.getElementById('error-message');

function showLoginError(message) {
    errorMessage.textContent = message;
    errorMessageContainer.classList.remove('hidden');
}

function hideLoginError() {
    errorMessageContainer.classList.add('hidden');
}

async function redirectUser(user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    hideLoginError();
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await redirectUser(userCredential.user);
    } catch (error) {
        console.error('Login error:', error.code, error.message);
        const friendlyMessage = (error.code === 'auth/invalid-email' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')
            ? 'Invalid email or password. Please try again.'
            : 'An unexpected error occurred. Please try again.';
        showLoginError(friendlyMessage);
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in';
    }
}

loginForm.addEventListener('submit', handleLogin);

onAuthStateChanged(auth, (user) => {
    if (user) {
        redirectUser(user);
    }
});
