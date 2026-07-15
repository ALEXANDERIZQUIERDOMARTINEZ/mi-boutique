/**
 * auth.js - Sistema de Autenticación y Permisos
 * Maneja la verificación de usuarios y control de acceso al panel admin
 */

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Clave de localStorage (no sessionStorage: debe sobrevivir a pestañas nuevas
// y reinicios del navegador) con el momento exacto en que este dispositivo
// inició sesión por última vez — se compara contra config/seguridad para
// saber si un "cerrar todas las sesiones" lo dejó fuera.
const LOGIN_TIMESTAMP_KEY = 'mishellLoginEn';

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

    // Fábrica (segmento aparte para Mishell Fábrica: gastos vs. ingresos propios)
    FABRICA_GESTIONAR: 'fabrica_gestionar',

    // Soporte
    CHAT_RESPONDER: 'chat_responder',

    // Usuarios
    USUARIOS_VER: 'usuarios_ver',
    USUARIOS_CREAR: 'usuarios_crear',
    USUARIOS_EDITAR: 'usuarios_editar',

    // Configuración (no está en firestore.rules — solo controla si el enlace
    // "Config. Pagos" aparece en el menú, la escritura ya la permiten las
    // reglas a cualquier usuario activo)
    CONFIG_GESTIONAR: 'config_gestionar'
};

// Un módulo = un enlace del menú lateral de admin.html. Se usa para que el
// panel de Usuarios pueda "segmentar por módulos/links": marcar qué enlaces
// ve cada usuario, en vez de permisos sueltos difíciles de interpretar.
// El id coincide con el data-permiso puesto en cada <a class="rail-link">.
export const MODULOS_PERMISOS = [
    { id: 'dashboard_ver', nombre: 'Dashboard', permisos: [PERMISOS.DASHBOARD_VER] },
    { id: 'ventas_crear', nombre: 'Registrar Venta', permisos: [
        PERMISOS.VENTAS_VER, PERMISOS.VENTAS_CREAR, PERMISOS.VENTAS_EDITAR, PERMISOS.VENTAS_ANULAR, PERMISOS.VENTAS_ELIMINAR
    ] },
    { id: 'pedidos_web_ver', nombre: 'Pedidos Web', permisos: [PERMISOS.PEDIDOS_WEB_VER, PERMISOS.PEDIDOS_WEB_GESTIONAR] },
    { id: 'apartados_ver', nombre: 'Apartados', permisos: [
        PERMISOS.APARTADOS_VER, PERMISOS.APARTADOS_CREAR, PERMISOS.APARTADOS_EDITAR, PERMISOS.APARTADOS_ELIMINAR, PERMISOS.APARTADOS_GESTIONAR
    ] },
    { id: 'productos_ver', nombre: 'Productos', permisos: [
        PERMISOS.PRODUCTOS_VER, PERMISOS.PRODUCTOS_CREAR, PERMISOS.PRODUCTOS_EDITAR, PERMISOS.PRODUCTOS_ELIMINAR
    ] },
    { id: 'productos_importar', nombre: 'Cargue Masivo', permisos: [PERMISOS.PRODUCTOS_IMPORTAR] },
    { id: 'categorias_gestionar', nombre: 'Categorías', permisos: [PERMISOS.CATEGORIAS_GESTIONAR] },
    { id: 'clientes_ver', nombre: 'Clientes', permisos: [
        PERMISOS.CLIENTES_VER, PERMISOS.CLIENTES_CREAR, PERMISOS.CLIENTES_EDITAR, PERMISOS.CLIENTES_ELIMINAR
    ] },
    { id: 'repartidores_gestionar', nombre: 'Repartidores y Tarifas', permisos: [PERMISOS.REPARTIDORES_GESTIONAR] },
    { id: 'promociones_gestionar', nombre: 'Promociones', permisos: [PERMISOS.PROMOCIONES_GESTIONAR] },
    { id: 'finanzas_ver', nombre: 'Finanzas', permisos: [PERMISOS.FINANZAS_VER, PERMISOS.FINANZAS_GESTIONAR, PERMISOS.CIERRES_CAJA] },
    { id: 'fabrica_gestionar', nombre: 'Fábrica (Gastos e Ingresos)', permisos: [PERMISOS.FABRICA_GESTIONAR] },
    { id: 'proveedores_gestionar', nombre: 'Proveedores', permisos: [PERMISOS.PROVEEDORES_GESTIONAR] },
    { id: 'config_gestionar', nombre: 'Config. Pagos', permisos: [PERMISOS.CONFIG_GESTIONAR] },
    { id: 'usuarios_ver', nombre: 'Usuarios', permisos: [PERMISOS.USUARIOS_VER, PERMISOS.USUARIOS_CREAR, PERMISOS.USUARIOS_EDITAR] }
    // "Backup" no aparece aquí a propósito: exporta todos los datos de la
    // tienda, así que se queda reservado solo para Sistema (Super Admin).
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
                    // El doc de 'usuarios' y la verificación de sesión vigente son
                    // lecturas independientes: se piden en paralelo para no pagar
                    // dos idas y vueltas de red seguidas en conexiones lentas.
                    const [userDoc, sesionVigente] = await Promise.all([
                        getDoc(doc(this.db, 'usuarios', user.uid)),
                        this.verificarSesionVigente()
                    ]);

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

                    // Verificar que nadie haya cerrado todas las sesiones después
                    // de que este dispositivo inició sesión
                    if (!sesionVigente) {
                        await this.logout();
                        alert('Tu sesión fue cerrada por un administrador. Vuelve a iniciar sesión.');
                        reject('Session invalidated');
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
     * Compara el momento en que este dispositivo inició sesión (guardado en
     * localStorage por login.html) contra config/seguridad.invalidarSesionesEn.
     * Si un administrador cerró todas las sesiones después de ese login, o si
     * este dispositivo no tiene registro de cuándo inició sesión (sesión
     * persistida de antes de que existiera este control), la sesión ya no es
     * válida y hay que volver a pedir la contraseña.
     */
    async verificarSesionVigente() {
        try {
            const cfgDoc = await getDoc(doc(this.db, 'config', 'seguridad'));
            const invalidarEn = cfgDoc.exists() ? cfgDoc.data().invalidarSesionesEn : null;
            if (!invalidarEn) return true; // nunca se ha usado "cerrar todas las sesiones"

            const loginEn = parseInt(localStorage.getItem(LOGIN_TIMESTAMP_KEY) || '0', 10);
            if (!loginEn) return false;
            return invalidarEn.toMillis() <= loginEn;
        } catch (error) {
            console.warn('No se pudo verificar el estado de la sesión:', error);
            return true; // si falla la verificación, no bloquear el acceso por eso
        }
    }

    /**
     * Escucha en vivo config/seguridad: si un administrador cierra todas las
     * sesiones mientras esta pestaña sigue abierta, la cierra de inmediato
     * sin esperar a que alguien recargue la página.
     */
    escucharInvalidacionSesiones() {
        onSnapshot(doc(this.db, 'config', 'seguridad'), (snap) => {
            const invalidarEn = snap.exists() ? snap.data().invalidarSesionesEn : null;
            if (!invalidarEn) return;
            const loginEn = parseInt(localStorage.getItem(LOGIN_TIMESTAMP_KEY) || '0', 10);
            if (!loginEn || invalidarEn.toMillis() > loginEn) {
                alert('Un administrador cerró todas las sesiones. Vuelve a iniciar sesión.');
                this.logout();
            }
        });
    }

    /**
     * Cierra de golpe todas las sesiones abiertas (incluida la propia): marca
     * en Firestore el momento actual, y cada dispositivo (pestaña abierta o
     * próxima carga) se compara contra esa marca y se desloguea si su login
     * es anterior.
     */
    async invalidarTodasLasSesiones() {
        await setDoc(doc(this.db, 'config', 'seguridad'), { invalidarSesionesEn: serverTimestamp() }, { merge: true });
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

        const nameTargets = ['currentUserInfo', 'rail-admin-name', 'topbar-admin-name', 'topbar-dropdown-name'];
        nameTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = this.currentUser.nombre;
        });

        const roleTargets = ['currentUserRole', 'rail-profile-role', 'topbar-dropdown-role'];
        roleTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = roleName;
        });

        const emailEl = document.getElementById('topbar-dropdown-email');
        if (emailEl) emailEl.textContent = this.currentUser.email || '';
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
