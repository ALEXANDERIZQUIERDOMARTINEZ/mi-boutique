/**
 * auth.js - Sistema de Autenticación y Permisos
 * Maneja la verificación de usuarios y control de acceso al panel admin
 */

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Caché en localStorage (sobrevive a cerrar la pestaña/app, a diferencia de
// sessionStorage) del último usuario verificado con éxito. admin-auth-init.js
// la usa para pintar el panel de inmediato en cada apertura — como
// Instagram, que no te muestra una pantalla de carga si ya iniciaste sesión
// — mientras la verificación real contra Firebase ocurre en segundo plano.
const USER_CACHE_KEY = 'mishellAdminUserCache';

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
    INVENTARIO_FABRICA_GESTIONAR: 'inventario_fabrica_gestionar',

    // Soporte
    CHAT_RESPONDER: 'chat_responder',

    // Usuarios
    USUARIOS_VER: 'usuarios_ver',
    USUARIOS_CREAR: 'usuarios_crear',
    USUARIOS_EDITAR: 'usuarios_editar',

    // Auditoría (historial de quién creó/editó/eliminó productos, ventas y usuarios)
    AUDITORIA_VER: 'auditoria_ver',

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
    { id: 'inventario_fabrica_gestionar', nombre: 'Inventario Fábrica (Hilazas, Hilos, Telas)', permisos: [PERMISOS.INVENTARIO_FABRICA_GESTIONAR] },
    { id: 'proveedores_gestionar', nombre: 'Proveedores', permisos: [PERMISOS.PROVEEDORES_GESTIONAR] },
    { id: 'config_gestionar', nombre: 'Config. Pagos', permisos: [PERMISOS.CONFIG_GESTIONAR] },
    { id: 'usuarios_ver', nombre: 'Usuarios', permisos: [PERMISOS.USUARIOS_VER, PERMISOS.USUARIOS_CREAR, PERMISOS.USUARIOS_EDITAR] },
    { id: 'auditoria_ver', nombre: 'Auditoría', permisos: [PERMISOS.AUDITORIA_VER] }
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
            PERMISOS.CATEGORIAS_GESTIONAR,
            PERMISOS.INVENTARIO_FABRICA_GESTIONAR
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
            // Salvaguarda contra cuelgues indefinidos: en redes móviles lentas o
            // cuando el SDK de Firebase Auth no logra resolver la persistencia
            // (p.ej. IndexedDB bloqueado en Safari), onAuthStateChanged puede no
            // llamar al callback nunca, dejando el gate "Verificando sesión..."
            // congelado para siempre. Si no se resuelve en INIT_TIMEOUT_MS,
            // se rechaza para que la UI pueda mostrar un error accionable.
            let settled = false;
            const INIT_TIMEOUT_MS = 15000;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('TIMEOUT_VERIFICACION_SESION'));
            }, INIT_TIMEOUT_MS);

            const resolveOnce = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve(value);
            };
            const rejectOnce = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                reject(error);
            };

            onAuthStateChanged(this.auth, async (user) => {
                if (settled) return; // ya se resolvió por timeout; ignorar callback tardío
                if (!user) {
                    // No hay usuario autenticado: limpiar cualquier caché
                    // optimista para que la próxima apertura no vuelva a
                    // pintar un panel con datos de una sesión que ya no existe.
                    sessionStorage.removeItem('adminUser');
                    localStorage.removeItem(USER_CACHE_KEY);
                    this.redirectToLogin();
                    rejectOnce('No authenticated user');
                    return;
                }

                try {
                    // ANTES 'usuarios' y "sesión vigente" se pedían en paralelo
                    // (una sola ida y vuelta de red). Ya no se puede: la
                    // invalidación de sesiones vive por empresa
                    // (tenants/{tenantId}/config/seguridad, ver más abajo) y
                    // hasta no leer 'usuarios' no se sabe el tenantId de quién
                    // se está verificando. Se paga una ida y vuelta extra a
                    // cambio de que cerrar sesiones de una empresa ya no pueda
                    // afectar a otra.
                    const userDoc = await getDoc(doc(this.db, 'usuarios', user.uid));

                    if (!userDoc.exists()) {
                        // Usuario no autorizado
                        await this.logout();
                        alert('Usuario no autorizado para acceder al panel de administración');
                        rejectOnce('User not authorized');
                        return;
                    }

                    const userData = userDoc.data();

                    // Verificar que el usuario está activo
                    if (!userData.activo) {
                        await this.logout();
                        alert('Tu cuenta está desactivada. Contacta al administrador');
                        rejectOnce('User disabled');
                        return;
                    }

                    // NOTA: ya no existe una validación de "tenant esperado por
                    // archivo" aquí — admin.html es un panel único para
                    // cualquier empresa, y window.expectedTenantId ahora se
                    // deriva del propio usuario (ver admin.js), no al revés.
                    // El aislamiento real de datos lo garantiza
                    // firestore.rules del lado servidor, no este cliente.

                    // Verificar que la EMPRESA del usuario esté activa (no
                    // suspendida/cancelada/vencida). Super Admin no pertenece
                    // a ninguna empresa, se salta esto. El enforcement real
                    // está en firestore.rules (tenantActivo(), ver Fase 1 del
                    // SaaS multiempresa) — este chequeo es solo para no dejar
                    // que el panel cargue con datos y luego cada escritura
                    // falle sin explicación; si la verificación no puede
                    // completarse (sin red, etc.) no bloquea el acceso por eso.
                    const tenantId = userData.rol === 'SUPER_ADMIN' ? null : (userData.tenantId || 'boutique');
                    if (tenantId) {
                        const motivoBloqueo = await this.verificarEmpresaBloqueada(tenantId);
                        if (motivoBloqueo) {
                            await this.logout();
                            alert(motivoBloqueo);
                            rejectOnce('Tenant blocked');
                            return;
                        }
                    }

                    // Verificar que nadie haya cerrado todas las sesiones después
                    // de que este dispositivo inició sesión
                    const sesionVigente = await this.verificarSesionVigente(user, tenantId);
                    if (!sesionVigente) {
                        await this.logout();
                        alert('Tu sesión fue cerrada por un administrador. Vuelve a iniciar sesión.');
                        rejectOnce('Session invalidated');
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

                    // Guardar en sessionStorage y en el caché persistente
                    sessionStorage.setItem('adminUser', JSON.stringify(this.currentUser));
                    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(this.currentUser));

                    // Aplicar restricciones de UI
                    this.applyUIRestrictions();

                    resolveOnce(this.currentUser);
                } catch (error) {
                    console.error('Error verificando usuario:', error);
                    this.redirectToLogin();
                    rejectOnce(error);
                }
            });
        });
    }

    /**
     * Devuelve el último usuario verificado con éxito en este dispositivo
     * (o null si no hay caché), para pintar el panel de inmediato antes de
     * que termine la verificación real contra Firebase.
     */
    getCachedUser() {
        try {
            const raw = localStorage.getItem(USER_CACHE_KEY);
            if (!raw) return null;
            const cached = JSON.parse(raw);
            // Ya no hay "panel equivocado" que filtrar: admin.html es un
            // panel único y cada usuario siempre ve su propia empresa
            // (o la que Super Admin haya elegido explícitamente).
            return cached;
        } catch (error) {
            console.warn('No se pudo leer el caché de usuario:', error);
            return null;
        }
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
     * Compara el momento en que Firebase Auth registró el último inicio de
     * sesión de este usuario (user.metadata.lastSignInTime, dato del propio
     * servidor de Firebase) contra
     * tenants/{tenantId}/config/seguridad.invalidarSesionesEn — POR EMPRESA,
     * no un documento global: antes vivía en config/seguridad (compartido
     * por toda la plataforma), así que cualquier usuario activo de
     * cualquier empresa podía invalidar las sesiones de TODAS las demás.
     * tenantId null (Super Admin, no pertenece a ninguna empresa) no se
     * verifica — ver llamada en init().
     * Antes esto se comparaba contra una marca de tiempo propia guardada en
     * localStorage, pero localStorage puede vaciarse solo (limpieza de
     * almacenamiento de Safari/iOS tras días sin interacción, modo privado,
     * o particiones de almacenamiento distintas entre la PWA instalada y el
     * navegador) sin que la sesión de Firebase (persistida en IndexedDB) se
     * pierda con ella — dejando al dispositivo sin "loginEn" y por lo tanto
     * bloqueado para siempre con "sesión cerrada por un administrador",
     * incluso reinstalando o reiniciando la app una y mil veces.
     * lastSignInTime en cambio vive del lado de Firebase y solo cambia
     * cuando ocurre un inicio de sesión real, así que no depende de que
     * localStorage sobreviva.
     */
    async verificarSesionVigente(user, tenantId) {
        if (!tenantId) return true; // Super Admin: no aplica
        try {
            const cfgDoc = await getDoc(doc(this.db, 'tenants', tenantId, 'config', 'seguridad'));
            const invalidarEn = cfgDoc.exists() ? cfgDoc.data().invalidarSesionesEn : null;
            if (!invalidarEn) return true; // nunca se ha usado "cerrar todas las sesiones"

            const loginEn = Date.parse(user?.metadata?.lastSignInTime || '');
            if (!loginEn) return true; // sin dato confiable, no bloquear el acceso por eso
            return invalidarEn.toMillis() <= loginEn;
        } catch (error) {
            console.warn('No se pudo verificar el estado de la sesión:', error);
            return true; // si falla la verificación, no bloquear el acceso por eso
        }
    }

    /**
     * Devuelve un mensaje explicando por qué la empresa de este usuario está
     * bloqueada (suspendida, cancelada, o con la suscripción vencida), o
     * null si puede entrar. Espejo en el cliente de tenantActivo() en
     * firestore.rules (Fase 1 del SaaS multiempresa) — el enforcement real
     * es ese, esto solo evita un panel a medio cargar con errores confusos.
     * Si algo falla al verificar (sin red, tenantsPrivado sin permiso
     * todavía, etc.) no bloquea el acceso por eso — mismo criterio que
     * verificarSesionVigente().
     */
    async verificarEmpresaBloqueada(tenantId) {
        try {
            const tenantDoc = await getDoc(doc(this.db, 'tenants', tenantId));
            const estado = tenantDoc.exists() ? tenantDoc.data().estado : null;
            if (estado === 'suspendido') return 'Tu empresa está suspendida. Contacta al administrador de la plataforma.';
            if (estado === 'cancelado') return 'Tu empresa canceló su suscripción. Contacta al administrador de la plataforma.';
        } catch (error) {
            console.warn('No se pudo verificar el estado de la empresa:', error);
            return null;
        }

        try {
            const privDoc = await getDoc(doc(this.db, 'tenantsPrivado', tenantId));
            const fechaVencimiento = privDoc.exists() ? privDoc.data()?.suscripcion?.fechaVencimiento : null;
            if (fechaVencimiento && fechaVencimiento.toDate() < new Date()) {
                return 'La suscripción de tu empresa venció. Contacta al administrador de la plataforma.';
            }
        } catch (error) {
            console.warn('No se pudo verificar la vigencia de la suscripción:', error);
        }

        return null;
    }

    /**
     * Escucha en vivo tenants/{tenantId}/config/seguridad DE LA EMPRESA de
     * este usuario: si su administrador cierra todas las sesiones mientras
     * esta pestaña sigue abierta, la cierra de inmediato sin esperar a que
     * alguien recargue la página. Super Admin no pertenece a ninguna
     * empresa, no aplica.
     */
    escucharInvalidacionSesiones() {
        if (this.isSuperAdmin()) return; // no pertenece a ninguna empresa
        // Igual que en init(): un usuario sin tenantId (cuentas de Boutique
        // de antes de multi-tenant) se trata como 'boutique', no como "sin
        // empresa" — si no, se quedarían sin este listener por completo.
        const tenantId = this.currentUser?.tenantId || 'boutique';
        onSnapshot(doc(this.db, 'tenants', tenantId, 'config', 'seguridad'), (snap) => {
            const invalidarEn = snap.exists() ? snap.data().invalidarSesionesEn : null;
            if (!invalidarEn) return;
            const loginEn = Date.parse(this.auth.currentUser?.metadata?.lastSignInTime || '');
            if (loginEn && invalidarEn.toMillis() > loginEn) {
                alert('Un administrador cerró todas las sesiones. Vuelve a iniciar sesión.');
                this.logout();
            }
        });
    }

    /**
     * Cierra de golpe todas las sesiones abiertas de ESTA empresa (incluida
     * la propia): marca en tenants/{tenantId}/config/seguridad el momento
     * actual, y cada dispositivo de esa misma empresa (pestaña abierta o
     * próxima carga) se compara contra esa marca y se desloguea si su login
     * es anterior. Antes esto vivía en un documento global compartido por
     * toda la plataforma — cualquier usuario activo de cualquier empresa
     * podía cerrar las sesiones de todas las demás.
     */
    async invalidarTodasLasSesiones() {
        // window.expectedTenantId (admin.js) ya resuelve esto correctamente
        // para los dos casos: un usuario normal (su propia empresa) y Super
        // Admin viendo una empresa via ?empresa= (que no tiene tenantId
        // propio) — se prefiere sobre this.currentUser.tenantId por eso.
        const tenantId = window.expectedTenantId || this.currentUser?.tenantId || 'boutique';
        await setDoc(doc(this.db, 'tenants', tenantId, 'config', 'seguridad'), { invalidarSesionesEn: serverTimestamp() }, { merge: true });
    }

    /**
     * Cierra sesión
     */
    async logout() {
        try {
            await signOut(this.auth);
            sessionStorage.removeItem('adminUser');
            localStorage.removeItem(USER_CACHE_KEY);
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
     * Actualiza la información del usuario en la UI (nombre y rol).
     * Acepta un usuario explícito para poder pintar con datos cacheados
     * antes de que termine la verificación real (this.currentUser aún null).
     */
    updateUserInfo(usuario = this.currentUser) {
        if (!usuario) return;
        const roleName = ROLES[usuario.rol]?.nombre || usuario.rol;

        const nameTargets = ['currentUserInfo', 'rail-admin-name', 'topbar-admin-name', 'topbar-dropdown-name', 'db-greeting-name'];
        nameTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = usuario.nombre;
        });

        const roleTargets = ['currentUserRole', 'rail-profile-role', 'topbar-dropdown-role'];
        roleTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = roleName;
        });

        const emailEl = document.getElementById('topbar-dropdown-email');
        if (emailEl) emailEl.textContent = usuario.email || '';
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
