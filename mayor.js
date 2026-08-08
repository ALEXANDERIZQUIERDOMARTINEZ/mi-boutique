import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { initializeFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_TIER_GROUPS, getHybridTierInfo, resolveWholesaleGroup, buildTiersTablesHtml, isSurtidoGroup } from './wholesale-tiers.js';
import { getColorHex, getColorSwatchStyle, formatColorLabel } from './color-utils.js';
import { startGuideTour } from './guide-tour.js';

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
// Asesoras/asesores a los que se puede enviar el pedido por WhatsApp — el
// cliente elige uno con los radios del panel de cierre (ver #mayor-advisor-options).
const ASESORES = {
    mishell: { nombre: 'Mishell Espitia Solano', numero: '573046084971' },
    alexander: { nombre: 'Alexander Izquierdo', numero: '573017850041' }
};

// Solo las prendas de proveedor "Mishelles Boutique" entran al catálogo de
// venta al por mayor — el resto de proveedores queda restringido al detal.
function esProveedorBoutique(p) {
    return (p?.proveedor || '').trim().toLowerCase() === 'mishelles boutique';
}
const MIN_POR_PRENDA = 6;
const PRODUCTS_PER_PAGE = 30;
// A partir de aquí una prenda se marca como "poca disponibilidad" en su badge
// de stock y en el filtro rápido — ayuda al cliente a ver de un vistazo qué
// se está agotando sin tener que abrir cada color.
const LOW_STOCK_THRESHOLD = 8;

// productId -> [{ talla, color, cantidad }] (talla es null cuando la prenda es de talla única)
const detalleFilas = new Map();
let allProducts = [];
let productsData = []; // productos ya filtrados (categoría/búsqueda) que se están mostrando
const categoriesMap = new Map(); // categoriaId <-> nombre (bidireccional, igual que app.js)
let activeFilter = 'disponible';
let searchTerm = '';
let stockFilterMode = 'all'; // 'all' | 'low'
let sortMode = 'relevancia'; // 'relevancia' | 'precio-asc' | 'precio-desc' | 'stock-desc' | 'stock-asc'
let currentPage = 1;
let bsToast = null;

const gridEl = document.getElementById('mayor-grid');
const emptyEl = document.getElementById('mayor-empty');
const finalizePanelEl = document.getElementById('mayor-finalize-panel');
const finalizeToggleBtn = document.getElementById('btn-toggle-mayor-finalize');
const waBtn = document.getElementById('btn-send-mayor-whatsapp');
const obsEl = document.getElementById('mayor-observaciones');
const asesorOptionsEl = document.getElementById('mayor-advisor-options');
const totalEstimadoEl = document.getElementById('mayor-total-estimado');
const orderSummaryEl = document.getElementById('mayor-order-summary');
const tiersTablesEl = document.getElementById('tiers-tables');
const orderProgressEl = document.getElementById('mayor-order-progress');
const mobileSearchInputEl = document.getElementById('mayor-search-input-mobile');
const stockFilterEl = document.getElementById('mayor-stock-filter');
const sortSelectEl = document.getElementById('mayor-sort-select');

// ── Hojas de pantalla completa (Cómo comprar / Agregar rápido) ──────────
// Son overlays propios (position:fixed;inset:0 + clase .is-open) en vez de
// offcanvas de Bootstrap: una hoja anclada al fondo con height:auto + un
// hijo con flex:1 adentro colapsaba a una altura casi nula en Safari/iOS y
// cortaba el contenido (colores/tallas/cantidad quedaban invisibles). Al
// ocupar toda la pantalla el alto queda definido (no "auto"), sin esa
// ambigüedad.
function openFullsheet(el) {
    if (!el) return;
    el.classList.add('is-open');
}
function closeFullsheet(el) {
    if (!el) return;
    el.classList.remove('is-open');
}

const infoSheetEl = document.getElementById('mayorInfoSheet');
const infoOpenBtn = document.getElementById('btn-open-info');
const infoCloseBtn = document.getElementById('btn-close-info');
if (infoOpenBtn) infoOpenBtn.addEventListener('click', () => openFullsheet(infoSheetEl));
if (infoCloseBtn) infoCloseBtn.addEventListener('click', () => closeFullsheet(infoSheetEl));

// Los colores/tallas/cantidades de UNA prenda viven en esta hoja, no en la
// tarjeta de la grilla — la tarjeta solo muestra foto/nombre/precio y un
// botón claro que la abre. `openSheetProductId` recuerda para qué prenda
// está abierta, para poder refrescarla en vivo si el usuario ajusta
// cantidades desde otro lado (p.ej. el resumen del pedido).
const quickAddSheetEl = document.getElementById('mayorQuickAddSheet');
const mqaCloseBtn = document.getElementById('mqa-close-btn');
const mqaDoneBtn = document.getElementById('mqa-done-btn');
const mqaBodyEl = document.getElementById('mqa-body');
const mqaImgEl = document.getElementById('mqa-img');
const mqaNameEl = document.getElementById('mqa-name');
const mqaPriceEl = document.getElementById('mqa-price');
let openSheetProductId = null;

function closeQuickAddSheet() {
    closeFullsheet(quickAddSheetEl);
    openSheetProductId = null;
}
if (mqaCloseBtn) mqaCloseBtn.addEventListener('click', closeQuickAddSheet);
if (mqaDoneBtn) mqaDoneBtn.addEventListener('click', closeQuickAddSheet);

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (quickAddSheetEl?.classList.contains('is-open')) closeQuickAddSheet();
    else if (infoSheetEl?.classList.contains('is-open')) closeFullsheet(infoSheetEl);
});

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

// Todos los colores con stock disponible de la prenda, sumando todas las
// tallas. Se usa para mostrar en la tarjeta qué colores hay antes de elegir.
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

// Tallas con stock disponible para UN color específico — se usa para ofrecer,
// una vez elegido el color (tocando su bolita), solo las tallas donde ese
// color realmente tiene prendas (a diferencia de getTallasConStock, que
// mezcla todos los colores).
function getTallasParaColor(p, color) {
    const set = new Set();
    (p.variaciones || []).forEach(v => {
        const stock = parseInt(v.stock, 10) || 0;
        if (stock <= 0 || v.color !== color || esTallaUnica(v.talla)) return;
        set.add(normTalla(v.talla));
    });
    return [...set];
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

// Cuánto se ha elegido sumando SOLO los grupos "surtido" (bodys, vestidos
// largos/conjuntos y vestidos cortos básicos). Las líneas elaboradas/semi
// elaboradas/mallatex no entran aquí: llevan su conteo aparte, ver getPrecioInfo.
function totalSurtidoBasico() {
    let total = 0;
    allProducts.forEach(p => {
        const grupo = resolveWholesaleGroup(p, categoriesMap);
        if (isSurtidoGroup(grupo)) total += getCantidadProducto(p.id);
    });
    return total;
}

// Info de precio de una prenda según cuántas hay de su categoría (totalPropio) y
// cuántas hay entre los grupos básicos que participan del surtido (totalMixto).
// Mezclar referencias solo alcanza para desbloquear el primer escalón (6X), y solo
// entre bodys/vestidos largos/vestidos cortos básicos — los elaborados no se
// benefician de mezclar con básicos ni entre sí (getHybridTierInfo lo aplica según
// el flag surtido de cada grupo). Para subir a escalones más altos (12X, 24X...)
// hace falta esa cantidad dentro de la misma categoría. Antes de elegir nada se
// asume el mínimo (vitrina), para mostrar de una vez el precio al que se puede
// llegar surtiendo 6 prendas.
function getPrecioInfo(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    if (!grupo || !WHOLESALE_TIER_GROUPS[grupo]) return null;
    const totalPropio = totalPorGrupo(grupo);
    const totalMixto = Math.max(MIN_POR_PRENDA, totalSurtidoBasico());
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

    if (stockFilterMode === 'low') {
        list = list.filter(p => getStockTotal(p) <= LOW_STOCK_THRESHOLD);
    }

    return sortProducts(list);
}

function sortProducts(list) {
    switch (sortMode) {
        case 'precio-asc': return [...list].sort((a, b) => getPrecioUnitario(a) - getPrecioUnitario(b));
        case 'precio-desc': return [...list].sort((a, b) => getPrecioUnitario(b) - getPrecioUnitario(a));
        case 'stock-desc': return [...list].sort((a, b) => getStockTotal(b) - getStockTotal(a));
        case 'stock-asc': return [...list].sort((a, b) => getStockTotal(a) - getStockTotal(b));
        default: return list;
    }
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
// Bloque de UN color ya elegido: talla (si aplica, solo las que ese color
// realmente tiene) + cantidad con botones +/- estilo el resto del sitio
// (mismo lenguaje visual que el selector de cantidad del detalle al detal).
function renderFilaHtml(p, fila, idx, tallas) {
    const hasTallas = tallas.length > 0;
    const talla = hasTallas ? fila.talla : null;
    const stockFila = getStockDisponibleFila(p, talla, fila.color, idx);
    const cantidad = parseInt(fila.cantidad, 10) || 0;

    const tallasColor = hasTallas ? getTallasParaColor(p, fila.color) : [];
    const tallaPillsHtml = hasTallas ? `
        <div class="mayor-talla-pills">
            ${tallasColor.map(t => `<button type="button" class="size-color-btn mayor-talla-pill${t === fila.talla ? ' selected' : ''}" data-id="${p.id}" data-idx="${idx}" data-talla="${t.replace(/"/g, '&quot;')}">${t}</button>`).join('')}
        </div>` : '';

    const vc = (p.variantes_color || []).find(v => (v.nombre || '').toLowerCase().trim() === fila.color.toLowerCase().trim());
    const swatchStyle = vc ? getColorSwatchStyle(vc) : `background-color:${getColorHex(fila.color)};`;

    return `
        <div class="mayor-selected-item">
            <div class="mayor-selected-head">
                <span class="color-swatch-circle mayor-selected-swatch" style="${swatchStyle}"></span>
                <span class="mayor-selected-name">${formatColorLabel(fila.color)}</span>
                <button type="button" class="mayor-selected-remove" data-id="${p.id}" data-idx="${idx}" aria-label="Quitar ${formatColorLabel(fila.color)}"><i class="bi bi-x-lg"></i></button>
            </div>
            ${tallaPillsHtml}
            <div class="mayor-qty">
                <div class="mp-qty">
                    <button type="button" class="mp-qty-btn mayor-qty-minus" data-id="${p.id}" data-idx="${idx}" ${cantidad <= 1 ? 'disabled' : ''}>−</button>
                    <input type="number" min="1" max="${stockFila || 1}" class="mayor-qty-input" data-id="${p.id}" data-idx="${idx}" value="${cantidad}">
                    <button type="button" class="mp-qty-btn mayor-qty-plus" data-id="${p.id}" data-idx="${idx}" ${cantidad >= stockFila ? 'disabled' : ''}>+</button>
                </div>
                <span class="mayor-qty-stock">${stockFila} disp.</span>
            </div>
        </div>
    `;
}

// Disponibilidad total de la prenda (todos los colores/tallas sumados), para
// que se vea de un vistazo en la tarjeta sin tener que tocar cada color.
function buildStockBadgeHtml(p) {
    const stock = getStockTotal(p);
    if (stock <= 0) return '';
    const isLow = stock <= LOW_STOCK_THRESHOLD;
    const label = isLow ? `¡Últimas ${stock}!` : `${stock} disponibles`;
    return `<span class="mayor-card-stock-badge${isLow ? ' is-low' : ''}">${label}</span>`;
}

function buildCardPriceHtml(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    const precioUnitario = getPrecioUnitario(p);
    if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
        return `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${buildTierHint(p)}</span>`;
    }
    return formatoMoneda.format(precioUnitario);
}

// Bolitas de color: la manera de agregar la prenda ahora es tocar el color
// directamente (un toque la agrega, otro toque la quita), en vez de un botón
// "Elegir esta prenda" separado seguido de desplegables — así lo primero que
// el ojo ve (los colores disponibles) es también la forma de comprarlos.
// Cada color es una fila completa (no una bolita chica): se ve el nombre y
// cuántas unidades quedan sin tener que adivinar ni tocar para enterarse —
// más un resumen arriba con cuántos colores tiene la prenda en total.
function buildCardColorsHtml(p) {
    const colores = getColoresDelProducto(p);
    if (colores.length === 0) return '<p class="mayor-no-colores">Sin colores registrados — escríbenos por WhatsApp para este pedido.</p>';
    const filas = detalleFilas.get(p.id) || [];
    const seleccion = new Map(filas.map((f, idx) => [f.color, { idx, cantidad: parseInt(f.cantidad, 10) || 0 }]));
    const variantesColor = p.variantes_color || [];
    const itemsHtml = colores.map(({ color, stock }) => {
        const vc = variantesColor.find(v => (v.nombre || '').toLowerCase().trim() === color.toLowerCase().trim());
        const swatchStyle = vc ? getColorSwatchStyle(vc) : `background-color:${getColorHex(color)};`;
        const sel = seleccion.get(color);
        return `
            <button type="button" class="mayor-card-color-item mayor-swatch-btn${sel ? ' is-selected' : ''}" data-id="${p.id}" data-color="${color.replace(/"/g, '&quot;')}">
                <span class="color-swatch-circle mayor-card-color-swatch" style="${swatchStyle}"></span>
                <span class="mayor-color-row-info">
                    <span class="mayor-color-row-name">${formatColorLabel(color)}</span>
                    <span class="mayor-color-row-stock">${stock} disponible${stock === 1 ? '' : 's'}</span>
                </span>
                ${sel ? `<span class="mayor-swatch-badge">${sel.cantidad}</span>` : '<i class="bi bi-plus-lg mayor-color-row-add"></i>'}
            </button>
        `;
    }).join('');
    const resumen = `<p class="mayor-colors-summary">${colores.length} color${colores.length === 1 ? '' : 'es'} disponible${colores.length === 1 ? '' : 's'}</p>`;
    return `${resumen}<div class="mayor-card-colors">${itemsHtml}</div>`;
}

// HTML de la parte interactiva de la tarjeta: lo único que cambia al elegir/
// quitar un color, cambiar talla o tocar +/-. Sin curtain que expandir: cada
// color elegido siempre se ve con su talla y cantidad, listas para ajustar.
function buildCardExtraHtml(p) {
    const filas = detalleFilas.get(p.id) || [];
    if (filas.length === 0) {
        if (getColoresDelProducto(p).length === 0) return '';
        return `<p class="mayor-add-hint">👆 Toca un color para agregarlo a tu pedido</p>`;
    }
    const totalProducto = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);
    const tallas = getTallasConStock(p);
    const filasHtml = filas.map((f, idx) => renderFilaHtml(p, f, idx, tallas)).join('');
    return `
        <div class="mayor-card-toggle-label">${totalProducto} unidad${totalProducto === 1 ? '' : 'es'} elegida${totalProducto === 1 ? '' : 's'}</div>
        <div class="mayor-selected-list">${filasHtml}</div>
    `;
}

// Botón de acción de la tarjeta: "+ Agregar" cuando no hay nada elegido de
// esta prenda, o un resumen "X unidades agregadas · Editar" una vez que sí
// hay algo — en ambos casos, tocarlo abre la hoja de agregar rápido. Es la
// única forma de comprar visible en la grilla (antes había que descubrir
// que se podía tocar directamente un color).
function buildCardActionHtml(p) {
    if (getColoresDelProducto(p).length === 0) {
        return '<p class="mayor-no-colores">Sin colores registrados — escríbenos por WhatsApp para este pedido.</p>';
    }
    const filas = detalleFilas.get(p.id) || [];
    const total = filas.reduce((s, f) => s + (parseInt(f.cantidad, 10) || 0), 0);
    if (total === 0) {
        return `<button type="button" class="mayor-add-btn" data-id="${p.id}"><i class="bi bi-plus-lg"></i> Agregar</button>`;
    }
    return `
        <button type="button" class="mayor-add-btn is-added" data-id="${p.id}">
            <span class="mayor-add-btn-count">${total} unidad${total === 1 ? '' : 'es'} agregada${total === 1 ? '' : 's'}</span>
            <span class="mayor-add-btn-edit">Editar <i class="bi bi-pencil-fill"></i></span>
        </button>`;
}

// Construye el nodo de UNA tarjeta completa (se usa al pintar la grilla).
// Vista previa de colores directo en la tarjeta de la grilla — el nombre de
// cada color, no solo una bolita, para que se vea sin tener que abrir la
// hoja de agregar. Es solo informativa (un toque abre la misma hoja que el
// botón "Agregar"); la selección real ocurre ahí.
function buildCardColorsPreviewHtml(p) {
    const colores = getColoresDelProducto(p);
    if (colores.length === 0) return '';
    const variantesColor = p.variantes_color || [];
    const chipsHtml = colores.map(({ color }) => {
        const vc = variantesColor.find(v => (v.nombre || '').toLowerCase().trim() === color.toLowerCase().trim());
        const swatchStyle = vc ? getColorSwatchStyle(vc) : `background-color:${getColorHex(color)};`;
        return `<span class="mayor-card-color-chip"><span class="color-swatch-circle mayor-card-color-chip-swatch" style="${swatchStyle}"></span>${formatColorLabel(color)}</span>`;
    }).join('');
    return `<div class="mayor-card-colors-preview" data-id="${p.id}">${chipsHtml}</div>`;
}

function buildCardElement(p) {
    const filas = detalleFilas.get(p.id) || [];
    const img = getCardImageUrl(p);

    const card = document.createElement('div');
    card.className = 'mayor-card' + (filas.length > 0 ? ' is-selected' : '');
    card.dataset.productId = p.id;
    card.innerHTML = `
        <div class="mayor-card-img">${buildStockBadgeHtml(p)}<img src="${img}" alt="${p.nombre}" loading="lazy"></div>
        <div class="mayor-card-body">
            <h3 class="mayor-card-name">${p.nombre}</h3>
            <div class="mayor-card-price">${buildCardPriceHtml(p)}</div>
            ${buildCardColorsPreviewHtml(p)}
            <div class="mayor-card-action">${buildCardActionHtml(p)}</div>
        </div>
    `;
    return card;
}

// Refresca el contenido de la hoja de agregar rápido para una prenda —
// reutiliza las mismas piezas (colores + lista de elegidos) que antes vivían
// directo en la tarjeta.
function renderQuickAddSheet(id) {
    const p = allProducts.find(pp => pp.id === id);
    if (!p || !mqaBodyEl) return;
    if (mqaImgEl) mqaImgEl.src = getCardImageUrl(p);
    if (mqaNameEl) mqaNameEl.textContent = p.nombre;
    if (mqaPriceEl) mqaPriceEl.innerHTML = buildCardPriceHtml(p);
    mqaBodyEl.innerHTML = buildCardColorsHtml(p) + buildCardExtraHtml(p);

    // Cuantos más colores/tallas haya que mostrar, menos espacio le
    // dejamos a la foto — así todo sigue cabiendo sin necesidad de
    // deslizar la pantalla.
    const colores = getColoresDelProducto(p);
    const filas = detalleFilas.get(p.id) || [];
    const isCompact = (colores.length + filas.length) > 3;
    if (quickAddSheetEl) quickAddSheetEl.classList.toggle('is-compact', isCompact);
}

function openQuickAddSheet(id) {
    if (!quickAddSheetEl || !mqaBodyEl) return;
    openSheetProductId = id;
    renderQuickAddSheet(id);
    openFullsheet(quickAddSheetEl);
}

// Refresca la tarjeta de la grilla (precio + botón) y, si la hoja de agregar
// rápido está abierta para esta misma prenda, también su contenido — tras
// elegir/quitar un color, cambiar talla o tocar +/-. Si la tarjeta ya no
// está en el DOM (cambió de página, se filtró, etc.) se cae de vuelta al
// render completo.
function updateCardInPlace(id) {
    const p = productsData.find(pp => pp.id === id) || allProducts.find(pp => pp.id === id);
    const cardEl = gridEl && gridEl.querySelector(`.mayor-card[data-product-id="${id}"]`);
    if (!p) { renderProducts(); return; }
    if (cardEl) {
        const filas = detalleFilas.get(id) || [];
        cardEl.classList.toggle('is-selected', filas.length > 0);
        const priceEl = cardEl.querySelector('.mayor-card-price');
        if (priceEl) priceEl.innerHTML = buildCardPriceHtml(p);
        const actionEl = cardEl.querySelector('.mayor-card-action');
        if (actionEl) actionEl.innerHTML = buildCardActionHtml(p);
    }
    if (openSheetProductId === id) renderQuickAddSheet(id);
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

// Se llama en cada tecla mientras se escribe una cantidad en la hoja de
// agregar rápido: como el campo de texto vive en la hoja (no en la
// tarjeta), es seguro reconstruir el precio/botón de TODAS las tarjetas de
// la grilla sin perder el foco — solo el encabezado de precio de la hoja se
// actualiza aquí, nunca su cuerpo (eso sí perdería el foco del campo).
function actualizarPreciosEnVivo() {
    productsData.forEach(p => {
        const card = gridEl.querySelector(`.mayor-card[data-product-id="${p.id}"]`);
        if (!card) return;
        const priceEl = card.querySelector('.mayor-card-price');
        if (priceEl) priceEl.innerHTML = buildCardPriceHtml(p);
        const actionEl = card.querySelector('.mayor-card-action');
        if (actionEl) actionEl.innerHTML = buildCardActionHtml(p);
    });

    if (openSheetProductId) {
        const p = allProducts.find(pp => pp.id === openSheetProductId);
        if (p && mqaPriceEl) mqaPriceEl.innerHTML = buildCardPriceHtml(p);
    }

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
    const pct = Math.min(100, Math.round((total / MIN_POR_PRENDA) * 100));
    const complete = total >= MIN_POR_PRENDA;
    orderProgressEl.classList.toggle('is-complete', complete);
    const texto = complete
        ? `<i class="bi bi-check-circle-fill"></i> Mínimo alcanzado: llevas ${total} prendas surtidas.`
        : `<i class="bi bi-info-circle-fill"></i> Llevas ${total} de ${MIN_POR_PRENDA} prendas mínimas — te faltan ${MIN_POR_PRENDA - total} (pueden ser de cualquier referencia).`;
    orderProgressEl.innerHTML = `
        <div class="mayor-order-progress-text">${texto}</div>
        <div class="mayor-progress-track"><div class="mayor-progress-fill" style="width:${pct}%"></div></div>
    `;
}

function updateProgress() {
    renderOrderSummary();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    renderOrderProgress();
    const hayAlgoSeleccionado = [...detalleFilas.values()].some(filas => filas.length > 0);
    if (finalizePanelEl) finalizePanelEl.classList.toggle('is-visible', hayAlgoSeleccionado);
}

// ── Visor de pantalla completa para ampliar la foto de la prenda ────────
const mayorZoomOverlay = document.getElementById('mayorZoomOverlay');
const mayorZoomedImage = document.getElementById('mayorZoomedImage');
const mayorZoomName = document.getElementById('mayorZoomName');
const mayorCloseZoomBtn = document.getElementById('mayorCloseZoomBtn');
const mayorZoomImgArea = document.getElementById('mayorZoomImgArea');

function openMayorZoom(src, nombre) {
    if (!mayorZoomOverlay || !mayorZoomedImage || !src) return;
    mayorZoomedImage.src = src;
    if (mayorZoomName) mayorZoomName.textContent = nombre || '';
    mayorZoomOverlay.classList.add('active');
}
function closeMayorZoom() {
    if (mayorZoomOverlay) mayorZoomOverlay.classList.remove('active');
}
if (mayorCloseZoomBtn) mayorCloseZoomBtn.addEventListener('click', closeMayorZoom);
if (mayorZoomImgArea) {
    // Cerrar al tocar fuera de la imagen (el área tiene padding alrededor).
    mayorZoomImgArea.addEventListener('click', (e) => {
        if (e.target === mayorZoomImgArea) closeMayorZoom();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mayorZoomOverlay && mayorZoomOverlay.classList.contains('active')) closeMayorZoom();
});

// ── Interacción dentro de la grilla: solo ampliar foto y abrir la hoja ──
if (gridEl) {
    gridEl.addEventListener('click', (e) => {
        const zoomImg = e.target.closest('.mayor-card-img img');
        if (zoomImg) {
            const card = zoomImg.closest('.mayor-card');
            const p = card ? productsData.find(pp => pp.id === card.dataset.productId) : null;
            openMayorZoom(zoomImg.src, p ? p.nombre : '');
            return;
        }
        const addBtn = e.target.closest('.mayor-add-btn');
        if (addBtn) {
            openQuickAddSheet(addBtn.dataset.id);
            return;
        }
        const colorsPreview = e.target.closest('.mayor-card-colors-preview');
        if (colorsPreview) {
            openQuickAddSheet(colorsPreview.dataset.id);
        }
    });
}

// ── Interacción dentro de la hoja de agregar rápido (colores/tallas/cantidad) ──
// Usa `allProducts` (no `productsData`) porque la prenda de la hoja puede no
// estar en la página actualmente pintada.
if (mqaBodyEl) {
    mqaBodyEl.addEventListener('click', (e) => {
        // Tocar la bolita de un color la agrega al pedido (cantidad 1, con la
        // primera talla que ese color tenga en stock); tocar una ya elegida la
        // quita.
        const swatchBtn = e.target.closest('.mayor-swatch-btn');
        if (swatchBtn) {
            const id = swatchBtn.dataset.id;
            const color = swatchBtn.dataset.color;
            const p = allProducts.find(pp => pp.id === id);
            if (!p) return;
            const filas = detalleFilas.get(id) || [];
            const idxExistente = filas.findIndex(f => f.color === color);
            if (idxExistente >= 0) {
                filas.splice(idxExistente, 1);
                if (filas.length === 0) detalleFilas.delete(id);
                else detalleFilas.set(id, filas);
            } else {
                const tallas = getTallasConStock(p);
                const tallasColor = tallas.length > 0 ? getTallasParaColor(p, color) : [];
                const talla = tallas.length > 0 ? (tallasColor[0] || tallas[0]) : null;
                const stockDisp = getStockDisponibleFila(p, talla, color, filas.length);
                if (stockDisp <= 0) {
                    showToast('Sin stock disponible para este color', 'warning');
                    return;
                }
                filas.push({ talla, color, cantidad: 1 });
                detalleFilas.set(id, filas);
            }
            updateCardInPlace(id);
            updateProgress();
            return;
        }
        const removeBtn = e.target.closest('.mayor-selected-remove');
        if (removeBtn) {
            const id = removeBtn.dataset.id;
            const idx = parseInt(removeBtn.dataset.idx, 10);
            const filas = detalleFilas.get(id) || [];
            filas.splice(idx, 1);
            if (filas.length === 0) {
                detalleFilas.delete(id);
            } else {
                detalleFilas.set(id, filas);
            }
            updateCardInPlace(id);
            updateProgress();
            return;
        }
        const tallaPill = e.target.closest('.mayor-talla-pill');
        if (tallaPill) {
            const id = tallaPill.dataset.id;
            const idx = parseInt(tallaPill.dataset.idx, 10);
            const p = allProducts.find(pp => pp.id === id);
            const filas = detalleFilas.get(id);
            if (p && filas && filas[idx]) {
                filas[idx].talla = tallaPill.dataset.talla;
                const disponible = getStockDisponibleFila(p, filas[idx].talla, filas[idx].color, idx) || 1;
                filas[idx].cantidad = Math.min(parseInt(filas[idx].cantidad, 10) || 1, disponible);
                updateCardInPlace(id);
                updateProgress();
            }
            return;
        }
        const qtyMinus = e.target.closest('.mayor-qty-minus');
        if (qtyMinus) {
            const id = qtyMinus.dataset.id;
            const idx = parseInt(qtyMinus.dataset.idx, 10);
            const filas = detalleFilas.get(id);
            if (filas && filas[idx] && (parseInt(filas[idx].cantidad, 10) || 0) > 1) {
                filas[idx].cantidad = (parseInt(filas[idx].cantidad, 10) || 1) - 1;
                updateCardInPlace(id);
                updateProgress();
            }
            return;
        }
        const qtyPlus = e.target.closest('.mayor-qty-plus');
        if (qtyPlus) {
            const id = qtyPlus.dataset.id;
            const idx = parseInt(qtyPlus.dataset.idx, 10);
            const p = allProducts.find(pp => pp.id === id);
            const filas = detalleFilas.get(id);
            if (p && filas && filas[idx]) {
                const tallas = getTallasConStock(p);
                const hasTallas = tallas.length > 0;
                const disponible = getStockDisponibleFila(p, hasTallas ? filas[idx].talla : null, filas[idx].color, idx);
                const cantidadActual = parseInt(filas[idx].cantidad, 10) || 0;
                if (cantidadActual < disponible) {
                    filas[idx].cantidad = cantidadActual + 1;
                    updateCardInPlace(id);
                    updateProgress();
                } else {
                    showToast('Ya no hay más stock disponible de este color/talla', 'warning');
                }
            }
        }
    });

    // La cantidad NO reconstruye la hoja en 'input' (perdería el foco del campo
    // mientras se escribe); el precio sí se recalcula en vivo con cada tecla.
    mqaBodyEl.addEventListener('input', (e) => {
        const qtyInput = e.target.closest('.mayor-qty-input');
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
    // esa combinación talla+color, sin reconstruir la hoja (ver nota en encargo.js
    // sobre por qué 'focusout' y no un render inmediato).
    mqaBodyEl.addEventListener('focusout', (e) => {
        const qtyInput = e.target.closest && e.target.closest('.mayor-qty-input');
        if (!qtyInput) return;
        const id = qtyInput.dataset.id;
        const idx = parseInt(qtyInput.dataset.idx, 10);
        const filas = detalleFilas.get(id);
        const p = allProducts.find(pp => pp.id === id);
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

if (finalizeToggleBtn) {
    finalizeToggleBtn.addEventListener('click', () => {
        finalizePanelEl.classList.toggle('is-collapsed');
    });
}

function getAsesorSeleccionado() {
    const input = asesorOptionsEl?.querySelector('input[name="mayor-asesor"]:checked');
    return ASESORES[input?.value] || ASESORES.mishell;
}

if (asesorOptionsEl) {
    asesorOptionsEl.addEventListener('change', () => {
        asesorOptionsEl.querySelectorAll('.mayor-advisor-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.querySelector('input').checked);
        });
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
        const asesor = getAsesorSeleccionado();
        const url = `https://wa.me/${asesor.numero}?text=${encodeURIComponent(mensaje)}`;
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

// ── Búsqueda (barra desktop + barra dedicada en móvil) ────────────────────
// mayor.html no trae el nav flotante de abajo del resto del sitio (con su
// buscador inline): aquí hay dos inputs de texto — el de escritorio en el
// header y uno propio en la barra de la página para móvil — que se
// mantienen sincronizados y ambos alimentan el mismo `searchTerm`.
const searchInputEl = document.getElementById('search-input');
let searchTimeout;
function applyFiltersAndRedraw() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; renderProducts(); updateProgress(); }, 200);
}
function syncSearchInputs(value) {
    if (searchInputEl && searchInputEl.value !== value) searchInputEl.value = value;
    if (mobileSearchInputEl && mobileSearchInputEl.value !== value) mobileSearchInputEl.value = value;
}
function handleSearchInput(e) {
    searchTerm = e.target.value;
    syncSearchInputs(searchTerm);
    applyFiltersAndRedraw();
}
if (searchInputEl) searchInputEl.addEventListener('input', handleSearchInput);
if (mobileSearchInputEl) mobileSearchInputEl.addEventListener('input', handleSearchInput);

// ── Filtro rápido de disponibilidad + orden ────────────────────────────────
if (stockFilterEl) {
    stockFilterEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.mayor-chip');
        if (!btn) return;
        stockFilterEl.querySelectorAll('.mayor-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        stockFilterMode = btn.dataset.stock;
        currentPage = 1;
        renderProducts();
        updateProgress();
    });
}
if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
        sortMode = sortSelectEl.value;
        currentPage = 1;
        renderProducts();
        updateProgress();
    });
}

// ── Recorrido guiado: se muestra solo la primera vez que alguien entra a
// esta página (guardado en localStorage) y explica, en orden, las piezas
// clave para comprar al por mayor — incluyendo abrir de verdad la hoja de
// "agregar rápido" de la primera prenda para señalar adentro cómo se
// elige color/talla/cantidad. El enlace "Ver recorrido guiado" dentro de
// "Cómo comprar" lo repite cuando se quiera. Espera a que haya al menos
// una prenda pintada en la grilla para poder señalarla. ─────────────────

// Abre (o mantiene abierta) la hoja de agregar rápido de la primera
// prenda visible, para usarla como ejemplo durante el recorrido. Es
// idempotente: se puede llamar en cada paso sin volver a animar nada si
// ya estaba abierta con la misma prenda.
function openDemoTourSheet() {
    const demoId = gridEl?.querySelector('.mayor-card')?.dataset.productId;
    if (!demoId) return;
    if (openSheetProductId !== demoId || !quickAddSheetEl?.classList.contains('is-open')) {
        openQuickAddSheet(demoId);
    }
}

const MAYOR_TOUR_STEPS = [
    {
        selector: '#btn-open-info',
        title: '👋 Antes de empezar',
        text: 'Aquí puedes ver el mínimo de prendas por pedido, la tabla de precios por cantidad y las demás condiciones de la compra al por mayor.',
        onEnter: closeQuickAddSheet,
    },
    {
        selector: '.mayor-toolbar-controls',
        title: 'Filtra y ordena',
        text: 'Usa estos controles para ver solo las prendas con poca disponibilidad, u ordenarlas por precio o stock.',
        onEnter: closeQuickAddSheet,
    },
    {
        selector: '.mayor-card',
        title: 'Elige tus prendas',
        text: 'Toca "+ Agregar" en cualquier prenda para abrir su ficha y elegir color, talla y cantidad.',
        onEnter: closeQuickAddSheet,
    },
    {
        selector: '#mayorQuickAddSheet .mqa-hero-img',
        title: 'La foto completa',
        text: 'Al tocar "+ Agregar" se abre esto: la foto completa de la prenda, sin recortes, para que la veas bien antes de elegir.',
        onEnter: openDemoTourSheet,
    },
    {
        selector: '#mqa-body',
        title: 'Color, talla y cantidad',
        text: 'Toca un color para agregarlo a tu pedido (puedes elegir varios). Luego elige la talla si aplica y ajusta la cantidad con los botones − y +.',
        onEnter: openDemoTourSheet,
    },
    {
        selector: '#mqa-done-btn',
        title: 'Listo',
        text: 'Cuando termines con esta prenda, toca "Listo" para volver a la lista y seguir agregando otras.',
        onEnter: openDemoTourSheet,
    },
    {
        title: 'Envía tu pedido',
        text: 'A medida que agregues prendas, verás el total en una barra al final de la pantalla. Desde ahí eliges a quién enviárselo por WhatsApp.',
        onEnter: closeQuickAddSheet,
    },
];
let mayorTourStarted = false;
function maybeStartMayorTour() {
    if (mayorTourStarted || !gridEl || !gridEl.querySelector('.mayor-card')) return;
    mayorTourStarted = true;
    startGuideTour('mayor', MAYOR_TOUR_STEPS, { onExit: closeQuickAddSheet });
}
const startTourFromInfoBtn = document.getElementById('btn-start-tour-from-info');
if (startTourFromInfoBtn) {
    startTourFromInfoBtn.addEventListener('click', () => {
        closeFullsheet(infoSheetEl);
        startGuideTour('mayor', MAYOR_TOUR_STEPS, { force: true, onExit: closeQuickAddSheet });
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
    maybeStartMayorTour();
}, (err) => {
    console.error('Error cargando productos:', err);
    if (gridEl) gridEl.style.display = 'none';
    if (emptyEl) {
        emptyEl.style.display = 'block';
        const p = emptyEl.querySelector('p');
        if (p) p.textContent = 'Ocurrió un error al cargar los productos. Intenta más tarde.';
    }
});
