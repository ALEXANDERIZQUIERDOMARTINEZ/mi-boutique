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

    const header = document.querySelector('header.navbar');
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

    // 1. Filtrar por Categoría (filtros principales del header)
    if (activeFilter === 'disponible') {
        // Mostrar solo productos disponibles (con stock > 0)
        filtered = allProducts.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        });
    } else if (activeFilter === 'all') {
        // Mostrar todos los productos (disponibles y agotados)
        filtered = allProducts;
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

    // 3.3 Filtro de Disponibilidad (solo en stock)
    if (advancedFilters.inStockOnly) {
        filtered = filtered.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        });
    }

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

    products.forEach(product => {
        const stockTotal = (product.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
        const isAgotado = stockTotal <= 0;
        const imgUrl = product.imagenUrl || 'https://placehold.co/300x400/f5f5f5/ccc?text=Mishell';
        const { precioFinal, tienePromo, precioOriginal } = calculatePromotionPrice(product);

        const variaciones = product.variaciones || [];
        const tallas = [...new Set(variaciones.map(v => v.talla).filter(Boolean))];
        // ✅ Solo mostrar colores que tengan stock disponible
        const colores = [...new Set(variaciones
            .filter(v => (parseInt(v.stock, 10) || 0) > 0)  // Filtrar solo variaciones con stock > 0
            .map(v => v.color)
            .filter(Boolean))];

        const precioMayorNum = parseFloat(product.precioMayor) || 0;
        const isSoloDetal = isWholesaleActive && precioMayorNum === 0;
        
        let priceMayorHTML = '';
        if (precioMayorNum > 0) {
            priceMayorHTML = `<div class="price-mayor-card">${formatoMoneda.format(precioMayorNum)} (Mayor)</div>`;
        }
        
        const isDisabled = isAgotado || isSoloDetal;
        let btnText = isAgotado ? 'Agotado' : 'Ver Producto';
        if (isSoloDetal) btnText = 'Solo Detal';

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
        col.className = 'col-6 col-md-4 col-lg-3'; 
        
        col.innerHTML = `
            <div class="product-card" data-product-id="${product.id}" data-stock="${stockTotal}">
                <div class="product-image-wrapper">
                    <img src="${imgUrl}" alt="${product.nombre}">
                    <div class="product-badges">
                        ${tienePromo ? '<span class="badge-promo">PROMO</span>' : ''}
                        ${isAgotado ? '<span class="badge-stock badge-agotado">AGOTADO</span>' : ''}
                        ${isSoloDetal ? '<span class="badge-stock badge-solo-detal">SOLO DETAL</span>' : ''}
                    </div>
                </div>
                <div class="product-card-body">
                    <h3 class="product-title">${product.nombre}</h3>
                    ${product.descripcion ? `<p class="product-description">${product.descripcion.length > 60 ? product.descripcion.substring(0, 60) + '...' : product.descripcion}</p>` : ''}
                    ${product.observaciones ? `<p class="product-observations">${product.observaciones}</p>` : ''}
                    <div class="price-detal-card">
                        ${tienePromo ? `<span class="price-detal-old-card">${formatoMoneda.format(precioOriginal)}</span>` : ''}
                        ${formatoMoneda.format(precioFinal)} (Detal)
                    </div>
                    ${priceMayorHTML}
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
            const product = productsMap.get(productId);

            const precioMayorNum = parseFloat(product.precioMayor) || 0;
            const isSoloDetal = isWholesaleActive && precioMayorNum === 0;

            if (isSoloDetal) {
                showToast('Este producto solo está disponible para venta al detal', 'warning');
                return;
            }
            if (stock <= 0) {
                showToast('Este producto se encuentra agotado', 'warning');
                return;
            }
            openProductModal(productId);
        });
    });
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

    const selectTalla = document.getElementById('select-talla');
    const selectColor = document.getElementById('select-color');
    selectTalla.innerHTML = '<option value="">Seleccione Talla</option>';
    selectColor.innerHTML = '<option value="">Seleccione Color</option>';
    selectColor.disabled = true;
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
    const variaciones = product.variaciones || [];
    const tallas = [...new Set(variaciones.map(v => v.talla).filter(Boolean))];

    // Determinar si es talla única
    const esTallaUnica = (tallas.length === 0 || (tallas.length === 1 && (tallas[0] === '' || tallas[0].toLowerCase() === 'unica' || tallas[0].toLowerCase() === 'única')));
    const tallaContainer = selectTalla.closest('.mb-3');

    if (tallas.length === 0 && variaciones.length > 0) {
        selectTalla.innerHTML = '<option value="unica">Única</option>';
        selectTalla.value = "unica";
        selectTalla.disabled = true; // Deshabilitar selector pero mostrarlo
        tallaContainer.style.display = 'block'; // Mostrar selector de talla
    } else if (esTallaUnica) {
        selectTalla.innerHTML = `<option value="${tallas[0]}">${tallas[0] || 'Única'}</option>`;
        selectTalla.value = tallas[0];
        selectTalla.disabled = true; // Deshabilitar selector pero mostrarlo
        tallaContainer.style.display = 'block'; // Mostrar selector de talla
    } else {
        selectTalla.disabled = false; // Habilitar selector para múltiples tallas
        tallaContainer.style.display = 'block'; // Mostrar selector de talla
        tallas.forEach(t => {
            selectTalla.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }

    const colores = [...new Set(variaciones.map(v => v.color).filter(Boolean))];
    if (colores.length === 0 && variaciones.length > 0) {
        selectColor.innerHTML = '<option value="unico">Único</option>';
        selectColor.value = "unico";
        selectColor.disabled = false;
        selectColor.dispatchEvent(new Event('change'));
    } else if (tallas.length === 0 || esTallaUnica) {
        // Si es talla única, activar selector de color directamente
        selectColor.disabled = false;

        // Actualizar mensaje de stock
        stockText.textContent = 'Seleccione un color';

        colores.forEach(c => {
            selectColor.innerHTML += `<option value="${c}">${c}</option>`;
        });

        // Si solo hay un color, seleccionarlo automáticamente
        if (colores.length === 1) {
            selectColor.value = colores[0];
            selectColor.dispatchEvent(new Event('change'));
        }

        // Enfocar en el selector de color
        setTimeout(() => selectColor.focus(), 300);
    }

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

    // Resetear inputs de precio
    document.getElementById('price-min').value = '';
    document.getElementById('price-max').value = '';
    document.getElementById('price-range-min').value = 0;
    document.getElementById('price-range-max').value = 500000;
    document.getElementById('price-display-min').textContent = '$0';
    document.getElementById('price-display-max').textContent = '$500.000';

    // Resetear colores
    document.querySelectorAll('.color-filter-chip.active').forEach(chip => {
        chip.classList.remove('active');
    });

    // Resetear checkboxes
    document.getElementById('filter-in-stock').checked = false;
    document.getElementById('filter-promo-only').checked = false;

    // Resetear ordenamiento
    document.getElementById('sort-products').value = 'newest';

    applyFiltersAndRender();
}

// --- DOMCONTENTLOADED ---
document.addEventListener('DOMContentLoaded', () => {

    loadCart();
    loadGlobalPromotions(); // ✅ Cargar promociones globales (Black Friday, etc.)
    // loadPromotions(); // ✅ Ya no necesario - las promociones se leen del campo producto.promocion

    const categoryDropdownMenu = document.getElementById('category-dropdown-menu');
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

        console.log(`✅ ${categories.length} categorías cargadas correctamente`);
    }, (error) => {
        console.error("❌ Error al cargar categorías:", error);
        categoryDropdownMenu.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error al cargar</a></li>';
    });

    document.querySelectorAll('.catalog-filters .filter-group').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });

    function handleFilterClick(e) {
        e.preventDefault();
        const clickedFilter = e.currentTarget;

        document.querySelectorAll('.catalog-filters .filter-group.active').forEach(b => b.classList.remove('active'));

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
        loadAvailableColors();
        applyFiltersAndRender();
    }, (error) => {
        console.error("❌ Error al cargar productos:", error);
        const container = document.getElementById('products-container');
        if (container) {
            container.innerHTML = '<div class="col-12 text-center text-danger p-4"><p>Error al cargar productos. Por favor recarga la página.</p></div>';
        }
    });

    // ✅ EVENT LISTENERS PARA FILTROS AVANZADOS

    // Filtro de precio - Inputs numéricos
    const priceMinInput = document.getElementById('price-min');
    const priceMaxInput = document.getElementById('price-max');
    const priceRangeMin = document.getElementById('price-range-min');
    const priceRangeMax = document.getElementById('price-range-max');
    const priceDisplayMin = document.getElementById('price-display-min');
    const priceDisplayMax = document.getElementById('price-display-max');

    function updatePriceFilter() {
        advancedFilters.priceMin = parseInt(priceMinInput.value) || 0;
        advancedFilters.priceMax = parseInt(priceMaxInput.value) || 500000;

        priceRangeMin.value = advancedFilters.priceMin;
        priceRangeMax.value = advancedFilters.priceMax;

        priceDisplayMin.textContent = formatCurrency(advancedFilters.priceMin);
        priceDisplayMax.textContent = formatCurrency(advancedFilters.priceMax);

        applyFiltersAndRender();
    }

    priceMinInput.addEventListener('input', updatePriceFilter);
    priceMaxInput.addEventListener('input', updatePriceFilter);

    // Filtro de precio - Sliders
    priceRangeMin.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        advancedFilters.priceMin = value;
        priceMinInput.value = value;
        priceDisplayMin.textContent = formatCurrency(value);
        applyFiltersAndRender();
    });

    priceRangeMax.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        advancedFilters.priceMax = value;
        priceMaxInput.value = value;
        priceDisplayMax.textContent = formatCurrency(value);
        applyFiltersAndRender();
    });

    // Filtros de disponibilidad
    document.getElementById('filter-in-stock').addEventListener('change', (e) => {
        advancedFilters.inStockOnly = e.target.checked;
        applyFiltersAndRender();
    });

    document.getElementById('filter-promo-only').addEventListener('change', (e) => {
        advancedFilters.promoOnly = e.target.checked;
        applyFiltersAndRender();
    });

    // Ordenamiento
    document.getElementById('sort-products').addEventListener('change', (e) => {
        advancedFilters.sortBy = e.target.value;
        applyFiltersAndRender();
    });

    // Botón resetear filtros
    document.getElementById('btn-reset-filters').addEventListener('click', resetAllFilters);

    // ✅ Toggle filtros móvil con overlay
    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const filtersSidebar = document.getElementById('filters-sidebar');
    const filtersOverlay = document.getElementById('filters-overlay');

    function closeFiltersSidebar() {
        if (filtersSidebar && filtersOverlay && btnToggleFilters) {
            filtersSidebar.classList.remove('show');
            filtersOverlay.classList.remove('show');
            btnToggleFilters.innerHTML = '<i class="bi bi-funnel"></i> Mostrar Filtros';
        }
    }

    function openFiltersSidebar() {
        if (filtersSidebar && filtersOverlay && btnToggleFilters) {
            filtersSidebar.classList.add('show');
            filtersOverlay.classList.add('show');
            btnToggleFilters.innerHTML = '<i class="bi bi-x"></i> Ocultar Filtros';
        }
    }

    // ✅ Botón aplicar filtros (cierra sidebar en móvil)
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
        applyFiltersAndRender();
        showToast('Filtros aplicados correctamente', 'success');
        closeFiltersSidebar(); // Cierra el sidebar automáticamente
    });

    if (btnToggleFilters && filtersSidebar) {
        btnToggleFilters.addEventListener('click', () => {
            const isShowing = filtersSidebar.classList.contains('show');
            if (isShowing) {
                closeFiltersSidebar();
            } else {
                openFiltersSidebar();
            }
        });
    }

    // Cerrar filtros al hacer click en overlay
    if (filtersOverlay) {
        filtersOverlay.addEventListener('click', closeFiltersSidebar);
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
    
    // Listeners del MODAL DE PRODUCTO
    document.getElementById('select-talla').addEventListener('change', (e) => {
        const productId = document.getElementById('modal-product-id').value;
        const product = productsMap.get(productId);
        const selectedTalla = e.target.value;
        const selectColor = document.getElementById('select-color');
        if (!product || !selectedTalla) {
            selectColor.innerHTML = '<option value="">Seleccione Color</option>';
            selectColor.disabled = true;
            return;
        }
        selectColor.innerHTML = '<option value="">Seleccione Color</option>';
        selectColor.disabled = false;
        const variaciones = product.variaciones || [];
        const colores = [...new Set(variaciones
            .filter(v => (v.talla || 'unica') === selectedTalla)
            .map(v => v.color)
            .filter(Boolean)
        )];
        if (colores.length === 0) {
            selectColor.innerHTML = '<option value="unico">Único</option>';
            selectColor.value = "unico";
        } else {
            colores.forEach(c => {
                selectColor.innerHTML += `<option value="${c}">${c}</option>`;
            });
        }
        selectColor.dispatchEvent(new Event('change'));
    });

    document.getElementById('select-color').addEventListener('change', () => {
        const productId = document.getElementById('modal-product-id').value;
        const product = productsMap.get(productId);
        const selectedTalla = document.getElementById('select-talla').value;
        const selectedColor = document.getElementById('select-color').value;
        const stockDisplay = document.getElementById('stock-display');
        const stockText = document.getElementById('stock-text');
        const btnAdd = document.getElementById('btn-add-cart');
        const cantidadInput = document.getElementById('select-cantidad');
        if (!product || !selectedTalla || !selectedColor) {
            btnAdd.disabled = true;
            return;
        }
        const variacion = (product.variaciones || []).find(v =>
            (v.talla || 'unica') === selectedTalla &&
            (v.color || 'unico') === selectedColor
        );
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
    });

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
        const talla = document.getElementById('select-talla').value;
        const color = document.getElementById('select-color').value;
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
                    // Trigger change event para validar método de pago
                    document.getElementById('checkout-city').dispatchEvent(new Event('change'));
                }
                showToast('¡Datos cargados! Bienvenido de nuevo', 'success');
            }
        } catch (err) {
            console.error("Error buscando cliente:", err);
        }
    });

    // Validar método de pago según ciudad
    document.getElementById('checkout-city').addEventListener('change', function() {
        const ciudad = this.value;
        const efectivoOption = document.getElementById('payment-efectivo');
        const paymentInfo = document.getElementById('payment-info');
        const paymentSelect = document.getElementById('checkout-payment');

        if (ciudad && ciudad !== 'Montería') {
            efectivoOption.disabled = true;
            efectivoOption.textContent = 'Efectivo (No disponible fuera de Montería)';
            paymentInfo.textContent = '⚠️ Solo transferencia disponible para envíos fuera de Montería';
            paymentInfo.classList.add('text-warning');

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
        } else {
            efectivoOption.disabled = false;
            efectivoOption.textContent = 'Efectivo (Pago contra entrega)';
            paymentInfo.textContent = '';
            paymentInfo.classList.remove('text-warning', 'text-success');
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
        const total = cart.reduce((sum, item) => sum + item.total, 0);
        const changeDisplay = document.getElementById('change-display');
        const changeTotalEl = document.getElementById('change-total');
        const changeAmountEl = document.getElementById('change-amount');

        if (cashAmount > 0) {
            changeDisplay.style.display = 'block';
            changeTotalEl.textContent = formatoMoneda.format(total);

            const change = cashAmount - total;
            if (change >= 0) {
                changeAmountEl.textContent = formatoMoneda.format(change);
                changeAmountEl.style.color = '#0d6efd';
            } else {
                changeAmountEl.textContent = formatoMoneda.format(Math.abs(change)) + ' (Falta)';
                changeAmountEl.style.color = '#dc3545';
            }
        } else {
            changeDisplay.style.display = 'none';
        }
    });

    document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const cedula = document.getElementById('checkout-cedula').value.trim();
        const nombre = document.getElementById('checkout-name').value.trim();
        const whatsapp = document.getElementById('checkout-phone').value.trim();
        const ciudad = document.getElementById('checkout-city').value.trim();
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

        const total = cart.reduce((sum, item) => sum + item.total, 0);

        // 📊 Tracking: Inicio de checkout
        analytics.trackBeginCheckout(cart, total);

        try {
            // 1. Verificar si el cliente ya existe
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
                    direccion: direccion,
                    ultimaCompra: serverTimestamp()
                });
                clientId = newClientRef.id;
            }

            // 2. Crear pedido
            const pedidoData = {
                clienteId: clientId,
                clienteCedula: cedula,
                clienteNombre: nombre,
                clienteCelular: whatsapp,
                clienteCiudad: ciudad,
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
            mensajeWhatsApp += `WhatsApp: ${whatsapp}\n`;
            mensajeWhatsApp += `Ciudad: ${ciudad}\n`;
            mensajeWhatsApp += `Direccion: ${direccion}\n`;
            if(observaciones) mensajeWhatsApp += `Observaciones: ${observaciones}\n`;
            mensajeWhatsApp += `Pago: ${pago}\n\n`;
            mensajeWhatsApp += "PRODUCTOS:\n\n";
            cart.forEach((item, i) => {
                mensajeWhatsApp += `${i + 1}. ${item.nombre}\n`;
                mensajeWhatsApp += `   Talla: ${item.talla} | Color: ${item.color}\n`;
                mensajeWhatsApp += `   ${item.cantidad} unid. x ${formatoMoneda.format(item.precio)}\n`;
                mensajeWhatsApp += `   Subtotal: ${formatoMoneda.format(item.total)}\n\n`;
            });
            mensajeWhatsApp += `TOTAL: ${formatoMoneda.format(total)}`;

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
