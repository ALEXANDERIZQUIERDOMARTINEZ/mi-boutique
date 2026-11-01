// Caché local de Firestore (IndexedDB) para admin.html y admin-fabrica.html.
//
// Con la caché activada, los listeners entregan de inmediato lo que ya había
// en el dispositivo y Firestore solo baja lo que cambió (si se vuelve a abrir
// dentro de ~30 min; pasado ese tiempo el servidor reenvía la consulta
// completa). Mientras el servidor no confirma, src/core/sync-indicator.js
// muestra "Sincronizando…" y marca las cifras como no confirmadas.
//
// No se activa en Safari/iOS ni en un dispositivo donde ya se trabó (ver
// esWebKit y reportarSincronizacionTrabada).
//
// Privacidad en equipos compartidos: la caché pertenece a un usuario y una
// empresa ("dueño"). Si al abrir el panel el dueño cambió, la caché anterior
// se borra ANTES de que Firestore la abra, así nunca se ven datos de otra
// persona. Al cerrar sesión también se borra (borrarCacheLocal, auth.js).
import {
    enableMultiTabIndexedDbPersistence, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const DUENO_KEY = 'mishellFirestoreCacheDueno';
const FALLO_KEY = 'mishellFirestoreCacheFallo';
const FALLO_DURACION_MS = 7 * 24 * 60 * 60 * 1000;

let cacheActiva = false;
export function cacheLocalActiva() { return cacheActiva; }

// Safari / iPhone / iPad (todo navegador en iOS usa WebKit): en producción la
// caché en IndexedDB dejó pestañas sin recibir nunca datos del servidor
// (todas las consultas esperando, "Conexión lenta · reintentando…"),
// probablemente por cómo WebKit congela pestañas en segundo plano y maneja
// IndexedDB. Ahí se trabaja sin caché, como antes.
function esWebKit() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android|SamsungBrowser/.test(ua);
    return ios || safari;
}

// Si en este dispositivo la caché ya dejó el panel sin confirmar datos del
// servidor teniendo internet, se desactiva aquí por 7 días.
function falloReciente() {
    try {
        const t = parseInt(localStorage.getItem(FALLO_KEY) || '0', 10);
        return t && (Date.now() - t) < FALLO_DURACION_MS;
    } catch (e) {
        return false;
    }
}

/**
 * Lo llama src/core/sync-indicator.js cuando el servidor no confirmó en 15 s
 * teniendo internet. Si la caché estaba activa, la desactiva en este
 * dispositivo para las próximas aperturas (la actual ya no se puede cambiar).
 */
export function reportarSincronizacionTrabada() {
    if (!cacheActiva) return;
    try { localStorage.setItem(FALLO_KEY, String(Date.now())); } catch (e) { /* ignorar */ }
    console.warn('Caché local de Firestore: sin confirmar del servidor; se desactiva en este dispositivo por 7 días.');
}

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
        if (esWebKit() || falloReciente()) return Promise.resolve(false);
        localStorage.setItem(DUENO_KEY, dueno);
    } catch (e) {
        // Sin localStorage/IndexedDB (modo privado estricto): sin caché.
        return Promise.resolve(false);
    }

    cacheActiva = true;
    return enableMultiTabIndexedDbPersistence(db)
        .then(() => true)
        .catch(err => {
            // 'failed-precondition' (otra pestaña sin modo multi-pestaña) o
            // 'unimplemented' (navegador sin soporte): se sigue sin caché.
            console.warn('Caché local de Firestore no disponible:', err.code || err);
            cacheActiva = false;
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
