import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const registerForm = document.getElementById('register-form');
const registerButton = document.getElementById('register-button');
const errorMessageContainer = document.getElementById('error-message-container');
const errorMessage = document.getElementById('error-message');

function showRegisterError(message) {
    errorMessage.textContent = message;
    errorMessageContainer.classList.remove('hidden');
}

async function handleRegister(e) {
    e.preventDefault();
    registerButton.disabled = true;
    registerButton.textContent = 'Creating...';

    const fullName = registerForm.fullName.value;
    const companyName = registerForm.companyName.value;
    const email = registerForm.email.value;
    const password = registerForm.password.value;

    try {
        // Step 1: Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Step 2: Create company document in Firestore
        const companyRef = await addDoc(collection(db, "companies"), {
            companyName: companyName,
            ownerUid: user.uid,
            createdAt: serverTimestamp()
        });

        // Step 3: Create user document in Firestore
        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            name: fullName,
            role: "client_user",
            companyId: companyRef.id,
            companyRole: "admin"
        });

        // Step 4: Redirect to dashboard
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Registration Error:', error);
        showRegisterError(error.message);
        registerButton.disabled = false;
        registerButton.textContent = 'Create Account';
    }
}

registerForm.addEventListener('submit', handleRegister);
