const firebaseConfig = {
  apiKey: "AIzaSyDoVdjkrWdJrrRC1BEeWksGkp4ydWcFW9Y",
  authDomain: "plataforma-escolar-71635.firebaseapp.com",
  projectId: "plataforma-escolar-71635",
  storageBucket: "plataforma-escolar-71635.firebasestorage.app",
  messagingSenderId: "194897243209",
  appId: "1:194897243209:web:ff339bee22bced4098e398"
};

if (!window.firebase) {
  throw new Error("Firebase SDK não carregado.");
}

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

export { app, db, auth, firebaseConfig };
