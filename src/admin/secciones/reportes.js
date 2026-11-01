// Reportes completos (solo si existe #form-reporte).
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { Timestamp, getDocs, orderBy, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ========================================================================
// ✅ SECCIÓN: REPORTES COMPLETOS
// ========================================================================
export function init(ctx) {
    const { apartadosCollection, formatoMoneda, salesCollection, showToast, subscribeRepartidores } = ctx;

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
        subscribeRepartidores((snapshot) => {
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

}
