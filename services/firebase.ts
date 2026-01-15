import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyD1Hdjo17l2YrgakNzZW-lpx78vVE77keE",
  authDomain: "stanseproject.firebaseapp.com",
  databaseURL: "https://stanseproject-default-rtdb.firebaseio.com",
  projectId: "stanseproject",
  storageBucket: "stanseproject.firebasestorage.app",
  messagingSenderId: "626045766180",
  appId: "1:626045766180:web:3a8d3967343cc3264ca6b1",
  measurementId: "G-QZJYQ89Y49"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);

// Initialize Analytics (only in browser)
export const initAnalytics = async () => {
  if (await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};

export default app;
