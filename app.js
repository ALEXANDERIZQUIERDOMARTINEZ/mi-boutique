// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
const categoriesCollection = collection(db, 'categorias'); 
const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

let bsToast = null;
let cart = [];
let productsMap = new Map();
let allProducts = [];
let activePromotions = new Map();
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
};

// ✅ FUNCIÓN: Convertir nombre de color a código hex o gradiente
function getColorHex(colorName) {
    if (!colorName) return '#9E9E9E';
    const normalized = colorName.toLowerCase().trim();

    // Primero verificar si es un color especial
    if (SPECIAL_COLORS[normalized]) {
        return SPECIAL_COLORS[normalized];
    }

    // Si no, buscar en el mapa normal
    return COLOR_MAP[normalized] || '#9E9E9E';
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
    // ✅ Leer promoción directamente del campo del producto (administrable desde admin.html)
    if (!producto.promocion || !producto.promocion.activa || isWholesaleActive) {
        return { precioFinal: producto.precioDetal, tienePromo: false };
    }

    let precioFinal = producto.precioDetal;
    if (producto.promocion.tipo === 'porcentaje') {
        precioFinal = producto.precioDetal * (1 - producto.promocion.descuento / 100);
    } else if (producto.promocion.tipo === 'fijo') {
        precioFinal = producto.promocion.precioFijo;
    }

    return {
        precioFinal: Math.max(0, precioFinal),
        tienePromo: true,
        precioOriginal: producto.precioDetal
    };
}

// ✅ FUNCIÓN DE FILTRO MEJORADA CON FILTROS AVANZADOS
function applyFiltersAndRender() {
    const activeFilterEl = document.querySelector('.filter-group.active');
    if (!activeFilterEl) return;

    const activeFilter = activeFilterEl.dataset.filter;
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const searchModalTerm = document.getElementById('search-modal-input').value.toLowerCase();
    const finalSearchTerm = searchTerm || searchModalTerm;

    let filtered = allProducts;

    // 1. Filtrar por Categoría (filtros principales del header)
    if (activeFilter === 'disponible') {
        filtered = filtered.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        });
    } else if (activeFilter === 'promocion') {
        filtered = filtered.filter(p => p.promocion?.activa && !isWholesaleActive);
    } else if (activeFilter !== 'all') {
        filtered = filtered.filter(p => {
            const categoryId = p.categoriaId || p.categoria;
            const categoryName = categoriesMap.get(categoryId) || '';
            return categoryName === activeFilter;
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

    // 3.2 Filtro por Colores
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
        filtered = filtered.filter(p => p.promocion?.activa && !isWholesaleActive);
    }

    // 4. Ordenamiento
    filtered = sortProducts(filtered, advancedFilters.sortBy);

    renderProducts(filtered);
}

// ✅ FUNCIÓN DE ORDENAMIENTO
function sortProducts(products, sortBy) {
    const sorted = [...products];

    switch (sortBy) {
        case 'price-asc':
            return sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : calculatePromotionPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : calculatePromotionPrice(b).precioFinal;
                return priceA - priceB;
            });
        case 'price-desc':
            return sorted.sort((a, b) => {
                const priceA = isWholesaleActive ? (parseFloat(a.precioMayor) || 0) : calculatePromotionPrice(a).precioFinal;
                const priceB = isWholesaleActive ? (parseFloat(b.precioMayor) || 0) : calculatePromotionPrice(b).precioFinal;
                return priceB - priceA;
            });
        case 'name-asc':
            return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
        case 'name-desc':
            return sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
        case 'newest':
        default:
            return sorted; // Ya vienen ordenados por timestamp desc
    }
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
        const imgUrl = product.imagenUrl || 'https://via.placeholder.com/300x400/f5f5f5/ccc?text=Mishell';
        const { precioFinal, tienePromo, precioOriginal } = calculatePromotionPrice(product);

        const variaciones = product.variaciones || [];
        const tallas = [...new Set(variaciones.map(v => v.talla).filter(Boolean))];
        const colores = [...new Set(variaciones.map(v => v.color).filter(Boolean))];

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

        // ✅ HTML para COLORES con círculos de color
        let coloresHTML = '';
        if (colores.length > 0) {
            const colorChips = colores.map(c => {
                const colorValue = getColorHex(c);
                const normalized = c.toLowerCase().trim();

                // Si es un color especial (gradiente), usar background-image
                const styleAttr = SPECIAL_COLORS[normalized]
                    ? `background-image: ${colorValue};`
                    : `background-color: ${colorValue};`;

                return `<span class="variation-chip color-chip"
                             style="${styleAttr}"
                             data-color-name="${c}"></span>`;
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
                        ${!isAgotado && stockTotal > 0 && stockTotal <= 5 ? '<span class="badge-stock">POCAS UNID.</span>' : ''}
                        ${isAgotado ? '<span class="badge-stock badge-agotado">AGOTADO</span>' : ''}
                        ${isSoloDetal ? '<span class="badge-stock badge-solo-detal">SOLO DETAL</span>' : ''}
                    </div>
                </div>
                <div class="product-card-body">
                    <h3 class="product-title">${product.nombre}</h3>
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
    document.getElementById('modal-product-image').src = product.imagenUrl || 'https://via.placeholder.com/500';
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
    if (tallas.length === 0 && variaciones.length > 0) {
        selectTalla.innerHTML = '<option value="unica">Única</option>';
        selectTalla.value = "unica";
    } else {
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
    } else if (tallas.length === 0) {
        selectTalla.dispatchEvent(new Event('change'));
    }

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
    if (cart.length === 0) {
        if (empty) empty.style.display = 'block';
        footer.style.display = 'none';
        badgeDesktop.textContent = '0';
        badgeMobile.textContent = '0';
        badgeDesktop.style.opacity = '0';
        badgeMobile.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    footer.style.display = 'block';
    container.innerHTML = '';
    let total = 0;
    let itemCount = 0;
    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        const observacionHtml = item.observacion ? `<small class="text-muted d-block mt-1"><i class="bi bi-chat-left-text"></i> ${item.observacion}</small>` : '';
        div.innerHTML = `
            <div class="d-flex gap-3">
                <img src="${item.imagenUrl || 'https://via.placeholder.com/70x90'}" class="cart-item-image" alt="${item.nombre}">
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

function saveCart() { localStorage.setItem('mishellCart', JSON.stringify(cart)); }
function loadCart() {
    const savedCart = localStorage.getItem('mishellCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        renderCart();
    }
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

// ✅ FUNCIÓN: Renderizar filtros de colores
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
        const hexColor = getColorHex(colorName);
        const chip = document.createElement('div');
        chip.className = 'color-filter-chip';
        chip.style.backgroundColor = hexColor;
        chip.dataset.colorName = colorName;
        chip.dataset.color = colorName;

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
            // Filtrar solo productos visibles
            if (product.visible === true) {
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

    // ✅ Botón aplicar filtros
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
        applyFiltersAndRender();
        showToast('Filtros aplicados correctamente', 'success');
    });

    // ✅ Toggle filtros móvil
    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const filtersSidebar = document.getElementById('filters-sidebar');
    if (btnToggleFilters && filtersSidebar) {
        btnToggleFilters.addEventListener('click', () => {
            filtersSidebar.classList.toggle('show');
            const isShowing = filtersSidebar.classList.contains('show');
            btnToggleFilters.innerHTML = isShowing
                ? '<i class="bi bi-x-lg"></i> Ocultar Filtros'
                : '<i class="bi bi-sliders"></i> Mostrar Filtros';
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
            cart.push({
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
            });
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
            cart.splice(itemIndex, 1);
            renderCart();
            saveCart();
            showToast('Producto eliminado del carrito', 'success');
        }
        itemToDelete = null;
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteCartModal'));
        modal.hide();
    });

    document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('checkout-name').value.trim();
        const whatsapp = document.getElementById('checkout-phone').value.trim();
        const direccion = document.getElementById('checkout-address').value.trim();
        const observaciones = document.getElementById('checkout-notes').value.trim();
        const pago = document.getElementById('checkout-payment').value;
        if (!nombre || !whatsapp || !direccion || !pago) {
            showToast('Complete todos los campos', 'error');
            return;
        }
        const total = cart.reduce((sum, item) => sum + item.total, 0);
        const pedidoData = {
            clienteNombre: nombre,
            clienteCelular: whatsapp,
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
        try {
            const docRef = await addDoc(webOrdersCollection, pedidoData);
            let mensaje = "¡Nuevo pedido desde el catálogo web!\n\n";
            mensaje += `*PEDIDO #${docRef.id.substring(0, 6).toUpperCase()}*\n\n`;
            if (isWholesaleActive) {
                mensaje += "*TIPO DE VENTA: MAYORISTA*\n\n";
            }
            mensaje += `*Cliente:* ${nombre}\n`;
            mensaje += `*WhatsApp:* ${whatsapp}\n`;
            mensaje += `*Dirección:* ${direccion}\n`;
            if(observaciones) mensaje += `*Obs:* ${observaciones}\n`;
            mensaje += `*Pago:* ${pago}\n\n`;
            mensaje += "--- *PRODUCTOS* ---\n\n";
            cart.forEach((item, i) => {
                mensaje += `${i + 1}. *${item.nombre}*\n`;
                mensaje += `   (${item.talla} / ${item.color})\n`;
                mensaje += `   ${item.cantidad} unid. x ${formatoMoneda.format(item.precio)}\n`;
                mensaje += `   *Subtotal: ${formatoMoneda.format(item.total)}*\n\n`;
            });
            mensaje += `*TOTAL PEDIDO: ${formatoMoneda.format(total)}*`;
            const url = `https://wa.me/573046084971?text=${encodeURIComponent(mensaje)}`;
            window.location.href = url;
            bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
            bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas')).hide();
            cart = [];
            renderCart();
            saveCart();
            document.getElementById('checkout-form').reset();
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
            
            applyFiltersAndRender();
            
            if (cart.length > 0) {
                showToast('Vacía tu carrito para agregar productos con precio mayorista', 'warning');
            }

        } else {
            showToast('Código incorrecto', 'error');
        }
    });

});
