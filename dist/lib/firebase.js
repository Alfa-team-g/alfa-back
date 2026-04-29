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
function getFirebaseApp() {
    if ((0, app_1.getApps)().length > 0) {
        return (0, app_1.getApps)()[0];
    }
    const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
    const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
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