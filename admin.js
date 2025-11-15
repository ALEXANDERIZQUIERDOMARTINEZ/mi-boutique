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
                        <button class="btn btn-danger btn-reject-order" data-order-id="${orderId}">
                            <i class="bi bi-x-circle me-1"></i>Rechazar
                        </button>
                        <button class="btn btn-success btn-accept-order" data-order-id="${orderId}">
                            <i class="bi bi-check-circle me-1"></i>Aceptar y Procesar
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
                    const tab = new bootstrap.Tab(ventasTab);
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
        const render = (snapshot) => { if (!categoryList) return; categoryList.innerHTML = ''; if (snapshot.empty) { categoryList.innerHTML = '<li class="list-group-item text-muted">No hay categorías.</li>'; return; } snapshot.forEach(doc => { const d = doc.data(); const id = doc.id; const li = document.createElement('li'); li.className = 'list-group-item d-flex justify-content-between align-items-center'; li.dataset.id = id; li.innerHTML = `<span class="category-name">${d.nombre}</span><div class="action-buttons"><button class="btn btn-sm btn-outline-secondary py-0 px-1 me-1 btn-edit-category" title="Modificar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-category" title="Eliminar"><i class="bi bi-trash"></i></button></div>`; categoryList.appendChild(li); }); };
        const updateDropdown = (snapshot) => { if (!categoryDropdown) return; const sel = categoryDropdown.value; categoryDropdown.innerHTML = '<option value="">Selecciona...</option>'; snapshot.forEach(doc => { const d = doc.data(); const opt = document.createElement('option'); opt.value = doc.id; opt.textContent = d.nombre; categoryDropdown.appendChild(opt); }); categoryDropdown.value = sel; }
        const checkDuplicate = async (name, currentId = null) => { const lowerCaseName = name.toLowerCase(); const q = query(categoriesCollection, where("nombreLower", "==", lowerCaseName)); const querySnapshot = await getDocs(q); let isDuplicate = false; querySnapshot.forEach((doc) => { if (doc.id !== currentId) { isDuplicate = true; } }); return isDuplicate; };
        // Cargar categorías sin índice (ordenar en memoria)
        onSnapshot(categoriesCollection, (snapshot) => {
            const categories = [];
            snapshot.forEach(doc => {
                categories.push({ id: doc.id, ...doc.data() });
            });
            // Ordenar alfabéticamente en memoria
            categories.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

            // Renderizar con categorías ordenadas
            const orderedSnapshot = { docs: categories.map(c => ({ id: c.id, data: () => c })), forEach: (callback) => categories.forEach((c, i) => callback({ id: c.id, data: () => c }, i)), empty: categories.length === 0 };
            render(orderedSnapshot);
            updateDropdown(orderedSnapshot);
        }, (e) => {
            console.error("Error categories: ", e);
            if(categoryList) categoryList.innerHTML = '<li class="list-group-item text-danger">Error.</li>';
        });
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

        const renderSuppliers = (snapshot) => { suppliersMap.clear(); listTable.innerHTML = ''; searchModalList.innerHTML = ''; if (snapshot.empty) { listTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay proveedores.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; suppliersMap.set(id, d); if (listTable) { const tr = document.createElement('tr'); tr.dataset.id = id; tr.innerHTML = `<td class="supplier-name">${d.nombre}</td> <td>${d.contacto || '-'}</td> <td>${d.telefono || '-'}</td> <td class="action-buttons"><button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-supplier" title="Modificar"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-supplier" title="Eliminar"><i class="bi bi-trash"></i></button></td>`; listTable.appendChild(tr); }
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
        
        const renderClients = (snapshot) => { localClientsMap.clear(); if(clientListTable) clientListTable.innerHTML = ''; if(searchModalList) searchModalList.innerHTML = ''; localClientsMap.set("Cliente General", {id: null, celular: "", direccion: "", nombre: "Cliente General"}); if(searchModalList) { const liGen = document.createElement('li'); liGen.className = 'list-group-item list-group-item-action client-search-item'; liGen.dataset.name = "Cliente General"; liGen.dataset.id = ""; liGen.textContent = "Cliente General"; searchModalList.appendChild(liGen); } if (snapshot.empty) { if(clientListTable) clientListTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay clientes.</td></tr>'; return; } snapshot.forEach(docSnap => { const d = docSnap.data(); const id = docSnap.id; const dataListValue = d.cedula ? `${d.cedula} - ${d.nombre}` : d.nombre; localClientsMap.set(dataListValue, { id: id, celular: d.celular || "", direccion: d.direccion || "" }); localClientsMap.set(id, d); if (clientListTable) { const tr = document.createElement('tr'); tr.dataset.id = id; tr.innerHTML = `<td class="client-name">${d.nombre}</td> <td>${d.cedula || '-'}</td> <td>${d.celular || '-'}</td> <td>${d.direccion || '-'}</td> <td>${d.ultimaCompra?.toDate ? d.ultimaCompra.toDate().toLocaleDateString('es-CO') : '-'}</td> <td class="action-buttons"><button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-client" title="Modificar"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-client" title="Eliminar"><i class="bi bi-trash"></i></button></td>`; clientListTable.appendChild(tr); }
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
                     const saldoPendiente = efectivoAEntregar;

                     const tr = document.createElement('tr');
                     tr.dataset.id = id;
                     tr.innerHTML = `<td class="repartidor-name">${rep.nombre}</td>
                         <td>${stats.entregas}</td>
                         <td>${formatoMoneda.format(efectivoRecibido)}</td>
                         <td>${formatoMoneda.format(rutasTotal)}</td>
                         <td>${formatoMoneda.format(rutasTransf)}</td>
                         <td class="fw-bold">${formatoMoneda.format(efectivoAEntregar)}</td>
                         <td><input type="number" class="form-control form-control-sm w-75 d-inline-block input-efectivo-entregado"
                                    value="0.00" step="0.01" data-expected="${efectivoAEntregar}"></td>
                         <td class="saldo-pendiente ${saldoPendiente <= 0 ? 'text-success' : 'text-danger'} fw-bold">${formatoMoneda.format(saldoPendiente)}</td>
                         <td class="action-buttons">
                             <button class="btn btn-sm btn-success py-0 px-1 btn-liquidar-repartidor" title="Liquidar">
                                 <i class="bi bi-check-circle"></i>
                             </button>
                             <button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-repartidor" title="Modificar">
                                 <i class="bi bi-pencil"></i>
                             </button>
                             <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-repartidor" title="Eliminar">
                                 <i class="bi bi-trash"></i>
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

                     const ventasQuery = query(
                         salesCollection,
                         where('timestamp', '>=', hoy),
                         where('timestamp', '<', manana),
                         where('repartidorId', '==', repartidorId)
                     );

                     const ventasSnap = await getDocs(ventasQuery);
                     const ventasIds = [];
                     let totalEfectivo = 0;
                     let totalRutas = 0;

                     ventasSnap.forEach(doc => {
                         ventasIds.push(doc.id);
                         const venta = doc.data();
                         totalEfectivo += venta.pagoEfectivo || 0;
                         totalRutas += venta.costoRuta || 0;
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
                    ? `<button class="btn btn-sm btn-warning py-0 px-2 btn-manage-promo" title="Gestionar Promoción">
                        <i class="bi bi-tag-fill"></i> ${d.promocion.tipo === 'porcentaje' ? d.promocion.descuento + '%' : 'Precio'}
                       </button>`
                    : `<button class="btn btn-sm btn-outline-secondary py-0 px-2 btn-manage-promo" title="Agregar Promoción">
                        <i class="bi bi-tag"></i> Agregar
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
                                <td class="action-buttons"><button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-product" title="Modificar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-product" title="Eliminar"><i class="bi bi-trash"></i></button></td>`;
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
        // Cargar productos sin índice (ordenar en memoria)
        onSnapshot(productsCollection, (snapshot) => {
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            // Ordenar por timestamp descendente en memoria
            products.sort((a, b) => {
                const timeA = a.timestamp?.toMillis?.() || 0;
                const timeB = b.timestamp?.toMillis?.() || 0;
                return timeB - timeA;
            });
            // Crear snapshot simulado para renderProducts
            const orderedSnapshot = {
                docs: products.map(p => ({ id: p.id, data: () => p })),
                forEach: (callback) => products.forEach((p, i) => callback({ id: p.id, data: () => p }, i)),
                empty: products.length === 0
            };
            renderProducts(orderedSnapshot);
        }, e => {
            console.error("Error products:", e);
            if(productListTableBody) productListTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error al cargar productos.</td></tr>';
        });
        
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
            let productData = { nombre: nombreInput.value.trim(), proveedor: proveedorInput.value.trim(), descripcion: descripcionInput.value.trim(), categoriaId: categoriaSelect.value, costoCompra: parseFloat(costoInput.value) || 0, precioDetal: parseFloat(detalInput.value) || 0, precioMayor: parseFloat(mayorInput.value) || 0, visible: visibleCheckbox.checked, timestamp: serverTimestamp(), variaciones: [], imagenUrl: null };
            
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
            document.getElementById('variation-product-price').value = product.precioDetal || 0;
            
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
                tr.innerHTML = `<td>${item.nombreCompleto}</td><td><input type="number" class="form-control form-control-sm item-qty-input" value="${item.cantidad}" min="1" data-index="${index}"></td><td>${formatoMoneda.format(item.precio)}</td><td>${formatoMoneda.format(item.total)}</td><td><button type="button" class="btn btn-sm btn-outline-danger py-0 px-1 btn-quitar-item" data-index="${index}">&times;</button></td>`; 
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
                                    <button class="btn btn-sm btn-outline-primary py-0 px-1 btn-view-sale" title="Ver"><i class="bi bi-eye"></i></button>
                                    ${d.tipoVenta === 'apartado' && !estaAnulada ? `<button class="btn btn-sm btn-outline-warning py-0 px-1 btn-manage-apartado" title="Gestionar"><i class="bi bi-calendar-heart"></i></button>` : ''}
                                    <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-cancel-sale" title="Anular" ${estaAnulada ? 'disabled' : ''}>
                                        <i class="bi bi-trash"></i>
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
                // Filtrar por fecha específica (sin orderBy)
                const inicio = new Date(fechaFiltro);
                inicio.setHours(0, 0, 0, 0);
                const fin = new Date(fechaFiltro);
                fin.setHours(23, 59, 59, 999);

                q = query(
                    salesCollection,
                    where('timestamp', '>=', inicio),
                    where('timestamp', '<=', fin)
                );
            } else {
                // Sin filtro, cargar todas (sin orderBy)
                q = salesCollection;
            }

            // Ordenar en memoria
            ventasUnsubscribe = onSnapshot(q, (snapshot) => {
                const ventas = [];
                snapshot.forEach(doc => {
                    ventas.push({ id: doc.id, ...doc.data() });
                });
                // Ordenar por timestamp descendente en memoria
                ventas.sort((a, b) => {
                    const timeA = a.timestamp?.toMillis?.() || 0;
                    const timeB = b.timestamp?.toMillis?.() || 0;
                    return timeB - timeA;
                });
                // Crear snapshot simulado
                const orderedSnapshot = {
                    docs: ventas.map(v => ({ id: v.id, data: () => v })),
                    forEach: (callback) => ventas.forEach((v, i) => callback({ id: v.id, data: () => v }, i)),
                    empty: ventas.length === 0
                };
                renderSales(orderedSnapshot);
            }, e => {
                console.error("Error sales:", e);
                if(salesListTableBody) salesListTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error al cargar ventas.</td></tr>';
            });
        }

        // Eventos del filtro
        const filtroFechaInput = document.getElementById('filtro-fecha-ventas');
        const btnLimpiarFiltro = document.getElementById('btn-limpiar-filtro-ventas');

        if (filtroFechaInput) {
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
                    filtroFechaInput.value = '';
                    cargarVentas();
                }
            });
        }

        // Cargar ventas inicialmente
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
                        total: ventaData.totalVenta,
                        abonado: abonoInicial,
                        saldo: saldoPendiente,
                        fechaCreacion: serverTimestamp(),
                        fechaVencimiento: Timestamp.fromDate(fechaVencimiento),
                        estado: 'Pendiente',
                        items: ventaData.items, // Guardar items para referencia
                        abonos: [{
                            fecha: serverTimestamp(),
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

        // --- Función para actualizar stock (restar o sumar) ---
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
                    const tab = new bootstrap.Tab(apartadosTab);
                    tab.show();
                    showToast(`Gestiona el apartado desde esta pestaña`, 'info');
                }
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
                        <button class="btn btn-sm btn-outline-info py-0 px-1 btn-ver-apartado"
                                title="Ver Detalles" data-apartado-id="${id}">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-success py-0 px-1 btn-abono-apartado"
                                title="Registrar Abono" data-apartado-id="${id}">
                            <i class="bi bi-cash-coin"></i>
                        </button>
                        <button class="btn btn-sm btn-primary py-0 px-1 btn-completar-apartado"
                                title="Completar" data-apartado-id="${id}" ${saldo > 0 ? 'disabled' : ''}>
                            <i class="bi bi-check-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-cancel-apartado"
                                title="Cancelar" data-apartado-id="${id}">
                            <i class="bi bi-x-circle"></i>
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

        // --- Función para actualizar stock (restar o sumar) ---
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
                    const tab = new bootstrap.Tab(apartadosTab);
                    tab.show();
                    showToast(`Gestiona el apartado desde esta pestaña`, 'info');
                }
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
                        <button class="btn btn-sm btn-outline-info py-0 px-1 btn-ver-apartado"
                                title="Ver Detalles" data-apartado-id="${id}">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-success py-0 px-1 btn-abono-apartado"
                                title="Registrar Abono" data-apartado-id="${id}">
                            <i class="bi bi-cash-coin"></i>
                        </button>
                        <button class="btn btn-sm btn-primary py-0 px-1 btn-completar-apartado"
                                title="Completar" data-apartado-id="${id}" ${saldo > 0 ? 'disabled' : ''}>
                            <i class="bi bi-check-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger py-0 px-1 btn-cancel-apartado"
                                title="Cancelar" data-apartado-id="${id}">
                            <i class="bi bi-x-circle"></i>
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
                e.preventDefault();
                const target = e.target.closest('button');
                if (!target) return;
                
                const apartadoId = target.dataset.apartadoId;
                if (!apartadoId) return;
                
                if (target.classList.contains('btn-ver-apartado')) {
                    await abrirModalVerApartado(apartadoId);
                } else if (target.classList.contains('btn-abono-apartado')) {
                    await abrirModalAbono(apartadoId);
                } else if (target.classList.contains('btn-completar-apartado')) {
                    await completarApartado(apartadoId);
                } else if (target.classList.contains('btn-cancel-apartado')) {
                    await cancelarApartado(apartadoId);
                }
            });
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
            if (!confirm('¿Estás seguro de cancelar este apartado?\n\nEsta acción devolverá el stock de los productos.')) {
                return;
            }
            
            try {
                const apartadoRef = doc(db, 'apartados', apartadoId);
                const apartadoSnap = await getDoc(apartadoRef);
                
                if (!apartadoSnap.exists()) {
                    showToast('Apartado no encontrado', 'error');
                    return;
                }
                
                const apartadoData = apartadoSnap.data();
                
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);
                    
                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();
                        
                        // Solo devolver stock si la venta no estaba ya cancelada
                        if (ventaData.estado !== 'Cancelada' && ventaData.estado !== 'Anulada') {
                             await actualizarStock(ventaData.items, 'sumar');
                        }
                       
                        await updateDoc(ventaRef, {
                            estado: 'Cancelada'
                        });
                    }
                }
                
                await updateDoc(apartadoRef, {
                    estado: 'Cancelado',
                    fechaCancelacion: serverTimestamp()
                });
                
                showToast('Apartado cancelado y stock devuelto', 'info');
                
            } catch (error) {
                console.error('Error al cancelar apartado:', error);
                showToast('Error al cancelar el apartado', 'error');
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
                const abonos = apartadoData.abonos || [];
                const nuevoAbono = {
                    fecha: serverTimestamp(),
                    monto: monto,
                    metodoPago: metodoPago,
                    observaciones: observaciones || 'Sin observaciones'
                };
                abonos.push(nuevoAbono);

                // ✅ PASO 4: Actualizar apartado
                await updateDoc(apartadoRef, {
                    abonado: nuevoAbonado,
                    saldo: nuevoSaldo,
                    abonos: abonos,
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
        if (closingForm) closingForm.addEventListener('submit', async (e) => { e.preventDefault(); showToast("Realizando cierre... (Lógica pendiente)", 'warning'); const egresos = parseFloat(document.getElementById('caja-egresos').value) || 0; const obs = document.getElementById('caja-observaciones').value.trim(); const cierreData = { timestamp: serverTimestamp(), egresos, observaciones: obs }; try { showToast("Cierre guardado (simulado)!"); } catch(err) { console.error("Err closing:", err); showToast(`Error: ${err.message}`, 'error'); } });
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
            const STOCK_MINIMO = 2; // ✅ Cambiado a 2 unidades

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

                        // Revisar cada variación individualmente
                        variaciones.forEach(variacion => {
                            const stock = parseInt(variacion.stock, 10) || 0;

                            // Si la variación tiene stock ≤ 2
                            if (stock > 0 && stock <= STOCK_MINIMO) {
                                window.productosBajoStock.push({
                                    id: productoId,
                                    nombre: producto.nombre,
                                    talla: variacion.talla || 'N/A',
                                    color: variacion.color || 'N/A',
                                    stock: stock,
                                    categoriaId: producto.categoriaId
                                });
                            }
                        });
                    });

                    // Actualizar UI
                    const count = window.productosBajoStock.length;
                    dbBajoStockEl.textContent = count;

                    if (count > 0) {
                        dbBajoStockEl.classList.add('text-warning');
                    } else {
                        dbBajoStockEl.classList.add('text-success');
                    }

                    console.log(`✅ Variaciones con bajo stock: ${count}`);
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
    // 3️⃣ APARTADOS PRÓXIMOS A VENCER
    // ================================================================
    function calcularApartadosVencer() {
        console.log("📅 Calculando apartados próximos a vencer...");

        try {
            const hoy = new Date();
            const proximosDias = new Date(hoy);
            proximosDias.setDate(proximosDias.getDate() + 7); // Próximos 7 días

            // Query simplificada - filtrar en memoria
            onSnapshot(apartadosCollection,
                (snapshot) => {
                    let countVencer = 0;
                    let saldoTotal = 0;

                    snapshot.forEach(doc => {
                        const apartado = doc.data();

                        // Filtrar en memoria
                        if (apartado.estado !== 'Pendiente') return;

                        const fechaVenc = apartado.fechaVencimiento?.toDate();

                        // Solo contar los que vencen en los próximos 7 días y aún no han vencido
                        if (fechaVenc && fechaVenc >= hoy && fechaVenc <= proximosDias) {
                            countVencer++;
                            saldoTotal += apartado.saldo || 0;
                        }
                    });

                    // Actualizar UI
                    dbApartadosVencerEl.textContent = countVencer;

                    // Actualizar saldo total
                    const saldoEl = document.getElementById('db-apartados-total-saldo');
                    if (saldoEl) {
                        saldoEl.textContent = formatoMoneda.format(saldoTotal) + ' pendiente';
                    }

                    if (countVencer > 0) {
                        dbApartadosVencerEl.classList.add('text-danger');
                    } else {
                        dbApartadosVencerEl.classList.add('text-success');
                    }

                    console.log(`✅ Apartados próximos a vencer: ${countVencer}`);
                },
                (error) => {
                    console.error("❌ Error al calcular apartados por vencer:", error);
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

            // Renderizar cada producto
            window.productosBajoStock.forEach(item => {
                const categoria = categoriesMap.get(item.categoriaId) || 'Sin categoría';
                const stockClass = item.stock === 1 ? 'text-danger fw-bold' : 'text-warning fw-bold';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="fw-bold">${item.nombre}</td>
                    <td><span class="badge bg-secondary">${item.talla} / ${item.color}</span></td>
                    <td class="text-center ${stockClass}">${item.stock}</td>
                    <td><small class="text-muted">${categoria}</small></td>
                `;
                bajoStockList.appendChild(tr);
            });
        });
    }

    // ================================================================
    // 🚀 INICIALIZAR TODAS LAS FUNCIONES
    // ================================================================
    calcularVentasHoy();
    calcularBajoStock();
    calcularApartadosVencer();

    // ========================================================================
    // 📊 GRÁFICOS DEL DASHBOARD
    // ========================================================================

    let ventasChart = null;
    let topProductosChart = null;

    // ✅ GRÁFICO DE TENDENCIA DE VENTAS
    function initVentasChart() {
        const ctx = document.getElementById('ventasChart');
        if (!ctx) return;

        ventasChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Ventas ($)',
                    data: [],
                    borderColor: '#D988B9',
                    backgroundColor: 'rgba(217, 136, 185, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#D988B9',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
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
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function(context) {
                                return formatoMoneda.format(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatoMoneda.format(value);
                            }
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
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
    }

    // ✅ GRÁFICO DE TOP PRODUCTOS
    function initTopProductosChart() {
        const ctx = document.getElementById('topProductosChart');
        if (!ctx) return;

        topProductosChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#D988B9',
                        '#FF8DA1',
                        '#C77DA5',
                        '#E5A4C3',
                        '#B86FA2'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 11 },
                            generateLabels: function(chart) {
                                const data = chart.data;
                                if (data.labels.length && data.datasets.length) {
                                    return data.labels.map((label, i) => {
                                        const value = data.datasets[0].data[i];
                                        return {
                                            text: `${label} (${value})`,
                                            fillStyle: data.datasets[0].backgroundColor[i],
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                }
                                return [];
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.parsed} unidades`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ✅ CARGAR DATOS DE VENTAS POR PERIODO (sin índices)
    async function cargarVentasPorPeriodo(dias) {
        try {
            const hoy = new Date();
            hoy.setHours(23, 59, 59, 999);

            const fechaInicio = new Date(hoy);
            fechaInicio.setDate(fechaInicio.getDate() - dias + 1);
            fechaInicio.setHours(0, 0, 0, 0);

            // Query simple sin orderBy (ordenar en memoria)
            const q = query(
                salesCollection,
                where('timestamp', '>=', fechaInicio),
                where('timestamp', '<=', hoy)
            );

            const snapshot = await getDocs(q);
            const ventasPorFecha = {};

            // Inicializar todos los días con 0
            for (let i = 0; i < dias; i++) {
                const fecha = new Date(fechaInicio);
                fecha.setDate(fecha.getDate() + i);
                const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                ventasPorFecha[key] = 0;
            }

            // Sumar ventas por fecha
            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const fecha = venta.timestamp?.toDate();
                    if (fecha) {
                        const key = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
                        ventasPorFecha[key] = (ventasPorFecha[key] || 0) + (venta.totalVenta || 0);
                    }
                }
            });

            const labels = Object.keys(ventasPorFecha);
            const data = Object.values(ventasPorFecha);

            if (ventasChart) {
                ventasChart.data.labels = labels;
                ventasChart.data.datasets[0].data = data;
                ventasChart.update();
            }

        } catch (error) {
            console.error("Error cargando ventas por periodo:", error);
        }
    }

    // ✅ CARGAR DATOS DE VENTAS POR MESES (sin índices)
    async function cargarVentasPorMeses(meses) {
        try {
            const hoy = new Date();
            const fechaInicio = new Date(hoy);
            fechaInicio.setMonth(fechaInicio.getMonth() - meses + 1);
            fechaInicio.setDate(1);
            fechaInicio.setHours(0, 0, 0, 0);

            // Query simple sin orderBy (ordenar en memoria)
            const q = query(
                salesCollection,
                where('timestamp', '>=', fechaInicio)
            );

            const snapshot = await getDocs(q);
            const ventasPorMes = {};

            // Inicializar todos los meses con 0
            for (let i = 0; i < meses; i++) {
                const fecha = new Date(fechaInicio);
                fecha.setMonth(fecha.getMonth() + i);
                const key = fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
                ventasPorMes[key] = 0;
            }

            // Sumar ventas por mes
            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    const fecha = venta.timestamp?.toDate();
                    if (fecha) {
                        const key = fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
                        ventasPorMes[key] = (ventasPorMes[key] || 0) + (venta.totalVenta || 0);
                    }
                }
            });

            const labels = Object.keys(ventasPorMes);
            const data = Object.values(ventasPorMes);

            if (ventasChart) {
                ventasChart.data.labels = labels;
                ventasChart.data.datasets[0].data = data;
                ventasChart.update();
            }

        } catch (error) {
            console.error("Error cargando ventas por meses:", error);
        }
    }

    // ✅ CARGAR TOP PRODUCTOS MÁS VENDIDOS (sin índices)
    async function cargarTopProductos() {
        try {
            // Obtener todas las ventas del último mes
            const hoy = new Date();
            const hace30Dias = new Date(hoy);
            hace30Dias.setDate(hace30Dias.getDate() - 30);

            // Query simple sin orderBy (no necesita orden aquí)
            const q = query(
                salesCollection,
                where('timestamp', '>=', hace30Dias)
            );

            const snapshot = await getDocs(q);
            const productosCantidad = {};

            snapshot.forEach(doc => {
                const venta = doc.data();
                if (venta.estado !== 'Anulada' && venta.estado !== 'Cancelada') {
                    venta.items?.forEach(item => {
                        const nombre = item.nombre || 'Sin nombre';
                        productosCantidad[nombre] = (productosCantidad[nombre] || 0) + (item.cantidad || 0);
                    });
                }
            });

            // Ordenar y tomar top 5
            const topProductos = Object.entries(productosCantidad)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const labels = topProductos.map(p => p[0]);
            const data = topProductos.map(p => p[1]);

            if (topProductosChart) {
                topProductosChart.data.labels = labels;
                topProductosChart.data.datasets[0].data = data;
                topProductosChart.update();
            }

        } catch (error) {
            console.error("Error cargando top productos:", error);
        }
    }

    // ✅ EVENT LISTENERS PARA CAMBIAR PERIODO
    document.getElementById('chart-7days')?.addEventListener('change', () => cargarVentasPorPeriodo(7));
    document.getElementById('chart-30days')?.addEventListener('change', () => cargarVentasPorPeriodo(30));
    document.getElementById('chart-6months')?.addEventListener('change', () => cargarVentasPorMeses(6));

    // ✅ INICIALIZAR GRÁFICOS
    setTimeout(() => {
        console.log("📊 Inicializando gráficos del dashboard...");
        initVentasChart();
        initTopProductosChart();
        cargarVentasPorPeriodo(7); // Cargar 7 días por defecto
        cargarTopProductos();
        console.log("✅ Gráficos inicializados correctamente");
    }, 1000); // Esperar a que Chart.js esté disponible

    console.log("✅ Dashboard inicializado correctamente");

})(); // ← Cierre del IIFE del Dashboard

// ========================================================================
// FIN DE LA SECCIÓN DEL DASHBOARD
// ========================================================================

// ========================================================================
// 📊 SISTEMA DE REPORTES
// ========================================================================
(() => {
    const formReporte = document.getElementById('form-reporte');
    const reporteTipo = document.getElementById('reporte-tipo');
    const reporteDesde = document.getElementById('reporte-desde');
    const reporteHasta = document.getElementById('reporte-hasta');
    const areaReporte = document.getElementById('area-reporte');
    const btnImprimir = document.getElementById('btn-imprimir-reporte');
    const repartidorFilter = document.getElementById('reporte-repartidor-filter');
    const repartidorSelect = document.getElementById('reporte-repartidor-select');

    if (!formReporte) return;

    // Mostrar/ocultar filtro de repartidor
    reporteTipo?.addEventListener('change', () => {
        if (reporteTipo.value === 'repartidor') {
            repartidorFilter.style.display = 'block';
            cargarRepartidoresReporte();
        } else {
            repartidorFilter.style.display = 'none';
        }
    });

    // Cargar repartidores para el filtro
    async function cargarRepartidoresReporte() {
        const snapshot = await getDocs(repartidoresCollection);
        repartidorSelect.innerHTML = '<option value="">Todos los repartidores</option>';
        snapshot.forEach(doc => {
            const rep = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = rep.nombre;
            repartidorSelect.appendChild(option);
        });
    }

    // Generar reporte
    formReporte.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tipo = reporteTipo.value;
        const desde = new Date(reporteDesde.value);
        desde.setHours(0, 0, 0, 0);
        const hasta = new Date(reporteHasta.value);
        hasta.setHours(23, 59, 59, 999);

        if (!tipo) {
            showToast('Selecciona un tipo de reporte', 'warning');
            return;
        }

        areaReporte.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div><p class="mt-2">Generando reporte...</p></div>';
        btnImprimir.style.display = 'none';

        try {
            let html = '';
            switch (tipo) {
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
                    html = await generarReporteRepartidor(desde, hasta, repartidorSelect.value);
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
            console.error('Error generando reporte:', error);
            areaReporte.innerHTML = '<div class="alert alert-danger">Error al generar el reporte</div>';
        }
    });

    // Función para obtener ventas del periodo
    async function obtenerVentasPeriodo(desde, hasta) {
        const q = query(salesCollection, where('timestamp', '>=', desde), where('timestamp', '<=', hasta));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // REPORTE DE VENTAS
    async function generarReporteVentas(desde, hasta) {
        const ventas = await obtenerVentasPeriodo(desde, hasta);
        const ventasValidas = ventas.filter(v => v.estado !== 'Anulada' && v.estado !== 'Cancelada');

        const totalVentas = ventasValidas.reduce((sum, v) => sum + (v.totalVenta || 0), 0);
        const totalEfectivo = ventasValidas.reduce((sum, v) => sum + (v.pagoEfectivo || 0), 0);
        const totalTransferencia = ventasValidas.reduce((sum, v) => sum + (v.pagoTransferencia || 0), 0);

        let html = `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">📊 Reporte de Ventas</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row text-center mb-4">
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <h6 class="text-muted">Total Ventas</h6>
                                <h3 class="text-primary">${formatoMoneda.format(totalVentas)}</h3>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <h6 class="text-muted">Cantidad</h6>
                                <h3 class="text-success">${ventasValidas.length}</h3>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <h6 class="text-muted">Promedio</h6>
                                <h3 class="text-info">${formatoMoneda.format(ventasValidas.length ? totalVentas / ventasValidas.length : 0)}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <p><strong>Efectivo:</strong> ${formatoMoneda.format(totalEfectivo)}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Transferencia:</strong> ${formatoMoneda.format(totalTransferencia)}</p>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th>Tipo</th>
                                    <th class="text-end">Total</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ventasValidas.map(v => `
                                    <tr>
                                        <td>${v.timestamp?.toDate().toLocaleDateString('es-CO')}</td>
                                        <td>${v.clienteNombre || 'N/A'}</td>
                                        <td><span class="badge bg-secondary">${v.tipoVenta}</span></td>
                                        <td class="text-end">${formatoMoneda.format(v.totalVenta || 0)}</td>
                                        <td><span class="badge ${v.estado === 'Completada' ? 'bg-success' : 'bg-warning'}">${v.estado}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        return html;
    }

    // REPORTE DE UTILIDAD
    async function generarReporteUtilidad(desde, hasta) {
        const ventas = await obtenerVentasPeriodo(desde, hasta);
        const ventasValidas = ventas.filter(v => v.estado !== 'Anulada' && v.estado !== 'Cancelada');

        let totalVentas = 0;
        let totalCosto = 0;

        for (const venta of ventasValidas) {
            totalVentas += venta.totalVenta || 0;
            for (const item of (venta.items || [])) {
                // Obtener costo del producto
                const prodSnapshot = await getDocs(query(productsCollection, where('nombre', '==', item.nombre)));
                if (!prodSnapshot.empty) {
                    const costo = prodSnapshot.docs[0].data().costoCompra || 0;
                    totalCosto += costo * (item.cantidad || 0);
                }
            }
        }

        const utilidad = totalVentas - totalCosto;
        const margen = totalVentas > 0 ? ((utilidad / totalVentas) * 100).toFixed(2) : 0;

        return `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">💰 Reporte de Utilidad</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded mb-3">
                                <h6 class="text-muted">Total Ventas</h6>
                                <h4 class="text-primary">${formatoMoneda.format(totalVentas)}</h4>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-light rounded mb-3">
                                <h6 class="text-muted">Costo Total</h6>
                                <h4 class="text-danger">${formatoMoneda.format(totalCosto)}</h4>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-success text-white rounded mb-3">
                                <h6>Utilidad Neta</h6>
                                <h4>${formatoMoneda.format(utilidad)}</h4>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="p-3 bg-info text-white rounded mb-3">
                                <h6>Margen</h6>
                                <h4>${margen}%</h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // REPORTE MÁS VENDIDOS
    async function generarReporteMasVendidos(desde, hasta) {
        const ventas = await obtenerVentasPeriodo(desde, hasta);
        const ventasValidas = ventas.filter(v => v.estado !== 'Anulada' && v.estado !== 'Cancelada');

        const productos = {};
        ventasValidas.forEach(venta => {
            venta.items?.forEach(item => {
                const key = item.nombre;
                if (!productos[key]) {
                    productos[key] = { nombre: key, cantidad: 0, total: 0 };
                }
                productos[key].cantidad += item.cantidad || 0;
                productos[key].total += (item.precio || 0) * (item.cantidad || 0);
            });
        });

        const topProductos = Object.values(productos).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);

        return `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">🏆 Top 10 Productos Más Vendidos</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Producto</th>
                                    <th class="text-center">Unidades Vendidas</th>
                                    <th class="text-end">Total Generado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topProductos.map((p, i) => `
                                    <tr>
                                        <td><strong>${i + 1}</strong></td>
                                        <td>${p.nombre}</td>
                                        <td class="text-center"><span class="badge bg-primary">${p.cantidad}</span></td>
                                        <td class="text-end">${formatoMoneda.format(p.total)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // REPORTE POR REPARTIDOR
    async function generarReporteRepartidor(desde, hasta, repartidorId) {
        let q = query(salesCollection, where('timestamp', '>=', desde), where('timestamp', '<=', hasta), where('tipoEntrega', '==', 'domicilio'));
        if (repartidorId) {
            q = query(salesCollection, where('timestamp', '>=', desde), where('timestamp', '<=', hasta), where('repartidorId', '==', repartidorId));
        }

        const snapshot = await getDocs(q);
        const ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(v => v.estado !== 'Anulada');

        const repartidores = {};
        ventas.forEach(v => {
            const key = v.repartidorNombre || 'Sin asignar';
            if (!repartidores[key]) {
                repartidores[key] = { nombre: key, entregas: 0, efectivo: 0, transferencia: 0, totalRutas: 0 };
            }
            repartidores[key].entregas++;
            repartidores[key].efectivo += v.rutaPagadaTransferencia ? 0 : (v.pagoEfectivo || 0);
            repartidores[key].transferencia += (v.pagoTransferencia || 0);
            repartidores[key].totalRutas += v.costoRuta || 0;
        });

        return `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">🚴 Reporte por Repartidor</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Repartidor</th>
                                    <th class="text-center">Entregas</th>
                                    <th class="text-end">Efectivo</th>
                                    <th class="text-end">Transferencia</th>
                                    <th class="text-end">Costo Rutas</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(repartidores).map(r => `
                                    <tr>
                                        <td><strong>${r.nombre}</strong></td>
                                        <td class="text-center">${r.entregas}</td>
                                        <td class="text-end">${formatoMoneda.format(r.efectivo)}</td>
                                        <td class="text-end">${formatoMoneda.format(r.transferencia)}</td>
                                        <td class="text-end">${formatoMoneda.format(r.totalRutas)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // REPORTE DE APARTADOS
    async function generarReporteApartados(desde, hasta) {
        const q = query(apartadosCollection, where('fechaCreacion', '>=', desde), where('fechaCreacion', '<=', hasta));
        const snapshot = await getDocs(q);
        const apartados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const totalApartados = apartados.reduce((sum, a) => sum + (a.total || 0), 0);
        const totalAbonado = apartados.reduce((sum, a) => sum + (a.abonado || 0), 0);
        const totalSaldo = apartados.reduce((sum, a) => sum + (a.saldo || 0), 0);

        return `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">📅 Reporte de Apartados</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row text-center mb-4">
                        <div class="col-md-4">
                            <div class="p-3 bg-light rounded">
                                <h6 class="text-muted">Total Apartados</h6>
                                <h4>${formatoMoneda.format(totalApartados)}</h4>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-success text-white rounded">
                                <h6>Abonado</h6>
                                <h4>${formatoMoneda.format(totalAbonado)}</h4>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="p-3 bg-warning text-white rounded">
                                <h6>Saldo Pendiente</h6>
                                <h4>${formatoMoneda.format(totalSaldo)}</h4>
                            </div>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Cliente</th>
                                    <th class="text-end">Total</th>
                                    <th class="text-end">Abonado</th>
                                    <th class="text-end">Saldo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${apartados.map(a => `
                                    <tr>
                                        <td>${a.clienteNombre || 'N/A'}</td>
                                        <td class="text-end">${formatoMoneda.format(a.total || 0)}</td>
                                        <td class="text-end text-success">${formatoMoneda.format(a.abonado || 0)}</td>
                                        <td class="text-end text-danger">${formatoMoneda.format(a.saldo || 0)}</td>
                                        <td><span class="badge ${a.estado === 'Completado' ? 'bg-success' : 'bg-warning'}">${a.estado}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // REPORTE DE DESCUENTOS
    async function generarReporteDescuentos(desde, hasta) {
        const ventas = await obtenerVentasPeriodo(desde, hasta);
        const ventasConDescuento = ventas.filter(v => (v.descuento || 0) > 0 && v.estado !== 'Anulada');

        const totalDescuentos = ventasConDescuento.reduce((sum, v) => {
            const desc = v.descuentoTipo === 'porcentaje' ? (v.totalVenta * v.descuento / 100) : v.descuento;
            return sum + desc;
        }, 0);

        return `
            <div class="card">
                <div class="card-header bg-white">
                    <h5 class="mb-0">🎁 Reporte de Descuentos</h5>
                    <small class="text-muted">Periodo: ${desde.toLocaleDateString('es-CO')} - ${hasta.toLocaleDateString('es-CO')}</small>
                </div>
                <div class="card-body">
                    <div class="row text-center mb-4">
                        <div class="col-md-6">
                            <div class="p-3 bg-light rounded">
                                <h6 class="text-muted">Ventas con Descuento</h6>
                                <h4>${ventasConDescuento.length}</h4>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="p-3 bg-danger text-white rounded">
                                <h6>Total Descontado</h6>
                                <h4>${formatoMoneda.format(totalDescuentos)}</h4>
                            </div>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
                                <tr>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th class="text-end">Total</th>
                                    <th class="text-end">Descuento</th>
                                    <th>Tipo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ventasConDescuento.map(v => {
                                    const desc = v.descuentoTipo === 'porcentaje' ? (v.totalVenta * v.descuento / 100) : v.descuento;
                                    return `
                                        <tr>
                                            <td>${v.timestamp?.toDate().toLocaleDateString('es-CO')}</td>
                                            <td>${v.clienteNombre || 'N/A'}</td>
                                            <td class="text-end">${formatoMoneda.format(v.totalVenta || 0)}</td>
                                            <td class="text-end text-danger">${formatoMoneda.format(desc)}</td>
                                            <td><span class="badge bg-secondary">${v.descuentoTipo === 'porcentaje' ? v.descuento + '%' : 'Fijo'}</span></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // Botón de imprimir
    btnImprimir?.addEventListener('click', () => {
        window.print();
    });

    console.log("✅ Sistema de reportes inicializado");
})();

// ========================================================================
// FIN DEL SISTEMA DE REPORTES
// ========================================================================

});
