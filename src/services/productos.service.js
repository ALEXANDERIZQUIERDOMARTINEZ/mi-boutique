/**
 * SERVICIO DE PRODUCTOS
 * Todas las operaciones CRUD con filtrado automático por tenantId
 */

class ProductosService {
  constructor(db, storage) {
    this.db = db;
    this.storage = storage;
    this.collectionName = 'productos';
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

      if (filtros.proveedor) {
        query = query.where('proveedor', '==', filtros.proveedor);
      }

      // Ordenamiento
      const orderBy = filtros.orderBy || 'timestamp';
      const orderDirection = filtros.orderDirection || 'desc';
      query = query.orderBy(orderBy, orderDirection);

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
   * @param {string} productoId
   * @returns {Promise<Object>}
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
   * @param {Object} productoData
   * @returns {Promise<string>} ID del producto creado
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
   * @param {string} productoId
   * @param {Object} datos
   * @returns {Promise<void>}
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

      // Eliminar tenantId de los datos para evitar sobrescritura
      delete datos.tenantId;

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
   * @param {string} productoId
   * @returns {Promise<void>}
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
   * @param {string} texto
   * @returns {Promise<Array>}
   */
  async buscar(texto) {
    try {
      const textoLower = texto.toLowerCase();

      // Obtener todos los productos del tenant (en Firestore no hay full-text search nativo)
      const productos = await this.listar();

      // Filtrar en cliente
      return productos.filter(producto =>
        producto.nombre?.toLowerCase().includes(textoLower) ||
        producto.codigo?.toLowerCase().includes(textoLower) ||
        producto.codigoBarras?.toLowerCase().includes(textoLower) ||
        producto.descripcion?.toLowerCase().includes(textoLower)
      );

    } catch (error) {
      console.error('Error al buscar productos:', error);
      throw error;
    }
  }

  /**
   * Sube imagen a Storage
   * @param {File} file
   * @param {string} productoId
   * @returns {Promise<string>} URL de descarga
   */
  async subirImagen(file, productoId) {
    try {
      const tenantId = this.getTenantId();

      // Path con namespace de tenant
      const path = `${tenantId}/productos/${productoId}/${file.name}`;
      const storageRef = this.storage.ref(path);

      // Subir archivo
      const snapshot = await storageRef.put(file);

      // Obtener URL de descarga
      const downloadURL = await snapshot.ref.getDownloadURL();

      console.log(`✅ Imagen subida: ${downloadURL}`);
      return downloadURL;

    } catch (error) {
      console.error('Error al subir imagen:', error);
      throw error;
    }
  }

  /**
   * Elimina imagen de Storage
   * @param {string} imageUrl
   * @returns {Promise<void>}
   */
  async eliminarImagen(imageUrl) {
    try {
      const imageRef = this.storage.refFromURL(imageUrl);
      await imageRef.delete();
      console.log(`✅ Imagen eliminada: ${imageUrl}`);
    } catch (error) {
      console.warn('Error al eliminar imagen:', error);
      // No lanzar error - la imagen puede no existir
    }
  }

  /**
   * Valida que el tenant no exceda su límite de productos
   * @returns {Promise<void>}
   */
  async validarLimitesProductos() {
    const tenant = window.tenantResolver.getTenant();
    if (!tenant || !tenant.limites || !tenant.limites.maxProductos) {
      return; // Sin límites
    }

    const productos = await this.listar();
    if (productos.length >= tenant.limites.maxProductos) {
      throw new Error(`Has alcanzado el límite de ${tenant.limites.maxProductos} productos de tu plan. Actualiza tu plan para agregar más.`);
    }
  }

  /**
   * Obtiene estadísticas de productos
   * @returns {Promise<Object>}
   */
  async obtenerEstadisticas() {
    try {
      const productos = await this.listar();

      return {
        total: productos.length,
        visibles: productos.filter(p => p.visible).length,
        ocultos: productos.filter(p => !p.visible).length,
        conStock: productos.filter(p => this.tieneStock(p)).length,
        sinStock: productos.filter(p => !this.tieneStock(p)).length
      };

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }
  }

  /**
   * Verifica si un producto tiene stock
   * @param {Object} producto
   * @returns {boolean}
   */
  tieneStock(producto) {
    if (!producto.variaciones || producto.variaciones.length === 0) {
      return false;
    }

    return producto.variaciones.some(v => v.stock > 0);
  }
}

// Exportar
if (typeof window !== 'undefined') {
  window.ProductosService = ProductosService;
}
