// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs, updateDoc, increment, doc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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

// --- Helper: Open WhatsApp sin salir de la página ---
function openWhatsApp(url) {
    // Usar anchor con target="_blank" para abrir WhatsApp sin navegar fuera
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


let bsToast = null;
let cart = [];
let productsMap = new Map();
let allProducts = [];
let activePromotions = new Map();
let globalPromotion = null; // Promoción global activa (ej: Black Friday)
let itemToDelete = null;
let isWholesaleActive = window.location.pathname.includes('mayor');
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
let promoPriceCache = new Map();
let cachedAvailableCount = 0;

// Estado de la galería deslizable entre colores
let swipeGallery = {
    images: [],        // [{url, angulo, colorNombre, colorHex, colorIndex, indexInColor}]
    currentIndex: 0,
    product: null,
    touchStartX: 0,
    touchStartY: 0,
    didSwipe: false
};
let swipeListenersAttached = false;

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
    const toastIconEl = document.getElementById('toast-icon');
    if (liveToastEl && toastBodyEl) {
        if (!bsToast) bsToast = new bootstrap.Toast(liveToastEl, { delay: 3000 });

        liveToastEl.className = 'toast border-0';
        const bgClass = type === 'error' ? 'text-bg-danger' : (type === 'warning' ? 'text-bg-warning' : 'text-bg-success');
        liveToastEl.classList.add(bgClass);

        const icons = {
            success: 'bi-check-circle-fill',
            error:   'bi-x-circle-fill',
            warning: 'bi-exclamation-triangle-fill'
        };
        if (toastIconEl) {
            toastIconEl.innerHTML = `<i class="bi ${icons[type] || icons.success}"></i>`;
        }

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

// Versión cacheada: reutiliza el resultado dentro del mismo ciclo de render
function getPromoPrice(product) {
    if (!promoPriceCache.has(product.id)) {
        promoPriceCache.set(product.id, calculatePromotionPrice(product));
    }
    return promoPriceCache.get(product.id);
}

// ✅ FUNCIÓN DE FILTRO MEJORADA CON FILTROS AVANZADOS
function applyFiltersAndRender() {
    promoPriceCache.clear();
    const activeFilterEl = document.querySelector('.filter-group.active');

    // Si no hay filtro activo, mostrar productos disponibles por defecto
    const activeFilter = activeFilterEl ? activeFilterEl.dataset.filter : 'disponible';

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const navSearchTerm = (document.getElementById('nav-search-input')?.value || '').toLowerCase();
    const finalSearchTerm = searchTerm || navSearchTerm;

    let filtered = allProducts;

    // En modo mayorista, excluir productos sin precio al por mayor
    if (isWholesaleActive) {
        filtered = filtered.filter(p => parseFloat(p.precioMayor) > 0);
    }

    // 1. En la tienda pública solo se muestran productos con stock disponible
    filtered = filtered.filter(p => {
        const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
        return stock > 0;
    });

    // 2. Filtrar por tipo/categoría (el filtro de stock ya aplica a todos)
    if (activeFilter === 'promocion') {
        filtered = filtered.filter(p => {
            const tienePromoIndividual = p.promocion?.activa && !isWholesaleActive;
            const tienePromoGlobal = globalPromotion && !isWholesaleActive;
            return tienePromoIndividual || tienePromoGlobal;
        });
    } else if (activeFilter !== 'disponible' && activeFilter !== 'all') {
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
        const { precioFinal } = getPromoPrice(p);
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
    // En la vista "disponible" con el orden por defecto, mostrar primero los más vendidos
    const effectiveSortBy = (activeFilter === 'disponible' && advancedFilters.sortBy === 'newest')
        ? 'bestseller'
        : advancedFilters.sortBy;
    filtered = sortProducts(filtered, effectiveSortBy);

    // 📊 Tracking: Búsqueda o vista de categoría
    if (finalSearchTerm) {
        analytics.trackSearch(finalSearchTerm, filtered.length);
    } else if (activeFilter && activeFilter !== 'all') {
        analytics.trackProductListView(activeFilter, filtered);
    }

    renderProducts(filtered);
}

// Función helper para obtener el stock de un producto
function getStock(product) {
    return (product.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
}

// ✅ FUNCIÓN DE ORDENAMIENTO
function sortProducts(products, sortBy) {
    const sorted = [...products];

    // Primero ordenar según el criterio seleccionado
    let ordered;
    switch (sortBy) {
        case 'price-asc':
            ordered = sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : getPromoPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : getPromoPrice(b).precioFinal;
                return priceA - priceB;
            });
            break;
        case 'price-desc':
            ordered = sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : getPromoPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : getPromoPrice(b).precioFinal;
                return priceB - priceA;
            });
            break;
        case 'name-asc':
            ordered = sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
            break;
        case 'name-desc':
            ordered = sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
            break;
        case 'bestseller':
            ordered = sorted.sort((a, b) => (b.ventas || 0) - (a.ventas || 0));
            break;
        case 'newest':
        default:
            ordered = sorted; // Ya vienen ordenados por timestamp desc
            break;
    }

    // Separar: disponibles en promo → disponibles normales → agotados
    const disponiblesPromo = ordered.filter(p => getStock(p) > 0 && getPromoPrice(p).tienePromo);
    const disponiblesNormal = ordered.filter(p => getStock(p) > 0 && !getPromoPrice(p).tienePromo);
    const agotados = ordered.filter(p => getStock(p) <= 0);

    return [...disponiblesPromo, ...disponiblesNormal, ...agotados];
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

    // Actualizar badge de disponibles (ya calculado al cargar productos)
    const availableBadge = document.getElementById('available-badge');
    if (availableBadge) availableBadge.textContent = cachedAvailableCount;

    if (products.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">No se encontraron productos</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    products.forEach((product, index) => {
        const stockTotal = (product.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
        const isAgotado = stockTotal <= 0;
        const { precioFinal, tienePromo, precioOriginal } = getPromoPrice(product);
        const precioMostrado = isWholesaleActive ? (parseFloat(product.precioMayor) || 0) : precioFinal;

        // Colores y tallas CON STOCK (disponibles para comprar)
        const variacionesConStock = (product.variaciones || []).filter(v => parseInt(v.stock, 10) > 0);
        const coloresConStock = [...new Set(variacionesConStock.map(v => v.color).filter(Boolean))];
        const tallasUnicas = [...new Set(variacionesConStock.map(v => v.talla).filter(t => t && t.toLowerCase() !== 'unica' && t.toLowerCase() !== 'única'))];

        // Map de nombre→hex desde variantes_color (colores con imagen real)
        const variantesColorMap = Object.fromEntries(
            (product.variantes_color || []).map(vc => [(vc.nombre || '').toLowerCase().trim(), vc.hex])
        );

        // Helper: obtener la imagen "frente" de una variante de color
        function getColorFrenteImg(vc) {
            if (!vc?.imagenes?.length) return '';
            const sorted = [...vc.imagenes].sort((a, b) => (a.orden || 0) - (b.orden || 0));
            return (sorted.find(img => img.angulo === 'frente') || sorted[0])?.url || '';
        }

        // Dots de color: colores CON STOCK con imagen, incluyendo su URL para la tarjeta
        const coloresBaseList = coloresConStock.length > 0
            ? coloresConStock.slice(0, 6)
            : (product.variantes_color || []).map(vc => vc.nombre).filter(Boolean).slice(0, 6);

        const coloresParaCard = coloresBaseList.map(colorNombre => {
            const vc = (product.variantes_color || []).find(
                v => (v.nombre || '').toLowerCase().trim() === colorNombre.toLowerCase().trim()
            );
            const dp = vc?.dotPosition || { x: 50, y: 15 };
            return {
                nombre: colorNombre,
                hex: variantesColorMap[colorNombre.toLowerCase().trim()] || COLOR_MAP[colorNombre.toLowerCase().trim()] || '#ccc',
                imgUrl: getColorFrenteImg(vc),
                dotPos: dp
            };
        });

        // Imagen de tarjeta: primer color con imagen, luego foto principal (si mostrarFotoPrincipal no es false)
        let imgUrl = 'https://placehold.co/300x400/f5f5f5/ccc?text=Mishell';
        let activeColorIdx = -1;
        for (let i = 0; i < coloresParaCard.length; i++) {
            if (coloresParaCard[i].imgUrl) {
                imgUrl = coloresParaCard[i].imgUrl;
                activeColorIdx = i;
                break;
            }
        }
        if (activeColorIdx === -1 && product.mostrarFotoPrincipal !== false) {
            imgUrl = product.imagenUrl || imgUrl;
        }

        const coloresHtml = coloresParaCard.map(({ nombre, hex, imgUrl: cImg, dotPos }, i) => {
            const dotStyle = cImg
                ? `background-image:url('${cImg}');background-size:cover;background-position:${dotPos.x}% ${dotPos.y}%;`
                : `background:${hex};`;
            return `<button class="card-color-dot${i === activeColorIdx ? ' active' : ''}" style="${dotStyle}" title="${nombre}" data-color-img="${cImg}" data-dot-x="${dotPos.x}" data-dot-y="${dotPos.y}" type="button"></button>`;
        }).join('');

        const tallasHtml = tallasUnicas.slice(0, 5).map(t => `<span class="card-size-chip">${t}</span>`).join('');

        const desc = product.descripcion ? product.descripcion.substring(0, 55) : '';

        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3';

        const delay = Math.min(index * 0.04, 0.8);
        col.innerHTML = `
            <div class="product-card" data-product-id="${product.id}" data-stock="${stockTotal}" style="animation-delay: ${delay}s">
                <div class="product-image-wrapper">
                    <img src="${imgUrl}" alt="${product.nombre}" loading="lazy">
                    ${isAgotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}
                    ${tienePromo ? '<span class="badge-promo">DESCUENTO</span>' : ''}
                </div>
                <div class="product-card-body">
                    <h3 class="product-title">${product.nombre}</h3>
                    ${desc ? `<p class="product-card-desc">${desc}</p>` : ''}
                    ${coloresHtml || tallasHtml ? `
                    <div class="card-meta-row">
                        ${coloresHtml ? `<div class="card-colors">${coloresHtml}</div>` : ''}
                        ${tallasHtml ? `<div class="card-sizes">${tallasHtml}</div>` : ''}
                    </div>` : ''}
                    <div class="card-bottom">
                        <div class="price-detal-card">
                            ${tienePromo ? `<span class="price-detal-old-card">${formatoMoneda.format(precioOriginal)}</span>` : ''}
                            ${formatoMoneda.format(precioMostrado)}
                        </div>
                        ${!isAgotado ? '<button class="btn-add-card" type="button">Agregar</button>' : ''}
                    </div>
                </div>
            </div>
        `;
        fragment.appendChild(col);
    });
    container.appendChild(fragment);
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
        const colorNameLabelEl = document.getElementById('color-name-label');
        if (colorNameLabelEl) colorNameLabelEl.textContent = '';
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
            btn.dataset.value = color;

            // Mostrar swatch de color si existe hex en variantes_color
            const varianteColor = (product.variantes_color || []).find(
                vc => vc.nombre && vc.nombre.toLowerCase().trim() === color.toLowerCase().trim()
            );
            if (varianteColor && varianteColor.hex) {
                btn.innerHTML = `<span class="color-swatch-circle" style="background-color:${varianteColor.hex}"></span><span class="color-swatch-name">${color}</span>`;
                btn.classList.add('has-swatch');
                btn.title = color;
            } else {
                btn.textContent = color;
            }

            btn.onclick = () => selectColor(color, product);
            coloresButtons.appendChild(btn);
        });

        // Si solo hay un color, seleccionarlo automáticamente
        if (colores.length === 1) {
            selectColor(colores[0], product);
        } else {
            // Limpiar selección anterior y mostrar aviso de selección
            document.getElementById('selected-color').value = '';
            const colorNameLabelEl = document.getElementById('color-name-label');
            if (colorNameLabelEl) colorNameLabelEl.textContent = '';
            const stockText = document.getElementById('stock-text');
            stockText.textContent = 'Seleccione un color';
            document.getElementById('btn-add-cart').disabled = true;
            // Mostrar aviso minimalista de selección de color
            const colorHint = document.getElementById('color-select-hint');
            if (colorHint) colorHint.classList.add('visible');
        }
    }
}

function selectTalla(talla, product) {
    // Remover selección anterior
    document.querySelectorAll('#tallas-buttons .size-color-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    // Seleccionar nueva talla
    const tallasButtons = document.getElementById('tallas-buttons');
    const selectedBtn = tallasButtons.querySelector(`[data-value="${talla}"]`);
    if (selectedBtn) selectedBtn.classList.add('selected');
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

    // Actualizar etiqueta con el nombre del color seleccionado
    const colorNameLabel = document.getElementById('color-name-label');
    if (colorNameLabel) colorNameLabel.textContent = color;

    // Ocultar aviso de selección de color
    const colorHint = document.getElementById('color-select-hint');
    if (colorHint) colorHint.classList.remove('visible');

    // Navegar al primer fotograma de este color en la galería deslizable
    if (swipeGallery.images.length > 0) {
        const colorNameNorm = color.toLowerCase().trim();
        const firstIdx = swipeGallery.images.findIndex(
            img => img.colorNombre.toLowerCase().trim() === colorNameNorm
        );
        if (firstIdx !== -1) {
            navigateSwipeGallery(firstIdx);
            updateStockDisplay(product);
            return;
        }
    }

    // Fallback: galería tradicional (sin variantes_color)
    updateColorGallery(product, color);

    // Actualizar stock
    updateStockDisplay(product);
}

/**
 * Actualiza la galería de imágenes del modal según el color seleccionado.
 * Precarga todas las imágenes del color en segundo plano para evitar demoras.
 */
function updateColorGallery(product, colorName) {
    const thumbsEl = document.getElementById('modal-gallery-thumbs');
    const mainImg = document.getElementById('modal-product-image');
    if (!thumbsEl || !mainImg) return;

    // Buscar la variante de color que coincide
    const varianteColor = (product.variantes_color || []).find(
        vc => vc.nombre && vc.nombre.toLowerCase().trim() === colorName.toLowerCase().trim()
    );

    const imagenes = (varianteColor?.imagenes || []).filter(img => img.url);

    if (imagenes.length === 0) {
        thumbsEl.innerHTML = '';
        thumbsEl.style.display = 'none';
        mainImg.src = product.imagenUrl || 'https://placehold.co/500x500/f5f5f5/ccc?text=Sin+imagen';
        return;
    }

    const sorted = [...imagenes].sort((a, b) => (a.orden || 0) - (b.orden || 0));

    // Precargar TODAS las imágenes del color en segundo plano
    sorted.forEach(img => { (new Image()).src = img.url; });

    // Mostrar primera imagen con transición suave
    const setMainImg = (url) => {
        mainImg.classList.add('gallery-loading');
        const preloader = new Image();
        preloader.onload = () => {
            mainImg.src = url;
            mainImg.classList.remove('gallery-loading');
        };
        preloader.onerror = () => { mainImg.src = url; mainImg.classList.remove('gallery-loading'); };
        preloader.src = url;
        if (preloader.complete) { mainImg.src = url; mainImg.classList.remove('gallery-loading'); }
    };
    setMainImg(sorted[0].url);

    // Construir thumbnails — sin lazy loading para que carguen de inmediato
    thumbsEl.style.display = '';
    thumbsEl.innerHTML = '';

    sorted.forEach((img, index) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'mp-thumb' + (index === 0 ? ' active' : '');
        thumb.setAttribute('aria-label', img.angulo || `Ángulo ${index + 1}`);
        thumb.innerHTML = `<img src="${img.url}" alt="${img.angulo || ''}">`;
        thumb.addEventListener('click', () => {
            setMainImg(img.url);
            thumbsEl.querySelectorAll('.mp-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
        });
        thumbsEl.appendChild(thumb);
    });
}

// ═══════════════════════════════════════════════════════════════
// GALERÍA DESLIZABLE ENTRE COLORES (swipe)
// ═══════════════════════════════════════════════════════════════

/**
 * Construye el array plano de todas las imágenes de todos los colores
 * y prepara la galería de deslizamiento.
 */
function initSwipeGallery(product) {
    const images = [];
    (product.variantes_color || []).forEach((vc, colorIndex) => {
        const sorted = [...(vc.imagenes || []).filter(img => img.url)]
            .sort((a, b) => (a.orden || 0) - (b.orden || 0));
        sorted.forEach((img, indexInColor) => {
            images.push({
                url: img.url,
                angulo: img.angulo || '',
                colorNombre: vc.nombre,
                colorHex: vc.hex || null,
                colorIndex,
                indexInColor
            });
        });
    });

    swipeGallery.images = images;
    swipeGallery.product = product;
    swipeGallery.currentIndex = 0;
    swipeGallery.didSwipe = false;

    // Precargar todas las imágenes en segundo plano
    images.forEach(img => { (new Image()).src = img.url; });

    // Renderizar puntos de color
    renderSwipeColorDots(product.variantes_color || []);

    // Adjuntar manejadores de gestos (solo la primera vez)
    attachSwipeHandlers();

    // Actualizar flechas y contador
    updateSwipeNavArrows();
    updateSwipeCounter(0, images.length);
}

/** Renderiza los puntos de color en la parte inferior de la imagen principal */
function renderSwipeColorDots(variantesColor) {
    const dotsEl = document.getElementById('swipe-color-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';

    if (variantesColor.length <= 1) {
        dotsEl.style.display = 'none';
        return;
    }

    dotsEl.style.display = 'flex';
    variantesColor.forEach((vc, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'mp-color-dot' + (index === 0 ? ' active' : '');
        dot.title = vc.nombre || `Color ${index + 1}`;
        dot.setAttribute('aria-label', vc.nombre || `Color ${index + 1}`);
        if (vc.hex) dot.style.background = vc.hex;
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const firstIdx = swipeGallery.images.findIndex(img => img.colorIndex === index);
            if (firstIdx !== -1) navigateSwipeGallery(firstIdx);
        });
        dotsEl.appendChild(dot);
    });
}

/**
 * Navega a una imagen específica en el array plano de todas las imágenes.
 * Actualiza la imagen principal, los thumbnails y los indicadores de color.
 */
function navigateSwipeGallery(newIndex) {
    const { images, product } = swipeGallery;
    if (!images.length) return;
    newIndex = Math.max(0, Math.min(newIndex, images.length - 1));
    if (newIndex === swipeGallery.currentIndex) return; // sin cambio

    const prevImg = images[swipeGallery.currentIndex];
    swipeGallery.currentIndex = newIndex;
    const cur = images[newIndex];

    // Transición suave: desactivar transition → dim → cambiar src → restaurar transition → fade in
    const mainImg = document.getElementById('modal-product-image');
    if (mainImg) {
        mainImg.style.transition = 'none';
        mainImg.style.opacity = '0.15';
        mainImg.src = cur.url;
        requestAnimationFrame(() => {
            mainImg.style.transition = '';
            mainImg.style.opacity = '';
        });
    }

    // Si cambió de color: reconstruir thumbnails y actualizar botones
    if (!prevImg || prevImg.colorNombre !== cur.colorNombre) {
        rebuildSwipeThumbs(cur.colorNombre, product);
        syncColorButtonSelection(cur.colorNombre);
        const selColor = document.getElementById('selected-color');
        if (selColor) selColor.value = cur.colorNombre;
        updateStockDisplay(product);
    }

    // Marcar thumbnail activo según posición dentro del color
    setActiveThumbnailByIndex(cur.indexInColor);

    // Actualizar puntos de color
    document.querySelectorAll('#swipe-color-dots .mp-color-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === cur.colorIndex);
    });

    updateSwipeNavArrows();
    updateSwipeCounter(newIndex, images.length);
}

/** Actualiza el contador de posición X/N al estilo SHEIN */
function updateSwipeCounter(currentIndex, total) {
    const counterEl = document.getElementById('swipe-counter');
    if (!counterEl) return;
    if (total <= 1) {
        counterEl.style.display = 'none';
        return;
    }
    counterEl.textContent = `${currentIndex + 1}/${total}`;
    counterEl.style.display = '';
}

/** Reconstruye los thumbnails para el color dado, con navegación swipe en los clicks */
function rebuildSwipeThumbs(colorName, product) {
    const thumbsEl = document.getElementById('modal-gallery-thumbs');
    if (!thumbsEl) return;

    const varianteColor = (product.variantes_color || []).find(
        vc => vc.nombre && vc.nombre.toLowerCase().trim() === colorName.toLowerCase().trim()
    );
    const imagenes = (varianteColor?.imagenes || []).filter(img => img.url);

    if (imagenes.length === 0) {
        thumbsEl.innerHTML = '';
        thumbsEl.style.display = 'none';
        return;
    }

    const sorted = [...imagenes].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    thumbsEl.style.display = '';
    thumbsEl.innerHTML = '';

    // Índice global de la primera imagen de este color
    const colorOffset = swipeGallery.images.findIndex(
        img => img.colorNombre.toLowerCase().trim() === colorName.toLowerCase().trim()
    );

    sorted.forEach((img, index) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'mp-thumb' + (index === 0 ? ' active' : '');
        thumb.setAttribute('aria-label', img.angulo || `Ángulo ${index + 1}`);
        thumb.innerHTML = `<img src="${img.url}" alt="${img.angulo || ''}">`;
        thumb.addEventListener('click', () => {
            const globalIdx = colorOffset + index;
            if (globalIdx >= 0) navigateSwipeGallery(globalIdx);
        });
        thumbsEl.appendChild(thumb);
    });
}

/** Marca el thumbnail en la posición dada como activo */
function setActiveThumbnailByIndex(indexInColor) {
    const thumbs = document.querySelectorAll('#modal-gallery-thumbs .mp-thumb');
    thumbs.forEach((t, i) => t.classList.toggle('active', i === indexInColor));
}

/** Sincroniza la selección de botones de color sin disparar re-renders */
function syncColorButtonSelection(colorName) {
    document.querySelectorAll('#colores-buttons .size-color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === colorName);
    });
    const colorHint = document.getElementById('color-select-hint');
    if (colorHint) colorHint.classList.remove('visible');
}

/** Muestra u oculta las flechas prev/next según la posición actual */
function updateSwipeNavArrows() {
    const prevBtn = document.getElementById('swipe-prev');
    const nextBtn = document.getElementById('swipe-next');
    const total = swipeGallery.images.length;

    if (!prevBtn || !nextBtn) return;

    if (total <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        return;
    }
    prevBtn.style.display = '';
    nextBtn.style.display = '';
    prevBtn.disabled = swipeGallery.currentIndex === 0;
    nextBtn.disabled = swipeGallery.currentIndex === total - 1;
}

/** Adjunta los manejadores de gestos táctiles y clics de flecha (solo una vez) */
function attachSwipeHandlers() {
    if (swipeListenersAttached) return;
    swipeListenersAttached = true;

    const wrapper = document.querySelector('.mp-main-img-wrapper');
    if (!wrapper) return;

    // Botón anterior
    const prevBtn = document.getElementById('swipe-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (swipeGallery.images.length) navigateSwipeGallery(swipeGallery.currentIndex - 1);
        });
    }

    // Botón siguiente
    const nextBtn = document.getElementById('swipe-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (swipeGallery.images.length) navigateSwipeGallery(swipeGallery.currentIndex + 1);
        });
    }

    // Deslizamiento táctil
    wrapper.addEventListener('touchstart', (e) => {
        swipeGallery.touchStartX = e.touches[0].clientX;
        swipeGallery.touchStartY = e.touches[0].clientY;
        swipeGallery.didSwipe = false;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
        if (!swipeGallery.images.length) return;
        const dx = e.changedTouches[0].clientX - swipeGallery.touchStartX;
        const dy = e.changedTouches[0].clientY - swipeGallery.touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            swipeGallery.didSwipe = true;
            navigateSwipeGallery(swipeGallery.currentIndex + (dx < 0 ? 1 : -1));
        }
    }, { passive: true });

    // Teclas de flecha (accesibilidad en escritorio)
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('productModal');
        if (!modal || !modal.classList.contains('show')) return;
        if (!swipeGallery.images.length) return;
        if (e.key === 'ArrowRight') navigateSwipeGallery(swipeGallery.currentIndex + 1);
        if (e.key === 'ArrowLeft') navigateSwipeGallery(swipeGallery.currentIndex - 1);
    });
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
        stockText.textContent = `${variacion.stock} disponibles`;
        stockDisplay.style.color = '#28a06a';
        stockDisplay.style.background = '';
        stockDisplay.style.borderColor = '';
        cantidadInput.setAttribute('max', variacion.stock);
        cantidadInput.value = 1;
        btnAdd.disabled = false;
    } else {
        stockText.textContent = 'Agotado';
        stockDisplay.style.color = '#c62828';
        stockDisplay.style.background = '';
        stockDisplay.style.borderColor = '';
        cantidadInput.setAttribute('max', 0);
        cantidadInput.value = 0;
        btnAdd.disabled = true;
    }
}

// --- ABRIR MODAL DE PRODUCTO ---
/**
 * Modo galería para productos agotados.
 * Muestra todos los colores (de variantes_color o variaciones) como botones
 * clicables que cambian la galería de imágenes, pero sin opciones de compra.
 */
function renderGalleryColors(product) {
    const coloresButtons = document.getElementById('colores-buttons');
    const coloresContainer = document.getElementById('colores-container');
    const colorHint = document.getElementById('color-select-hint');
    if (!coloresButtons || !coloresContainer) return;

    if (colorHint) colorHint.classList.remove('visible');
    coloresButtons.innerHTML = '';
    coloresButtons.style.display = 'flex';
    coloresContainer.style.display = 'block';

    // Preferir variantes_color (tienen hex real), si no usar nombres de variaciones
    const variantesColor = product.variantes_color || [];
    let colores = variantesColor.map(vc => ({ nombre: vc.nombre, hex: vc.hex || null }));

    if (colores.length === 0) {
        const todosColores = [...new Set((product.variaciones || []).map(v => v.color).filter(Boolean))];
        colores = todosColores.map(c => ({ nombre: c, hex: COLOR_MAP[c.toLowerCase().trim()] || null }));
    }

    if (colores.length === 0) {
        coloresContainer.style.display = 'none';
        return;
    }

    colores.forEach(({ nombre, hex }, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'size-color-btn';
        btn.dataset.value = nombre;

        if (hex) {
            btn.innerHTML = `<span class="color-swatch-circle" style="background-color:${hex}"></span><span class="color-swatch-name">${nombre}</span>`;
            btn.classList.add('has-swatch');
            btn.title = nombre;
        } else {
            btn.textContent = nombre;
        }

        btn.addEventListener('click', () => {
            coloresButtons.querySelectorAll('.size-color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            // Navegar al primer fotograma de este color en la galería deslizable
            const firstIdx = swipeGallery.images.findIndex(
                img => img.colorNombre.toLowerCase().trim() === nombre.toLowerCase().trim()
            );
            if (firstIdx !== -1) navigateSwipeGallery(firstIdx);
            else updateColorGallery(product, nombre);
        });

        coloresButtons.appendChild(btn);
    });

    // Auto-seleccionar el primer color y mostrar su galería
    const firstBtn = coloresButtons.querySelector('.size-color-btn');
    if (firstBtn) {
        firstBtn.classList.add('selected');
        const firstIdx = swipeGallery.images.findIndex(img => img.colorIndex === 0);
        if (firstIdx !== -1) navigateSwipeGallery(firstIdx);
        else updateColorGallery(product, colores[0].nombre);
    }
}

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
    document.getElementById('modal-product-desc').textContent = product.descripcion || 'No hay descripción disponible.';

    // Imagen inicial: usar imagenUrl como placeholder.
    // La galería correcta se cargará en cuanto se auto-seleccione el color
    // (vía renderSizeButtons → renderColorButtons → selectColor → navigateSwipeGallery).
    const thumbsEl = document.getElementById('modal-gallery-thumbs');
    if (thumbsEl) { thumbsEl.innerHTML = ''; thumbsEl.style.display = 'none'; }
    document.getElementById('modal-product-image').src = product.imagenUrl || 'https://placehold.co/500x500/f5f5f5/ccc?text=Mishell';

    // Inicializar galería deslizable con todas las imágenes de todos los colores
    initSwipeGallery(product);
    
    if (tienePromo) {
        document.getElementById('modal-price-old').textContent = formatoMoneda.format(precioOriginal);
        document.getElementById('modal-price-old').style.display = 'inline';
    } else {
        document.getElementById('modal-price-old').style.display = 'none';
    }
    const precioModalMostrado = isWholesaleActive ? precioMayorNum : precioFinal;
    document.getElementById('modal-price-detal').textContent = formatoMoneda.format(precioModalMostrado);

    // --- Precio al por mayor en el modal (deshabilitado) ---
    // Dejamos este bloque comentado para conservar la referencia,
    // pero la vista ya no muestra el precio mayorista.
    //
    // const priceMayorModalEl = document.getElementById('modal-price-mayor');
    // const priceMayorContainerEl = priceMayorModalEl.closest('.price-mayor-modal');
    //
    // if (precioMayorNum > 0) {
    //     priceMayorModalEl.textContent = formatoMoneda.format(precioMayorNum);
    //     priceMayorContainerEl.style.display = 'block';
    // } else {
    //     priceMayorContainerEl.style.display = 'none';
    // }

    document.getElementById('modal-product-id').value = productId;

    // Resetear campos ocultos de talla y color
    document.getElementById('selected-talla').value = '';
    document.getElementById('selected-color').value = '';

    // Ocultar aviso de selección de color al abrir modal
    const colorHintEl = document.getElementById('color-select-hint');
    if (colorHintEl) colorHintEl.classList.remove('visible');

    // Limpiar etiqueta de nombre de color del producto anterior
    const colorNameLabel = document.getElementById('color-name-label');
    if (colorNameLabel) colorNameLabel.textContent = '';

    // Resetear estado del stock display
    const stockDisplay = document.getElementById('stock-display');
    const stockText = document.getElementById('stock-text');
    const btnAddCart = document.getElementById('btn-add-cart');
    stockText.textContent = 'Selecciona talla y color';
    stockDisplay.style.color = '';
    stockDisplay.style.background = '';
    stockDisplay.style.borderColor = '';
    btnAddCart.disabled = true;
    btnAddCart.textContent = 'Agregar al carrito';
    document.getElementById('select-cantidad').value = 1;
    document.getElementById('select-cantidad').setAttribute('max', 1);
    document.getElementById('product-observation').value = '';

    // Restablecer visibilidad de sección de tallas (puede venir oculta de un modal anterior agotado)
    const tallasContainer = document.getElementById('tallas-container');
    if (tallasContainer) tallasContainer.style.display = '';

    // Obtener variaciones y tallas
    const variaciones = product.variaciones || [];
    const tallas = [...new Set(variaciones.map(v => v.talla).filter(Boolean))];
    const stockTotal = variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);

    if (stockTotal <= 0) {
        // ── Modo galería (agotado): mostrar colores para navegar imágenes ──
        if (tallasContainer) tallasContainer.style.display = 'none';
        stockText.textContent = 'Sin stock disponible';
        btnAddCart.disabled = true;
        btnAddCart.textContent = 'Agotado';
        renderGalleryColors(product);
    } else {
        // ── Flujo normal: tallas → colores con stock ──
        const esTallaUnica = (tallas.length === 0 || (tallas.length === 1 && (tallas[0] === '' || tallas[0].toLowerCase() === 'unica' || tallas[0].toLowerCase() === 'única')));
        renderSizeButtons(tallas, esTallaUnica, product);
    }

    // 📊 Tracking: Vista de producto
    analytics.trackProductView(product);

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal'));
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

    // Deshabilitar botón de finalizar si hay problemas de stock
    const btnFinalizar = document.getElementById('btn-finalizar');
    if (btnFinalizar) {
        if (productosConProblemas.length > 0) {
            btnFinalizar.disabled = true;
            btnFinalizar.title = 'Hay productos sin stock en el carrito';
        } else {
            btnFinalizar.disabled = false;
            btnFinalizar.title = '';
        }
    }

    // Mostrar advertencia si hay productos con problemas de stock
    if (productosConProblemas.length > 0) {
        const advertenciaDiv = document.createElement('div');
        advertenciaDiv.className = 'cart-stock-alert';
        advertenciaDiv.innerHTML = `
            <span class="cart-stock-icon">⚠️</span>
            <span>${productosConProblemas.map(p =>
                p.tipo === 'agotado'
                    ? `<b>${p.nombre}</b> (${p.talla}/${p.color}) se agotó`
                    : `<b>${p.nombre}</b> solo tiene ${p.stockDisponible} disponibles`
            ).join('<br>')}</span>
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

        // Populate mobile dropdown
        if (categoryDropdownMenuMobile) {
            categoryDropdownMenuMobile.innerHTML = categoryDropdownMenu.innerHTML;
        }

        console.log(`✅ ${categories.length} categorías cargadas correctamente`);
    }, (error) => {
        console.error("❌ Error al cargar categorías:", error);
        categoryDropdownMenu.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error al cargar</a></li>';
        if (categoryDropdownMenuMobile) {
            categoryDropdownMenuMobile.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error al cargar</a></li>';
        }
    });

    // Event delegation: un único listener en el contenedor padre evita la acumulación
    // de handlers duplicados cada vez que onSnapshot reconstruye el HTML interior.
    categoryDropdownMenu.addEventListener('click', (e) => {
        if (e.target.closest('.filter-group')) handleFilterClick(e);
    });
    if (categoryDropdownMenuMobile) {
        categoryDropdownMenuMobile.addEventListener('click', (e) => {
            if (e.target.closest('.filter-group')) handleFilterClick(e);
        });
    }

    document.querySelectorAll('.header-left .filter-group, .header-left-mobile .filter-group').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });

    function handleFilterClick(e) {
        e.preventDefault();
        const clickedFilter = e.target.closest('.filter-group') || e.currentTarget;

        // Ignorar el botón hamburguesa y otros toggles de dropdown sin filtro propio
        if (clickedFilter.dataset.bsToggle === 'dropdown' && !clickedFilter.dataset.filter) {
            return;
        }

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

        cachedAvailableCount = allProducts.reduce((count, p) => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0 ? count + 1 : count;
        }, 0);

        console.log(`✅ ${allProducts.length} productos cargados correctamente`);
        loadAvailableColors();
        applyFiltersAndRender();
        renderCart(); // re-validate cart stock when products change
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

    // ✅ Event delegation para clicks en tarjetas de producto (un solo listener global)
    document.getElementById('products-container').addEventListener('click', (e) => {
        // Clic en bolita de color → cambiar imagen de la tarjeta sin abrir modal
        const dot = e.target.closest('.card-color-dot');
        if (dot) {
            e.stopPropagation();
            const colorImg = dot.dataset.colorImg;
            if (colorImg) {
                const card = dot.closest('.product-card');
                const img = card?.querySelector('.product-image-wrapper img');
                if (img) img.src = colorImg;
                // Marcar punto activo
                card?.querySelectorAll('.card-color-dot').forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
            }
            return;
        }
        // Clic en el resto de la tarjeta → abrir modal
        const card = e.target.closest('.product-card');
        if (card) openProductModal(card.dataset.productId);
    });

    // ✅ Búsqueda en tiempo real
    document.getElementById('search-input').addEventListener('input', applyFiltersAndRedraw);

    let searchTimeout;
    function applyFiltersAndRedraw() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFiltersAndRender, 200);
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
                const confirmEl = document.getElementById('checkout-phone-confirm');
                if (confirmEl) confirmEl.value = clientData.celular || '';
                document.getElementById('checkout-address').value = clientData.direccion || '';
                coUpdateNextBtn1();

                if (clientData.ciudad) {
                    document.getElementById('checkout-city').value = clientData.ciudad;
                    document.getElementById('checkout-city').dispatchEvent(new Event('change'));

                    // Reflejar ciudad en los botones toggle del paso 2
                    const isMonteria = clientData.ciudad === 'Montería';
                    document.querySelectorAll('.co-city-opt').forEach(b => {
                        b.classList.toggle('active',
                            isMonteria ? b.dataset.city === 'Montería' : b.dataset.city === 'otra'
                        );
                    });
                    if (!isMonteria) {
                        const otherField = document.getElementById('co-other-city-field');
                        const cityVisible = document.getElementById('co-city-visible');
                        if (otherField) otherField.style.display = '';
                        if (cityVisible) cityVisible.value = clientData.ciudad;
                    }

                    // Cargar barrio si existe
                    if (clientData.barrio) {
                        setTimeout(() => {
                            document.getElementById('checkout-neighborhood').value = clientData.barrio;
                            coUpdateNextBtn2();
                        }, 150);
                    }
                }

                // Activar botón continuar del paso 2 con los datos cargados
                coUpdateNextBtn2();
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

    // ═══════════════════════════════════════════════════════════════
    // CHECKOUT OVERLAY — Wizard de 3 pasos, pantalla completa
    // ═══════════════════════════════════════════════════════════════

    let coCurrentStep = 1;
    const CO_TOTAL_STEPS = 3;
    const coStepLabels = ['Datos personales', 'Datos de envío', 'Pago y resumen'];

    function openCheckout() {
        // Verificar stock antes de abrir
        const hayProblemas = cart.some(item => {
            const product = productsMap.get(item.id);
            if (!product) return true;
            const v = (product.variaciones || []).find(v =>
                (v.talla || 'unica') === item.talla && (v.color || 'unico') === item.color
            );
            return !v || v.stock <= 0 || v.stock < item.cantidad;
        });
        if (hayProblemas) {
            showToast('Hay productos sin stock en el carrito. Elimínalos para continuar.', 'error', 4000);
            return;
        }

        // CRITICAL: cerrar el offcanvas del carrito PRIMERO.
        // Bootstrap pone focus-trap/inert en el offcanvas que bloquea todos los
        // inputs fuera de él, sin importar el z-index del checkout overlay.
        const cartEl = document.getElementById('cartOffcanvas');
        const cartInstance = cartEl ? (bootstrap.Offcanvas.getInstance(cartEl) || null) : null;

        function _doOpen() {
            const overlay = document.getElementById('checkout-overlay');
            if (!overlay) return;

            coGoToStep(1);

            const form = document.getElementById('checkout-form');
            const success = document.getElementById('checkout-success');
            if (form) form.style.display = '';
            if (success) success.style.display = 'none';

            renderCoOrderItems();
            updateOrderTotals();

            overlay.classList.add('co-open');
            document.body.style.overflow = 'hidden';
        }

        if (cartInstance) {
            // Esperar a que el offcanvas cierre del todo, luego abrir checkout
            cartEl.addEventListener('hidden.bs.offcanvas', function handler() {
                cartEl.removeEventListener('hidden.bs.offcanvas', handler);
                _doOpen();
            });
            cartInstance.hide();
        } else {
            _doOpen();
        }
    }

    function closeCheckout() {
        const overlay = document.getElementById('checkout-overlay');
        if (!overlay) return;
        overlay.classList.remove('co-open');
        document.body.style.overflow = '';
    }

    function coGoToStep(step) {
        // Show/hide steps with display — NO transforms near inputs (iOS Safari fix)
        document.querySelectorAll('.co-step').forEach(s => s.classList.remove('co-step-active'));
        const activeStep = document.getElementById(`co-step-${step}`);
        if (activeStep) activeStep.classList.add('co-step-active');

        coCurrentStep = step;

        // Barra de progreso
        const pct = (step / CO_TOTAL_STEPS) * 100;
        const progFill = document.getElementById('co-prog-fill');
        if (progFill) progFill.style.width = pct + '%';

        // Label
        const stepLbl = document.getElementById('co-step-lbl');
        if (stepLbl) stepLbl.textContent = coStepLabels[step - 1];

        // Botón atrás
        const backBtn = document.getElementById('co-back-btn');
        if (backBtn) backBtn.style.visibility = step > 1 ? 'visible' : 'hidden';

        // Si es paso 3, actualizar resumen
        if (step === 3) {
            renderCoOrderItems();
            updateOrderTotals();
        }
    }

    function coBack() {
        if (coCurrentStep > 1) coGoToStep(coCurrentStep - 1);
    }

    function coNext() {
        if (coCurrentStep < CO_TOTAL_STEPS) coGoToStep(coCurrentStep + 1);
    }

    // Validación paso 1: whatsapp, confirmar whatsapp, nombre, cédula
    function coIsStep1Valid() {
        const phone = (document.getElementById('checkout-phone')?.value || '').trim();
        const phoneConfirm = (document.getElementById('checkout-phone-confirm')?.value || '').trim();
        const name = (document.getElementById('checkout-name')?.value || '').trim();
        const cedula = (document.getElementById('checkout-cedula')?.value || '').trim();
        return phone.length >= 7 && phone === phoneConfirm && name.length >= 2 && cedula.length >= 4;
    }

    // Validación paso 2: ciudad + dirección requeridos; barrio si tiene barrios
    function coIsStep2Valid() {
        const ciudad = (document.getElementById('checkout-city')?.value || '').trim();
        const dir = (document.getElementById('checkout-address')?.value || '').trim();
        return ciudad.length > 0 && dir.length >= 4;
    }

    function coUpdateNextBtn1() {
        const btn = document.getElementById('co-next-1');
        if (btn) btn.disabled = !coIsStep1Valid();
    }

    function coUpdateNextBtn2() {
        // El botón siempre está activo; la validación ocurre al hacer clic
    }

    window.coNextStep2 = function() {
        const ciudad = (document.getElementById('checkout-city')?.value || '').trim();
        const dir = (document.getElementById('checkout-address')?.value || '').trim();

        if (!ciudad) {
            showToast('Selecciona una ciudad de entrega', 'error');
            return;
        }
        if (dir.length < 4) {
            showToast('Ingresa la dirección completa de entrega', 'error');
            document.getElementById('checkout-address')?.focus();
            return;
        }
        coNext();
    };

    // Auto-advance: cuando paso 1 sea válido, pasar solo al paso 2
    function coCheckAutoAdvance1() {
        if (coIsStep1Valid() && coCurrentStep === 1) {
            coGoToStep(2);
        }
    }

    // Listeners de validación en tiempo real — paso 1
    ['checkout-phone', 'checkout-phone-confirm', 'checkout-name', 'checkout-cedula'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            coUpdateNextBtn1();
        });
    });

    // Auto-advance desde confirmación de teléfono (último campo "requerido" del paso 1)
    document.getElementById('checkout-phone-confirm')?.addEventListener('input', function() {
        coUpdateNextBtn1();
        // Auto-avanzar solo si todos los campos están listos
        if (coIsStep1Valid() && coCurrentStep === 1) {
            setTimeout(() => coGoToStep(2), 350);
        }
    });

    // Listeners de validación en tiempo real — paso 2
    ['checkout-address', 'co-city-visible'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => coUpdateNextBtn2());
    });

    // Seleccionar ciudad con los botones toggle
    window.coSelectCity = function(city, btn) {
        // Activar botón
        document.querySelectorAll('.co-city-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (city === 'otra') {
            // Mostrar campo de texto libre para escribir la ciudad
            document.getElementById('co-other-city-field').style.display = '';
            document.getElementById('co-city-visible').value = '';
            document.getElementById('checkout-city').value = '';
            document.getElementById('neighborhood-section').style.display = 'none';
            setTimeout(() => document.getElementById('co-city-visible')?.focus(), 80);
        } else {
            // Montería seleccionada directamente
            document.getElementById('co-other-city-field').style.display = 'none';
            document.getElementById('checkout-city').value = city;
            document.getElementById('checkout-city').dispatchEvent(new Event('change'));
        }
        coUpdateNextBtn2();
    };

    // Sync el select visible de "otra ciudad" con el hidden checkout-city
    window.coSyncCity = function(val) {
        document.getElementById('checkout-city').value = val;
        document.getElementById('checkout-city').dispatchEvent(new Event('change'));
        coUpdateNextBtn2();
    };

    // Seleccionar método de pago con los botones de tarjeta
    window.coSelectPayment = function(method, btn) {
        document.querySelectorAll('.co-pay-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('checkout-payment').value = method;
        document.getElementById('checkout-payment').dispatchEvent(new Event('change'));
    };

    // Renderizar items del carrito en paso 3
    function renderCoOrderItems() {
        const container = document.getElementById('co-order-items');
        if (!container) return;
        if (cart.length === 0) {
            container.innerHTML = '<p class="co-empty-cart">Tu carrito está vacío</p>';
            return;
        }
        container.innerHTML = cart.map(item => `
            <div class="co-item">
                <div class="co-item-info">
                    <span class="co-item-name">${item.nombre || ''}</span>
                    <span class="co-item-detail">${item.talla ? item.talla + ' · ' : ''}${item.color ? item.color + ' · ' : ''}×${item.cantidad}</span>
                </div>
                <span class="co-item-price">${formatoMoneda.format(item.total)}</span>
            </div>
        `).join('');
    }

    // Exponer para los onclick del HTML
    window.openCheckout = openCheckout;
    window.closeCheckout = closeCheckout;
    window.coBack = coBack;
    window.coNext = coNext;

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

            // Cerrar checkout para que el usuario vea el carrito
            closeCheckout();

            return; // Cancelar la compra
        }

        // Abrir ventana en blanco ANTES del primer await para evitar bloqueo de popups en móvil
        let _waWindow = null;
        try { _waWindow = window.open('about:blank', '_blank'); } catch (_) {}

        // Construir y enviar mensaje WhatsApp AHORA (sin esperar Firebase)
        // Emojis via String.fromCodePoint para evitar problemas de encoding del archivo
        {
            const em = String.fromCodePoint;
            const E = {
                bag:   em(0x1F6CD) + '\uFE0F',  // 🛍️
                clip:  em(0x1F4CB),              // 📋
                user:  em(0x1F464),              // 👤
                phone: em(0x1F4DE),              // 📞
                id:    em(0x1F194),              // 🆔
                pin:   em(0x1F4CD),              // 📍
                cart:  em(0x1F6D2),              // 🛒
                card:  em(0x1F4B3),              // 💳
                money: em(0x1F4B0),              // 💰
                box:   em(0x1F4E6),              // 📦
                note:  em(0x1F4DD),              // 📝
            };
            const fmt = n => n.toLocaleString('es-CO');
            const localRef = Date.now().toString(36).slice(-6).toUpperCase();
            let waMsg = `${E.bag} Hola! Acabo de hacer un pedido\n\n`;
            waMsg += `${E.clip} *Pedido #${localRef}*\n`;
            waMsg += `${E.user} ${nombre}\n`;
            waMsg += `${E.phone} ${whatsapp}\n`;
            waMsg += `${E.id} Cedula: ${cedula}\n`;
            waMsg += `${E.pin} ${ciudad}`;
            if (barrio) waMsg += `, ${barrio}`;
            waMsg += `\n   ${direccion}\n\n`;
            waMsg += `${E.cart} *Productos:*\n`;
            cart.forEach(item => {
                waMsg += `\u2022 ${item.nombre} T:${item.talla} C:${item.color} x${item.cantidad} \u2014 $${fmt(item.total)}\n`;
            });
            waMsg += `\n${E.card} *Pago:* ${pago}\n`;
            waMsg += `${E.money} *Total: $${fmt(subtotal)}*`;
            if (observaciones) waMsg += `\n\n${E.note} ${observaciones}`;

            const waUrl = `https://wa.me/573046084971?text=${encodeURIComponent(waMsg)}`;
            if (_waWindow) {
                _waWindow.location.href = waUrl;
            } else {
                window.open(waUrl, '_blank');
            }
            const waBtn = document.getElementById('whatsapp-confirm-btn');
            if (waBtn) waBtn.href = waUrl;
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
                notificadoBot: false,
                timestamp: serverTimestamp(),
                origen: "web",
                tipoVenta: isWholesaleActive ? "Mayorista" : "Detal"
            };

            const docRef = await addDoc(webOrdersCollection, pedidoData);

            // Actualizar contador de ventas en cada producto del pedido
            await Promise.all(
                cart
                    .filter(item => item.id)
                    .map(item =>
                        updateDoc(doc(db, 'productos', item.id), {
                            ventas: increment(item.cantidad || 1)
                        }).catch(() => {}) // no interrumpir si falla un producto
                    )
            );

            // 📊 Tracking: Compra completada
            analytics.trackPurchase({
                orderId: docRef.id,
                totalPedido: total,
                metodoPagoSolicitado: pago,
                items: pedidoData.items
            });

            // Mostrar pantalla de éxito ANTES de cerrar — el cliente la ve de inmediato
            const checkoutForm = document.getElementById('checkout-form');
            const checkoutSuccess = document.getElementById('checkout-success');
            const continueBtn = document.getElementById('checkout-continue-btn');

            if (checkoutForm) checkoutForm.style.display = 'none';
            if (checkoutSuccess) checkoutSuccess.style.display = 'block';

            // Cerrar el offcanvas del carrito (pero NO el modal — el cliente lo cierra)
            const cartOffcanvasEl = document.getElementById('cartOffcanvas');
            const cartOffcanvasInstance = bootstrap.Offcanvas.getInstance(cartOffcanvasEl) || bootstrap.Offcanvas.getOrCreateInstance(cartOffcanvasEl);
            cartOffcanvasInstance.hide();

            // Limpiar carrito
            cart = [];
            renderCart();
            saveCart();
            document.getElementById('checkout-form').reset();

            // Al presionar "Listo" cerrar overlay y restaurar formulario
            if (continueBtn) {
                continueBtn.onclick = () => {
                    closeCheckout();
                    setTimeout(() => {
                        if (checkoutForm) checkoutForm.style.display = '';
                        if (checkoutSuccess) checkoutSuccess.style.display = 'none';
                        coGoToStep(1, false);
                    }, 350);
                };
            }

        } catch (err) {
            console.error("Error al guardar pedido: ", err);
            showToast('Error al procesar el pedido', 'error');
            // Cerrar la ventana en blanco si el pedido falló
            if (_waWindow) try { _waWindow.close(); } catch (_) {}
        }
    });

    // ✅ BÚSQUEDA INLINE EN BARRA DE NAVEGACIÓN
    const mobileNav = document.querySelector('.mobile-bottom-nav');
    const mobileNavItems = document.querySelectorAll('.nav-item');
    const navSearchInput = document.getElementById('nav-search-input');
    const nisClearBtn = document.getElementById('nis-clear');
    const navSearchSuggestions = document.getElementById('nav-search-suggestions');

    function setActiveNavItem(selectedItem) {
        mobileNavItems.forEach(item => item.classList.remove('active'));
        if (selectedItem && !selectedItem.id.includes('cart')) {
            selectedItem.classList.add('active');
        }
    }

    function openInlineSearch() {
        mobileNav.classList.add('search-active');
        setTimeout(() => navSearchInput.focus(), 80);
        setActiveNavItem(document.getElementById('mobile-search-btn'));
    }

    function closeInlineSearch() {
        mobileNav.classList.remove('search-active');
        navSearchInput.value = '';
        document.getElementById('search-input').value = '';
        nisClearBtn.style.display = 'none';
        hideSearchSuggestions();
        applyFiltersAndRender();
    }

    function hideSearchSuggestions() {
        navSearchSuggestions.classList.remove('visible');
        navSearchSuggestions.innerHTML = '';
    }

    function updateSearchSuggestions(term) {
        if (!term) { hideSearchSuggestions(); return; }
        const lowerTerm = term.toLowerCase();

        // Obtener categorías cuyo nombre coincide con el término buscado
        // En categoriesMap: catName->catId y catId->catName
        // Una clave es nombre de categoría cuando su valor (id) también mapea de vuelta a esa clave
        const matchingCategories = [];
        categoriesMap.forEach((value, key) => {
            if (
                typeof key === 'string' &&
                key.toLowerCase().includes(lowerTerm) &&
                categoriesMap.get(value) === key
            ) {
                matchingCategories.push(key);
            }
        });

        if (matchingCategories.length === 0) {
            hideSearchSuggestions();
            return;
        }

        let html = `<span class="nss-label">Categorías</span><div class="nss-categories">`;
        matchingCategories.slice(0, 8).forEach(catName => {
            html += `<button class="nss-cat-chip" data-cat="${catName}">${catName}</button>`;
        });
        html += `</div>`;

        navSearchSuggestions.innerHTML = html;
        navSearchSuggestions.classList.add('visible');

        navSearchSuggestions.querySelectorAll('.nss-cat-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const catName = chip.dataset.cat;
                // Activar el filtro de esa categoría usando la lógica existente
                document.querySelectorAll(
                    '.header-left .filter-group.active, .header-left-mobile .filter-group.active'
                ).forEach(b => b.classList.remove('active'));
                categoryDropdownButton.classList.add('active');
                categoryDropdownButton.dataset.filter = catName;
                categoryDropdownButton.innerHTML = `${catName} <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
                closeInlineSearch();
                applyFiltersAndRender();
            });
        });
    }

    document.getElementById('mobile-search-btn').addEventListener('click', openInlineSearch);
    document.getElementById('nis-back').addEventListener('click', closeInlineSearch);

    navSearchInput.addEventListener('input', (e) => {
        const term = e.target.value;
        document.getElementById('search-input').value = term;
        nisClearBtn.style.display = term ? 'flex' : 'none';
        updateSearchSuggestions(term);
        applyFiltersAndRedraw();
    });

    nisClearBtn.addEventListener('click', () => {
        navSearchInput.value = '';
        document.getElementById('search-input').value = '';
        nisClearBtn.style.display = 'none';
        hideSearchSuggestions();
        applyFiltersAndRender();
        navSearchInput.focus();
    });

    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeInlineSearch();
        }
    });

    document.getElementById('mobile-home-btn').addEventListener('click', () => {
        if (mobileNav.classList.contains('search-active')) closeInlineSearch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const disponibleBtn = document.querySelector('.filter-group[data-filter="disponible"]');
        if (disponibleBtn) disponibleBtn.click();
        setActiveNavItem(document.getElementById('mobile-home-btn'));
    });

    const wholesaleForm = document.getElementById('wholesale-form');
    if (wholesaleForm) {
        wholesaleForm.addEventListener('submit', (e) => {
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
    }

    // ═══════════════════════════════════════════════════════════════════
    // VISOR DE PANTALLA COMPLETA ESTILO SHEIN
    // ═══════════════════════════════════════════════════════════════════
    const zoomOverlay    = document.getElementById('imageZoomOverlay');
    const zoomedImage    = document.getElementById('zoomedImage');
    const closeZoomBtn   = document.getElementById('closeZoomBtn');
    const zoomCounterEl  = document.getElementById('zoomCounter');
    const zoomColorLabel = document.getElementById('zoomColorLabel');
    const zoomSwatches   = document.getElementById('zoomColorSwatches');
    const zoomAddBtn     = document.getElementById('zoomAddToCart');
    const zoomImgArea    = document.getElementById('zoomImgArea');
    const modalProductImage = document.getElementById('modal-product-image');
    const modalZoomBtn   = document.getElementById('modal-zoom-btn');

    // Índice local del visor (sincronizado con swipeGallery)
    let viewerIndex = 0;

    /** Abre el visor de pantalla completa en la imagen actualmente visible */
    function openZoom() {
        if (!zoomOverlay || !zoomedImage) return;
        const imageSrc = modalProductImage ? modalProductImage.src : '';
        if (!imageSrc) return;

        // Sincronizar con la posición actual del swipe gallery
        viewerIndex = swipeGallery.images.length ? swipeGallery.currentIndex : 0;

        renderViewerImage(viewerIndex, false);
        renderViewerSwatches();
        updateViewerAddBtn();
        zoomOverlay.classList.add('active');

        // 📊 Tracking
        const productId = document.getElementById('modal-product-id').value;
        const product = productsMap.get(productId);
        if (product) analytics.trackImageZoom(product);
    }

    /** Renderiza la imagen en el visor con animación opcional */
    function renderViewerImage(idx, animate) {
        const images = swipeGallery.images;
        const total = images.length;

        let src, colorName;
        if (total > 0) {
            const cur = images[idx];
            src = cur.url;
            colorName = cur.colorNombre || '';
        } else {
            src = modalProductImage ? modalProductImage.src : '';
            colorName = '';
        }

        if (animate) {
            zoomedImage.style.transition = 'none';
            zoomedImage.style.opacity = '0.15';
        }
        zoomedImage.src = src;
        if (animate) {
            requestAnimationFrame(() => {
                zoomedImage.style.transition = '';
                zoomedImage.style.opacity = '';
            });
        }

        // Contador
        if (zoomCounterEl) {
            zoomCounterEl.textContent = total > 1 ? `${idx + 1}/${total}` : '';
        }

        // Nombre del color
        if (zoomColorLabel) {
            zoomColorLabel.textContent = colorName || '';
        }

        // Marcar swatch activo
        if (zoomSwatches && total > 0) {
            const colorIdx = images[idx].colorIndex;
            zoomSwatches.querySelectorAll('.izoom-swatch').forEach((s, i) => {
                s.classList.toggle('active', i === colorIdx);
            });
        }
    }

    /** Navega en el visor hacia un índice dado */
    function navigateViewer(newIdx) {
        const total = swipeGallery.images.length;
        if (total === 0) return;
        newIdx = Math.max(0, Math.min(newIdx, total - 1));
        if (newIdx === viewerIndex) return;
        const prevColor = swipeGallery.images[viewerIndex]?.colorNombre;
        viewerIndex = newIdx;
        renderViewerImage(newIdx, true);
        // Sincronizar la galería del modal sin re-animar
        swipeGallery.currentIndex = newIdx;
        const cur = swipeGallery.images[newIdx];
        if (cur) {
            const mainImg = document.getElementById('modal-product-image');
            if (mainImg) mainImg.src = cur.url;
            updateSwipeCounter(newIdx, total);
            // Sincronizar botones de color del modal al cambiar de variante
            if (prevColor !== cur.colorNombre) {
                syncColorButtonSelection(cur.colorNombre);
                const selColor = document.getElementById('selected-color');
                if (selColor) selColor.value = cur.colorNombre;
                updateStockDisplay(swipeGallery.product);
                updateViewerAddBtn();
            }
        }
    }

    /** Construye los swatches de color en la barra inferior */
    function renderViewerSwatches() {
        if (!zoomSwatches) return;
        zoomSwatches.innerHTML = '';
        const product = swipeGallery.product;
        const bottomBar = document.getElementById('zoomBottomBar');
        const variantesColor = product ? (product.variantes_color || []) : [];

        if (variantesColor.length <= 1) {
            if (bottomBar) bottomBar.classList.add('no-colors');
            return;
        }
        if (bottomBar) bottomBar.classList.remove('no-colors');

        const currentColorIdx = swipeGallery.images.length
            ? swipeGallery.images[viewerIndex].colorIndex : 0;

        variantesColor.forEach((vc, i) => {
            const s = document.createElement('button');
            s.type = 'button';
            s.className = 'izoom-swatch' + (i === currentColorIdx ? ' active' : '');
            s.title = vc.nombre || `Color ${i + 1}`;
            s.setAttribute('aria-label', vc.nombre || `Color ${i + 1}`);
            if (vc.hex) s.style.background = vc.hex;
            s.addEventListener('click', () => {
                const firstIdx = swipeGallery.images.findIndex(img => img.colorIndex === i);
                if (firstIdx !== -1) navigateViewer(firstIdx);
            });
            zoomSwatches.appendChild(s);
        });

        // Scroll al swatch activo
        requestAnimationFrame(() => {
            const active = zoomSwatches.querySelector('.izoom-swatch.active');
            if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
    }

    /** Actualiza el estado visual del botón Añadir (nunca deshabilita el clic) */
    function updateViewerAddBtn() {
        if (!zoomAddBtn) return;
        const btn = document.getElementById('btn-add-cart');
        const isUnavailable = btn ? btn.disabled : false;
        zoomAddBtn.classList.toggle('unavailable', isUnavailable);
        // No se asigna .disabled para que el clic siempre funcione
    }

    // ── Eventos del visor ──

    // Abrir al clic en la imagen del modal o en el botón de zoom
    if (modalProductImage) {
        modalProductImage.addEventListener('click', (e) => {
            if (!swipeGallery.didSwipe) openZoom();
        });
    }
    if (modalZoomBtn) {
        modalZoomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openZoom();
        });
    }

    // Cerrar con botón X
    if (closeZoomBtn) {
        closeZoomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeZoom();
        });
    }

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && zoomOverlay && zoomOverlay.classList.contains('active')) closeZoom();
        if (zoomOverlay && zoomOverlay.classList.contains('active')) {
            if (e.key === 'ArrowRight') navigateViewer(viewerIndex + 1);
            if (e.key === 'ArrowLeft')  navigateViewer(viewerIndex - 1);
        }
    });

    // Botón "Añadir a la bolsa"
    if (zoomAddBtn) {
        zoomAddBtn.addEventListener('click', () => {
            const mainAddBtn = document.getElementById('btn-add-cart');
            if (mainAddBtn && !mainAddBtn.disabled) {
                closeZoom();
                setTimeout(() => mainAddBtn.click(), 220);
            } else {
                closeZoom();
                // Mostrar aviso de selección si falta talla/color
                showToast('Selecciona tu talla y color primero', 'warning');
            }
        });
    }

    // Función para cerrar el visor
    function closeZoom() {
        if (zoomOverlay) zoomOverlay.classList.remove('active');
    }

    // ── Deslizamiento táctil dentro del visor ──
    if (zoomImgArea) {
        let vzStartX = 0, vzStartY = 0;
        zoomImgArea.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            vzStartX = e.touches[0].clientX;
            vzStartY = e.touches[0].clientY;
        }, { passive: true });
        zoomImgArea.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1 || !swipeGallery.images.length) return;
            const dx = e.changedTouches[0].clientX - vzStartX;
            const dy = e.changedTouches[0].clientY - vzStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                navigateViewer(viewerIndex + (dx < 0 ? 1 : -1));
            }
        }, { passive: true });
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
