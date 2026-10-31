// Indicador "Sincronizando…" del panel (admin.html y admin-fabrica.html).
//
// Con la caché local de Firestore (src/core/firestore-cache.js) el panel
// muestra al instante lo guardado en el dispositivo. Mientras el servidor no
// lo confirma:
//   - una barra fina animada recorre la parte superior de la pantalla,
//   - una píldora abajo dice "Sincronizando…",
//   - <body> lleva la clase 'fs-sincronizando', que hace brillar las cifras
//     del Dashboard y respirar las tablas (estilos en admin-styles.css).
// Al confirmar, la píldora muestra "Actualizado" un momento y desaparece.
// Si no confirma en 10 s pasa a "Sin conexión · mostrando datos guardados"
// (o "Conexión lenta · reintentando…" si el navegador sí tiene red).
//
// Escucha las MISMAS consultas que ya abre el panel (con
// includeMetadataChanges), así que Firestore las comparte con el listener
// existente: no abre conexiones nuevas ni cobra lecturas adicionales.
import { onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const ESPERA_SIN_CONEXION_MS = 10000;

function crearUI() {
    const barra = document.createElement('div');
    barra.className = 'fs-sync-barra';
    barra.setAttribute('aria-hidden', 'true');

    const pildora = document.createElement('div');
    pildora.className = 'fs-sync-pildora';
    pildora.setAttribute('role', 'status');
    pildora.setAttribute('aria-live', 'polite');
    pildora.innerHTML = '<span class="fs-sync-icono"></span><span class="fs-sync-texto"></span>';

    document.body.append(barra, pildora);
    return { barra, pildora, texto: pildora.querySelector('.fs-sync-texto') };
}

/**
 * @param {Array} consultas  queries/colecciones idénticas a las que ya escucha
 *                           el panel (p. ej. el catálogo de productos).
 */
export function vigilarSincronizacion(consultas) {
    if (!consultas.length) return;
    const ui = crearUI();
    const body = document.body;
    let pendientes = consultas.length;
    let terminado = false;
    let ocultarTimer = null;

    const estado = (clase, texto) => {
        ui.pildora.className = `fs-sync-pildora fs-sync-pildora--visible ${clase}`;
        ui.texto.textContent = texto;
    };

    body.classList.add('fs-sincronizando');
    ui.barra.classList.add('fs-sync-barra--activa');
    estado('fs-sync--cargando', 'Sincronizando…');

    const terminar = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timerSinConexion);
        window.removeEventListener('offline', marcarSinConexion);
        body.classList.remove('fs-sincronizando', 'fs-sin-confirmar');
        ui.barra.classList.remove('fs-sync-barra--activa');
        estado('fs-sync--listo', 'Actualizado');
        clearTimeout(ocultarTimer);
        ocultarTimer = setTimeout(() => ui.pildora.classList.remove('fs-sync-pildora--visible'), 1400);
    };

    const marcarSinConexion = () => {
        if (terminado) return;
        // Se deja de animar (no se sabe cuándo volverá la red) pero las cifras
        // siguen marcadas como no confirmadas.
        body.classList.remove('fs-sincronizando');
        body.classList.add('fs-sin-confirmar');
        ui.barra.classList.remove('fs-sync-barra--activa');
        estado('fs-sync--sin-conexion', navigator.onLine
            ? 'Conexión lenta · reintentando…'
            : 'Sin conexión · mostrando datos guardados');
    };
    const timerSinConexion = setTimeout(marcarSinConexion, ESPERA_SIN_CONEXION_MS);
    window.addEventListener('offline', marcarSinConexion);

    consultas.forEach(q => {
        let confirmada = false;
        const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => {
            if (confirmada || snap.metadata.fromCache) return;
            confirmada = true;
            setTimeout(() => unsub(), 0);
            if (--pendientes === 0) terminar();
        }, () => {
            // Sin permiso o error: no dejar el indicador colgado.
            if (confirmada) return;
            confirmada = true;
            if (--pendientes === 0) terminar();
        });
    });
}
