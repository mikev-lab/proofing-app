import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().companyRole === 'admin') {
            document.getElementById('team-management-section').classList.remove('hidden');
            loadTeamMembers(userDoc.data().companyId, user.uid);
        }
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('password-reset-button').addEventListener('click', async () => {
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        const messageEl = document.getElementById('password-reset-message');
        messageEl.textContent = 'A password reset link has been sent to your email.';
        messageEl.classList.remove('hidden');
    } catch (error) {
        console.error("Password reset error:", error);
    }
});

async function loadTeamMembers(companyId, currentUserId) {
    const q = query(collection(db, "users"), where("companyId", "==", companyId));
    const querySnapshot = await getDocs(q);
    const teamListEl = document.getElementById('team-members-list');
    teamListEl.innerHTML = '<h3 class="text-xl font-semibold text-white mb-4">Current Team</h3>';
    querySnapshot.forEach(doc => {
        const member = doc.data();
        const isCurrentUser = doc.id === currentUserId;
        const actions = isCurrentUser ? '' : `
            <button class="toggle-role-button bg-slate-500 text-xs py-1 px-2 rounded" data-uid="${doc.id}" data-role="${member.companyRole}">${member.companyRole === 'admin' ? 'Demote to Member' : 'Promote to Admin'}</button>
            <button class="remove-member-button bg-red-600 text-xs py-1 px-2 rounded ml-2" data-uid="${doc.id}">Remove</button>
        `;
        teamListEl.innerHTML += `<div class="flex justify-between items-center p-2 border-b border-slate-700"><div>${member.name} (${member.email}) - ${member.companyRole}</div><div>${actions}</div></div>`;
    });

    document.querySelectorAll('.toggle-role-button').forEach(button => button.addEventListener('click', toggleRole));
    document.querySelectorAll('.remove-member-button').forEach(button => button.addEventListener('click', removeMember));
}

async function toggleRole(event) {
    const uid = event.target.dataset.uid;
    const currentRole = event.target.dataset.role;
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    await updateDoc(doc(db, "users", uid), { companyRole: newRole });
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    loadTeamMembers(userDoc.data().companyId, auth.currentUser.uid);
}

async function removeMember(event) {
    const uid = event.target.dataset.uid;
    if (confirm('Are you sure you want to remove this team member?')) {
        await deleteDoc(doc(db, "users", uid));
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        loadTeamMembers(userDoc.data().companyId, auth.currentUser.uid);
    }
}

document.getElementById('add-team-member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-member-name').value;
    const email = document.getElementById('new-member-email').value;
    const password = document.getElementById('new-member-password').value;
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const companyId = userDoc.data().companyId;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            name,
            email,
            companyId,
            companyRole: 'member',
            role: 'client_user'
        });
        loadTeamMembers(companyId, auth.currentUser.uid);
        e.target.reset();
    } catch (error) {
        console.error("Error adding team member:", error);
        alert("Could not add team member: " + error.message);
    }
});
