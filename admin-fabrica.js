/**
 * MISHELLES FÁBRICA — Productos, Gastos/Ingresos e Inventario (hilazas,
 * hilos, telas)
 *
 * Bundle 100% independiente: se carga desde admin-fabrica.html, su propia
 * página, no desde el admin.html de Boutique. No importa nada de admin.js
 * (ni datos ni utilidades) — tiene su propia inicialización de Firebase y
 * sus propias funciones de utilidad, aunque el proyecto de Firebase de
 * fondo sea el mismo mientras no exista una migración de datos separada.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    initializeFirestore, collection, getDocs, query, where, orderBy, doc,
    getDoc, deleteDoc, updateDoc, addDoc, serverTimestamp, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { WHOLESALE_TIER_GROUPS } from "./wholesale-tiers.js";

const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true
});
export const storage = getStorage(app);
window.db = db;
window.firebaseApp = app;
// Declara ante auth.js a qué tenant pertenece ESTA página, para que el
// login rechace a quien no tenga acceso concedido a Fábrica (ver
// verificación de tenant en auth.js AuthManager.init()).
window.expectedTenantId = 'fabrica';
console.log("Fábrica: Firebase inicializado");

// --- Utilidad de imagen: misma lógica que admin.js, copiada (no importada)
// para que este archivo no dependa de ningún otro bundle de Boutique. ---
const PRODUCT_IMAGE_MAX_DIMENSION = 1600;
const PRODUCT_IMAGE_JPEG_QUALITY = 0.82;
const PRODUCT_IMAGE_SKIP_COMPRESSION_BELOW = 300 * 1024; // 300KB

export function compressProductImageFile(file) {
    if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml') return Promise.resolve(file);
    if (file.size <= PRODUCT_IMAGE_SKIP_COMPRESSION_BELOW) return Promise.resolve(file);

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let { width, height } = img;
            if (width > PRODUCT_IMAGE_MAX_DIMENSION || height > PRODUCT_IMAGE_MAX_DIMENSION) {
                const scale = PRODUCT_IMAGE_MAX_DIMENSION / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => {
                if (!blob || blob.size >= file.size) { resolve(file); return; }
                const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                resolve(new File([blob], newName, { type: 'image/jpeg' }));
            }, 'image/jpeg', PRODUCT_IMAGE_JPEG_QUALITY);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

// --- Helper: Show Toast Notification (misma lógica que admin.js, copiada) ---
let bsToast = null;
export function showToast(message, type = 'success', title = 'Notificación') {
    const liveToastEl = document.getElementById('liveToast');
    const toastBodyEl = document.getElementById('toast-body');
    const toastIconEl = document.getElementById('toast-icon');

    if (liveToastEl && toastBodyEl) {
        if (!bsToast) { try { bsToast = new bootstrap.Toast(liveToastEl, { delay: 3500 }); } catch (e) { console.error("Toast init error", e); return; } }
        liveToastEl.className = 'toast';
        const typeMap = { success: 'toast-success', error: 'toast-error', warning: 'toast-warning', info: 'toast-info' };
        const iconMap = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
        liveToastEl.classList.add(typeMap[type] || 'toast-success');
        if (toastIconEl) toastIconEl.innerHTML = `<i class="bi ${iconMap[type] || iconMap.success}"></i>`;
        toastBodyEl.textContent = message;
        bsToast.show();
    } else { console.warn("Toast elements not found:", message); alert(`${type.toUpperCase()}: ${message}`); }
}
window.showToast = showToast;

const fabricaCollection = collection(db, 'movimientosFabrica');
const inventarioFabricaCollection = collection(db, 'inventarioFabrica');
const productosFabricaCollection = collection(db, 'productosFabrica');
const categoriasCollection = collection(db, 'categorias');
const ventasCollection = collection(db, 'ventas');

const formatoMonedaDashboard = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ========================================================================
// ✅ SECCIÓN: DASHBOARD FÁBRICA — misma estructura que el de Boutique, pero
// leyendo solo lo propio de Fábrica (productosFabrica, ventas con
// tenantId === 'fabrica'). Sin Apartados/Promociones/Repartidores: no
// aplican al negocio de Fábrica.
// ========================================================================
(() => {
    const dashboardDateEl = document.getElementById('dashboard-date');
    if (!dashboardDateEl) return;

    dashboardDateEl.textContent = new Date().toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const STOCK_MINIMO_DASHBOARD = 2; // mismo criterio que el Dashboard de Boutique

    function stockTotalProducto(producto) {
        return (producto.variaciones || []).reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
    }

    async function calcularProductosFabrica() {
        try {
            const snapshot = await getDocs(productosFabricaCollection);
            let totalProductos = 0, disponibles = 0, inversionTotal = 0, valorPotencialMayor = 0, totalUnidades = 0, bajoStockCount = 0;

            snapshot.forEach(docSnap => {
                const producto = docSnap.data();
                totalProductos++;
                if (producto.visible) disponibles++;

                const costoCompra = parseFloat(producto.costoCompra) || 0;
                const precioMayor = parseFloat(producto.precioMayor) || 0;
                const stock = stockTotalProducto(producto);

                inversionTotal += costoCompra * stock;
                valorPotencialMayor += precioMayor * stock;
                totalUnidades += stock;

                if (producto.visible && stock > 0 && stock <= STOCK_MINIMO_DASHBOARD) bajoStockCount++;
            });

            document.getElementById('fdb-total-productos').textContent = totalProductos;
            document.getElementById('fdb-productos-disponibles').textContent = `${disponibles} disponibles`;

            const bajoStockEl = document.getElementById('fdb-bajo-stock');
            bajoStockEl.textContent = bajoStockCount;
            bajoStockEl.classList.remove('text-warning', 'text-success');
            bajoStockEl.classList.add(bajoStockCount > 0 ? 'text-warning' : 'text-success');

            document.getElementById('fdb-inversion-inventario').textContent = formatoMonedaDashboard.format(inversionTotal);
            document.getElementById('fdb-inventario-unidades').textContent = `${totalUnidades} unidades`;

            // "Utilidad potencial": lo que se ganaría si se vendiera todo el
            // stock actual al precio mayorista, menos lo que costó producirlo.
            const utilidadPotencial = valorPotencialMayor - inversionTotal;
            const margen = inversionTotal > 0 ? (utilidadPotencial / inversionTotal) * 100 : 0;
            document.getElementById('fdb-utilidad-potencial').textContent = formatoMonedaDashboard.format(utilidadPotencial);
            document.getElementById('fdb-margen-utilidad').innerHTML = `<i class="bi bi-percent"></i> ${margen.toFixed(1)}% de margen`;
        } catch (error) {
            console.error('Error al calcular productos del dashboard de fábrica:', error);
        }
    }

    function obtenerRangoFechasDashboard(rango) {
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);
        if (rango === 'week') {
            const dia = inicio.getDay();
            inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));
        } else if (rango === 'month') {
            inicio.setDate(1);
        } else if (rango === 'year') {
            inicio.setMonth(0, 1);
        }
        const fin = new Date();
        fin.setDate(fin.getDate() + 1);
        fin.setHours(0, 0, 0, 0);
        return { inicio, fin };
    }

    const ETIQUETAS_RANGO_DASHBOARD = {
        today: 'Ventas hoy', week: 'Ventas esta semana', month: 'Ventas este mes', year: 'Ventas este año'
    };

    async function calcularVentasFabrica(rango) {
        const tituloEl = document.getElementById('fdb-ventas-periodo-title');
        if (tituloEl) tituloEl.textContent = ETIQUETAS_RANGO_DASHBOARD[rango] || 'Ventas hoy';

        try {
            const { inicio, fin } = obtenerRangoFechasDashboard(rango);
            // Solo lo propio de Fábrica: tenantId === 'fabrica'. Necesita el
            // mismo índice compuesto (tenantId + timestamp) que
            // productosFabrica/inventarioFabrica — si Firestore lo pide, es
            // normal, se crea igual desde el link que da la consola.
            const q = query(
                ventasCollection,
                where('tenantId', '==', 'fabrica'),
                where('timestamp', '>=', Timestamp.fromDate(inicio)),
                where('timestamp', '<', Timestamp.fromDate(fin)),
                orderBy('timestamp', 'desc')
            );
            const snapshot = await getDocs(q);

            let totalRecibido = 0;
            let ventasContadas = 0;
            snapshot.forEach(docSnap => {
                const venta = docSnap.data();
                const estado = venta.estado || '';
                if (estado === 'Anulada' || estado === 'Cancelada') return;
                totalRecibido += (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                ventasContadas++;
            });

            document.getElementById('fdb-ventas-periodo').textContent = formatoMonedaDashboard.format(totalRecibido);
            document.getElementById('fdb-ventas-count').textContent = `${ventasContadas} ${ventasContadas === 1 ? 'venta' : 'ventas'}`;
            // "Ganancia real": plata que realmente entró (efectivo + transferencia),
            // sin restar costos — mismo criterio que el Dashboard de Boutique.
            document.getElementById('fdb-ganancia-real').textContent = formatoMonedaDashboard.format(totalRecibido);
        } catch (error) {
            console.error('Error al calcular ventas del dashboard de fábrica:', error);
            const el = document.getElementById('fdb-ventas-periodo');
            if (el) el.textContent = 'Error';
        }
    }

    document.querySelectorAll('#dashboard .db2-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#dashboard .db2-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calcularVentasFabrica(btn.dataset.range);
        });
    });

    let dashboardYaCargado = false;
    function cargarDashboardSiCorresponde() {
        if ((window.location.hash || '#dashboard') !== '#dashboard') return;
        dashboardYaCargado = true;
        calcularProductosFabrica();
        calcularVentasFabrica('today');
    }

    window.addEventListener('hashchange', cargarDashboardSiCorresponde);
    window.addEventListener('admin:section-shown', cargarDashboardSiCorresponde);
    if (!dashboardYaCargado) cargarDashboardSiCorresponde();
})();

// ========================================================================
// ✅ SECCIÓN: REGISTRAR VENTA — venta de mostrador propia de Fábrica.
// Versión deliberadamente más simple que la de Boutique: sin apartados, sin
// domicilio/repartidor, sin cotizaciones ni escáner (excluidos del negocio
// de Fábrica). El precio de línea es editable porque productosFabrica solo
// tiene precioMayor, no un precio de detal aparte.
// ========================================================================
(() => {
    const form = document.getElementById('fvForm');
    if (!form) return;

    const clientesCollection = collection(db, 'clientes');

    let carrito = [];
    let clienteSeleccionado = null;
    let productosCache = [];
    let clientesCache = null;
    let productoEnVariacion = null;

    const clienteIdInput = document.getElementById('fv-cliente-id');
    const clienteNombreInput = document.getElementById('fv-cliente-nombre');
    const clienteCelularInput = document.getElementById('fv-cliente-celular');
    const clienteDireccionInput = document.getElementById('fv-cliente-direccion');
    const carritoEl = document.getElementById('fv-carrito');
    const itemsCountEl = document.getElementById('fv-items-count');
    const totalEl = document.getElementById('fv-total');
    const descuentoInput = document.getElementById('fv-descuento');
    const descuentoTipoSelect = document.getElementById('fv-descuento-tipo');
    const pagoEfectivoInput = document.getElementById('fv-pago-efectivo');
    const pagoTransferenciaInput = document.getElementById('fv-pago-transferencia');
    const observacionesInput = document.getElementById('fv-observaciones');

    function limpiarNumero(v) {
        return parseFloat((v || '0').toString().replace(/[^\d.-]/g, '')) || 0;
    }

    function normalizarVariacion(v) {
        const n = (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        return (n === 'unica' || n === 'unico') ? '' : n;
    }

    function calcularSubtotal() {
        return carrito.reduce((sum, item) => sum + item.total, 0);
    }

    function calcularTotal() {
        const subtotal = calcularSubtotal();
        const descuentoVal = limpiarNumero(descuentoInput.value);
        const descuento = descuentoTipoSelect.value === 'porcentaje'
            ? subtotal * (descuentoVal / 100)
            : descuentoVal;
        return Math.max(0, subtotal - descuento);
    }

    function renderCarrito() {
        if (carrito.length === 0) {
            carritoEl.innerHTML = `<div class="vf-cart-empty"><i class="bi bi-cart-x fs-4 d-block mb-1"></i><small>Aún no has agregado productos</small></div>`;
        } else {
            carritoEl.innerHTML = carrito.map((item, idx) => `
                <div class="sv-cart-item">
                    <div class="sv-cart-item-info">
                        <span class="sv-cart-item-name">${item.nombre}</span>
                        <span class="sv-cart-item-sub">${[item.talla, item.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ') || 'Única'} · x${item.cantidad}</span>
                    </div>
                    <div class="sv-cart-item-actions">
                        <span class="sv-cart-item-total">${formatoMonedaDashboard.format(item.total)}</span>
                        <button type="button" class="btn btn-sm btn-outline-danger fv-remove-item" data-idx="${idx}"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
        itemsCountEl.textContent = `${carrito.length} ${carrito.length === 1 ? 'item' : 'items'}`;
        totalEl.textContent = formatoMonedaDashboard.format(calcularTotal());
    }

    carritoEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.fv-remove-item');
        if (!btn) return;
        carrito.splice(parseInt(btn.dataset.idx, 10), 1);
        renderCarrito();
    });

    [descuentoInput, descuentoTipoSelect].forEach(el => el.addEventListener('input', renderCarrito));

    // ── Cliente ──────────────────────────────────────────────────────────
    function seleccionarCliente(cliente) {
        clienteSeleccionado = cliente;
        clienteIdInput.value = cliente?.id || '';
        clienteNombreInput.value = cliente?.nombre || '';
        clienteCelularInput.value = cliente?.celular || '';
        clienteDireccionInput.value = cliente?.direccion || '';
    }

    const clientSearchInput = document.getElementById('fv-client-search');
    const clientListEl = document.getElementById('fv-client-list');

    async function cargarClientesCache() {
        if (clientesCache) return clientesCache;
        const snap = await getDocs(query(clientesCollection, where('tenantId', '==', 'fabrica')));
        clientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return clientesCache;
    }

    function renderClientList(lista) {
        if (!lista.length) {
            clientListEl.innerHTML = `<li class="list-group-item text-center text-muted">Sin resultados</li>`;
            return;
        }
        clientListEl.innerHTML = lista.map(c => `
            <li class="list-group-item fv-client-item" style="cursor:pointer;" data-id="${c.id}">
                <strong>${c.nombre || 'Sin nombre'}</strong>
                <div class="text-muted small">${c.cedula || ''}${c.celular ? ' · ' + c.celular : ''}</div>
            </li>
        `).join('');
    }

    document.getElementById('fvSearchClientModal')?.addEventListener('show.bs.modal', async () => {
        clientListEl.innerHTML = `<li class="list-group-item text-center text-muted">Cargando...</li>`;
        const lista = await cargarClientesCache();
        renderClientList(lista);
    });

    clientSearchInput?.addEventListener('input', async () => {
        const termino = clientSearchInput.value.trim().toLowerCase();
        const lista = await cargarClientesCache();
        const filtrada = !termino ? lista : lista.filter(c =>
            (c.nombre || '').toLowerCase().includes(termino) || (c.cedula || '').includes(termino)
        );
        renderClientList(filtrada);
    });

    clientListEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.fv-client-item');
        if (!item) return;
        const cliente = (clientesCache || []).find(c => c.id === item.dataset.id);
        if (cliente) seleccionarCliente(cliente);
        bootstrap.Modal.getInstance(document.getElementById('fvSearchClientModal'))?.hide();
    });

    document.getElementById('fvFormAddClient')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('fv-new-cliente-nombre').value.trim();
        const celular = document.getElementById('fv-new-cliente-celular').value.trim();
        const cedula = document.getElementById('fv-new-cliente-cedula').value.trim();
        const direccion = document.getElementById('fv-new-cliente-direccion').value.trim();
        if (!nombre || !celular) { showToast('Nombre y celular son requeridos', 'warning'); return; }

        try {
            const docRef = await addDoc(clientesCollection, {
                nombre, celular, cedula, direccion,
                tenantId: 'fabrica',
                ultimaCompra: serverTimestamp()
            });
            const nuevoCliente = { id: docRef.id, nombre, celular, cedula, direccion };
            if (clientesCache) clientesCache.unshift(nuevoCliente);
            seleccionarCliente(nuevoCliente);
            bootstrap.Modal.getInstance(document.getElementById('fvAddClientModal'))?.hide();
            e.target.reset();
            showToast('Cliente agregado', 'success');
        } catch (error) {
            console.error('Error al crear cliente:', error);
            showToast('No se pudo crear el cliente: ' + error.message, 'error');
        }
    });

    // ── Productos ────────────────────────────────────────────────────────
    const productListEl = document.getElementById('fv-product-list');
    const productSearchInput = document.getElementById('fv-product-search');
    const stepListEl = document.getElementById('fv-product-step-list');
    const stepVariationEl = document.getElementById('fv-product-step-variation');

    async function cargarProductosCache() {
        const snap = await getDocs(productosFabricaCollection);
        productosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    function renderProductList(lista) {
        if (!lista.length) {
            productListEl.innerHTML = `<li class="list-group-item text-center text-muted">Sin resultados</li>`;
            return;
        }
        productListEl.innerHTML = lista.map(p => {
            const stock = (p.variaciones || []).reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
            return `
                <li class="list-group-item fv-product-item" style="cursor:pointer;" data-id="${p.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${p.nombre || 'Sin nombre'}</strong>
                            <div class="text-muted small">${p.codigo || ''} · Stock: ${stock}</div>
                        </div>
                        <span>${formatoMonedaDashboard.format(parseFloat(p.precioMayor) || 0)}</span>
                    </div>
                </li>
            `;
        }).join('');
    }

    document.getElementById('fvSearchProductModal')?.addEventListener('show.bs.modal', async () => {
        stepListEl.style.display = '';
        stepVariationEl.style.display = 'none';
        productListEl.innerHTML = `<li class="list-group-item text-center text-muted">Cargando...</li>`;
        await cargarProductosCache();
        renderProductList(productosCache);
    });

    productSearchInput?.addEventListener('input', () => {
        const termino = productSearchInput.value.trim().toLowerCase();
        const filtrada = !termino ? productosCache : productosCache.filter(p =>
            (p.nombre || '').toLowerCase().includes(termino) || (p.codigo || '').toLowerCase().includes(termino)
        );
        renderProductList(filtrada);
    });

    productListEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.fv-product-item');
        if (!item) return;
        const producto = productosCache.find(p => p.id === item.dataset.id);
        if (producto) abrirPasoVariacion(producto);
    });

    // Unidades del mismo producto/variación que ya están en el carrito —
    // para no dejar agregar más de lo que de verdad queda disponible
    // cuando se agrega la misma prenda dos veces en la misma venta.
    function cantidadYaEnCarrito(productoId, talla, color) {
        return carrito
            .filter(item => item.productoId === productoId &&
                normalizarVariacion(item.talla) === normalizarVariacion(talla) &&
                normalizarVariacion(item.color) === normalizarVariacion(color))
            .reduce((sum, item) => sum + item.cantidad, 0);
    }

    function abrirPasoVariacion(producto) {
        productoEnVariacion = producto;
        stepListEl.style.display = 'none';
        stepVariationEl.style.display = '';
        document.getElementById('fv-variation-product-name').textContent = producto.nombre || '';
        document.getElementById('fv-variation-precio').value = producto.precioMayor || 0;
        document.getElementById('fv-variation-cantidad').value = 1;

        const variaciones = producto.variaciones || [];
        const opcionesEl = document.getElementById('fv-variation-options');
        opcionesEl.innerHTML = variaciones.map((v, idx) => {
            const stock = parseInt(v.stock, 10) || 0;
            const disponible = stock - cantidadYaEnCarrito(producto.id, v.talla, v.color);
            const etiqueta = [v.talla, v.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ') || 'Única';
            return `
                <button type="button" class="btn btn-sm ${idx === 0 ? 'btn-primary' : 'btn-outline-secondary'} fv-variation-chip"
                        data-idx="${idx}" ${disponible <= 0 ? 'disabled' : ''}>
                    ${etiqueta} (${Math.max(0, disponible)})
                </button>
            `;
        }).join('');
        opcionesEl.dataset.selectedIdx = variaciones.length ? '0' : '';
    }

    document.getElementById('fv-variation-options')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.fv-variation-chip');
        if (!btn || btn.disabled) return;
        document.querySelectorAll('.fv-variation-chip').forEach(b => b.classList.replace('btn-primary', 'btn-outline-secondary'));
        btn.classList.replace('btn-outline-secondary', 'btn-primary');
        document.getElementById('fv-variation-options').dataset.selectedIdx = btn.dataset.idx;
    });

    document.getElementById('fv-product-back-btn')?.addEventListener('click', () => {
        stepVariationEl.style.display = 'none';
        stepListEl.style.display = '';
    });

    document.getElementById('fv-variation-add-btn')?.addEventListener('click', () => {
        if (!productoEnVariacion) return;
        const variaciones = productoEnVariacion.variaciones || [];
        const idx = parseInt(document.getElementById('fv-variation-options').dataset.selectedIdx, 10);
        const variacion = variaciones[idx] || null;
        const cantidad = parseInt(document.getElementById('fv-variation-cantidad').value, 10) || 0;
        const precio = limpiarNumero(document.getElementById('fv-variation-precio').value);

        if (variaciones.length && !variacion) { showToast('Selecciona una variación', 'warning'); return; }
        if (cantidad <= 0) { showToast('La cantidad debe ser mayor a 0', 'warning'); return; }

        if (variacion) {
            const stock = parseInt(variacion.stock, 10) || 0;
            const disponible = stock - cantidadYaEnCarrito(productoEnVariacion.id, variacion.talla, variacion.color);
            if (cantidad > disponible) { showToast(`Solo hay ${Math.max(0, disponible)} unidades disponibles`, 'warning'); return; }
        }

        carrito.push({
            productoId: productoEnVariacion.id,
            codigo: productoEnVariacion.codigo || '',
            nombre: productoEnVariacion.nombre || '',
            talla: variacion?.talla || '',
            color: variacion?.color || '',
            cantidad,
            precio,
            total: precio * cantidad
        });
        renderCarrito();
        bootstrap.Modal.getInstance(document.getElementById('fvSearchProductModal'))?.hide();
        showToast('Producto agregado al carrito', 'success');
    });

    // ── Guardar venta ────────────────────────────────────────────────────
    async function actualizarStockFabrica(items) {
        if (!items.length) return;
        const batch = writeBatch(db);
        const porProducto = new Map();

        for (const item of items) {
            if (!item.productoId) continue;
            const producto = productosCache.find(p => p.id === item.productoId);
            if (!producto) continue;
            if (!porProducto.has(item.productoId)) {
                porProducto.set(item.productoId, JSON.parse(JSON.stringify(producto.variaciones || [])));
            }
            const variaciones = porProducto.get(item.productoId);
            const encontrada = variaciones.find(v =>
                normalizarVariacion(v.talla) === normalizarVariacion(item.talla) &&
                normalizarVariacion(v.color) === normalizarVariacion(item.color)
            );
            if (encontrada) {
                encontrada.stock = (parseInt(encontrada.stock, 10) || 0) - item.cantidad;
            }
        }

        porProducto.forEach((variaciones, productoId) => {
            batch.update(doc(db, 'productosFabrica', productoId), { variaciones });
        });
        await batch.commit();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (carrito.length === 0) { showToast('Agrega al menos un producto', 'warning'); return; }

        const total = calcularTotal();
        const pagoEfectivo = limpiarNumero(pagoEfectivoInput.value);
        const pagoTransferencia = limpiarNumero(pagoTransferenciaInput.value);
        if (pagoEfectivo + pagoTransferencia < total) {
            showToast('El pago no cubre el total', 'warning');
            return;
        }

        const submitBtn = form.querySelector('.sv-submit-btn');
        submitBtn.disabled = true;
        try {
            const ventaData = {
                clienteId: clienteSeleccionado?.id || null,
                clienteNombre: clienteSeleccionado?.nombre || 'Cliente General',
                clienteCelular: clienteSeleccionado?.celular || '',
                clienteDireccion: clienteSeleccionado?.direccion || '',
                items: carrito,
                observaciones: observacionesInput.value.trim(),
                descuento: limpiarNumero(descuentoInput.value),
                descuentoTipo: descuentoTipoSelect.value,
                pagoEfectivo,
                pagoTransferencia,
                totalVenta: total,
                estado: 'Completada',
                origen: 'mostrador',
                timestamp: serverTimestamp(),
                tenantId: window.expectedTenantId
            };

            await addDoc(ventasCollection, ventaData);
            await actualizarStockFabrica(carrito);

            showToast('Venta registrada', 'success');
            carrito = [];
            seleccionarCliente(null);
            observacionesInput.value = '';
            descuentoInput.value = '0';
            pagoEfectivoInput.value = '0';
            pagoTransferenciaInput.value = '0';
            renderCarrito();
        } catch (error) {
            console.error('Error al registrar venta de fábrica:', error);
            showToast('No se pudo registrar la venta: ' + error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    renderCarrito();
})();

// ========================================================================
// ✅ SECCIÓN: PRODUCTOS FÁBRICA — catálogo propio, independiente de Boutique
// ========================================================================
(() => {
    const tbody = document.getElementById('prodfab-tabla-body');
    const form = document.getElementById('prodFabForm');
    if (!tbody || !form) return;

    const searchInput = document.getElementById('prodfab-search');
    const categoriaFilter = document.getElementById('prodfab-filter-categoria');
    const lowStockToggle = document.getElementById('prodfab-filter-bajo-stock');
    const btnNuevo = document.getElementById('prodfab-btn-nuevo');
    const modalTitle = document.getElementById('prodFabModalTitle');
    const idInput = document.getElementById('prodfab-id');
    const codigoInput = document.getElementById('prodfab-codigo');
    const nombreInput = document.getElementById('prodfab-nombre');
    const descripcionInput = document.getElementById('prodfab-descripcion');
    const categoriaSelect = document.getElementById('prodfab-categoria');
    const grupoMayoristaSelect = document.getElementById('prodfab-grupo-mayorista');
    const costoInput = document.getElementById('prodfab-costo');
    const precioMayorInput = document.getElementById('prodfab-precio-mayor');
    const imagenInput = document.getElementById('prodfab-imagen');
    const imagenPreview = document.getElementById('prodfab-imagen-preview');
    const visibleCheckbox = document.getElementById('prodfab-visible');
    const variacionesContainer = document.getElementById('prodfab-variaciones-container');
    const variationTemplate = document.getElementById('variation-template-fabrica');
    const addVariationBtn = document.getElementById('prodfab-add-variation-btn');
    const btnConfirmDelete = document.getElementById('prodfab-confirm-delete-btn');
    const btnGuardar = document.getElementById('prodfab-btn-guardar');

    let productos = [];
    let categoriasMap = new Map();
    let idPendienteEliminar = null;
    let imagenUrlActual = null;

    const UMBRAL_BAJO_STOCK = 2;

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    function stockTotal(producto) {
        return (producto.variaciones || []).reduce((s, v) => s + (parseFloat(v.stock) || 0), 0);
    }

    // ── Categorías (compartidas con Boutique: son solo taxonomía, sin datos
    //    de dinero — se leen tal cual, sin duplicar la colección) ──
    async function cargarCategorias() {
        try {
            const snapshot = await getDocs(categoriasCollection);
            categoriasMap = new Map(snapshot.docs.map(d => [d.id, d.data().nombre || 'Sin nombre']));
            const opciones = Array.from(categoriasMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
            categoriaSelect.innerHTML = '<option value="">Selecciona...</option>' +
                opciones.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
            categoriaFilter.innerHTML = '<option value="">Todas las categorías</option>' +
                opciones.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
        } catch (error) {
            console.error('Error al cargar categorías:', error);
        }
    }

    // ── Grupos de mayoreo (tablas de precio por cantidad, ver wholesale-tiers.js) ──
    function cargarGruposMayoristas() {
        const grupos = Object.entries(WHOLESALE_TIER_GROUPS);
        grupoMayoristaSelect.innerHTML = '<option value="">Sin grupo (precio fijo)</option>' +
            grupos.map(([clave, g]) => `<option value="${clave}">${g.label}</option>`).join('');
    }

    function renderTabla() {
        const texto = (searchInput.value || '').trim().toLowerCase();
        const categoriaId = categoriaFilter.value;
        const soloBajoStock = lowStockToggle.checked;

        const filtrados = productos.filter(p => {
            if (texto && !(p.nombre || '').toLowerCase().includes(texto)) return false;
            if (categoriaId && p.categoriaId !== categoriaId) return false;
            if (soloBajoStock && stockTotal(p) > UMBRAL_BAJO_STOCK) return false;
            return true;
        });

        if (!filtrados.length) {
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state">
                    <i class="bi bi-inbox"></i>
                    <span>No hay productos registrados</span>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = filtrados.map(p => {
            const variacionesTxt = (p.variaciones || []).length
                ? p.variaciones.map(v => `${v.talla || '—'} / ${v.color || '—'} (${v.stock ?? 0})`).join(', ')
                : 'Sin variaciones';
            const grupo = p.grupoMayorista ? (WHOLESALE_TIER_GROUPS[p.grupoMayorista]?.label || p.grupoMayorista) : '—';
            const imgSrc = p.imagenUrl || 'https://placehold.co/60x60/f5e8ed/D988B9?text=%20';
            return `<tr>
                <td><img src="${imgSrc}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;"></td>
                <td>${p.nombre || ''}${p.visible === false ? ' <span class="badge bg-secondary">Oculto</span>' : ''}</td>
                <td>${categoriasMap.get(p.categoriaId) || '—'}</td>
                <td>${grupo}</td>
                <td class="text-end">${(p.precioMayor || 0).toLocaleString('es-CO')}</td>
                <td><small>${variacionesTxt}</small></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-secondary prodfab-btn-editar" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger prodfab-btn-eliminar" data-id="${p.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    async function cargarProductos() {
        try {
            const tenantId = window.expectedTenantId;
            const clauses = [orderBy('nombre')];
            if (tenantId) clauses.unshift(where('tenantId', '==', tenantId));
            const snapshot = await getDocs(query(productosFabricaCollection, ...clauses));
            productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderTabla();
        } catch (error) {
            console.error('Error al cargar productos de fábrica:', error);
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state fin2-negative-text">
                    <i class="bi bi-exclamation-triangle"></i>
                    <span>Error al cargar: ${error.message}</span>
                </td>
            </tr>`;
        }
    }

    // ── Filtros ──
    searchInput.addEventListener('input', renderTabla);
    categoriaFilter.addEventListener('change', renderTabla);
    lowStockToggle.addEventListener('change', renderTabla);

    // ── Variaciones dinámicas (mismo patrón que el catálogo de Boutique) ──
    function agregarFilaVariacion(talla = '', color = '', stock = 1) {
        const fila = variationTemplate.cloneNode(true);
        fila.classList.remove('d-none');
        fila.removeAttribute('id');
        fila.querySelector('[name="prodfab_variation_talla[]"]').value = talla;
        fila.querySelector('[name="prodfab_variation_color[]"]').value = color;
        fila.querySelector('[name="prodfab_variation_stock[]"]').value = stock;
        fila.querySelector('.remove-variation-fabrica-btn').addEventListener('click', () => fila.remove());
        variacionesContainer.appendChild(fila);
    }
    addVariationBtn.addEventListener('click', () => agregarFilaVariacion());

    function leerVariacionesDelForm() {
        const tallas = Array.from(variacionesContainer.querySelectorAll('[name="prodfab_variation_talla[]"]'));
        return tallas.map((input, i) => {
            const fila = input.closest('.variation-row');
            const color = fila.querySelector('[name="prodfab_variation_color[]"]').value.trim();
            const stock = fila.querySelector('[name="prodfab_variation_stock[]"]').value;
            return { talla: input.value.trim(), color, stock: parseFloat(stock) || 0 };
        }).filter(v => v.talla || v.color);
    }

    // ── Abrir modal: nuevo producto ──
    function abrirModalNuevo() {
        form.reset();
        idInput.value = '';
        codigoInput.value = '';
        imagenUrlActual = null;
        imagenPreview.style.display = 'none';
        imagenPreview.src = '';
        visibleCheckbox.checked = true;
        variacionesContainer.innerHTML = '';
        agregarFilaVariacion();
        modalTitle.textContent = 'Nuevo producto';
        getModal('prodFabModal').show();
    }
    btnNuevo.addEventListener('click', abrirModalNuevo);

    // ── Editar / eliminar ──
    tbody.addEventListener('click', (e) => {
        const btnEditar = e.target.closest('.prodfab-btn-editar');
        const btnEliminar = e.target.closest('.prodfab-btn-eliminar');

        if (btnEditar) {
            const p = productos.find(x => x.id === btnEditar.dataset.id);
            if (!p) return;
            form.reset();
            idInput.value = p.id;
            codigoInput.value = p.codigo || '';
            nombreInput.value = p.nombre || '';
            descripcionInput.value = p.descripcion || '';
            categoriaSelect.value = p.categoriaId || '';
            grupoMayoristaSelect.value = p.grupoMayorista || '';
            costoInput.value = p.costoCompra || '';
            precioMayorInput.value = p.precioMayor || '';
            visibleCheckbox.checked = p.visible !== false;
            imagenUrlActual = p.imagenUrl || null;
            if (imagenUrlActual) {
                imagenPreview.src = imagenUrlActual;
                imagenPreview.style.display = 'block';
            } else {
                imagenPreview.style.display = 'none';
            }
            variacionesContainer.innerHTML = '';
            (p.variaciones && p.variaciones.length ? p.variaciones : [{}]).forEach(v =>
                agregarFilaVariacion(v.talla, v.color, v.stock ?? 1));
            modalTitle.textContent = 'Editar producto';
            getModal('prodFabModal').show();
        }

        if (btnEliminar) {
            idPendienteEliminar = btnEliminar.dataset.id;
            getModal('prodFabDeleteModal').show();
        }
    });

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'productosFabrica', idPendienteEliminar));
                showToast('Producto eliminado', 'success');
                getModal('prodFabDeleteModal').hide();
                idPendienteEliminar = null;
                cargarProductos();
            } catch (error) {
                console.error('Error al eliminar producto:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    // ── Guardar (crear/editar) ──
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = nombreInput.value.trim();
        const costoCompra = parseFloat(costoInput.value) || 0;
        const precioMayor = parseFloat(precioMayorInput.value) || 0;

        if (!nombre) {
            showToast('El nombre es requerido.', 'warning');
            return;
        }

        const id = idInput.value;
        const guardarTexto = btnGuardar.querySelector('.save-text');
        const spinner = btnGuardar.querySelector('.spinner-border');
        btnGuardar.disabled = true;
        if (guardarTexto) guardarTexto.classList.add('d-none');
        if (spinner) spinner.classList.remove('d-none');

        try {
            let imagenUrl = imagenUrlActual;
            const archivo = imagenInput.files[0];
            if (archivo) {
                const comprimida = await compressProductImageFile(archivo);
                // Mismo prefijo de carpeta que usa Boutique (product_images/):
                // no es dato de negocio compartido, solo evita depender de que
                // las reglas de Storage (no versionadas en este repo) ya
                // permitan una carpeta nueva antes de desplegar esto.
                const storageRef = ref(storage, `product_images/${Date.now()}-fabrica-${comprimida.name}`);
                await uploadBytes(storageRef, comprimida);
                imagenUrl = await getDownloadURL(storageRef);
            }

            const datos = {
                nombre,
                descripcion: descripcionInput.value.trim(),
                categoriaId: categoriaSelect.value || null,
                grupoMayorista: grupoMayoristaSelect.value || null,
                costoCompra,
                precioMayor,
                visible: visibleCheckbox.checked,
                imagenUrl,
                variaciones: leerVariacionesDelForm(),
                tenantId: window.expectedTenantId
            };

            if (id) {
                await updateDoc(doc(db, 'productosFabrica', id), datos);
                showToast('Producto actualizado', 'success');
            } else {
                await addDoc(productosFabricaCollection, {
                    ...datos,
                    codigo: 'PF' + Date.now().toString().slice(-6),
                    timestamp: serverTimestamp()
                });
                showToast('Producto guardado', 'success');
            }

            getModal('prodFabModal').hide();
            form.reset();
            cargarProductos();
        } catch (error) {
            console.error('Error al guardar producto de fábrica:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            btnGuardar.disabled = false;
            if (guardarTexto) guardarTexto.classList.remove('d-none');
            if (spinner) spinner.classList.add('d-none');
        }
    });

    // ── Cargar al entrar a la sección ──
    const tabLink = document.querySelector('a[href="#productos-fabrica"]');
    if (tabLink) tabLink.addEventListener('click', () => { cargarCategorias(); cargarProductos(); });
    window.addEventListener('hashchange', () => {
        if ((window.location.hash || '') === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }
    });
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }
    });

    cargarGruposMayoristas();
    if ((window.location.hash || '') === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }

    console.log("✅ Módulo Productos Fábrica inicializado");
})();

// ========================================================================
// ✅ SECCIÓN: FÁBRICA — Gastos vs. Ingresos (segmento propio, exclusivo)
// Utilidad = total ingresos − total gastos, registrados manualmente
// ========================================================================
(() => {
    // ── DOM refs ──
    const filterBtns     = document.querySelectorAll('.fab-filter-btn');
    const customRangeBar = document.getElementById('fab-custom-range');
    const inputDesde      = document.getElementById('fab-desde');
    const inputHasta      = document.getElementById('fab-hasta');
    const btnCalc         = document.getElementById('fab-btn-calc');
    const loadingDiv      = document.getElementById('fab-loading');
    const resultadosDiv   = document.getElementById('fab-resultados');
    const btnNuevoIngreso = document.getElementById('fab-btn-nuevo-ingreso');
    const btnNuevoGasto   = document.getElementById('fab-btn-nuevo-gasto');
    const movForm         = document.getElementById('fabricaMovForm');
    const movModalTitle   = document.getElementById('fabricaMovModalTitle');
    const movIdInput      = document.getElementById('fabricaMov-id');
    const movTipoInput    = document.getElementById('fabricaMov-tipo');
    const movConceptoInput = document.getElementById('fabricaMov-concepto');
    const movMontoInput   = document.getElementById('fabricaMov-monto');
    const movFechaInput   = document.getElementById('fabricaMov-fecha');
    const tbody           = document.getElementById('fab-tabla-body');
    const btnConfirmDelete = document.getElementById('fabrica-confirm-delete-btn');

    if (!filterBtns.length || !movForm) return;

    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    let idPendienteEliminar = null;
    let ultimoRango = { desde: null, hasta: null, label: 'Desde junio' };
    let lineChartInstance = null;

    // Inicio real de operaciones de Fábrica: los datos anteriores a esta fecha
    // eran pruebas y no deben mezclarse en la tabla ni en la gráfica.
    const INICIO_FABRICA = new Date(2026, 5, 1, 0, 0, 0, 0);

    function fechaDeMovimiento(m) {
        return m.fecha?.toDate ? m.fecha.toDate() : (m.timestamp?.toDate ? m.timestamp.toDate() : new Date(0));
    }

    // ── Colores validados (ver skill dataviz): verde ingresos, rojo gastos ──
    function coloresGrafica() {
        const dark = document.body.classList.contains('dark-mode');
        return {
            ingresos: '#008300',
            gastos: dark ? '#e66767' : '#e34948',
            tick: dark ? '#c3c2b7' : '#898781',
            grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            surface: dark ? '#1a1a19' : '#fcfcfb'
        };
    }

    // ── Plugin: etiqueta directa con el último valor de cada línea ──
    const fabEndLabelsPlugin = {
        id: 'fabEndLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const { tick } = coloresGrafica();
            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden || !meta.data.length) return;
                const lastPoint = meta.data[meta.data.length - 1];
                const value = dataset.data[dataset.data.length - 1];
                ctx.save();
                ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
                ctx.fillStyle = tick;
                ctx.textBaseline = 'middle';
                const alignRight = lastPoint.x > chart.chartArea.right - 60;
                ctx.textAlign = alignRight ? 'right' : 'left';
                ctx.fillText(fmt.format(value), lastPoint.x + (alignRight ? -8 : 8), lastPoint.y - 10);
                ctx.restore();
            });
        }
    };

    // ── Agrupar ingresos/gastos por día (o por mes en rangos largos) ──
    function buildLineChartData(movimientos, desde, hasta) {
        const diffDays = Math.max(1, Math.round((hasta - desde) / (1000 * 60 * 60 * 24)));
        const porMes = diffDays > 60;

        const keyFor = fecha => porMes
            ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
            : fecha.toISOString().slice(0, 10);

        const buckets = new Map();
        if (porMes) {
            const cur = new Date(desde.getFullYear(), desde.getMonth(), 1);
            const end = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
            while (cur <= end) {
                buckets.set(keyFor(cur), { ingresos: 0, gastos: 0 });
                cur.setMonth(cur.getMonth() + 1);
            }
        } else {
            const cur = new Date(desde); cur.setHours(0, 0, 0, 0);
            const end = new Date(hasta); end.setHours(0, 0, 0, 0);
            while (cur <= end) {
                buckets.set(keyFor(cur), { ingresos: 0, gastos: 0 });
                cur.setDate(cur.getDate() + 1);
            }
        }

        movimientos.forEach(m => {
            const fecha = m.fecha?.toDate ? m.fecha.toDate() : (m.timestamp?.toDate ? m.timestamp.toDate() : new Date());
            const key = keyFor(fecha);
            if (!buckets.has(key)) buckets.set(key, { ingresos: 0, gastos: 0 });
            const bucket = buckets.get(key);
            const monto = parseFloat(m.monto) || 0;
            if (m.tipo === 'ingreso') bucket.ingresos += monto; else bucket.gastos += monto;
        });

        const keys = Array.from(buckets.keys()).sort();
        const labels = keys.map(key => {
            if (porMes) {
                const [y, mm] = key.split('-').map(Number);
                return new Date(y, mm - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
            }
            return new Date(key + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
        });

        return {
            labels,
            ingresosData: keys.map(k => Math.round(buckets.get(k).ingresos)),
            gastosData: keys.map(k => Math.round(buckets.get(k).gastos)),
            porMes
        };
    }

    // ── Renderizar la gráfica de dos líneas ──
    function renderLineChart(labels, ingresosData, gastosData) {
        const canvas = document.getElementById('fab-lineas-chart');
        if (!canvas) return;

        const { ingresos: colorIngresos, gastos: colorGastos, tick, grid, surface } = coloresGrafica();

        if (lineChartInstance) {
            lineChartInstance.destroy();
            lineChartInstance = null;
        }

        lineChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Ingresos',
                        data: ingresosData,
                        borderColor: colorIngresos,
                        backgroundColor: colorIngresos + '1A',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: colorIngresos,
                        pointBorderColor: surface,
                        pointBorderWidth: 2,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Gastos',
                        data: gastosData,
                        borderColor: colorGastos,
                        backgroundColor: colorGastos + '1A',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: colorGastos,
                        pointBorderColor: surface,
                        pointBorderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: tick,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            boxHeight: 8,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: tick, font: { size: 11 } }
                    },
                    y: {
                        grid: { color: grid },
                        ticks: {
                            color: tick,
                            font: { size: 11 },
                            callback: v => fmt.format(v)
                        }
                    }
                }
            },
            plugins: [fabEndLabelsPlugin]
        });
    }

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    // ── Parsear fecha "YYYY-MM-DD" como hora local (NO UTC) ──
    function parseLocalDate(str) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // ── Rangos de fecha ──
    function getDateRange(range) {
        const now = new Date();
        const hoyInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const hoyFin    = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        switch (range) {
            case 'hoy':
                return { desde: hoyInicio, hasta: hoyFin, label: 'Hoy' };
            case 'ayer': {
                const desde = new Date(hoyInicio);
                desde.setDate(desde.getDate() - 1);
                const hasta = new Date(desde);
                hasta.setHours(23, 59, 59, 999);
                return { desde, hasta, label: 'Ayer' };
            }
            case 'semana': {
                const desde = new Date(hoyInicio);
                desde.setDate(desde.getDate() - 6);
                return { desde, hasta: hoyFin, label: 'Esta semana' };
            }
            case 'mes': {
                const desde = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                return { desde, hasta: hoyFin, label: 'Este mes' };
            }
            default: // 'todo'
                return { desde: INICIO_FABRICA, hasta: hoyFin, label: 'Desde junio' };
        }
    }

    // ── Desglose por concepto: cuánto ingresó/salió por cada tipo de
    // movimiento, no solo el total. Las entradas automáticas de venta se
    // agrupan por su origen (ignorando el nombre del cliente, que las
    // volvería todas "distintas"); las manuales se agrupan por su texto de
    // concepto tal cual lo escribió el usuario (sin importar mayúsculas). ──
    function claveConcepto(m) {
        if (m.origenVenta) {
            const id = String(m.id);
            if (id.startsWith('mayorista_detal_')) return 'Costo mercancía (proveedor Boutique)';
            if (id.startsWith('costo_')) return 'Costo mercancía recuperado (venta detal)';
            return 'Ventas mayoristas';
        }
        return (m.concepto || 'Sin concepto').trim() || 'Sin concepto';
    }

    function agruparPorConcepto(lista) {
        const grupos = new Map();
        lista.forEach(m => {
            const nombre = claveConcepto(m);
            const clave = nombre.toLowerCase();
            if (!grupos.has(clave)) grupos.set(clave, { nombre, total: 0 });
            grupos.get(clave).total += parseFloat(m.monto) || 0;
        });
        return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
    }

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }

    function renderDesglose(containerId, countId, grupos, total, tipo) {
        const container = document.getElementById(containerId);
        const countEl = document.getElementById(countId);
        if (!container) return;

        if (countEl) countEl.textContent = `${grupos.length} concepto${grupos.length === 1 ? '' : 's'}`;

        if (grupos.length === 0) {
            container.innerHTML = `<div class="fin2-empty-state">
                <i class="bi bi-inbox"></i>
                <span>Sin ${tipo === 'ingreso' ? 'ingresos' : 'gastos'} en este periodo</span>
            </div>`;
            return;
        }

        const colorClass = tipo === 'ingreso' ? 'fin2-breakdown-bar-fill--ingreso' : 'fin2-breakdown-bar-fill--gasto';
        container.innerHTML = grupos.map(g => {
            const pct = total > 0 ? (g.total / total) * 100 : 0;
            return `<div class="fin2-breakdown-row">
                <div class="fin2-breakdown-top">
                    <span class="fin2-breakdown-name">${escaparHtml(g.nombre)}</span>
                    <span class="fin2-breakdown-amount">${fmt.format(g.total)}</span>
                </div>
                <div class="fin2-breakdown-bar-track">
                    <div class="fin2-breakdown-bar-fill ${colorClass}" style="width:${pct.toFixed(1)}%"></div>
                </div>
                <span class="fin2-breakdown-pct">${pct.toFixed(1)}%</span>
            </div>`;
        }).join('');
    }

    // ── Consulta y renderizado principal ──
    async function calcularFabrica(desde, hasta, label) {
        ultimoRango = { desde, hasta, label };

        if (loadingDiv)    loadingDiv.style.display    = 'flex';
        if (resultadosDiv) resultadosDiv.style.display = 'none';

        try {
            const tenantId = window.expectedTenantId;
            const clauses = [orderBy('timestamp', 'desc')];
            if (tenantId) clauses.unshift(where('tenantId', '==', tenantId));

            const snapshot = await getDocs(query(fabricaCollection, ...clauses));

            let movimientos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => fechaDeMovimiento(b) - fechaDeMovimiento(a));

            if (desde && hasta) {
                movimientos = movimientos.filter(m => {
                    const fecha = fechaDeMovimiento(m);
                    return fecha >= desde && fecha <= hasta;
                });
            }

            const totalIngresos = movimientos
                .filter(m => m.tipo === 'ingreso')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
            const totalGastos = movimientos
                .filter(m => m.tipo === 'gasto')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
            const utilidad = totalIngresos - totalGastos;

            // ── KPI principal ──
            const elUtilidad = document.getElementById('fab-utilidad-total');
            elUtilidad.textContent = (utilidad >= 0 ? '+' : '−') + fmt.format(Math.abs(utilidad));
            elUtilidad.className   = 'fin2-hero-value ' + (utilidad >= 0 ? 'fin2-positive' : 'fin2-negative');

            const trendBadge = document.getElementById('fab-trend-badge');
            if (utilidad > 0) {
                trendBadge.innerHTML = '<i class="bi bi-arrow-up-right"></i> Utilidad positiva';
                trendBadge.className = 'fin2-hero-trend fin2-trend-up';
            } else if (utilidad < 0) {
                trendBadge.innerHTML = '<i class="bi bi-arrow-down-right"></i> Utilidad negativa';
                trendBadge.className = 'fin2-hero-trend fin2-trend-down';
            } else {
                trendBadge.innerHTML = '<i class="bi bi-dash"></i> Sin movimientos';
                trendBadge.className = 'fin2-hero-trend';
            }

            document.getElementById('fab-ingresos').textContent = fmt.format(totalIngresos);
            document.getElementById('fab-gastos').textContent   = fmt.format(totalGastos);

            // ── Desglose: cuánto fue cada concepto de ingreso/gasto ──
            const ingresosPorConcepto = agruparPorConcepto(movimientos.filter(m => m.tipo === 'ingreso'));
            const gastosPorConcepto   = agruparPorConcepto(movimientos.filter(m => m.tipo === 'gasto'));
            renderDesglose('fab-desglose-ingresos', 'fab-desglose-ingresos-count', ingresosPorConcepto, totalIngresos, 'ingreso');
            renderDesglose('fab-desglose-gastos', 'fab-desglose-gastos-count', gastosPorConcepto, totalGastos, 'gasto');

            // ── Gráfica: ingresos vs. gastos en el tiempo ──
            let desdeGrafica = desde;
            let hastaGrafica = hasta;
            if (!desdeGrafica || !hastaGrafica) {
                if (movimientos.length) {
                    const fechas = movimientos.map(fechaDeMovimiento);
                    desdeGrafica = new Date(Math.min(...fechas));
                    hastaGrafica = new Date(Math.max(...fechas));
                } else {
                    desdeGrafica = new Date();
                    hastaGrafica = new Date();
                }
            }
            const { labels: chartLabels, ingresosData, gastosData, porMes } = buildLineChartData(movimientos, desdeGrafica, hastaGrafica);
            renderLineChart(chartLabels, ingresosData, gastosData);
            const chartSubtitle = document.getElementById('fab-chart-subtitle');
            if (chartSubtitle) chartSubtitle.textContent = porMes ? 'por mes' : 'por día';

            // ── Tabla ──
            document.getElementById('fab-movs-count').textContent =
                `${movimientos.length} movimiento${movimientos.length !== 1 ? 's' : ''}`;

            if (movimientos.length === 0) {
                tbody.innerHTML = `<tr>
                    <td colspan="5" class="fin2-empty-state">
                        <i class="bi bi-inbox"></i>
                        <span>No hay movimientos en este periodo</span>
                    </td>
                </tr>`;
            } else {
                tbody.innerHTML = movimientos.map(m => {
                    const fecha = fechaDeMovimiento(m);
                    const esIngreso = m.tipo === 'ingreso';
                    const badgeCls  = esIngreso ? 'bg-success' : 'bg-danger';
                    const badgeTxt  = esIngreso ? 'Ingreso' : 'Gasto';
                    const colorCls  = esIngreso ? 'fin2-positive-text' : 'fin2-negative-text';
                    const signo     = esIngreso ? '+' : '−';
                    const acciones  = m.origenVenta
                        ? `<span class="text-muted small">${String(m.id).startsWith('costo_') ? 'Costo venta detal' : 'Venta mayorista'}</span>`
                        : `<button class="btn btn-sm btn-outline-secondary fab-btn-editar" data-id="${m.id}"><i class="bi bi-pencil"></i></button>
                           <button class="btn btn-sm btn-outline-danger fab-btn-eliminar" data-id="${m.id}"><i class="bi bi-trash"></i></button>`;
                    return `<tr>
                        <td>${fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
                        <td>${m.concepto || ''}</td>
                        <td class="text-end ${colorCls} fw-semibold">${signo}${fmt.format(parseFloat(m.monto) || 0)}</td>
                        <td class="text-end">${acciones}</td>
                    </tr>`;
                }).join('');
            }

            if (loadingDiv)    loadingDiv.style.display    = 'none';
            if (resultadosDiv) resultadosDiv.style.display = 'block';

        } catch (error) {
            console.error("Error calculando Fábrica:", error);
            if (loadingDiv)    loadingDiv.style.display    = 'none';
            if (resultadosDiv) resultadosDiv.style.display = 'block';
            tbody.innerHTML = `<tr><td colspan="5" class="fin2-empty-state fin2-negative-text">
                <i class="bi bi-exclamation-triangle"></i>
                <span>Error al cargar datos: ${error.message}</span>
            </td></tr>`;
        }
    }

    // ── Event: botones de filtro ──
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const range = btn.dataset.range;

            if (range === 'personalizado') {
                if (customRangeBar) customRangeBar.style.display = 'flex';
                return;
            }
            if (customRangeBar) customRangeBar.style.display = 'none';
            const { desde, hasta, label } = getDateRange(range);
            calcularFabrica(desde, hasta, label);
        });
    });

    // ── Event: rango personalizado ──
    if (btnCalc) {
        btnCalc.addEventListener('click', () => {
            if (!inputDesde.value || !inputHasta.value) {
                showToast('Selecciona ambas fechas', 'warning');
                return;
            }
            const desde = parseLocalDate(inputDesde.value);
            const hasta = parseLocalDate(inputHasta.value);
            hasta.setHours(23, 59, 59, 999);
            calcularFabrica(desde, hasta,
                `${desde.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'})} — ${hasta.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'})}`);
        });
    }

    // ── Auto-calcular al entrar a la sección ──
    // Cubre tanto el clic en el link del rail como llegar directo a #fabrica
    // (recarga de página, botón atrás/adelante, o redirección automática de
    // aplicarPermisosNav cuando la sección activa no estaba permitida), casos
    // en los que nunca se dispara un evento "click" sobre el link del rail.
    let fabricaYaCargada = false;
    function cargarFabricaSiCorresponde() {
        if ((window.location.hash || '') !== '#fabrica') return;
        fabricaYaCargada = true;
        const { desde, hasta, label } = getDateRange('todo');
        calcularFabrica(desde, hasta, label);
    }

    const tabLink = document.querySelector('a[href="#fabrica"]');
    if (tabLink) {
        tabLink.addEventListener('click', () => {
            const { desde, hasta, label } = getDateRange('todo');
            calcularFabrica(desde, hasta, label);
        });
    }
    window.addEventListener('hashchange', cargarFabricaSiCorresponde);
    // Ver el mismo comentario en Finanzas: history.replaceState no dispara
    // 'hashchange', así que este evento es el que cubre la navegación real
    // dentro de la app (rail de escritorio o barra inferior móvil).
    window.addEventListener('admin:section-shown', cargarFabricaSiCorresponde);
    if (!fabricaYaCargada) cargarFabricaSiCorresponde();

    // ── Abrir modal: Nuevo Ingreso / Nuevo Gasto ──
    function abrirModalNuevo(tipo) {
        movForm.reset();
        movIdInput.value = '';
        movTipoInput.value = tipo;
        movModalTitle.textContent = tipo === 'ingreso' ? 'Nuevo Ingreso' : 'Nuevo Gasto';
        movFechaInput.value = new Date().toISOString().slice(0, 10);
        getModal('fabricaMovModal').show();
    }

    if (btnNuevoIngreso) btnNuevoIngreso.addEventListener('click', () => abrirModalNuevo('ingreso'));
    if (btnNuevoGasto)   btnNuevoGasto.addEventListener('click', () => abrirModalNuevo('gasto'));

    // ── Editar movimiento ──
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.fab-btn-editar');
            const btnEliminar = e.target.closest('.fab-btn-eliminar');

            if (btnEditar) {
                const id = btnEditar.dataset.id;
                try {
                    const docSnap = await getDoc(doc(db, 'movimientosFabrica', id));
                    if (!docSnap.exists()) return;
                    const data = docSnap.data();
                    movForm.reset();
                    movIdInput.value = id;
                    movTipoInput.value = data.tipo;
                    movConceptoInput.value = data.concepto || '';
                    movMontoInput.value = data.monto || '';
                    const fecha = data.fecha?.toDate ? data.fecha.toDate() : new Date();
                    movFechaInput.value = fecha.toISOString().slice(0, 10);
                    movModalTitle.textContent = data.tipo === 'ingreso' ? 'Editar Ingreso' : 'Editar Gasto';
                    getModal('fabricaMovModal').show();
                } catch (error) {
                    console.error('Error al cargar movimiento:', error);
                    showToast('Error al cargar el movimiento', 'error');
                }
            }

            if (btnEliminar) {
                idPendienteEliminar = btnEliminar.dataset.id;
                getModal('fabricaDeleteModal').show();
            }
        });
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'movimientosFabrica', idPendienteEliminar));
                showToast('Movimiento eliminado', 'success');
                getModal('fabricaDeleteModal').hide();
                idPendienteEliminar = null;
                calcularFabrica(ultimoRango.desde, ultimoRango.hasta, ultimoRango.label);
            } catch (error) {
                console.error('Error al eliminar movimiento:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    // ── Guardar (crear/editar) ──
    movForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = movIdInput.value;
        const tipo = movTipoInput.value;
        const concepto = movConceptoInput.value.trim();
        const monto = parseFloat(movMontoInput.value);
        const fecha = movFechaInput.value ? parseLocalDate(movFechaInput.value) : new Date();

        if (!concepto || !monto || monto <= 0) {
            showToast('Concepto y monto son requeridos.', 'warning');
            return;
        }

        const btnGuardar = document.getElementById('fabricaMov-btn-guardar');
        btnGuardar.disabled = true;

        try {
            const datos = {
                tipo,
                concepto,
                monto,
                fecha: Timestamp.fromDate(fecha),
                tenantId: window.expectedTenantId
            };

            if (id) {
                await updateDoc(doc(db, 'movimientosFabrica', id), datos);
                showToast('Movimiento actualizado', 'success');
            } else {
                await addDoc(fabricaCollection, { ...datos, timestamp: serverTimestamp() });
                showToast(tipo === 'ingreso' ? 'Ingreso guardado' : 'Gasto guardado', 'success');
            }

            getModal('fabricaMovModal').hide();
            movForm.reset();
            calcularFabrica(ultimoRango.desde, ultimoRango.hasta, ultimoRango.label);
        } catch (error) {
            console.error('Error al guardar movimiento de fábrica:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            btnGuardar.disabled = false;
        }
    });

    console.log("✅ Módulo Fábrica inicializado (Gastos vs. Ingresos)");
})();

// ========================================================================
// ✅ SECCIÓN: INVENTARIO FÁBRICA — Hilazas, Hilos y Telas
// ========================================================================
(() => {
    const TIPOS = {
        hilaza: 'Hilaza',
        hilo: 'Hilo',
        tela: 'Tela'
    };

    const tbody          = document.getElementById('invfab-tabla-body');
    const btnNuevo        = document.getElementById('invfab-btn-nuevo');
    const form            = document.getElementById('invfabForm');
    const modalTitle       = document.getElementById('invfabModalTitle');
    const idInput          = document.getElementById('invfab-id');
    const tipoInput        = document.getElementById('invfab-tipo');
    const nombreInput      = document.getElementById('invfab-nombre');
    const colorInput       = document.getElementById('invfab-color');
    const cantidadInput    = document.getElementById('invfab-cantidad');
    const unidadInput      = document.getElementById('invfab-unidad');
    const stockMinInput    = document.getElementById('invfab-stock-minimo');
    const proveedorInput   = document.getElementById('invfab-proveedor');
    const notasInput       = document.getElementById('invfab-notas');
    const btnConfirmDelete = document.getElementById('invfab-confirm-delete-btn');
    const searchInput      = document.getElementById('invfab-search');
    const filterBtns       = document.querySelectorAll('.invfab-filter-btn');
    const lowStockToggle   = document.getElementById('invfab-filter-bajo-stock');

    if (!tbody || !form) return;

    let items = [];
    let idPendienteEliminar = null;
    let filtroTipo = 'todos';

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    function esBajoStock(item) {
        const min = parseFloat(item.stockMinimo) || 0;
        return min > 0 && (parseFloat(item.cantidad) || 0) <= min;
    }

    function renderTabla() {
        const texto = (searchInput?.value || '').trim().toLowerCase();
        const soloBajoStock = !!lowStockToggle?.checked;

        const filtrados = items.filter(it => {
            if (filtroTipo !== 'todos' && it.tipo !== filtroTipo) return false;
            if (soloBajoStock && !esBajoStock(it)) return false;
            if (texto) {
                const hay = `${it.nombre || ''} ${it.color || ''} ${it.proveedor || ''}`.toLowerCase();
                if (!hay.includes(texto)) return false;
            }
            return true;
        });

        if (!filtrados.length) {
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state">
                    <i class="bi bi-inbox"></i>
                    <span>No hay materiales registrados</span>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = filtrados.map(it => {
            const bajo = esBajoStock(it);
            const unidad = it.unidad || '';
            return `<tr>
                <td><span class="badge bg-secondary">${TIPOS[it.tipo] || it.tipo}</span></td>
                <td>${it.nombre || ''}</td>
                <td>${it.color || '—'}</td>
                <td class="text-end">${it.cantidad ?? 0} ${unidad}</td>
                <td class="text-end">${it.stockMinimo ? it.stockMinimo + ' ' + unidad : '—'}</td>
                <td>${it.proveedor || '—'}</td>
                <td class="text-end">
                    ${bajo ? '<span class="badge bg-warning text-dark me-1" title="Bajo stock"><i class="bi bi-exclamation-triangle-fill"></i></span>' : ''}
                    <button class="btn btn-sm btn-outline-secondary invfab-btn-editar" data-id="${it.id}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger invfab-btn-eliminar" data-id="${it.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    function actualizarResumenDashboard() {
        const conteo = { hilaza: 0, hilo: 0, tela: 0 };
        let bajoStockCount = 0;
        items.forEach(it => {
            if (conteo[it.tipo] !== undefined) conteo[it.tipo]++;
            if (esBajoStock(it)) bajoStockCount++;
        });
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setText('db-inv-fab-hilazas', conteo.hilaza);
        setText('db-inv-fab-hilos', conteo.hilo);
        setText('db-inv-fab-telas', conteo.tela);
        setText('db-inv-fab-bajo-stock', bajoStockCount);
    }

    async function cargarInventario() {
        try {
            const tenantId = window.expectedTenantId;
            const clauses = [orderBy('nombre')];
            if (tenantId) clauses.unshift(where('tenantId', '==', tenantId));
            const snapshot = await getDocs(query(inventarioFabricaCollection, ...clauses));
            items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderTabla();
            actualizarResumenDashboard();
        } catch (error) {
            console.error('Error al cargar inventario de fábrica:', error);
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state fin2-negative-text">
                    <i class="bi bi-exclamation-triangle"></i>
                    <span>Error al cargar: ${error.message}</span>
                </td>
            </tr>`;
        }
    }

    // ── Navegación desde las tarjetas del dashboard ──
    window.irAInventarioFabrica = function(tipo, soloBajoStock) {
        const link = document.querySelector('a[href="#inventario-fabrica"]');
        if (link) link.click();
        setTimeout(() => {
            const btn = document.querySelector(`.invfab-filter-btn[data-tipo="${tipo || 'todos'}"]`);
            if (btn) btn.click();
            if (lowStockToggle) {
                lowStockToggle.checked = !!soloBajoStock;
                renderTabla();
            }
        }, 50);
    };

    // ── Filtros ──
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroTipo = btn.dataset.tipo;
            renderTabla();
        });
    });
    if (searchInput)    searchInput.addEventListener('input', renderTabla);
    if (lowStockToggle) lowStockToggle.addEventListener('change', renderTabla);

    // ── Abrir modal: Nuevo material ──
    function abrirModalNuevo() {
        form.reset();
        idInput.value = '';
        tipoInput.value = filtroTipo !== 'todos' ? filtroTipo : 'hilaza';
        modalTitle.textContent = 'Nuevo material';
        getModal('invfabModal').show();
    }
    if (btnNuevo) btnNuevo.addEventListener('click', abrirModalNuevo);

    // ── Editar / eliminar ──
    tbody.addEventListener('click', (e) => {
        const btnEditar   = e.target.closest('.invfab-btn-editar');
        const btnEliminar = e.target.closest('.invfab-btn-eliminar');

        if (btnEditar) {
            const item = items.find(it => it.id === btnEditar.dataset.id);
            if (!item) return;
            form.reset();
            idInput.value       = item.id;
            tipoInput.value     = item.tipo || 'hilaza';
            nombreInput.value   = item.nombre || '';
            colorInput.value    = item.color || '';
            cantidadInput.value = item.cantidad ?? '';
            unidadInput.value   = item.unidad || 'metros';
            stockMinInput.value = item.stockMinimo || '';
            proveedorInput.value = item.proveedor || '';
            notasInput.value    = item.notas || '';
            modalTitle.textContent = 'Editar material';
            getModal('invfabModal').show();
        }

        if (btnEliminar) {
            idPendienteEliminar = btnEliminar.dataset.id;
            getModal('invfabDeleteModal').show();
        }
    });

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'inventarioFabrica', idPendienteEliminar));
                showToast('Material eliminado', 'success');
                getModal('invfabDeleteModal').hide();
                idPendienteEliminar = null;
                cargarInventario();
            } catch (error) {
                console.error('Error al eliminar material:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    // ── Guardar (crear/editar) ──
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = idInput.value;
        const nombre = nombreInput.value.trim();
        const cantidad = parseFloat(cantidadInput.value);

        if (!nombre || isNaN(cantidad) || cantidad < 0) {
            showToast('Nombre y cantidad son requeridos.', 'warning');
            return;
        }

        const btnGuardar = document.getElementById('invfab-btn-guardar');
        btnGuardar.disabled = true;

        try {
            const datos = {
                tipo: tipoInput.value,
                nombre,
                color: colorInput.value.trim(),
                cantidad,
                unidad: unidadInput.value,
                stockMinimo: stockMinInput.value ? parseFloat(stockMinInput.value) : 0,
                proveedor: proveedorInput.value.trim(),
                notas: notasInput.value.trim(),
                tenantId: window.expectedTenantId
            };

            if (id) {
                await updateDoc(doc(db, 'inventarioFabrica', id), datos);
                showToast('Material actualizado', 'success');
            } else {
                await addDoc(inventarioFabricaCollection, { ...datos, timestamp: serverTimestamp() });
                showToast('Material guardado', 'success');
            }

            getModal('invfabModal').hide();
            form.reset();
            cargarInventario();
        } catch (error) {
            console.error('Error al guardar material:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            btnGuardar.disabled = false;
        }
    });

    // ── Cargar al entrar a la sección, y una vez al inicio para alimentar
    //    el resumen del dashboard (Hilazas/Hilos/Telas/Bajo stock) ──
    const tabLink = document.querySelector('a[href="#inventario-fabrica"]');
    if (tabLink) tabLink.addEventListener('click', cargarInventario);
    window.addEventListener('hashchange', () => {
        if ((window.location.hash || '') === '#inventario-fabrica') cargarInventario();
    });
    // Cubre también la barra inferior móvil / navegación por hash sin click
    // directo en el link de arriba (ver mismo caso en Finanzas y Fábrica).
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === '#inventario-fabrica') cargarInventario();
    });
    cargarInventario();

    console.log("✅ Módulo Inventario Fábrica inicializado (Hilazas, Hilos, Telas)");
})();
