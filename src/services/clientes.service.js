/**
 * SERVICIO DE CLIENTES
 * Gestión de clientes con filtrado automático por tenantId
 */

class ClientesService {
  constructor(db) {
    this.db = db;
    this.collectionName = 'clientes';
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
   * Lista todos los clientes del tenant actual
   * @param {Object} filtros - Filtros adicionales
   * @returns {Promise<Array>}
   */
  async listar(filtros = {}) {
    try {
      const tenantId = this.getTenantId();
      let query = this.db.collection(this.collectionName)
        .where('tenantId', '==', tenantId);

      // Ordenamiento
      query = query.orderBy('nombre', 'asc');

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
      console.error('Error al listar clientes:', error);
      throw error;
    }
  }

  /**
   * Obtiene un cliente por ID
   * @param {string} clienteId
   * @returns {Promise<Object>}
   */
  async obtenerPorId(clienteId) {
    try {
      const tenantId = this.getTenantId();
      const doc = await this.db.collection(this.collectionName).doc(clienteId).get();

      if (!doc.exists) {
        throw new Error('Cliente no encontrado');
      }

      const cliente = { id: doc.id, ...doc.data() };

      // Validar tenant
      if (cliente.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para acceder a este cliente');
      }

      return cliente;

    } catch (error) {
      console.error('Error al obtener cliente:', error);
      throw error;
    }
  }

  /**
   * Busca un cliente por cédula
   * @param {string} cedula
   * @returns {Promise<Object|null>}
   */
  async buscarPorCedula(cedula) {
    try {
      const tenantId = this.getTenantId();
      const snapshot = await this.db.collection(this.collectionName)
        .where('tenantId', '==', tenantId)
        .where('cedula', '==', cedula)
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
      console.error('Error al buscar cliente por cédula:', error);
      throw error;
    }
  }

  /**
   * Busca clientes por texto (nombre, cédula, celular)
   * @param {string} texto
   * @returns {Promise<Array>}
   */
  async buscar(texto) {
    try {
      const textoLower = texto.toLowerCase();
      const clientes = await this.listar();

      return clientes.filter(cliente =>
        cliente.nombre?.toLowerCase().includes(textoLower) ||
        cliente.cedula?.includes(texto) ||
        cliente.celular?.includes(texto)
      );

    } catch (error) {
      console.error('Error al buscar clientes:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo cliente
   * @param {Object} clienteData
   * @returns {Promise<string>} ID del cliente creado
   */
  async crear(clienteData) {
    // Verificar permiso
    if (!window.authManager.hasPermission('clientes_crear')) {
      throw new Error('No tienes permisos para crear clientes');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar si ya existe un cliente con la misma cédula
      if (clienteData.cedula) {
        const clienteExistente = await this.buscarPorCedula(clienteData.cedula);
        if (clienteExistente) {
          throw new Error('Ya existe un cliente con esta cédula');
        }
      }

      // Preparar datos
      const nuevoCliente = {
        ...clienteData,
        tenantId, // OBLIGATORIO
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: window.appContext.userId
      };

      // Crear documento
      const docRef = await this.db.collection(this.collectionName).add(nuevoCliente);

      console.log(`✅ Cliente creado: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('Error al crear cliente:', error);
      throw error;
    }
  }

  /**
   * Actualiza un cliente
   * @param {string} clienteId
   * @param {Object} datos
   * @returns {Promise<void>}
   */
  async actualizar(clienteId, datos) {
    // Verificar permiso
    if (!window.authManager.hasPermission('clientes_editar')) {
      throw new Error('No tienes permisos para editar clientes');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar que el cliente pertenece al tenant
      const clienteExistente = await this.obtenerPorId(clienteId);
      if (clienteExistente.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para editar este cliente');
      }

      // No permitir cambiar tenantId
      delete datos.tenantId;

      // Actualizar
      await this.db.collection(this.collectionName).doc(clienteId).update({
        ...datos,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        actualizadoPor: window.appContext.userId
      });

      console.log(`✅ Cliente actualizado: ${clienteId}`);

    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      throw error;
    }
  }

  /**
   * Elimina un cliente
   * @param {string} clienteId
   * @returns {Promise<void>}
   */
  async eliminar(clienteId) {
    // Verificar permiso
    if (!window.authManager.hasPermission('clientes_eliminar')) {
      throw new Error('No tienes permisos para eliminar clientes');
    }

    try {
      const tenantId = this.getTenantId();

      // Verificar que el cliente pertenece al tenant
      const cliente = await this.obtenerPorId(clienteId);
      if (cliente.tenantId !== tenantId && !window.appContext.isSuperAdmin) {
        throw new Error('No autorizado para eliminar este cliente');
      }

      // Eliminar documento
      await this.db.collection(this.collectionName).doc(clienteId).delete();

      console.log(`✅ Cliente eliminado: ${clienteId}`);

    } catch (error) {
      console.error('Error al eliminar cliente:', error);
      throw error;
    }
  }

  /**
   * Registra una compra del cliente
   * @param {string} clienteId
   * @param {Object} compraData
   * @returns {Promise<void>}
   */
  async registrarCompra(clienteId, compraData) {
    try {
      await this.actualizar(clienteId, {
        ultimaCompra: firebase.firestore.FieldValue.serverTimestamp(),
        totalCompras: firebase.firestore.FieldValue.increment(compraData.total || 0)
      });

    } catch (error) {
      console.error('Error al registrar compra:', error);
      // No lanzar error - esto no debe bloquear la venta
    }
  }

  /**
   * Obtiene estadísticas de clientes
   * @returns {Promise<Object>}
   */
  async obtenerEstadisticas() {
    try {
      const clientes = await this.listar();

      return {
        totalClientes: clientes.length,
        clientesActivos: clientes.filter(c => c.ultimaCompra).length,
        clientesNuevos: clientes.filter(c => !c.ultimaCompra).length
      };

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }
  }
}

// Exportar
if (typeof window !== 'undefined') {
  window.ClientesService = ClientesService;
}
