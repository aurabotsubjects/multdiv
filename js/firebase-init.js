// ============================================================
// FIREBASE SETUP — fill this in with YOUR project's config.
// Get it from: Firebase Console → Project Settings → Your apps → SDK setup
// (Full step-by-step, including enabling Auth, is in README.md)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwTGll6gVhKUrx_74TZKoXmZRkxXs72Sw",
  authDomain: "playermultdiv.firebaseapp.com",
  projectId: "playermultdiv",
  storageBucket: "playermultdiv.firebasestorage.app",
  messagingSenderId: "174880451947",
  appId: "1:174880451947:web:aea173d802127f0d06302e"
};

// ---- primary app: whoever is "logged in and browsing" (admin, teacher, or
// the student who opened the game menu / Player 1 of a 2-player game) ----
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore normally talks over a long-lived streaming connection. Plenty of
// school networks, filtering proxies and locked-down tablets block exactly
// that, and when they do the SDK doesn't error — it silently retries forever,
// so buttons appear dead on *some* devices and work fine on others.
// Auto-detect spots the blockage and falls back to ordinary HTTP polling,
// which those networks do allow. Slightly chattier; far more reliable.
const firestoreSettings = { experimentalAutoDetectLongPolling: true };
export const db = initializeFirestore(app, firestoreSettings);

// ---- worker app: a second, independent Firebase session used only to (a)
// create new accounts without signing the admin/teacher out of their own
// session, and (b) sign in "Player 2" for a 2-player game alongside Player 1.
// Same project, totally separate auth state. ----
export const workerApp = initializeApp(firebaseConfig, "worker");
export const workerAuth = getAuth(workerApp);
export const workerDb = initializeFirestore(workerApp, firestoreSettings);

export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, query, where, orderBy, onSnapshot, serverTimestamp
};
