import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { WHOLESALE_CODE } from './wholesale-config.js';

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
let productsData = [];
let bsToast = null;

const gridEl = document.getElementById('encargo-grid');
const emptyEl = document.getElementById('encargo-empty');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');
const codePanelEl = document.getElementById('code-panel');
const codeValueEl = document.getElementById('code-value');
const copyBtn = document.getElementById('btn-copy-code');
const waBtn = document.getElementById('btn-send-whatsapp');

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
        const card = document.createElement('div');
        card.className = 'encargo-card' + (qty > 0 ? ' is-selected' : '');
        card.innerHTML = `
            <div class="encargo-card-img"><img src="${img}" alt="${p.nombre}" loading="lazy"></div>
            <div class="encargo-card-body">
                <h3 class="encargo-card-name">${p.nombre}</h3>
                <div class="encargo-card-price">${formatoMoneda.format(p.precioDetal || 0)}</div>
                <div class="encargo-stepper">
                    <button type="button" class="encargo-step-btn encargo-step-minus" data-id="${p.id}" aria-label="Quitar">−</button>
                    <span class="encargo-step-qty">${qty}</span>
                    <button type="button" class="encargo-step-btn encargo-step-plus" data-id="${p.id}" aria-label="Agregar">+</button>
                </div>
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

    if (total >= META_TOTAL) {
        if (codeValueEl) codeValueEl.textContent = WHOLESALE_CODE;
        if (codePanelEl && !codePanelEl.classList.contains('is-unlocked')) {
            codePanelEl.classList.add('is-unlocked');
            showToast('¡Código mayorista desbloqueado!', 'success');
        }
    } else if (codePanelEl) {
        codePanelEl.classList.remove('is-unlocked');
    }
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
        if (qty > 0) selections.set(id, qty); else selections.delete(id);
        renderProducts();
        updateProgress();
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
        const lineas = [];
        productsData.forEach(p => {
            const qty = selections.get(p.id);
            if (qty) lineas.push(`• ${p.nombre} x${qty}`);
        });
        const mensaje = `Hola! Quiero hacer un pedido bajo encargo:\n${lineas.join('\n')}\n\nMi código mayorista: ${WHOLESALE_CODE}`;
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
