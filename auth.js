/**
 * auth.js - Sistema de Autenticación y Permisos
 * Maneja la verificación de usuarios y control de acceso al panel admin
 */

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Definición de permisos del sistema
export const PERMISOS = {
    // Dashboard
    DASHBOARD_VER: 'dashboard_ver',

    // Ventas
    VENTAS_REGISTRAR: 'ventas_registrar',
    VENTAS_VER: 'ventas_ver',
    VENTAS_EDITAR: 'ventas_editar',
    VENTAS_ELIMINAR: 'ventas_eliminar',
    PEDIDOS_WEB_VER: 'pedidos_web_ver',
    PEDIDOS_WEB_GESTIONAR: 'pedidos_web_gestionar',
    APARTADOS_VER: 'apartados_ver',
    APARTADOS_GESTIONAR: 'apartados_gestionar',

    // Inventario
    PRODUCTOS_VER: 'productos_ver',
    PRODUCTOS_CREAR: 'productos_crear',
    PRODUCTOS_EDITAR: 'productos_editar',
    PRODUCTOS_ELIMINAR: 'productos_eliminar',
    PRODUCTOS_CARGUE_MASIVO: 'productos_cargue_masivo',
    CATEGORIAS_VER: 'categorias_ver',
    CATEGORIAS_GESTIONAR: 'categorias_gestionar',

    // Clientes
    CLIENTES_VER: 'clientes_ver',
    CLIENTES_GESTIONAR: 'clientes_gestionar',

    // Logística
    REPARTIDORES_VER: 'repartidores_ver',
    REPARTIDORES_GESTIONAR: 'repartidores_gestionar',
    PROMOCIONES_VER: 'promociones_ver',
    PROMOCIONES_GESTIONAR: 'promociones_gestionar',

    // Finanzas
    FINANZAS_VER: 'finanzas_ver',
    FINANZAS_GESTIONAR: 'finanzas_gestionar',
    CIERRES_CAJA_VER: 'cierres_caja_ver',
    CIERRES_CAJA_GESTIONAR: 'cierres_caja_gestionar',

    // Configuración
    CONFIG_VER: 'config_ver',
    CONFIG_BACKUP: 'config_backup',

    // Usuarios (solo super-admin)
    USUARIOS_VER: 'usuarios_ver',
    USUARIOS_GESTIONAR: 'usuarios_gestionar'
};

// Roles predefinidos con sus permisos
export const ROLES = {
    SUPER_ADMIN: {
        nombre: 'Super Administrador',
        descripcion: 'Acceso total al sistema',
        permisos: Object.values(PERMISOS) // Todos los permisos
    },
    ADMIN: {
        nombre: 'Administrador',
        descripcion: 'Acceso completo excepto gestión de usuarios',
        permisos: Object.values(PERMISOS).filter(p => !p.startsWith('usuarios_'))
    },
    VENDEDOR: {
        nombre: 'Vendedor',
        descripcion: 'Registrar ventas, ver inventario y clientes',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.VENTAS_REGISTRAR,
            PERMISOS.VENTAS_VER,
            PERMISOS.PRODUCTOS_VER,
            PERMISOS.CLIENTES_VER,
            PERMISOS.APARTADOS_VER,
            PERMISOS.APARTADOS_GESTIONAR
        ]
    },
    INVENTARIO: {
        nombre: 'Gestión de Inventario',
        descripcion: 'Gestionar productos y categorías',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.PRODUCTOS_VER,
            PERMISOS.PRODUCTOS_CREAR,
            PERMISOS.PRODUCTOS_EDITAR,
            PERMISOS.PRODUCTOS_CARGUE_MASIVO,
            PERMISOS.CATEGORIAS_VER,
            PERMISOS.CATEGORIAS_GESTIONAR
        ]
    },
    CONTADOR: {
        nombre: 'Contador',
        descripcion: 'Ver y gestionar finanzas',
        permisos: [
            PERMISOS.DASHBOARD_VER,
            PERMISOS.VENTAS_VER,
            PERMISOS.FINANZAS_VER,
            PERMISOS.FINANZAS_GESTIONAR,
            PERMISOS.CIERRES_CAJA_VER,
            PERMISOS.CIERRES_CAJA_GESTIONAR
        ]
    },
    REPARTIDOR: {
        nombre: 'Repartidor',
        descripcion: 'Ver pedidos web y gestionar entregas',
        permisos: [
            PERMISOS.PEDIDOS_WEB_VER,
            PERMISOS.PEDIDOS_WEB_GESTIONAR
        ]
    },
    VISUALIZADOR: {
        nombre: 'Visualizador',
        descripcion: 'Solo lectura de dashboard y reportes',
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
                        permisos: userData.permisos || []
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
     */
    hasPermission(permission) {
        if (!this.currentUser) return false;
        return this.userPermissions.includes(permission);
    }

    /**
     * Verifica si el usuario tiene al menos uno de los permisos
     */
    hasAnyPermission(permissions) {
        if (!this.currentUser) return false;
        return permissions.some(p => this.userPermissions.includes(p));
    }

    /**
     * Verifica si el usuario tiene todos los permisos
     */
    hasAllPermissions(permissions) {
        if (!this.currentUser) return false;
        return permissions.every(p => this.userPermissions.includes(p));
    }

    /**
     * Verifica si el usuario es super admin
     */
    isSuperAdmin() {
        return this.currentUser?.rol === 'SUPER_ADMIN';
    }

    /**
     * Aplica restricciones de UI según permisos del usuario
     */
    applyUIRestrictions() {
        // Mapeo de permisos a elementos de navegación
        const navPermissions = {
            // Dashboard
            'a[href="#dashboard"]': [PERMISOS.DASHBOARD_VER],

            // Ventas
            'a[href="#ventas"]': [PERMISOS.VENTAS_REGISTRAR],
            'a[href="#pedidos-web"]': [PERMISOS.PEDIDOS_WEB_VER],
            'a[href="#apartados"]': [PERMISOS.APARTADOS_VER],

            // Inventario
            'a[href="#productos"]': [PERMISOS.PRODUCTOS_VER],
            'a[href="#cargue-masivo"]': [PERMISOS.PRODUCTOS_CARGUE_MASIVO],
            'a[href="#categorias"]': [PERMISOS.CATEGORIAS_VER],

            // Clientes
            'a[href="#clientes"]': [PERMISOS.CLIENTES_VER],

            // Logística
            'a[href="#repartidores"]': [PERMISOS.REPARTIDORES_VER],
            'a[href="#promociones"]': [PERMISOS.PROMOCIONES_VER],

            // Finanzas
            'a[href="#finanzas"]': [PERMISOS.FINANZAS_VER],

            // Configuración
            'a[href="#configuracion"]': [PERMISOS.CONFIG_VER],

            // Usuarios
            'a[href="#usuarios"]': [PERMISOS.USUARIOS_VER]
        };

        // Ocultar elementos de navegación sin permisos
        Object.entries(navPermissions).forEach(([selector, requiredPermissions]) => {
            const element = document.querySelector(selector);
            if (element) {
                const hasPermission = this.hasAnyPermission(requiredPermissions);
                const listItem = element.closest('li');

                if (!hasPermission) {
                    if (listItem) {
                        listItem.style.display = 'none';
                    } else {
                        element.style.display = 'none';
                    }
                }
            }
        });

        // Ocultar dropdowns vacíos
        document.querySelectorAll('.nav-item.dropdown').forEach(dropdown => {
            const visibleItems = Array.from(dropdown.querySelectorAll('.dropdown-menu li'))
                .filter(li => li.style.display !== 'none');

            if (visibleItems.length === 0) {
                dropdown.style.display = 'none';
            }
        });

        // ✅ Ocultar elementos del dashboard según permisos
        this.applyDashboardRestrictions();

        // Mostrar nombre del usuario en la UI
        this.updateUserInfo();
    }

    /**
     * Aplica restricciones en el dashboard según permisos
     */
    applyDashboardRestrictions() {
        console.log('🔒 Aplicando restricciones de dashboard...');
        console.log('📋 Permisos del usuario:', this.userPermissions);

        // Ocultar tarjeta de "Ventas Hoy" si no tiene permiso de ventas
        if (!this.hasPermission(PERMISOS.VENTAS_VER)) {
            console.log('❌ Sin permiso de ventas - ocultando tarjeta de ventas');
            const ventasCard = document.querySelector('.dashboard-card.card-ventas');
            if (ventasCard) {
                ventasCard.closest('.col-md-3, .col-sm-6')?.remove();
            }
        }

        // Ocultar tarjeta de "Apartados" si no tiene permiso de apartados
        if (!this.hasPermission(PERMISOS.APARTADOS_VER)) {
            console.log('❌ Sin permiso de apartados - ocultando tarjeta de apartados');
            const apartadosCard = document.querySelector('.dashboard-card.card-apartados');
            if (apartadosCard) {
                apartadosCard.closest('.col-md-3, .col-sm-6')?.remove();
            }
        }

        // Ocultar tarjeta de "Productos" si no tiene permiso de productos
        if (!this.hasPermission(PERMISOS.PRODUCTOS_VER)) {
            console.log('❌ Sin permiso de productos - ocultando tarjeta de productos');
            const productosCard = document.querySelector('.dashboard-card.card-productos');
            if (productosCard) {
                productosCard.closest('.col-md-3, .col-sm-6')?.remove();
            }
        }

        // Ocultar sección completa de "Inversión e Inventario" si no tiene permiso de finanzas
        if (!this.hasPermission(PERMISOS.FINANZAS_VER)) {
            console.log('❌ Sin permiso de finanzas - ocultando sección Inversión e Inventario');
            // Buscar el título de la sección
            const sectionTitles = document.querySelectorAll('h5.text-muted');
            console.log('🔍 Títulos encontrados:', sectionTitles.length);
            sectionTitles.forEach(title => {
                console.log('📝 Título encontrado:', title.textContent.trim());
                if (title.textContent.includes('Inversión e Inventario')) {
                    console.log('✅ Encontrado título "Inversión e Inventario" - ocultando...');
                    // Guardar referencias antes de eliminar
                    const parent = title.parentElement;
                    const nextRow = parent?.nextElementSibling;

                    // Ocultar el título
                    if (parent) {
                        parent.style.display = 'none';
                        console.log('✓ Título ocultado');
                    }

                    // Ocultar la siguiente fila (las tarjetas)
                    if (nextRow && nextRow.classList.contains('row')) {
                        nextRow.style.display = 'none';
                        console.log('✓ Tarjetas ocultadas');
                    }
                }
            });
        }

        // Ocultar sección de "Análisis de Datos" (gráfica de ventas) si no tiene permiso de ventas
        if (!this.hasPermission(PERMISOS.VENTAS_VER)) {
            const sectionTitles = document.querySelectorAll('h5.text-muted');
            sectionTitles.forEach(title => {
                if (title.textContent.includes('Análisis de Datos')) {
                    // Guardar referencias antes de ocultar
                    const parent = title.parentElement;
                    const nextRow = parent?.nextElementSibling;

                    // Ocultar el título
                    if (parent) {
                        parent.style.display = 'none';
                    }

                    // Ocultar la siguiente fila (las tarjetas)
                    if (nextRow && nextRow.classList.contains('row')) {
                        nextRow.style.display = 'none';
                    }
                }
            });
        }

        // Ocultar tarjetas de "Accesos Rápidos" según permisos
        this.applyQuickAccessRestrictions();
    }

    /**
     * Aplica restricciones en la sección de Accesos Rápidos
     */
    applyQuickAccessRestrictions() {
        // Pedidos Web
        if (!this.hasPermission(PERMISOS.PEDIDOS_WEB_VER)) {
            const cards = document.querySelectorAll('.hover-card');
            cards.forEach(card => {
                if (card.innerHTML.includes('Pedidos Web')) {
                    card.closest('.col-sm-6, .col-lg-3')?.remove();
                }
            });
        }

        // Clientes
        if (!this.hasPermission(PERMISOS.CLIENTES_VER)) {
            const cards = document.querySelectorAll('.hover-card');
            cards.forEach(card => {
                if (card.innerHTML.includes('Gestionar clientes')) {
                    card.closest('.col-sm-6, .col-lg-3')?.remove();
                }
            });
        }

        // Promociones
        if (!this.hasPermission(PERMISOS.PROMOCIONES_VER)) {
            const cards = document.querySelectorAll('.hover-card');
            cards.forEach(card => {
                if (card.innerHTML.includes('Promociones')) {
                    card.closest('.col-sm-6, .col-lg-3')?.remove();
                }
            });
        }

        // Repartidores
        if (!this.hasPermission(PERMISOS.REPARTIDORES_VER)) {
            const cards = document.querySelectorAll('.hover-card');
            cards.forEach(card => {
                if (card.innerHTML.includes('Repartidores')) {
                    card.closest('.col-sm-6, .col-lg-3')?.remove();
                }
            });
        }
    }

    /**
     * Actualiza la información del usuario en la UI
     */
    updateUserInfo() {
        const userInfoElement = document.getElementById('currentUserInfo');
        const userRoleElement = document.getElementById('currentUserRole');

        if (userInfoElement && this.currentUser) {
            const roleName = ROLES[this.currentUser.rol]?.nombre || this.currentUser.rol;

            // Actualizar nombre del usuario
            userInfoElement.textContent = this.currentUser.nombre;

            // Actualizar rol del usuario si existe el elemento
            if (userRoleElement) {
                userRoleElement.textContent = roleName;
            }
        }
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
