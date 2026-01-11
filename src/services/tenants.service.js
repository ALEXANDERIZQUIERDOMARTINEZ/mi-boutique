/**
 * SERVICIO DE TENANTS
 * Gestión de tenants (solo accesible por Super Admins)
 */

class TenantsService {
  constructor(db) {
    this.db = db;
    this.collectionName = 'tenants';
  }

  /**
   * Verifica que el usuario actual es Super Admin
   * @throws {Error} Si no es Super Admin
   */
  requireSuperAdmin() {
    if (!window.appContext || !window.appContext.isSuperAdmin) {
      throw new Error('Solo Super Admins pueden gestionar tenants');
    }
  }

  /**
   * Lista todos los tenants
   * @param {Object} filtros - Filtros opcionales
   * @returns {Promise<Array>}
   */
  async listar(filtros = {}) {
    this.requireSuperAdmin();

    try {
      let query = this.db.collection(this.collectionName);

      // Filtrar por estado
      if (filtros.estado) {
        query = query.where('estado', '==', filtros.estado);
      }

      // Filtrar por plan
      if (filtros.planId) {
        query = query.where('planId', '==', filtros.planId);
      }

      // Ordenamiento
      query = query.orderBy('createdAt', 'desc');

      // Paginación
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    } catch (error) {
      console.error('Error al listar tenants:', error);
      throw error;
    }
  }

  /**
   * Obtiene un tenant por ID
   * @param {string} tenantId
   * @returns {Promise<Object>}
   */
  async obtenerPorId(tenantId) {
    this.requireSuperAdmin();

    try {
      const doc = await this.db.collection(this.collectionName).doc(tenantId).get();

      if (!doc.exists) {
        throw new Error('Tenant no encontrado');
      }

      return {
        id: doc.id,
        ...doc.data()
      };

    } catch (error) {
      console.error('Error al obtener tenant:', error);
      throw error;
    }
  }

  /**
   * Busca un tenant por slug
   * @param {string} slug
   * @returns {Promise<Object|null>}
   */
  async buscarPorSlug(slug) {
    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('slug', '==', slug)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      };

    } catch (error) {
      console.error('Error al buscar tenant por slug:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo tenant
   * @param {Object} tenantData
   * @returns {Promise<string>} ID del tenant creado
   */
  async crear(tenantData) {
    this.requireSuperAdmin();

    try {
      // Validar que el slug sea único
      const existente = await this.buscarPorSlug(tenantData.slug);
      if (existente) {
        throw new Error('Ya existe un tenant con este slug');
      }

      // Obtener el plan
      const plan = await this.obtenerPlan(tenantData.planId);
      if (!plan) {
        throw new Error('Plan no encontrado');
      }

      // Preparar datos del tenant
      const nuevoTenant = {
        nombre: tenantData.nombre,
        slug: tenantData.slug,
        estado: tenantData.estado || 'trial',
        planId: tenantData.planId,
        dominioCustom: tenantData.dominioCustom || null,

        // Límites del plan
        limites: {
          maxProductos: plan.limites.maxProductos,
          maxUsuarios: plan.limites.maxUsuarios,
          maxStorage: plan.limites.maxStorage,
          features: plan.limites.features || []
        },

        // Branding por defecto
        branding: tenantData.branding || {
          logo: null,
          faviconUrl: null,
          colorPrimario: '#D988B9',
          colorSecundario: '#333333',
          colorAccento: '#FFD700',
          fuentePrincipal: 'Poppins, sans-serif',
          textos: {
            nombreTienda: tenantData.nombre,
            tagline: '',
            footerTexto: `© ${new Date().getFullYear()} ${tenantData.nombre}. Todos los derechos reservados.`,
            descripcionSEO: `Tienda en línea de ${tenantData.nombre}`
          }
        },

        // Contacto
        contacto: tenantData.contacto || {
          email: '',
          telefono: '',
          direccion: '',
          ciudad: '',
          pais: 'Colombia'
        },

        // Suscripción
        suscripcion: {
          fechaInicio: firebase.firestore.FieldValue.serverTimestamp(),
          fechaRenovacion: this.calcularFechaRenovacion(plan.periodo),
          metodoPago: null,
          estadoPago: 'pendiente'
        },

        // Estadísticas iniciales
        estadisticas: {
          totalProductos: 0,
          totalUsuarios: 0,
          totalVentas: 0,
          storageUsado: 0
        },

        // Propietario (se asignará después)
        propietarioId: null,

        // Metadatos
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: window.appContext.userId
      };

      // Crear documento
      const docRef = await this.db.collection(this.collectionName).add(nuevoTenant);

      console.log(`✅ Tenant creado: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('Error al crear tenant:', error);
      throw error;
    }
  }

  /**
   * Actualiza un tenant
   * @param {string} tenantId
   * @param {Object} datos
   * @returns {Promise<void>}
   */
  async actualizar(tenantId, datos) {
    this.requireSuperAdmin();

    try {
      // Si se cambia el slug, validar que sea único
      if (datos.slug) {
        const existente = await this.buscarPorSlug(datos.slug);
        if (existente && existente.id !== tenantId) {
          throw new Error('Ya existe un tenant con este slug');
        }
      }

      // Si se cambia el plan, actualizar límites
      if (datos.planId) {
        const plan = await this.obtenerPlan(datos.planId);
        if (plan) {
          datos.limites = {
            maxProductos: plan.limites.maxProductos,
            maxUsuarios: plan.limites.maxUsuarios,
            maxStorage: plan.limites.maxStorage,
            features: plan.limites.features || []
          };
        }
      }

      // Actualizar
      await this.db.collection(this.collectionName).doc(tenantId).update({
        ...datos,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Tenant actualizado: ${tenantId}`);

    } catch (error) {
      console.error('Error al actualizar tenant:', error);
      throw error;
    }
  }

  /**
   * Suspende un tenant
   * @param {string} tenantId
   * @param {string} motivo
   * @returns {Promise<void>}
   */
  async suspender(tenantId, motivo) {
    this.requireSuperAdmin();

    try {
      await this.actualizar(tenantId, {
        estado: 'suspendido',
        motivoSuspension: motivo,
        fechaSuspension: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Tenant suspendido: ${tenantId}`);

    } catch (error) {
      console.error('Error al suspender tenant:', error);
      throw error;
    }
  }

  /**
   * Activa un tenant suspendido
   * @param {string} tenantId
   * @returns {Promise<void>}
   */
  async activar(tenantId) {
    this.requireSuperAdmin();

    try {
      await this.actualizar(tenantId, {
        estado: 'activo',
        motivoSuspension: null,
        fechaSuspension: null
      });

      console.log(`✅ Tenant activado: ${tenantId}`);

    } catch (error) {
      console.error('Error al activar tenant:', error);
      throw error;
    }
  }

  /**
   * Cancela un tenant (soft delete)
   * @param {string} tenantId
   * @returns {Promise<void>}
   */
  async cancelar(tenantId) {
    this.requireSuperAdmin();

    try {
      await this.actualizar(tenantId, {
        estado: 'cancelado',
        fechaCancelacion: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Tenant cancelado: ${tenantId}`);

    } catch (error) {
      console.error('Error al cancelar tenant:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas globales de la plataforma
   * @returns {Promise<Object>}
   */
  async obtenerEstadisticasGlobales() {
    this.requireSuperAdmin();

    try {
      const tenants = await this.listar();

      return {
        totalTenants: tenants.length,
        tenantsActivos: tenants.filter(t => t.estado === 'activo').length,
        tenantsTrial: tenants.filter(t => t.estado === 'trial').length,
        tenantsSuspendidos: tenants.filter(t => t.estado === 'suspendido').length,
        tenantsCancelados: tenants.filter(t => t.estado === 'cancelado').length,
        totalProductos: tenants.reduce((sum, t) => sum + (t.estadisticas?.totalProductos || 0), 0),
        totalUsuarios: tenants.reduce((sum, t) => sum + (t.estadisticas?.totalUsuarios || 0), 0),
        totalVentas: tenants.reduce((sum, t) => sum + (t.estadisticas?.totalVentas || 0), 0)
      };

    } catch (error) {
      console.error('Error al obtener estadísticas globales:', error);
      throw error;
    }
  }

  /**
   * Obtiene un plan por ID
   * @param {string} planId
   * @returns {Promise<Object>}
   */
  async obtenerPlan(planId) {
    try {
      const doc = await this.db.collection('planes').doc(planId).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data()
      };

    } catch (error) {
      console.error('Error al obtener plan:', error);
      throw error;
    }
  }

  /**
   * Calcula la fecha de renovación según el periodo del plan
   * @param {string} periodo - 'mensual' o 'anual'
   * @returns {firebase.firestore.Timestamp}
   */
  calcularFechaRenovacion(periodo) {
    const fecha = new Date();

    if (periodo === 'mensual') {
      fecha.setMonth(fecha.getMonth() + 1);
    } else if (periodo === 'anual') {
      fecha.setFullYear(fecha.getFullYear() + 1);
    } else {
      // Por defecto, trial de 14 días
      fecha.setDate(fecha.getDate() + 14);
    }

    return firebase.firestore.Timestamp.fromDate(fecha);
  }

  /**
   * Actualiza las estadísticas de un tenant
   * @param {string} tenantId
   * @param {Object} estadisticas
   * @returns {Promise<void>}
   */
  async actualizarEstadisticas(tenantId, estadisticas) {
    try {
      await this.db.collection(this.collectionName).doc(tenantId).update({
        estadisticas,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error('Error al actualizar estadísticas:', error);
      throw error;
    }
  }
}

// Exportar
if (typeof window !== 'undefined') {
  window.TenantsService = TenantsService;
}
