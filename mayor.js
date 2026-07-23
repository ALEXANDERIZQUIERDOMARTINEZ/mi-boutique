import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { initializeFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_TIER_GROUPS, getHybridTierInfo, resolveWholesaleGroup, buildTiersTablesHtml } from './wholesale-tiers.js';
import { getColorHex, getColorSwatchStyle, formatColorLabel } from './color-utils.js';

const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

const app = initializeApp(firebaseConfig);
// Evita que el listener en tiempo real se quede colgado en redes móviles
// o navegadores in-app que bloquean WebSockets (ver mismo fix en app.js).
const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true
});
const productsCollection = collection(db, 'productos');
const categoriesCollection = collection(db, 'categorias');

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const WHATSAPP_NUMBER = '573046084971';

// Solo las prendas de proveedor "Mishelles Boutique" entran al catálogo de
// venta al por mayor — el resto de proveedores queda restringido al detal.
function esProveedorBoutique(p) {
    return (p?.proveedor || '').trim().toLowerCase() === 'mishelles boutique';
}
const MIN_POR_PRENDA = 6;
const PRODUCTS_PER_PAGE = 30;

// productId -> [{ talla, color, cantidad }] (talla es null cuando la prenda es de talla única)
const detalleFilas = new Map();
// productId -> true si la tarjeta está colapsada (oculta su lista de colores/tallas)
const tarjetasColapsadas = new Set();
let allProducts = [];
let productsData = []; // productos ya filtrados (categoría/búsqueda) que se están mostrando
const categoriesMap = new Map(); // categoriaId <-> nombre (bidireccional, igual que app.js)
let activeFilter = 'disponible';
let searchTerm = '';
let currentPage = 1;
let bsToast = null;

const gridEl = document.getElementById('mayor-grid');
const emptyEl = document.getElementById('mayor-empty');
const finalizePanelEl = document.getElementById('mayor-finalize-panel');
const finalizeToggleBtn = document.getElementById('btn-toggle-mayor-finalize');
const waBtn = document.getElementById('btn-send-mayor-whatsapp');
const obsEl = document.getElementById('mayor-observaciones');
const totalEstimadoEl = document.getElementById('mayor-total-estimado');
const orderSummaryEl = document.getElementById('mayor-order-summary');
const tiersToggleBtn = document.getElementById('btn-toggle-tiers');
const tiersTablesEl = document.getElementById('tiers-tables');
const policyToggleBtn = document.getElementById('btn-toggle-policy');
const policyPanelEl = document.getElementById('policy-panel');
const orderProgressEl = document.getElementById('mayor-order-progress');

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

// ── Stock por prenda / talla / color ────────────────────────────────────
function getStockTotal(p) {
    return (p.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
}

function normTalla(t) {
    return (t || '').trim();
}

// Trata "unica"/"única"/vacío como "sin talla" (prendas de talla libre: fajas, bodies...)
function esTallaUnica(t) {
    const n = normTalla(t).toLowerCase();
    return !n || n === 'unica' || n === 'única';
}

// Tallas reales (no "única") que todavía tienen stock disponible.
function getTallasConStock(p) {
    const set = new Set();
    (p.variaciones || []).forEach(v => {
        if ((parseInt(v.stock, 10) || 0) > 0 && !esTallaUnica(v.talla)) set.add(normTalla(v.talla));
    });
    return [...set];
}

// Colores con stock disponible para una talla dada (o para "sin talla" si talla es null),
// junto con el stock acumulado de cada color.
function getColoresParaTalla(p, talla) {
    const map = new Map();
    (p.variaciones || []).forEach(v => {
        const stock = parseInt(v.stock, 10) || 0;
        if (stock <= 0 || !v.color) return;
        if (talla) {
            if (normTalla(v.talla) !== talla) return;
        } else if (!esTallaUnica(v.talla)) {
            return;
        }
        map.set(v.color, (map.get(v.color) || 0) + stock);
    });
    return [...map.entries()].map(([color, stock]) => ({ color, stock }));
}

// Todos los colores con stock disponible de la prenda, sumando todas las
// tallas (a diferencia de getColoresParaTalla, que filtra por una talla).
// Se usa para mostrar en la tarjeta qué colores hay antes de elegir.
function getColoresDelProducto(p) {
    const map = new Map();
    (p.variaciones || []).forEach(v => {
        const stock = parseInt(v.stock, 10) || 0;
        if (stock <= 0 || !v.color) return;
        map.set(v.color, (map.get(v.color) || 0) + stock);
    });
    return [...map.entries()].map(([color, stock]) => ({ color, stock }));
}

// Imagen principal de la tarjeta: la foto real del primer color CON STOCK
// (igual que en el catálogo al detal, index.html), y solo si ningún color
// tiene fotos cae de vuelta a imagenUrl / placeholder. Antes se usaba
// siempre imagenUrl a secas, así que las prendas cargadas únicamente con
// fotos por color (sin foto principal aparte) se veían con el placeholder
// genérico en vez de la ropa real.
function getCardImageUrl(p) {
    const variantesColor = p.variantes_color || [];
    const coloresConStock = getColoresDelProducto(p).map(c => c.color);
    for (const colorNombre of coloresConStock) {
        const vc = variantesColor.find(v => (v.nombre || '').toLowerCase().trim() === colorNombre.toLowerCase().trim());
        const imgs = (vc?.imagenes || []).filter(img => img.url);
        if (imgs.length === 0) continue;
        const sorted = [...imgs].sort((a, b) => (a.orden || 0) - (b.orden || 0));
        const frente = (sorted.find(img => img.angulo === 'frente') || sorted[0])?.url;
        if (frente) return frente;
    }
    if (p.mostrarFotoPrincipal !== false && p.imagenUrl) return p.imagenUrl;
    return 'https://placehold.co/300x400/f5e8ed/D988B9?text=Mishell';
}

function getStockCombo(p, talla, color) {
    return (p.variaciones || []).reduce((sum, v) => {
        const stock = parseInt(v.stock, 10) || 0;
        if (stock <= 0 || v.color !== color) return sum;
        if (talla) {
            if (normTalla(v.talla) !== talla) return sum;
        } else if (!esTallaUnica(v.talla)) {
            return sum;
        }
        return sum + stock;
    }, 0);
}

// Solo vendemos lo que hay disponible: si una prenda tiene varias filas (colores)
// pidiendo la MISMA talla+color, entre todas no pueden superar el stock real de esa
// combinación. Esto suma lo que ya reservaron las DEMÁS filas del mismo producto
// (excluye la fila "excludeIdx", que es la que se está evaluando/editando).
function getCantidadReservadaOtrasFilas(id, talla, color, excludeIdx) {
    const filas = detalleFilas.get(id) || [];
    return filas.reduce((sum, f, idx) => {
        if (idx === excludeIdx || f.color !== color || f.talla !== talla) return sum;
        return sum + (parseInt(f.cantidad, 10) || 0);
    }, 0);
}

// Stock que le queda disponible a ESTA fila para una combinación talla+color: el
// stock real menos lo que ya reservaron las demás filas del mismo producto.
function getStockDisponibleFila(p, talla, color, excludeIdx) {
    const stockTotal = getStockCombo(p, talla, color);
    return Math.max(0, stockTotal - getCantidadReservadaOtrasFilas(p.id, talla, color, excludeIdx));
}

// Colores que le quedan disponibles a ESTA fila para elegir (descontando lo que
// ya reservaron las demás filas del mismo producto), con su stock restante.
function getColoresDisponiblesFila(p, talla, excludeIdx) {
    return getColoresParaTalla(p, talla)
        .map(c => ({ color: c.color, stock: getStockDisponibleFila(p, talla, c.color, excludeIdx) }))
        .filter(c => c.stock > 0);
}

// Corrige/depura las filas de una prenda para que nunca superen el stock real:
// quita filas cuya talla o color ya no tengan stock, y recorta cantidades que
// entre varias filas del mismo talla+color se pasen del stock disponible.
// Devuelve true si tuvo que corregir algo (para poder avisarle al usuario).
function reconciliarFilas(p) {
    const filas = detalleFilas.get(p.id);
    if (!filas || filas.length === 0) return false;
    const tallas = getTallasConStock(p);
    const hasTallas = tallas.length > 0;
    let huboCambios = false;

    for (let i = filas.length - 1; i >= 0; i--) {
        const f = filas[i];
        const talla = hasTallas ? f.talla : null;
        if (hasTallas && !tallas.includes(talla)) {
            filas.splice(i, 1);
            huboCambios = true;
            continue;
        }
        const disponible = getStockDisponibleFila(p, talla, f.color, i);
        if (disponible <= 0) {
            filas.splice(i, 1);
            huboCambios = true;
            continue;
        }
        const cantidadActual = parseInt(f.cantidad, 10) || 0;
        if (cantidadActual > disponible) {
            f.cantidad = disponible;
            huboCambios = true;
        } else if (cantidadActual < 1) {
            f.cantidad = 1;
            huboCambios = true;
        }
    }

    if (filas.length === 0) detalleFilas.delete(p.id);
    else detalleFilas.set(p.id, filas);
    return huboCambios;
}

// Reconcilia TODAS las prendas con selección — se corre antes de renderizar, al
// llegar stock nuevo del servidor, y otra vez justo antes de enviar el pedido
// (el "informe" final debe verificar de nuevo que nada se pasó del stock real).
function reconciliarTodo() {
    let huboCambios = false;
    allProducts.forEach(p => {
        if (detalleFilas.has(p.id) && reconciliarFilas(p)) huboCambios = true;
    });
    return huboCambios;
}

// ── Cantidades / precios ─────────────────────────────────────────────────
// Política de entrega inmediata: el mínimo es de 6 PRENDAS SURTIDAS en total,
// sin necesidad de que sean de la misma referencia — a diferencia de
// encargo.html, aquí no existe un mínimo por referencia individual.
function getCantidadProducto(id) {
    const filas = detalleFilas.get(id) || [];
    return filas.reduce((sum, f) => sum + (parseInt(f.cantidad, 10) || 0), 0);
}

// Cuánto se ha elegido en TODO el pedido, sumando todas las prendas/categorías.
function getTotalGeneral() {
    let total = 0;
    allProducts.forEach(p => { total += getCantidadProducto(p.id); });
    return total;
}

// El pedido cumple el mínimo cuando el total combinado llega a 6, sin importar
// cuántas referencias distintas lo componen.
function ordenAlcanzaMinimo() {
    return getTotalGeneral() >= MIN_POR_PRENDA;
}

function totalPorGrupo(grupo) {
    let total = 0;
    allProducts.forEach(p => {
        if (resolveWholesaleGroup(p, categoriesMap) === grupo) total += getCantidadProducto(p.id);
    });
    return total;
}

// Info de precio de una prenda según cuántas hay de su categoría (totalPropio) y
// cuántas hay en TODO el pedido mezclando categorías (totalMixto). Mezclar
// referencias solo alcanza para desbloquear el primer escalón (6X); para subir a
// escalones más altos (12X, 24X...) hace falta esa cantidad dentro de la misma
// categoría. Antes de elegir nada se asume el mínimo (vitrina), para mostrar de
// una vez el precio al que se puede llegar surtiendo 6 prendas.
function getPrecioInfo(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    if (!grupo || !WHOLESALE_TIER_GROUPS[grupo]) return null;
    const totalPropio = totalPorGrupo(grupo);
    const totalMixto = Math.max(MIN_POR_PRENDA, getTotalGeneral());
    return getHybridTierInfo(grupo, totalPropio, totalMixto);
}

// Precio de mostrador: si no tiene tabla de escalones, usa el precio fijo al por mayor.
// precioMayor en 0 (o sin configurar) desde el admin significa "no se vende al por
// mayor" — aunque su categoría tenga una tabla de escalones detectada automáticamente,
// esa prenda no debe aparecer ni cotizarse al por mayor.
function getPrecioUnitario(p) {
    if ((parseFloat(p.precioMayor) || 0) <= 0) return 0;
    const info = getPrecioInfo(p);
    if (info) return info.precio;
    return parseFloat(p.precioMayor) || 0;
}

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

function calcularTotalEstimado() {
    let total = 0;
    allProducts.forEach(p => {
        const qty = getCantidadProducto(p.id);
        if (qty > 0) total += getPrecioUnitario(p) * qty;
    });
    return total;
}

// Resumen del pedido con botones para quitar una fila o toda la prenda sin
// tener que volver a subir hasta su tarjeta en la grilla (útil si el cliente
// se pasó del mínimo y quiere recortar algo directamente desde aquí).
function renderOrderSummary() {
    if (!orderSummaryEl) return;
    const productosConSeleccion = allProducts.filter(p => getCantidadProducto(p.id) > 0);
    if (productosConSeleccion.length === 0) {
        orderSummaryEl.innerHTML = '<div class="mayor-summary-empty">Aún no has elegido ninguna prenda.</div>';
        return;
    }
    let total = 0;
    let totalUnidades = 0;
    const gruposHtml = productosConSeleccion.map(p => {
        const filasConIdx = (detalleFilas.get(p.id) || [])
            .map((f, idx) => ({ f, idx }))
            .filter(({ f }) => (parseInt(f.cantidad, 10) || 0) > 0);
        const precioUnitario = getPrecioUnitario(p);
        const filasHtml = filasConIdx.map(({ f, idx }) => {
            const cantidad = parseInt(f.cantidad, 10) || 0;
            const subtotal = precioUnitario * cantidad;
            total += subtotal;
            totalUnidades += cantidad;
            const detalle = f.talla ? `${formatColorLabel(f.color)} · talla ${f.talla}` : formatColorLabel(f.color);
            return `
                <div class="mayor-summary-row">
                    <span>${detalle} × ${cantidad}</span>
                    <span class="mayor-summary-row-right">
                        <strong>${formatoMoneda.format(subtotal)}</strong>
                        <button type="button" class="mayor-summary-remove" data-id="${p.id}" data-idx="${idx}" aria-label="Quitar ${detalle} de ${p.nombre}"><i class="bi bi-x-lg"></i></button>
                    </span>
                </div>`;
        }).join('');
        return `
            <div class="mayor-summary-group">
                <div class="mayor-summary-group-name">
                    <span>${p.nombre}</span>
                    <span class="mayor-summary-group-actions">
                        <span class="mayor-summary-group-unit">${formatoMoneda.format(precioUnitario)} c/u</span>
                        <button type="button" class="mayor-summary-remove-all" data-id="${p.id}" aria-label="Quitar toda ${p.nombre}"><i class="bi bi-trash3"></i></button>
                    </span>
                </div>
                ${filasHtml}
            </div>
        `;
    }).join('');
    orderSummaryEl.innerHTML = `${gruposHtml}<div class="mayor-summary-total"><span>Total (${totalUnidades} und.)</span><strong>${formatoMoneda.format(total)}</strong></div>`;
}

if (orderSummaryEl) {
    orderSummaryEl.addEventListener('click', (e) => {
        const removeAllBtn = e.target.closest('.mayor-summary-remove-all');
        if (removeAllBtn) {
            const id = removeAllBtn.dataset.id;
            detalleFilas.delete(id);
            tarjetasColapsadas.delete(id);
            updateCardInPlace(id);
            updateProgress();
            return;
        }
        const removeBtn = e.target.closest('.mayor-summary-remove');
        if (removeBtn) {
            const id = removeBtn.dataset.id;
            const idx = parseInt(removeBtn.dataset.idx, 10);
            const filas = detalleFilas.get(id) || [];
            filas.splice(idx, 1);
            if (filas.length === 0) {
                detalleFilas.delete(id);
                tarjetasColapsadas.delete(id);
            } else {
                detalleFilas.set(id, filas);
            }
            updateCardInPlace(id);
            updateProgress();
        }
    });
}

function renderTiersTables() {
    if (!tiersTablesEl) return;
    tiersTablesEl.innerHTML = buildTiersTablesHtml();
}

// ── Filtro por categoría/búsqueda (solo prendas con stock y precio mayorista) ──
function computeVisibleProducts() {
    let list = allProducts.filter(p => p.visible !== false && getStockTotal(p) > 0 && getPrecioUnitario(p) > 0);

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
    const section = document.querySelector('.mayor-topbar');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Render de tarjetas ───────────────────────────────────────────────────
function renderFilaHtml(p, fila, idx, tallas) {
    const hasTallas = tallas.length > 0;
    const talla = hasTallas ? fila.talla : null;
    // Colores que le quedan a ESTA fila (ya descontando lo que reservaron las demás
    // filas del mismo producto); si el color actual de la fila ya no quedó en esa
    // lista (otra fila se llevó todo lo que quedaba), igual se incluye para que el
    // <select> no pierda su valor — reconciliarFilas() se encarga de quitar la fila
    // por completo en ese caso, así que aquí solo es una salvaguarda de render.
    const disponibles = getColoresDisponiblesFila(p, talla, idx);
    const stockFila = getStockDisponibleFila(p, talla, fila.color, idx);
    const colores = disponibles.some(c => c.color === fila.color)
        ? disponibles
        : [...disponibles, { color: fila.color, stock: stockFila }];

    const tallaSelectHtml = hasTallas ? `
        <select class="mayor-talla-select" data-id="${p.id}" data-idx="${idx}">
            ${tallas.map(t => `<option value="${t}" ${t === fila.talla ? 'selected' : ''}>${t}</option>`).join('')}
        </select>` : '';

    const colorSelectHtml = `
        <select class="mayor-color-select" data-id="${p.id}" data-idx="${idx}">
            ${colores.map(c => `<option value="${c.color.replace(/"/g, '&quot;')}" ${c.color === fila.color ? 'selected' : ''}>${formatColorLabel(c.color)} (${c.stock} disp.)</option>`).join('')}
        </select>`;

    return `
        <div class="mayor-color-row${hasTallas ? ' has-talla' : ''}">
            ${tallaSelectHtml}
            ${colorSelectHtml}
            <input type="number" min="1" max="${stockFila || 1}" class="mayor-color-qty" data-id="${p.id}" data-idx="${idx}" value="${fila.cantidad}">
            <button type="button" class="mayor-color-remove" data-id="${p.id}" data-idx="${idx}" aria-label="Quitar">×</button>
        </div>
    `;
}

function buildCardPriceHtml(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    const precioUnitario = getPrecioUnitario(p);
    if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
        return `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${buildTierHint(p)}</span>`;
    }
    return formatoMoneda.format(precioUnitario);
}

// Lista de bolitas de color con el nombre de cada una, para que se vea de una
// vez qué colores hay disponibles de la prenda (se compra por color, así que
// esto es lo primero que preguntan las mayoristas antes de elegir).
function buildCardColorsHtml(p) {
    const colores = getColoresDelProducto(p);
    if (colores.length === 0) return '';
    const variantesColor = p.variantes_color || [];
    const itemsHtml = colores.map(({ color }) => {
        const vc = variantesColor.find(v => (v.nombre || '').toLowerCase().trim() === color.toLowerCase().trim());
        const swatchStyle = vc ? getColorSwatchStyle(vc) : `background-color:${getColorHex(color)};`;
        return `
            <span class="mayor-card-color-item" title="${formatColorLabel(color)}">
                <span class="color-swatch-circle mayor-card-color-swatch" style="${swatchStyle}"></span>
                <span class="color-swatch-name">${formatColorLabel(color)}</span>
            </span>
        `;
    }).join('');
    return `<div class="mayor-card-colors">${itemsHtml}</div>`;
}

// HTML de la parte interactiva de la tarjeta (botón "Elegir"/filas de color):
// lo único que cambia al elegir/quitar un color, cambiar talla o colapsar.
function buildCardExtraHtml(p) {
    const filas = detalleFilas.get(p.id) || [];
    if (filas.length === 0) {
        return `<button type="button" class="mayor-add-btn" data-id="${p.id}"><i class="bi bi-plus-circle"></i> Elegir esta prenda</button>`;
    }
    const totalProducto = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);
    const colapsada = tarjetasColapsadas.has(p.id);
    const tallas = getTallasConStock(p);
    const filasHtml = filas.map((f, idx) => renderFilaHtml(p, f, idx, tallas)).join('');
    const talla = tallas.length > 0 ? tallas[0] : null;
    const usados = new Set(filas.map(f => f.color));
    const quedanColores = getColoresDisponiblesFila(p, talla, filas.length).some(c => !usados.has(c.color));
    return `
        <button type="button" class="mayor-card-toggle" data-id="${p.id}">
            <span class="mayor-card-toggle-label">${totalProducto} unidad${totalProducto === 1 ? '' : 'es'} elegida${totalProducto === 1 ? '' : 's'}</span>
            <i class="bi bi-chevron-${colapsada ? 'down' : 'up'} mayor-card-toggle-icon"></i>
        </button>
        <div class="mayor-colors-wrap"${colapsada ? ' style="display:none;"' : ''}>
            <div class="mayor-colors-list">${filasHtml}</div>
            ${quedanColores ? `<button type="button" class="mayor-add-color" data-id="${p.id}">+ Agregar otro color</button>` : ''}
        </div>
    `;
}

// Construye el nodo de UNA tarjeta completa (se usa al pintar la grilla).
function buildCardElement(p) {
    const filas = detalleFilas.get(p.id) || [];
    const img = getCardImageUrl(p);

    const card = document.createElement('div');
    card.className = 'mayor-card' + (filas.length > 0 ? ' is-selected' : '');
    card.dataset.productId = p.id;
    card.innerHTML = `
        <div class="mayor-card-img"><img src="${img}" alt="${p.nombre}" loading="lazy"></div>
        <div class="mayor-card-body">
            <h3 class="mayor-card-name">${p.nombre}</h3>
            <div class="mayor-card-price">${buildCardPriceHtml(p)}</div>
            ${buildCardColorsHtml(p)}
            <div class="mayor-card-extra">${buildCardExtraHtml(p)}</div>
        </div>
    `;
    return card;
}

// Refresca solo el precio y la parte interactiva de una tarjeta ya pintada
// (tras elegir/quitar color, cambiar talla o colapsar), sin tocar la imagen
// ni recrear el nodo de la tarjeta — así no hay parpadeo ni recarga de
// imagen en cada selección. Si la tarjeta ya no está en el DOM (cambió de
// página, se filtró, etc.) se cae de vuelta al render completo.
function updateCardInPlace(id) {
    const p = productsData.find(pp => pp.id === id);
    const cardEl = gridEl && gridEl.querySelector(`.mayor-card[data-product-id="${id}"]`);
    if (!p || !cardEl) { renderProducts(); return; }
    const filas = detalleFilas.get(id) || [];
    cardEl.classList.toggle('is-selected', filas.length > 0);
    const priceEl = cardEl.querySelector('.mayor-card-price');
    if (priceEl) priceEl.innerHTML = buildCardPriceHtml(p);
    const extraEl = cardEl.querySelector('.mayor-card-extra');
    if (extraEl) extraEl.innerHTML = buildCardExtraHtml(p);
}

function renderProducts() {
    if (!gridEl) return;
    reconciliarTodo();
    const filtered = computeVisibleProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    productsData = filtered.slice(start, start + PRODUCTS_PER_PAGE);

    if (filtered.length === 0) {
        gridEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        renderPagination(0);
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    gridEl.style.display = 'grid';
    gridEl.innerHTML = '';

    productsData.forEach(p => {
        gridEl.appendChild(buildCardElement(p));
    });

    renderPagination(filtered.length);
}

function actualizarPreciosEnVivo() {
    productsData.forEach(p => {
        const card = gridEl.querySelector(`.mayor-card[data-product-id="${p.id}"]`);
        if (!card) return;
        const filas = detalleFilas.get(p.id) || [];
        const totalProducto = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);

        const priceEl = card.querySelector('.mayor-card-price');
        if (priceEl) priceEl.innerHTML = buildCardPriceHtml(p);

        const totalEl = card.querySelector('.mayor-card-toggle-label');
        if (totalEl) {
            totalEl.textContent = `${totalProducto} unidad${totalProducto === 1 ? '' : 'es'} elegida${totalProducto === 1 ? '' : 's'}`;
        }
    });

    renderOrderSummary();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    renderOrderProgress();
}

// Mensaje de avance hacia el mínimo de 6 prendas surtidas del pedido completo.
function renderOrderProgress() {
    if (!orderProgressEl) return;
    const total = getTotalGeneral();
    if (total === 0) {
        orderProgressEl.style.display = 'none';
        orderProgressEl.textContent = '';
        return;
    }
    orderProgressEl.style.display = 'flex';
    if (total >= MIN_POR_PRENDA) {
        orderProgressEl.classList.add('is-complete');
        orderProgressEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> Mínimo alcanzado: llevas ${total} prendas surtidas.`;
    } else {
        orderProgressEl.classList.remove('is-complete');
        const faltan = MIN_POR_PRENDA - total;
        orderProgressEl.innerHTML = `<i class="bi bi-info-circle-fill"></i> Llevas ${total} de ${MIN_POR_PRENDA} prendas mínimas — te faltan ${faltan} (pueden ser de cualquier referencia).`;
    }
}

function updateProgress() {
    renderOrderSummary();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    renderOrderProgress();
    const hayAlgoSeleccionado = [...detalleFilas.values()].some(filas => filas.length > 0);
    if (finalizePanelEl) finalizePanelEl.classList.toggle('is-visible', hayAlgoSeleccionado);
}

// ── Interacción dentro de la grilla ─────────────────────────────────────
if (gridEl) {
    gridEl.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.mayor-add-btn');
        if (addBtn) {
            const p = productsData.find(pp => pp.id === addBtn.dataset.id);
            if (!p) return;
            const tallas = getTallasConStock(p);
            const talla = tallas.length > 0 ? tallas[0] : null;
            const colores = getColoresParaTalla(p, talla);
            if (colores.length === 0) {
                showToast('Sin stock disponible para esta prenda', 'warning');
                return;
            }
            detalleFilas.set(p.id, [{ talla, color: colores[0].color, cantidad: 1 }]);
            updateCardInPlace(p.id);
            updateProgress();
            return;
        }
        const addColorBtn = e.target.closest('.mayor-add-color');
        if (addColorBtn) {
            const id = addColorBtn.dataset.id;
            const p = productsData.find(pp => pp.id === id);
            if (!p) return;
            const filas = detalleFilas.get(id) || [];
            const tallas = getTallasConStock(p);
            const talla = tallas.length > 0 ? tallas[0] : null;
            // Descuenta lo que ya reservaron las filas existentes de este producto,
            // así no se puede volver a ofrecer un color que ya se agotó entre todas.
            const disponibles = getColoresDisponiblesFila(p, talla, filas.length);
            // Cada fila debe representar un color distinto: si ya hay una fila con
            // ese color, no lo vuelvas a ofrecer aunque le quede stock (para eso está
            // el campo de cantidad de esa misma fila, no una fila duplicada).
            const usados = new Set(filas.map(f => f.color));
            const colores = disponibles.filter(c => !usados.has(c.color));
            if (colores.length === 0) {
                showToast(disponibles.length === 0
                    ? 'Ya no hay más colores disponibles de esta prenda'
                    : 'Ya agregaste todos los colores disponibles de esta prenda', 'warning');
                return;
            }
            filas.push({ talla, color: colores[0].color, cantidad: 1 });
            detalleFilas.set(id, filas);
            updateCardInPlace(id);
            updateProgress();
            return;
        }
        const removeBtn = e.target.closest('.mayor-color-remove');
        if (removeBtn) {
            const id = removeBtn.dataset.id;
            const idx = parseInt(removeBtn.dataset.idx, 10);
            const filas = detalleFilas.get(id) || [];
            filas.splice(idx, 1);
            if (filas.length === 0) {
                detalleFilas.delete(id);
                tarjetasColapsadas.delete(id);
            } else {
                detalleFilas.set(id, filas);
            }
            updateCardInPlace(id);
            updateProgress();
            return;
        }
        const toggleBtn = e.target.closest('.mayor-card-toggle');
        if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            if (tarjetasColapsadas.has(id)) tarjetasColapsadas.delete(id);
            else tarjetasColapsadas.add(id);
            updateCardInPlace(id);
        }
    });

    // Cambiar talla o color reconstruye la fila (las opciones disponibles cambian),
    // pero ya no hace falta repintar toda la grilla: solo se actualiza esta tarjeta.
    gridEl.addEventListener('change', (e) => {
        const tallaSel = e.target.closest('.mayor-talla-select');
        if (tallaSel) {
            const id = tallaSel.dataset.id;
            const idx = parseInt(tallaSel.dataset.idx, 10);
            const p = productsData.find(pp => pp.id === id);
            const filas = detalleFilas.get(id);
            if (p && filas && filas[idx]) {
                filas[idx].talla = tallaSel.value;
                const colores = getColoresDisponiblesFila(p, filas[idx].talla, idx);
                filas[idx].color = colores[0]?.color || '';
                filas[idx].cantidad = Math.min(filas[idx].cantidad || 1, colores[0]?.stock || 1) || 1;
                updateCardInPlace(id);
                updateProgress();
            }
            return;
        }
        const colorSel = e.target.closest('.mayor-color-select');
        if (colorSel) {
            const id = colorSel.dataset.id;
            const idx = parseInt(colorSel.dataset.idx, 10);
            const p = productsData.find(pp => pp.id === id);
            const filas = detalleFilas.get(id);
            if (p && filas && filas[idx]) {
                filas[idx].color = colorSel.value;
                const tallas = getTallasConStock(p);
                const hasTallas = tallas.length > 0;
                const disponible = getStockDisponibleFila(p, hasTallas ? filas[idx].talla : null, filas[idx].color, idx) || 1;
                filas[idx].cantidad = Math.min(filas[idx].cantidad || 1, disponible);
                updateCardInPlace(id);
                updateProgress();
            }
        }
    });

    // La cantidad NO reconstruye la grilla en 'input' (perdería el foco del campo
    // mientras se escribe); el precio sí se recalcula en vivo con cada tecla.
    gridEl.addEventListener('input', (e) => {
        const qtyInput = e.target.closest('.mayor-color-qty');
        if (!qtyInput) return;
        const filas = detalleFilas.get(qtyInput.dataset.id);
        const idx = parseInt(qtyInput.dataset.idx, 10);
        if (filas && filas[idx]) {
            const raw = parseInt(qtyInput.value, 10);
            filas[idx].cantidad = isNaN(raw) ? 0 : raw;
            actualizarPreciosEnVivo();
        }
    });

    // Al salir del campo de cantidad, normalizamos entre 1 y el stock disponible de
    // esa combinación talla+color, sin reconstruir la grilla (ver nota en encargo.js
    // sobre por qué 'focusout' y no un render inmediato).
    gridEl.addEventListener('focusout', (e) => {
        const qtyInput = e.target.closest && e.target.closest('.mayor-color-qty');
        if (!qtyInput) return;
        const id = qtyInput.dataset.id;
        const idx = parseInt(qtyInput.dataset.idx, 10);
        const filas = detalleFilas.get(id);
        const p = productsData.find(pp => pp.id === id);
        if (filas && filas[idx] && p) {
            const tallas = getTallasConStock(p);
            const hasTallas = tallas.length > 0;
            const disponible = getStockDisponibleFila(p, hasTallas ? filas[idx].talla : null, filas[idx].color, idx) || 1;
            const val = Math.min(disponible, Math.max(1, parseInt(qtyInput.value, 10) || 1));
            filas[idx].cantidad = val;
            qtyInput.value = val;
            actualizarPreciosEnVivo();
        }
    });
}

// ── Tablas de precios / condiciones ──────────────────────────────────────
if (tiersToggleBtn) {
    tiersToggleBtn.addEventListener('click', () => {
        const isOpen = tiersTablesEl.classList.toggle('is-open');
        const label = tiersToggleBtn.querySelector('.wtiers-btn-label');
        if (label) label.textContent = isOpen ? 'Ocultar tabla' : 'Tabla de precios';
    });
}

if (policyToggleBtn) {
    policyToggleBtn.addEventListener('click', () => {
        const isOpen = policyPanelEl.classList.toggle('is-open');
        const label = policyToggleBtn.querySelector('.wtiers-btn-label');
        if (label) label.textContent = isOpen ? 'Ocultar condiciones' : 'Condiciones';
    });
}

if (finalizeToggleBtn) {
    finalizeToggleBtn.addEventListener('click', () => {
        finalizePanelEl.classList.toggle('is-collapsed');
    });
}

if (waBtn) {
    waBtn.addEventListener('click', () => {
        // Última verificación antes de armar el pedido: si el stock cambió mientras
        // se elegía, o alguna combinación de filas se pasó del disponible, se
        // corrige aquí y se le pide al cliente revisar el resumen actualizado antes
        // de volver a intentar enviarlo (nunca se envía un pedido sin re-chequear).
        if (reconciliarTodo()) {
            renderProducts();
            updateProgress();
            showToast('Ajustamos tu pedido porque algo superaba el stock disponible. Revisa el resumen y toca enviar de nuevo.', 'warning');
            return;
        }
        if (!ordenAlcanzaMinimo()) {
            const faltan = MIN_POR_PRENDA - getTotalGeneral();
            showToast(
                faltan >= MIN_POR_PRENDA
                    ? `Elige al menos ${MIN_POR_PRENDA} prendas surtidas (pueden ser de referencias distintas)`
                    : `Te faltan ${faltan} prenda${faltan === 1 ? '' : 's'} para el mínimo de ${MIN_POR_PRENDA} surtidas`,
                'warning'
            );
            return;
        }
        // Un bloque por prenda (nombre + precio/u una sola vez) y debajo sus colores/
        // tallas, en vez de una lista plana repitiendo el nombre en cada línea —
        // así se lee de un vistazo cuánto va de cada referencia.
        const productosConSeleccion = allProducts.filter(p => getCantidadProducto(p.id) > 0);
        const bloques = productosConSeleccion.map(p => {
            const filas = (detalleFilas.get(p.id) || []).filter(f => (parseInt(f.cantidad, 10) || 0) > 0);
            const precioUnitario = getPrecioUnitario(p);
            const detalleLineas = filas.map(f => {
                const cantidad = parseInt(f.cantidad, 10) || 0;
                const detalle = f.talla ? `${formatColorLabel(f.color)} (talla ${f.talla})` : formatColorLabel(f.color);
                return `   • ${detalle} x${cantidad} = ${formatoMoneda.format(precioUnitario * cantidad)}`;
            }).join('\n');
            return `🛍️ *${p.nombre}* — ${formatoMoneda.format(precioUnitario)} c/u\n${detalleLineas}`;
        });
        const observaciones = (obsEl?.value || '').trim();
        const totalEstimado = calcularTotalEstimado();
        const totalUnidades = getTotalGeneral();
        let mensaje = `¡Hola! 👋 Quiero hacer este pedido al por mayor:\n\n${bloques.join('\n\n')}\n\n———————————————\nTotal: ${totalUnidades} prenda${totalUnidades === 1 ? '' : 's'} — ${formatoMoneda.format(totalEstimado)}`;
        if (observaciones) mensaje += `\n\n📝 Observaciones: ${observaciones}`;
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

    renderProducts();
    updateProgress();
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

// ── Carga de productos ────────────────────────────────────────────────
onSnapshot(productsCollection, (snapshot) => {
    allProducts = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.visible === false) return;
        if (!esProveedorBoutique(data)) return;
        allProducts.push({ id: docSnap.id, ...data });
    });
    renderProducts();
    updateProgress();
}, (err) => {
    console.error('Error cargando productos:', err);
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) {
        emptyEl.style.display = 'block';
        const p = emptyEl.querySelector('p');
        if (p) p.textContent = 'Ocurrió un error al cargar los productos. Intenta más tarde.';
    }
});
