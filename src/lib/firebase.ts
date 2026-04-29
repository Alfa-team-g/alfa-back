import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizePrivateKey(rawValue: string): string {
  let value = rawValue.trim();

  // Remove accidental wrapping quotes from secret managers.
  value = value.replace(/^['"]|['"]$/g, "");
  // Support both multiline and escaped newline formats.
  value = value.replace(/\\n/g, "\n");

  return value;
}

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(getRequiredEnv("FIREBASE_PRIVATE_KEY"));

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("FIREBASE_PRIVATE_KEY is malformed: missing BEGIN PRIVATE KEY header");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const db = getFirestore(getFirebaseApp());
