// FicVault Firebase client configuration.
// Firebase's web API key identifies this project; access is enforced by Auth
// and Firestore Security Rules (see firestore.rules), not by hiding this key.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  deleteUser
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDG99CCxpm10bBuQwMZ6brKjWju9YL83Po',
  authDomain: 'my-ficvault.firebaseapp.com',
  projectId: 'my-ficvault',
  storageBucket: 'my-ficvault.firebasestorage.app',
  messagingSenderId: '696541919515',
  appId: '1:696541919515:web:75e905b706898f3a33fbbe',
  measurementId: 'G-NTE0XPD6P6'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  deleteUser,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteDoc
};
