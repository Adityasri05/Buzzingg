import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
