/**
 * admin-auth-init.js - Guard de acceso real para admin.html
 * Verifica sesión + permisos contra Firestore (no solo sessionStorage),
 * oculta secciones del menú según el rol/permisos del usuario, y
 * conecta el panel de gestión de Usuarios (usuarios.js).
 */

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { AuthManager } from './auth.js';
// Versionado por lo mismo que auditoria.js más abajo: usuarios.js no tiene
// ninguna otra referencia versionada en el proyecto, así que Vercel puede
// servir una copia vieja en caché (max-age=3600) hasta una hora después de
// cada cambio. Bump este número cuando usuarios.js cambie.
import { initUsuariosManager } from './usuarios.js?v=1.1.0';
import { obtenerMarcaTenant, aplicarMarcaEnPanel } from './tenant-branding.js';

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
        // Dos condiciones independientes, ambas necesarias: que la PERSONA
        // tenga el permiso, y que la EMPRESA tenga ese módulo contratado
        // (ctx.modulosEfectivos, cargado por aplicarModulosEfectivos() —
        // null mientras no haya terminado de cargar o la empresa no tenga
        // plan asignado, y en ese caso no restringe, ver Fase 1 del SaaS
        // multiempresa / firestore.rules: tenantTieneModulo()). El id de
        // data-permiso es a la vez el permiso y el id del módulo en
        // MODULOS_PERMISOS (auth.js) — mismo catálogo para ambas cosas.
        const tienePermiso = ctx.isSuperAdmin || ctx.permisos?.[permiso] === true;
        const tieneModulo = ctx.isSuperAdmin || !ctx.modulosEfectivos || ctx.modulosEfectivos.includes(permiso);
        el.style.display = (tienePermiso && tieneModulo) ? '' : 'none';
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

function construirAppContext(usuario) {
    return {
        userId: usuario.uid,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        permisos: usuario.permisos || {},
        tenantId: usuario.tenantId ?? null,
        isSuperAdmin: usuario.rol === 'SUPER_ADMIN',
        modulosEfectivos: null // se llena de forma asíncrona, ver aplicarModulosEfectivos()
    };
}

/**
 * (plan.modulos ∪ modulosExtra) − modulosRevocados — mismo cálculo que
 * moduloEnEmpresa() en firestore.rules, del lado cliente para poder ocultar
 * el rail-nav sin esperar a que una escritura falle. null = sin restringir
 * (fail-open: sin tenantsPrivado o sin plan asignado todavía, igual que en
 * las rules — ver Fase 1 del SaaS multiempresa).
 */
async function cargarModulosEfectivos(tenantId) {
    if (!tenantId) return null;
    try {
        const privSnap = await getDoc(doc(window.db, 'tenantsPrivado', tenantId));
        if (!privSnap.exists()) return null;
        const priv = privSnap.data();

        let modulosPlan = [];
        if (priv.planId) {
            const planSnap = await getDoc(doc(window.db, 'planes', priv.planId));
            if (planSnap.exists()) modulosPlan = planSnap.data().modulos || [];
        }

        const extra = priv.modulosExtra || [];
        if (!priv.planId && extra.length === 0) return null; // nada configurado todavía

        const revocados = new Set(priv.modulosRevocados || []);
        return Array.from(new Set([...modulosPlan, ...extra])).filter(m => !revocados.has(m));
    } catch (error) {
        console.warn('No se pudo cargar los módulos de la empresa:', error);
        return null; // sin dato confiable, no restringir por eso
    }
}

// Evita recargar módulos si renderizarSesion() se llama dos veces para el
// mismo tenant (entrada optimista con caché + verificación real, ver
// initAuthGuard más abajo).
let modulosCargadosParaTenant = undefined;

async function aplicarModulosEfectivos() {
    const ctx = window.appContext;
    if (!ctx || ctx.isSuperAdmin) return;
    const tenantId = ctx.tenantId || 'boutique';
    if (modulosCargadosParaTenant === tenantId) return;
    const modulos = await cargarModulosEfectivos(tenantId);
    modulosCargadosParaTenant = tenantId;
    if (window.appContext && (window.appContext.tenantId || 'boutique') === tenantId) {
        window.appContext.modulosEfectivos = modulos;
        aplicarPermisosNav();
    }
}

function renderizarSesion(authManager, usuario) {
    window.appContext = construirAppContext(usuario);
    recordarUsuarioEnDirectorio(usuario);
    authManager.updateUserInfo(usuario);
    aplicarPermisosNav();
    window.dispatchEvent(new CustomEvent('adminAuthReady', { detail: window.appContext }));
    aplicarModulosEfectivos();
}

(async function initAuthGuard() {
    if (!window.firebaseApp || !window.db) {
        console.error('admin-auth-init: firebaseApp/db no están disponibles. ¿Falló admin.js?');
        return;
    }

    // Logo/nombre/color de la marca de este panel — no depende de que la
    // sesión termine de verificarse, es lectura pública (igual que planes).
    obtenerMarcaTenant(window.db, window.expectedTenantId || 'boutique').then(aplicarMarcaEnPanel);

    const authManager = new AuthManager(window.firebaseApp);
    window.authManager = authManager;

    // Entrada optimista tipo Instagram: si este dispositivo ya verificó a
    // este usuario antes, se pinta el panel de inmediato con esos datos
    // mientras la verificación real (Firebase Auth + Firestore) corre en
    // segundo plano, en vez de bloquear cada apertura con el spinner
    // "Verificando sesión...". Si la verificación real encuentra que la
    // sesión ya no es válida, AuthManager la cierra y redirige igual.
    const usuarioCache = authManager.getCachedUser();
    if (usuarioCache) {
        authManager.currentUser = usuarioCache;
        authManager.userPermissions = usuarioCache.permisos || {};
        renderizarSesion(authManager, usuarioCache);
        initUsuariosManager(window.db, authManager);
        configurarCierreSesionesGlobal(authManager);
        ocultarGate();
    }

    try {
        const usuario = await authManager.init();
        renderizarSesion(authManager, usuario);

        if (!usuarioCache) {
            initUsuariosManager(window.db, authManager);
            configurarCierreSesionesGlobal(authManager);
        }
        authManager.escucharInvalidacionSesiones();
        ocultarGate();
    } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT_VERIFICACION_SESION') {
            // Red lenta o SDK de Firebase Auth colgado: no hay redirección
            // automática (podría ser un problema de conexión temporal). Si ya
            // se pintó el panel con datos cacheados, se deja usable tal cual
            // (se revalidará en la próxima apertura); si no había caché, se
            // le da al usuario una salida en vez de dejarlo con el spinner
            // girando indefinidamente.
            console.warn('Verificación de sesión: tiempo de espera agotado');
            if (!usuarioCache) {
                mostrarErrorGate();
            }
            return;
        }
        // Para el resto de casos (no autenticado, no autorizado, inactivo o
        // sesión invalidada), AuthManager.init() ya cerró la sesión, limpió
        // el caché y redirige a login.html — no queda más por hacer aquí.
        console.warn('Sesión no válida, redirigiendo a login:', error);
    }
})();
