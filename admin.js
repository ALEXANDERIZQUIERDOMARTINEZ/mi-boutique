// Import Firebase core and Firestore modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot, serverTimestamp, query, where, orderBy, writeBatch, Timestamp, getDoc, deleteField, limit } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
// Import Storage
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

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
const db = getFirestore(app);
const storage = getStorage(app);
console.log("Firebase Initialized!");

// Inicializar window.appContext desde sessionStorage (datos guardados en login)
(function() {
    try {
        const stored = sessionStorage.getItem('adminUser');
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

// Exponer funciones de Firebase globalmente para barcode-system.js
window.db = db;
window.collection = collection;
window.getDocs = getDocs;
window.query = query;
window.where = where;
window.orderBy = orderBy;

// --- Collections References ---
const categoriesCollection = collection(db, 'categorias');
const suppliersCollection = collection(db, 'proveedores');
const clientsCollection = collection(db, 'clientes');
const repartidoresCollection = collection(db, 'repartidores');
const productsCollection = collection(db, 'productos');
const salesCollection = collection(db, 'ventas');
const apartadosCollection = collection(db, 'apartados');
const financesCollection = collection(db, 'movimientosFinancieros');
const closingsCollection = collection(db, 'cierresCaja');
const webOrdersCollection = collection(db, 'pedidosWeb');
const chatConversationsCollection = collection(db, 'chatConversations');
const metasCollection = collection(db, 'metas');
const recepcionesCollection = collection(db, 'ordenesRecepcion');
const promocionesGlobalesCollection = collection(db, 'promocionesGlobales');

// --- Global map for product sales count ---
if (!window.productSalesCount) {
    window.productSalesCount = new Map();
}

// Function to calculate total sales per product
async function calculateProductSales() {
    try {
        const salesSnapshot = await getDocs(salesCollection);
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

// Calculate sales on page load
calculateProductSales();

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

// --- Global Modal Instances ---
let addClientModalInstance = null; let addRepartidorModalInstance = null; let addSupplierModalInstance = null; let addIncomeModalInstance = null; let addExpenseModalInstance = null; let editCategoryModalInstance = null; let deleteConfirmModalInstance = null;
let editSupplierModalInstance = null; let editClientModalInstance = null;
let searchSupplierModalInstance = null; let searchClientModalInstance = null; let searchProductModalInstance = null; let liquidateConfirmModalInstance = null;
let viewSaleModalInstance = null;
let selectVariationModalInstance = null; // --- Modal de Variaciones ---
let abonoApartadoModalInstance = null; // ✅ --- NUEVO: Modal de Abonos ---
let verApartadoModalInstance = null; // ✅ --- NUEVO: Modal de Ver Apartado ---

let localClientsMap = new Map([["Cliente General", {id: null, celular: "", direccion: ""}]]);
let localProductsMap = new Map();
window.localProductsMap = localProductsMap;
let repartidoresMap = new Map(); // ✅ Mapa de repartidores para el modal de ver venta

// ========================================================================
// --- FUNCIÓN GLOBAL: ACTUALIZAR STOCK ---
// ========================================================================
async function actualizarStock(itemsVendido, accion = 'restar') {
    if (!itemsVendido || itemsVendido.length === 0) return;

    const batch = writeBatch(db);
    let productosParaActualizar = new Map();

    for (const item of itemsVendido) {
        if (!item.productoId) {
            console.warn("Item en carrito sin productoId, omitiendo stock:", item);
            continue;
        }

        if (!productosParaActualizar.has(item.productoId)) {
            const productoActual = localProductsMap.get(item.productoId);
            if (!productoActual) {
                console.error(`Producto ${item.productoId} no encontrado en localProductsMap. Omitiendo stock.`);
                continue;
            }
            productosParaActualizar.set(item.productoId, JSON.parse(JSON.stringify(productoActual.variaciones)));
        }

        let variaciones = productosParaActualizar.get(item.productoId);
        let variacionEncontrada = false;

        let nuevasVariaciones = variaciones.map(v => {
            if (v.talla === item.talla && v.color === item.color) {
                variacionEncontrada = true;
                const stockActual = parseInt(v.stock, 10) || 0;
                const cantidad = parseInt(item.cantidad, 10);

                if (accion === 'restar') {
                    v.stock = stockActual - cantidad;
                } else if (accion === 'sumar') {
                    v.stock = stockActual + cantidad;
                }
            }
            return v;
        });

        if (variacionEncontrada) {
            productosParaActualizar.set(item.productoId, nuevasVariaciones);
        } else {
            console.warn(`No se encontró la variación ${item.talla}/${item.color} para el producto ${item.productoId}`);
        }
    }

    productosParaActualizar.forEach((nuevasVariaciones, productoId) => {
        const productRef = doc(db, 'productos', productoId);
        batch.update(productRef, { variaciones: nuevasVariaciones });
    });

    try {
        await batch.commit();
        console.log(`Stock actualizado (acción: ${accion}) correctamente.`);
    } catch (error) {
        console.error("Error al actualizar stock en batch:", error);
        showToast('Venta guardada, pero falló la actualización de stock.', 'error');
    }
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
                    
                    if (docSnap.exists()) {
                        const productData = docSnap.data();
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
            return allOrders[estado].filter(({ order }) => {
                const ms = !searchQuery || (order.clienteNombre || '').toLowerCase().includes(searchQuery) || (order.clienteCelular || '').includes(searchQuery);
                const mp = !filterPago || (order.metodoPagoSolicitado || '').toLowerCase() === filterPago.toLowerCase();
                return ms && mp;
            });
        }

        function formatFecha(ts) {
            if (!ts?.toDate) return 'Fecha no disponible';
            return ts.toDate().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
        }

        // ── Stats ────────────────────────────────────────────────────────────
        function updateStats() {
            const count = allOrders.pendiente.length;
            if (pedidosWebCountBadge) { pedidosWebCountBadge.textContent = count; pedidosWebCountBadge.style.display = count > 0 ? 'inline' : 'none'; }
            if (mbnBadge) { mbnBadge.textContent = count; mbnBadge.style.display = count > 0 ? 'inline-flex' : 'none'; }
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
                    ? `<img src="${product.imagenUrl}" class="pw-item-img" alt="${item.nombre}">`
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
        ['pendiente', 'aceptado', 'rechazado'].forEach(estado => {
            const q = query(webOrdersCollection, where('estado', '==', estado), orderBy('timestamp', 'desc'), limit(50));
            onSnapshot(q, snapshot => {
                allOrders[estado] = [];
                snapshot.forEach(d => allOrders[estado].push({ id: d.id, order: d.data() }));
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
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) { showToast('Pedido no encontrado', 'error'); return; }
                const orderData = orderSnap.data();
                const subtotal = orderData.subtotalProductos || orderData.totalPedido || 0;

                await loadRepartidores();
                const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deliveryCostModal'));
                const costInput = document.getElementById('delivery-cost-input');
                const preview  = document.getElementById('order-summary-preview');
                const confirmBtn = document.getElementById('confirm-whatsapp-btn');
                const sel = document.getElementById('delivery-person-select');

                confirmBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Aceptar Pedido';
                costInput.value = orderData.costoEnvio || 0;
                sel.value = orderData.repartidor || sel.options[0]?.value || '';

                const onInput = () => { preview.innerHTML = buildPreviewHtml(subtotal, parseFloat(costInput.value) || 0); };
                costInput.removeEventListener('input', onInput);
                costInput.addEventListener('input', onInput);
                onInput();
                modal.show();

                confirmBtn.onclick = async () => {
                    try {
                        const dc = parseFloat(costInput.value) || 0;
                        const dp = sel.value;
                        const total = subtotal + dc;
                        await updateDoc(orderRef, { estado: 'aceptado', fechaAceptacion: serverTimestamp(), costoEnvio: dc, repartidor: dp, totalPedido: total });
                        modal.hide();
                        await preFillSalesForm(orderData, orderId, dc, total, dp);
                        showToast('Pedido aceptado. Completa el formulario de venta.', 'success');
                        if (window.adminShowSection) { window.adminShowSection('#ventas'); window.adminMarkActive('#ventas'); }
                        const btn = document.getElementById('toggle-sales-form-view-btn');
                        if (btn) btn.click();
                        confirmBtn.innerHTML = '<i class="bi bi-whatsapp me-1"></i>Enviar WhatsApp';
                        await notificarRepartidor(dp, orderData, dc, total);
                    } catch (err) { console.error('Error al aceptar:', err); showToast('Error al procesar el pedido', 'error'); }
                };
            } catch (err) { console.error('Error al aceptar:', err); showToast('Error al procesar el pedido', 'error'); }
        }

        async function preFillSalesForm(orderData, orderId, deliveryCost = 0, total = 0, deliveryPerson = 'Papi') {
            window.ventaItems = [];
            const vc = document.getElementById('venta-cliente');
            const vcel = document.getElementById('venta-cliente-celular');
            const vdir = document.getElementById('venta-cliente-direccion');
            if (vc) vc.value = orderData.clienteNombre;
            if (vcel) vcel.value = orderData.clienteCelular;
            if (vdir) vdir.value = orderData.clienteDireccion;
            const tvs = document.getElementById('tipo-venta-select'); if (tvs) tvs.value = 'detal';
            const tes = document.getElementById('tipo-entrega-select');
            if (tes) { tes.value = 'domicilio'; tes.dispatchEvent(new Event('change')); }
            const cdi = document.getElementById('costo-domicilio');
            if (cdi && deliveryCost > 0) { cdi.value = deliveryCost; cdi.dispatchEvent(new Event('input')); }
            const vwc = document.getElementById('venta-whatsapp'); if (vwc) vwc.checked = false;
            const vobs = document.getElementById('venta-observaciones');
            if (vobs) {
                let obs = `Pedido Web #${orderId.substring(0,8).toUpperCase()}\nRepartidor: ${deliveryPerson}\n`;
                if (orderData.observaciones) obs += `${orderData.observaciones}\n`;
                if (deliveryCost > 0) obs += `Costo Domicilio: ${formatoMoneda.format(deliveryCost)}`;
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

    // ========================================================================
    // --- LÓGICA CATEGORÍAS (Funcional CRUD with Modals) ---
    // ========================================================================
    (() => {
        const categoryForm = document.getElementById('form-categoria'); const categoryNameInput = document.getElementById('nombre-categoria'); const categoryList = document.getElementById('lista-categorias'); const categoryDropdown = document.getElementById('categoria-producto'); const editForm = document.getElementById('form-edit-category'); const editIdInput = document.getElementById('edit-category-id'); const editNameInput = document.getElementById('edit-category-nombre');
        if (!categoryForm || !categoryList || !categoryDropdown || !editForm) { console.warn("Elementos de Categorías no encontrados."); return; }
        const render = (snapshot) => { if (!categoryList) return; categoryList.innerHTML = ''; if (snapshot.empty) { categoryList.innerHTML = '<li class="list-group-item text-muted">No hay categorías.</li>'; return; } snapshot.forEach(doc => { const d = doc.data(); const id = doc.id; const li = document.createElement('li'); li.className = 'list-group-item d-flex justify-content-between align-items-center'; li.dataset.id = id; li.innerHTML = `<span class="category-name">${d.nombre}</span><div class="action-buttons"><button class="btn btn-action btn-action-edit me-1 btn-edit-category"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button><button class="btn btn-action btn-action-delete btn-delete-category"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></div>`; categoryList.appendChild(li); }); };
        const updateDropdown = (snapshot) => { if (!categoryDropdown) return; const sel = categoryDropdown.value; categoryDropdown.innerHTML = '<option value="">Selecciona...</option>'; snapshot.forEach(doc => { const d = doc.data(); const opt = document.createElement('option'); opt.value = doc.id; opt.textContent = d.nombre; categoryDropdown.appendChild(opt); }); categoryDropdown.value = sel; }
        const checkDuplicate = async (name, currentId = null) => { const lowerCaseName = name.toLowerCase(); const q = query(categoriesCollection, where("nombreLower", "==", lowerCaseName)); const querySnapshot = await getDocs(q); let isDuplicate = false; querySnapshot.forEach((doc) => { if (doc.id !== currentId) { isDuplicate = true; } }); return isDuplicate; };
        onSnapshot(query(categoriesCollection, orderBy("nombre")), (s) => { render(s); updateDropdown(s); }, (e) => { console.error("Error categories: ", e); if(categoryList) categoryList.innerHTML = '<li class="list-group-item text-danger">Error.</li>'; });
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
        onSnapshot(query(suppliersCollection, orderBy('nombre')), renderSuppliers, (e) => { console.error("Error suppliers:", e); if(listTable) listTable.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error.</td></tr>';});
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
        const ventaClienteInput = document.getElementById('venta-cliente'); const ventaCelularInput = document.getElementById('venta-cliente-celular'); const ventaDireccionInput = document.getElementById('venta-cliente-direccion');
        if (!addForm || !editForm || !clientListTable || !searchModalList) { console.warn("Elementos de Clientes no encontrados."); return; }
        
        const renderClients = (snapshot) => { localClientsMap.clear(); if(clientListTable) clientListTable.innerHTML = ''; if(searchModalList) searchModalList.innerHTML = ''; localClientsMap.set("Cliente General", {id: null, celular: "", direccion: "", nombre: "Cliente General"}); if(searchModalList) { const liGen = document.createElement('li'); liGen.className = 'list-group-item list-group-item-action client-search-item'; liGen.dataset.name = "Cliente General"; liGen.dataset.id = ""; liGen.textContent = "Cliente General"; searchModalList.appendChild(liGen); } if (snapshot.empty) { if(clientListTable) clientListTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay clientes.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; const dataListValue = d.cedula ? `${d.cedula} - ${d.nombre}` : d.nombre; localClientsMap.set(dataListValue, { id: id, celular: d.celular || "", direccion: d.direccion || "", nombre: d.nombre || "" }); localClientsMap.set(id, d); if (clientListTable) { const tr = document.createElement('tr'); tr.dataset.id = id; tr.innerHTML = `<td class="client-name">${d.nombre}</td> <td>${d.cedula || '-'}</td> <td>${d.celular || '-'}</td> <td>${d.direccion || '-'}</td> <td>${d.ultimaCompra?.toDate ? d.ultimaCompra.toDate().toLocaleDateString('es-CO') : '-'}</td> <td class="action-buttons"><button class="btn btn-action btn-action-view btn-client-history" data-client-name="${d.nombre}" data-client-celular="${d.celular || ''}"><i class="bi bi-clock-history"></i><span class="btn-action-text">Historial</span></button> <button class="btn btn-action btn-action-edit btn-edit-client"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button> <button class="btn btn-action btn-action-delete btn-delete-client"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></td>`; clientListTable.appendChild(tr); }
            const li = document.createElement('li'); li.className = 'list-group-item list-group-item-action client-search-item'; li.dataset.name = dataListValue; li.dataset.id = id; li.textContent = dataListValue; searchModalList.appendChild(li);
        }); document.dispatchEvent(new CustomEvent('clientsLoaded', { detail: { clientsMap: localClientsMap } })); window.fillClientInfoSales(); };
        
        window.fillClientInfoSales = function() { 
            if (!ventaClienteInput || !ventaCelularInput || !ventaDireccionInput) return; 
            const selectedValue = ventaClienteInput.value; 
            const clientInfo = localClientsMap.get(selectedValue); 
            if (clientInfo) { 
                ventaCelularInput.value = clientInfo.celular; 
                ventaDireccionInput.value = clientInfo.direccion; 
            } else { 
                ventaCelularInput.value = ""; 
                ventaDireccionInput.value = ""; 
            } 
        }
        
        onSnapshot(query(clientsCollection, orderBy('nombre')), renderClients, (e) => { console.error("Error clients:", e); if(clientListTable) clientListTable.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error.</td></tr>';});
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
        const productForm = document.getElementById('form-producto'); const productIdInput = document.getElementById('producto-id'); const nombreInput = document.getElementById('nombre'); const codigoInput = document.getElementById('codigo'); const codigoBarrasInput = document.getElementById('codigo-barras'); const proveedorInput = document.getElementById('proveedor-producto'); const descripcionInput = document.getElementById('descripcion'); const categoriaSelect = document.getElementById('categoria-producto'); const costoInput = document.getElementById('costo-compra'); const detalInput = document.getElementById('precio-detal'); const mayorInput = document.getElementById('precio-mayor'); const variationsContainer = document.getElementById('variaciones-container'); const imagenInput = document.getElementById('imagen'); const visibleCheckbox = document.getElementById('visibilidad'); const productListTableBody = document.getElementById('lista-inventario-productos'); const clearFormBtn = document.getElementById('btn-clear-product-form');
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
        
        const renderProducts = (snapshot) => { 
            localProductsMap.clear(); 
            
            const filterCategoryDropdown = document.getElementById('filter-category-inventory');
            const productCategoryDropdown = document.getElementById('categoria-producto');
            if (filterCategoryDropdown && productCategoryDropdown) { 
                if (filterCategoryDropdown.options.length <= 1) { 
                    filterCategoryDropdown.innerHTML = productCategoryDropdown.innerHTML;
                    filterCategoryDropdown.value = ''; 
                }
            }

            if(!productListTableBody) return; 
            const emptyRow = document.getElementById('empty-inventory-row'); 
            productListTableBody.innerHTML = ''; 
            if(productSearchModalList) productSearchModalList.innerHTML = ''; 
            if (snapshot.empty) { 
                if(emptyRow) { 
                    emptyRow.style.display = ''; 
                    productListTableBody.appendChild(emptyRow); 
                } 
                return; 
            } 
            if(emptyRow) emptyRow.style.display = 'none'; 
            
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                const id = docSnap.id; 
                
                localProductsMap.set(id, d);

                const stockTotal = d.variaciones ? d.variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0) : 0; 
                const defaultImgTabla = 'https://placehold.co/60x80/f0f0f0/cccccc?text=Foto';
                const imagenUrl = d.imagenUrl || defaultImgTabla; 

                let variacionesHtml = (d.variaciones || [])
                    .map(v => `<span class="badge bg-light text-dark me-1">${v.talla || ''} / ${v.color || ''} (Stock: ${v.stock})</span>`)
                    .join(' ');
                if (variacionesHtml === '') variacionesHtml = '<small class="text-muted">Sin variaciones</small>';

                let categoryName = 'Sin Categoría';
                if (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map) {
                    categoryName = categoriesMap.get(d.categoriaId) || 'Sin Categoría';
                }

                // Verificar si tiene promoción
                const hasPromo = d.promocion && d.promocion.activa;
                const promoHtml = hasPromo
                    ? `<button class="btn btn-action btn-action-warning btn-manage-promo">
                        <i class="bi bi-tag-fill"></i><span class="btn-action-text">${d.promocion.tipo === 'porcentaje' ? d.promocion.descuento + '%' : 'Promo'}</span>
                       </button>`
                    : `<button class="btn btn-action btn-action-edit btn-manage-promo">
                        <i class="bi bi-tag"></i><span class="btn-action-text">+ Promo</span>
                       </button>`;

                // Generar columna de código de barras
                let barcodeHtml = '';
                if (d.codigoBarras) {
                    barcodeHtml = `
                        <div class="barcode-cell">
                            <svg id="barcode-mini-${id}" class="barcode-mini"></svg>
                            <small class="d-block text-muted mt-1">${d.codigoBarras}</small>
                            <button class="btn btn-sm btn-outline-primary mt-1 btn-ver-barcode" data-product-id="${id}">
                                <i class="bi bi-eye"></i> Ver
                            </button>
                        </div>
                    `;
                } else {
                    barcodeHtml = '<small class="text-muted">Sin código</small>';
                }

                const tr = document.createElement('tr');
                tr.dataset.id = id;
                tr.innerHTML = `<td><img src="${imagenUrl}" alt="${d.nombre}" class="table-product-img" onerror="this.src='${defaultImgTabla}'"></td>
                                <td class="product-name">${d.nombre}<small class="text-muted d-block">Código: ${d.codigo || id.substring(0,6)}</small></td>
                                <td>${categoryName}</td> <td>${variacionesHtml}</td>
                                <td>${formatoMoneda.format(d.precioDetal || 0)}</td>
                                <td>${formatoMoneda.format(d.precioMayor || 0)}</td>
                                <td>${stockTotal}</td>
                                <td>${barcodeHtml}</td>
                                <td>${promoHtml}</td>
                                <td><span class="badge ${d.visible ? 'bg-success' : 'bg-secondary'}">${d.visible ? 'Visible' : 'Oculto'}</span></td>
                                <td class="action-buttons">
                                    <button class="btn btn-action btn-action-edit btn-edit-product">
                                        <i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span>
                                    </button>
                                    <button class="btn btn-action btn-action-delete btn-delete-product">
                                        <i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span>
                                    </button>
                                </td>`;
                if(productListTableBody) productListTableBody.appendChild(tr);

                // Generar código de barras visual en miniatura
                if (d.codigoBarras) {
                    try {
                        JsBarcode(`#barcode-mini-${id}`, d.codigoBarras, {
                            format: "EAN13",
                            width: 1,
                            height: 30,
                            displayValue: false,
                            margin: 2
                        });
                    } catch (e) {
                        console.error('Error generando código de barras:', e);
                    }
                }

                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action product-search-item';
                li.dataset.productId = id;
                li.dataset.productName = d.nombre.toLowerCase();
                li.dataset.productCode = (d.codigo || '').toLowerCase();
                li.dataset.categoria = d.categoriaId || '';
                li.dataset.stock = stockTotal;
                li.dataset.visible = d.visible ? 'true' : 'false';
                li.dataset.precioOriginal = d.precioDetal || 0;
                li.dataset.totalSales = window.productSalesCount.get(id) || 0;

                const defaultImgModal = 'https://placehold.co/70x90.png?text=Sin+Foto';
                const imagenUrlModal = d.imagenUrl || defaultImgModal; 

                let categoryNameModal = 'Sin Categoría';
                if (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map) {
                    categoryNameModal = categoriesMap.get(d.categoriaId) || 'Sin Categoría';
                }

                li.innerHTML = `
                    <div class="pm-product-item">
                        <img src="${imagenUrlModal}" alt="${d.nombre}" class="product-search-img" onerror="this.src='${defaultImgModal}'">
                        <div class="pm-product-body">
                            <div class="product-search-name">${d.nombre}</div>
                            <div class="pm-product-meta">
                                <span class="pm-product-cat">${categoryNameModal}</span>
                                ${d.codigo ? `<span class="pm-product-code"># ${d.codigo}</span>` : ''}
                            </div>
                            <div class="pm-product-footer">
                                <div class="price-info" data-precio-detal="${d.precioDetal || 0}" data-precio-mayor="${d.precioMayor || 0}">
                                    ${formatoMoneda.format(d.precioDetal || 0)}
                                </div>
                                ${d.precioMayor ? `<div class="pm-price-mayor text-muted" style="font-size:0.72rem;">Mayor: ${formatoMoneda.format(d.precioMayor)}</div>` : ''}
                                <div class="stock-info">Stock: ${stockTotal}</div>
                            </div>
                        </div>
                    </div>
                `;

                if(stockTotal <= 0) {
                    li.classList.add('disabled');
                    li.style.opacity = '0.5';
                    li.style.cursor = 'not-allowed';
                }
                if(productSearchModalList) productSearchModalList.appendChild(li);
            });

            applyInventoryFilters();

            // Aplicar ordenamiento al modal de búsqueda
            if (typeof applyProductModalFilters === 'function') {
                applyProductModalFilters();
            }
        };
        onSnapshot(query(productsCollection, orderBy('timestamp', 'desc')), renderProducts, e => { console.error("Error products:", e); if(productListTableBody) productListTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error.</td></tr>';});
        
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

            function updateMiniPreview() {
                const imgUrl = stateItem.imagenes[0]?.url || null;
                if (imgUrl && stateItem.dotPosition) {
                    miniPreview.style.backgroundImage    = `url('${imgUrl}')`;
                    miniPreview.style.backgroundSize     = '400%';
                    miniPreview.style.backgroundPosition = `${stateItem.dotPosition.x}% ${stateItem.dotPosition.y}%`;
                    miniPreview.style.backgroundColor    = '';
                } else {
                    miniPreview.style.backgroundImage = '';
                    miniPreview.style.backgroundColor = stateItem.hex || '#e9ecef';
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
                    const file = cv.newFiles[i];
                    const angulo = cv.newFileAngles[i] || 'frente';
                    const fileName = `${tenantId || 'tenant'}/productos/${productId}/color_${cv.id}_${Date.now()}_${i}_${file.name}`;
                    const storageRef = ref(storage, fileName);
                    const snapshot = await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(snapshot.ref);
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

            imgEl.src = imgUrl;
            imgEl.onload = () => {
                // Ajustar tamaño del círculo indicador al recorte real (zoom 400%)
                const cropPx = imgEl.offsetWidth / 4;
                circleEl.style.width  = cropPx + 'px';
                circleEl.style.height = cropPx + 'px';
                updateDotZoneUI(circleEl, previewEl, imgEl, dotZonePos.x, dotZonePos.y);
            };

            if (!dotZoneModal) dotZoneModal = new bootstrap.Modal(document.getElementById('dotZoneModal'));
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

            // Preview: recorte circular con mismo zoom (400%) que el catálogo
            if (previewEl) {
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
            document.getElementById('product-form-title').textContent = "Agregar Producto";
            imagenInput.required = true;
            const mostrarFotoChk = document.getElementById('mostrar-foto-principal');
            if (mostrarFotoChk) mostrarFotoChk.checked = true;
        }
        
        if (clearFormBtn) clearFormBtn.addEventListener('click', (e) => { e.preventDefault(); window.clearProductForm(); });
        
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
            let productData = { nombre: nombreProducto, codigo: codigoInput ? codigoInput.value.trim() : '', codigoBarras: codigoBarrasInput ? codigoBarrasInput.value.trim() : '', proveedor: proveedorInput.value.trim(), descripcion: descripcionInput.value.trim(), categoriaId: categoriaSelect.value, costoCompra: parseFloat(costoInput.value) || 0, precioDetal: parseFloat(detalInput.value) || 0, precioMayor: parseFloat(mayorInput.value) || 0, visible: visibleCheckbox.checked, mostrarFotoPrincipal: mostrarFotoPrincipalCheckbox ? mostrarFotoPrincipalCheckbox.checked : true, timestamp: serverTimestamp(), variaciones: [], imagenUrl: null };

            const variationRows = variationsContainer.querySelectorAll('.variation-row:not(#variation-template)');
            variationRows.forEach(row => { const talla = row.querySelector('[name="variation_talla[]"]').value.trim(); const color = row.querySelector('[name="variation_color[]"]').value.trim(); const stock = parseInt(row.querySelector('[name="variation_stock[]"]').value, 10) || 0; if (talla || color || stock > 0) { productData.variaciones.push({ talla, color, stock }); } });

            try {
                const files = imagenInput.files;
                if (files.length > 0) {
                    showToast("Subiendo imagen...", 'info');
                    const firstFile = files[0];
                    const fileName = `product_images/${Date.now()}-${firstFile.name}`;
                    const storageRef = ref(storage, fileName);

                    const uploadResult = await uploadBytes(storageRef, firstFile);
                    productData.imagenUrl = await getDownloadURL(uploadResult.ref);
                    console.log("Imagen subida:", productData.imagenUrl);
                }

                // ─── Subir imágenes de galería por color ───────────────────────────
                const sinNombre = colorVariantsState.find(cv => !cv.nombre);
                if (sinNombre) {
                    showToast('Cada color debe tener un nombre.', 'warning');
                    throw new Error('Color sin nombre');
                }
                const tenantId = window.appContext?.tenantId || 'tenant';
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
                    if (!productData.imagenUrl) {
                        const existingDoc = localProductsMap.get(productId);
                        productData.imagenUrl = existingDoc?.imagenUrl || null;
                    }
                    await updateDoc(doc(db, "productos", productId), productData);
                    showToast("Producto actualizado!");

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
                    const docRef = await addDoc(productsCollection, productData); 
                    showToast("Producto guardado!"); 
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
            const target = e.target.closest('button'); if (!target) return; e.preventDefault();
            const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.product-name'); if (!id || !nameTd) return;

             if (target.classList.contains('btn-ver-barcode')) {
                 const producto = localProductsMap.get(id);
                 if (producto && window.mostrarBarcodeModal) {
                     window.mostrarBarcodeModal(producto);
                 }
             } else if (target.classList.contains('btn-delete-product')) {
                 const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'productos'; deleteItemNameEl.textContent = `Producto: ${nameTd.firstChild.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
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
                        const mostrarFotoCheckbox = document.getElementById('mostrar-foto-principal');
                        if (mostrarFotoCheckbox) mostrarFotoCheckbox.checked = product.mostrarFotoPrincipal !== false;
                        imagenInput.required = false;
                        document.getElementById('product-form-title').textContent = `Editando: ${product.nombre}`;
                        
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

        // ✅ RESETEAR TODO EL INVENTARIO A 0
        const btnResetAllInventory = document.getElementById('btn-reset-all-inventory');
        if (btnResetAllInventory) {
            btnResetAllInventory.addEventListener('click', async () => {
                // ✅ VALIDACIÓN DE PERMISOS
                if (!checkPermission('productos_editar', 'modificar el inventario')) {
                    return;
                }

                // Confirmación con advertencia
                const confirmacion = confirm(
                    '⚠️ ADVERTENCIA: Esta acción pondrá el stock de TODOS los productos en 0.\n\n' +
                    '¿Estás seguro de que deseas continuar?\n\n' +
                    'Esta acción NO se puede deshacer.'
                );

                if (!confirmacion) {
                    return;
                }

                // Segunda confirmación para evitar errores
                const segundaConfirmacion = confirm(
                    '🔴 ÚLTIMA CONFIRMACIÓN:\n\n' +
                    'Se resetearán TODOS los productos del inventario.\n' +
                    '¿Continuar?'
                );

                if (!segundaConfirmacion) {
                    return;
                }

                try {
                    showToast("Reseteando inventario completo...", 'info');
                    btnResetAllInventory.disabled = true;
                    btnResetAllInventory.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Procesando...';

                    // Obtener todos los productos
                    const productos = Array.from(localProductsMap.values());

                    if (productos.length === 0) {
                        showToast("No hay productos en el inventario", 'warning');
                        btnResetAllInventory.disabled = false;
                        btnResetAllInventory.innerHTML = '<i class="bi bi-dash-circle-fill me-1"></i>Resetear Todo el Inventario a 0';
                        return;
                    }

                    // Usar batch update para optimizar escrituras
                    const batch = writeBatch(db);
                    let contadorActualizados = 0;

                    for (const [id, producto] of localProductsMap.entries()) {
                        if (producto.variaciones && producto.variaciones.length > 0) {
                            // Crear variaciones con stock en 0
                            const variacionesConStockCero = producto.variaciones.map(v => ({
                                ...v,
                                stock: 0
                            }));

                            // Agregar al batch
                            const productoRef = doc(db, "productos", id);
                            batch.update(productoRef, {
                                variaciones: variacionesConStockCero,
                                updatedAt: new Date(),
                                actualizadoPor: auth.currentUser?.uid || 'unknown'
                            });

                            contadorActualizados++;
                        }
                    }

                    // Ejecutar batch update
                    await batch.commit();

                    showToast(`✅ Inventario reseteado: ${contadorActualizados} productos actualizados a stock 0`, 'success');

                } catch (err) {
                    console.error("Error al resetear inventario:", err);
                    showToast(`Error al resetear inventario: ${err.message}`, 'error');
                } finally {
                    btnResetAllInventory.disabled = false;
                    btnResetAllInventory.innerHTML = '<i class="bi bi-dash-circle-fill me-1"></i>Resetear Todo el Inventario a 0';
                }
            });
        }

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
                        return aName.localeCompare(bName);
                    case 'name-desc':
                        return bName.localeCompare(aName);
                    case 'price-asc':
                        return aPrice - bPrice;
                    case 'price-desc':
                        return bPrice - aPrice;
                    case 'stock-desc':
                        return bStock - aStock;
                    default:
                        return aName.localeCompare(bName);
                }
            });

            // Aplicar visibilidad y orden
            items.forEach(item => item.style.display = 'none');
            visibleItems.forEach((item, index) => {
                item.style.display = '';
                productSearchModalList.appendChild(item); // Reordenar
            });

            // Actualizar contador
            const countEl = document.getElementById('product-modal-count');
            if (countEl) {
                countEl.textContent = `${visibleItems.length} producto(s) encontrado(s)`;
            }
        }

        // Event listeners para filtros
        if (productSearchInput) {
            productSearchInput.addEventListener('input', applyProductModalFilters);
        }

        const productModalCategory = document.getElementById('product-modal-category');
        const productModalStockOnly = document.getElementById('product-modal-stock-only');
        const productModalVisibleOnly = document.getElementById('product-modal-visible-only');
        const productModalSort = document.getElementById('product-modal-sort');
        const productModalClearFilters = document.getElementById('product-modal-clear-filters');

        if (productModalCategory) {
            productModalCategory.addEventListener('change', applyProductModalFilters);

            // Cargar categorías en el select
            onSnapshot(categoriesCollection, (snapshot) => {
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
                    openVariationModal(productId); 
                    searchProductModalInstance.hide();
                }
            });
        }

        function openVariationModal(productId) {
            const product = localProductsMap.get(productId);
            if (!product) {
                showToast("Error: Producto no encontrado", "error");
                return;
            }

            document.getElementById('variation-product-id').value = productId;
            document.getElementById('variation-product-name').value = product.nombre;

            // Obtener el tipo de venta seleccionado
            const tipoVentaSelect = document.getElementById('tipo-venta-select');
            const tipoVenta = tipoVentaSelect ? tipoVentaSelect.value : 'detal';

            // Aplicar precio según el tipo de venta
            let precioAplicar = product.precioDetal || 0;
            if (tipoVenta === 'mayorista') {
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
                            ? `<option value="${tallaUnicaValue}" selected>${tallaUnicaValue || 'Única'}</option>`
                            : `<option value="" selected>Selecciona una talla...</option>
                               ${tallas.map(t => `<option value="${t}">${t || 'Única'}</option>`).join('')}`
                        }
                    </select>
                </div>
                <div class="mb-3">
                    <label for="select-color" class="form-label">Color:</label>
                    <select class="form-select" id="select-color">
                        <option value="" selected>Selecciona un color...</option>
                        ${colores.map(c => `<option value="${c}">${c || 'Único'}</option>`).join('')}
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
                        selectColor.innerHTML += `<option value="${c}">${c || 'Único'}</option>`;
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
            addVariationBtn.addEventListener('click', () => {
                const productId = document.getElementById('variation-product-id').value;
                const nombre = document.getElementById('variation-product-name').value;
                const precio = parseFloat(document.getElementById('variation-product-price').value);
                const talla = document.getElementById('select-talla').value;
                const color = document.getElementById('select-color').value;

                if (!productId || !nombre || !precio || talla === '' || color === '') {
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
                    `${nombre} (${talla}/${color})` 
                );

                selectVariationModalInstance.hide();
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
            onSnapshot(query(categoriesCollection, orderBy("nombre")), (snapshot) => {
                categoriesMap.clear();
                snapshot.forEach(doc => {
                    categoriesMap.set(doc.id, doc.data().nombre);
                });
            });
        }

        function loadSuppliersForFilter() {
            onSnapshot(query(suppliersCollection, orderBy("nombre")), (snapshot) => {
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

            const allRows = inventoryBody.querySelectorAll('tr[data-id]');
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
                const stockTotal = product.variaciones
                    ? product.variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0)
                    : 0;

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

                const tr = btn.closest('tr');
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

    // ========================================================================
    // --- LÓGICA VENTAS (CRUD v.01 con Stock) ---
    // ========================================================================
    (() => {
         const salesForm = document.getElementById('form-venta'); const ventaClienteInput = document.getElementById('venta-cliente'); const tipoVentaSelect = document.getElementById('tipo-venta-select'); const tipoEntregaSelect = document.getElementById('tipo-entrega-select'); const ventaWhatsappCheckbox = document.getElementById('venta-whatsapp'); const ventaRepartidorSelect = document.getElementById('venta-repartidor'); const costoRutaInput = document.getElementById('costo-ruta'); const rutaPagadaCheckbox = document.getElementById('ruta-pagada-transferencia'); const ventaProductoInput = document.getElementById('venta-producto'); const ventaCarritoTbody = document.getElementById('venta-carrito'); const ventaObservaciones = document.getElementById('venta-observaciones'); const ventaDescuentoInput = document.getElementById('venta-descuento'); const ventaDescuentoTipo = document.getElementById('venta-descuento-tipo'); const pagoEfectivoInput = document.getElementById('pago-efectivo'); const pagoTransferenciaInput = document.getElementById('pago-transferencia'); const ventaTotalSpan = document.getElementById('venta-total'); const salesListTableBody = document.getElementById('lista-ventas-anteriores'); 
         
         window.ventaItems = []; 
         
         if(!salesForm) { console.warn("Elementos de Ventas no encontrados."); return; }
         
         window.addEventListener('addItemToCart', (e) => { 
            const { productId, nombre, precio, talla, color, nombreCompleto } = e.detail; 
            window.agregarItemAlCarrito(productId, nombre, 1, precio, talla, color, nombreCompleto); 
         });
         
         window.agregarItemAlCarrito = function(productoId, nombre, cantidad, precio, talla, color, nombreCompleto) { 
            const existingItem = window.ventaItems.find(item => 
                item.productoId === productoId && 
                item.talla === talla && 
                item.color === color
            ); 

            if (existingItem) { 
                existingItem.cantidad += cantidad; 
                existingItem.total = existingItem.cantidad * existingItem.precio; 
            } else { 
                const totalItem = cantidad * precio; 
                window.ventaItems.push({ 
                    productoId, 
                    nombre: nombre, 
                    nombreCompleto: nombreCompleto || `${nombre} (${talla}/${color})`, 
                    cantidad, 
                    precio, 
                    total: totalItem, 
                    talla, 
                    color 
                }); 
            } 
            renderCarrito(); 
            window.calcularTotalVentaGeneral(); 
         }
         
         function quitarItemDelCarrito(index) { window.ventaItems.splice(index, 1); renderCarrito(); window.calcularTotalVentaGeneral(); }
         
         function renderCarrito() {
            if (!ventaCarritoTbody) return;
            ventaCarritoTbody.innerHTML = '';

            const countEl = document.getElementById('venta-items-count');
            if (countEl) countEl.textContent = window.ventaItems.length + (window.ventaItems.length === 1 ? ' item' : ' items');

            if (window.ventaItems.length === 0) {
                ventaCarritoTbody.innerHTML = `
                    <div class="vf-cart-empty">
                        <i class="bi bi-cart-x fs-4 d-block mb-1"></i>
                        <small>Aún no has agregado productos</small>
                    </div>`;
                return;
            }

            window.ventaItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'vf-cart-item';
                card.innerHTML = `
                    <div class="vf-cart-item-info">
                        <div class="vf-cart-item-name">${item.nombreCompleto}</div>
                        <div class="vf-cart-item-unit">${formatoMoneda.format(item.precio)} c/u</div>
                    </div>
                    <div class="vf-cart-item-controls">
                        <div class="vf-qty-control">
                            <button type="button" class="vf-qty-btn btn-qty-minus" data-index="${index}">−</button>
                            <input type="number" class="vf-qty-input item-qty-input" value="${item.cantidad}" min="1" data-index="${index}">
                            <button type="button" class="vf-qty-btn btn-qty-plus" data-index="${index}">+</button>
                        </div>
                        <div class="vf-cart-item-total">${formatoMoneda.format(item.total)}</div>
                        <button type="button" class="vf-cart-item-remove btn-quitar-item" data-index="${index}" title="Quitar">
                            <i class="bi bi-trash3"></i>
                        </button>
                    </div>`;
                ventaCarritoTbody.appendChild(card);
            });
         }
         
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('change', (e) => { if (e.target.classList.contains('item-qty-input')) { const index = parseInt(e.target.dataset.index, 10); const newQty = parseInt(e.target.value, 10); if (newQty > 0 && window.ventaItems[index]) { window.ventaItems[index].cantidad = newQty; window.ventaItems[index].total = newQty * window.ventaItems[index].precio; renderCarrito(); window.calcularTotalVentaGeneral(); } } });
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('click', (e) => {
             e.preventDefault();
             if (e.target.closest('.btn-quitar-item')) { quitarItemDelCarrito(parseInt(e.target.closest('.btn-quitar-item').dataset.index, 10)); return; }
             if (e.target.closest('.btn-qty-minus')) {
                 const index = parseInt(e.target.closest('.btn-qty-minus').dataset.index, 10);
                 if (window.ventaItems[index] && window.ventaItems[index].cantidad > 1) {
                     window.ventaItems[index].cantidad -= 1;
                     window.ventaItems[index].total = window.ventaItems[index].cantidad * window.ventaItems[index].precio;
                     renderCarrito(); window.calcularTotalVentaGeneral();
                 }
                 return;
             }
             if (e.target.closest('.btn-qty-plus')) {
                 const index = parseInt(e.target.closest('.btn-qty-plus').dataset.index, 10);
                 if (window.ventaItems[index]) {
                     window.ventaItems[index].cantidad += 1;
                     window.ventaItems[index].total = window.ventaItems[index].cantidad * window.ventaItems[index].precio;
                     renderCarrito(); window.calcularTotalVentaGeneral();
                 }
                 return;
             }
         });
         
         window.calcularTotalVentaGeneral = function() { 
             let subtotalItems = window.ventaItems.reduce((sum, item) => sum + item.total, 0); 
             let costoRuta = 0; 
             if (tipoEntregaSelect.value === 'domicilio') { costoRuta = parseFloat(eliminarFormatoNumero(costoRutaInput.value)) || 0; } 
             let descuento = parseFloat(eliminarFormatoNumero(ventaDescuentoInput.value)) || 0; 
             if (ventaDescuentoTipo.value === 'porcentaje') { descuento = subtotalItems * (descuento / 100); } 
             const totalFinal = subtotalItems - descuento + costoRuta; 
             if(ventaTotalSpan) ventaTotalSpan.textContent = formatoMoneda.format(totalFinal); 
             return totalFinal; 
         }

         if(costoRutaInput) costoRutaInput.addEventListener('input', window.calcularTotalVentaGeneral); if(ventaDescuentoInput) ventaDescuentoInput.addEventListener('input', window.calcularTotalVentaGeneral); if(tipoEntregaSelect) tipoEntregaSelect.addEventListener('change', window.calcularTotalVentaGeneral); if(ventaDescuentoTipo) ventaDescuentoTipo.addEventListener('change', window.calcularTotalVentaGeneral);

         // ✅ INTERFAZ DE PAGOS SIMPLIFICADA - Solo digitas lo que recibes
         const metodoPagoRadios = document.querySelectorAll('input[name="metodo-pago-radio"]');
         const efectivoFields = document.getElementById('efectivo-fields');
         const transferenciaFields = document.getElementById('transferencia-fields');
         const mixtoFields = document.getElementById('mixto-fields');

         const efectivoRecibidoInput = document.getElementById('efectivo-recibido');
         const transferenciaRecibidaInput = document.getElementById('transferencia-recibida');
         const efectivoMixtoRecibidoInput = document.getElementById('efectivo-mixto-recibido');
         const transferenciaMixtoRecibidaInput = document.getElementById('transferencia-mixto-recibida');

         // Mostrar/Ocultar campos según método y recalcular resumen
         metodoPagoRadios.forEach(radio => {
             radio.addEventListener('change', (e) => {
                 const metodo = e.target.value;
                 efectivoFields.style.display = metodo === 'efectivo' ? 'block' : 'none';
                 transferenciaFields.style.display = metodo === 'transferencia' ? 'block' : 'none';
                 mixtoFields.style.display = metodo === 'mixto' ? 'block' : 'none';

                 // Recalcular el resumen del método seleccionado
                 if (metodo === 'efectivo') calcularResumenEfectivo();
                 else if (metodo === 'transferencia') calcularResumenTransferencia();
                 else if (metodo === 'mixto') calcularResumenMixto();
             });
         });

         // ✅ Calcular resumen EFECTIVO - Compacto, solo muestra vuelto si es necesario
         function calcularResumenEfectivo() {
             const recibido = parseFloat(eliminarFormatoNumero(efectivoRecibidoInput?.value)) || 0;
             const total = window.calcularTotalVentaGeneral();
             const vuelto = recibido - total;

             const vueltoInfo = document.getElementById('vuelto-efectivo-info');
             const vueltoEl = document.getElementById('vuelto-amount');

             if (recibido > 0 && vuelto > 0) {
                 vueltoEl.textContent = formatoMoneda.format(vuelto);
                 vueltoInfo.style.display = 'block';
                 vueltoInfo.className = 'sv-change-info';
             } else if (recibido > 0 && vuelto < 0) {
                 vueltoEl.textContent = 'Falta ' + formatoMoneda.format(Math.abs(vuelto));
                 vueltoInfo.style.display = 'block';
                 vueltoInfo.className = 'sv-change-info sv-change-danger';
             } else {
                 vueltoInfo.style.display = 'none';
             }
         }

         // ✅ Calcular resumen TRANSFERENCIA - Compacto
         function calcularResumenTransferencia() {
             const recibido = parseFloat(eliminarFormatoNumero(transferenciaRecibidaInput?.value)) || 0;
             const total = window.calcularTotalVentaGeneral();
             const falta = total - recibido;

             const transferenciaInfo = document.getElementById('transferencia-info');
             const faltaEl = document.getElementById('transferencia-falta');

             if (recibido > 0 && falta > 0) {
                 faltaEl.textContent = formatoMoneda.format(falta);
                 transferenciaInfo.style.display = 'block';
             } else {
                 transferenciaInfo.style.display = 'none';
             }
         }

         // ✅ Calcular resumen MIXTO - Compacto
         function calcularResumenMixto() {
             const efectivo = parseFloat(eliminarFormatoNumero(efectivoMixtoRecibidoInput.value)) || 0;
             const transferencia = parseFloat(eliminarFormatoNumero(transferenciaMixtoRecibidaInput.value)) || 0;
             const totalRecibido = efectivo + transferencia;
             const total = window.calcularTotalVentaGeneral();
             const vuelto = totalRecibido - total;

             document.getElementById('mixto-total-recibido').textContent = formatoMoneda.format(totalRecibido);

             const vueltoInfo = document.getElementById('vuelto-mixto-info');
             const vueltoEl = document.getElementById('vuelto-amount-mixto');

             if (totalRecibido > 0 && vuelto > 0) {
                 vueltoEl.textContent = formatoMoneda.format(vuelto);
                 vueltoInfo.style.display = 'block';
                 vueltoEl.className = 'text-success fw-bold';
             } else if (totalRecibido > 0 && vuelto < 0) {
                 vueltoEl.textContent = 'Falta ' + formatoMoneda.format(Math.abs(vuelto));
                 vueltoInfo.style.display = 'block';
                 vueltoEl.className = 'text-danger fw-bold';
             } else {
                 vueltoInfo.style.display = 'none';
             }
         }

         // Event Listeners
         if (efectivoRecibidoInput) efectivoRecibidoInput.addEventListener('input', calcularResumenEfectivo);
         if (transferenciaRecibidaInput) transferenciaRecibidaInput.addEventListener('input', calcularResumenTransferencia);
         if (efectivoMixtoRecibidoInput) efectivoMixtoRecibidoInput.addEventListener('input', calcularResumenMixto);
         if (transferenciaMixtoRecibidaInput) transferenciaMixtoRecibidaInput.addEventListener('input', calcularResumenMixto);

         // --- Helper de permisos para ventas ---
         function puedeHacer(permiso) {
             if (!window.appContext) return true; // sin contexto = acceso directo, permitir
             if (window.appContext.isSuperAdmin) return true;
             return window.appContext.permisos?.[permiso] === true;
         }

         // --- R (Read) ---
         let allSalesData = []; // Almacenar todas las ventas sin filtrar

         const renderSales = (snapshot) => {
            if(!salesListTableBody) return;
            const emptyRow = document.getElementById('empty-sales-row');

            // Guardar todos los datos
            allSalesData = [];
            snapshot.forEach(docSnap => {
                allSalesData.push({ id: docSnap.id, ...docSnap.data() });
            });

            // Aplicar filtros
            applyFilters();
        };

        function applyFilters() {
            if(!salesListTableBody) return;
            const emptyRow = document.getElementById('empty-sales-row');
            salesListTableBody.innerHTML = '';

            // Obtener valores de filtros
            const searchText = document.getElementById('filtro-buscar-ventas')?.value.toLowerCase() || '';
            const categoriaFiltro = document.getElementById('filtro-categoria-ventas')?.value || '';

            // Filtrar datos
            let filteredSales = allSalesData.filter(sale => {
                // Filtro de búsqueda (cliente o productos)
                if (searchText) {
                    const clienteMatch = (sale.clienteNombre || '').toLowerCase().includes(searchText);
                    const productosMatch = sale.items?.some(item =>
                        (item.nombre || '').toLowerCase().includes(searchText) ||
                        (item.nombreCompleto || '').toLowerCase().includes(searchText)
                    );
                    if (!clienteMatch && !productosMatch) return false;
                }

                // Filtro de categoría
                if (categoriaFiltro) {
                    const hasProductInCategory = sale.items?.some(item => {
                        const product = localProductsMap.get(item.productoId);
                        return product && product.categoria === categoriaFiltro;
                    });
                    if (!hasProductInCategory) return false;
                }

                return true;
            });

            // Renderizar resultados
            if (filteredSales.length === 0) {
                salesListTableBody.innerHTML = `
                    <div class="ventas-empty-state">
                        <i class="bi bi-search fs-2 d-block mb-2 text-muted"></i>
                        <p class="text-muted mb-0">No se encontraron ventas</p>
                    </div>`;
                return;
            }

            filteredSales.forEach(d => {
                const id = d.id;
                const estado = d.estado || (d.tipoVenta === 'apartado' ? 'Pendiente' : 'Completada');

                const card = document.createElement('div');
                card.className = 'venta-card';
                card.dataset.id = id;
                card.dataset.estado = estado;

                const fecha = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('es-CO', {
                    dateStyle: 'short', timeStyle: 'short'
                }) : 'N/A';

                const pagoPartes = [];
                if (d.pagoEfectivo > 0) pagoPartes.push('<span class="venta-pago-badge efec"><i class="bi bi-cash-coin"></i> Efectivo</span>');
                if (d.pagoTransferencia > 0) pagoPartes.push('<span class="venta-pago-badge transf"><i class="bi bi-bank"></i> Transfer.</span>');
                const pagoHtml = pagoPartes.length ? pagoPartes.join('') : '<span class="text-muted small">-</span>';

                const repartidor = d.repartidorNombre || (d.tipoEntrega === 'tienda' ? 'Recoge en tienda' : '-');
                const entregaIcon = d.tipoEntrega === 'domicilio' ? 'bi-bicycle' : 'bi-shop';

                let estadoBadgeClass = 'bg-success';
                if (estado === 'Pendiente') estadoBadgeClass = 'bg-warning text-dark';
                else if (estado === 'Anulada' || estado === 'Cancelada') estadoBadgeClass = 'bg-danger';
                const estaAnulada = (estado === 'Anulada' || estado === 'Cancelada');

                // Tipo venta badge
                const tipoMap = { detal: ['bg-primary', 'Detal'], mayorista: ['bg-info text-dark', 'Mayor.'], apartado: ['bg-warning text-dark', 'Apartado'], catalogo: ['bg-secondary', 'Catálogo'] };
                const [tipoCls, tipoLabel] = tipoMap[d.tipoVenta] || ['bg-secondary', d.tipoVenta || '-'];

                // Total display
                let totalHtml;
                if (d.tipoVenta === 'apartado') {
                    const montoAbonado = d.totalVenta || 0;
                    const totalProducto = d.montoTotalProducto || d.totalVenta || 0;
                    const pct = totalProducto > 0 ? Math.round((montoAbonado / totalProducto) * 100) : 0;
                    totalHtml = `<span class="venta-card-total text-warning">${formatoMoneda.format(montoAbonado)}</span>
                                 <small class="d-block text-muted" style="font-size:0.7rem;">${pct}% de ${formatoMoneda.format(totalProducto)}</small>`;
                } else {
                    totalHtml = `<span class="venta-card-total">${formatoMoneda.format(d.totalVenta || 0)}</span>`;
                }

                // Productos
                let productosHtml = '';
                if (d.items && d.items.length > 0) {
                    productosHtml = d.items.map(item => {
                        const product = localProductsMap.get(item.productoId);
                        const imagenUrl = (product && (product.imagenUrl || product.imageUrl)) || '';
                        const nombre = (product && product.nombre) || item.nombre || item.nombreCompleto || 'Producto';
                        const variacion = (item.talla && item.color) ? `${item.talla} · ${item.color}` : (item.talla || item.color || '');
                        const precioNum = parseFloat(item.precio) || 0;
                        const imgTag = imagenUrl
                            ? `<img src="${imagenUrl}" alt="${nombre}" class="venta-prod-img" loading="lazy">`
                            : `<div class="venta-prod-img-placeholder"><i class="bi bi-image"></i></div>`;
                        return `
                            <div class="venta-prod-row">
                                ${imgTag}
                                <div class="venta-prod-info">
                                    <div class="venta-prod-name">${nombre}</div>
                                    <div class="venta-prod-detail">
                                        ${variacion ? `<span>${variacion}</span> · ` : ''}
                                        <span>x${item.cantidad || 0}</span>
                                        ${precioNum > 0 ? ` · <span class="text-primary fw-semibold">${formatoMoneda.format(precioNum)} c/u</span>` : ''}
                                    </div>
                                </div>
                            </div>`;
                    }).join('');
                } else {
                    productosHtml = '<span class="text-muted small">Sin productos registrados</span>';
                }

                card.innerHTML = `
                    <div class="venta-card-head">
                        <div class="venta-card-meta-top">
                            <span class="venta-card-fecha"><i class="bi bi-clock me-1"></i>${fecha}</span>
                            <span class="badge ${estadoBadgeClass}">${estado}</span>
                        </div>
                        <div class="venta-card-cliente-row">
                            <span class="venta-card-cliente"><i class="bi bi-person-fill me-1"></i>${d.clienteNombre || 'Cliente general'}</span>
                            <span class="badge ${tipoCls}">${tipoLabel}</span>
                        </div>
                    </div>
                    <div class="venta-card-products">${productosHtml}</div>
                    <div class="venta-card-foot">
                        <div class="venta-card-foot-left">
                            <div class="venta-card-pago">${pagoHtml}</div>
                            <div class="venta-card-entrega small text-muted">
                                <i class="bi ${entregaIcon} me-1"></i>${repartidor}
                            </div>
                        </div>
                        <div class="venta-card-foot-right">
                            ${totalHtml}
                        </div>
                    </div>
                    <div class="venta-card-actions">
                        ${puedeHacer('ventas_ver') ? `<button class="btn btn-action btn-action-view btn-view-sale" title="Ver detalle"><i class="bi bi-eye"></i><span class="btn-action-text">Ver</span></button>` : ''}
                        ${!estaAnulada && puedeHacer('ventas_editar') ? `<button class="btn btn-action btn-action-edit btn-edit-sale" title="Editar"><i class="bi bi-pencil-square"></i><span class="btn-action-text">Editar</span></button>` : ''}
                        ${d.tipoVenta === 'apartado' && !estaAnulada ? `<button class="btn btn-action btn-action-warning btn-manage-apartado" title="Gestionar apartado"><i class="bi bi-calendar-heart"></i><span class="btn-action-text">Abonar</span></button>` : ''}
                        ${puedeHacer('ventas_anular') ? `<button class="btn btn-action btn-action-danger btn-cancel-sale" title="Anular venta" ${estaAnulada ? 'disabled' : ''}><i class="bi bi-x-circle"></i><span class="btn-action-text">Anular</span></button>` : ''}
                        ${!estaAnulada && puedeHacer('ventas_eliminar') ? `<button class="btn btn-action btn-action-delete btn-delete-sale" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
                    </div>`;
                salesListTableBody.appendChild(card);
            });
        }

        // ✅ FILTRO DE FECHA PARA HISTORIAL
        let ventasUnsubscribe = null;

        function cargarVentas(fechaFiltro = null) {
            // Cancelar listener anterior si existe
            if (ventasUnsubscribe) {
                ventasUnsubscribe();
            }

            let q;
            if (fechaFiltro) {
                // Filtrar por fecha específica
                // ✅ Crear fecha en zona horaria local para evitar problemas
                const partes = fechaFiltro.split('-');
                const inicio = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 0, 0, 0, 0);
                const fin = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 23, 59, 59, 999);

                q = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<=', Timestamp.fromDate(fin)),
                    orderBy('timestamp', 'desc')
                );
            } else {
                // Sin filtro, mostrar solo del día actual por defecto
                const hoy = new Date();
                const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
                const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

                q = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<=', Timestamp.fromDate(fin)),
                    orderBy('timestamp', 'desc')
                );
            }

            ventasUnsubscribe = onSnapshot(q, renderSales, e => {
                console.error("Error ventas:", e);
                if(salesListTableBody) salesListTableBody.innerHTML = `
                    <div class="ventas-empty-state">
                        <i class="bi bi-exclamation-triangle fs-2 d-block mb-2 text-danger"></i>
                        <p class="text-danger mb-0">Error al cargar ventas. Verifica tu conexión.</p>
                        <small class="text-muted">${e.code || e.message || ''}</small>
                    </div>`;
            });
        }

        // Eventos del filtro
        const filtroFechaInput = document.getElementById('filtro-fecha-ventas');
        const btnLimpiarFiltro = document.getElementById('btn-limpiar-filtro-ventas');

        // Establecer fecha actual en el input
        if (filtroFechaInput) {
            const hoy = new Date();
            const año = hoy.getFullYear();
            const mes = String(hoy.getMonth() + 1).padStart(2, '0');
            const dia = String(hoy.getDate()).padStart(2, '0');
            filtroFechaInput.value = `${año}-${mes}-${dia}`;

            filtroFechaInput.addEventListener('change', (e) => {
                if (e.target.value) {
                    cargarVentas(e.target.value);
                } else {
                    cargarVentas();
                }
            });
        }

        if (btnLimpiarFiltro) {
            btnLimpiarFiltro.addEventListener('click', () => {
                if (filtroFechaInput) {
                    // Al limpiar, volver a la fecha de hoy
                    const hoy = new Date();
                    const año = hoy.getFullYear();
                    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
                    const dia = String(hoy.getDate()).padStart(2, '0');
                    filtroFechaInput.value = `${año}-${mes}-${dia}`;

                    // Limpiar otros filtros
                    const filtroBuscar = document.getElementById('filtro-buscar-ventas');
                    const filtroCategoria = document.getElementById('filtro-categoria-ventas');
                    if (filtroBuscar) filtroBuscar.value = '';
                    if (filtroCategoria) filtroCategoria.value = '';

                    cargarVentas();
                }
            });
        }

        // Event listeners para los nuevos filtros
        const filtroBuscarVentas = document.getElementById('filtro-buscar-ventas');
        const filtroCategoriaVentas = document.getElementById('filtro-categoria-ventas');

        if (filtroBuscarVentas) {
            filtroBuscarVentas.addEventListener('input', () => {
                applyFilters();
            });
        }

        if (filtroCategoriaVentas) {
            filtroCategoriaVentas.addEventListener('change', () => {
                applyFilters();
            });

            // Cargar categorías en el select
            onSnapshot(categoriesCollection, (snapshot) => {
                filtroCategoriaVentas.innerHTML = '<option value="">Todas las categorías</option>';
                snapshot.forEach(doc => {
                    const cat = doc.data();
                    const option = document.createElement('option');
                    option.value = cat.nombre;
                    option.textContent = cat.nombre;
                    filtroCategoriaVentas.appendChild(option);
                });
            });
        }

        // Cargar ventas del día actual inicialmente
        cargarVentas();

        // ========================================================================
        // ✅ --- SECCIÓN 3: CORREGIR VENTAS (REEMPLAZO) ---
        // ========================================================================
         if (salesForm) salesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (window.ventaItems.length === 0) {
                showToast("Agrega productos.", 'warning');
                return;
            }

            // Validar que si es domicilio, debe haber repartidor seleccionado
            if (tipoEntregaSelect.value === 'domicilio' && !ventaRepartidorSelect.value) {
                showToast("Debes seleccionar un repartidor para ventas a domicilio.", 'warning');
                return;
            }

            // Obtener referencias a los elementos del formulario
            const ventaDireccionInput = document.getElementById('venta-cliente-direccion');
            const ventaCelularInput = document.getElementById('venta-cliente-celular');

            const totalCalculado = window.calcularTotalVentaGeneral();
            const esCatalogo = tipoVentaSelect.value === 'catalogo';

            // ✅ Obtener valores de pago según método seleccionado (SIMPLIFICADO)
            const metodoPagoSeleccionado = document.querySelector('input[name="metodo-pago-radio"]:checked').value;
            let montoEfectivo = 0;
            let montoTransferencia = 0;

            if (metodoPagoSeleccionado === 'efectivo') {
                // En efectivo: para apartados usar el monto ingresado, para ventas normales el total
                if (tipoVentaSelect.value === 'apartado') {
                    montoEfectivo = parseFloat(eliminarFormatoNumero(efectivoRecibidoInput?.value)) || 0;
                } else {
                    montoEfectivo = totalCalculado;
                }
            } else if (metodoPagoSeleccionado === 'transferencia') {
                // En transferencia: guardar lo que recibió
                montoTransferencia = parseFloat(eliminarFormatoNumero(transferenciaRecibidaInput?.value)) || 0;
            } else if (metodoPagoSeleccionado === 'mixto') {
                // En mixto: guardar efectivo y transferencia recibidos
                montoEfectivo = parseFloat(eliminarFormatoNumero(efectivoMixtoRecibidoInput?.value)) || 0;
                montoTransferencia = parseFloat(eliminarFormatoNumero(transferenciaMixtoRecibidaInput?.value)) || 0;
            }

            const ventaData = {
                clienteNombre: ventaClienteInput.value || "Cliente General",
                clienteDireccion: ventaDireccionInput?.value || "",
                clienteCelular: ventaCelularInput?.value || "",
                tipoVenta: tipoVentaSelect.value,
                tipoEntrega: tipoEntregaSelect.value,
                pedidoWhatsapp: !ventaWhatsappCheckbox.checked, // Invertido para corregir lógica
                repartidorId: tipoEntregaSelect.value === 'domicilio' ? ventaRepartidorSelect.value : null,
                repartidorNombre: tipoEntregaSelect.value === 'domicilio' ? (ventaRepartidorSelect.options[ventaRepartidorSelect.selectedIndex]?.text || '') : null,
                costoRuta: tipoEntregaSelect.value === 'domicilio' ? (parseFloat(eliminarFormatoNumero(costoRutaInput.value)) || 0) : 0,
                rutaPagadaTransferencia: tipoEntregaSelect.value === 'domicilio' ? !rutaPagadaCheckbox.checked : false, // Invertido para corregir lógica
                items: window.ventaItems,
                observaciones: ventaObservaciones.value.trim(),
                descuento: parseFloat(eliminarFormatoNumero(ventaDescuentoInput.value)) || 0,
                descuentoTipo: ventaDescuentoTipo.value,
                pagoEfectivo: montoEfectivo,
                pagoTransferencia: montoTransferencia,
                // ✅ CAMBIO CRÍTICO: Para apartados, totalVenta = solo lo recibido, NO el 100%
                totalVenta: tipoVentaSelect.value === 'apartado' ? (montoEfectivo + montoTransferencia) : totalCalculado,
                // ✅ Para apartados, guardar el total completo del producto en otro campo
                montoTotalProducto: tipoVentaSelect.value === 'apartado' ? totalCalculado : null,
                estado: tipoVentaSelect.value === 'apartado' ? 'Pendiente' : 'Completada',
                esCatalogoExterno: esCatalogo, // Flag para identificar ventas por catálogo
                timestamp: serverTimestamp(),
                tenantId: window.appContext?.tenantId || null
            };
            
            if (ventaData.tipoVenta === 'apartado') {
                const abonoInicial = ventaData.pagoEfectivo + ventaData.pagoTransferencia;
                if (abonoInicial <= 0) {
                    showToast("Los apartados requieren un abono inicial.", 'warning');
                    return;
                }
                if (abonoInicial >= totalCalculado) {
                    showToast("El abono es igual o mayor al total. Registra como venta normal.", 'warning');
                    return;
                }
            } else {
                if (ventaData.pagoEfectivo + ventaData.pagoTransferencia < totalCalculado) { 
                    showToast("El pago no cubre el total.", 'warning'); 
                    return; 
                }
            }
            
            try {
                let docRef;
                let ventaId;
                const isEditMode = !!window.editingVentaId;

                // ✅ DETECTAR SI ESTAMOS EDITANDO O CREANDO
                if (window.editingVentaId) {
                    // MODO EDICIÓN: Actualizar venta existente
                    ventaId = window.editingVentaId;
                    const ventaRef = doc(db, 'ventas', ventaId);

                    console.log("📝 [EDICIÓN FORMULARIO] Modo edición activado para venta:", ventaId);

                    // Obtener datos de la venta anterior para reponer stock
                    const ventaAnteriorSnap = await getDoc(ventaRef);
                    if (ventaAnteriorSnap.exists()) {
                        const ventaAnterior = ventaAnteriorSnap.data();
                        console.log("📦 [EDICIÓN FORMULARIO] Datos anteriores:", ventaAnterior);

                        // Reponer stock de la venta anterior (solo si no era catálogo externo)
                        if (!ventaAnterior.esCatalogoExterno) {
                            await actualizarStock(ventaAnterior.items, 'sumar');
                            console.log("✅ [EDICIÓN FORMULARIO] Stock anterior repuesto");
                        }
                    } else {
                        console.error("❌ [EDICIÓN FORMULARIO] No se encontró la venta anterior");
                    }

                    // Actualizar la venta
                    console.log("💾 [EDICIÓN FORMULARIO] Actualizando venta con datos:", ventaData);
                    await updateDoc(ventaRef, ventaData);
                    console.log("✅ [EDICIÓN FORMULARIO] Venta actualizada exitosamente con ID:", ventaId);

                    // Descontar nuevo stock (solo si no es catálogo externo)
                    if (!esCatalogo) {
                        await actualizarStock(ventaData.items, 'restar');
                        console.log("✅ [EDICIÓN FORMULARIO] Nuevo stock actualizado");
                    } else {
                        console.log("ℹ️ [EDICIÓN FORMULARIO] Venta por catálogo - Stock NO afectado");
                    }

                    // Limpiar flag de edición
                    delete window.editingVentaId;
                    console.log("🔓 [EDICIÓN FORMULARIO] Flag de edición limpiado");

                } else {
                    // MODO CREACIÓN: Registrar nueva venta
                    docRef = await addDoc(salesCollection, ventaData);
                    ventaId = docRef.id;
                    console.log("✅ Venta registrada con ID:", ventaId);

                    // Actualizar stock (solo si no es catálogo externo)
                    if (!esCatalogo) {
                        await actualizarStock(ventaData.items, 'restar');
                        console.log("✅ Stock actualizado correctamente");
                    } else {
                        console.log("ℹ️ Venta por catálogo externo - Stock NO afectado");
                    }
                }

                // ✅ PASO 3: Si es apartado, crear documento apartado
                if (ventaData.tipoVenta === 'apartado') {
                    const abonoInicial = ventaData.totalVenta; // Ahora totalVenta = abono inicial
                    const totalProducto = ventaData.montoTotalProducto; // Total completo del producto
                    const saldoPendiente = totalProducto - abonoInicial;

                    // Calcular fecha de vencimiento
                    const apartadoFechaInput = document.getElementById('apartado-fecha-max');
                    let fechaVencimiento;

                    if (apartadoFechaInput && apartadoFechaInput.value) {
                        fechaVencimiento = new Date(apartadoFechaInput.value + 'T23:59:59');
                    } else {
                        fechaVencimiento = new Date();
                        fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
                    }

                    // Determinar método de pago inicial
                    let metodoPagoInicial;
                    if (ventaData.pagoEfectivo > 0 && ventaData.pagoTransferencia > 0) {
                        metodoPagoInicial = 'Mixto';
                    } else if (ventaData.pagoEfectivo > 0) {
                        metodoPagoInicial = 'Efectivo';
                    } else {
                        metodoPagoInicial = 'Transferencia';
                    }

                    // Crear documento apartado
                    const apartadoData = {
                        ventaId: ventaId,
                        clienteNombre: ventaData.clienteNombre,
                        clienteCelular: ventaData.clienteCelular, // ✅ Guardar celular para WhatsApp
                        total: totalProducto, // Total completo del producto
                        abonado: abonoInicial,
                        saldo: saldoPendiente,
                        fechaCreacion: serverTimestamp(),
                        fechaVencimiento: Timestamp.fromDate(fechaVencimiento),
                        estado: 'Pendiente',
                        items: ventaData.items, // Guardar items para referencia
                        tenantId: ventaData.tenantId,
                        abonos: [{
                            fecha: Timestamp.fromDate(new Date()), // ✅ Usar Timestamp en lugar de serverTimestamp
                            monto: abonoInicial,
                            metodoPago: metodoPagoInicial,
                            observaciones: 'Abono inicial'
                        }]
                    };

                    try {
                        const apartadoRef = await addDoc(apartadosCollection, apartadoData);
                        console.log("✅ Apartado creado exitosamente con ID:", apartadoRef.id);
                        showToast(`Apartado creado! Saldo: ${formatoMoneda.format(saldoPendiente)}. Vence: ${fechaVencimiento.toLocaleDateString('es-CO')}`, 'success');
                    } catch (apErr) {
                        console.error("❌ Error crítico al crear apartado:", apErr);
                        showToast("Error al crear apartado. La venta fue registrada pero el apartado falló.", 'error');
                    }
                } else {
                    // Mostrar mensaje según si fue edición o creación
                    const mensaje = isEditMode ? "Venta actualizada exitosamente!" : "Venta registrada exitosamente!";
                    showToast(mensaje, 'success');
                }

                salesForm.reset();
                window.ventaItems = [];
                renderCarrito();
                ventaClienteInput.value = 'General';
                window.fillClientInfoSales();
                tipoVentaSelect.value='detal';
                tipoEntregaSelect.value='tienda';
                toggleDeliveryFields();
                window.calcularTotalVentaGeneral();

                // ✅ Resetear campos de pago
                if (efectivoRecibidoInput) efectivoRecibidoInput.value = '';
                if (transferenciaRecibidaInput) transferenciaRecibidaInput.value = '';
                if (efectivoMixtoRecibidoInput) efectivoMixtoRecibidoInput.value = '';
                if (transferenciaMixtoRecibidaInput) transferenciaMixtoRecibidaInput.value = '';

                // ✅ Ocultar todos los mensajes de info de pago
                const vueltoEfectivoInfo = document.getElementById('vuelto-efectivo-info');
                const transferenciaInfo = document.getElementById('transferencia-info');
                const vueltoMixtoInfo = document.getElementById('vuelto-mixto-info');
                if (vueltoEfectivoInfo) vueltoEfectivoInfo.style.display = 'none';
                if (transferenciaInfo) transferenciaInfo.style.display = 'none';
                if (vueltoMixtoInfo) vueltoMixtoInfo.style.display = 'none';

                // ✅ Resetear método de pago a efectivo (primer radio button)
                const radioEfectivo = document.querySelector('input[name="metodo-pago-radio"][value="efectivo"]');
                if (radioEfectivo) {
                    radioEfectivo.checked = true;
                    radioEfectivo.dispatchEvent(new Event('change'));
                }
            } catch (err) {
                console.error("❌ [VENTA] Error crítico al guardar/actualizar venta:", err);
                console.error("❌ [VENTA] Tipo de error:", err.name);
                console.error("❌ [VENTA] Mensaje:", err.message);
                console.error("❌ [VENTA] Stack:", err.stack);
                showToast(`Error al guardar venta: ${err.message}`, 'error');
            }
        });

        // NOTA: actualizarStock ahora es una función global (definida al inicio del archivo)

        // --- Función para Anular Venta (D) ---
        async function anularVenta(ventaId) {
            if (!ventaId) return;
            if (!puedeHacer('ventas_anular')) {
                showToast('No tienes permisos para anular ventas.', 'error');
                return;
            }
            if (!confirm('¿Estás seguro de que quieres ANULAR esta venta?\nEsta acción repondrá el stock y marcará la venta como "Anulada".')) {
                return;
            }

            const ventaRef = doc(db, 'ventas', ventaId);
            
            try {
                const ventaSnap = await getDoc(ventaRef);
                if (!ventaSnap.exists()) {
                    showToast('Error: No se encontró la venta.', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();

                if (ventaData.estado === 'Anulada' || ventaData.estado === 'Cancelada') {
                    showToast('Esta venta ya ha sido anulada.', 'info');
                    return;
                }
                
                // Si la venta no es un apartado, o si es un apartado ya completado, reponer stock.
                // Si es un apartado PENDIENTE, la función de cancelar apartado se encarga.
                if (ventaData.tipoVenta !== 'apartado') {
                    await actualizarStock(ventaData.items, 'sumar'); 
                }

                await updateDoc(ventaRef, {
                    estado: 'Anulada'
                });
                
                // Si es un apartado, también cancelarlo
                if (ventaData.tipoVenta === 'apartado') {
                     const q = query(apartadosCollection, where("ventaId", "==", ventaId));
                     const apartadosSnap = await getDocs(q);
                     apartadosSnap.forEach(async (docSnap) => {
                         await updateDoc(docSnap.ref, { estado: "Cancelado" });
                         // Si el apartado estaba PENDIENTE, el stock ya se repuso.
                         // Si estaba COMPLETADO, debemos reponerlo ahora.
                         if (ventaData.estado === 'Completada') {
                             await actualizarStock(ventaData.items, 'sumar');
                         }
                     });
                }

                showToast('Venta anulada y stock repuesto.', 'info');
                
            } catch (error) {
                console.error("Error al anular la venta:", error);
                showToast('Error al anular la venta.', 'error');
            }
        }
        
        // --- Función para Ver Venta (R-Detalle) ---
        async function handleViewSale(ventaId) {
            if (!viewSaleModalInstance) {
                console.error("El modal de ver venta no está inicializado.");
                return;
            }

            const modalTitle = document.getElementById('viewSaleModalTitle');
            const modalBody = document.getElementById('viewSaleModalBody');
            
            modalTitle.textContent = `Detalle de Venta #${ventaId.substring(0,8).toUpperCase()}`;
            modalBody.innerHTML = '<p class="text-center">Cargando...</p>';
            viewSaleModalInstance.show();

            try {
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    modalBody.innerHTML = '<p class="text-danger text-center">Error: Venta no encontrada.</p>';
                    return;
                }

                const d = ventaSnap.data();
                const fecha = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('es-CO') : 'N/A';
                
                let itemsHtml = d.items.map(item => {
                    const product = localProductsMap.get(item.productoId);
                    const imgUrl = (product && (product.imagenUrl || product.imageUrl)) || '';
                    const imgHtml = imgUrl
                        ? `<img src="${imgUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #e9ecef;flex-shrink:0;" alt="" loading="lazy">`
                        : `<div style="width:44px;height:44px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#adb5bd;flex-shrink:0;border:1px solid #e9ecef;"><i class="bi bi-image" style="font-size:1.1rem;"></i></div>`;
                    return `
                    <tr>
                        <td style="min-width:0;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                ${imgHtml}
                                <div style="min-width:0;">
                                    <div style="font-size:0.85rem;font-weight:600;color:#212529;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${item.nombreCompleto || item.nombre}</div>
                                </div>
                            </div>
                        </td>
                        <td class="text-center" style="white-space:nowrap;">${item.cantidad}</td>
                        <td class="text-end" style="white-space:nowrap;">${formatoMoneda.format(item.precio)}</td>
                        <td class="text-end fw-bold" style="white-space:nowrap;">${formatoMoneda.format(item.total)}</td>
                    </tr>`;
                }).join('');
                
                let repartidorNombre = 'N/A';
                if (d.repartidorId && repartidoresMap.has(d.repartidorId)) {
                    repartidorNombre = repartidoresMap.get(d.repartidorId).nombre;
                } else if (d.repartidorNombre) {
                    repartidorNombre = d.repartidorNombre;
                }

                let repartidorHtml = d.tipoEntrega === 'domicilio' ? 
                    `<li><strong>Repartidor:</strong> ${repartidorNombre}</li>
                     <li><strong>Costo Ruta:</strong> ${formatoMoneda.format(d.costoRuta || 0)}</li>` : 
                    '<li><strong>Tipo Entrega:</strong> Recoge en Tienda</li>';

                modalBody.innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <h5>Datos del Cliente</h5>
                            <ul class="list-unstyled">
                                <li><strong>Cliente:</strong> ${d.clienteNombre || 'Cliente General'}</li>
                                <li><strong>Fecha:</strong> ${fecha}</li>
                                ${repartidorHtml}
                                <li><strong>Observaciones:</strong> ${d.observaciones || 'Ninguna'}</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h5>Datos de Pago</h5>
                            <ul class="list-unstyled">
                                <li><strong>Estado:</strong> ${d.estado}</li>
                                <li><strong>Efectivo:</strong> ${formatoMoneda.format(d.pagoEfectivo || 0)}</li>
                                <li><strong>Transferencia:</strong> ${formatoMoneda.format(d.pagoTransferencia || 0)}</li>
                                <li><strong>Descuento:</strong> ${formatoMoneda.format(d.descuento || 0)}</li>
                                ${d.tipoVenta === 'apartado' ? `
                                    <li class="fs-5 fw-bold mt-2 text-warning">
                                        <strong>Abonado:</strong> ${formatoMoneda.format(d.totalVenta || 0)}
                                    </li>
                                    <li class="text-warning">
                                        <i class="bi bi-calendar-check"></i>
                                        ${Math.round((d.totalVenta / (d.montoTotalProducto || d.totalVenta)) * 100)}% del total
                                    </li>
                                    <li class="text-muted">
                                        <strong>Total producto:</strong> ${formatoMoneda.format(d.montoTotalProducto || d.totalVenta || 0)}
                                    </li>
                                    <li class="text-muted">
                                        <strong>Saldo pendiente:</strong>
                                        ${formatoMoneda.format((d.montoTotalProducto || d.totalVenta) - d.totalVenta)}
                                    </li>
                                ` : `
                                    <li class="fs-5 fw-bold mt-2"><strong>Total Venta:</strong> ${formatoMoneda.format(d.totalVenta || 0)}</li>
                                `}
                            </ul>
                        </div>
                    </div>
                    <hr>
                    <h5>Items Comprados</h5>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead class="table-light">
                                <tr>
                                    <th>Producto</th>
                                    <th class="text-center">Cant.</th>
                                    <th class="text-end">Precio U.</th>
                                    <th class="text-end">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>
                `;

            } catch (error) {
                console.error("Error al cargar detalle de venta:", error);
                modalBody.innerHTML = `<p class="text-danger text-center">Error al cargar datos: ${error.message}</p>`;
            }
        }

        // ========================================================================
        // --- ELIMINAR Y EDITAR VENTAS (NUEVAS FUNCIONALIDADES) ---
        // ========================================================================

        let currentVentaId = null; // Variable para guardar el ID de la venta actual
        let currentVentaData = null; // Variable para guardar los datos de la venta actual

        // Contraseña administrativa (puedes cambiarla)
        const ADMIN_PASSWORD = 'mishell2025';

        // --- Botón Eliminar Venta ---
        const btnDeleteSale = document.getElementById('btn-delete-sale');
        if (btnDeleteSale) {
            btnDeleteSale.addEventListener('click', () => {
                if (!currentVentaId) {
                    showToast('Error: No hay venta seleccionada', 'error');
                    return;
                }

                // Cerrar modal de detalles y abrir modal de contraseña
                viewSaleModalInstance.hide();
                const deletePasswordModal = new bootstrap.Modal(document.getElementById('deleteConfirmPassword'));
                deletePasswordModal.show();
            });
        }

        // --- Formulario Eliminar con Contraseña ---
        const formDeletePassword = document.getElementById('form-delete-sale-password');
        if (formDeletePassword) {
            formDeletePassword.addEventListener('submit', async (e) => {
                e.preventDefault();

                const passwordInput = document.getElementById('delete-sale-password');
                const password = passwordInput.value;

                // Verificar contraseña
                if (password !== ADMIN_PASSWORD) {
                    showToast('❌ Contraseña incorrecta', 'error');
                    passwordInput.value = '';
                    return;
                }

                try {
                    // Reponer stock
                    await actualizarStock(currentVentaData.items, 'sumar');

                    // Eliminar venta
                    await deleteDoc(doc(db, 'ventas', currentVentaId));

                    showToast('✅ Venta eliminada y stock repuesto correctamente', 'success');

                    // Cerrar modales
                    bootstrap.Modal.getInstance(document.getElementById('deleteConfirmPassword')).hide();
                    passwordInput.value = '';

                    // Limpiar variables
                    currentVentaId = null;
                    currentVentaData = null;

                } catch (error) {
                    console.error('Error al eliminar venta:', error);
                    showToast('Error al eliminar venta: ' + error.message, 'error');
                }
            });
        }

        // --- Botón Editar Venta ---
        const btnEditSale = document.getElementById('btn-edit-sale');
        if (btnEditSale) {
            btnEditSale.addEventListener('click', () => {
                if (!currentVentaData) {
                    showToast('Error: No hay datos de venta', 'error');
                    return;
                }

                // Cargar datos en el formulario de ventas
                loadSaleDataToForm(currentVentaData, currentVentaId);

                // Cerrar modal
                viewSaleModalInstance.hide();

                // Ir a la pestaña de ventas
                if (window.adminShowSection) { window.adminShowSection('#ventas'); window.adminMarkActive('#ventas'); }

                showToast('📝 Editando venta - Modifica los datos y guarda', 'info');
            });
        }

        // Función para cargar datos de venta en el formulario
        function loadSaleDataToForm(ventaData, ventaId) {
            // Cargar items en el carrito
            window.ventaItems = [...ventaData.items];
            actualizarCarritoVenta();

            // Cargar datos del cliente
            const ventaClienteInput = document.getElementById('venta-cliente');
            const ventaCelularInput = document.getElementById('venta-cliente-celular');
            const ventaDireccionInput = document.getElementById('venta-cliente-direccion');

            if (ventaClienteInput) ventaClienteInput.value = ventaData.clienteNombre || '';
            if (ventaCelularInput) ventaCelularInput.value = ventaData.clienteCelular || '';
            if (ventaDireccionInput) ventaDireccionInput.value = ventaData.clienteDireccion || '';

            // Cargar tipo de venta
            const tipoVentaSelect = document.getElementById('tipo-venta');
            if (tipoVentaSelect) tipoVentaSelect.value = ventaData.tipoVenta || 'detal';

            // Cargar tipo de entrega
            const tipoEntregaSelect = document.getElementById('tipo-entrega');
            if (tipoEntregaSelect) {
                tipoEntregaSelect.value = ventaData.tipoEntrega || 'tienda';
                tipoEntregaSelect.dispatchEvent(new Event('change'));
            }

            // Cargar observaciones
            const ventaObservaciones = document.getElementById('venta-observaciones');
            if (ventaObservaciones) ventaObservaciones.value = ventaData.observaciones || '';

            // Guardar ID para actualizar en lugar de crear nueva
            window.editingVentaId = ventaId;
        }

        // Modificar función handleViewSale para guardar datos
        const originalHandleViewSale = handleViewSale;
        handleViewSale = async function(ventaId) {
            currentVentaId = ventaId;

            // Obtener datos de la venta
            const ventaRef = doc(db, 'ventas', ventaId);
            const ventaSnap = await getDoc(ventaRef);

            if (ventaSnap.exists()) {
                currentVentaData = ventaSnap.data();
            }

            // Llamar función original
            return originalHandleViewSale(ventaId);
        };

        // --- Listener de la lista de ventas (Actualizado) ---
        if(salesListTableBody) salesListTableBody.addEventListener('click', (e)=>{ 
            e.preventDefault(); 
            const target = e.target.closest('button'); 
            if (!target) return; 
            const id = target.closest('.venta-card')?.dataset.id;
            if (!id) return;
            
            if(target.classList.contains('btn-view-sale')) {
                handleViewSale(id); 
            } 
            
            if(target.classList.contains('btn-cancel-sale')) {
                anularVenta(id); 
            } 
            
            if(target.classList.contains('btn-manage-apartado')) {
                // Redirigir a la pestaña de apartados
                if (window.adminShowSection) {
                    window.adminShowSection('#apartados');
                    window.adminMarkActive('#apartados');
                    showToast(`Gestiona el apartado desde esta pestaña`, 'info');
                }
            }

            // Editar venta
            if(target.classList.contains('btn-edit-sale')) {
                abrirModalEditarVenta(id);
            }

            // Eliminar venta
            if(target.classList.contains('btn-delete-sale')) {
                abrirModalEliminarVenta(id);
            }
        });

        // ═══════════════════════════════════════════════════════════════════
        // FUNCIÓN: ABRIR MODAL EDITAR VENTA
        // ═══════════════════════════════════════════════════════════════════
        async function abrirModalEditarVenta(ventaId) {
            if (!puedeHacer('ventas_editar')) {
                showToast('No tienes permisos para editar ventas.', 'error');
                return;
            }
            try {
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    showToast('Venta no encontrada', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();

                // Guardar ID
                document.getElementById('edit-sale-id').value = ventaId;

                // Llenar datos
                document.getElementById('edit-sale-folio').textContent = ventaId.substring(0, 8).toUpperCase();
                const fechaVenta = ventaData.timestamp ? new Date(ventaData.timestamp.toDate()) : new Date();
                document.getElementById('edit-sale-date').textContent = fechaVenta.toLocaleDateString('es-MX', {
                    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                document.getElementById('edit-sale-cliente').value = ventaData.clienteNombre || 'General';
                document.getElementById('edit-sale-tipo').value = ventaData.tipoVenta || 'detal';
                document.getElementById('edit-sale-pago').value = ventaData.metodoPago || 'efectivo';

                // Cargar repartidores
                await cargarRepartidoresEdit();
                document.getElementById('edit-sale-repartidor').value = ventaData.repartidor || '';

                // Mostrar productos
                mostrarProductosEdit(ventaData.items || []);

                // Mostrar total
                document.getElementById('edit-sale-total').textContent = formatoMoneda.format(ventaData.totalVenta || 0);

                // Abrir modal
                const modal = new bootstrap.Modal(document.getElementById('editSaleModal'));
                modal.show();
            } catch (error) {
                console.error('Error al abrir modal de edición:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        }

        // Cargar repartidores para el selector de edición
        async function cargarRepartidoresEdit() {
            const select = document.getElementById('edit-sale-repartidor');
            try {
                const repartidoresSnap = await getDocs(collection(db, 'repartidores'));
                select.innerHTML = '<option value="">Ninguno</option>';
                repartidoresSnap.forEach((doc) => {
                    const r = doc.data();
                    select.innerHTML += `<option value="${r.nombre}">${r.nombre}</option>`;
                });
            } catch (error) {
                console.error('Error al cargar repartidores:', error);
            }
        }

        // Mostrar productos en el modal de edición
        function mostrarProductosEdit(items) {
            const container = document.getElementById('edit-sale-productos');
            if (!items || items.length === 0) {
                container.innerHTML = '<p class="text-muted">No hay productos en esta venta</p>';
                return;
            }

            let html = '<div class="list-group">';
            items.forEach((item) => {
                // ✅ CORRECCIÓN: Usar item.precio (no precioUnitario) que es el campo correcto
                const precioUnit = parseFloat(item.precio || item.precioUnitario) || 0;
                const cantidad = parseFloat(item.cantidad) || 1;
                const total = precioUnit * cantidad;

                html += `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>${item.nombre || 'Producto'}</strong><br>
                                <small class="text-muted">
                                    ${item.talla ? `Talla: ${item.talla}` : ''}
                                    ${item.color ? ` • Color: ${item.color}` : ''}
                                </small>
                            </div>
                            <div class="text-end">
                                <strong>${formatoMoneda.format(total)}</strong><br>
                                <small class="text-muted">${cantidad} x ${formatoMoneda.format(precioUnit)}</small>
                            </div>
                        </div>
                    </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }

        // Listener para cambio de tipo de venta en el modal
        document.getElementById('edit-sale-tipo').addEventListener('change', async function() {
            const ventaId = document.getElementById('edit-sale-id').value;
            if (!ventaId) return;

            try {
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) return;

                const ventaData = ventaSnap.data();
                const nuevoTipo = this.value;

                // Recalcular precios según nuevo tipo
                let nuevoTotal = 0;
                const itemsActualizados = await Promise.all(ventaData.items.map(async (item) => {
                    const prodRef = doc(db, 'productos', item.id);
                    const prodSnap = await getDoc(prodRef);

                    if (prodSnap.exists()) {
                        const prodData = prodSnap.data();
                        let nuevoPrecio = prodData.precioDetal;

                        if (nuevoTipo === 'mayorista') {
                            nuevoPrecio = prodData.precioMayor || prodData.precioDetal;
                        }

                        const cantidad = parseFloat(item.cantidad) || 1;
                        const totalItem = nuevoPrecio * cantidad;
                        nuevoTotal += totalItem;

                        return { ...item, precioUnitario: nuevoPrecio, totalItem: totalItem };
                    }
                    return item;
                }));

                // Aplicar descuento y costo ruta
                const descuento = parseFloat(ventaData.descuento) || 0;
                const costoRuta = parseFloat(ventaData.costoRuta) || 0;
                nuevoTotal = nuevoTotal - descuento + costoRuta;

                // Actualizar vista
                mostrarProductosEdit(itemsActualizados);
                document.getElementById('edit-sale-total').textContent = formatoMoneda.format(nuevoTotal);
            } catch (error) {
                console.error('Error al recalcular precios:', error);
            }
        });

        // Guardar cambios de edición
        document.getElementById('btn-save-edit-sale').addEventListener('click', async function() {
            const ventaId = document.getElementById('edit-sale-id').value;

            console.log('📝 [EDICIÓN] Iniciando edición de venta:', ventaId);

            if (!ventaId) {
                console.error('❌ [EDICIÓN] No se encontró ID de venta');
                showToast('Error: No se encontró ID de venta', 'error');
                return;
            }

            try {
                const nuevoCliente = document.getElementById('edit-sale-cliente').value;
                const nuevoTipo = document.getElementById('edit-sale-tipo').value;
                const nuevoRepartidor = document.getElementById('edit-sale-repartidor').value;

                console.log('📋 [EDICIÓN] Datos a actualizar:', { nuevoCliente, nuevoTipo, nuevoRepartidor });

                // Obtener venta actual
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    console.error('❌ [EDICIÓN] Venta no encontrada en Firestore');
                    showToast('Venta no encontrada', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();
                console.log('📦 [EDICIÓN] Datos actuales de la venta:', ventaData);

                // Recalcular items si cambió el tipo
                let itemsActualizados = ventaData.items;
                let nuevoTotal = ventaData.totalVenta;

                if (nuevoTipo !== ventaData.tipoVenta) {
                    let subtotal = 0;
                    itemsActualizados = await Promise.all(ventaData.items.map(async (item) => {
                        const prodRef = doc(db, 'productos', item.productoId);
                        const prodSnap = await getDoc(prodRef);

                        if (prodSnap.exists()) {
                            const prodData = prodSnap.data();
                            let nuevoPrecio = prodData.precioDetal;

                            if (nuevoTipo === 'mayorista') {
                                nuevoPrecio = prodData.precioMayor || prodData.precioDetal;
                            }

                            const cantidad = parseFloat(item.cantidad) || 1;
                            const totalItem = nuevoPrecio * cantidad;
                            subtotal += totalItem;

                            return { ...item, precio: nuevoPrecio };
                        }
                        return item;
                    }));

                    const descuento = parseFloat(ventaData.descuento) || 0;
                    const costoRuta = parseFloat(ventaData.costoRuta) || 0;
                    nuevoTotal = subtotal - descuento + costoRuta;
                }

                // Preparar objeto de actualización con los campos correctos
                const updateData = {
                    clienteNombre: nuevoCliente,
                    tipoVenta: nuevoTipo,
                    items: itemsActualizados,
                    totalVenta: nuevoTotal,
                    ultimaModificacion: serverTimestamp()
                };

                // Solo actualizar repartidor si hay uno seleccionado
                if (nuevoRepartidor) {
                    // Buscar el ID del repartidor por nombre
                    const repartidoresSnap = await getDocs(collection(db, 'repartidores'));
                    let repartidorId = '';
                    repartidoresSnap.forEach((doc) => {
                        if (doc.data().nombre === nuevoRepartidor) {
                            repartidorId = doc.id;
                        }
                    });

                    updateData.repartidorId = repartidorId;
                    updateData.repartidorNombre = nuevoRepartidor;
                }

                // Actualizar venta en Firestore
                console.log('💾 [EDICIÓN] Actualizando venta en Firestore...');
                console.log('📋 [EDICIÓN] Objeto updateData:', updateData);

                await updateDoc(ventaRef, updateData);

                console.log('✅ [EDICIÓN] Venta actualizada exitosamente en Firestore');
                showToast('Venta actualizada exitosamente', 'success');

                // Cerrar modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('editSaleModal'));
                if (modal) {
                    modal.hide();
                    console.log('🔒 [EDICIÓN] Modal cerrado');
                }

                // Forzar actualización inmediata del historial
                console.log('🔄 [EDICIÓN] Refrescando lista de ventas...');
                const filtroFechaInput = document.getElementById('filtro-fecha-ventas');
                if (filtroFechaInput && filtroFechaInput.value) {
                    // Si hay un filtro de fecha, recargar con esa fecha
                    console.log('📅 [EDICIÓN] Recargando con filtro de fecha:', filtroFechaInput.value);
                    cargarVentas(filtroFechaInput.value);
                } else {
                    // Si no hay filtro, recargar con la fecha de hoy
                    console.log('📅 [EDICIÓN] Recargando ventas de hoy');
                    cargarVentas();
                }

                console.log('✅ [EDICIÓN] Proceso de edición completado exitosamente');

            } catch (error) {
                console.error('❌ [EDICIÓN] Error crítico al guardar cambios:', error);
                console.error('❌ [EDICIÓN] Tipo de error:', error.name);
                console.error('❌ [EDICIÓN] Mensaje:', error.message);
                console.error('❌ [EDICIÓN] Stack:', error.stack);
                showToast(`Error al actualizar venta: ${error.message}`, 'error');
            }
        });

        // ═══════════════════════════════════════════════════════════════════
        // FUNCIÓN: ABRIR MODAL ELIMINAR VENTA
        // ═══════════════════════════════════════════════════════════════════
        async function abrirModalEliminarVenta(ventaId) {
            if (!puedeHacer('ventas_eliminar')) {
                showToast('No tienes permisos para eliminar ventas.', 'error');
                return;
            }
            try {
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    showToast('Venta no encontrada', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();

                // Guardar ID
                document.getElementById('delete-sale-id').value = ventaId;

                // Llenar información
                document.getElementById('delete-sale-folio').textContent = ventaId.substring(0, 8).toUpperCase();
                document.getElementById('delete-sale-cliente').textContent = ventaData.clienteNombre || 'General';
                document.getElementById('delete-sale-total').textContent = formatoMoneda.format(ventaData.totalVenta || 0);

                // Limpiar campos
                document.getElementById('delete-sale-password').value = '';
                document.getElementById('delete-sale-confirm').checked = false;
                document.getElementById('btn-confirm-delete-sale').disabled = true;

                // Abrir modal
                const modal = new bootstrap.Modal(document.getElementById('deleteSaleModal'));
                modal.show();
            } catch (error) {
                console.error('Error al abrir modal de eliminación:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        }

        // Habilitar botón de eliminar solo si checkbox está marcado
        document.getElementById('delete-sale-confirm').addEventListener('change', function() {
            const password = document.getElementById('delete-sale-password').value.trim();
            document.getElementById('btn-confirm-delete-sale').disabled = !(this.checked && password.length > 0);
        });

        document.getElementById('delete-sale-password').addEventListener('input', function() {
            const checkbox = document.getElementById('delete-sale-confirm').checked;
            document.getElementById('btn-confirm-delete-sale').disabled = !(checkbox && this.value.trim().length > 0);
        });

        // Confirmar eliminación con contraseña
        document.getElementById('btn-confirm-delete-sale').addEventListener('click', async function() {
            const ventaId = document.getElementById('delete-sale-id').value;
            const password = document.getElementById('delete-sale-password').value;

            if (!ventaId || !password) {
                showToast('Datos incompletos', 'error');
                return;
            }

            // Contraseña de administrador (puedes cambiarla)
            const ADMIN_PASSWORD = 'admin123'; // ⚠️ CAMBIAR POR UNA CONTRASEÑA SEGURA

            if (password !== ADMIN_PASSWORD) {
                showToast('Contraseña incorrecta', 'error');
                document.getElementById('delete-sale-password').value = '';
                document.getElementById('delete-sale-password').focus();
                return;
            }

            try {
                // Obtener venta antes de eliminar para revertir stock si es necesario
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    showToast('Venta no encontrada', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();

                // Revertir stock de productos (devolver al inventario)
                if (ventaData.items && Array.isArray(ventaData.items)) {
                    for (const item of ventaData.items) {
                        const prodRef = doc(db, 'productos', item.id);
                        const prodSnap = await getDoc(prodRef);

                        if (prodSnap.exists()) {
                            const prodData = prodSnap.data();

                            if (item.talla && item.color) {
                                // Producto con variaciones
                                const variaciones = prodData.variaciones || [];
                                const varIndex = variaciones.findIndex(v =>
                                    v.talla === item.talla && v.color === item.color
                                );

                                if (varIndex !== -1) {
                                    variaciones[varIndex].stock += parseFloat(item.cantidad) || 0;
                                    await updateDoc(prodRef, { variaciones: variaciones });
                                }
                            } else {
                                // Producto simple
                                const nuevoStock = (prodData.stock || 0) + (parseFloat(item.cantidad) || 0);
                                await updateDoc(prodRef, { stock: nuevoStock });
                            }
                        }
                    }
                }

                // Eliminar venta
                await deleteDoc(ventaRef);

                showToast('Venta eliminada exitosamente. Stock restaurado.', 'success');

                // Cerrar modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('deleteSaleModal'));
                modal.hide();

                console.log(`✅ Venta ${ventaId} eliminada permanentemente`);
            } catch (error) {
                console.error('Error al eliminar venta:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
        
        function toggleDeliveryFields(){
            const tES = document.getElementById('tipo-entrega-select');
            const dFD = document.querySelectorAll('.delivery-fields');
            const cRI = document.getElementById('costo-ruta');
            if (dFD && tES && cRI) {
                dFD.forEach(field => {
                    if (tES.value === 'domicilio') {
                        field.style.display = 'flex';
                    } else {
                        field.style.display = 'none';
                        cRI.value = 0;
                    }
                });
            }
        }

        function toggleApartadoFields(){
            const tipoVenta = document.getElementById('tipo-venta-select');
            const apartadoFechaField = document.querySelector('.apartado-fecha-field');
            const apartadoFechaInput = document.getElementById('apartado-fecha-max');
            const productoTiendaField = document.querySelector('.producto-tienda-field');
            const productoCatalogoField = document.querySelector('.producto-catalogo-field');

            // Actualizar precios del carrito según el tipo de venta seleccionado
            if (tipoVenta && window.ventaItems && window.ventaItems.length > 0) {
                const nuevoTipo = tipoVenta.value;
                let actualizados = 0;
                window.ventaItems.forEach(item => {
                    const product = localProductsMap.get(item.productoId);
                    if (!product) return; // item de catálogo, no tocar
                    let nuevoPrecio;
                    if (nuevoTipo === 'mayorista') {
                        nuevoPrecio = product.precioMayor || 0;
                        if (nuevoPrecio === 0) nuevoPrecio = product.precioDetal || 0;
                    } else {
                        nuevoPrecio = product.precioDetal || 0;
                    }
                    if (nuevoPrecio !== item.precio) {
                        item.precio = nuevoPrecio;
                        item.total = item.cantidad * nuevoPrecio;
                        actualizados++;
                    }
                });
                if (actualizados > 0) {
                    const label = nuevoTipo === 'mayorista' ? 'mayorista' : 'detal';
                    showToast(`Precios actualizados a ${label} (${actualizados} item${actualizados > 1 ? 's' : ''})`, 'info');
                    renderCarrito();
                    window.calcularTotalVentaGeneral();
                }
            }

            if (tipoVenta && apartadoFechaField && apartadoFechaInput) {
                if (tipoVenta.value === 'apartado') {
                    apartadoFechaField.style.display = 'block';
                    // Calcular fecha máxima (15 días desde hoy)
                    const hoy = new Date();
                    const fechaMax = new Date(hoy);
                    fechaMax.setDate(fechaMax.getDate() + 15);
                    apartadoFechaInput.value = fechaMax.toISOString().split('T')[0];
                } else {
                    apartadoFechaField.style.display = 'none';
                    apartadoFechaInput.value = '';
                }
            }

            // Mostrar/ocultar campos según el tipo de venta
            if (tipoVenta && productoTiendaField && productoCatalogoField) {
                if (tipoVenta.value === 'catalogo') {
                    // Venta por catálogo: mostrar campos manuales
                    productoTiendaField.style.display = 'none';
                    productoCatalogoField.style.display = 'block';
                } else {
                    // Venta normal: mostrar buscador de productos
                    productoTiendaField.style.display = 'block';
                    productoCatalogoField.style.display = 'none';
                }
            }
        }

        document.getElementById('tipo-entrega-select').addEventListener('change', toggleDeliveryFields);
        document.getElementById('tipo-venta-select').addEventListener('change', () => {
            toggleApartadoFields();
            // Actualizar precios mostrados en el modal de búsqueda de productos
            const tipo = document.getElementById('tipo-venta-select').value;
            document.querySelectorAll('#product-modal-list .price-info').forEach(el => {
                const pd = parseFloat(el.dataset.precioDetal) || 0;
                const pm = parseFloat(el.dataset.precioMayor) || 0;
                el.textContent = formatoMoneda.format(tipo === 'mayorista' && pm > 0 ? pm : pd);
                el.style.color = tipo === 'mayorista' ? 'var(--admin-success, #198754)' : '';
            });
        });
        toggleDeliveryFields();
        toggleApartadoFields();
        window.calcularTotalVentaGeneral();

        // Lógica para agregar items de catálogo externo
        const btnAgregarItemCatalogo = document.getElementById('btn-agregar-item-catalogo');
        const catalogoPrecioInput = document.getElementById('catalogo-precio');

        // Aplicar formato de dinero al campo precio de catálogo
        if (catalogoPrecioInput) {
            catalogoPrecioInput.addEventListener('input', function() {
                aplicarFormatoDinero.call(this);
            });
        }

        if (btnAgregarItemCatalogo) {
            btnAgregarItemCatalogo.addEventListener('click', () => {
                const descripcion = document.getElementById('catalogo-descripcion');
                const cantidad = document.getElementById('catalogo-cantidad');
                const precio = document.getElementById('catalogo-precio');

                if (!descripcion || !cantidad || !precio) return;

                const desc = descripcion.value.trim();
                const cant = parseInt(cantidad.value) || 1;
                const prec = parseFloat(eliminarFormatoNumero(precio.value)) || 0;

                if (!desc || cant <= 0 || prec <= 0) {
                    showToast('Complete todos los campos correctamente', 'warning');
                    return;
                }

                // Agregar item al carrito con un ID especial para catálogo
                const catalogoId = 'catalogo-' + Date.now();
                window.agregarItemAlCarrito(
                    catalogoId,
                    desc,
                    cant,
                    prec,
                    'N/A',  // talla
                    'N/A',  // color
                    desc    // nombreCompleto
                );

                // Limpiar campos
                descripcion.value = '';
                cantidad.value = '1';
                precio.value = '';

                showToast('Item de catálogo agregado', 'success');
            });
        }

        // Establecer cliente "General" por defecto al cargar
        if (ventaClienteInput) {
            ventaClienteInput.value = 'General';
            window.fillClientInfoSales();
        }

    })();

    // ========================================================================
    // ✅ --- SECCIÓN 4: APARTADOS COMPLETOS (REEMPLAZO) ---
    // ========================================================================
    (() => {
        const apartadosListTableBody = document.getElementById('lista-apartados');
        if (!apartadosListTableBody) { 
            console.warn("Elementos de Apartados no encontrados."); 
            return; 
        }
        
        const renderApartados = (snapshot) => { 
            apartadosListTableBody.innerHTML = ''; 
            
            if (snapshot.empty) {
                apartadosListTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay apartados pendientes.</td></tr>';
                return;
            } 
            
            snapshot.forEach(docSnap => {
                const ap = docSnap.data();
                const id = docSnap.id;
                const tr = document.createElement('tr');
                tr.dataset.id = id;

                const vence = ap.fechaVencimiento?.toDate ?
                    ap.fechaVencimiento.toDate().toLocaleDateString('es-CO') : 'N/A';

                const hoy = new Date();
                const fechaVenc = ap.fechaVencimiento?.toDate ? ap.fechaVencimiento.toDate() : null;
                let diasRestantes = 0;
                let vencimientoClass = '';

                if (fechaVenc) {
                    diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
                    if (diasRestantes < 0) {
                        vencimientoClass = 'text-danger fw-bold';
                    } else if (diasRestantes <= 7) {
                        vencimientoClass = 'text-warning fw-bold';
                    }
                }

                const saldo = ap.saldo || 0;
                const porcentajePagado = ap.total > 0 ? ((ap.abonado / ap.total) * 100).toFixed(0) : 0;

                // Construir columna de productos con información completa
                let productosHtml = '';
                if (ap.items && ap.items.length > 0) {
                    const productosDetalles = ap.items.map(item => {
                        const product = localProductsMap.get(item.productoId);
                        if (!product) return '';

                        const imagenUrl = product.imagenUrl || product.imageUrl || 'https://placehold.co/40x40/f0f0f0/cccccc?text=?';
                        const nombre = product.nombre || item.nombre || 'Producto';

                        // Resolver categoría desde categoriesMap
                        let categoria = 'Sin categoría';
                        if (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map && product.categoriaId) {
                            categoria = categoriesMap.get(product.categoriaId) || 'Sin categoría';
                        }

                        const variacion = item.talla && item.color ? `${item.talla} - ${item.color}` : 'N/A';

                        // El campo correcto es 'precio', no 'precioUnitario'
                        const precioNum = parseFloat(item.precio) || 0;
                        const precio = precioNum > 0 ? formatoMoneda.format(precioNum) : '$0';

                        const cantidad = item.cantidad || 0;

                        return `
                            <div class="d-flex gap-2 mb-2 align-items-start" style="font-size: 0.85rem;">
                                <img src="${imagenUrl}" alt="${nombre}"
                                    style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                                <div class="flex-grow-1" style="min-width:0;">
                                    <div class="fw-semibold text-truncate" style="max-width:200px;" title="${nombre}">${nombre}</div>
                                    <small class="text-muted d-block"><i class="bi bi-tag-fill me-1"></i>${categoria}</small>
                                    <small class="text-muted d-block">${variacion} | x${cantidad}</small>
                                    <small class="fw-bold text-primary">${precio} c/u</small>
                                </div>
                            </div>
                        `;
                    }).filter(html => html !== '').join('');

                    productosHtml = productosDetalles || '<small class="text-muted">Sin detalles</small>';
                } else {
                    productosHtml = '<small class="text-muted">Sin productos</small>';
                }

                tr.innerHTML = `
                    <td>
                        ${ap.clienteNombre || '?'}
                        <small class="d-block text-muted">${porcentajePagado}% pagado</small>
                    </td>
                    <td>${productosHtml}</td>
                    <td>${formatoMoneda.format(ap.total || 0)}</td>
                    <td class="text-success">${formatoMoneda.format(ap.abonado || 0)}</td>
                    <td class="text-danger fw-bold">${formatoMoneda.format(saldo)}</td>
                    <td class="${vencimientoClass}">
                        ${vence}
                        ${diasRestantes > 0 ? `<small class="d-block">(${diasRestantes} días)</small>` : ''}
                        ${diasRestantes < 0 ? '<small class="d-block">(VENCIDO)</small>' : ''}
                    </td>
                    <td class="action-buttons">
                        <button class="btn btn-action btn-action-view btn-ver-apartado" data-apartado-id="${id}">
                            <i class="bi bi-eye"></i><span class="btn-action-text">Ver</span>
                        </button>
                        <button class="btn btn-action btn-action-info btn-informar-apartado" data-apartado-id="${id}">
                            <i class="bi bi-whatsapp"></i><span class="btn-action-text">Informar</span>
                        </button>
                        <button class="btn btn-action btn-action-primary btn-abono-apartado" data-apartado-id="${id}">
                            <i class="bi bi-cash-coin"></i><span class="btn-action-text">Abonar</span>
                        </button>
                        <button class="btn btn-action btn-action-success btn-completar-apartado" data-apartado-id="${id}" ${saldo > 0 ? 'disabled' : ''}>
                            <i class="bi bi-check-circle"></i><span class="btn-action-text">Completar</span>
                        </button>
                        <button class="btn btn-action btn-action-danger btn-cancel-apartado" data-apartado-id="${id}">
                            <i class="bi bi-x-circle"></i><span class="btn-action-text">Cancelar</span>
                        </button>
                    </td>
                `;
                apartadosListTableBody.appendChild(tr);
            }); 
        };
        
        // Query simplificada sin índice compuesto - ordenar en memoria
        onSnapshot(apartadosCollection, (snapshot) => {
            // Filtrar y ordenar en memoria
            const apartadosPendientes = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.estado === 'Pendiente') {
                    apartadosPendientes.push({ id: doc.id, ...data });
                }
            });

            // Ordenar por fecha de vencimiento
            apartadosPendientes.sort((a, b) => {
                const fechaA = a.fechaVencimiento?.toDate?.() || new Date(0);
                const fechaB = b.fechaVencimiento?.toDate?.() || new Date(0);
                return fechaA - fechaB;
            });

            // Crear snapshot simulado para renderApartados
            const mockSnapshot = {
                empty: apartadosPendientes.length === 0,
                forEach: (callback) => {
                    apartadosPendientes.forEach(apt => {
                        callback({
                            id: apt.id,
                            data: () => apt
                        });
                    });
                }
            };

            renderApartados(mockSnapshot);
        }, e => {
            console.error("Error apartados:", e);
            if (apartadosListTableBody) {
                apartadosListTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar.</td></tr>';
            }
        });
        
        // EVENTOS
        if (apartadosListTableBody) {
            apartadosListTableBody.addEventListener('click', async (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const apartadoId = target.dataset.apartadoId;
                if (!apartadoId) return;

                e.preventDefault();

                if (target.classList.contains('btn-ver-apartado')) {
                    await abrirModalVerApartado(apartadoId);
                } else if (target.classList.contains('btn-informar-apartado')) {
                    await informarApartadoWhatsApp(apartadoId);
                } else if (target.classList.contains('btn-abono-apartado')) {
                    await abrirModalAbono(apartadoId);
                } else if (target.classList.contains('btn-completar-apartado')) {
                    await completarApartado(apartadoId);
                } else if (target.classList.contains('btn-cancel-apartado')) {
                    console.log('🗑️ Cancelando apartado:', apartadoId);
                    await cancelarApartado(apartadoId);
                }
            });
        }

        // ✅ FUNCIÓN: INFORMAR VÍA WHATSAPP (VERSIÓN ROBUSTA)
        async function informarApartadoWhatsApp(apartadoId) {
            console.log('📱 [WhatsApp] Iniciando función informar, apartadoId:', apartadoId);

            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);

            if (!apartadoSnap.exists()) {
                console.error('❌ [WhatsApp] Apartado no encontrado:', apartadoId);
                showToast('Apartado no encontrado', 'error');
                return;
            }

            const apartadoData = apartadoSnap.data();
            console.log('📦 [WhatsApp] Datos del apartado completos:', JSON.stringify(apartadoData, null, 2));

            const saldo = apartadoData.saldo || 0;
            const porcentajePagado = apartadoData.total > 0 ? ((apartadoData.abonado / apartadoData.total) * 100).toFixed(0) : 0;

            // Calcular días restantes
            const hoy = new Date();
            const fechaVenc = apartadoData.fechaVencimiento?.toDate ? apartadoData.fechaVencimiento.toDate() : null;
            let diasRestantes = 0;
            let mensajeVencimiento = '';

            if (fechaVenc) {
                diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
                if (diasRestantes < 0) {
                    mensajeVencimiento = `⚠️ *VENCIDO* hace ${Math.abs(diasRestantes)} días`;
                } else if (diasRestantes === 0) {
                    mensajeVencimiento = `⚠️ *Vence HOY*`;
                } else if (diasRestantes <= 7) {
                    mensajeVencimiento = `⏰ Vence en ${diasRestantes} días`;
                } else {
                    mensajeVencimiento = `📅 Vence: ${fechaVenc.toLocaleDateString('es-CO')}`;
                }
            }

            // ✅ ESTRATEGIA ROBUSTA DE BÚSQUEDA DE CELULAR
            let whatsapp = '';

            console.log('🔍 [WhatsApp] === INICIO BÚSQUEDA DE CELULAR ===');

            // INTENTO 1: Buscar en la venta asociada (PRIMERO, porque es más confiable)
            if (apartadoData.ventaId) {
                console.log('🔗 [WhatsApp] Intento 1: Buscando en venta asociada:', apartadoData.ventaId);
                try {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();
                        console.log('📄 [WhatsApp] Venta encontrada:', JSON.stringify(ventaData, null, 2));

                        if (ventaData.clienteCelular) {
                            whatsapp = ventaData.clienteCelular;
                            console.log('✅ [WhatsApp] Celular encontrado en venta:', whatsapp);
                        } else {
                            console.warn('⚠️ [WhatsApp] Venta no tiene campo clienteCelular');
                        }
                    } else {
                        console.warn('⚠️ [WhatsApp] Venta no existe en Firebase');
                    }
                } catch (error) {
                    console.error('❌ [WhatsApp] Error al buscar venta:', error);
                }
            } else {
                console.warn('⚠️ [WhatsApp] Apartado no tiene ventaId');
            }

            // INTENTO 2: Buscar directamente en el apartado (apartados nuevos)
            if (!whatsapp && apartadoData.clienteCelular) {
                console.log('🔗 [WhatsApp] Intento 2: Celular encontrado en apartado');
                whatsapp = apartadoData.clienteCelular;
                console.log('✅ [WhatsApp] Usando celular del apartado:', whatsapp);
            }

            // INTENTO 3: Buscar en colección de clientes por nombre
            if (!whatsapp && apartadoData.clienteNombre) {
                console.log('🔗 [WhatsApp] Intento 3: Buscando cliente por nombre:', apartadoData.clienteNombre);
                try {
                    const clientesRef = collection(db, 'clientes');
                    const clientesQuery = query(clientesRef, where('nombre', '==', apartadoData.clienteNombre));
                    const clientesSnap = await getDocs(clientesQuery);

                    if (!clientesSnap.empty) {
                        const clienteData = clientesSnap.docs[0].data();
                        console.log('👤 [WhatsApp] Cliente encontrado:', JSON.stringify(clienteData, null, 2));

                        if (clienteData.celular) {
                            whatsapp = clienteData.celular;
                            console.log('✅ [WhatsApp] Celular encontrado en cliente:', whatsapp);
                        }
                    } else {
                        console.warn('⚠️ [WhatsApp] No se encontró cliente con nombre:', apartadoData.clienteNombre);
                    }
                } catch (error) {
                    console.error('❌ [WhatsApp] Error al buscar cliente:', error);
                }
            }

            console.log('🔍 [WhatsApp] === FIN BÚSQUEDA DE CELULAR ===');
            console.log('📞 [WhatsApp] Número final obtenido:', whatsapp || 'NO ENCONTRADO');

            if (!whatsapp) {
                console.error('❌ [WhatsApp] FALLO TOTAL: No se pudo obtener número de ninguna fuente');
                showToast('❌ No se encontró número de WhatsApp. Verifica que el cliente tenga celular registrado.', 'error');
                return;
            }

            // Limpiar número de WhatsApp (quitar espacios, guiones, etc)
            let whatsappLimpio = whatsapp.replace(/\D/g, '');
            console.log('🧹 [WhatsApp] Número limpio (sin caracteres):', whatsappLimpio);

            // Validar que el número tenga al menos 10 dígitos
            if (whatsappLimpio.length < 10) {
                console.error('❌ [WhatsApp] Número muy corto:', whatsappLimpio);
                showToast('El número de WhatsApp es inválido (muy corto)', 'error');
                return;
            }

            // Si el número comienza con 57 (código de Colombia), quitarlo para evitar duplicación
            if (whatsappLimpio.startsWith('57')) {
                whatsappLimpio = whatsappLimpio.substring(2);
                console.log('✂️ [WhatsApp] Prefijo 57 eliminado. Nuevo número:', whatsappLimpio);
            }

            // Validar que después de quitar el prefijo tenga 10 dígitos (formato colombiano)
            if (whatsappLimpio.length !== 10) {
                console.error('❌ [WhatsApp] Número no tiene 10 dígitos:', whatsappLimpio);
                showToast('El número de WhatsApp no tiene un formato válido (debe tener 10 dígitos)', 'error');
                return;
            }

            // Crear mensaje
            const mensaje = `Hola *${apartadoData.clienteNombre}*! 👋

Te escribo de *Mishell Boutique* para recordarte sobre tu apartado:

📦 *Productos:* ${apartadoData.items?.length || 0} item(s)
💰 *Total:* ${formatoMoneda.format(apartadoData.total || 0)}
✅ *Abonado:* ${formatoMoneda.format(apartadoData.abonado || 0)} (${porcentajePagado}%)
⚠️ *Saldo pendiente:* ${formatoMoneda.format(saldo)}

${mensajeVencimiento}

${saldo > 0 ? '¿Cuándo podrías realizar el siguiente abono? 😊' : '🎉 ¡Tu apartado está completamente pagado! Puedes pasar a recogerlo cuando gustes.'}

¡Quedamos atentos! 💕`;

            // Codificar mensaje para URL
            const mensajeCodificado = encodeURIComponent(mensaje);

            // Abrir WhatsApp
            const whatsappUrl = `https://wa.me/57${whatsappLimpio}?text=${mensajeCodificado}`;
            console.log('🌐 [WhatsApp] URL final:', whatsappUrl);
            console.log('🚀 [WhatsApp] Abriendo WhatsApp...');

            openWhatsApp(whatsappUrl);
            showToast('Abriendo WhatsApp...', 'success');
        }

        // ✅ FUNCIÓN: ABRIR MODAL DE VER APARTADO (con historial de pagos)
        async function abrirModalVerApartado(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);

            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }

            const apartadoData = apartadoSnap.data();
            const saldo = apartadoData.saldo || 0;

            // Poblar información general
            document.getElementById('detalle-cliente-nombre').textContent = apartadoData.clienteNombre || 'N/A';
            document.getElementById('detalle-total').textContent = formatoMoneda.format(apartadoData.total || 0);
            document.getElementById('detalle-abonado').textContent = formatoMoneda.format(apartadoData.abonado || 0);
            document.getElementById('detalle-saldo').textContent = formatoMoneda.format(saldo);

            // Estado con badge
            const estadoEl = document.getElementById('detalle-estado');
            estadoEl.textContent = apartadoData.estado || 'Pendiente';
            estadoEl.className = 'badge';
            if (apartadoData.estado === 'Completado') {
                estadoEl.classList.add('bg-success');
            } else if (apartadoData.estado === 'Cancelado') {
                estadoEl.classList.add('bg-danger');
            } else {
                estadoEl.classList.add('bg-warning', 'text-dark');
            }

            // Fecha de vencimiento
            const vencimientoDate = apartadoData.fechaVencimiento?.toDate();
            document.getElementById('detalle-vencimiento').textContent = vencimientoDate
                ? vencimientoDate.toLocaleDateString('es-CO')
                : 'N/A';

            // Poblar historial de pagos
            const historialBody = document.getElementById('detalle-historial-pagos');
            historialBody.innerHTML = '';

            const abonos = apartadoData.abonos || [];
            if (abonos.length === 0) {
                historialBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay pagos registrados</td></tr>';
            } else {
                abonos.forEach(abono => {
                    const tr = document.createElement('tr');
                    const fechaAbono = abono.fecha?.toDate ? abono.fecha.toDate().toLocaleDateString('es-CO') : 'N/A';
                    tr.innerHTML = `
                        <td>${fechaAbono}</td>
                        <td class="fw-bold text-success">${formatoMoneda.format(abono.monto || 0)}</td>
                        <td><span class="badge ${abono.metodoPago === 'Efectivo' ? 'bg-success' : 'bg-primary'}">${abono.metodoPago || 'N/A'}</span></td>
                        <td>${abono.observaciones || '-'}</td>
                    `;
                    historialBody.appendChild(tr);
                });
            }

            if (verApartadoModalInstance) {
                verApartadoModalInstance.show();
            }
        }

        // FUNCIÓN: ABRIR MODAL DE ABONO
        async function abrirModalAbono(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);
            
            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }
            
            const apartadoData = apartadoSnap.data();
            const saldo = apartadoData.saldo || 0;
            
            document.getElementById('abono-apartado-id').value = apartadoId;
            document.getElementById('abono-saldo-actual').value = saldo;
            document.getElementById('abono-cliente-nombre').textContent = apartadoData.clienteNombre || 'N/A';
            document.getElementById('abono-total').textContent = formatoMoneda.format(apartadoData.total || 0);
            document.getElementById('abono-abonado').textContent = formatoMoneda.format(apartadoData.abonado || 0);
            document.getElementById('abono-saldo').textContent = formatoMoneda.format(saldo);
            
            const abonoMontoEl = document.getElementById('abono-monto');
            const abonoHelperEl = document.getElementById('abono-helper');
            abonoMontoEl.value = '';
            abonoMontoEl.setAttribute('max', saldo);
            document.getElementById('abono-metodo-pago').value = 'Efectivo';
            document.getElementById('abono-observaciones').value = '';
            abonoHelperEl.textContent = `Máximo: ${formatoMoneda.format(saldo)}`;
            abonoHelperEl.classList.remove('text-danger', 'text-success');

            
            if (abonoApartadoModalInstance) {
                abonoApartadoModalInstance.show();
            }
        }
        
        // FUNCIÓN: COMPLETAR APARTADO
        async function completarApartado(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);
            
            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }
            
            const apartadoData = apartadoSnap.data();
            
            if (apartadoData.saldo > 0) {
                showToast('El apartado aún tiene saldo pendiente', 'warning');
                return;
            }
            
            if (!confirm('¿Confirmas que este apartado está completamente pagado?')) {
                return;
            }
            
            try {
                await updateDoc(apartadoRef, {
                    estado: 'Completado',
                    fechaCompletado: serverTimestamp()
                });
                
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    await updateDoc(ventaRef, {
                        estado: 'Completada'
                    });
                }
                
                showToast('¡Apartado completado exitosamente!', 'success');
                
            } catch (error) {
                console.error('Error al completar apartado:', error);
                showToast('Error al completar el apartado', 'error');
            }
        }
        
        // FUNCIÓN: CANCELAR APARTADO
        async function cancelarApartado(apartadoId) {
            console.log('📋 Iniciando cancelación de apartado:', apartadoId);

            if (!confirm('¿Estás seguro de cancelar este apartado?\n\nEsta acción devolverá el stock de los productos.')) {
                console.log('❌ Cancelación abortada por el usuario');
                return;
            }

            try {
                const apartadoRef = doc(db, 'apartados', apartadoId);
                const apartadoSnap = await getDoc(apartadoRef);

                if (!apartadoSnap.exists()) {
                    console.error('❌ Apartado no encontrado:', apartadoId);
                    showToast('Apartado no encontrado', 'error');
                    return;
                }

                const apartadoData = apartadoSnap.data();
                console.log('📦 Datos del apartado:', apartadoData);

                if (apartadoData.ventaId) {
                    console.log('🔗 Procesando venta asociada:', apartadoData.ventaId);
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();

                        // Solo devolver stock si la venta no estaba ya cancelada
                        if (ventaData.estado !== 'Cancelada' && ventaData.estado !== 'Anulada') {
                            console.log('📦 Devolviendo stock...');
                            await actualizarStock(ventaData.items, 'sumar');
                        } else {
                            console.log('⚠️ Venta ya estaba cancelada, no se devuelve stock');
                        }

                        await updateDoc(ventaRef, {
                            estado: 'Cancelada'
                        });
                        console.log('✅ Venta marcada como cancelada');
                    }
                }

                await updateDoc(apartadoRef, {
                    estado: 'Cancelado',
                    fechaCancelacion: serverTimestamp()
                });
                console.log('✅ Apartado marcado como cancelado');

                showToast('Apartado cancelado y stock devuelto', 'info');

            } catch (error) {
                console.error('❌ Error al cancelar apartado:', error);
                showToast('Error al cancelar el apartado: ' + error.message, 'error');
            }
        }
    })();

    // ✅ LISTENER PARA FORMULARIO DE ABONO (MEJORADO)
    const formAbonoApartado = document.getElementById('form-abono-apartado');
    if (formAbonoApartado) {
        formAbonoApartado.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("📝 Iniciando registro de abono...");

            const apartadoId = document.getElementById('abono-apartado-id').value;
            const monto = parseFloat(eliminarFormatoNumero(document.getElementById('abono-monto').value));
            const saldoActual = parseFloat(document.getElementById('abono-saldo-actual').value);
            const metodoPago = document.getElementById('abono-metodo-pago').value;
            const observaciones = document.getElementById('abono-observaciones').value.trim();

            console.log("Datos del abono:", { apartadoId, monto, saldoActual, metodoPago, observaciones });

            // Validaciones
            if (!apartadoId) {
                showToast('Error: ID de apartado no encontrado', 'error');
                return;
            }

            if (isNaN(monto) || monto <= 0) {
                showToast('El monto debe ser mayor a cero', 'error');
                return;
            }

            if (monto > saldoActual) {
                showToast(`El abono (${formatoMoneda.format(monto)}) no puede ser mayor al saldo (${formatoMoneda.format(saldoActual)})`, 'warning');
                return;
            }

            try {
                // ✅ PASO 1: Obtener apartado actual
                const apartadoRef = doc(db, 'apartados', apartadoId);
                const apartadoSnap = await getDoc(apartadoRef);

                if (!apartadoSnap.exists()) {
                    showToast('Apartado no encontrado en la base de datos', 'error');
                    console.error("❌ Apartado no existe:", apartadoId);
                    return;
                }

                const apartadoData = apartadoSnap.data();
                console.log("Apartado actual:", apartadoData);

                // ✅ PASO 2: Calcular nuevos valores
                const nuevoAbonado = (apartadoData.abonado || 0) + monto;
                const nuevoSaldo = apartadoData.total - nuevoAbonado;

                console.log("Cálculos:", {
                    abonado_anterior: apartadoData.abonado,
                    monto_abono: monto,
                    nuevo_abonado: nuevoAbonado,
                    total: apartadoData.total,
                    nuevo_saldo: nuevoSaldo
                });

                // ✅ PASO 3: Agregar abono al historial
                // Convertir abonos existentes para asegurar que usen Timestamp
                const abonosExistentes = apartadoData.abonos || [];
                const abonosConvertidos = abonosExistentes.map(abono => {
                    // Si la fecha es un Timestamp, mantenerlo; si no, convertirlo
                    const fecha = abono.fecha?.toDate ? abono.fecha : (abono.fecha ? Timestamp.fromDate(new Date(abono.fecha)) : Timestamp.fromDate(new Date()));
                    return {
                        ...abono,
                        fecha: fecha
                    };
                });

                const nuevoAbono = {
                    fecha: Timestamp.fromDate(new Date()),
                    monto: monto,
                    metodoPago: metodoPago,
                    observaciones: observaciones || 'Sin observaciones'
                };
                abonosConvertidos.push(nuevoAbono);

                // ✅ PASO 4: Actualizar apartado
                await updateDoc(apartadoRef, {
                    abonado: nuevoAbonado,
                    saldo: nuevoSaldo,
                    abonos: abonosConvertidos,
                    estado: nuevoSaldo <= 0 ? 'Completado' : 'Pendiente',
                    ultimaModificacion: serverTimestamp()
                });
                console.log("✅ Apartado actualizado correctamente");

                // ✅ PASO 4.5: Crear NUEVA VENTA con el abono (como si fuera otra venta)
                try {
                    // Obtener datos de la venta original para copiar información del cliente
                    let clienteNombre = apartadoData.clienteNombre || 'Cliente General';
                    let clienteDireccion = '';
                    let clienteCelular = apartadoData.clienteCelular || '';

                    if (apartadoData.ventaId) {
                        const ventaOriginalSnap = await getDoc(doc(db, 'ventas', apartadoData.ventaId));
                        if (ventaOriginalSnap.exists()) {
                            const ventaOriginal = ventaOriginalSnap.data();
                            clienteNombre = ventaOriginal.clienteNombre || clienteNombre;
                            clienteDireccion = ventaOriginal.clienteDireccion || '';
                            clienteCelular = ventaOriginal.clienteCelular || clienteCelular;
                        }
                    }

                    // Crear la nueva venta con el monto del abono
                    const nuevaVentaData = {
                        clienteNombre: clienteNombre,
                        clienteDireccion: clienteDireccion,
                        clienteCelular: clienteCelular,
                        tipoVenta: 'detal', // Es una venta normal, ya no es apartado
                        tipoEntrega: 'tienda',
                        pedidoWhatsapp: false,
                        repartidorId: null,
                        repartidorNombre: null,
                        costoRuta: 0,
                        rutaPagadaTransferencia: false,
                        items: apartadoData.items || [], // Los mismos items del apartado
                        observaciones: `Abono de apartado. ${observaciones || 'Pago restante del apartado.'}`,
                        descuento: 0,
                        descuentoTipo: 'monto',
                        pagoEfectivo: metodoPago === 'Efectivo' ? monto : 0,
                        pagoTransferencia: metodoPago === 'Transferencia' ? monto : 0,
                        totalVenta: monto, // El total es el monto del abono
                        montoTotalProducto: null, // No es apartado, no necesita este campo
                        estado: 'Completada',
                        esCatalogoExterno: false,
                        esAbonoApartado: true, // Flag para identificar que es un abono
                        apartadoIdRelacionado: apartadoId, // Referencia al apartado
                        timestamp: serverTimestamp()
                    };

                    const nuevaVentaRef = await addDoc(collection(db, 'ventas'), nuevaVentaData);
                    console.log("✅ Nueva venta creada con el abono. ID:", nuevaVentaRef.id);
                    console.log("💰 Monto de la venta:", formatoMoneda.format(monto));

                } catch (ventaErr) {
                    console.error("❌ Error al crear venta con el abono:", ventaErr);
                    showToast("Error al registrar la venta del abono. El apartado se actualizó correctamente.", 'warning');
                }

                // ✅ PASO 5: Actualizar venta original asociada (solo el estado, NO los montos)
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        // Solo actualizar el estado, NO los montos de pago
                        // Los montos ya se registraron con el abono inicial
                        // Los abonos posteriores se contarán desde el historial de abonos
                        const updateVenta = {
                            estado: nuevoSaldo <= 0 ? 'Completada' : 'Pendiente'
                        };

                        await updateDoc(ventaRef, updateVenta);
                        console.log("✅ Venta actualizada correctamente (solo estado)");
                    } else {
                        console.warn("⚠️ Venta asociada no encontrada:", apartadoData.ventaId);
                    }
                }

                // ✅ PASO 6: Cerrar modal y mostrar confirmación
                if (typeof abonoApartadoModalInstance !== 'undefined' && abonoApartadoModalInstance) {
                    abonoApartadoModalInstance.hide();
                }

                if (nuevoSaldo <= 0) {
                    showToast('¡Apartado completado exitosamente! 🎉', 'success');
                } else {
                    showToast(`Abono registrado. Nuevo saldo: ${formatoMoneda.format(nuevoSaldo)}`, 'success');
                }

                // Limpiar formulario
                formAbonoApartado.reset();

            } catch (error) {
                console.error('❌ Error crítico al registrar abono:', error);
                showToast(`Error al registrar el abono: ${error.message}`, 'error');
            }
        });
    }

    // VALIDACIÓN EN TIEMPO REAL
    const abonoMontoInput = document.getElementById('abono-monto');
    if (abonoMontoInput) {
        abonoMontoInput.addEventListener('input', (e) => {
            const monto = parseFloat(e.target.value);
            const saldoActual = parseFloat(document.getElementById('abono-saldo-actual').value);
            const helper = document.getElementById('abono-helper');
            
            if (isNaN(monto)) {
                 helper.textContent = `Máximo: ${formatoMoneda.format(saldoActual)}`;
                 helper.classList.remove('text-danger', 'text-success');
                 return;
            }
            
            if (monto > saldoActual) {
                helper.textContent = '⚠️ El monto supera el saldo pendiente';
                helper.classList.add('text-danger');
            } else if (monto === saldoActual) {
                helper.textContent = '✓ Esto completará el apartado';
                helper.classList.remove('text-danger');
                helper.classList.add('text-success');
            } else {
                helper.textContent = `Máximo: ${formatoMoneda.format(saldoActual)}`;
                helper.classList.remove('text-danger', 'text-success');
            }
        });
    }


    // ========================================================================
    // --- LÓGICA FINANZAS (Ingreso/Gasto, Cierre Automático) ---
    // ========================================================================
    (() => {
         const addIncomeForm = document.getElementById('form-add-income'); const incomeAmountInput = document.getElementById('income-amount'); const incomeMethodSelect = document.getElementById('income-method'); const incomeDescInput = document.getElementById('income-description'); const addExpenseForm = document.getElementById('form-add-expense'); const expenseAmountInput = document.getElementById('expense-amount'); const expenseDescInput = document.getElementById('expense-description'); const closingForm = document.getElementById('form-cierre-caja'); const closingHistoryTableBody = document.getElementById('lista-historial-cierres');

         // Elementos del formulario de cierre
         const cajaEfectivoInput = document.getElementById('caja-efectivo');
         const cajaAbonosEfectivoInput = document.getElementById('caja-abonos-efectivo');
         const cajaRecibidoRepartidoresInput = document.getElementById('caja-recibido-repartidores');
         const cajaEgresosInput = document.getElementById('caja-egresos');
         const cajaTotalInput = document.getElementById('caja-total');

         // Variables para almacenar datos del día
         let datosDelDia = {
             ventasEfectivo: 0,
             ventasTransferencia: 0,
             abonosEfectivo: 0,
             abonosTransferencia: 0,
             recibidoRepartidores: 0,
             totalVentas: 0,
             detalleProductos: {}
         };

         // Función para calcular datos del día en tiempo real
         async function calcularDatosDelDia() {
             try {
                 const hoy = new Date();
                 const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
                 const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

                 // 1. VENTAS DEL DÍA
                 const qVentas = query(
                     salesCollection,
                     where('timestamp', '>=', Timestamp.fromDate(inicio)),
                     where('timestamp', '<=', Timestamp.fromDate(fin)),
                     orderBy('timestamp', 'desc')
                 );
                 const ventasSnap = await getDocs(qVentas);

                 let ventasEfectivo = 0;
                 let ventasTransferencia = 0;
                 let totalVentas = 0;
                 let detalleProductos = {};

                 ventasSnap.forEach(doc => {
                     const venta = doc.data();
                    const estado = venta.estado || 'Completada';

                    // Filtrado manual - omitir ventas anuladas/canceladas
                    if (estado === 'Anulada' || estado === 'Cancelada') {
                        return;
                    }

                     // ✅ CORRECCIÓN: Para apartados, sumar solo lo recibido (efectivo + transferencia)
                     // no el total de la venta, ya que el resto está pendiente de pago
                     const montoRecibido = (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                     totalVentas += montoRecibido;
                     ventasEfectivo += venta.pagoEfectivo || 0;
                     ventasTransferencia += venta.pagoTransferencia || 0;

                     if (venta.items) {
                         venta.items.forEach(item => {
                             if (!detalleProductos[item.nombre]) {
                                 detalleProductos[item.nombre] = 0;
                             }
                             detalleProductos[item.nombre] += item.cantidad;
                         });
                     }
                 });

                 // 2. ABONOS DEL DÍA (de apartados)
                 const qAbonos = query(
                     collection(db, 'abonos'),
                     where('timestamp', '>=', Timestamp.fromDate(inicio)),
                     where('timestamp', '<=', Timestamp.fromDate(fin))
                 );
                 const abonosSnap = await getDocs(qAbonos);

                 let abonosEfectivo = 0;
                 let abonosTransferencia = 0;

                 abonosSnap.forEach(doc => {
                     const abono = doc.data();
                     if (abono.metodoPago === 'Efectivo') {
                         abonosEfectivo += abono.monto || 0;
                     } else if (abono.metodoPago === 'Transferencia') {
                         abonosTransferencia += abono.monto || 0;
                     }
                 });

                 // 3. DINERO RECIBIDO DE REPARTIDORES (liquidaciones del día)
                 const qLiquidaciones = query(
                     collection(db, 'liquidaciones'),
                     where('timestamp', '>=', Timestamp.fromDate(inicio)),
                     where('timestamp', '<=', Timestamp.fromDate(fin))
                 );
                 const liquidacionesSnap = await getDocs(qLiquidaciones);

                 let recibidoRepartidores = 0;
                 liquidacionesSnap.forEach(doc => {
                     const liq = doc.data();
                     recibidoRepartidores += liq.efectivoEntregado || 0;
                 });

                 // Actualizar datos
                 datosDelDia = {
                     ventasEfectivo,
                     ventasTransferencia,
                     abonosEfectivo,
                     abonosTransferencia,
                     recibidoRepartidores,
                     totalVentas,
                     detalleProductos
                 };

                 // Actualizar campos del formulario
                 if (cajaEfectivoInput) cajaEfectivoInput.value = formatoMoneda.format(ventasEfectivo);
                 if (cajaAbonosEfectivoInput) cajaAbonosEfectivoInput.value = formatoMoneda.format(abonosEfectivo);
                 if (cajaRecibidoRepartidoresInput) cajaRecibidoRepartidoresInput.value = formatoMoneda.format(recibidoRepartidores);

                 calcularTotalCaja();

                 console.log('✅ Datos del día calculados:', datosDelDia);
             } catch (err) {
                 console.error('Error calculando datos del día:', err);
             }
         }

         // Función para calcular el total de caja
         function calcularTotalCaja() {
             const egresos = parseFloat(cajaEgresosInput?.value) || 0;
             const totalEfectivo = datosDelDia.ventasEfectivo + datosDelDia.abonosEfectivo + datosDelDia.recibidoRepartidores;
             const totalCaja = totalEfectivo - egresos;

             if (cajaTotalInput) {
                 cajaTotalInput.value = formatoMoneda.format(totalCaja);
             }
         }

         // Recalcular cuando cambien los egresos
         if (cajaEgresosInput) {
             cajaEgresosInput.addEventListener('input', calcularTotalCaja);
         }

         // Calcular automáticamente cuando se muestra la vista de cierre
         const toggleClosingTodayBtn = document.getElementById('toggle-closing-today-btn');
         if (toggleClosingTodayBtn) {
             toggleClosingTodayBtn.addEventListener('click', () => {
                 calcularDatosDelDia();
             });
         }

         // Calcular al cargar la página si ya está en la vista de cierre
         if (document.getElementById('closing-today-view')?.style.display !== 'none') {
             calcularDatosDelDia();
         }

         if(addIncomeForm) addIncomeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(eliminarFormatoNumero(incomeAmountInput.value));
            const method = incomeMethodSelect.value;
            const desc = incomeDescInput.value.trim();
            if (amount && desc && method) {
                try {
                    await addDoc(financesCollection, {
                        tipo: 'ingreso',
                        monto: amount,
                        metodoPago: method,
                        descripcion: desc,
                        timestamp: serverTimestamp()
                    });
                    showToast(`Ingreso en ${method} guardado!`);

                    // Cerrar modal correctamente
                    const modalEl = document.getElementById('addIncomeModal');
                    const modalInstance = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
                    modalInstance.hide();

                    addIncomeForm.reset();
                } catch(err) {
                    console.error("Err income:", err);
                    showToast(`Error: ${err.message}`, 'error');
                }
            } else {
                showToast('Todos los campos son requeridos.', 'warning');
            }
         });

         if(addExpenseForm) addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(eliminarFormatoNumero(expenseAmountInput.value));
            const desc = expenseDescInput.value.trim();
            if (amount && desc) {
                try {
                    await addDoc(financesCollection, {
                        tipo: 'gasto',
                        monto: amount,
                        descripcion: desc,
                        timestamp: serverTimestamp()
                    });
                    showToast('Gasto guardado!');

                    // Cerrar modal correctamente
                    const modalEl = document.getElementById('addExpenseModal');
                    const modalInstance = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
                    modalInstance.hide();

                    addExpenseForm.reset();
                } catch(err) {
                    console.error("Err expense:", err);
                    showToast(`Error: ${err.message}`, 'error');
                }
            } else {
                showToast('Monto y descripción requeridos.', 'warning');
            }
         });
        if (closingForm) closingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            try {
                showToast("Guardando cierre de caja...", 'info');

                const hoy = new Date();
                const egresos = parseFloat(cajaEgresosInput.value) || 0;
                const obs = document.getElementById('caja-observaciones').value.trim();

                const totalEfectivo = datosDelDia.ventasEfectivo + datosDelDia.abonosEfectivo + datosDelDia.recibidoRepartidores;
                const totalCaja = totalEfectivo - egresos;

                // Guardar cierre en BD con TODOS los datos
                const cierreData = {
                    timestamp: serverTimestamp(),
                    ventasEfectivo: datosDelDia.ventasEfectivo,
                    ventasTransferencia: datosDelDia.ventasTransferencia,
                    abonosEfectivo: datosDelDia.abonosEfectivo,
                    abonosTransferencia: datosDelDia.abonosTransferencia,
                    recibidoRepartidores: datosDelDia.recibidoRepartidores,
                    totalVentas: datosDelDia.totalVentas,
                    egresos,
                    totalCaja,
                    observaciones: obs
                };

                await addDoc(closingsCollection, cierreData);

                // Crear mensaje para WhatsApp
                let mensaje = `*📊 CIERRE DE CAJA*\\n`;
                mensaje += `📅 ${hoy.toLocaleDateString('es-CO')} - ${hoy.toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'})}\\n\\n`;

                mensaje += `💰 *INGRESOS*\\n`;
                mensaje += `Ventas: $${datosDelDia.ventasEfectivo.toLocaleString()} (Efec.) + $${datosDelDia.ventasTransferencia.toLocaleString()} (Transf.)\\n`;
                mensaje += `Abonos: $${datosDelDia.abonosEfectivo.toLocaleString()} (Efec.) + $${datosDelDia.abonosTransferencia.toLocaleString()} (Transf.)\\n`;
                mensaje += `Repartidores: $${datosDelDia.recibidoRepartidores.toLocaleString()}\\n`;
                mensaje += `*Total General:* $${datosDelDia.totalVentas.toLocaleString()}\\n\\n`;

                mensaje += `💵 *EFECTIVO*\\n`;
                mensaje += `Total Ingresado: $${totalEfectivo.toLocaleString()}\\n`;
                mensaje += `Gastos: $${egresos.toLocaleString()}\\n`;
                mensaje += `💼 *EN CAJA: $${totalCaja.toLocaleString()}*\\n\\n`;

                mensaje += `📦 *PRODUCTOS VENDIDOS*\\n`;
                const productos = Object.entries(datosDelDia.detalleProductos);
                if (productos.length > 0) {
                    productos.forEach(([producto, cantidad]) => {
                        mensaje += `• ${producto}: ${cantidad}\\n`;
                    });
                } else {
                    mensaje += `(Sin ventas)\\n`;
                }

                if (obs) {
                    mensaje += `\\n📝 *Observaciones:* ${obs}`;
                }

                // Abrir WhatsApp
                const whatsappUrl = `https://wa.me/573017850041?text=${encodeURIComponent(mensaje)}`;
                openWhatsApp(whatsappUrl);

                showToast("✅ Cierre guardado! Enviando por WhatsApp...", 'success');
                closingForm.reset();

                // Recalcular después de resetear
                setTimeout(() => {
                    calcularDatosDelDia();
                }, 500);
            } catch(err) {
                console.error("Err closing:", err);
                showToast(`Error: ${err.message}`, 'error');
            }
        });
         const renderClosings = (snapshot) => {
             if(!closingHistoryTableBody) return;
             closingHistoryTableBody.innerHTML = '';

             if (snapshot.empty) {
                 closingHistoryTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay cierres.</td></tr>';
                 return;
             }

             // Calcular estadísticas
             const ahora = new Date();
             const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
             const ayer = new Date(hoy);
             ayer.setDate(ayer.getDate() - 1);
             const inicioSemana = new Date(hoy);
             inicioSemana.setDate(hoy.getDate() - 7);

             let cierreHoy = null;
             let cierreAyer = null;
             let totalSemana = 0;
             let cantidadSemana = 0;

             snapshot.forEach(docSnap => {
                 const d = docSnap.data();
                 const id = docSnap.id;
                 const fechaCierre = d.timestamp?.toDate ? d.timestamp.toDate() : null;
                 const fechaSolo = fechaCierre ? new Date(fechaCierre.getFullYear(), fechaCierre.getMonth(), fechaCierre.getDate()) : null;

                 // Estadísticas
                 if (fechaSolo) {
                     if (fechaSolo.getTime() === hoy.getTime()) {
                         cierreHoy = d;
                     }
                     if (fechaSolo.getTime() === ayer.getTime()) {
                         cierreAyer = d;
                     }
                     if (fechaCierre >= inicioSemana) {
                         totalSemana += d.totalCaja || 0;
                         cantidadSemana++;
                     }
                 }

                 // Renderizar fila
                 const tr = document.createElement('tr');
                 const fecha = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString('es-CO', {
                     year: 'numeric',
                     month: '2-digit',
                     day: '2-digit',
                     hour: '2-digit',
                     minute: '2-digit'
                 }) : 'N/A';
                 tr.innerHTML = `<td>${fecha}</td><td>${formatoMoneda.format(d.ventasEfectivo||0)}</td><td>${formatoMoneda.format(d.abonosEfectivo||0)}</td><td>${formatoMoneda.format(d.recibidoRepartidores||0)}</td><td>${formatoMoneda.format(d.egresos||0)}</td><td class="fw-bold">${formatoMoneda.format(d.totalCaja||0)}</td><td>${d.observaciones||'-'}</td>`;
                 closingHistoryTableBody.appendChild(tr);
             });

             // Actualizar tarjetas de resumen
             const cierreHoyTotalEl = document.getElementById('cierre-hoy-total');
             const cierreHoyFechaEl = document.getElementById('cierre-hoy-fecha');
             const cierreAyerTotalEl = document.getElementById('cierre-ayer-total');
             const cierreAyerFechaEl = document.getElementById('cierre-ayer-fecha');
             const cierreSemanaTotalEl = document.getElementById('cierre-semana-total');
             const cierreSemanaCantidadEl = document.getElementById('cierre-semana-cantidad');

             if (cierreHoyTotalEl) {
                 if (cierreHoy) {
                     cierreHoyTotalEl.textContent = formatoMoneda.format(cierreHoy.totalCaja);
                     cierreHoyTotalEl.classList.remove('text-muted');
                     cierreHoyTotalEl.classList.add('text-primary');
                     if (cierreHoyFechaEl) {
                         const hora = cierreHoy.timestamp?.toDate ? cierreHoy.timestamp.toDate().toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'}) : '';
                         cierreHoyFechaEl.textContent = `Cerrado a las ${hora}`;
                     }
                 } else {
                     cierreHoyTotalEl.textContent = 'Sin cierre';
                     cierreHoyTotalEl.classList.add('text-muted');
                     cierreHoyTotalEl.classList.remove('text-primary');
                     if (cierreHoyFechaEl) cierreHoyFechaEl.textContent = 'No realizado';
                 }
             }

             if (cierreAyerTotalEl) {
                 if (cierreAyer) {
                     cierreAyerTotalEl.textContent = formatoMoneda.format(cierreAyer.totalCaja);
                     cierreAyerTotalEl.classList.remove('text-muted');
                     cierreAyerTotalEl.classList.add('text-secondary');
                     if (cierreAyerFechaEl) {
                         const hora = cierreAyer.timestamp?.toDate ? cierreAyer.timestamp.toDate().toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'}) : '';
                         cierreAyerFechaEl.textContent = `Cerrado a las ${hora}`;
                     }
                 } else {
                     cierreAyerTotalEl.textContent = 'Sin cierre';
                     cierreAyerTotalEl.classList.add('text-muted');
                     cierreAyerTotalEl.classList.remove('text-secondary');
                     if (cierreAyerFechaEl) cierreAyerFechaEl.textContent = 'No realizado';
                 }
             }

             if (cierreSemanaTotalEl) {
                 cierreSemanaTotalEl.textContent = formatoMoneda.format(totalSemana);
                 if (cierreSemanaCantidadEl) {
                     cierreSemanaCantidadEl.textContent = `${cantidadSemana} cierre${cantidadSemana !== 1 ? 's' : ''}`;
                 }
             }
         };

         onSnapshot(query(closingsCollection, orderBy('timestamp', 'desc')), renderClosings, e => { console.error("Error closings:", e); if(closingHistoryTableBody) closingHistoryTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error.</td></tr>';});

        // ═══════════════════════════════════════════════════════════════════
        // VISUALIZACIÓN Y GESTIÓN DE MOVIMIENTOS FINANCIEROS
        // ═══════════════════════════════════════════════════════════════════
        const movimientosTableBody = document.getElementById('lista-movimientos-financieros');
        const totalEfectivoEl = document.getElementById('total-efectivo');
        const totalTransferenciasEl = document.getElementById('total-transferencias');
        const totalGastosEl = document.getElementById('total-gastos');
        const balanceTotalEl = document.getElementById('balance-total');
        const filterAllBtn = document.getElementById('filter-all-movements');
        const filterIncomeBtn = document.getElementById('filter-income');
        const filterExpensesBtn = document.getElementById('filter-expenses');

        let allMovements = [];
        let ventasDelDia = { efectivo: 0, transferencia: 0, total: 0 };
        let currentFilter = 'all'; // all, ingreso, gasto

        // ✅ Función centralizada para obtener ventas del día (se llama UNA sola vez)
        const obtenerVentasDelDia = async () => {
            try {
                const hoy = new Date();
                const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
                const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

                console.log('📅 Buscando ventas del:', inicio.toLocaleString('es-CO'), 'al:', fin.toLocaleString('es-CO'));

                // 🔥 QUITAR el where('estado', '!=', 'Anulada') porque causa problemas con Firebase
                const qVentas = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<=', Timestamp.fromDate(fin)),
                    orderBy('timestamp', 'desc')
                );
                const ventasSnap = await getDocs(qVentas);

                console.log(`📦 Ventas encontradas: ${ventasSnap.size}`);

                let ventasEfectivo = 0;
                let ventasTransferencia = 0;

                ventasSnap.forEach(doc => {
                    const venta = doc.data();
                    const estado = venta.estado || 'Completada';

                    // ✅ Filtrar manualmente las ventas anuladas
                    if (estado === 'Anulada' || estado === 'Cancelada') {
                        console.log(`  ⏭️ Venta ${doc.id} - OMITIDA (${estado})`);
                        return;
                    }

                    const efectivo = venta.pagoEfectivo || 0;
                    const transferencia = venta.pagoTransferencia || 0;
                    const tipoEntrega = venta.tipoEntrega || 'tienda';

                    // 🔥 IMPORTANTE: No sumar efectivo de domicilios (aún no lo tienes)
                    // Solo se sumará cuando liquides al repartidor
                    if (tipoEntrega === 'domicilio' && efectivo > 0) {
                        console.log(`  ⏭️ Venta ${doc.id} - Domicilio $${efectivo} NO sumado (pendiente liquidación)`);
                        // Solo sumar la transferencia de domicilios (esa ya la tienes)
                        ventasTransferencia += transferencia;
                    } else {
                        // Ventas en tienda: sumar todo normalmente
                        console.log(`  💰 Venta ID: ${doc.id} - Efectivo: $${efectivo}, Transferencia: $${transferencia}`);
                        ventasEfectivo += efectivo;
                        ventasTransferencia += transferencia;
                    }
                });

                // 💰 SUMAR ABONOS DEL DÍA desde la colección 'abonos'
                console.log('💰 Buscando abonos del día en colección abonos...');

                let abonosEfectivo = 0;
                let abonosTransferencia = 0;

                const qAbonos = query(
                    collection(db, 'abonos'),
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<=', Timestamp.fromDate(fin))
                );
                const abonosSnap = await getDocs(qAbonos);

                abonosSnap.forEach(doc => {
                    const abono = doc.data();
                    const montoAbono = abono.monto || 0;
                    const metodoPago = abono.metodoPago || 'Efectivo';

                    if (metodoPago === 'Efectivo') {
                        abonosEfectivo += montoAbono;
                    } else if (metodoPago === 'Transferencia') {
                        abonosTransferencia += montoAbono;
                    }

                    console.log(`  💵 Abono ${doc.id}: ${metodoPago} $${montoAbono}`);
                });

                console.log(`✅ Abonos del día desde colección: Efectivo=$${abonosEfectivo}, Transferencia=$${abonosTransferencia}`);

                ventasDelDia = {
                    efectivo: ventasEfectivo + abonosEfectivo,
                    transferencia: ventasTransferencia + abonosTransferencia,
                    total: ventasEfectivo + ventasTransferencia + abonosEfectivo + abonosTransferencia
                };

                console.log('✅ Ventas del día calculadas (incluyendo abonos):', ventasDelDia);
                return ventasDelDia;
            } catch (err) {
                console.error('❌ Error calculando ventas del día:', err);
                return { efectivo: 0, transferencia: 0, total: 0 };
            }
        };

        // Función para renderizar movimientos (NO hace query, usa ventasDelDia)
        const renderMovements = () => {
            if (!movimientosTableBody) {
                console.warn('⚠️ Elemento movimientosTableBody no encontrado');
                return;
            }

            console.log('🔄 Renderizando movimientos financieros...')

            const filteredMovements = currentFilter === 'all'
                ? allMovements
                : allMovements.filter(m => m.data.tipo === currentFilter);

            movimientosTableBody.innerHTML = '';

            // Agregar fila de ventas del día al inicio (solo si hay ventas o si el filtro es 'all' o 'ingreso')
            if ((currentFilter === 'all' || currentFilter === 'ingreso') && ventasDelDia.total > 0) {
                const trVentas = document.createElement('tr');
                trVentas.className = 'table-info';
                trVentas.innerHTML = `
                    <td><strong>Hoy</strong></td>
                    <td><span class="badge bg-info">Ventas del Día</span></td>
                    <td>
                        Efectivo: ${formatoMoneda.format(ventasDelDia.efectivo)}<br>
                        <small class="text-muted">Transferencia: ${formatoMoneda.format(ventasDelDia.transferencia)}</small>
                    </td>
                    <td class="fw-bold text-info">${formatoMoneda.format(ventasDelDia.total)}</td>
                    <td><small class="text-muted">Automático</small></td>
                `;
                movimientosTableBody.appendChild(trVentas);
            }

            // Agregar movimientos manuales
            if (filteredMovements.length === 0 && ventasDelDia.total === 0) {
                movimientosTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay movimientos registrados</td></tr>';
                return;
            }

            filteredMovements.forEach(movement => {
                const { id, data } = movement;
                const fecha = data.timestamp?.toDate
                    ? data.timestamp.toDate().toLocaleString('es-CO', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'N/A';

                const isIncome = data.tipo === 'ingreso';
                const badgeClass = isIncome ? 'bg-success' : 'bg-danger';

                // Para ingresos, mostrar método de pago
                let badgeText = 'Gasto';
                if (isIncome) {
                    const metodoPago = data.metodoPago || 'efectivo';
                    badgeText = metodoPago === 'transferencia' ? '💳 Transferencia' : '💵 Efectivo';
                }

                const amountClass = isIncome ? 'text-success' : 'text-danger';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${fecha}</td>
                    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                    <td>${data.descripcion || '-'}</td>
                    <td class="fw-bold ${amountClass}">${formatoMoneda.format(data.monto || 0)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteMovement('${id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                `;
                movimientosTableBody.appendChild(tr);
            });
        };

        // Función para calcular totales (NO hace query, usa ventasDelDia ya calculado)
        const calculateTotals = () => {
            console.log('💵 Calculando totales de finanzas...');

            let totalEfectivo = 0;
            let totalTransferencias = 0;
            let totalGastos = 0;

            // Sumar movimientos manuales (ingresos/gastos)
            allMovements.forEach(movement => {
                const monto = movement.data.monto || 0;
                if (movement.data.tipo === 'ingreso') {
                    const metodoPago = movement.data.metodoPago || 'efectivo'; // Default efectivo para registros antiguos
                    if (metodoPago === 'transferencia') {
                        totalTransferencias += monto;
                        console.log(`  ➕ Ingreso manual (transferencia): $${monto}`);
                    } else {
                        totalEfectivo += monto;
                        console.log(`  ➕ Ingreso manual (efectivo): $${monto}`);
                    }
                } else if (movement.data.tipo === 'gasto') {
                    totalGastos += monto;
                    console.log(`  ➖ Gasto: $${monto}`);
                }
            });

            console.log(`📊 Movimientos manuales - Efectivo: $${totalEfectivo}, Transferencias: $${totalTransferencias}, Gastos: $${totalGastos}`);

            // ✅ Agregar ventas del día (efectivo y transferencias separados)
            totalEfectivo += ventasDelDia.efectivo;
            totalTransferencias += ventasDelDia.transferencia;

            const totalIngresos = totalEfectivo + totalTransferencias;
            const balance = totalIngresos - totalGastos;

            console.log(`💼 Balance final:`);
            console.log(`   Efectivo: $${totalEfectivo}`);
            console.log(`   Transferencias: $${totalTransferencias}`);
            console.log(`   Total Ingresos: $${totalIngresos}`);
            console.log(`   Gastos: $${totalGastos}`);
            console.log(`   Balance: $${balance}`);

            // Actualizar UI
            if (totalEfectivoEl) {
                totalEfectivoEl.textContent = formatoMoneda.format(totalEfectivo);
                console.log('✅ Total Efectivo actualizado en UI');
            }
            if (totalTransferenciasEl) {
                totalTransferenciasEl.textContent = formatoMoneda.format(totalTransferencias);
                console.log('✅ Total Transferencias actualizado en UI');
            }
            if (totalGastosEl) {
                totalGastosEl.textContent = formatoMoneda.format(totalGastos);
                console.log('✅ Total Gastos actualizado en UI');
            }
            if (balanceTotalEl) {
                balanceTotalEl.textContent = formatoMoneda.format(balance);
                balanceTotalEl.className = `mb-0 ${balance >= 0 ? 'text-success' : 'text-danger'}`;
                console.log('✅ Balance actualizado en UI');
            }
        };

        // ✅ Función para actualizar TODO
        const actualizarFinanzasCompletas = async () => {
            console.log('🔄 Actualizando finanzas completas...');
            await obtenerVentasDelDia();
            renderMovements();
            calculateTotals();
        };

        // Escuchar cambios en movimientos financieros (ingresos/gastos manuales)
        console.log('🎧 Iniciando listener de movimientos financieros...');
        onSnapshot(
            query(financesCollection, orderBy('timestamp', 'desc')),
            async (snapshot) => {
                console.log(`📥 Recibidos ${snapshot.docs.length} movimientos financieros`);
                allMovements = snapshot.docs.map(doc => ({
                    id: doc.id,
                    data: doc.data()
                }));
                await actualizarFinanzasCompletas();
            },
            (error) => {
                console.error('❌ Error loading movements:', error);
                if (movimientosTableBody) {
                    movimientosTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar movimientos</td></tr>';
                }
            }
        );

        // 🔥 CRÍTICO: Escuchar cambios en VENTAS también
        console.log('🎧 Iniciando listener de VENTAS para finanzas...');
        const hoy = new Date();
        const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
        onSnapshot(
            query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(inicioHoy)),
                orderBy('timestamp', 'desc')
            ),
            async (snapshot) => {
                console.log(`🛍️ Cambio detectado en ventas: ${snapshot.docs.length} ventas del día`);
                await actualizarFinanzasCompletas();
            },
            (error) => {
                console.error('❌ Error loading sales:', error);
            }
        );

        // Filtros
        if (filterAllBtn) {
            filterAllBtn.addEventListener('click', () => {
                currentFilter = 'all';
                filterAllBtn.classList.add('active');
                filterIncomeBtn.classList.remove('active');
                filterExpensesBtn.classList.remove('active');
                renderMovements();
            });
        }

        if (filterIncomeBtn) {
            filterIncomeBtn.addEventListener('click', () => {
                currentFilter = 'ingreso';
                filterIncomeBtn.classList.add('active');
                filterAllBtn.classList.remove('active');
                filterExpensesBtn.classList.remove('active');
                renderMovements();
            });
        }

        if (filterExpensesBtn) {
            filterExpensesBtn.addEventListener('click', () => {
                currentFilter = 'gasto';
                filterExpensesBtn.classList.add('active');
                filterAllBtn.classList.remove('active');
                filterIncomeBtn.classList.remove('active');
                renderMovements();
            });
        }

        // 🔍 FUNCIÓN DE DIAGNÓSTICO
        const btnDiagnostico = document.getElementById('btn-diagnostico-ventas');
        const diagnosticoArea = document.getElementById('diagnostico-area');
        const diagnosticoResultado = document.getElementById('diagnostico-resultado');

        if (btnDiagnostico) {
            btnDiagnostico.addEventListener('click', async () => {
                diagnosticoArea.classList.remove('d-none');
                diagnosticoResultado.textContent = '⏳ Analizando base de datos...';

                try {
                    const hoy = new Date();
                    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
                    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

                    // Consultar TODAS las ventas (sin filtro de estado)
                    const qTodasVentas = query(
                        salesCollection,
                        where('timestamp', '>=', Timestamp.fromDate(inicio)),
                        where('timestamp', '<=', Timestamp.fromDate(fin)),
                        orderBy('timestamp', 'desc')
                    );
                    const todasVentasSnap = await getDocs(qTodasVentas);

                    let resultado = `📅 FECHA: ${hoy.toLocaleDateString('es-CO')} ${hoy.toLocaleTimeString('es-CO')}\n`;
                    resultado += `📦 TOTAL VENTAS HOY: ${todasVentasSnap.size}\n`;
                    resultado += `\n${'='.repeat(60)}\n\n`;

                    if (todasVentasSnap.size === 0) {
                        resultado += '❌ NO HAY VENTAS HOY\n\n';
                        resultado += 'POSIBLES CAUSAS:\n';
                        resultado += '  1. No se han registrado ventas hoy\n';
                        resultado += '  2. Las ventas tienen una fecha diferente\n';
                        resultado += '  3. Problema con el campo timestamp\n';
                    } else {
                        let totalEfectivo = 0;
                        let totalTransferencia = 0;
                        let ventasConProblemas = [];

                        todasVentasSnap.forEach((doc, index) => {
                            const venta = doc.data();
                            const efectivo = venta.pagoEfectivo || 0;
                            const transferencia = venta.pagoTransferencia || 0;
                            const estado = venta.estado || 'N/A';
                            const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleString('es-CO') : 'SIN FECHA';

                            resultado += `\n🧾 VENTA #${index + 1} (ID: ${doc.id})\n`;
                            resultado += `   Estado: ${estado}\n`;
                            resultado += `   Fecha: ${fecha}\n`;
                            resultado += `   Cliente: ${venta.clienteNombre || 'N/A'}\n`;
                            resultado += `   Total Venta: $${venta.totalVenta || 0}\n`;
                            resultado += `   💵 Pago Efectivo: $${efectivo}\n`;
                            resultado += `   💳 Pago Transferencia: $${transferencia}\n`;
                            resultado += `   Tipo Venta: ${venta.tipoVenta || 'N/A'}\n`;

                            // Verificar problemas
                            if (efectivo === 0 && transferencia === 0 && venta.totalVenta > 0) {
                                ventasConProblemas.push(`Venta ${doc.id}: NO tiene pago registrado pero total > 0`);
                            }
                            if (!venta.timestamp) {
                                ventasConProblemas.push(`Venta ${doc.id}: NO tiene timestamp`);
                            }

                            if (estado !== 'Anulada' && estado !== 'Cancelada') {
                                totalEfectivo += efectivo;
                                totalTransferencia += transferencia;
                            }
                        });

                        resultado += `\n${'='.repeat(60)}\n`;
                        resultado += `\n💰 RESUMEN:\n`;
                        resultado += `   Total Efectivo: $${totalEfectivo.toLocaleString('es-CO')}\n`;
                        resultado += `   Total Transferencia: $${totalTransferencia.toLocaleString('es-CO')}\n`;
                        resultado += `   TOTAL: $${(totalEfectivo + totalTransferencia).toLocaleString('es-CO')}\n`;
                        resultado += `\n📊 ESTADO ACTUAL ventasDelDia:\n`;
                        resultado += `   efectivo: $${ventasDelDia.efectivo.toLocaleString('es-CO')}\n`;
                        resultado += `   transferencia: $${ventasDelDia.transferencia.toLocaleString('es-CO')}\n`;
                        resultado += `   total: $${ventasDelDia.total.toLocaleString('es-CO')}\n`;

                        if (ventasConProblemas.length > 0) {
                            resultado += `\n⚠️ PROBLEMAS DETECTADOS:\n`;
                            ventasConProblemas.forEach(p => resultado += `   - ${p}\n`);
                        } else {
                            resultado += `\n✅ NO SE DETECTARON PROBLEMAS\n`;
                        }
                    }

                    diagnosticoResultado.textContent = resultado;
                } catch (error) {
                    diagnosticoResultado.textContent = `❌ ERROR EN DIAGNÓSTICO:\n${error.message}\n\nStack:\n${error.stack}`;
                }
            });
        }

        // Función global para eliminar movimiento
        window.deleteMovement = async (movementId) => {
            if (!confirm('¿Estás seguro de eliminar este movimiento? Esta acción no se puede deshacer.')) {
                return;
            }

            try {
                await deleteDoc(doc(db, 'movimientosFinancieros', movementId));
                showToast('Movimiento eliminado correctamente', 'success');
            } catch (error) {
                console.error('Error deleting movement:', error);
                showToast(`Error al eliminar: ${error.message}`, 'error');
            }
        };

    })();

    // ========================================================================
    // --- SCRIPTS DE UI (Toggles, Domicilio) ---
    // ========================================================================
    (() => {
        const fV_prod = document.getElementById('form-view'); const iV_prod = document.getElementById('inventory-view'); const tIB_prod = document.getElementById('toggle-inventory-view-btn'); const tFB_prod = document.getElementById('toggle-form-view-btn'); if(fV_prod && iV_prod && tIB_prod && tFB_prod){ tIB_prod.addEventListener('click',(e)=>{ e.preventDefault(); fV_prod.style.display='none'; iV_prod.style.display='block'; tIB_prod.classList.add('active'); tFB_prod.classList.remove('active');}); tFB_prod.addEventListener('click',(e)=>{ e.preventDefault(); iV_prod.style.display='none'; fV_prod.style.display='block'; tFB_prod.classList.add('active'); tIB_prod.classList.remove('active'); window.clearProductForm(); }); iV_prod.style.display='block'; tIB_prod.classList.add('active'); } else { console.warn("Product view toggle missing."); }
        const sFV = document.getElementById('sales-form-view'); const sLV = document.getElementById('sales-list-view'); const tSLB = document.getElementById('toggle-sales-list-view-btn'); const tSFB = document.getElementById('toggle-sales-form-view-btn'); if(sFV && sLV && tSLB && tSFB){ tSLB.addEventListener('click',(e)=>{ e.preventDefault(); sFV.style.display='none'; sLV.style.display='block'; tSLB.classList.add('active'); tSFB.classList.remove('active'); }); tSFB.addEventListener('click',(e)=>{ e.preventDefault(); sLV.style.display='none'; sFV.style.display='block'; tSFB.classList.add('active'); tSLB.classList.remove('active'); }); sFV.style.display='block'; tSFB.classList.add('active'); } else { console.warn("Sales view toggle missing."); }
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
    // 1️⃣ VENTAS DEL DÍA
    // ================================================================
    function calcularVentasHoy() {
        console.log("📊 Calculando ventas del día...");
        
        try {
            // Obtener rango de hoy (00:00 a 23:59)
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            
            const manana = new Date(hoy);
            manana.setDate(manana.getDate() + 1);
            
            // ⚠️ IMPORTANTE: Solo filtrar por UN campo con desigualdad
            // NO podemos filtrar por timestamp Y estado al mismo tiempo
            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(hoy)),
                where('timestamp', '<', Timestamp.fromDate(manana)),
                orderBy('timestamp', 'desc')
            );
            
            // Escuchar cambios en tiempo real
            onSnapshot(q,
                async (snapshot) => {
                    let totalDineroRecibido = 0;
                    let ventasContadas = 0;

                    snapshot.forEach(doc => {
                        const venta = doc.data();
                        const estado = venta.estado || '';

                        // ✅ Filtrar el estado AQUÍ en el cliente
                        if (estado !== 'Anulada' && estado !== 'Cancelada') {
                            // Sumar solo el dinero recibido (efectivo + transferencia)
                            // NO el total de la venta
                            const efectivo = venta.pagoEfectivo || 0;
                            const transferencia = venta.pagoTransferencia || 0;
                            totalDineroRecibido += efectivo + transferencia;
                            ventasContadas++;
                        }
                    });

                    // 💰 SUMAR ABONOS DEL DÍA desde la colección 'abonos'
                    try {
                        const qAbonos = query(
                            collection(db, 'abonos'),
                            where('timestamp', '>=', Timestamp.fromDate(hoy)),
                            where('timestamp', '<', Timestamp.fromDate(manana))
                        );
                        const abonosSnap = await getDocs(qAbonos);

                        abonosSnap.forEach(doc => {
                            const abono = doc.data();
                            totalDineroRecibido += (abono.monto || 0);
                        });

                        console.log(`✅ Abonos del día sumados: ${abonosSnap.size} abonos`);
                    } catch (err) {
                        console.error('Error sumando abonos del día:', err);
                    }

                    // Actualizar UI
                    dbVentasHoyEl.textContent = formatoMoneda.format(totalDineroRecibido);
                    dbVentasHoyEl.classList.add('text-success');

                    // Actualizar contador de ventas
                    const dbVentasCountEl = document.getElementById('db-ventas-count');
                    if (dbVentasCountEl) {
                        dbVentasCountEl.textContent = `${ventasContadas} ${ventasContadas === 1 ? 'venta' : 'ventas'}`;
                    }

                    console.log(`✅ Ventas hoy (dinero recibido): ${formatoMoneda.format(totalDineroRecibido)} (${ventasContadas} ventas)`);
                },
                (error) => {
                    console.error("❌ Error al calcular ventas del día:", error);
                    dbVentasHoyEl.textContent = "Error";
                    dbVentasHoyEl.classList.add('text-danger');
                }
            );
            
        } catch (error) {
            console.error("❌ Error fatal al configurar ventas del día:", error);
            dbVentasHoyEl.textContent = "Error";
            dbVentasHoyEl.classList.add('text-danger');
        }
    }
    
    // ================================================================
    // 2️⃣ PRODUCTOS CON BAJO STOCK
    // ================================================================
    window.productosBajoStock = []; // Variable global para el modal

    function calcularBajoStock() {
        console.log("📦 Calculando productos con bajo stock...");

        try {
            const STOCK_MINIMO = 2; // Productos con 2 prendas o menos

            // Query simple: solo productos visibles
            const q = query(
                productsCollection,
                where('visible', '==', true)
            );

            // Escuchar cambios en tiempo real
            onSnapshot(q,
                (snapshot) => {
                    window.productosBajoStock = []; // Limpiar lista

                    snapshot.forEach(doc => {
                        const producto = doc.data();
                        const productoId = doc.id;
                        const variaciones = producto.variaciones || [];

                        // Calcular stock TOTAL del producto (suma de todas las variaciones)
                        const stockTotal = variaciones.reduce((total, variacion) => {
                            return total + (parseInt(variacion.stock, 10) || 0);
                        }, 0);

                        // Si el stock TOTAL del producto es <= 2
                        if (stockTotal > 0 && stockTotal <= STOCK_MINIMO) {
                            // Guardar el producto UNA VEZ con todas sus variaciones
                            window.productosBajoStock.push({
                                id: productoId,
                                nombre: producto.nombre,
                                stockTotal: stockTotal,
                                variaciones: variaciones.map(v => ({
                                    talla: v.talla || 'N/A',
                                    color: v.color || 'N/A',
                                    stock: parseInt(v.stock, 10) || 0
                                })),
                                categoriaId: producto.categoriaId
                            });
                        }
                    });

                    // Actualizar UI - muestra cantidad de PRODUCTOS únicos
                    const count = window.productosBajoStock.length;
                    dbBajoStockEl.textContent = count;
                    dbBajoStockEl.classList.remove('text-warning', 'text-success');

                    if (count > 0) {
                        dbBajoStockEl.classList.add('text-warning');
                    } else {
                        dbBajoStockEl.classList.add('text-success');
                    }

                    console.log(`✅ Productos con bajo stock: ${count}`);
                },
                (error) => {
                    console.error("❌ Error al calcular bajo stock:", error);
                    dbBajoStockEl.textContent = "Error";
                    dbBajoStockEl.classList.add('text-danger');
                }
            );

        } catch (error) {
            console.error("❌ Error fatal al configurar bajo stock:", error);
            dbBajoStockEl.textContent = "Error";
            dbBajoStockEl.classList.add('text-danger');
        }
    }
    
    // ================================================================
    // 3️⃣ APARTADOS ACTIVOS
    // ================================================================
    function calcularApartadosVencer() {
        console.log("📅 Calculando apartados activos...");

        try {
            // Query simplificada - filtrar en memoria
            onSnapshot(apartadosCollection,
                (snapshot) => {
                    let countActivos = 0;
                    let saldoTotal = 0;

                    snapshot.forEach(doc => {
                        const apartado = doc.data();

                        // Contar TODOS los apartados pendientes (no solo los que vencen pronto)
                        if (apartado.estado === 'Pendiente') {
                            countActivos++;
                            saldoTotal += apartado.saldo || 0;
                        }
                    });

                    // Actualizar UI
                    dbApartadosVencerEl.textContent = countActivos;
                    dbApartadosVencerEl.classList.remove('text-danger', 'text-success');

                    // Actualizar saldo total
                    const saldoEl = document.getElementById('db-apartados-total-saldo');
                    if (saldoEl) {
                        saldoEl.textContent = formatoMoneda.format(saldoTotal) + ' pendiente';
                    }

                    if (countActivos > 0) {
                        dbApartadosVencerEl.classList.add('text-warning');
                    } else {
                        dbApartadosVencerEl.classList.add('text-success');
                    }

                    console.log(`✅ Apartados activos: ${countActivos}`);
                },
                (error) => {
                    console.error("❌ Error al calcular apartados activos:", error);
                    dbApartadosVencerEl.textContent = "Error";
                    dbApartadosVencerEl.classList.add('text-danger');
                }
            );

        } catch (error) {
            console.error("❌ Error fatal al configurar apartados:", error);
            dbApartadosVencerEl.textContent = "Error";
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
                    .map(v => `<span class="badge bg-secondary me-1">${v.talla}/${v.color}: ${v.stock}</span>`)
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
    // 4️⃣ PRODUCTOS TOTALES Y DISPONIBLES
    // ================================================================
    function calcularProductosTotales() {
        console.log("📦 Calculando productos totales...");

        try {
            onSnapshot(productsCollection, (snapshot) => {
                const totalProductos = snapshot.size;
                let productosDisponibles = 0;

                snapshot.forEach(doc => {
                    const producto = doc.data();
                    if (producto.visible) {
                        productosDisponibles++;
                    }
                });

                const dbTotalProductosEl = document.getElementById('db-total-productos');
                const dbProductosDisponiblesEl = document.getElementById('db-productos-disponibles');

                if (dbTotalProductosEl) {
                    dbTotalProductosEl.textContent = totalProductos;
                }

                if (dbProductosDisponiblesEl) {
                    dbProductosDisponiblesEl.textContent = `${productosDisponibles} disponibles`;
                }

                console.log(`✅ Productos totales: ${totalProductos}, Disponibles: ${productosDisponibles}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular productos:", error);
        }
    }

    // ================================================================
    // 5️⃣ PEDIDOS WEB PENDIENTES
    // ================================================================
    function calcularPedidosWeb() {
        console.log("🌐 Calculando pedidos web...");

        try {
            const q = query(webOrdersCollection, where('estado', '==', 'pendiente'));

            onSnapshot(q, (snapshot) => {
                const pedidosPendientes = snapshot.size;

                const dbPedidosWebEl = document.getElementById('db-pedidos-web');
                if (dbPedidosWebEl) {
                    dbPedidosWebEl.textContent = pedidosPendientes;
                }

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
            onSnapshot(clientsCollection, (snapshot) => {
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
            onSnapshot(productsCollection, (snapshot) => {
                let promocionesActivas = 0;

                snapshot.forEach(doc => {
                    const producto = doc.data();
                    if (producto.promocion && producto.promocion.activa) {
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
            onSnapshot(repartidoresCollection, (snapshot) => {
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
    // 9️⃣ MÉTRICAS FINANCIERAS DEL MES
    // ================================================================
    function calcularMetricasFinancierasMes() {
        console.log("💰 Calculando métricas financieras del mes...");

        try {
            // Obtener primer y último día del mes actual
            const hoy = new Date();
            const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

            // Obtener primer y último día del mes anterior
            const primerDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            const ultimoDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);

            // Query para el mes actual
            const qMesActual = query(
                collection(db, 'finanzas'),
                where('fecha', '>=', Timestamp.fromDate(primerDiaMes)),
                where('fecha', '<=', Timestamp.fromDate(ultimoDiaMes))
            );

            // Query para el mes anterior
            const qMesAnterior = query(
                collection(db, 'finanzas'),
                where('fecha', '>=', Timestamp.fromDate(primerDiaMesAnterior)),
                where('fecha', '<=', Timestamp.fromDate(ultimoDiaMesAnterior))
            );

            // Escuchar mes actual
            onSnapshot(qMesActual, async (snapshotActual) => {
                let ingresosMesActual = 0;
                let gastosMesActual = 0;
                let efectivoMes = 0;
                let transferenciaMes = 0;

                snapshotActual.forEach(doc => {
                    const registro = doc.data();
                    const monto = registro.monto || 0;
                    const tipo = registro.tipo || '';
                    const metodo = (registro.metodo || registro.metodoPago || '').toLowerCase();

                    if (tipo === 'ingreso') {
                        ingresosMesActual += monto;

                        // Desglose por método de pago
                        if (metodo.includes('efectivo')) {
                            efectivoMes += monto;
                        } else if (metodo.includes('transferencia') || metodo.includes('bancaria')) {
                            transferenciaMes += monto;
                        }
                    } else if (tipo === 'gasto') {
                        gastosMesActual += monto;
                    }
                });

                const utilidadNeta = ingresosMesActual - gastosMesActual;

                // Obtener datos del mes anterior
                const snapshotAnterior = await getDocs(qMesAnterior);
                let ingresosMesAnterior = 0;
                let gastosMesAnterior = 0;

                snapshotAnterior.forEach(doc => {
                    const registro = doc.data();
                    const monto = registro.monto || 0;
                    const tipo = registro.tipo || '';

                    if (tipo === 'ingreso') {
                        ingresosMesAnterior += monto;
                    } else if (tipo === 'gasto') {
                        gastosMesAnterior += monto;
                    }
                });

                const utilidadMesAnterior = ingresosMesAnterior - gastosMesAnterior;

                // Calcular porcentajes de crecimiento
                const crecimientoIngresos = ingresosMesAnterior > 0
                    ? ((ingresosMesActual - ingresosMesAnterior) / ingresosMesAnterior) * 100
                    : 0;
                const crecimientoGastos = gastosMesAnterior > 0
                    ? ((gastosMesActual - gastosMesAnterior) / gastosMesAnterior) * 100
                    : 0;
                const crecimientoUtilidad = utilidadMesAnterior > 0
                    ? ((utilidadNeta - utilidadMesAnterior) / utilidadMesAnterior) * 100
                    : 0;

                // Actualizar UI - Ingresos
                const dbIngresosMesEl = document.getElementById('db-ingresos-mes');
                if (dbIngresosMesEl) {
                    dbIngresosMesEl.textContent = formatoMoneda.format(ingresosMesActual);
                }

                const dbIngresosComparativaEl = document.getElementById('db-ingresos-comparativa');
                if (dbIngresosComparativaEl) {
                    const iconoIngresos = crecimientoIngresos >= 0 ? 'bi-arrow-up' : 'bi-arrow-down';
                    const colorIngresos = crecimientoIngresos >= 0 ? 'text-success' : 'text-danger';
                    dbIngresosComparativaEl.innerHTML = `
                        <i class="bi ${iconoIngresos} ${colorIngresos}"></i>
                        ${Math.abs(crecimientoIngresos).toFixed(1)}% vs mes anterior
                    `;
                }

                // Actualizar UI - Gastos
                const dbGastosMesEl = document.getElementById('db-gastos-mes');
                if (dbGastosMesEl) {
                    dbGastosMesEl.textContent = formatoMoneda.format(gastosMesActual);
                }

                const dbGastosComparativaEl = document.getElementById('db-gastos-comparativa');
                if (dbGastosComparativaEl) {
                    const iconoGastos = crecimientoGastos >= 0 ? 'bi-arrow-up' : 'bi-arrow-down';
                    const colorGastos = crecimientoGastos >= 0 ? 'text-danger' : 'text-success';
                    dbGastosComparativaEl.innerHTML = `
                        <i class="bi ${iconoGastos} ${colorGastos}"></i>
                        ${Math.abs(crecimientoGastos).toFixed(1)}% vs mes anterior
                    `;
                }

                // Actualizar UI - Utilidad Neta
                const dbUtilidadNetaEl = document.getElementById('db-utilidad-neta');
                if (dbUtilidadNetaEl) {
                    dbUtilidadNetaEl.textContent = formatoMoneda.format(utilidadNeta);
                    dbUtilidadNetaEl.className = utilidadNeta >= 0
                        ? 'mb-1 fw-bold text-success'
                        : 'mb-1 fw-bold text-danger';
                }

                const dbUtilidadComparativaEl = document.getElementById('db-utilidad-comparativa');
                if (dbUtilidadComparativaEl) {
                    const iconoUtilidad = crecimientoUtilidad >= 0 ? 'bi-arrow-up' : 'bi-arrow-down';
                    const colorUtilidad = crecimientoUtilidad >= 0 ? 'text-success' : 'text-danger';
                    dbUtilidadComparativaEl.innerHTML = `
                        <i class="bi ${iconoUtilidad} ${colorUtilidad}"></i>
                        ${Math.abs(crecimientoUtilidad).toFixed(1)}% vs mes anterior
                    `;
                }

                // Actualizar UI - Crecimiento General
                const dbCrecimientoPorcentajeEl = document.getElementById('db-crecimiento-porcentaje');
                if (dbCrecimientoPorcentajeEl) {
                    dbCrecimientoPorcentajeEl.textContent = `${crecimientoIngresos >= 0 ? '+' : ''}${crecimientoIngresos.toFixed(1)}%`;
                    dbCrecimientoPorcentajeEl.className = crecimientoIngresos >= 0
                        ? 'mb-1 fw-bold text-success'
                        : 'mb-1 fw-bold text-danger';
                }

                // Actualizar UI - Método de Pago: Efectivo
                const totalIngresos = ingresosMesActual;
                const porcentajeEfectivo = totalIngresos > 0 ? (efectivoMes / totalIngresos) * 100 : 0;
                const porcentajeTransferencia = totalIngresos > 0 ? (transferenciaMes / totalIngresos) * 100 : 0;

                const dbEfectivoMesEl = document.getElementById('db-efectivo-mes');
                if (dbEfectivoMesEl) {
                    dbEfectivoMesEl.textContent = formatoMoneda.format(efectivoMes);
                }

                const dbEfectivoPorcentajeEl = document.getElementById('db-efectivo-porcentaje');
                if (dbEfectivoPorcentajeEl) {
                    dbEfectivoPorcentajeEl.textContent = `${porcentajeEfectivo.toFixed(0)}%`;
                }

                // Actualizar UI - Método de Pago: Transferencia
                const dbTransferenciaMesEl = document.getElementById('db-transferencia-mes');
                if (dbTransferenciaMesEl) {
                    dbTransferenciaMesEl.textContent = formatoMoneda.format(transferenciaMes);
                }

                const dbTransferenciaPorcentajeEl = document.getElementById('db-transferencia-porcentaje');
                if (dbTransferenciaPorcentajeEl) {
                    dbTransferenciaPorcentajeEl.textContent = `${porcentajeTransferencia.toFixed(0)}%`;
                }

                console.log(`✅ Métricas financieras calculadas:
                    - Ingresos: ${formatoMoneda.format(ingresosMesActual)} (${crecimientoIngresos.toFixed(1)}%)
                    - Gastos: ${formatoMoneda.format(gastosMesActual)} (${crecimientoGastos.toFixed(1)}%)
                    - Utilidad: ${formatoMoneda.format(utilidadNeta)} (${crecimientoUtilidad.toFixed(1)}%)
                    - Efectivo: ${formatoMoneda.format(efectivoMes)} (${porcentajeEfectivo.toFixed(0)}%)
                    - Transferencia: ${formatoMoneda.format(transferenciaMes)} (${porcentajeTransferencia.toFixed(0)}%)`);
            });

        } catch (error) {
            console.error("❌ Error al calcular métricas financieras:", error);
        }
    }

    // ================================================================
    // 🔟 INVERSIÓN Y UTILIDAD EN INVENTARIO
    // ================================================================
    function calcularInversionInventario() {
        console.log("💎 Calculando inversión y utilidad en inventario...");

        try {
            onSnapshot(productsCollection, (snapshot) => {
                let inversionTotal = 0;
                let valorPotencialDetal = 0;
                let valorPotencialMayor = 0;
                let totalUnidades = 0;

                snapshot.forEach(doc => {
                    const producto = doc.data();
                    const costoCompra = parseFloat(producto.costoCompra) || 0;
                    const precioDetal = parseFloat(producto.precioDetal) || 0;
                    const precioMayor = parseFloat(producto.precioMayor) || 0;

                    // Calcular stock total del producto
                    const variaciones = producto.variaciones || [];
                    const stockTotal = variaciones.reduce((sum, v) => {
                        return sum + (parseInt(v.stock, 10) || 0);
                    }, 0);

                    // Calcular inversión y valores potenciales
                    inversionTotal += costoCompra * stockTotal;
                    valorPotencialDetal += precioDetal * stockTotal;
                    valorPotencialMayor += precioMayor * stockTotal;
                    totalUnidades += stockTotal;
                });

                // Calcular utilidad potencial (usando precio detal)
                const utilidadPotencial = valorPotencialDetal - inversionTotal;
                const margenUtilidad = inversionTotal > 0
                    ? ((utilidadPotencial / inversionTotal) * 100)
                    : 0;

                // Actualizar UI - Inversión Total
                const dbInversionEl = document.getElementById('db-inversion-inventario');
                if (dbInversionEl) {
                    dbInversionEl.textContent = formatoMoneda.format(inversionTotal);
                }

                const dbUnidadesEl = document.getElementById('db-inventario-unidades');
                if (dbUnidadesEl) {
                    dbUnidadesEl.textContent = `${totalUnidades} unidades`;
                }

                // Actualizar UI - Utilidad Potencial
                const dbUtilidadPotencialEl = document.getElementById('db-utilidad-potencial');
                if (dbUtilidadPotencialEl) {
                    dbUtilidadPotencialEl.textContent = formatoMoneda.format(utilidadPotencial);
                }

                const dbMargenEl = document.getElementById('db-margen-utilidad');
                if (dbMargenEl) {
                    dbMargenEl.innerHTML = `
                        <i class="bi bi-percent"></i> ${margenUtilidad.toFixed(1)}% de margen
                    `;
                }

                console.log(`✅ Inversión en inventario calculada:
                    - Inversión Total: ${formatoMoneda.format(inversionTotal)}
                    - Valor Potencial Detal: ${formatoMoneda.format(valorPotencialDetal)}
                    - Utilidad Potencial: ${formatoMoneda.format(utilidadPotencial)}
                    - Margen: ${margenUtilidad.toFixed(1)}%
                    - Unidades: ${totalUnidades}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular inversión en inventario:", error);
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
        })).filter(p => p.stock > 0);

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

    // Modificar calcularInversionInventario para almacenar datos globalmente
    const calcularInversionInventarioOriginal = calcularInversionInventario;
    calcularInversionInventario = function() {
        console.log("💎 Calculando inversión y utilidad en inventario...");

        try {
            onSnapshot(productsCollection, (snapshot) => {
                let inversionTotal = 0;
                let valorPotencialDetal = 0;
                let valorPotencialMayor = 0;
                let totalUnidades = 0;
                let productos = [];

                snapshot.forEach(doc => {
                    const producto = doc.data();
                    const costoCompra = parseFloat(producto.costoCompra) || 0;
                    const precioDetal = parseFloat(producto.precioDetal) || 0;
                    const precioMayor = parseFloat(producto.precioMayor) || 0;

                    // Calcular stock total del producto
                    const variaciones = producto.variaciones || [];
                    const stockTotal = variaciones.reduce((sum, v) => {
                        return sum + (parseInt(v.stock, 10) || 0);
                    }, 0);

                    // Calcular inversión y valores potenciales
                    inversionTotal += costoCompra * stockTotal;
                    valorPotencialDetal += precioDetal * stockTotal;
                    valorPotencialMayor += precioMayor * stockTotal;
                    totalUnidades += stockTotal;

                    // Guardar datos del producto
                    if (stockTotal > 0) {
                        productos.push({
                            nombre: producto.nombre || 'Sin nombre',
                            costoCompra,
                            precioDetal,
                            precioMayor,
                            stock: stockTotal
                        });
                    }
                });

                // Calcular utilidad potencial (usando precio detal)
                const utilidadPotencial = valorPotencialDetal - inversionTotal;
                const margenUtilidad = inversionTotal > 0
                    ? ((utilidadPotencial / inversionTotal) * 100)
                    : 0;

                // Guardar datos globalmente
                datosInventarioGlobal = {
                    inversionTotal,
                    valorPotencialDetal,
                    valorPotencialMayor,
                    utilidadPotencial,
                    margenUtilidad,
                    totalUnidades,
                    totalProductos: snapshot.size,
                    productos
                };

                // Actualizar UI - Inversión Total
                const dbInversionEl = document.getElementById('db-inversion-inventario');
                if (dbInversionEl) {
                    dbInversionEl.textContent = formatoMoneda.format(inversionTotal);
                }

                const dbUnidadesEl = document.getElementById('db-inventario-unidades');
                if (dbUnidadesEl) {
                    dbUnidadesEl.textContent = `${totalUnidades} unidades`;
                }

                // Actualizar UI - Utilidad Potencial
                const dbUtilidadPotencialEl = document.getElementById('db-utilidad-potencial');
                if (dbUtilidadPotencialEl) {
                    dbUtilidadPotencialEl.textContent = formatoMoneda.format(utilidadPotencial);
                }

                const dbMargenEl = document.getElementById('db-margen-utilidad');
                if (dbMargenEl) {
                    dbMargenEl.innerHTML = `
                        <i class="bi bi-percent"></i> ${margenUtilidad.toFixed(1)}% de margen
                    `;
                }

                console.log(`✅ Inversión en inventario calculada:
                    - Inversión Total: ${formatoMoneda.format(inversionTotal)}
                    - Valor Potencial Detal: ${formatoMoneda.format(valorPotencialDetal)}
                    - Utilidad Potencial: ${formatoMoneda.format(utilidadPotencial)}
                    - Margen: ${margenUtilidad.toFixed(1)}%
                    - Unidades: ${totalUnidades}`);
            });
        } catch (error) {
            console.error("❌ Error al calcular inversión en inventario:", error);
        }
    };

    // ================================================================
    // 🚀 INICIALIZAR TODAS LAS FUNCIONES
    // ================================================================
    calcularVentasHoy();
    calcularBajoStock();
    calcularApartadosVencer();
    calcularProductosTotales();
    calcularPedidosWeb();
    calcularTotalClientes();
    calcularPromocionesActivas();
    calcularTotalRepartidores();
    calcularMetricasFinancierasMes(); // Nueva función
    calcularInversionInventario(); // Inversión y utilidad

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

    console.log("✅ Dashboard inicializado correctamente");

})(); // ← Cierre del IIFE del Dashboard

// ========================================================================
// FIN DE LA SECCIÓN DEL DASHBOARD
// ========================================================================

// ========================================================================
// 📊 GRÁFICOS PROFESIONALES CON CHART.JS
// ========================================================================
(() => {
    console.log("📊 Inicializando gráficos del dashboard...");

    // Referencias a los canvas
    const ventasChartCanvas = document.getElementById('ventasChart');
    const topProductosChartCanvas = document.getElementById('topProductosChart');

    // Variables para almacenar las instancias de los gráficos
    let ventasChart = null;
    let topProductosChart = null;

    // ================================================================
    // GRÁFICO 1: TENDENCIA DE VENTAS (BARRAS)
    // ================================================================
    async function crearGraficoVentas(dias = 7) {
        if (!ventasChartCanvas) {
            console.warn("Canvas de ventas no encontrado");
            return;
        }

        try {
            // Destruir gráfico anterior si existe
            if (ventasChart) {
                ventasChart.destroy();
            }

            // Calcular rango de fechas
            const hoy = new Date();
            const fechaInicio = new Date(hoy);
            fechaInicio.setDate(fechaInicio.getDate() - dias + 1);
            fechaInicio.setHours(0, 0, 0, 0);

            // Obtener ventas del período
            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(fechaInicio)),
                orderBy('timestamp', 'asc')
            );

            const snapshot = await getDocs(q);

            // Agrupar ventas por día
            const ventasPorDia = {};
            const labels = [];

            // Inicializar todos los días con 0
            for (let i = 0; i < dias; i++) {
                const fecha = new Date(fechaInicio);
                fecha.setDate(fecha.getDate() + i);
                const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                ventasPorDia[key] = 0;
                labels.push(key);
            }

            // Sumar ventas por día
            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const fecha = venta.timestamp?.toDate();
                    if (fecha) {
                        const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                        if (ventasPorDia.hasOwnProperty(key)) {
                            // ✅ CORRECCIÓN: Sumar solo lo recibido en efectivo/transferencia
                            // para reflejar correctamente el dinero en caja (apartados incluidos)
                            const montoRecibido = (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                            ventasPorDia[key] += montoRecibido;
                        }
                    }
                }
            });

            const data = labels.map(label => ventasPorDia[label] || 0);

            // Crear gradiente moderno para el gráfico
            const ctx = ventasChartCanvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.9)');
            gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.7)');

            ventasChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ventas ($)',
                        data: data,
                        backgroundColor: gradient,
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 2,
                        borderRadius: 10,
                        borderSkipped: false,
                        hoverBackgroundColor: 'rgba(99, 102, 241, 1)',
                        hoverBorderWidth: 3,
                        hoverBorderColor: 'rgba(79, 70, 229, 1)',
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1000,
                        easing: 'easeInOutQuart'
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(17, 24, 39, 0.95)',
                            padding: 16,
                            titleFont: { size: 14, weight: 'bold' },
                            bodyFont: { size: 13 },
                            borderColor: 'rgba(99, 102, 241, 0.5)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            displayColors: true,
                            boxPadding: 6,
                            callbacks: {
                                label: function(context) {
                                    return 'Ventas: ' + formatoMoneda.format(context.parsed.y);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + (value / 1000).toFixed(0) + 'k';
                                },
                                font: {
                                    size: 12,
                                    weight: '500'
                                },
                                color: '#6B7280'
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.04)',
                                drawBorder: false
                            }
                        },
                        x: {
                            ticks: {
                                font: {
                                    size: 12,
                                    weight: '500'
                                },
                                color: '#6B7280'
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });

            console.log(`✅ Gráfico de ventas creado (${dias} días)`);

        } catch (error) {
            console.error("❌ Error al crear gráfico de ventas:", error);
        }
    }

    // ================================================================
    // GRÁFICO 2: TOP PRODUCTOS (HORIZONTAL)
    // ================================================================
    async function crearGraficoTopProductos() {
        if (!topProductosChartCanvas) {
            console.warn("Canvas de top productos no encontrado");
            return;
        }

        try {
            // Destruir gráfico anterior si existe
            if (topProductosChart) {
                topProductosChart.destroy();
            }

            // Obtener ventas del último mes
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            fechaInicio.setHours(0, 0, 0, 0);

            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(fechaInicio))
            );

            const snapshot = await getDocs(q);

            // Contar productos vendidos
            const productosVendidos = {};

            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const items = venta.items || [];
                    items.forEach(item => {
                        const nombre = item.nombre || 'Sin nombre';
                        if (!productosVendidos[nombre]) {
                            productosVendidos[nombre] = 0;
                        }
                        productosVendidos[nombre] += (item.cantidad || 0);
                    });
                }
            });

            // Ordenar y obtener top 15
            const topProductos = Object.entries(productosVendidos)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15);

            if (topProductos.length === 0) {
                topProductos.push(['Sin datos', 0]);
            }

            const labels = topProductos.map(p => p[0].length > 20 ? p[0].substring(0, 20) + '...' : p[0]);
            const data = topProductos.map(p => p[1]);

            // Generar 15 colores modernos y vibrantes
            const modernColors = [
                'rgba(59, 130, 246, 0.85)',   // Azul moderno
                'rgba(16, 185, 129, 0.85)',   // Verde esmeralda
                'rgba(245, 158, 11, 0.85)',   // Naranja ámbar
                'rgba(239, 68, 68, 0.85)',    // Rojo
                'rgba(139, 92, 246, 0.85)',   // Púrpura
                'rgba(236, 72, 153, 0.85)',   // Rosa
                'rgba(20, 184, 166, 0.85)',   // Turquesa
                'rgba(251, 146, 60, 0.85)',   // Naranja
                'rgba(99, 102, 241, 0.85)',   // Índigo
                'rgba(244, 63, 94, 0.85)',    // Rosa fuerte
                'rgba(34, 197, 94, 0.85)',    // Verde lima
                'rgba(168, 85, 247, 0.85)',   // Violeta
                'rgba(59, 189, 248, 0.85)',   // Cian
                'rgba(234, 179, 8, 0.85)',    // Amarillo
                'rgba(249, 115, 22, 0.85)'    // Naranja oscuro
            ];

            const modernBorderColors = [
                'rgba(59, 130, 246, 1)',
                'rgba(16, 185, 129, 1)',
                'rgba(245, 158, 11, 1)',
                'rgba(239, 68, 68, 1)',
                'rgba(139, 92, 246, 1)',
                'rgba(236, 72, 153, 1)',
                'rgba(20, 184, 166, 1)',
                'rgba(251, 146, 60, 1)',
                'rgba(99, 102, 241, 1)',
                'rgba(244, 63, 94, 1)',
                'rgba(34, 197, 94, 1)',
                'rgba(168, 85, 247, 1)',
                'rgba(59, 189, 248, 1)',
                'rgba(234, 179, 8, 1)',
                'rgba(249, 115, 22, 1)'
            ];

            // Crear el gráfico
            const ctx = topProductosChartCanvas.getContext('2d');
            topProductosChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Unidades',
                        data: data,
                        backgroundColor: modernColors,
                        borderColor: modernBorderColors,
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        y: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });

            console.log("✅ Gráfico de top productos creado");

        } catch (error) {
            console.error("❌ Error al crear gráfico de top productos:", error);
        }
    }

    // ================================================================
    // TABLA: STOCK CRÍTICO
    // ================================================================
    function actualizarTablaStockCritico() {
        const tablaBody = document.getElementById('db-tabla-stock-critico');
        if (!tablaBody) return;

        if (window.productosBajoStock && window.productosBajoStock.length > 0) {
            const top5 = window.productosBajoStock.slice(0, 5);

            tablaBody.innerHTML = '';

            top5.forEach(item => {
                const tr = document.createElement('tr');
                const stockClass = item.stockTotal === 1 ? 'text-danger fw-bold' : 'text-warning fw-bold';

                tr.innerHTML = `
                    <td>
                        <div class="fw-semibold">${item.nombre}</div>
                        <small class="text-muted">${item.variaciones.length} variación(es)</small>
                    </td>
                    <td class="text-center ${stockClass}">${item.stockTotal}</td>
                    <td class="text-end">
                        <a href="#productos" data-bs-toggle="pill" class="btn btn-sm btn-outline-primary">
                            <i class="bi bi-pencil"></i>
                        </a>
                    </td>
                `;

                tablaBody.appendChild(tr);
            });
        } else {
            tablaBody.innerHTML = '<tr><td colspan="3" class="text-center text-success py-3">✓ Stock saludable</td></tr>';
        }
    }

    // ================================================================
    // TIMELINE: ACTIVIDAD RECIENTE
    // ================================================================
    async function actualizarActividadReciente() {
        const timelineContainer = document.getElementById('db-actividad-reciente');
        if (!timelineContainer) return;

        try {
            // Obtener últimas 5 ventas
            const q = query(
                salesCollection,
                orderBy('timestamp', 'desc'),
                limit(5)
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                timelineContainer.innerHTML = '<div class="text-center text-muted py-3">No hay actividad reciente</div>';
                return;
            }

            let html = '';

            snapshot.forEach(doc => {
                const venta = doc.data();
                const fecha = venta.timestamp?.toDate();
                const tiempoRelativo = fecha ? obtenerTiempoRelativo(fecha) : 'Hace un momento';

                const iconoEstado = venta.estado === 'Completada' ? 'check-circle-fill text-success' :
                                    venta.estado === 'Pendiente' ? 'clock-fill text-warning' :
                                    'x-circle-fill text-danger';

                html += `
                    <div class="activity-item d-flex align-items-start gap-3 py-2 px-3 border-bottom">
                        <i class="bi bi-${iconoEstado} fs-5 mt-1"></i>
                        <div class="flex-grow-1">
                            <div class="fw-semibold text-dark">Venta ${venta.estado}</div>
                            <div class="small text-muted">
                                ${venta.clienteNombre || 'Cliente'} • ${formatoMoneda.format(venta.totalVenta || 0)}
                            </div>
                        </div>
                        <small class="text-muted text-nowrap">${tiempoRelativo}</small>
                    </div>
                `;
            });

            timelineContainer.innerHTML = html;

        } catch (error) {
            console.error("❌ Error al actualizar actividad:", error);
            timelineContainer.innerHTML = '<div class="text-center text-danger py-3">Error al cargar</div>';
        }
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
    // TABLA MÓVIL 1: TENDENCIA DE VENTAS
    // ================================================================
    async function crearTablaTendenciaMobile(dias = 7) {
        const container = document.getElementById('db-trend-table');
        if (!container) return;

        container.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span></div>';

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

            const snapshot = await getDocs(q);

            const ventasPorDia = {};
            const labels = [];

            for (let i = 0; i < dias; i++) {
                const fecha = new Date(fechaInicio);
                fecha.setDate(fecha.getDate() + i);
                const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                ventasPorDia[key] = 0;
                labels.push(key);
            }

            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const fecha = venta.timestamp?.toDate();
                    if (fecha) {
                        const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                        if (ventasPorDia.hasOwnProperty(key)) {
                            const monto = (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                            ventasPorDia[key] += monto;
                        }
                    }
                }
            });

            const data = labels.map(l => ventasPorDia[l] || 0);
            const maxVal = Math.max(...data, 1);

            let html = '<div class="db-trend-list">';
            labels.forEach((label, i) => {
                const val = data[i];
                const pct = Math.round((val / maxVal) * 100);
                const isToday = i === labels.length - 1;
                html += `
                    <div class="db-trend-row${isToday ? ' db-trend-row--today' : ''}">
                        <span class="db-trend-label">${label}</span>
                        <div class="db-trend-bar-wrap">
                            <div class="db-trend-bar" style="width:${pct}%"></div>
                        </div>
                        <span class="db-trend-val">${val > 0 ? '$' + val.toLocaleString('es-CO') : '—'}</span>
                    </div>`;
            });
            html += '</div>';

            container.innerHTML = html;

        } catch (error) {
            console.error("❌ Error tabla tendencia mobile:", error);
            container.innerHTML = '<div class="text-center text-danger py-3">Error al cargar</div>';
        }
    }

    // ================================================================
    // TABLA MÓVIL 2: TOP PRODUCTOS
    // ================================================================
    async function crearTablaTopProductosMobile() {
        const container = document.getElementById('db-top-table');
        if (!container) return;

        container.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span></div>';

        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            fechaInicio.setHours(0, 0, 0, 0);

            const q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(fechaInicio))
            );

            const snapshot = await getDocs(q);

            const productosVendidos = {};
            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const items = venta.items || [];
                    items.forEach(item => {
                        const nombre = item.nombre || 'Sin nombre';
                        if (!productosVendidos[nombre]) productosVendidos[nombre] = 0;
                        productosVendidos[nombre] += (item.cantidad || 0);
                    });
                }
            });

            const topProductos = Object.entries(productosVendidos)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15);

            if (topProductos.length === 0) {
                container.innerHTML = '<div class="text-center text-muted py-4">Sin datos de ventas</div>';
                return;
            }

            const maxUnits = topProductos[0][1];

            let html = '<div class="db-top-list">';
            topProductos.forEach(([nombre, unidades], i) => {
                const pct = Math.round((unidades / maxUnits) * 100);
                const rankClass = i === 0 ? 'db-top-rank--gold' : i === 1 ? 'db-top-rank--silver' : i === 2 ? 'db-top-rank--bronze' : '';
                html += `
                    <div class="db-top-row">
                        <span class="db-top-rank ${rankClass}">${i + 1}</span>
                        <div class="db-top-info">
                            <span class="db-top-name">${nombre}</span>
                            <div class="db-top-bar-wrap">
                                <div class="db-top-bar" style="width:${pct}%"></div>
                            </div>
                        </div>
                        <span class="db-top-units">${unidades} u.</span>
                    </div>`;
            });
            html += '</div>';

            container.innerHTML = html;

        } catch (error) {
            console.error("❌ Error tabla top productos mobile:", error);
            container.innerHTML = '<div class="text-center text-danger py-3">Error al cargar</div>';
        }
    }

    // ================================================================
    // EVENT LISTENERS
    // ================================================================

    // Cambiar período de la tabla móvil de tendencia
    const mtPeriodoBtns = document.querySelectorAll('input[name="mt-period"]');
    mtPeriodoBtns.forEach(btn => {
        btn.addEventListener('change', (e) => {
            const dias = e.target.id === 'mt-7days' ? 7 :
                        e.target.id === 'mt-30days' ? 30 :
                        180;
            crearTablaTendenciaMobile(dias);
        });
    });

    // ================================================================
    // INICIALIZAR
    // ================================================================

    crearTablaTendenciaMobile(7);
    crearTablaTopProductosMobile();
    actualizarTablaStockCritico();
    actualizarActividadReciente();

    // Actualizar tabla de stock crítico cuando cambie window.productosBajoStock
    const originalCalcBajoStock = window.calcularBajoStock;
    if (originalCalcBajoStock) {
        // Se actualiza automáticamente con el onSnapshot
        setTimeout(() => actualizarTablaStockCritico(), 2000);
    }

    console.log("✅ Gráficos del dashboard inicializados");

})();

// ========================================================================
// FIN DE LOS GRÁFICOS
// ========================================================================

// ========================================================================
// ✅ SECCIÓN: REPORTES COMPLETOS
// ========================================================================
(() => {
    console.log("📊 Inicializando sistema de reportes...");

    const formReporte = document.getElementById('form-reporte');
    const reporteTipoSelect = document.getElementById('reporte-tipo');
    const reporteDesde = document.getElementById('reporte-desde');
    const reporteHasta = document.getElementById('reporte-hasta');
    const areaReporte = document.getElementById('area-reporte');
    const btnImprimir = document.getElementById('btn-imprimir-reporte');
    const repartidorFilter = document.getElementById('reporte-repartidor-filter');
    const repartidorSelect = document.getElementById('reporte-repartidor-select');

    if (!formReporte) {
        console.warn("⚠️ Formulario de reportes no encontrado");
        return;
    }

    // Mostrar/ocultar filtro de repartidor
    if (reporteTipoSelect && repartidorFilter) {
        reporteTipoSelect.addEventListener('change', () => {
            if (reporteTipoSelect.value === 'repartidor') {
                repartidorFilter.style.display = 'block';
            } else {
                repartidorFilter.style.display = 'none';
            }
        });
    }

    // Cargar repartidores en el select
    if (repartidorSelect) {
        onSnapshot(repartidoresCollection, (snapshot) => {
            repartidorSelect.innerHTML = '<option value="">Todos los repartidores</option>';
            snapshot.forEach(doc => {
                const repartidor = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = repartidor.nombre;
                repartidorSelect.appendChild(option);
            });
        });
    }

    // Manejar envío del formulario
    formReporte.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tipo = reporteTipoSelect.value;
        const desde = new Date(reporteDesde.value);
        const hasta = new Date(reporteHasta.value);
        hasta.setHours(23, 59, 59, 999);

        if (!tipo) {
            showToast('Selecciona un tipo de reporte', 'warning');
            return;
        }

        areaReporte.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-3">Generando reporte...</p></div>';
        btnImprimir.style.display = 'none';

        try {
            let html = '';

            switch(tipo) {
                case 'ventas':
                    html = await generarReporteVentas(desde, hasta);
                    break;
                case 'utilidad':
                    html = await generarReporteUtilidad(desde, hasta);
                    break;
                case 'mas-vendidos':
                    html = await generarReporteMasVendidos(desde, hasta);
                    break;
                case 'repartidor':
                    const repartidorId = repartidorSelect.value;
                    html = await generarReporteRepartidor(desde, hasta, repartidorId);
                    break;
                case 'apartados':
                    html = await generarReporteApartados(desde, hasta);
                    break;
                case 'descuentos':
                    html = await generarReporteDescuentos(desde, hasta);
                    break;
            }

            areaReporte.innerHTML = html;
            btnImprimir.style.display = 'inline-block';

        } catch (error) {
            console.error("Error al generar reporte:", error);
            areaReporte.innerHTML = `<div class="alert alert-danger">Error al generar el reporte: ${error.message}</div>`;
        }
    });

    // Función para imprimir
    if (btnImprimir) {
        btnImprimir.addEventListener('click', () => {
            window.print();
        });
    }

    // Reportes específicos
    async function generarReporteVentas(desde, hasta) {
        const q = query(
            salesCollection,
            where('timestamp', '>=', Timestamp.fromDate(desde)),
            where('timestamp', '<=', Timestamp.fromDate(hasta)),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);
        let totalVentas = 0;
        let totalEfectivo = 0;
        let totalTransferencia = 0;
        let ventasValidas = 0;
        let ventasAnuladas = 0;

        const ventas = [];
        snapshot.forEach(doc => {
            const venta = doc.data();
            ventas.push({ ...venta, id: doc.id });

            if (venta.estado !== 'Anulada') {
                // ✅ CORRECCIÓN: Sumar solo el monto recibido (efectivo + transferencia)
                // en lugar del total de la venta, para reflejar correctamente el dinero en caja
                const montoRecibido = (venta.pagoEfectivo || 0) + (venta.pagoTransferencia || 0);
                totalVentas += montoRecibido;
                totalEfectivo += venta.pagoEfectivo || 0;
                totalTransferencia += venta.pagoTransferencia || 0;
                ventasValidas++;
            } else {
                ventasAnuladas++;
            }
        });

        let html = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0"><i class="bi bi-graph-up me-2"></i>Reporte de Ventas</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-4">
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Total Ventas</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalVentas)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Efectivo</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalEfectivo)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Transferencia</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalTransferencia)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Cantidad</div>
                                <div class="h4 mb-0">${ventasValidas} ventas</div>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th>Total</th>
                                    <th>Método Pago</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        ventas.forEach(venta => {
            const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleString('es-CO') : 'N/A';
            const estadoBadge = venta.estado === 'Anulada' ? 'bg-danger' : 'bg-success';

            html += `
                <tr>
                    <td>${fecha}</td>
                    <td>${venta.clienteNombre || 'N/A'}</td>
                    <td><strong>${formatoMoneda.format(venta.totalVenta || 0)}</strong></td>
                    <td>
                        ${venta.pagoEfectivo > 0 ? `💵 ${formatoMoneda.format(venta.pagoEfectivo)}` : ''}
                        ${venta.pagoTransferencia > 0 ? `💳 ${formatoMoneda.format(venta.pagoTransferencia)}` : ''}
                    </td>
                    <td><span class="badge ${estadoBadge}">${venta.estado}</span></td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    async function generarReporteUtilidad(desde, hasta) {
        const q = query(
            salesCollection,
            where('timestamp', '>=', Timestamp.fromDate(desde)),
            where('timestamp', '<=', Timestamp.fromDate(hasta)),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);
        let totalVentas = 0;
        let totalCosto = 0;

        snapshot.forEach(doc => {
            const venta = doc.data();
            if (venta.estado !== 'Anulada' && venta.items) {
                venta.items.forEach(item => {
                    // ✅ CORRECCIÓN: Usar item.precio (no precioUnitario) que es el campo correcto
                    const precioVenta = (item.precio || item.precioUnitario || 0) * item.cantidad;
                    const precioCosto = (item.precioCosto || 0) * item.cantidad;
                    totalVentas += precioVenta;
                    totalCosto += precioCosto;
                });
            }
        });

        const utilidad = totalVentas - totalCosto;
        const margen = totalVentas > 0 ? ((utilidad / totalVentas) * 100).toFixed(2) : 0;

        return `
            <div class="card">
                <div class="card-header bg-success text-white">
                    <h4 class="mb-0"><i class="bi bi-currency-dollar me-2"></i>Reporte de Utilidad</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <div class="p-4 bg-light rounded">
                                <div class="text-muted small">Total Ventas</div>
                                <div class="h3 mb-0">${formatoMoneda.format(totalVentas)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-4 bg-light rounded">
                                <div class="text-muted small">Costo Total</div>
                                <div class="h3 mb-0">${formatoMoneda.format(totalCosto)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-4 bg-light rounded">
                                <div class="text-muted small">Utilidad</div>
                                <div class="h3 mb-0 text-success">${formatoMoneda.format(utilidad)}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-4 bg-light rounded">
                                <div class="text-muted small">Margen</div>
                                <div class="h3 mb-0">${margen}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async function generarReporteMasVendidos(desde, hasta) {
        const q = query(
            salesCollection,
            where('timestamp', '>=', Timestamp.fromDate(desde)),
            where('timestamp', '<=', Timestamp.fromDate(hasta))
        );

        const snapshot = await getDocs(q);
        const productos = {};

        snapshot.forEach(doc => {
            const venta = doc.data();
            if (venta.estado !== 'Anulada' && venta.items) {
                venta.items.forEach(item => {
                    if (!productos[item.nombre]) {
                        productos[item.nombre] = {
                            nombre: item.nombre,
                            cantidad: 0,
                            total: 0
                        };
                    }
                    productos[item.nombre].cantidad += item.cantidad;
                    productos[item.nombre].total += item.precioUnitario * item.cantidad;
                });
            }
        });

        const productosArray = Object.values(productos).sort((a, b) => b.cantidad - a.cantidad).slice(0, 20);

        let html = `
            <div class="card">
                <div class="card-header bg-warning">
                    <h4 class="mb-0"><i class="bi bi-trophy me-2"></i>Top 20 Productos Más Vendidos</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Producto</th>
                                    <th>Cantidad</th>
                                    <th>Total Vendido</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        productosArray.forEach((producto, index) => {
            html += `
                <tr>
                    <td><strong>${index + 1}</strong></td>
                    <td>${producto.nombre}</td>
                    <td><span class="badge bg-primary">${producto.cantidad}</span></td>
                    <td><strong>${formatoMoneda.format(producto.total)}</strong></td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    async function generarReporteRepartidor(desde, hasta, repartidorId) {
        let q;
        if (repartidorId) {
            q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(desde)),
                where('timestamp', '<=', Timestamp.fromDate(hasta)),
                where('repartidorId', '==', repartidorId),
                orderBy('timestamp', 'desc')
            );
        } else {
            q = query(
                salesCollection,
                where('timestamp', '>=', Timestamp.fromDate(desde)),
                where('timestamp', '<=', Timestamp.fromDate(hasta)),
                orderBy('timestamp', 'desc')
            );
        }

        const snapshot = await getDocs(q);
        const repartidores = {};

        snapshot.forEach(doc => {
            const venta = doc.data();
            if (venta.tipoEntrega === 'domicilio' && venta.repartidorId) {
                if (!repartidores[venta.repartidorId]) {
                    repartidores[venta.repartidorId] = {
                        nombre: venta.repartidorNombre || 'Sin nombre',
                        entregas: 0,
                        totalRutas: 0
                    };
                }
                repartidores[venta.repartidorId].entregas++;
                repartidores[venta.repartidorId].totalRutas += venta.costoRuta || 0;
            }
        });

        let html = `
            <div class="card">
                <div class="card-header bg-info text-white">
                    <h4 class="mb-0"><i class="bi bi-bicycle me-2"></i>Reporte por Repartidor</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Repartidor</th>
                                    <th>Entregas</th>
                                    <th>Total Rutas</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        Object.values(repartidores).forEach(repartidor => {
            html += `
                <tr>
                    <td>${repartidor.nombre}</td>
                    <td><span class="badge bg-primary">${repartidor.entregas}</span></td>
                    <td><strong>${formatoMoneda.format(repartidor.totalRutas)}</strong></td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    async function generarReporteApartados(desde, hasta) {
        const q = query(
            apartadosCollection,
            where('fechaCreacion', '>=', Timestamp.fromDate(desde)),
            where('fechaCreacion', '<=', Timestamp.fromDate(hasta)),
            orderBy('fechaCreacion', 'desc')
        );

        const snapshot = await getDocs(q);
        let totalApartados = 0;
        let totalPagado = 0;
        let totalPendiente = 0;
        const apartados = [];

        snapshot.forEach(doc => {
            const apartado = doc.data();
            apartados.push({ ...apartado, id: doc.id });
            totalApartados += apartado.montoTotal || 0;
            totalPagado += apartado.montoPagado || 0;
            totalPendiente += apartado.saldoPendiente || 0;
        });

        let html = `
            <div class="card">
                <div class="card-header bg-danger text-white">
                    <h4 class="mb-0"><i class="bi bi-bookmark-heart me-2"></i>Reporte de Apartados</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-4">
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Total Apartados</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalApartados)}</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Pagado</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalPagado)}</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Pendiente</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalPendiente)}</div>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Cliente</th>
                                    <th>Total</th>
                                    <th>Pagado</th>
                                    <th>Saldo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        apartados.forEach(apartado => {
            const estadoBadge = apartado.estado === 'Completado' ? 'bg-success' : 'bg-warning';

            html += `
                <tr>
                    <td>${apartado.clienteNombre || 'N/A'}</td>
                    <td>${formatoMoneda.format(apartado.montoTotal || 0)}</td>
                    <td>${formatoMoneda.format(apartado.montoPagado || 0)}</td>
                    <td>${formatoMoneda.format(apartado.saldoPendiente || 0)}</td>
                    <td><span class="badge ${estadoBadge}">${apartado.estado}</span></td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    async function generarReporteDescuentos(desde, hasta) {
        const q = query(
            salesCollection,
            where('timestamp', '>=', Timestamp.fromDate(desde)),
            where('timestamp', '<=', Timestamp.fromDate(hasta)),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);
        let totalDescuentos = 0;
        const ventas = [];

        snapshot.forEach(doc => {
            const venta = doc.data();
            if (venta.estado !== 'Anulada' && venta.descuento > 0) {
                ventas.push({ ...venta, id: doc.id });
                totalDescuentos += venta.descuento || 0;
            }
        });

        let html = `
            <div class="card">
                <div class="card-header bg-secondary text-white">
                    <h4 class="mb-0"><i class="bi bi-percent me-2"></i>Reporte de Descuentos</h4>
                    <small>${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Total Descuentos</div>
                                <div class="h4 mb-0">${formatoMoneda.format(totalDescuentos)}</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="p-3 bg-light rounded">
                                <div class="text-muted small">Ventas con Descuento</div>
                                <div class="h4 mb-0">${ventas.length}</div>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th>Total Venta</th>
                                    <th>Descuento</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        ventas.forEach(venta => {
            const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleString('es-CO') : 'N/A';

            html += `
                <tr>
                    <td>${fecha}</td>
                    <td>${venta.clienteNombre || 'N/A'}</td>
                    <td>${formatoMoneda.format(venta.totalVenta || 0)}</td>
                    <td class="text-danger"><strong>-${formatoMoneda.format(venta.descuento || 0)}</strong></td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    console.log("✅ Sistema de reportes inicializado");
})();

// ========================================================================
// ✅ SECCIÓN: FINANZAS v2 — Utilidad Real por Producto
// Lógica: utilidad = (precio_venta - costo) × cantidad_vendida
// ========================================================================
(() => {
    // ── DOM refs ──
    const filterBtns     = document.querySelectorAll('.fin2-filter-btn');
    const customRangeBar = document.getElementById('fin2-custom-range');
    const inputDesde     = document.getElementById('fin2-desde');
    const inputHasta     = document.getElementById('fin2-hasta');
    const btnCalc        = document.getElementById('fin2-btn-calc');
    const loadingDiv     = document.getElementById('fin2-loading');
    const resultadosDiv  = document.getElementById('fin2-resultados');

    if (!filterBtns.length) return;

    // ── Instancia del gráfico ──
    let chartInstance = null;

    // ── Formateador ──
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

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
            default: { // 'mes'
                const desde = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                return { desde, hasta: hoyFin, label: 'Este mes' };
            }
        }
    }

    // ── Agrupar ventas por producto ──
    // Calcula el ratio de descuento de una venta (1 = sin descuento, 0.9 = 10% desc)
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

    function agruparPorProducto(ventas, productCostMap) {
        const mapa = new Map();

        ventas.forEach(({ venta }) => {
            if (!venta.items || !venta.items.length) return;

            const ratio = discountRatio(venta);

            venta.items.forEach(item => {
                const nombre = item.nombre || item.name || 'Producto sin nombre';
                const costo  = parseFloat(
                    item.precioCosto ||
                    item.costo ||
                    (item.productoId ? productCostMap.get(item.productoId) : undefined) ||
                    0
                );
                // Precio efectivo = precio catálogo × ratio de descuento
                const precioBase     = parseFloat(item.precio || item.precioUnitario || 0);
                const precioEfectivo = precioBase * ratio;
                const cant           = parseInt(item.cantidad || 1, 10);
                const key            = nombre.trim().toLowerCase();

                if (!mapa.has(key)) {
                    mapa.set(key, {
                        nombre: nombre.trim(),
                        costo,
                        precio: precioEfectivo,
                        cantidad: 0,
                        utilidadTotal: 0,
                        ingresoTotal: 0,
                        costoTotal: 0
                    });
                }

                const entry          = mapa.get(key);
                entry.cantidad      += cant;
                entry.utilidadTotal += (precioEfectivo - costo) * cant;
                entry.ingresoTotal  += precioEfectivo * cant;
                entry.costoTotal    += costo * cant;
                entry.precio         = precioEfectivo;
                entry.costo          = costo;
            });
        });

        return Array.from(mapa.values())
            .sort((a, b) => b.utilidadTotal - a.utilidadTotal);
    }

    // ── Construir datos de gráfica por día ──
    function buildChartData(ventas, desde, hasta, productCostMap) {
        const dayMap = new Map();

        // Inicializar todos los días del rango
        const cur = new Date(desde);
        cur.setHours(0, 0, 0, 0);
        const end = new Date(hasta);
        end.setHours(0, 0, 0, 0);

        while (cur <= end) {
            const key = cur.toISOString().slice(0, 10);
            dayMap.set(key, 0);
            cur.setDate(cur.getDate() + 1);
        }

        ventas.forEach(({ venta, fecha }) => {
            const key = fecha.toISOString().slice(0, 10);
            if (!dayMap.has(key)) return;
            if (!venta.items) return;

            const ratio = discountRatio(venta);

            venta.items.forEach(item => {
                const costo  = parseFloat(
                    item.precioCosto ||
                    item.costo ||
                    (item.productoId ? productCostMap.get(item.productoId) : undefined) ||
                    0
                );
                const precio = parseFloat(item.precio || item.precioUnitario || 0) * ratio;
                const cant   = parseInt(item.cantidad || 1, 10);
                dayMap.set(key, (dayMap.get(key) || 0) + (precio - costo) * cant);
            });
        });

        const labels = [];
        const data   = [];
        dayMap.forEach((val, key) => {
            const d = new Date(key + 'T00:00:00');
            labels.push(d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }));
            data.push(Math.round(val));
        });

        return { labels, data };
    }

    // ── Renderizar gráfica ──
    function renderChart(labels, data) {
        const canvas = document.getElementById('fin2-utilidad-chart');
        if (!canvas) return;

        const hasPositive = data.some(v => v > 0);
        const barColor = data.map(v =>
            v >= 0 ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.75)'
        );

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Utilidad ($)',
                    data,
                    backgroundColor: barColor,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${fmt.format(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#7a7570' }
                    },
                    y: {
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            font: { size: 11 },
                            color: '#7a7570',
                            callback: v => fmt.format(v)
                        }
                    }
                }
            }
        });
    }

    // ── Consulta y renderizado principal ──
    async function calcularFinanzas(desde, hasta, label) {
        if (loadingDiv)    loadingDiv.style.display  = 'flex';
        if (resultadosDiv) resultadosDiv.style.display = 'none';

        document.getElementById('fin2-period-badge').textContent = label;

        try {
            // Cargar ventas y productos en paralelo
            const [snapshot, prodsSnapshot] = await Promise.all([
                getDocs(query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(desde)),
                    where('timestamp', '<=', Timestamp.fromDate(hasta)),
                    orderBy('timestamp', 'desc')
                )),
                getDocs(productsCollection)
            ]);

            // Mapa productoId → costoCompra (el costo real del producto)
            const productCostMap = new Map();
            prodsSnapshot.forEach(d => {
                const data = d.data();
                productCostMap.set(d.id, parseFloat(data.costoCompra) || 0);
            });

            const ventas = [];
            snapshot.forEach(docSnap => {
                const venta = docSnap.data();
                if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                ventas.push({
                    venta,
                    fecha: venta.timestamp ? venta.timestamp.toDate() : new Date()
                });
            });

            // ── Agrupar por producto (con costos desde el catálogo) ──
            const productos = agruparPorProducto(ventas, productCostMap);

            // ── Totales globales ──
            const utilidadTotal = productos.reduce((s, p) => s + p.utilidadTotal, 0);
            const ingresosTotal = productos.reduce((s, p) => s + p.ingresoTotal, 0);
            const costosTotal   = productos.reduce((s, p) => s + p.costoTotal, 0);
            const udsTotal      = productos.reduce((s, p) => s + p.cantidad, 0);
            const margen        = ingresosTotal > 0 ? ((utilidadTotal / ingresosTotal) * 100).toFixed(1) : 0;

            // ── KPI principal ──
            const elUtilidad = document.getElementById('fin2-utilidad-total');
            elUtilidad.textContent = fmt.format(utilidadTotal);
            elUtilidad.className   = 'fin2-hero-value ' + (utilidadTotal >= 0 ? 'fin2-positive' : 'fin2-negative');

            // ── Tendencia (simplificada: positivo / negativo) ──
            const trendBadge = document.getElementById('fin2-trend-badge');
            if (utilidadTotal > 0) {
                trendBadge.innerHTML = '<i class="bi bi-arrow-up-right"></i> Ganancia positiva';
                trendBadge.className = 'fin2-hero-trend fin2-trend-up';
            } else if (utilidadTotal < 0) {
                trendBadge.innerHTML = '<i class="bi bi-arrow-down-right"></i> Ganancia negativa';
                trendBadge.className = 'fin2-hero-trend fin2-trend-down';
            } else {
                trendBadge.innerHTML = '<i class="bi bi-dash"></i> Sin movimientos';
                trendBadge.className = 'fin2-hero-trend';
            }

            // ── KPIs secundarios ──
            document.getElementById('fin2-total-uds').textContent  = udsTotal.toLocaleString('es-CO');
            document.getElementById('fin2-ingresos').textContent   = fmt.format(ingresosTotal);
            document.getElementById('fin2-costos').textContent     = fmt.format(costosTotal);
            document.getElementById('fin2-margen').textContent     = `${margen}%`;

            // ── Gráfica ──
            const { labels, data } = buildChartData(ventas, desde, hasta, productCostMap);
            renderChart(labels, data);
            const diffDays = Math.round((hasta - desde) / (1000 * 60 * 60 * 24));
            document.getElementById('fin2-chart-subtitle').textContent = diffDays <= 31 ? 'por día' : 'por mes';

            // ── Tabla de productos ──
            const tbody  = document.getElementById('fin2-tabla-body');
            const tfoot  = document.getElementById('fin2-tabla-footer');
            const count  = document.getElementById('fin2-product-count');

            count.textContent = `${productos.length} producto${productos.length !== 1 ? 's' : ''}`;

            if (productos.length === 0) {
                tbody.innerHTML = `<tr>
                    <td colspan="6" class="fin2-empty-state">
                        <i class="bi bi-bar-chart"></i>
                        <span>No hay ventas completadas en este periodo</span>
                    </td>
                </tr>`;
                tfoot.style.display = 'none';
            } else {
                tbody.innerHTML = productos.map(p => {
                    const utilUnd  = p.precio - p.costo;
                    const colorCls = p.utilidadTotal >= 0 ? 'fin2-positive-text' : 'fin2-negative-text';
                    return `<tr>
                        <td class="fin2-td-nombre">${p.nombre}</td>
                        <td class="text-end fin2-td-num">${fmt.format(p.costo)}</td>
                        <td class="text-end fin2-td-num">${fmt.format(p.precio)}</td>
                        <td class="text-end fin2-td-num">${p.cantidad}</td>
                        <td class="text-end fin2-td-num ${colorCls}">${fmt.format(utilUnd)}</td>
                        <td class="text-end fin2-td-num fw-semibold ${colorCls}">${fmt.format(p.utilidadTotal)}</td>
                    </tr>`;
                }).join('');

                document.getElementById('fin2-footer-cant').textContent     = udsTotal.toLocaleString('es-CO');
                document.getElementById('fin2-footer-utilidad').textContent = fmt.format(utilidadTotal);
                tfoot.style.display = '';
            }

            if (loadingDiv)    loadingDiv.style.display    = 'none';
            if (resultadosDiv) resultadosDiv.style.display = 'block';

        } catch (error) {
            console.error("Error calculando finanzas v2:", error);
            if (loadingDiv)    loadingDiv.style.display    = 'none';
            if (resultadosDiv) resultadosDiv.style.display = 'block';
            document.getElementById('fin2-tabla-body').innerHTML =
                `<tr><td colspan="6" class="fin2-empty-state fin2-negative-text">
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
            calcularFinanzas(desde, hasta, label);
        });
    });

    // ── Event: rango personalizado ──
    if (btnCalc) {
        btnCalc.addEventListener('click', () => {
            if (!inputDesde.value || !inputHasta.value) {
                showToast('Selecciona ambas fechas', 'warning');
                return;
            }
            // parseLocalDate evita el bug UTC: "2025-03-18" → local midnight, no UTC
            const desde = parseLocalDate(inputDesde.value);
            const hasta = parseLocalDate(inputHasta.value);
            hasta.setHours(23, 59, 59, 999);
            calcularFinanzas(desde, hasta,
                `${desde.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'})} — ${hasta.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'})}`);
        });
    }

    // ── Auto-calcular al entrar a la sección ──
    const tabLink = document.querySelector('a[href="#finanzas"]');
    if (tabLink) {
        tabLink.addEventListener('click', () => {
            const { desde, hasta, label } = getDateRange('hoy');
            calcularFinanzas(desde, hasta, label);
        });
    }

    // ── Exportar CSV ──
    const btnExport = document.getElementById('fin2-btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const rows = document.getElementById('fin2-tabla-body').querySelectorAll('tr');
            if (!rows.length || rows[0].querySelector('.fin2-empty-state')) return;

            let csv = 'Producto,Costo,Precio Venta,Cantidad Vendida,Utilidad por Unidad,Utilidad Total\n';
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length === 6) {
                    csv += Array.from(cols).map(c => `"${c.textContent.trim()}"`).join(',') + '\n';
                }
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `utilidades_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
            showToast('CSV descargado', 'success');
        });
    }

    console.log("✅ Módulo Finanzas v2 inicializado (Utilidad Real por Producto)");
})();

// ========================================================================
// ✅ SECCIÓN: HISTORIAL DE REPARTIDORES
// ========================================================================
(() => {
    console.log("🚴 Inicializando historial de repartidores...");

    const formFilterHistory = document.getElementById('form-filter-delivery-history');
    const historyRepartidorSelect = document.getElementById('history-repartidor');
    const historyDesde = document.getElementById('history-desde');
    const historyHasta = document.getElementById('history-hasta');
    const listaHistorialRepartidores = document.getElementById('lista-historial-repartidores');

    if (!formFilterHistory) {
        console.warn("⚠️ Formulario de historial de repartidores no encontrado");
        return;
    }

    // Cargar repartidores en el select
    if (historyRepartidorSelect) {
        onSnapshot(repartidoresCollection, (snapshot) => {
            historyRepartidorSelect.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const repartidor = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = repartidor.nombre;
                historyRepartidorSelect.appendChild(option);
            });
        });
    }

    // Manejar envío del formulario
    formFilterHistory.addEventListener('submit', async (e) => {
        e.preventDefault();

        const repartidorId = historyRepartidorSelect.value;
        const desde = new Date(historyDesde.value);
        const hasta = new Date(historyHasta.value);
        hasta.setHours(23, 59, 59, 999);

        if (!historyDesde.value || !historyHasta.value) {
            showToast('Selecciona las fechas', 'warning');
            return;
        }

        listaHistorialRepartidores.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner-border"></div></td></tr>';

        try {
            let q;
            if (repartidorId) {
                q = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(desde)),
                    where('timestamp', '<=', Timestamp.fromDate(hasta)),
                    where('repartidorId', '==', repartidorId),
                    orderBy('timestamp', 'desc')
                );
            } else {
                q = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(desde)),
                    where('timestamp', '<=', Timestamp.fromDate(hasta)),
                    orderBy('timestamp', 'desc')
                );
            }

            const snapshot = await getDocs(q);

            // Agrupar por fecha y repartidor
            const historial = {};

            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.tipoEntrega === 'domicilio' && venta.repartidorId) {
                    const fecha = venta.timestamp?.toDate ? venta.timestamp.toDate().toLocaleDateString('es-CO') : 'N/A';
                    const key = `${fecha}_${venta.repartidorId}`;

                    if (!historial[key]) {
                        historial[key] = {
                            fecha: fecha,
                            repartidorNombre: venta.repartidorNombre || 'Sin nombre',
                            efectivoEsperado: 0,
                            efectivoEntregado: 0
                        };
                    }

                    // Efectivo esperado es el costo de la ruta
                    historial[key].efectivoEsperado += venta.costoRuta || 0;
                }
            });

            // Consultar liquidaciones para obtener efectivo entregado
            const liquidacionesQuery = query(
                collection(db, 'liquidaciones'),
                where('fecha', '>=', Timestamp.fromDate(desde)),
                where('fecha', '<=', Timestamp.fromDate(hasta))
            );

            const liquidacionesSnapshot = await getDocs(liquidacionesQuery);
            liquidacionesSnapshot.forEach(doc => {
                const liquidacion = doc.data();
                const fecha = liquidacion.fecha?.toDate ? liquidacion.fecha.toDate().toLocaleDateString('es-CO') : 'N/A';
                const key = `${fecha}_${liquidacion.repartidorId}`;

                if (historial[key]) {
                    historial[key].efectivoEntregado = liquidacion.efectivoEntregado || 0;
                }
            });

            // Renderizar tabla
            if (Object.keys(historial).length === 0) {
                listaHistorialRepartidores.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay datos para el período seleccionado</td></tr>';
                return;
            }

            listaHistorialRepartidores.innerHTML = '';
            Object.values(historial).forEach(registro => {
                const diferencia = registro.efectivoEntregado - registro.efectivoEsperado;
                const diferenciaClass = diferencia >= 0 ? 'text-success' : 'text-danger';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${registro.fecha}</td>
                    <td>${registro.repartidorNombre}</td>
                    <td>${formatoMoneda.format(registro.efectivoEsperado)}</td>
                    <td>${formatoMoneda.format(registro.efectivoEntregado)}</td>
                    <td class="${diferenciaClass}"><strong>${formatoMoneda.format(diferencia)}</strong></td>
                `;
                listaHistorialRepartidores.appendChild(tr);
            });

        } catch (error) {
            console.error("Error al cargar historial:", error);
            listaHistorialRepartidores.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar datos</td></tr>';
            showToast('Error al cargar historial', 'error');
        }
    });

    console.log("✅ Historial de repartidores inicializado");
})();

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: CONVERSACIONES DEL CHAT
// ═══════════════════════════════════════════════════════════════════
(function initConversations() {
    const conversationsList = document.getElementById('conversations-list');
    const conversationMessages = document.getElementById('conversation-messages');
    const conversationTitle = document.getElementById('conversation-title');
    const replyArea = document.getElementById('conversation-reply-area');
    const replyInput = document.getElementById('admin-reply-input');
    const replySendBtn = document.getElementById('admin-reply-send');

    // Validar que los elementos existan antes de continuar
    if (!conversationsList || !conversationMessages || !conversationTitle || !replyArea) {
        console.warn('Elementos de conversaciones no encontrados en el DOM. Saltando inicialización.');
        return;
    }

    let selectedConversationId = null;
    let conversationsMap = new Map();

    // Cargar conversaciones en tiempo real
    const q = query(chatConversationsCollection, orderBy('timestamp', 'desc'));

    onSnapshot(q, (snapshot) => {
        conversationsMap.clear();

        // Agrupar mensajes por conversationId
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const convId = data.conversationId || data.clienteCelular || doc.id;

            if (!conversationsMap.has(convId)) {
                conversationsMap.set(convId, []);
            }
            conversationsMap.get(convId).push(data);
        });

        renderConversationsList();
        updateConversationsCount();
    }, (error) => {
        console.error("Error cargando conversaciones:", error);
        if (conversationsList) {
            conversationsList.innerHTML = '<div class="p-3 text-center text-danger">Error al cargar conversaciones</div>';
        }
    });

    function renderConversationsList() {
        if (!conversationsList) {
            console.warn('conversationsList element not found');
            return;
        }

        if (conversationsMap.size === 0) {
            conversationsList.innerHTML = '<div class="p-3 text-center text-muted">No hay conversaciones</div>';
            return;
        }

        let html = '';
        conversationsMap.forEach((messages, convId) => {
            const lastMessage = messages[0]; // El más reciente
            const unreadCount = messages.filter(m => !m.read && m.type !== 'admin').length;
            const isOrder = lastMessage.type === 'order';

            html += `
                <div class="list-group-item ${selectedConversationId === convId ? 'active' : ''}" style="position: relative;">
                    <a href="#" class="conversation-link text-decoration-none text-reset d-block" data-conversation-id="${convId}" style="padding-right: 40px;">
                        <div class="d-flex w-100 justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-1">
                                    ${isOrder ? '<i class="bi bi-bag-check-fill text-success me-2"></i>' : '<i class="bi bi-chat-dots-fill text-primary me-2"></i>'}
                                    <h6 class="mb-0">${lastMessage.clienteNombre || 'Cliente'}</h6>
                                    ${unreadCount > 0 ? `<span class="badge bg-danger ms-2">${unreadCount}</span>` : ''}
                                </div>
                                <p class="mb-1 small text-truncate">${lastMessage.message?.substring(0, 60) || 'Sin mensaje'}...</p>
                                <small class="text-muted">
                                    <i class="bi bi-phone me-1"></i>${lastMessage.clienteCelular || ''}
                                </small>
                            </div>
                            <small class="text-muted">${formatTimestamp(lastMessage.timestamp)}</small>
                        </div>
                    </a>
                    <button class="btn btn-sm btn-danger delete-conversation-btn"
                            data-conversation-id="${convId}"
                            style="position: absolute; top: 10px; right: 10px; padding: 2px 8px; z-index: 10;"
                            title="Eliminar conversación">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
        });

        conversationsList.innerHTML = html;

        // Event listeners para seleccionar conversación
        conversationsList.querySelectorAll('.conversation-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const convId = link.dataset.conversationId;
                selectConversation(convId);
            });
        });

        // Event listeners para eliminar conversación
        conversationsList.querySelectorAll('.delete-conversation-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const convId = btn.dataset.conversationId;

                if (confirm('¿Estás seguro de que quieres eliminar esta conversación?')) {
                    await deleteConversation(convId);
                }
            });
        });
    }

    function selectConversation(convId) {
        selectedConversationId = convId;
        const messages = conversationsMap.get(convId);

        if (!messages || messages.length === 0) return;

        // Marcar mensajes como leídos
        messages.forEach(async (msg) => {
            if (!msg.read && msg.type !== 'admin') {
                try {
                    await updateDoc(doc(db, 'chatConversations', msg.id), { read: true });
                } catch (err) {
                    console.error("Error marcando como leído:", err);
                }
            }
        });

        renderConversationMessages(messages);
        renderConversationsList(); // Actualizar lista
    }

    function renderConversationMessages(messages) {
        const firstMessage = messages[messages.length - 1];
        conversationTitle.textContent = `${firstMessage.clienteNombre || 'Cliente'} - ${firstMessage.clienteCelular}`;

        // Ordenar mensajes de más antiguo a más reciente
        const sortedMessages = [...messages].reverse();

        let html = '<div class="chat-messages">';
        sortedMessages.forEach(msg => {
            const isAdmin = msg.type === 'admin';
            const messageClass = isAdmin ? 'text-end' : 'text-start';
            const bubbleClass = isAdmin ? 'bg-primary text-white' : 'bg-light';

            html += `
                <div class="mb-3 ${messageClass}">
                    <div class="d-inline-block ${bubbleClass} rounded p-3" style="max-width: 70%; white-space: pre-line;">
                        ${escapeHtml(msg.message || '')}
                    </div>
                    <div class="small text-muted mt-1">
                        ${formatTimestamp(msg.timestamp)}
                        ${msg.type === 'order' ? '<i class="bi bi-bag-check-fill ms-1"></i>' : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        conversationMessages.innerHTML = html;
        conversationMessages.scrollTop = conversationMessages.scrollHeight;

        // Mostrar área de respuesta
        replyArea.style.display = 'block';
    }

    // Enviar respuesta del admin
    replySendBtn.addEventListener('click', async () => {
        const message = replyInput.value.trim();
        if (!message || !selectedConversationId) return;

        const messages = conversationsMap.get(selectedConversationId);
        if (!messages || messages.length === 0) return;

        const firstMessage = messages[0];

        try {
            await addDoc(chatConversationsCollection, {
                type: 'admin',
                conversationId: selectedConversationId,
                clienteId: firstMessage.clienteId,
                clienteNombre: firstMessage.clienteNombre,
                clienteCelular: firstMessage.clienteCelular,
                message: message,
                timestamp: serverTimestamp(),
                read: true
            });

            replyInput.value = '';
            showToast('Respuesta enviada', 'success');
        } catch (err) {
            console.error("Error enviando respuesta:", err);
            showToast('Error al enviar respuesta', 'error');
        }
    });

    // Enter para enviar
    replyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            replySendBtn.click();
        }
    });

    function updateConversationsCount() {
        const unreadCount = Array.from(conversationsMap.values())
            .flat()
            .filter(m => !m.read && m.type !== 'admin')
            .length;

        const badge = document.getElementById('conversaciones-count');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    async function deleteConversation(convId) {
        try {
            const messages = conversationsMap.get(convId);
            if (!messages || messages.length === 0) return;

            // Eliminar todos los mensajes de esta conversación
            const deletePromises = messages.map(msg =>
                deleteDoc(doc(db, 'chatConversations', msg.id))
            );

            await Promise.all(deletePromises);

            // Limpiar vista si era la conversación seleccionada
            if (selectedConversationId === convId) {
                selectedConversationId = null;
                conversationMessages.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-chat-left-text" style="font-size: 3rem; opacity: 0.3;"></i>
                        <p class="mt-3">Selecciona una conversación para ver los mensajes</p>
                    </div>
                `;
                conversationTitle.textContent = 'Selecciona una conversación';
                replyArea.style.display = 'none';
            }

            showToast('Conversación eliminada', 'success');
        } catch (err) {
            console.error("Error eliminando conversación:", err);
            showToast('Error al eliminar conversación', 'error');
        }
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;

        return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    console.log("✅ Conversaciones del chat inicializadas");
})();

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: BACKUP Y EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════════
(function initBackupExport() {
    // Función auxiliar para formatear fecha
    function formatDate(date) {
        if (!date) return '';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-CO');
    }

    // Función auxiliar para formatear moneda
    function formatCurrency(value) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(value || 0);
    }

    // Función para generar nombre de archivo con timestamp
    function generateFileName(prefix) {
        const now = new Date();
        const timestamp = now.toISOString().slice(0,10) + '_' +
                         now.toTimeString().slice(0,5).replace(':','');
        return `${prefix}_${timestamp}.xlsx`;
    }

    // ============================================================
    // 1. EXPORTAR INVENTARIO
    // ============================================================
    const exportInventarioBtn = document.getElementById('export-inventario-btn');
    if (exportInventarioBtn) {
        exportInventarioBtn.addEventListener('click', async () => {
            try {
                const btn = exportInventarioBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                // Obtener productos
                const productosSnapshot = await getDocs(collection(db, 'productos'));

                // Obtener categorías
                const categoriasSnapshot = await getDocs(collection(db, 'categorias'));
                const categoriasMap = new Map();
                categoriasSnapshot.forEach(doc => {
                    categoriasMap.set(doc.id, doc.data().nombre);
                });

                const data = [];
                productosSnapshot.forEach(doc => {
                    const producto = doc.data();
                    const categoria = categoriasMap.get(producto.categoriaId) || 'Sin categoría';

                    if (producto.variaciones && producto.variaciones.length > 0) {
                        // Producto con variaciones
                        producto.variaciones.forEach(variacion => {
                            data.push({
                                'Código': producto.codigo || '',
                                'Nombre': producto.nombre || '',
                                'Categoría': categoria,
                                'Talla': variacion.talla || '',
                                'Color': variacion.color || '',
                                'Stock': variacion.stock || 0,
                                'Costo': producto.costoCompra || 0,
                                'Precio Detal': producto.precioDetal || 0,
                                'Precio Mayor': producto.precioMayor || 0,
                                'Proveedor': producto.proveedor || '',
                                'Visible': producto.visible ? 'Sí' : 'No',
                                'Descripción': producto.descripcion || ''
                            });
                        });
                    } else {
                        // Producto sin variaciones
                        data.push({
                            'Código': producto.codigo || '',
                            'Nombre': producto.nombre || '',
                            'Categoría': categoria,
                            'Talla': '',
                            'Color': '',
                            'Stock': 0,
                            'Costo': producto.costoCompra || 0,
                            'Precio Detal': producto.precioDetal || 0,
                            'Precio Mayor': producto.precioMayor || 0,
                            'Proveedor': producto.proveedor || '',
                            'Visible': producto.visible ? 'Sí' : 'No',
                            'Descripción': producto.descripcion || ''
                        });
                    }
                });

                // Crear libro de Excel
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

                // Descargar
                XLSX.writeFile(wb, generateFileName('Inventario_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Inventario exportado: ${data.length} productos`, 'success');
            } catch (error) {
                console.error('Error exportando inventario:', error);
                exportInventarioBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportInventarioBtn.disabled = false;
                showToast('Error al exportar inventario', 'error');
            }
        });
    }

    // ============================================================
    // 2. EXPORTAR CLIENTES
    // ============================================================
    const exportClientesBtn = document.getElementById('export-clientes-btn');
    if (exportClientesBtn) {
        exportClientesBtn.addEventListener('click', async () => {
            try {
                const btn = exportClientesBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                const clientesSnapshot = await getDocs(collection(db, 'clientes'));
                const data = [];

                clientesSnapshot.forEach(doc => {
                    const cliente = doc.data();
                    data.push({
                        'Cédula': cliente.cedula || '',
                        'Nombre': cliente.nombre || '',
                        'Celular': cliente.celular || '',
                        'Dirección': cliente.direccion || '',
                        'Fecha Registro': formatDate(cliente.fechaRegistro)
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
                XLSX.writeFile(wb, generateFileName('Clientes_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Clientes exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando clientes:', error);
                exportClientesBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportClientesBtn.disabled = false;
                showToast('Error al exportar clientes', 'error');
            }
        });
    }

    // ============================================================
    // 3. EXPORTAR VENTAS
    // ============================================================
    const exportVentasBtn = document.getElementById('export-ventas-btn');
    if (exportVentasBtn) {
        exportVentasBtn.addEventListener('click', async () => {
            try {
                const btn = exportVentasBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                const ventasSnapshot = await getDocs(query(collection(db, 'ventas'), orderBy('fecha', 'desc')));
                const data = [];

                ventasSnapshot.forEach(doc => {
                    const venta = doc.data();
                    const productosStr = venta.productos ?
                        venta.productos.map(p => `${p.nombre} (${p.cantidad})`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(venta.fecha),
                        'Cliente': venta.clienteNombre || '',
                        'Productos': productosStr,
                        'Subtotal': venta.subtotal || 0,
                        'Descuento': venta.descuento || 0,
                        'Total': venta.total || 0,
                        'Método Pago': venta.metodoPago || '',
                        'Estado': venta.estado || 'completada',
                        'Requiere Envío': venta.requiereEnvio ? 'Sí' : 'No',
                        'Repartidor': venta.repartidorNombre || '',
                        'Costo Envío': venta.costoEnvio || 0
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
                XLSX.writeFile(wb, generateFileName('Ventas_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Ventas exportadas: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando ventas:', error);
                exportVentasBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportVentasBtn.disabled = false;
                showToast('Error al exportar ventas', 'error');
            }
        });
    }

    // ============================================================
    // 4. EXPORTAR FINANZAS
    // ============================================================
    const exportFinanzasBtn = document.getElementById('export-finanzas-btn');
    if (exportFinanzasBtn) {
        exportFinanzasBtn.addEventListener('click', async () => {
            try {
                const btn = exportFinanzasBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                const finanzasSnapshot = await getDocs(query(collection(db, 'finanzas'), orderBy('fecha', 'desc')));
                const data = [];

                finanzasSnapshot.forEach(doc => {
                    const registro = doc.data();
                    data.push({
                        'Fecha': formatDate(registro.fecha),
                        'Tipo': registro.tipo || '',
                        'Monto': registro.monto || 0,
                        'Método': registro.metodo || registro.metodoPago || '',
                        'Descripción': registro.descripcion || '',
                        'Categoría': registro.categoria || ''
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Finanzas');
                XLSX.writeFile(wb, generateFileName('Finanzas_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Finanzas exportadas: ${data.length} registros`, 'success');
            } catch (error) {
                console.error('Error exportando finanzas:', error);
                exportFinanzasBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportFinanzasBtn.disabled = false;
                showToast('Error al exportar finanzas', 'error');
            }
        });
    }

    // ============================================================
    // 5. EXPORTAR APARTADOS
    // ============================================================
    const exportApartadosBtn = document.getElementById('export-apartados-btn');
    if (exportApartadosBtn) {
        exportApartadosBtn.addEventListener('click', async () => {
            try {
                const btn = exportApartadosBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
                const data = [];

                apartadosSnapshot.forEach(doc => {
                    const apartado = doc.data();
                    const productosStr = apartado.productos ?
                        apartado.productos.map(p => `${p.nombre} (${p.cantidad})`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(apartado.fecha),
                        'Cliente': apartado.clienteNombre || '',
                        'Productos': productosStr,
                        'Total': apartado.total || 0,
                        'Abono': apartado.abono || 0,
                        'Saldo': apartado.saldo || 0,
                        'Estado': apartado.estado || '',
                        'Vence': formatDate(apartado.fechaVencimiento)
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Apartados');
                XLSX.writeFile(wb, generateFileName('Apartados_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Apartados exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando apartados:', error);
                exportApartadosBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportApartadosBtn.disabled = false;
                showToast('Error al exportar apartados', 'error');
            }
        });
    }

    // ============================================================
    // 6. EXPORTAR PEDIDOS WEB
    // ============================================================
    const exportPedidosBtn = document.getElementById('export-pedidos-btn');
    if (exportPedidosBtn) {
        exportPedidosBtn.addEventListener('click', async () => {
            try {
                const btn = exportPedidosBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;

                const pedidosSnapshot = await getDocs(query(collection(db, 'pedidos'), orderBy('createdAt', 'desc')));
                const data = [];

                pedidosSnapshot.forEach(doc => {
                    const pedido = doc.data();
                    const productosStr = pedido.items ?
                        pedido.items.map(p => `${p.nombre} x${p.cantidad}`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(pedido.createdAt),
                        'Cliente': pedido.cliente?.nombre || '',
                        'Celular': pedido.cliente?.celular || '',
                        'Dirección': pedido.cliente?.direccion || '',
                        'Productos': productosStr,
                        'Total': pedido.total || 0,
                        'Estado': pedido.estado || '',
                        'Método Pago': pedido.metodoPago || ''
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Pedidos Web');
                XLSX.writeFile(wb, generateFileName('PedidosWeb_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Pedidos exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando pedidos:', error);
                exportPedidosBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportPedidosBtn.disabled = false;
                showToast('Error al exportar pedidos', 'error');
            }
        });
    }

    // ============================================================
    // 7. BACKUP COMPLETO
    // ============================================================
    const exportBackupBtn = document.getElementById('export-backup-completo-btn');
    const backupSpinner = document.getElementById('backup-spinner');
    const backupStatus = document.getElementById('backup-status');

    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', async () => {
            try {
                const btn = exportBackupBtn;
                btn.disabled = true;
                backupSpinner?.classList.remove('d-none');

                const wb = XLSX.utils.book_new();

                // 1. Productos
                if (backupStatus) backupStatus.textContent = 'Exportando productos...';
                const productosSnapshot = await getDocs(collection(db, 'productos'));
                const categoriasSnapshot = await getDocs(collection(db, 'categorias'));
                const categoriasMap = new Map();
                categoriasSnapshot.forEach(doc => {
                    categoriasMap.set(doc.id, doc.data().nombre);
                });

                const productosData = [];
                productosSnapshot.forEach(doc => {
                    const producto = doc.data();
                    const categoria = categoriasMap.get(producto.categoriaId) || 'Sin categoría';

                    if (producto.variaciones && producto.variaciones.length > 0) {
                        producto.variaciones.forEach(variacion => {
                            productosData.push({
                                'Código': producto.codigo || '',
                                'Nombre': producto.nombre || '',
                                'Categoría': categoria,
                                'Talla': variacion.talla || '',
                                'Color': variacion.color || '',
                                'Stock': variacion.stock || 0,
                                'Costo': producto.costoCompra || 0,
                                'Precio Detal': producto.precioDetal || 0,
                                'Precio Mayor': producto.precioMayor || 0
                            });
                        });
                    }
                });
                const wsProductos = XLSX.utils.json_to_sheet(productosData);
                XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos');

                // 2. Clientes
                if (backupStatus) backupStatus.textContent = 'Exportando clientes...';
                const clientesSnapshot = await getDocs(collection(db, 'clientes'));
                const clientesData = [];
                clientesSnapshot.forEach(doc => {
                    const cliente = doc.data();
                    clientesData.push({
                        'Cédula': cliente.cedula || '',
                        'Nombre': cliente.nombre || '',
                        'Celular': cliente.celular || '',
                        'Dirección': cliente.direccion || ''
                    });
                });
                const wsClientes = XLSX.utils.json_to_sheet(clientesData);
                XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes');

                // 3. Ventas
                if (backupStatus) backupStatus.textContent = 'Exportando ventas...';
                const ventasSnapshot = await getDocs(collection(db, 'ventas'));
                const ventasData = [];
                ventasSnapshot.forEach(doc => {
                    const venta = doc.data();
                    ventasData.push({
                        'Fecha': formatDate(venta.fecha),
                        'Cliente': venta.clienteNombre || '',
                        'Total': venta.total || 0,
                        'Método Pago': venta.metodoPago || ''
                    });
                });
                const wsVentas = XLSX.utils.json_to_sheet(ventasData);
                XLSX.utils.book_append_sheet(wb, wsVentas, 'Ventas');

                // 4. Finanzas
                if (backupStatus) backupStatus.textContent = 'Exportando finanzas...';
                const finanzasSnapshot = await getDocs(collection(db, 'finanzas'));
                const finanzasData = [];
                finanzasSnapshot.forEach(doc => {
                    const registro = doc.data();
                    finanzasData.push({
                        'Fecha': formatDate(registro.fecha),
                        'Tipo': registro.tipo || '',
                        'Monto': registro.monto || 0,
                        'Descripción': registro.descripcion || ''
                    });
                });
                const wsFinanzas = XLSX.utils.json_to_sheet(finanzasData);
                XLSX.utils.book_append_sheet(wb, wsFinanzas, 'Finanzas');

                // 5. Apartados
                if (backupStatus) backupStatus.textContent = 'Exportando apartados...';
                const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
                const apartadosData = [];
                apartadosSnapshot.forEach(doc => {
                    const apartado = doc.data();
                    apartadosData.push({
                        'Fecha': formatDate(apartado.fecha),
                        'Cliente': apartado.clienteNombre || '',
                        'Total': apartado.total || 0,
                        'Abono': apartado.abono || 0,
                        'Saldo': apartado.saldo || 0,
                        'Estado': apartado.estado || ''
                    });
                });
                const wsApartados = XLSX.utils.json_to_sheet(apartadosData);
                XLSX.utils.book_append_sheet(wb, wsApartados, 'Apartados');

                // 6. Categorías
                if (backupStatus) backupStatus.textContent = 'Exportando categorías...';
                const categoriasData = [];
                categoriasSnapshot.forEach(doc => {
                    categoriasData.push({
                        'Nombre': doc.data().nombre || ''
                    });
                });
                const wsCategorias = XLSX.utils.json_to_sheet(categoriasData);
                XLSX.utils.book_append_sheet(wb, wsCategorias, 'Categorías');

                // 7. Proveedores
                if (backupStatus) backupStatus.textContent = 'Exportando proveedores...';
                const proveedoresSnapshot = await getDocs(collection(db, 'proveedores'));
                const proveedoresData = [];
                proveedoresSnapshot.forEach(doc => {
                    const proveedor = doc.data();
                    proveedoresData.push({
                        'Nombre': proveedor.nombre || '',
                        'Contacto': proveedor.contacto || '',
                        'Teléfono': proveedor.telefono || ''
                    });
                });
                const wsProveedores = XLSX.utils.json_to_sheet(proveedoresData);
                XLSX.utils.book_append_sheet(wb, wsProveedores, 'Proveedores');

                // 8. Pedidos Web
                if (backupStatus) backupStatus.textContent = 'Exportando pedidos web...';
                const pedidosSnapshot = await getDocs(collection(db, 'pedidos'));
                const pedidosData = [];
                pedidosSnapshot.forEach(doc => {
                    const pedido = doc.data();
                    pedidosData.push({
                        'Fecha': formatDate(pedido.createdAt),
                        'Cliente': pedido.cliente?.nombre || '',
                        'Total': pedido.total || 0,
                        'Estado': pedido.estado || ''
                    });
                });
                const wsPedidos = XLSX.utils.json_to_sheet(pedidosData);
                XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos Web');

                // Descargar
                if (backupStatus) backupStatus.textContent = 'Generando archivo...';
                XLSX.writeFile(wb, generateFileName('BackupCompleto_MishellBoutique'));

                backupSpinner?.classList.add('d-none');
                if (backupStatus) backupStatus.textContent = '✅ Backup completado';
                btn.disabled = false;

                setTimeout(() => {
                    if (backupStatus) backupStatus.textContent = '';
                }, 3000);

                showToast('✅ Backup completo descargado exitosamente', 'success');
            } catch (error) {
                console.error('Error en backup completo:', error);
                backupSpinner?.classList.add('d-none');
                if (backupStatus) backupStatus.textContent = '❌ Error';
                exportBackupBtn.disabled = false;
                showToast('Error al generar backup completo', 'error');
            }
        });
    }

    // ============================================================
    // 8. ACTUALIZAR CONTADORES
    // ============================================================
    async function actualizarContadores() {
        try {
            // Productos
            const productosSnapshot = await getDocs(collection(db, 'productos'));
            let totalProductos = 0;
            productosSnapshot.forEach(doc => {
                const producto = doc.data();
                if (producto.variaciones && producto.variaciones.length > 0) {
                    totalProductos += producto.variaciones.length;
                } else {
                    totalProductos += 1;
                }
            });
            const inventarioCount = document.getElementById('export-inventario-count');
            if (inventarioCount) inventarioCount.textContent = `${totalProductos} productos`;

            // Clientes
            const clientesSnapshot = await getDocs(collection(db, 'clientes'));
            const clientesCount = document.getElementById('export-clientes-count');
            if (clientesCount) clientesCount.textContent = `${clientesSnapshot.size} clientes`;

            // Ventas
            const ventasSnapshot = await getDocs(collection(db, 'ventas'));
            const ventasCount = document.getElementById('export-ventas-count');
            if (ventasCount) ventasCount.textContent = `${ventasSnapshot.size} ventas`;

            // Finanzas
            const finanzasSnapshot = await getDocs(collection(db, 'finanzas'));
            const finanzasCount = document.getElementById('export-finanzas-count');
            if (finanzasCount) finanzasCount.textContent = `${finanzasSnapshot.size} registros`;

            // Apartados
            const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
            const apartadosCount = document.getElementById('export-apartados-count');
            if (apartadosCount) apartadosCount.textContent = `${apartadosSnapshot.size} apartados`;

            // Pedidos
            const pedidosSnapshot = await getDocs(collection(db, 'pedidos'));
            const pedidosCount = document.getElementById('export-pedidos-count');
            if (pedidosCount) pedidosCount.textContent = `${pedidosSnapshot.size} pedidos`;

        } catch (error) {
            console.error('Error actualizando contadores de backup:', error);
        }
    }

    // Actualizar contadores al cargar
    actualizarContadores();

    console.log("✅ Sistema de Backup/Exportación inicializado");
})();

// ============================================================
// SISTEMA DE METAS FINANCIERAS CON IA
// ============================================================
(function() {
    console.log("🎯 Inicializando Sistema de Metas Financieras con IA...");

    // Toggle formulario de crear meta
    const btnToggleCrearMeta = document.getElementById('btn-toggle-crear-meta');
    const formCrearMeta = document.getElementById('form-crear-meta');

    if (btnToggleCrearMeta && formCrearMeta) {
        btnToggleCrearMeta.addEventListener('click', () => {
            const isHidden = formCrearMeta.style.display === 'none';
            formCrearMeta.style.display = isHidden ? 'block' : 'none';
            btnToggleCrearMeta.querySelector('i').className = isHidden ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
        });
    }

    // Guardar nueva meta
    const btnGuardarMeta = document.getElementById('btn-guardar-meta');
    if (btnGuardarMeta) {
        btnGuardarMeta.addEventListener('click', async () => {
            const nombre = document.getElementById('meta-nombre').value.trim();
            const monto = parseFloat(eliminarFormatoNumero(document.getElementById('meta-monto').value));
            const fecha = document.getElementById('meta-fecha').value;

            if (!nombre || !monto || !fecha) {
                alert('Por favor completa todos los campos');
                return;
            }

            try {
                await addDoc(metasCollection, {
                    nombre: nombre,
                    montoObjetivo: monto,
                    fechaObjetivo: fecha,
                    fechaCreacion: serverTimestamp(),
                    activa: true
                });

                // Limpiar formulario
                document.getElementById('meta-nombre').value = '';
                document.getElementById('meta-monto').value = '';
                document.getElementById('meta-fecha').value = '';
                formCrearMeta.style.display = 'none';
                btnToggleCrearMeta.querySelector('i').className = 'bi bi-chevron-down';

                alert('✅ Meta creada exitosamente');
            } catch (error) {
                console.error('Error guardando meta:', error);
                alert('❌ Error al crear la meta');
            }
        });
    }

    // Función para calcular ventas totales en un rango de fechas
    async function calcularVentasEnRango(fechaDesde, fechaHasta) {
        try {
            const ventasSnapshot = await getDocs(salesCollection);
            let totalVentas = 0;

            ventasSnapshot.forEach(doc => {
                const venta = doc.data();
                const fechaVenta = venta.timestamp?.toDate();

                if (fechaVenta && fechaVenta >= fechaDesde && fechaVenta <= fechaHasta) {
                    totalVentas += parseFloat(venta.total || 0);
                }
            });

            return totalVentas;
        } catch (error) {
            console.error('Error calculando ventas:', error);
            return 0;
        }
    }

    // Función para obtener datos de inventario
    async function obtenerDatosInventario() {
        try {
            const productosSnapshot = await getDocs(productsCollection);
            let inversionTotal = 0;
            let valorPotencialDetal = 0;
            let productosConStock = [];
            let productosSinStock = [];

            productosSnapshot.forEach(doc => {
                const producto = doc.data();
                const costoCompra = parseFloat(producto.costoCompra) || 0;
                const precioDetal = parseFloat(producto.precioDetal) || 0;
                const variaciones = producto.variaciones || [];

                const stockTotal = variaciones.reduce((sum, v) =>
                    sum + (parseInt(v.stock, 10) || 0), 0);

                inversionTotal += costoCompra * stockTotal;
                valorPotencialDetal += precioDetal * stockTotal;

                if (stockTotal > 0) {
                    productosConStock.push({
                        nombre: producto.nombre,
                        stock: stockTotal,
                        costoUnitario: costoCompra,
                        precioUnitario: precioDetal,
                        utilidadUnitaria: precioDetal - costoCompra,
                        inversionTotal: costoCompra * stockTotal
                    });
                } else {
                    productosSinStock.push(producto.nombre);
                }
            });

            // Ordenar productos por utilidad unitaria
            productosConStock.sort((a, b) => b.utilidadUnitaria - a.utilidadUnitaria);

            return {
                inversionTotal,
                valorPotencialDetal,
                utilidadPotencial: valorPotencialDetal - inversionTotal,
                productosConStock: productosConStock.slice(0, 10), // Top 10
                productosSinStock,
                totalProductosConStock: productosConStock.length
            };
        } catch (error) {
            console.error('Error obteniendo datos de inventario:', error);
            return null;
        }
    }

    // Función para generar recomendaciones con IA (Claude)
    async function generarRecomendacionesIA(meta, ventasActuales, datosInventario) {
        const diasRestantes = Math.ceil((new Date(meta.fechaObjetivo) - new Date()) / (1000 * 60 * 60 * 24));
        const faltante = meta.montoObjetivo - ventasActuales;
        const ventasDiariasNecesarias = faltante / diasRestantes;

        // Por ahora, generar recomendaciones locales (sin API externa)
        // TODO: Integrar con Claude API cuando esté disponible
        const recomendaciones = [];

        if (faltante > 0) {
            recomendaciones.push(`📊 **Análisis**: Te faltan ${formatoMoneda.format(faltante)} para alcanzar tu meta.`);
            recomendaciones.push(`⏰ **Tiempo**: Tienes ${diasRestantes} días restantes.`);
            recomendaciones.push(`💰 **Meta diaria**: Necesitas vender ${formatoMoneda.format(ventasDiariasNecesarias)} por día.`);

            if (datosInventario) {
                recomendaciones.push(`\n📦 **Tu inventario actual**:`);
                recomendaciones.push(`- Inversión total: ${formatoMoneda.format(datosInventario.inversionTotal)}`);
                recomendaciones.push(`- Utilidad potencial: ${formatoMoneda.format(datosInventario.utilidadPotencial)}`);

                if (datosInventario.productosConStock.length > 0) {
                    recomendaciones.push(`\n💎 **Productos más rentables para priorizar**:`);
                    datosInventario.productosConStock.slice(0, 5).forEach((p, i) => {
                        recomendaciones.push(`${i + 1}. **${p.nombre}**: Utilidad de ${formatoMoneda.format(p.utilidadUnitaria)} por unidad (${p.stock} disponibles)`);
                    });
                }

                recomendaciones.push(`\n✅ **Recomendaciones estratégicas**:`);
                recomendaciones.push(`1. Enfócate en vender los productos con mayor margen de utilidad`);
                recomendaciones.push(`2. Considera promociones en productos de bajo movimiento`);
                recomendaciones.push(`3. Analiza reabastecer productos que se agotan rápido`);

                if (datosInventario.productosSinStock.length > 0) {
                    recomendaciones.push(`4. Tienes ${datosInventario.productosSinStock.length} productos sin stock - considera reabastecerlos`);
                }
            }
        } else {
            recomendaciones.push(`🎉 **¡Felicitaciones!** Ya alcanzaste tu meta con ${formatoMoneda.format(Math.abs(faltante))} de excedente.`);
        }

        return recomendaciones.join('\n');
    }

    // Función para renderizar una meta
    async function renderizarMeta(metaDoc) {
        const meta = metaDoc.data();
        const metaId = metaDoc.id;

        // Calcular progreso
        const fechaInicio = meta.fechaCreacion?.toDate() || new Date();
        const fechaFin = new Date(meta.fechaObjetivo);
        const ahora = new Date();

        const ventasActuales = await calcularVentasEnRango(fechaInicio, ahora);
        const progreso = (ventasActuales / meta.montoObjetivo) * 100;
        const diasRestantes = Math.ceil((fechaFin - ahora) / (1000 * 60 * 60 * 24));

        const metaCard = document.createElement('div');
        metaCard.className = 'card shadow-sm mb-3 meta-card';
        metaCard.innerHTML = `
            <div class="card-header bg-gradient-meta text-white">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-0"><i class="bi bi-bullseye"></i> ${meta.nombre}</h6>
                    <div>
                        <button class="btn btn-sm btn-light me-2" onclick="toggleRecomendaciones('${metaId}')">
                            <i class="bi bi-lightbulb"></i> IA
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarMeta('${metaId}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="row mb-3">
                    <div class="col-md-4">
                        <small class="text-muted">Meta</small>
                        <h5 class="mb-0 fw-bold">${formatoMoneda.format(meta.montoObjetivo)}</h5>
                    </div>
                    <div class="col-md-4">
                        <small class="text-muted">Progreso</small>
                        <h5 class="mb-0 fw-bold text-primary">${formatoMoneda.format(ventasActuales)}</h5>
                    </div>
                    <div class="col-md-4">
                        <small class="text-muted">Fecha Objetivo</small>
                        <h5 class="mb-0 fw-bold">${new Date(meta.fechaObjetivo).toLocaleDateString('es-ES')}</h5>
                        <small class="text-muted">${diasRestantes > 0 ? diasRestantes + ' días restantes' : 'Fecha alcanzada'}</small>
                    </div>
                </div>
                <div class="progress mb-2" style="height: 25px;">
                    <div class="progress-bar ${progreso >= 100 ? 'bg-success' : 'bg-primary'}"
                         role="progressbar"
                         style="width: ${Math.min(progreso, 100)}%"
                         aria-valuenow="${progreso}"
                         aria-valuemin="0"
                         aria-valuemax="100">
                        ${progreso.toFixed(1)}%
                    </div>
                </div>
                <div id="recomendaciones-${metaId}" style="display: none;" class="mt-3 p-3 bg-light rounded">
                    <div class="d-flex align-items-center mb-2">
                        <div class="spinner-border spinner-border-sm me-2" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <small>Generando recomendaciones con IA...</small>
                    </div>
                </div>
            </div>
        `;

        return metaCard;
    }

    // Función global para toggle de recomendaciones
    window.toggleRecomendaciones = async function(metaId) {
        const divRecomendaciones = document.getElementById(`recomendaciones-${metaId}`);

        if (divRecomendaciones.style.display === 'none') {
            divRecomendaciones.style.display = 'block';

            // Obtener datos de la meta
            const metaDoc = await getDoc(doc(db, 'metas', metaId));
            const meta = metaDoc.data();

            // Calcular ventas actuales
            const fechaInicio = meta.fechaCreacion?.toDate() || new Date();
            const ventasActuales = await calcularVentasEnRango(fechaInicio, new Date());

            // Obtener datos de inventario
            const datosInventario = await obtenerDatosInventario();

            // Generar recomendaciones
            const recomendaciones = await generarRecomendacionesIA(meta, ventasActuales, datosInventario);

            divRecomendaciones.innerHTML = `
                <h6 class="mb-3"><i class="bi bi-robot"></i> Recomendaciones de IA</h6>
                <div style="white-space: pre-line; font-size: 0.9rem;">${recomendaciones}</div>
            `;
        } else {
            divRecomendaciones.style.display = 'none';
        }
    };

    // Función global para eliminar meta
    window.eliminarMeta = async function(metaId) {
        if (!confirm('¿Estás seguro de eliminar esta meta?')) return;

        try {
            await deleteDoc(doc(db, 'metas', metaId));
            alert('✅ Meta eliminada');
        } catch (error) {
            console.error('Error eliminando meta:', error);
            alert('❌ Error al eliminar la meta');
        }
    };

    // Cargar metas en tiempo real
    const metasContainer = document.getElementById('metas-container');
    if (metasContainer) {
        onSnapshot(query(metasCollection, where('activa', '==', true), orderBy('fechaCreacion', 'desc')),
            async (snapshot) => {
                metasContainer.innerHTML = '';

                if (snapshot.empty) {
                    metasContainer.innerHTML = `
                        <div class="alert alert-info">
                            <i class="bi bi-info-circle"></i> No tienes metas creadas.
                            ¡Crea tu primera meta para comenzar a planificar tu éxito!
                        </div>
                    `;
                    return;
                }

                for (const metaDoc of snapshot.docs) {
                    const metaCard = await renderizarMeta(metaDoc);
                    metasContainer.appendChild(metaCard);
                }
            }
        );
    }

    console.log("✅ Sistema de Metas Financieras con IA inicializado");
})();

// ========================================================================
// MÓDULO: CARGUE MASIVO DE PRODUCTOS DESDE EXCEL
// ========================================================================
(() => {
    console.log("📦 Inicializando módulo de Cargue Masivo de Productos...");

    // --- Collection References ---
    const historialCarguesCollection = collection(db, 'historial_cargues');

    // --- DOM References ---
    const inputArchivo = document.getElementById('input-archivo-excel');
    const btnSeleccionarArchivo = document.getElementById('btn-seleccionar-archivo');
    const btnCancelarCargue = document.getElementById('btn-cancelar-cargue');
    const btnProcesarDatos = document.getElementById('btn-procesar-datos');
    const btnVolverEdicion = document.getElementById('btn-volver-edicion');
    const btnConfirmarCarga = document.getElementById('btn-confirmar-carga');

    const pasoSubir = document.getElementById('paso-subir');
    const pasoVistaPrevia = document.getElementById('paso-vista-previa');
    const pasoConfirmacion = document.getElementById('paso-confirmacion');
    const cargueLoader = document.getElementById('cargue-loader');

    const tbodyVistaPrevia = document.getElementById('tbody-vista-previa');
    const nombreArchivoEl = document.getElementById('nombre-archivo');
    const totalFilasEl = document.getElementById('total-filas');
    const filasValidasEl = document.getElementById('filas-validas');
    const filasErroresEl = document.getElementById('filas-errores');

    // --- Variables globales del módulo ---
    let datosExcel = []; // Datos cargados del Excel
    let productosAgrupados = []; // Productos agrupados con variaciones
    let categoriasMap = new Map(); // Mapa de categorías
    let proveedoresMap = new Map(); // Mapa de proveedores
    let productosExistentes = []; // Productos ya en Firestore

    // =====================================================================
    // 1️⃣ FUNCIÓN: LEER EXCEL
    // =====================================================================
    async function leerExcel(archivo) {
        mostrarLoader('Leyendo archivo...', 10);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
                    const datos = XLSX.utils.sheet_to_json(primeraHoja, { raw: false });

                    // Validar que el archivo tenga las columnas requeridas
                    if (datos.length === 0) {
                        reject(new Error('El archivo está vacío'));
                        return;
                    }

                    // Normalizar nombres de columnas (trim y lowercase)
                    const datosNormalizados = datos.map(fila => {
                        const filaNormalizada = {};
                        for (let key in fila) {
                            const keyNormalizada = key.trim().toLowerCase();
                            filaNormalizada[keyNormalizada] = fila[key];
                        }
                        return filaNormalizada;
                    });

                    const columnas = Object.keys(datosNormalizados[0]);
                    const columnasObligatorias = ['nombre', 'categoria', 'proveedor', 'precio_detal', 'precio_mayor', 'talla', 'color', 'cantidad'];

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

            reader.onerror = function() {
                reject(new Error('Error al leer el archivo'));
            };

            reader.readAsArrayBuffer(archivo);
        });
    }

    // =====================================================================
    // 2️⃣ FUNCIÓN: VALIDAR DATOS
    // =====================================================================
    function validarDatos(fila, index) {
        const errores = [];

        // Validar nombre
        if (!fila.nombre || fila.nombre.trim() === '') {
            errores.push('Nombre vacío');
        }

        // Validar categoría
        if (!fila.categoria || fila.categoria.trim() === '') {
            errores.push('Categoría vacía');
        }

        // Validar proveedor
        if (!fila.proveedor || fila.proveedor.trim() === '') {
            errores.push('Proveedor vacío');
        }

        // Validar precios
        const precioDetal = parseFloat(fila.precio_detal);
        const precioMayor = parseFloat(fila.precio_mayor);

        if (isNaN(precioDetal) || precioDetal < 0) {
            errores.push('Precio detal inválido');
        }
        if (isNaN(precioMayor) || precioMayor < 0) {
            errores.push('Precio mayor inválido');
        }

        // Costo: opcional, si no existe se calcula como 50% del precio_detal
        let costo = parseFloat(fila.costo);
        if (isNaN(costo) || costo < 0) {
            costo = precioDetal * 0.5; // 50% del precio detal por defecto
        }

        // Descripción: opcional, si no existe se usa cadena vacía
        const descripcion = fila.descripcion?.trim() || '';

        // Código: opcional, si existe se usa para buscar producto existente
        const codigo = fila.codigo?.trim() || '';

        // Validar cantidad
        const cantidad = parseInt(fila.cantidad);
        if (isNaN(cantidad) || cantidad <= 0) {
            errores.push('Cantidad inválida o cero');
        }

        return {
            index: index,
            nombre: fila.nombre?.trim() || '',
            descripcion: descripcion,
            categoria: fila.categoria?.trim() || '',
            proveedor: fila.proveedor?.trim() || '',
            codigo: codigo,
            costo: costo,
            precio_detal: precioDetal,
            precio_mayor: precioMayor,
            talla: fila.talla?.trim() || '',
            color: fila.color?.trim() || '',
            cantidad: cantidad,
            errores: errores,
            valida: errores.length === 0
        };
    }

    // =====================================================================
    // 3️⃣ FUNCIÓN: AGRUPAR VARIACIONES
    // =====================================================================
    function agruparVariaciones(datos) {
        mostrarLoader('Agrupando productos y variaciones...', 50);

        const grupos = new Map();

        datos.forEach(fila => {
            if (!fila.valida) return; // Ignorar filas con errores

            // Clave única: código (si existe) o nombre + categoria + proveedor
            let clave;
            if (fila.codigo) {
                // Si tiene código, agrupar por código
                clave = `codigo_${fila.codigo.trim().toLowerCase()}`;
            } else {
                // Si no tiene código, agrupar por nombre + categoria + proveedor
                clave = `${fila.nombre.trim().toLowerCase()}_${fila.categoria.trim().toLowerCase()}_${fila.proveedor.trim().toLowerCase()}`;
            }

            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    nombre: fila.nombre.trim(),
                    descripcion: fila.descripcion.trim(),
                    categoria: fila.categoria.trim(),
                    proveedor: fila.proveedor.trim(),
                    codigo: fila.codigo || '',
                    costo: fila.costo,
                    precio_detal: fila.precio_detal,
                    precio_mayor: fila.precio_mayor,
                    variaciones: []
                });
            }

            // Agregar variación
            grupos.get(clave).variaciones.push({
                talla: fila.talla?.trim() || '',
                color: fila.color?.trim() || '',
                cantidad: fila.cantidad
            });
        });

        actualizarProgreso(70);
        return Array.from(grupos.values());
    }

    // =====================================================================
    // 4️⃣ FUNCIÓN: VALIDAR DUPLICADOS EN FIRESTORE
    // =====================================================================
    async function validarDuplicadosFirestore(productos) {
        mostrarLoader('Validando duplicados en inventario...', 80);

        try {
            // Asegurar que tenemos las categorías y proveedores cargados
            if (categoriasMap.size === 0 || proveedoresMap.size === 0) {
                await cargarDatosIniciales();
            }

            // Cargar todos los productos existentes
            const snapshot = await getDocs(productsCollection);
            productosExistentes = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();

                // Convertir IDs a nombres
                const categoriaNombre = categoriasMap.get(data.categoriaId)?.nombre || '';
                const proveedorNombre = proveedoresMap.get(data.proveedorId)?.nombre || '';

                productosExistentes.push({
                    id: docSnap.id,
                    nombre: data.nombre?.toLowerCase().trim(),
                    categoria: categoriaNombre.toLowerCase().trim(),
                    proveedor: proveedorNombre.toLowerCase().trim(),
                    categoriaId: data.categoriaId,
                    proveedorId: data.proveedorId,
                    stock: data.stock,
                    variaciones: data.variaciones,
                    nombreOriginal: data.nombre,
                    categoriaOriginal: categoriaNombre,
                    proveedorOriginal: proveedorNombre,
                    ...data
                });
            });

            console.log(`✅ Productos existentes cargados: ${productosExistentes.length}`);
            console.log('📋 Lista de productos existentes:');
            productosExistentes.forEach(p => {
                console.log(`  - "${p.nombreOriginal}" | Código: "${p.codigo || 'SIN-CÓDIGO'}" | Cat: "${p.categoriaOriginal}" | Prov: "${p.proveedorOriginal}" | ID: ${p.id}`);
            });

            // Marcar duplicados - NUEVA LÓGICA: Buscar por CÓDIGO primero, luego por nombre
            productos.forEach(producto => {
                const nombreNorm = producto.nombre.toLowerCase().trim();
                const categoriaNorm = producto.categoria.toLowerCase().trim();
                const proveedorNorm = producto.proveedor.toLowerCase().trim();
                const codigoExcel = producto.codigo?.toLowerCase().trim() || '';

                console.log(`\n🔍 Verificando producto del Excel: "${producto.nombre}"`);
                if (codigoExcel) {
                    console.log(`   📌 Código del Excel: "${codigoExcel}"`);
                }
                console.log(`   Normalizado: nombre="${nombreNorm}" | cat="${categoriaNorm}" | prov="${proveedorNorm}"`);

                let productoEncontrado = null;

                // 1️⃣ BUSCAR PRIMERO POR CÓDIGO (si el Excel tiene código)
                if (codigoExcel) {
                    productoEncontrado = productosExistentes.find(existente => {
                        const codigoExistente = existente.codigo?.toLowerCase().trim() || '';
                        return codigoExistente === codigoExcel;
                    });

                    if (productoEncontrado) {
                        console.log(`   ✅ ENCONTRADO POR CÓDIGO: "${productoEncontrado.nombreOriginal}"`);
                        console.log(`      └─ Código: ${productoEncontrado.codigo}`);
                        console.log(`      └─ ID: ${productoEncontrado.id}`);
                        console.log(`      └─ Stock: ${productoEncontrado.stock || 0}`);
                        if (productoEncontrado.variaciones && productoEncontrado.variaciones.length > 0) {
                            console.log(`      └─ Variaciones: ${productoEncontrado.variaciones.map(v => `${v.talla}/${v.color} (${v.stock})`).join(', ')}`);
                        }

                        producto.esDuplicado = true;
                        producto.productoExistenteId = productoEncontrado.id;
                        producto.productoExistente = productoEncontrado;
                        producto.accionDuplicado = 'sumar';
                        producto.encontradoPorCodigo = true;
                    } else {
                        console.log(`   ⚠️  Código "${codigoExcel}" no encontrado en inventario`);
                    }
                }

                // 2️⃣ SI NO SE ENCONTRÓ POR CÓDIGO, BUSCAR POR NOMBRE
                if (!productoEncontrado) {
                    const productosMismoNombre = productosExistentes.filter(existente => existente.nombre === nombreNorm);

                    if (productosMismoNombre.length > 0) {
                        console.log(`   📌 Encontrado(s) ${productosMismoNombre.length} producto(s) con el mismo nombre:`);
                        productosMismoNombre.forEach(p => {
                            console.log(`      - Código: ${p.codigo || 'SIN-CÓDIGO'} | Cat: "${p.categoriaOriginal}" | Prov: "${p.proveedorOriginal}"`);
                        });

                        // Buscar match exacto (nombre + categoría + proveedor)
                        const matchExacto = productosMismoNombre.find(existente =>
                            existente.categoria === categoriaNorm &&
                            existente.proveedor === proveedorNorm
                        );

                        if (matchExacto) {
                            console.log(`   ✅ MATCH EXACTO encontrado con: "${matchExacto.nombreOriginal}"`);
                            console.log(`      └─ Código: ${matchExacto.codigo || 'SIN-CÓDIGO'}`);
                            console.log(`      └─ ID: ${matchExacto.id}`);

                            producto.esDuplicado = true;
                            producto.productoExistenteId = matchExacto.id;
                            producto.productoExistente = matchExacto;
                            producto.accionDuplicado = 'sumar';

                        } else {
                            // Nombre igual pero categoría/proveedor diferente
                            console.error(`   🚨 ERROR CRÍTICO: Ya existe un producto con el nombre "${producto.nombre}"`);
                            console.error(`      Excel tiene: Cat="${producto.categoria}" | Prov="${producto.proveedor}"`);
                            productosMismoNombre.forEach(p => {
                                console.error(`      Existente: Cat="${p.categoriaOriginal}" | Prov="${p.proveedorOriginal}" | Código: ${p.codigo || 'SIN-CÓDIGO'}`);
                            });
                            console.error(`   🚨 Se tratará como duplicado del PRIMERO encontrado para evitar crear producto duplicado`);

                            // FORZAR como duplicado usando el primer producto encontrado
                            const primerProducto = productosMismoNombre[0];
                            producto.esDuplicado = true;
                            producto.productoExistenteId = primerProducto.id;
                            producto.productoExistente = primerProducto;
                            producto.accionDuplicado = 'sumar';
                            producto.advertenciaCategoriaProveedor = true;
                        }
                    } else {
                        console.log(`   ✅ No existe producto con este nombre, se creará como NUEVO`);
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
            console.error('❌ Error al validar duplicados:', error);
            throw error;
        }
    }

    // =====================================================================
    // 5️⃣ FUNCIÓN: GUARDAR PRODUCTO EN FIRESTORE
    // =====================================================================
    async function guardarProductoFirestore(producto) {
        try {
            // Buscar o crear categoría
            let categoriaId = await buscarOCrearCategoria(producto.categoria);

            // Buscar o crear proveedor
            let proveedorId = await buscarOCrearProveedor(producto.proveedor);

            // Generar código autogenerado
            const codigo = await generarCodigoProducto();

            // Estructura del producto
            const nuevoProducto = {
                nombre: producto.nombre,
                descripcion: producto.descripcion,
                categoriaId: categoriaId,
                proveedorId: proveedorId,
                costoCompra: producto.costo,
                precioDetal: producto.precio_detal,
                precioMayor: producto.precio_mayor,
                codigo: codigo,
                visible: false, // Oculto por defecto en tienda virtual
                timestamp: serverTimestamp(),
                stock: 0, // Se actualiza con variaciones
                variaciones: []
            };

            // Crear producto
            const docRef = await addDoc(productsCollection, nuevoProducto);
            return docRef.id;

        } catch (error) {
            console.error('❌ Error al guardar producto:', error);
            throw error;
        }
    }

    // =====================================================================
    // 6️⃣ FUNCIÓN: GUARDAR VARIACIONES EN FIRESTORE
    // =====================================================================
    async function guardarVariacionesFirestore(productoId, variaciones) {
        try {
            const productoRef = doc(db, 'productos', productoId);

            // Si el producto tiene talla o color, crear variaciones
            const tieneVariaciones = variaciones.some(v => v.talla || v.color);

            if (tieneVariaciones) {
                const variacionesArray = variaciones.map(v => ({
                    talla: v.talla || 'Única',
                    color: v.color || 'Único',
                    stock: v.cantidad || 0,
                    sku: `${productoId.substring(0, 6).toUpperCase()}-${v.talla || 'U'}-${v.color || 'U'}`
                }));

                await updateDoc(productoRef, {
                    variaciones: variacionesArray
                });
            } else {
                // Sin variaciones, actualizar stock directo
                const stockTotal = variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                await updateDoc(productoRef, {
                    stock: stockTotal
                });
            }

        } catch (error) {
            console.error('❌ Error al guardar variaciones:', error);
            throw error;
        }
    }

    // =====================================================================
    // 7️⃣ FUNCIÓN: GUARDAR HISTORIAL
    // =====================================================================
    async function guardarHistorial(totalProductos, totalVariaciones, totalUnidades) {
        try {
            await addDoc(historialCarguesCollection, {
                fecha: serverTimestamp(),
                usuario: 'Admin', // Puedes cambiar esto por el usuario actual
                totalProductos: totalProductos,
                totalVariaciones: totalVariaciones,
                totalUnidades: totalUnidades
            });

            console.log('✅ Historial de cargue guardado');

        } catch (error) {
            console.error('❌ Error al guardar historial:', error);
        }
    }

    // =====================================================================
    // FUNCIONES AUXILIARES
    // =====================================================================
    async function buscarOCrearCategoria(nombreCategoria) {
        const nombreNormalizado = nombreCategoria.trim();

        console.log(`🔍 Buscando categoría: "${nombreNormalizado}"`);

        // Buscar en caché (case-insensitive)
        for (let [id, cat] of categoriasMap) {
            if (cat.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Categoría encontrada en caché: "${cat.nombre}" (ID: ${id})`);
                return id;
            }
        }

        // Buscar en Firestore (cargar todas y comparar en memoria porque Firestore no soporta case-insensitive)
        const snapshot = await getDocs(categoriesCollection);

        for (let doc of snapshot.docs) {
            const data = doc.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Categoría encontrada en Firestore: "${data.nombre}" (ID: ${doc.id})`);
                categoriasMap.set(doc.id, { id: doc.id, ...data });
                return doc.id;
            }
        }

        // Crear nueva categoría
        console.log(`➕ Creando nueva categoría: "${nombreNormalizado}"`);
        const docRef = await addDoc(categoriesCollection, {
            nombre: nombreNormalizado,
            timestamp: serverTimestamp()
        });

        categoriasMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        console.log(`✅ Categoría creada con ID: ${docRef.id}`);
        return docRef.id;
    }

    async function buscarOCrearProveedor(nombreProveedor) {
        const nombreNormalizado = nombreProveedor.trim();

        console.log(`🔍 Buscando proveedor: "${nombreNormalizado}"`);

        // Buscar en caché (case-insensitive)
        for (let [id, prov] of proveedoresMap) {
            if (prov.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Proveedor encontrado en caché: "${prov.nombre}" (ID: ${id})`);
                return id;
            }
        }

        // Buscar en Firestore (cargar todas y comparar en memoria)
        const snapshot = await getDocs(suppliersCollection);

        for (let doc of snapshot.docs) {
            const data = doc.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Proveedor encontrado en Firestore: "${data.nombre}" (ID: ${doc.id})`);
                proveedoresMap.set(doc.id, { id: doc.id, ...data });
                return doc.id;
            }
        }

        // Crear nuevo proveedor
        console.log(`➕ Creando nuevo proveedor: "${nombreNormalizado}"`);
        const docRef = await addDoc(suppliersCollection, {
            nombre: nombreNormalizado,
            contacto: '',
            telefono: '',
            timestamp: serverTimestamp()
        });

        proveedoresMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        console.log(`✅ Proveedor creado con ID: ${docRef.id}`);
        return docRef.id;
    }

    async function generarCodigoProducto() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `PROD-${timestamp}-${random}`;
    }

    function mostrarLoader(mensaje, progreso) {
        cargueLoader.style.display = 'flex';
        document.getElementById('loader-mensaje').textContent = mensaje;
        actualizarProgreso(progreso);
    }

    function ocultarLoader() {
        cargueLoader.style.display = 'none';
    }

    function actualizarProgreso(porcentaje) {
        const barra = document.getElementById('loader-progreso');
        const texto = document.getElementById('loader-porcentaje');
        barra.style.width = `${porcentaje}%`;
        texto.textContent = `${porcentaje}%`;
    }

    function mostrarPaso(paso) {
        pasoSubir.style.display = 'none';
        pasoVistaPrevia.style.display = 'none';
        pasoConfirmacion.style.display = 'none';

        paso.style.display = 'block';
    }

    // =====================================================================
    // FLUJO PRINCIPAL
    // =====================================================================

    // PASO 1: Seleccionar archivo
    btnSeleccionarArchivo.addEventListener('click', () => {
        inputArchivo.click();
    });

    inputArchivo.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;

        try {
            nombreArchivoEl.textContent = archivo.name;

            // Leer Excel
            const datos = await leerExcel(archivo);

            // Validar datos
            datosExcel = datos.map((fila, index) => validarDatos(fila, index));

            // Actualizar contadores
            totalFilasEl.textContent = datosExcel.length;
            filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
            filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;

            // Renderizar tabla
            renderizarTablaVistaPrevia();

            // Habilitar botón si hay filas válidas
            btnProcesarDatos.disabled = datosExcel.filter(f => f.valida).length === 0;

            ocultarLoader();
            mostrarPaso(pasoVistaPrevia);

        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar archivo: ' + error.message, 'error');
            console.error(error);
        }
    });

    // Renderizar tabla de vista previa
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
                <td contenteditable="true" data-index="${index}" data-field="proveedor">${fila.proveedor || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="costo">${fila.costo || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_detal">${fila.precio_detal || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_mayor">${fila.precio_mayor || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="talla">${fila.talla || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="color">${fila.color || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="cantidad">${fila.cantidad || 0}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" data-delete="${index}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;

            // Event: Editar celda
            tr.querySelectorAll('[contenteditable]').forEach(celda => {
                celda.addEventListener('blur', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    const field = e.target.dataset.field;
                    const valor = e.target.textContent.trim();

                    datosExcel[index][field] = valor;

                    // Re-validar
                    datosExcel[index] = validarDatos(datosExcel[index], index);

                    // Actualizar contadores
                    filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                    filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
                });
            });

            // Event: Eliminar fila
            tr.querySelector('[data-delete]').addEventListener('click', () => {
                datosExcel.splice(index, 1);
                renderizarTablaVistaPrevia();

                // Actualizar contadores
                totalFilasEl.textContent = datosExcel.length;
                filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
            });

            tbodyVistaPrevia.appendChild(tr);
        });
    }

    // PASO 2: Procesar datos
    btnProcesarDatos.addEventListener('click', async () => {
        try {
            // Agrupar variaciones
            const datosValidos = datosExcel.filter(f => f.valida);
            productosAgrupados = agruparVariaciones(datosValidos);

            // Validar duplicados
            productosAgrupados = await validarDuplicadosFirestore(productosAgrupados);

            // Calcular totales
            const totalProductos = productosAgrupados.length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) =>
                sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0
            );

            // Actualizar resumen
            document.getElementById('resumen-total-productos').textContent = totalProductos;
            document.getElementById('resumen-total-variaciones').textContent = totalVariaciones;
            document.getElementById('resumen-total-unidades').textContent = totalUnidades;

            // Separar duplicados normales vs duplicados con conflicto de categoría/proveedor
            const duplicadosConflicto = productosAgrupados.filter(p => p.esDuplicado && p.advertenciaCategoriaProveedor);
            const duplicadosNormales = productosAgrupados.filter(p => p.esDuplicado && !p.advertenciaCategoriaProveedor);

            // Mostrar advertencias de conflicto PRIMERO (más grave)
            if (duplicadosConflicto.length > 0) {
                const advertencias = duplicadosConflicto.map(producto => ({
                    producto: producto,
                    existentes: [producto.productoExistente]
                }));
                renderizarAdvertencias(advertencias);
                document.getElementById('seccion-advertencias').style.display = 'block';
            } else {
                document.getElementById('seccion-advertencias').style.display = 'none';
            }

            // Mostrar duplicados normales
            if (duplicadosNormales.length > 0) {
                document.getElementById('seccion-duplicados').style.display = 'block';
                renderizarDuplicados(duplicadosNormales);
            } else {
                document.getElementById('seccion-duplicados').style.display = 'none';
            }

            ocultarLoader();
            mostrarPaso(pasoConfirmacion);

        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar datos: ' + error.message, 'error');
            console.error(error);
        }
    });

    // Renderizar advertencias de nombres similares
    function renderizarAdvertencias(advertencias) {
        const contenedor = document.getElementById('lista-advertencias');
        contenedor.innerHTML = '';

        advertencias.forEach(({ producto, existentes }) => {
            const div = document.createElement('div');
            div.className = 'alert alert-danger mb-2 border-3';
            div.innerHTML = `
                <div class="d-flex align-items-start">
                    <i class="bi bi-x-octagon-fill me-2 flex-shrink-0 text-danger" style="font-size: 1.5rem;"></i>
                    <div class="flex-grow-1">
                        <h6 class="alert-heading mb-2">🚨 CONFLICTO DETECTADO: "${producto.nombre}"</h6>
                        <small class="d-block mb-2">Excel: Categoría: <strong>${producto.categoria}</strong> | Proveedor: <strong>${producto.proveedor}</strong></small>
                        <hr class="my-2">
                        <small class="d-block mb-1"><strong>⚠️ Ya existe(n) ${existentes.length} producto(s) con este nombre:</strong></small>
                        ${existentes.map(p => `
                            <div class="ms-3 mb-1 p-2 bg-white rounded">
                                <small class="d-block">
                                    <strong>Código: ${p.codigo || 'SIN-CÓDIGO'}</strong><br>
                                    Categoría: "${p.categoriaOriginal}" | Proveedor: "${p.proveedorOriginal}"
                                </small>
                            </div>
                        `).join('')}
                        <div class="alert alert-light mt-2 mb-0">
                            <small class="d-block fw-bold text-danger">
                                ⚠️ Las variaciones se agregarán al PRIMER producto existente para evitar duplicados.<br>
                                Si esto es incorrecto, CANCELA el cargue y corrige categoría/proveedor en el Excel.
                            </small>
                        </div>
                    </div>
                </div>
            `;
            contenedor.appendChild(div);
        });
    }

    // Renderizar lista de duplicados
    function renderizarDuplicados(duplicados) {
        const contenedor = document.getElementById('lista-duplicados');
        contenedor.innerHTML = '';

        duplicados.forEach((producto, index) => {
            const productoExistente = producto.productoExistente;

            // Calcular stock actual
            let stockActual = 0;
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                stockActual = productoExistente.variaciones.reduce((sum, v) => sum + (v.stock || 0), 0);
            } else {
                stockActual = productoExistente.stock || 0;
            }

            // Calcular unidades a agregar
            const unidadesNuevas = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);

            // Obtener variaciones existentes
            let variacionesExistentesHTML = '';
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                const variacionesTexto = productoExistente.variaciones.map(v => `${v.talla}/${v.color} (${v.stock})`).join(', ');
                variacionesExistentesHTML = `
                    <div class="col-12 mt-2">
                        <small class="text-muted d-block">Variaciones actuales:</small>
                        <small><strong>${variacionesTexto}</strong></small>
                    </div>
                `;
            }

            // Obtener variaciones nuevas del Excel
            let variacionesNuevasHTML = '';
            if (producto.variaciones && producto.variaciones.length > 0) {
                const variacionesTexto = producto.variaciones.map(v => `${v.talla}/${v.color} (${v.cantidad})`).join(', ');
                variacionesNuevasHTML = `
                    <div class="col-12 mt-2">
                        <small class="text-muted d-block">Variaciones del Excel:</small>
                        <small class="text-success"><strong>${variacionesTexto}</strong></small>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = 'card mb-2 border-warning';
            div.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">${producto.nombre}</h6>
                            <small class="text-muted d-block">Categoría: ${producto.categoria} | Proveedor: ${producto.proveedor}</small>
                            <small class="d-block mt-1">
                                <span class="badge bg-secondary">${productoExistente.codigo || 'SIN-CÓDIGO'}</span>
                                <span class="text-muted ms-2">ID: ${productoExistente.id}</span>
                            </small>
                        </div>
                        <span class="badge bg-warning text-dark">Duplicado</span>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <small class="text-muted d-block">Stock actual:</small>
                            <strong class="text-primary">${stockActual} unidades</strong>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">A cargar:</small>
                            <strong class="text-success">+${unidadesNuevas} unidades</strong>
                        </div>
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

            div.querySelector('select').addEventListener('change', (e) => {
                producto.accionDuplicado = e.target.value;
            });

            contenedor.appendChild(div);
        });
    }

    // PASO 3: Confirmar carga
    btnConfirmarCarga.addEventListener('click', async () => {
        try {
            mostrarLoader('Guardando productos en inventario...', 0);

            let contador = 0;
            const total = productosAgrupados.length;

            for (const producto of productosAgrupados) {
                if (producto.esDuplicado) {
                    if (producto.accionDuplicado === 'omitir') {
                        contador++;
                        continue;
                    }

                    // Actualizar producto existente
                    const productoRef = doc(db, 'productos', producto.productoExistenteId);
                    const productoExistente = producto.productoExistente;

                    // Verificar si el producto existente tiene variaciones
                    const tieneVariaciones = productoExistente.variaciones && productoExistente.variaciones.length > 0;

                    if (tieneVariaciones) {
                        // Producto con variaciones: actualizar cada variación
                        const variacionesActuales = [...productoExistente.variaciones];

                        producto.variaciones.forEach(nuevaVar => {
                            const tallaVar = nuevaVar.talla || 'Única';
                            const colorVar = nuevaVar.color || 'Único';

                            // Buscar si la variación ya existe
                            const indexExistente = variacionesActuales.findIndex(v =>
                                v.talla === tallaVar && v.color === colorVar
                            );

                            if (indexExistente >= 0) {
                                // Variación existe: sumar o reemplazar
                                if (producto.accionDuplicado === 'sumar') {
                                    variacionesActuales[indexExistente].stock += nuevaVar.cantidad;
                                } else if (producto.accionDuplicado === 'reemplazar') {
                                    variacionesActuales[indexExistente].stock = nuevaVar.cantidad;
                                }
                            } else {
                                // Variación no existe: agregar nueva
                                variacionesActuales.push({
                                    talla: tallaVar,
                                    color: colorVar,
                                    stock: nuevaVar.cantidad,
                                    sku: `${producto.productoExistenteId.substring(0, 6).toUpperCase()}-${tallaVar}-${colorVar}`
                                });
                            }
                        });

                        await updateDoc(productoRef, {
                            variaciones: variacionesActuales
                        });

                    } else {
                        // Producto sin variaciones: actualizar stock general
                        if (producto.accionDuplicado === 'sumar') {
                            const stockActual = productoExistente.stock || 0;
                            const nuevoStock = stockActual + producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        } else if (producto.accionDuplicado === 'reemplazar') {
                            const nuevoStock = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        }
                    }

                    console.log(`✅ Actualizado: ${producto.nombre} (${producto.accionDuplicado})`);

                } else {
                    // ⚠️ VERIFICACIÓN FINAL: Revisar si el nombre ya existe antes de crear
                    const nombreNorm = producto.nombre.toLowerCase().trim();
                    const productoConMismoNombre = productosExistentes.find(p => p.nombre === nombreNorm);

                    if (productoConMismoNombre) {
                        console.error(`🚨🚨🚨 BLOQUEADO: Intento de crear producto duplicado "${producto.nombre}"`);
                        console.error(`      Ya existe: Código ${productoConMismoNombre.codigo || 'SIN-CÓDIGO'} | ID: ${productoConMismoNombre.id}`);
                        console.error(`      AGREGANDO VARIACIONES AL EXISTENTE EN VEZ DE CREAR NUEVO`);

                        // FORZAR actualización del producto existente
                        const productoRef = doc(db, 'productos', productoConMismoNombre.id);
                        const tieneVariaciones = productoConMismoNombre.variaciones && productoConMismoNombre.variaciones.length > 0;

                        if (tieneVariaciones) {
                            const variacionesActuales = [...productoConMismoNombre.variaciones];

                            producto.variaciones.forEach(nuevaVar => {
                                const tallaVar = nuevaVar.talla || 'Única';
                                const colorVar = nuevaVar.color || 'Único';

                                const indexExistente = variacionesActuales.findIndex(v =>
                                    v.talla === tallaVar && v.color === colorVar
                                );

                                if (indexExistente >= 0) {
                                    variacionesActuales[indexExistente].stock += nuevaVar.cantidad;
                                } else {
                                    variacionesActuales.push({
                                        talla: tallaVar,
                                        color: colorVar,
                                        stock: nuevaVar.cantidad,
                                        sku: `${productoConMismoNombre.id.substring(0, 6).toUpperCase()}-${tallaVar}-${colorVar}`
                                    });
                                }
                            });

                            await updateDoc(productoRef, { variaciones: variacionesActuales });
                        } else {
                            const stockActual = productoConMismoNombre.stock || 0;
                            const nuevoStock = stockActual + producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        }

                        console.log(`✅ BLOQUEADO Y REDIRIGIDO: Variaciones agregadas a ${productoConMismoNombre.codigo || 'SIN-CÓDIGO'}`);
                    } else {
                        // Crear nuevo producto solo si NO existe nombre duplicado
                        const productoId = await guardarProductoFirestore(producto);
                        await guardarVariacionesFirestore(productoId, producto.variaciones);
                        console.log(`✅ Creado: ${producto.nombre}`);
                    }
                }

                contador++;
                const progreso = Math.round((contador / total) * 100);
                actualizarProgreso(progreso);
            }

            // Guardar historial
            const totalProductos = productosAgrupados.filter(p => !p.esDuplicado || p.accionDuplicado !== 'omitir').length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) =>
                sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0
            );

            await guardarHistorial(totalProductos, totalVariaciones, totalUnidades);

            ocultarLoader();
            showToast(`✅ Cargue completado: ${totalProductos} productos, ${totalUnidades} unidades`, 'success');

            // Resetear
            datosExcel = [];
            productosAgrupados = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);

        } catch (error) {
            ocultarLoader();
            showToast('Error al guardar: ' + error.message, 'error');
            console.error(error);
        }
    });

    // Botones de navegación
    btnCancelarCargue.addEventListener('click', () => {
        if (confirm('¿Estás seguro de cancelar? Se perderán los datos cargados.')) {
            datosExcel = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        }
    });

    btnVolverEdicion.addEventListener('click', () => {
        mostrarPaso(pasoVistaPrevia);
    });

    // Cargar categorías y proveedores al inicio
    async function cargarDatosIniciales() {
        try {
            // Cargar categorías
            const catSnapshot = await getDocs(categoriesCollection);
            catSnapshot.forEach(doc => {
                categoriasMap.set(doc.id, { id: doc.id, ...doc.data() });
            });

            // Cargar proveedores
            const provSnapshot = await getDocs(suppliersCollection);
            provSnapshot.forEach(doc => {
                proveedoresMap.set(doc.id, { id: doc.id, ...doc.data() });
            });

            console.log(`✅ Datos iniciales cargados: ${categoriasMap.size} categorías, ${proveedoresMap.size} proveedores`);

        } catch (error) {
            console.error('❌ Error al cargar datos iniciales:', error);
        }
    }

    // Inicializar
    cargarDatosIniciales();

    console.log("✅ Módulo de Cargue Masivo de Productos inicializado");
})();
// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: PROMOCIONES GLOBALES
// ═══════════════════════════════════════════════════════════════════

// ✅ Cargar y mostrar promociones globales
function loadPromocionesGlobales() {
    const container = document.getElementById('promociones-globales-container');
    if (!container) return;

    onSnapshot(promocionesGlobalesCollection, (snapshot) => {
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

});
