"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function normalizePrivateKey(rawValue) {
    let value = rawValue.trim();
    // Remove accidental wrapping quotes from secret managers.
    value = value.replace(/^['"]|['"]$/g, "");
    // Support both multiline and escaped newline formats.
    value = value.replace(/\\n/g, "\n");
    return value;
}
function getFirebaseApp() {
    if ((0, app_1.getApps)().length > 0) {
        return (0, app_1.getApps)()[0];
    }
    const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
    const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = normalizePrivateKey(getRequiredEnv("FIREBASE_PRIVATE_KEY"));
    if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
        throw new Error("FIREBASE_PRIVATE_KEY is malformed: missing BEGIN PRIVATE KEY header");
    }
    return (0, app_1.initializeApp)({
        credential: (0, app_1.cert)({
            projectId,
            clientEmail,
            privateKey,
        }),
    });
}
exports.db = (0, firestore_1.getFirestore)(getFirebaseApp());
//# sourceMappingURL=firebase.js.map