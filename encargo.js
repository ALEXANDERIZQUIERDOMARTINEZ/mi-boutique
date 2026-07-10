import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_CODE } from './wholesale-config.js';
import { WHOLESALE_TIER_GROUPS, getTierPrice, resolveWholesaleGroup } from './wholesale-tiers.js';

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
const MIN_POR_PRENDA = 2;
const DIAS_ENTREGA = 8;

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
let productsData = [];
const categoriesMap = new Map(); // categoriaId -> nombre
let bsToast = null;

const gridEl = document.getElementById('encargo-grid');
const emptyEl = document.getElementById('encargo-empty');
const groupProgressListEl = document.getElementById('group-progress-list');
const finalizePanelEl = document.getElementById('finalize-panel');
const finalizeToggleBtn = document.getElementById('btn-toggle-finalize');
const codeBlockEl = document.getElementById('code-block');
const codeValueEl = document.getElementById('code-value');
const copyBtn = document.getElementById('btn-copy-code');
const waBtn = document.getElementById('btn-send-whatsapp');
const obsEl = document.getElementById('encargo-observaciones');
const totalEstimadoEl = document.getElementById('total-estimado');
const tiersToggleBtn = document.getElementById('btn-toggle-tiers');
const tiersTablesEl = document.getElementById('tiers-tables');
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

// Solo cuenta hacia totales/precio/pedido si cumple el mínimo de 2 por prenda.
function getCantidadValida(id) {
    const total = getCantidadProducto(id);
    return total >= MIN_POR_PRENDA ? total : 0;
}

function totalSeleccionado() {
    let total = 0;
    productsData.forEach(p => { total += getCantidadValida(p.id); });
    return total;
}

function totalPorGrupo(grupo) {
    let total = 0;
    productsData.forEach(p => {
        if (resolveWholesaleGroup(p, categoriesMap) === grupo) total += getCantidadValida(p.id);
    });
    return total;
}

// Misma lógica de precios por volumen que mayor.html: si la prenda pertenece a un
// grupo con tabla de precios (asignado a mano o detectado por su categoría), el
// precio por unidad depende del total elegido de ese grupo (sumando todas las
// referencias y colores de ese grupo); si no, se usa el precio de venta normal.
function getPrecioUnitario(p) {
    const grupo = resolveWholesaleGroup(p, categoriesMap);
    if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
        return getTierPrice(grupo, Math.max(totalPorGrupo(grupo), 1));
    }
    return p.precioDetal || 0;
}

function calcularTotalEstimado() {
    let total = 0;
    productsData.forEach(p => {
        const qty = getCantidadValida(p.id);
        if (qty > 0) total += getPrecioUnitario(p) * qty;
    });
    return total;
}

// El código se desbloquea en cuanto CUALQUIER grupo alcanza su primer escalón real
// de mayoreo (el segundo renglón de la tabla, ej. 6X), sin importar entre cuántas
// referencias/colores esté repartida esa cantidad.
function grupoDesbloqueado(grupo) {
    const group = WHOLESALE_TIER_GROUPS[grupo];
    if (!group || !group.tiers[1]) return false;
    return totalPorGrupo(grupo) >= group.tiers[1].min;
}

function isAnyGroupUnlocked() {
    return Object.keys(WHOLESALE_TIER_GROUPS).some(grupoDesbloqueado);
}

function renderTiersTables() {
    if (!tiersTablesEl) return;
    tiersTablesEl.innerHTML = Object.entries(WHOLESALE_TIER_GROUPS).map(([key, group]) => `
        <div class="encargo-tier-card">
            <h4>${group.label}</h4>
            <table>
                ${group.tiers.map(t => `<tr><td>${t.min}X</td><td>${formatoMoneda.format(t.precio)}</td></tr>`).join('')}
            </table>
        </div>
    `).join('');
}

// Barra de progreso por grupo: muestra en qué escalón de la tabla vas y cuánto
// falta para el siguiente, siguiendo la lógica completa (1X, 6X, 12X, 24X...).
function renderGroupProgress() {
    if (!groupProgressListEl) return;
    const gruposConSeleccion = Object.entries(WHOLESALE_TIER_GROUPS).filter(([key]) => totalPorGrupo(key) > 0);

    if (gruposConSeleccion.length === 0) {
        groupProgressListEl.innerHTML = '';
        return;
    }

    groupProgressListEl.innerHTML = gruposConSeleccion.map(([key, group]) => {
        const total = totalPorGrupo(key);
        const tiers = group.tiers;
        let idx = 0;
        for (let i = 0; i < tiers.length; i++) { if (total >= tiers[i].min) idx = i; }
        const nextTier = tiers[idx + 1];
        const unlocked = idx >= 1;
        let pct, label;
        if (nextTier) {
            const base = tiers[idx].min;
            pct = Math.min(100, Math.round(((total - base) / (nextTier.min - base)) * 100));
            label = `${group.label}: ${total} und. — ${formatoMoneda.format(tiers[idx].precio)} c/u (faltan ${nextTier.min - total} para ${formatoMoneda.format(nextTier.precio)} c/u)`;
        } else {
            pct = 100;
            label = `${group.label}: ${total} und. — ¡precio más bajo! ${formatoMoneda.format(tiers[idx].precio)} c/u`;
        }
        return `
            <div class="encargo-group-progress">
                <div class="encargo-group-progress-label"><span>${label}</span></div>
                <div class="encargo-progress-track"><div class="encargo-progress-fill${unlocked ? ' is-unlocked' : ''}" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

function renderProducts() {
    if (!gridEl) return;
    if (productsData.length === 0) {
        gridEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
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
            const totalGrupo = totalPorGrupo(grupo);
            precioHtml = `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${totalGrupo > 0 ? `Precio con ${totalGrupo} und. del grupo` : 'Baja según cantidad del grupo'}</span>`;
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
                const totalGrupo = totalPorGrupo(grupo);
                priceEl.innerHTML = `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${totalGrupo > 0 ? `Precio con ${totalGrupo} und. del grupo` : 'Baja según cantidad del grupo'}</span>`;
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

    renderGroupProgress();
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    const unlocked = isAnyGroupUnlocked();
    if (codeBlockEl) {
        const wasUnlocked = codeBlockEl.classList.contains('is-unlocked');
        codeBlockEl.classList.toggle('is-unlocked', unlocked);
        if (unlocked && !wasUnlocked) showToast('¡Código mayorista desbloqueado!', 'success');
    }
}

function updateProgress() {
    renderGroupProgress();

    const unlocked = isAnyGroupUnlocked();
    if (codeValueEl) codeValueEl.textContent = WHOLESALE_CODE;
    if (codeBlockEl) {
        const wasUnlocked = codeBlockEl.classList.contains('is-unlocked');
        codeBlockEl.classList.toggle('is-unlocked', unlocked);
        if (unlocked && !wasUnlocked) showToast('¡Código mayorista desbloqueado!', 'success');
    }
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
        tiersToggleBtn.textContent = isOpen ? 'Ocultar tabla de precios' : 'Ver tabla de precios por cantidad';
    });
}

if (finalizeToggleBtn) {
    finalizeToggleBtn.addEventListener('click', () => {
        finalizePanelEl.classList.toggle('is-collapsed');
    });
}

if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(WHOLESALE_CODE);
            showToast('Código copiado', 'success');
        } catch {
            showToast('No se pudo copiar, cópialo manualmente', 'warning');
        }
    });
}

if (waBtn) {
    waBtn.addEventListener('click', () => {
        const productosConSeleccion = productsData.filter(p => getCantidadValida(p.id) > 0);
        if (productosConSeleccion.length === 0) {
            showToast('Elige al menos 2 unidades de una prenda primero', 'warning');
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
        if (isAnyGroupUnlocked()) mensaje += `\n\nMi código mayorista: ${WHOLESALE_CODE}`;
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

// Se necesita el nombre de la categoría para detectar el grupo de precio mayorista
// cuando el producto no tiene un grupo asignado a mano. Al llegar, se vuelve a
// renderizar por si los productos ya se habían cargado antes que las categorías.
onSnapshot(categoriesCollection, (snapshot) => {
    categoriesMap.clear();
    snapshot.forEach(docSnap => {
        categoriesMap.set(docSnap.id, docSnap.data().nombre || '');
    });
    // Si los productos ya se cargaron antes que las categorías, re-renderizar para
    // aplicar la detección de grupo por categoría. Si aún no llegan, no hay nada
    // que mostrar todavía (su propio onSnapshot se encarga cuando lleguen).
    if (productsData.length > 0) {
        renderProducts();
        updateProgress();
    }
}, (err) => {
    console.error('Error cargando categorías:', err);
});

const q = query(productsCollection, where('bajoEncargo', '==', true));
onSnapshot(q, (snapshot) => {
    productsData = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.visible === false) return;
        productsData.push({ id: docSnap.id, ...data });
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
