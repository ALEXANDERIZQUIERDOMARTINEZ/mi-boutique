// Caché local de Firestore (IndexedDB) para admin.html y admin-fabrica.html.
//
// Con la caché activada, los listeners entregan de inmediato lo que ya había
// en el dispositivo y Firestore solo baja lo que cambió (si se vuelve a abrir
// dentro de ~30 min; pasado ese tiempo el servidor reenvía la consulta
// completa). Mientras el servidor no confirma, src/core/sync-indicator.js
// muestra "Sincronizando…" y marca las cifras como no confirmadas.
//
// Privacidad en equipos compartidos: la caché pertenece a un usuario y una
// empresa ("dueño"). Si al abrir el panel el dueño cambió, la caché anterior
// se borra ANTES de que Firestore la abra, así nunca se ven datos de otra
// persona. Al cerrar sesión también se borra (borrarCacheLocal, auth.js).
import {
    enableMultiTabIndexedDbPersistence, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const DUENO_KEY = 'mishellFirestoreCacheDueno';

// Mismo usuario que leen admin.js / auth.js al arrancar (sessionStorage al
// llegar desde login.html, localStorage al reabrir).
function usuarioConocido() {
    try {
        const raw = sessionStorage.getItem('adminUser') || localStorage.getItem('mishellAdminUserCache');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function nombreBaseDeDatos(db) {
    // Mismo nombre que usa el SDK 9.x: firestore/<app>/<proyecto>/main
    return `firestore/${db.app.name}/${db.app.options.projectId}/main`;
}

/**
 * Activa la caché local. Debe llamarse justo después de initializeFirestore
 * y antes de cualquier consulta. `tenantPagina` fija la empresa cuando la
 * página es de una sola (admin-fabrica.html → 'fabrica').
 * Devuelve una promesa con true si la caché quedó activa.
 */
export function activarCacheLocal(db, { tenantPagina = null } = {}) {
    let dueno = null;
    try {
        const u = usuarioConocido();
        if (u && u.uid) {
            const tenant = tenantPagina
                || (u.rol === 'SUPER_ADMIN' ? new URLSearchParams(location.search).get('empresa') : u.tenantId)
                || 'sin-empresa';
            dueno = `${u.uid}|${tenant}`;
        }
        const anterior = localStorage.getItem(DUENO_KEY);
        if (anterior && anterior !== dueno) {
            // Las solicitudes a IndexedDB sobre el mismo nombre se atienden en
            // orden: Firestore abrirá la base después de que se borre. Si otra
            // pestaña la tiene abierta, su Firestore recibe 'versionchange' y
            // la cierra (igual que con clearIndexedDbPersistence).
            indexedDB.deleteDatabase(nombreBaseDeDatos(db));
            localStorage.removeItem(DUENO_KEY);
        }
        // Sin usuario conocido no se guarda nada en el dispositivo.
        if (!dueno) return Promise.resolve(false);
        localStorage.setItem(DUENO_KEY, dueno);
    } catch (e) {
        // Sin localStorage/IndexedDB (modo privado estricto): sin caché.
        return Promise.resolve(false);
    }

    return enableMultiTabIndexedDbPersistence(db)
        .then(() => true)
        .catch(err => {
            // 'failed-precondition' (otra pestaña sin modo multi-pestaña) o
            // 'unimplemented' (navegador sin soporte): se sigue sin caché.
            console.warn('Caché local de Firestore no disponible:', err.code || err);
            return false;
        });
}

/**
 * Borra la caché local (al cerrar sesión). Termina la instancia de Firestore,
 * así que solo debe llamarse justo antes de salir de la página. Nunca tarda
 * más de ~2 s ni lanza error: cerrar sesión no debe quedarse esperando esto.
 */
export async function borrarCacheLocal(db) {
    try { localStorage.removeItem(DUENO_KEY); } catch (e) { /* ignorar */ }
    const borrar = (async () => {
        await terminate(db);
        await clearIndexedDbPersistence(db);
    })().catch(err => console.warn('No se pudo borrar la caché local de Firestore:', err));
    await Promise.race([borrar, new Promise(r => setTimeout(r, 2000))]);
}
