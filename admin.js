// Import Firebase core and Firestore modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { initializeFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot, serverTimestamp, query, where, orderBy, writeBatch, Timestamp, getDoc, deleteField, limit, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
// Import Storage
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
// Import Auditoría (registro de quién crea/edita/elimina). La versión debe
// coincidir con el <script type="module" src="auditoria.js?v=..."> de
// admin.html y con el import de usuarios.js: un specifier distinto hace que
// el navegador cargue auditoria.js como un módulo aparte, con su propio
// estado y sus propios listeners de 'adminAuthReady' — duplicaba filas y
// manejadores de clic en la sección Auditoría.
import { registrarAuditoria, describirCambiosProducto, resumenVariacionesProducto } from "./auditoria.js?v=1.0.1";
import { resolveWholesaleGroupConRespaldo, getHybridTierInfo, isSurtidoGroup, getFirstRealTierMin, WHOLESALE_TIER_GROUPS } from "./wholesale-tiers.js?v=2";
import { resolveTenant } from "./src/core/tenant-resolver.js";
import { urlMiniatura, necesitaMiniatura, crearMiniatura, miniaturaDesdeUrl } from "./src/core/miniaturas.js?v=1";
import { activarCacheLocal } from "./src/core/firestore-cache.js?v=2";
import { vigilarSincronizacion } from "./src/core/sync-indicator.js?v=3";
import { vigilarConexion } from "./src/core/conexion.js?v=1";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app", 
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704",
    measurementId: "G-TZ3WQ8LSXH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Auth se registra ANTES de usar Firestore. Firestore solo le da a Auth un
// ciclo (setTimeout 0) para aparecer; si no está, arranca SIN usuario y las
// consultas protegidas que se abran en ese momento fallan con "sin permisos"
// y ese listener muere para siempre (Dashboard en $0 hasta recargar). Antes
// Auth recién se cargaba en *-auth-init.js, después de este archivo, así que
// con red lenta pasaba de forma intermitente. Es el mismo firebase-auth.js
// que ya se descargaba; con esto Firestore espera la sesión desde el inicio.
getAuth(app);
// Evita que la conexión en tiempo real se quede colgada en redes móviles o
// navegadores in-app que bloquean WebSockets (ver mismo fix en app.js).
// auth.js / admin-auth-init.js reutilizan esta misma instancia (mismo
// `app`), así que heredan esta configuración sin repetirla.
const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true
});
// Caché local (IndexedDB): el panel abre con lo guardado en el dispositivo y
// solo baja lo que cambió. Tiene que activarse antes de cualquier consulta.
// Ver src/core/firestore-cache.js (se borra si cambia el usuario/empresa y
// al cerrar sesión).
activarCacheLocal(db);
// Renueva la conexión al volver del segundo plano / al volver internet
// (ver src/core/conexion.js).
vigilarConexion(db);
const storage = getStorage(app);
console.log("Firebase Initialized!");

// Detecta el tenant desde la URL y aplica su branding si ya existe en
// Firestore. No bloquea ni afecta el resto de la carga: mientras no haya
// tenants migrados, esto no hace nada (ver src/core/tenant-resolver.js).
resolveTenant(db);

// Normaliza los valores de talla/color para prendas sin variación real: sin
// importar cómo se haya escrito ('unica', 'Unica', 'única', vacío...), siempre
// se guarda y se muestra como "Única" / "Único" en toda la app.
function normalizeTalla(talla) {
    const t = (talla || '').toLowerCase().trim();
    return (t === '' || t === 'unica' || t === 'única') ? 'Única' : talla.trim();
}
function normalizeColor(color) {
    const c = (color || '').toLowerCase().trim();
    return (c === '' || c === 'unico' || c === 'único') ? 'Único' : color.trim();
}

// Redimensiona/comprime fotos de producto antes de subirlas a Storage. Las
// fotos tomadas con celular suelen pesar varios MB a resoluciones que la
// tienda nunca necesita, y eso es lo que hace lentas las páginas públicas
// (index/mayor cargan hasta 20 tarjetas con imagen por página). Si el
// archivo ya es pequeño o no es una imagen soportada por <canvas>, se sube
// tal cual.
const PRODUCT_IMAGE_MAX_DIMENSION = 1600;
const PRODUCT_IMAGE_JPEG_QUALITY = 0.82;
const PRODUCT_IMAGE_SKIP_COMPRESSION_BELOW = 300 * 1024; // 300KB
// Si el navegador nunca dispara onload/onerror (pasa con algunos archivos
// HEIC reenviados por WhatsApp mal etiquetados como image/jpeg), sin este
// límite la promesa quedaba pendiente para siempre y el botón "Guardando..."
// del formulario de producto no volvía a habilitarse.
const PRODUCT_IMAGE_DECODE_TIMEOUT_MS = 10000;

function compressProductImageFile(file) {
    if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml') return Promise.resolve(file);
    if (file.size <= PRODUCT_IMAGE_SKIP_COMPRESSION_BELOW) return Promise.resolve(file);

    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => { if (!settled) { settled = true; clearTimeout(safetyTimer); resolve(result); } };
        const safetyTimer = setTimeout(() => { URL.revokeObjectURL(url); finish(file); }, PRODUCT_IMAGE_DECODE_TIMEOUT_MS);

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
                if (!blob || blob.size >= file.size) { finish(file); return; }
                const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                finish(new File([blob], newName, { type: 'image/jpeg' }));
            }, 'image/jpeg', PRODUCT_IMAGE_JPEG_QUALITY);
        };
        img.onerror = () => { URL.revokeObjectURL(url); finish(file); };
        img.src = url;
    });
}

// Envuelve una escritura a Firestore/Storage con un límite de tiempo: si la
// red se degrada a mitad de un uploadBytes/updateDoc/addDoc, esas promesas no
// rechazan por sí solas (Firestore reintenta en segundo plano indefinidamente),
// así que sin esto el botón "Guardando..." del formulario de producto se
// quedaba cargando para siempre en vez de mostrar un error y liberarse.
const WRITE_TIMEOUT_MS = 20000;
function withWriteTimeout(promise, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Se agotó el tiempo de espera guardando ${label}. Revisa tu conexión e intenta de nuevo.`)), WRITE_TIMEOUT_MS))
    ]);
}

// Sube la miniatura de una foto de producto (ver src/core/miniaturas.js) y
// devuelve los campos a guardar en el producto. Nunca lanza: si no se puede
// (HEIC, red), se guarda imagenThumbUrl: null y se sigue usando la foto
// completa.
async function camposMiniaturaProducto(fuente, imagenUrl) {
    try {
        const mini = fuente instanceof Blob ? await crearMiniatura(fuente) : await miniaturaDesdeUrl(imagenUrl);
        if (!mini) return { imagenThumbUrl: null, imagenThumbDe: imagenUrl };
        const nombre = `product_images/thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const subida = await withWriteTimeout(uploadBytes(ref(storage, nombre), mini, {
            contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable'
        }), 'la miniatura');
        return { imagenThumbUrl: await getDownloadURL(subida.ref), imagenThumbDe: imagenUrl };
    } catch (e) {
        console.warn('No se pudo crear la miniatura:', e);
        // `error` lo usa la optimización masiva para no marcar el producto
        // como procesado y reintentarlo después.
        return { imagenThumbUrl: null, imagenThumbDe: imagenUrl, error: true };
    }
}

// ── Carga diferida de librerías pesadas de terceros ─────────────────────
// xlsx, jspdf, chart.js, jsbarcode y html5-qrcode sumaban ~2MB sin comprimir
// que antes se descargaban en TODA carga de admin.html sin importar si la
// sesión iba a exportar un Excel, generar un PDF o escanear un código de
// barras. Ahora se inyectan solo la primera vez que la función que los
// necesita se ejecuta (botón de exportar, abrir el escáner, etc.), y la
// promesa se cachea para no volver a pedirlos ni duplicar el <script>.
// Se expone en window porque barcode-system.js (script separado) también
// la necesita.
const EXTERNAL_LIB_URLS = {
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    jsbarcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
    html5qrcode: 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
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

// Inicializar window.appContext lo antes posible con el último usuario
// conocido en este dispositivo. Se prueba primero sessionStorage (recién
// llegado desde login.html) y si no hay nada, el caché persistente en
// localStorage (reapertura de la app/pestaña) — así el contexto ya existe
// aquí mismo, antes de que admin-auth-init.js termine de verificar contra
// Firebase.
(function() {
    try {
        const stored = sessionStorage.getItem('adminUser') || localStorage.getItem('mishellAdminUserCache');
        if (stored) {
            const u = JSON.parse(stored);
            window.appContext = {
                userId: u.uid,
                email: u.email,
                nombre: u.nombre,
                rol: u.rol,
                permisos: u.permisos || {},
                tenantId: u.tenantId || null,
                isSuperAdmin: u.rol === 'SUPER_ADMIN'
            };
        }
    } catch(e) {
        console.warn('Error al cargar contexto de usuario:', e);
    }
})();

// Exponer funciones de Firebase globalmente para barcode-system.js y para
// el guard de autenticación (auth.js / usuarios.js / admin-auth-init.js)
window.db = db;
window.firebaseApp = app;
// window.expectedTenantId YA NO es una empresa quemada en el archivo:
// se resuelve en vivo a partir de window.appContext (que trae el tenantId
// real del usuario, verificado contra Firestore por auth.js). Un usuario
// normal SIEMPRE usa su propio tenantId, sin importar la URL — solo
// Super Admin (que no pertenece a ninguna empresa) puede indicar a cuál
// entrar, y únicamente vía el parámetro ?empresa= que login.html arma a
// partir de la lista real de empresas, nunca escrito a mano por el
// usuario normal. La aplicación real de esto la hace igual firestore.rules
// del lado servidor — este valor solo filtra qué se consulta/etiqueta
// desde el cliente.
Object.defineProperty(window, 'expectedTenantId', {
    configurable: true,
    get() {
        const ctx = window.appContext;
        if (!ctx) return null;
        if (ctx.isSuperAdmin) {
            return new URLSearchParams(window.location.search).get('empresa') || null;
        }
        return ctx.tenantId ?? null;
    }
});
window.firebaseConfig = firebaseConfig;
window.collection = collection;
window.getDocs = getDocs;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.doc = doc;
window.updateDoc = updateDoc;

// --- Collections References ---
const categoriesCollection = collection(db, 'categorias');
const suppliersCollection = collection(db, 'proveedores');
const clientsCollection = collection(db, 'clientes');
const repartidoresCollection = collection(db, 'repartidores');
const productsCollection = collection(db, 'productos');
const salesCollection = collection(db, 'ventas');
const apartadosCollection = collection(db, 'apartados');
const financesCollection = collection(db, 'movimientosFinancieros');
const boutiqueCollection = collection(db, 'movimientosBoutique');
// Exclusivas de empresas con producción propia (permiso fabrica_gestionar /
// inventario_fabrica_gestionar) — ver secciones "Fábrica" más abajo.
const fabricaCollection = collection(db, 'movimientosFabrica');
const inventarioFabricaCollection = collection(db, 'inventarioFabrica');
const productosFabricaCollection = collection(db, 'productosFabrica');
const closingsCollection = collection(db, 'cierresCaja');
const webOrdersCollection = collection(db, 'pedidosWeb');
const cotizacionesCollection = collection(db, 'cotizaciones');

// "Sincronizando…" mientras el servidor confirma lo que se pintó desde la
// caché local. Es la misma consulta del listener de la pestaña Productos
// (orderBy timestamp desc), así que Firestore la comparte: sin lecturas extra.
vigilarSincronizacion([query(productsCollection, orderBy('timestamp', 'desc'))]);

// ✅ CALENDARIO CON VENTAS: reemplaza un <input type="date"> por un calendario
// propio que marca con un punto los días que tienen ventas (el selector nativo
// no permite marcar días). El input sigue guardando el valor "YYYY-MM-DD" y
// dispara 'change', así que el código que lo lee no cambia.
// Cache por mes ("YYYY-MM" -> Set de días), compartida entre calendarios.
// El mes en curso se vuelve a consultar porque sigue recibiendo ventas.
const diasConVentasCache = new Map();

async function obtenerDiasConVentas(y, m) {
    const mesKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const hoy = new Date();
    const esMesActual = y === hoy.getFullYear() && m === hoy.getMonth();
    if (!esMesActual && diasConVentasCache.has(mesKey)) return diasConVentasCache.get(mesKey);

    const inicio = new Date(y, m, 1, 0, 0, 0, 0);
    const fin = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const snap = await getDocs(query(
        salesCollection,
        where('timestamp', '>=', Timestamp.fromDate(inicio)),
        where('timestamp', '<=', Timestamp.fromDate(fin))
    ));
    const dias = new Set();
    snap.forEach(d => {
        const ts = d.data().timestamp;
        if (ts?.toDate) dias.add(ts.toDate().getDate());
    });
    diasConVentasCache.set(mesKey, dias);
    return dias;
}

function crearCalendarioVentas(input) {
    if (!input) return { sync() {} };

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const pad = n => String(n).padStart(2, '0');
    const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'sv-date-picker';
    wrapper.innerHTML = `
        <button type="button" class="${input.className} sv-date-btn" aria-haspopup="dialog" aria-expanded="false">
            <i class="bi bi-calendar3"></i><span class="sv-date-label">dd/mm/aaaa</span>
        </button>
        <div class="sv-cal-popover" role="dialog" aria-label="Calendario de ventas" hidden>
            <div class="sv-cal-header">
                <button type="button" class="sv-cal-nav" data-nav="-1" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
                <span class="sv-cal-title"></span>
                <button type="button" class="sv-cal-nav" data-nav="1" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button>
            </div>
            <div class="sv-cal-weekdays">
                <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span>
            </div>
            <div class="sv-cal-grid"></div>
            <div class="sv-cal-footer">
                <span class="sv-cal-legend"><span class="sv-cal-dot"></span>Días con ventas</span>
                <button type="button" class="sv-cal-today">Hoy</button>
            </div>
        </div>`;
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.type = 'hidden';

    const btn = wrapper.querySelector('.sv-date-btn');
    const label = wrapper.querySelector('.sv-date-label');
    const popover = wrapper.querySelector('.sv-cal-popover');
    const grid = wrapper.querySelector('.sv-cal-grid');
    const title = wrapper.querySelector('.sv-cal-title');
    let vista = new Date();
    vista.setDate(1);
    let renderToken = 0;

    function actualizarLabel() {
        const v = input.value;
        if (!v) { label.textContent = 'dd/mm/aaaa'; return; }
        const [y, m, d] = v.split('-').map(Number);
        label.textContent = `${pad(d)}/${pad(m)}/${y}`;
    }

    async function render() {
        const y = vista.getFullYear();
        const m = vista.getMonth();
        const token = ++renderToken;
        title.textContent = `${MESES[m]} ${y}`;

        const hoy = new Date();
        const hoyKey = toKey(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const offset = (new Date(y, m, 1).getDay() + 6) % 7; // semana empieza en lunes
        const diasMes = new Date(y, m + 1, 0).getDate();

        const celdas = [];
        for (let i = 0; i < offset; i++) celdas.push('<span class="sv-cal-empty"></span>');
        for (let d = 1; d <= diasMes; d++) {
            const key = toKey(y, m, d);
            const clases = ['sv-cal-day'];
            if (key === hoyKey) clases.push('is-today');
            if (key === input.value) clases.push('is-selected');
            celdas.push(`<button type="button" class="${clases.join(' ')}" data-date="${key}" data-day="${d}">${d}</button>`);
        }
        grid.innerHTML = celdas.join('');
        grid.classList.add('is-loading');

        try {
            const dias = await obtenerDiasConVentas(y, m);
            if (token !== renderToken) return; // el usuario ya cambió de mes
            grid.querySelectorAll('.sv-cal-day').forEach(el => {
                el.classList.toggle('has-sales', dias.has(Number(el.dataset.day)));
            });
        } catch (e) {
            console.error('Error cargando días con ventas:', e);
        } finally {
            if (token === renderToken) grid.classList.remove('is-loading');
        }
    }

    function abrir() {
        if (input.value) {
            const [y, m] = input.value.split('-').map(Number);
            vista = new Date(y, m - 1, 1);
        }
        popover.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        // Mantener el calendario dentro de la pantalla (en móvil el campo puede estar a la derecha)
        popover.style.left = '0px';
        const rect = popover.getBoundingClientRect();
        const sobra = rect.right - (window.innerWidth - 8);
        if (sobra > 0) popover.style.left = `${-Math.min(sobra, rect.left - 8)}px`;
        render();
    }

    function cerrar() {
        popover.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }

    function seleccionar(key) {
        input.value = key;
        actualizarLabel();
        cerrar();
        input.dispatchEvent(new Event('change'));
    }

    btn.addEventListener('click', () => (popover.hidden ? abrir() : cerrar()));
    wrapper.querySelectorAll('.sv-cal-nav').forEach(nav => nav.addEventListener('click', () => {
        vista = new Date(vista.getFullYear(), vista.getMonth() + Number(nav.dataset.nav), 1);
        render();
    }));
    wrapper.querySelector('.sv-cal-today').addEventListener('click', () => {
        const hoy = new Date();
        seleccionar(toKey(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    });
    grid.addEventListener('click', (e) => {
        const dayBtn = e.target.closest('.sv-cal-day');
        if (dayBtn) seleccionar(dayBtn.dataset.date);
    });
    document.addEventListener('click', (e) => {
        if (!popover.hidden && !wrapper.contains(e.target)) cerrar();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.hidden) cerrar();
    });

    actualizarLabel();
    return { sync: actualizarLabel };
}

// Solo las prendas cuyo proveedor sea exactamente "Mishelles Boutique" pueden
// venderse al por mayor (tablas de precio por cantidad). Cualquier otro
// proveedor queda restringido a venta al detal.
function esProveedorBoutique(producto) {
    return (producto?.proveedor || '').trim().toLowerCase() === 'mishelles boutique';
}
window.esProveedorBoutique = esProveedorBoutique;

const recepcionesCollection = collection(db, 'ordenesRecepcion');
const promocionesGlobalesCollection = collection(db, 'promocionesGlobales');

// --- Global map for product sales count ---
if (!window.productSalesCount) {
    window.productSalesCount = new Map();
}

// Function to calculate total sales per product
// Solo cuenta los últimos 90 días (igual que "más vendidas" en Fábrica):
// antes descargaba TODAS las ventas de la historia la primera vez que se
// abría el buscador de productos, lo que hacía lenta esa primera apertura.
const DIAS_VENTAS_POR_PRODUCTO = 90;
async function calculateProductSales() {
    try {
        const desde = new Date();
        desde.setDate(desde.getDate() - DIAS_VENTAS_POR_PRODUCTO);
        const salesSnapshot = await getDocs(query(salesCollection, where('timestamp', '>=', Timestamp.fromDate(desde))));
        const salesMap = new Map();

        salesSnapshot.forEach(saleDoc => {
            const saleData = saleDoc.data();
            // Skip cancelled sales
            if (saleData.estado === 'Anulada') return;

            const items = saleData.items || [];
            items.forEach(item => {
                const productId = item.productoId;
                if (productId) {
                    const currentCount = salesMap.get(productId) || 0;
                    const quantity = parseInt(item.cantidad) || 0;
                    salesMap.set(productId, currentCount + quantity);
                }
            });
        });

        window.productSalesCount = salesMap;
        console.log('✅ Ventas por producto calculadas:', salesMap.size, 'productos');
    } catch (error) {
        console.error('Error calculando ventas por producto:', error);
    }
}

// Solo lo usa el buscador de productos del punto de venta (para mostrar
// primero los más vendidos), y calcularlo exige descargar TODAS las ventas
// de la historia. Antes se hacía al cargar la página, en cada visita; ahora
// se calcula una sola vez, la primera vez que se abre ese buscador.
let productSalesPromise = null;
function asegurarVentasPorProducto() {
    if (!productSalesPromise) productSalesPromise = calculateProductSales();
    return productSalesPromise;
}

// --- Helper: Format Currency ---
const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

// --- Helper: Formatear números con puntos (separadores de miles colombianos) ---
function formatearNumeroConPuntos(valor) {
    // Eliminar todo excepto números
    let numero = valor.toString().replace(/[^\d]/g, '');

    // Si está vacío, retornar vacío
    if (numero === '') return '';

    // Agregar puntos como separadores de miles
    return numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function eliminarFormatoNumero(valor) {
    // Eliminar todo excepto dígitos (puntos, comas, espacios, etc.)
    return valor.toString().replace(/[^\d]/g, '');
}

// --- Aplicar formato automático a inputs de dinero ---
function aplicarFormatoDinero() {
    // IDs de inputs que requieren formato de dinero (solo enteros, sin decimales)
    const inputsDinero = [
        'costo-ruta',
        'meta-monto',
        'income-amount',
        'expense-amount',
        'venta-descuento',
        'pago-efectivo',
        'pago-transferencia',
        'abono-monto'
    ];

    inputsDinero.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            // Aplicar formato mientras el usuario escribe
            input.addEventListener('input', function(e) {
                const cursorPosition = this.selectionStart;
                const valorAnterior = this.value;
                const longitudAnterior = valorAnterior.length;

                // Formatear el valor
                const valorSinFormato = eliminarFormatoNumero(this.value);
                const valorFormateado = formatearNumeroConPuntos(valorSinFormato);

                // Actualizar el valor
                this.value = valorFormateado;

                // Ajustar la posición del cursor
                const longitudNueva = valorFormateado.length;
                const diferencia = longitudNueva - longitudAnterior;
                const nuevaPosicion = cursorPosition + diferencia;

                this.setSelectionRange(nuevaPosicion, nuevaPosicion);
            });

            // Al hacer blur, asegurar que el formato está correcto
            input.addEventListener('blur', function() {
                if (this.value) {
                    const valorSinFormato = eliminarFormatoNumero(this.value);
                    this.value = formatearNumeroConPuntos(valorSinFormato);
                }
            });

            // Al hacer focus, permitir edición normal
            input.addEventListener('focus', function() {
                // Opcional: podrías eliminar el formato al hacer focus
                // pero es mejor dejarlo formateado para mejor UX
            });
        }
    });

    // Los inputs de variaciones de productos (costo, precio-detal, precio-mayor)
    // son tipo "number" con step="0.01" y no necesitan formateo automático.
    // Esto permite usar punto (.) como separador decimal correctamente.
    const observador = new MutationObserver(() => {
        // Ya no formateamos inputs de variaciones
    });

    // Observar cambios en el DOM para aplicar formato a elementos dinámicos
    observador.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// --- Helper: Open WhatsApp (PWA Compatible) ---
function openWhatsApp(url) {
    // Detectar si estamos en una PWA instalada
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true ||
                  document.referrer.includes('android-app://');

    console.log('🔍 Detectando modo de aplicación:');
    console.log('  - Es PWA instalada:', isPWA);
    console.log('  - URL WhatsApp:', url);

    if (isPWA || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // En PWA o móvil, usar window.location.href para abrir WhatsApp
        // Esto fuerza a abrir en la app de WhatsApp instalada
        console.log('📱 Abriendo WhatsApp en app instalada...');
        window.location.href = url;
    } else {
        // En navegador desktop, usar window.open
        console.log('💻 Abriendo WhatsApp en nueva pestaña...');
        const ventana = window.open(url, '_blank');
        if (!ventana) {
            // Si el popup fue bloqueado, intentar con location
            console.warn('⚠️ Popup bloqueado, intentando con location.href');
            window.location.href = url;
        }
    }
}

// --- Helper: Show Toast Notification ---
let bsToast = null;
function showToast(message, type = 'success', title = 'Notificación') {
    const liveToastEl = document.getElementById('liveToast');
    const toastBodyEl = document.getElementById('toast-body');
    const toastIconEl = document.getElementById('toast-icon');

    if (liveToastEl && toastBodyEl) {
        if (!bsToast) { try { bsToast = new bootstrap.Toast(liveToastEl, { delay: 3500 }); } catch (e) { console.error("Toast init error", e); return; }}
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

// --- Global Modal Instances ---
let addClientModalInstance = null; let addRepartidorModalInstance = null; let addSupplierModalInstance = null; let addIncomeModalInstance = null; let addExpenseModalInstance = null; let editCategoryModalInstance = null; let deleteConfirmModalInstance = null;
let editSupplierModalInstance = null; let editClientModalInstance = null;
let searchSupplierModalInstance = null; let searchClientModalInstance = null; let searchProductModalInstance = null; let liquidateConfirmModalInstance = null;
let viewSaleModalInstance = null;
let facturaAccionesModalInstance = null; // --- Modal de acciones tras generar factura ---
let facturaPreguntaModalInstance = null; // --- Modal: ¿generar factura al registrar venta? ---
let selectVariationModalInstance = null; // --- Modal de Variaciones ---
let abonoApartadoModalInstance = null; // ✅ --- NUEVO: Modal de Abonos ---
let verApartadoModalInstance = null; // ✅ --- NUEVO: Modal de Ver Apartado ---

let localClientsMap = new Map([["Cliente General", {id: null, celular: "", direccion: ""}]]);
let localProductsMap = new Map();
window.localProductsMap = localProductsMap;
let repartidoresMap = new Map(); // ✅ Mapa de repartidores para el modal de ver venta

// Suscriptores ligeros del listener único de repartidores (más abajo, junto al
// CRUD de la pestaña Repartidores). Antes el dashboard, el formulario de
// reportes y el historial de repartidores abrían cada uno su propio
// onSnapshot sobre la colección COMPLETA — igual que pasaba con productos
// (ver iniciarListenerProductos) — así que se consolidan en un solo listener
// real y estos consumidores simplemente reciben el mismo snapshot.
const repartidoresSubscribers = [];
// Último snapshot recibido: las secciones con carga diferida (p. ej. el
// historial de repartidores) se suscriben después de que ya llegó, así que
// se les entrega de inmediato en vez de esperar al próximo cambio.
let ultimoSnapshotRepartidores = null;
function subscribeRepartidores(callback) {
    repartidoresSubscribers.push(callback);
    if (ultimoSnapshotRepartidores) {
        try { callback(ultimoSnapshotRepartidores); } catch (e) { console.error('Error en suscriptor de repartidores:', e); }
    }
}

// Mismo consolidado para productos: el dashboard (iniciarListenerProductos)
// ya no abre su propio onSnapshot sobre toda la colección, sino que se
// suscribe al snapshot del listener único de la pestaña Productos.
const productsSubscribers = [];
function subscribeProducts(callback) { productsSubscribers.push(callback); }

// Mismo consolidado para clientes: antes la pestaña Clientes y la tarjeta
// "Total de clientes" del Dashboard abrían CADA UNA su propio onSnapshot
// sobre la colección completa — dos conexiones en tiempo real idénticas a
// la vez. El listener real vive en la pestaña Clientes; el Dashboard solo
// se suscribe a ese mismo snapshot.
const clientsSubscribers = [];
function subscribeClients(callback) { clientsSubscribers.push(callback); }

// Mismo consolidado para promociones globales: la pestaña Promociones y la
// tarjeta "Promociones activas" del Dashboard tenían cada una su propio
// onSnapshot sobre 'promocionesGlobales'. El listener real vive en la
// pestaña Promociones; el Dashboard se suscribe a ese mismo snapshot.
const promocionesGlobalesSubscribers = [];
function subscribePromocionesGlobales(callback) { promocionesGlobalesSubscribers.push(callback); }

// ── Carga diferida por sección ──────────────────────────────────────────
// Ejecuta cb() si `hash` ya es la sección activa ahora mismo, y cada vez
// que se vuelva a entrar a ella después (ver evento 'admin:section-shown'
// disparado por showSection() en admin.html). Así el catálogo completo de
// productos, apartados, etc. no compite por red/CPU con el Dashboard al
// cargar la página — solo se construye cuando el usuario realmente abre
// esa pestaña, sin importar si la navegación vino del rail o de la barra
// inferior móvil.
function alEntrarSeccion(hash, cb) {
    if ((window.location.hash || '#dashboard') === hash) cb();
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === hash) cb();
    });
}

// Secciones que viven en archivos aparte (src/admin/secciones/*.js) para que
// admin.js pese menos y el panel abra más rápido: el archivo se descarga y
// se inicializa solo la primera vez que se entra a su sección. Cada módulo
// exporta init(ctx) y recibe aquí lo que antes tomaba del closure de admin.js.
// Al inicializarse, cada módulo revisa window.location.hash por su cuenta
// (alEntrarSeccion / ...SiCorresponde), así que carga sus datos de inmediato.
const ctxSecciones = {
    db, storage, showToast, formatoMoneda, alEntrarSeccion, loadExternalLib,
    crearCalendarioVentas, compressProductImageFile, subscribeRepartidores,
    salesCollection, apartadosCollection, productsCollection, boutiqueCollection,
    categoriesCollection, suppliersCollection, fabricaCollection,
    inventarioFabricaCollection, productosFabricaCollection,
};
// Devuelve una función que carga la sección y resuelve cuando ya está lista
// (para el código que necesita usarla antes de que el usuario entre a ella).
function cargarSeccionDiferida(hash, importar, ctx = ctxSecciones) {
    let promesa = null;
    const cargar = () => {
        if (promesa) return promesa;
        promesa = importar()
            .then(m => m.init(ctx))
            .catch(err => {
                promesa = null; // permitir reintentar al volver a entrar
                console.error(`No se pudo cargar la sección ${hash || ''}:`, err);
                showToast('No se pudo cargar esta sección. Revisa tu conexión e inténtalo de nuevo.', 'error');
            });
        return promesa;
    };
    if (hash) alEntrarSeccion(hash, cargar); else cargar();
    return cargar;
}

// ========================================================================
// --- FUNCIÓN GLOBAL: ACTUALIZAR STOCK ---
// ========================================================================
// Compara talla/color tolerando diferencias de mayúsculas/tildes/espacios, para
// no perder la coincidencia con la variación real por una diferencia de formato
// entre el origen del item (venta manual, pedido web detal o mayorista) y como
// quedó guardada la variación del producto.
function coincideVariacion(valorGuardado, valorItem) {
    const norm = v => {
        const n = (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        // "Unica"/"Unico" (prenda sin talla o color real, como se guarda al
        // crear el producto) y vacio/null (como llega desde mayor.js para
        // esos mismos casos) son la misma variacion: sin esto, un pedido
        // mayorista de una prenda de talla unica nunca hacia match y el
        // stock quedaba intacto sin avisar de forma visible.
        return (n === 'unica' || n === 'unico') ? '' : n;
    };
    return norm(valorGuardado) === norm(valorItem);
}

// Stock total de un producto: si tiene variaciones (talla/color) es la suma de
// sus variaciones; si no tiene (producto simple, ej. "sin talla/color"), el
// stock vive en el campo plano `stock` del producto.
function obtenerStockTotalProducto(producto) {
    if (!producto) return 0;
    if (Array.isArray(producto.variaciones) && producto.variaciones.length > 0) {
        return producto.variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
    }
    return parseInt(producto.stock, 10) || 0;
}

// ── Stock en TRANSACCIÓN (lee del servidor, no de la copia local) ─────────
// Antes, el stock nuevo se calculaba con localProductsMap (la copia local
// del catálogo) y se escribía encima la lista completa de variaciones. Con
// dos celulares vendiendo a la vez, o con la caché local de Firestore
// todavía sin sincronizar, eso dejaba vender prendas ya agotadas y además
// PISABA el descuento hecho por el otro dispositivo (inventario incorrecto).
// Ahora cada ajuste lee el documento real dentro de una transacción de
// Firestore (que nunca usa la caché y se reintenta sola si otro dispositivo
// cambió el producto en medio) — igual que actualizarStockFabrica en
// admin-fabrica.js.
//
// deltas:  Map productoId -> Map('talla|color' -> unidades a sumar/restar)
// nombres: Map productoId -> nombre (para los mensajes)
// validar: si es true, un delta negativo que deje la variación por debajo
//          de 0 cancela TODO (no se escribe nada) con error.agotados.
// Devuelve la lista de items que no se pudieron ajustar (producto o
// variación inexistente), igual que antes.
function etiquetaVariacion(nombre, talla, color) {
    const partes = [talla, color].filter(x => {
        const n = (x || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
        return n && n !== 'unica' && n !== 'unico';
    });
    return partes.length ? `${nombre} (${partes.join(' / ')})` : nombre;
}

async function aplicarDeltasStock(deltas, nombres, { validar = false } = {}) {
    if (!deltas.size) return [];
    return runTransaction(db, async (tx) => {
        // Firestore exige leer todo antes de escribir en una transacción.
        const snaps = new Map();
        for (const productoId of deltas.keys()) {
            snaps.set(productoId, await tx.get(doc(db, 'productos', productoId)));
        }

        const omitidos = [];
        const agotados = [];
        const escrituras = [];

        deltas.forEach((porVariacion, productoId) => {
            const nombre = nombres.get(productoId) || productoId;
            const snap = snaps.get(productoId);
            if (!snap.exists()) {
                omitidos.push(nombre);
                return;
            }
            const producto = snap.data();

            // Producto sin talla/color: el stock vive en el campo plano `stock`.
            if (!Array.isArray(producto.variaciones) || producto.variaciones.length === 0) {
                let deltaTotal = 0;
                porVariacion.forEach(d => { deltaTotal += d; });
                if (!deltaTotal) return;
                const stockActual = parseInt(producto.stock, 10) || 0;
                if (validar && deltaTotal < 0 && stockActual + deltaTotal < 0) {
                    agotados.push(`${nombre} (quedan ${Math.max(stockActual, 0)})`);
                    return;
                }
                escrituras.push([productoId, { stock: stockActual + deltaTotal }]);
                return;
            }

            const variaciones = JSON.parse(JSON.stringify(producto.variaciones));
            let huboCambio = false;
            porVariacion.forEach((delta, clave) => {
                if (!delta) return;
                const [talla, color] = clave.split('|');
                const variacion = variaciones.find(v => coincideVariacion(v.talla, talla) && coincideVariacion(v.color, color));
                if (!variacion) {
                    console.warn(`No se encontró la variación ${talla}/${color} para el producto ${productoId}`);
                    omitidos.push(etiquetaVariacion(nombre, talla, color));
                    return;
                }
                const stockActual = parseInt(variacion.stock, 10) || 0;
                if (validar && delta < 0 && stockActual + delta < 0) {
                    agotados.push(`${etiquetaVariacion(nombre, talla, color)} — quedan ${Math.max(stockActual, 0)}`);
                    return;
                }
                variacion.stock = stockActual + delta;
                huboCambio = true;
            });
            if (huboCambio) escrituras.push([productoId, { variaciones }]);
        });

        if (agotados.length) {
            const error = new Error(`No hay stock suficiente de: ${agotados.join(', ')}.`);
            error.agotados = agotados;
            throw error;
        }
        escrituras.forEach(([productoId, datos]) => tx.update(doc(db, 'productos', productoId), datos));
        return omitidos;
    });
}

function acumularDeltas(deltas, nombres, items, signo) {
    const sinId = [];
    (items || []).forEach(item => {
        if (!item.productoId) {
            sinId.push(item.nombre || item.nombreCompleto || 'producto sin ID');
            return;
        }
        const cantidad = parseInt(item.cantidad, 10) || 0;
        if (!cantidad) return;
        if (!deltas.has(item.productoId)) deltas.set(item.productoId, new Map());
        const porVariacion = deltas.get(item.productoId);
        const clave = `${item.talla || ''}|${item.color || ''}`;
        porVariacion.set(clave, (porVariacion.get(clave) || 0) + signo * cantidad);
        if (!nombres.has(item.productoId)) nombres.set(item.productoId, item.nombre || item.nombreCompleto || item.productoId);
    });
    return sinId;
}

// Suma o resta el stock de los items de una venta. Con { validarStock: true }
// (al registrar una venta) se llama ANTES de guardarla: si alguna prenda no
// alcanza, lanza el error y no se descuenta nada. Sin validarStock (reponer
// stock al anular/cancelar) nunca lanza: avisa con un toast, como antes.
async function actualizarStock(itemsVendido, accion = 'restar', { validarStock = false } = {}) {
    if (!itemsVendido || itemsVendido.length === 0) return;
    const deltas = new Map();
    const nombres = new Map();
    const sinId = acumularDeltas(deltas, nombres, itemsVendido, accion === 'restar' ? -1 : 1);
    sinId.forEach(n => console.warn("Item en carrito sin productoId, omitiendo stock:", n));

    try {
        const omitidos = [...sinId, ...await aplicarDeltasStock(deltas, nombres, { validar: validarStock && accion === 'restar' })];
        console.log(`Stock actualizado (acción: ${accion}) correctamente.`);
        if (omitidos.length > 0) {
            showToast(`Venta guardada, pero el inventario NO se ajustó para: ${omitidos.join(', ')}. Revísalo manualmente.`, 'error');
        }
    } catch (error) {
        if (validarStock) {
            if (!error.agotados) {
                // Sin conexión o error del servidor: la transacción necesita
                // confirmar el stock real, así que la venta no se registra.
                console.error('No se pudo verificar el stock:', error);
                const sinRed = error.code === 'unavailable' || !navigator.onLine;
                throw new Error(sinRed
                    ? 'Sin conexión: no se pudo verificar el stock. La venta no se registró; inténtalo de nuevo.'
                    : `No se pudo verificar el stock (${error.message}). La venta no se registró.`);
            }
            error.message += ' La venta no se registró.';
            throw error;
        }
        console.error("Error al actualizar stock:", error);
        showToast('Venta guardada, pero falló la actualización de stock.', 'error');
    }
}

// Reconcilia el stock al editar los items de una venta ya existente: repone
// lo original y descuenta lo nuevo como un delta neto por variación, en una
// sola transacción. Si lo nuevo no alcanza en el stock real, lanza error y no
// toca nada (el que llama no guarda la edición).
async function reconciliarStockEdicionVenta(itemsOriginales, itemsNuevos) {
    const deltas = new Map();
    const nombres = new Map();
    acumularDeltas(deltas, nombres, itemsOriginales, 1);   // reponer lo que tenía la venta
    acumularDeltas(deltas, nombres, itemsNuevos, -1);      // descontar lo que queda tras editar
    const omitidos = await aplicarDeltasStock(deltas, nombres, { validar: true });
    if (omitidos.length) console.warn('Stock no ajustado al editar la venta para:', omitidos.join(', '));
}

// ========================================================================
// --- SCRIPT EJECUTADO AL CARGAR EL DOM ---
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
     // --- Inicializar Modales ---
     try {
        const addClientModalEl = document.getElementById('addClientModal'); if(addClientModalEl) addClientModalInstance = new bootstrap.Modal(addClientModalEl);
        const addRepartidorModalEl = document.getElementById('addRepartidorModal'); if(addRepartidorModalEl) addRepartidorModalInstance = new bootstrap.Modal(addRepartidorModalEl);
        const addSupplierModalEl = document.getElementById('addSupplierModal'); if(addSupplierModalEl) addSupplierModalInstance = new bootstrap.Modal(addSupplierModalEl);
        const addIncomeModalEl = document.getElementById('addIncomeModal'); if(addIncomeModalEl) addIncomeModalInstance = new bootstrap.Modal(addIncomeModalEl);
        const addExpenseModalEl = document.getElementById('addExpenseModal'); if(addExpenseModalEl) addExpenseModalInstance = new bootstrap.Modal(addExpenseModalEl);
        const editCategoryModalEl = document.getElementById('editCategoryModal'); if (editCategoryModalEl) editCategoryModalInstance = new bootstrap.Modal(editCategoryModalEl);
        const deleteConfirmModalEl = document.getElementById('deleteConfirmModal'); if(deleteConfirmModalEl) deleteConfirmModalInstance = new bootstrap.Modal(deleteConfirmModalEl);
        const editSupplierModalEl = document.getElementById('editSupplierModal'); if(editSupplierModalEl) editSupplierModalInstance = new bootstrap.Modal(editSupplierModalEl);
        const editClientModalEl = document.getElementById('editClientModal'); if(editClientModalEl) editClientModalInstance = new bootstrap.Modal(editClientModalEl);
        const searchSupplierModalEl = document.getElementById('searchSupplierModal'); if(searchSupplierModalEl) searchSupplierModalInstance = new bootstrap.Modal(searchSupplierModalEl);
        const searchClientModalEl = document.getElementById('searchClientModal'); if(searchClientModalEl) searchClientModalInstance = new bootstrap.Modal(searchClientModalEl);
        const searchProductModalEl = document.getElementById('searchProductModal'); if(searchProductModalEl) searchProductModalInstance = new bootstrap.Modal(searchProductModalEl);
        const liquidateConfirmModalEl = document.getElementById('liquidateConfirmModal'); if(liquidateConfirmModalEl) liquidateConfirmModalInstance = new bootstrap.Modal(liquidateConfirmModalEl);
        
        const viewSaleModalEl = document.getElementById('viewSaleModal');
        if(viewSaleModalEl) viewSaleModalInstance = new bootstrap.Modal(viewSaleModalEl);

        const facturaAccionesModalEl = document.getElementById('facturaAccionesModal');
        if (facturaAccionesModalEl) {
            facturaAccionesModalInstance = new bootstrap.Modal(facturaAccionesModalEl);
            facturaAccionesModalEl.addEventListener('hidden.bs.modal', () => {
                const emailForm = document.getElementById('factura-email-form');
                if (emailForm) { emailForm.style.display = 'none'; emailForm.reset(); }
            });
        }

        const facturaPreguntaModalEl = document.getElementById('facturaPreguntaModal');
        if (facturaPreguntaModalEl) facturaPreguntaModalInstance = new bootstrap.Modal(facturaPreguntaModalEl);

        const selectVariationModalEl = document.getElementById('selectVariationModal');
        if (selectVariationModalEl) selectVariationModalInstance = new bootstrap.Modal(selectVariationModalEl);

        // ✅ --- INICIALIZAR MODAL DE ABONO ---
        const abonoApartadoModalEl = document.getElementById('abonoApartadoModal');
        if (abonoApartadoModalEl) abonoApartadoModalInstance = new bootstrap.Modal(abonoApartadoModalEl);

        // ✅ --- INICIALIZAR MODAL DE VER APARTADO ---
        const verApartadoModalEl = document.getElementById('verApartadoModal');
        if (verApartadoModalEl) verApartadoModalInstance = new bootstrap.Modal(verApartadoModalEl);


        // --- Lógica para limpiar modales de búsqueda al cerrar ---
        if (searchProductModalEl) {
            searchProductModalEl.addEventListener('hide.bs.modal', () => {
                // Resetear todos los filtros cuando se cierra el modal
                const searchInput = document.getElementById('product-modal-search');
                const categorySelect = document.getElementById('product-modal-category');
                const stockOnlyCheckbox = document.getElementById('product-modal-stock-only');
                const visibleOnlyCheckbox = document.getElementById('product-modal-visible-only');
                const sortSelect = document.getElementById('product-modal-sort');

                if (searchInput) searchInput.value = '';
                if (categorySelect) categorySelect.value = '';
                if (stockOnlyCheckbox) stockOnlyCheckbox.checked = false;
                if (visibleOnlyCheckbox) visibleOnlyCheckbox.checked = false;
                if (sortSelect) sortSelect.value = 'name-asc';

                const list = document.getElementById('product-modal-list');
                if (list) {
                    list.querySelectorAll('.product-search-item').forEach(item => {
                        item.style.display = '';
                    });
                }
            });
        }
        if (searchClientModalEl) {
            searchClientModalEl.addEventListener('hide.bs.modal', () => {
                const input = document.getElementById('client-modal-search');
                if (input) input.value = '';
                const list = document.getElementById('client-modal-list');
                if (list) {
                    list.querySelectorAll('.client-search-item').forEach(item => {
                        item.style.display = ''; 
                    });
                }
            });
        }
        if (searchSupplierModalEl) {
            searchSupplierModalEl.addEventListener('hide.bs.modal', () => {
                const input = document.getElementById('supplier-modal-search');
                if (input) input.value = '';
                const list = document.getElementById('supplier-modal-list');
                if (list) {
                    list.querySelectorAll('.supplier-search-item').forEach(item => {
                        item.style.display = '';
                    });
                }
            });
        }
     } catch (e) { console.error("Error initializing Modals:", e); }

     // --- Aplicar formato de dinero a todos los inputs ---
     aplicarFormatoDinero();

     // --- Lógica Modal de Confirmación de Borrado ---
     const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
     if (confirmDeleteBtn && deleteConfirmModalInstance) {
         confirmDeleteBtn.addEventListener('click', async (e) => {
            e.preventDefault(); 
            const idToDelete = confirmDeleteBtn.dataset.deleteId;
            const collectionToDelete = confirmDeleteBtn.dataset.deleteCollection;
            
            if (!idToDelete || !collectionToDelete) {
                showToast("Error: No se identificó qué eliminar.", 'error');
                deleteConfirmModalInstance.hide();
                return;
            }

            if (collectionToDelete === 'productos') {
                try {
                    const productDocRef = doc(db, 'productos', idToDelete);
                    const docSnap = await getDoc(productDocRef);
                    let productData = null;

                    if (docSnap.exists()) {
                        productData = docSnap.data();
                        const imageUrl = productData.imagenUrl;

                        if (imageUrl) {
                            try {
                                const imageRef = ref(storage, imageUrl);
                                await deleteObject(imageRef);
                                console.log("Imagen eliminada de Storage:", imageUrl);
                            } catch (storageErr) {
                                console.error("Error al eliminar imagen de Storage:", storageErr);
                                showToast("Producto eliminado, pero la imagen no se pudo borrar.", 'warning');
                            }
                        }
                    }

                    await deleteDoc(productDocRef);
                    showToast("Producto e imagen eliminados!");

                    registrarAuditoria({
                        accion: 'eliminar',
                        modulo: 'producto',
                        entidadId: idToDelete,
                        entidadNombre: productData?.nombre || idToDelete,
                        descripcion: `Eliminó el producto "${productData?.nombre || idToDelete}"${productData?.codigo ? ' (código ' + productData.codigo + ')' : ''}`,
                        detalles: { codigo: productData?.codigo || null }
                    });

                } catch (err) {
                    console.error(`Error deleting product:`, err);
                    showToast(`Error al eliminar: ${err.message}`, 'error');
                } finally {
                    deleteConfirmModalInstance.hide();
                }
            } else {
                try {
                    await deleteDoc(doc(db, collectionToDelete, idToDelete));
                    showToast("Elemento eliminado!");

                    registrarAuditoria({
                        accion: 'eliminar',
                        modulo: collectionToDelete,
                        entidadId: idToDelete,
                        entidadNombre: idToDelete,
                        descripcion: `Eliminó un elemento de "${collectionToDelete}" (ID ${idToDelete})`
                    });
                }
                catch (err) {
                    console.error(`Error deleting:`, err);
                    showToast(`Error al eliminar: ${err.message}`, 'error');
                }
                finally {
                    deleteConfirmModalInstance.hide();
                }
            }
         });
     } else { console.error("Delete confirmation button or modal missing"); }

    // ========================================================================
    // === LÓGICA DE PEDIDOS WEB ===
    // ========================================================================
    (() => {
        const webOrdersContainer = document.getElementById('web-orders-container');
        const loadingWebOrders = document.getElementById('loading-web-orders');
        const pedidosWebCountBadge = document.getElementById('pedidos-web-count');
        const mbnBadge = document.getElementById('mbn-pedidos-count');
        const topbarNotifBadge = document.getElementById('topbar-notif-count');
        const topbarNotifList = document.getElementById('topbar-notif-list');

        if (!webOrdersContainer) { console.warn("Contenedor de pedidos web no encontrado"); return; }

        // ── Estado ───────────────────────────────────────────────────────────
        let allOrders = { pendiente: [], aceptado: [], rechazado: [] };
        let currentTab = 'pendiente';
        let searchQuery = '';
        let filterPago = '';

        // ── UI listeners ─────────────────────────────────────────────────────
        const searchInput = document.getElementById('pw-search');
        const filterSelect = document.getElementById('pw-filter-pago');
        const tabButtons = document.querySelectorAll('.pw-tab');

        if (searchInput) {
            let st;
            searchInput.addEventListener('input', e => { clearTimeout(st); st = setTimeout(() => { searchQuery = e.target.value.toLowerCase().trim(); renderCurrentTab(); }, 200); });
        }
        if (filterSelect) filterSelect.addEventListener('change', e => { filterPago = e.target.value; renderCurrentTab(); });
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            renderCurrentTab();
        }));

        // ── Helpers ──────────────────────────────────────────────────────────
        function getFiltered(estado) {
            return allOrders[estado].filter(({ id, order }) => {
                const q = searchQuery.replace(/^#/, '');
                const ms = !searchQuery
                    || (order.clienteNombre || '').toLowerCase().includes(searchQuery)
                    || (order.clienteCelular || '').includes(searchQuery)
                    || id.toLowerCase().includes(q);
                const mp = !filterPago || (order.metodoPagoSolicitado || '').toLowerCase() === filterPago.toLowerCase();
                return ms && mp;
            });
        }

        function formatFecha(ts) {
            if (!ts?.toDate) return 'Fecha no disponible';
            return ts.toDate().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
        }

        // ── Dropdown de notificaciones (topbar) ─────────────────────────────────
        function renderNotifDropdown() {
            if (!topbarNotifList) return;
            const pending = allOrders.pendiente.slice(0, 5);

            if (pending.length === 0) {
                topbarNotifList.innerHTML = '<div class="admin-topbar-notif-empty">No tienes notificaciones nuevas</div>';
                return;
            }

            topbarNotifList.innerHTML = pending.map(({ id, order }) => `
                <button type="button" class="admin-topbar-notif-item" data-order-id="${id}">
                    <div class="admin-topbar-notif-item-icon"><i class="bi bi-bag-check"></i></div>
                    <div class="admin-topbar-notif-item-body">
                        <div class="admin-topbar-notif-item-title">${order.clienteNombre || 'Cliente'}</div>
                        <div class="admin-topbar-notif-item-sub">${formatoMoneda.format(order.totalPedido || 0)} · ${formatFecha(order.timestamp)}</div>
                    </div>
                </button>
            `).join('');

            topbarNotifList.querySelectorAll('.admin-topbar-notif-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.closeTopbarDropdowns) window.closeTopbarDropdowns();
                    if (window.adminShowSection) window.adminShowSection('#pedidos-web');
                    if (window.adminMarkActive) window.adminMarkActive('#pedidos-web');
                    const tabBtn = document.querySelector('.pw-tab[data-tab="pendiente"]');
                    if (tabBtn) tabBtn.click();
                });
            });
        }

        // ── Stats ────────────────────────────────────────────────────────────
        function updateStats() {
            const count = allOrders.pendiente.length;
            if (pedidosWebCountBadge) { pedidosWebCountBadge.textContent = count; pedidosWebCountBadge.style.display = count > 0 ? 'inline' : 'none'; }
            if (mbnBadge) { mbnBadge.textContent = count; mbnBadge.style.display = count > 0 ? 'inline-flex' : 'none'; }
            if (topbarNotifBadge) { topbarNotifBadge.textContent = count > 9 ? '9+' : count; topbarNotifBadge.style.display = count > 0 ? 'flex' : 'none'; }
            renderNotifDropdown();
            const pill = document.getElementById('pedidos-pending-pill');
            const pillCount = document.getElementById('pedidos-pending-count');
            if (pill && pillCount) { pillCount.textContent = count; pill.style.display = count > 0 ? 'inline-flex' : 'none'; }
            const statPendientes = document.getElementById('pw-stat-pendientes');
            if (statPendientes) statPendientes.textContent = count;
            ['pendiente','aceptado','rechazado'].forEach(t => { const b = document.getElementById(`pw-badge-${t}`); if (b) b.textContent = allOrders[t].length; });
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const aceptadosHoy = allOrders.aceptado.filter(({ order }) => { const f = order.fechaAceptacion?.toDate?.(); return f && f >= hoy; });
            const valorHoy = aceptadosHoy.reduce((s, { order }) => s + (order.totalPedido || 0), 0);
            const sH = document.getElementById('pw-stat-hoy'); if (sH) sH.textContent = aceptadosHoy.length;
            const sV = document.getElementById('pw-stat-valor'); if (sV) sV.textContent = formatoMoneda.format(valorHoy);
            const dbB = document.getElementById('db-pedidos-web'); if (dbB) dbB.textContent = count;
        }

        // ── Render ───────────────────────────────────────────────────────────
        function renderCurrentTab() {
            webOrdersContainer.querySelectorAll('.pw-order-card, .pw-empty').forEach(el => el.remove());
            const orders = getFiltered(currentTab);
            if (orders.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'pw-empty';
                const labels = { pendiente: 'No hay pedidos pendientes', aceptado: 'No hay pedidos aceptados', rechazado: 'No hay pedidos rechazados' };
                const icons  = { pendiente: 'bi-clock', aceptado: 'bi-check-circle', rechazado: 'bi-x-circle' };
                empty.innerHTML = `<i class="bi ${icons[currentTab]} pw-empty-icon"></i><p class="pw-empty-text">${labels[currentTab]}</p>`;
                webOrdersContainer.appendChild(empty);
                return;
            }
            const frag = document.createDocumentFragment();
            orders.forEach(({ id, order }) => frag.appendChild(createOrderCard(order, id)));
            webOrdersContainer.appendChild(frag);
        }

        // ── Card builder ─────────────────────────────────────────────────────
        function createOrderCard(order, orderId) {
            const card = document.createElement('div');
            const estado = order.estado || 'pendiente';
            card.className = `pw-order-card pw-status-${estado}`;
            card.dataset.orderId = orderId;

            const isPendiente = estado === 'pendiente';
            const isAceptado  = estado === 'aceptado';

            // Items
            const itemsHtml = (order.items || []).map(item => {
                const product = localProductsMap.get(item.productoId);
                const imgHtml = product?.imagenUrl
                    ? `<img src="${urlMiniatura(product)}" class="pw-item-img" alt="${item.nombre}" loading="lazy" decoding="async">`
                    : `<div class="pw-item-img-placeholder"><i class="bi bi-image"></i></div>`;
                return `<div class="pw-item-row">
                    ${imgHtml}
                    <div class="pw-item-info">
                        <div class="pw-item-name">${item.nombre}</div>
                        <div class="pw-item-meta">${[item.talla, item.color].filter(Boolean).join(' · ')} · x${item.cantidad}</div>
                    </div>
                    <div class="pw-item-total">${formatoMoneda.format(item.total)}</div>
                </div>`;
            }).join('');

            // Status badge
            const statusLabels = { pendiente: 'Pendiente', aceptado: 'Aceptado', rechazado: 'Rechazado' };
            const statusIcons  = { pendiente: 'bi-clock-fill', aceptado: 'bi-check-circle-fill', rechazado: 'bi-x-circle-fill' };
            const statusBadge  = `<span class="pw-status-badge ${estado}"><i class="bi ${statusIcons[estado]}"></i>${statusLabels[estado]}</span>`;

            // Delivery strip (solo para aceptados)
            const deliveryStrip = isAceptado && (order.repartidor || order.costoEnvio)
                ? `<div class="pw-delivery-strip">
                    ${order.repartidor ? `<span><i class="bi bi-person-fill"></i>${order.repartidor}</span>` : ''}
                    ${order.costoEnvio > 0 ? `<span><i class="bi bi-truck"></i>${formatoMoneda.format(order.costoEnvio)}</span>` : ''}
                    ${order.fechaAceptacion ? `<span><i class="bi bi-calendar-check"></i>${formatFecha(order.fechaAceptacion)}</span>` : ''}
                   </div>`
                : '';

            // Observaciones
            const obsHtml = order.observaciones
                ? `<div class="pw-obs"><i class="bi bi-chat-text me-1"></i>${order.observaciones}</div>` : '';

            // Acciones
            const actionsHtml = isPendiente ? `
                <div class="pw-actions">
                    <button class="pw-btn pw-btn-whatsapp btn-whatsapp-order" data-order-id="${orderId}">
                        <i class="bi bi-whatsapp"></i><span class="d-none d-sm-inline ms-1">WhatsApp</span>
                    </button>
                    <button class="pw-btn pw-btn-reject btn-reject-order" data-order-id="${orderId}">
                        <i class="bi bi-x-lg"></i><span class="d-none d-sm-inline ms-1">Rechazar</span>
                    </button>
                    <button class="pw-btn pw-btn-accept btn-accept-order" data-order-id="${orderId}">
                        <i class="bi bi-check-lg"></i><span class="ms-1">Aceptar</span>
                    </button>
                </div>` : '';

            card.innerHTML = `
                <div class="pw-card-header">
                    <div>
                        <div class="pw-card-id"><i class="bi bi-bag-check me-1"></i>#${orderId.substring(0,8).toUpperCase()}</div>
                        <div class="pw-card-date">${formatFecha(order.timestamp)}</div>
                    </div>
                    ${statusBadge}
                </div>
                <div class="pw-card-body">
                    <div class="pw-client-row">
                        <div class="pw-client-name">${order.clienteNombre || '—'}</div>
                        <div class="pw-client-chip"><i class="bi bi-telephone"></i><a href="https://wa.me/57${order.clienteCelular}" target="_blank">${order.clienteCelular}</a></div>
                        ${order.clienteDireccion ? `<div class="pw-client-chip"><i class="bi bi-geo-alt"></i>${order.clienteDireccion}</div>` : ''}
                        <span class="pw-pago-badge"><i class="bi bi-credit-card"></i>${order.metodoPagoSolicitado || '—'}</span>
                    </div>
                    ${deliveryStrip}
                    ${obsHtml}
                    <div class="pw-items-list">${itemsHtml}</div>
                </div>
                <div class="pw-card-footer">
                    <div>
                        <div class="pw-total-label">Total del pedido</div>
                        <div class="pw-total-val">${formatoMoneda.format(order.totalPedido || 0)}</div>
                    </div>
                    ${actionsHtml}
                </div>`;

            return card;
        }

        // ── Firestore: 3 listeners (pendiente / aceptado / rechazado) ────────
        // 'pedidosWeb' es una colección compartida: la tienda al detal
        // (index.html, tenantId 'boutique') y la mayorista de Fábrica
        // (mayor.html, tenantId 'fabrica') escriben ahí. Filtramos aquí en
        // JS (no en la query) los pedidos de Fábrica para que solo lleguen
        // a admin-fabrica.html — así no se filtra por índice compuesto
        // nuevo y sin desplegar, y los pedidos de Boutique (o los antiguos
        // sin tenantId) se siguen viendo igual que antes.
        ['pendiente', 'aceptado', 'rechazado'].forEach(estado => {
            const q = query(webOrdersCollection, where('estado', '==', estado), orderBy('timestamp', 'desc'), limit(100));
            onSnapshot(q, snapshot => {
                allOrders[estado] = [];
                snapshot.forEach(d => {
                    const order = d.data();
                    if (order.tenantId === 'fabrica') return;
                    allOrders[estado].push({ id: d.id, order });
                });
                if (loadingWebOrders) loadingWebOrders.style.display = 'none';
                updateStats();
                if (estado === currentTab) renderCurrentTab();
            }, err => console.error(`Error pedidos ${estado}:`, err));
        });

        // ── Click delegation ─────────────────────────────────────────────────
        webOrdersContainer.addEventListener('click', async e => {
            const a = e.target.closest('.btn-accept-order');
            const r = e.target.closest('.btn-reject-order');
            const w = e.target.closest('.btn-whatsapp-order');
            if (a) { e.preventDefault(); await handleAcceptOrder(a.dataset.orderId); }
            else if (r) { e.preventDefault(); await handleRejectOrder(r.dataset.orderId); }
            else if (w) { e.preventDefault(); await handleWhatsAppOrder(w.dataset.orderId); }
        });

        // ── Handlers ─────────────────────────────────────────────────────────
        async function handleRejectOrder(orderId) {
            if (!confirm('¿Estás seguro de que quieres rechazar este pedido?')) return;
            try {
                await updateDoc(doc(db, 'pedidosWeb', orderId), { estado: 'rechazado', fechaRechazo: serverTimestamp() });
                showToast('Pedido rechazado correctamente', 'info');
            } catch (err) { console.error('Error al rechazar:', err); showToast('Error al rechazar el pedido', 'error'); }
        }

        async function loadRepartidores() {
            const sel = document.getElementById('delivery-person-select');
            sel.innerHTML = '';
            try {
                const snap = await getDocs(query(repartidoresCollection, orderBy('nombre')));
                if (snap.empty) { sel.innerHTML = '<option value="Papi">Papi</option>'; }
                else snap.forEach(d => { const o = document.createElement('option'); o.value = d.data().nombre; o.textContent = d.data().nombre; sel.appendChild(o); });
            } catch { sel.innerHTML = '<option value="Papi">Papi</option>'; }
        }

        function buildPreviewHtml(subtotal, dc) {
            const total = subtotal + dc;
            return `<h6 class="mb-3"><i class="bi bi-receipt me-2"></i>Resumen del Pedido</h6>
                <div class="d-flex justify-content-between mb-2"><span>Subtotal:</span><strong>${formatoMoneda.format(subtotal)}</strong></div>
                <div class="d-flex justify-content-between mb-2"><span>Domicilio:</span><strong class="text-success">${formatoMoneda.format(dc)}</strong></div>
                <hr>
                <div class="d-flex justify-content-between"><span class="fw-bold">Total:</span><strong class="text-primary fs-5">${formatoMoneda.format(total)}</strong></div>`;
        }

        async function handleAcceptOrder(orderId) {
            try {
                const orderRef = doc(db, 'pedidosWeb', orderId);
                // El pedido ya está en memoria: llegó por el onSnapshot de 'pendiente'
                // que dibujó la tarjeta en la que el usuario acaba de hacer clic. Evitar
                // el getDoc y no esperar a que el updateDoc confirme en el servidor antes
                // de llevar al usuario al formulario de venta: eran dos round-trips de
                // red seguidos (getDoc + updateDoc) que hacían sentir el "Aceptar" lento
                // aunque no hubiera ningún trabajo pesado de por medio.
                const cached = allOrders.pendiente.find(o => o.id === orderId);
                let orderData = cached?.order;
                if (!orderData) {
                    const orderSnap = await getDoc(orderRef);
                    if (!orderSnap.exists()) { showToast('Pedido no encontrado', 'error'); return; }
                    orderData = orderSnap.data();
                }
                const subtotal = orderData.subtotalProductos || orderData.totalPedido || 0;
                await preFillSalesForm(orderData, orderId, 0, subtotal);
                showToast('Pedido aceptado. Completa el formulario de venta.', 'success');
                if (window.adminShowSection) { window.adminShowSection('#ventas'); window.adminMarkActive('#ventas'); }
                const btn = document.getElementById('toggle-sales-form-view-btn');
                if (btn) btn.click();

                updateDoc(orderRef, { estado: 'aceptado', fechaAceptacion: serverTimestamp(), totalPedido: subtotal })
                    .catch(err => { console.error('Error al marcar pedido como aceptado:', err); showToast('El pedido pasó al formulario, pero no se pudo marcar como aceptado. Verifica tu conexión.', 'error'); });
            } catch (err) { console.error('Error al aceptar:', err); showToast('Error al procesar el pedido', 'error'); }
        }

        async function preFillSalesForm(orderData, orderId, deliveryCost = 0, total = 0) {
            // El carrito vive en src/admin/secciones/ventas.js (carga diferida).
            await window.asegurarModuloVentas?.();
            window.ventaItems = [];
            const vc = document.getElementById('venta-cliente');
            const vcel = document.getElementById('venta-cliente-celular');
            const vdir = document.getElementById('venta-cliente-direccion');
            if (vc) vc.value = orderData.clienteNombre;
            if (vcel) vcel.value = orderData.clienteCelular;
            if (vdir) vdir.value = orderData.clienteDireccion;
            const tvs = document.getElementById('tipo-venta-select'); if (tvs) tvs.value = orderData.tipoVenta === 'Mayorista' ? 'mayorista' : 'detal';
            const vwc = document.getElementById('venta-whatsapp'); if (vwc) vwc.checked = false;
            const vobs = document.getElementById('venta-observaciones');
            if (vobs) {
                let obs = `Pedido Web #${orderId.substring(0,8).toUpperCase()}`;
                if (orderData.observaciones) obs += `\n${orderData.observaciones}`;
                vobs.value = obs;
            }
            (orderData.items || []).forEach(item => {
                window.agregarItemAlCarrito(item.productoId, item.nombre, item.cantidad, item.precio, item.talla, item.color, `${item.nombre} (${item.talla}/${item.color})`);
            });
            window.calcularTotalVentaGeneral();
        }

        async function handleWhatsAppOrder(orderId) {
            try {
                const orderRef = doc(db, 'pedidosWeb', orderId);
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) { showToast('Pedido no encontrado', 'error'); return; }
                const orderData = orderSnap.data();
                const subtotal = orderData.subtotalProductos || orderData.totalPedido || 0;

                await loadRepartidores();
                const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deliveryCostModal'));
                const costInput  = document.getElementById('delivery-cost-input');
                const preview    = document.getElementById('order-summary-preview');
                const confirmBtn = document.getElementById('confirm-whatsapp-btn');
                const sel = document.getElementById('delivery-person-select');

                costInput.value = orderData.costoEnvio || 0;
                sel.value = orderData.repartidor || sel.options[0]?.value || '';

                const onInput = () => { preview.innerHTML = buildPreviewHtml(subtotal, parseFloat(costInput.value) || 0); };
                costInput.addEventListener('input', onInput);
                onInput();
                modal.show();

                confirmBtn.onclick = async () => {
                    try {
                        const dc = parseFloat(costInput.value) || 0;
                        const dp = sel.value;
                        const total = subtotal + dc;
                        await updateDoc(orderRef, { costoEnvio: dc, repartidor: dp, totalPedido: total });

                        let msg = `*CONFIRMACION DE PEDIDO*\n\nHola *${orderData.clienteNombre}*,\n\nHemos recibido tu pedido. A continuacion los detalles:\n\n*PRODUCTOS:*\n\n`;
                        (orderData.items || []).forEach((item, i) => {
                            const p = localProductsMap.get(item.productoId);
                            msg += `\n${i+1}. *${item.nombre}*${p?.categoria ? ` [${p.categoria}]` : ''}`;
                            msg += `\n   Talla: ${item.talla||'N/A'} | Color: ${item.color||'N/A'}`;
                            msg += `\n   Cantidad: ${item.cantidad} x ${formatoMoneda.format(item.precio)} = ${formatoMoneda.format(item.total)}`;
                            if (p?.imagenUrl) msg += `\n   Link: ${p.imagenUrl}`;
                            msg += '\n';
                        });
                        msg += `\n*Direccion de entrega:*\n${orderData.clienteDireccion}\n`;
                        if (orderData.observaciones) msg += `\n*Observaciones:*\n${orderData.observaciones}\n`;
                        msg += `\n*Repartidor:* ${dp}\n*Metodo de pago:* ${orderData.metodoPagoSolicitado}\n`;
                        msg += `\n*RESUMEN:*\nSubtotal Productos: ${formatoMoneda.format(subtotal)}\n`;
                        if (dc > 0) msg += `Costo de Envio: ${formatoMoneda.format(dc)}\n`;
                        msg += `\n*TOTAL A PAGAR: ${formatoMoneda.format(total)}*\n\nGracias por tu compra!`;

                        let tel = orderData.clienteCelular.replace(/\D/g, '');
                        if (tel.startsWith('57')) tel = tel.substring(2);
                        modal.hide();
                        openWhatsApp(`https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`);
                        showToast('Pedido actualizado y abriendo WhatsApp...', 'success');
                    } catch (err) { console.error('Error WA:', err); showToast('Error al procesar el pedido', 'error'); }
                };
            } catch (err) { console.error('Error WA order:', err); showToast('Error al generar el mensaje', 'error'); }
        }

        async function notificarRepartidor(nombreRepartidor, orderData, deliveryCost, total) {
            try {
                const snap = await getDocs(query(repartidoresCollection, where('nombre', '==', nombreRepartidor)));
                if (snap.empty) return;
                const rd = snap.docs[0].data();
                if (!rd.celular) { showToast('El repartidor no tiene número de celular', 'warning'); return; }

                let msg = `*NUEVO PEDIDO ASIGNADO*\n\nHola ${nombreRepartidor},\n\nTe han asignado un nuevo pedido:\n\n`;
                msg += `*CLIENTE:*\nNombre: ${orderData.clienteNombre}\nTelefono: ${orderData.clienteCelular}\n\n`;
                msg += `*DIRECCION:*\n${orderData.clienteDireccion}\nCiudad: ${orderData.clienteCiudad}\n`;
                if (orderData.clienteBarrio) msg += `Barrio: ${orderData.clienteBarrio}\n`;
                if (orderData.observaciones) msg += `\n*OBSERVACIONES:*\n${orderData.observaciones}\n`;
                msg += `\n*PRODUCTOS:*\n`;
                (orderData.items || []).forEach((item, i) => { msg += `\n${i+1}. ${item.nombre}\n   Talla: ${item.talla} | Color: ${item.color}\n   Cantidad: ${item.cantidad}\n`; });
                msg += `\n*PAGO:*\nMetodo: ${orderData.metodoPagoSolicitado}\nTotal a cobrar: ${formatoMoneda.format(total)}\n`;
                if (orderData.metodoPagoSolicitado === 'Efectivo') msg += `\n*IMPORTANTE:* Cobrar en efectivo\n`;
                msg += `\nDomicilio: ${formatoMoneda.format(deliveryCost)}`;

                let tel = rd.celular.replace(/\D/g, '');
                if (tel.startsWith('57')) tel = tel.substring(2);
                setTimeout(() => { openWhatsApp(`https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`); showToast(`Notificando a ${nombreRepartidor}...`, 'info'); }, 1000);
            } catch (err) { console.error('Error notificar repartidor:', err); showToast('Error al notificar al repartidor', 'error'); }
        }

    })();

    // Suscriptores ligeros del listener único de categorías/proveedores (más
    // abajo, junto a cada CRUD). Antes cada dropdown de filtro (inventario,
    // ventas, modal de búsqueda de producto) abría su propio onSnapshot sobre
    // la colección completa — se consolidan en un solo listener real por
    // colección, igual que se hizo con productos y repartidores.
    // Como en subscribeRepartidores, quien se suscribe tarde (las secciones con
    // carga diferida, p. ej. Ventas) recibe de inmediato el último snapshot.
    const categoriesSubscribers = [];
    let ultimoSnapshotCategorias = null;
    function subscribeCategories(callback) {
        categoriesSubscribers.push(callback);
        if (ultimoSnapshotCategorias) {
            try { callback(ultimoSnapshotCategorias); } catch (e) { console.error('Error en suscriptor de categorías:', e); }
        }
    }
    const suppliersSubscribers = [];
    function subscribeSuppliers(callback) { suppliersSubscribers.push(callback); }

    // ========================================================================
    // --- LÓGICA CATEGORÍAS (Funcional CRUD with Modals) ---
    // ========================================================================
    (() => {
        const categoryForm = document.getElementById('form-categoria'); const categoryNameInput = document.getElementById('nombre-categoria'); const categoryList = document.getElementById('lista-categorias'); const categoryDropdown = document.getElementById('categoria-producto'); const editForm = document.getElementById('form-edit-category'); const editIdInput = document.getElementById('edit-category-id'); const editNameInput = document.getElementById('edit-category-nombre');
        if (!categoryForm || !categoryList || !categoryDropdown || !editForm) { console.warn("Elementos de Categorías no encontrados."); return; }
        const render = (snapshot) => { if (!categoryList) return; categoryList.innerHTML = ''; if (snapshot.empty) { categoryList.innerHTML = '<li class="list-group-item text-muted">No hay categorías.</li>'; return; } snapshot.forEach(doc => { const d = doc.data(); const id = doc.id; const li = document.createElement('li'); li.className = 'list-group-item d-flex justify-content-between align-items-center'; li.dataset.id = id; li.innerHTML = `<span class="category-name">${d.nombre}</span><div class="action-buttons"><button class="btn btn-action btn-action-edit me-1 btn-edit-category"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button><button class="btn btn-action btn-action-delete btn-delete-category"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></div>`; categoryList.appendChild(li); }); };
        const updateDropdown = (snapshot) => { if (!categoryDropdown) return; const sel = categoryDropdown.value; categoryDropdown.innerHTML = '<option value="">Selecciona...</option>'; snapshot.forEach(doc => { const d = doc.data(); const opt = document.createElement('option'); opt.value = doc.id; opt.textContent = d.nombre; categoryDropdown.appendChild(opt); }); categoryDropdown.value = sel; }
        const checkDuplicate = async (name, currentId = null) => { const lowerCaseName = name.toLowerCase(); const q = query(categoriesCollection, where("nombreLower", "==", lowerCaseName)); const querySnapshot = await getDocs(q); let isDuplicate = false; querySnapshot.forEach((doc) => { if (doc.id !== currentId) { isDuplicate = true; } }); return isDuplicate; };
        onSnapshot(query(categoriesCollection, orderBy("nombre")), (s) => { ultimoSnapshotCategorias = s; render(s); updateDropdown(s); categoriesSubscribers.forEach(cb => { try { cb(s); } catch (e) { console.error('Error en suscriptor de categorías:', e); } }); }, (e) => { console.error("Error categories: ", e); if(categoryList) categoryList.innerHTML = '<li class="list-group-item text-danger">Error.</li>'; });
        if (categoryForm) categoryForm.addEventListener('submit', async (e) => { e.preventDefault(); const name = categoryNameInput.value.trim(); if (!name) return; if (await checkDuplicate(name)) { showToast('Ya existe una categoría con ese nombre.', 'warning'); return; } try { await addDoc(categoriesCollection, { nombre: name, nombreLower: name.toLowerCase() }); showToast("Categoría guardada!"); categoryNameInput.value = ''; } catch (err) { console.error("Error add cat:", err); showToast(`Error: ${err.message}`, 'error'); } });
        if (editForm && editCategoryModalInstance) editForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = editIdInput.value; const name = editNameInput.value.trim(); if (!id || !name) return; if (await checkDuplicate(name, id)) { showToast('Ya existe otra categoría con ese nombre.', 'warning'); return; } try { await updateDoc(doc(db, "categorias", id), { nombre: name, nombreLower: name.toLowerCase() }); showToast("Categoría actualizada!"); editCategoryModalInstance.hide(); } catch (err) { console.error("Error update cat:", err); showToast(`Error: ${err.message}`, 'error'); } });
        if (categoryList) categoryList.addEventListener('click', (e) => { const target = e.target.closest('button'); if (!target) return; e.preventDefault(); const li = target.closest('li'); const id = li.dataset.id; const nameSpan = li.querySelector('.category-name'); if (!id || !nameSpan) return;
            if (target.classList.contains('btn-delete-category')) {
                 const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'categorias'; deleteItemNameEl.textContent = `Categoría: ${nameSpan.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
            } else if (target.classList.contains('btn-edit-category')) { if(editIdInput && editNameInput && editCategoryModalInstance) { editIdInput.value = id; editNameInput.value = nameSpan.textContent; editCategoryModalInstance.show(); } else { console.error("Edit modal elements missing."); showToast('Error al abrir editor.', 'error'); } }
        });
    })();

    // ========================================================================
    // --- LÓGICA PROVEEDORES (Funcional CRUD with Modals) ---
    // ========================================================================
    (() => {
        const addForm = document.getElementById('form-add-supplier'); const addNameInput = document.getElementById('new-supplier-nombre'); const addContactInput = document.getElementById('new-supplier-contacto'); const addPhoneInput = document.getElementById('new-supplier-telefono');
        const editForm = document.getElementById('form-edit-supplier'); const editIdInput = document.getElementById('edit-supplier-id'); const editNameInput = document.getElementById('edit-supplier-nombre'); const editContactInput = document.getElementById('edit-supplier-contacto'); const editPhoneInput = document.getElementById('edit-supplier-telefono');
        const listTable = document.getElementById('lista-proveedores-tabla');
        const searchModalList = document.getElementById('supplier-modal-list');
        const searchInput = document.getElementById('supplier-modal-search');
        const productFormInput = document.getElementById('proveedor-producto');
        // Hacer suppliersMap global para que otros módulos puedan acceder
        if (!window.suppliersMap) {
            window.suppliersMap = new Map();
        }
        let suppliersMap = window.suppliersMap;
        if (!addForm || !listTable || !searchModalList || !editForm || !productFormInput) { console.warn("Elementos de Proveedores no encontrados."); return; }

        const renderSuppliers = (snapshot) => { suppliersMap.clear(); listTable.innerHTML = ''; searchModalList.innerHTML = ''; if (snapshot.empty) { listTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay proveedores.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; suppliersMap.set(id, d); if (listTable) { const tr = document.createElement('tr'); tr.dataset.id = id; tr.innerHTML = `<td class="supplier-name">${d.nombre}</td> <td>${d.contacto || '-'}</td> <td>${d.telefono || '-'}</td> <td class="action-buttons"><button class="btn btn-action btn-action-edit btn-edit-supplier"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button> <button class="btn btn-action btn-action-delete btn-delete-supplier"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></td>`; listTable.appendChild(tr); }
            const li = document.createElement('li'); li.className = 'list-group-item list-group-item-action supplier-search-item'; li.dataset.name = d.nombre; li.dataset.id = id; li.textContent = d.nombre; searchModalList.appendChild(li);
        }); };
        onSnapshot(query(suppliersCollection, orderBy('nombre')), (s) => { renderSuppliers(s); suppliersSubscribers.forEach(cb => { try { cb(s); } catch (e) { console.error('Error en suscriptor de proveedores:', e); } }); }, (e) => { console.error("Error suppliers:", e); if(listTable) listTable.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error.</td></tr>';});
        if (addForm && addSupplierModalInstance) addForm.addEventListener('submit', async (e) => { e.preventDefault(); const name = addNameInput.value.trim(); const contact = addContactInput.value.trim(); const phone = addPhoneInput.value.trim(); if (name) { try { await addDoc(suppliersCollection, { nombre: name, contacto: contact, telefono: phone, nombreLower: name.toLowerCase() }); showToast("Proveedor guardado!"); addSupplierModalInstance.hide(); addForm.reset(); } catch (err) { console.error("Err add supplier:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast("Nombre requerido.", 'warning'); }});
        if (editForm && editSupplierModalInstance) editForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = editIdInput.value; const name = editNameInput.value.trim(); const contact = editContactInput.value.trim(); const phone = editPhoneInput.value.trim(); if (id && name) { try { await updateDoc(doc(db, "proveedores", id), { nombre: name, contacto: contact, telefono: phone, nombreLower: name.toLowerCase() }); showToast("Proveedor actualizado!"); editSupplierModalInstance.hide(); } catch (err) { console.error("Err update supplier:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast("Nombre requerido.", 'warning'); }});
        if (listTable) listTable.addEventListener('click', (e) => { const target = e.target.closest('button'); if (!target) return; e.preventDefault(); const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.supplier-name'); if (!id || !nameTd) return;
            if (target.classList.contains('btn-delete-supplier')) {
                 const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'proveedores'; deleteItemNameEl.textContent = `Proveedor: ${nameTd.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
            } else if (target.classList.contains('btn-edit-supplier')) {
                const supplierData = suppliersMap.get(id);
                if (supplierData && editSupplierModalInstance && editIdInput && editNameInput && editContactInput && editPhoneInput) {
                    editIdInput.value = id; editNameInput.value = supplierData.nombre || ''; editContactInput.value = supplierData.contacto || ''; editPhoneInput.value = supplierData.telefono || '';
                    editSupplierModalInstance.show();
                } else { console.error("Edit supplier modal or data missing"); showToast("Error al abrir editor.", 'error'); }
            }
        });
        if (searchInput) searchInput.addEventListener('input', (e) => { const searchTerm = e.target.value.toLowerCase(); const items = searchModalList.querySelectorAll('.supplier-search-item'); items.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? '' : 'none'; }); });
        if (searchModalList && searchSupplierModalInstance) searchModalList.addEventListener('click', (e) => { const target = e.target.closest('.supplier-search-item'); if (target) { productFormInput.value = target.dataset.name; searchSupplierModalInstance.hide(); } });
    })();

    // ========================================================================
    // --- LÓGICA CLIENTES (Funcional CRUD with Modals) ---
    // ========================================================================
    (() => {
        const addForm = document.getElementById('form-add-client'); const addCedulaInput = document.getElementById('new-client-cedula'); const addNombreInput = document.getElementById('new-client-nombre'); const addCelularInput = document.getElementById('new-client-celular'); const addDireccionInput = document.getElementById('new-client-direccion');
        const editForm = document.getElementById('form-edit-client'); const editIdInput = document.getElementById('edit-client-id'); const editCedulaInput = document.getElementById('edit-client-cedula'); const editNombreInput = document.getElementById('edit-client-nombre'); const editCelularInput = document.getElementById('edit-client-celular'); const editDireccionInput = document.getElementById('edit-client-direccion');
        const clientListTable = document.getElementById('lista-clientes');
        const searchModalList = document.getElementById('client-modal-list');
        const searchInput = document.getElementById('client-modal-search');
        const ventaClienteInput = document.getElementById('venta-cliente'); const ventaCelularInput = document.getElementById('venta-cliente-celular'); const ventaDireccionInput = document.getElementById('venta-cliente-direccion'); const ventaCedulaInput = document.getElementById('venta-cliente-cedula');
        if (!addForm || !editForm || !clientListTable || !searchModalList) { console.warn("Elementos de Clientes no encontrados."); return; }

        // Los datos de clientes (localClientsMap) se cargan apenas llegan,
        // porque Ventas los usa para autocompletar. La tabla de la pestaña
        // Clientes y la lista del buscador de clientes (cientos de filas)
        // antes se armaban también al abrir el panel aunque nadie las viera;
        // ahora se arman la primera vez que se entra a Clientes o se abre el
        // buscador, y se rearman si llegan cambios mientras están a la vista.
        const escCliente = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        let ultimoSnapClientes = null;
        let clientesDomSucio = true;
        const clientesVisibles = () =>
            (window.location.hash || '#dashboard') === '#clientes' ||
            !!document.getElementById('searchClientModal')?.classList.contains('show');
        const pintarClientesDom = () => {
            const snapshot = ultimoSnapClientes;
            if (!snapshot) return;
            clientesDomSucio = false;
            const filas = [];
            const items = ['<li class="list-group-item list-group-item-action client-search-item" data-name="Cliente General" data-id="">Cliente General</li>'];
            snapshot.forEach(docSnap => {
                const d = docSnap.data();
                if (d.tenantId && d.tenantId !== 'boutique') return;
                const id = docSnap.id;
                const dataListValue = d.cedula ? `${d.cedula} - ${d.nombre}` : d.nombre;
                filas.push(`<tr data-id="${escCliente(id)}"><td class="client-name">${d.nombre}</td> <td>${d.cedula || '-'}</td> <td>${d.celular || '-'}</td> <td>${d.direccion || '-'}</td> <td>${d.ultimaCompra?.toDate ? d.ultimaCompra.toDate().toLocaleDateString('es-CO') : '-'}</td> <td class="action-buttons"><button class="btn btn-action btn-action-view btn-client-history" data-client-name="${escCliente(d.nombre)}" data-client-celular="${escCliente(d.celular || '')}"><i class="bi bi-clock-history"></i><span class="btn-action-text">Historial</span></button> <button class="btn btn-action btn-action-edit btn-edit-client"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button> <button class="btn btn-action btn-action-delete btn-delete-client"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></td></tr>`);
                items.push(`<li class="list-group-item list-group-item-action client-search-item" data-name="${escCliente(dataListValue)}" data-id="${escCliente(id)}">${escCliente(dataListValue)}</li>`);
            });
            if (clientListTable) clientListTable.innerHTML = filas.length ? filas.join('') : '<tr><td colspan="6" class="text-center text-muted">No hay clientes.</td></tr>';
            if (searchModalList) searchModalList.innerHTML = items.join('');
        };
        alEntrarSeccion('#clientes', () => { if (clientesDomSucio) pintarClientesDom(); });
        document.getElementById('searchClientModal')?.addEventListener('show.bs.modal', () => { if (clientesDomSucio) pintarClientesDom(); });

        const renderClients = (snapshot) => {
            localClientsMap.clear();
            localClientsMap.set("Cliente General", { id: null, celular: "", direccion: "", nombre: "Cliente General", cedula: "" });
            snapshot.forEach(docSnap => {
                const d = docSnap.data();
                if (d.tenantId && d.tenantId !== 'boutique') return;
                const id = docSnap.id;
                const dataListValue = d.cedula ? `${d.cedula} - ${d.nombre}` : d.nombre;
                localClientsMap.set(dataListValue, { id: id, celular: d.celular || "", direccion: d.direccion || "", nombre: d.nombre || "", cedula: d.cedula || "" });
                localClientsMap.set(id, d);
            });
            ultimoSnapClientes = snapshot;
            clientesDomSucio = true;
            if (clientesVisibles()) pintarClientesDom();
            document.dispatchEvent(new CustomEvent('clientsLoaded', { detail: { clientsMap: localClientsMap } }));
            window.fillClientInfoSales();
        };

        window.fillClientInfoSales = function() {
            if (!ventaClienteInput || !ventaCelularInput || !ventaDireccionInput) return;
            const selectedValue = ventaClienteInput.value;
            const clientInfo = localClientsMap.get(selectedValue);
            if (clientInfo) {
                ventaCelularInput.value = clientInfo.celular;
                ventaDireccionInput.value = clientInfo.direccion;
                if (ventaCedulaInput) ventaCedulaInput.value = clientInfo.cedula || "";
            } else {
                ventaCelularInput.value = "";
                ventaDireccionInput.value = "";
                if (ventaCedulaInput) ventaCedulaInput.value = "";
            }
        }
        
        onSnapshot(query(clientsCollection, orderBy('nombre')), (s) => { renderClients(s); clientsSubscribers.forEach(cb => { try { cb(s); } catch (e) { console.error('Error en suscriptor de clientes:', e); } }); }, (e) => { console.error("Error clients:", e); if(clientListTable) clientListTable.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error.</td></tr>';});
        if (ventaClienteInput) ventaClienteInput.addEventListener('input', window.fillClientInfoSales);
        if (addForm && addClientModalInstance) addForm.addEventListener('submit', async (e) => { e.preventDefault(); const ced = addCedulaInput.value.trim(); const nom = addNombreInput.value.trim(); const cel = addCelularInput.value.trim(); const dir = addDireccionInput.value.trim(); if (nom && cel) { try { await addDoc(clientsCollection, { nombre: nom, cedula: ced, celular: cel, direccion: dir, ultimaCompra: null }); showToast("Cliente guardado!"); addClientModalInstance.hide(); addForm.reset(); } catch (err) { console.error("Err add client:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast('Nombre y Celular requeridos.', 'warning'); } });
        if (editForm && editClientModalInstance) editForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = editIdInput.value; const ced = editCedulaInput.value.trim(); const nom = editNombreInput.value.trim(); const cel = editCelularInput.value.trim(); const dir = editDireccionInput.value.trim(); if (id && nom && cel) { try { await updateDoc(doc(db, "clientes", id), { nombre: nom, cedula: ced, celular: cel, direccion: dir }); showToast("Cliente actualizado!"); editClientModalInstance.hide(); } catch (err) { console.error("Err update client:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast('Nombre y Celular requeridos.', 'warning'); }});
        if (clientListTable) clientListTable.addEventListener('click', async (e) => { const target = e.target.closest('button'); if (!target) return; e.preventDefault(); const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.client-name'); if (!id || !nameTd) return;
            if (target.classList.contains('btn-client-history')) {
                await mostrarHistorialCliente(target.dataset.clientName, target.dataset.clientCelular);
            } else if (target.classList.contains('btn-delete-client')) {
                const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'clientes'; deleteItemNameEl.textContent = `Cliente: ${nameTd.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
            } else if (target.classList.contains('btn-edit-client')) {
                 const clientData = localClientsMap.get(id); if (clientData && editClientModalInstance && editIdInput && editCedulaInput && editNombreInput && editCelularInput && editDireccionInput) { editIdInput.value = id; editCedulaInput.value = clientData.cedula || ''; editNombreInput.value = clientData.nombre || ''; editCelularInput.value = clientData.celular || ''; editDireccionInput.value = clientData.direccion || ''; editClientModalInstance.show(); } else { console.error("Edit client modal or data missing"); showToast("Error al abrir editor.", 'error'); }
            }
        });

        // ✅ FUNCIÓN: Mostrar Historial de Compras del Cliente
        async function mostrarHistorialCliente(clienteNombre, clienteCelular) {
            console.log('📊 Abriendo historial para:', clienteNombre);

            // Abrir modal
            const clientHistoryModal = new bootstrap.Modal(document.getElementById('clientHistoryModal'));
            clientHistoryModal.show();

            // Actualizar nombre en el header
            document.getElementById('client-history-name').textContent = clienteNombre;

            // Mostrar loading
            const historyList = document.getElementById('client-history-list');
            historyList.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div></td></tr>';

            try {
                // Consultar ventas del cliente (por nombre o celular)
                const ventasQuery = query(
                    salesCollection,
                    where('clienteNombre', '==', clienteNombre)
                );
                const ventasSnapshot = await getDocs(ventasQuery);

                console.log(`📦 Ventas encontradas: ${ventasSnapshot.size}`);

                if (ventasSnapshot.empty) {
                    historyList.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size: 2rem;"></i><p class="mt-2">Este cliente no tiene compras registradas</p></td></tr>';

                    // Resetear estadísticas
                    document.getElementById('client-total-spent').textContent = '$0';
                    document.getElementById('client-total-purchases').textContent = '0';
                    document.getElementById('client-last-purchase').textContent = '-';
                    document.getElementById('client-avg-ticket').textContent = '$0';
                    return;
                }

                // Procesar ventas
                const ventas = [];
                let totalGastado = 0;
                let fechaUltimaCompra = null;

                ventasSnapshot.forEach(docSnap => {
                    const venta = docSnap.data();
                    ventas.push({
                        id: docSnap.id,
                        ...venta
                    });
                    totalGastado += venta.totalVenta || 0;

                    const fechaVenta = venta.timestamp?.toDate ? venta.timestamp.toDate() : null;
                    if (fechaVenta && (!fechaUltimaCompra || fechaVenta > fechaUltimaCompra)) {
                        fechaUltimaCompra = fechaVenta;
                    }
                });

                // Ordenar por fecha descendente
                ventas.sort((a, b) => {
                    const fechaA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
                    const fechaB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
                    return fechaB - fechaA;
                });

                // Actualizar estadísticas
                const totalCompras = ventas.length;
                const ticketPromedio = totalCompras > 0 ? totalGastado / totalCompras : 0;

                document.getElementById('client-total-spent').textContent = formatoMoneda.format(totalGastado);
                document.getElementById('client-total-purchases').textContent = totalCompras;
                document.getElementById('client-last-purchase').textContent = fechaUltimaCompra ? fechaUltimaCompra.toLocaleDateString('es-CO') : '-';
                document.getElementById('client-avg-ticket').textContent = formatoMoneda.format(ticketPromedio);

                // Renderizar tabla
                historyList.innerHTML = '';
                ventas.forEach(venta => {
                    const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleDateString('es-CO') : '-';
                    const productos = venta.items?.length || 0;
                    const productosTexto = productos === 1 ? '1 producto' : `${productos} productos`;

                    let metodoPago = '';
                    if (venta.pagoEfectivo > 0 && venta.pagoTransferencia > 0) {
                        metodoPago = 'Mixto';
                    } else if (venta.pagoEfectivo > 0) {
                        metodoPago = 'Efectivo';
                    } else {
                        metodoPago = 'Transferencia';
                    }

                    const estado = venta.estado || 'Completada';
                    let estadoBadge = 'bg-success';
                    if (estado === 'Pendiente') estadoBadge = 'bg-warning';
                    if (estado === 'Cancelada') estadoBadge = 'bg-danger';

                    const tipoVenta = venta.tipoVenta || 'detal';
                    let tipoTexto = '';
                    if (tipoVenta === 'detal') tipoTexto = '<span class="badge bg-primary">Detal</span>';
                    else if (tipoVenta === 'mayor') tipoTexto = '<span class="badge bg-info">Mayor</span>';
                    else if (tipoVenta === 'apartado') tipoTexto = '<span class="badge bg-warning">Apartado</span>';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${fecha}</td>
                        <td>${productosTexto}</td>
                        <td class="fw-bold">${formatoMoneda.format(venta.totalVenta || 0)}</td>
                        <td>${metodoPago}</td>
                        <td><span class="badge ${estadoBadge}">${estado}</span></td>
                        <td>${tipoTexto}</td>
                    `;
                    historyList.appendChild(tr);
                });

                console.log('✅ Historial cargado exitosamente');

            } catch (error) {
                console.error('❌ Error al cargar historial:', error);
                historyList.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i><p class="mt-2">Error al cargar historial</p></td></tr>';
                showToast('Error al cargar historial del cliente', 'error');
            }
        }
        if (searchInput) searchInput.addEventListener('input', (e) => { const searchTerm = e.target.value.toLowerCase(); const items = searchModalList.querySelectorAll('.client-search-item'); items.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? '' : 'none'; }); });
        if (searchModalList && searchClientModalInstance) searchModalList.addEventListener('click', (e) => { const target = e.target.closest('.client-search-item'); if (target) { ventaClienteInput.value = target.dataset.name; window.fillClientInfoSales(); searchClientModalInstance.hide(); } });
        window.fillClientInfoSales();
    })();

    // ========================================================================
    // --- LÓGICA REPARTIDORES (Add/Load/Delete, Edit placeholder, Liquidación) ---
    // ========================================================================
    (() => {
         const repartidorForm = document.getElementById('form-add-repartidor'); const nombreInput = document.getElementById('new-repartidor-nombre'); const celularInput = document.getElementById('new-repartidor-celular'); const repartidorListTableBody = document.getElementById('lista-repartidores'); const repartidorSelectVenta = document.getElementById('venta-repartidor'); const repartidorSelectHistory = document.getElementById('history-repartidor');
         if(!repartidorForm || !repartidorListTableBody) { console.warn("Elementos de Repartidores no encontrados."); return; }
         
         // ✅ Calcular estadísticas de repartidores desde las ventas
         async function calcularEstadisticasRepartidores() {
             const hoy = new Date();
             hoy.setHours(0, 0, 0, 0);
             const manana = new Date(hoy);
             manana.setDate(manana.getDate() + 1);

             // Query simplificada sin índice compuesto
             const q = query(
                 salesCollection,
                 where('timestamp', '>=', hoy),
                 where('timestamp', '<', manana)
             );

             const ventasSnap = await getDocs(q);
             const estadisticas = new Map();

             ventasSnap.forEach(docSnap => {
                 const venta = docSnap.data();

                 // Filtrar en memoria en lugar de en la query
                 if (venta.tipoEntrega !== 'domicilio' || venta.estado === 'Anulada' || !venta.repartidorId) {
                     return;
                 }

                 const repartidorId = venta.repartidorId;

                 if (!estadisticas.has(repartidorId)) {
                     estadisticas.set(repartidorId, {
                         entregas: 0,
                         efectivoRecibido: 0,
                         rutasTotal: 0,
                         rutasCash: 0  // Rutas pagadas en efectivo
                     });
                 }

                 const stats = estadisticas.get(repartidorId);
                 stats.entregas++;
                 stats.efectivoRecibido += venta.pagoEfectivo || 0;
                 stats.rutasTotal += venta.costoRuta || 0;

                 // Si el cliente pagó en efectivo, el repartidor se queda con el costo de ruta
                 if (venta.pagoEfectivo > 0) {
                     stats.rutasCash += venta.costoRuta || 0;
                 }
             });

             return estadisticas;
         }

         // ✅ Renderizar repartidores con cálculos reales
         const renderRepartidores = async (snapshot) => {
             // Avisar de inmediato a los suscriptores ligeros (dashboard,
             // reportes, historial) sin esperar a los cálculos async de abajo
             // (liquidaciones, estadísticas de ventas).
             ultimoSnapshotRepartidores = snapshot;
             repartidoresSubscribers.forEach(cb => {
                 try { cb(snapshot); } catch (e) { console.error('Error en suscriptor de repartidores:', e); }
             });

             repartidoresMap.clear();
             if(repartidorListTableBody) repartidorListTableBody.innerHTML = '';
             if(repartidorSelectVenta) repartidorSelectVenta.innerHTML = '<option value="">Selecciona...</option>';
             if(repartidorSelectHistory) repartidorSelectHistory.innerHTML = '<option value="">Todos</option>';

             if (snapshot.empty) {
                 if(repartidorListTableBody) repartidorListTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No hay repartidores.</td></tr>';
                 return;
             }

             const estadisticas = await calcularEstadisticasRepartidores();

             // ✅ Obtener liquidaciones del día para verificar si ya se liquidó
             const hoy = new Date();
             hoy.setHours(0, 0, 0, 0);
             const manana = new Date(hoy);
             manana.setDate(manana.getDate() + 1);

             const liquidacionesCollection = collection(db, 'liquidaciones');
             const liquidacionesQuery = query(
                 liquidacionesCollection,
                 where('fecha', '>=', hoy),
                 where('fecha', '<', manana)
             );
             const liquidacionesSnap = await getDocs(liquidacionesQuery);
             const liquidacionesMap = new Map();
             liquidacionesSnap.forEach(doc => {
                 const liq = doc.data();
                 liquidacionesMap.set(liq.repartidorId, liq.efectivoEntregado || 0);
             });

             snapshot.forEach(docSnap => {
                 const rep = docSnap.data();
                 const id = docSnap.id;
                 repartidoresMap.set(id, rep);

                 if (repartidorListTableBody) {
                     const stats = estadisticas.get(id) || {
                         entregas: 0,
                         efectivoRecibido: 0,
                         rutasTotal: 0,
                         rutasCash: 0
                     };

                     // Lógica de cálculo:
                     // - Efectivo recibido: Todo el efectivo que el repartidor cobró
                     // - Rutas Total: Suma de todos los costos de ruta
                     // - Rutas Transfer: Rutas de pedidos pagados por transferencia
                     // - Efectivo a entregar: Efectivo recibido - Rutas en efectivo (lo que el repartidor se queda)
                     const efectivoRecibido = stats.efectivoRecibido;
                     const rutasTotal = stats.rutasTotal;
                     const rutasTransf = rutasTotal - stats.rutasCash;  // Rutas de pedidos pagados por transferencia
                     const efectivoAEntregar = efectivoRecibido - stats.rutasCash;  // El repartidor se queda con las rutas en cash
                     const efectivoYaEntregado = liquidacionesMap.get(id) || 0;  // Verificar si ya liquidó hoy
                     const saldoPendiente = efectivoAEntregar - efectivoYaEntregado;  // Restar lo ya liquidado

                     const yaLiquidado = efectivoYaEntregado > 0;
                     const tr = document.createElement('tr');
                     tr.dataset.id = id;
                     tr.innerHTML = `<td class="repartidor-name">${rep.nombre}</td>
                         <td>${stats.entregas}</td>
                         <td>${formatoMoneda.format(efectivoRecibido)}</td>
                         <td>${formatoMoneda.format(rutasTotal)}</td>
                         <td>${formatoMoneda.format(rutasTransf)}</td>
                         <td class="fw-bold">${formatoMoneda.format(efectivoAEntregar)}</td>
                         <td><input type="number" class="form-control form-control-sm w-75 d-inline-block input-efectivo-entregado"
                                    value="${efectivoYaEntregado.toFixed(2)}" step="0.01" data-expected="${efectivoAEntregar}" ${yaLiquidado ? 'disabled' : ''}></td>
                         <td class="saldo-pendiente ${saldoPendiente <= 0 ? 'text-success' : 'text-danger'} fw-bold">${formatoMoneda.format(saldoPendiente)}</td>
                         <td class="action-buttons">
                             <button class="btn btn-action btn-action-success btn-liquidar-repartidor" ${yaLiquidado ? 'disabled' : ''}>
                                 <i class="bi bi-cash-coin"></i><span class="btn-action-text">${yaLiquidado ? 'Liquidado' : 'Liquidar'}</span>
                             </button>
                             <button class="btn btn-action btn-action-edit btn-edit-repartidor">
                                 <i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span>
                             </button>
                             <button class="btn btn-action btn-action-delete btn-delete-repartidor">
                                 <i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span>
                             </button>
                         </td>`;
                     repartidorListTableBody.appendChild(tr);
                 }

                 const option = document.createElement('option');
                 option.value = id;
                 option.textContent = rep.nombre;
                 if(repartidorSelectVenta) repartidorSelectVenta.appendChild(option.cloneNode(true));
                 if(repartidorSelectHistory) repartidorSelectHistory.appendChild(option.cloneNode(true));
             });
         };
         onSnapshot(query(repartidoresCollection, orderBy('nombre')), renderRepartidores, (e) => { console.error("Error repartidores:", e); if(repartidorListTableBody) repartidorListTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error.</td></tr>';});
         if (repartidorForm && addRepartidorModalInstance) repartidorForm.addEventListener('submit', async (e) => { e.preventDefault(); const nom = nombreInput.value.trim(); const cel = celularInput.value.trim(); if (nom && cel) { try { await addDoc(repartidoresCollection, { nombre: nom, celular: cel }); showToast("Repartidor guardado!"); addRepartidorModalInstance.hide(); repartidorForm.reset(); } catch (err) { console.error("Err add repartidor:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast('Nombre y Celular requeridos.', 'warning'); } });
         const confirmLiquidateBtn = document.getElementById('confirm-liquidate-btn');
         if(confirmLiquidateBtn && liquidateConfirmModalInstance) {
             confirmLiquidateBtn.addEventListener('click', async (e) => {
                 e.preventDefault();
                 const repartidorId = confirmLiquidateBtn.dataset.liquidateId;
                 const tr = repartidorListTableBody.querySelector(`tr[data-id="${repartidorId}"]`);

                 if (!tr) return;

                 const repartidorNombre = tr.querySelector('.repartidor-name')?.textContent || '';
                 const efectivoEntregadoInput = tr.querySelector('.input-efectivo-entregado');
                 const efectivoEntregado = parseFloat(efectivoEntregadoInput.value) || 0;
                 const efectivoEsperado = parseFloat(efectivoEntregadoInput.dataset.expected) || 0;
                 const diferencia = efectivoEsperado - efectivoEntregado;

                 try {
                     // Obtener ventas del día para este repartidor
                     const hoy = new Date();
                     hoy.setHours(0, 0, 0, 0);
                     const manana = new Date(hoy);
                     manana.setDate(manana.getDate() + 1);

                     // Query solo por timestamp (sin índice compuesto)
                     const ventasQuery = query(
                         salesCollection,
                         where('timestamp', '>=', hoy),
                         where('timestamp', '<', manana)
                     );

                     const ventasSnap = await getDocs(ventasQuery);
                     const ventasIds = [];
                     let totalEfectivo = 0;
                     let totalRutas = 0;

                     // Filtrar por repartidorId en JavaScript
                     ventasSnap.forEach(doc => {
                         const venta = doc.data();
                         if (venta.repartidorId === repartidorId) {
                             ventasIds.push(doc.id);
                             totalEfectivo += venta.pagoEfectivo || 0;
                             totalRutas += venta.costoRuta || 0;
                         }
                     });

                     // Crear registro de liquidación
                     const liquidacionesCollection = collection(db, 'liquidaciones');
                     await addDoc(liquidacionesCollection, {
                         repartidorId: repartidorId,
                         repartidorNombre: repartidorNombre,
                         fecha: serverTimestamp(),
                         efectivoRecibido: totalEfectivo,
                         rutasTotal: totalRutas,
                         efectivoEsperado: efectivoEsperado,
                         efectivoEntregado: efectivoEntregado,
                         diferencia: diferencia,
                         ventasIds: ventasIds,
                         cantidadVentas: ventasIds.length
                     });

                     // 🔥 IMPORTANTE: Agregar el efectivo recibido a finanzas
                     if (efectivoEntregado > 0) {
                         await addDoc(financesCollection, {
                             tipo: 'ingreso',
                             monto: efectivoEntregado,
                             metodoPago: 'efectivo',
                             descripcion: `Liquidación ${repartidorNombre} - ${ventasIds.length} domicilios`,
                             timestamp: serverTimestamp()
                         });
                     }

                     showToast('Liquidación registrada y efectivo agregado a finanzas', 'success');
                     liquidateConfirmModalInstance.hide();

                     // Deshabilitar botones
                     efectivoEntregadoInput.disabled = true;
                     tr.querySelector('.btn-liquidar-repartidor').disabled = true;

                 } catch (error) {
                     console.error("Error al liquidar:", error);
                     showToast('Error al registrar liquidación', 'error');
                 }
             });
         }
        if (repartidorListTableBody) { repartidorListTableBody.addEventListener('click', (e) => { const target = e.target.closest('button'); if (!target) return; e.preventDefault(); const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.repartidor-name'); if (!id || !nameTd) return;
            if (target.classList.contains('btn-delete-repartidor')) {
                const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'repartidores'; deleteItemNameEl.textContent = `Repartidor: ${nameTd.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
            } else if (target.classList.contains('btn-edit-repartidor')) { showToast('Editar repartidor: pendiente.', 'warning'); } 
            else if (target.classList.contains('btn-liquidar-repartidor')) {
                const entregadoInput = tr.querySelector('.input-efectivo-entregado'); const saldoTd = tr.querySelector('.saldo-pendiente'); const efectivoEntregado = parseFloat(entregadoInput.value) || 0; const saldoPendiente = parseFloat(saldoTd.textContent.replace(/[$.]/g, '')) || 0;
                const amountEl = document.getElementById('liquidate-amount'); const nameEl = document.getElementById('liquidate-name'); const saldoTextEl = document.getElementById('liquidate-saldo-text');
                if (liquidateConfirmModalInstance && amountEl && nameEl && saldoTextEl && confirmLiquidateBtn) { amountEl.textContent = formatoMoneda.format(efectivoEntregado); nameEl.textContent = nameTd.textContent; saldoTextEl.textContent = `Saldo restante: ${formatoMoneda.format(saldoPendiente)}`; saldoTextEl.className = saldoPendiente <= 0 ? 'fw-bold text-success' : 'fw-bold text-danger'; confirmLiquidateBtn.dataset.liquidateId = id; liquidateConfirmModalInstance.show(); } else { console.error("Faltan elementos del modal de liquidación"); }
            }
         }); repartidorListTableBody.addEventListener('input', (e) => { if (e.target.classList.contains('input-efectivo-entregado')) { const input = e.target; const tr = input.closest('tr'); const saldoTd = tr.querySelector('.saldo-pendiente'); const efectivoEntregado = parseFloat(input.value) || 0; const efectivoEsperado = parseFloat(input.dataset.expected) || 0; const diferencia = efectivoEsperado - efectivoEntregado; saldoTd.textContent = formatoMoneda.format(diferencia); saldoTd.className = `saldo-pendiente ${diferencia <= 0 ? 'text-success' : 'text-danger'} fw-bold`; } }); }
    })();

    // ========================================================================
    // --- LÓGICA PRODUCTOS (NUEVA LÓGICA DE BÚSQUEDA) ---
    // ========================================================================
    (() => {
        const productForm = document.getElementById('form-producto'); const productIdInput = document.getElementById('producto-id'); const nombreInput = document.getElementById('nombre'); const codigoInput = document.getElementById('codigo'); const codigoBarrasInput = document.getElementById('codigo-barras'); const proveedorInput = document.getElementById('proveedor-producto'); const descripcionInput = document.getElementById('descripcion'); const categoriaSelect = document.getElementById('categoria-producto'); const costoInput = document.getElementById('costo-compra'); const detalInput = document.getElementById('precio-detal'); const mayorInput = document.getElementById('precio-mayor'); const variationsContainer = document.getElementById('variaciones-container'); const imagenInput = document.getElementById('imagen'); const visibleCheckbox = document.getElementById('visibilidad'); const bajoEncargoCheckbox = document.getElementById('bajo-encargo'); const grupoMayoristaSelect = document.getElementById('grupo-mayorista'); const productListTableBody = document.getElementById('lista-inventario-productos'); const clearFormBtn = document.getElementById('btn-clear-product-form');
        const saveProductBtn = document.getElementById('btn-save-product');
        const saveProductBtnText = saveProductBtn ? saveProductBtn.querySelector('.save-text') : null;
        const saveProductBtnSpinner = saveProductBtn ? saveProductBtn.querySelector('.spinner-border') : null;
        const productSearchModalList = document.getElementById('product-modal-list');
        const productSearchInput = document.getElementById('product-modal-search');

        // Hacer categoriesMap global para que otros módulos puedan acceder
        if (!window.categoriesMap) {
            window.categoriesMap = new Map();
        }
        let categoriesMap = window.categoriesMap;

        if (!productForm) { console.warn("Formulario de producto no encontrado."); return; }

        const vC=document.getElementById('variaciones-container'); const aVB=document.getElementById('add-variation-btn'); const vT=document.getElementById('variation-template'); 
        function aVR(){ if(!vT || !vC) return; const nR=vT.cloneNode(true);nR.classList.remove('d-none');nR.removeAttribute('id');const rB=nR.querySelector('.remove-variation-btn');rB.addEventListener('click',(e)=>{ e.preventDefault(); nR.remove(); if(vC.querySelectorAll('.variation-row:not(#variation-template):not(.d-none)').length===0){aVR();}});vC.appendChild(nR);} 
        if(aVB)aVB.addEventListener('click',(e) => { e.preventDefault(); aVR(); }); 
        if(vC && vC.querySelectorAll('.variation-row:not(#variation-template):not(.d-none)').length===0){aVR();}
        
        const cI=document.getElementById('costo-compra'); const pDI=document.getElementById('precio-detal'); const pMI=document.getElementById('precio-mayor'); const mDI=document.getElementById('margen-detal-info'); const mMI=document.getElementById('margen-mayor-info'); const fM_margin=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0}); function cYM(){ if(!cI || !pDI || !pMI || !mDI || !mMI) return; const c=parseFloat(eliminarFormatoNumero(cI.value))||0; const pD=parseFloat(eliminarFormatoNumero(pDI.value))||0; const pM=parseFloat(eliminarFormatoNumero(pMI.value))||0; let mDV=0,mDP=0;if(c>0&&pD>=c){mDV=pD-c;mDP=(mDV/c)*100;mDI.textContent=`Margen: ${fM_margin.format(mDV)} (${mDP.toFixed(1)}%)`;mDI.style.color='';mDI.style.fontWeight='';}else{mDI.textContent='Margen: $0 (0.0%)';mDI.style.color=(pD>0&&pD<c)?'red':'';mDI.style.fontWeight=(pD>0&&pD<c)?'bold':'';if(pD>0&&pD<c)mDI.textContent='Margen Negativo';} let mMV=0,mMP=0;if(c>0&&pM>=c){mMV=pM-c;mMP=(mMV/c)*100;mMI.textContent=`Margen: ${fM_margin.format(mMV)} (${mMP.toFixed(1)}%)`;mMI.style.color='';mMI.style.fontWeight='';}else{mMI.textContent='Margen: $0 (0.0%)';mMI.style.color=(pM>0&&pM<c)?'red':'';mMI.style.fontWeight=(pM>0&&pM<c)?'bold':'';if(pM>0&&pM<c)mMI.textContent='Margen Negativo';}} if(cI)cI.addEventListener('input',cYM); if(pDI)pDI.addEventListener('input',cYM); if(pMI)pMI.addEventListener('input',cYM); if(cI) cYM();
        
        // La tabla de Productos (filas + un <svg> de código de barras generado
        // por cada producto que lo tenga) y la lista del buscador del punto de
        // venta (una tarjeta con imagen por producto, hasta cientos) son lo
        // más caro de construir de todo el arranque de la app. Antes las dos
        // se reconstruían por completo en CADA snapshot de productos —una
        // venta que baja stock dispara uno— aunque ni la pestaña Productos ni
        // el buscador estuvieran abiertos; con un catálogo de varios cientos
        // de productos y ventas frecuentes durante un turno, esa reconstrucción
        // constante de cientos de nodos con imagen era presión real de
        // memoria en el celular. Ahora solo se marca "sucio" al llegar un
        // snapshot nuevo, y cada una se reconstruye recién cuando el usuario
        // realmente la abre (alEntrarSeccion / show.bs.modal más abajo).
        let productosTablaSucia = false;
        let productSearchModalSucia = true; // true al inicio: aún no se ha construido nunca
        const searchProductModalEl = document.getElementById('searchProductModal');

        const renderProducts = (snapshot) => {
            // Primero el mapa (doc.data() convierte cada documento, y es caro:
            // se hace UNA vez por producto) y después los suscriptores
            // (dashboard), que leen localProductsMap en vez de volver a
            // convertir los 541 documentos.
            localProductsMap.clear();
            snapshot.forEach(docSnap => {
                localProductsMap.set(docSnap.id, docSnap.data());
            });
            productsSubscribers.forEach(cb => {
                try { cb(snapshot); } catch (e) { console.error('Error en suscriptor de productos:', e); }
            });

            // (El filtro de categorías de esta pestaña ya no se copia del
            // desplegable del formulario aquí: si los productos llegaban antes
            // que las categorías, copiaba un desplegable vacío y el filtro se
            // quedaba solo con "Selecciona...". Ahora lo llena
            // loadCategoriesForFilter, más abajo.)

            if(!productListTableBody) return;

            window.dispatchEvent(new CustomEvent('admin:productos-actualizados'));

            // Buscador del punto de venta: si por casualidad ya está abierto
            // cuando llega este snapshot (p. ej. una venta concurrente baja
            // stock de un producto listado), se repinta de una vez para que
            // no se quede desactualizado; si no, se deja pendiente.
            productSearchModalSucia = true;
            programarPintadoModalBusqueda();

            // Pestaña Productos visible ahora mismo: pintar la tabla de una
            // vez. Si no, dejarla pendiente para cuando se entre a ella.
            if ((window.location.hash || '#dashboard') === '#productos') {
                pintarTablaProductos();
            } else {
                productosTablaSucia = true;
            }
        };

        // Reconstruye la lista del buscador de productos del punto de venta
        // (modal "Buscar producto" al registrar una venta) a partir de
        // localProductsMap, ya poblado por renderProducts().
        // Con el modal abierto, varios snapshots seguidos (p. ej. una venta
        // que toca varios productos) se agrupan en un solo repintado. Con el
        // modal cerrado, la lista se prepara en segundo plano y POR PARTES
        // (en los ratos libres del navegador), así abrirla es inmediato y
        // prepararla no congela la pantalla: antes era un solo bloque de
        // ~0,5 s en un celular.
        let pintadoModalTimer = null;
        let construccionModal = null; // { completar() } mientras se arma por partes
        function programarPintadoModalBusqueda() {
            clearTimeout(pintadoModalTimer);
            if (searchProductModalEl?.classList.contains('show')) {
                pintadoModalTimer = setTimeout(pintarModalBusquedaProductos, 400);
            } else {
                pintadoModalTimer = setTimeout(() => {
                    if (productSearchModalSucia) pintarModalBusquedaProductos({ porPartes: true });
                }, 1500);
            }
        }

        const escBusqueda = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const IMG_DEFECTO_BUSQUEDA = 'https://placehold.co/70x90.png?text=Sin+Foto';
        function htmlItemBusqueda(id, d) {
            const stockTotal = obtenerStockTotalProducto(d);
            const categoria = (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map)
                ? (categoriesMap.get(d.categoriaId) || 'Sin Categoría') : 'Sin Categoría';
            const agotado = stockTotal <= 0;
            return `<li class="list-group-item list-group-item-action product-search-item${agotado ? ' disabled' : ''}"${agotado ? ' style="opacity:0.5;cursor:not-allowed"' : ''}
                data-product-id="${escBusqueda(id)}" data-product-name="${escBusqueda((d.nombre || '').toLowerCase())}"
                data-product-code="${escBusqueda((d.codigo || '').toLowerCase())}" data-categoria="${escBusqueda(d.categoriaId || '')}"
                data-stock="${stockTotal}" data-visible="${d.visible ? 'true' : 'false'}" data-precio-original="${d.precioDetal || 0}"
                data-total-sales="${window.productSalesCount.get(id) || 0}">
                <div class="pm-product-item">
                    <img src="${escBusqueda(urlMiniatura(d) || IMG_DEFECTO_BUSQUEDA)}" alt="${escBusqueda(d.nombre)}" class="product-search-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${IMG_DEFECTO_BUSQUEDA}'">
                    <div class="pm-product-body">
                        <div class="product-search-name">${escBusqueda(d.nombre)}</div>
                        <div class="pm-product-meta">
                            <span class="pm-product-cat">${escBusqueda(categoria)}</span>
                            ${d.codigo ? `<span class="pm-product-code"># ${escBusqueda(d.codigo)}</span>` : ''}
                        </div>
                        <div class="pm-product-footer">
                            <div class="price-info" data-precio-detal="${d.precioDetal || 0}" data-precio-mayor="${d.precioMayor || 0}">${formatoMoneda.format(d.precioDetal || 0)}</div>
                            ${d.precioMayor ? `<div class="pm-price-mayor text-muted" style="font-size:0.72rem;">Mayor: ${formatoMoneda.format(d.precioMayor)}</div>` : ''}
                            <div class="stock-info">Stock: ${stockTotal}</div>
                        </div>
                    </div>
                </div>
            </li>`;
        }

        // Reconstruye la lista del buscador a partir de localProductsMap.
        // porPartes: en segundo plano, de a ~6 ms por vez; si el modal se
        // abre a mitad de camino, completar() termina en el momento.
        function pintarModalBusquedaProductos({ porPartes = false } = {}) {
            if (!productSearchModalList) return;
            clearTimeout(pintadoModalTimer);
            construccionModal?.cancelar();
            const entradas = [...localProductsMap];
            const partes = [];
            let i = 0;
            const terminar = () => {
                const scrollPrevio = productSearchModalList.scrollTop; // .pm-list es la que hace scroll
                productSearchModalList.innerHTML = partes.join('');
                if (typeof applyProductModalFilters === 'function') applyProductModalFilters();
                productSearchModalList.scrollTop = scrollPrevio;
                productSearchModalSucia = false;
                construccionModal = null;
            };
            if (!porPartes) {
                for (; i < entradas.length; i++) partes.push(htmlItemBusqueda(...entradas[i]));
                terminar();
                return;
            }
            let cancelado = false, idle = null;
            const programar = (fn) => ('requestIdleCallback' in window)
                ? (idle = requestIdleCallback(fn, { timeout: 3000 }))
                : (idle = setTimeout(() => fn(null), 16));
            const paso = (deadline) => {
                if (cancelado) return;
                const hasta = performance.now() + 6;
                while (i < entradas.length && (deadline ? deadline.timeRemaining() > 1 : performance.now() < hasta)) {
                    partes.push(htmlItemBusqueda(...entradas[i++]));
                }
                if (i < entradas.length) programar(paso); else terminar();
            };
            construccionModal = {
                cancelar() { cancelado = true; if ('cancelIdleCallback' in window) cancelIdleCallback(idle); clearTimeout(idle); construccionModal = null; },
                completar() {
                    cancelado = true;
                    if ('cancelIdleCallback' in window) cancelIdleCallback(idle);
                    clearTimeout(idle);
                    for (; i < entradas.length; i++) partes.push(htmlItemBusqueda(...entradas[i]));
                    terminar();
                },
            };
            programar(paso);
        }

        if (searchProductModalEl) {
            searchProductModalEl.addEventListener('show.bs.modal', () => {
                if (construccionModal) construccionModal.completar();
                else if (productSearchModalSucia) pintarModalBusquedaProductos();
                // Primera apertura: se pinta ya con el orden por stock y,
                // cuando terminen de llegar las ventas, se reordena por
                // más vendidos.
                // Cuando llegan, solo se actualiza el dato y se reordena (antes
                // se reconstruía toda la lista con el modal abierto).
                if (!productSalesPromise) asegurarVentasPorProducto().then(() => {
                    productSearchModalList?.querySelectorAll('.product-search-item').forEach(li => {
                        li.dataset.totalSales = window.productSalesCount.get(li.dataset.productId) || 0;
                    });
                    applyProductModalFilters();
                });
            });
        }

        // ── Copiar disponibilidad (texto listo para WhatsApp) ──
        // Nombre, precio (con promoción si está activa) y los colores con
        // stock, cada uno con sus tallas. Lo agotado nunca se copia.
        function textoDisponibilidadProducto(d) {
            const porColor = new Map();
            (d.variaciones || []).forEach(v => {
                if ((parseInt(v.stock, 10) || 0) <= 0) return;
                const nombreColor = normalizeColor(v.color);
                const color = nombreColor ? nombreColor.charAt(0).toUpperCase() + nombreColor.slice(1) : 'Único';
                const talla = normalizeTalla(v.talla);
                const tallas = porColor.get(color) || [];
                if (talla && !['única', 'unica'].includes(talla.toLowerCase()) && !tallas.includes(talla)) tallas.push(talla);
                porColor.set(color, tallas);
            });
            if (!porColor.size) return '';

            const precio = d.precioDetal || 0;
            let precioTexto = formatoMoneda.format(precio);
            if (d.promocion?.activa) {
                const promo = d.promocion.tipo === 'porcentaje'
                    ? precio * (1 - (parseFloat(d.promocion.descuento) || 0) / 100)
                    : (parseFloat(d.promocion.precioFijo) || 0);
                if (promo > 0 && promo < precio) precioTexto = `~${formatoMoneda.format(precio)}~ ${formatoMoneda.format(promo)}`;
            }
            const lineas = [...porColor].map(([color, tallas]) =>
                `   • ${color}${tallas.length ? `: ${tallas.join(', ')}` : ''}`);
            return `🛍️ *${d.nombre || 'Producto'}* — ${precioTexto}\nDisponible:\n${lineas.join('\n')}`;
        }

        async function copiarTextoAlPortapapeles(texto) {
            try {
                if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
            } catch (_) { /* respaldo abajo */ }
            const ta = document.createElement('textarea');
            ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }

        // Reconstruye la tabla de inventario (filas + códigos de barras) a
        // partir de localProductsMap, ya poblado por renderProducts().
        async function pintarTablaProductos() {
            if (!productListTableBody) return;
            productListTableBody.innerHTML = '';
            const emptyRow = document.getElementById('empty-inventory-row');

            if (localProductsMap.size === 0) {
                if (emptyRow) {
                    emptyRow.innerHTML = '<i class="bi bi-box-seam"></i><strong>Aún no hay productos</strong><span>Crea el primero con el botón Nuevo.</span>';
                    emptyRow.style.display = '';
                    productListTableBody.appendChild(emptyRow);
                }
                productosTablaSucia = false;
                return;
            }
            if (emptyRow) emptyRow.style.display = 'none';

            // Tarjetas con el mismo diseño que Productos de Fábrica: foto,
            // nombre + precio detal, referencia/categoría/proveedor y el stock
            // por talla/color en chips. Toda la tarjeta abre la edición; los
            // botones de la derecha son promo, encargo y eliminar.
            const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const UMBRAL_BAJO = 2;
            let unidadesTotales = 0;
            let bajoStockCount = 0;
            const fragment = document.createDocumentFragment();
            localProductsMap.forEach((d, id) => {
                const stockTotal = obtenerStockTotalProducto(d);
                unidadesTotales += stockTotal;
                if (stockTotal <= UMBRAL_BAJO) bajoStockCount++;
                const estadoStock = stockTotal <= 0 ? 'out' : (stockTotal <= UMBRAL_BAJO ? 'low' : 'ok');

                const variaciones = (d.variaciones || []).slice().sort((x, y) => (parseInt(y.stock, 10) || 0) - (parseInt(x.stock, 10) || 0));
                const conStock = variaciones.filter(v => (parseInt(v.stock, 10) || 0) > 0);
                const agotadas = variaciones.length - conStock.length;
                const MAX_CHIPS = 4;
                const etiquetaVar = (v) => {
                    const talla = normalizeTalla(v.talla);
                    const color = normalizeColor(v.color);
                    return [color, talla && talla.toLowerCase() !== 'única' && talla.toLowerCase() !== 'unica' ? talla : ''].filter(Boolean).join(' ') || 'Única';
                };
                const chips = conStock.slice(0, MAX_CHIPS)
                    .map(v => `<span class="pf-var">${esc(etiquetaVar(v))}<b>${parseInt(v.stock, 10) || 0}</b></span>`).join('')
                    + (conStock.length > MAX_CHIPS ? `<span class="pf-var pf-var--more">+${conStock.length - MAX_CHIPS}</span>` : '')
                    + (agotadas ? `<span class="pf-var is-out">${agotadas} agotado${agotadas === 1 ? '' : 's'}</span>` : '');

                const categoryName = (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map) ? categoriesMap.get(d.categoriaId) : '';
                const hasPromo = d.promocion && d.promocion.activa;
                const promoLabel = hasPromo ? (d.promocion.tipo === 'porcentaje' ? `−${d.promocion.descuento}%` : 'Promo') : '';
                const img = d.imagenUrl
                    ? `<img src="${esc(urlMiniatura(d))}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'bi bi-image'}))">`
                    : `<i class="bi bi-image"></i>`;

                const card = document.createElement('article');
                card.className = 'pf-card btn-edit-product' + (d.visible === false ? ' is-hidden' : '');
                card.dataset.id = id;
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
                card.setAttribute('aria-label', `Editar ${d.nombre || ''}`);
                card.innerHTML = `
                    <div class="pf-thumb">${img}</div>
                    <div class="pf-body">
                        <div class="pf-row">
                            <h3 class="pf-name product-name">${esc(d.nombre || 'Sin nombre')}</h3>
                            <span class="pf-price">${formatoMoneda.format(d.precioDetal || 0)}</span>
                        </div>
                        <div class="pf-meta">
                            <span>${esc(d.codigo || id.substring(0, 6))}</span>
                            ${categoryName ? `<span>${esc(categoryName)}</span>` : ''}
                            ${d.precioMayor ? `<span>Mayor ${formatoMoneda.format(d.precioMayor)}</span>` : ''}
                            ${d.proveedor ? `<span>${esc(d.proveedor)}</span>` : ''}
                            ${d.visible === false ? '<span class="pf-hidden-tag"><i class="bi bi-eye-slash"></i> Oculto</span>' : ''}
                        </div>
                        <div class="pf-vars">
                            ${stockTotal > 0
                                ? `<span class="pf-stock pf-stock--${estadoStock}">${stockTotal} und</span>${chips}`
                                : `<span class="pf-stock pf-stock--out">${variaciones.length ? 'Agotado' : 'Sin variaciones'}</span>`}
                            ${hasPromo ? `<span class="pf-tag pf-tag--promo"><i class="bi bi-tag-fill"></i> ${esc(promoLabel)}</span>` : ''}
                            ${d.bajoEncargo ? '<span class="pf-tag"><i class="bi bi-bag-heart"></i> Encargo</span>' : ''}
                        </div>
                    </div>
                    <div class="pf-actions">
                        <button type="button" class="pf-act btn-manage-promo${hasPromo ? ' is-on' : ''}" title="${hasPromo ? 'Editar promoción' : 'Agregar promoción'}" aria-label="Promoción"><i class="bi bi-tag${hasPromo ? '-fill' : ''}"></i></button>
                        <button type="button" class="pf-act btn-toggle-encargo${d.bajoEncargo ? ' is-on' : ''}" title="${d.bajoEncargo ? 'Quitar de Bajo Encargo' : 'Agregar a Bajo Encargo'}" aria-label="Bajo encargo"><i class="bi bi-bag-heart${d.bajoEncargo ? '-fill' : ''}"></i></button>
                        ${d.codigoBarras ? `<button type="button" class="pf-act btn-ver-barcode" data-product-id="${id}" title="Ver código de barras" aria-label="Código de barras"><i class="bi bi-upc"></i></button>` : ''}
                        ${stockTotal > 0 ? `<button type="button" class="pf-act btn-copiar-disponibilidad" title="Copiar disponibilidad" aria-label="Copiar disponibilidad de ${esc(d.nombre || '')}"><i class="bi bi-copy"></i></button>` : ''}
                        <button type="button" class="pf-act pf-act--del btn-delete-product" title="Eliminar" aria-label="Eliminar ${esc(d.nombre || '')}"><i class="bi bi-trash3"></i></button>
                    </div>`;
                fragment.appendChild(card);
            });
            productListTableBody.appendChild(fragment);
            if (emptyRow) productListTableBody.appendChild(emptyRow);

            const resumenEl = document.getElementById('prod-resumen');
            if (resumenEl) resumenEl.textContent = `${localProductsMap.size} producto${localProductsMap.size === 1 ? '' : 's'} · ${unidadesTotales.toLocaleString('es-CO')} und`;
            const bajoCountEl = document.getElementById('prod-bajo-count');
            if (bajoCountEl) bajoCountEl.textContent = bajoStockCount ? bajoStockCount : '';

            applyInventoryFilters();
            productosTablaSucia = false;
        }

        // Pintar la tabla (si quedó pendiente) cada vez que se entra a la
        // pestaña Productos, sin importar si la navegación vino del rail de
        // escritorio o de la barra inferior móvil.
        alEntrarSeccion('#productos', () => { if (productosTablaSucia) pintarTablaProductos(); });

        // ── Optimizar fotos existentes (miniaturas) ──────────────────────
        // Los productos nuevos o con foto cambiada ya guardan su miniatura al
        // guardarse. Para los que ya existían, un aviso en Productos (solo
        // con permiso productos_editar) genera las que faltan: descarga cada
        // foto, la achica en el navegador, sube la miniatura y guarda los
        // productos de a 25 (pocos repintados de la lista).
        const miniBanner = document.getElementById('miniaturas-banner');
        const miniDetalle = document.getElementById('miniaturas-detalle');
        const miniBtn = document.getElementById('miniaturas-btn');
        let miniEnCurso = false;
        const puedeEditarProductos = () => {
            const ctx = window.appContext;
            if (!ctx) return false;
            return ctx.isSuperAdmin || ctx.permisos?.productos_editar === true;
        };
        const pendientesMiniatura = () => [...localProductsMap].filter(([, p]) => necesitaMiniatura(p));
        function actualizarBannerMiniaturas() {
            if (!miniBanner || miniEnCurso) return;
            const pendientes = puedeEditarProductos() ? pendientesMiniatura().length : 0;
            miniBanner.hidden = pendientes === 0;
            if (pendientes) {
                miniDetalle.textContent = `${pendientes} foto${pendientes === 1 ? '' : 's'} sin versión liviana. Optimizarlas hace que la tienda y el panel carguen mucho más rápido.`;
            }
        }
        window.addEventListener('admin:productos-actualizados', actualizarBannerMiniaturas);
        window.addEventListener('adminAuthReady', actualizarBannerMiniaturas);

        miniBtn?.addEventListener('click', async () => {
            if (miniEnCurso) return;
            const lista = pendientesMiniatura().map(([id, p]) => ({ id, url: p.imagenUrl }));
            if (!lista.length) return;
            const mbAprox = Math.max(1, Math.round(lista.length * 0.5));
            if (!confirm(`Se van a optimizar ${lista.length} fotos. Esto descarga cada foto una vez (~${mbAprox} MB), así que conviene hacerlo con wifi y dejar esta pantalla abierta hasta que termine. ¿Empezar?`)) return;
            miniEnCurso = true;
            miniBtn.disabled = true;
            let hechos = 0, fallos = 0;
            const porGuardar = [];
            const guardar = async () => {
                if (!porGuardar.length) return;
                const batch = writeBatch(db);
                porGuardar.splice(0).forEach(({ id, campos }) => batch.update(doc(db, 'productos', id), campos));
                await batch.commit();
            };
            const pintar = () => {
                miniDetalle.textContent = `Optimizando fotos… ${hechos + fallos} de ${lista.length}. Deja esta pantalla abierta.`;
                miniBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${Math.round(((hechos + fallos) / lista.length) * 100)}%`;
            };
            pintar();
            try {
                let i = 0;
                const trabajador = async () => {
                    while (i < lista.length) {
                        const { id, url } = lista[i++];
                        const { error, ...campos } = await camposMiniaturaProducto(null, url);
                        if (error) { fallos++; } else { hechos++; porGuardar.push({ id, campos }); }
                        if (porGuardar.length >= 25) await guardar();
                        pintar();
                    }
                };
                await Promise.all([trabajador(), trabajador(), trabajador()]);
                await guardar();
                showToast(fallos
                    ? `Fotos optimizadas: ${hechos}. ${fallos} no se pudieron; vuelve a intentarlo más tarde.`
                    : `¡Listo! ${hechos} fotos optimizadas.`, fallos ? 'warning' : 'success');
            } catch (e) {
                console.error('Error optimizando fotos:', e);
                showToast('Se detuvo la optimización de fotos: ' + e.message, 'error');
            } finally {
                miniEnCurso = false;
                miniBtn.disabled = false;
                miniBtn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> Optimizar';
                actualizarBannerMiniaturas();
            }
        });
        onSnapshot(query(productsCollection, orderBy('timestamp', 'desc')), renderProducts, e => { console.error("Error products:", e); window.reportConnError?.('productos', e); if(productListTableBody) productListTableBody.innerHTML = `<div class="pf-empty pf-empty--error"><i class="bi bi-exclamation-triangle"></i><strong>No se pudo cargar</strong><span>${e.message || ''}</span></div>`;});
        
        // ─── GALERÍA POR COLOR ──────────────────────────────────────────────────
        // colorVariantsState: array de objetos {id, nombre, hex, imagenes (URLs ya guardadas), newFiles (File[])}
        let colorVariantsState = [];

        const colorVariantsContainer = document.getElementById('color-variants-container');
        const colorVariantTemplate  = document.getElementById('color-variant-template');
        const addColorVariantBtn    = document.getElementById('add-color-variant-btn');

        /** Renderiza la preview de imágenes dentro de un bloque de color */
        function renderColorPreview(previewEl, imagenesGuardadas, newFiles) {
            previewEl.innerHTML = '';

            // Imágenes ya guardadas en Storage
            (imagenesGuardadas || []).forEach((img, idx) => {
                const wrap = document.createElement('div');
                wrap.className = 'cv-img-wrap';
                wrap.innerHTML = `
                    <img src="${img.url}" alt="${img.angulo || ''}" class="cv-thumb">
                    <select class="cv-angle-select form-select form-select-sm" data-img-index="${idx}">
                        <option value="frente" ${img.angulo==='frente'?'selected':''}>Frente</option>
                        <option value="atrás" ${img.angulo==='atrás'?'selected':''}>Atrás</option>
                        <option value="lateral" ${img.angulo==='lateral'?'selected':''}>Lateral</option>
                        <option value="zoom" ${img.angulo==='zoom'?'selected':''}>Zoom</option>
                        <option value="otro" ${(img.angulo && !['frente','atrás','lateral','zoom'].includes(img.angulo))?'selected':''}>Otro</option>
                    </select>
                    <button type="button" class="cv-remove-img btn btn-sm btn-outline-danger p-0" data-img-index="${idx}" data-img-type="saved" title="Eliminar">×</button>`;
                previewEl.appendChild(wrap);
            });

            // Nuevas imágenes (aún no subidas)
            (newFiles || []).forEach((file, idx) => {
                const url = URL.createObjectURL(file);
                const wrap = document.createElement('div');
                wrap.className = 'cv-img-wrap cv-new';
                wrap.innerHTML = `
                    <img src="${url}" alt="nueva" class="cv-thumb">
                    <select class="cv-angle-select form-select form-select-sm" data-new-index="${idx}">
                        <option value="frente">Frente</option>
                        <option value="atrás">Atrás</option>
                        <option value="lateral">Lateral</option>
                        <option value="zoom">Zoom</option>
                        <option value="otro">Otro</option>
                    </select>
                    <button type="button" class="cv-remove-img btn btn-sm btn-outline-danger p-0" data-new-index="${idx}" data-img-type="new" title="Eliminar">×</button>`;
                previewEl.appendChild(wrap);
            });
        }

        /** Crea y añade un bloque de color al DOM y a colorVariantsState */
        function addColorVariantBlock(initialData) {
            if (!colorVariantTemplate || !colorVariantsContainer) return;

            const id = initialData?.id || ('cv_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
            const stateItem = {
                id,
                nombre: initialData?.nombre || '',
                hex: initialData?.hex || '#000000',
                imagenes: initialData?.imagenes || [],   // ya guardadas [{url, angulo, orden}]
                newFiles: [],                              // File[] pendientes de subir
                newFileAngles: [],                         // string[] para los nuevos archivos
                dotPosition: initialData?.dotPosition || { x: 50, y: 15 } // % posición del recorte en la bolita
            };
            colorVariantsState.push(stateItem);

            const block = colorVariantTemplate.cloneNode(true);
            block.classList.remove('d-none');
            block.removeAttribute('id');
            block.dataset.cvId = id;

            const hexInput  = block.querySelector('.color-variant-hex');
            const nameInput = block.querySelector('.color-variant-name');
            const fileInput = block.querySelector('.color-variant-file-input');
            const previewEl = block.querySelector('.color-variant-preview');
            const removeBtn = block.querySelector('.remove-color-variant-btn');

            hexInput.value  = stateItem.hex;
            nameInput.value = stateItem.nombre;

            renderColorPreview(previewEl, stateItem.imagenes, stateItem.newFiles);

            // Sync cambios de nombre / hex al state
            nameInput.addEventListener('input', () => { stateItem.nombre = nameInput.value.trim(); });
            hexInput.addEventListener('input', () => { stateItem.hex = hexInput.value; });

            // Nuevas imágenes seleccionadas — se acumulan (no reemplazan)
            fileInput.addEventListener('change', () => {
                const files = Array.from(fileInput.files);
                stateItem.newFiles = [...(stateItem.newFiles || []), ...files];
                stateItem.newFileAngles = [...(stateItem.newFileAngles || []), ...files.map(() => 'frente')];
                renderColorPreview(previewEl, stateItem.imagenes, stateItem.newFiles);
                fileInput.value = ''; // resetear para permitir re-selección
                bindPreviewEvents(previewEl, stateItem);
                updateMiniPreview();
            });

            // Delegar eventos en el preview (eliminar / cambiar ángulo)
            bindPreviewEvents(previewEl, stateItem);

            // Eliminar bloque completo
            removeBtn.addEventListener('click', () => {
                colorVariantsState = colorVariantsState.filter(s => s.id !== id);
                block.remove();
            });

            // Botón zona de bolita
            const dotZoneBtn = block.querySelector('.btn-dot-zone');
            const miniPreview = block.querySelector('.dot-zone-mini-preview');

            const hexOverlay = block.querySelector('.color-hex-img-overlay');

            function updateMiniPreview() {
                // Buscar imagen igual que openDotZoneModal: primero en imagenes guardadas,
                // luego en newFiles (imágenes recién subidas aún no guardadas en el servidor).
                let imgUrl = null;
                if (stateItem.imagenes.length > 0) {
                    const sorted = [...stateItem.imagenes].sort((a, b) => (a.orden || 0) - (b.orden || 0));
                    imgUrl = (sorted.find(i => i.angulo === 'frente') || sorted[0])?.url || null;
                } else if (stateItem.newFiles && stateItem.newFiles.length > 0) {
                    imgUrl = URL.createObjectURL(stateItem.newFiles[0]);
                }

                if (imgUrl && stateItem.dotPosition) {
                    const bg = `url('${imgUrl}')`;
                    const pos = `${stateItem.dotPosition.x}% ${stateItem.dotPosition.y}%`;
                    // Mini-preview bolita inferior
                    miniPreview.style.backgroundImage    = bg;
                    miniPreview.style.backgroundSize     = '400%';
                    miniPreview.style.backgroundPosition = pos;
                    miniPreview.style.backgroundColor    = '';
                    // Overlay encima del input de color (parte superior del bloque)
                    if (hexOverlay) {
                        hexOverlay.style.backgroundImage    = bg;
                        hexOverlay.style.backgroundSize     = '400%';
                        hexOverlay.style.backgroundPosition = pos;
                        hexOverlay.style.display = 'block';
                    }
                } else {
                    miniPreview.style.backgroundImage = '';
                    miniPreview.style.backgroundColor = stateItem.hex || '#e9ecef';
                    if (hexOverlay) hexOverlay.style.display = 'none';
                }
            }
            updateMiniPreview();

            if (dotZoneBtn) {
                dotZoneBtn.addEventListener('click', () => openDotZoneModal(stateItem, updateMiniPreview));
            }

            colorVariantsContainer.appendChild(block);
        }

        /** Asigna eventos de eliminar imagen y cambiar ángulo en la preview */
        function bindPreviewEvents(previewEl, stateItem) {
            previewEl.querySelectorAll('.cv-remove-img').forEach(btn => {
                btn.onclick = () => {
                    const type = btn.dataset.imgType;
                    if (type === 'saved') {
                        const idx = parseInt(btn.dataset.imgIndex, 10);
                        stateItem.imagenes.splice(idx, 1);
                    } else {
                        const idx = parseInt(btn.dataset.newIndex, 10);
                        stateItem.newFiles.splice(idx, 1);
                        stateItem.newFileAngles.splice(idx, 1);
                    }
                    renderColorPreview(previewEl, stateItem.imagenes, stateItem.newFiles);
                    bindPreviewEvents(previewEl, stateItem);
                };
            });
            previewEl.querySelectorAll('.cv-angle-select').forEach(sel => {
                sel.onchange = () => {
                    if (sel.dataset.imgIndex !== undefined) {
                        const idx = parseInt(sel.dataset.imgIndex, 10);
                        if (stateItem.imagenes[idx]) stateItem.imagenes[idx].angulo = sel.value;
                    } else if (sel.dataset.newIndex !== undefined) {
                        const idx = parseInt(sel.dataset.newIndex, 10);
                        stateItem.newFileAngles[idx] = sel.value;
                    }
                };
            });
        }

        /** Limpia todos los bloques de color */
        function clearColorVariants() {
            colorVariantsState = [];
            if (colorVariantsContainer) colorVariantsContainer.innerHTML = '';
        }

        /** Sube todas las imágenes nuevas y devuelve el array variantes_color listo para Firestore */
        async function buildAndUploadColorVariants(productId, tenantId) {
            const result = [];
            for (const cv of colorVariantsState) {
                // Subir nuevas imágenes
                const nuevasImgs = [];
                for (let i = 0; i < cv.newFiles.length; i++) {
                    const file = await compressProductImageFile(cv.newFiles[i]);
                    const angulo = cv.newFileAngles[i] || 'frente';
                    const fileName = `${tenantId || 'tenant'}/productos/${productId}/color_${cv.id}_${Date.now()}_${i}_${file.name}`;
                    const storageRef = ref(storage, fileName);
                    const snapshot = await withWriteTimeout(uploadBytes(storageRef, file, { cacheControl: 'public, max-age=31536000, immutable' }), 'las imágenes de color');
                    const url = await withWriteTimeout(getDownloadURL(snapshot.ref), 'las imágenes de color');
                    nuevasImgs.push({ url, angulo, orden: cv.imagenes.length + i });
                }

                // Recalcular orden de imágenes guardadas
                const imagenesFinales = [
                    ...cv.imagenes.map((img, idx) => ({ ...img, orden: idx })),
                    ...nuevasImgs
                ];

                result.push({ id: cv.id, nombre: cv.nombre, hex: cv.hex, imagenes: imagenesFinales, dotPosition: cv.dotPosition || { x: 50, y: 15 } });
            }
            return result;
        }

        if (addColorVariantBtn) {
            addColorVariantBtn.addEventListener('click', () => addColorVariantBlock());
        }

        // ─── MODAL SELECTOR DE ZONA PARA BOLITA (recorte circular de foto) ────────
        let dotZoneModal        = null;
        let dotZoneCurrentState = null;
        let dotZoneOnSave       = null;
        let dotZonePos          = { x: 50, y: 15 };

        /** Abre el modal con la foto del vestido para elegir zona del recorte */
        function openDotZoneModal(stateItem, onSaveCallback) {
            const imgEl     = document.getElementById('dot-zone-img');
            const circleEl  = document.getElementById('dot-zone-circle');
            const previewEl = document.getElementById('dot-zone-preview');
            if (!imgEl || !circleEl) return;

            // URL de la imagen "frente" del color (o primer archivo nuevo)
            let imgUrl = null;
            if (stateItem.imagenes.length > 0) {
                const sorted = [...stateItem.imagenes].sort((a, b) => (a.orden || 0) - (b.orden || 0));
                imgUrl = (sorted.find(i => i.angulo === 'frente') || sorted[0])?.url || null;
            } else if (stateItem.newFiles.length > 0) {
                imgUrl = URL.createObjectURL(stateItem.newFiles[0]);
            }

            if (!imgUrl) { alert('Primero sube al menos una imagen para este color.'); return; }

            dotZoneCurrentState = stateItem;
            dotZoneOnSave       = onSaveCallback;
            dotZonePos          = { ...(stateItem.dotPosition || { x: 50, y: 15 }) };

            const initDotZoneUI = () => {
                if (!imgEl.complete || !imgEl.offsetWidth) return;
                const cropPx = imgEl.offsetWidth / 4;
                circleEl.style.width  = cropPx + 'px';
                circleEl.style.height = cropPx + 'px';
                updateDotZoneUI(circleEl, previewEl, imgEl, dotZonePos.x, dotZonePos.y);
            };

            imgEl.onload = initDotZoneUI;
            imgEl.src = imgUrl;

            if (!dotZoneModal) dotZoneModal = new bootstrap.Modal(document.getElementById('dotZoneModal'));
            // Fallback for cached images that load before the modal is visible
            document.getElementById('dotZoneModal').addEventListener('shown.bs.modal', initDotZoneUI, { once: true });
            dotZoneModal.show();
        }

        /** Mueve el círculo indicador y actualiza el preview de recorte */
        function updateDotZoneUI(circleEl, previewEl, imgEl, xPct, yPct) {
            const rendW = imgEl.offsetWidth;
            const rendH = imgEl.offsetHeight;
            if (!rendW || !rendH) return;

            // Con background-size:400%, el centro visible del recorte NO es xPct% de la imagen.
            // El centro real que muestra la bolita es:
            //   X: (3*xPct/100 + 0.5) / 4  (fracción del ancho de imagen)
            //   Y: ((4*AR-1)*yPct/100 + 0.5) / (4*AR)  (fracción del alto de imagen)
            // donde AR = rendH/rendW (proporción de la imagen).
            const AR = rendH / rendW;
            const cxFrac = (3 * xPct / 100 + 0.5) / 4;
            const cyFrac = ((4 * AR - 1) * yPct / 100 + 0.5) / (4 * AR);

            circleEl.style.left = `${cxFrac * rendW}px`;
            circleEl.style.top  = `${cyFrac * rendH}px`;
            dotZonePos = { x: +xPct.toFixed(1), y: +yPct.toFixed(1) };

            // Preview: mismo tamaño y zoom que el círculo indicador para que
            // muestre exactamente el mismo recorte que está seleccionando el usuario.
            if (previewEl) {
                const sz = parseFloat(circleEl.style.width) || 80;
                previewEl.style.width              = sz + 'px';
                previewEl.style.height             = sz + 'px';
                previewEl.style.backgroundImage    = `url('${imgEl.src}')`;
                previewEl.style.backgroundSize     = '400%';
                previewEl.style.backgroundPosition = `${xPct}% ${yPct}%`;
            }
        }

        function getPosFromEvent(e, imgEl) {
            const rect = imgEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Fracción del punto clicado respecto a la imagen renderizada
            const sx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const sy = Math.min(1, Math.max(0, (clientY - rect.top)  / rect.height));
            const AR = rect.height / rect.width;

            // Convertir a background-position% tal que el centro visible
            // de la bolita (background-size:400%) quede exactamente en (sx, sy).
            //   xPct = (4*sx - 0.5) * 100/3
            //   yPct = (4*AR*sy - 0.5) * 100 / (4*AR - 1)
            return {
                xPct: Math.min(100, Math.max(0, (4 * sx - 0.5) * 100 / 3)),
                yPct: Math.min(100, Math.max(0, (4 * AR * sy - 0.5) * 100 / (4 * AR - 1)))
            };
        }

        const dotZoneImgContainer = document.getElementById('dot-zone-img-container');
        if (dotZoneImgContainer) {
            let isDragging = false;
            function handleDotMove(e) {
                e.preventDefault();
                const imgEl     = document.getElementById('dot-zone-img');
                const circleEl  = document.getElementById('dot-zone-circle');
                const previewEl = document.getElementById('dot-zone-preview');
                const { xPct, yPct } = getPosFromEvent(e, imgEl);
                updateDotZoneUI(circleEl, previewEl, imgEl, xPct, yPct);
            }
            dotZoneImgContainer.addEventListener('mousedown',  (e) => { isDragging = true;  handleDotMove(e); });
            dotZoneImgContainer.addEventListener('mousemove',  (e) => { if (isDragging) handleDotMove(e); });
            document.addEventListener('mouseup', () => { isDragging = false; });
            dotZoneImgContainer.addEventListener('touchstart', handleDotMove, { passive: false });
            dotZoneImgContainer.addEventListener('touchmove',  handleDotMove, { passive: false });
        }

        const dotZoneConfirmBtn = document.getElementById('dot-zone-confirm');
        if (dotZoneConfirmBtn) {
            dotZoneConfirmBtn.addEventListener('click', () => {
                if (dotZoneCurrentState) {
                    dotZoneCurrentState.dotPosition = { ...dotZonePos };
                    if (dotZoneOnSave) dotZoneOnSave();
                }
                if (dotZoneModal) dotZoneModal.hide();
            });
        }
        // ─── FIN MODAL SELECTOR ZONA BOLITA ──────────────────────────────────────

        /**
         * Actualiza el <datalist id="variation-colors-list"> con los colores
         * que hay actualmente en las filas de Variaciones, y marca en rojo
         * los bloques de galería cuyo nombre no coincida con ninguna variación.
         */
        function syncColorSuggestions() {
            const datalist = document.getElementById('variation-colors-list');
            if (!datalist) return;

            // Recolectar colores únicos de las filas de variaciones
            const rows = variationsContainer.querySelectorAll('.variation-row:not(#variation-template)');
            const variationColors = new Set();
            rows.forEach(row => {
                const c = row.querySelector('[name="variation_color[]"]')?.value?.trim();
                if (c) variationColors.add(c);
            });

            // Actualizar datalist
            datalist.innerHTML = [...variationColors]
                .map(c => `<option value="${c}">`)
                .join('');

            // Mostrar/ocultar advertencia en cada bloque de galería
            if (colorVariantsContainer) {
                colorVariantsContainer.querySelectorAll('.color-variant-block').forEach(block => {
                    const nameInput = block.querySelector('.color-variant-name');
                    const warning   = block.querySelector('.cv-name-warning');
                    if (!nameInput || !warning) return;
                    const nombre = nameInput.value.trim();
                    const coincide = !nombre || [...variationColors].some(
                        vc => vc.toLowerCase() === nombre.toLowerCase()
                    );
                    warning.style.display = coincide ? 'none' : 'block';
                });
            }
        }

        // Escuchar cambios en cualquier input de color/talla de variaciones
        if (variationsContainer) {
            variationsContainer.addEventListener('input', e => {
                if (e.target.matches('[name="variation_color[]"]')) syncColorSuggestions();
            });
        }

        // También sincronizar cuando el usuario escribe en un input de nombre de galería
        if (colorVariantsContainer) {
            colorVariantsContainer.addEventListener('input', e => {
                if (e.target.classList.contains('color-variant-name')) syncColorSuggestions();
            });
        }

        // Cuando se elimina una fila de variación, re-sincronizar sugerencias
        if (variationsContainer) {
            variationsContainer.addEventListener('click', e => {
                if (e.target.closest('.remove-variation-btn')) {
                    setTimeout(syncColorSuggestions, 50);
                }
            });
        }
        // ─── FIN GALERÍA POR COLOR ───────────────────────────────────────────────

        window.clearProductForm = function() {
            productForm.reset();
            productIdInput.value = '';
            const margenDetalInfo = document.getElementById('margen-detal-info');
            const margenMayorInfo = document.getElementById('margen-mayor-info');
            if(margenDetalInfo) margenDetalInfo.textContent = '';
            if(margenMayorInfo) margenMayorInfo.textContent = '';
            const rows = variationsContainer.querySelectorAll('.variation-row:not(#variation-template)');
            rows.forEach((row) => { row.remove(); });
            aVR();
            clearColorVariants();
            document.getElementById('product-form-title').textContent = "Nuevo producto";
            imagenInput.required = true;
            window.setProductPhotoPreview?.('');
            const mostrarFotoChk = document.getElementById('mostrar-foto-principal');
            if (mostrarFotoChk) mostrarFotoChk.checked = true;
        }
        
        if (clearFormBtn) clearFormBtn.addEventListener('click', (e) => { e.preventDefault(); window.clearProductForm(); });

        // Teclado: Enter o espacio sobre una tarjeta del inventario la edita.
        if (productListTableBody) productListTableBody.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('pf-card')) {
                e.preventDefault();
                e.target.click();
            }
        });

        // Contador − / + de unidades en cada fila de talla/color.
        if (variationsContainer) variationsContainer.addEventListener('click', (e) => {
            const step = e.target.closest('.pf-step');
            if (!step) return;
            e.preventDefault();
            const input = step.parentElement.querySelector('input[type="number"]');
            if (!input) return;
            const valor = (parseInt(input.value, 10) || 0) + parseInt(step.dataset.step, 10);
            input.value = Math.max(0, valor);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Vista previa de la foto principal en el recuadro del formulario.
        const fotoPreviewEl = document.getElementById('producto-imagen-preview');
        const fotoCuadroEl = document.getElementById('producto-photo');
        window.setProductPhotoPreview = function(url) {
            if (!fotoPreviewEl || !fotoCuadroEl) return;
            if (url) { fotoPreviewEl.src = url; fotoPreviewEl.style.display = ''; }
            else { fotoPreviewEl.removeAttribute('src'); fotoPreviewEl.style.display = 'none'; }
            fotoCuadroEl.classList.toggle('has-photo', !!url);
        };
        if (imagenInput) imagenInput.addEventListener('change', () => {
            const archivo = imagenInput.files && imagenInput.files[0];
            if (!archivo) return;
            const lector = new FileReader();
            lector.onload = () => window.setProductPhotoPreview(lector.result);
            lector.readAsDataURL(archivo);
        });
        
        if (productForm) productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(saveProductBtn) { saveProductBtn.disabled = true; if(saveProductBtnText) saveProductBtnText.textContent = "Guardando..."; if(saveProductBtnSpinner) saveProductBtnSpinner.style.display = 'inline-block'; }

            const productId = productIdInput.value;
            const nombreProducto = nombreInput.value.trim();

            // ✅ VALIDACIÓN: No permitir más de 2 productos con el mismo nombre
            try {
                const nombreNormalizado = nombreProducto.toLowerCase();
                let contadorMismoNombre = 0;

                // Contar productos con el mismo nombre (ignorando el producto actual si estamos editando)
                localProductsMap.forEach((prod, prodId) => {
                    if (prod.nombre && prod.nombre.toLowerCase() === nombreNormalizado) {
                        // Si estamos editando, no contar el producto actual
                        if (!productId || prodId !== productId) {
                            contadorMismoNombre++;
                        }
                    }
                });

                console.log(`📊 Productos con nombre "${nombreProducto}": ${contadorMismoNombre}`);

                if (contadorMismoNombre >= 2) {
                    showToast(`⚠️ Ya existen 2 productos con el nombre "${nombreProducto}". No se pueden crear más productos con el mismo nombre.`, 'error');
                    if(saveProductBtn) {
                        saveProductBtn.disabled = false;
                        if(saveProductBtnText) saveProductBtnText.textContent = "Guardar";
                        if(saveProductBtnSpinner) saveProductBtnSpinner.style.display = 'none';
                    }
                    return;
                }
            } catch (validationErr) {
                console.error("Error en validación de nombre:", validationErr);
            }

            const mostrarFotoPrincipalCheckbox = document.getElementById('mostrar-foto-principal');
            let productData = { nombre: nombreProducto, codigo: codigoInput ? codigoInput.value.trim() : '', codigoBarras: codigoBarrasInput ? codigoBarrasInput.value.trim() : '', proveedor: proveedorInput.value.trim(), descripcion: descripcionInput.value.trim(), categoriaId: categoriaSelect.value, costoCompra: parseFloat(costoInput.value) || 0, precioDetal: parseFloat(detalInput.value) || 0, precioMayor: parseFloat(mayorInput.value) || 0, visible: visibleCheckbox.checked, bajoEncargo: bajoEncargoCheckbox ? bajoEncargoCheckbox.checked : false, grupoMayorista: grupoMayoristaSelect ? grupoMayoristaSelect.value : '', mostrarFotoPrincipal: mostrarFotoPrincipalCheckbox ? mostrarFotoPrincipalCheckbox.checked : true, timestamp: serverTimestamp(), variaciones: [], imagenUrl: null };
            // Requerido por firestore.rules (hasRequiredTenantId()) al crear: sin este
            // campo, addDoc() es rechazado con "Missing or insufficient permissions"
            // para CUALQUIER usuario, Super Admin incluido, porque esa validación no
            // tiene atajo de rol — corre antes de llegar a isCreatingWithCorrectTenant().
            if (!productId) {
                productData.tenantId = window.expectedTenantId ?? null;
            }

            const variationRows = variationsContainer.querySelectorAll('.variation-row:not(#variation-template)');
            variationRows.forEach(row => { const talla = row.querySelector('[name="variation_talla[]"]').value.trim(); const color = row.querySelector('[name="variation_color[]"]').value.trim(); const stock = parseInt(row.querySelector('[name="variation_stock[]"]').value, 10) || 0; if (talla || color || stock > 0) { productData.variaciones.push({ talla, color, stock }); } });

            try {
                const files = imagenInput.files;
                if (files.length > 0) {
                    showToast("Subiendo imagen...", 'info');
                    const firstFile = await compressProductImageFile(files[0]);
                    const fileName = `product_images/${Date.now()}-${firstFile.name}`;
                    const storageRef = ref(storage, fileName);

                    const uploadResult = await withWriteTimeout(uploadBytes(storageRef, firstFile, { cacheControl: 'public, max-age=31536000, immutable' }), 'la imagen');
                    productData.imagenUrl = await withWriteTimeout(getDownloadURL(uploadResult.ref), 'la imagen');
                    console.log("Imagen subida:", productData.imagenUrl);
                    // Miniatura para tarjetas y listas (tienda, buscador, etc.)
                    const { error: _errMini, ...camposMini } = await camposMiniaturaProducto(firstFile, productData.imagenUrl);
                    Object.assign(productData, camposMini);
                }

                // ─── Subir imágenes de galería por color ───────────────────────────
                const sinNombre = colorVariantsState.find(cv => !cv.nombre);
                if (sinNombre) {
                    showToast('Cada color debe tener un nombre.', 'warning');
                    throw new Error('Color sin nombre');
                }
                const tenantId = window.expectedTenantId;
                const tempProductId = productId || ('temp_' + Date.now());
                if (colorVariantsState.length > 0) {
                    const hasNewFiles = colorVariantsState.some(cv => cv.newFiles.length > 0);
                    if (hasNewFiles) showToast("Subiendo imágenes de colores...", 'info');
                    productData.variantes_color = await buildAndUploadColorVariants(tempProductId, tenantId);
                } else {
                    productData.variantes_color = [];
                }
                // ───────────────────────────────────────────────────────────────────

                if (productId) {
                    const existingDoc = localProductsMap.get(productId);
                    if (!productData.imagenUrl) {
                        productData.imagenUrl = existingDoc?.imagenUrl || null;
                    }
                    await withWriteTimeout(updateDoc(doc(db, "productos", productId), productData), 'el producto');
                    imagenInput.value = '';
                    showToast("Producto actualizado!");

                    const { cambios, detalles } = describirCambiosProducto(existingDoc, productData);
                    registrarAuditoria({
                        accion: 'editar',
                        modulo: 'producto',
                        entidadId: productId,
                        entidadNombre: productData.nombre,
                        descripcion: cambios.length > 0
                            ? `Editó el producto "${productData.nombre}" (código ${productData.codigo || ''}): ${cambios.join('; ')}`
                            : `Editó el producto "${productData.nombre}" (código ${productData.codigo || ''})`,
                        detalles
                    });

                    // ✅ AUTO-SCROLL: Cambiar a vista de inventario y hacer scroll
                    const formView = document.getElementById('form-view');
                    const inventoryView = document.getElementById('inventory-view');
                    const toggleFormBtn = document.getElementById('toggle-form-view-btn');
                    const toggleInventoryBtn = document.getElementById('toggle-inventory-view-btn');

                    if (formView && inventoryView && toggleFormBtn && toggleInventoryBtn) {
                        // Cambiar a vista de inventario
                        formView.style.display = 'none';
                        inventoryView.style.display = 'block';
                        toggleFormBtn.classList.remove('active');
                        toggleInventoryBtn.classList.add('active');

                        // Hacer scroll suave al inventario
                        setTimeout(() => {
                            inventoryView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 300);
                    }
                } else { 
                    if (!productData.imagenUrl) { showToast("Se requiere una imagen para crear un producto nuevo.", 'warning'); throw new Error("Imagen requerida"); }
                    productData.codigo = "P" + Date.now().toString().slice(-5);
                    const docRef = await withWriteTimeout(addDoc(productsCollection, productData), 'el producto');
                    showToast("Producto guardado!");

                    registrarAuditoria({
                        accion: 'crear',
                        modulo: 'producto',
                        entidadId: docRef.id,
                        entidadNombre: productData.nombre,
                        descripcion: `Agregó el producto "${productData.nombre}" (código ${productData.codigo})${resumenVariacionesProducto(productData)}`,
                        detalles: {
                            costoCompra: productData.costoCompra,
                            precioDetal: productData.precioDetal,
                            precioMayor: productData.precioMayor,
                            proveedor: productData.proveedor,
                            variaciones: (productData.variaciones || []).map(v => `${[v.color, v.talla].filter(Boolean).join(' / ') || 'sin color/talla'} (stock ${v.stock || 0})`),
                            coloresGaleria: (productData.variantes_color || []).map(c => c.nombre).filter(Boolean)
                        }
                    });

                    window.clearProductForm();
                }
            } catch (err) { 
                console.error("Error saving product or image:", err); 
                if (err.message !== "Imagen requerida" && err.message !== "Color sin nombre") {
                    showToast(`Error: ${err.message}`, 'error');
                }
            } finally {
                 if(saveProductBtn) { saveProductBtn.disabled = false; if(saveProductBtnText) saveProductBtnText.textContent = "Guardar"; if(saveProductBtnSpinner) saveProductBtnSpinner.style.display = 'none'; }
            }
        });
        
        if (productListTableBody) productListTableBody.addEventListener('click', async (e) => {
            const encargoBadge = e.target.closest('.btn-toggle-encargo');
            if (encargoBadge) {
                const tr = encargoBadge.closest('[data-id]'); const id = tr?.dataset.id;
                const producto = id ? localProductsMap.get(id) : null;
                if (!id || !producto) return;
                const nuevoValor = !producto.bajoEncargo;
                try {
                    await updateDoc(doc(db, "productos", id), { bajoEncargo: nuevoValor });
                    showToast(nuevoValor ? "Producto agregado a Bajo Encargo" : "Producto quitado de Bajo Encargo", 'success');
                } catch (err) {
                    console.error("Error actualizando bajoEncargo:", err);
                    showToast("Error al actualizar Bajo Encargo", 'error');
                }
                return;
            }
            const copiarBtn = e.target.closest('.btn-copiar-disponibilidad');
            if (copiarBtn) {
                const producto = localProductsMap.get(copiarBtn.closest('[data-id]')?.dataset.id);
                const texto = producto ? textoDisponibilidadProducto(producto) : '';
                if (!texto) { showToast('Este producto no tiene unidades disponibles', 'warning'); return; }
                if (await copiarTextoAlPortapapeles(texto)) {
                    const icono = copiarBtn.querySelector('i');
                    if (icono) icono.className = 'bi bi-check2';
                    clearTimeout(copiarBtn._t);
                    copiarBtn._t = setTimeout(() => { if (icono) icono.className = 'bi bi-copy'; }, 1600);
                    showToast('Disponibilidad copiada', 'success');
                } else {
                    showToast('No se pudo copiar en este navegador', 'error');
                }
                return;
            }
            // Un botón de la tarjeta, o la tarjeta misma (abre la edición).
            if (e.target.closest('.btn-manage-promo')) return; // lo maneja el listener de promociones
            const target = e.target.closest('button') || e.target.closest('.pf-card'); if (!target) return; e.preventDefault();
            const tr = target.closest('[data-id]'); if (!tr) return; const id = tr.dataset.id; const nameTd = tr.querySelector('.product-name'); if (!id || !nameTd) return;

             if (target.classList.contains('btn-ver-barcode')) {
                 const producto = localProductsMap.get(id);
                 if (producto && window.mostrarBarcodeModal) {
                     await window.mostrarBarcodeModal(producto);
                 }
             } else if (target.classList.contains('btn-delete-product')) {
                 const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'productos'; deleteItemNameEl.textContent = `Producto: ${nameTd.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
             } else if (target.classList.contains('btn-edit-product')) {
                 showToast("Cargando datos...", 'info');
                 try {
                    const product = localProductsMap.get(id);
                    if (product) {
                        const formView = document.getElementById('form-view');
                        const inventoryView = document.getElementById('inventory-view');
                        const toggleFormBtn = document.getElementById('toggle-form-view-btn');
                        const toggleInventoryBtn = document.getElementById('toggle-inventory-view-btn');
                        
                        if (formView && inventoryView && toggleFormBtn && toggleInventoryBtn) {
                            inventoryView.style.display = 'none';
                            formView.style.display = 'block';
                            toggleFormBtn.classList.add('active');
                            toggleInventoryBtn.classList.remove('active');
                        }
                        
                        productIdInput.value = id;
                        nombreInput.value = product.nombre || '';
                        if (codigoInput) codigoInput.value = product.codigo || '';
                        if (codigoBarrasInput) codigoBarrasInput.value = product.codigoBarras || '';
                        proveedorInput.value = product.proveedor || '';
                        descripcionInput.value = product.descripcion || '';
                        categoriaSelect.value = product.categoriaId || '';
                        costoInput.value = Math.round(product.costoCompra || 0);
                        detalInput.value = Math.round(product.precioDetal || 0);
                        mayorInput.value = Math.round(product.precioMayor || 0);
                        visibleCheckbox.checked = product.visible;
                        if (bajoEncargoCheckbox) bajoEncargoCheckbox.checked = !!product.bajoEncargo;
                        if (grupoMayoristaSelect) grupoMayoristaSelect.value = product.grupoMayorista || '';
                        const mostrarFotoCheckbox = document.getElementById('mostrar-foto-principal');
                        if (mostrarFotoCheckbox) mostrarFotoCheckbox.checked = product.mostrarFotoPrincipal !== false;
                        imagenInput.required = false;
                        imagenInput.value = '';
                        document.getElementById('product-form-title').textContent = `Editar producto`;
                        window.setProductPhotoPreview?.(product.imagenUrl || '');
                        
                        variationsContainer.innerHTML = '';
                        if (product.variaciones && product.variaciones.length > 0) {
                            product.variaciones.forEach(v => {
                                const nR = document.getElementById('variation-template').cloneNode(true);
                                nR.classList.remove('d-none'); nR.removeAttribute('id');
                                nR.querySelector('[name="variation_talla[]"]').value = v.talla || '';
                                nR.querySelector('[name="variation_color[]"]').value = v.color || '';
                                nR.querySelector('[name="variation_stock[]"]').value = v.stock || 0;
                                nR.querySelector('.remove-variation-btn').addEventListener('click', (ev)=>{ ev.preventDefault(); nR.remove(); });
                                variationsContainer.appendChild(nR);
                            });
                        } else { aVR(); }

                        // ─── Cargar galería por color ──────────────────────────────────
                        clearColorVariants();
                        (product.variantes_color || []).forEach(vc => addColorVariantBlock(vc));
                        syncColorSuggestions(); // actualizar sugerencias y advertencias
                        // ──────────────────────────────────────────────────────────────

                        costoInput.dispatchEvent(new Event('input'));

                        if (formView) {
                            formView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        
                    } else { showToast("Producto no encontrado.", 'error'); }
                 } catch (err) { console.error("Error fetching product for edit:", err); showToast(`Error al cargar: ${err.message}`, 'error'); }
             }
         });

        // localeCompare crea un comparador nuevo en cada llamada; ordenar
        // ~540 productos hace miles de comparaciones. Uno solo, reutilizado.
        const collatorBusqueda = new Intl.Collator('es');

        // Función avanzada de filtrado de productos
        function applyProductModalFilters() {
            const searchTerm = (document.getElementById('product-modal-search')?.value || '').toLowerCase();
            const categoriaFiltro = document.getElementById('product-modal-category')?.value || '';
            const stockOnly = document.getElementById('product-modal-stock-only')?.checked || false;
            const visibleOnly = document.getElementById('product-modal-visible-only')?.checked || false;
            const sortBy = document.getElementById('product-modal-sort')?.value || 'name-asc';

            const items = Array.from(productSearchModalList?.querySelectorAll('.product-search-item') || []);

            // Filtrar
            let visibleItems = items.filter(item => {
                // Filtro de búsqueda (nombre o código)
                if (searchTerm) {
                    const itemName = item.dataset.productName || '';
                    const itemCode = item.dataset.productCode || '';
                    if (!itemName.includes(searchTerm) && !itemCode.includes(searchTerm)) {
                        return false;
                    }
                }

                // Filtro de categoría
                if (categoriaFiltro && item.dataset.categoria !== categoriaFiltro) {
                    return false;
                }

                // Filtro de stock
                if (stockOnly && parseInt(item.dataset.stock || 0) <= 0) {
                    return false;
                }

                // Filtro de visible
                if (visibleOnly && item.dataset.visible !== 'true') {
                    return false;
                }

                return true;
            });

            // Ordenar
            visibleItems.sort((a, b) => {
                const aName = a.dataset.productName || '';
                const bName = b.dataset.productName || '';
                const aPrice = parseFloat(a.dataset.precioOriginal || 0);
                const bPrice = parseFloat(b.dataset.precioOriginal || 0);
                const aStock = parseInt(a.dataset.stock || 0);
                const bStock = parseInt(b.dataset.stock || 0);
                const aSales = parseInt(a.dataset.totalSales || 0);
                const bSales = parseInt(b.dataset.totalSales || 0);

                // PRIORIDAD 1: Productos con stock SIEMPRE primero
                const aHasStock = aStock > 0 ? 1 : 0;
                const bHasStock = bStock > 0 ? 1 : 0;
                if (aHasStock !== bHasStock) {
                    return bHasStock - aHasStock; // Con stock primero
                }

                // PRIORIDAD 2: Dentro del mismo grupo (con/sin stock), más vendidos primero
                if (bSales !== aSales) {
                    return bSales - aSales; // Más vendidos primero
                }

                // PRIORIDAD 3: Aplicar ordenamiento seleccionado
                switch(sortBy) {
                    case 'name-asc':
                        return collatorBusqueda.compare(aName, bName);
                    case 'name-desc':
                        return collatorBusqueda.compare(bName, aName);
                    case 'price-asc':
                        return aPrice - bPrice;
                    case 'price-desc':
                        return bPrice - aPrice;
                    case 'stock-desc':
                        return bStock - aStock;
                    default:
                        return collatorBusqueda.compare(aName, bName);
                }
            });

            // Aplicar visibilidad y orden
            // Ocultar/mostrar y reordenar en un solo paso (un solo reflow).
            const visiblesSet = new Set(visibleItems);
            items.forEach(item => { if (!visiblesSet.has(item)) item.style.display = 'none'; });
            const orden = document.createDocumentFragment();
            visibleItems.forEach(item => { item.style.display = ''; orden.appendChild(item); });
            items.forEach(item => { if (!visiblesSet.has(item)) orden.appendChild(item); });
            productSearchModalList.appendChild(orden);

            // Actualizar contador
            const countEl = document.getElementById('product-modal-count');
            if (countEl) {
                countEl.textContent = `${visibleItems.length} producto(s) encontrado(s)`;
            }
        }

        // Event listeners para filtros
        if (productSearchInput) {
            // Espera a que termine de escribir (antes reordenaba los ~540
            // productos con cada letra).
            let busquedaModalTimer = null;
            productSearchInput.addEventListener('input', () => {
                clearTimeout(busquedaModalTimer);
                busquedaModalTimer = setTimeout(applyProductModalFilters, 150);
            });
        }

        const productModalCategory = document.getElementById('product-modal-category');
        const productModalStockOnly = document.getElementById('product-modal-stock-only');
        const productModalVisibleOnly = document.getElementById('product-modal-visible-only');
        const productModalSort = document.getElementById('product-modal-sort');
        const productModalClearFilters = document.getElementById('product-modal-clear-filters');

        if (productModalCategory) {
            productModalCategory.addEventListener('change', applyProductModalFilters);

            // Cargar categorías en el select
            subscribeCategories((snapshot) => {
                productModalCategory.innerHTML = '<option value="">Todas las categorías</option>';
                snapshot.forEach(doc => {
                    const cat = doc.data();
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = cat.nombre;
                    productModalCategory.appendChild(option);
                });
            });
        }

        if (productModalStockOnly) {
            productModalStockOnly.addEventListener('change', applyProductModalFilters);
        }

        if (productModalVisibleOnly) {
            productModalVisibleOnly.addEventListener('change', applyProductModalFilters);
        }

        if (productModalSort) {
            productModalSort.addEventListener('change', applyProductModalFilters);
        }

        if (productModalClearFilters) {
            productModalClearFilters.addEventListener('click', () => {
                if (productSearchInput) productSearchInput.value = '';
                if (productModalCategory) productModalCategory.value = '';
                if (productModalStockOnly) productModalStockOnly.checked = false;
                if (productModalVisibleOnly) productModalVisibleOnly.checked = false;
                if (productModalSort) productModalSort.value = 'name-asc';
                applyProductModalFilters();
            });
        }
        
        if (productSearchModalList && searchProductModalInstance) {
            productSearchModalList.addEventListener('click', (e) => {
                const target = e.target.closest('.product-search-item');
                if (target && !target.classList.contains('disabled')) {
                    const productId = target.dataset.productId;
                    const searchProductModalEl = document.getElementById('searchProductModal');
                    if (searchProductModalEl) {
                        searchProductModalEl.addEventListener('hidden.bs.modal', () => {
                            openVariationModal(productId);
                        }, { once: true });
                    }
                    searchProductModalInstance.hide();
                }
            });
        }

        let variationAddedItems = [];

        function renderVariationAddedList() {
            const wrapper = document.getElementById('variation-added-list');
            const list = document.getElementById('variation-added-list-items');
            if (!wrapper || !list) return;

            if (variationAddedItems.length === 0) {
                wrapper.style.display = 'none';
                list.innerHTML = '';
                return;
            }

            wrapper.style.display = 'block';
            list.innerHTML = variationAddedItems.map((it, idx) => `
                <span class="badge bg-light text-dark border d-inline-flex align-items-center gap-1">
                    ${[normalizeTalla(it.talla), normalizeColor(it.color)].filter(Boolean).join(' / ')} × ${it.cantidad}
                    <button type="button" class="btn-close btn-close-sm" style="font-size: 0.55rem;" data-remove-added-index="${idx}" aria-label="Quitar"></button>
                </span>
            `).join('');

            list.querySelectorAll('[data-remove-added-index]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.removeAddedIndex, 10);
                    const removed = variationAddedItems[idx];
                    if (removed) {
                        const productId = document.getElementById('variation-product-id').value;
                        const cartIndex = window.ventaItems.findIndex(item =>
                            item.productoId === productId && item.talla === removed.talla && item.color === removed.color
                        );
                        if (cartIndex !== -1) {
                            const cartItem = window.ventaItems[cartIndex];
                            cartItem.cantidad -= removed.cantidad;
                            if (cartItem.cantidad <= 0) {
                                window.ventaItems.splice(cartIndex, 1);
                            } else {
                                cartItem.total = cartItem.cantidad * cartItem.precio;
                            }
                            if (typeof window.recalcularPreciosMayoristas === 'function') window.recalcularPreciosMayoristas();
                            renderCarrito();
                            window.calcularTotalVentaGeneral();
                        }
                    }
                    variationAddedItems.splice(idx, 1);
                    renderVariationAddedList();
                });
            });
        }

        function openVariationModal(productId) {
            const product = localProductsMap.get(productId);
            if (!product) {
                showToast("Error: Producto no encontrado", "error");
                return;
            }

            variationAddedItems = [];
            renderVariationAddedList();

            document.getElementById('variation-product-id').value = productId;
            document.getElementById('variation-product-name').value = product.nombre;

            // Obtener el tipo de venta seleccionado
            const tipoVentaSelect = document.getElementById('tipo-venta-select');
            const tipoVenta = tipoVentaSelect ? tipoVentaSelect.value : 'detal';

            // Aplicar precio según el tipo de venta
            let precioAplicar = product.precioDetal || 0;
            if (tipoVenta === 'mayorista') {
                if (!esProveedorBoutique(product)) {
                    showToast(`"${product.nombre}" no es de Mishelles Boutique: solo se puede vender al detal`, "error");
                    return;
                }
                precioAplicar = product.precioMayor || 0;
                if (precioAplicar === 0) {
                    showToast("Advertencia: Este producto no tiene precio mayorista configurado", "warning");
                    precioAplicar = product.precioDetal || 0;
                }
            }

            document.getElementById('variation-product-price').value = precioAplicar;
            
            const titleEl = document.getElementById('selectVariationModalTitle');
            const optionsContainer = document.getElementById('variation-options-container');
            const stockDisplay = document.getElementById('variation-stock-display');
            const addBtn = document.getElementById('add-variation-to-cart-btn');

            titleEl.textContent = `Seleccionar: ${product.nombre}`;
            stockDisplay.style.display = 'none';
            addBtn.disabled = true;

            // Producto sin talla/color: no hay variaciones que elegir, se agrega directo.
            if (!Array.isArray(product.variaciones) || product.variaciones.length === 0) {
                optionsContainer.innerHTML = '<p class="text-muted mb-0">Este producto no maneja tallas ni colores.</p>';
                stockDisplay.style.display = 'block';
                stockDisplay.classList.remove('alert-danger');
                stockDisplay.classList.add('alert-success');
                stockDisplay.querySelector('span').textContent = obtenerStockTotalProducto(product);
                addBtn.disabled = false;
                selectVariationModalInstance.show();
                return;
            }

            // ✅ FILTRAR: Solo mostrar tallas y colores que tengan stock disponible
            const variacionesConStock = product.variaciones.filter(v => (parseInt(v.stock, 10) || 0) > 0);
            const tallas = [...new Set(variacionesConStock.map(v => v.talla || ''))];
            const colores = [...new Set(variacionesConStock.map(v => v.color || ''))];

            // ✅ Detectar si es talla única
            const esTallaUnica = (tallas.length === 0 || tallas.length === 1);
            const tallaUnicaValue = esTallaUnica ? (tallas[0] || '') : '';

            let optionsHtml = `
                <div class="mb-3">
                    <label for="select-talla" class="form-label">Talla:</label>
                    <select class="form-select" id="select-talla" ${esTallaUnica ? 'disabled' : ''}>
                        ${esTallaUnica
                            ? `<option value="${tallaUnicaValue}" selected>${normalizeTalla(tallaUnicaValue)}</option>`
                            : `<option value="" selected>Selecciona una talla...</option>
                               ${tallas.map(t => `<option value="${t}">${normalizeTalla(t)}</option>`).join('')}`
                        }
                    </select>
                </div>
                <div class="mb-3">
                    <label for="select-color" class="form-label">Color:</label>
                    <select class="form-select" id="select-color">
                        <option value="" selected>Selecciona un color...</option>
                        ${colores.map(c => `<option value="${c}">${normalizeColor(c)}</option>`).join('')}
                    </select>
                </div>
            `;
            optionsContainer.innerHTML = optionsHtml;

            const selectTalla = document.getElementById('select-talla');
            const selectColor = document.getElementById('select-color');

            // ✅ Si es talla única, pre-seleccionar y disparar checkStock
            if (esTallaUnica) {
                selectTalla.value = tallaUnicaValue;
                // Si solo hay un color también, seleccionarlo automáticamente
                if (colores.length === 1) {
                    selectColor.value = colores[0];
                }
            }

            // ✅ Actualizar colores disponibles cuando se selecciona una talla
            function updateColoresDisponibles() {
                const tallaSeleccionada = selectTalla.value;

                if (tallaSeleccionada) {
                    // Filtrar colores que tengan stock para esta talla específica
                    const coloresDisponibles = [...new Set(
                        variacionesConStock
                            .filter(v => v.talla === tallaSeleccionada)
                            .map(v => v.color || '')
                    )];

                    // Actualizar opciones de color
                    selectColor.innerHTML = '<option value="" selected>Selecciona un color...</option>';
                    coloresDisponibles.forEach(c => {
                        selectColor.innerHTML += `<option value="${c}">${normalizeColor(c)}</option>`;
                    });

                    // Si solo hay un color, seleccionarlo automáticamente
                    if (coloresDisponibles.length === 1) {
                        selectColor.value = coloresDisponibles[0];
                        checkStock();
                    }
                }
            }

            function checkStock() {
                const talla = selectTalla.value;
                const color = selectColor.value;

                if (talla && color) {
                    const variacion = product.variaciones.find(v => v.talla === talla && v.color === color);
                    const stock = variacion ? (parseInt(variacion.stock, 10) || 0) : 0;

                    stockDisplay.style.display = 'block';
                    stockDisplay.querySelector('span').textContent = stock;

                    if (stock > 0) {
                        stockDisplay.classList.remove('alert-danger');
                        stockDisplay.classList.add('alert-success');
                        addBtn.disabled = false;
                    } else {
                        stockDisplay.classList.remove('alert-success');
                        stockDisplay.classList.add('alert-danger');
                        addBtn.disabled = true;
                    }
                } else {
                    stockDisplay.style.display = 'none';
                    addBtn.disabled = true;
                }
            }

            selectTalla.addEventListener('change', () => {
                updateColoresDisponibles();
                checkStock();
            });
            selectColor.addEventListener('change', checkStock);

            // ✅ Si es talla única, disparar checkStock para mostrar stock automáticamente
            if (esTallaUnica) {
                checkStock();
            }

            selectVariationModalInstance.show();
        }
        // Exponer globalmente para barcode-system.js
        window.openVariationModal = openVariationModal;

        const addVariationBtn = document.getElementById('add-variation-to-cart-btn');
        if (addVariationBtn) {
            addVariationBtn.addEventListener('click', async () => {
                // El carrito vive en src/admin/secciones/ventas.js (carga diferida).
                await window.asegurarModuloVentas?.();
                const productId = document.getElementById('variation-product-id').value;
                const nombre = document.getElementById('variation-product-name').value;
                const precio = parseFloat(document.getElementById('variation-product-price').value);
                const product = localProductsMap.get(productId);
                const tieneVariaciones = Array.isArray(product?.variaciones) && product.variaciones.length > 0;
                const selectTallaEl = document.getElementById('select-talla');
                const selectColorEl = document.getElementById('select-color');
                const talla = tieneVariaciones ? selectTallaEl.value : '';
                const color = tieneVariaciones ? selectColorEl.value : '';

                if (!productId || !nombre || !precio || (tieneVariaciones && (talla === '' || color === ''))) {
                    showToast("Error: Faltan datos", "error");
                    return;
                }

                window.agregarItemAlCarrito(
                    productId,
                    nombre,
                    1,
                    precio,
                    talla,
                    color,
                    tieneVariaciones ? `${nombre} (${talla}/${color})` : nombre
                );

                // Registrar lo agregado y dejar el modal abierto para poder
                // seguir eligiendo más colores/tallas de la misma prenda.
                const existingAdded = variationAddedItems.find(it => it.talla === talla && it.color === color);
                if (existingAdded) {
                    existingAdded.cantidad += 1;
                } else {
                    variationAddedItems.push({ talla, color, cantidad: 1 });
                }
                renderVariationAddedList();
                showToast(tieneVariaciones ? `"${nombre}" (${normalizeTalla(talla)}/${normalizeColor(color)}) agregado` : `"${nombre}" agregado`, "success");

                if (!tieneVariaciones) return;

                // Reiniciar la selección de color para permitir agregar otro color rápidamente.
                const selectColor = document.getElementById('select-color');
                const stockDisplay = document.getElementById('variation-stock-display');
                if (selectColor) selectColor.value = '';
                if (stockDisplay) stockDisplay.style.display = 'none';
                addVariationBtn.disabled = true;
                if (selectColor) selectColor.focus();
            });
        }

        // --- LÓGICA DE FILTROS DE INVENTARIO ---
        const searchInputInventory = document.getElementById('search-inventory');
        const categorySelectInventory = document.getElementById('filter-category-inventory');
        const supplierSelectInventory = document.getElementById('filter-supplier-inventory');
        const lowStockCheckbox = document.getElementById('filter-low-stock-inventory');
        const clearFiltersBtn = document.getElementById('clear-filters-inventory');
        const inventoryBody = document.getElementById('lista-inventario-productos');

        function loadCategoriesForFilter() {
            subscribeCategories((snapshot) => {
                categoriesMap.clear();
                snapshot.forEach(doc => {
                    categoriesMap.set(doc.id, doc.data().nombre);
                });

                // Filtro "Categoría" de la pestaña Productos (valor = id de
                // la categoría), conservando la que estuviera elegida.
                if (categorySelectInventory) {
                    const actual = categorySelectInventory.value;
                    categorySelectInventory.innerHTML = '<option value="">Todas las categorías</option>';
                    snapshot.forEach(doc => {
                        const option = document.createElement('option');
                        option.value = doc.id;
                        option.textContent = doc.data().nombre || 'Sin nombre';
                        categorySelectInventory.appendChild(option);
                    });
                    categorySelectInventory.value = actual;
                    if (categorySelectInventory.value !== actual) categorySelectInventory.value = '';
                }
            });
        }

        function loadSuppliersForFilter() {
            subscribeSuppliers((snapshot) => {
                if (!supplierSelectInventory) return;

                // Mantener la opción "Todos los Proveedores"
                const currentValue = supplierSelectInventory.value;
                supplierSelectInventory.innerHTML = '<option value="">Todos los Proveedores</option>';

                snapshot.forEach(doc => {
                    const supplier = doc.data();
                    const option = document.createElement('option');
                    option.value = supplier.nombre; // Usar nombre en vez de ID
                    option.textContent = supplier.nombre || 'Sin nombre';
                    supplierSelectInventory.appendChild(option);
                });

                // Restaurar valor seleccionado si existe
                if (currentValue) {
                    supplierSelectInventory.value = currentValue;
                }
            });
        }

        function applyInventoryFilters() {
            if (!inventoryBody) return;

            const searchVal = searchInputInventory ? searchInputInventory.value.toLowerCase() : '';
            const categoryVal = categorySelectInventory ? categorySelectInventory.value : '';
            const supplierVal = supplierSelectInventory ? supplierSelectInventory.value : '';
            const showLowStockOnly = lowStockCheckbox ? lowStockCheckbox.checked : false;

            const allRows = inventoryBody.querySelectorAll('.pf-card[data-id]');
            let hasVisibleRows = false;

            allRows.forEach(row => {
                const productId = row.dataset.id;
                const product = localProductsMap.get(productId);
                if (!product) {
                    row.style.display = 'none';
                    return;
                }

                const productName = (product.nombre || '').toLowerCase();
                const productCode = (product.codigo || '').toLowerCase();
                const categoryId = product.categoriaId || '';
                const supplierName = (product.proveedor || '').trim(); // Usar proveedor en vez de proveedorId

                // Calcular stock total del producto
                const stockTotal = obtenerStockTotalProducto(product);

                const matchesSearch = productName.includes(searchVal) || productCode.includes(searchVal);
                const matchesCategory = (categoryVal === '' || categoryId === categoryVal);
                const matchesSupplier = (supplierVal === '' || supplierName === supplierVal);
                // Filtro de pocas unidades (LÓGICA CORRECTA):
                // Switch PRENDIDO (showLowStockOnly = true): muestra SOLO productos con stock <= 2
                // Switch APAGADO (showLowStockOnly = false): muestra TODOS los productos
                const matchesLowStock = showLowStockOnly ? (stockTotal <= 2) : true;

                if (matchesSearch && matchesCategory && matchesSupplier && matchesLowStock) {
                    row.style.display = '';
                    hasVisibleRows = true;
                } else {
                    row.style.display = 'none';
                }
            });

            const emptyRow = document.getElementById('empty-inventory-row');
            if (emptyRow) {
                if (!hasVisibleRows && allRows.length) {
                    emptyRow.innerHTML = '<i class="bi bi-search"></i><strong>Sin resultados</strong><span>Prueba con otro nombre o quita los filtros.</span>';
                }
                emptyRow.style.display = hasVisibleRows ? 'none' : '';
            }
        }

        if (searchInputInventory) searchInputInventory.addEventListener('input', applyInventoryFilters);
        if (categorySelectInventory) categorySelectInventory.addEventListener('change', applyInventoryFilters);
        if (supplierSelectInventory) supplierSelectInventory.addEventListener('change', applyInventoryFilters);
        if (lowStockCheckbox) lowStockCheckbox.addEventListener('change', applyInventoryFilters);
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInputInventory) searchInputInventory.value = '';
                if (categorySelectInventory) categorySelectInventory.value = '';
                if (supplierSelectInventory) supplierSelectInventory.value = '';
                if (lowStockCheckbox) lowStockCheckbox.checked = false;
                applyInventoryFilters();
            });
        }

        loadCategoriesForFilter();
        loadSuppliersForFilter();

        // ========================================================================
        // GESTIÓN DE PROMOCIONES DESDE INVENTARIO
        // ========================================================================

        const promoModal = document.getElementById('promoModal');
        const promoModalInstance = promoModal ? new bootstrap.Modal(promoModal) : null;

        const promoProductIdInput = document.getElementById('promo-product-id');
        const promoProductPriceInput = document.getElementById('promo-product-price');
        const promoProductNameEl = document.getElementById('promo-product-name');
        const promoPriceNormalEl = document.getElementById('promo-price-normal');

        const promoTypePercentage = document.getElementById('promo-type-percentage');
        const promoTypeFixed = document.getElementById('promo-type-fixed');
        const promoPercentageSection = document.getElementById('promo-percentage-section');
        const promoFixedSection = document.getElementById('promo-fixed-section');

        const promoDiscountPercentageInput = document.getElementById('promo-discount-percentage');
        const promoFixedPriceInput = document.getElementById('promo-fixed-price');
        const promoActiveCheckbox = document.getElementById('promo-active');

        const promoFinalPricePercentageEl = document.getElementById('promo-final-price-percentage');
        const promoSavingsFixedEl = document.getElementById('promo-savings-fixed');

        const btnSavePromo = document.getElementById('btn-save-promo');
        const btnRemovePromo = document.getElementById('btn-remove-promo');

        // Cambiar entre tipo de promoción
        if (promoTypePercentage && promoTypeFixed) {
            promoTypePercentage.addEventListener('change', () => {
                if (promoPercentageSection && promoFixedSection) {
                    promoPercentageSection.style.display = 'block';
                    promoFixedSection.style.display = 'none';
                }
            });

            promoTypeFixed.addEventListener('change', () => {
                if (promoPercentageSection && promoFixedSection) {
                    promoPercentageSection.style.display = 'none';
                    promoFixedSection.style.display = 'block';
                }
            });
        }

        // Calcular precio final con descuento porcentual
        if (promoDiscountPercentageInput) {
            promoDiscountPercentageInput.addEventListener('input', () => {
                const normalPrice = parseFloat(promoProductPriceInput.value) || 0;
                const discount = parseFloat(promoDiscountPercentageInput.value) || 0;
                const finalPrice = normalPrice * (1 - discount / 100);
                promoFinalPricePercentageEl.textContent = formatoMoneda.format(finalPrice);
            });
        }

        // Calcular ahorro con precio fijo
        if (promoFixedPriceInput) {
            promoFixedPriceInput.addEventListener('input', () => {
                const normalPrice = parseFloat(promoProductPriceInput.value) || 0;
                const promoPrice = parseFloat(promoFixedPriceInput.value) || 0;
                const savings = normalPrice - promoPrice;
                promoSavingsFixedEl.textContent = formatoMoneda.format(Math.max(0, savings));
            });
        }

        // Event listener para botones de gestionar promoción
        if (productListTableBody) {
            productListTableBody.addEventListener('click', async (e) => {
                const btn = e.target.closest('.btn-manage-promo');
                if (!btn) return;

                const tr = btn.closest('[data-id]');
                const productId = tr.dataset.id;
                const product = localProductsMap.get(productId);

                if (!product || !promoModalInstance) return;

                // Rellenar datos del modal
                promoProductIdInput.value = productId;
                promoProductPriceInput.value = product.precioDetal || 0;
                promoProductNameEl.textContent = product.nombre;
                promoPriceNormalEl.textContent = formatoMoneda.format(product.precioDetal || 0);

                // Si ya tiene promoción, cargar datos
                if (product.promocion && product.promocion.activa) {
                    btnRemovePromo.style.display = 'inline-block';
                    promoActiveCheckbox.checked = false; // Invertido para corregir lógica

                    if (product.promocion.tipo === 'porcentaje') {
                        promoTypePercentage.checked = true;
                        promoPercentageSection.style.display = 'block';
                        promoFixedSection.style.display = 'none';
                        promoDiscountPercentageInput.value = product.promocion.descuento;

                        const finalPrice = product.precioDetal * (1 - product.promocion.descuento / 100);
                        promoFinalPricePercentageEl.textContent = formatoMoneda.format(finalPrice);
                    } else {
                        promoTypeFixed.checked = true;
                        promoPercentageSection.style.display = 'none';
                        promoFixedSection.style.display = 'block';
                        promoFixedPriceInput.value = product.promocion.precioFijo || 0;

                        const savings = product.precioDetal - (product.promocion.precioFijo || 0);
                        promoSavingsFixedEl.textContent = formatoMoneda.format(Math.max(0, savings));
                    }
                } else {
                    // Nueva promoción
                    btnRemovePromo.style.display = 'none';
                    promoActiveCheckbox.checked = false; // Invertido para corregir lógica
                    promoTypePercentage.checked = true;
                    promoPercentageSection.style.display = 'block';
                    promoFixedSection.style.display = 'none';
                    promoDiscountPercentageInput.value = 10;
                    promoFixedPriceInput.value = '';

                    const finalPrice = product.precioDetal * 0.9;
                    promoFinalPricePercentageEl.textContent = formatoMoneda.format(finalPrice);
                }

                promoModalInstance.show();
            });
        }

        // Guardar promoción
        if (btnSavePromo) {
            btnSavePromo.addEventListener('click', async () => {
                const productId = promoProductIdInput.value;
                const isActive = !promoActiveCheckbox.checked; // Invertido para corregir lógica
                const isPercentage = promoTypePercentage.checked;

                let promocion = {
                    activa: isActive,
                    tipo: isPercentage ? 'porcentaje' : 'fijo'
                };

                if (isPercentage) {
                    promocion.descuento = parseFloat(promoDiscountPercentageInput.value) || 0;
                } else {
                    promocion.precioFijo = parseFloat(promoFixedPriceInput.value) || 0;
                }

                try {
                    const productRef = doc(productsCollection, productId);
                    await updateDoc(productRef, { promocion });

                    showToast('Promoción actualizada correctamente', 'success');
                    promoModalInstance.hide();
                } catch (error) {
                    console.error('Error al guardar promoción:', error);
                    showToast('Error al guardar la promoción', 'error');
                }
            });
        }

        // Quitar promoción
        if (btnRemovePromo) {
            btnRemovePromo.addEventListener('click', async () => {
                const productId = promoProductIdInput.value;

                try {
                    const productRef = doc(productsCollection, productId);
                    await updateDoc(productRef, {
                        promocion: deleteField()
                    });

                    showToast('Promoción eliminada correctamente', 'success');
                    promoModalInstance.hide();
                } catch (error) {
                    console.error('Error al eliminar promoción:', error);
                    showToast('Error al eliminar la promoción', 'error');
                }
            });
        }

    })();
    // Ventas → src/admin/secciones/ventas.js. window.asegurarModuloVentas()
    // lo carga desde otras partes que necesitan el carrito (pedidos web,
    // modal de variaciones, factura tras un abono) antes de entrar a Ventas.
    window.asegurarModuloVentas = cargarSeccionDiferida('#ventas', () => import('./src/admin/secciones/ventas.js?v=4'), { actualizarStock, apartadosCollection, aplicarFormatoDinero, coincideVariacion, cotizacionesCollection, crearCalendarioVentas, db, eliminarFormatoNumero, esProveedorBoutique, facturaAccionesModalInstance, facturaPreguntaModalInstance, formatoMoneda, loadExternalLib, localProductsMap, openWhatsApp, reconciliarStockEdicionVenta, repartidoresMap, salesCollection, showToast, subscribeCategories, viewSaleModalInstance });
    // Apartados → src/admin/secciones/apartados.js
    cargarSeccionDiferida('#apartados', () => import('./src/admin/secciones/apartados.js?v=2'), { abonoApartadoModalInstance, actualizarStock, apartadosCollection, db, eliminarFormatoNumero, formatoMoneda, localProductsMap, openWhatsApp, showToast, verApartadoModalInstance });
    // Finanzas (versión anterior: ingresos/gastos y cierre de caja) →
    // src/admin/secciones/finanzas-caja.js. Su pantalla ya no existe en
    // admin.html, pero igual consultaba las ventas del día al abrir el panel
    // y escuchaba todos los movimientos financieros al entrar a Finanzas.
    // Solo se carga si vuelve a aparecer alguno de sus elementos.
    if (['form-cierre-caja', 'form-add-income', 'form-add-expense', 'closing-today-view', 'lista-historial-cierres'].some(id => document.getElementById(id))) {
        cargarSeccionDiferida(null, () => import('./src/admin/secciones/finanzas-caja.js?v=1'), { alEntrarSeccion, closingsCollection, db, eliminarFormatoNumero, financesCollection, formatoMoneda, openWhatsApp, salesCollection, showToast });
    }

    // ========================================================================
    // CAJA TIPO POS (Registrar Venta): catálogo con foto a la izquierda.
    // Tocar un producto abre la misma elección de talla/color que el buscador
    // (openVariationModal), que lo agrega al ticket. El precio que se muestra
    // sigue el tipo de venta (detal o mayorista). Para no reconstruir cientos
    // de tarjetas con imagen en cada venta, solo se pinta con Ventas abierta
    // y de a POS_PAGINA productos ("Ver más" carga otros).
    // ========================================================================
    (() => {
        const gridEl = document.getElementById('pos-grid');
        const catsEl = document.getElementById('pos-cats');
        const searchEl = document.getElementById('pos-search');
        const tipoVentaEl = document.getElementById('tipo-venta-select');
        if (!gridEl) return;

        // Celular: pocos productos (los más vendidos) para no tener que
        // desplazarse; computador: una página más amplia.
        const esCelular = window.matchMedia('(max-width: 991.98px)');
        const tamPagina = () => (esCelular.matches ? 6 : 60);
        let POS_PAGINA = tamPagina();
        let categoriaActiva = '';
        let limite = POS_PAGINA;
        let sucio = true;
        esCelular.addEventListener?.('change', () => { POS_PAGINA = tamPagina(); limite = POS_PAGINA; if (!sucio) pintar(); });

        // Unidades vendidas por producto en los últimos 60 días (ventas no
        // anuladas). Se calcula al abrir Ventas y se refresca cada 10 minutos
        // como máximo; "ventas" del producto (pedidos web) queda de respaldo.
        const vendidos = new Map();
        let vendidosCargadosEn = 0;
        async function cargarMasVendidos() {
            if (Date.now() - vendidosCargadosEn < 10 * 60 * 1000) return;
            vendidosCargadosEn = Date.now();
            try {
                const desde = new Date();
                desde.setDate(desde.getDate() - 60);
                const snap = await getDocs(query(salesCollection, where('timestamp', '>=', Timestamp.fromDate(desde))));
                vendidos.clear();
                snap.forEach(docSnap => {
                    const venta = docSnap.data();
                    if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                    (venta.items || []).forEach(it => {
                        if (!it.productoId) return;
                        vendidos.set(it.productoId, (vendidos.get(it.productoId) || 0) + (parseInt(it.cantidad, 10) || 0));
                    });
                });
                if (!sucio) pintar();
            } catch (err) {
                vendidosCargadosEn = 0;
                console.error('Error calculando los más vendidos del POS:', err);
            }
        }
        const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

        function productosDisponibles() {
            const lista = [];
            localProductsMap.forEach((p, id) => {
                const stock = obtenerStockTotalProducto(p);
                if (stock > 0) lista.push({ id, p, stock });
            });
            const puntaje = ({ id, p }) => (vendidos.get(id) || 0) * 1000 + (p.ventas || 0);
            return lista.sort((a, b) => (puntaje(b) - puntaje(a)) || (a.p.nombre || '').localeCompare(b.p.nombre || ''));
        }

        function pintarCategorias(disponibles) {
            if (!catsEl) return;
            const nombres = window.categoriesMap || new Map();
            const conteo = new Map();
            disponibles.forEach(({ p }) => { if (p.categoriaId) conteo.set(p.categoriaId, (conteo.get(p.categoriaId) || 0) + 1); });
            if (categoriaActiva && !conteo.has(categoriaActiva)) categoriaActiva = '';
            const cats = [...conteo.keys()]
                .map(id => ({ id, nombre: nombres.get(id) || 'Sin categoría' }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            const capital = (t) => { const l = String(t).toLowerCase(); return l.charAt(0).toUpperCase() + l.slice(1); };
            catsEl.innerHTML = `<button type="button" class="pos-cat${categoriaActiva ? '' : ' active'}" data-cat="">Todos <b>${disponibles.length}</b></button>`
                + cats.map(c => `<button type="button" class="pos-cat${c.id === categoriaActiva ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(capital(c.nombre))} <b>${conteo.get(c.id)}</b></button>`).join('');
        }

        function pintar() {
            sucio = false;
            const disponibles = productosDisponibles();
            pintarCategorias(disponibles);
            const texto = normalizar(searchEl?.value);
            const mayorista = tipoVentaEl?.value === 'mayorista';
            const filtrados = disponibles.filter(({ p }) =>
                (!categoriaActiva || p.categoriaId === categoriaActiva) &&
                (!texto || normalizar(p.nombre).includes(texto) || normalizar(p.codigo).includes(texto) || String(p.codigoBarras || '').includes(texto)));

            const tituloGridEl = document.getElementById('pos-grid-title');
            if (tituloGridEl) {
                const nombreCat = categoriaActiva ? ((window.categoriesMap || new Map()).get(categoriaActiva) || '') : '';
                tituloGridEl.textContent = texto ? `Resultados (${filtrados.length})`
                    : (nombreCat ? `Lo más vendido · ${nombreCat.charAt(0).toUpperCase() + nombreCat.slice(1).toLowerCase()}` : 'Lo más vendido');
            }
            if (!filtrados.length) {
                gridEl.innerHTML = `<div class="pos-grid-empty"><i class="bi bi-${texto || categoriaActiva ? 'search' : 'box-seam'}"></i> ${texto || categoriaActiva ? 'Sin resultados' : 'No hay productos con stock'}</div>`;
                return;
            }
            const visibles = filtrados.slice(0, limite);
            gridEl.innerHTML = visibles.map(({ id, p, stock }) => {
                const precio = mayorista && p.precioMayor ? p.precioMayor : (p.precioDetal || 0);
                const img = p.imagenUrl
                    ? `<img src="${esc(urlMiniatura(p))}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'bi bi-image'}))">`
                    : '<i class="bi bi-image"></i>';
                return `<button type="button" class="pos-tile" data-id="${id}" title="${esc(p.nombre)}">
                    <span class="pos-tile-img">${img}<span class="pos-tile-stock${stock <= 2 ? ' is-low' : ''}">${stock}</span></span>
                    <span class="pos-tile-name">${esc(p.nombre || 'Sin nombre')}</span>
                    <span class="pos-tile-price">${formatoMoneda.format(precio)}</span>
                </button>`;
            }).join('') + (filtrados.length > visibles.length
                ? `<button type="button" class="pos-more" id="pos-more">Ver más (${filtrados.length - visibles.length})</button>` : '');
        }

        function pintarSiVisible() {
            if ((window.location.hash || '#dashboard') === '#ventas') pintar();
            else sucio = true;
        }

        gridEl.addEventListener('click', (e) => {
            if (e.target.closest('#pos-more')) { limite += POS_PAGINA; pintar(); return; }
            const tile = e.target.closest('.pos-tile');
            if (tile && typeof window.openVariationModal === 'function') window.openVariationModal(tile.dataset.id);
        });
        catsEl?.addEventListener('click', (e) => {
            const btn = e.target.closest('.pos-cat');
            if (!btn) return;
            categoriaActiva = btn.dataset.cat;
            limite = POS_PAGINA;
            pintar();
        });
        let busquedaTimer;
        searchEl?.addEventListener('input', () => {
            clearTimeout(busquedaTimer);
            busquedaTimer = setTimeout(() => { limite = POS_PAGINA; pintar(); }, 150);
        });
        tipoVentaEl?.addEventListener('change', pintarSiVisible);
        window.addEventListener('admin:productos-actualizados', pintarSiVisible);
        alEntrarSeccion('#ventas', () => { if (sucio) pintar(); cargarMasVendidos(); });

        // Celular: barra fija con el total que lleva al ticket.
        const barra = document.getElementById('pos-mobile-bar');
        const totalEl = document.getElementById('venta-total');
        const countEl = document.getElementById('venta-items-count');
        const barraTotal = document.getElementById('pos-mobile-total');
        const barraCount = document.getElementById('pos-mobile-count');
        const sincronizarBarra = () => {
            if (barraTotal && totalEl) barraTotal.textContent = totalEl.textContent;
            if (barraCount && countEl) barraCount.textContent = parseInt(countEl.textContent, 10) || 0;
        };
        if (totalEl) new MutationObserver(sincronizarBarra).observe(totalEl, { childList: true, characterData: true, subtree: true });
        if (countEl) new MutationObserver(sincronizarBarra).observe(countEl, { childList: true, characterData: true, subtree: true });
        sincronizarBarra();
        barra?.addEventListener('click', () => {
            document.getElementById('form-venta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    })();

    // Título de Ventas según la vista, como en Registrar Venta de Fábrica.
    (() => {
        const tituloEl = document.getElementById('ventas-view-title');
        const titulos = {
            'toggle-sales-form-view-btn': 'Nueva venta',
            'toggle-sales-list-view-btn': 'Historial de ventas',
            'toggle-sales-quotes-view-btn': 'Cotizaciones'
        };
        Object.entries(titulos).forEach(([id, titulo]) => {
            document.getElementById(id)?.addEventListener('click', () => {
                if (tituloEl) tituloEl.textContent = titulo;
            });
        });
    })();

    // ========================================================================
    // --- SCRIPTS DE UI (Toggles, Domicilio) ---
    // ========================================================================
    (() => {
        const fV_prod = document.getElementById('form-view'); const iV_prod = document.getElementById('inventory-view'); const tIB_prod = document.getElementById('toggle-inventory-view-btn'); const tFB_prod = document.getElementById('toggle-form-view-btn'); if(fV_prod && iV_prod && tIB_prod && tFB_prod){ tIB_prod.addEventListener('click',(e)=>{ e.preventDefault(); fV_prod.style.display='none'; iV_prod.style.display='block'; tIB_prod.classList.add('active'); tFB_prod.classList.remove('active');}); tFB_prod.addEventListener('click',(e)=>{ e.preventDefault(); iV_prod.style.display='none'; fV_prod.style.display='block'; tFB_prod.classList.add('active'); tIB_prod.classList.remove('active'); window.clearProductForm(); }); iV_prod.style.display='block'; tIB_prod.classList.add('active'); } else { console.warn("Product view toggle missing."); }
        const sFV = document.getElementById('sales-form-view'); const sLV = document.getElementById('sales-list-view'); const sQV = document.getElementById('sales-quotes-view'); const tSLB = document.getElementById('toggle-sales-list-view-btn'); const tSFB = document.getElementById('toggle-sales-form-view-btn'); const tSQB = document.getElementById('toggle-sales-quotes-view-btn'); if(sFV && sLV && tSLB && tSFB){ const salesViews = [sFV, sLV, sQV].filter(Boolean); const salesTabs = [tSFB, tSLB, tSQB].filter(Boolean); const showSalesView = (view, tab) => { salesViews.forEach(v => v.style.display = 'none'); salesTabs.forEach(t => t.classList.remove('active')); if (view) view.style.display = 'block'; if (tab) tab.classList.add('active'); }; tSLB.addEventListener('click',(e)=>{ e.preventDefault(); showSalesView(sLV, tSLB); }); tSFB.addEventListener('click',(e)=>{ e.preventDefault(); showSalesView(sFV, tSFB); }); if (tSQB) tSQB.addEventListener('click',(e)=>{ e.preventDefault(); showSalesView(sQV, tSQB); }); showSalesView(sFV, tSFB); } else { console.warn("Sales view toggle missing."); }
         const todayViewR = document.getElementById('delivery-today-view'); const historyViewR = document.getElementById('delivery-history-view'); const toggleHistoryBtnR = document.getElementById('toggle-delivery-history-btn'); const toggleTodayBtnR = document.getElementById('toggle-delivery-today-btn'); if (todayViewR && historyViewR && toggleHistoryBtnR && toggleTodayBtnR) { toggleHistoryBtnR.addEventListener('click', (e) => { e.preventDefault(); todayViewR.style.display = 'none'; historyViewR.style.display = 'block'; toggleHistoryBtnR.classList.add('active'); toggleTodayBtnR.classList.remove('active'); }); toggleTodayBtnR.addEventListener('click', (e) => { e.preventDefault(); historyViewR.style.display = 'none'; todayViewR.style.display = 'block'; toggleTodayBtnR.classList.add('active'); toggleHistoryBtnR.classList.remove('active'); }); todayViewR.style.display = 'block'; toggleTodayBtnR.classList.add('active'); } else { console.warn("Delivery view toggle missing."); }
        const tCV = document.getElementById('closing-today-view'); const hCV = document.getElementById('closing-history-view'); const tHB = document.getElementById('toggle-closing-history-btn'); const tTB = document.getElementById('toggle-closing-today-btn'); if (tCV && hCV && tHB && tTB) { tHB.addEventListener('click', (e) => { e.preventDefault(); tCV.style.display = 'none'; hCV.style.display = 'block'; tHB.classList.add('active'); tTB.classList.remove('active'); }); tTB.addEventListener('click', (e) => { e.preventDefault(); hCV.style.display = 'none'; tCV.style.display = 'block'; tTB.classList.add('active'); tHB.classList.remove('active'); }); tCV.style.display = 'block'; tTB.classList.add('active'); } else { console.warn("Finance closing view toggle missing."); }
                        
        const tES = document.getElementById('tipo-entrega-select'); const dFD = document.querySelector('.delivery-fields'); const cRI = document.getElementById('costo-ruta'); const vCI_fill = document.getElementById('venta-cliente'); const cCI_fill = document.getElementById('venta-cliente-celular'); const cDI_fill = document.getElementById('venta-cliente-direccion'); 
        document.addEventListener('clientsLoaded', (event) => { localClientsMap = event.detail.clientsMap; window.fillClientInfoSales(); }); 
        function tDF() { if (dFD && tES && cRI) { if (tES.value === 'domicilio') { dFD.style.display = 'flex'; } else { dFD.style.display = 'none'; cRI.value = 0; } } else { console.warn("Missing delivery elements."); } } 
        function fCIS_UI() { if (!vCI_fill || !cCI_fill || !cDI_fill) return; const sV = vCI_fill.value; const cI = localClientsMap.get(sV); if (cI) { cCI_fill.value = cI.celular; cDI_fill.value = cI.direccion; } else { cCI_fill.value = ""; cDI_fill.value = ""; } } 
        if(tES) tES.addEventListener('change', tDF); if(vCI_fill) vCI_fill.addEventListener('input', fCIS_UI); tDF(); fCIS_UI();

        const navLinks = document.querySelectorAll('#adminNavbarContent .nav-link');
        const navCollapse = document.getElementById('adminNavbarContent');
        if (navCollapse) {
            const bsCollapse = new bootstrap.Collapse(navCollapse, { toggle: false });
            navLinks.forEach((link) => {
                link.addEventListener('click', () => {
                    if (navCollapse.classList.contains('show')) {
                        bsCollapse.hide();
                    }
                });
            });
        }

    })();

    // ========================================================================
    // ✅ --- SECCIÓN 5: DASHBOARD FUNCIONAL ---
    // ========================================================================
// ========================================================================

(() => {
    console.log("🎯 Inicializando Dashboard...");
    
    // Referencias a elementos DOM
    const dbVentasHoyEl = document.getElementById('db-ventas-hoy');
    const dbBajoStockEl = document.getElementById('db-bajo-stock');
    const dbApartadosVencerEl = document.getElementById('db-apartados-vencer');
    
    // Validar que los elementos existan
    if (!dbVentasHoyEl || !dbBajoStockEl || !dbApartadosVencerEl) {
        console.error("❌ ERROR: Elementos del Dashboard no encontrados en el HTML");
        console.log("Verificando elementos:");
        console.log("- db-ventas-hoy:", !!dbVentasHoyEl);
        console.log("- db-bajo-stock:", !!dbBajoStockEl);
        console.log("- db-apartados-vencer:", !!dbApartadosVencerEl);
        return;
    }

    // ================================================================
    // ⏳ SALVAVIDAS DE CARGA: si los listeners iniciales (productos,
    // apartados, ventas del rango) no responden en 12s -red lenta o
    // conexión atascada-, se muestra un aviso con botón de reintentar en
    // vez de dejar las tarjetas en "0" sin explicación (mismo criterio que
    // el salvavidas de la tienda pública en app.js).
    // ================================================================
    const dashboardSlowBannerEl = document.getElementById('dashboard-slow-banner');
    const dashboardListosPendientes = new Set(['productos', 'apartados', 'ventasRango']);
    let dashboardPrimeraCargaLista = false;
    function marcarDashboardListo(clave) {
        dashboardListosPendientes.delete(clave);
        if (dashboardListosPendientes.size === 0) {
            dashboardPrimeraCargaLista = true;
            dashboardSlowBannerEl?.classList.add('d-none');
        }
    }
    setTimeout(() => {
        if (!dashboardPrimeraCargaLista) {
            dashboardSlowBannerEl?.classList.remove('d-none');
        }
    }, 12000);

    // Mismo patrón que DASHBOARD_VENTAS_CACHE_* (más abajo) para el resto de
    // tarjetas del Dashboard: pintar de inmediato la última cifra conocida
    // (guardada en localStorage) mientras se confirma el dato real de
    // Firestore, en vez de mostrar "0". Se usa innerHTML (no textContent)
    // porque "Utilidad potencial" incluye un ícono además del texto.
    function cachearDashboard(clave, ids) {
        try {
            const valores = {};
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) valores[id] = el.innerHTML;
            });
            localStorage.setItem('mishellDashboardCache_' + clave, JSON.stringify(valores));
        } catch (e) { /* localStorage puede fallar (privado/lleno); no es crítico */ }
    }
    function pintarCacheDashboard(clave, ids) {
        try {
            const valores = JSON.parse(localStorage.getItem('mishellDashboardCache_' + clave) || 'null');
            if (!valores) return;
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el && valores[id] !== undefined) {
                    el.innerHTML = valores[id];
                    el.classList.add('db-valor-en-cache');
                }
            });
        } catch (e) { /* ignorar */ }
    }

    // ================================================================
    // 1️⃣ VENTAS DEL PERÍODO (Hoy / Semana / Mes / Año)
    // ================================================================
    let unsubscribeVentasRango = null;

    function obtenerRangoFechas(rango) {
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);

        if (rango === 'week') {
            const diaSemana = inicio.getDay(); // 0 = domingo
            const desplazamiento = diaSemana === 0 ? 6 : diaSemana - 1; // semana inicia lunes
            inicio.setDate(inicio.getDate() - desplazamiento);
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

    const ETIQUETAS_RANGO_VENTAS = {
        today: 'Ventas de hoy',
        week: 'Ventas esta semana',
        month: 'Ventas este mes',
        year: 'Ventas este año'
    };

    // Última cifra confirmada por rango (Hoy/Semana/Mes/Año), para pintarla
    // de inmediato al entrar mientras se espera la confirmación real de
    // Firestore — en vez de mostrar "0" durante los varios segundos que
    // puede tardar esa primera conexión en redes lentas. Los valores en
    // caché se marcan con la clase 'db-valor-en-cache' (opacidad reducida)
    // hasta que llega la confirmación real, que la quita.
    const DASHBOARD_VENTAS_CACHE_KEY = 'mishellDashboardVentasCache_v1';
    const DASHBOARD_VENTAS_CACHE_IDS = [
        'db-ventas-hoy', 'db-ventas-count', 'db-ticket-promedio',
        'db-boutique-ganancia', 'db-ganancia-detalle'
    ];

    function guardarCacheVentasRango(rango) {
        try {
            const valores = {};
            DASHBOARD_VENTAS_CACHE_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) valores[id] = el.textContent;
            });
            const cache = JSON.parse(localStorage.getItem(DASHBOARD_VENTAS_CACHE_KEY) || '{}');
            cache[rango] = valores;
            localStorage.setItem(DASHBOARD_VENTAS_CACHE_KEY, JSON.stringify(cache));
        } catch (e) { /* localStorage puede fallar (privado/lleno); no es crítico */ }
    }

    function pintarCacheVentasRango(rango) {
        try {
            const cache = JSON.parse(localStorage.getItem(DASHBOARD_VENTAS_CACHE_KEY) || '{}');
            const valores = cache[rango];
            if (!valores) return;
            DASHBOARD_VENTAS_CACHE_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el && valores[id] !== undefined) {
                    el.textContent = valores[id];
                    el.classList.add('db-valor-en-cache');
                }
            });
        } catch (e) { /* ignorar */ }
    }

    async function calcularVentasRango(rango = 'today') {
        console.log(`📊 Calculando ventas del período: ${rango}...`);

        if (unsubscribeVentasRango) {
            unsubscribeVentasRango();
            unsubscribeVentasRango = null;
        }

        const tituloEl = document.getElementById('db-ventas-periodo-title');
        if (tituloEl) tituloEl.textContent = ETIQUETAS_RANGO_VENTAS[rango] || 'Ventas hoy';

        // Mostrar de inmediato la última cifra confirmada para este rango
        // (si hay) mientras se espera la respuesta real de Firestore.
        pintarCacheVentasRango(rango);

        try {
            const { inicio, fin } = obtenerRangoFechas(rango);

            // Costo de cada producto y movimientos manuales de Fábrica del rango:
            // antes se esperaban los DOS completos (incluyendo bajar toda la
            // colección movimientosFabrica sin filtrar) antes de siquiera abrir
            // el listener de ventas — así que si esa descarga era lenta, el
            // "banner de carga lenta" del dashboard salía aunque las ventas ya
            // hubieran llegado. Ahora se piden en paralelo CON el listener de
            // ventas (no antes) y solo se esperan justo al usarlas, dentro del
            // callback; abrir el listener ya no depende de esta descarga.
            // ⚠️ IMPORTANTE: Solo filtrar por UN campo con desigualdad
            // NO podemos filtrar por timestamp Y estado al mismo tiempo
            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(inicio)),
                where('timestamp', '<', Timestamp.fromDate(fin)),
                orderBy('timestamp', 'desc')
            );

            // Escuchar cambios en tiempo real
            unsubscribeVentasRango = onSnapshot(q,
                async (snapshot) => {
                    // Una reconexión de red (celular con señal inestable) puede
                    // entregar primero un snapshot vacío "fromCache" un instante
                    // antes del real, lo que hacía que la tarjeta volviera a "0"
                    // para corregirse sola un segundo después. Se ignora ese caso
                    // vacío-de-caché y se espera al snapshot real (del servidor o
                    // ya con datos) en vez de pintar el falso cero.
                    if (snapshot.metadata.fromCache && snapshot.empty) return;
                    marcarDashboardListo('ventasRango');

                    let totalDineroRecibido = 0;
                    let ventasContadas = 0;
                    let gananciaRealAcumulada = 0;

                    snapshot.forEach(doc => {
                        const venta = doc.data();
                        const estado = venta.estado || '';

                        // Las ventas mayoristas no son de Boutique — se excluyen por
                        // completo de este dashboard (le pertenecen al tenant Fábrica).
                        if (venta.tipoVenta === 'mayorista') return;

                        // ✅ Filtrar el estado AQUÍ en el cliente
                        if (estado !== 'Anulada' && estado !== 'Cancelada') {
                            // Sumar solo el dinero recibido (efectivo + transferencia)
                            // NO el total de la venta
                            const efectivo = venta.pagoEfectivo || 0;
                            const transferencia = venta.pagoTransferencia || 0;
                            const recibido = efectivo + transferencia;

                            ventasContadas++;

                            // "Ganancia real": plata que realmente entra por la venta
                            // (efectivo + transferencia, ya con cualquier descuento
                            // aplicado), sin restar ningún costo.
                            totalDineroRecibido += recibido;
                            gananciaRealAcumulada += recibido;
                        }
                    });

                    // 💰 SUMAR ABONOS DEL PERÍODO desde la colección 'abonos'
                    try {
                        const qAbonos = query(
                            collection(db, 'abonos'),
                            where('timestamp', '>=', Timestamp.fromDate(inicio)),
                            where('timestamp', '<', Timestamp.fromDate(fin))
                        );
                        const abonosSnap = await getDocs(qAbonos);

                        abonosSnap.forEach(doc => {
                            const abono = doc.data();
                            totalDineroRecibido += (abono.monto || 0);
                        });

                        console.log(`✅ Abonos del período sumados: ${abonosSnap.size} abonos`);
                    } catch (err) {
                        console.error('Error sumando abonos del período:', err);
                    }

                    // Actualizar UI
                    dbVentasHoyEl.textContent = formatoMoneda.format(totalDineroRecibido);
                    dbVentasHoyEl.classList.remove('text-danger');

                    // Actualizar contador de ventas
                    const dbVentasCountEl = document.getElementById('db-ventas-count');
                    if (dbVentasCountEl) {
                        dbVentasCountEl.textContent = `${ventasContadas} ${ventasContadas === 1 ? 'venta' : 'ventas'}`;
                    }
                    const dbTicketEl = document.getElementById('db-ticket-promedio');
                    if (dbTicketEl) {
                        dbTicketEl.textContent = formatoMoneda.format(ventasContadas ? Math.round(totalDineroRecibido / ventasContadas) : 0);
                    }

                    // 💸 RESTAR/SUMAR GASTOS E INGRESOS OPERATIVOS del período (arriendo,
                    // luz, rollos de tela, etc.) registrados a mano en Finanzas > Gastos
                    // e Ingresos (colección movimientosBoutique). Sin esto, "Ganancia real"
                    // terminaba siendo idéntica a "Ventas hoy" (no restaba nada).
                    // Se trae toda la colección (mismo patrón que usa el módulo Finanzas
                    // para este mismo dato) y se filtra aquí por su fecha efectiva, porque
                    // el campo 'fecha' (elegido a mano al registrar el movimiento) puede
                    // no coincidir con 'timestamp' (momento de creación del registro).
                    let gastosOperativos = 0;
                    let ingresosOperativos = 0;
                    try {
                        const tenantId = window.expectedTenantId;
                        const movClauses = [orderBy('timestamp', 'desc')];
                        if (tenantId) movClauses.unshift(where('tenantId', '==', tenantId));
                        const movSnap = await getDocs(query(boutiqueCollection, ...movClauses));

                        movSnap.forEach(docSnap => {
                            const mov = docSnap.data();
                            const fechaMov = mov.fecha?.toDate ? mov.fecha.toDate() : (mov.timestamp?.toDate ? mov.timestamp.toDate() : null);
                            if (!fechaMov || fechaMov < inicio || fechaMov >= fin) return;

                            const monto = parseFloat(mov.monto) || 0;
                            if (mov.tipo === 'gasto') gastosOperativos += monto;
                            else if (mov.tipo === 'ingreso') ingresosOperativos += monto;
                        });
                    } catch (err) {
                        console.error('Error sumando gastos/ingresos operativos del período:', err);
                    }

                    // "Ganancia real": plata que entró por las ventas al detal (ya con
                    // descuentos aplicados), más otros ingresos operativos y menos los
                    // gastos operativos del mismo período (arriendo, luz, telas, etc.).
                    const gananciaRealBoutique = gananciaRealAcumulada + ingresosOperativos - gastosOperativos;
                    const dbBoutiqueGananciaEl = document.getElementById('db-boutique-ganancia');
                    if (dbBoutiqueGananciaEl) {
                        dbBoutiqueGananciaEl.textContent = formatoMoneda.format(gananciaRealBoutique);
                        dbBoutiqueGananciaEl.classList.toggle('text-danger', gananciaRealBoutique < 0);
                    }

                    const dbGananciaDetalleEl = document.getElementById('db-ganancia-detalle');
                    if (dbGananciaDetalleEl) {
                        if (gastosOperativos > 0 || ingresosOperativos > 0) {
                            const partes = [`− ${formatoMoneda.format(gastosOperativos)} gastos`];
                            if (ingresosOperativos > 0) partes.push(`+ ${formatoMoneda.format(ingresosOperativos)} otros ingresos`);
                            dbGananciaDetalleEl.textContent = partes.join(' · ');
                        } else {
                            dbGananciaDetalleEl.textContent = 'Sin gastos registrados';
                        }
                    }

                    // Ya llegó la confirmación real: quitar la marca de "valor en
                    // caché" y guardar esta cifra como la nueva última confirmada
                    // para este rango (para la próxima vez que se entre al Dashboard).
                    DASHBOARD_VENTAS_CACHE_IDS.forEach(id => document.getElementById(id)?.classList.remove('db-valor-en-cache'));
                    guardarCacheVentasRango(rango);

                    console.log(`✅ Ventas (${rango}) detal (dinero recibido): ${formatoMoneda.format(totalDineroRecibido)} (${ventasContadas} ventas) | Ganancia real (neta de gastos operativos): ${formatoMoneda.format(gananciaRealBoutique)} (gastos: ${formatoMoneda.format(gastosOperativos)}, otros ingresos: ${formatoMoneda.format(ingresosOperativos)})`);
                },
                (error) => {
                    marcarDashboardListo('ventasRango');
                    console.error("❌ Error al calcular ventas del período:", error);
                    window.reportConnError?.('dashboard-ventas', error);
                    dbVentasHoyEl.textContent = "Error";
                    dbVentasHoyEl.classList.remove('db-valor-en-cache');
                    dbVentasHoyEl.classList.add('text-danger');
                }
            );

        } catch (error) {
            marcarDashboardListo('ventasRango');
            console.error("❌ Error fatal al configurar ventas del período:", error);
            window.reportConnError?.('dashboard-ventas', error);
            dbVentasHoyEl.textContent = "Error";
            dbVentasHoyEl.classList.remove('db-valor-en-cache');
            dbVentasHoyEl.classList.add('text-danger');
        }
    }
    
    // ================================================================
    // 2️⃣ PRODUCTOS CON BAJO STOCK
    // ================================================================
    window.productosBajoStock = []; // Variable global para el modal


    // ================================================================
    // 3️⃣ APARTADOS ACTIVOS
    // ================================================================
    const APARTADOS_CACHE_IDS = ['db-apartados-vencer', 'db-apartados-total-saldo'];

    function calcularApartadosVencer() {
        console.log("📅 Calculando apartados activos...");
        pintarCacheDashboard('apartados', APARTADOS_CACHE_IDS);

        try {
            // Solo interesan los apartados "Pendiente" (Completado/Cancelado se
            // ignoran igual en el conteo de abajo); filtrarlos en la consulta
            // en vez de traer también todo el historial ya cerrado evita
            // descargar cada vez más datos a medida que crece la tienda.
            const qApartadosPendientes = query(apartadosCollection, where('estado', '==', 'Pendiente'));
            onSnapshot(qApartadosPendientes,
                (snapshot) => {
                    // Ver el mismo guard en calcularVentasRango: ignora el snapshot
                    // vacío "fromCache" que a veces llega un instante antes del real
                    // tras una reconexión, para no pintar un falso "0 apartados".
                    if (snapshot.metadata.fromCache && snapshot.empty) return;
                    marcarDashboardListo('apartados');
                    let countActivos = 0;
                    let saldoTotal = 0;
                    let countVencidos = 0;
                    const hoy = new Date();

                    snapshot.forEach(doc => {
                        const apartado = doc.data();

                        // La query ya solo trae "Pendiente"
                        if (apartado.estado === 'Pendiente') {
                            countActivos++;
                            saldoTotal += apartado.saldo || 0;

                            // Mismo criterio de "vencido" que usa la tabla de Apartados
                            const fechaVenc = apartado.fechaVencimiento?.toDate?.();
                            if (fechaVenc && fechaVenc < hoy) {
                                countVencidos++;
                            }
                        }
                    });

                    // Actualizar UI
                    dbApartadosVencerEl.textContent = countActivos;
                    dbApartadosVencerEl.classList.remove('text-danger', 'text-success', 'text-warning');

                    // Actualizar saldo total / alerta de vencidos
                    const saldoEl = document.getElementById('db-apartados-total-saldo');
                    if (saldoEl) {
                        saldoEl.textContent = countVencidos > 0
                            ? `${formatoMoneda.format(saldoTotal)} pendiente · ${countVencidos} vencido${countVencidos === 1 ? '' : 's'}`
                            : `${formatoMoneda.format(saldoTotal)} pendiente`;
                        saldoEl.classList.toggle('text-danger', countVencidos > 0);
                        saldoEl.classList.toggle('fw-bold', countVencidos > 0);
                    }

                    if (countVencidos > 0) {
                        dbApartadosVencerEl.classList.add('text-danger');
                    } else if (countActivos > 0) {
                        dbApartadosVencerEl.classList.add('text-warning');
                    } else {
                        dbApartadosVencerEl.classList.add('text-success');
                    }

                    APARTADOS_CACHE_IDS.forEach(id => document.getElementById(id)?.classList.remove('db-valor-en-cache'));
                    cachearDashboard('apartados', APARTADOS_CACHE_IDS);

                    console.log(`✅ Apartados activos: ${countActivos} (vencidos: ${countVencidos})`);
                },
                (error) => {
                    marcarDashboardListo('apartados');
                    console.error("❌ Error al calcular apartados activos:", error);
                    window.reportConnError?.('dashboard-apartados', error);
                    dbApartadosVencerEl.textContent = "Error";
                    dbApartadosVencerEl.classList.remove('db-valor-en-cache');
                    dbApartadosVencerEl.classList.add('text-danger');
                }
            );

        } catch (error) {
            marcarDashboardListo('apartados');
            console.error("❌ Error fatal al configurar apartados:", error);
            window.reportConnError?.('dashboard-apartados', error);
            dbApartadosVencerEl.textContent = "Error";
            dbApartadosVencerEl.classList.remove('db-valor-en-cache');
            dbApartadosVencerEl.classList.add('text-danger');
        }
    }

    // ================================================================
    // 💡 MODAL DE BAJO STOCK
    // ================================================================
    const bajoStockModal = document.getElementById('bajoStockModal');
    if (bajoStockModal) {
        bajoStockModal.addEventListener('show.bs.modal', async () => {
            const bajoStockList = document.getElementById('bajo-stock-list');
            if (!bajoStockList) return;

            bajoStockList.innerHTML = '';

            if (window.productosBajoStock.length === 0) {
                bajoStockList.innerHTML = '<tr><td colspan="4" class="text-center text-success">¡No hay productos con bajo stock!</td></tr>';
                return;
            }

            // Cargar categorías para mostrar los nombres
            const categoriesMap = new Map();
            try {
                const categoriesSnapshot = await getDocs(query(categoriesCollection, orderBy("nombre")));
                categoriesSnapshot.forEach(doc => {
                    categoriesMap.set(doc.id, doc.data().nombre);
                });
            } catch (error) {
                console.error("Error cargando categorías:", error);
            }

            // Renderizar cada producto con todas sus variaciones
            window.productosBajoStock.forEach(item => {
                const categoria = categoriesMap.get(item.categoriaId) || 'Sin categoría';
                const stockClass = item.stockTotal === 1 ? 'text-danger fw-bold' : 'text-warning fw-bold';

                // Crear string con todas las variaciones
                const variacionesHtml = item.variaciones
                    .filter(v => v.stock > 0)
                    .map(v => `<span class="badge bg-secondary me-1">${normalizeTalla(v.talla)}/${normalizeColor(v.color)}: ${v.stock}</span>`)
                    .join(' ');

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="fw-bold">${item.nombre}</td>
                    <td>${variacionesHtml || '<span class="text-muted">Sin variaciones</span>'}</td>
                    <td class="text-center ${stockClass}">${item.stockTotal}</td>
                    <td><small class="text-muted">${categoria}</small></td>
                `;
                bajoStockList.appendChild(tr);
            });
        });
    }

    // ================================================================
    // 5️⃣ PEDIDOS WEB PENDIENTES
    // ================================================================
    function calcularPedidosWeb() {
        console.log("🌐 Calculando pedidos web...");

        try {
            const q = query(webOrdersCollection, where('estado', '==', 'pendiente'));

            onSnapshot(q, (snapshot) => {
                // Excluye los pedidos de Fábrica (tenantId 'fabrica'): esta colección
                // es compartida con mayor.html y esos pedidos se gestionan desde
                // admin-fabrica.html, no desde aquí.
                let pedidosPendientes = 0;
                snapshot.forEach(d => { if (d.data().tenantId !== 'fabrica') pedidosPendientes++; });

                const dbPedidosWebEl = document.getElementById('db-pedidos-web');
                if (dbPedidosWebEl) {
                    dbPedidosWebEl.textContent = pedidosPendientes;
                }
                // Aviso "N pedidos web por revisar": solo se ve si hay alguno.
                const dbPedidosAlertEl = document.getElementById('db-pedidos-alert');
                if (dbPedidosAlertEl) dbPedidosAlertEl.hidden = pedidosPendientes === 0;
                const dbPedidosLabelEl = document.getElementById('db-pedidos-web-label');
                if (dbPedidosLabelEl) dbPedidosLabelEl.textContent = pedidosPendientes === 1 ? 'pedido web por revisar' : 'pedidos web por revisar';

                console.log(`✅ Pedidos web pendientes: ${pedidosPendientes}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular pedidos web:", error);
        }
    }

    // ================================================================
    // 6️⃣ TOTAL DE CLIENTES
    // ================================================================
    function calcularTotalClientes() {
        console.log("👥 Calculando total de clientes...");

        try {
            // Reutiliza el snapshot del listener único de la pestaña Clientes
            // (ver clientsSubscribers) en vez de abrir aquí una segunda
            // conexión en tiempo real sobre la colección completa.
            subscribeClients((snapshot) => {
                const totalClientes = snapshot.size;

                const dbTotalClientesEl = document.getElementById('db-total-clientes');
                if (dbTotalClientesEl) {
                    dbTotalClientesEl.textContent = totalClientes;
                }

                console.log(`✅ Total de clientes: ${totalClientes}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular clientes:", error);
        }
    }

    // ================================================================
    // 7️⃣ PROMOCIONES ACTIVAS
    // ================================================================
    function calcularPromocionesActivas() {
        console.log("🎁 Calculando promociones activas...");

        try {
            // Mismo criterio de "Activa" que usa la pestaña Promociones:
            // activa === true y la fecha actual cae dentro de fechaInicio/fechaFin.
            // Reutiliza el snapshot del listener único de loadPromocionesGlobales()
            // en vez de abrir aquí una segunda conexión en tiempo real.
            subscribePromocionesGlobales((snapshot) => {
                let promocionesActivas = 0;
                const ahora = new Date();

                snapshot.forEach(doc => {
                    const promo = doc.data();
                    const fechaInicio = promo.fechaInicio?.toDate?.();
                    const fechaFin = promo.fechaFin?.toDate?.();
                    if (promo.activa && fechaInicio && fechaFin && ahora >= fechaInicio && ahora <= fechaFin) {
                        promocionesActivas++;
                    }
                });

                const dbPromocionesActivasEl = document.getElementById('db-promociones-activas');
                if (dbPromocionesActivasEl) {
                    dbPromocionesActivasEl.textContent = promocionesActivas;
                }

                console.log(`✅ Promociones activas: ${promocionesActivas}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular promociones:", error);
        }
    }

    // ================================================================
    // 8️⃣ TOTAL DE REPARTIDORES
    // ================================================================
    function calcularTotalRepartidores() {
        console.log("🚴 Calculando total de repartidores...");

        try {
            subscribeRepartidores((snapshot) => {
                const totalRepartidores = snapshot.size;

                const dbTotalRepartidoresEl = document.getElementById('db-total-repartidores');
                if (dbTotalRepartidoresEl) {
                    dbTotalRepartidoresEl.textContent = totalRepartidores;
                }

                console.log(`✅ Total de repartidores: ${totalRepartidores}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular repartidores:", error);
        }
    }

    // ================================================================
    // 💡 POBLAR MODALES DE DETALLE
    // ================================================================

    // Variable global para almacenar datos de inventario
    let datosInventarioGlobal = {
        inversionTotal: 0,
        valorPotencialDetal: 0,
        utilidadPotencial: 0,
        margenUtilidad: 0,
        totalUnidades: 0,
        totalProductos: 0,
        productos: []
    };

    // Función para poblar el modal de Inversión en Inventario
    function poblarModalInversion() {
        const { inversionTotal, totalUnidades, totalProductos } = datosInventarioGlobal;

        // Actualizar valores principales
        document.getElementById('modal-inversion-total').textContent = formatoMoneda.format(inversionTotal);
        document.getElementById('modal-inventario-unidades').textContent = totalUnidades;

        // Calcular métricas derivadas
        const inversionPromedio = totalProductos > 0 ? inversionTotal / totalProductos : 0;
        const inversionPorUnidad = totalUnidades > 0 ? inversionTotal / totalUnidades : 0;

        document.getElementById('modal-inversion-promedio').textContent = formatoMoneda.format(inversionPromedio);
        document.getElementById('modal-inversion-por-unidad').textContent = formatoMoneda.format(inversionPorUnidad);

        // TODO: Calcular rotación basado en ventas (por ahora 0%)
        document.getElementById('modal-rotacion-inventario').textContent = '0%';
    }

    // Función para poblar el modal de Utilidad Potencial
    function poblarModalUtilidad() {
        const { inversionTotal, valorPotencialDetal, utilidadPotencial, margenUtilidad, productos } = datosInventarioGlobal;

        // Actualizar valores principales
        document.getElementById('modal-utilidad-total').textContent = formatoMoneda.format(utilidadPotencial);
        document.getElementById('modal-margen-porcentaje').textContent = `${margenUtilidad.toFixed(1)}%`;
        document.getElementById('modal-roi').textContent = `${margenUtilidad.toFixed(1)}%`;

        // Desglose
        document.getElementById('modal-valor-venta-total').textContent = formatoMoneda.format(valorPotencialDetal);
        document.getElementById('modal-inversion-total-utilidad').textContent = formatoMoneda.format(inversionTotal);

        // Generar lista de productos más rentables
        const topProductosDiv = document.getElementById('modal-top-productos-rentables');

        if (productos.length === 0) {
            topProductosDiv.innerHTML = '<p class="text-muted text-center">No hay productos disponibles</p>';
            return;
        }

        // Calcular utilidad por producto y ordenar
        const productosConUtilidad = productos.map(p => ({
            nombre: p.nombre,
            utilidadTotal: (p.precioDetal - p.costoCompra) * p.stock,
            margenPorcentaje: p.costoCompra > 0 ? ((p.precioDetal - p.costoCompra) / p.costoCompra * 100) : 0,
            stock: p.stock,
            precioDetal: p.precioDetal,
            costoCompra: p.costoCompra
        })).filter(p => p.stock > 0 && p.costoCompra > 0);

        productosConUtilidad.sort((a, b) => b.utilidadTotal - a.utilidadTotal);
        const top5 = productosConUtilidad.slice(0, 5);

        let html = '<div class="table-responsive"><table class="table table-sm table-hover">';
        html += '<thead class="table-light"><tr>';
        html += '<th>Producto</th>';
        html += '<th class="text-center">Stock</th>';
        html += '<th class="text-end">Costo</th>';
        html += '<th class="text-end">Precio</th>';
        html += '<th class="text-end">Utilidad Total</th>';
        html += '<th class="text-end">Margen %</th>';
        html += '</tr></thead><tbody>';

        top5.forEach((p, index) => {
            const colorBadge = index === 0 ? 'warning' : index === 1 ? 'secondary' : index === 2 ? 'bronze' : 'light';
            html += '<tr>';
            html += `<td>
                        ${index < 3 ? `<i class="bi bi-trophy-fill text-${colorBadge}"></i> ` : ''}
                        <strong>${p.nombre}</strong>
                     </td>`;
            html += `<td class="text-center"><span class="badge bg-info">${p.stock}</span></td>`;
            html += `<td class="text-end">${formatoMoneda.format(p.costoCompra)}</td>`;
            html += `<td class="text-end">${formatoMoneda.format(p.precioDetal)}</td>`;
            html += `<td class="text-end text-success fw-bold">${formatoMoneda.format(p.utilidadTotal)}</td>`;
            html += `<td class="text-end"><span class="badge ${p.margenPorcentaje >= 50 ? 'bg-success' : p.margenPorcentaje >= 30 ? 'bg-warning' : 'bg-danger'}">${p.margenPorcentaje.toFixed(0)}%</span></td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        topProductosDiv.innerHTML = html;
    }

    // Event listeners para abrir modales
    const inversionModal = document.getElementById('inversionInventarioModal');
    if (inversionModal) {
        inversionModal.addEventListener('show.bs.modal', poblarModalInversion);
    }

    const utilidadModal = document.getElementById('utilidadPotencialModal');
    if (utilidadModal) {
        utilidadModal.addEventListener('show.bs.modal', poblarModalUtilidad);
    }

    // ================================================================
    // 🔟 LISTENER ÚNICO DE PRODUCTOS
    // Un solo onSnapshot sobre productsCollection alimenta: totales y
    // disponibles, bajo stock, e inversión/utilidad potencial. Antes eran
    // 3 listeners independientes recorriendo la misma colección completa
    // en cada cambio — esto es lo que hacía lenta la carga del dashboard.
    // ================================================================
    const STOCK_MINIMO_DASHBOARD = 2; // Productos con 2 prendas o menos

    const PRODUCTOS_CACHE_IDS = [
        'db-total-productos', 'db-productos-disponibles', 'db-bajo-stock',
        'db-inversion-inventario', 'db-inventario-unidades',
        'db-utilidad-potencial', 'db-margen-utilidad'
    ];

    function iniciarListenerProductos() {
        console.log("📦 Suscribiendo estadísticas del Dashboard al listener único de productos...");
        pintarCacheDashboard('productos', PRODUCTOS_CACHE_IDS);

        // Antes esto abría su propio onSnapshot sobre TODA la colección de
        // productos, duplicando la descarga que ya hace el listener de la
        // pestaña Productos (renderProducts) — dos listeners en tiempo real
        // sobre la misma colección completa desde el primer segundo de
        // carga. Ahora se suscribe al mismo snapshot vía subscribeProducts()
        // en vez de volver a pedirlo todo por su cuenta.
        try {
            subscribeProducts((snapshot) => {
                // Ver el mismo guard en calcularVentasRango: ignora el snapshot
                // vacío "fromCache" que a veces llega un instante antes del real
                // tras una reconexión, para no pintar un falso "0 productos".
                if (snapshot.metadata.fromCache && snapshot.empty) return;
                marcarDashboardListo('productos');
                let totalProductos = 0;
                let productosDisponibles = 0;
                let inversionTotal = 0;
                let valorPotencialDetal = 0;
                let valorPotencialMayor = 0;
                let totalUnidades = 0;
                let productosSinCosto = 0;
                const productos = [];
                window.productosBajoStock = [];

                // localProductsMap ya tiene los datos de este snapshot
                // (renderProducts lo llena antes de avisar).
                localProductsMap.forEach((producto, productoId) => {
                    totalProductos++;
                    if (producto.visible) productosDisponibles++;

                    const costoCompra = parseFloat(producto.costoCompra) || 0;
                    const precioDetal = parseFloat(producto.precioDetal) || 0;
                    const precioMayor = parseFloat(producto.precioMayor) || 0;

                    const variaciones = producto.variaciones || [];
                    const stockTotal = obtenerStockTotalProducto(producto);

                    inversionTotal += costoCompra * stockTotal;
                    totalUnidades += stockTotal;

                    // Un producto sin costoCompra registrado infla artificialmente
                    // la utilidad/margen potencial (todo su precio de venta se vería
                    // como "ganancia"), así que se excluye de ese cálculo hasta que
                    // se le complete el costo.
                    if (costoCompra > 0) {
                        valorPotencialDetal += precioDetal * stockTotal;
                        valorPotencialMayor += precioMayor * stockTotal;
                    } else if (stockTotal > 0) {
                        productosSinCosto++;
                    }

                    if (stockTotal > 0) {
                        productos.push({ nombre: producto.nombre || 'Sin nombre', costoCompra, precioDetal, precioMayor, stock: stockTotal });
                    }

                    // Bajo stock: mismo criterio que antes (visible, stock entre 1 y 2)
                    if (producto.visible && stockTotal > 0 && stockTotal <= STOCK_MINIMO_DASHBOARD) {
                        window.productosBajoStock.push({
                            id: productoId,
                            nombre: producto.nombre,
                            stockTotal,
                            variaciones: variaciones.map(v => ({
                                talla: v.talla || 'N/A',
                                color: v.color || 'N/A',
                                stock: parseInt(v.stock, 10) || 0
                            })),
                            categoriaId: producto.categoriaId
                        });
                    }
                });

                // Productos totales / disponibles
                const dbTotalProductosEl = document.getElementById('db-total-productos');
                const dbProductosDisponiblesEl = document.getElementById('db-productos-disponibles');
                if (dbTotalProductosEl) dbTotalProductosEl.textContent = totalProductos;
                if (dbProductosDisponiblesEl) dbProductosDisponiblesEl.textContent = `${productosDisponibles} disponibles`;

                // Bajo stock
                const bajoStockCount = window.productosBajoStock.length;
                dbBajoStockEl.textContent = bajoStockCount;
                dbBajoStockEl.classList.remove('text-warning', 'text-success');
                dbBajoStockEl.classList.add(bajoStockCount > 0 ? 'text-warning' : 'text-success');

                // Inversión y utilidad potencial
                const utilidadPotencial = valorPotencialDetal - inversionTotal;
                const margenUtilidad = inversionTotal > 0 ? ((utilidadPotencial / inversionTotal) * 100) : 0;

                datosInventarioGlobal = {
                    inversionTotal,
                    valorPotencialDetal,
                    valorPotencialMayor,
                    utilidadPotencial,
                    margenUtilidad,
                    totalUnidades,
                    totalProductos: snapshot.size,
                    productosSinCosto,
                    productos
                };

                const dbInversionEl = document.getElementById('db-inversion-inventario');
                if (dbInversionEl) dbInversionEl.textContent = formatoMoneda.format(inversionTotal);

                const dbUnidadesEl = document.getElementById('db-inventario-unidades');
                if (dbUnidadesEl) dbUnidadesEl.textContent = `${totalUnidades} unidades`;

                const dbUtilidadPotencialEl = document.getElementById('db-utilidad-potencial');
                if (dbUtilidadPotencialEl) dbUtilidadPotencialEl.textContent = formatoMoneda.format(utilidadPotencial);

                const dbMargenEl = document.getElementById('db-margen-utilidad');
                if (dbMargenEl) {
                    const avisoSinCosto = productosSinCosto > 0
                        ? ` · ${productosSinCosto} sin costo registrado`
                        : '';
                    dbMargenEl.innerHTML = `<i class="bi bi-percent"></i> ${margenUtilidad.toFixed(1)}% de margen${avisoSinCosto}`;
                }

                PRODUCTOS_CACHE_IDS.forEach(id => document.getElementById(id)?.classList.remove('db-valor-en-cache'));
                cachearDashboard('productos', PRODUCTOS_CACHE_IDS);

                console.log(`✅ Productos: ${totalProductos} (${productosDisponibles} disponibles) | Bajo stock: ${bajoStockCount} | Inversión: ${formatoMoneda.format(inversionTotal)} | Utilidad potencial: ${formatoMoneda.format(utilidadPotencial)} (${margenUtilidad.toFixed(1)}%) | Sin costo registrado: ${productosSinCosto}`);
            });
        } catch (error) {
            marcarDashboardListo('productos');
            console.error("❌ Error fatal al iniciar listener de productos:", error);
            window.reportConnError?.('dashboard-productos', error);
        }
    }

    // ================================================================
    // 📊 ÚLTIMOS 7 DÍAS: mini gráfico de barras (hoy resaltado) + "Ayer"
    // Mismo criterio que "Ventas de hoy": dinero recibido (efectivo +
    // transferencia) de ventas al detal no anuladas, más los abonos de
    // apartados de cada día. Mismo diseño que el Dashboard de Fábrica.
    // ================================================================
    function calcularUltimos7Dias() {
        const barrasEl = document.getElementById('db-week-bars');
        if (!barrasEl) return;

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const inicio = new Date(hoy);
        inicio.setDate(inicio.getDate() - 6);
        const fin = new Date(hoy);
        fin.setDate(fin.getDate() + 1);
        const claveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

        const q = query(
            salesCollection,
            where('timestamp', '>=', Timestamp.fromDate(inicio)),
            where('timestamp', '<', Timestamp.fromDate(fin)),
            orderBy('timestamp', 'desc')
        );
        onSnapshot(q, async (snapshot) => {
            if (snapshot.metadata.fromCache && snapshot.empty) return;
            const porDia = new Map();
            const sumar = (fecha, monto) => porDia.set(claveDia(fecha), (porDia.get(claveDia(fecha)) || 0) + monto);
            snapshot.forEach(docSnap => {
                const venta = docSnap.data();
                if (venta.tipoVenta === 'mayorista') return;
                if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate() : new Date();
                sumar(fecha, (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0));
            });
            try {
                const abonosSnap = await getDocs(query(
                    collection(db, 'abonos'),
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<', Timestamp.fromDate(fin))
                ));
                abonosSnap.forEach(docSnap => {
                    const abono = docSnap.data();
                    const fecha = abono.timestamp?.toDate ? abono.timestamp.toDate() : null;
                    if (fecha) sumar(fecha, abono.monto || 0);
                });
            } catch (err) {
                console.error('Error sumando abonos de los últimos 7 días:', err);
            }

            const dias = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(hoy);
                d.setDate(d.getDate() - i);
                dias.push({ fecha: d, total: porDia.get(claveDia(d)) || 0 });
            }
            const max = Math.max(1, ...dias.map(d => d.total));
            const letras = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
            barrasEl.innerHTML = dias.map((d, i) => {
                const alto = d.total > 0 ? Math.max(6, Math.round((d.total / max) * 100)) : 3;
                const titulo = `${d.fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}: ${formatoMoneda.format(d.total)}`;
                return `<div class="fdb-week-col${i === 6 ? ' is-today' : ''}" title="${titulo}">
                    <span class="fdb-week-bar" style="height:${alto}%"></span>
                    <span class="fdb-week-day">${i === 6 ? 'Hoy' : letras[d.fecha.getDay()]}</span>
                </div>`;
            }).join('');
            const ayerEl = document.getElementById('db-ventas-ayer');
            if (ayerEl) ayerEl.textContent = formatoMoneda.format(dias[5].total);
        }, (error) => {
            console.error('Error al calcular los últimos 7 días:', error);
        });
    }

    // ================================================================
    // 🚀 INICIALIZAR TODAS LAS FUNCIONES
    // ================================================================
    calcularVentasRango('today');
    calcularUltimos7Dias();
    document.querySelectorAll('.db2-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.db2-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calcularVentasRango(btn.dataset.range);
        });
    });
    iniciarListenerProductos(); // Totales, bajo stock e inversión en un solo listener
    calcularApartadosVencer();
    calcularPedidosWeb();
    calcularTotalClientes();
    calcularPromocionesActivas();
    calcularTotalRepartidores();

    // Mostrar fecha actual en el dashboard
    const dashboardDateEl = document.getElementById('dashboard-date');
    if (dashboardDateEl) {
        const hoy = new Date();
        dashboardDateEl.textContent = hoy.toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Saludo con el primer nombre ("Hola, Alexander"): auth.js escribe el
    // nombre completo en #db-greeting-name; aquí se recorta al primero.
    const saludoNombreEl = document.getElementById('db-greeting-name');
    if (saludoNombreEl) {
        const recortarNombre = () => {
            const primero = saludoNombreEl.textContent.trim().split(/\s+/)[0];
            if (primero && primero !== saludoNombreEl.textContent) saludoNombreEl.textContent = primero;
        };
        recortarNombre();
        new MutationObserver(recortarNombre).observe(saludoNombreEl, { childList: true, characterData: true, subtree: true });
    }

    // "Ver todas" (últimas ventas) abre Ventas directamente en el historial.
    document.getElementById('db-ver-todo-actividad')?.addEventListener('click', () => {
        setTimeout(() => document.getElementById('toggle-sales-list-view-btn')?.click(), 50);
    });

    console.log("✅ Dashboard inicializado correctamente");

})(); // ← Cierre del IIFE del Dashboard

// ========================================================================
// FIN DE LA SECCIÓN DEL DASHBOARD
// ========================================================================

// ========================================================================
// 📊 GRÁFICAS REALES DEL DASHBOARD (Chart.js)
// ========================================================================
(() => {
    console.log("📊 Inicializando gráficas del dashboard...");

    let trendChart = null;
    let topChart = null;
    let unsubscribeTendencia = null;

    const COLOR_DETAL = 'rgba(217,136,185,0.85)';   // rosa Boutique
    const COLOR_DETAL_HOVER = 'rgba(217,136,185,1)';

    // Total del día compacto para la etiqueta encima de cada barra ($420 k / $1,6 M)
    const formatoCompacto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1 });

    // Colores de la gráfica de tendencia, dark-mode aware (mismo criterio que coloresGrafica() en Finanzas)
    function coloresTendencia() {
        const dark = document.body.classList.contains('dark-mode');
        return {
            tick: dark ? '#c3c2b7' : '#898781',
            grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            surface: dark ? '#1a1a19' : '#fcfcfb',
            total: dark ? 'rgba(235,234,228,0.85)' : 'rgba(40,40,38,0.75)'
        };
    }

    // ── Plugin: separador de 2px (color superficie) entre los segmentos
    // apilados de cada barra, y el total del día en el remate de la barra
    // (columna → valor en el remate, solo si hay ancho suficiente) ──
    const trendTotalsPlugin = {
        id: 'trendTotals',
        afterDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta.data.length) return;

            const { total } = coloresTendencia();
            const { ctx } = chart;
            ctx.save();
            ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            meta.data.forEach((bar, i) => {
                if (!bar) return;
                const valor = chart.data.datasets[0].data[i] || 0;
                if (valor <= 0) return;

                if (bar.width >= 26) {
                    ctx.fillStyle = total;
                    ctx.fillText(formatoCompacto.format(valor), bar.x, bar.y - 6);
                }
            });
            ctx.restore();
        }
    };

    // ================================================================
    // GRÁFICA 1: TENDENCIA DE VENTAS (barras apiladas Detal/Mayorista)
    // 7d y 30d agrupan por día; 6m agrupa por mes para no saturar el eje.
    // ================================================================
    async function crearGraficoTendencia(dias = 7) {
        const canvas = document.getElementById('db-trend-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (unsubscribeTendencia) {
            unsubscribeTendencia();
            unsubscribeTendencia = null;
        }

        try {
            const hoy = new Date();
            const fechaInicio = new Date(hoy);
            fechaInicio.setDate(fechaInicio.getDate() - dias + 1);
            fechaInicio.setHours(0, 0, 0, 0);

            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(fechaInicio)),
                orderBy('timestamp', 'asc')
            );

            const agruparPorMes = dias > 30;
            const claveDe = (fecha) => agruparPorMes
                ? fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
                : fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });

            unsubscribeTendencia = onSnapshot(q, (snapshot) => {
                const ventasPorClave = new Map();
                const labels = [];

                if (agruparPorMes) {
                    const cursor = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
                    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                    while (cursor <= fin) {
                        const key = claveDe(cursor);
                        ventasPorClave.set(key, 0);
                        labels.push(key);
                        cursor.setMonth(cursor.getMonth() + 1);
                    }
                } else {
                    for (let i = 0; i < dias; i++) {
                        const fecha = new Date(fechaInicio);
                        fecha.setDate(fecha.getDate() + i);
                        const key = claveDe(fecha);
                        ventasPorClave.set(key, 0);
                        labels.push(key);
                    }
                }

                snapshot.forEach(doc => {
                    const venta = doc.data();
                    if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                    // Las ventas mayoristas no son de Boutique — no entran a esta gráfica.
                    if (venta.tipoVenta === 'mayorista') return;
                    const fecha = venta.timestamp?.toDate();
                    if (!fecha) return;
                    const key = claveDe(fecha);
                    if (!ventasPorClave.has(key)) return;
                    const monto = (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                    ventasPorClave.set(key, ventasPorClave.get(key) + monto);
                });

                renderGraficoTendencia(labels, labels.map(l => ventasPorClave.get(l)));
            }, (error) => {
                console.error("❌ Error en listener de tendencia de ventas:", error);
            });
        } catch (error) {
            console.error("❌ Error al crear gráfica de tendencia:", error);
        }
    }

    function renderGraficoTendencia(labels, data) {
        const canvas = document.getElementById('db-trend-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        const totalVentas = data.reduce((sum, v) => sum + v, 0);
        const elSuma = document.getElementById('db-trend-total-suma');
        if (elSuma) elSuma.textContent = formatoMoneda.format(totalVentas);

        const { tick, grid } = coloresTendencia();

        if (trendChart) trendChart.destroy();
        trendChart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Ventas',
                            data,
                            backgroundColor: COLOR_DETAL,
                            hoverBackgroundColor: COLOR_DETAL_HOVER,
                            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                            borderSkipped: false,
                            maxBarThickness: 28,
                            categoryPercentage: 0.6,
                            barPercentage: 0.9
                        }
                    ]
                },
                plugins: [trendTotalsPlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 22 } },
                    animation: { duration: 400 },
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            padding: 10,
                            cornerRadius: 8,
                            boxPadding: 4,
                            footerFont: { weight: '600' },
                            callbacks: {
                                label: (ctx) => `${ctx.dataset.label}: ${formatoMoneda.format(ctx.parsed.y)}`,
                                footer: (items) => `Total del día: ${formatoMoneda.format(items.reduce((s, it) => s + (it.parsed.y || 0), 0))}`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: tick, font: { size: 11 } } },
                        y: {
                            beginAtZero: true,
                            grid: { color: grid },
                            ticks: { color: tick, callback: (v) => '$' + (v / 1000).toFixed(0) + 'k', font: { size: 11 } }
                        }
                    }
                }
            });
    }

    // ================================================================
    // GRÁFICA 2: TOP 15 PRODUCTOS (barras horizontales, últimos 30 días)
    // ================================================================
    async function crearGraficoTopProductos() {
        const canvas = document.getElementById('db-top-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            fechaInicio.setHours(0, 0, 0, 0);

            const q = query(salesCollection, where('timestamp', '>=', Timestamp.fromDate(fechaInicio)));
            const snapshot = await getDocs(q);

            const productosVendidos = {};
            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                // Las ventas mayoristas no son de Boutique — le pertenecen al tenant
                // Fábrica, igual que en el resto de este dashboard (KPIs y tendencia).
                if (venta.tipoVenta === 'mayorista') return;
                (venta.items || []).forEach(item => {
                    const nombre = item.nombre || 'Sin nombre';
                    productosVendidos[nombre] = (productosVendidos[nombre] || 0) + (item.cantidad || 0);
                });
            });

            // Sin .reverse(): Chart.js dibuja el índice 0 arriba en las barras
            // horizontales, así que dejar el orden descendente (mayor a menor)
            // pone el producto más vendido arriba y el resto bajando.
            const topProductos = Object.entries(productosVendidos)
                .filter(([, unidades]) => unidades > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15);

            if (topChart) topChart.destroy();

            if (topProductos.length === 0) {
                topChart = new Chart(canvas.getContext('2d'), {
                    type: 'bar',
                    data: { labels: ['Sin datos de ventas'], datasets: [{ data: [0], backgroundColor: 'rgba(0,0,0,0.06)' }] },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
                return;
            }

            const labels = topProductos.map(([nombre]) => nombre.length > 24 ? nombre.slice(0, 24) + '…' : nombre);

            topChart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Detal',
                        data: topProductos.map(([, unidades]) => unidades),
                        backgroundColor: COLOR_DETAL,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x} u.`
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: { precision: 0, font: { size: 11 } }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { font: { size: 11 } }
                        }
                    }
                }
            });
        } catch (error) {
            console.error("❌ Error al crear gráfica de top productos:", error);
        }
    }

    // ================================================================
    // TIMELINE: ACTIVIDAD RECIENTE
    // ================================================================
    // Últimas 5 ventas al detal, en tiempo real, con el mismo diseño que el
    // Dashboard de Fábrica: iniciales del cliente, cuántas prendas y cómo
    // pagó, total y hace cuánto. Las mayoristas son de Fábrica y se omiten.
    function actualizarActividadReciente() {
        const timelineContainer = document.getElementById('db-actividad-reciente');
        if (!timelineContainer) return;

        const q = query(salesCollection, orderBy('timestamp', 'desc'), limit(15));
        onSnapshot(q, (snapshot) => {
            const ventas = snapshot.docs.map(d => d.data()).filter(v => v.tipoVenta !== 'mayorista').slice(0, 5);
            if (ventas.length === 0) {
                timelineContainer.innerHTML = '<div class="text-center text-muted py-3">No hay ventas recientes</div>';
                return;
            }
            timelineContainer.innerHTML = ventas.map(venta => {
                const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate() : null;
                const cuando = fecha ? obtenerTiempoRelativo(fecha) : 'Hace un momento';
                const anulada = venta.estado === 'Anulada' || venta.estado === 'Cancelada';
                const prendas = (venta.items || venta.productos || []).reduce((sum, it) => sum + (parseInt(it.cantidad, 10) || 0), 0);
                const metodo = { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: 'Mixto', otro: 'Otro medio' }[(venta.metodoPago || '').toLowerCase()] || venta.metodoPago || '';
                const detalle = [prendas ? `${prendas} prenda${prendas === 1 ? '' : 's'}` : '', metodo].filter(Boolean).join(' · ');
                const nombre = venta.clienteNombre || 'Cliente General';
                const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
                return `
                    <div class="fdb-sale${anulada ? ' is-void' : ''}">
                        <span class="fdb-sale-avatar">${iniciales || 'CG'}</span>
                        <div class="fdb-sale-body">
                            <div class="fdb-sale-name">${nombre}</div>
                            <div class="fdb-sale-sub">${anulada ? 'Anulada' : (detalle || 'Venta')}</div>
                        </div>
                        <div class="fdb-sale-meta">
                            <span class="fdb-sale-amount">${formatoMoneda.format(venta.totalVenta || 0)}</span>
                            <span class="fdb-sale-time">${cuando}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }, (error) => {
            console.error("❌ Error al actualizar actividad:", error);
            timelineContainer.innerHTML = '<div class="text-center text-danger py-3">No se pudo cargar</div>';
        });
    }

    // Función auxiliar para tiempo relativo
    function obtenerTiempoRelativo(fecha) {
        const ahora = new Date();
        const diff = Math.floor((ahora - fecha) / 1000); // en segundos

        if (diff < 60) return 'Hace un momento';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
        if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
        return fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
    }

    // ================================================================
    // EVENT LISTENERS
    // ================================================================

    // Cambiar período de la gráfica de tendencia
    const mtPeriodoBtns = document.querySelectorAll('input[name="mt-period"]');
    mtPeriodoBtns.forEach(btn => {
        btn.addEventListener('change', (e) => {
            const dias = e.target.id === 'mt-7days' ? 7 :
                        e.target.id === 'mt-30days' ? 30 :
                        180;
            crearGraficoTendencia(dias);
        });
    });

    // ================================================================
    // INICIALIZAR
    // ================================================================

    crearGraficoTendencia(7);
    crearGraficoTopProductos();
    actualizarActividadReciente();

    console.log("✅ Gráficas del dashboard inicializadas");

})();

    // ── Secciones con carga diferida (ver cargarSeccionDiferida) ──
    // Reportes completos → src/admin/secciones/reportes.js (no hay
    // #form-reporte en admin.html hoy, así que no se descarga).
    if (document.getElementById('form-reporte')) cargarSeccionDiferida(null, () => import('./src/admin/secciones/reportes.js?v=1'));
    // Finanzas v2 — utilidad real por producto y movimientos de Boutique → src/admin/secciones/finanzas-utilidad.js
    cargarSeccionDiferida('#finanzas', () => import('./src/admin/secciones/finanzas-utilidad.js?v=1'));
    // Historial de entregas por repartidor → src/admin/secciones/historial-repartidores.js
    cargarSeccionDiferida('#repartidores', () => import('./src/admin/secciones/historial-repartidores.js?v=1'));
    // Backup / exportación a Excel → src/admin/secciones/backup.js
    cargarSeccionDiferida('#backup', () => import('./src/admin/secciones/backup.js?v=1'));
    // Cargue masivo de productos desde Excel → src/admin/secciones/cargue-masivo.js
    cargarSeccionDiferida('#cargue-masivo', () => import('./src/admin/secciones/cargue-masivo.js?v=1'));

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: PROMOCIONES GLOBALES
// ═══════════════════════════════════════════════════════════════════

// ✅ Cargar y mostrar promociones globales
function loadPromocionesGlobales() {
    const container = document.getElementById('promociones-globales-container');
    if (!container) return;

    onSnapshot(promocionesGlobalesCollection, (snapshot) => {
        promocionesGlobalesSubscribers.forEach(cb => { try { cb(snapshot); } catch (e) { console.error('Error en suscriptor de promociones globales:', e); } });

        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-tag" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p class="mt-3">No hay promociones globales configuradas</p>
                </div>
            `;
            return;
        }

        const promociones = [];
        snapshot.forEach(doc => {
            promociones.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar por fecha de creación (más recientes primero)
        promociones.sort((a, b) => {
            const timestampA = a.timestamp?.toMillis?.() || 0;
            const timestampB = b.timestamp?.toMillis?.() || 0;
            return timestampB - timestampA;
        });

        promociones.forEach(promo => {
            const fechaInicio = promo.fechaInicio?.toDate();
            const fechaFin = promo.fechaFin?.toDate();
            const now = new Date();

            // Determinar estado
            let estadoBadge = '';
            let estadoClass = '';
            if (promo.activa && fechaInicio && fechaFin && now >= fechaInicio && now <= fechaFin) {
                estadoBadge = '<span class="badge bg-success">Activa</span>';
                estadoClass = 'border-success';
            } else if (promo.activa && fechaInicio && now < fechaInicio) {
                estadoBadge = '<span class="badge bg-warning">Programada</span>';
                estadoClass = 'border-warning';
            } else if (promo.activa && fechaFin && now > fechaFin) {
                estadoBadge = '<span class="badge bg-secondary">Finalizada</span>';
                estadoClass = 'border-secondary';
            } else {
                estadoBadge = '<span class="badge bg-secondary">Inactiva</span>';
                estadoClass = '';
            }

            const card = document.createElement('div');
            card.className = `card mb-3 ${estadoClass}`;
            card.style.borderWidth = '2px';
            card.innerHTML = `
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <h5 class="card-title mb-1">
                                <i class="bi bi-tag-fill me-2"></i>${promo.nombre}
                                ${estadoBadge}
                            </h5>
                            <p class="text-muted mb-0">
                                <strong>${promo.descuento}%</strong> de descuento en toda la tienda
                            </p>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarPromocionGlobal('${promo.id}', '${promo.nombre}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>

                    <div class="row g-3">
                        <div class="col-md-6">
                            <small class="text-muted d-block">Fecha de Inicio:</small>
                            <strong>${fechaInicio ? fechaInicio.toLocaleString('es-CO') : 'No definida'}</strong>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted d-block">Fecha de Fin:</small>
                            <strong>${fechaFin ? fechaFin.toLocaleString('es-CO') : 'No definida'}</strong>
                        </div>
                    </div>

                    <div class="mt-3">
                        <span class="badge bg-info me-2">
                            <i class="bi bi-palette-fill me-1"></i>Tema: ${promo.tema || 'default'}
                        </span>
                        <div class="form-check form-switch d-inline-block ms-3">
                            <input class="form-check-input" type="checkbox" id="toggle-promo-${promo.id}"
                                   ${promo.activa ? 'checked' : ''}
                                   onchange="togglePromocionGlobal('${promo.id}', this.checked)">
                            <label class="form-check-label" for="toggle-promo-${promo.id}">
                                ${promo.activa ? 'Activa' : 'Inactiva'}
                            </label>
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });
    });
}

// ✅ Crear nueva promoción global
window.eliminarPromocionGlobal = async function(promoId, promoNombre) {
    if (!confirm(`¿Estás seguro de eliminar la promoción "${promoNombre}"?`)) return;

    try {
        await deleteDoc(doc(db, 'promocionesGlobales', promoId));
        showToast('Promoción eliminada exitosamente', 'success');
    } catch (error) {
        console.error('Error al eliminar promoción:', error);
        showToast('Error al eliminar la promoción', 'error');
    }
};

// ✅ Activar/Desactivar promoción
window.togglePromocionGlobal = async function(promoId, activa) {
    try {
        await updateDoc(doc(db, 'promocionesGlobales', promoId), {
            activa: activa
        });
        showToast(activa ? 'Promoción activada' : 'Promoción desactivada', 'success');
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        showToast('Error al cambiar el estado', 'error');
    }
};

// ✅ Form handler para crear promoción
const formAddPromoGlobal = document.getElementById('form-add-promocion-global');
if (formAddPromoGlobal) {
    formAddPromoGlobal.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('promo-nombre').value.trim();
        const descuento = parseInt(document.getElementById('promo-descuento').value);
        const fechaInicio = new Date(document.getElementById('promo-fecha-inicio').value);
        const fechaFin = new Date(document.getElementById('promo-fecha-fin').value);
        const tema = document.getElementById('promo-tema').value;
        const activa = document.getElementById('promo-activa').checked;

        // Validaciones
        if (!nombre || !descuento || !fechaInicio || !fechaFin) {
            showToast('Por favor completa todos los campos', 'error');
            return;
        }

        if (descuento < 1 || descuento > 99) {
            showToast('El descuento debe estar entre 1% y 99%', 'error');
            return;
        }

        if (fechaFin <= fechaInicio) {
            showToast('La fecha de fin debe ser posterior a la de inicio', 'error');
            return;
        }

        try {
            await addDoc(promocionesGlobalesCollection, {
                nombre: nombre,
                descuento: descuento,
                tipo: 'porcentaje',
                fechaInicio: Timestamp.fromDate(fechaInicio),
                fechaFin: Timestamp.fromDate(fechaFin),
                tema: tema,
                activa: activa,
                timestamp: serverTimestamp()
            });

            showToast('✅ Promoción creada exitosamente', 'success');

            // Cerrar modal y resetear form
            const modal = bootstrap.Modal.getInstance(document.getElementById('addPromocionGlobalModal'));
            modal.hide();
            formAddPromoGlobal.reset();

        } catch (error) {
            console.error('Error al crear promoción:', error);
            showToast('Error al crear la promoción', 'error');
        }
    });
}

// ✅ Cargar promociones al inicio
loadPromocionesGlobales();

console.log("✅ Módulo de Promociones Globales inicializado");

// La lógica de navegación del topnav se maneja en admin.html (script inline)

// ========================================================================
// --- SIDEBAR TOGGLE PARA MÓVIL ---
// ========================================================================
// NOTA: El manejo del sidebar toggle se hace en admin.html mediante script inline
// para evitar conflictos con event listeners duplicados

// ========================================================================
// --- CONFIGURACIÓN DE PAGOS: QR Nequi ---
// ========================================================================

// Antes vivía en config/pagos (un solo documento global para toda la
// plataforma) — con más de una empresa, todas terminarían leyendo/
// pisando el mismo QR de cobro. Ahora es por empresa:
// tenants/{tenantId}/config/pagos (ver firestore.rules: lectura pública,
// escritura solo con permiso config_gestionar de esa empresa).
function pagosConfigRef() {
    return doc(db, 'tenants', window.expectedTenantId || 'boutique', 'config', 'pagos');
}

async function loadNequiQrPreview() {
    try {
        const snap = await getDoc(pagosConfigRef());
        const emptyEl = document.getElementById('admin-qr-empty');
        const previewWrap = document.getElementById('admin-qr-preview-wrap');
        const previewImg = document.getElementById('admin-qr-preview');
        if (!emptyEl || !previewWrap || !previewImg) return;
        if (snap.exists() && snap.data().nequiQrBase64) {
            previewImg.src = snap.data().nequiQrBase64;
            previewWrap.style.display = 'block';
            emptyEl.style.display = 'none';
        } else {
            previewWrap.style.display = 'none';
            emptyEl.style.display = 'block';
        }
    } catch (_) {}
}

window.adminSaveNequiQr = async function() {
    const input = document.getElementById('admin-qr-input');
    const statusEl = document.getElementById('admin-qr-status');
    const btn = document.getElementById('admin-qr-save-btn');
    if (!input || !input.files || !input.files[0]) {
        showToast('Selecciona una imagen primero', 'error'); return;
    }
    const file = input.files[0];
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
    try {
        const base64 = await new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                let { width, height } = img;
                const maxW = 400;
                if (width > maxW) { height = Math.round((height * maxW) / width); width = maxW; }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png', 1.0));
            };
            img.src = url;
        });
        await setDoc(pagosConfigRef(), { nequiQrBase64: base64 }, { merge: true });
        showToast('✅ QR de Nequi guardado correctamente', 'success');
        statusEl.style.display = 'none';
        input.value = '';
        await loadNequiQrPreview();
    } catch (err) {
        console.error('Error guardando QR:', err);
        showToast('Error al guardar el QR: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-upload me-1"></i>Guardar QR';
    }
};

// Cargar preview del QR cuando se navega a la sección
document.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#config-pagos"]')) {
        setTimeout(loadNequiQrPreview, 100);
    }
});

// ═══════════════════════════════════════════════════════════════════
// TARIFAS DE DOMICILIO — Montería (tabla por barrio)
// ═══════════════════════════════════════════════════════════════════

// Lista inicial con TODOS los barrios conocidos de Montería y su tarifa por defecto.
// Si el admin guarda cambios en Firestore, esos valores sobreescriben estos.
const BARRIOS_MONTERIA_DEFAULT = [
    // ── Este lado del río / Centro ($5.000) ──────────────────────────
    { nombre: '7 de Agosto',              tarifa: 5000 },
    { nombre: 'Alamedas del Sinú',        tarifa: 5000 },
    { nombre: 'Alfonso López',            tarifa: 5000 },
    { nombre: 'Bosques de la Pradera',    tarifa: 5000 },
    { nombre: 'Boston',                   tarifa: 5000 },
    { nombre: 'Buenavista',               tarifa: 5000 },
    { nombre: 'Cantaclaro',               tarifa: 5000 },
    { nombre: 'Centro',                   tarifa: 5000 },
    { nombre: 'Ceiba 2',                  tarifa: 5000 },
    { nombre: 'Ceibal',                   tarifa: 5000 },
    { nombre: 'Chuchurubí',               tarifa: 5000 },
    { nombre: 'El Carmelo',               tarifa: 5000 },
    { nombre: 'El Dorado',                tarifa: 5000 },
    { nombre: 'El Poblado',               tarifa: 5000 },
    { nombre: 'El Prado',                 tarifa: 5000 },
    { nombre: 'El Progreso',              tarifa: 5000 },
    { nombre: 'Gonzalo Zuleta',           tarifa: 5000 },
    { nombre: 'La Candelaria',            tarifa: 5000 },
    { nombre: 'La Castellana',            tarifa: 5000 },
    { nombre: 'La Estancia',              tarifa: 5000 },
    { nombre: 'La Granja',                tarifa: 5000 },
    { nombre: 'La Pradera',               tarifa: 5000 },
    { nombre: 'La Quinta',                tarifa: 5000 },
    { nombre: 'La Ribera',                tarifa: 5000 },
    { nombre: 'Las Américas',             tarifa: 5000 },
    { nombre: 'Las Colinas',              tarifa: 5000 },
    { nombre: 'Las Delicias',             tarifa: 5000 },
    { nombre: 'Las Mercedes',             tarifa: 5000 },
    { nombre: 'Las Palmas',               tarifa: 5000 },
    { nombre: 'Los Alpes',                tarifa: 5000 },
    { nombre: 'Los Búcaros',              tarifa: 5000 },
    { nombre: 'Los Cerezos',              tarifa: 5000 },
    { nombre: 'Los Colores',              tarifa: 5000 },
    { nombre: 'Los Manguitos',            tarifa: 5000 },
    { nombre: 'Madre Bernarda',           tarifa: 5000 },
    { nombre: 'Mogambo',                  tarifa: 5000 },
    { nombre: 'Montería 2000',            tarifa: 5000 },
    { nombre: 'Nariño',                   tarifa: 5000 },
    { nombre: 'Nuevo Horizonte',          tarifa: 5000 },
    { nombre: 'Ospina Pérez',             tarifa: 5000 },
    { nombre: 'Panamericano',             tarifa: 5000 },
    { nombre: 'Pastrana',                 tarifa: 5000 },
    { nombre: 'Patio Bonito',             tarifa: 5000 },
    { nombre: 'Policarpa',                tarifa: 5000 },
    { nombre: 'Ranchos del INAT',         tarifa: 5000 },
    { nombre: 'Ronda del Sinú',           tarifa: 5000 },
    { nombre: 'San Martín',               tarifa: 5000 },
    { nombre: 'Santa Lucía',              tarifa: 5000 },
    { nombre: 'Santa Rosa',               tarifa: 5000 },
    { nombre: 'Sierra Chiquita',          tarifa: 5000 },
    { nombre: 'Sor Teresa Demjanovich',   tarifa: 5000 },
    { nombre: 'Tres Piedras',             tarifa: 5000 },
    { nombre: 'Unidad Deportiva',         tarifa: 5000 },
    { nombre: 'Urquijo',                  tarifa: 5000 },
    { nombre: 'Venezuela',                tarifa: 5000 },
    { nombre: 'Villa Caribe',             tarifa: 5000 },
    { nombre: 'Villa Cielo',              tarifa: 5000 },
    { nombre: 'Villa Country',            tarifa: 5000 },
    { nombre: 'Villa del Río',            tarifa: 5000 },
    { nombre: 'Villa Gabriela',           tarifa: 5000 },
    { nombre: 'Villa Hermosa',            tarifa: 5000 },
    { nombre: 'Villa Jiménez',            tarifa: 5000 },
    { nombre: 'Villa Margarita',          tarifa: 5000 },
    { nombre: 'Villa Melissa',            tarifa: 5000 },
    { nombre: 'Villa Rosa',               tarifa: 5000 },
    // ── Margen izquierda ($6.000) ────────────────────────────────────
    { nombre: '2 de Septiembre',          tarifa: 6000 },
    { nombre: 'Betania',                  tarifa: 6000 },
    { nombre: 'Camilo Torres',            tarifa: 6000 },
    { nombre: 'Cantarranas',              tarifa: 6000 },
    { nombre: 'Ceiba I (La Ceiba)',       tarifa: 6000 },
    { nombre: 'Edmundo López',            tarifa: 6000 },
    { nombre: 'El Cerrito',               tarifa: 6000 },
    { nombre: 'El Níspero',              tarifa: 6000 },
    { nombre: 'El Paraíso',              tarifa: 6000 },
    { nombre: 'La Campiña',              tarifa: 6000 },
    { nombre: 'La Florida',               tarifa: 6000 },
    { nombre: 'La Independencia',         tarifa: 6000 },
    { nombre: 'Los Araujos',              tarifa: 6000 },
    { nombre: 'Los Nogales',              tarifa: 6000 },
    { nombre: 'Minuto de Dios',           tarifa: 6000 },
    { nombre: 'Mochileros',               tarifa: 6000 },
    { nombre: 'Nueva Belén',              tarifa: 6000 },
    { nombre: 'Nuevo Milenio',            tarifa: 6000 },
    { nombre: 'P5',                       tarifa: 6000 },
    { nombre: 'Panzenú',                  tarifa: 6000 },
    { nombre: 'Rancho Grande',            tarifa: 6000 },
    { nombre: 'San Francisco',            tarifa: 6000 },
    { nombre: 'San Judas',                tarifa: 6000 },
    { nombre: 'Santander',                tarifa: 6000 },
    { nombre: 'Sinuflor',                 tarifa: 6000 },
    { nombre: 'Valeria',                  tarifa: 6000 },
    { nombre: 'Villa del Mar',            tarifa: 6000 },
    { nombre: 'Villa Emilia',             tarifa: 6000 },
    { nombre: 'Villa Paz',                tarifa: 6000 },
    { nombre: 'Villanueva',               tarifa: 6000 },
    // ── Norte ($6.000) ───────────────────────────────────────────────
    { nombre: '12 de Octubre',            tarifa: 6000 },
    { nombre: 'El Alivio',                tarifa: 6000 },
    { nombre: 'El Recreo',                tarifa: 6000 },
    { nombre: 'Furatena',                 tarifa: 6000 },
    { nombre: 'La Granja Norte',          tarifa: 6000 },
    { nombre: 'Los Cedros',               tarifa: 6000 },
    { nombre: 'Los Laureles',             tarifa: 6000 },
    { nombre: 'Mocarí',                   tarifa: 6000 },
    { nombre: 'Robinson Pitalúa',         tarifa: 6000 },
    { nombre: 'Urbanización el Norte',    tarifa: 6000 },
    { nombre: 'Villa del Norte',          tarifa: 6000 },
    { nombre: 'Villa del Rosario',        tarifa: 6000 },
    { nombre: 'Villa Natalia',            tarifa: 6000 },
    { nombre: 'Villa Orieta',             tarifa: 6000 },
];

// Estado en memoria de la tabla
let _domicilioBarrios = [];   // [{nombre, tarifa}, ...]
let _dominicilioFiltro = '';  // texto de búsqueda activo

// Barrios que agregan los clientes en el checkout de la tienda (colección
// 'barrios', con tarifa de barrio nuevo $7.000). Se muestran aquí marcados
// "cliente" para ajustarles el precio; al guardar pasan a la lista normal.
// Como esa colección no permite borrar, los que se eliminan aquí se anotan
// en barriosEliminados y la tienda deja de ofrecerlos.
const TARIFA_BARRIO_NUEVO = 7000;
let _domicilioEliminados = [];
function normBarrio(s) {
    return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

async function loadDomicilioBarrios() {
    try {
        const snap = await getDoc(doc(db, 'config', 'domicilioBarrios'));
        if (snap.exists() && snap.data().barrios) {
            _domicilioBarrios = snap.data().barrios.map(b => ({ nombre: b.nombre, tarifa: b.tarifa }));
        } else {
            // Primera vez: cargar defaults
            _domicilioBarrios = BARRIOS_MONTERIA_DEFAULT.map(b => ({ ...b }));
        }
        _domicilioEliminados = (snap.exists() && snap.data().barriosEliminados) || [];
        try {
            const enLista = new Set(_domicilioBarrios.map(b => normBarrio(b.nombre)));
            const eliminados = new Set(_domicilioEliminados.map(normBarrio));
            const deClientes = await getDocs(query(collection(db, 'barrios'), where('ciudad', '==', 'Montería')));
            deClientes.forEach(d => {
                const nombre = (d.data().nombre || '').trim();
                const n = normBarrio(nombre);
                if (!n || enLista.has(n) || eliminados.has(n)) return;
                enLista.add(n);
                const t = d.data().tarifa;
                _domicilioBarrios.push({ nombre, tarifa: Number.isFinite(t) ? t : TARIFA_BARRIO_NUEVO, deCliente: true });
            });
        } catch (e) {
            console.warn('No se pudieron cargar los barrios agregados por clientes:', e);
        }
        if (snap.exists() && snap.data().updatedAt) {
            const d = snap.data().updatedAt.toDate();
            document.getElementById('tarifas-last-update').textContent =
                'Última actualización: ' + d.toLocaleString('es-CO');
        }
    } catch (err) {
        console.error('Error cargando barrios:', err);
        _domicilioBarrios = BARRIOS_MONTERIA_DEFAULT.map(b => ({ ...b }));
    }
    _domicilioBarrios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    domicilioRenderTabla();
}

function domicilioRenderTabla() {
    const tbody = document.getElementById('barrios-tbody');
    const countEl = document.getElementById('barrios-count');
    if (!tbody) return;

    const filtro = _dominicilioFiltro.toLowerCase();
    const visible = filtro
        ? _domicilioBarrios.filter(b => b.nombre.toLowerCase().includes(filtro))
        : _domicilioBarrios;

    countEl.textContent = visible.length + ' barrios';

    if (visible.length === 0) {
        tbody.innerHTML = `<div class="text-center text-muted py-4">
            ${filtro ? 'No se encontró "' + escHtml(_dominicilioFiltro) + '"' : 'Sin barrios registrados'}
        </div>`;
        return;
    }

    tbody.innerHTML = visible.map((b) => {
        const idx = _domicilioBarrios.indexOf(b);
        return `<div data-idx="${idx}" style="display:flex;align-items:center;padding:7px 14px;border-bottom:1px solid #f0f0f0;min-height:46px;">
            <span style="flex:1;font-size:14px;padding-right:8px;word-break:break-word;">${escHtml(b.nombre)}${b.deCliente ? ' <span title="Agregado por un cliente en la tienda; revisa su tarifa y guarda" style="font-size:11px;font-weight:600;color:#be185d;background:#fdf2f8;border-radius:999px;padding:1px 7px;margin-left:4px;white-space:nowrap;">cliente</span>' : ''}</span>
            <div style="display:flex;align-items:center;width:115px;flex-shrink:0;border:1px solid #dee2e6;border-radius:6px;overflow:hidden;background:#fff;">
                <span style="padding:0 6px;font-size:13px;color:#6c757d;background:#f8f9fa;border-right:1px solid #dee2e6;line-height:36px;height:36px;">$</span>
                <input type="number" min="0" step="500"
                       value="${b.tarifa}"
                       onchange="domicilioSetTarifa(${idx}, this.value)"
                       style="width:0;flex:1;border:none;outline:none;padding:0 6px;font-size:14px;font-weight:600;height:36px;background:transparent;">
            </div>
            <button onclick="domicilioEliminar(${idx})" title="Eliminar"
                    style="margin-left:8px;width:32px;height:32px;flex-shrink:0;border:none;background:none;color:#dc3545;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;">
                <i class="bi bi-trash"></i>
            </button>
        </div>`;
    }).join('');
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.domicilioFiltrar = function(texto) {
    _dominicilioFiltro = texto;
    domicilioRenderTabla();
};

window.domicilioSetTarifa = function(idx, valor) {
    const v = parseInt(valor, 10);
    if (!isNaN(v) && v >= 0) _domicilioBarrios[idx].tarifa = v;
};

window.domicilioEliminar = function(idx) {
    const nombre = _domicilioBarrios[idx]?.nombre || '';
    if (!confirm(`¿Eliminar "${nombre}" de la lista?`)) return;
    // Que la tienda no lo vuelva a ofrecer (puede venir de la colección
    // 'barrios' de clientes, que no se puede borrar). Se aplica al guardar.
    if (!_domicilioEliminados.some(n => normBarrio(n) === normBarrio(nombre))) _domicilioEliminados.push(nombre);
    _domicilioBarrios.splice(idx, 1);
    domicilioRenderTabla();
};

window.domicilioAgregarFila = function() {
    const nombre = prompt('Nombre del barrio:');
    if (!nombre || !nombre.trim()) return;
    const nombreTrim = nombre.trim();
    if (_domicilioBarrios.some(b => normBarrio(b.nombre) === normBarrio(nombreTrim))) {
        alert('Ese barrio ya está en la lista.');
        return;
    }
    const tarifa = parseInt(prompt('Costo de domicilio ($):', '5000'), 10);
    if (isNaN(tarifa) || tarifa < 0) { alert('Tarifa no válida.'); return; }
    _domicilioBarrios.push({ nombre: nombreTrim, tarifa });
    _domicilioEliminados = _domicilioEliminados.filter(n => normBarrio(n) !== normBarrio(nombreTrim));
    _domicilioBarrios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    document.getElementById('barrio-search').value = '';
    _dominicilioFiltro = '';
    domicilioRenderTabla();
};

window.saveDomicilioBarrios = async function() {
    const btn = document.getElementById('btn-save-tarifas');
    const statusEl = document.getElementById('tarifas-save-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
    statusEl.style.display = 'none';
    try {
        // Leer valores actuales de inputs visibles antes de guardar
        document.querySelectorAll('#barrios-tbody div[data-idx]').forEach(tr => {
            const idx = parseInt(tr.dataset.idx, 10);
            const input = tr.querySelector('input[type=number]');
            if (input && !isNaN(idx) && _domicilioBarrios[idx]) {
                const v = parseInt(input.value, 10);
                if (!isNaN(v) && v >= 0) _domicilioBarrios[idx].tarifa = v;
            }
        });
        await setDoc(doc(db, 'config', 'domicilioBarrios'), {
            // Al guardar, los agregados por clientes pasan a la lista normal.
            barrios: _domicilioBarrios.map(b => ({ nombre: b.nombre, tarifa: b.tarifa })),
            barriosEliminados: _domicilioEliminados,
            updatedAt: serverTimestamp()
        });
        _domicilioBarrios.forEach(b => { delete b.deCliente; });
        domicilioRenderTabla();
        showToast('✅ Tarifas guardadas correctamente', 'success');
        statusEl.style.display = 'inline';
        document.getElementById('tarifas-last-update').textContent = 'Última actualización: ' + new Date().toLocaleString('es-CO');
        setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
    } catch (err) {
        console.error('Error guardando:', err);
        showToast('Error al guardar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-check me-1"></i> Guardar cambios';
    }
};

// Cargar al navegar a la sección
document.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#config-domicilio"]')) {
        setTimeout(loadDomicilioBarrios, 100);
    }
});

    // ════════════════════════════════════════════════════════════════════
    // MÓDULOS EXCLUSIVOS DE FÁBRICA — portados de admin-fabrica.js (ver Fase 3
    // del plan de panel único). Solo se activan si el HTML de la sección
    // existe (empresas sin producción propia no tienen estos tab-pane), y
    // solo son visibles en el rail-nav con los permisos fabrica_gestionar /
    // inventario_fabrica_gestionar (auth.js → MODULOS_PERMISOS).
    // ════════════════════════════════════════════════════════════════════
    // Fábrica — gastos vs. ingresos → src/admin/secciones/fabrica.js
    cargarSeccionDiferida('#fabrica', () => import('./src/admin/secciones/fabrica.js?v=1'));
    // Inventario Fábrica — hilazas, hilos y telas → src/admin/secciones/inventario-fabrica.js
    cargarSeccionDiferida('#inventario-fabrica', () => import('./src/admin/secciones/inventario-fabrica.js?v=1'));
    // Productos Fábrica → src/admin/secciones/productos-fabrica.js
    cargarSeccionDiferida('#productos-fabrica', () => import('./src/admin/secciones/productos-fabrica.js?v=1'));
    // Cargue masivo Fábrica → src/admin/secciones/cargue-masivo-fabrica.js
    cargarSeccionDiferida('#cargue-masivo-fabrica', () => import('./src/admin/secciones/cargue-masivo-fabrica.js?v=1'));

});
