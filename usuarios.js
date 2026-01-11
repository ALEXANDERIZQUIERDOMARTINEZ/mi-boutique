/**
 * usuarios.js - Gestión de Usuarios del Panel Admin
 * Maneja CRUD de usuarios y asignación de permisos
 */

import { getAuth, createUserWithEmailAndPassword, deleteUser as deleteAuthUser } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ROLES, PERMISOS } from './auth.js';

// Referencias globales
let usuariosCollection;
let db;
let auth;
let currentAuthManager;
let allUsuarios = [];

/**
 * Inicializa el módulo de gestión de usuarios
 */
export function initUsuariosManager(firebaseDb, authManager) {
    db = firebaseDb;
    auth = getAuth();
    currentAuthManager = authManager;
    usuariosCollection = collection(db, 'usuarios');

    // Event Listeners
    setupEventListeners();

    // Cargar usuarios
    loadUsuarios();
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

    // Checkboxes de grupo de permisos
    document.querySelectorAll('.permiso-grupo').forEach(checkbox => {
        checkbox.addEventListener('change', handleGrupoPermisoChange);
    });

    // Checkboxes individuales de permisos
    document.querySelectorAll('.permiso-item').forEach(checkbox => {
        checkbox.addEventListener('change', updateGrupoCheckbox);
    });

    // Búsqueda de usuarios
    document.getElementById('search-usuarios')?.addEventListener('input', handleUsuarioSearch);

    // Confirmar eliminación
    document.getElementById('confirm-delete-usuario')?.addEventListener('click', handleDeleteUsuario);

    // Botón logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('logoutBtnHeader')?.addEventListener('click', handleLogout);
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
            return;
        }

        snapshot.forEach((docSnap) => {
            const usuario = { id: docSnap.id, ...docSnap.data() };
            allUsuarios.push(usuario);
            renderUsuarioRow(usuario, tbody);
        });
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
    const canEdit = currentAuthManager?.hasPermission(PERMISOS.USUARIOS_GESTIONAR);

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
                    ${!canEdit || isCurrentUser ? 'disabled' : ''}
                    title="${isCurrentUser ? 'No puedes eliminarte a ti mismo' : 'Eliminar'}">
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
    if (!currentAuthManager?.hasPermission(PERMISOS.USUARIOS_GESTIONAR)) {
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
    document.getElementById('permisos-personalizados').style.display = 'none';

    // Limpiar todos los checkboxes de permisos
    document.querySelectorAll('.permiso-item').forEach(cb => cb.checked = false);
    document.querySelectorAll('.permiso-grupo').forEach(cb => cb.checked = false);

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

        // Cargar permisos si es personalizado
        if (usuario.rol === 'PERSONALIZADO') {
            document.getElementById('permisos-personalizados').style.display = 'block';

            // Marcar permisos del usuario
            document.querySelectorAll('.permiso-item').forEach(cb => {
                cb.checked = usuario.permisos.includes(cb.value);
            });

            // Actualizar checkboxes de grupo
            updateAllGrupoCheckboxes();
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

    // Obtener permisos según el rol
    let permisos = [];
    if (rol === 'PERSONALIZADO') {
        permisos = Array.from(document.querySelectorAll('.permiso-item:checked')).map(cb => cb.value);

        if (permisos.length === 0) {
            alert('Debes seleccionar al menos un permiso para el rol personalizado');
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
        }

        // Cerrar modal
        bootstrap.Modal.getInstance(document.getElementById('usuarioModal')).hide();

        // Mostrar mensaje de éxito
        showToast(`Usuario ${mode === 'add' ? 'creado' : 'actualizado'} exitosamente`, 'success');
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
 * Crear nuevo usuario
 */
async function createUsuario(email, password, nombre, rol, permisos, activo) {
    try {
        // Crear usuario en Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Guardar datos en Firestore con el mismo UID
        await setDoc(doc(db, 'usuarios', user.uid), {
            nombre,
            email,
            rol,
            permisos,
            activo,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        console.log('Usuario creado exitosamente:', user.uid);
    } catch (error) {
        console.error('Error al crear usuario:', error);
        throw new Error(getAuthErrorMessage(error.code));
    }
}

/**
 * Actualizar usuario existente
 */
async function updateUsuario(usuarioId, nombre, email, rol, permisos, activo) {
    try {
        const usuarioRef = doc(db, 'usuarios', usuarioId);

        await updateDoc(usuarioRef, {
            nombre,
            email, // Nota: cambiar email en Authentication requiere reautenticación
            rol,
            permisos,
            activo,
            updatedAt: serverTimestamp()
        });

        console.log('Usuario actualizado exitosamente');
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

    try {
        // Eliminar de Firestore
        await deleteDoc(doc(db, 'usuarios', usuarioId));

        // Nota: No podemos eliminar del Authentication desde el cliente
        // Esto debería hacerse desde el backend con Admin SDK

        bootstrap.Modal.getInstance(document.getElementById('deleteUsuarioModal')).hide();
        showToast('Usuario eliminado exitosamente', 'success');
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
 * Manejar cambio en checkbox de grupo
 */
function handleGrupoPermisoChange(e) {
    const grupo = e.target.dataset.grupo;
    const checked = e.target.checked;

    // Marcar/desmarcar todos los permisos del grupo
    document.querySelectorAll(`.permiso-item[data-grupo="${grupo}"]`).forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Actualizar checkbox de grupo según items
 */
function updateGrupoCheckbox(e) {
    const grupo = e.target.dataset.grupo;
    const grupoCheckbox = document.querySelector(`.permiso-grupo[data-grupo="${grupo}"]`);
    const items = document.querySelectorAll(`.permiso-item[data-grupo="${grupo}"]`);
    const checkedItems = document.querySelectorAll(`.permiso-item[data-grupo="${grupo}"]:checked`);

    if (grupoCheckbox) {
        grupoCheckbox.checked = items.length === checkedItems.length;
        grupoCheckbox.indeterminate = checkedItems.length > 0 && checkedItems.length < items.length;
    }
}

/**
 * Actualizar todos los checkboxes de grupo
 */
function updateAllGrupoCheckboxes() {
    const grupos = ['dashboard', 'ventas', 'inventario', 'clientes', 'logistica', 'finanzas', 'config', 'usuarios'];
    grupos.forEach(grupo => {
        const grupoCheckbox = document.querySelector(`.permiso-grupo[data-grupo="${grupo}"]`);
        const items = document.querySelectorAll(`.permiso-item[data-grupo="${grupo}"]`);
        const checkedItems = document.querySelectorAll(`.permiso-item[data-grupo="${grupo}"]:checked`);

        if (grupoCheckbox) {
            grupoCheckbox.checked = items.length === checkedItems.length;
            grupoCheckbox.indeterminate = checkedItems.length > 0 && checkedItems.length < items.length;
        }
    });
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
    // Usar el sistema de toast existente del admin
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        alert(message);
    }
}
