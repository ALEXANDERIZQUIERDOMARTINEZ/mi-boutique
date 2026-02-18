// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- IMPORTACIONES DE ANALYTICS ---
import analytics from './analytics.js';

// *** CONFIGURACIÓN DE FIREBASE ***
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

// --- INICIALIZACIÓN Y GLOBALES ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productsCollection = collection(db, 'productos');
const webOrdersCollection = collection(db, 'pedidosWeb');
const promocionesCollection = collection(db, 'promociones');
const promocionesGlobalesCollection = collection(db, 'promocionesGlobales');
const categoriesCollection = collection(db, 'categorias');
const clientsCollection = collection(db, 'clientes');
const chatConversationsCollection = collection(db, 'chatConversations');
const neighborhoodsCollection = collection(db, 'barrios');
const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

// --- Helper: Open WhatsApp (PWA Compatible) ---
function openWhatsApp(url) {
    // Detectar si estamos en una PWA instalada
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true ||
                  document.referrer.includes('android-app://');

    console.log('🔍 Detectando modo de aplicación:');
    console.log('  - Es PWA instalada:', isPWA);
    console.log('  - URL WhatsApp:', url);

    if (isPWA || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // En PWA o móvil, usar window.location.href para abrir WhatsApp
        // Esto fuerza a abrir en la app de WhatsApp instalada
        console.log('📱 Abriendo WhatsApp en app instalada...');
        window.location.href = url;
    } else {
        // En navegador desktop, usar window.open
        console.log('💻 Abriendo WhatsApp en nueva pestaña...');
        const ventana = window.open(url, '_blank');
        if (!ventana) {
            // Si el popup fue bloqueado, intentar con location
            console.warn('⚠️ Popup bloqueado, intentando con location.href');
            window.location.href = url;
        }
    }
}

let bsToast = null;
let cart = [];
let productsMap = new Map();
let allProducts = [];
let activePromotions = new Map();
let globalPromotion = null; // Promoción global activa (ej: Black Friday)
let itemToDelete = null;
let isWholesaleActive = false;
const WHOLESALE_CODE = "MISHELLMAYOR"; 

let categoriesMap = new Map();

// Variables para filtros avanzados
let advancedFilters = {
    priceMin: 0,
    priceMax: 500000,
    selectedColors: new Set(),
    inStockOnly: false,
    promoOnly: false,
    sortBy: 'newest'
};
let allAvailableColors = new Set();

// ✅ MAPEO DE COLORES: Texto → Código Hex
const COLOR_MAP = {
    // Colores básicos
    'rojo': '#E53935',
    'roja': '#E53935',
    'azul': '#1E88E5',
    'verde': '#43A047',
    'amarillo': '#FDD835',
    'naranja': '#FB8C00',
    'rosa': '#FF8DA1',
    'morado': '#8E24AA',
    'violeta': '#8E24AA',
    'negro': '#212121',
    'negra': '#212121',
    'blanca': '#FFFFFF',
    'blanco': '#FFFFFF',
    'blanco 50%': '#F5F5F5',
    'blanco50%': '#F5F5F5',
    'negro%': '#424242',
    'negro %': '#424242',
    'gris': '#9E9E9E',
    'cafe': '#6D4C41',
    'café': '#6D4C41',
    'cafe claro': '#a18262',
    'café claro': '#a18262',
    'marron': '#6D4C41',
    'cafe oscuro': '#59412f',
    'marrón': '#6D4C41',
    'beige': '#D7CCC8',
    'crema': '#FFF8E1',
    
    // Tonos de rojo
    'rojo oscuro': '#C62828',
    'rojo claro': '#EF5350',
    'coral': '#FF6F61',
    'salmon': '#FA8072',
    'salmón': '#FA8072',
    'fucsia': '#E91E63',
    'magenta': '#E91E63',
    
    // Tonos de azul
    'azul rey': '#1414b8',
    'azul marino': '#0D47A1',
    'azul oscuro': '#0D47A1',
    'azul medio': '#1976D2',
    'azul claro': '#64B5F6',
    'azul bebe': '#64B5F6',
    'azul bebé': '#64B5F6',
    'celeste': '#81D4FA',
    'turquesa': '#00ACC1',
    'aguamarina': '#00BCD4',
    'cyan': '#00BCD4',
    
    // Tonos de verde
    'verde oscuro': '#2E7D32',
    'verde claro': '#81C784',
    'lima': '#CDDC39',
    'oliva': '#7CB342',
    'menta': '#80CBC4',
    
    // Tonos de morado
    'morado oscuro': '#6A1B9A',
    'morado claro': '#BA68C8',
    'lavanda': '#B39DDB',
    'lila': '#E1BEE7',
    
    // Tonos de rosa
    'rosa claro': '#F48FB1',
    'rosa fuerte': '#D81B60',
    'rosado': '#F8BBD0',
    'durazno': '#FFAB91',
    'palo de rosa': '#E6C9C9',
    
    // Tonos de gris
    'gris oscuro': '#424242',
    'gris claro': '#E0E0E0',
    'plata': '#BDBDBD',
    'plateado': '#BDBDBD',
    
    // Otros colores
    'dorado': '#FFD700',
    'oro': '#FFD700',
    'bronce': '#CD7F32',
    'cobre': '#B87333',
    'mostaza': '#E5AE0F',
    'bordo': '#900C3F',
    'vino tinto': '#722F37',
    'terracota': '#CC5233',
    'unico': '#9E9E9E',
    'único': '#9E9E9E',
    
    // Estampados (color neutral)
    'camel': '#bf8a3d',
    'marfil': '#e1cc4f',
    'estampado': '#9E9E9E',
    'floral': '#9E9E9E',
    'rayas': '#9E9E9E',
    'puntos': '#9E9E9E',
};

// ✅ COLORES ESPECIALES CON GRADIENTES Y PATRONES
const SPECIAL_COLORS = {
    'animal print': 'radial-gradient(circle at 20% 50%, #C19A6B 0%, #C19A6B 15%, transparent 15%), radial-gradient(circle at 60% 30%, #8B6914 0%, #8B6914 12%, transparent 12%), radial-gradient(circle at 80% 70%, #C19A6B 0%, #C19A6B 15%, transparent 15%), linear-gradient(135deg, #DEB887 0%, #F4A460 100%)',
    'blanco/negro': 'linear-gradient(to right, #FFFFFF 0%, #FFFFFF 50%, #212121 50%, #212121 100%)',
    'blanco lineas beig': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
    'blanco con lineas beige': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
    'blanco con beige': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
};

// ✅ FUNCIÓN MEJORADA: Detectar si es una combinación de colores
function esCombiacionDeColores(colorName) {
    const normalized = colorName.toLowerCase();
    return normalized.includes('/') ||
           normalized.includes(' y ') ||
           normalized.includes(',') ||
           normalized.includes(' con ');
}

// ✅ FUNCIÓN MEJORADA: Dividir combinación en colores individuales
function dividirColores(colorName) {
    let separadores = ['/'];
    let colores = [colorName];

    for (const sep of separadores) {
        if (colorName.includes(sep)) {
            colores = colorName.split(sep).map(c => c.trim());
            break;
        }
    }

    return colores;
}

// ✅ FUNCIÓN MEJORADA: Convertir nombre de color a código hex (más inteligente)
function getColorHex(colorName) {
    if (!colorName) return '#9E9E9E';
    const normalized = colorName.toLowerCase().trim();

    // Primero verificar si es un color especial
    if (SPECIAL_COLORS[normalized]) {
        return SPECIAL_COLORS[normalized];
    }

    // Buscar en el mapa normal
    if (COLOR_MAP[normalized]) {
        return COLOR_MAP[normalized];
    }

    // Si no está en el mapa, intentar inferir del nombre
    // Colores básicos que no estén en el mapa
    const basicColors = {
        'blanco': '#FFFFFF',
        'negro': '#000000',
        'rojo': '#FF0000',
        'azul': '#0000FF',
        'verde': '#008000',
        'amarillo': '#FFFF00',
        'naranja': '#FFA500',
        'morado': '#800080',
        'rosa': '#FFC0CB',
        'gris': '#808080'
    };

    // Buscar si el nombre contiene algún color básico
    for (const [colorBase, hex] of Object.entries(basicColors)) {
        if (normalized.includes(colorBase)) {
            return hex;
        }
    }

    // Si no se encuentra nada, retornar gris
    return '#9E9E9E';
}

// --- FUNCIONES DE RENDERIZADO ---

function showToast(message, type = 'success') {
    const liveToastEl = document.getElementById('liveToast');
    const toastBodyEl = document.getElementById('toast-body');
    if (liveToastEl && toastBodyEl) {
        if (!bsToast) bsToast = new bootstrap.Toast(liveToastEl, { delay: 3000 });
        
        liveToastEl.className = 'toast align-items-center text-white border-0';
        const bgClass = type === 'error' ? 'text-bg-danger' : (type === 'warning' ? 'text-bg-warning' : 'text-bg-success');
        liveToastEl.classList.add(bgClass);

        toastBodyEl.textContent = message;
        bsToast.show();
    }
}

// ✅ CARGAR PROMOCIONES GLOBALES (Black Friday, etc.)
function loadGlobalPromotions() {
    const q = query(promocionesGlobalesCollection, where('activa', '==', true));
    onSnapshot(q, (snapshot) => {
        globalPromotion = null;

        snapshot.forEach(doc => {
            const promo = doc.data();
            const now = new Date();
            const inicio = promo.fechaInicio?.toDate();
            const fin = promo.fechaFin?.toDate();

            // Verificar si la promoción está dentro del rango de fechas
            if (inicio && fin && now >= inicio && now <= fin) {
                globalPromotion = {
                    id: doc.id,
                    nombre: promo.nombre,
                    descuento: promo.descuento,
                    tipo: promo.tipo || 'porcentaje',
                    tema: promo.tema || 'default' // ej: 'blackfriday', 'navidad', etc.
                };

                // Aplicar tema visual si es Black Friday
                if (globalPromotion.tema === 'blackfriday') {
                    document.body.classList.add('blackfriday-theme');
                    showGlobalPromoBanner();
                } else {
                    document.body.classList.remove('blackfriday-theme');
                    hideGlobalPromoBanner();
                }
            }
        });

        // Si no hay promoción global activa, remover el tema
        if (!globalPromotion) {
            document.body.classList.remove('blackfriday-theme');
            hideGlobalPromoBanner();
        }

        applyFiltersAndRender();
    });
}

function showGlobalPromoBanner() {
    const existingBanner = document.getElementById('global-promo-banner');
    if (existingBanner) return; // Ya existe

    const banner = document.createElement('div');
    banner.id = 'global-promo-banner';
    banner.className = 'global-promo-banner blackfriday-banner';
    banner.innerHTML = `
        <div class="container">
            <div class="promo-content">
                <span class="promo-icon">🔥</span>
                <span class="promo-text">
                    <strong>${globalPromotion.nombre || 'BLACK FRIDAY'}</strong> -
                    ${globalPromotion.descuento}% de descuento en toda la tienda
                </span>
                <span class="promo-icon">🔥</span>
            </div>
        </div>
    `;

    const header = document.querySelector('header.site-header') || document.querySelector('header');
    if (header) {
        header.parentNode.insertBefore(banner, header);
    }
}

function hideGlobalPromoBanner() {
    const banner = document.getElementById('global-promo-banner');
    if (banner) {
        banner.remove();
    }
}

function loadPromotions() {
    const q = query(promocionesCollection, where('activa', '==', true));
    onSnapshot(q, (snapshot) => {
        activePromotions.clear();
        const promotionsContainer = document.getElementById('promotions-container');
        const promotionsSection = document.getElementById('promotions-section');

        let hasActivePromos = false;

        snapshot.forEach(doc => {
            const promo = doc.data();
            const now = new Date();
            const inicio = promo.fechaInicio?.toDate();
            const fin = promo.fechaFin?.toDate();

            if (inicio && fin && now >= inicio && now <= fin) {
                hasActivePromos = true;
                promo.productoIds.forEach(prodId => {
                    activePromotions.set(prodId, {
                        descuento: promo.descuento,
                        tipo: promo.tipoDescuento,
                        nombre: promo.nombre
                    });
                });
            }
        });

        promotionsSection.style.display = hasActivePromos ? 'block' : 'none';
        applyFiltersAndRender();
    });
}

function calculatePromotionPrice(producto) {
    // No aplicar promociones en modo mayorista
    if (isWholesaleActive) {
        return { precioFinal: producto.precioDetal, tienePromo: false };
    }

    let precioFinal = producto.precioDetal;
    let tienePromo = false;
    let nombrePromo = '';

    // 1. Verificar si el producto tiene promoción individual (prioridad)
    if (producto.promocion && producto.promocion.activa) {
        tienePromo = true;
        nombrePromo = 'Oferta Especial';

        if (producto.promocion.tipo === 'porcentaje') {
            precioFinal = producto.precioDetal * (1 - producto.promocion.descuento / 100);
        } else if (producto.promocion.tipo === 'fijo') {
            precioFinal = producto.promocion.precioFijo;
        }
    }
    // 2. Si no tiene promoción individual, aplicar la promoción global (si existe)
    else if (globalPromotion && globalPromotion.descuento > 0) {
        tienePromo = true;
        nombrePromo = globalPromotion.nombre || 'Black Friday';

        if (globalPromotion.tipo === 'porcentaje') {
            precioFinal = producto.precioDetal * (1 - globalPromotion.descuento / 100);
        }
    }

    return {
        precioFinal: Math.max(0, precioFinal),
        tienePromo: tienePromo,
        precioOriginal: producto.precioDetal,
        nombrePromo: nombrePromo
    };
}

// ✅ FUNCIÓN DE FILTRO MEJORADA CON FILTROS AVANZADOS
function applyFiltersAndRender() {
    const activeFilterEl = document.querySelector('.filter-group.active');

    // Si no hay filtro activo, mostrar productos disponibles por defecto
    const activeFilter = activeFilterEl ? activeFilterEl.dataset.filter : 'disponible';

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const searchModalTerm = document.getElementById('search-modal-input').value.toLowerCase();
    const finalSearchTerm = searchTerm || searchModalTerm;

    let filtered = allProducts;

    // 🎯 FILTRO GLOBAL: Siempre ocultar productos sin stock
    // Solo mostrar productos que tengan al menos una variación con stock > 0
    filtered = filtered.filter(p => {
        const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
        return stock > 0;
    });

    // 1. Filtrar por Categoría (filtros principales del header)
    if (activeFilter === 'disponible') {
        // Ya se filtró arriba, no hacer nada adicional
    } else if (activeFilter === 'all') {
        // Mostrar todos los productos (que tengan stock)
    } else if (activeFilter === 'promocion') {
        filtered = filtered.filter(p => {
            const tienePromoIndividual = p.promocion?.activa && !isWholesaleActive;
            const tienePromoGlobal = globalPromotion && !isWholesaleActive;
            return tienePromoIndividual || tienePromoGlobal;
        });
    } else {
        // Filtrar por categoría específica
        filtered = filtered.filter(p => {
            const categoryValue = p.categoriaId || p.categoria;
            if (!categoryValue) return false;

            // Intentar obtener el nombre desde el ID
            const nameFromId = categoriesMap.get(categoryValue);
            if (nameFromId === activeFilter) return true;

            // Si el valor es directamente el nombre de la categoría
            if (categoryValue === activeFilter) return true;

            // Si el activeFilter es un nombre, obtener su ID y comparar
            const idFromName = categoriesMap.get(activeFilter);
            if (categoryValue === idFromName) return true;

            return false;
        });
    }

    // 2. Filtrar por Búsqueda
    if (finalSearchTerm) {
        filtered = filtered.filter(p =>
            p.nombre.toLowerCase().includes(finalSearchTerm) ||
            (p.descripcion || '').toLowerCase().includes(finalSearchTerm) ||
            (p.codigo || '').toLowerCase().includes(finalSearchTerm)
        );
    }

    // 3. Filtros Avanzados del Sidebar

    // 3.1 Filtro por Rango de Precio
    filtered = filtered.filter(p => {
        const { precioFinal } = calculatePromotionPrice(p);
        const price = isWholesaleActive ? (parseFloat(p.precioMayor) || 0) : precioFinal;
        return price >= advancedFilters.priceMin && price <= advancedFilters.priceMax;
    });

    // 3.2 Filtro por Colores (sidebar chips)
    if (advancedFilters.selectedColors.size > 0) {
        filtered = filtered.filter(p => {
            const productColors = (p.variaciones || []).map(v => v.color?.toLowerCase()).filter(Boolean);
            return productColors.some(color => advancedFilters.selectedColors.has(color));
        });
    }

    // 3.3 Filtro de Disponibilidad - YA NO ES NECESARIO
    // Ahora SIEMPRE se filtran productos sin stock al inicio de la función

    // 3.4 Filtro solo promociones (del sidebar)
    if (advancedFilters.promoOnly) {
        filtered = filtered.filter(p => {
            const tienePromoIndividual = p.promocion?.activa && !isWholesaleActive;
            const tienePromoGlobal = globalPromotion && !isWholesaleActive;
            return tienePromoIndividual || tienePromoGlobal;
        });
    }

    // 4. Ordenamiento
    filtered = sortProducts(filtered, advancedFilters.sortBy);

    // 📊 Tracking: Búsqueda o vista de categoría
    if (finalSearchTerm) {
        analytics.trackSearch(finalSearchTerm, filtered.length);
    } else if (activeFilter && activeFilter !== 'all') {
        analytics.trackProductListView(activeFilter, filtered);
    }

    renderProducts(filtered);
}

// ✅ FUNCIÓN DE ORDENAMIENTO
function sortProducts(products, sortBy) {
    const sorted = [...products];

    // Función helper para obtener el stock de un producto
    const getStock = (product) => {
        return (product.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
    };

    // Primero ordenar según el criterio seleccionado
    let ordered;
    switch (sortBy) {
        case 'price-asc':
            ordered = sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : calculatePromotionPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : calculatePromotionPrice(b).precioFinal;
                return priceA - priceB;
            });
            break;
        case 'price-desc':
            ordered = sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : calculatePromotionPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : calculatePromotionPrice(b).precioFinal;
                return priceB - priceA;
            });
            break;
        case 'name-asc':
            ordered = sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
            break;
        case 'name-desc':
            ordered = sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
            break;
        case 'newest':
        default:
            ordered = sorted; // Ya vienen ordenados por timestamp desc
            break;
    }

    // Luego separar productos disponibles y agotados, manteniendo el orden dentro de cada grupo
    const disponibles = ordered.filter(p => getStock(p) > 0);
    const agotados = ordered.filter(p => getStock(p) <= 0);

    // Devolver disponibles primero, luego agotados
    return [...disponibles, ...agotados];
}

// ✅ HERO BANNER DINÁMICO CON PRODUCTOS REALES
function renderHeroBanner(products) {
    const banner = document.getElementById('hero-banner');
    const grid = document.getElementById('hero-banner-grid');
    if (!banner || !grid) return;

    // Filtrar productos con imagen y stock
    const withImages = products.filter(p => p.imagenUrl && getStock(p) > 0);
    if (withImages.length < 3) {
        banner.style.display = 'none';
        return;
    }

    // Tomar los primeros 3 productos (los más recientes)
    const featured = withImages.slice(0, 3);
    const { precioFinal: price0, tienePromo: promo0 } = calculatePromotionPrice(featured[0]);
    const { precioFinal: price1, tienePromo: promo1 } = calculatePromotionPrice(featured[1]);
    const { precioFinal: price2, tienePromo: promo2 } = calculatePromotionPrice(featured[2]);

    grid.innerHTML = `
        <div class="hero-item hero-item-main" data-product-id="${featured[0].id}">
            <img src="${featured[0].imagenUrl}" alt="${featured[0].nombre}" loading="eager">
            <div class="hero-item-overlay">
                ${promo0 ? '<span class="hero-badge">SALE</span>' : '<span class="hero-badge hero-badge-new">NUEVO</span>'}
                <h2 class="hero-item-title">${featured[0].nombre}</h2>
                <span class="hero-item-price">${formatoMoneda.format(price0)}</span>
            </div>
        </div>
        <div class="hero-item-side">
            <div class="hero-item hero-item-sm" data-product-id="${featured[1].id}">
                <img src="${featured[1].imagenUrl}" alt="${featured[1].nombre}" loading="eager">
                <div class="hero-item-overlay">
                    ${promo1 ? '<span class="hero-badge">SALE</span>' : ''}
                    <h3 class="hero-item-title">${featured[1].nombre}</h3>
                    <span class="hero-item-price">${formatoMoneda.format(price1)}</span>
                </div>
            </div>
            <div class="hero-item hero-item-sm" data-product-id="${featured[2].id}">
                <img src="${featured[2].imagenUrl}" alt="${featured[2].nombre}" loading="eager">
                <div class="hero-item-overlay">
                    ${promo2 ? '<span class="hero-badge">SALE</span>' : ''}
                    <h3 class="hero-item-title">${featured[2].nombre}</h3>
                    <span class="hero-item-price">${formatoMoneda.format(price2)}</span>
                </div>
            </div>
        </div>
    `;

    // Hacer clickeables
    grid.querySelectorAll('.hero-item[data-product-id]').forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            const productId = item.dataset.productId;
            openProductModal(productId);
        });
    });

    banner.style.display = 'block';
}

// ✅ RENDERIZAR PRODUCTOS CON COLORES REALES
function renderProducts(products) {
    const container = document.getElementById('products-container');
    const loading = document.getElementById('loading-products');
    const productsCountEl = document.getElementById('products-count');

    if (loading) loading.style.display = 'none';
    container.innerHTML = '';

    // Actualizar contador
    if (productsCountEl) {
        productsCountEl.textContent = products.length;
    }

    // Actualizar badge de disponibles
    const availableBadge = document.getElementById('available-badge');
    if (availableBadge) {
        const availableCount = allProducts.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        }).length;
        availableBadge.textContent = availableCount;
    }

    if (products.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">No se encontraron productos</p></div>';
        return;
    }

    products.forEach((product, index) => {
        const stockTotal = (product.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
        const isAgotado = stockTotal <= 0;
        const imgUrl = product.imagenUrl || 'https://placehold.co/300x400/f5f5f5/ccc?text=Mishell';
        const { precioFinal, tienePromo, precioOriginal } = calculatePromotionPrice(product);

        const variaciones = product.variaciones || [];
        // ✅ Solo mostrar tallas que tengan stock disponible
        const tallas = [...new Set(variaciones
            .filter(v => (parseInt(v.stock, 10) || 0) > 0)  // Filtrar solo variaciones con stock > 0
            .map(v => v.talla)
            .filter(Boolean))];
        // ✅ Solo mostrar colores que tengan stock disponible
        const colores = [...new Set(variaciones
            .filter(v => (parseInt(v.stock, 10) || 0) > 0)  // Filtrar solo variaciones con stock > 0
            .map(v => v.color)
            .filter(Boolean))];

        const isDisabled = isAgotado;
        const btnText = isAgotado ? 'Agotado' : 'Ver Producto';

        // ✅ HTML para TALLAS
        const tallasHTML = tallas.length > 0 ? 
            `<div class="variations-title">Tallas</div>
             <div class="variation-chips">${tallas.map(t => `<span class="variation-chip">${t}</span>`).join('')}</div>` 
            : '';

        // ✅ HTML para COLORES con círculos de color (soporta combinaciones)
        let coloresHTML = '';
        if (colores.length > 0) {
            const colorChips = colores.map(c => {
                const normalized = c.toLowerCase().trim();

                // Si es una combinación de colores, mostrar múltiples círculos
                if (esCombiacionDeColores(c)) {
                    const coloresIndividuales = dividirColores(c);
                    const circulos = coloresIndividuales.map(colorIndividual => {
                        const hex = getColorHex(colorIndividual);
                        return `<span class="variation-chip color-chip"
                                     style="background-color: ${hex};"
                                     data-color-name="${colorIndividual}"
                                     title="${colorIndividual}"></span>`;
                    }).join('');

                    return `<div class="color-combination" style="display: inline-flex; gap: 2px;" title="${c}">${circulos}</div>`;
                } else {
                    // Color único
                    const colorValue = getColorHex(c);

                    // Si es un color especial (gradiente), usar background-image
                    const styleAttr = SPECIAL_COLORS[normalized]
                        ? `background-image: ${colorValue};`
                        : `background-color: ${colorValue};`;

                    return `<span class="variation-chip color-chip"
                                 style="${styleAttr}"
                                 data-color-name="${c}"
                                 title="${c}"></span>`;
                }
            }).join('');

            coloresHTML = `<div class="variations-title mt-1">Colores</div>
                          <div class="variation-chips colors">${colorChips}</div>`;
        }

        const col = document.createElement('div');

        // Every 7 items, make first 2 items featured (larger)
        const posInGroup = index % 7;
        const isFeatured = posInGroup < 2 && !isAgotado && products.length > 4;

        if (isFeatured) {
            col.className = 'col-6 col-md-6 col-lg-6';
        } else {
            col.className = 'col-6 col-md-4 col-lg-3';
        }

        const delay = Math.min(index * 0.04, 0.8);
        col.innerHTML = `
            <div class="product-card ${isFeatured ? 'product-card-featured' : ''}" data-product-id="${product.id}" data-stock="${stockTotal}" style="animation-delay: ${delay}s">
                <div class="product-image-wrapper">
                    <img src="${imgUrl}" alt="${product.nombre}" loading="lazy">
                    <div class="product-badges">
                        ${tienePromo ? '<span class="badge-promo">PROMO</span>' : ''}
                        ${isAgotado ? '<span class="badge-stock badge-agotado">AGOTADO</span>' : ''}
                    </div>
                    ${isFeatured ? `<div class="featured-overlay"><span class="featured-label">${tienePromo ? 'Oferta Destacada' : 'Destacado'}</span></div>` : ''}
                </div>
                <div class="product-card-body">
                    <h3 class="product-title">${product.nombre}</h3>
                    ${product.descripcion ? `<p class="product-description">${product.descripcion.length > 60 ? product.descripcion.substring(0, 60) + '...' : product.descripcion}</p>` : ''}
                    ${product.observaciones ? `<p class="product-observations">${product.observaciones}</p>` : ''}
                    <div class="price-detal-card">
                        ${tienePromo ? `<span class="price-detal-old-card">${formatoMoneda.format(precioOriginal)}</span>` : ''}
                        ${formatoMoneda.format(precioFinal)}
                    </div>
                    <div class="product-variations">${tallasHTML}${coloresHTML}</div>
                    <button class="btn btn-primary btn-sm w-100 mt-auto" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
                </div>
            </div>
        `;
        container.appendChild(col);
    });

    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && !e.target.disabled) e.stopPropagation();
            
            const stock = parseInt(e.currentTarget.dataset.stock);
            const productId = e.currentTarget.dataset.productId;

            if (stock <= 0) {
                showToast('Este producto se encuentra agotado', 'warning');
                return;
            }
            openProductModal(productId);
        });
    });
}

// --- FUNCIONES AUXILIARES PARA BOTONES DE TALLA Y COLOR ---
function renderSizeButtons(tallas, esTallaUnica, product) {
    const tallasButtons = document.getElementById('tallas-buttons');
    const tallasContainer = document.getElementById('tallas-container');
    tallasButtons.innerHTML = '';

    if (tallas.length === 0 || esTallaUnica) {
        const tallaValue = tallas.length > 0 ? tallas[0] : 'unica';
        const tallaText = tallas.length > 0 ? tallas[0] : 'Única';

        // Verificar si la talla única tiene stock
        const variaciones = product.variaciones || [];
        const tieneStock = variaciones.some(v => {
            const vTalla = v.talla || 'unica';
            const vTallaNormalized = vTalla.toLowerCase().trim();
            const tallaValueNormalized = tallaValue.toLowerCase().trim();

            // Comparar considerando que '', 'unica', 'única' son equivalentes
            const sonEquivalentes =
                vTallaNormalized === tallaValueNormalized ||
                (vTallaNormalized === '' && (tallaValueNormalized === 'unica' || tallaValueNormalized === 'única')) ||
                ((vTallaNormalized === 'unica' || vTallaNormalized === 'única') && tallaValueNormalized === '');

            return sonEquivalentes && v.stock > 0;
        });

        if (tieneStock) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'size-color-btn unica-talla selected';
            btn.textContent = tallaText;
            btn.dataset.value = tallaValue;
            tallasButtons.appendChild(btn);
            document.getElementById('selected-talla').value = tallaValue;
            tallasContainer.style.display = 'block';

            // Auto-cargar colores si es talla única
            renderColorButtons(tallaValue, product);
        } else {
            // Si no hay stock, mostrar mensaje
            tallasContainer.style.display = 'block';
            const noStockMsg = document.createElement('div');
            noStockMsg.className = 'text-muted';
            noStockMsg.textContent = 'Sin stock disponible';
            tallasButtons.appendChild(noStockMsg);
        }
    } else {
        tallasContainer.style.display = 'block';

        // Filtrar solo tallas con stock disponible
        const variaciones = product.variaciones || [];
        const tallasConStock = tallas.filter(talla =>
            variaciones.some(v => (v.talla || 'unica') === talla && v.stock > 0)
        );

        if (tallasConStock.length === 0) {
            const noStockMsg = document.createElement('div');
            noStockMsg.className = 'text-muted';
            noStockMsg.textContent = 'Sin stock disponible';
            tallasButtons.appendChild(noStockMsg);
        } else {
            tallasConStock.forEach(talla => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'size-color-btn';
                btn.textContent = talla;
                btn.dataset.value = talla;
                btn.onclick = () => selectTalla(talla, product);
                tallasButtons.appendChild(btn);
            });

            // Inicializar área de colores para mostrar mensaje de ayuda
            renderColorButtons(null, product);
        }
    }
}

function renderColorButtons(selectedTalla, product) {
    const coloresButtons = document.getElementById('colores-buttons');
    const coloresContainer = document.getElementById('colores-container');
    const colorHelpMessage = document.getElementById('color-help-message');
    coloresButtons.innerHTML = '';

    if (!selectedTalla) {
        coloresContainer.style.display = 'block';
        coloresButtons.style.display = 'none';
        if (colorHelpMessage) colorHelpMessage.style.display = 'block';
        return;
    }

    // Si hay talla seleccionada, ocultar el mensaje de ayuda
    if (colorHelpMessage) colorHelpMessage.style.display = 'none';
    coloresButtons.style.display = 'flex';

    const variaciones = product.variaciones || [];

    // Normalizar la talla seleccionada para comparación
    const selectedTallaNormalized = selectedTalla.toLowerCase().trim();

    // Filtrar solo colores con stock disponible para la talla seleccionada
    const colores = [...new Set(variaciones
        .filter(v => {
            const vTalla = v.talla || 'unica';
            const vTallaNormalized = vTalla.toLowerCase().trim();

            // Comparar considerando equivalencias
            const tallaCoincide =
                vTallaNormalized === selectedTallaNormalized ||
                (vTallaNormalized === '' && (selectedTallaNormalized === 'unica' || selectedTallaNormalized === 'única')) ||
                ((vTallaNormalized === 'unica' || vTallaNormalized === 'única') && selectedTallaNormalized === '');

            return tallaCoincide && v.stock > 0;
        })
        .map(v => v.color)
        .filter(Boolean)
    )];

    coloresContainer.style.display = 'block';

    if (colores.length === 0) {
        // Verificar si existe un color "único" con stock
        const colorUnico = variaciones.find(v => {
            const vTalla = v.talla || 'unica';
            const vTallaNormalized = vTalla.toLowerCase().trim();

            const tallaCoincide =
                vTallaNormalized === selectedTallaNormalized ||
                (vTallaNormalized === '' && (selectedTallaNormalized === 'unica' || selectedTallaNormalized === 'única')) ||
                ((vTallaNormalized === 'unica' || vTallaNormalized === 'única') && selectedTallaNormalized === '');

            return tallaCoincide &&
                (v.color === 'unico' || v.color === '' || !v.color) &&
                v.stock > 0;
        });

        if (colorUnico) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'size-color-btn unico-color selected';
            btn.textContent = 'Único';
            btn.dataset.value = 'unico';
            coloresButtons.appendChild(btn);
            document.getElementById('selected-color').value = 'unico';
            updateStockDisplay(product);
        } else {
            // No hay colores con stock para esta talla
            const noStockMsg = document.createElement('div');
            noStockMsg.className = 'text-muted';
            noStockMsg.textContent = 'Sin colores disponibles';
            coloresButtons.appendChild(noStockMsg);

            const stockText = document.getElementById('stock-text');
            stockText.textContent = 'Sin stock disponible';
            document.getElementById('btn-add-cart').disabled = true;
        }
    } else {
        colores.forEach(color => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'size-color-btn';
            btn.textContent = color;
            btn.dataset.value = color;
            btn.onclick = () => selectColor(color, product);
            coloresButtons.appendChild(btn);
        });

        // Si solo hay un color, seleccionarlo automáticamente
        if (colores.length === 1) {
            selectColor(colores[0], product);
        } else {
            // Limpiar selección anterior y mostrar mensaje
            document.getElementById('selected-color').value = '';
            const stockText = document.getElementById('stock-text');
            stockText.textContent = 'Seleccione un color';
            document.getElementById('btn-add-cart').disabled = true;
        }
    }
}

function selectTalla(talla, product) {
    // Remover selección anterior
    document.querySelectorAll('#tallas-buttons .size-color-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    // Seleccionar nueva talla
    event.target.classList.add('selected');
    document.getElementById('selected-talla').value = talla;

    // Limpiar selección de color
    document.getElementById('selected-color').value = '';

    // Renderizar botones de color
    renderColorButtons(talla, product);
}

function selectColor(color, product) {
    // Remover selección anterior
    document.querySelectorAll('#colores-buttons .size-color-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    // Seleccionar nuevo color
    const buttons = document.querySelectorAll('#colores-buttons .size-color-btn');
    buttons.forEach(btn => {
        if (btn.dataset.value === color) {
            btn.classList.add('selected');
        }
    });

    document.getElementById('selected-color').value = color;

    // Actualizar stock
    updateStockDisplay(product);
}

function updateStockDisplay(product) {
    const selectedTalla = document.getElementById('selected-talla').value;
    const selectedColor = document.getElementById('selected-color').value;
    const stockDisplay = document.getElementById('stock-display');
    const stockText = document.getElementById('stock-text');
    const btnAdd = document.getElementById('btn-add-cart');
    const cantidadInput = document.getElementById('select-cantidad');

    if (!product || !selectedTalla || !selectedColor) {
        btnAdd.disabled = true;
        return;
    }

    // Normalizar para comparación
    const selectedTallaNormalized = selectedTalla.toLowerCase().trim();
    const selectedColorNormalized = selectedColor.toLowerCase().trim();

    const variacion = (product.variaciones || []).find(v => {
        const vTalla = v.talla || 'unica';
        const vColor = v.color || 'unico';
        const vTallaNormalized = vTalla.toLowerCase().trim();
        const vColorNormalized = vColor.toLowerCase().trim();

        // Comparar tallas considerando equivalencias
        const tallaCoincide =
            vTallaNormalized === selectedTallaNormalized ||
            (vTallaNormalized === '' && (selectedTallaNormalized === 'unica' || selectedTallaNormalized === 'única')) ||
            ((vTallaNormalized === 'unica' || vTallaNormalized === 'única') && selectedTallaNormalized === '');

        // Comparar colores considerando equivalencias
        const colorCoincide =
            vColorNormalized === selectedColorNormalized ||
            (vColorNormalized === '' && (selectedColorNormalized === 'unico' || selectedColorNormalized === 'único')) ||
            ((vColorNormalized === 'unico' || vColorNormalized === 'único') && selectedColorNormalized === '');

        return tallaCoincide && colorCoincide;
    });

    if (variacion && variacion.stock > 0) {
        stockText.textContent = `${variacion.stock} unidades disponibles`;
        stockDisplay.style.color = 'var(--color-primario)';
        stockDisplay.style.background = 'var(--color-primario-claro)';
        stockDisplay.style.borderColor = 'var(--color-primario-hover)';
        cantidadInput.setAttribute('max', variacion.stock);
        cantidadInput.value = 1;
        btnAdd.disabled = false;
    } else {
        stockText.textContent = 'Agotado';
        stockDisplay.style.color = '#c62828';
        stockDisplay.style.background = '#ffebee';
        stockDisplay.style.borderColor = '#ef9a9a';
        cantidadInput.setAttribute('max', 0);
        cantidadInput.value = 0;
        btnAdd.disabled = true;
    }
}

// --- ABRIR MODAL DE PRODUCTO ---
function openProductModal(productId) {
    const product = productsMap.get(productId);
    if (!product) return;

    const precioMayorNum = parseFloat(product.precioMayor) || 0;
    const isSoloDetal = isWholesaleActive && precioMayorNum === 0;
    
    if (isSoloDetal) {
        showToast('Este producto solo está disponible para venta al detal', 'warning');
        return;
    }
    
    const { precioFinal, tienePromo, precioOriginal } = calculatePromotionPrice(product);

    document.getElementById('modal-product-name').textContent = product.nombre;
    document.getElementById('modal-product-image').src = product.imagenUrl || 'https://placehold.co/500x500/f5f5f5/ccc?text=Mishell';
    document.getElementById('modal-product-desc').textContent = product.descripcion || 'No hay descripción disponible.';
    
    if (tienePromo) {
        document.getElementById('modal-price-old').textContent = formatoMoneda.format(precioOriginal);
        document.getElementById('modal-price-old').style.display = 'inline';
    } else {
        document.getElementById('modal-price-old').style.display = 'none';
    }
    document.getElementById('modal-price-detal').textContent = formatoMoneda.format(precioFinal);
    
    const priceMayorModalEl = document.getElementById('modal-price-mayor');
    const priceMayorContainerEl = priceMayorModalEl.closest('.price-mayor-modal');
    
    if (precioMayorNum > 0) {
        priceMayorModalEl.textContent = formatoMoneda.format(precioMayorNum);
        priceMayorContainerEl.style.display = 'block';
    } else {
        priceMayorContainerEl.style.display = 'none';
    }
    
    document.getElementById('modal-product-id').value = productId;

    // Resetear campos ocultos de talla y color
    document.getElementById('selected-talla').value = '';
    document.getElementById('selected-color').value = '';

    // Resetear estado del stock display
    const stockDisplay = document.getElementById('stock-display');
    const stockText = document.getElementById('stock-text');
    stockText.textContent = 'Seleccione talla y color';
    stockDisplay.style.color = 'var(--color-texto-claro)';
    stockDisplay.style.background = '#f8f9fa';
    stockDisplay.style.borderColor = '#dee2e6';
    document.getElementById('btn-add-cart').disabled = true;
    document.getElementById('select-cantidad').value = 1;
    document.getElementById('select-cantidad').setAttribute('max', 1);
    document.getElementById('product-observation').value = '';

    // Obtener variaciones y tallas
    const variaciones = product.variaciones || [];
    const tallas = [...new Set(variaciones.map(v => v.talla).filter(Boolean))];

    // Determinar si es talla única
    const esTallaUnica = (tallas.length === 0 || (tallas.length === 1 && (tallas[0] === '' || tallas[0].toLowerCase() === 'unica' || tallas[0].toLowerCase() === 'única')));

    // Renderizar botones de talla
    renderSizeButtons(tallas, esTallaUnica, product);

    // 📊 Tracking: Vista de producto
    analytics.trackProductView(product);

    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    modal.show();
}

// --- FUNCIONES DE CARRITO ---
function renderCart() {
    const container = document.getElementById('cart-items-container');
    const footer = document.getElementById('cart-footer');
    const badgeDesktop = document.getElementById('cart-badge-desktop');
    const badgeMobile = document.getElementById('cart-badge-mobile');
    const empty = document.getElementById('cart-empty');

    // Limpiar container SIEMPRE
    if (container) container.innerHTML = '';

    if (cart.length === 0) {
        if (empty) empty.style.display = 'block';
        if (footer) footer.style.display = 'none';
        if (badgeDesktop) {
            badgeDesktop.textContent = '0';
            badgeDesktop.style.opacity = '0';
        }
        if (badgeMobile) {
            badgeMobile.textContent = '0';
            badgeMobile.style.display = 'none';
        }
        return;
    }
    if (empty) empty.style.display = 'none';
    if (footer) footer.style.display = 'block';

    // 🔍 Validar stock de productos en el carrito
    const productosConProblemas = [];
    cart.forEach(item => {
        const product = productsMap.get(item.id);
        if (product) {
            const variacion = (product.variaciones || []).find(v =>
                (v.talla || 'unica') === item.talla &&
                (v.color || 'unico') === item.color
            );
            if (!variacion || variacion.stock <= 0) {
                productosConProblemas.push({ ...item, tipo: 'agotado' });
            } else if (variacion.stock < item.cantidad) {
                productosConProblemas.push({ ...item, tipo: 'insuficiente', stockDisponible: variacion.stock });
            }
        }
    });

    // Mostrar advertencia si hay productos con problemas de stock
    if (productosConProblemas.length > 0) {
        const advertenciaDiv = document.createElement('div');
        advertenciaDiv.className = 'alert alert-warning mx-3 mb-3';
        advertenciaDiv.style.fontSize = '0.85rem';
        advertenciaDiv.innerHTML = `
            <strong>⚠️ Atención:</strong><br>
            ${productosConProblemas.map(p => {
                if (p.tipo === 'agotado') {
                    return `• <strong>${p.nombre}</strong> (${p.talla}/${p.color}) - <span class="text-danger">SIN STOCK</span>`;
                } else {
                    return `• <strong>${p.nombre}</strong> (${p.talla}/${p.color}) - Solo quedan ${p.stockDisponible} unidades`;
                }
            }).join('<br>')}
            <br><small class="d-block mt-2">Por favor, elimina o ajusta estos productos antes de finalizar tu compra.</small>
        `;
        container.appendChild(advertenciaDiv);
    }

    let total = 0;
    let itemCount = 0;
    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        const observacionHtml = item.observacion ? `<small class="text-muted d-block mt-1"><i class="bi bi-chat-left-text"></i> ${item.observacion}</small>` : '';
        div.innerHTML = `
            <div class="d-flex gap-3">
                <img src="${item.imagenUrl || 'https://placehold.co/70x90/f5f5f5/ccc?text=Foto'}" class="cart-item-image" alt="${item.nombre}">
                <div class="flex-grow-1">
                    <h6 class="mb-1" style="font-weight: 600; font-size: 0.9rem;">${item.nombre}</h6>
                    <small class="text-muted">${item.talla} / ${item.color}</small>
                    ${observacionHtml}
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <span style="font-weight: 500; font-size: 0.9rem;">${formatoMoneda.format(item.precio)} × ${item.cantidad}</span>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.confirmRemoveFromCart('${item.cartItemId}')" style="padding: 2px 8px;">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
        total += item.total;
        itemCount += item.cantidad;
    });
    document.getElementById('cart-total').textContent = formatoMoneda.format(total);
    badgeDesktop.textContent = itemCount;
    badgeMobile.textContent = itemCount;
    badgeDesktop.style.opacity = '1';
    badgeMobile.style.display = 'flex';
}

window.confirmRemoveFromCart = function(cartItemId) {
    itemToDelete = cartItemId;
    const modal = new bootstrap.Modal(document.getElementById('deleteCartModal'));
    modal.show();
};

function saveCart() {
    if (cart.length === 0) {
        localStorage.removeItem('mishellCart'); // Eliminar si está vacío
    } else {
        localStorage.setItem('mishellCart', JSON.stringify(cart));
    }
}
function loadCart() {
    const savedCart = localStorage.getItem('mishellCart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            // Verificar que sea un array válido
            if (!Array.isArray(cart)) {
                cart = [];
            }
        } catch (e) {
            console.error('Error cargando carrito:', e);
            cart = [];
        }
    }
    renderCart();
}

// ✅ FUNCIÓN: Cargar colores disponibles dinámicamente
function loadAvailableColors() {
    allAvailableColors.clear();

    allProducts.forEach(product => {
        (product.variaciones || []).forEach(v => {
            if (v.color) {
                allAvailableColors.add(v.color.toLowerCase());
            }
        });
    });

    renderColorFilters();
}

// ✅ FUNCIÓN MEJORADA: Renderizar filtros de colores (soporta combinaciones)
function renderColorFilters() {
    const colorContainer = document.getElementById('color-filter-container');
    if (!colorContainer) return;

    colorContainer.innerHTML = '';

    const uniqueColors = Array.from(allAvailableColors).sort();

    if (uniqueColors.length === 0) {
        colorContainer.innerHTML = '<p class="text-muted small">No hay colores disponibles</p>';
        return;
    }

    uniqueColors.forEach(colorName => {
        // Si es una combinación, crear contenedor con múltiples círculos
        if (esCombiacionDeColores(colorName)) {
            const coloresIndividuales = dividirColores(colorName);
            const wrapper = document.createElement('div');
            wrapper.className = 'color-filter-combination';
            wrapper.style.display = 'inline-flex';
            wrapper.style.gap = '2px';
            wrapper.style.cursor = 'pointer';
            wrapper.title = colorName;
            wrapper.dataset.colorName = colorName;

            coloresIndividuales.forEach(colorIndividual => {
                const hex = getColorHex(colorIndividual);
                const miniChip = document.createElement('div');
                miniChip.className = 'color-filter-chip-mini';
                miniChip.style.backgroundColor = hex;
                miniChip.style.width = '18px';
                miniChip.style.height = '18px';
                miniChip.style.borderRadius = '50%';
                miniChip.style.border = '2px solid #ddd';
                wrapper.appendChild(miniChip);
            });

            wrapper.addEventListener('click', () => {
                wrapper.classList.toggle('active');

                if (wrapper.classList.contains('active')) {
                    wrapper.style.boxShadow = '0 0 0 2px var(--color-primario)';
                    advancedFilters.selectedColors.add(colorName);
                } else {
                    wrapper.style.boxShadow = 'none';
                    advancedFilters.selectedColors.delete(colorName);
                }

                applyFiltersAndRender();
            });

            colorContainer.appendChild(wrapper);
        } else {
            // Color único
            const hexColor = getColorHex(colorName);
            const chip = document.createElement('div');
            chip.className = 'color-filter-chip';
            chip.style.backgroundColor = hexColor;
            chip.dataset.colorName = colorName;
            chip.dataset.color = colorName;
            chip.title = colorName;

            chip.addEventListener('click', () => {
                chip.classList.toggle('active');

                if (chip.classList.contains('active')) {
                    advancedFilters.selectedColors.add(colorName);
                } else {
                    advancedFilters.selectedColors.delete(colorName);
                }

                applyFiltersAndRender();
            });

            colorContainer.appendChild(chip);
        }
    });
}

// ✅ FUNCIÓN: Formatear precio para display
function formatCurrency(value) {
    return formatoMoneda.format(value);
}

// ✅ FUNCIÓN: Resetear todos los filtros
function resetAllFilters() {
    advancedFilters = {
        priceMin: 0,
        priceMax: 500000,
        selectedColors: new Set(),
        inStockOnly: false,
        promoOnly: false,
        sortBy: 'newest'
    };

    // Resetear inputs de precio (si existen)
    const priceMin = document.getElementById('price-min');
    const priceMax = document.getElementById('price-max');
    const rangeMin = document.getElementById('price-range-min');
    const rangeMax = document.getElementById('price-range-max');
    const dispMin  = document.getElementById('price-display-min');
    const dispMax  = document.getElementById('price-display-max');
    if (priceMin) priceMin.value = '';
    if (priceMax) priceMax.value = '';
    if (rangeMin) rangeMin.value = 0;
    if (rangeMax) rangeMax.value = 500000;
    if (dispMin)  dispMin.textContent = '$0';
    if (dispMax)  dispMax.textContent = '$500.000';

    // Resetear colores
    document.querySelectorAll('.color-filter-chip.active').forEach(chip => {
        chip.classList.remove('active');
    });

    // Resetear checkboxes (si existen)
    const inStockEl = document.getElementById('filter-in-stock');
    const promoEl   = document.getElementById('filter-promo-only');
    if (inStockEl) inStockEl.checked = false;
    if (promoEl)   promoEl.checked = false;

    // Resetear ordenamiento
    const sortEl = document.getElementById('sort-products');
    if (sortEl) sortEl.value = 'newest';

    applyFiltersAndRender();
}

// --- DOMCONTENTLOADED ---
document.addEventListener('DOMContentLoaded', () => {

    loadCart();
    loadGlobalPromotions(); // ✅ Cargar promociones globales (Black Friday, etc.)
    // loadPromotions(); // ✅ Ya no necesario - las promociones se leen del campo producto.promocion

    const categoryDropdownMenu = document.getElementById('category-dropdown-menu');
    const categoryDropdownMenuMobile = document.getElementById('category-dropdown-menu-mobile');
    const categoryDropdownButton = document.getElementById('category-dropdown-button');

    // ✅ Cargar Categorías con Badges
    const trendingCategories = ['Vestidos', 'Blusas', 'Pantalones']; // Categorías en tendencia
    const newCategories = ['Accesorios', 'Zapatos']; // Categorías nuevas

    // ✅ Cargar categorías sin índice (ordenar en memoria)
    onSnapshot(categoriesCollection, (snapshot) => {
        categoryDropdownMenu.innerHTML = '';
        categoriesMap.clear();

        // Ordenar categorías alfabéticamente en memoria
        const categories = [];
        snapshot.forEach(doc => {
            categories.push({ id: doc.id, ...doc.data() });
        });

        categories.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

        categories.forEach(cat => {
            const catId = cat.id;
            const catName = cat.nombre;

            categoriesMap.set(catId, catName);
            categoriesMap.set(catName, catId);

            const li = document.createElement('li');
            let badgeHTML = '';

            if (trendingCategories.includes(catName)) {
                badgeHTML = '<span class="category-badge badge-trending">🔥 Tendencia</span>';
            } else if (newCategories.includes(catName)) {
                badgeHTML = '<span class="category-badge badge-new">✨ Nuevo</span>';
            }

            li.innerHTML = `<a class="dropdown-item filter-group" href="#" data-filter="${catName}">
                <span>${catName}</span>
                ${badgeHTML}
            </a>`;
            categoryDropdownMenu.appendChild(li);
        });

        categoryDropdownMenu.querySelectorAll('.filter-group').forEach(item => {
            item.addEventListener('click', handleFilterClick);
        });

        // Populate mobile dropdown
        if (categoryDropdownMenuMobile) {
            categoryDropdownMenuMobile.innerHTML = categoryDropdownMenu.innerHTML;
            categoryDropdownMenuMobile.querySelectorAll('.filter-group').forEach(item => {
                item.addEventListener('click', handleFilterClick);
            });
        }

        console.log(`✅ ${categories.length} categorías cargadas correctamente`);
    }, (error) => {
        console.error("❌ Error al cargar categorías:", error);
        categoryDropdownMenu.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error al cargar</a></li>';
        if (categoryDropdownMenuMobile) {
            categoryDropdownMenuMobile.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error al cargar</a></li>';
        }
    });

    document.querySelectorAll('.header-left .filter-group, .header-left-mobile .filter-group').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });

    function handleFilterClick(e) {
        e.preventDefault();
        const clickedFilter = e.currentTarget;

        document.querySelectorAll('.header-left .filter-group.active, .header-left-mobile .filter-group.active').forEach(b => b.classList.remove('active'));

        if (clickedFilter.classList.contains('dropdown-item')) {
            // Si es un item del dropdown (categoría), activar el botón del dropdown
            categoryDropdownButton.classList.add('active');
            categoryDropdownButton.dataset.filter = clickedFilter.dataset.filter;
            categoryDropdownButton.innerHTML = `${clickedFilter.textContent} <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
        } else {
            // Si es un botón normal (Todos, Disponibles, Promociones)
            clickedFilter.classList.add('active');
            // Resetear el botón del dropdown
            categoryDropdownButton.classList.remove('active');
            categoryDropdownButton.removeAttribute('data-filter');
            categoryDropdownButton.innerHTML = `Categorías <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
        }

        applyFiltersAndRender();
    }


    // ✅ Carga inicial de productos (sin índice compuesto)
    // Cargar todos los productos y filtrar por visible en memoria
    onSnapshot(productsCollection, (snapshot) => {
        allProducts = [];
        productsMap.clear();

        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            // Cargar productos visibles (visible !== false, incluye undefined)
            if (product.visible !== false) {
                allProducts.push(product);
                productsMap.set(doc.id, product);
            }
        });

        // Ordenar por timestamp (más recientes primero)
        allProducts.sort((a, b) => {
            const timestampA = a.timestamp?.toMillis?.() || 0;
            const timestampB = b.timestamp?.toMillis?.() || 0;
            return timestampB - timestampA;
        });

        console.log(`✅ ${allProducts.length} productos cargados correctamente`);
        renderHeroBanner(allProducts);
        loadAvailableColors();
        applyFiltersAndRender();
    }, (error) => {
        console.error("❌ Error al cargar productos:", error);
        const container = document.getElementById('products-container');
        if (container) {
            container.innerHTML = '<div class="col-12 text-center text-danger p-4"><p>Error al cargar productos. Por favor recarga la página.</p></div>';
        }
    });

    // ✅ EVENT LISTENERS PARA FILTROS

    // Ordenamiento (toolbar)
    const sortEl = document.getElementById('sort-products');
    if (sortEl) {
        sortEl.addEventListener('change', (e) => {
            advancedFilters.sortBy = e.target.value;
            applyFiltersAndRender();
        });
    }

    // ✅ Búsqueda en tiempo real MEJORADA
    document.getElementById('search-input').addEventListener('input', applyFiltersAndRedraw);
    document.getElementById('search-modal-input').addEventListener('input', (e) => {
        document.getElementById('search-input').value = e.target.value;
        applyFiltersAndRedraw();
    });
    
    let searchTimeout;
    function applyFiltersAndRedraw() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFiltersAndRender, 200); // 200ms para búsqueda más rápida
    }
    
    // Listeners del MODAL DE PRODUCTO ya no son necesarios
    // La lógica ahora se maneja con las funciones selectTalla() y selectColor()

    document.getElementById('quantity-plus').addEventListener('click', () => {
        const cantidadInput = document.getElementById('select-cantidad');
        const maxStock = parseInt(cantidadInput.getAttribute('max')) || 99;
        let currentValue = parseInt(cantidadInput.value);
        if (currentValue < maxStock) {
            cantidadInput.value = currentValue + 1;
        }
    });
    document.getElementById('quantity-minus').addEventListener('click', () => {
        const cantidadInput = document.getElementById('select-cantidad');
        let currentValue = parseInt(cantidadInput.value);
        if (currentValue > 1) {
            cantidadInput.value = currentValue - 1;
        }
    });

    document.getElementById('btn-add-cart').addEventListener('click', () => {
        const productId = document.getElementById('modal-product-id').value;
        const product = productsMap.get(productId);
        const talla = document.getElementById('selected-talla').value;
        const color = document.getElementById('selected-color').value;
        const cantidad = parseInt(document.getElementById('select-cantidad').value);
        const observacion = document.getElementById('product-observation').value.trim();

        if (!product || !talla || !color || cantidad <= 0) {
            showToast('Seleccione talla, color y cantidad', 'error');
            return;
        }

        const precioMayorNum = parseFloat(product.precioMayor) || 0;
        if (isWholesaleActive && precioMayorNum === 0) {
            showToast('Este producto es solo para venta al detal', 'warning');
            return;
        }

        const { precioFinal } = calculatePromotionPrice(product);
        const precioUnitarioFinal = isWholesaleActive ? precioMayorNum : precioFinal;

        const cartItemId = `${productId}-${talla}-${color}-${isWholesaleActive ? 'MAYOR' : 'DETAL'}`;

        const existing = cart.find(item => item.cartItemId === cartItemId);
        if (existing) {
            existing.cantidad += cantidad;
            existing.total = existing.cantidad * precioUnitarioFinal;
            // Si hay nueva observación, agregarla o actualizarla
            if (observacion) {
                existing.observacion = observacion;
            }
        } else {
            const newCartItem = {
                cartItemId,
                id: productId,
                codigo: product.codigo || '',
                nombre: product.nombre,
                precio: precioUnitarioFinal,
                talla: talla === 'unica' ? 'Única' : talla,
                color: color === 'unico' ? 'Único' : color,
                cantidad,
                total: cantidad * precioUnitarioFinal,
                imagenUrl: product.imagenUrl || '',
                observacion: observacion || ''
            };
            cart.push(newCartItem);

            // 📊 Tracking: Producto agregado al carrito
            analytics.trackAddToCart(newCartItem);
        }

        showToast(`${product.nombre} agregado al carrito`, 'success');
        renderCart();
        saveCart(); 
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('productModal'));
        modal.hide();
    });

    document.getElementById('confirm-delete-cart-item').addEventListener('click', () => {
        if (itemToDelete === null) return;
        const itemIndex = cart.findIndex(item => item.cartItemId === itemToDelete);
        if (itemIndex > -1) {
            const deletedItem = cart[itemIndex];

            // 📊 Tracking: Producto eliminado del carrito
            analytics.trackRemoveFromCart(deletedItem);

            cart.splice(itemIndex, 1);
            saveCart(); // Guardar ANTES de renderizar
            renderCart();
            showToast('Producto eliminado del carrito', 'success');
        }
        itemToDelete = null;
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteCartModal'));
        if (modal) modal.hide();
    });

    // Auto-completar datos al digitar cédula
    document.getElementById('checkout-cedula').addEventListener('blur', async function() {
        const cedula = this.value.trim();
        if (!cedula) return;

        try {
            const q = query(clientsCollection, where('cedula', '==', cedula));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const clientData = snapshot.docs[0].data();
                document.getElementById('checkout-name').value = clientData.nombre || '';
                document.getElementById('checkout-phone').value = clientData.celular || '';
                document.getElementById('checkout-address').value = clientData.direccion || '';
                if (clientData.ciudad) {
                    document.getElementById('checkout-city').value = clientData.ciudad;
                    // Trigger change event para validar método de pago y cargar barrios
                    document.getElementById('checkout-city').dispatchEvent(new Event('change'));

                    // Cargar barrio si existe
                    if (clientData.barrio) {
                        // Esperar a que se carguen los barrios
                        setTimeout(() => {
                            document.getElementById('checkout-neighborhood').value = clientData.barrio;
                        }, 100);
                    }
                }
                showToast('¡Datos cargados! Bienvenido de nuevo', 'success');
            }
        } catch (err) {
            console.error("Error buscando cliente:", err);
        }
    });

    // Definir barrios por ciudad
    const neighborhoodsByCity = {
        'Montería': [
            'Cantaclaro',
            'Centro',
            'El Dorado',
            'El Poblado',
            'La Granja',
            'La Ribera',
            'Los Colores',
            'Mogambo',
            'Mocarí',
            'P5',
            'Pastrana',
            'Policarpa',
            'Villa Cielo',
            'Villa Margarita',
            'Villa Melissa'
        ],
        'Cereté': ['Centro', 'Norte', 'Sur'],
        'Lorica': ['Centro', 'Norte', 'Sur'],
        'Sahagún': ['Centro', 'Norte', 'Sur'],
        'Planeta Rica': ['Centro', 'Norte', 'Sur'],
        'Montelíbano': ['Centro', 'Norte', 'Sur'],
        'Tierralta': ['Centro', 'Norte', 'Sur'],
        'Ayapel': ['Centro', 'Norte', 'Sur']
    };

    // Validar método de pago según ciudad y mostrar barrios
    document.getElementById('checkout-city').addEventListener('change', async function() {
        const ciudad = this.value;
        const efectivoOption = document.getElementById('payment-efectivo');
        const paymentInfo = document.getElementById('payment-info');
        const paymentSelect = document.getElementById('checkout-payment');
        const neighborhoodSection = document.getElementById('neighborhood-section');
        const neighborhoodInput = document.getElementById('checkout-neighborhood');
        const neighborhoodDatalist = document.getElementById('neighborhood-list');

        // Manejar barrios
        if (ciudad && neighborhoodsByCity[ciudad]) {
            // Mostrar sección de barrio
            neighborhoodSection.style.display = 'block';

            // Limpiar opciones actuales del datalist
            neighborhoodDatalist.innerHTML = '';

            // Combinar barrios predefinidos con personalizados
            const allNeighborhoods = [...neighborhoodsByCity[ciudad]];

            // Cargar barrios personalizados de Firestore
            try {
                const q = query(neighborhoodsCollection, where('ciudad', '==', ciudad));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    const customNeighborhood = doc.data().nombre;
                    // Solo agregar si no está ya en la lista
                    if (!allNeighborhoods.includes(customNeighborhood)) {
                        allNeighborhoods.push(customNeighborhood);
                    }
                });

                // Ordenar alfabéticamente
                allNeighborhoods.sort();
            } catch (err) {
                console.error('Error cargando barrios personalizados:', err);
            }

            // Agregar todos los barrios al datalist
            allNeighborhoods.forEach(barrio => {
                const option = document.createElement('option');
                option.value = barrio;
                neighborhoodDatalist.appendChild(option);
            });
        } else {
            // Ocultar sección de barrio si la ciudad no tiene barrios definidos o no se seleccionó ciudad
            neighborhoodSection.style.display = 'none';
            neighborhoodInput.value = '';
        }

        // Validación de método de pago y mostrar info de envío
        const deliveryInfo = document.getElementById('delivery-info');
        const cedulaDisplay = document.getElementById('cedula-display');
        const cedulaInput = document.getElementById('checkout-cedula');

        if (ciudad && ciudad !== 'Montería') {
            efectivoOption.disabled = true;
            efectivoOption.textContent = 'Efectivo (No disponible fuera de Montería)';
            paymentInfo.textContent = '⚠️ Solo transferencia disponible para envíos fuera de Montería';
            paymentInfo.classList.add('text-warning');

            // Mostrar info de envío fuera de Montería
            deliveryInfo.style.display = 'block';
            cedulaDisplay.textContent = cedulaInput.value || '-';

            // Si tenía efectivo seleccionado, resetear
            if (paymentSelect.value === 'Efectivo') {
                paymentSelect.value = '';
            }
        } else if (ciudad === 'Montería') {
            efectivoOption.disabled = false;
            efectivoOption.textContent = 'Efectivo (Pago contra entrega)';
            paymentInfo.textContent = '✅ Efectivo y transferencia disponibles';
            paymentInfo.classList.remove('text-warning');
            paymentInfo.classList.add('text-success');

            // Ocultar info de envío
            deliveryInfo.style.display = 'none';
        } else {
            efectivoOption.disabled = false;
            efectivoOption.textContent = 'Efectivo (Pago contra entrega)';
            paymentInfo.textContent = '';
            paymentInfo.classList.remove('text-warning', 'text-success');

            // Ocultar info de envío
            deliveryInfo.style.display = 'none';
        }
    });

    // Actualizar cédula en info de envío cuando cambie
    document.getElementById('checkout-cedula').addEventListener('input', function() {
        const ciudad = document.getElementById('checkout-city').value;
        if (ciudad && ciudad !== 'Montería') {
            document.getElementById('cedula-display').textContent = this.value || '-';
        }
    });

    // Mostrar/ocultar campo de monto en efectivo
    document.getElementById('checkout-payment').addEventListener('change', function() {
        const cashSection = document.getElementById('cash-payment-section');
        const cashAmountInput = document.getElementById('checkout-cash-amount');
        const changeDisplay = document.getElementById('change-display');

        if (this.value === 'Efectivo') {
            cashSection.style.display = 'block';
        } else {
            cashSection.style.display = 'none';
            cashAmountInput.value = '';
            changeDisplay.style.display = 'none';
        }
    });

    // Calcular vuelto automáticamente
    document.getElementById('checkout-cash-amount').addEventListener('input', function() {
        const cashAmount = parseFloat(this.value) || 0;
        const changeDisplay = document.getElementById('change-display');

        if (cashAmount > 0) {
            changeDisplay.style.display = 'block';
            updateOrderTotals(); // Actualiza todos los cálculos
        } else {
            changeDisplay.style.display = 'none';
        }
    });

    // Calcular y mostrar totales del pedido
    function updateOrderTotals() {
        const total = cart.reduce((sum, item) => sum + item.total, 0);

        document.getElementById('order-total').textContent = formatoMoneda.format(total);

        // Actualizar el total en el display de vuelto si está visible
        const changeTotalEl = document.getElementById('change-total');
        if (changeTotalEl) {
            changeTotalEl.textContent = formatoMoneda.format(total);
        }

        // Recalcular vuelto si hay monto ingresado
        const cashAmount = parseFloat(document.getElementById('checkout-cash-amount').value) || 0;
        if (cashAmount > 0) {
            const changeAmountEl = document.getElementById('change-amount');
            const change = cashAmount - total;
            if (change >= 0) {
                changeAmountEl.textContent = formatoMoneda.format(change);
                changeAmountEl.style.color = '#0d6efd';
            } else {
                changeAmountEl.textContent = formatoMoneda.format(Math.abs(change)) + ' (Falta)';
                changeAmountEl.style.color = '#dc3545';
            }
        }
    }

    // Actualizar totales cuando se abre el modal
    const checkoutModalEl = document.getElementById('checkoutModal');
    checkoutModalEl.addEventListener('show.bs.modal', function() {
        updateOrderTotals();
    });

    document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const cedula = document.getElementById('checkout-cedula').value.trim();
        const nombre = document.getElementById('checkout-name').value.trim();
        const whatsapp = document.getElementById('checkout-phone').value.trim();
        const ciudad = document.getElementById('checkout-city').value.trim();
        const barrio = document.getElementById('checkout-neighborhood').value.trim();
        const direccion = document.getElementById('checkout-address').value.trim();
        const observaciones = document.getElementById('checkout-notes').value.trim();
        const pago = document.getElementById('checkout-payment').value;

        if (!cedula || !nombre || !whatsapp || !ciudad || !direccion || !pago) {
            showToast('Complete todos los campos obligatorios', 'error');
            return;
        }

        // Validar que no seleccione efectivo fuera de Montería
        if (pago === 'Efectivo' && ciudad !== 'Montería') {
            showToast('El pago en efectivo solo está disponible en Montería', 'error');
            return;
        }

        const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
        const costoEnvio = 0; // El costo de envío se agrega desde admin.html
        const total = subtotal;

        // 📊 Tracking: Inicio de checkout
        analytics.trackBeginCheckout(cart, total);

        // 🔍 VALIDACIÓN DE STOCK ANTES DE PROCESAR LA VENTA
        const productosAgotados = [];
        const productosSinStockSuficiente = [];

        for (const item of cart) {
            const product = productsMap.get(item.id);
            if (!product) {
                productosAgotados.push(item);
                continue;
            }

            // Buscar la variación específica (talla + color)
            const variacion = (product.variaciones || []).find(v =>
                (v.talla || 'unica') === item.talla &&
                (v.color || 'unico') === item.color
            );

            if (!variacion || variacion.stock <= 0) {
                productosAgotados.push(item);
            } else if (variacion.stock < item.cantidad) {
                productosSinStockSuficiente.push({
                    ...item,
                    stockDisponible: variacion.stock
                });
            }
        }

        // Si hay productos sin stock, mostrar mensaje y cancelar compra
        if (productosAgotados.length > 0 || productosSinStockSuficiente.length > 0) {
            let mensaje = '⚠️ Algunos productos en tu carrito ya no están disponibles:\n\n';

            if (productosAgotados.length > 0) {
                mensaje += '❌ SIN STOCK:\n';
                productosAgotados.forEach(p => {
                    mensaje += `• ${p.nombre} (${p.talla}/${p.color})\n`;
                });
            }

            if (productosSinStockSuficiente.length > 0) {
                mensaje += '\n⚠️ STOCK INSUFICIENTE:\n';
                productosSinStockSuficiente.forEach(p => {
                    mensaje += `• ${p.nombre} (${p.talla}/${p.color})\n`;
                    mensaje += `  Solicitaste: ${p.cantidad} | Disponible: ${p.stockDisponible}\n`;
                });
            }

            mensaje += '\n🔄 Por favor, actualiza tu carrito antes de continuar.';

            showToast(mensaje, 'error', 8000);

            // Cerrar modal de checkout para que el usuario vea el carrito
            const checkoutModalEl = document.getElementById('checkoutModal');
            const checkoutModalInstance = bootstrap.Modal.getInstance(checkoutModalEl);
            if (checkoutModalInstance) {
                checkoutModalInstance.hide();
            }

            return; // Cancelar la compra
        }

        try {
            // 1. Guardar barrio personalizado si es nuevo
            if (barrio && ciudad && neighborhoodsByCity[ciudad]) {
                const isPredefined = neighborhoodsByCity[ciudad].includes(barrio);
                if (!isPredefined) {
                    // Verificar si ya existe en la base de datos
                    const neighborhoodQuery = query(
                        neighborhoodsCollection,
                        where('ciudad', '==', ciudad),
                        where('nombre', '==', barrio)
                    );
                    const neighborhoodSnapshot = await getDocs(neighborhoodQuery);

                    if (neighborhoodSnapshot.empty) {
                        // Guardar nuevo barrio
                        await addDoc(neighborhoodsCollection, {
                            ciudad: ciudad,
                            nombre: barrio,
                            fechaCreacion: serverTimestamp()
                        });
                    }
                }
            }

            // 2. Verificar si el cliente ya existe
            const clientQuery = query(clientsCollection, where('cedula', '==', cedula));
            const clientSnapshot = await getDocs(clientQuery);

            let clientId = null;
            if (!clientSnapshot.empty) {
                // Cliente existe, actualizar datos
                clientId = clientSnapshot.docs[0].id;
                const clientRef = clientSnapshot.docs[0].ref;
                await updateDoc(clientRef, {
                    nombre: nombre,
                    celular: whatsapp,
                    ciudad: ciudad,
                    barrio: barrio || '',
                    direccion: direccion,
                    ultimaCompra: serverTimestamp()
                });
            } else {
                // Cliente nuevo, crear
                const newClientRef = await addDoc(clientsCollection, {
                    cedula: cedula,
                    nombre: nombre,
                    celular: whatsapp,
                    ciudad: ciudad,
                    barrio: barrio || '',
                    direccion: direccion,
                    ultimaCompra: serverTimestamp()
                });
                clientId = newClientRef.id;
            }

            // 3. Crear pedido
            const pedidoData = {
                clienteId: clientId,
                clienteCedula: cedula,
                clienteNombre: nombre,
                clienteCelular: whatsapp,
                clienteCiudad: ciudad,
                clienteBarrio: barrio || '',
                clienteDireccion: direccion,
                observaciones: observaciones || '',
                metodoPagoSolicitado: pago,
                items: cart.map(item => ({
                    productoId: item.id || '',
                    codigo: item.codigo || '',
                    nombre: item.nombre || '',
                    talla: item.talla || '',
                    color: item.color || '',
                    cantidad: item.cantidad || 0,
                    precio: item.precio || 0,
                    total: item.total || 0
                })),
                subtotalProductos: subtotal,
                costoEnvio: costoEnvio,
                totalPedido: total,
                estado: "pendiente",
                timestamp: serverTimestamp(),
                origen: "web",
                tipoVenta: isWholesaleActive ? "Mayorista" : "Detal"
            };

            const docRef = await addDoc(webOrdersCollection, pedidoData);

            // 📊 Tracking: Compra completada
            analytics.trackPurchase({
                orderId: docRef.id,
                totalPedido: total,
                metodoPagoSolicitado: pago,
                items: pedidoData.items
            });

            // Crear mensaje LIMPIO para WhatsApp (sin emojis)
            let mensajeWhatsApp = `NUEVO PEDIDO WEB #${docRef.id.substring(0, 6).toUpperCase()}\n\n`;
            if (isWholesaleActive) {
                mensajeWhatsApp += "TIPO: MAYORISTA\n\n";
            }
            mensajeWhatsApp += `Cliente: ${nombre}\n`;
            mensajeWhatsApp += `Cedula: ${cedula}\n`;
            mensajeWhatsApp += `WhatsApp: ${whatsapp}\n`;
            mensajeWhatsApp += `Ciudad: ${ciudad}\n`;
            if (barrio) mensajeWhatsApp += `Barrio: ${barrio}\n`;
            mensajeWhatsApp += `Direccion: ${direccion}\n`;
            if(observaciones) mensajeWhatsApp += `Observaciones: ${observaciones}\n`;
            mensajeWhatsApp += `\nPago: ${pago}\n`;

            // Si es pago en efectivo, agregar monto y vuelto
            if (pago === 'Efectivo') {
                const cashAmount = parseFloat(document.getElementById('checkout-cash-amount').value) || 0;
                if (cashAmount > 0) {
                    const change = cashAmount - total;
                    mensajeWhatsApp += `Paga con: ${formatoMoneda.format(cashAmount)}\n`;
                    mensajeWhatsApp += `Vuelto: ${formatoMoneda.format(change)}\n`;
                }
            }

            mensajeWhatsApp += "\nPRODUCTOS:\n\n";
            cart.forEach((item, i) => {
                mensajeWhatsApp += `${i + 1}. ${item.nombre}\n`;
                mensajeWhatsApp += `   Talla: ${item.talla} | Color: ${item.color}\n`;
                mensajeWhatsApp += `   ${item.cantidad} unid. x ${formatoMoneda.format(item.precio)}\n`;
                mensajeWhatsApp += `   Subtotal: ${formatoMoneda.format(item.total)}\n\n`;
            });

            mensajeWhatsApp += `\nTOTAL: ${formatoMoneda.format(total)}`;

            // Limpiar y cerrar modales
            const checkoutModalEl = document.getElementById('checkoutModal');
            const cartOffcanvasEl = document.getElementById('cartOffcanvas');

            const checkoutModalInstance = bootstrap.Modal.getInstance(checkoutModalEl) || bootstrap.Modal.getOrCreateInstance(checkoutModalEl);
            const cartOffcanvasInstance = bootstrap.Offcanvas.getInstance(cartOffcanvasEl) || bootstrap.Offcanvas.getOrCreateInstance(cartOffcanvasEl);

            checkoutModalInstance.hide();
            cartOffcanvasInstance.hide();

            // Limpiar carrito
            cart = [];
            renderCart();
            saveCart();
            document.getElementById('checkout-form').reset();

            // Crear URL de WhatsApp con número correcto
            const numeroWhatsApp = '573046084971'; // Número de la empresa
            const mensajeWhatsAppURL = encodeURIComponent(mensajeWhatsApp);
            const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeWhatsAppURL}`;

            // Abrir WhatsApp (compatible con PWA)
            openWhatsApp(urlWhatsApp);

            // Mostrar mensaje de éxito
            showToast('✅ ¡Pedido confirmado! Se abrió WhatsApp para enviar los detalles.', 'success');

        } catch (err) {
            console.error("Error al guardar pedido: ", err);
            showToast('Error al procesar el pedido', 'error');
        }
    });

    // ✅ NAVEGACIÓN MÓVIL MEJORADA
    const searchModal = document.getElementById('searchModal');
    const mobileNavItems = document.querySelectorAll('.nav-item');

    function setActiveNavItem(selectedItem) {
        mobileNavItems.forEach(item => item.classList.remove('active'));
        if (selectedItem && !selectedItem.id.includes('cart')) {
            selectedItem.classList.add('active');
        }
    }

    document.getElementById('mobile-search-btn').addEventListener('click', () => {
        searchModal.style.display = 'flex';
        document.getElementById('search-modal-input').focus();
        setActiveNavItem(document.getElementById('mobile-search-btn'));
        document.body.classList.add('modal-search-open');
    });

    const closeSearchButton = document.getElementById('close-search-modal');
    closeSearchButton.addEventListener('click', () => {
        searchModal.style.display = 'none';
        document.body.classList.remove('modal-search-open');
    });
    
    document.querySelector('#searchModal .search-icon').addEventListener('click', () => {
        searchModal.style.display = 'none';
        document.body.classList.remove('modal-search-open');
    });
    
    document.getElementById('search-modal-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchModal.style.display = 'none';
            document.body.classList.remove('modal-search-open');
        }
    });

    document.getElementById('mobile-home-btn').addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const allFilterBtn = document.querySelector('.filter-group[data-filter="all"]');
        if (allFilterBtn) allFilterBtn.click();
        setActiveNavItem(document.getElementById('mobile-home-btn'));
    });

    document.getElementById('mobile-promo-btn').addEventListener('click', () => {
        if (activePromotions.size > 0) {
            document.getElementById('promotions-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            showToast('No hay promociones activas en este momento', 'warning');
        }
        setActiveNavItem(document.getElementById('mobile-promo-btn'));
    });

    document.getElementById('wholesale-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('wholesale-code');
        const code = input.value.trim().toUpperCase();

        if (code === WHOLESALE_CODE) {
            isWholesaleActive = true;
            document.body.classList.add('wholesale-active');
            showToast('¡Modo mayorista activado!', 'success');
            input.value = 'MODO MAYORISTA ACTIVO';
            input.disabled = true;
            e.target.querySelector('button').disabled = true;

            // 📊 Tracking: Modo mayorista activado
            analytics.trackWholesaleActivation();

            applyFiltersAndRender();

            if (cart.length > 0) {
                showToast('Vacía tu carrito para agregar productos con precio mayorista', 'warning');
            }

        } else {
            showToast('Código incorrecto', 'error');
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // FUNCIONALIDAD DE ZOOM EN IMÁGENES
    // ═══════════════════════════════════════════════════════════════════
    const zoomOverlay = document.getElementById('imageZoomOverlay');
    const zoomedImage = document.getElementById('zoomedImage');
    const closeZoomBtn = document.getElementById('closeZoomBtn');
    const modalProductImage = document.getElementById('modal-product-image');

    // Abrir zoom al hacer click en la imagen del modal
    modalProductImage.addEventListener('click', () => {
        const imageSrc = modalProductImage.src;
        if (imageSrc && !imageSrc.includes('placeholder')) {
            zoomedImage.src = imageSrc;
            zoomOverlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevenir scroll

            // 📊 Tracking: Zoom de imagen
            const productId = document.getElementById('modal-product-id').value;
            const product = productsMap.get(productId);
            if (product) {
                analytics.trackImageZoom(product);
            }
        }
    });

    // Cerrar zoom con el botón X
    closeZoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeZoom();
    });

    // Cerrar zoom al hacer click en el overlay (fondo)
    zoomOverlay.addEventListener('click', (e) => {
        if (e.target === zoomOverlay) {
            closeZoom();
        }
    });

    // Cerrar zoom con la tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && zoomOverlay.classList.contains('active')) {
            closeZoom();
        }
    });

    // Función para cerrar el zoom
    function closeZoom() {
        zoomOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll
        // Limpiar src después de la animación
        setTimeout(() => {
            if (!zoomOverlay.classList.contains('active')) {
                zoomedImage.src = '';
            }
        }, 300);
    }

    // Soporte para gestos táctiles en móvil (pinch to zoom)
    let initialDistance = 0;
    let currentScale = 1;

    zoomedImage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialDistance = getDistance(e.touches[0], e.touches[1]);
        }
    });

    zoomedImage.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches[0], e.touches[1]);
            const scale = currentDistance / initialDistance;
            currentScale = Math.min(Math.max(1, scale), 3); // Limitar entre 1x y 3x
            zoomedImage.style.transform = `scale(${currentScale})`;
        }
    });

    zoomedImage.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            // Resetear escala al soltar
            setTimeout(() => {
                currentScale = 1;
                zoomedImage.style.transform = 'scale(1)';
            }, 300);
        }
    });

    function getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROTECCIÓN DE IMÁGENES - Anti-descarga
    // ═══════════════════════════════════════════════════════════════════

    // Deshabilitar clic derecho en todas las imágenes
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showToast('Las imágenes están protegidas', 'warning');
            return false;
        });

        // Deshabilitar arrastrar
        img.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
    });

    // Proteger nuevas imágenes que se carguen dinámicamente
    const observeImages = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'IMG') {
                    node.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        showToast('Las imágenes están protegidas', 'warning');
                        return false;
                    });

                    node.addEventListener('dragstart', (e) => {
                        e.preventDefault();
                        return false;
                    });
                }

                // Si el nodo tiene imágenes hijas
                if (node.querySelectorAll) {
                    node.querySelectorAll('img').forEach(img => {
                        img.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            showToast('Las imágenes están protegidas', 'warning');
                            return false;
                        });

                        img.addEventListener('dragstart', (e) => {
                            e.preventDefault();
                            return false;
                        });
                    });
                }
            });
        });
    });

    // Observar cambios en el DOM para proteger imágenes dinámicas
    observeImages.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Deshabilitar teclas de captura de pantalla (limitado)
    document.addEventListener('keyup', (e) => {
        // PrintScreen, Ctrl+P, etc.
        if (e.key === 'PrintScreen') {
            navigator.clipboard.writeText('');
            showToast('Captura de pantalla deshabilitada', 'warning');
        }
    });

    // Deshabilitar combinaciones de teclas para guardar imágenes
    document.addEventListener('keydown', (e) => {
        // Ctrl+S (guardar)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            showToast('Las imágenes están protegidas', 'warning');
            return false;
        }
    });

    console.log('🔒 Protección de imágenes activada');

});
