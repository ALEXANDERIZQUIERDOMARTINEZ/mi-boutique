import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_TIER_GROUPS, getHybridTierInfo, resolveWholesaleGroup, buildTiersTablesHtml } from './wholesale-tiers.js';

const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productsCollection = collection(db, 'productos');
const categoriesCollection = collection(db, 'categorias');

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatoFechaEntrega = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const WHATSAPP_NUMBER = '573046084971';
const MIN_POR_PRENDA = 6;
const DIAS_ENTREGA = 8;
const PRODUCTS_PER_PAGE = 30;

// Fecha estimada de entrega: ~8 días después de confirmar el pago. Como el pago se
// hace por WhatsApp después de elegir, se calcula desde hoy como aproximación.
function calcularFechaEntrega() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + DIAS_ENTREGA);
    return fecha;
}

function formatearFechaEntrega(fecha) {
    return formatoFechaEntrega.format(fecha);
}

// productId -> [{ color, cantidad }]  (permite varios colores de la misma referencia)
const detalleColores = new Map();
// productId -> true si la tarjeta está colapsada (oculta su lista de colores)
const tarjetasColapsadas = new Set();
let allProducts = []; // todas las prendas bajo encargo (sin filtrar)
let productsData = []; // subconjunto filtrado (categoría/búsqueda) + paginado que se muestra
const categoriesMap = new Map(); // categoriaId <-> nombre (bidireccional)
let activeFilter = 'disponible';
let searchTerm = '';
let currentPage = 1;
let bsToast = null;

const gridEl = document.getElementById('encargo-grid');
const emptyEl = document.getElementById('encargo-empty');
const finalizePanelEl = document.getElementById('finalize-panel');
const finalizeToggleBtn = document.getElementById('btn-toggle-finalize');
const waBtn = document.getElementById('btn-send-whatsapp');
const obsEl = document.getElementById('encargo-observaciones');
const totalEstimadoEl = document.getElementById('total-estimado');
const orderSummaryEl = document.getElementById('order-summary');
const tiersToggleBtn = document.getElementById('btn-toggle-tiers');
const tiersTablesEl = document.getElementById('tiers-tables');
const policyToggleBtn = document.getElementById('btn-toggle-policy');
const policyPanelEl = document.getElementById('policy-panel');
const deliveryDateEl = document.getElementById('delivery-date');

function showToast(message, type = 'success') {
    const liveToastEl = document.getElementById('liveToast');
    const toastBodyEl = document.getElementById('toast-body');
    const toastIconEl = document.getElementById('toast-icon');
    if (!liveToastEl || !toastBodyEl || !window.bootstrap) return;
    if (!bsToast) bsToast = new bootstrap.Toast(liveToastEl, { delay: 2500 });
    liveToastEl.className = 'toast border-0';
    const bgClass = type === 'error' ? 'text-bg-danger' : (type === 'warning' ? 'text-bg-warning' : 'text-bg-success');
    liveToastEl.classList.add(bgClass);
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill' };
    if (toastIconEl) toastIconEl.innerHTML = `<i class="bi ${icons[type] || icons.success}"></i>`;
    toastBodyEl.textContent = message;
    bsToast.show();
}

// Cantidad total escrita para una prenda (suma de todos sus colores).
function getCantidadProducto(id) {
    const filas = detalleColores.get(id) || [];
    return filas.reduce((sum, f) => sum + (parseInt(f.cantidad, 10) || 0), 0);
}

// Solo cuenta hacia totales/precio/pedido si cumple el mínimo de 6 por prenda:
// aquí no se puede comprar por debajo de 6 unidades de una misma referencia.
function getCantidadValida(id) {
    const total = getCantidadProducto(id);
    return total >= MIN_POR_PRENDA ? total : 0;
}

// Cuántas prendas hay de UNA MISMA categoría (sin importar la referencia exacta:
// varias prendas distintas del mismo grupo suman juntas para subir de escalón).
// Recorre TODAS las prendas (no solo las de la página/filtro actual), porque una
// selección hecha en otra página o categoría también debe contar para el escalón.
function totalPorGrupo(grupo) {
    let total = 0;
    allProducts.forEach(p => {
        if (resolveWholesaleGroup(p, categoriesMap) === grupo) total += getCantidadValida(p.id);
    });
    return total;
}

// Info de precio de una prenda según cuántas hay de su categoría. Como el pedido
// mínimo ya es de 6 por referencia, el precio mostrado siempre parte del escalón
// de 6 unidades (nunca del precio "por unidad suelta"), aunque todavía no se haya
// elegido cantidad. Devuelve null si la prenda no tiene tabla de precios.
function getPrecioInfo(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    if (!grupo || !WHOLESALE_TIER_GROUPS[grupo]) return null;
    const totalPropio = Math.max(MIN_POR_PRENDA, totalPorGrupo(grupo));
    return getHybridTierInfo(grupo, totalPropio, totalPropio);
}

function getPrecioUnitario(p) {
    const info = getPrecioInfo(p);
    return info ? info.precio : (p.precioDetal || 0);
}

// Siempre muestra en lenguaje simple cuál es el PRÓXIMO precio al que se puede
// llegar (sin jerga de "Nivel NX"): a partir de cuántas unidades se consigue,
// y a cuánto queda cada una.
function buildTierHint(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    const group = WHOLESALE_TIER_GROUPS[grupo];
    if (!grupo || !group) return '';
    const info = getPrecioInfo(p);
    const nextTier = group.tiers[info.idx + 1];
    if (!nextTier) return info.idx > 0 ? 'Ya tienes el mejor precio' : '';
    const precioSiguiente = formatoMoneda.format(nextTier.precio);
    return info.idx === 0
        ? `Desde ${nextTier.min} unidades: ${precioSiguiente} c/u`
        : `Con ${nextTier.min} de esta prenda: ${precioSiguiente} c/u`;
}

// Recorre TODAS las prendas (no solo la página actual), para que el total y el
// resumen del pedido reflejen selecciones hechas en cualquier página/filtro.
function calcularTotalEstimado() {
    let total = 0;
    allProducts.forEach(p => {
        const qty = getCantidadValida(p.id);
        if (qty > 0) total += getPrecioUnitario(p) * qty;
    });
    return total;
}

// Desglose detallado del pedido: por prenda, por color, cantidad, precio unitario
// y subtotal — lo que se ve en el panel inferior antes de enviar por WhatsApp.
function renderOrderSummary() {
    if (!orderSummaryEl) return;
    const productosConSeleccion = allProducts.filter(p => getCantidadValida(p.id) > 0);
    if (productosConSeleccion.length === 0) {
        orderSummaryEl.innerHTML = '<div class="encargo-summary-empty">Aún no has elegido ninguna prenda.</div>';
        return;
    }
    let total = 0;
    let totalUnidades = 0;
    const gruposHtml = productosConSeleccion.map(p => {
        const filas = (detalleColores.get(p.id) || []).filter(f => (parseInt(f.cantidad, 10) || 0) > 0);
        const precioUnitario = getPrecioUnitario(p);
        const filasHtml = filas.map(f => {
            const cantidad = parseInt(f.cantidad, 10) || 0;
            const subtotal = precioUnitario * cantidad;
            total += subtotal;
            totalUnidades += cantidad;
            const color = (f.color || '').trim() || 'sin especificar';
            return `<div class="encargo-summary-row"><span>${color} × ${cantidad}</span><strong>${formatoMoneda.format(subtotal)}</strong></div>`;
        }).join('');
        return `
            <div class="encargo-summary-group">
                <div class="encargo-summary-group-name"><span>${p.nombre}</span><span class="encargo-summary-group-unit">${formatoMoneda.format(precioUnitario)} c/u</span></div>
                ${filasHtml}
            </div>
        `;
    }).join('');
    orderSummaryEl.innerHTML = `${gruposHtml}<div class="encargo-summary-total"><span>Total (${totalUnidades} und.)</span><strong>${formatoMoneda.format(total)}</strong></div>`;
}

function renderTiersTables() {
    if (!tiersTablesEl) return;
    tiersTablesEl.innerHTML = buildTiersTablesHtml();
}

// Filtra por categoría activa y término de búsqueda (sin paginar todavía).
function computeFilteredProducts() {
    let list = allProducts;

    if (activeFilter && activeFilter !== 'disponible' && activeFilter !== 'all') {
        list = list.filter(p => {
            const categoryValue = p.categoriaId || p.categoria;
            if (!categoryValue) return false;
            const nameFromId = categoriesMap.get(categoryValue);
            if (nameFromId === activeFilter) return true;
            if (categoryValue === activeFilter) return true;
            const idFromName = categoriesMap.get(activeFilter);
            if (categoryValue === idFromName) return true;
            return false;
        });
    }

    if (searchTerm) {
        const t = searchTerm.toLowerCase();
        list = list.filter(p =>
            (p.nombre || '').toLowerCase().includes(t) ||
            (p.descripcion || '').toLowerCase().includes(t) ||
            (p.codigo || '').toLowerCase().includes(t)
        );
    }

    return list;
}

function buildPageList(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}

function renderPagination(totalFiltrado) {
    const container = document.getElementById('pagination-container');
    if (!container) return;
    const totalPages = Math.ceil(totalFiltrado / PRODUCTS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const pages = buildPageList(currentPage, totalPages);
    let html = '<div class="pagination-wrap">';
    html += `<button class="page-btn page-btn-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
    for (const p of pages) {
        if (p === '...') {
            html += `<span class="page-ellipsis">…</span>`;
        } else {
            html += `<button class="page-btn${p === currentPage ? ' page-btn-active' : ''}" data-page="${p}">${p}</button>`;
        }
    }
    html += `<button class="page-btn page-btn-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!isNaN(page) && page >= 1 && page <= totalPages && !btn.disabled) goToPage(page);
        });
    });
}

function goToPage(page) {
    currentPage = page;
    renderProducts();
    const section = document.querySelector('.encargo-topbar');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProducts() {
    if (!gridEl) return;
    const filtered = computeFilteredProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    productsData = filtered.slice(start, start + PRODUCTS_PER_PAGE);

    if (filtered.length === 0) {
        gridEl.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            const msg = emptyEl.querySelector('p');
            if (msg) {
                msg.textContent = allProducts.length === 0
                    ? 'Por ahora no hay prendas bajo encargo disponibles. Vuelve pronto.'
                    : 'No encontramos prendas con ese filtro o búsqueda.';
            }
        }
        renderPagination(0);
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    gridEl.style.display = 'grid';
    gridEl.innerHTML = '';

    productsData.forEach(p => {
        const filas = detalleColores.get(p.id) || [];
        const totalProducto = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);
        const img = p.imagenUrl || 'https://placehold.co/300x400/f5e8ed/D988B9?text=Mishell';

        const grupo = resolveWholesaleGroup(p, categoriesMap);
        const precioUnitario = getPrecioUnitario(p);
        let precioHtml = formatoMoneda.format(precioUnitario);
        if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
            precioHtml = `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${buildTierHint(p)}</span>`;
        }

        let bodyExtra;
        if (filas.length === 0) {
            bodyExtra = `<button type="button" class="encargo-add-btn" data-id="${p.id}"><i class="bi bi-plus-circle"></i> Elegir esta prenda</button>`;
        } else {
            const colapsada = tarjetasColapsadas.has(p.id);
            const esValida = totalProducto >= MIN_POR_PRENDA;
            const filasHtml = filas.map((f, idx) => `
                <div class="encargo-color-row">
                    <input type="text" class="encargo-color-input" data-id="${p.id}" data-idx="${idx}" placeholder="Color" value="${(f.color || '').replace(/"/g, '&quot;')}">
                    <input type="number" min="1" class="encargo-color-qty" data-id="${p.id}" data-idx="${idx}" value="${f.cantidad}">
                    <button type="button" class="encargo-color-remove" data-id="${p.id}" data-idx="${idx}" aria-label="Quitar color">×</button>
                </div>
            `).join('');
            bodyExtra = `
                <button type="button" class="encargo-card-toggle" data-id="${p.id}">
                    <span class="encargo-card-toggle-label${esValida ? '' : ' is-warning'}">${esValida ? `Total: ${totalProducto} unidades` : `Mínimo ${MIN_POR_PRENDA} unidades en total`}</span>
                    <i class="bi bi-chevron-${colapsada ? 'down' : 'up'} encargo-card-toggle-icon"></i>
                </button>
                <div class="encargo-colors-wrap"${colapsada ? ' style="display:none;"' : ''}>
                    <div class="encargo-colors-list">${filasHtml}</div>
                    <button type="button" class="encargo-add-color" data-id="${p.id}">+ Agregar otro color</button>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'encargo-card' + (filas.length > 0 ? ' is-selected' : '');
        card.dataset.productId = p.id;
        card.innerHTML = `
            <div class="encargo-card-img"><img src="${img}" alt="${p.nombre}" loading="lazy"></div>
            <div class="encargo-card-body">
                <h3 class="encargo-card-name">${p.nombre}</h3>
                <div class="encargo-card-price">${precioHtml}</div>
                ${bodyExtra}
            </div>
        `;
        gridEl.appendChild(card);
    });

    renderPagination(filtered.length);
}

// Actualiza precios/totales en pantalla sin reconstruir la grilla, para que el
// precio por cantidad se refleje mientras se escribe (sin perder el foco del campo).
function actualizarPreciosEnVivo() {
    productsData.forEach(p => {
        const card = gridEl.querySelector(`.encargo-card[data-product-id="${p.id}"]`);
        if (!card) return;
        const filas = detalleColores.get(p.id) || [];
        const totalProducto = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);
        const precioUnitario = getPrecioUnitario(p);

        const priceEl = card.querySelector('.encargo-card-price');
        if (priceEl) {
            const grupo = resolveWholesaleGroup(p, categoriesMap);
            if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
                priceEl.innerHTML = `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${buildTierHint(p)}</span>`;
            } else {
                priceEl.textContent = formatoMoneda.format(precioUnitario);
            }
        }

        const totalEl = card.querySelector('.encargo-card-toggle-label');
        if (totalEl) {
            const esValida = totalProducto >= MIN_POR_PRENDA;
            totalEl.textContent = esValida ? `Total: ${totalProducto} unidades` : `Mínimo ${MIN_POR_PRENDA} unidades en total`;
            totalEl.classList.toggle('is-warning', !esValida);
        }
    });

    renderOrderSummary();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
}

function updateProgress() {
    renderOrderSummary();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    const hayAlgoSeleccionado = [...detalleColores.values()].some(filas => filas.length > 0);
    if (finalizePanelEl) finalizePanelEl.classList.toggle('is-visible', hayAlgoSeleccionado);
}

if (gridEl) {
    gridEl.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.encargo-add-btn');
        if (addBtn) {
            detalleColores.set(addBtn.dataset.id, [{ color: '', cantidad: MIN_POR_PRENDA }]);
            renderProducts();
            updateProgress();
            return;
        }
        const addColorBtn = e.target.closest('.encargo-add-color');
        if (addColorBtn) {
            const id = addColorBtn.dataset.id;
            const filas = detalleColores.get(id) || [];
            filas.push({ color: '', cantidad: 1 });
            detalleColores.set(id, filas);
            renderProducts();
            updateProgress();
            return;
        }
        const removeBtn = e.target.closest('.encargo-color-remove');
        if (removeBtn) {
            const id = removeBtn.dataset.id;
            const idx = parseInt(removeBtn.dataset.idx, 10);
            const filas = detalleColores.get(id) || [];
            filas.splice(idx, 1);
            if (filas.length === 0) {
                detalleColores.delete(id);
                tarjetasColapsadas.delete(id);
            } else {
                detalleColores.set(id, filas);
            }
            renderProducts();
            updateProgress();
            return;
        }
        const toggleBtn = e.target.closest('.encargo-card-toggle');
        if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            if (tarjetasColapsadas.has(id)) tarjetasColapsadas.delete(id);
            else tarjetasColapsadas.add(id);
            renderProducts();
        }
    });

    // Ninguno de los dos reconstruye la grilla en 'input' (perdería el foco del
    // campo mientras se escribe); el precio sí se recalcula en vivo con cada tecla.
    gridEl.addEventListener('input', (e) => {
        const colorInput = e.target.closest('.encargo-color-input');
        if (colorInput) {
            const filas = detalleColores.get(colorInput.dataset.id);
            const idx = parseInt(colorInput.dataset.idx, 10);
            if (filas && filas[idx]) filas[idx].color = colorInput.value;
            return;
        }
        const qtyInput = e.target.closest('.encargo-color-qty');
        if (qtyInput) {
            const filas = detalleColores.get(qtyInput.dataset.id);
            const idx = parseInt(qtyInput.dataset.idx, 10);
            if (filas && filas[idx]) {
                const raw = parseInt(qtyInput.value, 10);
                filas[idx].cantidad = isNaN(raw) ? 0 : raw;
                actualizarPreciosEnVivo();
            }
        }
    });

    // Al salir del campo de cantidad, solo normalizamos el valor (mínimo 1) en el
    // propio input, SIN reconstruir la grilla: si otro botón (quitar color, +color,
    // la flecha de la tarjeta) se clickea mientras el campo aún tenía foco, un
    // renderProducts() aquí lo desprendería del DOM a mitad del clic y el clic se
    // perdería en silencio. 'focusout' (a diferencia de 'blur') sí burbujea.
    gridEl.addEventListener('focusout', (e) => {
        const qtyInput = e.target.closest && e.target.closest('.encargo-color-qty');
        if (!qtyInput) return;
        const filas = detalleColores.get(qtyInput.dataset.id);
        const idx = parseInt(qtyInput.dataset.idx, 10);
        if (filas && filas[idx]) {
            const val = Math.max(1, parseInt(qtyInput.value, 10) || 1);
            filas[idx].cantidad = val;
            qtyInput.value = val;
            actualizarPreciosEnVivo();
        }
    });
}

if (tiersToggleBtn) {
    tiersToggleBtn.addEventListener('click', () => {
        const isOpen = tiersTablesEl.classList.toggle('is-open');
        const label = tiersToggleBtn.querySelector('.wtiers-btn-label');
        if (label) label.textContent = isOpen ? 'Ocultar tabla' : 'Ver tabla de precios';
    });
}

if (policyToggleBtn) {
    policyToggleBtn.addEventListener('click', () => {
        const isOpen = policyPanelEl.classList.toggle('is-open');
        const label = policyToggleBtn.querySelector('.wtiers-btn-label');
        if (label) label.textContent = isOpen ? 'Ocultar condiciones' : 'Ver condiciones completas';
    });
}

if (finalizeToggleBtn) {
    finalizeToggleBtn.addEventListener('click', () => {
        finalizePanelEl.classList.toggle('is-collapsed');
    });
}

if (waBtn) {
    waBtn.addEventListener('click', () => {
        const productosConSeleccion = allProducts.filter(p => getCantidadValida(p.id) > 0);
        if (productosConSeleccion.length === 0) {
            showToast(`Elige al menos ${MIN_POR_PRENDA} unidades de una prenda primero`, 'warning');
            return;
        }
        const lineas = [];
        productosConSeleccion.forEach(p => {
            const filas = detalleColores.get(p.id) || [];
            const precioUnitario = getPrecioUnitario(p);
            filas.forEach(f => {
                const cantidad = parseInt(f.cantidad, 10) || 0;
                if (cantidad <= 0) return;
                const color = (f.color || '').trim();
                lineas.push(`• ${p.nombre} (color: ${color || 'sin especificar'}) x${cantidad} — ${formatoMoneda.format(precioUnitario)} c/u = ${formatoMoneda.format(precioUnitario * cantidad)}`);
            });
        });
        const observaciones = (obsEl?.value || '').trim();
        const totalEstimado = calcularTotalEstimado();
        const fechaEntrega = formatearFechaEntrega(calcularFechaEntrega());
        let mensaje = `Hola! Quiero hacer un pedido bajo encargo:\n${lineas.join('\n')}\n\nTotal estimado: ${formatoMoneda.format(totalEstimado)}\nEntrega aproximada (si confirmo el pago hoy): ${fechaEntrega} (~${DIAS_ENTREGA} días después del pago)`;
        if (observaciones) mensaje += `\n\nObservaciones: ${observaciones}`;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}

renderTiersTables();
if (deliveryDateEl) deliveryDateEl.textContent = formatearFechaEntrega(calcularFechaEntrega());

// ── Categorías (dropdown desktop + menú móvil) ───────────────────────────
const categoryDropdownMenu = document.getElementById('category-dropdown-menu');
const categoryDropdownMenuMobile = document.getElementById('category-dropdown-menu-mobile');
const categoryDropdownButton = document.getElementById('category-dropdown-button');

function handleFilterClick(e) {
    e.preventDefault();
    const clickedFilter = e.target.closest('.filter-group') || e.currentTarget;
    if (clickedFilter.dataset.bsToggle === 'dropdown' && !clickedFilter.dataset.filter) return;

    document.querySelectorAll('.header-left .filter-group.active, .header-left-mobile .filter-group.active').forEach(b => b.classList.remove('active'));

    if (clickedFilter.classList.contains('dropdown-item')) {
        categoryDropdownButton.classList.add('active');
        activeFilter = clickedFilter.dataset.filter;
        categoryDropdownButton.innerHTML = `${clickedFilter.textContent.trim()} <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
    } else {
        clickedFilter.classList.add('active');
        activeFilter = clickedFilter.dataset.filter || 'disponible';
        categoryDropdownButton.classList.remove('active');
        categoryDropdownButton.removeAttribute('data-filter');
        categoryDropdownButton.innerHTML = `Categorías <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
    }

    currentPage = 1;
    renderProducts();
    updateProgress();
}

if (categoryDropdownMenu) {
    categoryDropdownMenu.addEventListener('click', (e) => {
        if (e.target.closest('.filter-group')) handleFilterClick(e);
    });
}
if (categoryDropdownMenuMobile) {
    categoryDropdownMenuMobile.addEventListener('click', (e) => {
        if (e.target.closest('.filter-group')) handleFilterClick(e);
    });
}
document.querySelectorAll('.header-left .filter-group, .header-left-mobile .filter-group').forEach(btn => {
    btn.addEventListener('click', handleFilterClick);
});

// Se necesita el nombre de la categoría para detectar el grupo de precio mayorista
// cuando el producto no tiene un grupo asignado a mano, y para poblar el filtro de
// categorías del header. Al llegar, se vuelve a renderizar por si los productos ya
// se habían cargado antes que las categorías.
onSnapshot(categoriesCollection, (snapshot) => {
    categoriesMap.clear();
    const categories = [];
    snapshot.forEach(docSnap => categories.push({ id: docSnap.id, ...docSnap.data() }));
    categories.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    categories.forEach(cat => {
        categoriesMap.set(cat.id, cat.nombre);
        categoriesMap.set(cat.nombre, cat.id);
    });

    if (categoryDropdownMenu) {
        categoryDropdownMenu.innerHTML = categories.map(cat =>
            `<li><a class="dropdown-item filter-group" href="#" data-filter="${cat.nombre}"><span>${cat.nombre}</span></a></li>`
        ).join('');
    }
    if (categoryDropdownMenuMobile) {
        categoryDropdownMenuMobile.innerHTML = categories.map(cat =>
            `<li><a class="dropdown-item filter-group" href="#" data-filter="${cat.nombre}"><span>${cat.nombre}</span></a></li>`
        ).join('');
    }

    if (allProducts.length > 0) {
        renderProducts();
        updateProgress();
    }
}, (err) => {
    console.error('Error cargando categorías:', err);
});

// ── Búsqueda (barra desktop + búsqueda inline móvil) ─────────────────────
const searchInputEl = document.getElementById('search-input');
let searchTimeout;
function applyFiltersAndRedraw() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; renderProducts(); updateProgress(); }, 200);
}
if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFiltersAndRedraw();
    });
}

const mobileNav = document.querySelector('.mobile-bottom-nav');
const mobileNavItems = document.querySelectorAll('.nav-item');
const navSearchInput = document.getElementById('nav-search-input');
const nisClearBtn = document.getElementById('nis-clear');
const navSearchSuggestions = document.getElementById('nav-search-suggestions');

function setActiveNavItem(selectedItem) {
    mobileNavItems.forEach(item => item.classList.remove('active'));
    if (selectedItem) selectedItem.classList.add('active');
}

function hideSearchSuggestions() {
    if (!navSearchSuggestions) return;
    navSearchSuggestions.classList.remove('visible');
    navSearchSuggestions.innerHTML = '';
}

function updateSearchSuggestions(term) {
    if (!navSearchSuggestions) return;
    if (!term) { hideSearchSuggestions(); return; }
    const lowerTerm = term.toLowerCase();
    const matchingCategories = [];
    categoriesMap.forEach((value, key) => {
        if (typeof key === 'string' && key.toLowerCase().includes(lowerTerm) && categoriesMap.get(value) === key) {
            matchingCategories.push(key);
        }
    });
    if (matchingCategories.length === 0) { hideSearchSuggestions(); return; }

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
            document.querySelectorAll('.header-left .filter-group.active, .header-left-mobile .filter-group.active').forEach(b => b.classList.remove('active'));
            categoryDropdownButton.classList.add('active');
            activeFilter = catName;
            categoryDropdownButton.innerHTML = `${catName} <i class="bi bi-chevron-down" style="font-size: 0.8em;"></i>`;
            closeInlineSearch();
            currentPage = 1;
            renderProducts();
            updateProgress();
        });
    });
}

function openInlineSearch() {
    if (!mobileNav) return;
    mobileNav.classList.add('search-active');
    setTimeout(() => navSearchInput?.focus(), 80);
    setActiveNavItem(document.getElementById('mobile-search-btn'));
}

function closeInlineSearch() {
    if (!mobileNav) return;
    mobileNav.classList.remove('search-active');
    if (navSearchInput) navSearchInput.value = '';
    if (searchInputEl) searchInputEl.value = '';
    searchTerm = '';
    if (nisClearBtn) nisClearBtn.style.display = 'none';
    hideSearchSuggestions();
    currentPage = 1;
    renderProducts();
    updateProgress();
}

const mobileSearchBtn = document.getElementById('mobile-search-btn');
if (mobileSearchBtn) mobileSearchBtn.addEventListener('click', openInlineSearch);
const nisBackBtn = document.getElementById('nis-back');
if (nisBackBtn) nisBackBtn.addEventListener('click', closeInlineSearch);

if (navSearchInput) {
    navSearchInput.addEventListener('input', (e) => {
        const term = e.target.value;
        searchTerm = term;
        if (searchInputEl) searchInputEl.value = term;
        if (nisClearBtn) nisClearBtn.style.display = term ? 'flex' : 'none';
        updateSearchSuggestions(term);
        applyFiltersAndRedraw();
    });
    navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeInlineSearch(); }
    });
}

if (nisClearBtn) {
    nisClearBtn.addEventListener('click', () => {
        if (navSearchInput) navSearchInput.value = '';
        if (searchInputEl) searchInputEl.value = '';
        searchTerm = '';
        nisClearBtn.style.display = 'none';
        hideSearchSuggestions();
        currentPage = 1;
        renderProducts();
        updateProgress();
        navSearchInput?.focus();
    });
}

const mobileHomeBtn = document.getElementById('mobile-home-btn');
if (mobileHomeBtn) {
    mobileHomeBtn.addEventListener('click', () => {
        if (mobileNav?.classList.contains('search-active')) closeInlineSearch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const disponibleBtn = document.querySelector('.filter-group[data-filter="disponible"]');
        if (disponibleBtn) disponibleBtn.click();
        setActiveNavItem(mobileHomeBtn);
    });
}

const q = query(productsCollection, where('bajoEncargo', '==', true));
onSnapshot(q, (snapshot) => {
    allProducts = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.visible === false) return;
        allProducts.push({ id: docSnap.id, ...data });
    });
    renderProducts();
    updateProgress();
}, (err) => {
    console.error('Error cargando productos bajo encargo:', err);
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Ocurrió un error al cargar las prendas. Intenta más tarde.';
    }
});
