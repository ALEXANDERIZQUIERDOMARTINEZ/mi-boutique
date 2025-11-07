// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// *** PASO 3: REEMPLAZA ESTO CON TU PROPIA CONFIGURACIÓN DE FIREBASE ***
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};
// ********************************************************************

// --- INICIALIZACIÓN Y VARIABLES GLOBALES ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productsCollection = collection(db, 'productos');
const webOrdersCollection = collection(db, 'pedidosWeb');
const promocionesCollection = collection(db, 'promociones');
const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

let bsToast = null;
let cart = [];
let productsMap = new Map();
let allProducts = [];
let activePromotions = new Map();
let itemToDelete = null; // Almacenará el cartItemId a eliminar
let isWholesaleActive = false; // ¡NUEVA LÓGICA MAYORISTA!
const WHOLESALE_CODE = "MISHELLMAYOR"; // El código para activar

// --- FUNCIONES PRINCIPALES ---

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
        let promosHTML = '';
        
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

                promosHTML += `
                    <div class="promotion-item" id="promo-${doc.id}">
                        <span class="promotion-badge">${promo.descuento}${promo.tipoDescuento === 'porcentaje' ? '%' : '$'} OFF</span>
                        <strong style="display: block; margin-bottom: 3px;">${promo.nombre}</strong>
                        <small style="color: var(--color-texto-claro);">Válido hasta ${fin.toLocaleDateString('es-CO')}</small>
                    </div>`;
            }
        });

        promotionsSection.style.display = hasActivePromos ? 'block' : 'none';
        promotionsContainer.innerHTML = promosHTML;
        
        filterProducts(document.querySelector('.filter-group.active').dataset.filter);
    });
}

function calculatePromotionPrice(producto) {
    const promo = activePromotions.get(producto.id);
    if (!promo || isWholesaleActive) {
        return { precioFinal: producto.precioDetal, tienePromo: false };
    }
    let precioFinal = producto.precioDetal;
    if (promo.tipo === 'porcentaje') {
        precioFinal = producto.precioDetal * (1 - promo.descuento / 100);
    } else {
        precioFinal = producto.precioDetal - promo.descuento;
    }
    return { 
        precioFinal: Math.max(0, precioFinal),
        tienePromo: true,
        precioOriginal: producto.precioDetal 
    };
}

/**
 * Renderiza la lista de productos en la página.
 */
function renderProducts(products) {
    const container = document.getElementById('products-container');
    const loading = document.getElementById('loading-products');
    
    if (loading) loading.style.display = 'none';
    container.innerHTML = ''; 

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

        const tallasHTML = tallas.length > 0 
            ? `<div class="variations-title">Tallas</div>
               <div class="variation-chips">${tallas.map(t => `<span class="variation-chip">${t}</span>`).join('')}</div>`
            : '';
        
        const coloresHTML = colores.length > 0
            ? `<div class="variations-title mt-2">Colores</div>
               <div class="variation-chips">${colores.map(c => `<span class="variation-chip">${c}</span>`).join('')}</div>`
            : '';

        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3'; 
        
        col.innerHTML = `
            <div class="product-card" data-product-id="${product.id}" data-stock="${stockTotal}">
                <div class="product-image-wrapper">
                    <img src="${imgUrl}" alt="${product.nombre}">
                    <div class="product-badges">
                        ${tienePromo ? '<span class="badge-promo">PROMO</span>' : ''}
                        ${!isAgotado && stockTotal > 0 && stockTotal <= 5 ? '<span class="badge-stock">POCAS UNID.</span>' : ''}
                        ${isAgotado ? '<span class="badge-stock" style="background-color: #777;">AGOTADO</span>' : ''}
                    </div>
                </div>
                <div class="product-card-body">
                    <h3 class="product-title">${product.nombre}</h3>
                    
                    <div class="price-detal-card">
                        ${tienePromo ? `<span class="price-detal-old-card">${formatoMoneda.format(precioOriginal)}</span>` : ''}
                        ${formatoMoneda.format(precioFinal)} (Detal)
                    </div>
                    <div class="price-mayor-card">
                        ${formatoMoneda.format(product.precioMayor)} (Mayor)
                    </div>
                    
                    <div class="product-variations">
                        ${tallasHTML}
                        ${coloresHTML}
                    </div>

                    <button class="btn btn-primary btn-sm w-100" ${isAgotado ? 'disabled' : ''}>
                        ${isAgotado ? 'Agotado' : 'Seleccionar Opciones'}
                    </button>
                </div>
            </div>
        `;
        container.appendChild(col);
    });

    // Evento en toda la tarjeta
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const stock = parseInt(e.currentTarget.dataset.stock);
            if (stock <= 0) {
                showToast('Este producto se encuentra agotado', 'warning');
                return;
            }
            
            const productId = e.currentTarget.dataset.productId;
            openProductModal(productId);
        });
    });
}


/**
 * Abre el modal de un producto específico.
 */
function openProductModal(productId) {
    const product = productsMap.get(productId);
    if (!product) return;
    
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
    document.getElementById('modal-price-mayor').textContent = formatoMoneda.format(product.precioMayor);
    document.getElementById('modal-product-id').value = productId;

    const selectTalla = document.getElementById('select-talla');
    const selectColor = document.getElementById('select-color');
    selectTalla.innerHTML = '<option value="">Seleccione Talla</option>';
    selectColor.innerHTML = '<option value="">Seleccione Color</option>';
    selectColor.disabled = true;
    document.getElementById('stock-text').textContent = 'Seleccione talla y color';
    document.getElementById('btn-add-cart').disabled = true;
    document.getElementById('select-cantidad').value = 1;
    document.getElementById('select-cantidad').setAttribute('max', 1);

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

/**
 * Renderiza el contenido del carrito.
 */
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
        div.innerHTML = `
            <div class="d-flex gap-3">
                <img src="${item.imagenUrl || 'https://via.placeholder.com/70x90'}" class="cart-item-image" alt="${item.nombre}">
                <div class="flex-grow-1">
                    <h6 class="mb-1" style="font-weight: 600; font-size: 0.9rem;">${item.nombre}</h6>
                    <small class="text-muted">${item.talla} / ${item.color}</small>
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

/**
 * Función global para abrir el modal de confirmación de eliminación.
 */
window.confirmRemoveFromCart = function(cartItemId) {
    itemToDelete = cartItemId;
    const modal = new bootstrap.Modal(document.getElementById('deleteCartModal'));
    modal.show();
};


// --- EVENT LISTENERS (Interacciones del usuario) ---

document.addEventListener('DOMContentLoaded', () => {
    const q = query(productsCollection, where("visible", "==", true), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        allProducts = [];
        productsMap.clear();

        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            allProducts.push(product);
            productsMap.set(doc.id, product);
        });

        const activeFilter = document.querySelector('.filter-group.active').dataset.filter;
        filterProducts(activeFilter);
    });

    loadPromotions();
});

document.querySelectorAll('.filter-group').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-group').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.dataset.filter;
        filterProducts(filter);
    });
});

function filterProducts(filter) {
    let filtered = allProducts;
    if (filter === 'disponible') {
        filtered = allProducts.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        });
    } else if (filter === 'promocion') {
        filtered = allProducts.filter(p => activePromotions.has(p.id) && !isWholesaleActive); // Promos solo en detal
    }
    renderProducts(filtered);
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const activeFilter = document.querySelector('.filter-group.active').dataset.filter;
    
    let baseList = allProducts;
    if (activeFilter === 'disponible') {
        baseList = allProducts.filter(p => {
            const stock = (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
            return stock > 0;
        });
    } else if (activeFilter === 'promocion') {
        baseList = allProducts.filter(p => activePromotions.has(p.id) && !isWholesaleActive);
    }
    
    const filtered = baseList.filter(p => 
        p.nombre.toLowerCase().includes(term) ||
        (p.descripcion || '').toLowerCase().includes(term)
    );
    
    renderProducts(filtered);
}
document.getElementById('search-input').addEventListener('input', handleSearch);
document.getElementById('search-modal-input').addEventListener('input', handleSearch);

// ¡NUEVO! Cierra el modal de búsqueda con 'Enter'
document.getElementById('search-modal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('close-search-modal').click();
    }
});


// --- Event Listeners del MODAL DE PRODUCTO ---

document.getElementById('select-talla').addEventListener('change', (e) => {
    const productId = document.getElementById('modal-product-id').value;
    const product = productsMap.get(productId);
    const selectedTalla = e.target.value;
    const selectColor = document.getElementById('select-color');

    if (!product || !selectedTalla) return;

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
        selectColor.dispatchEvent(new Event('change'));
    } else {
        colores.forEach(c => {
            selectColor.innerHTML += `<option value="${c}">${c}</option>`;
        });
    }
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

    if (!product || !selectedTalla || !selectedColor) return;

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

    if (!product || !talla || !color || cantidad <= 0) {
        showToast('Seleccione talla, color y cantidad', 'error');
        return;
    }

    const { precioFinal } = calculatePromotionPrice(product);
    const precioUnitarioFinal = isWholesaleActive ? product.precioMayor : precioFinal;
    
    const cartItemId = `${productId}-${talla}-${color}-${isWholesaleActive ? 'MAYOR' : 'DETAL'}`;
    
    const existing = cart.find(item => item.cartItemId === cartItemId);
    if (existing) {
        existing.cantidad += cantidad;
        existing.total = existing.cantidad * precioUnitarioFinal;
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
            imagenUrl: product.imagenUrl || ''
        });
    }

    showToast(`${product.nombre} agregado al carrito`, 'success');
    renderCart();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('productModal'));
    modal.hide();
});

// --- Event Listeners del CARRITO y CHECKOUT ---

// ¡ARREGLO BUG!
document.getElementById('confirm-delete-cart-item').addEventListener('click', () => {
    if (itemToDelete === null) return;

    const itemIndex = cart.findIndex(item => item.cartItemId === itemToDelete);
    
    if (itemIndex > -1) {
        cart.splice(itemIndex, 1);
        renderCart();
        showToast('Producto eliminado del carrito', 'success');
    }
    
    itemToDelete = null;
    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteCartModal'));
    modal.hide();
});


// ¡Con info mayorista!
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
        tipoVenta: isWholesaleActive ? "Mayorista" : "Detal" // ¡NUEVO CAMPO!
    };

    try {
        const docRef = await addDoc(webOrdersCollection, pedidoData);
        
        let mensaje = "¡Nuevo pedido desde el catálogo web!\n\n";
        mensaje += `*PEDIDO #${docRef.id.substring(0, 6).toUpperCase()}*\n\n`;
        // ¡NUEVA LÍNEA!
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
        
        // *** PASO 4: CAMBIA ESTE NÚMERO DE WHATSAPP POR EL TUYO ***
        const url = `https://wa.me/573046084971?text=${encodeURIComponent(mensaje)}`;
        // **********************************************************

        window.open(url, '_blank');

        bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
        bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas')).hide();
        
        cart = [];
        renderCart();
        document.getElementById('checkout-form').reset();
        
        showToast('Pedido enviado correctamente', 'success');

    } catch (err) {
        console.error("Error al guardar pedido: ", err);
        showToast('Error al procesar el pedido', 'error');
    }
});


// --- Lógica de NAVEGACIÓN MÓVIL ---
const searchModal = document.getElementById('searchModal');
const mobileNavItems = document.querySelectorAll('.nav-item');

function setActiveNavItem(selectedItem) {
    mobileNavItems.forEach(item => {
        item.classList.remove('active');
    });
    if (selectedItem && !selectedItem.id.includes('cart')) {
        selectedItem.classList.add('active');
    }
}

document.getElementById('mobile-search-btn').addEventListener('click', () => {
    searchModal.style.display = 'flex';
    document.getElementById('search-modal-input').focus();
    setActiveNavItem(document.getElementById('mobile-search-btn'));
});

document.getElementById('close-search-modal').addEventListener('click', () => {
    searchModal.style.display = 'none';
});

document.getElementById('mobile-home-btn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('.filter-group[data-filter="all"]').click();
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

// --- LÓGICA DE PRECIO MAYORISTA ---
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
        
        filterProducts(document.querySelector('.filter-group.active').dataset.filter);
        
        if (cart.length > 0) {
            showToast('Vacía tu carrito para agregar productos con precio mayorista', 'warning');
        }

    } else {
        showToast('Código incorrecto', 'error');
    }
});
