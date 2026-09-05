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
    initializeFirestore, collection, getDocs, query, where, orderBy, limit, doc,
    getDoc, deleteDoc, updateDoc, addDoc, serverTimestamp, Timestamp,
    onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { WHOLESALE_TIER_GROUPS, resolveWholesaleGroup } from "./wholesale-tiers.js";

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

// --- Carga perezosa de librerías externas pesadas (mismo patrón que
// admin.js): solo se inyectan cuando de verdad se necesitan (Cargue Masivo
// necesita 'xlsx', Etiquetas necesita 'qrcode'), y la promesa se cachea para
// no duplicar el <script>. Expuesta en window porque etiquetas-fabrica.js
// es un script global aparte (no módulo), igual que en Boutique. ---
const EXTERNAL_LIB_URLS = {
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
};
const _externalLibPromises = {};
function loadExternalLib(name) {
    if (_externalLibPromises[name]) return _externalLibPromises[name];
    const src = EXTERNAL_LIB_URLS[name];
    if (!src) return Promise.reject(new Error(`Librería externa desconocida: ${name}`));
    _externalLibPromises[name] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => { delete _externalLibPromises[name]; reject(new Error(`No se pudo cargar ${name}`)); };
        document.head.appendChild(script);
    });
    return _externalLibPromises[name];
}
window.loadExternalLib = loadExternalLib;

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

// --- Helper: Open WhatsApp (PWA Compatible, misma lógica que admin.js) ---
function openWhatsApp(url) {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true ||
                  document.referrer.includes('android-app://');
    if (isPWA || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.href = url;
    } else {
        const ventana = window.open(url, '_blank');
        if (!ventana) window.location.href = url;
    }
}

const fabricaCollection = collection(db, 'movimientosFabrica');
const inventarioFabricaCollection = collection(db, 'inventarioFabrica');
const productosFabricaCollection = collection(db, 'productosFabrica');
const categoriasCollection = collection(db, 'categorias');
const ventasCollection = collection(db, 'ventas');
// Compartida con Boutique (index.html escribe con tenantId 'boutique', mayor.html
// con tenantId 'fabrica') — ver SECCIÓN: PEDIDOS WEB más abajo, que filtra por
// tenantId en JS para quedarse solo con los pedidos mayoristas de Fábrica.
const webOrdersCollection = collection(db, 'pedidosWeb');

const formatoMonedaDashboard = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ========================================================================
// ✅ SECCIÓN: DASHBOARD FÁBRICA — pantalla de inicio estilo app móvil (saludo
// + cuadrícula de accesos directos), seguida del resumen financiero
// (inversión, bajo stock, ventas y utilidad) que ya traía el Dashboard
// anterior. La navegación de las tarjetas de acceso la maneja el script
// inline de admin-fabrica.html (showSection/markActive), igual que el
// sidebar; aquí solo se calculan los números del resumen.
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

    // Listener en tiempo real: el resumen (inversión, bajo stock, unidades)
    // se recalcula solo apenas cambia CUALQUIER producto — una venta, una
    // edición, un cargue masivo — sin esperar a que alguien vuelva a entrar
    // al Dashboard.
    onSnapshot(productosFabricaCollection, (snapshot) => {
        try {
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
    }, (error) => {
        console.error('Error en el listener de productos del dashboard de fábrica:', error);
    });

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

    // Listener en tiempo real por rango: cada venta nueva (o anulación)
    // actualiza el total al instante, sin esperar a cambiar de pestaña o
    // recargar. Como el rango cambia con los botones, se guarda la función
    // para cancelar el listener anterior antes de suscribirse al nuevo.
    let cancelarListenerVentasFabrica = null;
    function calcularVentasFabrica(rango) {
        if (cancelarListenerVentasFabrica) { cancelarListenerVentasFabrica(); cancelarListenerVentasFabrica = null; }

        const tituloEl = document.getElementById('fdb-ventas-periodo-title');
        if (tituloEl) tituloEl.textContent = ETIQUETAS_RANGO_DASHBOARD[rango] || 'Ventas hoy';

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
        cancelarListenerVentasFabrica = onSnapshot(q, (snapshot) => {
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
        }, (error) => {
            console.error('Error al calcular ventas del dashboard de fábrica:', error);
            const el = document.getElementById('fdb-ventas-periodo');
            if (el) el.textContent = 'Error';
        });
    }

    document.querySelectorAll('#dashboard .db2-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#dashboard .db2-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calcularVentasFabrica(btn.dataset.range);
        });
    });

    function tiempoRelativoDashboard(fecha) {
        const diff = Math.floor((new Date() - fecha) / 1000);
        if (diff < 60) return 'Hace un momento';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
        if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
        return fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
    }

    // Últimas 5 ventas de Fábrica — mismo patrón que "Actividad reciente"
    // del Dashboard de Boutique (admin.js), adaptado a tenantId 'fabrica'.
    // Listener en tiempo real, suscrito una sola vez: no depende de que el
    // usuario vuelva a entrar al Dashboard para ver una venta nueva.
    const contActividadRecienteFabrica = document.getElementById('fdb-actividad-reciente');
    if (contActividadRecienteFabrica) {
        const qActividadReciente = query(
            ventasCollection,
            where('tenantId', '==', 'fabrica'),
            orderBy('timestamp', 'desc'),
            limit(5)
        );
        onSnapshot(qActividadReciente, (snapshot) => {
            if (snapshot.empty) {
                contActividadRecienteFabrica.innerHTML = '<div class="text-center text-muted py-3">No hay actividad reciente</div>';
                return;
            }
            contActividadRecienteFabrica.innerHTML = snapshot.docs.map(docSnap => {
                const venta = docSnap.data();
                const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate() : null;
                const cuando = fecha ? tiempoRelativoDashboard(fecha) : 'Hace un momento';
                const anulada = venta.estado === 'Anulada' || venta.estado === 'Cancelada';
                return `
                    <div class="db-activity-item">
                        <span class="db-activity-icon"><i class="bi bi-cart-check-fill"></i></span>
                        <div class="db-activity-body">
                            <div class="db-activity-title">${anulada ? 'Venta anulada' : 'Venta realizada'}</div>
                            <div class="db-activity-sub">${venta.clienteNombre || 'Cliente General'}</div>
                        </div>
                        <div class="db-activity-meta">
                            <span class="db-activity-time">${cuando}</span>
                            <span class="db-activity-amount">${formatoMonedaDashboard.format(venta.totalVenta || 0)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }, (error) => {
            console.error('Error al cargar actividad reciente de fábrica:', error);
            contActividadRecienteFabrica.innerHTML = '<div class="text-center text-danger py-3">No se pudo cargar</div>';
        });
    }

    // Los productos y la actividad reciente ya viven en listeners suscritos
    // una sola vez arriba (siempre al día). Las ventas del período sí se
    // vuelven a suscribir aquí porque su rango de fechas ("hoy", "esta
    // semana"...) depende del instante en que se calcula — si el Dashboard
    // quedó abierto de un día para otro, hay que recalcular el rango, no
    // solo esperar la próxima venta.
    let dashboardYaCargado = false;
    function cargarDashboardSiCorresponde() {
        if ((window.location.hash || '#dashboard') !== '#dashboard') return;
        dashboardYaCargado = true;
        calcularVentasFabrica('today');
    }

    window.addEventListener('hashchange', cargarDashboardSiCorresponde);
    window.addEventListener('admin:section-shown', cargarDashboardSiCorresponde);
    if (!dashboardYaCargado) cargarDashboardSiCorresponde();

    document.getElementById('fdb-ver-todo-actividad')?.addEventListener('click', () => {
        // Deja que el href navegue a #registrar-venta; el historial se abre
        // después de que esa sección termine de mostrarse.
        setTimeout(() => window.mostrarHistorialVentasFabrica?.(), 50);
    });
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

    // Cliente "genérico" preseleccionado: permite finalizar una venta de
    // mostrador sin obligar a buscar/crear un cliente primero.
    const CLIENTE_GENERAL_DEFAULT = { id: null, nombre: 'Cliente General', celular: '', direccion: '' };

    let carrito = [];
    let clienteSeleccionado = null;
    let productosCache = [];
    let clientesCache = null;
    let productoEnSheet = null; // producto cuya hoja de variaciones está abierta

    // ── Estado del selector de productos "Agregar venta" ───────────────────
    const seleccionProductos = new Map(); // clave `${productoId}::${talla}::${color}` -> {productoId, codigo, nombre, talla, color, cantidad, precio}
    const precioOverride = new Map(); // productoId -> precio unitario editado a mano en esta sesión
    let fvPrecioEditandoId = null; // productoId cuya fila de precio está en modo edición ahora mismo
    let fvOrdenDisponible = null; // null (sin ordenar) | 'asc' | 'desc' — por columna "Disponible"
    let fvFiltroActivo = 'todas'; // 'todas' | 'bajas' | 'favoritos' | 'recientes'
    let fvTerminoBusqueda = '';
    const FV_UMBRAL_BAJO_STOCK = 2;

    // Favoritos y recientes son preferencia del dispositivo, no dato de
    // negocio: se guardan en localStorage, no en Firestore.
    const FV_FAVORITOS_KEY = 'fv_favoritos_productos';
    const FV_RECIENTES_KEY = 'fv_recientes_productos';

    function fvLeerListaLocal(key) {
        try {
            const raw = localStorage.getItem(key);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (error) { return []; }
    }

    const fvFavoritos = new Set(fvLeerListaLocal(FV_FAVORITOS_KEY));
    let fvRecientes = fvLeerListaLocal(FV_RECIENTES_KEY);

    function fvGuardarFavoritos() {
        try { localStorage.setItem(FV_FAVORITOS_KEY, JSON.stringify(Array.from(fvFavoritos))); } catch (error) { /* localStorage no disponible */ }
    }

    function fvToggleFavorito(productoId) {
        if (fvFavoritos.has(productoId)) fvFavoritos.delete(productoId);
        else fvFavoritos.add(productoId);
        fvGuardarFavoritos();
    }

    function fvRegistrarRecientes(productoIds) {
        fvRecientes = [...productoIds, ...fvRecientes.filter(id => !productoIds.includes(id))].slice(0, 20);
        try { localStorage.setItem(FV_RECIENTES_KEY, JSON.stringify(fvRecientes)); } catch (error) { /* localStorage no disponible */ }
    }

    const clienteIdInput = document.getElementById('fv-cliente-id');
    const clienteNombreInput = document.getElementById('fv-cliente-nombre');
    const clienteCelularInput = document.getElementById('fv-cliente-celular');
    const clienteDireccionInput = document.getElementById('fv-cliente-direccion');
    const carritoEl = document.getElementById('fv-carrito');
    const itemsCountEl = document.getElementById('fv-items-count');
    const subtotalEl = document.getElementById('fv-subtotal');
    const totalEl = document.getElementById('fv-total');
    const cambioRowEl = document.getElementById('fv-cambio-row');
    const cambioEl = document.getElementById('fv-cambio');
    const descuentoInput = document.getElementById('fv-descuento');
    const descuentoTipoSelect = document.getElementById('fv-descuento-tipo');
    const pagoRecibidoInput = document.getElementById('fv-pago-recibido');
    const observacionesInput = document.getElementById('fv-observaciones');
    let metodoPagoSeleccionado = 'efectivo'; // 'efectivo' | 'transferencia' | 'otro'

    function limpiarNumero(v) {
        return parseFloat((v || '0').toString().replace(/[^\d.-]/g, '')) || 0;
    }

    function puedeHacer(permiso) {
        if (!window.appContext) return true; // sin contexto = acceso directo, permitir
        if (window.appContext.isSuperAdmin) return true;
        return window.appContext.permisos?.[permiso] === true;
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

    // Un solo método de pago por venta (Efectivo/Transferencia/Otro) + lo
    // recibido; el "cambio" es lo que sobra de eso sobre el total.
    function actualizarCambio() {
        const total = calcularTotal();
        const pagado = limpiarNumero(pagoRecibidoInput.value);
        const cambio = pagado - total;
        if (cambio > 0) {
            cambioRowEl.style.display = '';
            cambioEl.textContent = formatoMonedaDashboard.format(cambio);
        } else {
            cambioRowEl.style.display = 'none';
        }
    }

    // Cuántas unidades más se le pueden poner a una línea ya puesta en el
    // carrito: lo que hay en stock, menos lo que otras líneas de la MISMA
    // variación ya reservan (así no deja pasar del stock real al usar los
    // botones +/- o escribir la cantidad a mano).
    function maxCantidadParaItemCarrito(item) {
        const producto = productosCache.find(p => p.id === item.productoId);
        if (!producto) return Infinity;
        const variacion = (producto.variaciones || []).find(v =>
            normalizarVariacion(v.talla) === normalizarVariacion(item.talla) &&
            normalizarVariacion(v.color) === normalizarVariacion(item.color)
        );
        if (!variacion) return Infinity;
        const stock = parseInt(variacion.stock, 10) || 0;
        const otrasLineas = cantidadYaEnCarrito(item.productoId, item.talla, item.color) - item.cantidad;
        return Math.max(0, stock - otrasLineas);
    }

    const cartEmptyCtaEl = document.getElementById('fv-cart-empty-cta');
    const cartWithItemsEl = document.getElementById('fv-cart-with-items');

    // Mismo lenguaje visual que el carrito de Boutique (clases .vf-cart-item*
    // ya definidas en style.css): foto, variación, stepper +/- de cantidad.
    function renderCarrito() {
        const vacio = carrito.length === 0;
        cartEmptyCtaEl.style.display = vacio ? '' : 'none';
        cartWithItemsEl.style.display = vacio ? 'none' : '';
        if (!vacio) {
            carritoEl.innerHTML = carrito.map((item, idx) => {
                const producto = productosCache.find(p => p.id === item.productoId);
                const imgHtml = producto?.imagenUrl
                    ? `<img src="${producto.imagenUrl}" alt="${item.nombre}" class="vf-cart-item-img" onerror="this.style.display='none'">`
                    : `<div class="vf-cart-item-img-placeholder"><i class="bi bi-image"></i></div>`;
                const variante = [item.talla, item.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ');
                return `
                    <div class="vf-cart-item" data-idx="${idx}">
                        ${imgHtml}
                        <div class="vf-cart-item-info">
                            <div class="vf-cart-item-name">${item.nombre}</div>
                            <div class="vf-cart-item-variant">${variante ? variante + ' · ' : ''}${formatoMonedaDashboard.format(item.precio)} c/u</div>
                        </div>
                        <div class="vf-cart-item-controls">
                            <div class="vf-qty-control">
                                <button type="button" class="vf-qty-btn fv-qty-minus" data-idx="${idx}">−</button>
                                <input type="number" class="vf-qty-input fv-qty-input" value="${item.cantidad}" min="1" data-idx="${idx}">
                                <button type="button" class="vf-qty-btn fv-qty-plus" data-idx="${idx}">+</button>
                            </div>
                            <div class="vf-cart-item-total">${formatoMonedaDashboard.format(item.total)}</div>
                            <button type="button" class="vf-cart-item-remove fv-remove-item" data-idx="${idx}" title="Quitar">
                                <i class="bi bi-trash3"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        itemsCountEl.textContent = `${carrito.length} ${carrito.length === 1 ? 'item' : 'items'}`;
        subtotalEl.textContent = formatoMonedaDashboard.format(calcularSubtotal());
        totalEl.textContent = formatoMonedaDashboard.format(calcularTotal());
        actualizarCambio();
    }

    carritoEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.fv-remove-item');
        if (removeBtn) {
            carrito.splice(parseInt(removeBtn.dataset.idx, 10), 1);
            renderCarrito();
            return;
        }
        const minusBtn = e.target.closest('.fv-qty-minus');
        if (minusBtn) {
            const idx = parseInt(minusBtn.dataset.idx, 10);
            const item = carrito[idx];
            if (!item) return;
            if (item.cantidad <= 1) {
                carrito.splice(idx, 1);
            } else {
                item.cantidad -= 1;
                item.total = item.cantidad * item.precio;
            }
            renderCarrito();
            return;
        }
        const plusBtn = e.target.closest('.fv-qty-plus');
        if (plusBtn) {
            const idx = parseInt(plusBtn.dataset.idx, 10);
            const item = carrito[idx];
            if (!item) return;
            const max = maxCantidadParaItemCarrito(item);
            if (item.cantidad >= max) { showToast(`Solo hay ${max} unidades disponibles`, 'warning'); return; }
            item.cantidad += 1;
            item.total = item.cantidad * item.precio;
            renderCarrito();
        }
    });

    carritoEl.addEventListener('change', (e) => {
        const input = e.target.closest('.fv-qty-input');
        if (!input) return;
        const idx = parseInt(input.dataset.idx, 10);
        const item = carrito[idx];
        if (!item) return;
        let nuevaCantidad = parseInt(input.value, 10) || 0;
        if (nuevaCantidad <= 0) {
            carrito.splice(idx, 1);
            renderCarrito();
            return;
        }
        const max = maxCantidadParaItemCarrito(item);
        if (nuevaCantidad > max) {
            showToast(`Solo hay ${max} unidades disponibles`, 'warning');
            nuevaCantidad = max;
        }
        item.cantidad = nuevaCantidad;
        item.total = item.cantidad * item.precio;
        renderCarrito();
    });

    [descuentoInput, descuentoTipoSelect].forEach(el => el.addEventListener('input', renderCarrito));
    pagoRecibidoInput.addEventListener('input', actualizarCambio);

    document.getElementById('fv-metodo-pago-row')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.sv-pay-method-btn');
        if (!btn) return;
        document.querySelectorAll('#fv-metodo-pago-row .sv-pay-method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        metodoPagoSeleccionado = btn.dataset.metodo;
    });

    // ── Borrador de venta (localStorage, un solo slot) ─────────────────────
    // No es un registro de negocio (no toca Firestore): solo evita perder
    // una venta a medio armar si el usuario cierra la pestaña por accidente.
    const BORRADOR_VENTA_KEY = 'fv_borrador_venta';

    function guardarBorrador() {
        try {
            localStorage.setItem(BORRADOR_VENTA_KEY, JSON.stringify({
                clienteId: clienteSeleccionado?.id || null,
                clienteNombre: clienteSeleccionado?.nombre || '',
                clienteCelular: clienteSeleccionado?.celular || '',
                clienteDireccion: clienteSeleccionado?.direccion || '',
                carrito,
                observaciones: observacionesInput.value,
                descuento: descuentoInput.value,
                descuentoTipo: descuentoTipoSelect.value,
                metodoPago: metodoPagoSeleccionado,
                recibido: pagoRecibidoInput.value
            }));
            showToast('Borrador guardado', 'success');
        } catch (error) {
            console.error('Error al guardar borrador de venta:', error);
            showToast('No se pudo guardar el borrador', 'error');
        }
    }

    function limpiarBorrador() {
        try { localStorage.removeItem(BORRADOR_VENTA_KEY); } catch (error) { /* localStorage no disponible */ }
    }

    function restaurarBorradorSiExiste() {
        let borrador;
        try {
            const raw = localStorage.getItem(BORRADOR_VENTA_KEY);
            if (!raw) return;
            borrador = JSON.parse(raw);
        } catch (error) { return; }
        if (!borrador || carrito.length > 0) return; // no pisar una venta ya empezada

        if (borrador.clienteId) {
            seleccionarCliente({
                id: borrador.clienteId,
                nombre: borrador.clienteNombre,
                celular: borrador.clienteCelular,
                direccion: borrador.clienteDireccion
            });
        }
        carrito = Array.isArray(borrador.carrito) ? borrador.carrito : [];
        observacionesInput.value = borrador.observaciones || '';
        descuentoInput.value = borrador.descuento || '0';
        descuentoTipoSelect.value = borrador.descuentoTipo || 'fijo';
        metodoPagoSeleccionado = borrador.metodoPago || 'efectivo';
        document.querySelectorAll('#fv-metodo-pago-row .sv-pay-method-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.metodo === metodoPagoSeleccionado));
        pagoRecibidoInput.value = borrador.recibido || '0';
        renderCarrito();
        showToast('Se restauró tu borrador de venta', 'info');
    }

    document.getElementById('fv-guardar-borrador-btn')?.addEventListener('click', guardarBorrador);

    document.getElementById('fv-vaciar-carrito-btn')?.addEventListener('click', () => {
        if (!carrito.length) return;
        if (!confirm('¿Vaciar todo el carrito de esta venta?')) return;
        carrito = [];
        renderCarrito();
    });

    document.getElementById('fv-agregar-otro-btn')?.addEventListener('click', () => abrirPantallaProductos());
    document.getElementById('fv-agregar-producto-cta-btn')?.addEventListener('click', () => abrirPantallaProductos());

    document.getElementById('fv-abrir-productos-barcode-btn')?.addEventListener('click', () => {
        abrirPantallaProductos();
        document.getElementById('fvps-barcode-btn')?.click();
    });

    // ── Cliente ──────────────────────────────────────────────────────────
    const newClientCtaEl = document.getElementById('fv-new-client-cta');
    const clienteMetaEl = document.getElementById('fv-cliente-meta');

    function seleccionarCliente(cliente) {
        clienteSeleccionado = cliente;
        clienteIdInput.value = cliente?.id || '';
        clienteNombreInput.value = cliente?.nombre || '';
        clienteCelularInput.value = cliente?.celular || '';
        clienteDireccionInput.value = cliente?.direccion || '';
        newClientCtaEl.style.display = cliente ? 'none' : '';
        clienteMetaEl.style.display = cliente ? '' : 'none';
    }

    // Estado inicial: "Cliente General" ya seleccionado (ver
    // CLIENTE_GENERAL_DEFAULT más arriba).
    seleccionarCliente(CLIENTE_GENERAL_DEFAULT);

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

    document.getElementById('fvSearchClientModal')?.addEventListener('show.bs.modal', () => {
        clientListEl.innerHTML = `<li class="list-group-item text-center text-muted">Cargando...</li>`;
        cargarClientesCache()
            .then((lista) => renderClientList(lista))
            .catch((error) => {
                console.error('Error al cargar clientes para Registrar Venta:', error);
                clientListEl.innerHTML = `<li class="list-group-item text-center text-danger">No se pudo cargar: ${error.message}</li>`;
            });
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

    // ── Productos: selector "Agregar venta" (pantalla completa) ────────────
    const productListEl = document.getElementById('fv-product-list');
    const productSearchInput = document.getElementById('fv-product-search');
    const fvScreenEl = document.getElementById('fvProductScreen');
    const fvSheetEl = document.getElementById('fv-product-step-variation');
    const fvSheetBackdropEl = document.getElementById('fvps-sheet-backdrop');
    const fvChipsEl = document.getElementById('fvps-chips');

    // Listener en tiempo real (no una carga puntual): el selector de
    // "Agregar venta" — catálogo, stock disponible, tope de cantidad del
    // carrito — siempre refleja el stock real de Firestore, sin depender de
    // recargar la pantalla ni de que otro código avise "algo cambió".
    let productosCacheListo = false;
    let resolversProductosCacheListo = [];
    function esperarProductosCacheListo() {
        if (productosCacheListo) return Promise.resolve();
        return new Promise(resolve => resolversProductosCacheListo.push(resolve));
    }
    onSnapshot(productosFabricaCollection, (snap) => {
        productosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        productosCacheListo = true;
        resolversProductosCacheListo.forEach(resolve => resolve());
        resolversProductosCacheListo = [];
        // Si la pantalla de "Agregar venta" está abierta, repinta con los
        // datos frescos (nuevo stock tras una venta en otra pestaña, un
        // producto nuevo, etc.).
        if (fvScreenEl.classList.contains('active')) renderProductList();
    }, (error) => {
        console.error('Error en el listener de catálogo de fábrica (Registrar Venta):', error);
    });

    function stockTotalFv(producto) {
        return (producto.variaciones || []).reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
    }

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

    function claveSeleccion(productoId, talla, color) {
        return `${productoId}::${normalizarVariacion(talla)}::${normalizarVariacion(color)}`;
    }

    function cantidadSeleccionada(productoId, talla, color) {
        const entrada = seleccionProductos.get(claveSeleccion(productoId, talla, color));
        return entrada ? entrada.cantidad : 0;
    }

    // Unidades que todavía se pueden agregar: lo que hay en stock, menos lo
    // que ya está en el carrito de esta venta, menos lo que ya se marcó en
    // esta misma sesión del selector (pero aún no se confirma).
    function disponibleVariacion(producto, variacion) {
        const stock = parseInt(variacion?.stock, 10) || 0;
        const talla = variacion?.talla || '';
        const color = variacion?.color || '';
        return stock - cantidadYaEnCarrito(producto.id, talla, color) - cantidadSeleccionada(producto.id, talla, color);
    }

    function precioProducto(producto) {
        return precioOverride.has(producto.id) ? precioOverride.get(producto.id) : (parseFloat(producto.precioMayor) || 0);
    }

    function productosFiltrados() {
        let lista = productosCache.slice();
        if (fvFiltroActivo === 'bajas') {
            lista = lista.filter(p => stockTotalFv(p) <= FV_UMBRAL_BAJO_STOCK);
        } else if (fvFiltroActivo === 'favoritos') {
            lista = lista.filter(p => fvFavoritos.has(p.id));
        } else if (fvFiltroActivo === 'recientes') {
            const orden = new Map(fvRecientes.map((id, idx) => [id, idx]));
            lista = lista.filter(p => orden.has(p.id));
            lista.sort((a, b) => orden.get(a.id) - orden.get(b.id));
        }
        if (fvTerminoBusqueda) {
            lista = lista.filter(p =>
                (p.nombre || '').toLowerCase().includes(fvTerminoBusqueda) ||
                (p.codigo || '').toLowerCase().includes(fvTerminoBusqueda)
            );
        }
        // "Recientes" ya trae su propio orden (más reciente primero); el
        // resto se ordena por nombre, o por stock disponible si se activó
        // la columna "Disponible".
        if (fvFiltroActivo !== 'recientes') {
            lista.sort((a, b) => {
                if (fvOrdenDisponible) {
                    const cmp = stockTotalFv(a) - stockTotalFv(b);
                    return fvOrdenDisponible === 'asc' ? cmp : -cmp;
                }
                return (a.nombre || '').localeCompare(b.nombre || '');
            });
        }
        return lista;
    }

    function textoDisponibles(n) {
        return `${n} disponible${n === 1 ? '' : 's'}`;
    }

    function placeholderImg(nombre) {
        return `https://placehold.co/96x96/f5e8ed/D988B9?text=${encodeURIComponent((nombre || '?').charAt(0).toUpperCase())}`;
    }

    function renderProductList() {
        if (!productosCache.length) {
            productListEl.innerHTML = `<div class="fvps-empty">Cargando catálogo...</div>`;
            return;
        }
        const lista = productosFiltrados();
        if (!lista.length) {
            productListEl.innerHTML = `<div class="fvps-empty">Sin resultados</div>`;
            return;
        }
        productListEl.innerHTML = lista.map(p => {
            const variaciones = p.variaciones || [];
            const stock = stockTotalFv(p);
            const precio = precioProducto(p);
            const precioHtml = fvPrecioEditandoId === p.id
                ? `<input type="text" inputmode="numeric" class="fvps-item-price-input fv-price-override" data-id="${p.id}" value="${precio}">`
                : `<span class="fvps-item-price fv-price-toggle" data-id="${p.id}" title="Tocar para editar el precio">${formatoMonedaDashboard.format(precio)}</span>`;
            const esFavorito = fvFavoritos.has(p.id);

            let controlHtml;
            if (variaciones.length <= 1) {
                const variacion = variaciones[0] || { talla: '', color: '', stock };
                const disponible = Math.max(0, disponibleVariacion(p, variacion));
                const cantidad = cantidadSeleccionada(p.id, variacion.talla, variacion.color);
                controlHtml = `
                    <div class="fvps-stepper" data-producto-id="${p.id}" data-talla="${variacion.talla || ''}" data-color="${variacion.color || ''}">
                        <button type="button" class="fvps-stepper-btn fv-qty-minus" ${cantidad <= 0 ? 'disabled' : ''} aria-label="Quitar uno"><i class="bi bi-dash"></i></button>
                        <span class="fvps-stepper-qty">${cantidad}</span>
                        <button type="button" class="fvps-stepper-btn fvps-stepper-btn--plus fv-qty-plus" ${disponible <= 0 ? 'disabled' : ''} aria-label="Agregar uno"><i class="bi bi-plus"></i></button>
                    </div>
                `;
            } else {
                const totalSeleccionado = variaciones.reduce((s, v) => s + cantidadSeleccionada(p.id, v.talla, v.color), 0);
                controlHtml = `
                    <button type="button" class="fvps-choose-variant-btn fv-choose-variant ${totalSeleccionado > 0 ? 'has-selection' : ''}" data-id="${p.id}">
                        ${totalSeleccionado > 0 ? totalSeleccionado + ' sel.' : 'Elegir'} <i class="bi bi-chevron-right"></i>
                    </button>
                `;
            }

            const stockBadge = stock > 0
                ? `<span class="fvps-item-stock${stock <= FV_UMBRAL_BAJO_STOCK ? ' fvps-item-stock--baja' : ''}">${textoDisponibles(stock)}</span>`
                : `<span class="fvps-item-stock fvps-item-stock--out">Sin stock</span>`;

            return `
                <div class="fvps-item" data-id="${p.id}">
                    <div class="fvps-item-img-wrap">
                        <img src="${p.imagenUrl || placeholderImg(p.nombre)}" alt="" class="fvps-item-img">
                        <button type="button" class="fvps-item-fav-btn fv-toggle-fav ${esFavorito ? 'active' : ''}" data-id="${p.id}" aria-label="Marcar como favorito">
                            <i class="bi ${esFavorito ? 'bi-star-fill' : 'bi-star'}"></i>
                        </button>
                    </div>
                    <div class="fvps-item-info">
                        <span class="fvps-item-name">${p.nombre || 'Sin nombre'}</span>
                        ${precioHtml}
                    </div>
                    ${stockBadge}
                    ${controlHtml}
                </div>
            `;
        }).join('');
    }

    function ajustarCantidad(producto, variacion, delta) {
        const talla = variacion?.talla || '';
        const color = variacion?.color || '';
        const key = claveSeleccion(producto.id, talla, color);
        const actual = seleccionProductos.get(key);
        const cantidadActual = actual ? actual.cantidad : 0;

        if (delta > 0 && disponibleVariacion(producto, variacion) <= 0) {
            showToast('No hay más unidades disponibles', 'warning');
            return;
        }

        const nuevaCantidad = cantidadActual + delta;
        if (nuevaCantidad <= 0) {
            seleccionProductos.delete(key);
            return;
        }
        seleccionProductos.set(key, {
            productoId: producto.id,
            codigo: producto.codigo || '',
            nombre: producto.nombre || '',
            talla,
            color,
            cantidad: nuevaCantidad,
            precio: precioProducto(producto)
        });
    }

    function renderFooter() {
        let count = 0;
        let total = 0;
        seleccionProductos.forEach((entrada) => {
            count += entrada.cantidad;
            total += entrada.cantidad * entrada.precio;
        });
        const countLabelEl = document.getElementById('fvps-footer-count-label');
        countLabelEl.textContent = count > 0
            ? `${count} ${count === 1 ? 'producto' : 'productos'} seleccionado${count === 1 ? '' : 's'}`
            : '0 productos seleccionados';
        document.getElementById('fvps-footer-total').textContent = formatoMonedaDashboard.format(total);
        document.getElementById('fvps-footer').classList.toggle('has-items', count > 0);
        document.getElementById('fvps-confirm-btn').disabled = count === 0;
    }

    // ── Hoja de variaciones (productos con más de una talla/color) ────────
    function renderSheetVariaciones() {
        const producto = productoEnSheet;
        if (!producto) return;
        const opcionesEl = document.getElementById('fv-variation-options');
        opcionesEl.innerHTML = (producto.variaciones || []).map((v) => {
            const disponible = Math.max(0, disponibleVariacion(producto, v));
            const cantidad = cantidadSeleccionada(producto.id, v.talla, v.color);
            const etiqueta = [v.talla, v.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ') || 'Única';
            return `
                <div class="fvps-variation-row" data-talla="${v.talla || ''}" data-color="${v.color || ''}">
                    <div class="fvps-variation-label">
                        <strong>${etiqueta}</strong>
                        <small>${textoDisponibles(disponible)}</small>
                    </div>
                    <div class="fvps-stepper">
                        <button type="button" class="fvps-stepper-btn fv-sheet-qty-minus" ${cantidad <= 0 ? 'disabled' : ''} aria-label="Quitar uno"><i class="bi bi-dash"></i></button>
                        <span class="fvps-stepper-qty">${cantidad}</span>
                        <button type="button" class="fvps-stepper-btn fvps-stepper-btn--plus fv-sheet-qty-plus" ${disponible <= 0 ? 'disabled' : ''} aria-label="Agregar uno"><i class="bi bi-plus"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function abrirSheetVariaciones(producto) {
        productoEnSheet = producto;
        document.getElementById('fv-variation-product-name').textContent = producto.nombre || '';
        document.getElementById('fv-variation-product-img').src = producto.imagenUrl || placeholderImg(producto.nombre);
        renderSheetVariaciones();
        fvSheetBackdropEl.classList.add('open');
        fvSheetEl.classList.add('open');
    }

    function cerrarSheetVariaciones() {
        fvSheetBackdropEl.classList.remove('open');
        fvSheetEl.classList.remove('open');
        productoEnSheet = null;
        renderProductList();
        renderFooter();
    }

    document.getElementById('fv-variation-options')?.addEventListener('click', (e) => {
        const plus = e.target.closest('.fv-sheet-qty-plus');
        const minus = e.target.closest('.fv-sheet-qty-minus');
        if (!plus && !minus) return;
        const row = e.target.closest('.fvps-variation-row');
        const producto = productoEnSheet;
        if (!producto || !row) return;
        const variacion = (producto.variaciones || []).find(v =>
            normalizarVariacion(v.talla) === normalizarVariacion(row.dataset.talla) &&
            normalizarVariacion(v.color) === normalizarVariacion(row.dataset.color)
        ) || { talla: row.dataset.talla, color: row.dataset.color };
        ajustarCantidad(producto, variacion, plus ? 1 : -1);
        renderSheetVariaciones();
        renderFooter();
    });

    document.getElementById('fv-product-back-btn')?.addEventListener('click', cerrarSheetVariaciones);
    fvSheetBackdropEl?.addEventListener('click', cerrarSheetVariaciones);

    // ── Lista principal: stepper directo, favorito, precio o elegir variación ──
    productListEl?.addEventListener('click', (e) => {
        const plus = e.target.closest('.fv-qty-plus');
        const minus = e.target.closest('.fv-qty-minus');
        if (plus || minus) {
            const wrap = e.target.closest('.fvps-stepper');
            const producto = productosCache.find(p => p.id === wrap.dataset.productoId);
            if (!producto) return;
            const variacion = (producto.variaciones || [])[0] || { talla: wrap.dataset.talla, color: wrap.dataset.color, stock: stockTotalFv(producto) };
            ajustarCantidad(producto, variacion, plus ? 1 : -1);
            renderProductList();
            renderFooter();
            return;
        }
        const chooseBtn = e.target.closest('.fv-choose-variant');
        if (chooseBtn) {
            const producto = productosCache.find(p => p.id === chooseBtn.dataset.id);
            if (producto) abrirSheetVariaciones(producto);
            return;
        }
        const favBtn = e.target.closest('.fv-toggle-fav');
        if (favBtn) {
            fvToggleFavorito(favBtn.dataset.id);
            if (fvFiltroActivo === 'favoritos') renderProductList();
            else {
                favBtn.classList.toggle('active');
                favBtn.querySelector('i').className = favBtn.classList.contains('active') ? 'bi bi-star-fill' : 'bi bi-star';
            }
            return;
        }
        const priceToggle = e.target.closest('.fv-price-toggle');
        if (priceToggle) {
            fvPrecioEditandoId = priceToggle.dataset.id;
            renderProductList();
            const input = productListEl.querySelector(`.fv-price-override[data-id="${fvPrecioEditandoId}"]`);
            input?.focus();
            input?.select();
        }
    });

    function fvCommitEdicionPrecio() {
        if (!fvPrecioEditandoId) return;
        fvPrecioEditandoId = null;
        renderProductList();
    }

    productListEl?.addEventListener('input', (e) => {
        const input = e.target.closest('.fv-price-override');
        if (!input) return;
        const productoId = input.dataset.id;
        const valor = limpiarNumero(input.value);
        precioOverride.set(productoId, valor);
        seleccionProductos.forEach((entrada) => {
            if (entrada.productoId === productoId) entrada.precio = valor;
        });
        renderFooter();
    });

    productListEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.fv-price-override')) e.target.blur();
    });

    // "focusout" en vez de "blur" porque blur no burbujea — así se puede
    // delegar en el contenedor en vez de reengancharse a cada input nuevo.
    productListEl?.addEventListener('focusout', (e) => {
        if (e.target.closest('.fv-price-override')) fvCommitEdicionPrecio();
    });

    productSearchInput?.addEventListener('input', () => {
        fvTerminoBusqueda = productSearchInput.value.trim().toLowerCase();
        renderProductList();
    });

    document.getElementById('fvps-sort-disponible-btn')?.addEventListener('click', (e) => {
        fvOrdenDisponible = fvOrdenDisponible === 'asc' ? 'desc' : 'asc';
        e.currentTarget.classList.add('active');
        renderProductList();
    });

    fvChipsEl?.addEventListener('click', (e) => {
        const chip = e.target.closest('.fvps-chip');
        if (!chip) return;
        fvChipsEl.querySelectorAll('.fvps-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fvFiltroActivo = chip.dataset.filter;
        renderProductList();
    });

    // Fábrica no tiene escáner de cámara (excluido del negocio, ver
    // cabecera del módulo); el código de barra de un producto es su
    // "codigo" de texto, así que este botón solo enfoca la búsqueda para
    // escribirlo o pegarlo — funcionalmente equivalente a escanearlo.
    document.getElementById('fvps-barcode-btn')?.addEventListener('click', () => {
        productSearchInput.placeholder = 'Escribe o pega el código...';
        productSearchInput.focus();
    });

    // El modal de "Nuevo producto" (Bootstrap, abierto desde Productos
    // Fábrica) restaura el scroll del body al cerrarse; si nuestra pantalla
    // de selección sigue abierta detrás, hay que volver a bloquearlo para
    // que no se pueda hacer scroll del fondo.
    document.getElementById('prodFabModal')?.addEventListener('hidden.bs.modal', () => {
        if (fvScreenEl.classList.contains('active')) document.body.style.overflow = 'hidden';
    });

    document.getElementById('fvps-confirm-btn')?.addEventListener('click', () => {
        if (seleccionProductos.size === 0) return;
        const productosAgregados = new Set();
        seleccionProductos.forEach((entrada) => {
            carrito.push({
                productoId: entrada.productoId,
                codigo: entrada.codigo,
                nombre: entrada.nombre,
                talla: entrada.talla,
                color: entrada.color,
                cantidad: entrada.cantidad,
                precio: entrada.precio,
                total: entrada.precio * entrada.cantidad
            });
            productosAgregados.add(entrada.productoId);
        });
        renderCarrito();
        fvRegistrarRecientes(Array.from(productosAgregados));
        const cantidadAgregada = seleccionProductos.size;
        seleccionProductos.clear();
        precioOverride.clear();
        renderFooter();
        cerrarPantallaProductos();
        showToast(cantidadAgregada > 1 ? 'Productos agregados al carrito' : 'Producto agregado al carrito', 'success');
    });

    function abrirPantallaProductos() {
        fvScreenEl.classList.add('active');
        fvScreenEl.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        renderFooter();

        if (productosCacheListo) {
            renderProductList();
            return;
        }
        productListEl.innerHTML = `<div class="fvps-empty">Cargando catálogo...</div>`;
        esperarProductosCacheListo().then(() => renderProductList());
    }

    function cerrarPantallaProductos() {
        fvScreenEl.classList.remove('active');
        fvScreenEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        fvSheetBackdropEl.classList.remove('open');
        fvSheetEl.classList.remove('open');
        productoEnSheet = null;
    }

    document.getElementById('fv-abrir-productos-btn')?.addEventListener('click', abrirPantallaProductos);
    document.getElementById('fvps-back-btn')?.addEventListener('click', cerrarPantallaProductos);

    // ── Guardar venta ────────────────────────────────────────────────────
    // IMPORTANTE: el descuento se calcula dentro de una transacción de
    // Firestore, leyendo el stock real del documento en ese instante — NO a
    // partir de 'productosCache' (que aunque ahora se mantiene al día vía
    // onSnapshot, sigue siendo un espejo LOCAL con el retraso propio de la
    // red; no es la fuente de verdad). Calcular el descuento desde la
    // caché local causaba que, al vender la misma prenda/talla/color dos
    // veces seguidas muy rápido (o con dos cajeros vendiendo a la vez), la
    // segunda venta sobreescribiera el stock ya descontado por la primera,
    // dejando el inventario incorrecto de forma intermitente. La
    // transacción elimina ese riesgo sin importar qué tan al día esté la
    // caché.
    async function actualizarStockFabrica(items, accion = 'restar') {
        if (!items.length) return;
        const itemsPorProducto = new Map();
        for (const item of items) {
            if (!item.productoId) continue;
            if (!itemsPorProducto.has(item.productoId)) itemsPorProducto.set(item.productoId, []);
            itemsPorProducto.get(item.productoId).push(item);
        }

        const itemsOmitidos = await runTransaction(db, async (tx) => {
            const omitidos = [];
            const refs = new Map();
            const snaps = new Map();

            // Firestore exige leer todo antes de escribir nada dentro de
            // una transacción, así que primero se obtienen los documentos
            // actuales de cada producto involucrado.
            for (const productoId of itemsPorProducto.keys()) {
                const ref = doc(db, 'productosFabrica', productoId);
                refs.set(productoId, ref);
                snaps.set(productoId, await tx.get(ref));
            }

            // Al VENDER ('restar'), se valida el stock REAL de Firestore
            // (no 'productosCache', que puede estar desactualizada) ANTES de
            // tocar nada: así una prenda agotada bloquea toda la venta con un
            // error claro, en vez de dejar el stock en negativo — el bug que
            // dejaba pasar ventas de prendas agotadas, incluidas las que
            // llegan ya armadas desde un Pedido Web aceptado sin pasar por el
            // selector de productos (que sí valida contra la caché).
            if (accion === 'restar') {
                const agotados = [];
                for (const [productoId, itemsDelProducto] of itemsPorProducto) {
                    const snap = snaps.get(productoId);
                    const variaciones = snap.exists() ? (snap.data().variaciones || []) : [];
                    for (const item of itemsDelProducto) {
                        const encontrada = variaciones.find(v =>
                            normalizarVariacion(v.talla) === normalizarVariacion(item.talla) &&
                            normalizarVariacion(v.color) === normalizarVariacion(item.color)
                        );
                        const stockActual = encontrada ? (parseInt(encontrada.stock, 10) || 0) : 0;
                        if (stockActual < item.cantidad) {
                            const variante = [item.talla, item.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ');
                            agotados.push(variante ? `${item.nombre || productoId} (${variante})` : (item.nombre || productoId));
                        }
                    }
                }
                if (agotados.length) {
                    const error = new Error(`Prenda(s) agotada(s): ${agotados.join(', ')}`);
                    error.agotados = agotados;
                    throw error;
                }
            }

            for (const [productoId, itemsDelProducto] of itemsPorProducto) {
                const snap = snaps.get(productoId);
                if (!snap.exists()) {
                    itemsDelProducto.forEach(item => omitidos.push(item.nombre || item.productoId));
                    continue;
                }
                const variaciones = JSON.parse(JSON.stringify(snap.data().variaciones || []));
                let cambiado = false;
                for (const item of itemsDelProducto) {
                    const encontrada = variaciones.find(v =>
                        normalizarVariacion(v.talla) === normalizarVariacion(item.talla) &&
                        normalizarVariacion(v.color) === normalizarVariacion(item.color)
                    );
                    if (encontrada) {
                        const signo = accion === 'restar' ? -1 : 1;
                        encontrada.stock = (parseInt(encontrada.stock, 10) || 0) + signo * item.cantidad;
                        cambiado = true;
                    } else {
                        omitidos.push(item.nombre || item.productoId);
                    }
                }
                if (cambiado) tx.update(refs.get(productoId), { variaciones });
            }

            return omitidos;
        });

        if (itemsOmitidos.length) {
            console.warn('Stock no ajustado para:', itemsOmitidos);
            showToast(`El stock no se ajustó para: ${itemsOmitidos.join(', ')}. Revísalo manualmente.`, 'error');
        }
    }

    // ── Factura de venta (PDF) ───────────────────────────────────────────
    // Mismo patrón que admin.js de Boutique: numeración consecutiva por
    // tenant (colecciones compartidas 'facturas'/'contadores', pero cada
    // tenant tiene su propio documento de contador gracias a
    // window.expectedTenantId), PDF con jsPDF, y modal de acciones
    // (imprimir/WhatsApp/correo/descargar) tras confirmar que sí se quiere
    // facturar la venta recién registrada.
    const NEGOCIO_INFO_FABRICA = {
        marca: "MISHELL'S FÁBRICA",
        nombreLegal: 'Andrea Mishell Espitia Solano',
        cedula: '1193211056',
        direccion: 'Mz 35 Lote 14',
        telefono: '3046084971'
    };

    function formatearNumeroFacturaFab(numero) {
        return `FAC-${String(numero).padStart(4, '0')}`;
    }

    // Obtiene (o crea) el número consecutivo de factura de una venta. Se
    // guarda en 'facturas/{ventaId}' (idempotente) y el consecutivo en
    // 'contadores/facturas_{tenantId}' vía transacción atómica.
    async function obtenerNumeroFacturaFab(ventaId, ventaData) {
        if (ventaData.numeroFactura) return ventaData.numeroFactura;

        const facturaRef = doc(db, 'facturas', ventaId);
        const facturaSnap = await getDoc(facturaRef);
        if (facturaSnap.exists()) {
            ventaData.numeroFactura = facturaSnap.data().numero;
            return ventaData.numeroFactura;
        }

        const tenantId = ventaData.tenantId ?? window.expectedTenantId;
        const contadorRef = doc(db, 'contadores', `facturas_${tenantId || 'fabrica'}`);

        const numero = await runTransaction(db, async (tx) => {
            const contadorSnap = await tx.get(contadorRef);
            const ultimo = contadorSnap.exists() ? (contadorSnap.data().ultimoNumero || 0) : 0;
            const nuevo = ultimo + 1;
            tx.set(contadorRef, { ultimoNumero: nuevo }, { merge: true });
            tx.set(facturaRef, {
                numero: nuevo,
                ventaId,
                tenantId,
                clienteNombre: ventaData.clienteNombre || 'Cliente General',
                totalVenta: ventaData.totalVenta || 0,
                creadoEn: serverTimestamp()
            });
            return nuevo;
        });

        ventaData.numeroFactura = numero;
        return numero;
    }

    async function generarFacturaVentaPDFFab(ventaId, ventaData) {
        await loadExternalLib('jspdf');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        const PW = 210, PH = 297, M = 18;
        const INK = [20, 20, 22], TEXT = [55, 54, 57], MUTED = [128, 127, 130],
              SOFT = [168, 167, 170], LINE = [220, 219, 222], HAIRLINE = [235, 234, 237],
              ROW_ALT = [247, 247, 248];
        // Negro/gris de marca de Fábrica (mismo #1a1a2e del Dashboard y
        // Registrar Venta) en vez del rosa/magenta de Boutique.
        const ACCENT = [26, 26, 46], ACCENT_TINT = [243, 244, 246];

        function dibujarBordePagina() {
            pdf.setDrawColor(...LINE);
            pdf.setLineWidth(0.3);
            pdf.rect(8, 8, PW - 16, PH - 16);
        }

        const numeroFactura = await obtenerNumeroFacturaFab(ventaId, ventaData);
        const folioTxt = formatearNumeroFacturaFab(numeroFactura);
        const fecha = ventaData.timestamp?.toDate ? ventaData.timestamp.toDate() : new Date();
        const vendedor = window.appContext?.nombre || null;

        // ── Encabezado ──────────────────────────────────────────────────
        pdf.setFillColor(...ACCENT);
        pdf.rect(0, 0, PW, 3, 'F');
        dibujarBordePagina();

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(19);
        pdf.setTextColor(...INK);
        pdf.text(NEGOCIO_INFO_FABRICA.marca, M, 16);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...TEXT);
        pdf.text(NEGOCIO_INFO_FABRICA.nombreLegal, M, 22.5);
        pdf.setTextColor(...MUTED);
        pdf.text(`C.C./NIT ${NEGOCIO_INFO_FABRICA.cedula}  ·  ${NEGOCIO_INFO_FABRICA.direccion}  ·  WhatsApp ${NEGOCIO_INFO_FABRICA.telefono}`, M, 27);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...SOFT);
        pdf.text('FACTURA DE VENTA', PW - M, 13, { align: 'right' });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(17);
        pdf.setTextColor(...ACCENT);
        pdf.text(folioTxt, PW - M, 21.5, { align: 'right' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...MUTED);
        pdf.text(
            fecha.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
            PW - M, 27, { align: 'right' }
        );

        pdf.setDrawColor(...ACCENT);
        pdf.setLineWidth(0.8);
        pdf.line(M, 33, PW - M, 33);

        // ── Cliente / detalles de la venta (dos columnas) ────────────────
        const colClienteX = M;
        const colDetalleX = PW / 2 + 8;
        let y = 42;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(...ACCENT);
        pdf.text('FACTURAR A', colClienteX, y);
        pdf.text('DETALLES DE LA VENTA', colDetalleX, y);
        y += 5.5;

        pdf.setDrawColor(...LINE);
        pdf.setLineWidth(0.3);
        pdf.line(colClienteX, y - 3, colClienteX + (PW / 2 - M - 4), y - 3);
        pdf.line(colDetalleX, y - 3, PW - M, y - 3);
        pdf.line(PW / 2, 39, PW / 2, y + 20);

        const clienteInfo = [
            [ventaData.clienteNombre || 'Cliente General', true],
            ventaData.clienteDireccion ? [ventaData.clienteDireccion, false] : null,
            ventaData.clienteCelular ? [`Tel: ${ventaData.clienteCelular}`, false] : null
        ].filter(Boolean);

        const detalleInfo = [
            ['Tipo de venta:  MAYORISTA', false],
            ['Recoge en fábrica', false],
            vendedor ? [`Atendido por:  ${vendedor}`, false] : null
        ].filter(Boolean);

        const filas = Math.max(clienteInfo.length, detalleInfo.length);
        pdf.setFontSize(9);
        for (let i = 0; i < filas; i++) {
            const yLinea = y + i * 5.2;
            if (clienteInfo[i]) {
                const [texto, esNombre] = clienteInfo[i];
                pdf.setFont('helvetica', esNombre ? 'bold' : 'normal');
                pdf.setTextColor(...(esNombre ? INK : TEXT));
                pdf.text(texto, colClienteX, yLinea);
            }
            if (detalleInfo[i]) {
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(...TEXT);
                pdf.text(detalleInfo[i][0], colDetalleX, yLinea);
            }
        }
        y += filas * 5.2 + 8;

        pdf.setDrawColor(...INK);
        pdf.setLineWidth(0.6);
        pdf.line(M, y, PW - M, y);
        y += 9;

        // ── Tabla de items ────────────────────────────────────────────────
        const colCant = 126, colPrecio = 156, colTotal = PW - M;

        function dibujarCabeceraTabla() {
            pdf.setFillColor(...ACCENT_TINT);
            pdf.rect(M, y, PW - M * 2, 9, 'F');
            y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(...ACCENT);
            pdf.text('PRODUCTO', M + 2, y);
            pdf.text('CANT.', colCant, y, { align: 'center' });
            pdf.text('PRECIO UNIT.', colPrecio, y, { align: 'right' });
            pdf.text('TOTAL', colTotal, y, { align: 'right' });
            y += 3;
            pdf.setDrawColor(...ACCENT);
            pdf.setLineWidth(0.4);
            pdf.line(M, y, PW - M, y);
            y += 5.5;
        }

        dibujarCabeceraTabla();

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...INK);
        const items = ventaData.items || [];
        items.forEach((item, idx) => {
            if (y > PH - 65) {
                pdf.addPage();
                dibujarBordePagina();
                y = M;
                dibujarCabeceraTabla();
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(...INK);
            }

            const rowH = 8;
            if (idx % 2 === 1) {
                pdf.setFillColor(...ROW_ALT);
                pdf.rect(M, y - 5, PW - M * 2, rowH, 'F');
            }

            const detalle = [item.talla, item.color].filter(x => x && normalizarVariacion(x) !== '').join(' / ');
            const nombreLinea = detalle ? `${item.nombre} (${detalle})` : (item.nombre || '');
            const nombreCorto = nombreLinea.length > 50 ? nombreLinea.slice(0, 48) + '…' : nombreLinea;

            pdf.setFontSize(8.5);
            pdf.setTextColor(...INK);
            pdf.text(nombreCorto, M, y);
            pdf.setTextColor(...TEXT);
            pdf.text(String(item.cantidad ?? ''), colCant, y, { align: 'center' });
            pdf.text(formatoMonedaDashboard.format(item.precio || 0), colPrecio, y, { align: 'right' });
            pdf.setTextColor(...INK);
            pdf.text(formatoMonedaDashboard.format(item.total || 0), colTotal, y, { align: 'right' });

            pdf.setDrawColor(...HAIRLINE);
            pdf.setLineWidth(0.15);
            pdf.line(M, y + 3, PW - M, y + 3);

            y += rowH;
        });

        pdf.setDrawColor(...ACCENT);
        pdf.setLineWidth(0.5);
        pdf.line(M, y - 5, PW - M, y - 5);
        y += 8;

        // ── Totales ───────────────────────────────────────────────────────
        const totalPrendas = items.reduce((s, i) => s + (parseInt(i.cantidad, 10) || 0), 0);
        const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
        const descuentoRaw = parseFloat(ventaData.descuento) || 0;
        const descuento = ventaData.descuentoTipo === 'porcentaje' ? subtotal * (descuentoRaw / 100) : descuentoRaw;
        const totalVenta = parseFloat(ventaData.totalVenta) || 0;

        const filasTotales = [
            ['Total de prendas', `${totalPrendas} ${totalPrendas === 1 ? 'prenda' : 'prendas'}`, false],
            ['Subtotal', formatoMonedaDashboard.format(subtotal), false],
            descuento > 0 ? ['Descuento', `-${formatoMonedaDashboard.format(descuento)}`, false] : null,
            ['TOTAL A PAGAR', formatoMonedaDashboard.format(totalVenta), true]
        ].filter(Boolean);

        const cardW = 84, cardX = PW - M - cardW;
        const filasNormales = filasTotales.filter(f => !f[2]).length;
        const cardH = filasNormales * 6.2 + 18;
        if (y + cardH > PH - 55) { pdf.addPage(); dibujarBordePagina(); y = M; }

        let ty = y + 2;
        filasTotales.forEach(([label, valor, resaltado]) => {
            if (resaltado) {
                ty += 3;
                pdf.setFillColor(...ACCENT_TINT);
                pdf.roundedRect(cardX - 4, ty - 6, cardW + 4, 11, 1.5, 1.5, 'F');
                pdf.setDrawColor(...ACCENT);
                pdf.setLineWidth(0.5);
                pdf.roundedRect(cardX - 4, ty - 6, cardW + 4, 11, 1.5, 1.5, 'S');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(12.5);
                pdf.setTextColor(...ACCENT);
                pdf.text(label, cardX, ty + 1.5);
                pdf.text(valor, cardX + cardW, ty + 1.5, { align: 'right' });
                ty += 9;
            } else {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9);
                pdf.setTextColor(...MUTED);
                pdf.text(label, cardX, ty);
                pdf.setTextColor(...TEXT);
                pdf.text(valor, cardX + cardW, ty, { align: 'right' });
                ty += 6.2;
            }
        });

        y = ty + 6;

        // ── Forma de pago + observaciones ─────────────────────────────────
        if (y > PH - 45) { pdf.addPage(); dibujarBordePagina(); y = M; }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(...ACCENT);
        pdf.text('FORMA DE PAGO', M, y);
        y += 5.5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...TEXT);
        const metodoLabelPdf = { efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' }[ventaData.metodoPago] || 'Efectivo';
        pdf.text(
            `${metodoLabelPdf}   ·   Recibido: ${formatoMonedaDashboard.format((ventaData.pagoEfectivo || 0) + (ventaData.pagoTransferencia || 0))}`,
            M, y
        );
        y += 8;

        if (ventaData.observaciones) {
            if (y > PH - 40) { pdf.addPage(); dibujarBordePagina(); y = M; }
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(...ACCENT);
            pdf.text('OBSERVACIONES', M, y);
            y += 5.5;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(...TEXT);
            const obsLines = pdf.splitTextToSize(ventaData.observaciones, PW - M * 2);
            pdf.text(obsLines, M, y);
            y += obsLines.length * 5;
        }

        // ── Pie de página ─────────────────────────────────────────────────
        const footY = PH - 20;
        pdf.setDrawColor(...ACCENT);
        pdf.setLineWidth(0.6);
        pdf.line(M, footY, PW - M, footY);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...ACCENT);
        pdf.text('¡Gracias por tu compra!', PW / 2, footY + 7, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...MUTED);
        pdf.text(
            `${NEGOCIO_INFO_FABRICA.marca}  ·  WhatsApp ${NEGOCIO_INFO_FABRICA.telefono}  ·  ${NEGOCIO_INFO_FABRICA.direccion}`,
            PW / 2, footY + 12, { align: 'center' }
        );
        pdf.setFontSize(6.5);
        pdf.setTextColor(...SOFT);
        pdf.text(
            `Factura ${folioTxt} generada el ${new Date().toLocaleString('es-CO')}`,
            PW / 2, footY + 16.5, { align: 'center' }
        );

        const totalPaginas = pdf.internal.getNumberOfPages();
        if (totalPaginas > 1) {
            for (let p = 1; p <= totalPaginas; p++) {
                pdf.setPage(p);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(...SOFT);
                pdf.text(`Página ${p} de ${totalPaginas}`, PW - M - 2, PH - 10, { align: 'right' });
            }
        }

        const nombreArchivo = `Factura_${folioTxt}_${(ventaData.clienteNombre || 'Cliente').replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`;
        const blob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(blob);

        return { folioTxt, blob, blobUrl, fileName: nombreArchivo };
    }

    // --- Compartir/Imprimir la factura generada ---
    let facturaGeneradaFab = null; // { folioTxt, blob, blobUrl, fileName, ventaData }

    function formatearNumeroWhatsappFab(celular) {
        const digitos = (celular || '').replace(/\D/g, '');
        if (!digitos) return '';
        return digitos.length <= 10 ? `57${digitos}` : digitos;
    }

    function imprimirFacturaPDFFab(blobUrl) {
        let iframe = document.getElementById('factura-print-iframe-fab');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'factura-print-iframe-fab';
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
            document.body.appendChild(iframe);
        }
        iframe.onload = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                window.open(blobUrl, '_blank');
            }
        };
        iframe.src = blobUrl;
    }

    async function compartirFacturaWhatsAppFab({ blob, fileName, folioTxt, ventaData }) {
        const nombreCliente = ventaData.clienteNombre || 'Cliente';
        const mensaje = `Hola ${nombreCliente}, aquí tienes tu factura ${folioTxt} de ${NEGOCIO_INFO_FABRICA.marca}. ¡Gracias por tu compra!`;
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const puedeCompartirArchivo = navigator.canShare && navigator.canShare({ files: [file] });

        if (puedeCompartirArchivo) {
            try {
                await navigator.share({ files: [file], title: `Factura ${folioTxt}`, text: mensaje });
            } catch (e) {
                if (e.name === 'AbortError') return; // el usuario canceló el share
                console.warn('No se pudo compartir el PDF directamente:', e);
                showToast('No se pudo confirmar el envío. Revisa WhatsApp antes de reintentar para no enviar la factura dos veces.', 'warning');
            }
            return;
        }

        // Respaldo (navegadores sin Web Share API con archivos): descarga el
        // PDF y abre WhatsApp con el número del cliente para adjuntarlo a mano.
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        const numero = formatearNumeroWhatsappFab(ventaData.clienteCelular);
        const texto = encodeURIComponent(`${mensaje}\n(Adjunta el PDF "${fileName}" que se acaba de descargar)`);
        const waUrl = numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
        openWhatsApp(waUrl);
        showToast('Se descargó el PDF. Adjúntalo manualmente en el chat de WhatsApp que se abrió.', 'info');
    }

    // mailto no admite adjuntos: se descarga el PDF y se abre el correo con
    // destinatario/asunto/cuerpo listos para que se adjunte a mano.
    function enviarFacturaCorreoFab(email, { blob, fileName, folioTxt, ventaData }) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        const asunto = encodeURIComponent(`Factura ${folioTxt} - ${NEGOCIO_INFO_FABRICA.marca}`);
        const cuerpo = encodeURIComponent(
            `Hola ${ventaData.clienteNombre || ''},\n\nAdjunto encontrarás tu factura ${folioTxt} de ${NEGOCIO_INFO_FABRICA.marca}.\n\n¡Gracias por tu compra!\n\n${NEGOCIO_INFO_FABRICA.marca}\nWhatsApp ${NEGOCIO_INFO_FABRICA.telefono}`
        );
        const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${asunto}&body=${cuerpo}`;

        const mailLink = document.createElement('a');
        mailLink.href = mailtoUrl;
        document.body.appendChild(mailLink);
        mailLink.click();
        mailLink.remove();

        showToast('Se descargó el PDF y se abrió tu correo. Adjunta el archivo antes de enviarlo.', 'info');
    }

    let facturaAccionesModalFabInstance = null;
    let facturaPreguntaModalFabInstance = null;
    const facturaAccionesModalFabEl = document.getElementById('facturaAccionesModalFab');
    if (facturaAccionesModalFabEl) {
        facturaAccionesModalFabInstance = new bootstrap.Modal(facturaAccionesModalFabEl);
        facturaAccionesModalFabEl.addEventListener('hidden.bs.modal', () => {
            const emailForm = document.getElementById('factura-email-form-fab');
            if (emailForm) { emailForm.style.display = 'none'; emailForm.reset(); }
        });
    }
    const facturaPreguntaModalFabEl = document.getElementById('facturaPreguntaModalFab');
    if (facturaPreguntaModalFabEl) facturaPreguntaModalFabInstance = new bootstrap.Modal(facturaPreguntaModalFabEl);

    document.getElementById('btn-factura-imprimir-fab')?.addEventListener('click', () => {
        if (facturaGeneradaFab) imprimirFacturaPDFFab(facturaGeneradaFab.blobUrl);
    });

    const btnFacturaWhatsappFab = document.getElementById('btn-factura-whatsapp-fab');
    btnFacturaWhatsappFab?.addEventListener('click', async () => {
        // Bloquea el botón mientras se comparte: en celulares donde el share
        // sheet tarda en aparecer, un doble toque volvía a llamar a esta
        // función y la factura se enviaba dos veces.
        if (!facturaGeneradaFab || btnFacturaWhatsappFab.disabled) return;
        btnFacturaWhatsappFab.disabled = true;
        try {
            await compartirFacturaWhatsAppFab(facturaGeneradaFab);
        } finally {
            btnFacturaWhatsappFab.disabled = false;
        }
    });

    // --- Enviar por Correo: pide el email antes de enviar ---
    const btnFacturaCorreoFab = document.getElementById('btn-factura-correo-fab');
    const facturaEmailFormFab = document.getElementById('factura-email-form-fab');
    const facturaEmailInputFab = document.getElementById('factura-email-input-fab');
    btnFacturaCorreoFab?.addEventListener('click', () => {
        const visible = facturaEmailFormFab.style.display !== 'none';
        facturaEmailFormFab.style.display = visible ? 'none' : 'block';
        if (!visible) facturaEmailInputFab?.focus();
    });
    facturaEmailFormFab?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!facturaGeneradaFab) return;
        const email = (facturaEmailInputFab?.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Ingresa un correo válido', 'warning');
            return;
        }
        enviarFacturaCorreoFab(email, facturaGeneradaFab);
        facturaEmailFormFab.style.display = 'none';
        facturaEmailFormFab.reset();
    });

    document.getElementById('btn-factura-descargar-fab')?.addEventListener('click', () => {
        if (!facturaGeneradaFab) return;
        const a = document.createElement('a');
        a.href = facturaGeneradaFab.blobUrl;
        a.download = facturaGeneradaFab.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    // Genera el PDF y abre el modal de acciones (imprimir/whatsapp/correo/
    // descargar); reutilizada por la pregunta que aparece justo al
    // registrar una venta nueva.
    async function generarYMostrarFacturaFab(ventaId, ventaData, modalAOcultar) {
        try {
            const resultado = await generarFacturaVentaPDFFab(ventaId, ventaData);

            if (facturaGeneradaFab?.blobUrl) URL.revokeObjectURL(facturaGeneradaFab.blobUrl);
            facturaGeneradaFab = { ...resultado, ventaData };

            const folioEl = document.getElementById('factura-modal-folio-fab');
            if (folioEl) folioEl.textContent = resultado.folioTxt;

            if (modalAOcultar) {
                const elAOcultar = modalAOcultar._element;
                if (elAOcultar) elAOcultar.addEventListener('hidden.bs.modal', () => facturaAccionesModalFabInstance?.show(), { once: true });
                modalAOcultar.hide();
            } else {
                facturaAccionesModalFabInstance?.show();
            }
            return resultado;
        } catch (error) {
            console.error('Error al generar factura de fábrica:', error);
            showToast('Error al generar la factura', 'error');
            return null;
        }
    }

    // --- Pregunta al registrar una venta nueva: ¿generar factura ahora? ---
    let ventaRecienRegistradaFab = null; // { ventaId, ventaData }
    const btnFacturaPreguntaSiFab = document.getElementById('btn-factura-pregunta-si-fab');
    btnFacturaPreguntaSiFab?.addEventListener('click', async () => {
        if (!ventaRecienRegistradaFab) return;
        const originalHtml = btnFacturaPreguntaSiFab.innerHTML;
        btnFacturaPreguntaSiFab.disabled = true;
        btnFacturaPreguntaSiFab.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando...';

        await generarYMostrarFacturaFab(ventaRecienRegistradaFab.ventaId, ventaRecienRegistradaFab.ventaData, facturaPreguntaModalFabInstance);

        btnFacturaPreguntaSiFab.disabled = false;
        btnFacturaPreguntaSiFab.innerHTML = originalHtml;
        ventaRecienRegistradaFab = null;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (carrito.length === 0) { showToast('Agrega al menos un producto', 'warning'); return; }

        // Si por algún motivo no quedó ningún método de pago marcado como
        // activo, se asume Efectivo en vez de bloquear la venta.
        if (!metodoPagoSeleccionado) metodoPagoSeleccionado = 'efectivo';

        const total = calcularTotal();
        // Si dejó "Recibido" en 0 (no lo tocó), se asume que pagó el total
        // exacto en efectivo en vez de bloquear la venta; si escribió un
        // valor y no alcanza, sí se avisa.
        let recibido = limpiarNumero(pagoRecibidoInput.value);
        if (recibido === 0) recibido = total;
        if (recibido < total) {
            showToast('El pago no cubre el total', 'warning');
            return;
        }
        // Un solo método por venta; "transferencia" agrupa transferencia y
        // "otro" para no perder los reportes existentes que solo suman
        // pagoEfectivo + pagoTransferencia.
        const pagoEfectivo = metodoPagoSeleccionado === 'efectivo' ? recibido : 0;
        const pagoTransferencia = metodoPagoSeleccionado === 'efectivo' ? 0 : recibido;

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
                metodoPago: metodoPagoSeleccionado,
                totalVenta: total,
                estado: 'Completada',
                origen: 'mostrador',
                tipoVenta: 'mayorista', // en Fábrica todo lo que se vende es mayorista
                timestamp: serverTimestamp(),
                tenantId: window.expectedTenantId
            };

            // Descuenta el stock ANTES de registrar la venta: si alguna
            // prenda no tiene stock suficiente (agotada), actualizarStockFabrica
            // lanza un error y ni se descuenta nada ni se guarda la venta —
            // antes se guardaba la venta primero y el stock quedaba en
            // negativo sin avisar.
            await actualizarStockFabrica(carrito);
            const ventaRef = await addDoc(ventasCollection, ventaData);

            showToast('Venta registrada', 'success');

            // Pregunta si se quiere facturar ya mismo (ventaData se conserva
            // completo, incluidos los items, aunque el carrito se limpie a
            // continuación).
            if (facturaPreguntaModalFabInstance) {
                ventaRecienRegistradaFab = { ventaId: ventaRef.id, ventaData };
                facturaPreguntaModalFabInstance.show();
            }

            carrito = [];
            seleccionarCliente(CLIENTE_GENERAL_DEFAULT);
            observacionesInput.value = '';
            descuentoInput.value = '0';
            pagoRecibidoInput.value = '0';
            metodoPagoSeleccionado = 'efectivo';
            document.querySelectorAll('#fv-metodo-pago-row .sv-pay-method-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.metodo === 'efectivo'));
            limpiarBorrador();
            renderCarrito();
            historialCargado = false; // para que el Historial la recargue con la venta nueva
        } catch (error) {
            console.error('Error al registrar venta de fábrica:', error);
            if (error.agotados) {
                showToast(`No se pudo registrar la venta: agotado ${error.agotados.join(', ')}`, 'error');
            } else {
                showToast('No se pudo registrar la venta: ' + error.message, 'error');
            }
        } finally {
            submitBtn.disabled = false;
        }
    });

    // El catálogo ya no necesita "precargarse" al entrar a la sección: el
    // listener de arriba está suscrito desde que carga la página, así que
    // cuando el usuario abra "Agregar venta" los datos ya están frescos en
    // memoria (ver abrirPantallaProductos).

    // ── Nueva Venta / Historial ──────────────────────────────────────────
    // Historial de solo lectura por ahora: ver las ventas ya registradas,
    // sin editar ni anular todavía (eso queda para más adelante, igual que
    // en Boutique donde sí existe esa gestión completa).
    const formViewEl = document.getElementById('fv-sales-form-view');
    const listViewEl = document.getElementById('fv-sales-list-view');
    const toggleViewBtn = document.getElementById('fv-toggle-view-btn');
    const viewTitleEl = document.getElementById('fv-view-title');
    const viewSubtitleEl = document.getElementById('fv-view-subtitle');
    const toggleViewIconEl = document.getElementById('fv-toggle-view-icon');
    const toggleViewLabelEl = document.getElementById('fv-toggle-view-label');
    let historialCargado = false;
    let todasLasVentas = [];

    function mostrarVistaFormulario() {
        formViewEl.style.display = '';
        listViewEl.style.display = 'none';
        viewTitleEl.textContent = 'Nueva venta';
        viewSubtitleEl.textContent = 'Registra tu venta de forma rápida';
        toggleViewIconEl.className = 'bi bi-clock-history';
        toggleViewLabelEl.textContent = 'Historial';
    }

    function mostrarVistaHistorial() {
        formViewEl.style.display = 'none';
        listViewEl.style.display = '';
        viewTitleEl.textContent = 'Historial de ventas';
        viewSubtitleEl.textContent = 'Consulta y anula ventas registradas';
        toggleViewIconEl.className = 'bi bi-plus-circle';
        toggleViewLabelEl.textContent = 'Nueva venta';
        if (!historialCargado) cargarHistorialVentas();
    }

    toggleViewBtn?.addEventListener('click', () => {
        const enHistorial = listViewEl.style.display !== 'none';
        if (enHistorial) mostrarVistaFormulario();
        else mostrarVistaHistorial();
    });

    // Expuesto para que "Ver todo" en Actividad Reciente del Dashboard
    // pueda abrir directo el historial en vez de solo caer en Nueva Venta.
    window.mostrarHistorialVentasFabrica = mostrarVistaHistorial;

    async function cargarHistorialVentas() {
        historialCargado = true;
        const listaEl = document.getElementById('fv-lista-ventas');
        try {
            const q = query(ventasCollection, where('tenantId', '==', 'fabrica'), orderBy('timestamp', 'desc'));
            const snap = await getDocs(q);
            todasLasVentas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            aplicarFiltrosHistorial();
        } catch (error) {
            console.error('Error al cargar historial de ventas de fábrica:', error);
            listaEl.innerHTML = `<div class="ventas-empty-state"><i class="bi bi-exclamation-triangle fs-2 d-block mb-2 text-danger"></i><p class="text-danger mb-0">No se pudo cargar: ${error.message}</p></div>`;
        }
    }

    // El chequeo de estado, la reposición de stock y el cambio a "Anulada"
    // van en UNA sola transacción: hacerlo en pasos sueltos (como antes)
    // permitía que un doble clic, o dos personas anulando la misma venta
    // casi a la vez, pasaran ambos el chequeo "¿ya está anulada?" antes de
    // que cualquiera guardara el cambio de estado, y el stock se repusiera
    // dos veces para la misma venta.
    let ventasAnulandoFabrica = new Set();
    async function anularVentaFabrica(ventaId) {
        if (!ventaId) return;
        if (!puedeHacer('ventas_anular')) {
            showToast('No tienes permisos para anular ventas.', 'error');
            return;
        }
        if (ventasAnulandoFabrica.has(ventaId)) return; // ya se está procesando (p. ej. doble clic)
        if (!confirm('¿Estás seguro de que quieres ANULAR esta venta?\nEsta acción repondrá el stock y marcará la venta como "Anulada".')) {
            return;
        }

        ventasAnulandoFabrica.add(ventaId);
        const ventaRef = doc(db, 'ventas', ventaId);
        try {
            const itemsOmitidos = await runTransaction(db, async (tx) => {
                const ventaSnap = await tx.get(ventaRef);
                if (!ventaSnap.exists()) throw new Error('VENTA_NO_ENCONTRADA');
                const ventaData = ventaSnap.data();
                if (ventaData.estado === 'Anulada' || ventaData.estado === 'Cancelada') {
                    throw new Error('VENTA_YA_ANULADA');
                }

                const items = ventaData.items || [];
                const itemsPorProducto = new Map();
                for (const item of items) {
                    if (!item.productoId) continue;
                    if (!itemsPorProducto.has(item.productoId)) itemsPorProducto.set(item.productoId, []);
                    itemsPorProducto.get(item.productoId).push(item);
                }

                const refs = new Map();
                const snaps = new Map();
                for (const productoId of itemsPorProducto.keys()) {
                    const ref = doc(db, 'productosFabrica', productoId);
                    refs.set(productoId, ref);
                    snaps.set(productoId, await tx.get(ref));
                }

                const omitidos = [];
                for (const [productoId, itemsDelProducto] of itemsPorProducto) {
                    const snap = snaps.get(productoId);
                    if (!snap.exists()) {
                        itemsDelProducto.forEach(item => omitidos.push(item.nombre || item.productoId));
                        continue;
                    }
                    const variaciones = JSON.parse(JSON.stringify(snap.data().variaciones || []));
                    let cambiado = false;
                    for (const item of itemsDelProducto) {
                        const encontrada = variaciones.find(v =>
                            normalizarVariacion(v.talla) === normalizarVariacion(item.talla) &&
                            normalizarVariacion(v.color) === normalizarVariacion(item.color)
                        );
                        if (encontrada) {
                            encontrada.stock = (parseInt(encontrada.stock, 10) || 0) + (parseInt(item.cantidad, 10) || 0);
                            cambiado = true;
                        } else {
                            omitidos.push(item.nombre || item.productoId);
                        }
                    }
                    if (cambiado) tx.update(refs.get(productoId), { variaciones });
                }

                tx.update(ventaRef, { estado: 'Anulada' });
                return omitidos;
            });

            showToast('Venta anulada y stock repuesto.', 'info');
            if (itemsOmitidos.length) {
                console.warn('Stock no ajustado para:', itemsOmitidos);
                showToast(`El stock no se ajustó para: ${itemsOmitidos.join(', ')}. Revísalo manualmente.`, 'error');
            }

            const idx = todasLasVentas.findIndex(v => v.id === ventaId);
            if (idx !== -1) todasLasVentas[idx].estado = 'Anulada';
            aplicarFiltrosHistorial();
        } catch (error) {
            if (error.message === 'VENTA_YA_ANULADA') {
                showToast('Esta venta ya ha sido anulada.', 'info');
            } else if (error.message === 'VENTA_NO_ENCONTRADA') {
                showToast('Error: No se encontró la venta.', 'error');
            } else {
                console.error('Error al anular la venta de fábrica:', error);
                showToast('Error al anular la venta: ' + error.message, 'error');
            }
        } finally {
            ventasAnulandoFabrica.delete(ventaId);
        }
    }

    document.getElementById('fv-lista-ventas')?.addEventListener('click', async (e) => {
        const cancelBtn = e.target.closest('.btn-cancel-sale-fabrica');
        if (cancelBtn) {
            const id = cancelBtn.closest('.venta-card')?.dataset.id;
            if (id) anularVentaFabrica(id);
            return;
        }
        const facturaBtn = e.target.closest('.btn-print-invoice-fabrica');
        if (facturaBtn) {
            const id = facturaBtn.closest('.venta-card')?.dataset.id;
            const venta = todasLasVentas.find(v => v.id === id);
            if (!venta) { showToast('No se encontró la venta', 'error'); return; }
            const originalHtml = facturaBtn.innerHTML;
            facturaBtn.disabled = true;
            facturaBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            await generarYMostrarFacturaFab(venta.id, venta, null);
            facturaBtn.disabled = false;
            facturaBtn.innerHTML = originalHtml;
        }
    });

    function aplicarFiltrosHistorial() {
        const listaEl = document.getElementById('fv-lista-ventas');
        const termino = (document.getElementById('fv-filtro-buscar-ventas')?.value || '').trim().toLowerCase();
        const fechaFiltro = document.getElementById('fv-filtro-fecha-ventas')?.value || '';

        const filtradas = todasLasVentas.filter(v => {
            if (termino) {
                const clienteMatch = (v.clienteNombre || '').toLowerCase().includes(termino);
                const productoMatch = (v.items || []).some(i => (i.nombre || '').toLowerCase().includes(termino));
                if (!clienteMatch && !productoMatch) return false;
            }
            if (fechaFiltro && v.timestamp?.toDate) {
                const fechaVenta = v.timestamp.toDate().toISOString().slice(0, 10);
                if (fechaVenta !== fechaFiltro) return false;
            }
            return true;
        });

        if (!filtradas.length) {
            listaEl.innerHTML = `<div class="ventas-empty-state"><i class="bi bi-search fs-2 d-block mb-2 text-muted"></i><p class="text-muted mb-0">No se encontraron ventas</p></div>`;
            return;
        }

        listaEl.innerHTML = filtradas.map(renderVentaCard).join('');
    }

    function renderVentaCard(v) {
        const fecha = v.timestamp?.toDate ? v.timestamp.toDate().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';

        const pagoPartes = [];
        if (v.pagoEfectivo > 0) pagoPartes.push('<span class="venta-pago-badge efec"><i class="bi bi-cash-coin"></i> Efectivo</span>');
        if (v.pagoTransferencia > 0) {
            pagoPartes.push(v.metodoPago === 'otro'
                ? '<span class="venta-pago-badge transf"><i class="bi bi-credit-card"></i> Otro</span>'
                : '<span class="venta-pago-badge transf"><i class="bi bi-bank"></i> Transfer.</span>');
        }
        const pagoHtml = pagoPartes.length ? pagoPartes.join('') : '<span class="text-muted small">-</span>';

        const productosHtml = (v.items || []).length
            ? v.items.map(item => {
                const variacion = [item.talla, item.color].filter(x => x && normalizarVariacion(x) !== '').join(' · ');
                const precioNum = parseFloat(item.precio) || 0;
                return `
                    <div class="venta-prod-row">
                        <div class="venta-prod-img-placeholder"><i class="bi bi-image"></i></div>
                        <div class="venta-prod-info">
                            <div class="venta-prod-name">${item.nombre || 'Producto'}</div>
                            <div class="venta-prod-detail">
                                ${variacion ? `<span>${variacion}</span> · ` : ''}
                                <span>x${item.cantidad || 0}</span>
                                ${precioNum > 0 ? ` · <span class="text-primary fw-semibold">${formatoMonedaDashboard.format(precioNum)} c/u</span>` : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('')
            : '<span class="text-muted small">Sin productos registrados</span>';

        const estado = v.estado || 'Completada';
        const estaAnulada = (estado === 'Anulada' || estado === 'Cancelada');
        const estadoBadgeClass = estaAnulada ? 'bg-danger' : 'bg-success';

        return `
            <div class="venta-card" data-id="${v.id}">
                <div class="venta-card-head">
                    <div class="venta-card-meta-top">
                        <span class="venta-card-fecha"><i class="bi bi-clock me-1"></i>${fecha}</span>
                        <span class="badge ${estadoBadgeClass}">${estado}</span>
                    </div>
                    <div class="venta-card-cliente-row">
                        <span class="venta-card-cliente"><i class="bi bi-person-fill me-1"></i>${v.clienteNombre || 'Cliente General'}</span>
                        <span class="badge bg-info text-dark">Mayor.</span>
                    </div>
                </div>
                <div class="venta-card-products">${productosHtml}</div>
                <div class="venta-card-foot">
                    <div class="venta-card-foot-left">
                        <div class="venta-card-pago">${pagoHtml}</div>
                    </div>
                    <div class="venta-card-foot-right">
                        <span class="venta-card-total">${formatoMonedaDashboard.format(v.totalVenta || 0)}</span>
                    </div>
                </div>
                <div class="venta-card-actions">
                    <button class="btn btn-action btn-action-view btn-print-invoice-fabrica" title="Ver / reimprimir factura"><i class="bi bi-receipt"></i><span class="btn-action-text">Factura</span></button>
                    ${puedeHacer('ventas_anular') ? `<button class="btn btn-action btn-action-danger btn-cancel-sale-fabrica" title="Anular venta" ${estaAnulada ? 'disabled' : ''}><i class="bi bi-x-circle"></i><span class="btn-action-text">Anular</span></button>` : ''}
                </div>
            </div>`;
    }

    document.getElementById('fv-filtro-buscar-ventas')?.addEventListener('input', aplicarFiltrosHistorial);
    document.getElementById('fv-filtro-fecha-ventas')?.addEventListener('input', aplicarFiltrosHistorial);
    document.getElementById('fv-btn-limpiar-filtro-ventas')?.addEventListener('click', () => {
        document.getElementById('fv-filtro-buscar-ventas').value = '';
        document.getElementById('fv-filtro-fecha-ventas').value = '';
        aplicarFiltrosHistorial();
    });

    renderCarrito();
    restaurarBorradorSiExiste();

    // ────────────────────────────────────────────────────────────────────
    // ── PEDIDOS WEB (mayoristas, desde mayor.html) ─────────────────────
    // ────────────────────────────────────────────────────────────────────
    // 'pedidosWeb' es una colección compartida con Boutique: index.html
    // escribe ahí con tenantId 'boutique' y mayor.html (la tienda mayorista
    // pública de Fábrica) con tenantId 'fabrica'. Antes, admin.html (Boutique)
    // escuchaba la colección completa sin filtrar por tenant, así que los
    // pedidos mayoristas de Fábrica también aparecían ahí — este bloque los
    // trae en cambio a admin-fabrica.html (filtrando por tenantId === 'fabrica'
    // en JS, sin depender de un índice compuesto nuevo) y los conecta
    // directamente con "Registrar Venta" de Fábrica para que, al aceptarlos
    // y guardar la venta, el stock se descuente de 'productosFabrica' (vía
    // actualizarStockFabrica) en vez de quedar sin ajustar como pasaba antes
    // por buscar el producto en el catálogo equivocado.
    (() => {
        const webOrdersContainer = document.getElementById('web-orders-container');
        const loadingWebOrders = document.getElementById('loading-web-orders');
        const pedidosWebCountBadge = document.getElementById('pedidos-web-count');
        if (!webOrdersContainer) return;

        let allOrders = { pendiente: [], aceptado: [], rechazado: [] };
        let currentTab = 'pendiente';
        let searchQuery = '';

        const searchInput = document.getElementById('pw-search');
        const tabButtons = document.querySelectorAll('#pw-tabs .pw-tab');

        if (searchInput) {
            let st;
            searchInput.addEventListener('input', e => { clearTimeout(st); st = setTimeout(() => { searchQuery = e.target.value.toLowerCase().trim(); renderCurrentTab(); }, 200); });
        }
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            renderCurrentTab();
        }));

        function getFiltered(estado) {
            return allOrders[estado].filter(({ id, order }) => {
                const q = searchQuery.replace(/^#/, '');
                return !searchQuery
                    || (order.clienteNombre || '').toLowerCase().includes(searchQuery)
                    || (order.asesorNombre || '').toLowerCase().includes(searchQuery)
                    || id.toLowerCase().includes(q);
            });
        }

        function formatFecha(ts) {
            if (!ts?.toDate) return 'Fecha no disponible';
            return ts.toDate().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
        }

        function updateStats() {
            const count = allOrders.pendiente.length;
            if (pedidosWebCountBadge) { pedidosWebCountBadge.textContent = count; pedidosWebCountBadge.style.display = count > 0 ? 'inline' : 'none'; }
            const pill = document.getElementById('pedidos-pending-pill');
            const pillCount = document.getElementById('pedidos-pending-count');
            if (pill && pillCount) { pillCount.textContent = count; pill.style.display = count > 0 ? 'inline-flex' : 'none'; }
            const statPendientes = document.getElementById('pw-stat-pendientes');
            if (statPendientes) statPendientes.textContent = count;
            ['pendiente', 'aceptado', 'rechazado'].forEach(t => { const b = document.getElementById(`pw-badge-${t}`); if (b) b.textContent = allOrders[t].length; });
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
            const aceptadosHoy = allOrders.aceptado.filter(({ order }) => { const f = order.fechaAceptacion?.toDate?.(); return f && f >= hoy; });
            const valorHoy = aceptadosHoy.reduce((s, { order }) => s + (order.totalPedido || 0), 0);
            const sH = document.getElementById('pw-stat-hoy'); if (sH) sH.textContent = aceptadosHoy.length;
            const sV = document.getElementById('pw-stat-valor'); if (sV) sV.textContent = formatoMonedaDashboard.format(valorHoy);
        }

        function renderCurrentTab() {
            webOrdersContainer.querySelectorAll('.pw-order-card, .pw-empty').forEach(el => el.remove());
            const orders = getFiltered(currentTab);
            if (orders.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'pw-empty';
                const labels = { pendiente: 'No hay pedidos pendientes', aceptado: 'No hay pedidos aceptados', rechazado: 'No hay pedidos rechazados' };
                const icons = { pendiente: 'bi-clock', aceptado: 'bi-check-circle', rechazado: 'bi-x-circle' };
                empty.innerHTML = `<i class="bi ${icons[currentTab]} pw-empty-icon"></i><p class="pw-empty-text">${labels[currentTab]}</p>`;
                webOrdersContainer.appendChild(empty);
                return;
            }
            const frag = document.createDocumentFragment();
            orders.forEach(({ id, order }) => frag.appendChild(createOrderCard(order, id)));
            webOrdersContainer.appendChild(frag);
        }

        function createOrderCard(order, orderId) {
            const card = document.createElement('div');
            const estado = order.estado || 'pendiente';
            card.className = `pw-order-card pw-status-${estado}`;
            card.dataset.orderId = orderId;
            const isPendiente = estado === 'pendiente';

            const itemsHtml = (order.items || []).map(item => {
                const producto = productosCache.find(p => p.id === item.productoId);
                const imgHtml = producto?.imagenUrl
                    ? `<img src="${producto.imagenUrl}" class="pw-item-img" alt="${item.nombre}">`
                    : `<div class="pw-item-img-placeholder"><i class="bi bi-image"></i></div>`;
                return `<div class="pw-item-row">
                    ${imgHtml}
                    <div class="pw-item-info">
                        <div class="pw-item-name">${item.nombre}</div>
                        <div class="pw-item-meta">${[item.talla, item.color].filter(Boolean).join(' · ')} · x${item.cantidad}</div>
                    </div>
                    <div class="pw-item-total">${formatoMonedaDashboard.format(item.total)}</div>
                </div>`;
            }).join('');

            const statusLabels = { pendiente: 'Pendiente', aceptado: 'Aceptado', rechazado: 'Rechazado' };
            const statusIcons = { pendiente: 'bi-clock-fill', aceptado: 'bi-check-circle-fill', rechazado: 'bi-x-circle-fill' };
            const statusBadge = `<span class="pw-status-badge ${estado}"><i class="bi ${statusIcons[estado]}"></i>${statusLabels[estado]}</span>`;

            const obsHtml = order.observaciones
                ? `<div class="pw-obs"><i class="bi bi-chat-text me-1"></i>${order.observaciones}</div>` : '';

            const actionsHtml = isPendiente ? `
                <div class="pw-actions">
                    <button class="pw-btn pw-btn-reject btn-reject-order-fab" data-order-id="${orderId}">
                        <i class="bi bi-x-lg"></i><span class="d-none d-sm-inline ms-1">Rechazar</span>
                    </button>
                    <button class="pw-btn pw-btn-accept btn-accept-order-fab" data-order-id="${orderId}">
                        <i class="bi bi-check-lg"></i><span class="ms-1">Aceptar</span>
                    </button>
                </div>` : '';

            card.innerHTML = `
                <div class="pw-card-header">
                    <div>
                        <div class="pw-card-id"><i class="bi bi-bag-check me-1"></i>#${orderId.substring(0, 8).toUpperCase()}</div>
                        <div class="pw-card-date">${formatFecha(order.timestamp)}</div>
                    </div>
                    ${statusBadge}
                </div>
                <div class="pw-card-body">
                    <div class="pw-client-row">
                        <div class="pw-client-name">${order.clienteNombre || 'Cliente General'}</div>
                        ${order.asesorNombre ? `<span class="pw-pago-badge"><i class="bi bi-person-badge"></i>${order.asesorNombre}</span>` : ''}
                    </div>
                    ${obsHtml}
                    <div class="pw-items-list">${itemsHtml}</div>
                </div>
                <div class="pw-card-footer">
                    <div>
                        <div class="pw-total-label">Total del pedido</div>
                        <div class="pw-total-val">${formatoMonedaDashboard.format(order.totalPedido || 0)}</div>
                    </div>
                    ${actionsHtml}
                </div>`;

            return card;
        }

        ['pendiente', 'aceptado', 'rechazado'].forEach(estado => {
            const q = query(webOrdersCollection, where('estado', '==', estado), orderBy('timestamp', 'desc'), limit(100));
            onSnapshot(q, snapshot => {
                allOrders[estado] = [];
                snapshot.forEach(d => {
                    const order = d.data();
                    if (order.tenantId !== 'fabrica') return;
                    allOrders[estado].push({ id: d.id, order });
                });
                if (loadingWebOrders) loadingWebOrders.style.display = 'none';
                updateStats();
                if (estado === currentTab) renderCurrentTab();
            }, err => console.error(`Error pedidos web fábrica ${estado}:`, err));
        });

        webOrdersContainer.addEventListener('click', async e => {
            const a = e.target.closest('.btn-accept-order-fab');
            const r = e.target.closest('.btn-reject-order-fab');
            if (a) { e.preventDefault(); await handleAcceptOrder(a.dataset.orderId); }
            else if (r) { e.preventDefault(); await handleRejectOrder(r.dataset.orderId); }
        });

        async function handleRejectOrder(orderId) {
            if (!confirm('¿Estás seguro de que quieres rechazar este pedido?')) return;
            try {
                await updateDoc(doc(db, 'pedidosWeb', orderId), { estado: 'rechazado', fechaRechazo: serverTimestamp() });
                showToast('Pedido rechazado correctamente', 'info');
            } catch (err) { console.error('Error al rechazar:', err); showToast('Error al rechazar el pedido', 'error'); }
        }

        async function handleAcceptOrder(orderId) {
            try {
                const orderRef = doc(db, 'pedidosWeb', orderId);
                const cached = allOrders.pendiente.find(o => o.id === orderId);
                let orderData = cached?.order;
                if (!orderData) {
                    const orderSnap = await getDoc(orderRef);
                    if (!orderSnap.exists()) { showToast('Pedido no encontrado', 'error'); return; }
                    orderData = orderSnap.data();
                }

                // Precarga el catálogo si aún no está en caché, para que el carrito
                // pueda mostrar imagen y respetar el stock real disponible; no bloquea
                // el resto del flujo si tarda.
                if (productosCache.length === 0) cargarProductosCache().then(renderCarrito).catch(() => {});

                carrito = (orderData.items || []).map(item => ({
                    productoId: item.productoId,
                    codigo: item.codigo || '',
                    nombre: item.nombre,
                    talla: item.talla,
                    color: item.color,
                    cantidad: item.cantidad,
                    precio: item.precio,
                    total: item.total ?? (item.precio * item.cantidad)
                }));
                seleccionarCliente({
                    id: null,
                    nombre: orderData.clienteNombre || 'Cliente General',
                    celular: orderData.clienteCelular || '',
                    direccion: orderData.clienteDireccion || ''
                });
                let obs = `Pedido Web #${orderId.substring(0, 8).toUpperCase()}`;
                if (orderData.asesorNombre) obs += ` · Asesor: ${orderData.asesorNombre}`;
                if (orderData.observaciones) obs += `\n${orderData.observaciones}`;
                if (observacionesInput) observacionesInput.value = obs;
                renderCarrito();

                mostrarVistaFormulario();
                if (window.adminShowSection) { window.adminShowSection('#registrar-venta'); window.adminMarkActive('#registrar-venta'); }
                showToast('Pedido aceptado. Completa el formulario de venta.', 'success');

                updateDoc(orderRef, { estado: 'aceptado', fechaAceptacion: serverTimestamp() })
                    .catch(err => { console.error('Error al marcar pedido como aceptado:', err); showToast('El pedido pasó al formulario, pero no se pudo marcar como aceptado. Verifica tu conexión.', 'error'); });
            } catch (err) { console.error('Error al aceptar:', err); showToast('Error al procesar el pedido', 'error'); }
        }
    })();
})();

// ========================================================================
// ✅ SECCIÓN: CATEGORÍAS — taxonomía COMPARTIDA con Boutique a propósito
// (misma colección 'categorias', sin tenantId: ambos negocios usan la
// misma lista, igual que ya la lee en modo solo-lectura Productos Fábrica).
// ========================================================================
(() => {
    const list = document.getElementById('catfab-lista');
    const form = document.getElementById('catfab-form');
    if (!list || !form) return;

    const nombreInput = document.getElementById('catfab-nombre');
    const editForm = document.getElementById('catfab-edit-form');
    const editIdInput = document.getElementById('catfab-edit-id');
    const editNombreInput = document.getElementById('catfab-edit-nombre');
    const btnConfirmDelete = document.getElementById('catfab-confirm-delete-btn');

    let idPendienteEliminar = null;

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    async function checkDuplicado(nombre, idActual = null) {
        const q = query(categoriasCollection, where('nombreLower', '==', nombre.toLowerCase()));
        const snap = await getDocs(q);
        return snap.docs.some(d => d.id !== idActual);
    }

    function render(snapshot) {
        if (snapshot.empty) {
            list.innerHTML = '<li class="list-group-item text-muted">No hay categorías.</li>';
            return;
        }
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.dataset.id = docSnap.id;
            li.innerHTML = `<span class="catfab-nombre">${d.nombre}</span>
                <div class="action-buttons">
                    <button class="btn btn-action btn-action-edit me-1 catfab-btn-editar"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button>
                    <button class="btn btn-action btn-action-delete catfab-btn-eliminar"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button>
                </div>`;
            list.appendChild(li);
        });
    }

    onSnapshot(query(categoriasCollection, orderBy('nombre')), render, (error) => {
        console.error('Error al cargar categorías:', error);
        list.innerHTML = '<li class="list-group-item text-danger">Error al cargar.</li>';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = nombreInput.value.trim();
        if (!nombre) return;
        if (await checkDuplicado(nombre)) {
            showToast('Ya existe una categoría con ese nombre.', 'warning');
            return;
        }
        try {
            await addDoc(categoriasCollection, { nombre, nombreLower: nombre.toLowerCase() });
            showToast('Categoría guardada', 'success');
            nombreInput.value = '';
        } catch (error) {
            console.error('Error al guardar categoría:', error);
            showToast(`Error: ${error.message}`, 'error');
        }
    });

    list.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        const id = li.dataset.id;
        const nombreActual = li.querySelector('.catfab-nombre')?.textContent || '';

        if (e.target.closest('.catfab-btn-editar')) {
            editIdInput.value = id;
            editNombreInput.value = nombreActual;
            getModal('catfabEditModal').show();
        }

        if (e.target.closest('.catfab-btn-eliminar')) {
            idPendienteEliminar = id;
            document.getElementById('catfab-delete-name').textContent = nombreActual;
            getModal('catfabDeleteModal').show();
        }
    });

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = editIdInput.value;
            const nombre = editNombreInput.value.trim();
            if (!id || !nombre) return;
            if (await checkDuplicado(nombre, id)) {
                showToast('Ya existe otra categoría con ese nombre.', 'warning');
                return;
            }
            try {
                await updateDoc(doc(db, 'categorias', id), { nombre, nombreLower: nombre.toLowerCase() });
                showToast('Categoría actualizada', 'success');
                getModal('catfabEditModal').hide();
            } catch (error) {
                console.error('Error al actualizar categoría:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'categorias', idPendienteEliminar));
                showToast('Categoría eliminada', 'success');
                getModal('catfabDeleteModal').hide();
                idPendienteEliminar = null;
            } catch (error) {
                console.error('Error al eliminar categoría:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    console.log("✅ Módulo Categorías Fábrica inicializado");
})();

// ========================================================================
// ✅ SECCIÓN: CARGUE MASIVO — mismo asistente de 3 pasos que Boutique,
// adaptado a productosFabrica: sin precio_detal ni proveedor (Fábrica no
// tiene esos conceptos), con grupo_mayorista opcional. Escribe siempre en
// 'variaciones' (Fábrica no usa el campo plano 'stock' como Boutique).
// ========================================================================
(() => {
    const inputArchivo = document.getElementById('cmfab-input-archivo');
    const btnSeleccionarArchivo = document.getElementById('cmfab-btn-seleccionar-archivo');
    if (!inputArchivo || !btnSeleccionarArchivo) return;

    const historialCarguesCollection = collection(db, 'historial_cargues_fabrica');

    const btnCancelar = document.getElementById('cmfab-btn-cancelar');
    const btnProcesarDatos = document.getElementById('cmfab-btn-procesar-datos');
    const btnVolverEdicion = document.getElementById('cmfab-btn-volver-edicion');
    const btnConfirmarCarga = document.getElementById('cmfab-btn-confirmar-carga');

    const pasoSubir = document.getElementById('cmfab-paso-subir');
    const pasoVistaPrevia = document.getElementById('cmfab-paso-vista-previa');
    const pasoConfirmacion = document.getElementById('cmfab-paso-confirmacion');
    const cargueLoader = document.getElementById('cmfab-loader');

    const tbodyVistaPrevia = document.getElementById('cmfab-tbody-vista-previa');
    const nombreArchivoEl = document.getElementById('cmfab-nombre-archivo');
    const totalFilasEl = document.getElementById('cmfab-total-filas');
    const filasValidasEl = document.getElementById('cmfab-filas-validas');
    const filasErroresEl = document.getElementById('cmfab-filas-errores');

    let datosExcel = [];
    let productosAgrupados = [];
    let categoriasMap = new Map();
    let productosExistentes = [];

    function normalizarVariacionCM(v) {
        const n = (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        return (n === 'unica' || n === 'unico') ? '' : n;
    }
    function claveVariacionCM(talla, color) {
        return `${normalizarVariacionCM(talla)}||${normalizarVariacionCM(color)}`;
    }

    // Fusiona 'nuevasVariaciones' (filas del Excel para UN producto) contra
    // el stock REAL más reciente del producto, dentro de una transacción.
    // Entre que se detectan duplicados (Paso 2) y se confirma la carga
    // (Paso 3) el usuario puede tardarse revisando la vista previa — si en
    // ese lapso alguien vende esa prenda, escribir el array completo con lo
    // leído en el Paso 2 (como se hacía antes) borraba esa venta. Al leer
    // el documento dentro de la misma transacción que lo escribe, siempre
    // se parte del stock real, sin importar cuánto haya pasado.
    async function fusionarVariacionesEnTransaccion(productoId, nuevasVariaciones, accion) {
        const ref = doc(db, 'productosFabrica', productoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const variacionesActuales = snap.exists() ? [...(snap.data().variaciones || [])] : [];

            nuevasVariaciones.forEach(nuevaVar => {
                const tallaVar = nuevaVar.talla || '';
                const colorVar = nuevaVar.color || '';
                const claveNueva = claveVariacionCM(tallaVar, colorVar);
                const indexExistente = variacionesActuales.findIndex(v => claveVariacionCM(v.talla, v.color) === claveNueva);

                if (indexExistente >= 0) {
                    if (accion === 'reemplazar') {
                        variacionesActuales[indexExistente].stock = nuevaVar.cantidad;
                    } else {
                        variacionesActuales[indexExistente].stock = (parseFloat(variacionesActuales[indexExistente].stock) || 0) + nuevaVar.cantidad;
                    }
                } else {
                    variacionesActuales.push({ talla: tallaVar, color: colorVar, stock: nuevaVar.cantidad });
                }
            });

            tx.update(ref, { variaciones: variacionesActuales });
        });
    }

    // ── 1) Leer Excel ──
    async function leerExcel(archivo) {
        mostrarLoader('Leyendo archivo...', 10);
        await loadExternalLib('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
                    const datos = XLSX.utils.sheet_to_json(primeraHoja, { raw: false });

                    if (datos.length === 0) {
                        reject(new Error('El archivo está vacío'));
                        return;
                    }

                    const datosNormalizados = datos.map(fila => {
                        const filaNormalizada = {};
                        for (let key in fila) {
                            filaNormalizada[key.trim().toLowerCase()] = fila[key];
                        }
                        return filaNormalizada;
                    });

                    const columnas = Object.keys(datosNormalizados[0]);
                    const columnasObligatorias = ['nombre', 'categoria', 'precio_mayor', 'talla', 'color', 'cantidad'];
                    const columnasFaltantes = columnasObligatorias.filter(col => !columnas.includes(col));
                    if (columnasFaltantes.length > 0) {
                        reject(new Error(`Faltan columnas obligatorias: ${columnasFaltantes.join(', ')}`));
                        return;
                    }

                    actualizarProgreso(30);
                    resolve(datosNormalizados);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = function() { reject(new Error('Error al leer el archivo')); };
            reader.readAsArrayBuffer(archivo);
        });
    }

    // ── 2) Validar datos de una fila ──
    function validarDatos(fila, index) {
        const errores = [];

        if (!fila.nombre || fila.nombre.trim() === '') errores.push('Nombre vacío');
        if (!fila.categoria || fila.categoria.trim() === '') errores.push('Categoría vacía');

        const precioMayor = parseFloat(fila.precio_mayor);
        if (isNaN(precioMayor) || precioMayor < 0) errores.push('Precio mayor inválido');

        let costo = parseFloat(fila.costo);
        if (isNaN(costo) || costo < 0) costo = precioMayor * 0.5;

        const descripcion = fila.descripcion?.trim() || '';
        const codigo = fila.codigo?.trim() || '';
        const grupoMayorista = fila.grupo_mayorista?.trim() || '';

        const cantidad = parseInt(fila.cantidad);
        if (isNaN(cantidad) || cantidad <= 0) errores.push('Cantidad inválida o cero');

        return {
            index,
            nombre: fila.nombre?.trim() || '',
            descripcion,
            categoria: fila.categoria?.trim() || '',
            codigo,
            costo,
            precio_mayor: precioMayor,
            grupo_mayorista: grupoMayorista,
            talla: fila.talla?.trim() || '',
            color: fila.color?.trim() || '',
            cantidad,
            errores,
            valida: errores.length === 0
        };
    }

    // ── 3) Agrupar variaciones (clave: código si existe, si no nombre+categoría) ──
    function agruparVariaciones(datos) {
        mostrarLoader('Agrupando productos y variaciones...', 50);
        const grupos = new Map();

        datos.forEach(fila => {
            if (!fila.valida) return;

            const clave = fila.codigo
                ? `codigo_${fila.codigo.trim().toLowerCase()}`
                : `${fila.nombre.trim().toLowerCase()}_${fila.categoria.trim().toLowerCase()}`;

            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    nombre: fila.nombre.trim(),
                    descripcion: fila.descripcion.trim(),
                    categoria: fila.categoria.trim(),
                    codigo: fila.codigo || '',
                    costo: fila.costo,
                    precio_mayor: fila.precio_mayor,
                    grupo_mayorista: fila.grupo_mayorista || '',
                    variaciones: []
                });
            }

            grupos.get(clave).variaciones.push({
                talla: fila.talla?.trim() || '',
                color: fila.color?.trim() || '',
                cantidad: fila.cantidad
            });
        });

        actualizarProgreso(70);
        return Array.from(grupos.values());
    }

    // ── 4) Detectar duplicados contra el catálogo real de Fábrica ──
    async function validarDuplicadosFirestore(productos) {
        mostrarLoader('Validando duplicados en catálogo...', 80);
        try {
            if (categoriasMap.size === 0) await cargarDatosIniciales();

            const snapshot = await getDocs(query(productosFabricaCollection, where('tenantId', '==', 'fabrica')));
            productosExistentes = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const categoriaNombre = categoriasMap.get(data.categoriaId)?.nombre || '';
                productosExistentes.push({
                    id: docSnap.id,
                    nombre: data.nombre?.toLowerCase().trim(),
                    categoria: categoriaNombre.toLowerCase().trim(),
                    categoriaId: data.categoriaId,
                    variaciones: data.variaciones,
                    nombreOriginal: data.nombre,
                    categoriaOriginal: categoriaNombre,
                    ...data
                });
            });

            productos.forEach(producto => {
                const nombreNorm = producto.nombre.toLowerCase().trim();
                const categoriaNorm = producto.categoria.toLowerCase().trim();
                const codigoExcel = producto.codigo?.toLowerCase().trim() || '';

                let productoEncontrado = null;

                if (codigoExcel) {
                    productoEncontrado = productosExistentes.find(existente =>
                        (existente.codigo?.toLowerCase().trim() || '') === codigoExcel);
                    if (productoEncontrado) {
                        producto.esDuplicado = true;
                        producto.productoExistenteId = productoEncontrado.id;
                        producto.productoExistente = productoEncontrado;
                        producto.accionDuplicado = 'sumar';
                        producto.encontradoPorCodigo = true;
                    }
                }

                if (!productoEncontrado) {
                    const productosMismoNombre = productosExistentes.filter(existente => existente.nombre === nombreNorm);

                    if (productosMismoNombre.length > 0) {
                        const matchExacto = productosMismoNombre.find(existente => existente.categoria === categoriaNorm);

                        if (matchExacto) {
                            producto.esDuplicado = true;
                            producto.productoExistenteId = matchExacto.id;
                            producto.productoExistente = matchExacto;
                            producto.accionDuplicado = 'sumar';
                        } else {
                            const primerProducto = productosMismoNombre[0];
                            producto.esDuplicado = true;
                            producto.productoExistenteId = primerProducto.id;
                            producto.productoExistente = primerProducto;
                            producto.accionDuplicado = 'sumar';
                            producto.advertenciaCategoriaProveedor = true;
                        }
                    } else {
                        producto.esDuplicado = false;
                        producto.productoExistenteId = null;
                        producto.productoExistente = null;
                        producto.accionDuplicado = null;
                    }
                }
            });

            actualizarProgreso(90);
            return productos;
        } catch (error) {
            console.error('Error al validar duplicados:', error);
            throw error;
        }
    }

    // ── 5) Guardar producto nuevo ──
    async function guardarProductoFirestore(producto) {
        const categoriaId = await buscarOCrearCategoria(producto.categoria);
        const codigo = generarCodigoProducto();

        const nuevoProducto = {
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            categoriaId,
            grupoMayorista: (producto.grupo_mayorista && WHOLESALE_TIER_GROUPS[producto.grupo_mayorista]) ? producto.grupo_mayorista : null,
            costoCompra: producto.costo,
            precioMayor: producto.precio_mayor,
            codigo,
            visible: false,
            timestamp: serverTimestamp(),
            variaciones: [],
            tenantId: 'fabrica'
        };

        const docRef = await addDoc(productosFabricaCollection, nuevoProducto);
        return docRef.id;
    }

    // ── 6) Guardar variaciones de un producto recién creado ──
    async function guardarVariacionesFirestore(productoId, variaciones) {
        const productoRef = doc(db, 'productosFabrica', productoId);
        const variacionesArray = variaciones.map(v => ({
            talla: v.talla || '',
            color: v.color || '',
            stock: v.cantidad || 0
        }));
        await updateDoc(productoRef, { variaciones: variacionesArray });
    }

    // ── 7) Historial del cargue ──
    async function guardarHistorial(totalProductos, totalVariaciones, totalUnidades) {
        try {
            await addDoc(historialCarguesCollection, {
                fecha: serverTimestamp(),
                totalProductos,
                totalVariaciones,
                totalUnidades,
                tenantId: 'fabrica'
            });
        } catch (error) {
            console.error('Error al guardar historial de cargue:', error);
        }
    }

    // ── Auxiliares ──
    async function buscarOCrearCategoria(nombreCategoria) {
        const nombreNormalizado = nombreCategoria.trim();

        for (let [id, cat] of categoriasMap) {
            if (cat.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) return id;
        }

        const snapshot = await getDocs(categoriasCollection);
        for (let docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                categoriasMap.set(docSnap.id, { id: docSnap.id, ...data });
                return docSnap.id;
            }
        }

        const docRef = await addDoc(categoriasCollection, { nombre: nombreNormalizado, nombreLower: nombreNormalizado.toLowerCase() });
        categoriasMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        return docRef.id;
    }

    function generarCodigoProducto() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 4).toUpperCase();
        return `PF${timestamp}${random}`;
    }

    function mostrarLoader(mensaje, progreso) {
        cargueLoader.style.display = 'flex';
        document.getElementById('cmfab-loader-mensaje').textContent = mensaje;
        actualizarProgreso(progreso);
    }
    function ocultarLoader() { cargueLoader.style.display = 'none'; }
    function actualizarProgreso(porcentaje) {
        document.getElementById('cmfab-loader-progreso').style.width = `${porcentaje}%`;
        document.getElementById('cmfab-loader-porcentaje').textContent = `${porcentaje}%`;
    }
    function mostrarPaso(paso) {
        pasoSubir.style.display = 'none';
        pasoVistaPrevia.style.display = 'none';
        pasoConfirmacion.style.display = 'none';
        paso.style.display = 'block';
    }

    // ── PASO 1: seleccionar archivo ──
    btnSeleccionarArchivo.addEventListener('click', () => inputArchivo.click());

    inputArchivo.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;

        try {
            nombreArchivoEl.textContent = archivo.name;
            const datos = await leerExcel(archivo);
            datosExcel = datos.map((fila, index) => validarDatos(fila, index));

            totalFilasEl.textContent = datosExcel.length;
            filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
            filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;

            renderizarTablaVistaPrevia();
            btnProcesarDatos.disabled = datosExcel.filter(f => f.valida).length === 0;

            ocultarLoader();
            mostrarPaso(pasoVistaPrevia);
        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar archivo: ' + error.message, 'error');
            console.error(error);
        }
    });

    function renderizarTablaVistaPrevia() {
        tbodyVistaPrevia.innerHTML = '';

        datosExcel.forEach((fila, index) => {
            const tr = document.createElement('tr');
            tr.className = fila.valida ? '' : 'table-danger';
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td contenteditable="true" data-index="${index}" data-field="nombre">${fila.nombre || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="descripcion">${fila.descripcion || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="categoria">${fila.categoria || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="costo">${fila.costo || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_mayor">${fila.precio_mayor || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="talla">${fila.talla || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="color">${fila.color || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="cantidad">${fila.cantidad || 0}</td>
                <td><button class="btn btn-sm btn-outline-danger" data-delete="${index}"><i class="bi bi-trash"></i></button></td>
            `;

            tr.querySelectorAll('[contenteditable]').forEach(celda => {
                celda.addEventListener('blur', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    const field = e.target.dataset.field;
                    datosExcel[idx][field] = e.target.textContent.trim();
                    datosExcel[idx] = validarDatos(datosExcel[idx], idx);
                    filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                    filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
                });
            });

            tr.querySelector('[data-delete]').addEventListener('click', () => {
                datosExcel.splice(index, 1);
                renderizarTablaVistaPrevia();
                totalFilasEl.textContent = datosExcel.length;
                filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
            });

            tbodyVistaPrevia.appendChild(tr);
        });
    }

    // ── PASO 2: procesar datos ──
    btnProcesarDatos.addEventListener('click', async () => {
        try {
            const datosValidos = datosExcel.filter(f => f.valida);
            productosAgrupados = agruparVariaciones(datosValidos);
            productosAgrupados = await validarDuplicadosFirestore(productosAgrupados);

            const totalProductos = productosAgrupados.length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) => sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0);

            document.getElementById('cmfab-resumen-total-productos').textContent = totalProductos;
            document.getElementById('cmfab-resumen-total-variaciones').textContent = totalVariaciones;
            document.getElementById('cmfab-resumen-total-unidades').textContent = totalUnidades;

            const duplicadosConflicto = productosAgrupados.filter(p => p.esDuplicado && p.advertenciaCategoriaProveedor);
            const duplicadosNormales = productosAgrupados.filter(p => p.esDuplicado && !p.advertenciaCategoriaProveedor);

            if (duplicadosConflicto.length > 0) {
                renderizarAdvertencias(duplicadosConflicto.map(producto => ({ producto, existentes: [producto.productoExistente] })));
                document.getElementById('cmfab-seccion-advertencias').style.display = 'block';
            } else {
                document.getElementById('cmfab-seccion-advertencias').style.display = 'none';
            }

            if (duplicadosNormales.length > 0) {
                document.getElementById('cmfab-seccion-duplicados').style.display = 'block';
                renderizarDuplicados(duplicadosNormales);
            } else {
                document.getElementById('cmfab-seccion-duplicados').style.display = 'none';
            }

            ocultarLoader();
            mostrarPaso(pasoConfirmacion);
        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar datos: ' + error.message, 'error');
            console.error(error);
        }
    });

    function renderizarAdvertencias(advertencias) {
        const contenedor = document.getElementById('cmfab-lista-advertencias');
        contenedor.innerHTML = '';

        advertencias.forEach(({ producto, existentes }) => {
            const div = document.createElement('div');
            div.className = 'alert alert-danger mb-2 border-3';
            div.innerHTML = `
                <div class="d-flex align-items-start">
                    <i class="bi bi-x-octagon-fill me-2 flex-shrink-0 text-danger" style="font-size: 1.5rem;"></i>
                    <div class="flex-grow-1">
                        <h6 class="alert-heading mb-2">🚨 CONFLICTO DETECTADO: "${producto.nombre}"</h6>
                        <small class="d-block mb-2">Excel: Categoría: <strong>${producto.categoria}</strong></small>
                        <hr class="my-2">
                        <small class="d-block mb-1"><strong>⚠️ Ya existe(n) ${existentes.length} producto(s) con este nombre:</strong></small>
                        ${existentes.map(p => `
                            <div class="ms-3 mb-1 p-2 bg-white rounded">
                                <small class="d-block">
                                    <strong>Código: ${p.codigo || 'SIN-CÓDIGO'}</strong><br>
                                    Categoría: "${p.categoriaOriginal}"
                                </small>
                            </div>
                        `).join('')}
                        <div class="alert alert-light mt-2 mb-0">
                            <small class="d-block fw-bold text-danger">
                                ⚠️ Las variaciones se agregarán al PRIMER producto existente para evitar duplicados.<br>
                                Si esto es incorrecto, CANCELA el cargue y corrige la categoría en el Excel.
                            </small>
                        </div>
                    </div>
                </div>
            `;
            contenedor.appendChild(div);
        });
    }

    function renderizarDuplicados(duplicados) {
        const contenedor = document.getElementById('cmfab-lista-duplicados');
        contenedor.innerHTML = '';

        duplicados.forEach((producto, index) => {
            const productoExistente = producto.productoExistente;
            const stockActual = (productoExistente.variaciones || []).reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
            const unidadesNuevas = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);

            let variacionesExistentesHTML = '';
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                const variacionesTexto = productoExistente.variaciones.map(v => `${v.talla || '—'}/${v.color || '—'} (${v.stock})`).join(', ');
                variacionesExistentesHTML = `<div class="col-12 mt-2"><small class="text-muted d-block">Variaciones actuales:</small><small><strong>${variacionesTexto}</strong></small></div>`;
            }

            let variacionesNuevasHTML = '';
            if (producto.variaciones && producto.variaciones.length > 0) {
                const variacionesTexto = producto.variaciones.map(v => `${v.talla || '—'}/${v.color || '—'} (${v.cantidad})`).join(', ');
                variacionesNuevasHTML = `<div class="col-12 mt-2"><small class="text-muted d-block">Variaciones del Excel:</small><small class="text-success"><strong>${variacionesTexto}</strong></small></div>`;
            }

            const div = document.createElement('div');
            div.className = 'card mb-2 border-warning';
            div.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">${producto.nombre}</h6>
                            <small class="text-muted d-block">Categoría: ${producto.categoria}</small>
                            <small class="d-block mt-1">
                                <span class="badge bg-secondary">${productoExistente.codigo || 'SIN-CÓDIGO'}</span>
                                <span class="text-muted ms-2">ID: ${productoExistente.id}</span>
                            </small>
                        </div>
                        <span class="badge bg-warning text-dark">Duplicado</span>
                    </div>
                    <div class="row g-2 mb-2">
                        <div class="col-6"><small class="text-muted d-block">Stock actual:</small><strong class="text-primary">${stockActual} unidades</strong></div>
                        <div class="col-6"><small class="text-muted d-block">A cargar:</small><strong class="text-success">+${unidadesNuevas} unidades</strong></div>
                        ${variacionesExistentesHTML}
                        ${variacionesNuevasHTML}
                    </div>
                    <div class="mt-2">
                        <label class="form-label mb-1"><strong>¿Qué deseas hacer?</strong></label>
                        <select class="form-select form-select-sm" data-duplicado-index="${index}">
                            <option value="sumar">✅ Sumar al stock existente (Stock final: ${stockActual + unidadesNuevas})</option>
                            <option value="reemplazar">🔄 Reemplazar stock (Stock final: ${unidadesNuevas})</option>
                            <option value="omitir">❌ Omitir este producto</option>
                        </select>
                    </div>
                </div>
            `;
            div.querySelector('select').addEventListener('change', (e) => { producto.accionDuplicado = e.target.value; });
            contenedor.appendChild(div);
        });
    }

    // ── PASO 3: confirmar carga ──
    btnConfirmarCarga.addEventListener('click', async () => {
        if (btnConfirmarCarga.disabled) return; // evita doble clic mientras ya se está guardando
        btnConfirmarCarga.disabled = true;
        try {
            mostrarLoader('Guardando productos en catálogo...', 0);
            let contador = 0;
            const total = productosAgrupados.length;

            for (const producto of productosAgrupados) {
                if (producto.esDuplicado) {
                    if (producto.accionDuplicado === 'omitir') { contador++; continue; }
                    await fusionarVariacionesEnTransaccion(producto.productoExistenteId, producto.variaciones, producto.accionDuplicado);
                } else {
                    const nombreNorm = producto.nombre.toLowerCase().trim();
                    const productoConMismoNombre = productosExistentes.find(p => p.nombre === nombreNorm);

                    if (productoConMismoNombre) {
                        await fusionarVariacionesEnTransaccion(productoConMismoNombre.id, producto.variaciones, 'sumar');
                    } else {
                        const productoId = await guardarProductoFirestore(producto);
                        await guardarVariacionesFirestore(productoId, producto.variaciones);
                    }
                }

                contador++;
                actualizarProgreso(Math.round((contador / total) * 100));
            }

            const totalProductos = productosAgrupados.filter(p => !p.esDuplicado || p.accionDuplicado !== 'omitir').length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) => sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0);

            await guardarHistorial(totalProductos, totalVariaciones, totalUnidades);

            ocultarLoader();
            showToast(`Cargue completado: ${totalProductos} productos, ${totalUnidades} unidades`, 'success');

            datosExcel = [];
            productosAgrupados = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        } catch (error) {
            ocultarLoader();
            showToast('Error al guardar: ' + error.message, 'error');
            console.error(error);
        } finally {
            btnConfirmarCarga.disabled = false;
        }
    });

    btnCancelar.addEventListener('click', () => {
        if (confirm('¿Estás seguro de cancelar? Se perderán los datos cargados.')) {
            datosExcel = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        }
    });

    btnVolverEdicion.addEventListener('click', () => mostrarPaso(pasoVistaPrevia));

    async function cargarDatosIniciales() {
        try {
            const catSnapshot = await getDocs(categoriasCollection);
            catSnapshot.forEach(docSnap => categoriasMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
        } catch (error) {
            console.error('Error al cargar categorías para Cargue Masivo:', error);
        }
    }
    cargarDatosIniciales();

    console.log("✅ Módulo Cargue Masivo Fábrica inicializado");
})();

// ========================================================================
// ✅ SECCIÓN: CLIENTES — clientes mayoristas propios de Fábrica. Misma
// colección compartida 'clientes' que usa Registrar Venta, filtrada por
// tenantId === 'fabrica' (igual que ya hace la búsqueda de cliente ahí).
// ========================================================================
(() => {
    const tbody = document.getElementById('clifab-tabla-body');
    const form = document.getElementById('clifabForm');
    if (!tbody || !form) return;

    const clientesCollection = collection(db, 'clientes');
    const searchInput = document.getElementById('clifab-search');
    const btnNuevo = document.getElementById('clifab-btn-nuevo');
    const modalTitle = document.getElementById('clifabModalTitle');
    const idInput = document.getElementById('clifab-id');
    const cedulaInput = document.getElementById('clifab-cedula');
    const nombreInput = document.getElementById('clifab-nombre');
    const celularInput = document.getElementById('clifab-celular');
    const direccionInput = document.getElementById('clifab-direccion');
    const btnConfirmDelete = document.getElementById('clifab-confirm-delete-btn');

    let clientes = [];
    let idPendienteEliminar = null;

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    function renderTabla() {
        const texto = (searchInput.value || '').trim().toLowerCase();
        const filtrados = clientes.filter(c => {
            if (!texto) return true;
            return (c.nombre || '').toLowerCase().includes(texto) ||
                   (c.cedula || '').toLowerCase().includes(texto) ||
                   (c.celular || '').toLowerCase().includes(texto);
        });

        if (!filtrados.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-5">No hay clientes registrados</td></tr>`;
            return;
        }

        tbody.innerHTML = filtrados.map(c => `
            <tr data-id="${c.id}">
                <td class="px-4">${c.nombre || ''}</td>
                <td>${c.cedula || '-'}</td>
                <td>${c.celular || '-'}</td>
                <td>${c.direccion || '-'}</td>
                <td>${c.ultimaCompra?.toDate ? c.ultimaCompra.toDate().toLocaleDateString('es-CO') : '-'}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary clifab-btn-historial" title="Historial de compras"><i class="bi bi-clock-history"></i></button>
                    <button class="btn btn-sm btn-outline-primary clifab-btn-editar" title="Editar"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger clifab-btn-eliminar" title="Eliminar"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`).join('');
    }

    async function cargarClientes() {
        try {
            const snap = await getDocs(query(clientesCollection, where('tenantId', '==', 'fabrica'), orderBy('nombre')));
            clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderTabla();
        } catch (error) {
            console.error('Error al cargar clientes de fábrica:', error);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-5">Error al cargar: ${error.message}</td></tr>`;
        }
    }

    searchInput.addEventListener('input', renderTabla);

    function abrirModalNuevo() {
        form.reset();
        idInput.value = '';
        modalTitle.textContent = 'Nuevo Cliente';
        getModal('clifabModal').show();
    }
    btnNuevo.addEventListener('click', abrirModalNuevo);

    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const cliente = clientes.find(c => c.id === tr.dataset.id);
        if (!cliente) return;

        if (e.target.closest('.clifab-btn-editar')) {
            idInput.value = cliente.id;
            cedulaInput.value = cliente.cedula || '';
            nombreInput.value = cliente.nombre || '';
            celularInput.value = cliente.celular || '';
            direccionInput.value = cliente.direccion || '';
            modalTitle.textContent = 'Editar Cliente';
            getModal('clifabModal').show();
        }

        if (e.target.closest('.clifab-btn-eliminar')) {
            idPendienteEliminar = cliente.id;
            document.getElementById('clifab-delete-name').textContent = cliente.nombre || '';
            getModal('clifabDeleteModal').show();
        }

        if (e.target.closest('.clifab-btn-historial')) {
            mostrarHistorialCliente(cliente.nombre || '');
        }
    });

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'clientes', idPendienteEliminar));
                showToast('Cliente eliminado', 'success');
                getModal('clifabDeleteModal').hide();
                idPendienteEliminar = null;
                cargarClientes();
            } catch (error) {
                console.error('Error al eliminar cliente:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = nombreInput.value.trim();
        const celular = celularInput.value.trim();
        if (!nombre || !celular) {
            showToast('Nombre y celular son requeridos', 'warning');
            return;
        }

        const id = idInput.value;
        const datos = {
            nombre,
            cedula: cedulaInput.value.trim(),
            celular,
            direccion: direccionInput.value.trim()
        };

        try {
            if (id) {
                await updateDoc(doc(db, 'clientes', id), datos);
                showToast('Cliente actualizado', 'success');
            } else {
                await addDoc(clientesCollection, { ...datos, tenantId: 'fabrica', ultimaCompra: null });
                showToast('Cliente guardado', 'success');
            }
            getModal('clifabModal').hide();
            form.reset();
            cargarClientes();
        } catch (error) {
            console.error('Error al guardar cliente:', error);
            showToast(`Error: ${error.message}`, 'error');
        }
    });

    async function mostrarHistorialCliente(clienteNombre) {
        getModal('clifabHistoryModal').show();
        document.getElementById('clifab-history-name').textContent = clienteNombre;
        const historyList = document.getElementById('clifab-history-list');
        historyList.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div></td></tr>`;

        try {
            const q = query(ventasCollection, where('tenantId', '==', 'fabrica'), where('clienteNombre', '==', clienteNombre));
            const snap = await getDocs(q);

            if (snap.empty) {
                historyList.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Este cliente no tiene compras registradas</td></tr>`;
                document.getElementById('clifab-total-spent').textContent = '$0';
                document.getElementById('clifab-total-purchases').textContent = '0';
                document.getElementById('clifab-last-purchase').textContent = '-';
                document.getElementById('clifab-avg-ticket').textContent = '$0';
                return;
            }

            const ventas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            ventas.sort((a, b) => {
                const fa = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
                const fb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
                return fb - fa;
            });

            const totalGastado = ventas.reduce((s, v) => s + (v.totalVenta || 0), 0);
            const totalCompras = ventas.length;
            const ticketPromedio = totalCompras > 0 ? totalGastado / totalCompras : 0;
            const fechaUltima = ventas[0]?.timestamp?.toDate ? ventas[0].timestamp.toDate() : null;

            document.getElementById('clifab-total-spent').textContent = formatoMonedaDashboard.format(totalGastado);
            document.getElementById('clifab-total-purchases').textContent = totalCompras;
            document.getElementById('clifab-last-purchase').textContent = fechaUltima ? fechaUltima.toLocaleDateString('es-CO') : '-';
            document.getElementById('clifab-avg-ticket').textContent = formatoMonedaDashboard.format(ticketPromedio);

            historyList.innerHTML = ventas.map(venta => {
                const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleDateString('es-CO') : '-';
                const productos = venta.items?.length || 0;
                const productosTexto = productos === 1 ? '1 producto' : `${productos} productos`;
                let metodoPago = 'Transferencia';
                if (venta.pagoEfectivo > 0 && venta.pagoTransferencia > 0) metodoPago = 'Mixto';
                else if (venta.pagoEfectivo > 0) metodoPago = 'Efectivo';
                const estado = venta.estado || 'Completada';
                const estadoBadge = estado === 'Pendiente' ? 'bg-warning' : ((estado === 'Anulada' || estado === 'Cancelada') ? 'bg-danger' : 'bg-success');
                return `
                    <tr>
                        <td>${fecha}</td>
                        <td>${productosTexto}</td>
                        <td class="fw-bold">${formatoMonedaDashboard.format(venta.totalVenta || 0)}</td>
                        <td>${metodoPago}</td>
                        <td><span class="badge ${estadoBadge}">${estado}</span></td>
                    </tr>`;
            }).join('');
        } catch (error) {
            console.error('Error al cargar historial de cliente:', error);
            historyList.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Error al cargar historial</td></tr>`;
        }
    }

    const tabLink = document.querySelector('a[href="#clientes-fabrica"]');
    if (tabLink) tabLink.addEventListener('click', cargarClientes);
    window.addEventListener('hashchange', () => {
        if ((window.location.hash || '') === '#clientes-fabrica') cargarClientes();
    });
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === '#clientes-fabrica') cargarClientes();
    });
    if ((window.location.hash || '') === '#clientes-fabrica') cargarClientes();

    console.log("✅ Módulo Clientes Fábrica inicializado");
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
    // Talla+color que el producto tenía cuando se abrió el modal de edición
    // (null mientras se crea un producto nuevo). Se usa al guardar para
    // saber qué filas borró el usuario a propósito vs. cuáles nunca vio
    // porque las agregó/vendió otra persona mientras el modal estaba abierto.
    let productoEditandoVariacionesOriginales = null;

    function claveVariacionFabrica(talla, color) {
        return `${normalizarVariacionProdFab(talla)}||${normalizarVariacionProdFab(color)}`;
    }
    function normalizarVariacionProdFab(v) {
        const n = (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        return (n === 'unica' || n === 'unico') ? '' : n;
    }

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
        grupoMayoristaSelect.innerHTML =
            '<option value="">Automático (detecta la tabla por la categoría)</option>' +
            '<option value="ninguno">Ninguno — forzar Precio Mayor fijo</option>' +
            grupos.map(([clave, g]) => `<option value="${clave}">${g.label}</option>`).join('');
    }

    // La categoría es solo taxonomía/filtro. El grupo mayorista (y por lo
    // tanto la tabla de precios que ve el cliente en mayor.html, ver
    // resolveWholesaleGroup en wholesale-tiers.js) se elige a mano aquí,
    // independiente de la categoría: "Automático" (vacío) cae de respaldo
    // a detectar la tabla por el nombre de la categoría; "Ninguno" fuerza
    // siempre el Precio Mayor fijo del producto.

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
            const grupoClave = resolveWholesaleGroup(p, categoriasMap);
            const grupo = grupoClave ? (WHOLESALE_TIER_GROUPS[grupoClave]?.label || grupoClave) : 'Precio fijo';
            const imgSrc = p.imagenUrl || 'https://placehold.co/60x60/f5e8ed/D988B9?text=%20';
            return `<tr>
                <td><img src="${imgSrc}" alt="${p.nombre || ''}" class="table-product-img"></td>
                <td class="product-name">${p.nombre || ''}${p.visible === false ? ' <span class="badge bg-secondary">Oculto</span>' : ''}<small class="text-muted d-block">Código: ${p.codigo || p.id.substring(0, 6)}</small></td>
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

    // Listener en tiempo real (no una carga puntual): así la tabla de
    // inventario nunca queda desactualizada esperando que alguien cambie de
    // pestaña y vuelva — una venta, una edición o un cargue masivo que
    // toquen 'productosFabrica' se reflejan aquí apenas Firestore los
    // confirma, sin depender de refrescar manualmente.
    const tenantIdProductos = window.expectedTenantId;
    const clausesProductos = [orderBy('nombre')];
    if (tenantIdProductos) clausesProductos.unshift(where('tenantId', '==', tenantIdProductos));
    onSnapshot(query(productosFabricaCollection, ...clausesProductos), (snapshot) => {
        productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Expuesto en window para que etiquetas-fabrica.js (script global,
        // no módulo) pueda leer el catálogo ya cargado sin duplicar la
        // consulta — mismo patrón que window.localProductsMap en Boutique.
        window.fabricaProductsMap = new Map(productos.map(p => [p.id, p]));
        window.fabricaCategoriasMap = categoriasMap;
        renderTabla();
    }, (error) => {
        console.error('Error al cargar productos de fábrica:', error);
        tbody.innerHTML = `<tr>
            <td colspan="7" class="fin2-empty-state fin2-negative-text">
                <i class="bi bi-exclamation-triangle"></i>
                <span>Error al cargar: ${error.message}</span>
            </td>
        </tr>`;
    });

    // ── Filtros ──
    searchInput.addEventListener('input', renderTabla);
    categoriaFilter.addEventListener('change', renderTabla);
    lowStockToggle.addEventListener('change', renderTabla);

    // ── Variaciones dinámicas (mismo patrón que el catálogo de Boutique) ──
    // 'stockOriginal' guarda el stock que tenía la fila cuando se pintó, y
    // 'origTalla'/'origColor' con qué talla/color la identificaba en ese
    // momento (el valor real del producto al editar, o nada para una fila
    // nueva). Al guardar se busca esa identidad ORIGINAL en el stock más
    // reciente de Firestore (no la identidad actual, por si el usuario
    // renombró la talla/color) y se le suma solo la DIFERENCIA que el
    // usuario quiso hacer — ver el merge en el submit del formulario.
    // 'esOriginal' distingue "esta fila representa una variación que YA
    // existía en el producto al abrir el modal" (talla/color/stock reales)
    // de "fila nueva agregada con el botón +" — sin esto, dos filas en
    // blanco (una real de un producto de talla única y otra recién
    // agregada) se confundirían entre sí al normalizar talla/color vacíos.
    function agregarFilaVariacion(talla = '', color = '', stock = 1, stockOriginal = 0, esOriginal = false) {
        const fila = variationTemplate.cloneNode(true);
        fila.classList.remove('d-none');
        fila.removeAttribute('id');
        fila.querySelector('[name="prodfab_variation_talla[]"]').value = talla;
        fila.querySelector('[name="prodfab_variation_color[]"]').value = color;
        fila.querySelector('[name="prodfab_variation_stock[]"]').value = stock;
        fila.dataset.stockOriginal = String(parseFloat(stockOriginal) || 0);
        if (esOriginal) {
            fila.dataset.origTalla = talla || '';
            fila.dataset.origColor = color || '';
        }
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
            const stockOriginal = parseFloat(fila.dataset.stockOriginal) || 0;
            const claveOriginal = ('origTalla' in fila.dataset)
                ? claveVariacionFabrica(fila.dataset.origTalla, fila.dataset.origColor)
                : null;
            return { talla: input.value.trim(), color, stock: parseFloat(stock) || 0, stockOriginal, claveOriginal };
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
        grupoMayoristaSelect.value = '';
        variacionesContainer.innerHTML = '';
        agregarFilaVariacion();
        productoEditandoVariacionesOriginales = null;
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
            grupoMayoristaSelect.value = (p.grupoMayorista === 'ninguno' || WHOLESALE_TIER_GROUPS[p.grupoMayorista]) ? p.grupoMayorista : '';
            // ?? en vez de || : costoCompra/precioMayor en 0 es un valor
            // real (producto sin costo cargado aún), no "vacío". Con ||
            // quedaba '' en el input requerido y el navegador bloqueaba el
            // submit en silencio (sin disparar el listener, sin toast) —
            // exactamente el síntoma de "no actualiza, no pasa nada".
            costoInput.value = p.costoCompra ?? 0;
            precioMayorInput.value = p.precioMayor ?? 0;
            visibleCheckbox.checked = p.visible !== false;
            imagenUrlActual = p.imagenUrl || null;
            if (imagenUrlActual) {
                imagenPreview.src = imagenUrlActual;
                imagenPreview.style.display = 'block';
            } else {
                imagenPreview.style.display = 'none';
            }
            variacionesContainer.innerHTML = '';
            if (p.variaciones && p.variaciones.length) {
                p.variaciones.forEach(v => agregarFilaVariacion(v.talla, v.color, v.stock ?? 1, v.stock ?? 0, true));
            } else {
                agregarFilaVariacion(); // producto sin variaciones todavía: fila en blanco sin identidad original
            }
            // Claves (talla+color) que el producto tenía en Firestore al abrir
            // el modal — se usa al guardar para distinguir "el usuario borró
            // esta fila a propósito" de "esta variación no existía cuando
            // abrió el modal" (ver merge en el submit).
            productoEditandoVariacionesOriginales = new Set(
                (p.variaciones || []).map(v => claveVariacionFabrica(v.talla, v.color))
            );
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
                // La tabla se actualiza sola vía el listener en tiempo real.
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

        // Sin esto, si "Guardar" termina creando en vez de actualizar (p.ej.
        // el usuario abrió "Nuevo producto" por error para renombrar uno que
        // ya existía, en vez del lápiz de esa fila), el resultado es un
        // producto duplicado silencioso: el original queda intacto y nadie
        // se entera hasta que aparece dos veces en el catálogo.
        if (!id) {
            const nombreNorm = nombre.toLowerCase();
            const yaExiste = productos.some(p => (p.nombre || '').toLowerCase().trim() === nombreNorm);
            if (yaExiste) {
                showToast('Ya existe un producto con ese nombre. Para editarlo usa el lápiz de esa fila en la tabla, no "Nuevo producto".', 'warning');
                return;
            }
        }

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

            const datosBase = {
                nombre,
                descripcion: descripcionInput.value.trim(),
                categoriaId: categoriaSelect.value || null,
                grupoMayorista: grupoMayoristaSelect.value || null,
                costoCompra,
                precioMayor,
                visible: visibleCheckbox.checked,
                imagenUrl,
                tenantId: window.expectedTenantId
            };
            const filasForm = leerVariacionesDelForm();

            if (id) {
                // El stock puede haber cambiado en Firestore mientras este
                // modal estaba abierto (una venta, otra edición) — igual que
                // con actualizarStockFabrica, NO se pisa el documento con lo
                // que había en el formulario al abrirlo. En vez de guardar el
                // número absoluto de cada fila, se aplica solo la DIFERENCIA
                // que el usuario hizo (stock actual del form − stock que vio
                // al abrir el modal) sobre el stock real más reciente, dentro
                // de una transacción.
                const originales = productoEditandoVariacionesOriginales || new Set();
                await runTransaction(db, async (tx) => {
                    const ref = doc(db, 'productosFabrica', id);
                    const snap = await tx.get(ref);
                    if (!snap.exists()) {
                        throw new Error('Este producto ya no existe (puede que alguien lo haya eliminado). Cierra el modal y recarga la lista.');
                    }
                    const variacionesFrescas = new Map(
                        (snap.data().variaciones || [])
                            .map(v => [claveVariacionFabrica(v.talla, v.color), { talla: v.talla, color: v.color, stock: parseFloat(v.stock) || 0 }])
                    );

                    // Varias filas del formulario pueden resolver a la MISMA
                    // identidad final (talla+color) — típicamente porque el
                    // usuario usó "+ Añadir" para sumarle stock a un color que
                    // ya tenía su propia fila, en vez de editar esa fila
                    // existente. Se agrupan por esa identidad final para que
                    // sus cambios se SUMEN sobre el stock real más reciente;
                    // si no, la fila que queda "tapada" (la que se procesa
                    // primero) se pierde en silencio cuando la otra la
                    // sobreescribe — el síntoma exacto de "edito el stock de
                    // un color y aparece otro con datos distintos, el viejo
                    // queda sin tocar".
                    const gruposPorClaveFinal = new Map();
                    filasForm.forEach(f => {
                        const clave = claveVariacionFabrica(f.talla, f.color);
                        if (!gruposPorClaveFinal.has(clave)) gruposPorClaveFinal.set(clave, { talla: f.talla, color: f.color, filas: [] });
                        gruposPorClaveFinal.get(clave).filas.push(f);
                    });

                    // Stock base de cada grupo: se busca por la identidad
                    // ORIGINAL de cada fila (con la que se pintó), no por la
                    // actual — así, si el usuario solo corrigió el texto de
                    // la talla/color sin tocar el stock, igual se encuentra y
                    // respeta el stock real más reciente en vez de tratarla
                    // como una variación nueva (lo que la habría dejado en
                    // 0/negativa). Si varias filas originales terminan en el
                    // mismo grupo, sus stocks base también se suman.
                    const nuevasEntradas = Array.from(gruposPorClaveFinal.entries()).map(([clave, { talla, color, filas }]) => {
                        const stockBase = filas.reduce((suma, f) => {
                            const baseEntry = f.claveOriginal ? variacionesFrescas.get(f.claveOriginal) : null;
                            return suma + (baseEntry ? baseEntry.stock : 0);
                        }, 0);
                        const delta = filas.reduce((suma, f) => suma + (f.stock - f.stockOriginal), 0);
                        return { clave, talla, color, stock: stockBase + delta };
                    });

                    // Identidades originales que ya no corresponden a ninguna
                    // fila del formulario: el usuario borró esa fila a
                    // propósito (si solo la renombró, su claveOriginal sigue
                    // presente y no entra aquí).
                    const clavesOriginalesEnUso = new Set(filasForm.map(f => f.claveOriginal).filter(Boolean));
                    originales.forEach(clave => {
                        if (!clavesOriginalesEnUso.has(clave)) variacionesFrescas.delete(clave);
                    });

                    nuevasEntradas.forEach(({ clave, talla, color, stock }) => {
                        variacionesFrescas.set(clave, { talla, color, stock });
                    });

                    tx.update(ref, { ...datosBase, variaciones: Array.from(variacionesFrescas.values()) });
                });
                showToast('Producto actualizado', 'success');
            } else {
                const variaciones = filasForm.map(({ talla, color, stock }) => ({ talla, color, stock }));
                await addDoc(productosFabricaCollection, {
                    ...datosBase,
                    variaciones,
                    codigo: 'PF' + Date.now().toString().slice(-6),
                    timestamp: serverTimestamp()
                });
                showToast('Producto guardado', 'success');
            }

            getModal('prodFabModal').hide();
            form.reset();
            // La tabla y el selector de "Registrar Venta" se actualizan
            // solos vía sus listeners en tiempo real — no hace falta
            // refrescarlos a mano ni avisarles con un evento.
        } catch (error) {
            console.error('Error al guardar producto de fábrica:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            btnGuardar.disabled = false;
            if (guardarTexto) guardarTexto.classList.remove('d-none');
            if (spinner) spinner.classList.add('d-none');
        }
    });

    // ── Cargar categorías al entrar a la sección (el catálogo de productos
    // ya vive actualizado por el listener de arriba) ──
    const tabLink = document.querySelector('a[href="#productos-fabrica"]');
    if (tabLink) tabLink.addEventListener('click', cargarCategorias);
    window.addEventListener('hashchange', () => {
        if ((window.location.hash || '') === '#productos-fabrica') cargarCategorias();
    });
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === '#productos-fabrica') cargarCategorias();
    });

    cargarGruposMayoristas();
    if ((window.location.hash || '') === '#productos-fabrica') cargarCategorias();

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
    function buildLineChartData(movimientos, ventas, desde, hasta) {
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

        // Las ventas también cuentan como ingreso, día por día (con su descuento aplicado)
        ventas.forEach(venta => {
            const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate() : new Date();
            const key = keyFor(fecha);
            if (!buckets.has(key)) buckets.set(key, { ingresos: 0, gastos: 0 });
            const ratio = discountRatio(venta);
            const montoVenta = (venta.items || []).reduce((s, it) =>
                s + parseFloat(it.precio || 0) * parseInt(it.cantidad || 1, 10), 0) * ratio;
            buckets.get(key).ingresos += montoVenta;
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
            case 'anio': {
                const desde = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                return { desde, hasta: hoyFin, label: 'Este año' };
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

    // ── Calcula el ratio de descuento de una venta (1 = sin descuento, 0.9 = 10% desc) ──
    function discountRatio(venta) {
        const items = venta.items || [];
        const sumItems = items.reduce((s, it) =>
            s + parseFloat(it.precio || 0) * parseInt(it.cantidad || 1, 10), 0);
        if (sumItems <= 0) return 1;

        const raw = parseFloat(venta.descuento) || 0;
        if (raw <= 0) return 1;

        const montoDesc = venta.descuentoTipo === 'porcentaje'
            ? sumItems * (raw / 100)
            : raw;

        return Math.max(0, (sumItems - montoDesc) / sumItems);
    }

    // ── No hay costo por producto (somos fabricantes, no revendedores): el
    // "gasto por prenda" es un valor único del periodo (gastos ÷ unidades
    // vendidas) que se aplica igual a todos los productos. Esta función solo
    // agrupa las unidades e ingresos vendidos por producto; el gasto/unidad
    // se aplica después, ya con el total de gastos del periodo a la mano. ──
    function agruparVentasPorProducto(ventas) {
        const mapa = new Map();
        let unidadesTotal = 0;
        let ingresoTotal = 0;

        ventas.forEach(venta => {
            if (!venta.items || !venta.items.length) return;
            const ratio = discountRatio(venta);

            venta.items.forEach(item => {
                const nombre = (item.nombre || 'Producto sin nombre').trim();
                const key = nombre.toLowerCase();
                const precioEfectivo = parseFloat(item.precio || 0) * ratio;
                const cant = parseInt(item.cantidad || 1, 10);

                if (!mapa.has(key)) {
                    mapa.set(key, { nombre, cantidad: 0, ingresoTotal: 0 });
                }
                const entry = mapa.get(key);
                entry.cantidad     += cant;
                entry.ingresoTotal += precioEfectivo * cant;

                unidadesTotal += cant;
                ingresoTotal  += precioEfectivo * cant;
            });
        });

        return { productos: Array.from(mapa.values()), unidadesTotal, ingresoTotal };
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

            // allSettled (no all): si la consulta de ventas falla por lo que
            // sea (índice, permisos, red), los gastos/otros ingresos —lo que
            // ya venía funcionando— se siguen viendo igual; solo se pierde
            // temporalmente la parte de ventas/gasto por prenda.
            const [movResult, ventasResult] = await Promise.allSettled([
                getDocs(query(fabricaCollection, ...clauses)),
                getDocs(query(
                    ventasCollection,
                    where('tenantId', '==', 'fabrica'),
                    where('timestamp', '>=', Timestamp.fromDate(desde)),
                    where('timestamp', '<=', Timestamp.fromDate(hasta)),
                    orderBy('timestamp', 'desc')
                ))
            ]);

            if (movResult.status === 'rejected') throw movResult.reason;
            const snapshot = movResult.value;

            let movimientos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => fechaDeMovimiento(b) - fechaDeMovimiento(a));

            if (desde && hasta) {
                movimientos = movimientos.filter(m => {
                    const fecha = fechaDeMovimiento(m);
                    return fecha >= desde && fecha <= hasta;
                });
            }

            let ventas = [];
            if (ventasResult.status === 'fulfilled') {
                ventas = ventasResult.value.docs
                    .map(d => d.data())
                    .filter(v => v.estado !== 'Anulada' && v.estado !== 'Cancelada');
            } else {
                console.error('Error al cargar ventas de fábrica para Finanzas:', ventasResult.reason);
            }

            // ── Gastos operativos (telas, luz, arriendo, nómina, hilos...) y
            // otros ingresos manuales (aparte de la venta, ej. capital aportado) ──
            const otrosIngresos = movimientos
                .filter(m => m.tipo === 'ingreso')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
            const totalGastos = movimientos
                .filter(m => m.tipo === 'gasto')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);

            // ── Ventas reales del periodo, agrupadas por producto ──
            const { productos: productosVendidos, unidadesTotal: unidadesVendidas, ingresoTotal: ingresosVentas } =
                agruparVentasPorProducto(ventas);

            // ── No hay costo por producto: el gasto por prenda sale de
            // repartir TODO el gasto operativo del periodo entre las
            // unidades vendidas en ese mismo periodo. Es el mismo valor
            // para cualquier prenda; el usuario solo pone el precio de venta. ──
            const gastoPorPrenda = unidadesVendidas > 0 ? totalGastos / unidadesVendidas : 0;

            const ingresosTotal = ingresosVentas + otrosIngresos;
            const utilidad = ingresosTotal - totalGastos;

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

            // setText: si algún elemento nuevo no existe todavía en la página
            // (ej. caché vieja del HTML), que no tumbe el resto del cálculo —
            // antes "Total gastos" era de lo primero en pintarse y no debe
            // dejar de actualizarse porque otra tarjeta nueva falle.
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };
            setText('fab-ventas', fmt.format(ingresosVentas));
            setText('fab-otros-ingresos', fmt.format(otrosIngresos));
            setText('fab-gastos', fmt.format(totalGastos));
            setText('fab-unidades-vendidas', unidadesVendidas.toLocaleString('es-CO'));
            setText('fab-gasto-prenda', fmt.format(gastoPorPrenda));

            // ── Desglose: cuánto fue cada concepto de ingreso/gasto (las
            // ventas del periodo cuentan como un concepto más de ingreso) ──
            const ingresosPorConcepto = agruparPorConcepto(movimientos.filter(m => m.tipo === 'ingreso'));
            if (ingresosVentas > 0) ingresosPorConcepto.unshift({ nombre: 'Ventas', total: ingresosVentas });
            ingresosPorConcepto.sort((a, b) => b.total - a.total);
            const gastosPorConcepto = agruparPorConcepto(movimientos.filter(m => m.tipo === 'gasto'));
            renderDesglose('fab-desglose-ingresos', 'fab-desglose-ingresos-count', ingresosPorConcepto, ingresosTotal, 'ingreso');
            renderDesglose('fab-desglose-gastos', 'fab-desglose-gastos-count', gastosPorConcepto, totalGastos, 'gasto');

            // ── Utilidad por producto ──
            const productoCount = document.getElementById('fab-producto-count');
            const productoNota  = document.getElementById('fab-producto-nota');
            const productoTbody = document.getElementById('fab-producto-tabla-body');
            const productoTfoot = document.getElementById('fab-producto-tabla-footer');

            if (productoNota) productoNota.style.display = (totalGastos > 0 && unidadesVendidas === 0) ? 'block' : 'none';
            if (productoCount) productoCount.textContent = `${productosVendidos.length} producto${productosVendidos.length !== 1 ? 's' : ''}`;

            if (productosVendidos.length === 0) {
                if (productoTbody) productoTbody.innerHTML = `<tr>
                    <td colspan="6" class="fin2-empty-state">
                        <i class="bi bi-bar-chart"></i>
                        <span>No hay ventas completadas en este periodo</span>
                    </td>
                </tr>`;
                if (productoTfoot) productoTfoot.style.display = 'none';
            } else {
                const productosConUtilidad = productosVendidos.map(p => {
                    const precioProm     = p.cantidad > 0 ? p.ingresoTotal / p.cantidad : 0;
                    const utilidadUnidad = precioProm - gastoPorPrenda;
                    return { ...p, precioProm, utilidadUnidad, utilidadTotal: utilidadUnidad * p.cantidad };
                }).sort((a, b) => b.utilidadTotal - a.utilidadTotal);

                if (productoTbody) productoTbody.innerHTML = productosConUtilidad.map(p => {
                    const colorCls = p.utilidadTotal >= 0 ? 'fin2-positive-text' : 'fin2-negative-text';
                    return `<tr>
                        <td class="fin2-td-nombre">${escaparHtml(p.nombre)}</td>
                        <td class="text-end fin2-td-num">${fmt.format(p.precioProm)}</td>
                        <td class="text-end fin2-td-num">${fmt.format(gastoPorPrenda)}</td>
                        <td class="text-end fin2-td-num">${p.cantidad}</td>
                        <td class="text-end fin2-td-num ${colorCls}">${fmt.format(p.utilidadUnidad)}</td>
                        <td class="text-end fin2-td-num fw-semibold ${colorCls}">${fmt.format(p.utilidadTotal)}</td>
                    </tr>`;
                }).join('');

                if (productoTfoot) {
                    setText('fab-producto-footer-cant', unidadesVendidas.toLocaleString('es-CO'));
                    setText('fab-producto-footer-utilidad', fmt.format(ingresosVentas - totalGastos));
                    productoTfoot.style.display = '';
                }
            }

            // ── Gráfica: ingresos vs. gastos en el tiempo ──
            const { labels: chartLabels, ingresosData, gastosData, porMes } = buildLineChartData(movimientos, ventas, desde, hasta);
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
                    const badgeTxt  = esIngreso ? 'Otro ingreso' : 'Gasto';
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

    // ── Abrir modal: Otro Ingreso / Nuevo Gasto ──
    function abrirModalNuevo(tipo) {
        movForm.reset();
        movIdInput.value = '';
        movTipoInput.value = tipo;
        movModalTitle.textContent = tipo === 'ingreso' ? 'Otro ingreso' : 'Nuevo Gasto';
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
                    movModalTitle.textContent = data.tipo === 'ingreso' ? 'Editar otro ingreso' : 'Editar Gasto';
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
