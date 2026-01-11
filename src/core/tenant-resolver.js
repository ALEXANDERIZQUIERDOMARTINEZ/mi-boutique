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
   * @param {firebase.firestore.Firestore} firebaseDb - Instancia de Firestore
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
    // En desarrollo, no redirigir para facilitar debugging
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.error('❌ Error de tenant en desarrollo:', error.message);
      return;
    }

    // En producción, redirigir a página de error
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
    if (!hex) return '#FFFFFF';
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
    if (!hex) return '#000000';
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
if (typeof window !== 'undefined') {
  window.TenantResolver = TenantResolver;
  window.tenantResolver = new TenantResolver();
}
