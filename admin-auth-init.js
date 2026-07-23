/**
 * admin-auth-init.js - Guard de acceso real para admin.html
 * Verifica sesión + permisos contra Firestore (no solo sessionStorage),
 * oculta secciones del menú según el rol/permisos del usuario, y
 * conecta el panel de gestión de Usuarios (usuarios.js).
 */

import { AuthManager } from './auth.js';
import { initUsuariosManager } from './usuarios.js';

function ocultarGate() {
    document.getElementById('admin-auth-gate')?.remove();
}

/**
 * Reemplaza el spinner infinito del gate por un mensaje accionable cuando
 * la verificación de sesión no pudo completarse a tiempo (red lenta/caída,
 * o el SDK de Firebase Auth no resolvió su persistencia). Sin esto, el
 * usuario se queda mirando "Verificando sesión..." para siempre sin saber
 * qué pasó ni poder hacer nada al respecto.
 */
function mostrarErrorGate() {
    const gate = document.getElementById('admin-auth-gate');
    if (!gate) return;
    gate.innerHTML = `
        <span style="font-size:2rem;">⚠️</span>
        <span style="color:#495057;font-size:.95rem;text-align:center;max-width:320px;padding:0 16px;">
            No se pudo verificar tu sesión. Revisa tu conexión a internet e inténtalo de nuevo.
        </span>
        <button type="button" id="admin-auth-gate-retry" style="background:#D988B9;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:.9rem;">
            Reintentar
        </button>
    `;
    document.getElementById('admin-auth-gate-retry')?.addEventListener('click', () => {
        window.location.reload();
    });
}

/**
 * Conecta el botón "Cerrar todas las sesiones" (visible solo para
 * Administrador/Sistema vía data-roles) con AuthManager.invalidarTodasLasSesiones.
 */
function configurarCierreSesionesGlobal(authManager) {
    const btn = document.getElementById('btn-cerrar-todas-sesiones');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const confirmado = confirm(
            'Esto cerrará la sesión de TODOS los usuarios en TODOS los dispositivos ' +
            '(incluida la tuya) y tendrán que volver a iniciar sesión con su contraseña. ¿Continuar?'
        );
        if (!confirmado) return;

        btn.disabled = true;
        try {
            await authManager.invalidarTodasLasSesiones();
            if (typeof window.showToast === 'function') {
                window.showToast('Todas las sesiones se están cerrando...', 'success');
            }
        } catch (error) {
            console.error('Error al cerrar todas las sesiones:', error);
            alert('No se pudo cerrar las sesiones: ' + error.message);
            btn.disabled = false;
        }
    });
}

// Debe coincidir con DIRECTORIO_KEY en login.html / usuarios.js
const DIRECTORIO_KEY = 'mishellUsuariosDirectorio';

/**
 * Asegura que el usuario que acaba de entrar quede en el directorio local
 * del dispositivo (para el selector de usuario de login.html), incluso si
 * llegó con una sesión de Firebase ya persistida (sin pasar por el submit
 * de login.html) o no tiene permiso para ver la lista completa de usuarios.
 */
function recordarUsuarioEnDirectorio(usuario) {
    try {
        const directorio = JSON.parse(localStorage.getItem(DIRECTORIO_KEY)) || [];
        const idx = directorio.findIndex(u => u.uid === usuario.uid);
        const entry = { uid: usuario.uid, nombre: usuario.nombre, email: usuario.email };
        if (idx >= 0) directorio[idx] = entry; else directorio.push(entry);
        localStorage.setItem(DIRECTORIO_KEY, JSON.stringify(directorio));
    } catch (e) {
        console.warn('No se pudo actualizar el directorio local de usuarios:', e);
    }
}

function aplicarPermisosNav() {
    const ctx = window.appContext;
    if (!ctx) return;

    document.querySelectorAll('[data-permiso]').forEach(el => {
        const permiso = el.getAttribute('data-permiso');
        const permitido = ctx.isSuperAdmin || ctx.permisos?.[permiso] === true;
        el.style.display = permitido ? '' : 'none';
    });

    document.querySelectorAll('[data-roles]').forEach(el => {
        const roles = el.getAttribute('data-roles').split(',').map(r => r.trim());
        const permitido = ctx.isSuperAdmin || roles.includes(ctx.rol);
        el.style.display = permitido ? '' : 'none';
    });

    // Ocultar grupos del rail que se quedaron sin ningún enlace visible
    document.querySelectorAll('.rail-group').forEach(grupo => {
        const links = Array.from(grupo.querySelectorAll('.rail-link'));
        if (links.length && links.every(l => l.style.display === 'none')) {
            grupo.style.display = 'none';
        }
    });

    // Si la sección activa no está permitida, ir a la primera disponible
    const hashActual = window.location.hash || '#dashboard';
    const linkActivo = document.querySelector('.rail-link[href="' + hashActual + '"]');
    if (!linkActivo || linkActivo.style.display === 'none') {
        const primerVisible = Array.from(document.querySelectorAll('.rail-link[href^="#"]'))
            .find(l => l.style.display !== 'none');
        if (primerVisible && window.adminShowSection && window.adminMarkActive) {
            const hash = primerVisible.getAttribute('href');
            window.adminShowSection(hash);
            window.adminMarkActive(hash);
        }
    }
}

(async function initAuthGuard() {
    if (!window.firebaseApp || !window.db) {
        console.error('admin-auth-init: firebaseApp/db no están disponibles. ¿Falló admin.js?');
        return;
    }

    const authManager = new AuthManager(window.firebaseApp);
    window.authManager = authManager;

    try {
        const usuario = await authManager.init();

        window.appContext = {
            userId: usuario.uid,
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            permisos: usuario.permisos || {},
            tenantId: usuario.tenantId ?? null,
            isSuperAdmin: usuario.rol === 'SUPER_ADMIN'
        };

        recordarUsuarioEnDirectorio(usuario);
        aplicarPermisosNav();
        initUsuariosManager(window.db, authManager);
        configurarCierreSesionesGlobal(authManager);
        authManager.escucharInvalidacionSesiones();
        ocultarGate();

        window.dispatchEvent(new CustomEvent('adminAuthReady', { detail: window.appContext }));
    } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT_VERIFICACION_SESION') {
            // Red lenta o SDK de Firebase Auth colgado: no hay redirección
            // automática (podría ser un problema de conexión temporal), así
            // que se le da al usuario una salida en vez de dejarlo con el
            // spinner girando indefinidamente.
            console.warn('Verificación de sesión: tiempo de espera agotado');
            mostrarErrorGate();
            return;
        }
        // Para el resto de casos, AuthManager.init() ya redirige a login.html
        // (no autenticado, no autorizado o inactivo) — no queda más por hacer aquí.
        console.warn('Sesión no válida, redirigiendo a login:', error);
    }
})();
