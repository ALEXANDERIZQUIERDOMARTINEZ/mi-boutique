/**
 * SISTEMA DE PERMISOS Y ROLES
 * Define la matriz de permisos para cada rol
 */

const PERMISSIONS = {
  // Productos
  PRODUCTOS_VER: 'productos_ver',
  PRODUCTOS_CREAR: 'productos_crear',
  PRODUCTOS_EDITAR: 'productos_editar',
  PRODUCTOS_ELIMINAR: 'productos_eliminar',
  PRODUCTOS_IMPORTAR: 'productos_importar',
  PRODUCTOS_EXPORTAR: 'productos_exportar',

  // Ventas
  VENTAS_VER: 'ventas_ver',
  VENTAS_CREAR: 'ventas_crear',
  VENTAS_EDITAR: 'ventas_editar',
  VENTAS_ELIMINAR: 'ventas_eliminar',
  VENTAS_ANULAR: 'ventas_anular',

  // Apartados
  APARTADOS_VER: 'apartados_ver',
  APARTADOS_CREAR: 'apartados_crear',
  APARTADOS_EDITAR: 'apartados_editar',
  APARTADOS_ELIMINAR: 'apartados_eliminar',

  // Clientes
  CLIENTES_VER: 'clientes_ver',
  CLIENTES_CREAR: 'clientes_crear',
  CLIENTES_EDITAR: 'clientes_editar',
  CLIENTES_ELIMINAR: 'clientes_eliminar',

  // Usuarios
  USUARIOS_VER: 'usuarios_ver',
  USUARIOS_CREAR: 'usuarios_crear',
  USUARIOS_EDITAR: 'usuarios_editar',
  USUARIOS_ELIMINAR: 'usuarios_eliminar',

  // Finanzas
  FINANZAS_VER: 'finanzas_ver',
  FINANZAS_GESTIONAR: 'finanzas_gestionar',
  CIERRES_CAJA: 'cierres_caja',

  // Reportes
  REPORTES_VER: 'reportes_ver',
  REPORTES_EXPORTAR: 'reportes_exportar',

  // Categorías
  CATEGORIAS_GESTIONAR: 'categorias_gestionar',

  // Pedidos Web
  PEDIDOS_WEB_VER: 'pedidos_web_ver',
  PEDIDOS_WEB_GESTIONAR: 'pedidos_web_gestionar',

  // Configuración
  CONFIG_BRANDING: 'config_branding',
  CONFIG_GENERAL: 'config_general',

  // Dashboard
  DASHBOARD_VER: 'dashboard_ver',

  // Proveedores
  PROVEEDORES_GESTIONAR: 'proveedores_gestionar',

  // Repartidores
  REPARTIDORES_GESTIONAR: 'repartidores_gestionar',

  // Chat
  CHAT_VER: 'chat_ver',
  CHAT_RESPONDER: 'chat_responder',

  // Promociones
  PROMOCIONES_GESTIONAR: 'promociones_gestionar'
};

const ROLES = {
  /**
   * SUPER ADMIN - Administrador de la plataforma
   * - NO tiene tenantId (acceso global)
   * - Gestiona todos los tenants
   * - Tiene acceso a panel super-admin.html
   */
  SUPER_ADMIN: {
    nombre: 'Super Administrador',
    descripcion: 'Administrador de toda la plataforma',
    permisos: 'ALL' // Todos los permisos
  },

  /**
   * ADMIN TENANT - Administrador de una empresa (tenant)
   * - Tiene tenantId específico
   * - Gestiona su empresa completa
   * - Puede crear sub-usuarios
   * - Configura branding
   */
  ADMIN_TENANT: {
    nombre: 'Administrador',
    descripcion: 'Administrador de la empresa',
    permisos: {
      // Productos
      [PERMISSIONS.PRODUCTOS_VER]: true,
      [PERMISSIONS.PRODUCTOS_CREAR]: true,
      [PERMISSIONS.PRODUCTOS_EDITAR]: true,
      [PERMISSIONS.PRODUCTOS_ELIMINAR]: true,
      [PERMISSIONS.PRODUCTOS_IMPORTAR]: true,
      [PERMISSIONS.PRODUCTOS_EXPORTAR]: true,

      // Ventas
      [PERMISSIONS.VENTAS_VER]: true,
      [PERMISSIONS.VENTAS_CREAR]: true,
      [PERMISSIONS.VENTAS_EDITAR]: true,
      [PERMISSIONS.VENTAS_ANULAR]: true,

      // Apartados
      [PERMISSIONS.APARTADOS_VER]: true,
      [PERMISSIONS.APARTADOS_CREAR]: true,
      [PERMISSIONS.APARTADOS_EDITAR]: true,
      [PERMISSIONS.APARTADOS_ELIMINAR]: true,

      // Clientes
      [PERMISSIONS.CLIENTES_VER]: true,
      [PERMISSIONS.CLIENTES_CREAR]: true,
      [PERMISSIONS.CLIENTES_EDITAR]: true,
      [PERMISSIONS.CLIENTES_ELIMINAR]: true,

      // Usuarios
      [PERMISSIONS.USUARIOS_VER]: true,
      [PERMISSIONS.USUARIOS_CREAR]: true,
      [PERMISSIONS.USUARIOS_EDITAR]: true,
      [PERMISSIONS.USUARIOS_ELIMINAR]: true,

      // Finanzas
      [PERMISSIONS.FINANZAS_VER]: true,
      [PERMISSIONS.FINANZAS_GESTIONAR]: true,
      [PERMISSIONS.CIERRES_CAJA]: true,

      // Reportes
      [PERMISSIONS.REPORTES_VER]: true,
      [PERMISSIONS.REPORTES_EXPORTAR]: true,

      // Categorías
      [PERMISSIONS.CATEGORIAS_GESTIONAR]: true,

      // Pedidos Web
      [PERMISSIONS.PEDIDOS_WEB_VER]: true,
      [PERMISSIONS.PEDIDOS_WEB_GESTIONAR]: true,

      // Configuración
      [PERMISSIONS.CONFIG_BRANDING]: true,
      [PERMISSIONS.CONFIG_GENERAL]: true,

      // Dashboard
      [PERMISSIONS.DASHBOARD_VER]: true,

      // Proveedores
      [PERMISSIONS.PROVEEDORES_GESTIONAR]: true,

      // Repartidores
      [PERMISSIONS.REPARTIDORES_GESTIONAR]: true,

      // Chat
      [PERMISSIONS.CHAT_VER]: true,
      [PERMISSIONS.CHAT_RESPONDER]: true,

      // Promociones
      [PERMISSIONS.PROMOCIONES_GESTIONAR]: true
    }
  },

  /**
   * VENDEDOR - Empleado encargado de ventas
   */
  VENDEDOR: {
    nombre: 'Vendedor',
    descripcion: 'Gestiona ventas y apartados',
    permisos: {
      // Productos (solo lectura)
      [PERMISSIONS.PRODUCTOS_VER]: true,

      // Ventas
      [PERMISSIONS.VENTAS_VER]: true,
      [PERMISSIONS.VENTAS_CREAR]: true,
      [PERMISSIONS.VENTAS_EDITAR]: true,

      // Apartados
      [PERMISSIONS.APARTADOS_VER]: true,
      [PERMISSIONS.APARTADOS_CREAR]: true,
      [PERMISSIONS.APARTADOS_EDITAR]: true,

      // Clientes
      [PERMISSIONS.CLIENTES_VER]: true,
      [PERMISSIONS.CLIENTES_CREAR]: true,
      [PERMISSIONS.CLIENTES_EDITAR]: true,

      // Dashboard
      [PERMISSIONS.DASHBOARD_VER]: true,

      // Chat
      [PERMISSIONS.CHAT_VER]: true,
      [PERMISSIONS.CHAT_RESPONDER]: true
    }
  },

  /**
   * INVENTARIO - Empleado encargado de productos
   */
  INVENTARIO: {
    nombre: 'Inventario',
    descripcion: 'Gestiona productos y stock',
    permisos: {
      // Productos
      [PERMISSIONS.PRODUCTOS_VER]: true,
      [PERMISSIONS.PRODUCTOS_CREAR]: true,
      [PERMISSIONS.PRODUCTOS_EDITAR]: true,
      [PERMISSIONS.PRODUCTOS_ELIMINAR]: true,
      [PERMISSIONS.PRODUCTOS_IMPORTAR]: true,
      [PERMISSIONS.PRODUCTOS_EXPORTAR]: true,

      // Categorías
      [PERMISSIONS.CATEGORIAS_GESTIONAR]: true,

      // Proveedores
      [PERMISSIONS.PROVEEDORES_GESTIONAR]: true,

      // Dashboard
      [PERMISSIONS.DASHBOARD_VER]: true
    }
  },

  /**
   * CONTADOR - Empleado encargado de finanzas
   */
  CONTADOR: {
    nombre: 'Contador',
    descripcion: 'Gestiona finanzas y reportes',
    permisos: {
      // Ventas (solo lectura)
      [PERMISSIONS.VENTAS_VER]: true,

      // Apartados (solo lectura)
      [PERMISSIONS.APARTADOS_VER]: true,

      // Finanzas
      [PERMISSIONS.FINANZAS_VER]: true,
      [PERMISSIONS.FINANZAS_GESTIONAR]: true,
      [PERMISSIONS.CIERRES_CAJA]: true,

      // Reportes
      [PERMISSIONS.REPORTES_VER]: true,
      [PERMISSIONS.REPORTES_EXPORTAR]: true,

      // Dashboard
      [PERMISSIONS.DASHBOARD_VER]: true
    }
  },

  /**
   * REPARTIDOR - Empleado encargado de entregas
   */
  REPARTIDOR: {
    nombre: 'Repartidor',
    descripcion: 'Gestiona pedidos web y entregas',
    permisos: {
      // Pedidos Web
      [PERMISSIONS.PEDIDOS_WEB_VER]: true,
      [PERMISSIONS.PEDIDOS_WEB_GESTIONAR]: true,

      // Dashboard (limitado)
      [PERMISSIONS.DASHBOARD_VER]: true
    }
  },

  /**
   * VISUALIZADOR - Solo lectura
   */
  VISUALIZADOR: {
    nombre: 'Visualizador',
    descripcion: 'Solo puede ver datos (lectura)',
    permisos: {
      // Dashboard
      [PERMISSIONS.DASHBOARD_VER]: true,

      // Productos (solo lectura)
      [PERMISSIONS.PRODUCTOS_VER]: true,

      // Ventas (solo lectura)
      [PERMISSIONS.VENTAS_VER]: true,

      // Clientes (solo lectura)
      [PERMISSIONS.CLIENTES_VER]: true,

      // Reportes (solo lectura)
      [PERMISSIONS.REPORTES_VER]: true
    }
  }
};

/**
 * Obtiene los permisos de un rol
 * @param {string} rolName - Nombre del rol
 * @returns {Object} Permisos del rol
 */
function getPermissionsForRole(rolName) {
  if (rolName === 'SUPER_ADMIN') {
    // Super Admin tiene todos los permisos
    return Object.values(PERMISSIONS).reduce((acc, perm) => {
      acc[perm] = true;
      return acc;
    }, {});
  }

  const role = ROLES[rolName];
  if (!role) {
    console.warn(`Rol no encontrado: ${rolName}`);
    return {};
  }

  return role.permisos;
}

/**
 * Obtiene todos los roles disponibles (excepto SUPER_ADMIN)
 * @returns {Array} Lista de roles
 */
function getAvailableRoles() {
  return Object.keys(ROLES)
    .filter(role => role !== 'SUPER_ADMIN')
    .map(role => ({
      key: role,
      ...ROLES[role]
    }));
}

/**
 * Verifica si un rol tiene un permiso específico
 * @param {string} rolName - Nombre del rol
 * @param {string} permission - Permiso a verificar
 * @returns {boolean}
 */
function roleHasPermission(rolName, permission) {
  const permisos = getPermissionsForRole(rolName);
  return permisos[permission] === true;
}

// Exportar si estamos en Node.js (para testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PERMISSIONS,
    ROLES,
    getPermissionsForRole,
    getAvailableRoles,
    roleHasPermission
  };
}

// Exportar a window si estamos en el navegador
if (typeof window !== 'undefined') {
  window.PERMISSIONS = PERMISSIONS;
  window.ROLES = ROLES;
  window.getPermissionsForRole = getPermissionsForRole;
  window.getAvailableRoles = getAvailableRoles;
  window.roleHasPermission = roleHasPermission;
}
