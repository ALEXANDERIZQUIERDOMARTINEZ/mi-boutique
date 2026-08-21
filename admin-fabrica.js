/**
 * MISHELLES FÁBRICA — Gastos/Ingresos e Inventario (hilazas, hilos, telas)
 *
 * Extraído de admin.js como primer paso hacia dos bundles independientes
 * (uno por tenant). Sin cambios de comportamiento: es el mismo código que
 * vivía en las secciones "SECCIÓN: FÁBRICA" y "SECCIÓN: INVENTARIO FÁBRICA",
 * movido a su propio archivo. No importa nada de la parte de Boutique
 * (ventas al detal, pedidos web, clientes, etc.) — solo reutiliza `db` y
 * `showToast` desde admin.js porque ambos archivos siguen cargando en la
 * misma página mientras Boutique y Fábrica comparten un solo admin.html.
 */
import {
    collection, getDocs, query, where, orderBy, doc, getDoc, deleteDoc,
    updateDoc, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db, showToast } from "./admin.js";

const fabricaCollection = collection(db, 'movimientosFabrica');
const inventarioFabricaCollection = collection(db, 'inventarioFabrica');

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
            const tenantId = window.appContext?.tenantId || null;
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
                tenantId: window.appContext?.tenantId || null
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
            const tenantId = window.appContext?.tenantId || null;
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
                tenantId: window.appContext?.tenantId || null
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
