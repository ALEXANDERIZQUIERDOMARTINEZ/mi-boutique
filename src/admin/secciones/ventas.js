// Ventas — formulario de venta, carrito, historial, cotizaciones y facturas.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que hace falta (ver
// cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers, modales) llega ahora en `ctx`.
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getFirstRealTierMin, getHybridTierInfo, isSurtidoGroup, resolveWholesaleGroupConRespaldo } from "../../../wholesale-tiers.js?v=2";
import { registrarAuditoria } from "../../../auditoria.js?v=1.0.1";

export function init(ctx) {
    const { actualizarStock, apartadosCollection, aplicarFormatoDinero, coincideVariacion, cotizacionesCollection, crearCalendarioVentas, db, eliminarFormatoNumero, esProveedorBoutique, facturaAccionesModalInstance, facturaPreguntaModalInstance, formatoMoneda, loadExternalLib, localProductsMap, openWhatsApp, reconciliarStockEdicionVenta, repartidoresMap, salesCollection, showToast, subscribeCategories, viewSaleModalInstance } = ctx;

    // ========================================================================
    // --- LÓGICA VENTAS (CRUD v.01 con Stock) ---
    // ========================================================================
    (() => {
         const salesForm = document.getElementById('form-venta'); const ventaClienteInput = document.getElementById('venta-cliente'); const tipoVentaSelect = document.getElementById('tipo-venta-select'); const tipoEntregaSelect = document.getElementById('tipo-entrega-select'); const ventaWhatsappCheckbox = document.getElementById('venta-whatsapp'); const ventaRepartidorSelect = document.getElementById('venta-repartidor'); const costoRutaInput = document.getElementById('costo-ruta'); const rutaPagadaCheckbox = document.getElementById('ruta-pagada-transferencia'); const ventaProductoInput = document.getElementById('venta-producto'); const ventaCarritoTbody = document.getElementById('venta-carrito'); const ventaObservaciones = document.getElementById('venta-observaciones'); const ventaDescuentoInput = document.getElementById('venta-descuento'); const ventaDescuentoTipo = document.getElementById('venta-descuento-tipo'); const pagoEfectivoInput = document.getElementById('pago-efectivo'); const pagoTransferenciaInput = document.getElementById('pago-transferencia'); const ventaTotalSpan = document.getElementById('venta-total'); const salesListTableBody = document.getElementById('lista-ventas-anteriores'); 
         
         window.ventaItems = [];

         if(!salesForm) { console.warn("Elementos de Ventas no encontrados."); return; }

         // Recalcula el precio unitario de cada línea del carrito mayorista según el
         // escalón de cantidad (tabla de precios por volumen), combinando la cantidad
         // total por grupo (y el "surtido" mezclable entre básicos) igual que mayor.js.
         function recalcularPreciosMayoristas() {
            if (!tipoVentaSelect || tipoVentaSelect.value !== 'mayorista') return;

            const totalesPorGrupo = new Map();
            let totalMixto = 0;
            window.ventaItems.forEach(item => {
                const prod = localProductsMap.get(item.productoId);
                const grupo = prod ? resolveWholesaleGroupConRespaldo(prod, window.categoriesMap) : '';
                if (!grupo) return;
                totalesPorGrupo.set(grupo, (totalesPorGrupo.get(grupo) || 0) + item.cantidad);
                if (isSurtidoGroup(grupo)) totalMixto += item.cantidad;
            });

            window.ventaItems.forEach(item => {
                const prod = localProductsMap.get(item.productoId);
                const grupo = prod ? resolveWholesaleGroupConRespaldo(prod, window.categoriesMap) : '';
                if (!grupo) return;
                const totalPropio = totalesPorGrupo.get(grupo) || item.cantidad;
                // Al vender por mayor el precio mínimo siempre es el del primer escalón
                // real (ej. 6X), aunque en esta venta solo vayan 1 o 2 prendas: el
                // cliente ya es mayorista, no se le cobra el precio de vitrina.
                const totalParaEscalon = Math.max(totalPropio, getFirstRealTierMin(grupo) || 0);
                const totalMixtoParaEscalon = Math.max(totalMixto, getFirstRealTierMin(grupo) || 0);
                const info = getHybridTierInfo(grupo, totalParaEscalon, totalMixtoParaEscalon);
                if (info) {
                    item.precio = info.precio;
                    item.total = item.cantidad * item.precio;
                }
            });
         }
         window.recalcularPreciosMayoristas = recalcularPreciosMayoristas;

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
                const prod = localProductsMap.get(productoId);
                window.ventaItems.push({
                    productoId,
                    nombre: nombre,
                    nombreCompleto: nombreCompleto || `${nombre} (${talla}/${color})`,
                    cantidad,
                    precio,
                    total: totalItem,
                    talla,
                    color,
                    imagenUrl: prod?.imagenUrl || ''
                });
            }
            recalcularPreciosMayoristas();
            renderCarrito();
            window.calcularTotalVentaGeneral();
         }

         function quitarItemDelCarrito(index) { window.ventaItems.splice(index, 1); recalcularPreciosMayoristas(); renderCarrito(); window.calcularTotalVentaGeneral(); }
         
         function renderCarrito() {
            if (!ventaCarritoTbody) return;
            ventaCarritoTbody.innerHTML = '';

            const countEl = document.getElementById('venta-items-count');
            if (countEl) countEl.textContent = window.ventaItems.length + (window.ventaItems.length === 1 ? ' item' : ' items');

            if (window.ventaItems.length === 0) {
                ventaCarritoTbody.innerHTML = `
                    <div class="pos-ticket-empty">
                        <i class="bi bi-receipt"></i>
                        <span>Toca un producto o escanea su código para agregarlo.</span>
                    </div>`;
                return;
            }

            window.ventaItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'vf-cart-item';
                const imgHtml = item.imagenUrl
                    ? `<img src="${item.imagenUrl}" alt="${item.nombre}" class="vf-cart-item-img" onerror="this.style.display='none'">`
                    : `<div class="vf-cart-item-img-placeholder"><i class="bi bi-image"></i></div>`;
                card.innerHTML = `
                    ${imgHtml}
                    <div class="vf-cart-item-info">
                        <div class="vf-cart-item-name">${item.nombre || item.nombreCompleto}</div>
                        <div class="vf-cart-item-variant">${item.talla || ''} ${item.talla && item.color ? '/' : ''} ${item.color || ''}</div>
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
         
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('change', (e) => { if (e.target.classList.contains('item-qty-input')) { const index = parseInt(e.target.dataset.index, 10); const newQty = parseInt(e.target.value, 10); if (newQty > 0 && window.ventaItems[index]) { window.ventaItems[index].cantidad = newQty; window.ventaItems[index].total = newQty * window.ventaItems[index].precio; recalcularPreciosMayoristas(); renderCarrito(); window.calcularTotalVentaGeneral(); } } });
         if(ventaCarritoTbody) ventaCarritoTbody.addEventListener('click', (e) => {
             e.preventDefault();
             if (e.target.closest('.btn-quitar-item')) { quitarItemDelCarrito(parseInt(e.target.closest('.btn-quitar-item').dataset.index, 10)); return; }
             if (e.target.closest('.btn-qty-minus')) {
                 const index = parseInt(e.target.closest('.btn-qty-minus').dataset.index, 10);
                 if (window.ventaItems[index] && window.ventaItems[index].cantidad > 1) {
                     window.ventaItems[index].cantidad -= 1;
                     window.ventaItems[index].total = window.ventaItems[index].cantidad * window.ventaItems[index].precio;
                     recalcularPreciosMayoristas();
                     renderCarrito(); window.calcularTotalVentaGeneral();
                 }
                 return;
             }
             if (e.target.closest('.btn-qty-plus')) {
                 const index = parseInt(e.target.closest('.btn-qty-plus').dataset.index, 10);
                 if (window.ventaItems[index]) {
                     window.ventaItems[index].cantidad += 1;
                     window.ventaItems[index].total = window.ventaItems[index].cantidad * window.ventaItems[index].precio;
                     recalcularPreciosMayoristas();
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
         // Nota: el formulario actual es "siempre efectivo" (único radio oculto),
         // por lo que transferenciaFields/mixtoFields ya no existen en el DOM.
         metodoPagoRadios.forEach(radio => {
             radio.addEventListener('change', (e) => {
                 const metodo = e.target.value;
                 if (efectivoFields) efectivoFields.style.display = metodo === 'efectivo' ? 'block' : 'none';
                 if (transferenciaFields) transferenciaFields.style.display = metodo === 'transferencia' ? 'block' : 'none';
                 if (mixtoFields) mixtoFields.style.display = metodo === 'mixto' ? 'block' : 'none';

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
                const venta = docSnap.data();
                // Las ventas de Fábrica (tenantId 'fabrica') se registran en la
                // misma colección 'ventas' que las de Boutique, pero pertenecen
                // a admin-fabrica.html. Se excluyen aquí igual que ya se hace
                // con pedidosWeb, para que no aparezcan mezcladas en este
                // historial ni queden fuera del alcance de los filtros.
                if (venta.tenantId === 'fabrica') return;
                allSalesData.push({ id: docSnap.id, ...venta });
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
                        ${puedeHacer('ventas_eliminar') ? `<button class="btn btn-action btn-action-delete btn-delete-sale" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
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

        // ✅ Calendario con punto en los días que tienen ventas
        const svCal = crearCalendarioVentas(filtroFechaInput);

        if (btnLimpiarFiltro) {
            btnLimpiarFiltro.addEventListener('click', () => {
                if (filtroFechaInput) {
                    // Al limpiar, volver a la fecha de hoy
                    const hoy = new Date();
                    const año = hoy.getFullYear();
                    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
                    const dia = String(hoy.getDate()).padStart(2, '0');
                    filtroFechaInput.value = `${año}-${mes}-${dia}`;
                    svCal.sync();

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
            subscribeCategories((snapshot) => {
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
            const ventaCedulaInput = document.getElementById('venta-cliente-cedula');

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
                clienteCedula: ventaCedulaInput?.value || "",
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
                tenantId: window.expectedTenantId
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

                    registrarAuditoria({
                        accion: 'editar',
                        modulo: 'venta',
                        entidadId: ventaId,
                        entidadNombre: `Venta de ${ventaData.clienteNombre}`,
                        descripcion: `Editó la venta de "${ventaData.clienteNombre}" por ${formatoMoneda.format(ventaData.totalVenta || 0)}`,
                        detalles: { tipoVenta: ventaData.tipoVenta, totalVenta: ventaData.totalVenta }
                    });

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

                    registrarAuditoria({
                        accion: 'crear',
                        modulo: 'venta',
                        entidadId: ventaId,
                        entidadNombre: `Venta de ${ventaData.clienteNombre}`,
                        descripcion: `Generó una venta para "${ventaData.clienteNombre}" por ${formatoMoneda.format(ventaData.totalVenta || 0)}`,
                        detalles: { tipoVenta: ventaData.tipoVenta, totalVenta: ventaData.totalVenta }
                    });
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

                // Solo para ventas nuevas (no ediciones): preguntar si desea facturar ya mismo
                if (!isEditMode && facturaPreguntaModalInstance) {
                    ventaRecienRegistrada = { ventaId, ventaData };
                    facturaPreguntaModalInstance.show();
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

        // ========================================================================
        // --- COTIZACIONES: enviar al cliente lo que debe cancelar y gestionar
        //     su respuesta (aceptar → completar pago / rechazar → descartar) ---
        // ========================================================================
        const btnEnviarCotizacion = document.getElementById('btn-enviar-cotizacion');
        if (btnEnviarCotizacion) {
            btnEnviarCotizacion.addEventListener('click', async () => {
                if (!window.ventaItems || window.ventaItems.length === 0) {
                    showToast("Agrega productos para cotizar.", 'warning');
                    return;
                }
                const celularRaw = document.getElementById('venta-cliente-celular')?.value || '';
                const celular = celularRaw.replace(/\D/g, '');

                const subtotalItems = window.ventaItems.reduce((sum, item) => sum + item.total, 0);
                let descuento = parseFloat(eliminarFormatoNumero(ventaDescuentoInput.value)) || 0;
                if (ventaDescuentoTipo.value === 'porcentaje') descuento = subtotalItems * (descuento / 100);
                const costoRuta = tipoEntregaSelect.value === 'domicilio' ? (parseFloat(eliminarFormatoNumero(costoRutaInput.value)) || 0) : 0;
                const totalCalculado = window.calcularTotalVentaGeneral();

                const cotizacionData = {
                    clienteNombre: ventaClienteInput.value || "Cliente General",
                    clienteCelular: celularRaw,
                    clienteDireccion: document.getElementById('venta-cliente-direccion')?.value || "",
                    clienteCedula: document.getElementById('venta-cliente-cedula')?.value || "",
                    tipoVenta: tipoVentaSelect.value,
                    tipoEntrega: tipoEntregaSelect.value,
                    items: window.ventaItems,
                    observaciones: ventaObservaciones.value.trim(),
                    subtotal: subtotalItems,
                    descuento: descuento,
                    descuentoTipo: ventaDescuentoTipo.value,
                    costoRuta: costoRuta,
                    total: totalCalculado,
                    estado: 'pendiente',
                    timestamp: serverTimestamp(),
                    tenantId: window.expectedTenantId
                };

                try {
                    await addDoc(cotizacionesCollection, cotizacionData);

                    let msg = `*COTIZACIÓN*\n\nHola *${cotizacionData.clienteNombre}*, este es el detalle de tu cotización:\n\n*PRODUCTOS:*\n`;
                    cotizacionData.items.forEach((item, i) => {
                        msg += `\n${i + 1}. *${item.nombre}*`;
                        const meta = [item.talla, item.color].filter(Boolean).join(' · ');
                        if (meta) msg += `\n   ${meta}`;
                        msg += `\n   Cantidad: ${item.cantidad} x ${formatoMoneda.format(item.precio)} = ${formatoMoneda.format(item.total)}`;
                    });
                    msg += `\n\n*RESUMEN:*\nSubtotal: ${formatoMoneda.format(subtotalItems)}\n`;
                    if (descuento > 0) msg += `Descuento: -${formatoMoneda.format(descuento)}\n`;
                    if (costoRuta > 0) msg += `Domicilio: ${formatoMoneda.format(costoRuta)}\n`;
                    msg += `\n*TOTAL A CANCELAR: ${formatoMoneda.format(totalCalculado)}*\n\nPor favor confírmame si deseas continuar con la compra. ¡Gracias!`;

                    if (celular) {
                        let tel = celular;
                        if (tel.startsWith('57')) tel = tel.substring(2);
                        openWhatsApp(`https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`);
                        showToast('Cotización enviada. Queda pendiente hasta que el cliente confirme.', 'success');
                    } else {
                        showToast('Cotización guardada como pendiente. El cliente no tiene celular registrado, compártela manualmente.', 'success');
                    }

                    salesForm.reset();
                    window.ventaItems = [];
                    renderCarrito();
                    ventaClienteInput.value = 'General';
                    window.fillClientInfoSales();
                    tipoVentaSelect.value = 'detal';
                    tipoEntregaSelect.value = 'tienda';
                    toggleDeliveryFields();
                    window.calcularTotalVentaGeneral();
                } catch (err) {
                    console.error('Error al enviar cotización:', err);
                    showToast(`Error al enviar cotización: ${err.message}`, 'error');
                }
            });
        }

        const cqContainer = document.getElementById('cotizaciones-container');
        if (cqContainer) {
            let cqOrders = { pendiente: [], aceptado: [], rechazado: [] };
            let cqCurrentTab = 'pendiente';
            const cqTabButtons = document.querySelectorAll('#cq-tabs .pw-tab');
            const cqLoading = document.getElementById('loading-cotizaciones');

            cqTabButtons.forEach(btn => btn.addEventListener('click', () => {
                cqTabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                cqCurrentTab = btn.dataset.tab;
                renderCqTab();
            }));

            function formatFechaCQ(ts) {
                if (!ts?.toDate) return 'Fecha no disponible';
                return ts.toDate().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
            }

            function createQuoteCard(order, quoteId) {
                const card = document.createElement('div');
                const estado = order.estado || 'pendiente';
                card.className = `pw-order-card pw-status-${estado}`;
                card.dataset.quoteId = quoteId;
                const isPendiente = estado === 'pendiente';

                const itemsHtml = (order.items || []).map(item => `
                    <div class="pw-item-row">
                        <div class="pw-item-img-placeholder"><i class="bi bi-tag"></i></div>
                        <div class="pw-item-info">
                            <div class="pw-item-name">${item.nombre}</div>
                            <div class="pw-item-meta">${[item.talla, item.color].filter(Boolean).join(' · ')} · x${item.cantidad}</div>
                        </div>
                        <div class="pw-item-total">${formatoMoneda.format(item.total)}</div>
                    </div>`).join('');

                const statusLabels = { pendiente: 'Pendiente', aceptado: 'Aceptada', rechazado: 'Rechazada' };
                const statusIcons  = { pendiente: 'bi-clock-fill', aceptado: 'bi-check-circle-fill', rechazado: 'bi-x-circle-fill' };
                const statusBadge  = `<span class="pw-status-badge ${estado}"><i class="bi ${statusIcons[estado]}"></i>${statusLabels[estado]}</span>`;

                const obsHtml = order.observaciones
                    ? `<div class="pw-obs"><i class="bi bi-chat-text me-1"></i>${order.observaciones}</div>` : '';

                const actionsHtml = isPendiente ? `
                    <div class="pw-actions">
                        <button class="pw-btn pw-btn-reject btn-reject-quote" data-quote-id="${quoteId}">
                            <i class="bi bi-x-lg"></i><span class="d-none d-sm-inline ms-1">Rechazar</span>
                        </button>
                        <button class="pw-btn pw-btn-accept btn-accept-quote" data-quote-id="${quoteId}">
                            <i class="bi bi-check-lg"></i><span class="ms-1">Aceptar</span>
                        </button>
                    </div>` : '';

                card.innerHTML = `
                    <div class="pw-card-header">
                        <div>
                            <div class="pw-card-id"><i class="bi bi-file-earmark-text me-1"></i>#${quoteId.substring(0,8).toUpperCase()}</div>
                            <div class="pw-card-date">${formatFechaCQ(order.timestamp)}</div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="pw-card-body">
                        <div class="pw-client-row">
                            <div class="pw-client-name">${order.clienteNombre || '—'}</div>
                            ${order.clienteCelular ? `<div class="pw-client-chip"><i class="bi bi-telephone"></i><a href="https://wa.me/57${order.clienteCelular.replace(/\D/g,'')}" target="_blank">${order.clienteCelular}</a></div>` : ''}
                        </div>
                        ${obsHtml}
                        <div class="pw-items-list">${itemsHtml}</div>
                    </div>
                    <div class="pw-card-footer">
                        <div>
                            <div class="pw-total-label">Total a cancelar</div>
                            <div class="pw-total-val">${formatoMoneda.format(order.total || 0)}</div>
                        </div>
                        ${actionsHtml}
                    </div>`;

                return card;
            }

            function renderCqTab() {
                cqContainer.querySelectorAll('.pw-order-card, .pw-empty').forEach(el => el.remove());
                const orders = cqOrders[cqCurrentTab] || [];
                if (orders.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'pw-empty';
                    const labels = { pendiente: 'No hay cotizaciones pendientes', aceptado: 'No hay cotizaciones aceptadas', rechazado: 'No hay cotizaciones rechazadas' };
                    const icons  = { pendiente: 'bi-clock', aceptado: 'bi-check-circle', rechazado: 'bi-x-circle' };
                    empty.innerHTML = `<i class="bi ${icons[cqCurrentTab]} pw-empty-icon"></i><p class="pw-empty-text">${labels[cqCurrentTab]}</p>`;
                    cqContainer.appendChild(empty);
                    return;
                }
                const frag = document.createDocumentFragment();
                orders.forEach(({ id, order }) => frag.appendChild(createQuoteCard(order, id)));
                cqContainer.appendChild(frag);
            }

            ['pendiente', 'aceptado', 'rechazado'].forEach(estado => {
                // Sin orderBy en la query: combinar where('estado', ...) con
                // orderBy('timestamp', ...) exige un índice compuesto en Firestore que
                // nunca se creó para esta colección (a diferencia de pedidosWeb, que sí
                // lo tiene), así que la consulta fallaba siempre con "failed-precondition"
                // y se veía como "No se pudieron cargar las cotizaciones". Se ordena acá
                // mismo, del lado del cliente, para no depender de ese índice.
                const q = query(cotizacionesCollection, where('estado', '==', estado), limit(50));
                onSnapshot(q, snapshot => {
                    cqOrders[estado] = [];
                    snapshot.forEach(d => cqOrders[estado].push({ id: d.id, order: d.data() }));
                    cqOrders[estado].sort((a, b) => (b.order.timestamp?.toMillis?.() || 0) - (a.order.timestamp?.toMillis?.() || 0));
                    if (cqLoading) cqLoading.style.display = 'none';
                    const badge = document.getElementById(`cq-badge-${estado}`);
                    if (badge) badge.textContent = cqOrders[estado].length;
                    if (estado === 'pendiente') {
                        const tabBadge = document.getElementById('cq-badge-pendiente-tab');
                        if (tabBadge) {
                            tabBadge.textContent = cqOrders.pendiente.length;
                            tabBadge.style.display = cqOrders.pendiente.length > 0 ? 'inline-flex' : 'none';
                        }
                    }
                    if (estado === cqCurrentTab) renderCqTab();
                }, err => {
                    console.error(`Error cotizaciones ${estado}:`, err);
                    if (cqLoading) cqLoading.style.display = 'none';
                    if (estado === cqCurrentTab) {
                        cqContainer.querySelectorAll('.pw-order-card, .pw-empty').forEach(el => el.remove());
                        const errorEl = document.createElement('div');
                        errorEl.className = 'pw-empty';
                        const isPermiso = err?.code === 'permission-denied';
                        errorEl.innerHTML = `<i class="bi bi-exclamation-triangle pw-empty-icon"></i><p class="pw-empty-text">${isPermiso ? 'Sin permisos para ver cotizaciones. Verifica que las Security Rules de Firestore estén publicadas y que tu usuario tenga el permiso de ventas.' : 'No se pudieron cargar las cotizaciones. Intenta de nuevo.'}</p>`;
                        cqContainer.appendChild(errorEl);
                    }
                });
            });

            cqContainer.addEventListener('click', async e => {
                const a = e.target.closest('.btn-accept-quote');
                const r = e.target.closest('.btn-reject-quote');
                if (a) { e.preventDefault(); await handleAcceptQuote(a.dataset.quoteId); }
                else if (r) { e.preventDefault(); await handleRejectQuote(r.dataset.quoteId); }
            });

            async function handleRejectQuote(quoteId) {
                if (!confirm('¿Estás seguro de que quieres rechazar esta cotización?')) return;
                try {
                    await updateDoc(doc(db, 'cotizaciones', quoteId), { estado: 'rechazado', fechaRechazo: serverTimestamp() });
                    showToast('Cotización rechazada correctamente', 'info');
                } catch (err) { console.error('Error al rechazar cotización:', err); showToast('Error al rechazar la cotización', 'error'); }
            }

            async function handleAcceptQuote(quoteId) {
                try {
                    const qRef = doc(db, 'cotizaciones', quoteId);
                    const qSnap = await getDoc(qRef);
                    if (!qSnap.exists()) { showToast('Cotización no encontrada', 'error'); return; }
                    const data = qSnap.data();
                    await updateDoc(qRef, { estado: 'aceptado', fechaAceptacion: serverTimestamp() });

                    window.ventaItems = [];
                    (data.items || []).forEach(item => {
                        const meta = [item.talla, item.color].filter(Boolean).join('/');
                        window.agregarItemAlCarrito(item.productoId, item.nombre, item.cantidad, item.precio, item.talla, item.color, meta ? `${item.nombre} (${meta})` : item.nombre);
                    });
                    if (ventaClienteInput) ventaClienteInput.value = data.clienteNombre || '';
                    const vcel = document.getElementById('venta-cliente-celular'); if (vcel) vcel.value = data.clienteCelular || '';
                    const vdir = document.getElementById('venta-cliente-direccion'); if (vdir) vdir.value = data.clienteDireccion || '';
                    if (ventaObservaciones) {
                        let obs = `Cotización #${quoteId.substring(0,8).toUpperCase()} aceptada por el cliente`;
                        if (data.observaciones) obs += `\n${data.observaciones}`;
                        ventaObservaciones.value = obs;
                    }
                    if (tipoVentaSelect) tipoVentaSelect.value = data.tipoVenta || 'detal';
                    if (tipoEntregaSelect) { tipoEntregaSelect.value = data.tipoEntrega || 'tienda'; toggleDeliveryFields(); }
                    if (data.tipoEntrega === 'domicilio' && costoRutaInput) costoRutaInput.value = data.costoRuta || 0;
                    if (ventaDescuentoInput) ventaDescuentoInput.value = data.descuento || 0;
                    if (ventaDescuentoTipo) ventaDescuentoTipo.value = data.descuentoTipo || 'fijo';
                    window.calcularTotalVentaGeneral();

                    showToast('Cotización aceptada. Completa el pago para registrar la venta.', 'success');
                    const btnForm = document.getElementById('toggle-sales-form-view-btn');
                    if (btnForm) btnForm.click();
                } catch (err) { console.error('Error al aceptar cotización:', err); showToast('Error al procesar la cotización', 'error'); }
            }
        }

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

                registrarAuditoria({
                    accion: 'anular',
                    modulo: 'venta',
                    entidadId: ventaId,
                    entidadNombre: `Venta de ${ventaData.clienteNombre || 'Cliente General'}`,
                    descripcion: `Anuló la venta de "${ventaData.clienteNombre || 'Cliente General'}" por ${formatoMoneda.format(ventaData.totalVenta || 0)}`,
                    detalles: { tipoVenta: ventaData.tipoVenta, totalVenta: ventaData.totalVenta }
                });

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

        // ========================================================================
        // --- GENERAR FACTURA DE VENTA (PDF) ---
        // ========================================================================

        const NEGOCIO_INFO = {
            marca: "MISHELL'ES BOUTIQUE",
            nombreLegal: 'Andrea Mishell Espitia Solano',
            cedula: '1193211056',
            direccion: 'Mz 35 Lote 14',
            telefono: '3046084971'
        };

        function formatearNumeroFactura(numero) {
            return `FAC-${String(numero).padStart(4, '0')}`;
        }

        // Obtiene (o crea) el número consecutivo de factura de una venta.
        // Se guarda en 'facturas/{ventaId}' (idempotente) y el consecutivo
        // en 'contadores/facturas_{tenantId}' vía transacción atómica.
        async function obtenerNumeroFactura(ventaId, ventaData) {
            if (ventaData.numeroFactura) return ventaData.numeroFactura;

            const facturaRef = doc(db, 'facturas', ventaId);
            // Leer una factura que todavía no existe puede devolver
            // permission-denied con las reglas desplegadas (evalúan
            // resource.data, que es null para un documento nuevo). En ese caso
            // se trata como "no existe": crearla abajo sigue siendo seguro
            // porque las reglas solo permiten create (nunca update), así que si
            // ya existiera la transacción falla y el contador no avanza.
            let facturaSnap = null;
            try {
                facturaSnap = await getDoc(facturaRef);
            } catch (error) {
                if (error?.code !== 'permission-denied') throw error;
            }
            if (facturaSnap?.exists()) {
                ventaData.numeroFactura = facturaSnap.data().numero;
                return ventaData.numeroFactura;
            }

            const tenantId = ventaData.tenantId ?? window.expectedTenantId;
            const contadorRef = doc(db, 'contadores', `facturas_${tenantId || 'default'}`);

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

        async function generarFacturaVentaPDF(ventaId, ventaData) {
            await loadExternalLib('jspdf');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            const PW = 210, PH = 297, M = 18;
            // Paleta neutra en escala de grises con un acento rosado discreto
            // para un aspecto elegante y profesional de factura real.
            const INK = [20, 20, 22], TEXT = [55, 54, 57], MUTED = [128, 127, 130],
                  SOFT = [168, 167, 170], LINE = [220, 219, 222], HAIRLINE = [235, 234, 237],
                  ROW_ALT = [247, 247, 248], WHITE = [255, 255, 255];
            const ACCENT = [214, 64, 128], ACCENT_TINT = [253, 234, 244];

            function dibujarBordePagina() {
                pdf.setDrawColor(...LINE);
                pdf.setLineWidth(0.3);
                pdf.rect(8, 8, PW - 16, PH - 16);
            }

            const numeroFactura = await obtenerNumeroFactura(ventaId, ventaData);
            const folioTxt = formatearNumeroFactura(numeroFactura);
            const fecha = ventaData.timestamp?.toDate ? ventaData.timestamp.toDate() : new Date();
            const vendedor = window.appContext?.nombre || null;

            // ── Encabezado ──────────────────────────────────────────────────
            pdf.setFillColor(...ACCENT);
            pdf.rect(0, 0, PW, 3, 'F');
            dibujarBordePagina();

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(19);
            pdf.setTextColor(...INK);
            pdf.text(NEGOCIO_INFO.marca, M, 16);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...TEXT);
            pdf.text(NEGOCIO_INFO.nombreLegal, M, 22.5);
            pdf.setTextColor(...MUTED);
            pdf.text(`C.C./NIT ${NEGOCIO_INFO.cedula}  ·  ${NEGOCIO_INFO.direccion}  ·  WhatsApp ${NEGOCIO_INFO.telefono}`, M, 27);

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

            // ── Datos del cliente / detalles de la venta (dos columnas) ──────
            let repartidorNombre = 'N/A';
            if (ventaData.repartidorId && repartidoresMap.has(ventaData.repartidorId)) {
                repartidorNombre = repartidoresMap.get(ventaData.repartidorId).nombre;
            } else if (ventaData.repartidorNombre) {
                repartidorNombre = ventaData.repartidorNombre;
            }

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
            // Separador vertical sutil entre columnas
            pdf.line(PW / 2, 39, PW / 2, y + 20);

            const clienteInfo = [
                [ventaData.clienteNombre || 'Cliente General', true],
                ventaData.clienteCedula ? [`C.C./NIT: ${ventaData.clienteCedula}`, false] : null,
                ventaData.clienteDireccion ? [ventaData.clienteDireccion, false] : null,
                ventaData.clienteCelular ? [`Tel: ${ventaData.clienteCelular}`, false] : null
            ].filter(Boolean);

            const detalleInfo = [
                [`Tipo de venta:  ${(ventaData.tipoVenta || 'detal').toUpperCase()}`, false],
                [ventaData.tipoEntrega === 'domicilio' ? `Domicilio — ${repartidorNombre}` : 'Recoge en tienda', false],
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

                const nombreCompleto = item.nombreCompleto || item.nombre || '';
                const detalle = [item.talla, item.color].filter(Boolean).join(' / ');
                const nombreLinea = detalle ? `${nombreCompleto} (${detalle})` : nombreCompleto;
                const nombreCorto = nombreLinea.length > 50 ? nombreLinea.slice(0, 48) + '…' : nombreLinea;

                pdf.setFontSize(8.5);
                pdf.setTextColor(...INK);
                pdf.text(nombreCorto, M, y);
                pdf.setTextColor(...TEXT);
                pdf.text(String(item.cantidad ?? ''), colCant, y, { align: 'center' });
                pdf.text(formatoMoneda.format(item.precio || 0), colPrecio, y, { align: 'right' });
                pdf.setTextColor(...INK);
                pdf.text(formatoMoneda.format(item.total || 0), colTotal, y, { align: 'right' });

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
            const descuento = parseFloat(ventaData.descuento) || 0;
            const costoRuta = ventaData.tipoEntrega === 'domicilio' ? (parseFloat(ventaData.costoRuta) || 0) : 0;
            const totalVenta = parseFloat(ventaData.totalVenta) || 0;
            const esApartado = ventaData.tipoVenta === 'apartado';

            let filasTotales = [
                ['Total de prendas', `${totalPrendas} ${totalPrendas === 1 ? 'prenda' : 'prendas'}`, false],
                ['Subtotal', formatoMoneda.format(subtotal), false],
                descuento > 0 ? ['Descuento', `-${formatoMoneda.format(descuento)}`, false] : null,
                costoRuta > 0 ? ['Costo de envío', formatoMoneda.format(costoRuta), false] : null
            ].filter(Boolean);

            if (esApartado) {
                const totalProducto = parseFloat(ventaData.montoTotalProducto) || totalVenta;
                filasTotales.push(['Total del producto', formatoMoneda.format(totalProducto), false]);
                filasTotales.push(['Abonado', formatoMoneda.format(totalVenta), false]);
                filasTotales.push(['SALDO PENDIENTE', formatoMoneda.format(totalProducto - totalVenta), true]);
            } else {
                filasTotales.push(['TOTAL A PAGAR', formatoMoneda.format(totalVenta), true]);
            }

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
            pdf.text(
                `Efectivo: ${formatoMoneda.format(ventaData.pagoEfectivo || 0)}   ·   Transferencia: ${formatoMoneda.format(ventaData.pagoTransferencia || 0)}`,
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
                `${NEGOCIO_INFO.marca}  ·  WhatsApp ${NEGOCIO_INFO.telefono}  ·  ${NEGOCIO_INFO.direccion}`,
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
        let facturaGenerada = null; // { folioTxt, blob, blobUrl, fileName, ventaData }

        function formatearNumeroWhatsapp(celular) {
            const digitos = (celular || '').replace(/\D/g, '');
            if (!digitos) return '';
            return digitos.length <= 10 ? `57${digitos}` : digitos;
        }

        function imprimirFacturaPDF(blobUrl) {
            let iframe = document.getElementById('factura-print-iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'factura-print-iframe';
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

        async function compartirFacturaWhatsApp({ blob, fileName, folioTxt, ventaData }) {
            const nombreCliente = ventaData.clienteNombre || 'Cliente';
            const mensaje = `Hola ${nombreCliente}, aquí tienes tu factura ${folioTxt} de ${NEGOCIO_INFO.marca}. ¡Gracias por tu compra!`;
            const file = new File([blob], fileName, { type: 'application/pdf' });
            const puedeCompartirArchivo = navigator.canShare && navigator.canShare({ files: [file] });

            if (puedeCompartirArchivo) {
                try {
                    await navigator.share({ files: [file], title: `Factura ${folioTxt}`, text: mensaje });
                } catch (e) {
                    if (e.name === 'AbortError') return; // el usuario canceló el share
                    console.warn('No se pudo compartir el PDF directamente:', e);
                    // No se sabe con certeza si WhatsApp ya recibió el archivo antes del error
                    // (pasa en algunos Android/Chrome), así que NO se abre un segundo chat
                    // automático: eso causaba que el cliente recibiera la factura dos veces.
                    showToast('No se pudo confirmar el envío. Revisa WhatsApp antes de reintentar para no enviar la factura dos veces.', 'warning');
                }
                return;
            }

            // Respaldo (navegadores sin Web Share API con archivos): descarga el PDF
            // y abre WhatsApp con el número del cliente para adjuntarlo manualmente.
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            const numero = formatearNumeroWhatsapp(ventaData.clienteCelular);
            const texto = encodeURIComponent(`${mensaje}\n(Adjunta el PDF "${fileName}" que se acaba de descargar)`);
            const waUrl = `https://wa.me/${numero}?text=${texto}`;
            window.open(waUrl, '_blank');
            showToast('Se descargó el PDF. Adjúntalo manualmente en el chat de WhatsApp que se abrió.', 'info');
        }

        // mailto no admite adjuntos: se descarga el PDF y se abre el correo
        // con destinatario/asunto/cuerpo listos para que se adjunte a mano.
        function enviarFacturaCorreo(email, { blob, fileName, folioTxt, ventaData }) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            const asunto = encodeURIComponent(`Factura ${folioTxt} - ${NEGOCIO_INFO.marca}`);
            const cuerpo = encodeURIComponent(
                `Hola ${ventaData.clienteNombre || ''},\n\nAdjunto encontrarás tu factura ${folioTxt} de ${NEGOCIO_INFO.marca}.\n\n¡Gracias por tu compra!\n\n${NEGOCIO_INFO.marca}\nWhatsApp ${NEGOCIO_INFO.telefono}`
            );
            const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${asunto}&body=${cuerpo}`;

            const mailLink = document.createElement('a');
            mailLink.href = mailtoUrl;
            document.body.appendChild(mailLink);
            mailLink.click();
            mailLink.remove();

            showToast('Se descargó el PDF y se abrió tu correo. Adjunta el archivo antes de enviarlo.', 'info');
        }

        const btnFacturaImprimir = document.getElementById('btn-factura-imprimir');
        if (btnFacturaImprimir) {
            btnFacturaImprimir.addEventListener('click', () => {
                if (facturaGenerada) imprimirFacturaPDF(facturaGenerada.blobUrl);
            });
        }

        const btnFacturaWhatsapp = document.getElementById('btn-factura-whatsapp');
        if (btnFacturaWhatsapp) {
            btnFacturaWhatsapp.addEventListener('click', async () => {
                // Bloquea el botón mientras se comparte: en celulares donde el share
                // sheet tarda en aparecer, un doble toque volvía a llamar a esta función
                // y la factura se enviaba dos veces.
                if (!facturaGenerada || btnFacturaWhatsapp.disabled) return;
                btnFacturaWhatsapp.disabled = true;
                try {
                    await compartirFacturaWhatsApp(facturaGenerada);
                } finally {
                    btnFacturaWhatsapp.disabled = false;
                }
            });
        }

        // --- Enviar por Correo: pide el email antes de enviar ---
        const btnFacturaCorreo = document.getElementById('btn-factura-correo');
        const facturaEmailForm = document.getElementById('factura-email-form');
        const facturaEmailInput = document.getElementById('factura-email-input');
        if (btnFacturaCorreo && facturaEmailForm) {
            btnFacturaCorreo.addEventListener('click', () => {
                const visible = facturaEmailForm.style.display !== 'none';
                facturaEmailForm.style.display = visible ? 'none' : 'block';
                if (!visible) facturaEmailInput?.focus();
            });
        }
        if (facturaEmailForm) {
            facturaEmailForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!facturaGenerada) return;
                const email = (facturaEmailInput?.value || '').trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    showToast('Ingresa un correo válido', 'warning');
                    return;
                }
                enviarFacturaCorreo(email, facturaGenerada);
                facturaEmailForm.style.display = 'none';
                facturaEmailForm.reset();
            });
        }

        const btnFacturaDescargar = document.getElementById('btn-factura-descargar');
        if (btnFacturaDescargar) {
            btnFacturaDescargar.addEventListener('click', () => {
                if (!facturaGenerada) return;
                const a = document.createElement('a');
                a.href = facturaGenerada.blobUrl;
                a.download = facturaGenerada.fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
            });
        }

        // Genera el PDF y abre el modal de acciones (imprimir/whatsapp/correo/descargar).
        // Reutilizada tanto por el botón del detalle de venta como por la
        // pregunta que aparece justo al registrar una venta nueva.
        async function generarYMostrarFactura(ventaId, ventaData, modalAOcultar) {
            try {
                const resultado = await generarFacturaVentaPDF(ventaId, ventaData);

                if (facturaGenerada?.blobUrl) URL.revokeObjectURL(facturaGenerada.blobUrl);
                facturaGenerada = { ...resultado, ventaData };

                const folioEl = document.getElementById('factura-modal-folio');
                if (folioEl) folioEl.textContent = resultado.folioTxt;

                // Ocultar el modal anterior y mostrar el de acciones en el mismo tick
                // deja a Bootstrap con dos backdrops en transición a la vez: a veces
                // el que se está cerrando termina borrando también el del modal nuevo,
                // y ese backdrop huérfano se queda sobre toda la página bloqueando
                // cualquier clic (sin overlay visible ni error) hasta recargar. Se
                // espera a que termine de ocultarse el anterior antes de abrir el
                // siguiente para que Bootstrap limpie su backdrop correctamente.
                if (modalAOcultar) {
                    const elAOcultar = modalAOcultar._element;
                    if (elAOcultar) elAOcultar.addEventListener('hidden.bs.modal', () => facturaAccionesModalInstance?.show(), { once: true });
                    modalAOcultar.hide();
                } else {
                    facturaAccionesModalInstance?.show();
                }
                return resultado;
            } catch (error) {
                console.error('Error al generar factura:', error);
                showToast(`Error al generar la factura: ${error?.message || error}`, 'error');
                return null;
            }
        }

        // --- Botón Generar Factura ---
        const btnGenerateInvoice = document.getElementById('btn-generate-invoice');
        if (btnGenerateInvoice) {
            btnGenerateInvoice.addEventListener('click', async () => {
                if (!currentVentaId || !currentVentaData) {
                    showToast('Error: No hay venta seleccionada', 'error');
                    return;
                }

                const originalHtml = btnGenerateInvoice.innerHTML;
                btnGenerateInvoice.disabled = true;
                btnGenerateInvoice.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando...';

                await generarYMostrarFactura(currentVentaId, currentVentaData, viewSaleModalInstance);

                btnGenerateInvoice.disabled = false;
                btnGenerateInvoice.innerHTML = originalHtml;
            });
        }

        // --- Pregunta al registrar una venta nueva: ¿generar factura ahora? ---
        let ventaRecienRegistrada = null; // { ventaId, ventaData }

        // Expuesto para otros módulos (p.ej. abonos de apartados, en su propio
        // listener fuera de este IIFE) que registran una venta nueva y también
        // quieren ofrecer facturarla justo después, con el mismo modal.
        window.ofrecerFacturaTrasVenta = function(ventaId, ventaData) {
            ventaRecienRegistrada = { ventaId, ventaData };
            facturaPreguntaModalInstance?.show();
        };

        const btnFacturaPreguntaSi = document.getElementById('btn-factura-pregunta-si');
        if (btnFacturaPreguntaSi) {
            btnFacturaPreguntaSi.addEventListener('click', async () => {
                if (!ventaRecienRegistrada) return;
                const originalHtml = btnFacturaPreguntaSi.innerHTML;
                btnFacturaPreguntaSi.disabled = true;
                btnFacturaPreguntaSi.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando...';

                await generarYMostrarFactura(ventaRecienRegistrada.ventaId, ventaRecienRegistrada.ventaData, facturaPreguntaModalInstance);

                btnFacturaPreguntaSi.disabled = false;
                btnFacturaPreguntaSi.innerHTML = originalHtml;
                ventaRecienRegistrada = null;
            });
        }

        // --- Botón Eliminar Venta ---
        const btnDeleteSale = document.getElementById('btn-delete-sale');
        if (btnDeleteSale) {
            btnDeleteSale.addEventListener('click', () => {
                if (!currentVentaId) {
                    showToast('Error: No hay venta seleccionada', 'error');
                    return;
                }

                // Cerrar modal de detalles y abrir modal de contraseña. Se espera a
                // que termine de ocultarse el primero (hidden.bs.modal) antes de
                // abrir el segundo: mostrar ambos a la vez dejaba a Bootstrap con
                // dos backdrops en transición, y el que se cerraba a veces borraba
                // también el del modal nuevo — ese backdrop huérfano se quedaba
                // sobre toda la página bloqueando cualquier clic hasta recargar
                // (mismo bug ya resuelto en generarYMostrarFactura).
                const viewSaleModalEl = document.getElementById('viewSaleModal');
                const deletePasswordModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmPassword'));
                if (viewSaleModalEl) {
                    viewSaleModalEl.addEventListener('hidden.bs.modal', () => deletePasswordModal.show(), { once: true });
                }
                viewSaleModalInstance.hide();
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

                    registrarAuditoria({
                        accion: 'eliminar',
                        modulo: 'venta',
                        entidadId: currentVentaId,
                        entidadNombre: `Venta de ${currentVentaData?.clienteNombre || 'Cliente General'}`,
                        descripcion: `Eliminó la venta de "${currentVentaData?.clienteNombre || 'Cliente General'}" por ${formatoMoneda.format(currentVentaData?.totalVenta || 0)}`,
                        detalles: { tipoVenta: currentVentaData?.tipoVenta, totalVenta: currentVentaData?.totalVenta }
                    });

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

        // Estado local de los productos de la venta que se está editando
        let editSaleItemsState = [];
        let editSaleVentaData = null;

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

                // Guardar datos de la venta (descuento/costoRuta) para recalcular el total
                editSaleVentaData = ventaData;

                // Clonar los items en un estado editable independiente
                editSaleItemsState = (ventaData.items || []).map(item => ({
                    productoId: item.productoId || '',
                    nombre: item.nombre || '',
                    talla: item.talla || '',
                    color: item.color || '',
                    precio: parseFloat(item.precio ?? item.precioUnitario) || 0,
                    cantidad: parseInt(item.cantidad, 10) || 1
                }));

                // Mostrar productos
                renderEditSaleProductos();

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

        // Escapar texto para insertarlo en HTML de forma segura
        function escaparHtmlEditSale(texto) {
            const div = document.createElement('div');
            div.textContent = texto ?? '';
            return div.innerHTML;
        }

        // Precio unitario de un producto según el tipo de venta actual
        function obtenerPrecioUnitarioEditSale(producto, tipoVenta) {
            if (!producto) return 0;
            if (tipoVenta === 'mayorista') return parseFloat(producto.precioMayor || producto.precioDetal) || 0;
            return parseFloat(producto.precioDetal) || 0;
        }

        // Igual que recalcularPreciosMayoristas() pero sobre editSaleItemsState: recalcula
        // el precio unitario de cada línea según el escalón de cantidad total por grupo
        // (con el "surtido" mezclable entre básicos), para que editar una venta mayorista
        // no se quede pegada al precio del primer escalón (6X) al subir la cantidad.
        function recalcularPreciosMayoristasEditSale() {
            const tipoVenta = document.getElementById('edit-sale-tipo')?.value;
            if (tipoVenta !== 'mayorista') return;

            const totalesPorGrupo = new Map();
            let totalMixto = 0;
            editSaleItemsState.forEach(item => {
                const prod = item.productoId ? localProductsMap.get(item.productoId) : null;
                const grupo = prod ? resolveWholesaleGroupConRespaldo(prod, window.categoriesMap) : '';
                if (!grupo) return;
                const cantidad = parseInt(item.cantidad, 10) || 1;
                totalesPorGrupo.set(grupo, (totalesPorGrupo.get(grupo) || 0) + cantidad);
                if (isSurtidoGroup(grupo)) totalMixto += cantidad;
            });

            editSaleItemsState.forEach(item => {
                const prod = item.productoId ? localProductsMap.get(item.productoId) : null;
                const grupo = prod ? resolveWholesaleGroupConRespaldo(prod, window.categoriesMap) : '';
                if (!grupo) return;
                const cantidad = parseInt(item.cantidad, 10) || 1;
                const totalPropio = totalesPorGrupo.get(grupo) || cantidad;
                // Igual que en recalcularPreciosMayoristas(): al vender por mayor el
                // mínimo siempre es el precio del primer escalón real (ej. 6X).
                const totalParaEscalon = Math.max(totalPropio, getFirstRealTierMin(grupo) || 0);
                const totalMixtoParaEscalon = Math.max(totalMixto, getFirstRealTierMin(grupo) || 0);
                const info = getHybridTierInfo(grupo, totalParaEscalon, totalMixtoParaEscalon);
                if (info) item.precio = info.precio;
            });
        }

        // Tallas únicas disponibles para un producto
        function obtenerTallasEditSale(producto) {
            if (!producto || !Array.isArray(producto.variaciones)) return [];
            const tallas = [];
            producto.variaciones.forEach(v => { if (v.talla && !tallas.includes(v.talla)) tallas.push(v.talla); });
            return tallas;
        }

        // Colores únicos disponibles para un producto (opcionalmente filtrados por talla)
        function obtenerColoresEditSale(producto, talla) {
            if (!producto || !Array.isArray(producto.variaciones)) return [];
            const colores = [];
            producto.variaciones.forEach(v => {
                if (!v.color) return;
                if (talla && v.talla !== talla) return;
                if (!colores.includes(v.color)) colores.push(v.color);
            });
            return colores;
        }

        // Stock disponible de una variación puntual, sumando lo que esta misma venta ya tenía
        // reservado antes de editar (esa cantidad sigue siendo "suya" hasta que se guarde el cambio)
        function obtenerStockDisponibleEditSale(productoId, talla, color) {
            const producto = localProductsMap.get(productoId);
            if (!producto || !Array.isArray(producto.variaciones)) return 0;
            const variacion = producto.variaciones.find(v => (v.talla || '') === (talla || '') && (v.color || '') === (color || ''));
            const stockBase = variacion ? (parseInt(variacion.stock, 10) || 0) : 0;
            const reservadoPorEstaVenta = (editSaleVentaData?.items || [])
                .filter(it => it.productoId === productoId && (it.talla || '') === (talla || '') && (it.color || '') === (color || ''))
                .reduce((sum, it) => sum + (parseInt(it.cantidad, 10) || 0), 0);
            return stockBase + reservadoPorEstaVenta;
        }

        // Stock disponible de una talla (suma de sus colores) para saber si conviene deshabilitarla
        function obtenerStockDisponibleTallaEditSale(productoId, talla) {
            const producto = localProductsMap.get(productoId);
            if (!producto || !Array.isArray(producto.variaciones)) return 0;
            return producto.variaciones
                .filter(v => (v.talla || '') === (talla || ''))
                .reduce((sum, v) => sum + obtenerStockDisponibleEditSale(productoId, v.talla, v.color), 0);
        }

        // Stock disponible total de un producto. Productos sin variaciones no controlan stock.
        function obtenerStockTotalDisponibleEditSale(productoId) {
            const producto = localProductsMap.get(productoId);
            if (!producto || !Array.isArray(producto.variaciones) || !producto.variaciones.length) return Infinity;
            return producto.variaciones.reduce((sum, v) => sum + obtenerStockDisponibleEditSale(productoId, v.talla, v.color), 0);
        }

        // Máximo de unidades que se le puede poner a un item (Infinity si el producto no controla stock)
        function obtenerStockMaximoParaItemEditSale(item) {
            if (!item.productoId) return Infinity;
            const producto = localProductsMap.get(item.productoId);
            if (!producto || !Array.isArray(producto.variaciones) || !producto.variaciones.length) return Infinity;
            return obtenerStockDisponibleEditSale(item.productoId, item.talla, item.color);
        }

        // Ajusta la cantidad de un item para que no supere el stock disponible de su variación
        function clamparCantidadEditSale(item) {
            const maximo = obtenerStockMaximoParaItemEditSale(item);
            const actual = parseInt(item.cantidad, 10) || 1;
            if (Number.isFinite(maximo) && actual > maximo) {
                item.cantidad = maximo > 0 ? maximo : 1;
            }
        }

        // Sincroniza nombre/talla/color/precio de un item con el producto seleccionado,
        // prefiriendo por defecto una variación que sí tenga stock disponible
        function sincronizarItemConProductoEditSale(item) {
            const tipoVenta = document.getElementById('edit-sale-tipo').value;
            if (!item.productoId) return;

            const producto = localProductsMap.get(item.productoId);
            if (!producto) return;

            item.nombre = producto.nombre || item.nombre;

            const tallas = obtenerTallasEditSale(producto);
            if (tallas.length && !tallas.includes(item.talla)) {
                item.talla = tallas.find(t => obtenerStockDisponibleTallaEditSale(item.productoId, t) > 0) || tallas[0];
            }
            if (!tallas.length) item.talla = '';

            const colores = obtenerColoresEditSale(producto, item.talla);
            if (colores.length && !colores.includes(item.color)) {
                item.color = colores.find(c => obtenerStockDisponibleEditSale(item.productoId, item.talla, c) > 0) || colores[0];
            }
            if (!colores.length) item.color = '';

            item.precio = obtenerPrecioUnitarioEditSale(producto, tipoVenta);
        }

        // Construye las <option> del selector de producto: oculta los que no tienen stock
        // disponible (salvo el que ya está seleccionado en esta línea, para no perderlo)
        function construirOpcionesProductoEditSale(selectedId) {
            const productos = Array.from(localProductsMap.entries())
                .filter(([id]) => id === selectedId || obtenerStockTotalDisponibleEditSale(id) > 0)
                .sort((a, b) => (a[1].nombre || '').localeCompare(b[1].nombre || ''));
            let html = `<option value="">Seleccionar producto...</option>`;
            productos.forEach(([id, p]) => {
                html += `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${escaparHtmlEditSale(p.nombre || 'Sin nombre')}</option>`;
            });
            return html;
        }

        // Construye las <option> de un selector simple (talla o color): oculta las opciones sin
        // stock disponible, preservando el valor actual aunque ya no tenga stock o ya no exista
        function construirOpcionesSimpleEditSale(valores, seleccionado, disponibilidadFn, placeholder) {
            const opciones = valores.filter(v => v === seleccionado || !disponibilidadFn || disponibilidadFn(v));
            if (seleccionado && !opciones.includes(seleccionado)) opciones.unshift(seleccionado);
            let html = `<option value="">${placeholder}</option>`;
            opciones.forEach(v => {
                html += `<option value="${escaparHtmlEditSale(v)}" ${v === seleccionado ? 'selected' : ''}>${escaparHtmlEditSale(v)}</option>`;
            });
            return html;
        }

        // Recalcula y muestra el total de la venta a partir del estado local de items
        function actualizarTotalEditSale() {
            const subtotal = editSaleItemsState.reduce((sum, item) => {
                return sum + (parseFloat(item.precio) || 0) * (parseInt(item.cantidad, 10) || 1);
            }, 0);
            const descuento = parseFloat(editSaleVentaData?.descuento) || 0;
            const costoRuta = parseFloat(editSaleVentaData?.costoRuta) || 0;
            const total = subtotal - descuento + costoRuta;
            document.getElementById('edit-sale-total').textContent = formatoMoneda.format(total);
            return total;
        }

        // Mostrar productos en el modal de edición (tarjetas editables: producto, talla, color y cantidad por separado)
        function renderEditSaleProductos() {
            const container = document.getElementById('edit-sale-productos');
            if (!container) return;

            recalcularPreciosMayoristasEditSale();

            if (!editSaleItemsState.length) {
                container.innerHTML = `
                    <div class="esp-empty">
                        <i class="bi bi-bag-x"></i>
                        <span>No hay productos en esta venta</span>
                    </div>`;
                actualizarTotalEditSale();
                return;
            }

            let html = '';
            editSaleItemsState.forEach((item, i) => {
                const producto = item.productoId ? localProductsMap.get(item.productoId) : null;
                const tallas = obtenerTallasEditSale(producto);
                const colores = obtenerColoresEditSale(producto, item.talla);
                const precio = parseFloat(item.precio) || 0;
                const cantidad = parseInt(item.cantidad, 10) || 1;
                const subtotal = precio * cantidad;
                const maximoStock = obtenerStockMaximoParaItemEditSale(item);
                const hayLimiteStock = Number.isFinite(maximoStock);

                html += `
                <div class="esp-card" data-index="${i}">
                    <div class="esp-card-top">
                        <span class="esp-card-icon"><i class="bi bi-bag-fill"></i></span>
                        <select class="esp-select esp-product-select" data-index="${i}" data-field="producto">
                            ${construirOpcionesProductoEditSale(item.productoId)}
                        </select>
                        <button type="button" class="esp-remove-btn" data-index="${i}" title="Quitar producto">
                            <i class="bi bi-trash3"></i>
                        </button>
                    </div>
                    <div class="esp-card-variants">
                        <div class="esp-field">
                            <span class="esp-field-label">Talla</span>
                            <select class="esp-mini-select ${!item.talla && tallas.length ? 'esp-mini-select-empty' : ''}" data-index="${i}" data-field="talla" ${!tallas.length ? 'disabled' : ''}>
                                ${construirOpcionesSimpleEditSale(tallas, item.talla, (t) => obtenerStockDisponibleTallaEditSale(item.productoId, t) > 0, tallas.length ? 'Sin talla' : 'N/A')}
                            </select>
                        </div>
                        <div class="esp-field">
                            <span class="esp-field-label">Color</span>
                            <select class="esp-mini-select ${!item.color && colores.length ? 'esp-mini-select-empty' : ''}" data-index="${i}" data-field="color" ${!colores.length ? 'disabled' : ''}>
                                ${construirOpcionesSimpleEditSale(colores, item.color, (c) => obtenerStockDisponibleEditSale(item.productoId, item.talla, c) > 0, colores.length ? 'Sin color' : 'N/A')}
                            </select>
                        </div>
                        <div class="esp-field esp-field-qty">
                            <span class="esp-field-label">Cantidad</span>
                            <div class="esp-qty-stepper">
                                <button type="button" class="esp-qty-btn" data-index="${i}" data-dir="-1" aria-label="Restar" ${cantidad <= 1 ? 'disabled' : ''}>−</button>
                                <input type="number" class="esp-qty-input" data-index="${i}" min="1" ${hayLimiteStock ? `max="${maximoStock}"` : ''} value="${cantidad}">
                                <button type="button" class="esp-qty-btn" data-index="${i}" data-dir="1" aria-label="Sumar" ${hayLimiteStock && cantidad >= maximoStock ? 'disabled' : ''}>+</button>
                            </div>
                            ${hayLimiteStock ? `<span class="esp-qty-stock">Disponible: ${maximoStock}</span>` : ''}
                        </div>
                    </div>
                    <div class="esp-card-bottom">
                        <span class="esp-unit-price">${cantidad} × ${formatoMoneda.format(precio)}</span>
                        <strong class="esp-subtotal">${formatoMoneda.format(subtotal)}</strong>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
            actualizarTotalEditSale();
        }

        // Delegación de eventos sobre las tarjetas de productos del modal de edición
        const editSaleProductosContainer = document.getElementById('edit-sale-productos');
        if (editSaleProductosContainer) {
            editSaleProductosContainer.addEventListener('change', (e) => {
                const target = e.target;
                const index = parseInt(target.dataset.index, 10);
                if (isNaN(index) || !editSaleItemsState[index]) return;
                const item = editSaleItemsState[index];

                if (target.classList.contains('esp-product-select')) {
                    item.productoId = target.value;
                    item.talla = '';
                    item.color = '';
                    sincronizarItemConProductoEditSale(item);
                    clamparCantidadEditSale(item);
                    renderEditSaleProductos();
                } else if (target.dataset.field === 'talla') {
                    item.talla = target.value;
                    const producto = item.productoId ? localProductsMap.get(item.productoId) : null;
                    const colores = obtenerColoresEditSale(producto, item.talla);
                    if (colores.length && !colores.includes(item.color)) {
                        item.color = colores.find(c => obtenerStockDisponibleEditSale(item.productoId, item.talla, c) > 0) || colores[0];
                    }
                    clamparCantidadEditSale(item);
                    renderEditSaleProductos();
                } else if (target.dataset.field === 'color') {
                    item.color = target.value;
                    clamparCantidadEditSale(item);
                    renderEditSaleProductos();
                } else if (target.classList.contains('esp-qty-input')) {
                    const nuevaCantidad = parseInt(target.value, 10);
                    item.cantidad = nuevaCantidad > 0 ? nuevaCantidad : 1;
                    const maximo = obtenerStockMaximoParaItemEditSale(item);
                    if (Number.isFinite(maximo) && item.cantidad > maximo) {
                        item.cantidad = maximo > 0 ? maximo : 1;
                        showToast(`Solo hay ${maximo} unidades disponibles de esta variante`, 'warning');
                    }
                    renderEditSaleProductos();
                }
            });

            editSaleProductosContainer.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.esp-remove-btn');
                if (removeBtn) {
                    const index = parseInt(removeBtn.dataset.index, 10);
                    editSaleItemsState.splice(index, 1);
                    renderEditSaleProductos();
                    return;
                }
                const qtyBtn = e.target.closest('.esp-qty-btn');
                if (qtyBtn) {
                    const index = parseInt(qtyBtn.dataset.index, 10);
                    const item = editSaleItemsState[index];
                    if (!item) return;
                    const dir = parseInt(qtyBtn.dataset.dir, 10);
                    const actual = parseInt(item.cantidad, 10) || 1;
                    let nueva = actual + dir;
                    if (nueva < 1) nueva = 1;
                    const maximo = obtenerStockMaximoParaItemEditSale(item);
                    if (Number.isFinite(maximo) && nueva > maximo) {
                        nueva = maximo > 0 ? maximo : actual;
                        if (dir > 0) showToast(`Solo hay ${maximo} unidades disponibles de esta variante`, 'warning');
                    }
                    item.cantidad = nueva;
                    renderEditSaleProductos();
                }
            });
        }

        // Botón para agregar un nuevo producto (por si el usuario se equivocó y falta una prenda)
        const btnAddEditSaleItem = document.getElementById('btn-edit-sale-add-item');
        if (btnAddEditSaleItem) {
            btnAddEditSaleItem.addEventListener('click', () => {
                editSaleItemsState.push({ productoId: '', nombre: '', talla: '', color: '', precio: 0, cantidad: 1 });
                renderEditSaleProductos();
            });
        }

        // Listener para cambio de tipo de venta en el modal (recalcula precios con los datos ya cargados localmente)
        document.getElementById('edit-sale-tipo').addEventListener('change', function() {
            editSaleItemsState.forEach(item => sincronizarItemConProductoEditSale(item));
            renderEditSaleProductos();
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

                if (!editSaleItemsState.length) {
                    showToast('La venta debe tener al menos un producto', 'error');
                    return;
                }

                if (editSaleItemsState.some(item => !item.productoId)) {
                    showToast('Selecciona un producto para cada línea antes de guardar', 'error');
                    return;
                }

                const itemSinTallaOColor = editSaleItemsState.find(item => {
                    const producto = localProductsMap.get(item.productoId);
                    if (!producto) return false;
                    const requiereTalla = obtenerTallasEditSale(producto).length > 0 && !item.talla;
                    const requiereColor = obtenerColoresEditSale(producto, item.talla).length > 0 && !item.color;
                    return requiereTalla || requiereColor;
                });
                if (itemSinTallaOColor) {
                    const producto = localProductsMap.get(itemSinTallaOColor.productoId);
                    showToast(`Selecciona talla y color para "${producto?.nombre || 'el producto'}" antes de guardar`, 'error');
                    return;
                }

                const itemExcedeStock = editSaleItemsState.find(item => {
                    const maximo = obtenerStockMaximoParaItemEditSale(item);
                    return Number.isFinite(maximo) && (parseInt(item.cantidad, 10) || 0) > maximo;
                });
                if (itemExcedeStock) {
                    const producto = localProductsMap.get(itemExcedeStock.productoId);
                    showToast(`La cantidad de "${producto?.nombre || 'el producto'}" supera el stock disponible`, 'error');
                    return;
                }

                if (nuevoTipo === 'mayorista') {
                    const productoNoBoutique = editSaleItemsState.find(item => {
                        const producto = localProductsMap.get(item.productoId);
                        return producto && !esProveedorBoutique(producto);
                    });
                    if (productoNoBoutique) {
                        const producto = localProductsMap.get(productoNoBoutique.productoId);
                        showToast(`"${producto?.nombre || 'Producto'}" no es de Mishelles Boutique: no se puede pasar a mayorista`, 'error');
                        return;
                    }
                }

                // Sincronizar precios finales con el tipo de venta seleccionado
                editSaleItemsState.forEach(item => sincronizarItemConProductoEditSale(item));
                recalcularPreciosMayoristasEditSale();

                const itemsActualizados = editSaleItemsState.map(item => ({
                    productoId: item.productoId,
                    nombre: item.nombre,
                    talla: item.talla,
                    color: item.color,
                    precio: parseFloat(item.precio) || 0,
                    cantidad: parseInt(item.cantidad, 10) || 1
                }));

                const nuevoTotal = actualizarTotalEditSale();

                const ventaRef = doc(db, 'ventas', ventaId);

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

                // Ajustar stock: reponer lo que tenía la venta antes y descontar lo que quedó tras la edición
                if (!editSaleVentaData?.esCatalogoExterno) {
                    console.log('📦 [EDICIÓN] Reconciliando stock de productos...');
                    await reconciliarStockEdicionVenta(editSaleVentaData?.items || [], itemsActualizados);
                    console.log('✅ [EDICIÓN] Stock reconciliado');
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

                // Revertir stock de productos (devolver al inventario). Si la venta ya
                // estaba Anulada/Cancelada, el stock ya se repuso al anularla — repetirlo
                // aquí lo duplicaría. Tampoco aplica si era una venta por catálogo externo,
                // que nunca descontó stock al crearse.
                const yaSeRepusoStock = ventaData.estado === 'Anulada' || ventaData.estado === 'Cancelada';
                if (!yaSeRepusoStock && !ventaData.esCatalogoExterno && ventaData.items && Array.isArray(ventaData.items)) {
                    for (const item of ventaData.items) {
                        if (!item.productoId) continue;
                        const prodRef = doc(db, 'productos', item.productoId);
                        const prodSnap = await getDoc(prodRef);

                        if (prodSnap.exists()) {
                            const prodData = prodSnap.data();

                            if (Array.isArray(prodData.variaciones) && prodData.variaciones.length > 0) {
                                // Producto con variaciones
                                const variaciones = prodData.variaciones;
                                const varIndex = variaciones.findIndex(v =>
                                    coincideVariacion(v.talla, item.talla) && coincideVariacion(v.color, item.color)
                                );

                                if (varIndex !== -1) {
                                    variaciones[varIndex].stock = (parseInt(variaciones[varIndex].stock, 10) || 0) + (parseFloat(item.cantidad) || 0);
                                    await updateDoc(prodRef, { variaciones: variaciones });
                                }
                            } else {
                                // Producto simple (sin talla/color)
                                const nuevoStock = (parseInt(prodData.stock, 10) || 0) + (parseFloat(item.cantidad) || 0);
                                await updateDoc(prodRef, { stock: nuevoStock });
                            }
                        }
                    }
                }

                // Eliminar venta
                await deleteDoc(ventaRef);

                showToast('Venta eliminada exitosamente. Stock restaurado.', 'success');

                registrarAuditoria({
                    accion: 'eliminar',
                    modulo: 'venta',
                    entidadId: ventaId,
                    entidadNombre: `Venta de ${ventaData?.clienteNombre || 'Cliente General'}`,
                    descripcion: `Eliminó la venta de "${ventaData?.clienteNombre || 'Cliente General'}" por ${formatoMoneda.format(ventaData?.totalVenta || 0)}`,
                    detalles: { tipoVenta: ventaData?.tipoVenta, totalVenta: ventaData?.totalVenta }
                });

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
}
