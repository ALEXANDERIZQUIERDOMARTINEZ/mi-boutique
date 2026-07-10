import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_CODE } from './wholesale-config.js';
import { WHOLESALE_TIER_GROUPS, getTierPrice } from './wholesale-tiers.js';

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

const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const WHATSAPP_NUMBER = '573046084971';
const MIN_POR_PRENDA = 2;
const META_TOTAL = 6;

const selections = new Map(); // productId -> cantidad
const coloresElegidos = new Map(); // productId -> color elegido
let productsData = [];
let bsToast = null;

const gridEl = document.getElementById('encargo-grid');
const emptyEl = document.getElementById('encargo-empty');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');
const finalizePanelEl = document.getElementById('finalize-panel');
const codeBlockEl = document.getElementById('code-block');
const codeValueEl = document.getElementById('code-value');
const linkMayorEl = document.getElementById('link-mayor');
const copyBtn = document.getElementById('btn-copy-code');
const waBtn = document.getElementById('btn-send-whatsapp');
const obsEl = document.getElementById('encargo-observaciones');
const totalEstimadoEl = document.getElementById('total-estimado');
const tiersToggleBtn = document.getElementById('btn-toggle-tiers');
const tiersTablesEl = document.getElementById('tiers-tables');

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

function totalSeleccionado() {
    let total = 0;
    selections.forEach(qty => { total += qty; });
    return total;
}

function totalPorGrupo(grupo) {
    let total = 0;
    productsData.forEach(p => {
        if (p.grupoMayorista === grupo) {
            total += selections.get(p.id) || 0;
        }
    });
    return total;
}

// Misma lógica de precios por volumen que mayor.html: si la prenda pertenece a un
// grupo con tabla de precios, el precio por unidad depende del total elegido de ese
// grupo en esta selección; si no, se usa el precio de venta normal.
function getPrecioUnitario(p) {
    const grupo = p.grupoMayorista;
    if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
        return getTierPrice(grupo, Math.max(totalPorGrupo(grupo), 1));
    }
    return p.precioDetal || 0;
}

function calcularTotalEstimado() {
    let total = 0;
    productsData.forEach(p => {
        const qty = selections.get(p.id) || 0;
        if (qty > 0) total += getPrecioUnitario(p) * qty;
    });
    return total;
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
        const qty = selections.get(p.id) || 0;
        const img = p.imagenUrl || 'https://placehold.co/300x400/f5e8ed/D988B9?text=Mishell';
        const colorTexto = coloresElegidos.get(p.id) || '';

        const grupo = p.grupoMayorista;
        const precioUnitario = getPrecioUnitario(p);
        let precioHtml = formatoMoneda.format(precioUnitario);
        if (grupo && WHOLESALE_TIER_GROUPS[grupo]) {
            const totalGrupo = totalPorGrupo(grupo);
            precioHtml = `${formatoMoneda.format(precioUnitario)} c/u<span class="tier-hint">${totalGrupo > 0 ? `Precio con ${totalGrupo} und. del grupo` : 'Baja según cantidad del grupo'}</span>`;
        }

        const colorFieldHtml = qty > 0 ? `
            <div class="encargo-color-field">
                <input type="text" class="encargo-color-input" data-id="${p.id}" placeholder="Escribe el color que quieres" value="${colorTexto.replace(/"/g, '&quot;')}">
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'encargo-card' + (qty > 0 ? ' is-selected' : '');
        card.innerHTML = `
            <div class="encargo-card-img"><img src="${img}" alt="${p.nombre}" loading="lazy"></div>
            <div class="encargo-card-body">
                <h3 class="encargo-card-name">${p.nombre}</h3>
                <div class="encargo-card-price">${precioHtml}</div>
                <div class="encargo-stepper">
                    <button type="button" class="encargo-step-btn encargo-step-minus" data-id="${p.id}" aria-label="Quitar">−</button>
                    <span class="encargo-step-qty">${qty}</span>
                    <button type="button" class="encargo-step-btn encargo-step-plus" data-id="${p.id}" aria-label="Agregar">+</button>
                </div>
                ${colorFieldHtml}
            </div>
        `;
        gridEl.appendChild(card);
    });
}

function updateProgress() {
    const total = totalSeleccionado();
    const pct = Math.min(100, Math.round((total / META_TOTAL) * 100));
    if (progressFillEl) progressFillEl.style.width = pct + '%';
    if (progressTextEl) progressTextEl.textContent = `${Math.min(total, META_TOTAL)}/${META_TOTAL} prendas seleccionadas`;

    const unlocked = total >= META_TOTAL;
    if (codeValueEl) codeValueEl.textContent = WHOLESALE_CODE;
    if (linkMayorEl) linkMayorEl.href = `mayor.html?code=${encodeURIComponent(WHOLESALE_CODE)}`;
    if (codeBlockEl) {
        const wasUnlocked = codeBlockEl.classList.contains('is-unlocked');
        codeBlockEl.classList.toggle('is-unlocked', unlocked);
        if (unlocked && !wasUnlocked) showToast('¡Código mayorista desbloqueado!', 'success');
    }
    if (totalEstimadoEl) totalEstimadoEl.textContent = formatoMoneda.format(calcularTotalEstimado());
    if (finalizePanelEl) finalizePanelEl.classList.toggle('is-visible', total > 0);
}

if (gridEl) {
    gridEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.encargo-step-btn');
        if (!btn) return;
        const id = btn.dataset.id;
        let qty = selections.get(id) || 0;
        if (btn.classList.contains('encargo-step-plus')) {
            qty = qty === 0 ? MIN_POR_PRENDA : qty + 1;
        } else {
            qty = qty <= MIN_POR_PRENDA ? 0 : qty - 1;
        }
        if (qty > 0) {
            selections.set(id, qty);
        } else {
            selections.delete(id);
            coloresElegidos.delete(id);
        }
        renderProducts();
        updateProgress();
    });

    // No re-renderizamos en cada tecla para no perder el foco del input
    gridEl.addEventListener('input', (e) => {
        const input = e.target.closest('.encargo-color-input');
        if (!input) return;
        coloresElegidos.set(input.dataset.id, input.value);
    });
}

if (tiersToggleBtn) {
    tiersToggleBtn.addEventListener('click', () => {
        const isOpen = tiersTablesEl.classList.toggle('is-open');
        tiersToggleBtn.textContent = isOpen ? 'Ocultar tabla de precios' : 'Ver tabla de precios por cantidad';
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
        if (selections.size === 0) {
            showToast('Elige al menos una prenda primero', 'warning');
            return;
        }
        const lineas = [];
        productsData.forEach(p => {
            const qty = selections.get(p.id);
            if (!qty) return;
            const color = (coloresElegidos.get(p.id) || '').trim();
            const precioUnitario = getPrecioUnitario(p);
            lineas.push(`• ${p.nombre}${color ? ` (color: ${color})` : ''} x${qty} — ${formatoMoneda.format(precioUnitario)} c/u = ${formatoMoneda.format(precioUnitario * qty)}`);
        });
        const observaciones = (obsEl?.value || '').trim();
        const total = totalSeleccionado();
        const totalEstimado = calcularTotalEstimado();
        let mensaje = `Hola! Quiero hacer un pedido bajo encargo:\n${lineas.join('\n')}\n\nTotal estimado: ${formatoMoneda.format(totalEstimado)}`;
        if (observaciones) mensaje += `\n\nObservaciones: ${observaciones}`;
        if (total >= META_TOTAL) mensaje += `\n\nMi código mayorista: ${WHOLESALE_CODE}`;
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
