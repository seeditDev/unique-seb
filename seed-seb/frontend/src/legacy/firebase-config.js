import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
    getAuth,
    signInAnonymously,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q",
    authDomain: "daily-tracker-a4092.firebaseapp.com",
    projectId: "daily-tracker-a4092",
    storageBucket: "daily-tracker-a4092.appspot.com",
    messagingSenderId: "1023352927583",
    appId: "1:1023352927583:web:2f0234b40a448390b6b2ea",
    measurementId: "G-G9GDW34WTS"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// Re-export auth helpers so services can import from a single place
export {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
};

/**
 * SECURITY (P0): the app previously carried no Firebase identity at all, which
 * is why firestore.rules had to fall back to `allow read, write: if true` on
 * every collection — the rules had nothing to test. Every client signs in
 * anonymously on boot so the rules can require `request.auth != null` and
 * reject traffic from anyone poking at the project with the (public) web API
 * key alone.
 *
 * Anonymous auth is not a substitute for per-student authorisation, but it
 * moves the project from "world-writable" to "only our app's sessions can
 * write, and only in the shapes the rules allow".
 */
let authReadyPromise = null;

export function ensureAnonymousAuth() {
    if (authReadyPromise) return authReadyPromise;

    authReadyPromise = new Promise((resolve) => {
        let settled = false;
        const finish = (user) => {
            if (settled) return;
            settled = true;
            resolve(user || null);
        };

        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                if (user) {
                    unsubscribe();
                    finish(user);
                    return;
                }
                unsubscribe();
                signInAnonymously(auth)
                    .then((cred) => finish(cred.user))
                    .catch((err) => {
                        console.error('[firebase] Anonymous sign-in failed:', err?.code || err);
                        finish(null);
                    });
            },
            (err) => {
                console.error('[firebase] Auth state error:', err?.code || err);
                finish(null);
            }
        );

        // Never let a slow/blocked auth handshake wedge app startup.
        setTimeout(() => finish(auth.currentUser), 8000);
    });

    return authReadyPromise;
}

// Kick the handshake off immediately so the first Firestore call is authorised.
ensureAnonymousAuth();
