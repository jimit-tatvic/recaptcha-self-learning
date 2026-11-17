// Firebase client configuration and initialization
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDn_RC3W-9UgZSQOfMAYWnUOpfbnZYE22U",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "tatvic-testing.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tatvic-testing",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "tatvic-testing.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "671930500205",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:671930500205:web:48fc50b557805f7fc62b64",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-KLNZ258QWL"
};

let app: FirebaseApp;
let analyticsInstance: Analytics | null = null;

if (typeof window !== "undefined") {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  isSupported().then((supported) => {
    if (supported) {
      analyticsInstance = getAnalytics(app);
      console.log("[Firebase] Analytics initialized successfully:", firebaseConfig.measurementId);
    }
  }).catch((err) => {
    console.warn("[Firebase] Analytics not supported in this environment:", err);
  });
} else {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

export { app, analyticsInstance, firebaseConfig };
