// Reconexión de Firestore para admin.html y admin-fabrica.html.
//
// En celulares, la conexión en tiempo real de Firestore se "muere" sin aviso
// cuando la pestaña pasa a segundo plano (iOS congela la pestaña al cambiar
// de app o bloquear la pantalla) o cuando la red cambia (wifi ↔ datos). El SDK
// puede tardar mucho en darse cuenta, y mientras tanto el panel muestra datos
// viejos o se queda esperando ("Conexión lenta", Dashboard en $0). Antes la
// única salida era recargar la página.
//
// reconectar() cierra y vuelve a abrir la conexión (disableNetwork +
// enableNetwork). Los listeners existentes NO se pierden: Firestore los
// vuelve a registrar solo y entrega lo que haya cambiado.
import { disableNetwork, enableNetwork } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const SEGUNDO_PLANO_MINIMO_MS = 20000;

let dbActual = null;
let enCurso = null;

export function reconectar(motivo = '') {
    if (!dbActual) return Promise.resolve();
    if (enCurso) return enCurso;
    enCurso = (async () => {
        try {
            await disableNetwork(dbActual);
            await enableNetwork(dbActual);
            console.info(`Firestore: conexión renovada${motivo ? ` (${motivo})` : ''}.`);
        } catch (e) {
            console.warn('Firestore: no se pudo renovar la conexión:', e);
        } finally {
            enCurso = null;
        }
    })();
    return enCurso;
}

/** Activa la reconexión automática. Llamar una vez, con la instancia de Firestore. */
export function vigilarConexion(db) {
    dbActual = db;
    window.reconectarFirestore = reconectar;

    let ocultaDesde = document.visibilityState === 'hidden' ? Date.now() : null;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            ocultaDesde = Date.now();
        } else if (ocultaDesde && Date.now() - ocultaDesde > SEGUNDO_PLANO_MINIMO_MS) {
            ocultaDesde = null;
            reconectar('la pestaña volvió al frente');
        } else {
            ocultaDesde = null;
        }
    });
    // Safari restaura la página desde su caché "atrás/adelante" con la
    // conexión vieja ya cerrada.
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) reconectar('página restaurada');
    });
    window.addEventListener('online', () => reconectar('volvió la conexión'));
}
