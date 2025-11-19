// Import Firebase core and Firestore modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot, serverTimestamp, query, where, orderBy, writeBatch, Timestamp, getDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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

// --- Helper: Format Currency ---
const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

// --- Helper: Show Toast Notification ---
let bsToast = null;
function showToast(message, type = 'success', title = 'Notificación') {
    const liveToastEl = document.getElementById('liveToast');
    const toastBodyEl = document.getElementById('toast-body');
    
    if (liveToastEl && toastBodyEl) {
        if (!bsToast) { try { bsToast = new bootstrap.Toast(liveToastEl, { delay: 3500 }); } catch (e) { console.error("Toast init error", e); return; }}
        liveToastEl.className = 'toast align-items-center border-0';
        const bgClass = type === 'error' ? 'text-bg-danger' : (type === 'warning' ? 'text-bg-warning' : (type === 'info' ? 'text-bg-info' : 'text-bg-success'));
        liveToastEl.classList.add(bgClass, 'text-white');
        let iconClass = type === 'success' ? 'bi-check-circle-fill' : (type === 'error' ? 'bi-exclamation-triangle-fill' : (type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'));
        toastBodyEl.innerHTML = `<i class="bi ${iconClass} me-2"></i> ${message}`;
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
                const input = document.getElementById('product-modal-search');
                if (input) input.value = ''; 
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

        if (!webOrdersContainer) {
            console.warn("Contenedor de pedidos web no encontrado");
            return;
        }

        function createOrderCard(order, orderId) {
            const card = document.createElement('div');
            card.className = 'card mb-3 web-order-card';
            card.dataset.orderId = orderId;

            const fechaTexto = order.timestamp?.toDate ? 
                order.timestamp.toDate().toLocaleString('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }) : 'Fecha no disponible';

            let itemsHtml = '';
            if (order.items && order.items.length > 0) {
                itemsHtml = order.items.map(item => `
                    <tr>
                        <td>${item.nombre}</td>
                        <td>${item.talla || '-'}</td>
                        <td>${item.color || '-'}</td>
                        <td class="text-center">${item.cantidad}</td>
                        <td class="text-end">${formatoMoneda.format(item.precio)}</td>
                        <td class="text-end fw-bold">${formatoMoneda.format(item.total)}</td>
                    </tr>
                `).join('');
            }

            card.innerHTML = `
                <div class="card-header bg-white d-flex justify-content-between align-items-center">
                    <div>
                        <h5 class="mb-0"><i class="bi bi-bag-check me-2"></i>Pedido #${orderId.substring(0, 8).toUpperCase()}</h5>
                        <small class="text-muted">${fechaTexto}</small>
                    </div>
                    <span class="badge bg-warning text-dark">Pendiente</span>
                </div>
                <div class="card-body">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h6 class="text-muted mb-2"><i class="bi bi-person me-1"></i>Datos del Cliente</h6>
                            <p class="mb-1"><strong>Nombre:</strong> ${order.clienteNombre}</p>
                            <p class="mb-1"><strong>WhatsApp:</strong> <a href="https://wa.me/57${order.clienteCelular}" target="_blank">${order.clienteCelular}</a></p>
                            <p class="mb-1"><strong>Dirección:</strong> ${order.clienteDireccion}</p>
                            ${order.observaciones ? `<p class="mb-1"><strong>Observaciones:</strong> ${order.observaciones}</p>` : ''}
                            <p class="mb-1"><strong>Método de Pago:</strong> <span class="badge bg-info">${order.metodoPagoSolicitado}</span></p>
                        </div>
                        <div class="col-md-6">
                            <h6 class="text-muted mb-2"><i class="bi bi-box-seam me-1"></i>Productos</h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Producto</th>
                                            <th>Talla</th>
                                            <th>Color</th>
                                            <th class="text-center">Cant.</th>
                                            <th class="text-end">Precio</th>
                                            <th class="text-end">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsHtml}
                                    </tbody>
                                </table>
                            </div>
                            <div class="text-end mt-2">
                                <h5 class="mb-0">Total: <span class="text-primary">${formatoMoneda.format(order.totalPedido)}</span></h5>
                            </div>
                        </div>
                    </div>
                    <hr>
                    <div class="d-flex justify-content-end gap-2">
                        <button class="btn btn-action btn-action-danger btn-reject-order" data-order-id="${orderId}">
                            <i class="bi bi-x-circle"></i><span class="btn-action-text">Rechazar</span>
                        </button>
                        <button class="btn btn-action btn-action-success btn-accept-order" data-order-id="${orderId}">
                            <i class="bi bi-check-circle"></i><span class="btn-action-text">Aceptar</span>
                        </button>
                    </div>
                </div>
            `;

            return card;
        }

        function renderWebOrders(snapshot) {
            if (loadingWebOrders) loadingWebOrders.style.display = 'none';
            
            const existingCards = webOrdersContainer.querySelectorAll('.web-order-card');
            existingCards.forEach(card => card.remove());

            if (snapshot.empty) {
                webOrdersContainer.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-inbox display-1"></i><p class="mt-3">No hay pedidos pendientes</p></div>';
                if (pedidosWebCountBadge) pedidosWebCountBadge.style.display = 'none';
                return;
            }

            const pendingCount = snapshot.size;
            if (pedidosWebCountBadge) {
                pedidosWebCountBadge.textContent = pendingCount;
                pedidosWebCountBadge.style.display = 'inline';
            }

            snapshot.forEach(docSnap => {
                const order = docSnap.data();
                const orderId = docSnap.id;
                const card = createOrderCard(order, orderId);
                webOrdersContainer.appendChild(card);
            });
        }

        const webOrdersQuery = query(
            webOrdersCollection,
            where('estado', '==', 'pendiente'),
            orderBy('timestamp', 'desc')
        );

        onSnapshot(webOrdersQuery, renderWebOrders, (error) => {
            console.error("Error al cargar pedidos web:", error);
            if (loadingWebOrders) loadingWebOrders.style.display = 'none';
            webOrdersContainer.innerHTML = '<div class="alert alert-danger">Error al cargar pedidos</div>';
        });

        webOrdersContainer.addEventListener('click', async (e) => {
            const acceptBtn = e.target.closest('.btn-accept-order');
            const rejectBtn = e.target.closest('.btn-reject-order');

            if (acceptBtn) {
                e.preventDefault();
                const orderId = acceptBtn.dataset.orderId;
                await handleAcceptOrder(orderId);
            } else if (rejectBtn) {
                e.preventDefault();
                const orderId = rejectBtn.dataset.orderId;
                await handleRejectOrder(orderId);
            }
        });

        async function handleRejectOrder(orderId) {
            if (!confirm('¿Estás seguro de que quieres rechazar este pedido?')) return;

            try {
                const orderRef = doc(db, 'pedidosWeb', orderId);
                await updateDoc(orderRef, {
                    estado: 'rechazado',
                    fechaRechazo: serverTimestamp()
                });
                
                showToast('Pedido rechazado correctamente', 'info');
            } catch (error) {
                console.error('Error al rechazar pedido:', error);
                showToast('Error al rechazar el pedido', 'error');
            }
        }

        async function handleAcceptOrder(orderId) {
            try {
                const orderRef = doc(db, 'pedidosWeb', orderId);
                const orderSnap = await getDoc(orderRef);
                
                if (!orderSnap.exists()) {
                    showToast('Pedido no encontrado', 'error');
                    return;
                }

                const orderData = orderSnap.data();

                await updateDoc(orderRef, {
                    estado: 'aceptado',
                    fechaAceptacion: serverTimestamp()
                });

                await preFillSalesForm(orderData, orderId);

                showToast('Pedido aceptado. Completa el formulario de venta.', 'success');

                const ventasTab = document.querySelector('a[href="#ventas"]');
                if (ventasTab) {
                    const tab = bootstrap.Tab.getOrCreateInstance(ventasTab);
                    tab.show();
                }

                const salesFormViewBtn = document.getElementById('toggle-sales-form-view-btn');
                if (salesFormViewBtn) salesFormViewBtn.click();

            } catch (error) {
                console.error('Error al aceptar pedido:', error);
                showToast('Error al procesar el pedido', 'error');
            }
        }

        async function preFillSalesForm(orderData, orderId) {
            window.ventaItems = []; 

            const ventaClienteInput = document.getElementById('venta-cliente');
            const ventaCelularInput = document.getElementById('venta-cliente-celular');
            const ventaDireccionInput = document.getElementById('venta-cliente-direccion');
            
            if (ventaClienteInput) ventaClienteInput.value = orderData.clienteNombre;
            if (ventaCelularInput) ventaCelularInput.value = orderData.clienteCelular;
            if (ventaDireccionInput) ventaDireccionInput.value = orderData.clienteDireccion;

            const tipoVentaSelect = document.getElementById('tipo-venta-select');
            if (tipoVentaSelect) tipoVentaSelect.value = 'detal';

            const tipoEntregaSelect = document.getElementById('tipo-entrega-select');
            if (tipoEntregaSelect) {
                tipoEntregaSelect.value = 'domicilio';
                tipoEntregaSelect.dispatchEvent(new Event('change'));
            }

            const ventaWhatsappCheckbox = document.getElementById('venta-whatsapp');
            if (ventaWhatsappCheckbox) ventaWhatsappCheckbox.checked = false; // Invertido para corregir lógica

            const ventaObservaciones = document.getElementById('venta-observaciones');
            if (ventaObservaciones) {
                ventaObservaciones.value = `Pedido Web #${orderId.substring(0, 8).toUpperCase()}\n${orderData.observaciones || ''}`;
            }

            if (orderData.items && orderData.items.length > 0) {
                orderData.items.forEach(item => {
                    window.agregarItemAlCarrito( 
                        item.productoId,
                        item.nombre, 
                        item.cantidad,
                        item.precio,
                        item.talla,
                        item.color,
                        `${item.nombre} (${item.talla}/${item.color})` 
                    );
                });
            }

            window.calcularTotalVentaGeneral(); 
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
        let suppliersMap = new Map();
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
        
        const renderClients = (snapshot) => { localClientsMap.clear(); if(clientListTable) clientListTable.innerHTML = ''; if(searchModalList) searchModalList.innerHTML = ''; localClientsMap.set("Cliente General", {id: null, celular: "", direccion: "", nombre: "Cliente General"}); if(searchModalList) { const liGen = document.createElement('li'); liGen.className = 'list-group-item list-group-item-action client-search-item'; liGen.dataset.name = "Cliente General"; liGen.dataset.id = ""; liGen.textContent = "Cliente General"; searchModalList.appendChild(liGen); } if (snapshot.empty) { if(clientListTable) clientListTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay clientes.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; const dataListValue = d.cedula ? `${d.cedula} - ${d.nombre}` : d.nombre; localClientsMap.set(dataListValue, { id: id, celular: d.celular || "", direccion: d.direccion || "" }); localClientsMap.set(id, d); if (clientListTable) { const tr = document.createElement('tr'); tr.dataset.id = id; tr.innerHTML = `<td class="client-name">${d.nombre}</td> <td>${d.cedula || '-'}</td> <td>${d.celular || '-'}</td> <td>${d.direccion || '-'}</td> <td>${d.ultimaCompra?.toDate ? d.ultimaCompra.toDate().toLocaleDateString('es-CO') : '-'}</td> <td class="action-buttons"><button class="btn btn-action btn-action-edit btn-edit-client"><i class="bi bi-pencil"></i><span class="btn-action-text">Editar</span></button> <button class="btn btn-action btn-action-delete btn-delete-client"><i class="bi bi-trash"></i><span class="btn-action-text">Eliminar</span></button></td>`; clientListTable.appendChild(tr); }
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
        if (clientListTable) clientListTable.addEventListener('click', (e) => { const target = e.target.closest('button'); if (!target) return; e.preventDefault(); const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.client-name'); if (!id || !nameTd) return;
            if (target.classList.contains('btn-delete-client')) {
                const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); const deleteItemNameEl = document.getElementById('delete-item-name'); if(confirmDeleteBtn && deleteConfirmModalInstance && deleteItemNameEl){ confirmDeleteBtn.dataset.deleteId = id; confirmDeleteBtn.dataset.deleteCollection = 'clientes'; deleteItemNameEl.textContent = `Cliente: ${nameTd.textContent}`; deleteConfirmModalInstance.show(); } else { console.error("Delete modal elements missing."); showToast('Error al eliminar.', 'error'); }
            } else if (target.classList.contains('btn-edit-client')) {
                 const clientData = localClientsMap.get(id); if (clientData && editClientModalInstance && editIdInput && editCedulaInput && editNombreInput && editCelularInput && editDireccionInput) { editIdInput.value = id; editCedulaInput.value = clientData.cedula || ''; editNombreInput.value = clientData.nombre || ''; editCelularInput.value = clientData.celular || ''; editDireccionInput.value = clientData.direccion || ''; editClientModalInstance.show(); } else { console.error("Edit client modal or data missing"); showToast("Error al abrir editor.", 'error'); }
            }
        });
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

                     showToast('Liquidación registrada correctamente', 'success');
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
        const productForm = document.getElementById('form-producto'); const productIdInput = document.getElementById('producto-id'); const nombreInput = document.getElementById('nombre'); const codigoInput = document.getElementById('codigo'); const proveedorInput = document.getElementById('proveedor-producto'); const descripcionInput = document.getElementById('descripcion'); const categoriaSelect = document.getElementById('categoria-producto'); const costoInput = document.getElementById('costo-compra'); const detalInput = document.getElementById('precio-detal'); const mayorInput = document.getElementById('precio-mayor'); const variationsContainer = document.getElementById('variaciones-container'); const imagenInput = document.getElementById('imagen'); const visibleCheckbox = document.getElementById('visibilidad'); const productListTableBody = document.getElementById('lista-inventario-productos'); const clearFormBtn = document.getElementById('btn-clear-product-form');
        const saveProductBtn = document.getElementById('btn-save-product');
        const saveProductBtnText = saveProductBtn ? saveProductBtn.querySelector('.save-text') : null;
        const saveProductBtnSpinner = saveProductBtn ? saveProductBtn.querySelector('.spinner-border') : null;
        const productSearchModalList = document.getElementById('product-modal-list');
        const productSearchInput = document.getElementById('product-modal-search');
        
        let categoriesMap = new Map();

        if (!productForm) { console.warn("Formulario de producto no encontrado."); return; }

        const vC=document.getElementById('variaciones-container'); const aVB=document.getElementById('add-variation-btn'); const vT=document.getElementById('variation-template'); 
        function aVR(){ if(!vT || !vC) return; const nR=vT.cloneNode(true);nR.classList.remove('d-none');nR.removeAttribute('id');const rB=nR.querySelector('.remove-variation-btn');rB.addEventListener('click',(e)=>{ e.preventDefault(); nR.remove(); if(vC.querySelectorAll('.variation-row:not(#variation-template):not(.d-none)').length===0){aVR();}});vC.appendChild(nR);} 
        if(aVB)aVB.addEventListener('click',(e) => { e.preventDefault(); aVR(); }); 
        if(vC && vC.querySelectorAll('.variation-row:not(#variation-template):not(.d-none)').length===0){aVR();}
        
        const cI=document.getElementById('costo-compra'); const pDI=document.getElementById('precio-detal'); const pMI=document.getElementById('precio-mayor'); const mDI=document.getElementById('margen-detal-info'); const mMI=document.getElementById('margen-mayor-info'); const fM_margin=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0}); function cYM(){ if(!cI || !pDI || !pMI || !mDI || !mMI) return; const c=parseFloat(cI.value)||0; const pD=parseFloat(pDI.value)||0; const pM=parseFloat(pMI.value)||0; let mDV=0,mDP=0;if(c>0&&pD>=c){mDV=pD-c;mDP=(mDV/c)*100;mDI.textContent=`Margen: ${fM_margin.format(mDV)} (${mDP.toFixed(1)}%)`;mDI.style.color='';mDI.style.fontWeight='';}else{mDI.textContent='Margen: $0 (0.0%)';mDI.style.color=(pD>0&&pD<c)?'red':'';mDI.style.fontWeight=(pD>0&&pD<c)?'bold':'';if(pD>0&&pD<c)mDI.textContent='Margen Negativo';} let mMV=0,mMP=0;if(c>0&&pM>=c){mMV=pM-c;mMP=(mMV/c)*100;mMI.textContent=`Margen: ${fM_margin.format(mMV)} (${mMP.toFixed(1)}%)`;mMI.style.color='';mMI.style.fontWeight='';}else{mMI.textContent='Margen: $0 (0.0%)';mMI.style.color=(pM>0&&pM<c)?'red':'';mMI.style.fontWeight=(pM>0&&pM<c)?'bold':'';if(pM>0&&pM<c)mMI.textContent='Margen Negativo';}} if(cI)cI.addEventListener('input',cYM); if(pDI)pDI.addEventListener('input',cYM); if(pMI)pMI.addEventListener('input',cYM); if(cI) cYM();
        
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
                const defaultImgTabla = 'https://via.placeholder.com/60x80/f0f0f0/cccccc?text=Foto';
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

                const tr = document.createElement('tr');
                tr.dataset.id = id;
                tr.innerHTML = `<td><img src="${imagenUrl}" alt="${d.nombre}" class="table-product-img" onerror="this.src='${defaultImgTabla}'"></td>
                                <td class="product-name">${d.nombre}<small class="text-muted d-block">Código: ${d.codigo || id.substring(0,6)}</small></td>
                                <td>${categoryName}</td> <td>${variacionesHtml}</td>
                                <td>${formatoMoneda.format(d.precioDetal || 0)}</td>
                                <td>${formatoMoneda.format(d.precioMayor || 0)}</td>
                                <td>${stockTotal}</td>
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

                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action product-search-item';
                li.dataset.productId = id;
                li.dataset.productName = d.nombre.toLowerCase();
                li.dataset.productCode = (d.codigo || '').toLowerCase();

                const defaultImgModal = 'https://via.placeholder.com/70x90.png?text=Sin+Foto';
                const imagenUrlModal = d.imagenUrl || defaultImgModal; 

                let categoryNameModal = 'Sin Categoría';
                if (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map) {
                    categoryNameModal = categoriesMap.get(d.categoriaId) || 'Sin Categoría';
                }

                li.innerHTML = `
                    <div class="d-flex align-items-center gap-3">
                        <img src="${imagenUrlModal}" alt="${d.nombre}" class="product-search-img" onerror="this.src='${defaultImgModal}'">
                        <div class="flex-grow-1">
                            <div class="product-search-name">${d.nombre}</div>
                            <div class="d-flex gap-2 align-items-center mt-1">
                                <small class="text-muted">${categoryNameModal}</small>
                                ${d.codigo ? `<small class="text-muted">• ${d.codigo}</small>` : ''}
                            </div>
                            <div class="stock-info">Stock: ${stockTotal} unid.</div>
                        </div>
                        <div class="text-end">
                            <div class="price-info">${formatoMoneda.format(d.precioDetal || 0)}</div>
                            ${d.precioMayor ? `<small class="text-muted d-block">Mayor: ${formatoMoneda.format(d.precioMayor)}</small>` : ''}
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
        };
        onSnapshot(query(productsCollection, orderBy('timestamp', 'desc')), renderProducts, e => { console.error("Error products:", e); if(productListTableBody) productListTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error.</td></tr>';});
        
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
            document.getElementById('product-form-title').textContent = "Agregar Producto"; 
            imagenInput.required = true; 
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

            let productData = { nombre: nombreProducto, proveedor: proveedorInput.value.trim(), descripcion: descripcionInput.value.trim(), categoriaId: categoriaSelect.value, costoCompra: parseFloat(costoInput.value) || 0, precioDetal: parseFloat(detalInput.value) || 0, precioMayor: parseFloat(mayorInput.value) || 0, visible: visibleCheckbox.checked, timestamp: serverTimestamp(), variaciones: [], imagenUrl: null };

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
                
                if (productId) { 
                    if (!productData.imagenUrl) {
                        const existingDoc = localProductsMap.get(productId);
                        productData.imagenUrl = existingDoc?.imagenUrl || null;
                    }
                    await updateDoc(doc(db, "productos", productId), productData); 
                    showToast("Producto actualizado!"); 
                } else { 
                    if (!productData.imagenUrl) { showToast("Se requiere una imagen para crear un producto nuevo.", 'warning'); throw new Error("Imagen requerida"); }
                    productData.codigo = "P" + Date.now().toString().slice(-5); 
                    const docRef = await addDoc(productsCollection, productData); 
                    showToast("Producto guardado!"); 
                    window.clearProductForm(); 
                } 
            } catch (err) { 
                console.error("Error saving product or image:", err); 
                if (err.message !== "Imagen requerida") {
                    showToast(`Error: ${err.message}`, 'error'); 
                }
            } finally {
                 if(saveProductBtn) { saveProductBtn.disabled = false; if(saveProductBtnText) saveProductBtnText.textContent = "Guardar"; if(saveProductBtnSpinner) saveProductBtnSpinner.style.display = 'none'; }
            }
        });
        
        if (productListTableBody) productListTableBody.addEventListener('click', async (e) => { 
            const target = e.target.closest('button'); if (!target) return; e.preventDefault(); 
            const tr = target.closest('tr'); const id = tr.dataset.id; const nameTd = tr.querySelector('.product-name'); if (!id || !nameTd) return;
             
             if (target.classList.contains('btn-delete-product')) {
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
                        proveedorInput.value = product.proveedor || '';
                        descripcionInput.value = product.descripcion || '';
                        categoriaSelect.value = product.categoriaId || '';
                        costoInput.value = product.costoCompra || 0;
                        detalInput.value = product.precioDetal || 0;
                        mayorInput.value = product.precioMayor || 0;
                        visibleCheckbox.checked = product.visible;
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
                        
                        costoInput.dispatchEvent(new Event('input')); 
                        
                        if (formView) {
                            formView.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        
                    } else { showToast("Producto no encontrado.", 'error'); }
                 } catch (err) { console.error("Error fetching product for edit:", err); showToast(`Error al cargar: ${err.message}`, 'error'); }
             }
         });

         if (productSearchInput) productSearchInput.addEventListener('input', (e) => { 
            const searchTerm = e.target.value.toLowerCase(); 
            const items = productSearchModalList.querySelectorAll('.product-search-item'); 
            items.forEach(item => { 
                const itemText = item.textContent.toLowerCase();
                item.style.display = itemText.includes(searchTerm) ? '' : 'none'; 
            }); 
        });
        
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

            const tallas = [...new Set(product.variaciones.map(v => v.talla || ''))];
            const colores = [...new Set(product.variaciones.map(v => v.color || ''))];

            let optionsHtml = `
                <div class="mb-3">
                    <label for="select-talla" class="form-label">Talla:</label>
                    <select class="form-select" id="select-talla">
                        <option value="" selected>Selecciona una talla...</option>
                        ${tallas.map(t => `<option value="${t}">${t || 'Única'}</option>`).join('')}
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

            selectTalla.addEventListener('change', checkStock);
            selectColor.addEventListener('change', checkStock);

            selectVariationModalInstance.show();
        }

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

        function applyInventoryFilters() {
            if (!inventoryBody) return;
            
            const searchVal = searchInputInventory ? searchInputInventory.value.toLowerCase() : '';
            const categoryVal = categorySelectInventory ? categorySelectInventory.value : '';

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

                const matchesSearch = productName.includes(searchVal) || productCode.includes(searchVal);
                const matchesCategory = (categoryVal === '' || categoryId === categoryVal);

                if (matchesSearch && matchesCategory) {
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
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInputInventory) searchInputInventory.value = '';
                if (categorySelectInventory) categorySelectInventory.value = '';
                applyInventoryFilters();
            });
        }

        loadCategoriesForFilter();

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
            ventaCarritoTbody.innerHTML = ''; 
            window.ventaItems.forEach((item, index) => { 
                const tr = document.createElement('tr'); 
                tr.innerHTML = `<td>${item.nombreCompleto}</td><td><input type="number" class="form-control form-control-sm item-qty-input" value="${item.cantidad}" min="1" data-index="${index}"></td><td>${formatoMoneda.format(item.precio)}</td><td>${formatoMoneda.format(item.total)}</td><td><button type="button" class="btn btn-action btn-action-delete btn-quitar-item" data-index="${index}"><i class="bi bi-x-lg"></i></button></td>`; 
                ventaCarritoTbody.appendChild(tr); 
            }); 
         }
         
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('change', (e) => { if (e.target.classList.contains('item-qty-input')) { const index = parseInt(e.target.dataset.index, 10); const newQty = parseInt(e.target.value, 10); if (newQty > 0 && window.ventaItems[index]) { window.ventaItems[index].cantidad = newQty; window.ventaItems[index].total = newQty * window.ventaItems[index].precio; renderCarrito(); window.calcularTotalVentaGeneral(); } } });
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('click', (e) => { e.preventDefault(); if (e.target.closest('.btn-quitar-item')) { quitarItemDelCarrito(parseInt(e.target.closest('.btn-quitar-item').dataset.index, 10)); } });
         
         window.calcularTotalVentaGeneral = function() { 
             let subtotalItems = window.ventaItems.reduce((sum, item) => sum + item.total, 0); 
             let costoRuta = 0; 
             if (tipoEntregaSelect.value === 'domicilio') { costoRuta = parseFloat(costoRutaInput.value) || 0; } 
             let descuento = parseFloat(ventaDescuentoInput.value) || 0; 
             if (ventaDescuentoTipo.value === 'porcentaje') { descuento = subtotalItems * (descuento / 100); } 
             const totalFinal = subtotalItems - descuento + costoRuta; 
             if(ventaTotalSpan) ventaTotalSpan.textContent = formatoMoneda.format(totalFinal); 
             return totalFinal; 
         }

         if(costoRutaInput) costoRutaInput.addEventListener('input', window.calcularTotalVentaGeneral); if(ventaDescuentoInput) ventaDescuentoInput.addEventListener('input', window.calcularTotalVentaGeneral); if(tipoEntregaSelect) tipoEntregaSelect.addEventListener('change', window.calcularTotalVentaGeneral); if(ventaDescuentoTipo) ventaDescuentoTipo.addEventListener('change', window.calcularTotalVentaGeneral);
         
         // --- R (Read) ---
         const renderSales = (snapshot) => { 
            if(!salesListTableBody) return; 
            const emptyRow = document.getElementById('empty-sales-row'); 
            salesListTableBody.innerHTML = ''; 
            if (snapshot.empty) { 
                if(emptyRow) { emptyRow.style.display = ''; salesListTableBody.appendChild(emptyRow); } 
                return; 
            } 
            if(emptyRow) emptyRow.style.display = 'none'; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                const id = docSnap.id; 
                const tr = document.createElement('tr'); 
                tr.dataset.id = id; 
                const fecha = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString('es-CO') : 'N/A'; 
                const pago = (d.pagoEfectivo>0?'Efec.':'') + (d.pagoTransferencia>0?(d.pagoEfectivo>0?'+':''):'') + (d.pagoTransferencia>0?'Transf.':''); 
                const repartidor = d.repartidorNombre || (d.tipoEntrega === 'tienda' ? 'Recoge' : '-'); 
                const estado = d.estado || (d.tipoVenta === 'apartado' ? 'Pendiente' : 'Completada');
                
                let estadoBadgeClass = 'bg-success';
                if (estado === 'Pendiente') {
                    estadoBadgeClass = 'bg-warning text-dark';
                } else if (estado === 'Anulada' || estado === 'Cancelada') {
                    estadoBadgeClass = 'bg-danger';
                }
                const estaAnulada = (estado === 'Anulada' || estado === 'Cancelada');

                tr.innerHTML = `<td>${fecha}</td>
                                <td>${d.clienteNombre || 'General'}</td>
                                <td>${d.tipoVenta}</td>
                                <td>${formatoMoneda.format(d.totalVenta||0)}</td>
                                <td>${pago||'-'}</td>
                                <td>${repartidor}</td>
                                <td><span class="badge ${estadoBadgeClass}">${estado}</span></td>
                                <td class="action-buttons">
                                    <button class="btn btn-action btn-action-view btn-view-sale"><i class="bi bi-eye"></i><span class="btn-action-text">Ver</span></button>
                                    ${!estaAnulada ? `<button class="btn btn-action btn-action-info btn-change-sale-type" data-tipo="${d.tipoVenta}"><i class="bi bi-arrow-left-right"></i><span class="btn-action-text">Cambiar</span></button>` : ''}
                                    ${d.tipoVenta === 'apartado' && !estaAnulada ? `<button class="btn btn-action btn-action-warning btn-manage-apartado"><i class="bi bi-calendar-heart"></i><span class="btn-action-text">Gestionar</span></button>` : ''}
                                    <button class="btn btn-action btn-action-danger btn-cancel-sale" ${estaAnulada ? 'disabled' : ''}>
                                        <i class="bi bi-x-circle"></i><span class="btn-action-text">Anular</span>
                                    </button>
                                </td>`; 
                salesListTableBody.appendChild(tr); 
            }); 
        };

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
                console.error("Error sales:", e);
                if(salesListTableBody) salesListTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error.</td></tr>';
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
                    cargarVentas();
                }
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
            
            const totalCalculado = window.calcularTotalVentaGeneral();
            const ventaData = {
                clienteNombre: ventaClienteInput.value || "Cliente General",
                tipoVenta: tipoVentaSelect.value,
                tipoEntrega: tipoEntregaSelect.value,
                pedidoWhatsapp: !ventaWhatsappCheckbox.checked, // Invertido para corregir lógica
                repartidorId: tipoEntregaSelect.value === 'domicilio' ? ventaRepartidorSelect.value : null,
                repartidorNombre: tipoEntregaSelect.value === 'domicilio' ? (ventaRepartidorSelect.options[ventaRepartidorSelect.selectedIndex]?.text || '') : null,
                costoRuta: tipoEntregaSelect.value === 'domicilio' ? (parseFloat(costoRutaInput.value) || 0) : 0,
                rutaPagadaTransferencia: tipoEntregaSelect.value === 'domicilio' ? !rutaPagadaCheckbox.checked : false, // Invertido para corregir lógica 
                items: window.ventaItems, 
                observaciones: ventaObservaciones.value.trim(), 
                descuento: parseFloat(ventaDescuentoInput.value) || 0, 
                descuentoTipo: ventaDescuentoTipo.value, 
                pagoEfectivo: parseFloat(pagoEfectivoInput.value) || 0, 
                pagoTransferencia: parseFloat(pagoTransferenciaInput.value) || 0, 
                totalVenta: totalCalculado, 
                estado: tipoVentaSelect.value === 'apartado' ? 'Pendiente' : 'Completada', 
                timestamp: serverTimestamp() 
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
                // ✅ PASO 1: Registrar la venta primero
                const docRef = await addDoc(salesCollection, ventaData);
                console.log("✅ Venta registrada con ID:", docRef.id);

                // ✅ PASO 2: Actualizar stock inmediatamente
                await actualizarStock(ventaData.items, 'restar');
                console.log("✅ Stock actualizado correctamente");

                // ✅ PASO 3: Si es apartado, crear documento apartado
                if (ventaData.tipoVenta === 'apartado') {
                    const abonoInicial = ventaData.pagoEfectivo + ventaData.pagoTransferencia;
                    const saldoPendiente = ventaData.totalVenta - abonoInicial;

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
                        ventaId: docRef.id,
                        clienteNombre: ventaData.clienteNombre,
                        clienteCelular: ventaData.clienteCelular, // ✅ Guardar celular para WhatsApp
                        total: ventaData.totalVenta,
                        abonado: abonoInicial,
                        saldo: saldoPendiente,
                        fechaCreacion: serverTimestamp(),
                        fechaVencimiento: Timestamp.fromDate(fechaVencimiento),
                        estado: 'Pendiente',
                        items: ventaData.items, // Guardar items para referencia
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
                    showToast("Venta registrada exitosamente!", 'success');
                } 
                
                salesForm.reset(); 
                window.ventaItems = []; 
                renderCarrito(); 
                window.fillClientInfoSales(); 
                tipoVentaSelect.value='detal'; 
                tipoEntregaSelect.value='tienda'; 
                toggleDeliveryFields(); 
                window.calcularTotalVentaGeneral(); 
            } catch (err) { 
                console.error("Error saving sale:", err); 
                showToast(`Error: ${err.message}`, 'error'); 
            } 
        });

        // NOTA: actualizarStock ahora es una función global (definida al inicio del archivo)

        // --- Función para Anular Venta (D) ---
        async function anularVenta(ventaId) {
            if (!ventaId) return;
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
                
                let itemsHtml = d.items.map(item => `
                    <tr>
                        <td>${item.nombreCompleto || item.nombre}</td>
                        <td class="text-center">${item.cantidad}</td>
                        <td class="text-end">${formatoMoneda.format(item.precio)}</td>
                        <td class="text-end fw-bold">${formatoMoneda.format(item.total)}</td>
                    </tr>
                `).join('');
                
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
                                <li class="fs-5 fw-bold mt-2"><strong>Total Venta:</strong> ${formatoMoneda.format(d.totalVenta || 0)}</li>
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
        
        // --- Listener de la lista de ventas (Actualizado) ---
        if(salesListTableBody) salesListTableBody.addEventListener('click', (e)=>{ 
            e.preventDefault(); 
            const target = e.target.closest('button'); 
            if (!target) return; 
            const id = target.closest('tr')?.dataset.id; 
            if (!id) return; 
            
            if(target.classList.contains('btn-view-sale')) {
                handleViewSale(id); 
            } 
            
            if(target.classList.contains('btn-cancel-sale')) {
                anularVenta(id); 
            } 
            
            if(target.classList.contains('btn-manage-apartado')) {
                // Redirigir a la pestaña de apartados
                const apartadosTab = document.querySelector('a[href="#apartados"]');
                if (apartadosTab) {
                    const tab = bootstrap.Tab.getOrCreateInstance(apartadosTab);
                    tab.show();
                    showToast(`Gestiona el apartado desde esta pestaña`, 'info');
                }
            }

            // Cambiar tipo de venta (detal/mayorista)
            if(target.classList.contains('btn-change-sale-type')) {
                cambiarTipoVenta(id, target.dataset.tipo);
            }
        });

        // Función para cambiar tipo de venta y recalcular precios
        async function cambiarTipoVenta(ventaId, tipoActual) {
            try {
                const ventaRef = doc(db, 'ventas', ventaId);
                const ventaSnap = await getDoc(ventaRef);

                if (!ventaSnap.exists()) {
                    showToast('Venta no encontrada', 'error');
                    return;
                }

                const ventaData = ventaSnap.data();

                // Validar que ventaData y ventaData.items existan
                if (!ventaData || !ventaData.items || !Array.isArray(ventaData.items)) {
                    showToast('Error: La venta no tiene items válidos', 'error');
                    console.error('ventaData.items no es válido:', ventaData);
                    return;
                }

                const nuevoTipo = tipoActual === 'detal' ? 'mayorista' : 'detal';

                // Confirmar cambio
                if (!confirm(`¿Cambiar venta de ${tipoActual} a ${nuevoTipo}?`)) {
                    return;
                }

                console.log('=== CAMBIO DE TIPO DE VENTA ===');
                console.log('Tipo actual:', tipoActual);
                console.log('Nuevo tipo:', nuevoTipo);
                console.log('Items originales:', ventaData.items);

                // Recalcular precios de items
                const itemsActualizados = await Promise.all(ventaData.items.map(async (item) => {
                    if (!item || !item.id) {
                        console.warn('Item inválido encontrado:', item);
                        return item;
                    }

                    const prodRef = doc(db, 'productos', item.id);
                    const prodSnap = await getDoc(prodRef);

                    if (prodSnap.exists()) {
                        const prodData = prodSnap.data();
                        const nuevoPrecio = nuevoTipo === 'mayorista' ?
                            (prodData.precioMayor || prodData.precioDetal) :
                            prodData.precioDetal;

                        const cantidad = parseFloat(item.cantidad) || 1;
                        const precioFinal = parseFloat(nuevoPrecio) || parseFloat(item.precioUnitario) || 0;
                        const totalItem = precioFinal * cantidad;

                        console.log(`Item: ${item.nombre || item.id}`);
                        console.log(`  - Cantidad: ${cantidad}`);
                        console.log(`  - Precio anterior: $${item.precioUnitario}`);
                        console.log(`  - Precio nuevo (${nuevoTipo}): $${precioFinal}`);
                        console.log(`  - Total item: $${totalItem}`);

                        return {
                            ...item,
                            precioUnitario: precioFinal,
                            totalItem: totalItem
                        };
                    }

                    console.warn('Producto no encontrado:', item.id);
                    return item;
                }));

                console.log('Items actualizados:', itemsActualizados);

                // Recalcular total con validación estricta
                let subtotal = 0;
                itemsActualizados.forEach((item, index) => {
                    const itemTotal = parseFloat(item.totalItem) || 0;
                    console.log(`Item ${index + 1} total: $${itemTotal}`);
                    subtotal += itemTotal;
                });

                const descuento = parseFloat(ventaData.descuento) || 0;
                const costoRuta = parseFloat(ventaData.costoRuta) || 0;
                const nuevoTotal = subtotal - descuento + costoRuta;

                console.log('=== TOTALES ===');
                console.log('Subtotal (suma items):', subtotal);
                console.log('Descuento:', descuento);
                console.log('Costo ruta:', costoRuta);
                console.log('Total final:', nuevoTotal);

                // Actualizar venta
                await updateDoc(ventaRef, {
                    tipoVenta: nuevoTipo,
                    items: itemsActualizados,
                    subtotal: subtotal,
                    totalVenta: nuevoTotal
                });

                showToast(`Venta cambiada a ${nuevoTipo} exitosamente. Total: $${nuevoTotal.toFixed(2)}`, 'success');

                // Recargar la tabla de ventas si existe la función
                if (typeof renderVentas === 'function') {
                    renderVentas();
                }
            } catch (error) {
                console.error('Error al cambiar tipo de venta:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        }
        
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

            // Advertir si hay productos en el carrito al cambiar el tipo de venta
            if (tipoVenta && window.ventaItems && window.ventaItems.length > 0) {
                showToast("Importante: Vacíe el carrito antes de cambiar el tipo de venta para aplicar los precios correctos", "warning");
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
        }

        document.getElementById('tipo-entrega-select').addEventListener('change', toggleDeliveryFields);
        document.getElementById('tipo-venta-select').addEventListener('change', toggleApartadoFields);
        toggleDeliveryFields();
        toggleApartadoFields();
        window.calcularTotalVentaGeneral();

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
                apartadosListTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay apartados pendientes.</td></tr>'; 
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
                
                tr.innerHTML = `
                    <td>
                        ${ap.clienteNombre || '?'}
                        <small class="d-block text-muted">${porcentajePagado}% pagado</small>
                    </td>
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

            window.open(whatsappUrl, '_blank');
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
            const monto = parseFloat(document.getElementById('abono-monto').value);
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

                // ✅ PASO 5: Actualizar venta asociada
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();
                        const updateVenta = {
                            estado: nuevoSaldo <= 0 ? 'Completada' : 'Pendiente'
                        };

                        // Actualizar montos de pago según método
                        if (metodoPago === 'Efectivo') {
                            updateVenta.pagoEfectivo = (ventaData.pagoEfectivo || 0) + monto;
                        } else if (metodoPago === 'Transferencia') {
                            updateVenta.pagoTransferencia = (ventaData.pagoTransferencia || 0) + monto;
                        }

                        await updateDoc(ventaRef, updateVenta);
                        console.log("✅ Venta actualizada correctamente");
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
    // --- LÓGICA FINANZAS (Ingreso/Gasto, Cierre Placeholder) ---
    // ========================================================================
    (() => {
         const addIncomeForm = document.getElementById('form-add-income'); const incomeAmountInput = document.getElementById('income-amount'); const incomeDescInput = document.getElementById('income-description'); const addExpenseForm = document.getElementById('form-add-expense'); const expenseAmountInput = document.getElementById('expense-amount'); const expenseDescInput = document.getElementById('expense-description'); const closingForm = document.getElementById('form-cierre-caja'); const closingHistoryTableBody = document.getElementById('lista-historial-cierres');
         if(addIncomeForm && addIncomeModalInstance) addIncomeForm.addEventListener('submit', async (e) => { e.preventDefault(); const amount = parseFloat(incomeAmountInput.value); const desc = incomeDescInput.value.trim(); if (amount && desc) { try { await addDoc(financesCollection, { tipo: 'ingreso', monto: amount, descripcion: desc, timestamp: serverTimestamp() }); showToast('Ingreso guardado!'); addIncomeModalInstance.hide(); addIncomeForm.reset(); } catch(err) { console.error("Err income:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast('Monto y descripción requeridos.', 'warning'); } });
         if(addExpenseForm && addExpenseModalInstance) addExpenseForm.addEventListener('submit', async (e) => { e.preventDefault(); const amount = parseFloat(expenseAmountInput.value); const desc = expenseDescInput.value.trim(); if (amount && desc) { try { await addDoc(financesCollection, { tipo: 'gasto', monto: amount, descripcion: desc, timestamp: serverTimestamp() }); showToast('Gasto guardado!'); addExpenseModalInstance.hide(); addExpenseForm.reset(); } catch(err) { console.error("Err expense:", err); showToast(`Error: ${err.message}`, 'error'); } } else { showToast('Monto y descripción requeridos.', 'warning'); } });
        if (closingForm) closingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            try {
                showToast("Calculando cierre de caja...", 'info');

                // Obtener fecha actual
                const hoy = new Date();
                const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
                const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

                // Consultar ventas del día
                const qVentas = query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(inicio)),
                    where('timestamp', '<=', Timestamp.fromDate(fin)),
                    where('estado', '!=', 'Anulada')
                );
                const ventasSnap = await getDocs(qVentas);

                let totalVentas = 0;
                let ventasEfectivo = 0;
                let ventasTransferencia = 0;
                let detalleProductos = {};

                ventasSnap.forEach(doc => {
                    const venta = doc.data();
                    totalVentas += venta.totalVenta || 0;
                    ventasEfectivo += venta.pagoEfectivo || 0;
                    ventasTransferencia += venta.pagoTransferencia || 0;

                    // Contar productos vendidos
                    if (venta.items) {
                        venta.items.forEach(item => {
                            if (!detalleProductos[item.nombre]) {
                                detalleProductos[item.nombre] = 0;
                            }
                            detalleProductos[item.nombre] += item.cantidad;
                        });
                    }
                });

                const egresos = parseFloat(document.getElementById('caja-egresos').value) || 0;
                const obs = document.getElementById('caja-observaciones').value.trim();
                const totalCaja = ventasEfectivo - egresos;

                // Guardar cierre en BD
                const cierreData = {
                    timestamp: serverTimestamp(),
                    ventasEfectivo,
                    ventasTransferencia,
                    totalVentas,
                    egresos,
                    totalCaja,
                    observaciones: obs
                };

                await addDoc(closingsCollection, cierreData);

                // Crear mensaje para WhatsApp
                let mensaje = `*CIERRE DE CAJA*\\n`;
                mensaje += `📅 ${hoy.toLocaleDateString('es-CO')}\\n\\n`;
                mensaje += `💰 *Total Ventas:* $${totalVentas.toLocaleString()}\\n`;
                mensaje += `💵 Efectivo: $${ventasEfectivo.toLocaleString()}\\n`;
                mensaje += `💳 Transferencia: $${ventasTransferencia.toLocaleString()}\\n`;
                mensaje += `📤 Egresos: $${egresos.toLocaleString()}\\n`;
                mensaje += `💼 *Total en Caja:* $${totalCaja.toLocaleString()}\\n\\n`;
                mensaje += `📦 *Productos Vendidos:*\\n`;

                for (let [producto, cantidad] of Object.entries(detalleProductos)) {
                    mensaje += `• ${producto}: ${cantidad}\\n`;
                }

                if (obs) {
                    mensaje += `\\n📝 Obs: ${obs}`;
                }

                // Abrir WhatsApp
                const whatsappUrl = `https://wa.me/573046084971?text=${encodeURIComponent(mensaje)}`;
                window.open(whatsappUrl, '_blank');

                showToast("Cierre guardado! Enviando por WhatsApp...", 'success');
                closingForm.reset();
            } catch(err) {
                console.error("Err closing:", err);
                showToast(`Error: ${err.message}`, 'error');
            }
        });
         const renderClosings = (snapshot) => { if(!closingHistoryTableBody) return; closingHistoryTableBody.innerHTML = ''; if (snapshot.empty) { closingHistoryTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay cierres.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; const tr = document.createElement('tr'); const fecha = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString('es-CO') : 'N/A'; tr.innerHTML = `<td>${fecha}</td><td>${formatoMoneda.format(d.ventasEfectivo||0)}</td><td>${formatoMoneda.format(d.abonosEfectivo||0)}</td><td>${formatoMoneda.format(d.recibidoRepartidores||0)}</td><td>${formatoMoneda.format(d.egresos||0)}</td><td>${formatoMoneda.format(d.totalCaja||0)}</td><td>${d.observaciones||'-'}</td>`; closingHistoryTableBody.appendChild(tr); }); };
         onSnapshot(query(closingsCollection, orderBy('timestamp', 'desc')), renderClosings, e => { console.error("Error closings:", e); if(closingHistoryTableBody) closingHistoryTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error.</td></tr>';});
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
                (snapshot) => {
                    let totalVentas = 0;
                    let ventasContadas = 0;
                    
                    snapshot.forEach(doc => {
                        const venta = doc.data();
                        const estado = venta.estado || '';
                        
                        // ✅ Filtrar el estado AQUÍ en el cliente
                        if (estado !== 'Anulada' && estado !== 'Cancelada') {
                            totalVentas += (venta.totalVenta || 0);
                            ventasContadas++;
                        }
                    });
                    
                    // Actualizar UI
                    dbVentasHoyEl.textContent = formatoMoneda.format(totalVentas);
                    dbVentasHoyEl.classList.add('text-success');

                    // Actualizar contador de ventas
                    const dbVentasCountEl = document.getElementById('db-ventas-count');
                    if (dbVentasCountEl) {
                        dbVentasCountEl.textContent = `${ventasContadas} ${ventasContadas === 1 ? 'venta' : 'ventas'}`;
                    }

                    console.log(`✅ Ventas hoy: ${formatoMoneda.format(totalVentas)} (${ventasContadas} ventas)`);
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
        bajoStockModal.addEventListener('show.bs.modal', () => {
            const bajoStockList = document.getElementById('bajo-stock-list');
            if (!bajoStockList) return;

            bajoStockList.innerHTML = '';

            if (window.productosBajoStock.length === 0) {
                bajoStockList.innerHTML = '<tr><td colspan="4" class="text-center text-success">¡No hay productos con bajo stock!</td></tr>';
                return;
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
                            ventasPorDia[key] += (venta.totalVenta || 0);
                        }
                    }
                }
            });

            const data = labels.map(label => ventasPorDia[label] || 0);

            // Crear el gráfico
            const ctx = ventasChartCanvas.getContext('2d');
            ventasChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ventas ($)',
                        data: data,
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 },
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
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
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

            // Ordenar y obtener top 5
            const topProductos = Object.entries(productosVendidos)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (topProductos.length === 0) {
                topProductos.push(['Sin datos', 0]);
            }

            const labels = topProductos.map(p => p[0].length > 20 ? p[0].substring(0, 20) + '...' : p[0]);
            const data = topProductos.map(p => p[1]);

            // Crear el gráfico
            const ctx = topProductosChartCanvas.getContext('2d');
            topProductosChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Unidades',
                        data: data,
                        backgroundColor: [
                            'rgba(245, 158, 11, 0.8)',
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(16, 185, 129, 0.8)',
                            'rgba(239, 68, 68, 0.8)',
                            'rgba(139, 92, 246, 0.8)'
                        ],
                        borderColor: [
                            'rgba(245, 158, 11, 1)',
                            'rgba(59, 130, 246, 1)',
                            'rgba(16, 185, 129, 1)',
                            'rgba(239, 68, 68, 1)',
                            'rgba(139, 92, 246, 1)'
                        ],
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: true,
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
    // EVENT LISTENERS
    // ================================================================

    // Cambiar período del gráfico de ventas
    const periodoBtns = document.querySelectorAll('input[name="chart-period"]');
    periodoBtns.forEach(btn => {
        btn.addEventListener('change', (e) => {
            const dias = e.target.id === 'chart-7days' ? 7 :
                        e.target.id === 'chart-30days' ? 30 :
                        180; // 6 meses
            crearGraficoVentas(dias);
        });
    });

    // ================================================================
    // INICIALIZAR
    // ================================================================
    crearGraficoVentas(7);
    crearGraficoTopProductos();
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
                totalVentas += venta.totalVenta || 0;
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
                    const precioVenta = item.precioUnitario * item.cantidad;
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

});
    
