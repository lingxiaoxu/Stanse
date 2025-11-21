import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyB88IrP4_wO-9lJ8Nya0QIoZMRTY71tnSc",
  authDomain: "stanse-e3624.firebaseapp.com",
  projectId: "stanse-e3624",
  storageBucket: "stanse-e3624.firebasestorage.app",
  messagingSenderId: "770213512314",
  appId: "1:770213512314:web:50c63c77500bfcd813e7c3",
  measurementId: "G-HFK71SBER7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics (only in browser)
export const initAnalytics = async () => {
  if (await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};

export default app;
