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
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
    initializeFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc,
    serverTimestamp, orderBy, query, Timestamp
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { AuthManager, ROLES, MODULOS_PERMISOS } from './auth.js';

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
const tenantsPrivadoCollection = collection(db, 'tenantsPrivado');
const planesCollection = collection(db, 'planes');
const usuariosCollection = collection(db, 'usuarios');

// Nombres visibles para los tenants que ya existen en el código (Boutique
// siempre existió sin necesitar un documento en `tenants`; Fábrica y
// cualquier empresa nueva sí se crean desde este panel).
const NOMBRE_TENANT_CONOCIDO = { boutique: 'Mishelles Boutique' };

// Mismo mapeo que usuarios.js (permisosArrayAMapa): las Security Rules
// exigen permisos como mapa { permiso: true }, no como arreglo.
function permisosArrayAMapa(permisosArray) {
    const mapa = {};
    (permisosArray || []).forEach(p => { mapa[p] = true; });
    return mapa;
}

// Mismo mapeo que usuarios.js (getAuthErrorMessage), duplicado aquí porque
// ese archivo no lo exporta.
function getAuthErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'El correo electrónico ya está registrado',
        'auth/invalid-email': 'El correo electrónico no es válido',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres)'
    };
    return errorMessages[errorCode] || 'Error al crear la cuenta del administrador';
}

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

const BADGE_POR_ESTADO = {
    activo: 'bg-success',
    trial: 'bg-info text-dark',
    suspendido: 'bg-warning text-dark',
    cancelado: 'bg-danger'
};

// ── Cache para el Dashboard: se rellena desde cargarEmpresas()/cargarUsuarios()
// (que ya hacen estas consultas para sus propias pestañas) y se re-renderiza
// sin duplicar lecturas a Firestore. Ver intentarRenderDashboard().
let ultimaListaEmpresas = [];
let ultimosPrivadosPorId = new Map();
let ultimosUsuarios = [];
const dashboardListo = { empresas: false, usuarios: false };

async function cargarEmpresas() {
    const cont = document.getElementById('lista-empresas');
    try {
        const [snapshot, privadosSnapshot] = await Promise.all([
            getDocs(query(tenantsCollection, orderBy('nombre'))),
            getDocs(tenantsPrivadoCollection)
        ]);
        const tenants = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const privadosPorId = new Map(privadosSnapshot.docs.map(d => [d.id, d.data()]));
        if (!planesDisponibles.length) await cargarPlanes();

        // Boutique existe desde antes de que existiera esta colección — se
        // muestra igual aunque no tenga documento propio todavía, para que
        // también se le pueda poner logo/color desde aquí.
        const listaCompleta = tenants.some(t => t.id === 'boutique')
            ? tenants
            : [{ id: 'boutique', nombre: NOMBRE_TENANT_CONOCIDO.boutique, estado: 'activo' }, ...tenants];

        document.getElementById('stat-empresas').textContent = listaCompleta.length;

        cont.innerHTML = listaCompleta.map(t => {
            const priv = privadosPorId.get(t.id);
            const plan = planesDisponibles.find(p => p.id === priv?.planId);
            const estado = t.estado || 'activo';
            const nombreEscapado = (t.nombre || '').replace(/"/g, '&quot;');
            return `
            <div class="card tenant-card mb-3">
                <div class="card-body d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-3">
                        <span style="width:36px;height:36px;border-radius:8px;flex:none;background:${t.colorPrimario || '#D988B9'};"></span>
                        <div>
                            <h5 class="mb-1">${t.nombre || t.id}</h5>
                            <span class="tenant-pill text-muted">tenantId: ${t.id}</span>
                            <span class="text-muted small ms-2">${plan ? plan.nombre : 'Sin plan'}</span>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge ${BADGE_POR_ESTADO[estado] || 'bg-secondary'}">${estado}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary btn-gestionar-empresa"
                                data-id="${t.id}" data-nombre="${nombreEscapado}">
                            <i class="bi bi-sliders"></i> Gestionar
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary btn-editar-empresa"
                                data-id="${t.id}" data-nombre="${nombreEscapado}"
                                data-nombre-corto="${(t.nombreCorto || '').replace(/"/g, '&quot;')}"
                                data-logo="${(t.logoUrl || '').replace(/"/g, '&quot;')}"
                                data-color="${t.colorPrimario || '#D988B9'}">
                            <i class="bi bi-pencil"></i> Marca
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        ultimaListaEmpresas = listaCompleta;
        ultimosPrivadosPorId = privadosPorId;
        dashboardListo.empresas = true;
        intentarRenderDashboard();
    } catch (error) {
        console.error('Error al cargar empresas:', error);
        cont.innerHTML = `<div class="alert alert-danger">Error al cargar empresas: ${error.message}</div>`;
    }
}

/**
 * Crea la empresa Y la deja operativa de una: doc público (marca+estado),
 * doc privado (plan/límites), y la cuenta de Firebase Auth de su primer
 * administrador — nadie tiene que tocar código ni crear el usuario a mano
 * desde otra pantalla. Mismo patrón de "app secundaria de Firebase" que ya
 * usa usuarios.js (createUsuario) para no cerrar la sesión de quien crea.
 *
 * Si falla justo después de crear la empresa pero antes de crear el admin
 * (ej. el correo ya está en uso), la empresa queda creada sin admin — se
 * avisa igual y se puede asignar un usuario existente desde "Usuarios y
 * acceso". No hay forma de hacer esto atómico desde el cliente (Firebase
 * Auth y Firestore no comparten una transacción).
 */
async function crearEmpresa() {
    const nombre = document.getElementById('empresa-nombre').value.trim();
    const slug = document.getElementById('empresa-slug').value.trim().toLowerCase();
    const nombreCorto = document.getElementById('empresa-nombre-corto').value.trim();
    const logoUrl = document.getElementById('empresa-logo').value.trim();
    const colorPrimario = document.getElementById('empresa-color').value;
    const planId = document.getElementById('empresa-plan').value || null;
    const adminNombre = document.getElementById('empresa-admin-nombre').value.trim();
    const adminEmail = document.getElementById('empresa-admin-email').value.trim();
    const adminPassword = document.getElementById('empresa-admin-password').value;

    if (!nombre || !slug || !adminNombre || !adminEmail || !adminPassword) {
        showToast('Nombre, identificador y los datos del administrador son requeridos.', 'error');
        return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
        showToast('El identificador solo puede tener minúsculas, números y guiones.', 'error');
        return;
    }
    if (adminPassword.length < 6) {
        showToast('La contraseña del administrador debe tener al menos 6 caracteres.', 'error');
        return;
    }

    const btn = document.getElementById('btn-guardar-empresa');
    btn.disabled = true;
    try {
        const yaExiste = (await getDoc(doc(db, 'tenants', slug))).exists();
        if (yaExiste) {
            showToast('Ya existe una empresa con ese identificador.', 'error');
            return;
        }

        await setDoc(doc(db, 'tenants', slug), {
            nombre,
            nombreCorto: nombreCorto || null,
            logoUrl: logoUrl || null,
            colorPrimario: colorPrimario || null,
            slug,
            estado: 'activo',
            createdAt: serverTimestamp()
        });

        // Cuenta del administrador: app secundaria para no cerrar la sesión
        // de este Super Admin (createUserWithEmailAndPassword inicia
        // sesión automáticamente en la instancia que se le pase).
        let uidAdmin = null;
        const secondaryApp = initializeApp(firebaseConfig, 'super-admin-secondary-' + Date.now());
        try {
            const secondaryAuth = getAuth(secondaryApp);
            const credencial = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, adminPassword);
            uidAdmin = credencial.user.uid;
            await setDoc(doc(db, 'usuarios', uidAdmin), {
                nombre: adminNombre,
                email: adminEmail,
                rol: 'ADMIN',
                permisos: permisosArrayAMapa(ROLES.ADMIN.permisos),
                tenantId: slug,
                activo: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await signOutSecondary(secondaryAuth);
        } catch (errorAdmin) {
            console.error('Empresa creada, pero falló la cuenta del administrador:', errorAdmin);
            showToast(`Empresa creada, pero no se pudo crear su administrador: ${getAuthErrorMessage(errorAdmin.code)}. Asígnale un usuario existente desde "Usuarios y acceso".`, 'error');
        } finally {
            await deleteApp(secondaryApp);
        }

        await setDoc(doc(db, 'tenantsPrivado', slug), {
            planId,
            modulosExtra: [],
            modulosRevocados: [],
            suscripcion: { fechaVencimiento: null, precio: null, periodicidad: null },
            limites: {},
            propietarioId: uidAdmin,
            createdAt: serverTimestamp()
        });

        if (uidAdmin) showToast(`Empresa "${nombre}" creada y lista para usarse. Su administrador ya puede entrar con ${adminEmail}.`);
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
        // esto lo crea la primera vez que se le pone logo/color. OJO: no se
        // fuerza 'estado' aquí salvo que el documento sea nuevo — este
        // modal es solo de marca (nombre/logo/color); antes forzaba
        // 'activo' en CADA guardado, lo que reactivaba sin querer a una
        // empresa suspendida. El estado se gestiona desde "Gestionar"
        // (guardarGestionEmpresa). Si el doc no existe todavía, sí necesita
        // un 'estado' inicial: tenant-resolver.js filtra por ese campo y un
        // documento sin él quedaría invisible para el catálogo público.
        const yaExiste = (await getDoc(doc(db, 'tenants', id))).exists();
        await setDoc(doc(db, 'tenants', id), {
            nombre,
            nombreCorto: nombreCorto || null,
            logoUrl: logoUrl || null,
            colorPrimario: colorPrimario || null,
            slug: id,
            ...(yaExiste ? {} : { estado: 'activo' }),
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

// ── Planes ───────────────────────────────────────────────────────────────
// planId → plan completo, para no repetir getDocs en cada tarjeta de
// empresa. Se refresca cada vez que se guarda/carga la lista de planes.
let planesDisponibles = [];

/**
 * Pinta un checkbox por módulo (mismo catálogo que el rail-nav de
 * admin.html: MODULOS_PERMISOS de auth.js). Reutilizado tanto por el
 * modal de Plan (qué módulos INCLUYE el plan) como por el de Gestionar
 * empresa (qué módulos tiene ESA empresa, plan + excepciones).
 * data-en-plan marca si el módulo viene del plan (para poder calcular al
 * guardar cuáles son excepción — ver leerModulosChecklist).
 */
function renderModulosChecklist(containerId, modulosMarcados, modulosBase) {
    const cont = document.getElementById(containerId);
    const marcados = new Set(modulosMarcados || []);
    const base = new Set(modulosBase || modulosMarcados || []);
    cont.innerHTML = MODULOS_PERMISOS.map(m => `
        <div class="col">
            <div class="form-check">
                <input class="form-check-input modulo-check" type="checkbox" value="${m.id}"
                       id="${containerId}-${m.id}" ${marcados.has(m.id) ? 'checked' : ''}
                       data-en-plan="${base.has(m.id)}">
                <label class="form-check-label" for="${containerId}-${m.id}">${m.nombre}</label>
            </div>
        </div>
    `).join('');
}

/** Lee el checklist tal cual (lista simple de ids marcados) — para Planes. */
function leerModulosMarcados(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} .modulo-check:checked`)).map(chk => chk.value);
}

/**
 * Lee el checklist como EXCEPCIONES sobre la base del plan (modulosExtra/
 * modulosRevocados) — para Gestionar empresa. data-en-plan viene de
 * renderModulosChecklist().
 */
function leerModulosComoExcepciones(containerId) {
    const modulosExtra = [];
    const modulosRevocados = [];
    document.querySelectorAll(`#${containerId} .modulo-check`).forEach(chk => {
        const enPlan = chk.dataset.enPlan === 'true';
        if (chk.checked && !enPlan) modulosExtra.push(chk.value);
        if (!chk.checked && enPlan) modulosRevocados.push(chk.value);
    });
    return { modulosExtra, modulosRevocados };
}

async function cargarPlanes() {
    const cont = document.getElementById('lista-planes');
    try {
        const snapshot = await getDocs(query(planesCollection, orderBy('nombre')));
        planesDisponibles = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        actualizarSelectsDePlanes();

        if (!planesDisponibles.length) {
            cont.innerHTML = `<div class="alert alert-light border">Todavía no hay planes. Crea el primero con "Nuevo plan".</div>`;
            return;
        }

        cont.innerHTML = planesDisponibles.map(p => {
            const modulosTxt = (p.modulos || []).length
                ? MODULOS_PERMISOS.filter(m => (p.modulos || []).includes(m.id)).map(m => m.nombre).join(', ')
                : 'Ningún módulo';
            const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
            return `
            <div class="card mb-3">
                <div class="card-body d-flex justify-content-between align-items-start">
                    <div>
                        <h5 class="mb-1">${p.nombre || p.id} ${p.activo === false ? '<span class="badge bg-secondary">Inactivo</span>' : ''}</h5>
                        <p class="text-muted mb-1">${p.descripcion || ''}</p>
                        <small class="text-muted d-block mb-1"><strong>Módulos:</strong> ${modulosTxt}</small>
                        <small class="text-muted">${p.precio ? fmt.format(p.precio) : 'Sin precio'} ${p.periodicidad ? '/ ' + p.periodicidad : ''}</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary btn-editar-plan" data-id="${p.id}">
                        <i class="bi bi-pencil"></i> Editar
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Error al cargar planes:', error);
        cont.innerHTML = `<div class="alert alert-danger">Error al cargar planes: ${error.message}</div>`;
    }
}

/** Refresca los <select> de plan del modal "Nueva empresa" y "Gestionar empresa". */
function actualizarSelectsDePlanes() {
    const opciones = planesDisponibles
        .filter(p => p.activo !== false)
        .map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    const selectCrear = document.getElementById('empresa-plan');
    if (selectCrear) {
        selectCrear.innerHTML = `<option value="">Sin plan (por ahora ve todos los módulos — asígnale uno luego desde "Gestionar")</option>` + opciones;
    }
    const selectGestion = document.getElementById('gestion-plan');
    if (selectGestion) {
        const valorPrevio = selectGestion.value;
        selectGestion.innerHTML = `<option value="">Sin plan</option>` + opciones;
        selectGestion.value = valorPrevio;
    }
}

function abrirModalPlan(plan) {
    document.getElementById('modalPlanTitle').textContent = plan ? 'Editar plan' : 'Nuevo plan';
    document.getElementById('plan-id').value = plan?.id || '';
    document.getElementById('plan-nombre').value = plan?.nombre || '';
    document.getElementById('plan-descripcion').value = plan?.descripcion || '';
    document.getElementById('plan-precio').value = plan?.precio ?? '';
    document.getElementById('plan-periodicidad').value = plan?.periodicidad || 'mensual';
    document.getElementById('plan-max-usuarios').value = plan?.limites?.maxUsuarios ?? '';
    document.getElementById('plan-max-productos').value = plan?.limites?.maxProductos ?? '';
    document.getElementById('plan-activo').checked = plan?.activo !== false;
    renderModulosChecklist('plan-modulos-lista', plan?.modulos || []);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPlan')).show();
}

document.getElementById('btn-nuevo-plan')?.addEventListener('click', () => abrirModalPlan(null));

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-editar-plan');
    if (!btn) return;
    const plan = planesDisponibles.find(p => p.id === btn.dataset.id);
    if (plan) abrirModalPlan(plan);
});

async function guardarPlan() {
    const idExistente = document.getElementById('plan-id').value;
    const nombre = document.getElementById('plan-nombre').value.trim();
    if (!nombre) {
        showToast('El nombre del plan es requerido.', 'error');
        return;
    }

    const datos = {
        nombre,
        descripcion: document.getElementById('plan-descripcion').value.trim(),
        precio: parseFloat(document.getElementById('plan-precio').value) || 0,
        periodicidad: document.getElementById('plan-periodicidad').value,
        modulos: leerModulosMarcados('plan-modulos-lista'),
        limites: {
            maxUsuarios: document.getElementById('plan-max-usuarios').value ? parseInt(document.getElementById('plan-max-usuarios').value, 10) : null,
            maxProductos: document.getElementById('plan-max-productos').value ? parseInt(document.getElementById('plan-max-productos').value, 10) : null
        },
        activo: document.getElementById('plan-activo').checked,
        updatedAt: serverTimestamp()
    };

    const btn = document.getElementById('btn-guardar-plan');
    btn.disabled = true;
    try {
        if (idExistente) {
            await updateDoc(doc(db, 'planes', idExistente), datos);
        } else {
            // slug simple a partir del nombre — los planes no necesitan un
            // identificador "bonito" como los tenants, solo ser únicos.
            const id = nombre.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('plan-' + Date.now());
            await setDoc(doc(db, 'planes', id), { ...datos, createdAt: serverTimestamp() });
        }
        showToast(`Plan "${nombre}" guardado.`);
        bootstrap.Modal.getInstance(document.getElementById('modalPlan'))?.hide();
        await cargarPlanes();
    } catch (error) {
        console.error('Error al guardar plan:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

document.getElementById('btn-guardar-plan')?.addEventListener('click', guardarPlan);

// ── Gestionar empresa (plan, módulos, estado, suscripción) ─────────────────

async function abrirModalGestionarEmpresa(tenantId, nombreEmpresa) {
    document.getElementById('gestion-tenant-id').value = tenantId;
    document.getElementById('gestion-empresa-nombre').textContent = nombreEmpresa || tenantId;

    if (!planesDisponibles.length) await cargarPlanes();
    actualizarSelectsDePlanes();

    let priv = {};
    try {
        const snap = await getDoc(doc(db, 'tenantsPrivado', tenantId));
        if (snap.exists()) priv = snap.data();
    } catch (error) {
        console.error('Error al leer datos privados de la empresa:', error);
    }

    let estadoActual = 'activo';
    try {
        const pubSnap = await getDoc(doc(db, 'tenants', tenantId));
        if (pubSnap.exists()) estadoActual = pubSnap.data().estado || 'activo';
    } catch (error) {
        console.error('Error al leer estado de la empresa:', error);
    }

    document.getElementById('gestion-estado').value = estadoActual;
    document.getElementById('gestion-plan').value = priv.planId || '';
    document.getElementById('gestion-fecha-vencimiento').value = priv.suscripcion?.fechaVencimiento
        ? priv.suscripcion.fechaVencimiento.toDate().toISOString().slice(0, 10) : '';
    document.getElementById('gestion-precio').value = priv.suscripcion?.precio ?? '';
    document.getElementById('gestion-periodicidad').value = priv.suscripcion?.periodicidad || '';
    document.getElementById('gestion-max-usuarios').value = priv.limites?.maxUsuarios ?? '';
    document.getElementById('gestion-max-productos').value = priv.limites?.maxProductos ?? '';

    pintarModulosDeGestion(priv);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGestionarEmpresa')).show();
}

/** Módulos efectivos = (plan.modulos ∪ modulosExtra) − modulosRevocados. */
function pintarModulosDeGestion(priv) {
    const planId = document.getElementById('gestion-plan').value;
    const plan = planesDisponibles.find(p => p.id === planId);
    const modulosPlan = plan?.modulos || [];
    const extra = priv?.modulosExtra || [];
    const revocados = new Set(priv?.modulosRevocados || []);
    const efectivos = Array.from(new Set([...modulosPlan, ...extra])).filter(m => !revocados.has(m));
    renderModulosChecklist('gestion-modulos-lista', efectivos, modulosPlan);
}

// Cambiar de plan en el modal recalcula la base "en plan" del checklist —
// las excepciones manuales que ya se hayan marcado en esta misma sesión de
// edición se pierden a propósito (cambiar de plan es una decisión grande,
// mejor partir de cero que arrastrar excepciones pensadas para otro plan).
document.getElementById('gestion-plan')?.addEventListener('change', () => pintarModulosDeGestion(null));

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-gestionar-empresa');
    if (!btn) return;
    abrirModalGestionarEmpresa(btn.dataset.id, btn.dataset.nombre);
});

async function guardarGestionEmpresa() {
    const tenantId = document.getElementById('gestion-tenant-id').value;
    if (!tenantId) return;

    const estado = document.getElementById('gestion-estado').value;
    const planId = document.getElementById('gestion-plan').value || null;
    const { modulosExtra, modulosRevocados } = leerModulosComoExcepciones('gestion-modulos-lista');
    const fechaVencInput = document.getElementById('gestion-fecha-vencimiento').value;
    const precio = document.getElementById('gestion-precio').value;
    const periodicidad = document.getElementById('gestion-periodicidad').value;
    const maxUsuarios = document.getElementById('gestion-max-usuarios').value;
    const maxProductos = document.getElementById('gestion-max-productos').value;

    const btn = document.getElementById('btn-guardar-gestion-empresa');
    btn.disabled = true;
    try {
        // tenants/{id} puede no existir todavía para Boutique (documento
        // legacy, ver cargarEmpresas) — merge:true lo crea si hace falta,
        // igual que ya hace guardarEdicionEmpresa().
        await setDoc(doc(db, 'tenants', tenantId), { estado, updatedAt: serverTimestamp() }, { merge: true });

        await setDoc(doc(db, 'tenantsPrivado', tenantId), {
            planId,
            modulosExtra,
            modulosRevocados,
            suscripcion: {
                fechaVencimiento: fechaVencInput ? Timestamp.fromDate(new Date(fechaVencInput + 'T23:59:59')) : null,
                precio: precio ? parseFloat(precio) : null,
                periodicidad: periodicidad || null
            },
            limites: {
                maxUsuarios: maxUsuarios ? parseInt(maxUsuarios, 10) : null,
                maxProductos: maxProductos ? parseInt(maxProductos, 10) : null
            },
            updatedAt: serverTimestamp()
        }, { merge: true });

        showToast('Empresa actualizada.');
        bootstrap.Modal.getInstance(document.getElementById('modalGestionarEmpresa'))?.hide();
        await cargarEmpresas();
    } catch (error) {
        console.error('Error al guardar gestión de empresa:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

document.getElementById('btn-guardar-gestion-empresa')?.addEventListener('click', guardarGestionEmpresa);

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

        ultimosUsuarios = usuarios;
        dashboardListo.usuarios = true;
        intentarRenderDashboard();

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

// ── Dashboard ────────────────────────────────────────────────────────────
// Todo lo que se pinta aquí sale de datos reales ya cargados (empresas,
// planes, usuarios) — nada de históricos inventados. Por eso no hay gráfico
// de tendencia de ingresos: no guardamos snapshots mensuales todavía: se
// puede agregar el día que empecemos a registrar eso.

const fmtMonedaDashboard = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function fechaDe(timestamp) {
    return timestamp?.toDate ? timestamp.toDate().getTime() : 0;
}

function formatFecha(timestamp) {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iniciales(nombre) {
    return (nombre || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '—';
}

/**
 * activo: estado='activo' y (sin vencimiento o vence en más de 30 días).
 * por-vencer: estado='activo' y vence dentro de 30 días.
 * vencida: la fecha de vencimiento ya pasó (sin importar el estado, salvo
 * que ya esté suspendida/cancelada, que manda sobre todo lo demás).
 * suspendida: estado='suspendido' o 'cancelado'.
 */
function categorizarEmpresa(tenant, priv) {
    const estado = tenant?.estado || 'activo';
    if (estado === 'suspendido' || estado === 'cancelado') return 'suspendida';
    const fechaVenc = priv?.suscripcion?.fechaVencimiento;
    if (fechaVenc?.toDate) {
        const diffDias = (fechaVenc.toDate() - new Date()) / 86400000;
        if (diffDias < 0) return 'vencida';
        if (diffDias <= 30) return 'por-vencer';
    }
    return 'activo';
}

function badgeEstadoHtml(categoria) {
    const mapa = {
        activo: '<span class="sa-badge sa-badge-solid">Activa</span>',
        'por-vencer': '<span class="sa-badge sa-badge-outline">Por vencer</span>',
        vencida: '<span class="sa-badge sa-badge-muted">Vencida</span>',
        suspendida: '<span class="sa-badge sa-badge-muted">Suspendida</span>'
    };
    return mapa[categoria] || mapa.activo;
}

function buildDonut(counts) {
    const entradas = [
        { key: 'activo', label: 'Activas', color: '#0a0a0a' },
        { key: 'porVencer', label: 'Por vencer', color: '#595959' },
        { key: 'vencida', label: 'Vencidas', color: '#a6a6a6' },
        { key: 'suspendida', label: 'Suspendidas', color: '#d9d9d9' }
    ];
    const total = entradas.reduce((s, e) => s + (counts[e.key] || 0), 0);
    const donutEl = document.getElementById('sa-donut');
    if (!total) {
        donutEl.style.setProperty('--sa-donut-bg', 'conic-gradient(#e6e6e6 0 100%)');
    } else {
        let acumulado = 0;
        const stops = entradas.map(e => {
            const valor = counts[e.key] || 0;
            const inicio = acumulado / total * 360;
            acumulado += valor;
            const fin = acumulado / total * 360;
            return `${e.color} ${inicio}deg ${fin}deg`;
        }).join(', ');
        donutEl.style.setProperty('--sa-donut-bg', `conic-gradient(${stops})`);
    }
    document.getElementById('sa-donut-total').textContent = total;
    document.getElementById('sa-donut-legend').innerHTML = entradas.map(e => {
        const valor = counts[e.key] || 0;
        const pct = total ? Math.round(valor / total * 100) : 0;
        return `<div class="sa-legend-item">
            <span class="sa-legend-dot" style="background:${e.color}"></span>
            <span class="sa-legend-name">${e.label}</span>
            <strong>${valor} (${pct}%)</strong>
        </div>`;
    }).join('');
}

function renderIngresosPorPlan(conPriv) {
    const cont = document.getElementById('ingresos-por-plan-list');
    const porPlan = new Map(); // planId -> { nombre, total }
    conPriv.forEach(({ tenant, priv }) => {
        if ((tenant.estado || 'activo') !== 'activo' || !priv?.planId) return;
        const plan = planesDisponibles.find(p => p.id === priv.planId);
        if (!plan) return;
        const precio = priv.suscripcion?.precio ?? plan.precio ?? 0;
        const periodicidad = priv.suscripcion?.periodicidad || plan.periodicidad || 'mensual';
        const mensual = periodicidad === 'anual' ? precio / 12 : precio;
        const prev = porPlan.get(plan.id) || { nombre: plan.nombre, total: 0 };
        prev.total += mensual;
        porPlan.set(plan.id, prev);
    });
    const filas = Array.from(porPlan.values()).sort((a, b) => b.total - a.total);
    if (!filas.length) {
        cont.innerHTML = '<div class="sa-empty-inline">Sin suscripciones activas con plan todavía.</div>';
        return;
    }
    const max = Math.max(...filas.map(f => f.total)) || 1;
    cont.innerHTML = filas.map(f => `
        <div class="sa-bar-row">
            <div class="sa-bar-row-head"><span>${f.nombre}</span><span>${fmtMonedaDashboard.format(f.total)}/mes</span></div>
            <div class="sa-bar-track"><div class="sa-bar-fill" style="width:${Math.max(4, f.total / max * 100)}%"></div></div>
        </div>
    `).join('');
}

function renderNuevasEmpresas(lista) {
    const cont = document.getElementById('lista-nuevas-empresas');
    const ordenado = [...lista].sort((a, b) => fechaDe(b.createdAt) - fechaDe(a.createdAt)).slice(0, 5);
    if (!ordenado.length) {
        cont.innerHTML = '<div class="sa-empty-inline">Sin empresas todavía.</div>';
        return;
    }
    cont.innerHTML = ordenado.map(t => `
        <div class="sa-list-item">
            <div class="sa-avatar">${iniciales(t.nombre || t.id)}</div>
            <div class="sa-list-item-body"><strong>${t.nombre || t.id}</strong><span>${t.id}</span></div>
            <div class="sa-list-item-meta">${formatFecha(t.createdAt)}</div>
        </div>
    `).join('');
}

function renderEmpresasRecientesTabla(lista, privadosPorId, usuarios) {
    const tbody = document.getElementById('tabla-empresas-recientes');
    const ordenado = [...lista].sort((a, b) => fechaDe(b.createdAt) - fechaDe(a.createdAt)).slice(0, 6);
    if (!ordenado.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="sa-empty-inline">Sin empresas todavía.</td></tr>';
        return;
    }
    tbody.innerHTML = ordenado.map(t => {
        const priv = privadosPorId.get(t.id);
        const plan = planesDisponibles.find(p => p.id === priv?.planId);
        const categoria = categorizarEmpresa(t, priv);
        const numUsuarios = usuarios.filter(u => u.tenantId === t.id).length;
        const venc = priv?.suscripcion?.fechaVencimiento ? formatFecha(priv.suscripcion.fechaVencimiento) : '—';
        const nombreEscapado = (t.nombre || '').replace(/"/g, '&quot;');
        return `<tr>
            <td>
                <div class="sa-table-company">
                    <div class="sa-avatar">${iniciales(t.nombre || t.id)}</div>
                    <div><strong>${t.nombre || t.id}</strong><span>${t.id}</span></div>
                </div>
            </td>
            <td>${plan ? plan.nombre : 'Sin plan'}</td>
            <td>${badgeEstadoHtml(categoria)}</td>
            <td>${numUsuarios}</td>
            <td>${venc}</td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-secondary btn-gestionar-empresa" data-id="${t.id}" data-nombre="${nombreEscapado}">Ver empresa</button>
            </td>
        </tr>`;
    }).join('');
}

function renderPorVencer(lista, privadosPorId) {
    const cont = document.getElementById('lista-por-vencer');
    const items = lista
        .map(t => ({ t, priv: privadosPorId.get(t.id) }))
        .filter(({ t, priv }) => categorizarEmpresa(t, priv) === 'por-vencer')
        .sort((a, b) => fechaDe(a.priv.suscripcion.fechaVencimiento) - fechaDe(b.priv.suscripcion.fechaVencimiento));

    if (!items.length) {
        cont.innerHTML = '<div class="sa-empty-inline">Nada por vencer en los próximos 30 días.</div>';
        return { count: 0, html: cont.innerHTML };
    }

    cont.innerHTML = items.map(({ t, priv }) => {
        const dias = Math.max(0, Math.ceil((priv.suscripcion.fechaVencimiento.toDate() - new Date()) / 86400000));
        const plan = planesDisponibles.find(p => p.id === priv.planId);
        return `<div class="sa-list-item">
            <div class="sa-avatar">${iniciales(t.nombre || t.id)}</div>
            <div class="sa-list-item-body"><strong>${t.nombre || t.id}</strong><span>${plan ? plan.nombre : 'Sin plan'}</span></div>
            <div class="sa-list-item-meta"><strong>${dias} día${dias === 1 ? '' : 's'}</strong>${formatFecha(priv.suscripcion.fechaVencimiento)}</div>
        </div>`;
    }).join('');

    return { count: items.length, html: cont.innerHTML };
}

function actualizarNotificaciones(info) {
    const badge = document.getElementById('sa-notif-badge');
    const lista = document.getElementById('sa-notif-list');
    const count = info?.count || 0;
    if (count > 0) {
        badge.style.display = 'flex';
        badge.textContent = count > 9 ? '9+' : String(count);
        lista.innerHTML = info.html;
    } else {
        badge.style.display = 'none';
        lista.innerHTML = '<div class="sa-notif-empty">Nada por vencer en los próximos 30 días.</div>';
    }
}

function renderDashboard(listaCompleta, privadosPorId, usuarios) {
    const conPriv = listaCompleta.map(t => ({ tenant: t, priv: privadosPorId.get(t.id) }));

    document.getElementById('stat-empresas').textContent = listaCompleta.filter(t => (t.estado || 'activo') === 'activo').length;
    document.getElementById('stat-empresas-total-sub').textContent = `de ${listaCompleta.length} empresa${listaCompleta.length === 1 ? '' : 's'}`;

    let suscripcionesActivas = 0;
    let ingresosMensuales = 0;
    conPriv.forEach(({ tenant, priv }) => {
        if ((tenant.estado || 'activo') !== 'activo' || !priv?.planId) return;
        suscripcionesActivas++;
        const plan = planesDisponibles.find(p => p.id === priv.planId);
        const precio = priv.suscripcion?.precio ?? plan?.precio ?? 0;
        const periodicidad = priv.suscripcion?.periodicidad || plan?.periodicidad || 'mensual';
        ingresosMensuales += periodicidad === 'anual' ? precio / 12 : precio;
    });
    document.getElementById('stat-suscripciones-activas').textContent = suscripcionesActivas;
    document.getElementById('stat-ingresos-mensuales').textContent = fmtMonedaDashboard.format(ingresosMensuales);

    const counts = { activo: 0, porVencer: 0, vencida: 0, suspendida: 0 };
    conPriv.forEach(({ tenant, priv }) => {
        const categoria = categorizarEmpresa(tenant, priv);
        if (categoria === 'activo') counts.activo++;
        else if (categoria === 'por-vencer') counts.porVencer++;
        else if (categoria === 'vencida') counts.vencida++;
        else counts.suspendida++;
    });
    document.getElementById('stat-por-vencer').textContent = counts.porVencer;
    buildDonut(counts);

    renderIngresosPorPlan(conPriv);
    renderNuevasEmpresas(listaCompleta);
    renderEmpresasRecientesTabla(listaCompleta, privadosPorId, usuarios);
    actualizarNotificaciones(renderPorVencer(listaCompleta, privadosPorId));
}

function intentarRenderDashboard() {
    if (dashboardListo.empresas && dashboardListo.usuarios) {
        renderDashboard(ultimaListaEmpresas, ultimosPrivadosPorId, ultimosUsuarios);
    }
}

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
        document.getElementById('sa-user-avatar').textContent = iniciales(usuario.nombre || 'Super Admin');

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
