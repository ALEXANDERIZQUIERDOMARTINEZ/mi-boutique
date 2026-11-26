/**
 * usuarios.js - Gestión de Usuarios del Panel Admin
 * Maneja CRUD de usuarios y asignación de permisos
 */

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ROLES, PERMISOS, MODULOS_PERMISOS } from './auth.js?v=5';
// La versión debe coincidir con el <script type="module" src="auditoria.js?v=..."> de
// admin.html / admin-fabrica.html: un specifier de import distinto (con o sin query
// string distinta) hace que el navegador cargue auditoria.js como un módulo aparte,
// con su propio estado y sus propios listeners de 'adminAuthReady' — eso duplicaba
// filas y manejadores de clic en la sección Auditoría.
import { registrarAuditoria } from './auditoria.js?v=1.1.0';

// Referencias globales
let usuariosCollection;
let db;
let auth;
let currentAuthManager;
let allUsuarios = [];

/**
 * Convierte un arreglo de permisos ['ventas_ver', ...] al mapa
 * { ventas_ver: true, ... } que exigen las Security Rules de Firestore.
 */
// Empresa a la que pertenece un usuario nuevo (o uno viejo que quedó sin
// empresa). Antes se copiaba la del creador: si lo creaba Sistema (Super
// Admin, que no pertenece a ninguna empresa) el usuario quedaba con
// tenantId null y firestore.rules le negaba descontar stock y registrar
// ventas aunque tuviera todos los permisos marcados. Mismo criterio que
// auth.js: la empresa que se está viendo, la del creador, o 'boutique'.
//
// Sistema (Super Admin) no tiene empresa: si entró sin ?empresa=, se toma
// la de los productos del catálogo que está viendo (la empresa real de la
// tienda, p. ej. 'tenant_mishell_001'). Antes caía en 'boutique' y el
// vendedor quedaba en una empresa sin productos: no podía vender.
function empresaDelCatalogo() {
    const mapa = window.localProductsMap || window.fabricaProductsMap;
    if (!mapa || !mapa.size) return null;
    const conteo = new Map();
    mapa.forEach(p => { if (p?.tenantId) conteo.set(p.tenantId, (conteo.get(p.tenantId) || 0) + 1); });
    let mejor = null, max = 0;
    conteo.forEach((n, t) => { if (n > max) { mejor = t; max = n; } });
    return mejor;
}

function empresaParaUsuario(rol) {
    if (rol === 'SUPER_ADMIN') return null;
    return window.expectedTenantId || currentAuthManager?.getCurrentUser()?.tenantId || empresaDelCatalogo() || 'boutique';
}

// ¿La empresa guardada del usuario está mal? Vacía, o 'boutique' (lo que
// asignaba la versión anterior por defecto) cuando ningún producto del
// catálogo es de 'boutique' y la tienda real es otra.
function empresaEquivocada(tenantIdActual) {
    if (!tenantIdActual) return true;
    if (tenantIdActual !== 'boutique') return false;
    const real = empresaDelCatalogo();
    if (!real || real === 'boutique') return false;
    const mapa = window.localProductsMap || window.fabricaProductsMap;
    return ![...mapa.values()].some(p => p?.tenantId === 'boutique');
}

function permisosArrayAMapa(permisosArray) {
    const mapa = {};
    (permisosArray || []).forEach(p => { mapa[p] = true; });
    return mapa;
}

/**
 * Inicializa el módulo de gestión de usuarios
 */
export function initUsuariosManager(firebaseDb, authManager) {
    db = firebaseDb;
    auth = getAuth();
    currentAuthManager = authManager;
    usuariosCollection = collection(db, 'usuarios');

    renderPermisosCheckboxes();
    prepararUIContrasenas();

    // Event Listeners
    setupEventListeners();

    // Cargar usuarios
    loadUsuarios();
}

/**
 * Genera un checkbox por cada módulo/enlace del menú (MODULOS_PERMISOS en
 * auth.js), para "segmentar por módulos": activar o desactivar Ventas,
 * Productos, Clientes, etc. uno por uno para un usuario. Cada checkbox
 * guarda en data-permisos todos los permisos reales que ese módulo otorga.
 */
function renderPermisosCheckboxes() {
    const container = document.getElementById('permisos-personalizados-lista');
    if (!container) return;

    container.innerHTML = MODULOS_PERMISOS.map(modulo => `
        <div class="form-check">
            <input class="form-check-input modulo-item" type="checkbox" id="modulo-${modulo.id}" data-permisos="${modulo.permisos.join(',')}">
            <label class="form-check-label" for="modulo-${modulo.id}">${modulo.nombre}</label>
        </div>
    `).join('');
}

/**
 * Configurar event listeners
 */
function setupEventListeners() {
    // Botón agregar usuario
    document.getElementById('btn-add-usuario')?.addEventListener('click', showAddUsuarioModal);

    // Formulario de usuario
    document.getElementById('form-usuario')?.addEventListener('submit', handleUsuarioFormSubmit);

    // Cambio de rol
    document.getElementById('usuario-rol')?.addEventListener('change', handleRolChange);

    // Toggle contraseña
    document.getElementById('toggle-password')?.addEventListener('click', togglePasswordVisibility);

    // Búsqueda de usuarios
    document.getElementById('search-usuarios')?.addEventListener('input', handleUsuarioSearch);

    // Confirmar eliminación
    document.getElementById('confirm-delete-usuario')?.addEventListener('click', handleDeleteUsuario);

    // Botón logout en header
    document.getElementById('logoutBtnHeader')?.addEventListener('click', handleLogout);
}

// Debe coincidir con DIRECTORIO_KEY en login.html
const DIRECTORIO_KEY = 'mishellUsuariosDirectorio';

/**
 * Refresca en localStorage el directorio de usuarios (nombre + correo, sin
 * rol ni permisos) que usa login.html para mostrar el selector de usuario
 * sin escribir el correo — SOLO de este dispositivo/tenant.
 *
 * Antes esto también se guardaba en config/directorio_usuarios (lectura
 * pública) para que apareciera en cualquier dispositivo, incluso sin
 * sesión — pero esa colección es compartida entre TODAS las empresas de la
 * plataforma, así que cualquiera podía leer nombre y correo del personal
 * de cualquier otra empresa sin necesitar sesión. Se quitó: el directorio
 * ahora es solo una comodidad local por dispositivo (quien ya inició
 * sesión ahí antes aparece en la lista; los demás usan su correo).
 */
function actualizarDirectorioLocal(usuarios) {
    const directorio = usuarios
        .filter(u => u.activo)
        .map(u => ({ uid: u.id, nombre: u.nombre, email: u.email }));

    try {
        localStorage.setItem(DIRECTORIO_KEY, JSON.stringify(directorio));
    } catch (e) {
        console.warn('No se pudo actualizar la caché local del directorio de usuarios:', e);
    }
}

/**
 * Cargar lista de usuarios
 */
function loadUsuarios() {
    const tbody = document.getElementById('usuarios-table-body');

    // Listener en tiempo real
    onSnapshot(query(usuariosCollection, orderBy('createdAt', 'desc')), (snapshot) => {
        allUsuarios = [];
        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-5">
                        <i class="bi bi-person-x fs-1"></i>
                        <p class="mt-3 mb-0">No hay usuarios registrados</p>
                        <button class="btn btn-primary btn-sm mt-3" onclick="document.getElementById('btn-add-usuario').click()">
                            <i class="bi bi-person-plus me-2"></i>Crear Primer Usuario
                        </button>
                    </td>
                </tr>
            `;
            actualizarDirectorioLocal(allUsuarios);
            return;
        }

        snapshot.forEach((docSnap) => {
            const usuario = { id: docSnap.id, ...docSnap.data() };
            allUsuarios.push(usuario);
            renderUsuarioRow(usuario, tbody);
        });

        actualizarDirectorioLocal(allUsuarios);
    }, (error) => {
        // Permission-denied esperado para roles sin usuarios_ver: no hacemos nada,
        // el enlace "Usuarios" del menú ya está oculto para ellos.
        console.warn('No se pudo cargar la lista de usuarios:', error.code || error.message);
    });
}

/**
 * Renderizar fila de usuario
 */
function renderUsuarioRow(usuario, tbody) {
    const tr = document.createElement('tr');

    const rolInfo = ROLES[usuario.rol] || { nombre: usuario.rol };
    const estadoBadge = usuario.activo
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-secondary">Inactivo</span>';

    const ultimoAcceso = usuario.ultimoAcceso
        ? new Date(usuario.ultimoAcceso.seconds * 1000).toLocaleString('es-CO')
        : 'Nunca';

    // Verificar si es el usuario actual
    const isCurrentUser = currentAuthManager?.getCurrentUser()?.uid === usuario.id;
    // Editar: requiere permiso usuarios_editar (o usuarios_crear si aún no tiene ninguno)
    const canEdit = currentAuthManager?.hasPermission(PERMISOS.USUARIOS_EDITAR);
    // Eliminar: según firestore.rules, solo el Super Admin puede eliminar usuarios
    const canDelete = currentAuthManager?.isSuperAdmin();

    tr.innerHTML = `
        <td class="px-4">
            <div class="d-flex align-items-center">
                <div class="avatar-circle bg-primary text-white me-3">
                    ${usuario.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="fw-bold">${usuario.nombre}</div>
                    ${isCurrentUser ? '<small class="badge bg-info">Tú</small>' : ''}
                </div>
            </div>
        </td>
        <td>${usuario.email}</td>
        <td>
            <span class="badge bg-primary">${rolInfo.nombre}</span>
        </td>
        <td>${estadoBadge}</td>
        <td class="text-muted small">${ultimoAcceso}</td>
        <td class="text-center">
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="window.editUsuario('${usuario.id}')"
                    ${!canEdit ? 'disabled' : ''} title="Editar">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-outline-danger" onclick="window.deleteUsuarioConfirm('${usuario.id}', '${usuario.nombre}')"
                    ${!canDelete || isCurrentUser ? 'disabled' : ''}
                    title="${isCurrentUser ? 'No puedes eliminarte a ti mismo' : (canDelete ? 'Eliminar' : 'Solo el Super Administrador puede eliminar usuarios')}">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </td>
    `;

    tbody.appendChild(tr);
}

/**
 * Mostrar modal para agregar usuario
 */
function showAddUsuarioModal() {
    // Verificar permiso
    if (!currentAuthManager?.hasPermission(PERMISOS.USUARIOS_CREAR)) {
        alert('No tienes permiso para crear usuarios');
        return;
    }

    document.getElementById('usuarioModalTitle').innerHTML = '<i class="bi bi-person-plus me-2"></i>Nuevo Usuario';
    document.getElementById('usuario-mode').value = 'add';
    document.getElementById('usuario-id').value = '';
    document.getElementById('form-usuario').reset();
    document.getElementById('usuario-activo').checked = true;
    document.getElementById('password-group').style.display = 'block';
    document.getElementById('usuario-password').required = true;
    document.getElementById('usuario-password').type = 'password';
    document.querySelector('#toggle-password i')?.classList.replace('bi-eye-slash', 'bi-eye');
    document.getElementById('reset-password-group').style.display = 'none';
    document.getElementById('permisos-personalizados').style.display = 'none';

    // Limpiar todos los checkboxes de módulos
    document.querySelectorAll('.modulo-item').forEach(cb => cb.checked = false);

    const modal = new bootstrap.Modal(document.getElementById('usuarioModal'));
    modal.show();
}

/**
 * Editar usuario
 */
window.editUsuario = async function(usuarioId) {
    try {
        const usuario = allUsuarios.find(u => u.id === usuarioId);
        if (!usuario) {
            alert('Usuario no encontrado');
            return;
        }

        document.getElementById('usuarioModalTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Usuario';
        document.getElementById('usuario-mode').value = 'edit';
        document.getElementById('usuario-id').value = usuarioId;
        document.getElementById('usuario-nombre').value = usuario.nombre;
        document.getElementById('usuario-email').value = usuario.email;
        document.getElementById('usuario-rol').value = usuario.rol;
        document.getElementById('usuario-activo').checked = usuario.activo;

        // Ocultar campo de contraseña en edición
        document.getElementById('password-group').style.display = 'none';
        document.getElementById('usuario-password').required = false;
        document.getElementById('usuario-password').value = '';

        // Restablecer contraseña: solo si quien edita puede hacerlo (un
        // Admin no puede tocar la contraseña del Super Admin).
        const resetGroup = document.getElementById('reset-password-group');
        const puedeResetear = currentAuthManager?.isSuperAdmin() || usuario.rol !== 'SUPER_ADMIN';
        resetGroup.style.display = puedeResetear ? 'block' : 'none';
        const resetInput = document.getElementById('reset-password');
        resetInput.value = '';
        resetInput.type = 'password';
        document.querySelector('#toggle-reset-password i')?.classList.replace('bi-eye-slash', 'bi-eye');

        // Cargar módulos si es personalizado
        if (usuario.rol === 'PERSONALIZADO') {
            document.getElementById('permisos-personalizados').style.display = 'block';

            // Un módulo queda marcado si el usuario tiene TODOS los permisos que otorga
            // (permisos se guarda como mapa { permiso: true })
            document.querySelectorAll('.modulo-item').forEach(cb => {
                const permisosModulo = cb.dataset.permisos.split(',');
                cb.checked = permisosModulo.every(p => usuario.permisos?.[p] === true);
            });
        } else {
            handleRolChange();
        }

        const modal = new bootstrap.Modal(document.getElementById('usuarioModal'));
        modal.show();
    } catch (error) {
        console.error('Error al editar usuario:', error);
        alert('Error al cargar datos del usuario');
    }
};

/**
 * Confirmar eliminación de usuario
 */
window.deleteUsuarioConfirm = function(usuarioId, usuarioNombre) {
    document.getElementById('delete-usuario-name').textContent = usuarioNombre;
    document.getElementById('confirm-delete-usuario').dataset.usuarioId = usuarioId;

    const modal = new bootstrap.Modal(document.getElementById('deleteUsuarioModal'));
    modal.show();
};

/**
 * Manejar envío del formulario
 */
async function handleUsuarioFormSubmit(e) {
    e.preventDefault();

    const mode = document.getElementById('usuario-mode').value;
    const usuarioId = document.getElementById('usuario-id').value;
    const nombre = document.getElementById('usuario-nombre').value.trim();
    const email = document.getElementById('usuario-email').value.trim();
    const password = document.getElementById('usuario-password').value;
    const rol = document.getElementById('usuario-rol').value;
    const activo = document.getElementById('usuario-activo').checked;
    const nuevaPassword = mode === 'edit' && document.getElementById('reset-password-group').style.display !== 'none'
        ? document.getElementById('reset-password').value
        : '';

    if (nuevaPassword && nuevaPassword.length < 6) {
        alert('La nueva contraseña debe tener al menos 6 caracteres');
        return;
    }

    // Obtener permisos según el rol
    let permisos = [];
    if (rol === 'PERSONALIZADO') {
        permisos = Array.from(document.querySelectorAll('.modulo-item:checked'))
            .flatMap(cb => cb.dataset.permisos.split(','));

        if (permisos.length === 0) {
            alert('Debes seleccionar al menos un módulo para el usuario personalizado');
            return;
        }
    } else {
        permisos = ROLES[rol]?.permisos || [];
    }

    try {
        const btnSave = document.getElementById('btn-save-usuario');
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

        if (mode === 'add') {
            // Crear nuevo usuario
            await createUsuario(email, password, nombre, rol, permisos, activo);
        } else {
            // Actualizar usuario existente
            await updateUsuario(usuarioId, nombre, email, rol, permisos, activo);
            if (nuevaPassword) {
                await restablecerPassword(usuarioId, nuevaPassword, nombre, email);
            }
        }

        // Cerrar modal
        bootstrap.Modal.getInstance(document.getElementById('usuarioModal')).hide();

        // Mostrar mensaje de éxito
        showToast(`Usuario ${mode === 'add' ? 'creado' : 'actualizado'} exitosamente`, 'success');

        // Mostrar las credenciales para entregárselas al usuario
        if (mode === 'add') {
            mostrarCredenciales(nombre, email, password, 'Usuario creado');
        } else if (nuevaPassword) {
            mostrarCredenciales(nombre, email, nuevaPassword, 'Contraseña restablecida');
        }
    } catch (error) {
        console.error('Error al guardar usuario:', error);
        alert(`Error: ${error.message}`);
    } finally {
        const btnSave = document.getElementById('btn-save-usuario');
        btnSave.disabled = false;
        btnSave.innerHTML = '<i class="bi bi-save me-2"></i>Guardar Usuario';
    }
}

/**
 * Crear nuevo usuario.
 *
 * IMPORTANTE: createUserWithEmailAndPassword inicia sesión automáticamente
 * como el usuario recién creado en la instancia de Auth usada, lo que
 * cerraría la sesión del administrador que está creando la cuenta. Para
 * evitarlo, se usa una app secundaria de Firebase solo para este alta,
 * y se cierra su sesión inmediatamente sin tocar la sesión principal.
 */
async function createUsuario(email, password, nombre, rol, permisosArray, activo) {
    const secondaryApp = initializeApp(window.firebaseConfig, 'usuarios-secondary-' + Date.now());
    try {
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const user = userCredential.user;

        // Guardar datos en Firestore con el mismo UID
        await setDoc(doc(db, 'usuarios', user.uid), {
            nombre,
            email,
            rol,
            permisos: permisosArrayAMapa(permisosArray),
            tenantId: empresaParaUsuario(rol),
            activo,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await signOutSecondary(secondaryAuth);
        console.log('Usuario creado exitosamente:', user.uid);

        registrarAuditoria({
            accion: 'crear',
            modulo: 'usuario',
            entidadId: user.uid,
            entidadNombre: nombre,
            descripcion: `Creó al usuario "${nombre}" (${email}) con rol ${ROLES[rol]?.nombre || rol}`,
            detalles: { email, rol }
        });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        throw new Error(getAuthErrorMessage(error.code));
    } finally {
        await deleteApp(secondaryApp);
    }
}

/**
 * Actualizar usuario existente
 */
async function updateUsuario(usuarioId, nombre, email, rol, permisosArray, activo) {
    try {
        const usuarioRef = doc(db, 'usuarios', usuarioId);
        const cambios = {
            nombre,
            email, // Nota: cambiar email en Authentication requiere reautenticación
            rol,
            permisos: permisosArrayAMapa(permisosArray),
            activo,
            updatedAt: serverTimestamp()
        };

        // Usuario sin empresa o con la 'boutique' por defecto que no es la
        // de la tienda (ver empresaEquivocada): al guardarlo se le corrige,
        // para que pueda vender. Nunca se toca una empresa real que ya tenga.
        const actual = await getDoc(usuarioRef);
        if (actual.exists() && rol !== 'SUPER_ADMIN' && empresaEquivocada(actual.data().tenantId)) {
            cambios.tenantId = empresaParaUsuario(rol);
        }

        await updateDoc(usuarioRef, cambios);

        console.log('Usuario actualizado exitosamente');

        registrarAuditoria({
            accion: 'editar',
            modulo: 'usuario',
            entidadId: usuarioId,
            entidadNombre: nombre,
            descripcion: `Editó al usuario "${nombre}" (${email}) — rol: ${ROLES[rol]?.nombre || rol}, activo: ${activo ? 'sí' : 'no'}`,
            detalles: { email, rol, activo }
        });
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        throw error;
    }
}

/**
 * Eliminar usuario
 */
async function handleDeleteUsuario() {
    const usuarioId = document.getElementById('confirm-delete-usuario').dataset.usuarioId;
    const usuarioEliminado = allUsuarios.find(u => u.id === usuarioId);

    try {
        // Eliminar de Firestore
        await deleteDoc(doc(db, 'usuarios', usuarioId));

        // Nota: No podemos eliminar del Authentication desde el cliente
        // Esto debería hacerse desde el backend con Admin SDK

        bootstrap.Modal.getInstance(document.getElementById('deleteUsuarioModal')).hide();
        showToast('Usuario eliminado exitosamente', 'success');

        registrarAuditoria({
            accion: 'eliminar',
            modulo: 'usuario',
            entidadId: usuarioId,
            entidadNombre: usuarioEliminado?.nombre || usuarioId,
            descripcion: `Eliminó al usuario "${usuarioEliminado?.nombre || usuarioId}"${usuarioEliminado?.email ? ' (' + usuarioEliminado.email + ')' : ''}`,
            detalles: { email: usuarioEliminado?.email || null, rol: usuarioEliminado?.rol || null }
        });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        alert('Error al eliminar usuario: ' + error.message);
    }
}

/**
 * Manejar cambio de rol
 */
function handleRolChange() {
    const rol = document.getElementById('usuario-rol').value;
    const permisosDiv = document.getElementById('permisos-personalizados');
    const descriptionDiv = document.getElementById('rol-description');
    const descriptionList = document.getElementById('rol-description-list');

    if (rol === 'PERSONALIZADO') {
        permisosDiv.style.display = 'block';
        descriptionDiv.style.display = 'none';
    } else {
        permisosDiv.style.display = 'none';
        descriptionDiv.style.display = 'block';

        if (rol && ROLES[rol]) {
            const roleInfo = ROLES[rol];
            descriptionList.innerHTML = `
                <li><strong>${roleInfo.nombre}:</strong> ${roleInfo.descripcion}</li>
                <li class="mt-2"><strong>Permisos incluidos:</strong> ${roleInfo.permisos.length} permisos</li>
            `;
        } else {
            descriptionList.innerHTML = '<li>Selecciona un rol para ver su descripción</li>';
        }
    }
}

/**
 * Toggle visibilidad de contraseña
 */
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('usuario-password');
    const icon = document.querySelector('#toggle-password i');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.replace('bi-eye', 'bi-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.replace('bi-eye-slash', 'bi-eye');
    }
}

/**
 * Búsqueda de usuarios
 */
function handleUsuarioSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const tbody = document.getElementById('usuarios-table-body');
    tbody.innerHTML = '';

    const filteredUsuarios = allUsuarios.filter(usuario =>
        usuario.nombre.toLowerCase().includes(searchTerm) ||
        usuario.email.toLowerCase().includes(searchTerm) ||
        ROLES[usuario.rol]?.nombre.toLowerCase().includes(searchTerm)
    );

    if (filteredUsuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-5">
                    <i class="bi bi-search fs-1"></i>
                    <p class="mt-3 mb-0">No se encontraron usuarios</p>
                </td>
            </tr>
        `;
        return;
    }

    filteredUsuarios.forEach(usuario => renderUsuarioRow(usuario, tbody));
}

// ═══════════════════════════════════════════════════════════════════
// CONTRASEÑAS: sugerir, copiar y restablecer
// ═══════════════════════════════════════════════════════════════════

// Palabras cortas y fáciles de dictar (sin tildes ni ñ, para que se puedan
// escribir en cualquier teclado).
const PALABRAS_PASSWORD = [
    'Rosa', 'Luna', 'Sol', 'Mar', 'Cielo', 'Flor', 'Perla', 'Seda', 'Brisa', 'Coral',
    'Lino', 'Jade', 'Rubi', 'Oro', 'Plata', 'Nube', 'Gato', 'Tigre', 'Puma', 'Lobo',
    'Oso', 'Faro', 'Rio', 'Lago', 'Palma', 'Menta', 'Lima', 'Coco', 'Mango', 'Kiwi',
    'Fresa', 'Cereza', 'Canela', 'Vainilla', 'Cacao', 'Moda', 'Estilo', 'Brillo', 'Encaje', 'Satin'
];
const SIMBOLOS_PASSWORD = '!#$%*?@&';

function aleatorio(max) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
}

/**
 * Sugiere una contraseña fácil de recordar y de dictar, pero no trivial:
 * dos palabras + dos dígitos + un símbolo. Ej.: "LunaCoral47#"
 */
export function sugerirPassword() {
    const w1 = PALABRAS_PASSWORD[aleatorio(PALABRAS_PASSWORD.length)];
    let w2;
    do { w2 = PALABRAS_PASSWORD[aleatorio(PALABRAS_PASSWORD.length)]; } while (w2 === w1);
    const num = String(aleatorio(90) + 10);
    const sim = SIMBOLOS_PASSWORD[aleatorio(SIMBOLOS_PASSWORD.length)];
    return `${w1}${w2}${num}${sim}`;
}

async function copiarAlPortapapeles(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        // Respaldo para navegadores sin Clipboard API (o sin HTTPS)
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* nada */ }
        ta.remove();
        return ok;
    }
}

/**
 * Agrega al modal de usuario (admin.html y admin-fabrica.html comparten
 * este módulo) los botones "Sugerir" y "Copiar" junto a la contraseña, y la
 * sección "Restablecer contraseña" que solo se ve al editar.
 */
function prepararUIContrasenas() {
    const passwordGroup = document.getElementById('password-group');
    if (!passwordGroup || document.getElementById('reset-password-group')) return;

    // ── Crear usuario: Sugerir + Copiar ──
    const inputGroup = passwordGroup.querySelector('.input-group');
    inputGroup.insertAdjacentHTML('beforeend', `
        <button class="btn btn-outline-secondary" type="button" id="btn-sugerir-password" title="Sugerir contraseña"><i class="bi bi-magic"></i></button>
        <button class="btn btn-outline-secondary" type="button" id="btn-copiar-password" title="Copiar contraseña"><i class="bi bi-clipboard"></i></button>
    `);
    const passwordHint = passwordGroup.querySelector('small');
    if (passwordHint) passwordHint.innerHTML = 'Mínimo 6 caracteres. Toca <i class="bi bi-magic"></i> para que te sugiera una.';

    // ── Editar usuario: Restablecer contraseña ──
    passwordGroup.insertAdjacentHTML('afterend', `
        <div class="mb-3" id="reset-password-group" style="display:none;">
            <label for="reset-password" class="form-label">Nueva contraseña <span class="text-muted fw-normal">(opcional)</span>:</label>
            <div class="input-group">
                <input type="password" class="form-control" id="reset-password" minlength="6" autocomplete="new-password" placeholder="Déjala vacía para no cambiarla">
                <button class="btn btn-outline-secondary" type="button" id="toggle-reset-password" title="Mostrar/ocultar"><i class="bi bi-eye"></i></button>
                <button class="btn btn-outline-secondary" type="button" id="btn-sugerir-reset" title="Sugerir contraseña"><i class="bi bi-magic"></i></button>
                <button class="btn btn-outline-secondary" type="button" id="btn-copiar-reset" title="Copiar contraseña"><i class="bi bi-clipboard"></i></button>
            </div>
            <small class="text-muted d-block mt-1">
                Se cambia al tocar <strong>Guardar Usuario</strong>. La persona deberá usar la nueva contraseña desde ese momento.
            </small>
            <button type="button" class="btn btn-link btn-sm px-0 text-start" style="white-space:normal;" id="btn-reset-email">
                <i class="bi bi-envelope me-1"></i>O enviarle un enlace para que la cambie (solo si su correo es real)
            </button>
        </div>
    `);

    const vincular = (inputId, toggleId, sugerirId, copiarId, enlazarToggle = true) => {
        const input = document.getElementById(inputId);
        const mostrar = () => {
            input.type = 'text';
            document.querySelector(`#${toggleId} i`)?.classList.replace('bi-eye', 'bi-eye-slash');
        };
        if (enlazarToggle) document.getElementById(toggleId).addEventListener('click', () => {
            const icon = document.querySelector(`#${toggleId} i`);
            if (input.type === 'password') {
                mostrar();
            } else {
                input.type = 'password';
                icon?.classList.replace('bi-eye-slash', 'bi-eye');
            }
        });
        document.getElementById(sugerirId).addEventListener('click', () => {
            input.value = sugerirPassword();
            mostrar(); // que se vea la sugerencia para poder anotarla
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        document.getElementById(copiarId).addEventListener('click', async () => {
            if (!input.value) {
                showToast('Primero escribe o sugiere una contraseña', 'warning');
                return;
            }
            const ok = await copiarAlPortapapeles(input.value);
            showToast(ok ? 'Contraseña copiada' : 'No se pudo copiar', ok ? 'success' : 'error');
        });
    };
    // 'toggle-password' ya tiene su listener en setupEventListeners
    vincular('usuario-password', 'toggle-password', 'btn-sugerir-password', 'btn-copiar-password', false);
    vincular('reset-password', 'toggle-reset-password', 'btn-sugerir-reset', 'btn-copiar-reset');

    document.getElementById('btn-reset-email').addEventListener('click', enviarEnlaceRestablecimiento);
}

/**
 * Cambia la contraseña de otro usuario. Necesita el servidor
 * (api/usuarios-password.js): el SDK cliente de Firebase solo permite
 * cambiar la contraseña propia.
 */
async function restablecerPassword(usuarioId, password, nombre, email) {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

    let resp;
    try {
        resp = await fetch('/api/usuarios-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ uid: usuarioId, password })
        });
    } catch {
        throw new Error('Los datos se guardaron, pero no hay conexión para cambiar la contraseña. Inténtalo de nuevo.');
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        if (data.code === 'not-configured') {
            throw new Error('Los datos se guardaron, pero la contraseña NO se cambió: el servidor no encuentra la variable ' +
                'FIREBASE_SERVICE_ACCOUNT. Agrégala en Vercel (Settings → Environment Variables, entorno Production) ' +
                'y luego haz Redeploy: Vercel solo lee las variables nuevas al volver a desplegar.');
        }
        if (resp.status === 404) {
            throw new Error('Los datos se guardaron, pero la contraseña NO se cambió: la función del servidor ' +
                '(api/usuarios-password) no está publicada en este dominio. Revisa que el último despliegue de Vercel la incluya.');
        }
        throw new Error('Los datos se guardaron, pero la contraseña no se cambió: ' + (data.error || `error ${resp.status}`));
    }

    registrarAuditoria({
        accion: 'editar',
        modulo: 'usuario',
        entidadId: usuarioId,
        entidadNombre: nombre,
        descripcion: `Restableció la contraseña del usuario "${nombre}" (${email})`,
        detalles: { email, cambio: 'password' }
    });
}

/**
 * Alternativa sin servidor: Firebase envía al correo del usuario un enlace
 * para que él mismo elija una nueva contraseña.
 */
async function enviarEnlaceRestablecimiento() {
    const email = document.getElementById('usuario-email').value.trim();
    const nombre = document.getElementById('usuario-nombre').value.trim();
    if (!email) return;
    if (!confirm(`¿Enviar a ${email} un enlace para restablecer su contraseña?\n\nSolo funciona si ese correo existe y la persona tiene acceso a él.`)) return;

    try {
        await sendPasswordResetEmail(auth, email);
        showToast(`Enlace enviado a ${email}`, 'success');
        registrarAuditoria({
            accion: 'editar',
            modulo: 'usuario',
            entidadId: document.getElementById('usuario-id').value,
            entidadNombre: nombre,
            descripcion: `Envió un enlace de restablecimiento de contraseña a "${nombre}" (${email})`,
            detalles: { email, cambio: 'password_email' }
        });
    } catch (error) {
        console.error('Error al enviar enlace de restablecimiento:', error);
        alert('No se pudo enviar el enlace: ' + getAuthErrorMessage(error.code));
    }
}

/**
 * Muestra las credenciales recién creadas/cambiadas para entregárselas a la
 * persona (con botón para copiarlas).
 */
function mostrarCredenciales(nombre, email, password, titulo) {
    let modalEl = document.getElementById('credencialesModal');
    if (!modalEl) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="credencialesModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h1 class="modal-title fs-5"><i class="bi bi-key me-2"></i><span id="credenciales-titulo"></span></h1>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-2">Entrégale estos datos a <strong id="credenciales-nombre"></strong>:</p>
                            <div class="border rounded p-3 bg-body-tertiary" style="word-break:break-all;">
                                <div class="small text-muted">Correo</div>
                                <div class="fw-semibold mb-2" id="credenciales-email"></div>
                                <div class="small text-muted">Contraseña</div>
                                <div class="fw-semibold font-monospace fs-5" id="credenciales-password"></div>
                            </div>
                            <small class="text-muted d-block mt-2">Por seguridad no se vuelve a mostrar. Cópiala ahora si la necesitas.</small>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                            <button type="button" class="btn btn-primary" id="btn-copiar-credenciales"><i class="bi bi-clipboard me-2"></i>Copiar datos</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        modalEl = document.getElementById('credencialesModal');
        document.getElementById('btn-copiar-credenciales').addEventListener('click', async () => {
            const texto = `Usuario: ${document.getElementById('credenciales-email').textContent}\nContraseña: ${document.getElementById('credenciales-password').textContent}`;
            const ok = await copiarAlPortapapeles(texto);
            showToast(ok ? 'Datos copiados' : 'No se pudo copiar', ok ? 'success' : 'error');
        });
        // No dejar la contraseña en el DOM al cerrar
        modalEl.addEventListener('hidden.bs.modal', () => {
            document.getElementById('credenciales-password').textContent = '';
        });
    }

    document.getElementById('credenciales-titulo').textContent = titulo;
    document.getElementById('credenciales-nombre').textContent = nombre;
    document.getElementById('credenciales-email').textContent = email;
    document.getElementById('credenciales-password').textContent = password;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

/**
 * Cerrar sesión
 */
async function handleLogout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        try {
            await currentAuthManager.logout();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            alert('Error al cerrar sesión');
        }
    }
}

/**
 * Obtener mensaje de error de autenticación
 */
function getAuthErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'El correo electrónico ya está registrado',
        'auth/invalid-email': 'El correo electrónico no es válido',
        'auth/operation-not-allowed': 'Operación no permitida',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres)',
        'auth/user-disabled': 'El usuario ha sido deshabilitado',
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta'
    };

    return errorMessages[errorCode] || 'Error al crear usuario';
}

/**
 * Mostrar toast de notificación
 */
function showToast(message, type = 'success') {
    // Usar el sistema de toast existente del admin (admin.js expone window.showToast)
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}
