/**
 * CONFIGURACIÓN DE FIREBASE
 * Inicialización centralizada de Firebase
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
  authDomain: "mishell-boutique-admin.firebaseapp.com",
  projectId: "mishell-boutique-admin",
  storageBucket: "mishell-boutique-admin.firebasestorage.app",
  messagingSenderId: "399662956877",
  appId: "1:399662956877:web:084236f6f0a8f704"
};

/**
 * Inicializa Firebase y retorna las instancias
 * @returns {Object} { db, auth, storage, analytics }
 */
function initializeFirebase() {
  try {
    // Verificar si Firebase ya fue inicializado
    if (firebase.apps.length > 0) {
      console.log('ℹ️ Firebase ya inicializado');
    } else {
      firebase.initializeApp(FIREBASE_CONFIG);
      console.log('✅ Firebase inicializado correctamente');
    }

    const db = firebase.firestore();
    const auth = firebase.auth();
    const storage = firebase.storage();

    // Analytics (opcional)
    let analytics = null;
    try {
      analytics = firebase.analytics();
    } catch (error) {
      console.warn('⚠️ Firebase Analytics no disponible:', error.message);
    }

    return {
      db,
      auth,
      storage,
      analytics
    };

  } catch (error) {
    console.error('❌ Error al inicializar Firebase:', error);
    throw error;
  }
}

/**
 * Obtiene referencia a Firestore
 * @returns {firebase.firestore.Firestore}
 */
function getFirestore() {
  return firebase.firestore();
}

/**
 * Obtiene referencia a Auth
 * @returns {firebase.auth.Auth}
 */
function getAuth() {
  return firebase.auth();
}

/**
 * Obtiene referencia a Storage
 * @returns {firebase.storage.Storage}
 */
function getStorage() {
  return firebase.storage();
}

// Exportar configuración
if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = FIREBASE_CONFIG;
  window.initializeFirebase = initializeFirebase;
  window.getFirestore = getFirestore;
  window.getAuth = getAuth;
  window.getStorage = getStorage;
}
