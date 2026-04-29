import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkA6RYXElUuv--_Mxco8KK5dC4cvyWHyY",
  authDomain: "onthi-dashboard.firebaseapp.com",
  projectId: "onthi-dashboard",
  storageBucket: "onthi-dashboard.firebasestorage.app",
  messagingSenderId: "856897874104",
  appId: "1:856897874104:web:a26077783e4f14ab18ec4d",
  measurementId: "G-40ZSKBCBCD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { 
  app, auth, db, storage, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, writeBatch, arrayUnion,
  ref, uploadBytesResumable, getDownloadURL
};
