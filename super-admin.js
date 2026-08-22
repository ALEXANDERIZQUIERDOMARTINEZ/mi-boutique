/**
 * super-admin.js — Panel de plataforma: crear empresas (tenants) y decidir
 * a cuál empresa pertenece cada usuario. Es quien concede el acceso a
 * admin.html (Boutique) / admin-fabrica.html (Fábrica) — el usuario nunca
 * elige su empresa, la tiene asignada de antemano en su documento de
 * Firestore (campo tenantId).
 *
 * Página independiente: su propia inicialización de Firebase, no importa
 * nada de admin.js ni de admin-fabrica.js. Reutiliza AuthManager de auth.js
 * (el guard de sesión real) pero SIN declarar window.expectedTenantId —
 * Super Admin no pertenece a ningún tenant, así que ese chequeo no aplica
 * aquí; en su lugar se exige rol === 'SUPER_ADMIN' explícitamente.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    initializeFirestore, collection, getDocs, doc, setDoc, updateDoc,
    serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { AuthManager } from './auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
window.db = db;
window.firebaseApp = app;

const tenantsCollection = collection(db, 'tenants');
const usuariosCollection = collection(db, 'usuarios');

// Nombres visibles para los tenants que ya existen en el código (Boutique
// siempre existió sin necesitar un documento en `tenants`; Fábrica y
// cualquier empresa nueva sí se crean desde este panel).
const NOMBRE_TENANT_CONOCIDO = { boutique: 'Mishelles Boutique' };

function ocultarGate() {
    document.getElementById('admin-auth-gate')?.remove();
}

function mostrarErrorGate(mensaje) {
    const gate = document.getElementById('admin-auth-gate');
    if (!gate) return;
    gate.innerHTML = `
        <span style="font-size:2rem;">⚠️</span>
        <span style="color:#495057;font-size:.95rem;text-align:center;max-width:340px;padding:0 16px;">${mensaje}</span>
        <button type="button" id="admin-auth-gate-retry" style="background:#667eea;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:.9rem;">Volver a intentar</button>
    `;
    document.getElementById('admin-auth-gate-retry')?.addEventListener('click', () => window.location.reload());
}

function showToast(mensaje, tipo = 'success') {
    // Panel pequeño y de un solo dueño: alert() alcanza, sin duplicar el
    // sistema de toasts de admin.js.
    if (tipo === 'error') alert('❌ ' + mensaje);
    else alert('✅ ' + mensaje);
}

// ── Tenants ──────────────────────────────────────────────────────────────

async function cargarEmpresas() {
    const cont = document.getElementById('lista-empresas');
    try {
        const snapshot = await getDocs(query(tenantsCollection, orderBy('nombre')));
        const tenants = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Boutique existe desde antes de que existiera esta colección — se
        // muestra igual aunque no tenga documento propio todavía, para que
        // también se le pueda poner logo/color desde aquí.
        const listaCompleta = tenants.some(t => t.id === 'boutique')
            ? tenants
            : [{ id: 'boutique', nombre: NOMBRE_TENANT_CONOCIDO.boutique, estado: 'activo' }, ...tenants];

        document.getElementById('stat-empresas').textContent = listaCompleta.length;

        cont.innerHTML = listaCompleta.map(t => `
            <div class="card tenant-card mb-3">
                <div class="card-body d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-3">
                        <span style="width:36px;height:36px;border-radius:8px;flex:none;background:${t.colorPrimario || '#D988B9'};"></span>
                        <div>
                            <h5 class="mb-1">${t.nombre || t.id}</h5>
                            <span class="tenant-pill text-muted">tenantId: ${t.id}</span>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-success">${t.estado || 'activo'}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary btn-editar-empresa"
                                data-id="${t.id}" data-nombre="${(t.nombre || '').replace(/"/g, '&quot;')}"
                                data-nombre-corto="${(t.nombreCorto || '').replace(/"/g, '&quot;')}"
                                data-logo="${(t.logoUrl || '').replace(/"/g, '&quot;')}"
                                data-color="${t.colorPrimario || '#D988B9'}">
                            <i class="bi bi-pencil"></i> Editar
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error al cargar empresas:', error);
        cont.innerHTML = `<div class="alert alert-danger">Error al cargar empresas: ${error.message}</div>`;
    }
}

async function crearEmpresa() {
    const nombre = document.getElementById('empresa-nombre').value.trim();
    const slug = document.getElementById('empresa-slug').value.trim().toLowerCase();
    const nombreCorto = document.getElementById('empresa-nombre-corto').value.trim();
    const logoUrl = document.getElementById('empresa-logo').value.trim();
    const colorPrimario = document.getElementById('empresa-color').value;

    if (!nombre || !slug) {
        showToast('Nombre e identificador son requeridos.', 'error');
        return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
        showToast('El identificador solo puede tener minúsculas, números y guiones.', 'error');
        return;
    }

    const btn = document.getElementById('btn-guardar-empresa');
    btn.disabled = true;
    try {
        await setDoc(doc(db, 'tenants', slug), {
            nombre,
            nombreCorto: nombreCorto || null,
            logoUrl: logoUrl || null,
            colorPrimario: colorPrimario || null,
            slug,
            estado: 'activo',
            createdAt: serverTimestamp()
        });
        showToast(`Empresa "${nombre}" creada. Ahora ve a "Usuarios y acceso" para asignarle quién puede entrar.`);
        bootstrap.Modal.getInstance(document.getElementById('modalCrearEmpresa'))?.hide();
        document.getElementById('form-crear-empresa').reset();
        await cargarEmpresas();
        await cargarUsuarios(); // el <select> de asignación necesita la nueva empresa
    } catch (error) {
        console.error('Error al crear empresa:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function guardarEdicionEmpresa() {
    const id = document.getElementById('editar-empresa-id').value;
    const nombre = document.getElementById('editar-empresa-nombre').value.trim();
    const nombreCorto = document.getElementById('editar-empresa-nombre-corto').value.trim();
    const logoUrl = document.getElementById('editar-empresa-logo').value.trim();
    const colorPrimario = document.getElementById('editar-empresa-color').value;

    if (!id || !nombre) {
        showToast('Falta el nombre de la empresa.', 'error');
        return;
    }

    const btn = document.getElementById('btn-guardar-edicion-empresa');
    btn.disabled = true;
    try {
        // merge:true porque Boutique puede no tener documento todavía —
        // esto lo crea la primera vez que se le pone logo/color.
        await setDoc(doc(db, 'tenants', id), {
            nombre,
            nombreCorto: nombreCorto || null,
            logoUrl: logoUrl || null,
            colorPrimario: colorPrimario || null,
            slug: id,
            estado: 'activo',
            updatedAt: serverTimestamp()
        }, { merge: true });
        showToast(`Marca de "${nombre}" actualizada.`);
        bootstrap.Modal.getInstance(document.getElementById('modalEditarEmpresa'))?.hide();
        await cargarEmpresas();
    } catch (error) {
        console.error('Error al editar empresa:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-editar-empresa');
    if (!btn) return;
    document.getElementById('editar-empresa-id').value = btn.dataset.id;
    document.getElementById('editar-empresa-nombre').value = btn.dataset.nombre;
    document.getElementById('editar-empresa-nombre-corto').value = btn.dataset.nombreCorto;
    document.getElementById('editar-empresa-logo').value = btn.dataset.logo;
    document.getElementById('editar-empresa-color').value = btn.dataset.color;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEditarEmpresa')).show();
});

document.getElementById('btn-guardar-edicion-empresa')?.addEventListener('click', guardarEdicionEmpresa);

// ── Usuarios y acceso ────────────────────────────────────────────────────

let tenantsDisponibles = [{ id: 'boutique', nombre: 'Mishelles Boutique' }];

async function refrescarTenantsDisponibles() {
    try {
        const snapshot = await getDocs(tenantsCollection);
        const extra = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(t => t.id !== 'boutique');
        tenantsDisponibles = [{ id: 'boutique', nombre: NOMBRE_TENANT_CONOCIDO.boutique }, ...extra];
    } catch (error) {
        console.error('Error al leer tenants para el selector:', error);
    }
}

function opcionesTenantHtml(tenantIdActual) {
    const opciones = [`<option value="">Sin asignar</option>`]
        .concat(tenantsDisponibles.map(t =>
            `<option value="${t.id}" ${t.id === tenantIdActual ? 'selected' : ''}>${t.nombre}</option>`
        ));
    return opciones.join('');
}

async function cargarUsuarios() {
    const tbody = document.getElementById('tabla-usuarios');
    try {
        await refrescarTenantsDisponibles();

        const snapshot = await getDocs(usuariosCollection);
        const usuarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        document.getElementById('stat-usuarios').textContent = usuarios.length;
        document.getElementById('stat-sin-asignar').textContent =
            usuarios.filter(u => !u.tenantId && u.rol !== 'SUPER_ADMIN').length;

        if (!usuarios.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No hay usuarios todavía.</td></tr>`;
            return;
        }

        tbody.innerHTML = usuarios.map(u => {
            if (u.rol === 'SUPER_ADMIN') {
                return `<tr>
                    <td>${u.nombre || ''}</td>
                    <td>${u.email || ''}</td>
                    <td><span class="badge bg-dark">Super Admin</span></td>
                    <td colspan="2" class="text-muted"><i class="bi bi-infinity"></i> Acceso a todas las empresas</td>
                </tr>`;
            }
            const empresaActual = tenantsDisponibles.find(t => t.id === u.tenantId)?.nombre
                || (u.tenantId ? u.tenantId : 'Sin asignar');
            return `<tr data-uid="${u.id}">
                <td>${u.nombre || ''}</td>
                <td>${u.email || ''}</td>
                <td>${u.rol || ''}</td>
                <td>${empresaActual}</td>
                <td>
                    <div class="d-flex gap-2">
                        <select class="form-select form-select-sm select-tenant-usuario">${opcionesTenantHtml(u.tenantId)}</select>
                        <button class="btn btn-sm btn-primary btn-guardar-tenant-usuario">Guardar</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-4">Error al cargar: ${error.message}</td></tr>`;
    }
}

async function asignarTenantAUsuario(uid, nuevoTenantId) {
    await updateDoc(doc(db, 'usuarios', uid), {
        tenantId: nuevoTenantId || null,
        updatedAt: serverTimestamp()
    });
}

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-guardar-tenant-usuario');
    if (!btn) return;
    const fila = btn.closest('tr');
    const uid = fila?.dataset.uid;
    const select = fila?.querySelector('.select-tenant-usuario');
    if (!uid || !select) return;

    btn.disabled = true;
    try {
        await asignarTenantAUsuario(uid, select.value);
        showToast('Acceso actualizado.');
        await cargarUsuarios();
    } catch (error) {
        console.error('Error al asignar empresa:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-guardar-empresa')?.addEventListener('click', crearEmpresa);

// ── Auth guard: solo SUPER_ADMIN entra aquí ─────────────────────────────

(async function initAuthGuard() {
    const authManager = new AuthManager(app);
    window.authManager = authManager;

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) authManager.logout();
    });

    try {
        const usuario = await authManager.init();

        if (usuario.rol !== 'SUPER_ADMIN') {
            alert('⛔ Acceso denegado. Solo Super Admin puede entrar a este panel.');
            window.location.href = '/admin.html';
            return;
        }

        document.getElementById('nav-user-name').textContent = usuario.nombre || 'Super Admin';
        document.getElementById('nav-user-email').textContent = usuario.email || '';

        ocultarGate();
        await cargarEmpresas();
        await cargarUsuarios();
    } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT_VERIFICACION_SESION') {
            mostrarErrorGate('No se pudo verificar tu sesión. Revisa tu conexión e inténtalo de nuevo.');
            return;
        }
        console.warn('Sesión no válida, redirigiendo a login:', error);
    }
})();
