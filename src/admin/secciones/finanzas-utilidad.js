// Finanzas v2 — utilidad real por producto y movimientos de Boutique.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { Timestamp, addDoc, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ========================================================================
// ✅ SECCIÓN: FINANZAS v2 — Utilidad Real por Producto
// Lógica: utilidad = (precio_venta - costo) × cantidad_vendida
// ========================================================================
export function init(ctx) {
    const { boutiqueCollection, crearCalendarioVentas, db, productsCollection, salesCollection, showToast } = ctx;

    // ── DOM refs ──
    const filterBtns     = document.querySelectorAll('.fin2-filter-btn');
    const customRangeBar = document.getElementById('fin2-custom-range');
    const inputDesde     = document.getElementById('fin2-desde');
    const inputHasta     = document.getElementById('fin2-hasta');
    const btnCalc        = document.getElementById('fin2-btn-calc');
    const loadingDiv     = document.getElementById('fin2-loading');
    const resultadosDiv  = document.getElementById('fin2-resultados');

    // Calendarios Desde/Hasta con punto en los días que tienen ventas
    crearCalendarioVentas(inputDesde);
    crearCalendarioVentas(inputHasta);

    // ── DOM refs: gastos e ingresos operativos (movimientosBoutique) ──
    const btnNuevoIngreso  = document.getElementById('bout-btn-nuevo-ingreso');
    const btnNuevoGasto    = document.getElementById('bout-btn-nuevo-gasto');
    const movForm          = document.getElementById('boutiqueMovForm');
    const movModalTitle    = document.getElementById('boutiqueMovModalTitle');
    const movIdInput       = document.getElementById('boutiqueMov-id');
    const movTipoInput     = document.getElementById('boutiqueMov-tipo');
    const movConceptoInput = document.getElementById('boutiqueMov-concepto');
    const movMontoInput    = document.getElementById('boutiqueMov-monto');
    const movFechaInput    = document.getElementById('boutiqueMov-fecha');
    const movTbody         = document.getElementById('bout-tabla-body');
    const btnConfirmDelete = document.getElementById('boutique-confirm-delete-btn');

    if (!filterBtns.length) return;

    // ── Instancia del gráfico ──
    let chartInstance = null;

    // ── Último rango calculado, para refrescar tras crear/editar/eliminar un movimiento ──
    let ultimoRango = { desde: null, hasta: null, label: 'Hoy' };
    let idPendienteEliminar = null;

    // ── Formateador ──
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    // ── Fecha efectiva de un movimiento manual (fecha elegida, o timestamp de creación) ──
    function fechaDeMovimiento(m) {
        return m.fecha?.toDate ? m.fecha.toDate() : (m.timestamp?.toDate ? m.timestamp.toDate() : new Date(0));
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
        ultimoRango = { desde, hasta, label };

        if (loadingDiv)    loadingDiv.style.display  = 'flex';
        if (resultadosDiv) resultadosDiv.style.display = 'none';

        document.getElementById('fin2-period-badge').textContent = label;

        try {
            // Cargar ventas, productos y movimientos manuales (ingresos/gastos
            // operativos de Boutique) en paralelo
            const tenantId = window.expectedTenantId;
            const movClauses = [orderBy('timestamp', 'desc')];
            if (tenantId) movClauses.unshift(where('tenantId', '==', tenantId));

            const [snapshot, prodsSnapshot, movSnapshot] = await Promise.all([
                getDocs(query(
                    salesCollection,
                    where('timestamp', '>=', Timestamp.fromDate(desde)),
                    where('timestamp', '<=', Timestamp.fromDate(hasta)),
                    orderBy('timestamp', 'desc')
                )),
                getDocs(productsCollection),
                getDocs(query(boutiqueCollection, ...movClauses))
            ]);

            const movimientos = movSnapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => {
                    const fecha = fechaDeMovimiento(m);
                    return fecha >= desde && fecha <= hasta;
                })
                .sort((a, b) => fechaDeMovimiento(b) - fechaDeMovimiento(a));

            const ingresosManuales = movimientos
                .filter(m => m.tipo === 'ingreso')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
            const gastosManuales = movimientos
                .filter(m => m.tipo === 'gasto')
                .reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);

            // Mapa productoId → costoCompra (el costo real del producto)
            const productCostMap = new Map();
            prodsSnapshot.forEach(d => {
                const data = d.data();
                productCostMap.set(d.id, parseFloat(data.costoCompra) || 0);
            });

            // Mishelles Boutique solo se queda con la ganancia de ventas al detal:
            // lo mayorista (100% de la venta) es dinero de Mishelles Fábrica, no se
            // mezcla aquí ni en la tabla ni en la gráfica de Boutique.
            const ventas = [];
            let totalVentasMayoristasRango = 0;
            snapshot.forEach(docSnap => {
                const venta = docSnap.data();
                if (venta.estado === 'Anulada' || venta.estado === 'Cancelada') return;
                if (venta.tipoVenta === 'mayorista') {
                    totalVentasMayoristasRango += parseFloat(venta.totalVenta) || 0;
                    return;
                }
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

            // ── Utilidad neta: ganancia de ventas al detal + otros ingresos − gastos operativos ──
            const utilidadNeta = utilidadTotal + ingresosManuales - gastosManuales;

            // ── KPI principal ──
            const elUtilidad = document.getElementById('fin2-utilidad-total');
            elUtilidad.textContent = fmt.format(utilidadNeta);
            elUtilidad.className   = 'fin2-hero-value ' + (utilidadNeta >= 0 ? 'fin2-positive' : 'fin2-negative');

            // ── Tendencia (simplificada: positivo / negativo) ──
            const trendBadge = document.getElementById('fin2-trend-badge');
            if (utilidadNeta > 0) {
                trendBadge.innerHTML = '<i class="bi bi-arrow-up-right"></i> Ganancia positiva';
                trendBadge.className = 'fin2-hero-trend fin2-trend-up';
            } else if (utilidadNeta < 0) {
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

            // ── Ganancia detal (= utilidad total de Boutique) y venta mayorista del
            // periodo, que es 100% de Mishelles Fábrica y solo se muestra informativa ──
            document.getElementById('fin2-utilidad-detal').textContent     = fmt.format(utilidadTotal);
            document.getElementById('fin2-utilidad-mayorista').textContent = fmt.format(totalVentasMayoristasRango);

            // ── Otros ingresos y gastos operativos registrados manualmente ──
            document.getElementById('fin2-otros-ingresos').textContent    = fmt.format(ingresosManuales);
            document.getElementById('fin2-gastos-operativos').textContent = fmt.format(gastosManuales);

            // ── Tabla de movimientos manuales ──
            const movCount = document.getElementById('bout-movs-count');
            if (movCount) movCount.textContent = `${movimientos.length} movimiento${movimientos.length !== 1 ? 's' : ''}`;

            if (movTbody) {
                if (movimientos.length === 0) {
                    movTbody.innerHTML = `<tr>
                        <td colspan="5" class="fin2-empty-state">
                            <i class="bi bi-inbox"></i>
                            <span>Aún no hay movimientos registrados</span>
                        </td>
                    </tr>`;
                } else {
                    movTbody.innerHTML = movimientos.map(m => {
                        const fechaMov = fechaDeMovimiento(m);
                        const esIngreso = m.tipo === 'ingreso';
                        const badgeCls  = esIngreso ? 'bg-success' : 'bg-danger';
                        const badgeTxt  = esIngreso ? 'Ingreso' : 'Gasto';
                        const colorCls  = esIngreso ? 'fin2-positive-text' : 'fin2-negative-text';
                        const signo     = esIngreso ? '+' : '−';
                        return `<tr>
                            <td>${fechaMov.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
                            <td>${m.concepto || ''}</td>
                            <td class="text-end ${colorCls} fw-semibold">${signo}${fmt.format(parseFloat(m.monto) || 0)}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-secondary bout-btn-editar" data-id="${m.id}"><i class="bi bi-pencil"></i></button>
                                <button class="btn btn-sm btn-outline-danger bout-btn-eliminar" data-id="${m.id}"><i class="bi bi-trash"></i></button>
                            </td>
                        </tr>`;
                    }).join('');
                }
            }

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
    // Cubre tanto el clic en el link del rail como llegar directo a #finanzas
    // (recarga de página, botón atrás/adelante, o redirección automática de
    // aplicarPermisosNav cuando la sección activa no estaba permitida), casos
    // en los que nunca se dispara un evento "click" sobre el link del rail.
    let finanzasYaCargada = false;
    function cargarFinanzasSiCorresponde() {
        if ((window.location.hash || '') !== '#finanzas') return;
        finanzasYaCargada = true;
        const { desde, hasta, label } = getDateRange('hoy');
        calcularFinanzas(desde, hasta, label);
    }

    const tabLink = document.querySelector('a[href="#finanzas"]');
    if (tabLink) {
        tabLink.addEventListener('click', () => {
            const { desde, hasta, label } = getDateRange('hoy');
            calcularFinanzas(desde, hasta, label);
        });
    }
    window.addEventListener('hashchange', cargarFinanzasSiCorresponde);
    // history.replaceState (usada al navegar por el rail o la barra inferior
    // móvil) no dispara 'hashchange', así que ese es solo un respaldo para
    // navegación real del navegador (atrás/adelante). El evento de abajo es
    // el que realmente cubre la navegación dentro de la app.
    window.addEventListener('admin:section-shown', cargarFinanzasSiCorresponde);
    if (!finanzasYaCargada) cargarFinanzasSiCorresponde();

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

    // ── Abrir modal: Nuevo Ingreso / Nuevo Gasto (operativos de Boutique) ──
    function abrirModalNuevoMov(tipo) {
        if (!movForm) return;
        movForm.reset();
        movIdInput.value = '';
        movTipoInput.value = tipo;
        movModalTitle.textContent = tipo === 'ingreso' ? 'Nuevo Ingreso' : 'Nuevo Gasto';
        movFechaInput.value = new Date().toISOString().slice(0, 10);
        getModal('boutiqueMovModal').show();
    }

    if (btnNuevoIngreso) btnNuevoIngreso.addEventListener('click', () => abrirModalNuevoMov('ingreso'));
    if (btnNuevoGasto)   btnNuevoGasto.addEventListener('click', () => abrirModalNuevoMov('gasto'));

    // ── Editar / eliminar movimiento ──
    if (movTbody) {
        movTbody.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.bout-btn-editar');
            const btnEliminar = e.target.closest('.bout-btn-eliminar');

            if (btnEditar) {
                const id = btnEditar.dataset.id;
                try {
                    const docSnap = await getDoc(doc(db, 'movimientosBoutique', id));
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
                    getModal('boutiqueMovModal').show();
                } catch (error) {
                    console.error('Error al cargar movimiento:', error);
                    showToast('Error al cargar el movimiento', 'error');
                }
            }

            if (btnEliminar) {
                idPendienteEliminar = btnEliminar.dataset.id;
                getModal('boutiqueDeleteModal').show();
            }
        });
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'movimientosBoutique', idPendienteEliminar));
                showToast('Movimiento eliminado', 'success');
                getModal('boutiqueDeleteModal').hide();
                idPendienteEliminar = null;
                calcularFinanzas(ultimoRango.desde, ultimoRango.hasta, ultimoRango.label);
            } catch (error) {
                console.error('Error al eliminar movimiento:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    // ── Guardar (crear/editar) ──
    if (movForm) {
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

            const btnGuardar = document.getElementById('boutiqueMov-btn-guardar');
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
                    await updateDoc(doc(db, 'movimientosBoutique', id), datos);
                    showToast('Movimiento actualizado', 'success');
                } else {
                    await addDoc(boutiqueCollection, { ...datos, timestamp: serverTimestamp() });
                    showToast(tipo === 'ingreso' ? 'Ingreso guardado' : 'Gasto guardado', 'success');
                }

                getModal('boutiqueMovModal').hide();
                movForm.reset();
                calcularFinanzas(ultimoRango.desde, ultimoRango.hasta, ultimoRango.label);
            } catch (error) {
                console.error('Error al guardar movimiento de Boutique:', error);
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                btnGuardar.disabled = false;
            }
        });
    }

    console.log("✅ Módulo Finanzas v2 inicializado (Utilidad Real por Producto + Gastos operativos)");

}
