// Finanzas (versión anterior) — ingresos/gastos manuales y cierre de caja.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que hace falta (ver
// cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers, modales) llega ahora en `ctx`.
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

export function init(ctx) {
    const { alEntrarSeccion, closingsCollection, db, eliminarFormatoNumero, financesCollection, formatoMoneda, openWhatsApp, salesCollection, showToast } = ctx;

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
                const whatsappUrl = `https://wa.me/573046084971?text=${encodeURIComponent(mensaje)}`;
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

         // El historial de cierres traía TODOS los cierres de la historia en
         // cada carga del panel, aunque la tabla #lista-historial-cierres ya no
         // existe en admin.html (renderClosings salía sin pintar nada). Solo se
         // escucha si la tabla está, y limitado a los más recientes: las
         // tarjetas de resumen solo miran hoy, ayer y los últimos 7 días.
         if (closingHistoryTableBody) onSnapshot(query(closingsCollection, orderBy('timestamp', 'desc'), limit(60)), renderClosings, e => { console.error("Error closings:", e); if(closingHistoryTableBody) closingHistoryTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error.</td></tr>';});

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

        // Estos dos listeners (movimientos financieros completos + ventas de
        // hoy) solo alimentan la tabla de movimientos y las tarjetas de
        // totales de ESTA sección — allMovements es una variable local a esta
        // IIFE, nada fuera de Finanzas la lee. Antes arrancaban apenas
        // cargaba admin.html sin importar la pestaña activa; ahora se
        // difieren hasta la primera vez que se entra a Finanzas, igual que
        // ya hace calcularFinanzas() (ver cargarFinanzasSiCorresponde más
        // abajo), y solo se inician una vez.
        let finanzasListenersMovimientosIniciados = false;
        function iniciarListenersMovimientosFinanzas() {
            if (finanzasListenersMovimientosIniciados) return;
            finanzasListenersMovimientosIniciados = true;

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
        }
        alEntrarSeccion('#finanzas', iniciarListenersMovimientosFinanzas);

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
}
