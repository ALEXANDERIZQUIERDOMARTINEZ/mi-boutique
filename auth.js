/**
 * auth.js - Sistema de Autenticación y Permisos
 * Maneja la verificación de usuarios y control de acceso al panel admin
 */

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Definición de permisos del sistema
// IMPORTANTE: estas claves deben coincidir exactamente con los permisos
// evaluados en firestore.rules (función hasPermission), ya que las Security
// Rules son la autoridad real — la UI solo debe reflejarlas.
export const PERMISOS = {
    // Dashboard
    DASHBOARD_VER: 'dashboard_ver',

    // Ventas
    VENTAS_VER: 'ventas_ver',
    VENTAS_CREAR: 'ventas_crear',
    VENTAS_EDITAR: 'ventas_editar',
    VENTAS_ANULAR: 'ventas_anular',
    VENTAS_ELIMINAR: 'ventas_eliminar',
    PEDIDOS_WEB_VER: 'pedidos_web_ver',
    PEDIDOS_WEB_GESTIONAR: 'pedidos_web_gestionar',
    APARTADOS_VER: 'apartados_ver',
    APARTADOS_CREAR: 'apartados_crear',
    APARTADOS_EDITAR: 'apartados_editar',
    APARTADOS_ELIMINAR: 'apartados_eliminar',
    APARTADOS_GESTIONAR: 'apartados_gestionar',

    // Inventario
    PRODUCTOS_VER: 'productos_ver',
    PRODUCTOS_CREAR: 'productos_crear',
    PRODUCTOS_EDITAR: 'productos_editar',
    PRODUCTOS_ELIMINAR: 'productos_eliminar',
    PRODUCTOS_IMPORTAR: 'productos_importar',
    CATEGORIAS_GESTIONAR: 'categorias_gestionar',

    // Clientes
    CLIENTES_VER: 'clientes_ver',
    CLIENTES_CREAR: 'clientes_crear',
    CLIENTES_EDITAR: 'clientes_editar',
    CLIENTES_ELIMINAR: 'clientes_eliminar',

    // Logística
    REPARTIDORES_GESTIONAR: 'repartidores_gestionar',
    PROMOCIONES_GESTIONAR: 'promociones_gestionar',
    PROVEEDORES_GESTIONAR: 'proveedores_gestionar',

    // Finanzas
    FINANZAS_VER: 'finanzas_ver',
    FINANZAS_GESTIONAR: 'finanzas_gestionar',
    CIERRES_CAJA: 'cierres_caja',

    // Soporte
    CHAT_RESPONDER: 'chat_responder',

    // Usuarios
    USUARIOS_VER: 'usuarios_ver',
    USUARIOS_CREAR: 'usuarios_crear',
    USUARIOS_EDITAR: 'usuarios_editar'
};

// Grupos de permisos para mostrar los checkboxes agrupados en el panel de Usuarios
export const GRUPOS_PERMISOS = [
    { id: 'dashboard', nombre: 'Dashboard', permisos: [PERMISOS.DASHBOARD_VER] },
    { id: 'ventas', nombre: 'Ventas y pedidos', permisos: [
        PERMISOS.VENTAS_VER, PERMISOS.VENTAS_CREAR, PERMISOS.VENTAS_EDITAR, PERMISOS.VENTAS_ANULAR, PERMISOS.VENTAS_ELIMINAR,
        PERMISOS.PEDIDOS_WEB_VER, PERMISOS.PEDIDOS_WEB_GESTIONAR,
        PERMISOS.APARTADOS_VER, PERMISOS.APARTADOS_CREAR, PERMISOS.APARTADOS_EDITAR, PERMISOS.APARTADOS_ELIMINAR, PERMISOS.APARTADOS_GESTIONAR
    ] },
    { id: 'inventario', nombre: 'Inventario', permisos: [
        PERMISOS.PRODUCTOS_VER, PERMISOS.PRODUCTOS_CREAR, PERMISOS.PRODUCTOS_EDITAR, PERMISOS.PRODUCTOS_ELIMINAR, PERMISOS.PRODUCTOS_IMPORTAR,
        PERMISOS.CATEGORIAS_GESTIONAR
    ] },
    { id: 'clientes', nombre: 'Clientes', permisos: [
        PERMISOS.CLIENTES_VER, PERMISOS.CLIENTES_CREAR, PERMISOS.CLIENTES_EDITAR, PERMISOS.CLIENTES_ELIMINAR
    ] },
    { id: 'logistica', nombre: 'Logística', permisos: [
        PERMISOS.REPARTIDORES_GESTIONAR, PERMISOS.PROMOCIONES_GESTIONAR, PERMISOS.PROVEEDORES_GESTIONAR
    ] },
    { id: 'finanzas', nombre: 'Finanzas', permisos: [
        PERMISOS.FINANZAS_VER, PERMISOS.FINANZAS_GESTIONAR, PERMISOS.CIERRES_CAJA
    ] },
    { id: 'soporte', nombre: 'Chat / Soporte', permisos: [PERMISOS.CHAT_RESPONDER] },
    { id: 'usuarios', nombre: 'Usuarios', permisos: [
        PERMISOS.USUARIOS_VER, PERMISOS.USUARIOS_CREAR, PERMISOS.USUARIOS_EDITAR
    ] }
];

// Roles predefinidos con sus permisos.
// NOTA: aquí los permisos se definen como arreglo por comodidad de lectura;
// usuarios.js los convierte al formato de mapa { permiso: true } que exigen
// las Security Rules antes de guardarlos en Firestore.
export const ROLES = {
    SUPER_ADMIN: {
        nombre: 'Sistema (Super Administrador)',
        descripcion: 'Acceso total al sistema',
        permisos: Object.values(PERMISOS) // Todos los permisos
    },
    ADMIN: {
        nombre: 'Administrador',
        descripcion: 'Acceso completo a la tienda, excepto gestión de usuarios',
        permisos: Object.values(PERMISOS).filter(p => !p.startsWith('usuarios_'))
    },
    VENDEDOR: {
        nombre: 'Vendedor',
        descripcion: 'Registra ventas, ve inventario y gestiona clientes y apartados',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.VENTAS_VER,
            PERMISOS.VENTAS_CREAR,
            PERMISOS.VENTAS_EDITAR,
            PERMISOS.PRODUCTOS_VER,
            PERMISOS.CLIENTES_VER,
            PERMISOS.CLIENTES_CREAR,
            PERMISOS.APARTADOS_VER,
            PERMISOS.APARTADOS_CREAR,
            PERMISOS.APARTADOS_EDITAR,
            PERMISOS.APARTADOS_GESTIONAR,
            PERMISOS.PEDIDOS_WEB_VER
        ]
    },
    INVENTARIO: {
        nombre: 'Inventario',
        descripcion: 'Registra y gestiona productos y categorías',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.PRODUCTOS_VER,
            PERMISOS.PRODUCTOS_CREAR,
            PERMISOS.PRODUCTOS_EDITAR,
            PERMISOS.PRODUCTOS_IMPORTAR,
            PERMISOS.CATEGORIAS_GESTIONAR
        ]
    },
    CONTADOR: {
        nombre: 'Contador',
        descripcion: 'Ver ventas y gestionar finanzas y cierres de caja',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.VENTAS_VER,
            PERMISOS.FINANZAS_VER,
            PERMISOS.FINANZAS_GESTIONAR,
            PERMISOS.CIERRES_CAJA
        ]
    },
    REPARTIDOR: {
        nombre: 'Repartidor',
        descripcion: 'Ver pedidos web y gestionar entregas',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.PEDIDOS_WEB_VER,
            PERMISOS.PEDIDOS_WEB_GESTIONAR
        ]
    },
    VISUALIZADOR: {
        nombre: 'Visualizador',
        descripcion: 'Solo lectura de dashboard, ventas, productos y clientes',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.VENTAS_VER,
            PERMISOS.PRODUCTOS_VER,
            PERMISOS.CLIENTES_VER
        ]
    }
};

// Clase principal de autenticación
export class AuthManager {
    constructor(firebaseApp) {
        this.auth = getAuth(firebaseApp);
        this.db = getFirestore(firebaseApp);
        this.currentUser = null;
        this.userPermissions = [];
    }

    /**
     * Inicializa la protección del admin panel
     */
    async init() {
        return new Promise((resolve, reject) => {
            onAuthStateChanged(this.auth, async (user) => {
                if (!user) {
                    // No hay usuario autenticado
                    this.redirectToLogin();
                    reject('No authenticated user');
                    return;
                }

                try {
                    // Verificar que el usuario existe en la colección 'usuarios'
                    const userDoc = await getDoc(doc(this.db, 'usuarios', user.uid));

                    if (!userDoc.exists()) {
                        // Usuario no autorizado
                        await this.logout();
                        alert('Usuario no autorizado para acceder al panel de administración');
                        reject('User not authorized');
                        return;
                    }

                    const userData = userDoc.data();

                    // Verificar que el usuario está activo
                    if (!userData.activo) {
                        await this.logout();
                        alert('Tu cuenta está desactivada. Contacta al administrador');
                        reject('User disabled');
                        return;
                    }

                    // Guardar datos del usuario
                    this.currentUser = {
                        uid: user.uid,
                        email: user.email,
                        nombre: userData.nombre,
                        rol: userData.rol,
                        tenantId: userData.tenantId ?? null,
                        permisos: userData.permisos || {}
                    };

                    this.userPermissions = this.currentUser.permisos;

                    // Guardar en sessionStorage
                    sessionStorage.setItem('adminUser', JSON.stringify(this.currentUser));

                    // Aplicar restricciones de UI
                    this.applyUIRestrictions();

                    resolve(this.currentUser);
                } catch (error) {
                    console.error('Error verificando usuario:', error);
                    this.redirectToLogin();
                    reject(error);
                }
            });
        });
    }

    /**
     * Redirige al login
     */
    redirectToLogin() {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }

    /**
     * Cierra sesión
     */
    async logout() {
        try {
            await signOut(this.auth);
            sessionStorage.removeItem('adminUser');
            this.currentUser = null;
            this.userPermissions = [];
            this.redirectToLogin();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            throw error;
        }
    }

    /**
     * Verifica si el usuario tiene un permiso específico
     * (permisos se guarda como mapa { permiso: true }, igual que en firestore.rules)
     */
    hasPermission(permission) {
        if (!this.currentUser) return false;
        if (this.isSuperAdmin()) return true;
        return this.userPermissions?.[permission] === true;
    }

    /**
     * Verifica si el usuario tiene al menos uno de los permisos
     */
    hasAnyPermission(permissions) {
        if (!this.currentUser) return false;
        if (this.isSuperAdmin()) return true;
        return permissions.some(p => this.userPermissions?.[p] === true);
    }

    /**
     * Verifica si el usuario tiene todos los permisos
     */
    hasAllPermissions(permissions) {
        if (!this.currentUser) return false;
        if (this.isSuperAdmin()) return true;
        return permissions.every(p => this.userPermissions?.[p] === true);
    }

    /**
     * Verifica si el usuario es super admin
     */
    isSuperAdmin() {
        return this.currentUser?.rol === 'SUPER_ADMIN';
    }

    /**
     * Aplica restricciones de UI según permisos del usuario.
     * El ocultamiento del menú (rail nav) se hace en admin-auth-init.js
     * mediante atributos data-permiso/data-roles, ya que depende del
     * layout específico de cada panel (admin.html usa un rail, no navbar).
     */
    applyUIRestrictions() {
        this.updateUserInfo();
    }

    /**
     * Actualiza la información del usuario en la UI (nombre y rol)
     */
    updateUserInfo() {
        if (!this.currentUser) return;
        const roleName = ROLES[this.currentUser.rol]?.nombre || this.currentUser.rol;

        const nameTargets = ['currentUserInfo', 'rail-admin-name', 'topbar-admin-name'];
        nameTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = this.currentUser.nombre;
        });

        const roleTargets = ['currentUserRole', 'rail-profile-role'];
        roleTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = roleName;
        });
    }

    /**
     * Obtiene el usuario actual
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Obtiene los permisos del usuario actual
     */
    getPermissions() {
        return this.userPermissions;
    }
}

// Función auxiliar para crear el manejador de permisos
export function createPermissionChecker(authManager) {
    return {
        can: (permission) => authManager.hasPermission(permission),
        canAny: (permissions) => authManager.hasAnyPermission(permissions),
        canAll: (permissions) => authManager.hasAllPermissions(permissions),
        isSuperAdmin: () => authManager.isSuperAdmin(),

        // Utilidad para deshabilitar elementos sin permisos
        protectButton: (buttonElement, permission, message = 'No tienes permiso para esta acción') => {
            if (!authManager.hasPermission(permission)) {
                buttonElement.disabled = true;
                buttonElement.title = message;
                buttonElement.classList.add('opacity-50');
                buttonElement.style.cursor = 'not-allowed';
            }
        },

        // Utilidad para ocultar elementos sin permisos
        hideIfNoPermission: (element, permission) => {
            if (!authManager.hasPermission(permission)) {
                element.style.display = 'none';
            }
        }
    };
}

// Export default
export default AuthManager;
