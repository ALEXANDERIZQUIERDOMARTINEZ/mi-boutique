// Historial de entregas por repartidor.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { Timestamp, collection, getDocs, orderBy, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ========================================================================
// ✅ SECCIÓN: HISTORIAL DE REPARTIDORES
// ========================================================================
export function init(ctx) {
    const { db, formatoMoneda, salesCollection, showToast, subscribeRepartidores } = ctx;

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
        subscribeRepartidores((snapshot) => {
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

}
