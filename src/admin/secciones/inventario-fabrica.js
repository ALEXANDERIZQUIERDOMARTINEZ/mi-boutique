// Inventario Fábrica — hilazas, hilos y telas.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { addDoc, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ========================================================================
// ✅ SECCIÓN: INVENTARIO FÁBRICA — Hilazas, Hilos y Telas
// ========================================================================
export function init(ctx) {
    const { db, inventarioFabricaCollection, showToast } = ctx;

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
            const tenantId = window.expectedTenantId;
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
                tenantId: window.expectedTenantId
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
    // Antes se consultaba al cargar el panel aunque no se entrara a esta
    // sección; ahora solo si se abre directo en #inventario-fabrica (los
    // listeners de arriba cubren el resto de entradas).
    if ((window.location.hash || '') === '#inventario-fabrica') cargarInventario();

    console.log("✅ Módulo Inventario Fábrica inicializado (Hilazas, Hilos, Telas)");

}
