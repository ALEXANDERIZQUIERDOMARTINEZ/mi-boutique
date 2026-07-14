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
        ocultarGate();

        window.dispatchEvent(new CustomEvent('adminAuthReady', { detail: window.appContext }));
    } catch (error) {
        // AuthManager.init() ya redirige a login.html en caso de no estar
        // autenticado, no autorizado o inactivo — no queda más por hacer aquí.
        console.warn('Sesión no válida, redirigiendo a login:', error);
    }
})();
