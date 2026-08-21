/**
 * admin-fabrica-auth-init.js - Guard de acceso para admin-fabrica.html
 * Misma lógica que admin-auth-init.js (verifica sesión real contra
 * Firestore, no solo sessionStorage, y oculta secciones según permisos),
 * pero sin conectar el panel de Usuarios — admin-fabrica.html todavía no
 * tiene esa pestaña (es el siguiente paso pendiente: que el Admin de
 * Fábrica pueda crear sus propios usuarios).
 *
 * TODO: cuando exista el chequeo de tenantId en auth.js, esta página deja
 * de aceptar a cualquier usuario válido y solo entra quien tenga acceso
 * concedido al tenant "fabrica".
 */

import { AuthManager } from './auth.js';

function ocultarGate() {
    document.getElementById('admin-auth-gate')?.remove();
}

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

const DIRECTORIO_KEY = 'mishellUsuariosDirectorio';

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

    document.querySelectorAll('.rail-group').forEach(grupo => {
        const links = Array.from(grupo.querySelectorAll('.rail-link'));
        if (links.length && links.every(l => l.style.display === 'none')) {
            grupo.style.display = 'none';
        }
    });

    const hashActual = window.location.hash || '#productos-fabrica';
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

function construirAppContext(usuario) {
    return {
        userId: usuario.uid,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        permisos: usuario.permisos || {},
        tenantId: usuario.tenantId ?? null,
        isSuperAdmin: usuario.rol === 'SUPER_ADMIN'
    };
}

function renderizarSesion(authManager, usuario) {
    window.appContext = construirAppContext(usuario);
    recordarUsuarioEnDirectorio(usuario);
    authManager.updateUserInfo(usuario);
    aplicarPermisosNav();
    window.dispatchEvent(new CustomEvent('adminAuthReady', { detail: window.appContext }));
}

(async function initAuthGuard() {
    if (!window.firebaseApp || !window.db) {
        console.error('admin-fabrica-auth-init: firebaseApp/db no están disponibles. ¿Falló admin-fabrica.js?');
        return;
    }

    const authManager = new AuthManager(window.firebaseApp);
    window.authManager = authManager;

    const usuarioCache = authManager.getCachedUser();
    if (usuarioCache) {
        authManager.currentUser = usuarioCache;
        authManager.userPermissions = usuarioCache.permisos || {};
        renderizarSesion(authManager, usuarioCache);
        ocultarGate();
    }

    try {
        const usuario = await authManager.init();
        renderizarSesion(authManager, usuario);
        authManager.escucharInvalidacionSesiones();
        ocultarGate();
    } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT_VERIFICACION_SESION') {
            console.warn('Verificación de sesión: tiempo de espera agotado');
            if (!usuarioCache) {
                mostrarErrorGate();
            }
            return;
        }
        console.warn('Sesión no válida, redirigiendo a login:', error);
    }
})();
