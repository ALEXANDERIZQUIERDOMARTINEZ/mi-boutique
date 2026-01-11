/**
 * SERVICIO DE VENTAS
 * Gestión de ventas con filtrado automático por tenantId
 */

class VentasService {
  constructor(db) {
    this.db = db;
    this.collectionName = 'ventas';
  }

  /**
   * Obtiene el tenantId del contexto actual
   * @returns {string}
   */
  getTenantId() {
    if (!window.appContext) {
      throw new Error('Contexto de aplicación no inicializado');
    }
    return window.appContext.tenantId;
  }

  /**
   * Lista todas las ventas del tenant actual
   * @param {Object} filtros - Filtros adicionales
   * @returns {Promise<Array>}
   */
  async listar(filtros = {}) {
    try {
      const tenantId = this.getTenantId();
      let query = this.db.collection(this.collectionName)
        .where('tenantId', '==', tenantId);

      // Aplicar filtros adicionales
      if (filtros.estado) {
        query = query.where('estado', '==', filtros.estado);
      }

      if (filtros.tipoVenta) {
        query = query.where('tipoVenta', '==', filtros.tipoVenta);
      }

      if (filtros.fechaInicio && filtros.fechaFin) {
        query = query
          .where('timestamp', '>=', filtros.fechaInicio)
          .where('timestamp', '<=', filtros.fechaFin);
      }

      // Ordenamiento
      query = query.orderBy('timestamp', 'desc');

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
      console.error('Error al listar ventas:', error);
      throw error;
    }
  }

  /**
   * Obtiene una venta por ID
   * @param {string} ventaId
   * @returns {Promise<Object>}
   */
  async obtenerPorId(ventaId) {
    try {
      const tenantId = this.getTenantId();
      const doc = await this.db.collection(this.collectionName).doc(ventaId).get();

      if (!doc.exists) {
        throw new Error('Venta no encontrada');
      }

      const venta = { id: doc.id, ...doc.data() };

      // Validar tenant
      if (venta.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para acceder a esta venta');
      }

      return venta;

    } catch (error) {
      console.error('Error al obtener venta:', error);
      throw error;
    }
  }

  /**
   * Crea una nueva venta
   * @param {Object} ventaData
   * @returns {Promise<string>} ID de la venta creada
   */
  async crear(ventaData) {
    // Verificar permiso
    if (!window.authManager.hasPermission('ventas_crear')) {
      throw new Error('No tienes permisos para crear ventas');
    }

    try {
      const tenantId = this.getTenantId();

      // Preparar datos
      const nuevaVenta = {
        ...ventaData,
        tenantId, // OBLIGATORIO
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: window.appContext.userId,
        estado: ventaData.estado || 'Completada'
      };

      // Crear documento
      const docRef = await this.db.collection(this.collectionName).add(nuevaVenta);

      console.log(`✅ Venta creada: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('Error al crear venta:', error);
      throw error;
    }
  }

  /**
   * Actualiza una venta
   * @param {string} ventaId
   * @param {Object} datos
   * @returns {Promise<void>}
   */
  async actualizar(ventaId, datos) {
    // Verificar permiso
    if (!window.authManager.hasPermission('ventas_editar')) {
      throw new Error('No tienes permisos para editar ventas');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar que la venta pertenece al tenant
      const ventaExistente = await this.obtenerPorId(ventaId);
      if (ventaExistente.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para editar esta venta');
      }

      // No permitir cambiar tenantId
      delete datos.tenantId;

      // Actualizar
      await this.db.collection(this.collectionName).doc(ventaId).update({
        ...datos,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        actualizadoPor: window.appContext.userId
      });

      console.log(`✅ Venta actualizada: ${ventaId}`);

    } catch (error) {
      console.error('Error al actualizar venta:', error);
      throw error;
    }
  }

  /**
   * Anula una venta
   * @param {string} ventaId
   * @param {string} motivo
   * @returns {Promise<void>}
   */
  async anular(ventaId, motivo) {
    // Verificar permiso
    if (!window.authManager.hasPermission('ventas_anular')) {
      throw new Error('No tienes permisos para anular ventas');
    }

    try {
      await this.actualizar(ventaId, {
        estado: 'Anulada',
        motivoAnulacion: motivo,
        anuladoPor: window.appContext.userId,
        fechaAnulacion: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Venta anulada: ${ventaId}`);

    } catch (error) {
      console.error('Error al anular venta:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de ventas
   * @param {Object} filtros
   * @returns {Promise<Object>}
   */
  async obtenerEstadisticas(filtros = {}) {
    try {
      const ventas = await this.listar(filtros);

      const stats = {
        totalVentas: ventas.length,
        ventasCompletadas: ventas.filter(v => v.estado === 'Completada').length,
        ventasPendientes: ventas.filter(v => v.estado === 'Pendiente').length,
        ventasAnuladas: ventas.filter(v => v.estado === 'Anulada').length,
        totalIngresos: 0,
        promedioVenta: 0
      };

      // Calcular totales (solo ventas completadas)
      const ventasCompletadas = ventas.filter(v => v.estado === 'Completada');
      stats.totalIngresos = ventasCompletadas.reduce((sum, v) => sum + (v.totalVenta || 0), 0);
      stats.promedioVenta = ventasCompletadas.length > 0
        ? stats.totalIngresos / ventasCompletadas.length
        : 0;

      return stats;

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }
  }

  /**
   * Obtiene ventas por rango de fechas
   * @param {Date} fechaInicio
   * @param {Date} fechaFin
   * @returns {Promise<Array>}
   */
  async obtenerPorRangoFechas(fechaInicio, fechaFin) {
    return this.listar({
      fechaInicio: firebase.firestore.Timestamp.fromDate(fechaInicio),
      fechaFin: firebase.firestore.Timestamp.fromDate(fechaFin)
    });
  }

  /**
   * Obtiene ventas del día actual
   * @returns {Promise<Array>}
   */
  async obtenerVentasHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    return this.obtenerPorRangoFechas(hoy, manana);
  }
}

// Exportar
if (typeof window !== 'undefined') {
  window.VentasService = VentasService;
}
