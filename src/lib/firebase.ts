import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
// CRITICAL: The app will break without specifying the firestoreDatabaseId
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
