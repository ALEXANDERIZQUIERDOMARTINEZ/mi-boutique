/* ═══════════════════════════════════════════════════════════════════
   GOOGLE ANALYTICS 4 - MISHELL BOUTIQUE
   Sistema de seguimiento y análisis de comportamiento de usuarios
   ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════
// CLASE PARA MANEJO DE ANALYTICS
// ═══════════════════════════════════════════════════════════════════

class Analytics {
    constructor() {
        this.isAvailable = typeof gtag !== 'undefined';
        this.viewedProducts = new Map(); // Tracking de productos más vistos
        this.sessionStartTime = Date.now();

        if (!this.isAvailable) {
            console.warn('⚠️ Google Analytics no está disponible');
        } else {
            console.log('✅ Google Analytics 4 inicializado correctamente');
            this.trackSessionStart();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE SESIÓN
    // ═══════════════════════════════════════════════════════════════

    trackSessionStart() {
        if (!this.isAvailable) return;

        gtag('event', 'session_start', {
            'event_category': 'engagement',
            'event_label': 'User Session Started',
            'session_timestamp': new Date().toISOString()
        });
    }

    trackSessionEnd() {
        if (!this.isAvailable) return;

        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime) / 1000);

        gtag('event', 'session_end', {
            'event_category': 'engagement',
            'event_label': 'User Session Ended',
            'session_duration_seconds': sessionDuration
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE PRODUCTOS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evento: Vista de producto individual
     * @param {Object} product - Objeto con datos del producto
     */
    trackProductView(product) {
        if (!this.isAvailable || !product) return;

        // Registrar vista para tracking de productos más vistos
        const viewCount = (this.viewedProducts.get(product.id) || 0) + 1;
        this.viewedProducts.set(product.id, viewCount);

        const { precioFinal } = this.calculatePrice(product);

        gtag('event', 'view_item', {
            'event_category': 'ecommerce',
            'event_label': product.nombre,
            'currency': 'COP',
            'value': precioFinal,
            'items': [{
                'item_id': product.id,
                'item_name': product.nombre,
                'item_category': product.categoria || 'Sin categoría',
                'price': precioFinal,
                'quantity': 1,
                'item_variant': product.variaciones?.length > 0 ? 'Con variaciones' : 'Sin variaciones'
            }]
        });

        console.log(`📊 GA4: Vista de producto - ${product.nombre}`);
    }

    /**
     * Evento: Vista de lista de productos (por categoría)
     * @param {string} categoryName - Nombre de la categoría
     * @param {Array} products - Array de productos
     */
    trackProductListView(categoryName, products) {
        if (!this.isAvailable || !products || products.length === 0) return;

        gtag('event', 'view_item_list', {
            'event_category': 'ecommerce',
            'event_label': categoryName,
            'item_list_name': categoryName,
            'items': products.slice(0, 10).map((product, index) => ({
                'item_id': product.id,
                'item_name': product.nombre,
                'item_category': product.categoria || 'Sin categoría',
                'price': this.calculatePrice(product).precioFinal,
                'index': index
            }))
        });

        console.log(`📊 GA4: Vista de categoría - ${categoryName} (${products.length} productos)`);
    }

    /**
     * Evento: Producto agregado al carrito
     * @param {Object} cartItem - Item del carrito
     */
    trackAddToCart(cartItem) {
        if (!this.isAvailable || !cartItem) return;

        gtag('event', 'add_to_cart', {
            'event_category': 'ecommerce',
            'event_label': cartItem.nombre,
            'currency': 'COP',
            'value': cartItem.total,
            'items': [{
                'item_id': cartItem.id,
                'item_name': cartItem.nombre,
                'price': cartItem.precio,
                'quantity': cartItem.cantidad,
                'item_variant': `${cartItem.talla} / ${cartItem.color}`
            }]
        });

        console.log(`📊 GA4: Producto agregado al carrito - ${cartItem.nombre}`);
    }

    /**
     * Evento: Producto eliminado del carrito
     * @param {Object} cartItem - Item del carrito
     */
    trackRemoveFromCart(cartItem) {
        if (!this.isAvailable || !cartItem) return;

        gtag('event', 'remove_from_cart', {
            'event_category': 'ecommerce',
            'event_label': cartItem.nombre,
            'currency': 'COP',
            'value': cartItem.total,
            'items': [{
                'item_id': cartItem.id,
                'item_name': cartItem.nombre,
                'price': cartItem.precio,
                'quantity': cartItem.cantidad
            }]
        });

        console.log(`📊 GA4: Producto eliminado del carrito - ${cartItem.nombre}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE CONVERSIÓN
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evento: Inicio del proceso de checkout
     * @param {Array} cart - Array con items del carrito
     * @param {number} total - Total del carrito
     */
    trackBeginCheckout(cart, total) {
        if (!this.isAvailable || !cart || cart.length === 0) return;

        gtag('event', 'begin_checkout', {
            'event_category': 'ecommerce',
            'event_label': 'Checkout Started',
            'currency': 'COP',
            'value': total,
            'items': cart.map(item => ({
                'item_id': item.id,
                'item_name': item.nombre,
                'price': item.precio,
                'quantity': item.cantidad
            }))
        });

        console.log(`📊 GA4: Inicio de checkout - Total: $${total.toLocaleString()}`);
    }

    /**
     * Evento: Compra completada
     * @param {Object} orderData - Datos del pedido
     */
    trackPurchase(orderData) {
        if (!this.isAvailable || !orderData) return;

        gtag('event', 'purchase', {
            'event_category': 'ecommerce',
            'event_label': 'Order Completed',
            'transaction_id': orderData.orderId,
            'currency': 'COP',
            'value': orderData.totalPedido,
            'shipping': 0, // Puedes calcularlo si tienes costos de envío
            'payment_type': orderData.metodoPagoSolicitado,
            'items': orderData.items.map(item => ({
                'item_id': item.productoId,
                'item_name': item.nombre,
                'price': item.precio,
                'quantity': item.cantidad
            }))
        });

        console.log(`📊 GA4: Compra completada - Order ID: ${orderData.orderId}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE BÚSQUEDA
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evento: Búsqueda de productos
     * @param {string} searchTerm - Término de búsqueda
     * @param {number} resultsCount - Cantidad de resultados
     */
    trackSearch(searchTerm, resultsCount = 0) {
        if (!this.isAvailable || !searchTerm) return;

        gtag('event', 'search', {
            'event_category': 'engagement',
            'event_label': searchTerm,
            'search_term': searchTerm,
            'results_count': resultsCount
        });

        console.log(`📊 GA4: Búsqueda - "${searchTerm}" (${resultsCount} resultados)`);
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE NAVEGACIÓN Y FILTROS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evento: Cambio de categoría/filtro
     * @param {string} filterType - Tipo de filtro aplicado
     * @param {string} filterValue - Valor del filtro
     */
    trackFilterApplied(filterType, filterValue) {
        if (!this.isAvailable) return;

        gtag('event', 'filter_applied', {
            'event_category': 'engagement',
            'event_label': `${filterType}: ${filterValue}`,
            'filter_type': filterType,
            'filter_value': filterValue
        });

        console.log(`📊 GA4: Filtro aplicado - ${filterType}: ${filterValue}`);
    }

    /**
     * Evento: Ordenamiento de productos
     * @param {string} sortOption - Opción de ordenamiento
     */
    trackSortApplied(sortOption) {
        if (!this.isAvailable) return;

        gtag('event', 'sort_applied', {
            'event_category': 'engagement',
            'event_label': sortOption,
            'sort_option': sortOption
        });

        console.log(`📊 GA4: Ordenamiento aplicado - ${sortOption}`);
    }

    /**
     * Evento: Zoom de imagen
     * @param {Object} product - Producto cuya imagen se amplió
     */
    trackImageZoom(product) {
        if (!this.isAvailable || !product) return;

        gtag('event', 'image_zoom', {
            'event_category': 'engagement',
            'event_label': product.nombre,
            'product_id': product.id
        });

        console.log(`📊 GA4: Zoom de imagen - ${product.nombre}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTOS DE USUARIO
    // ═══════════════════════════════════════════════════════════════

    /**
     * Evento: Activación de modo mayorista
     */
    trackWholesaleActivation() {
        if (!this.isAvailable) return;

        gtag('event', 'wholesale_mode_activated', {
            'event_category': 'engagement',
            'event_label': 'Wholesale Mode Active'
        });

        console.log(`📊 GA4: Modo mayorista activado`);
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calcular precio final considerando promociones
     * @param {Object} product - Producto
     * @returns {Object} - Precio final y si tiene promoción
     */
    calculatePrice(product) {
        if (!product.promocion || !product.promocion.activa) {
            return { precioFinal: product.precioDetal, tienePromo: false };
        }

        let precioFinal = product.precioDetal;
        if (product.promocion.tipo === 'porcentaje') {
            precioFinal = product.precioDetal * (1 - product.promocion.descuento / 100);
        } else if (product.promocion.tipo === 'fijo') {
            precioFinal = product.promocion.precioFijo;
        }

        return {
            precioFinal: Math.max(0, precioFinal),
            tienePromo: true
        };
    }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTAR INSTANCIA GLOBAL
// ═══════════════════════════════════════════════════════════════════

// Crear instancia global de Analytics
const analytics = new Analytics();

// Rastrear cuando el usuario cierra/abandona la página
window.addEventListener('beforeunload', () => {
    analytics.trackSessionEnd();
});

// Exportar para uso en otros módulos
export default analytics;
