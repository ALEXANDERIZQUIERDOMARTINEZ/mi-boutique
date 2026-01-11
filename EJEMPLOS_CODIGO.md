# 💻 EJEMPLOS DE CÓDIGO - ARQUITECTURA MULTI-TENANT

## 1. tenant-resolver.js (Core)

```javascript
// src/core/tenant-resolver.js

/**
 * TENANT RESOLVER
 * Detecta el tenant desde la URL y carga su configuración
 * Este módulo se ejecuta ANTES que cualquier otro
 */

class TenantResolver {
  constructor() {
    this.currentTenant = null;
    this.db = null;
  }

  /**
   * Inicializa el resolver y carga el tenant
   * @returns {Promise<Object>} Datos del tenant
   */
  async initialize(firebaseDb) {
    this.db = firebaseDb;

    try {
      // 1. Detectar tenant desde URL
      const tenantSlug = this.extractTenantFromURL();

      if (!tenantSlug) {
        throw new Error("No se pudo identificar el tenant desde la URL");
      }

      console.log(`🔍 Buscando tenant: ${tenantSlug}`);

      // 2. Buscar tenant en Firestore
      const tenantSnapshot = await this.db.collection('tenants')
        .where('slug', '==', tenantSlug)
        .where('estado', 'in', ['activo', 'trial'])
        .limit(1)
        .get();

      if (tenantSnapshot.empty) {
        throw new Error(`Tenant "${tenantSlug}" no encontrado o inactivo`);
      }

      const tenantDoc = tenantSnapshot.docs[0];
      this.currentTenant = {
        id: tenantDoc.id,
        ...tenantDoc.data()
      };

      // 3. Guardar en sessionStorage para performance
      sessionStorage.setItem('currentTenant', JSON.stringify(this.currentTenant));
      sessionStorage.setItem('tenantLoadedAt', Date.now());

      // 4. Inyectar branding dinámicamente
      await this.injectBranding();

      // 5. Validar límites del plan (opcional - para mostrar warnings)
      this.validarLimitesPlan();

      console.log(`✅ Tenant cargado: ${this.currentTenant.nombre}`);
      return this.currentTenant;

    } catch (error) {
      console.error('❌ Error al cargar tenant:', error);
      this.handleTenantError(error);
      throw error;
    }
  }

  /**
   * Extrae el slug del tenant desde la URL
   * @returns {string} Slug del tenant
   */
  extractTenantFromURL() {
    const hostname = window.location.hostname;

    // Desarrollo local
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Opción 1: Query param ?tenant=eleganza
      const params = new URLSearchParams(window.location.search);
      const tenantParam = params.get('tenant');

      if (tenantParam) {
        return tenantParam;
      }

      // Opción 2: Tenant por defecto para desarrollo
      console.warn('⚠️ Usando tenant por defecto para desarrollo: mishell');
      return 'mishell';
    }

    // Producción: Subdominio
    // eleganza.miboutique.com → "eleganza"
    // www.miboutique.com → null (página principal)
    const parts = hostname.split('.');

    if (parts.length >= 3) {
      // Subdominio detectado
      const subdomain = parts[0];

      // Ignorar subdominio "www"
      if (subdomain === 'www') {
        return null;
      }

      return subdomain;
    }

    // Dominio custom (ej: www.eleganza.com)
    // En este caso, necesitamos buscar en la BD
    return this.resolveDominioCustom(hostname);
  }

  /**
   * Resuelve tenant desde dominio personalizado
   * @param {string} domain - Dominio completo
   * @returns {Promise<string|null>} Slug del tenant
   */
  async resolveDominioCustom(domain) {
    if (!this.db) return null;

    try {
      const tenantSnapshot = await this.db.collection('tenants')
        .where('dominioCustom', '==', domain)
        .where('estado', '==', 'activo')
        .limit(1)
        .get();

      if (!tenantSnapshot.empty) {
        return tenantSnapshot.docs[0].data().slug;
      }
    } catch (error) {
      console.error('Error al resolver dominio custom:', error);
    }

    return null;
  }

  /**
   * Inyecta el branding del tenant en la página
   */
  async injectBranding() {
    if (!this.currentTenant || !this.currentTenant.branding) {
      console.warn('⚠️ No hay configuración de branding para este tenant');
      return;
    }

    const { branding } = this.currentTenant;
    const root = document.documentElement;

    // Inyectar CSS variables
    root.style.setProperty('--color-primario', branding.colorPrimario || '#D988B9');
    root.style.setProperty('--color-secundario', branding.colorSecundario || '#333333');
    root.style.setProperty('--color-acento', branding.colorAccento || '#FFD700');

    // Calcular colores derivados (claros, hover, oscuros)
    const colorPrimarioClaro = this.lightenColor(branding.colorPrimario, 30);
    const colorPrimarioHover = this.lightenColor(branding.colorPrimario, 10);
    const colorPrimarioOscuro = this.darkenColor(branding.colorPrimario, 15);

    root.style.setProperty('--color-primario-claro', colorPrimarioClaro);
    root.style.setProperty('--color-primario-hover', colorPrimarioHover);
    root.style.setProperty('--color-primario-oscuro', colorPrimarioOscuro);

    // Fuente principal
    if (branding.fuentePrincipal) {
      root.style.setProperty('--fuente-principal', branding.fuentePrincipal);
      // Cargar fuente desde Google Fonts si es necesario
      this.loadGoogleFont(branding.fuentePrincipal);
    }

    // Reemplazar logos
    const logoElements = document.querySelectorAll('[data-tenant-logo]');
    logoElements.forEach(el => {
      if (branding.logo) {
        el.src = branding.logo;
        el.alt = branding.textos?.nombreTienda || this.currentTenant.nombre;
      }
    });

    // Reemplazar textos dinámicos
    const titleElements = document.querySelectorAll('[data-tenant-title]');
    titleElements.forEach(el => {
      el.textContent = branding.textos?.nombreTienda || this.currentTenant.nombre;
    });

    const taglineElements = document.querySelectorAll('[data-tenant-tagline]');
    taglineElements.forEach(el => {
      el.textContent = branding.textos?.tagline || '';
    });

    // Favicon dinámico
    if (branding.faviconUrl) {
      let favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = branding.faviconUrl;
    }

    // Title de la página
    document.title = branding.textos?.nombreTienda || this.currentTenant.nombre;

    // Meta tags para SEO
    this.updateMetaTags(branding);

    console.log('✅ Branding inyectado correctamente');
  }

  /**
   * Actualiza meta tags de la página
   */
  updateMetaTags(branding) {
    // Description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = branding.textos?.descripcionSEO ||
      `Tienda en línea de ${branding.textos?.nombreTienda || this.currentTenant.nombre}`;

    // OG tags para redes sociales
    this.setMetaTag('og:title', branding.textos?.nombreTienda);
    this.setMetaTag('og:description', branding.textos?.descripcionSEO);
    this.setMetaTag('og:image', branding.logo);
  }

  /**
   * Helper para actualizar/crear meta tags
   */
  setMetaTag(property, content) {
    if (!content) return;

    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.appendChild(meta);
    }
    meta.content = content;
  }

  /**
   * Carga una fuente de Google Fonts
   */
  loadGoogleFont(fontName) {
    const cleanFontName = fontName.replace(/['"]/g, '').split(',')[0].trim();
    const fontUrl = `https://fonts.googleapis.com/css2?family=${cleanFontName.replace(/\s/g, '+')}:wght@300;400;500;600;700&display=swap`;

    // Verificar si ya está cargada
    const existingLink = document.querySelector(`link[href="${fontUrl}"]`);
    if (existingLink) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl;
    document.head.appendChild(link);
  }

  /**
   * Valida si el tenant está cerca de sus límites
   */
  validarLimitesPlan() {
    if (!this.currentTenant.limites) return;

    const { limites, estadisticas } = this.currentTenant;

    if (estadisticas) {
      // Productos
      const porcentajeProductos = (estadisticas.totalProductos / limites.maxProductos) * 100;
      if (porcentajeProductos >= 90) {
        console.warn(`⚠️ Límite de productos casi alcanzado: ${estadisticas.totalProductos}/${limites.maxProductos}`);
      }

      // Usuarios
      const porcentajeUsuarios = (estadisticas.totalUsuarios / limites.maxUsuarios) * 100;
      if (porcentajeUsuarios >= 90) {
        console.warn(`⚠️ Límite de usuarios casi alcanzado: ${estadisticas.totalUsuarios}/${limites.maxUsuarios}`);
      }

      // Storage
      const porcentajeStorage = (estadisticas.storageUsado / limites.maxStorage) * 100;
      if (porcentajeStorage >= 90) {
        console.warn(`⚠️ Límite de almacenamiento casi alcanzado: ${(estadisticas.storageUsado / 1024 / 1024).toFixed(2)} MB / ${(limites.maxStorage / 1024 / 1024).toFixed(2)} MB`);
      }
    }
  }

  /**
   * Maneja errores al cargar el tenant
   */
  handleTenantError(error) {
    // Redirigir a página de error
    if (error.message.includes('no encontrado')) {
      window.location.href = '/tenant-not-found.html';
    } else if (error.message.includes('inactivo')) {
      window.location.href = '/tenant-suspended.html';
    } else {
      window.location.href = '/error.html';
    }
  }

  /**
   * Obtiene el ID del tenant actual
   * @returns {string} ID del tenant
   */
  getTenantId() {
    if (this.currentTenant) {
      return this.currentTenant.id;
    }

    // Fallback: Leer de sessionStorage
    const cached = sessionStorage.getItem('currentTenant');
    if (cached) {
      const tenant = JSON.parse(cached);
      return tenant.id;
    }

    throw new Error("Tenant no inicializado. Llama a initialize() primero.");
  }

  /**
   * Obtiene el objeto tenant completo
   * @returns {Object} Datos del tenant
   */
  getTenant() {
    return this.currentTenant;
  }

  /**
   * Verifica si un feature está disponible en el plan del tenant
   * @param {string} feature - Nombre del feature
   * @returns {boolean}
   */
  hasFeature(feature) {
    if (!this.currentTenant || !this.currentTenant.limites) {
      return false;
    }

    const { features } = this.currentTenant.limites;
    return features && features.includes(feature);
  }

  // ========== UTILIDADES DE COLOR ==========

  /**
   * Aclara un color hexadecimal
   */
  lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1).toUpperCase();
  }

  /**
   * Oscurece un color hexadecimal
   */
  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 +
      (G > 0 ? G : 0) * 0x100 +
      (B > 0 ? B : 0))
      .toString(16).slice(1).toUpperCase();
  }

  /**
   * Limpia el caché del tenant (útil para testing)
   */
  clearCache() {
    sessionStorage.removeItem('currentTenant');
    sessionStorage.removeItem('tenantLoadedAt');
    this.currentTenant = null;
  }
}

// Exportar instancia global
window.tenantResolver = new TenantResolver();

// Auto-inicializar cuando Firebase esté listo
// (Se llamará desde el script principal)
```

---

## 2. auth-manager.js (Refactorizado)

```javascript
// src/core/auth-manager.js

/**
 * AUTH MANAGER MULTI-TENANT
 * Gestiona autenticación y permisos con soporte multi-tenant
 */

class AuthManager {
  constructor() {
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.unsubscribe = null;
  }

  /**
   * Inicializa el auth manager
   */
  initialize(firebaseAuth, firebaseDb) {
    this.auth = firebaseAuth;
    this.db = firebaseDb;

    // Listener de cambios de autenticación
    this.unsubscribe = this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        await this.handleUserLogin(firebaseUser);
      } else {
        this.handleUserLogout();
      }
    });
  }

  /**
   * Maneja el login del usuario
   */
  async handleUserLogin(firebaseUser) {
    try {
      console.log(`🔐 Usuario autenticado: ${firebaseUser.email}`);

      // 1. Cargar datos del usuario desde Firestore
      const userDoc = await this.db.collection('usuarios').doc(firebaseUser.uid).get();

      if (!userDoc.exists) {
        throw new Error('Usuario no encontrado en la base de datos');
      }

      const userData = userDoc.data();
      this.currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        ...userData
      };

      // 2. VALIDACIÓN CRÍTICA: Verificar tenantId match
      const currentTenantId = window.tenantResolver.getTenantId();

      if (this.currentUser.rol === 'SUPER_ADMIN') {
        // Super Admin puede acceder a cualquier tenant
        console.log('✅ Super Admin detectado - Acceso global permitido');
      } else {
        // Usuario normal - DEBE pertenecer al tenant actual
        if (this.currentUser.tenantId !== currentTenantId) {
          console.error(`❌ Usuario no autorizado para este tenant`);
          console.error(`Usuario pertenece a: ${this.currentUser.tenantId}`);
          console.error(`Intentando acceder a: ${currentTenantId}`);

          await this.logout();
          alert('No estás autorizado para acceder a esta tienda.');
          window.location.href = '/login.html';
          return;
        }
        console.log(`✅ Usuario autorizado para tenant: ${currentTenantId}`);
      }

      // 3. Verificar si el usuario está activo
      if (!this.currentUser.activo) {
        console.error('❌ Usuario inactivo');
        await this.logout();
        alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
        window.location.href = '/login.html';
        return;
      }

      // 4. Guardar contexto global
      window.appContext = {
        tenantId: currentTenantId,
        userId: this.currentUser.uid,
        email: this.currentUser.email,
        nombre: this.currentUser.nombre,
        rol: this.currentUser.rol,
        permisos: this.currentUser.permisos || {},
        isSuperAdmin: this.currentUser.rol === 'SUPER_ADMIN'
      };

      // 5. Actualizar último acceso
      await this.db.collection('usuarios').doc(firebaseUser.uid).update({
        ultimoAcceso: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 6. Cargar UI según permisos
      this.initializeUI();

      console.log('✅ Autenticación completada');

    } catch (error) {
      console.error('❌ Error al cargar datos del usuario:', error);
      await this.logout();
      alert('Error al iniciar sesión. Por favor intenta nuevamente.');
      window.location.href = '/login.html';
    }
  }

  /**
   * Maneja el logout del usuario
   */
  handleUserLogout() {
    console.log('👋 Usuario desconectado');
    this.currentUser = null;
    window.appContext = null;

    // Si estamos en una página protegida, redirigir a login
    const protectedPages = ['admin.html', 'super-admin.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
      window.location.href = '/login.html';
    }
  }

  /**
   * Login con email y password
   */
  async login(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      console.error('Error en login:', error);
      throw this.translateAuthError(error);
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await this.auth.signOut();
      sessionStorage.clear();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Error en logout:', error);
    }
  }

  /**
   * Verifica si el usuario tiene un permiso específico
   */
  hasPermission(permission) {
    if (!window.appContext) return false;

    // Super Admin tiene todos los permisos
    if (window.appContext.isSuperAdmin) return true;

    // Verificar permiso específico
    return window.appContext.permisos[permission] === true;
  }

  /**
   * Verifica si el usuario tiene un rol específico
   */
  hasRole(rol) {
    if (!window.appContext) return false;
    return window.appContext.rol === rol;
  }

  /**
   * Requiere autenticación - Redirige si no está autenticado
   */
  requireAuth() {
    if (!this.auth.currentUser) {
      console.warn('⚠️ Acceso no autorizado - Redirigiendo a login');
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  /**
   * Requiere un permiso específico - Muestra error si no lo tiene
   */
  requirePermission(permission) {
    if (!this.hasPermission(permission)) {
      console.error(`❌ Permiso requerido no encontrado: ${permission}`);
      alert('No tienes permisos para realizar esta acción.');
      return false;
    }
    return true;
  }

  /**
   * Inicializa la UI según permisos
   */
  initializeUI() {
    // Ocultar elementos según permisos
    document.querySelectorAll('[data-require-permission]').forEach(el => {
      const requiredPermission = el.dataset.requirePermission;
      if (!this.hasPermission(requiredPermission)) {
        el.style.display = 'none';
      }
    });

    // Ocultar elementos según rol
    document.querySelectorAll('[data-require-role]').forEach(el => {
      const requiredRole = el.dataset.requireRole;
      if (!this.hasRole(requiredRole)) {
        el.style.display = 'none';
      }
    });

    // Mostrar nombre del usuario
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = window.appContext.nombre;
    });

    // Mostrar email del usuario
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = window.appContext.email;
    });
  }

  /**
   * Traduce errores de Firebase a mensajes legibles
   */
  translateAuthError(error) {
    const errorMessages = {
      'auth/user-not-found': 'Usuario no encontrado',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/email-already-in-use': 'Este email ya está registrado',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/invalid-email': 'Email inválido',
      'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
      'auth/network-request-failed': 'Error de conexión. Verifica tu internet.'
    };

    return new Error(errorMessages[error.code] || error.message);
  }

  /**
   * Limpia recursos al destruir
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// Exportar instancia global
window.authManager = new AuthManager();
```

---

## 3. productos.service.js (Ejemplo de Servicio con Filtrado)

```javascript
// src/services/productos.service.js

/**
 * SERVICIO DE PRODUCTOS
 * Todas las operaciones CRUD con filtrado automático por tenantId
 */

class ProductosService {
  constructor(db) {
    this.db = db;
    this.collectionName = 'productos';
  }

  /**
   * Obtiene el tenantId del contexto actual
   */
  getTenantId() {
    if (!window.appContext) {
      throw new Error('Contexto de aplicación no inicializado');
    }
    return window.appContext.tenantId;
  }

  /**
   * Lista todos los productos del tenant actual
   * @param {Object} filtros - Filtros adicionales
   * @returns {Promise<Array>}
   */
  async listar(filtros = {}) {
    try {
      const tenantId = this.getTenantId();
      let query = this.db.collection(this.collectionName)
        .where('tenantId', '==', tenantId);

      // Aplicar filtros adicionales
      if (filtros.categoriaId) {
        query = query.where('categoriaId', '==', filtros.categoriaId);
      }

      if (filtros.visible !== undefined) {
        query = query.where('visible', '==', filtros.visible);
      }

      // Ordenamiento
      query = query.orderBy('timestamp', 'desc');

      // Paginación
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }

      if (filtros.startAfter) {
        query = query.startAfter(filtros.startAfter);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    } catch (error) {
      console.error('Error al listar productos:', error);
      throw error;
    }
  }

  /**
   * Obtiene un producto por ID (con validación de tenant)
   */
  async obtenerPorId(productoId) {
    try {
      const tenantId = this.getTenantId();
      const doc = await this.db.collection(this.collectionName).doc(productoId).get();

      if (!doc.exists) {
        throw new Error('Producto no encontrado');
      }

      const producto = { id: doc.id, ...doc.data() };

      // VALIDACIÓN CRÍTICA: Verificar que pertenece al tenant actual
      if (producto.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para acceder a este producto');
      }

      return producto;

    } catch (error) {
      console.error('Error al obtener producto:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo producto
   */
  async crear(productoData) {
    // Verificar permiso
    if (!window.authManager.hasPermission('productos_crear')) {
      throw new Error('No tienes permisos para crear productos');
    }

    try {
      const tenantId = this.getTenantId();

      // Preparar datos
      const nuevoProducto = {
        ...productoData,
        tenantId, // OBLIGATORIO
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: window.appContext.userId
      };

      // Validar límites del plan
      await this.validarLimitesProductos();

      // Crear documento
      const docRef = await this.db.collection(this.collectionName).add(nuevoProducto);

      console.log(`✅ Producto creado: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('Error al crear producto:', error);
      throw error;
    }
  }

  /**
   * Actualiza un producto existente
   */
  async actualizar(productoId, datos) {
    // Verificar permiso
    if (!window.authManager.hasPermission('productos_editar')) {
      throw new Error('No tienes permisos para editar productos');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar que el producto pertenece al tenant
      const productoExistente = await this.obtenerPorId(productoId);
      if (productoExistente.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para editar este producto');
      }

      // IMPORTANTE: No permitir cambiar el tenantId
      if (datos.tenantId && datos.tenantId !== tenantId) {
        throw new Error('No se puede cambiar el tenant de un producto');
      }

      // Actualizar
      await this.db.collection(this.collectionName).doc(productoId).update({
        ...datos,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        actualizadoPor: window.appContext.userId
      });

      console.log(`✅ Producto actualizado: ${productoId}`);

    } catch (error) {
      console.error('Error al actualizar producto:', error);
      throw error;
    }
  }

  /**
   * Elimina un producto
   */
  async eliminar(productoId) {
    // Verificar permiso
    if (!window.authManager.hasPermission('productos_eliminar')) {
      throw new Error('No tienes permisos para eliminar productos');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar que el producto pertenece al tenant
      const producto = await this.obtenerPorId(productoId);
      if (producto.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para eliminar este producto');
      }

      // Eliminar imagen de Storage si existe
      if (producto.imagenUrl) {
        await this.eliminarImagen(producto.imagenUrl);
      }

      // Eliminar documento
      await this.db.collection(this.collectionName).doc(productoId).delete();

      console.log(`✅ Producto eliminado: ${productoId}`);

    } catch (error) {
      console.error('Error al eliminar producto:', error);
      throw error;
    }
  }

  /**
   * Busca productos por texto
   */
  async buscar(texto) {
    try {
      const tenantId = this.getTenantId();
      const textoLower = texto.toLowerCase();

      // Obtener todos los productos del tenant (en Firestore no hay full-text search nativo)
      const productos = await this.listar();

      // Filtrar en cliente
      return productos.filter(producto =>
        producto.nombre.toLowerCase().includes(textoLower) ||
        producto.codigo?.toLowerCase().includes(textoLower) ||
        producto.descripcion?.toLowerCase().includes(textoLower)
      );

    } catch (error) {
      console.error('Error al buscar productos:', error);
      throw error;
    }
  }

  /**
   * Sube imagen a Storage
   */
  async subirImagen(file, productoId) {
    try {
      const tenantId = this.getTenantId();
      const storage = firebase.storage();

      // Path con namespace de tenant
      const path = `${tenantId}/productos/${productoId}/${file.name}`;
      const storageRef = storage.ref(path);

      // Subir archivo
      await storageRef.put(file);

      // Obtener URL de descarga
      const downloadURL = await storageRef.getDownloadURL();

      console.log(`✅ Imagen subida: ${downloadURL}`);
      return downloadURL;

    } catch (error) {
      console.error('Error al subir imagen:', error);
      throw error;
    }
  }

  /**
   * Elimina imagen de Storage
   */
  async eliminarImagen(imageUrl) {
    try {
      const storage = firebase.storage();
      const imageRef = storage.refFromURL(imageUrl);
      await imageRef.delete();
      console.log(`✅ Imagen eliminada: ${imageUrl}`);
    } catch (error) {
      console.warn('Error al eliminar imagen:', error);
      // No lanzar error - la imagen puede no existir
    }
  }

  /**
   * Valida que el tenant no exceda su límite de productos
   */
  async validarLimitesProductos() {
    const tenant = window.tenantResolver.getTenant();
    if (!tenant.limites || !tenant.limites.maxProductos) {
      return; // Sin límites
    }

    const productos = await this.listar();
    if (productos.length >= tenant.limites.maxProductos) {
      throw new Error(`Has alcanzado el límite de ${tenant.limites.maxProductos} productos de tu plan. Actualiza tu plan para agregar más.`);
    }
  }
}

// Inicializar servicio (cuando Firebase esté listo)
// window.productosService = new ProductosService(db);
```

---

## 4. Inicialización de la App (index.html / admin.html)

```javascript
// Script de inicialización común (agregar al final de cada página)

/**
 * INICIALIZACIÓN MULTI-TENANT
 * Este script se ejecuta en TODAS las páginas
 */

(async function initializeApp() {
  try {
    console.log('🚀 Iniciando aplicación multi-tenant...');

    // 1. Inicializar Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
      authDomain: "mishell-boutique-admin.firebaseapp.com",
      projectId: "mishell-boutique-admin",
      storageBucket: "mishell-boutique-admin.firebasestorage.app",
      messagingSenderId: "399662956877",
      appId: "1:399662956877:web:084236f6f0a8f704"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const storage = firebase.storage();

    console.log('✅ Firebase inicializado');

    // 2. Resolver tenant (CRÍTICO - antes de cualquier otra cosa)
    await window.tenantResolver.initialize(db);
    console.log('✅ Tenant resuelto');

    // 3. Inicializar Auth Manager
    window.authManager.initialize(auth, db);
    console.log('✅ Auth Manager inicializado');

    // 4. Inicializar servicios
    window.productosService = new ProductosService(db);
    window.ventasService = new VentasService(db);
    window.clientesService = new ClientesService(db);
    console.log('✅ Servicios inicializados');

    // 5. Si estamos en página protegida, verificar autenticación
    const protectedPages = ['admin.html', 'super-admin.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
      window.authManager.requireAuth();
    }

    // 6. Inicializar módulos específicos de la página
    if (typeof initializePageModules === 'function') {
      await initializePageModules();
    }

    console.log('✅ Aplicación inicializada correctamente');

  } catch (error) {
    console.error('❌ Error al inicializar aplicación:', error);
    alert('Error al cargar la aplicación. Por favor recarga la página.');
  }
})();
```

---

## 5. HTML con data attributes para branding dinámico

```html
<!-- Ejemplo: Navbar con branding dinámico -->

<nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom">
  <div class="container-fluid">
    <!-- Logo dinámico -->
    <a class="navbar-brand" href="/">
      <img src="" alt="Logo" data-tenant-logo style="height: 50px;">
    </a>

    <!-- Nombre dinámico -->
    <span class="navbar-text fw-bold" data-tenant-title>
      Mi Tienda
    </span>

    <!-- Botón con color dinámico (usa CSS variable) -->
    <button class="btn btn-primary">
      Ver Catálogo
    </button>
  </div>
</nav>

<!-- Footer con texto dinámico -->
<footer class="bg-light py-4">
  <div class="container text-center">
    <p class="mb-0" data-tenant-footer>
      © 2026 Mi Tienda. Todos los derechos reservados.
    </p>
  </div>
</footer>

<!-- CSS que usa variables dinámicas -->
<style>
.btn-primary {
  background-color: var(--color-primario);
  border-color: var(--color-primario);
  transition: var(--transicion);
}

.btn-primary:hover {
  background-color: var(--color-primario-hover);
  border-color: var(--color-primario-hover);
}

.product-card {
  border: 1px solid var(--color-borde);
  border-radius: var(--radio-md);
  transition: var(--transicion);
}

.product-card:hover {
  border-color: var(--color-primario);
  box-shadow: 0 0 0 2px var(--color-primario-claro);
}
</style>
```

---

## 6. Firestore Security Rules (Multi-Tenant)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ========== HELPER FUNCTIONS ==========

    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
    }

    function isSuperAdmin() {
      return isAuthenticated() && getUserData().rol == "SUPER_ADMIN";
    }

    function belongsToTenant(tenantId) {
      return isAuthenticated() &&
             (getUserData().tenantId == tenantId || isSuperAdmin());
    }

    function hasPermission(permission) {
      return isAuthenticated() &&
             (getUserData().permisos[permission] == true || isSuperAdmin());
    }

    function isActivoUser() {
      return isAuthenticated() && getUserData().activo == true;
    }

    // ========== TENANTS ==========

    match /tenants/{tenantId} {
      // Solo Super Admins pueden gestionar tenants
      allow read: if isSuperAdmin();
      allow create, update: if isSuperAdmin();
      allow delete: if false; // Nunca eliminar (usar estado "cancelado")
    }

    // ========== PRODUCTOS ==========

    match /productos/{productoId} {
      // Lectura pública (para catálogo)
      allow read: if true;

      // Crear: Solo usuarios con permiso del mismo tenant
      allow create: if isAuthenticated() &&
                      isActivoUser() &&
                      hasPermission("productos_crear") &&
                      request.resource.data.tenantId == getUserData().tenantId &&
                      request.resource.data.keys().hasAll(['tenantId', 'nombre', 'precio']);

      // Actualizar: Solo del mismo tenant, no cambiar tenantId
      allow update: if belongsToTenant(resource.data.tenantId) &&
                      isActivoUser() &&
                      hasPermission("productos_editar") &&
                      request.resource.data.tenantId == resource.data.tenantId; // No cambiar tenant

      // Eliminar: Solo del mismo tenant
      allow delete: if belongsToTenant(resource.data.tenantId) &&
                      isActivoUser() &&
                      hasPermission("productos_eliminar");
    }

    // ========== VENTAS ==========

    match /ventas/{ventaId} {
      // Leer solo del mismo tenant
      allow read: if belongsToTenant(resource.data.tenantId) &&
                    isActivoUser() &&
                    hasPermission("ventas_ver");

      // Crear con tenantId correcto
      allow create: if isAuthenticated() &&
                      isActivoUser() &&
                      hasPermission("ventas_crear") &&
                      request.resource.data.tenantId == getUserData().tenantId;

      // Actualizar solo del mismo tenant
      allow update: if belongsToTenant(resource.data.tenantId) &&
                      isActivoUser() &&
                      hasPermission("ventas_editar") &&
                      request.resource.data.tenantId == resource.data.tenantId;

      // No eliminar ventas (usar estado "Anulada")
      allow delete: if false;
    }

    // ========== USUARIOS ==========

    match /usuarios/{userId} {
      // Leer: Super Admin o usuarios del mismo tenant con permiso
      allow read: if isSuperAdmin() ||
                    (belongsToTenant(resource.data.tenantId) &&
                     hasPermission("usuarios_ver"));

      // Crear: Super Admin o Admin Tenant
      allow create: if isSuperAdmin() ||
                      (hasPermission("usuarios_crear") &&
                       request.resource.data.tenantId == getUserData().tenantId);

      // Actualizar: Super Admin o Admin Tenant del mismo tenant
      allow update: if isSuperAdmin() ||
                      (belongsToTenant(resource.data.tenantId) &&
                       hasPermission("usuarios_editar") &&
                       request.resource.data.tenantId == resource.data.tenantId);

      // Eliminar: Solo Super Admin
      allow delete: if isSuperAdmin();
    }

    // ========== CLIENTES, PEDIDOS WEB, APARTADOS ==========
    // Patrón similar: filtrado por tenantId

    match /clientes/{clienteId} {
      allow read: if belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() &&
                      request.resource.data.tenantId == getUserData().tenantId;
      allow update: if belongsToTenant(resource.data.tenantId);
      allow delete: if belongsToTenant(resource.data.tenantId);
    }

    match /pedidosWeb/{pedidoId} {
      // Crear: Público (desde catálogo)
      allow create: if request.resource.data.keys().hasAll(['tenantId', 'items', 'total']);

      // Leer/actualizar: Solo del tenant
      allow read, update: if belongsToTenant(resource.data.tenantId);
      allow delete: if false;
    }

    // ========== DEFAULT: DENY ALL ==========
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

Estos ejemplos de código te dan una base sólida para implementar la arquitectura multi-tenant. ¿Deseas que comience con la implementación real? 🚀
