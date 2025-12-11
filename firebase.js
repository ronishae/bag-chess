// 1. Import BOTH the App and Firestore SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// public api key -- fine to commit
const firebaseConfig = {
    apiKey: "AIzaSyBtwoOOeRawSUjvCVGVzLPDBlEZQXapwZU",
    authDomain: "bag-chess.firebaseapp.com",
    projectId: "bag-chess",
    storageBucket: "bag-chess.firebasestorage.app",
    messagingSenderId: "586137931678",
    appId: "1:586137931678:web:53327d8e1d744987c6108f"
};

// 2. Initialize the App
const app = initializeApp(firebaseConfig);

// 3. Initialize Firestore
const db = getFirestore(app);

// 4. EXPORT them so other files can use them
export { app, db };