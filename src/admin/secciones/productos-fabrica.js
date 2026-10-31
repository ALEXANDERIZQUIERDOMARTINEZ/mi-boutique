// Productos Fábrica.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { WHOLESALE_TIER_GROUPS } from "../../../wholesale-tiers.js?v=2";
import { addDoc, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// ========================================================================
// ✅ SECCIÓN: PRODUCTOS FÁBRICA — catálogo propio, independiente de Boutique
// ========================================================================
export function init(ctx) {
    const { categoriesCollection, compressProductImageFile, db, productosFabricaCollection, showToast, storage } = ctx;

    const tbody = document.getElementById('prodfab-tabla-body');
    const form = document.getElementById('prodFabForm');
    if (!tbody || !form) return;

    const searchInput = document.getElementById('prodfab-search');
    const categoriaFilter = document.getElementById('prodfab-filter-categoria');
    const lowStockToggle = document.getElementById('prodfab-filter-bajo-stock');
    const btnNuevo = document.getElementById('prodfab-btn-nuevo');
    const modalTitle = document.getElementById('prodFabModalTitle');
    const idInput = document.getElementById('prodfab-id');
    const codigoInput = document.getElementById('prodfab-codigo');
    const nombreInput = document.getElementById('prodfab-nombre');
    const descripcionInput = document.getElementById('prodfab-descripcion');
    const categoriaSelect = document.getElementById('prodfab-categoria');
    const grupoMayoristaSelect = document.getElementById('prodfab-grupo-mayorista');
    const costoInput = document.getElementById('prodfab-costo');
    const precioMayorInput = document.getElementById('prodfab-precio-mayor');
    const imagenInput = document.getElementById('prodfab-imagen');
    const imagenPreview = document.getElementById('prodfab-imagen-preview');
    const visibleCheckbox = document.getElementById('prodfab-visible');
    const variacionesContainer = document.getElementById('prodfab-variaciones-container');
    const variationTemplate = document.getElementById('variation-template-fabrica');
    const addVariationBtn = document.getElementById('prodfab-add-variation-btn');
    const btnConfirmDelete = document.getElementById('prodfab-confirm-delete-btn');
    const btnGuardar = document.getElementById('prodfab-btn-guardar');

    let productos = [];
    let categoriasMap = new Map();
    let idPendienteEliminar = null;
    let imagenUrlActual = null;

    const UMBRAL_BAJO_STOCK = 2;

    function getModal(id) {
        const el = document.getElementById(id);
        return bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance(el);
    }

    function stockTotal(producto) {
        return (producto.variaciones || []).reduce((s, v) => s + (parseFloat(v.stock) || 0), 0);
    }

    // ── Categorías (compartidas con Boutique: son solo taxonomía, sin datos
    //    de dinero — se leen tal cual, sin duplicar la colección) ──
    async function cargarCategorias() {
        try {
            const snapshot = await getDocs(categoriesCollection);
            categoriasMap = new Map(snapshot.docs.map(d => [d.id, d.data().nombre || 'Sin nombre']));
            const opciones = Array.from(categoriasMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
            categoriaSelect.innerHTML = '<option value="">Selecciona...</option>' +
                opciones.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
            categoriaFilter.innerHTML = '<option value="">Todas las categorías</option>' +
                opciones.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
        } catch (error) {
            console.error('Error al cargar categorías:', error);
        }
    }

    // ── Grupos de mayoreo (tablas de precio por cantidad, ver wholesale-tiers.js) ──
    function cargarGruposMayoristas() {
        const grupos = Object.entries(WHOLESALE_TIER_GROUPS);
        grupoMayoristaSelect.innerHTML = '<option value="">Sin grupo (precio fijo)</option>' +
            grupos.map(([clave, g]) => `<option value="${clave}">${g.label}</option>`).join('');
    }

    function renderTabla() {
        const texto = (searchInput.value || '').trim().toLowerCase();
        const categoriaId = categoriaFilter.value;
        const soloBajoStock = lowStockToggle.checked;

        const filtrados = productos.filter(p => {
            if (texto && !(p.nombre || '').toLowerCase().includes(texto)) return false;
            if (categoriaId && p.categoriaId !== categoriaId) return false;
            if (soloBajoStock && stockTotal(p) > UMBRAL_BAJO_STOCK) return false;
            return true;
        });

        if (!filtrados.length) {
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state">
                    <i class="bi bi-inbox"></i>
                    <span>No hay productos registrados</span>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = filtrados.map(p => {
            const variacionesTxt = (p.variaciones || []).length
                ? p.variaciones.map(v => `${v.talla || '—'} / ${v.color || '—'} (${v.stock ?? 0})`).join(', ')
                : 'Sin variaciones';
            const grupo = p.grupoMayorista ? (WHOLESALE_TIER_GROUPS[p.grupoMayorista]?.label || p.grupoMayorista) : '—';
            const imgSrc = p.imagenUrl || 'https://placehold.co/60x60/f5e8ed/D988B9?text=%20';
            return `<tr>
                <td><img src="${imgSrc}" alt="${p.nombre || ''}" class="table-product-img"></td>
                <td class="product-name">${p.nombre || ''}${p.visible === false ? ' <span class="badge bg-secondary">Oculto</span>' : ''}<small class="text-muted d-block">Código: ${p.codigo || p.id.substring(0, 6)}</small></td>
                <td>${categoriasMap.get(p.categoriaId) || '—'}</td>
                <td>${grupo}</td>
                <td class="text-end">${(p.precioMayor || 0).toLocaleString('es-CO')}</td>
                <td><small>${variacionesTxt}</small></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-secondary prodfab-btn-editar" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger prodfab-btn-eliminar" data-id="${p.id}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    async function cargarProductos() {
        try {
            const tenantId = window.expectedTenantId;
            const clauses = [orderBy('nombre')];
            if (tenantId) clauses.unshift(where('tenantId', '==', tenantId));
            const snapshot = await getDocs(query(productosFabricaCollection, ...clauses));
            productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Expuesto en window para que etiquetas-fabrica.js (script global,
            // no módulo) pueda leer el catálogo ya cargado sin duplicar la
            // consulta — mismo patrón que window.localProductsMap en Boutique.
            window.fabricaProductsMap = new Map(productos.map(p => [p.id, p]));
            window.fabricaCategoriasMap = categoriasMap;
            renderTabla();
        } catch (error) {
            console.error('Error al cargar productos de fábrica:', error);
            tbody.innerHTML = `<tr>
                <td colspan="7" class="fin2-empty-state fin2-negative-text">
                    <i class="bi bi-exclamation-triangle"></i>
                    <span>Error al cargar: ${error.message}</span>
                </td>
            </tr>`;
        }
    }

    // ── Filtros ──
    searchInput.addEventListener('input', renderTabla);
    categoriaFilter.addEventListener('change', renderTabla);
    lowStockToggle.addEventListener('change', renderTabla);

    // ── Variaciones dinámicas (mismo patrón que el catálogo de Boutique) ──
    function agregarFilaVariacion(talla = '', color = '', stock = 1) {
        const fila = variationTemplate.cloneNode(true);
        fila.classList.remove('d-none');
        fila.removeAttribute('id');
        fila.querySelector('[name="prodfab_variation_talla[]"]').value = talla;
        fila.querySelector('[name="prodfab_variation_color[]"]').value = color;
        fila.querySelector('[name="prodfab_variation_stock[]"]').value = stock;
        fila.querySelector('.remove-variation-fabrica-btn').addEventListener('click', () => fila.remove());
        variacionesContainer.appendChild(fila);
    }
    addVariationBtn.addEventListener('click', () => agregarFilaVariacion());

    function leerVariacionesDelForm() {
        const tallas = Array.from(variacionesContainer.querySelectorAll('[name="prodfab_variation_talla[]"]'));
        return tallas.map((input, i) => {
            const fila = input.closest('.variation-row');
            const color = fila.querySelector('[name="prodfab_variation_color[]"]').value.trim();
            const stock = fila.querySelector('[name="prodfab_variation_stock[]"]').value;
            return { talla: input.value.trim(), color, stock: parseFloat(stock) || 0 };
        }).filter(v => v.talla || v.color);
    }

    // ── Abrir modal: nuevo producto ──
    function abrirModalNuevo() {
        form.reset();
        idInput.value = '';
        codigoInput.value = '';
        imagenUrlActual = null;
        imagenPreview.style.display = 'none';
        imagenPreview.src = '';
        visibleCheckbox.checked = true;
        variacionesContainer.innerHTML = '';
        agregarFilaVariacion();
        modalTitle.textContent = 'Nuevo producto';
        getModal('prodFabModal').show();
    }
    btnNuevo.addEventListener('click', abrirModalNuevo);

    // ── Editar / eliminar ──
    tbody.addEventListener('click', (e) => {
        const btnEditar = e.target.closest('.prodfab-btn-editar');
        const btnEliminar = e.target.closest('.prodfab-btn-eliminar');

        if (btnEditar) {
            const p = productos.find(x => x.id === btnEditar.dataset.id);
            if (!p) return;
            form.reset();
            idInput.value = p.id;
            codigoInput.value = p.codigo || '';
            nombreInput.value = p.nombre || '';
            descripcionInput.value = p.descripcion || '';
            categoriaSelect.value = p.categoriaId || '';
            grupoMayoristaSelect.value = p.grupoMayorista || '';
            costoInput.value = p.costoCompra || '';
            precioMayorInput.value = p.precioMayor || '';
            visibleCheckbox.checked = p.visible !== false;
            imagenUrlActual = p.imagenUrl || null;
            if (imagenUrlActual) {
                imagenPreview.src = imagenUrlActual;
                imagenPreview.style.display = 'block';
            } else {
                imagenPreview.style.display = 'none';
            }
            variacionesContainer.innerHTML = '';
            (p.variaciones && p.variaciones.length ? p.variaciones : [{}]).forEach(v =>
                agregarFilaVariacion(v.talla, v.color, v.stock ?? 1));
            modalTitle.textContent = 'Editar producto';
            getModal('prodFabModal').show();
        }

        if (btnEliminar) {
            idPendienteEliminar = btnEliminar.dataset.id;
            getModal('prodFabDeleteModal').show();
        }
    });

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (!idPendienteEliminar) return;
            try {
                await deleteDoc(doc(db, 'productosFabrica', idPendienteEliminar));
                showToast('Producto eliminado', 'success');
                getModal('prodFabDeleteModal').hide();
                idPendienteEliminar = null;
                cargarProductos();
            } catch (error) {
                console.error('Error al eliminar producto:', error);
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    // ── Guardar (crear/editar) ──
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = nombreInput.value.trim();
        const costoCompra = parseFloat(costoInput.value) || 0;
        const precioMayor = parseFloat(precioMayorInput.value) || 0;

        if (!nombre) {
            showToast('El nombre es requerido.', 'warning');
            return;
        }

        const id = idInput.value;
        const guardarTexto = btnGuardar.querySelector('.save-text');
        const spinner = btnGuardar.querySelector('.spinner-border');
        btnGuardar.disabled = true;
        if (guardarTexto) guardarTexto.classList.add('d-none');
        if (spinner) spinner.classList.remove('d-none');

        try {
            let imagenUrl = imagenUrlActual;
            const archivo = imagenInput.files[0];
            if (archivo) {
                const comprimida = await compressProductImageFile(archivo);
                // Mismo prefijo de carpeta que usa Boutique (product_images/):
                // no es dato de negocio compartido, solo evita depender de que
                // las reglas de Storage (no versionadas en este repo) ya
                // permitan una carpeta nueva antes de desplegar esto.
                const storageRef = ref(storage, `product_images/${Date.now()}-fabrica-${comprimida.name}`);
                await uploadBytes(storageRef, comprimida);
                imagenUrl = await getDownloadURL(storageRef);
            }

            const datos = {
                nombre,
                descripcion: descripcionInput.value.trim(),
                categoriaId: categoriaSelect.value || null,
                grupoMayorista: grupoMayoristaSelect.value || null,
                costoCompra,
                precioMayor,
                visible: visibleCheckbox.checked,
                imagenUrl,
                variaciones: leerVariacionesDelForm(),
                tenantId: window.expectedTenantId
            };

            if (id) {
                await updateDoc(doc(db, 'productosFabrica', id), datos);
                showToast('Producto actualizado', 'success');
            } else {
                await addDoc(productosFabricaCollection, {
                    ...datos,
                    codigo: 'PF' + Date.now().toString().slice(-6),
                    timestamp: serverTimestamp()
                });
                showToast('Producto guardado', 'success');
            }

            getModal('prodFabModal').hide();
            form.reset();
            cargarProductos();
        } catch (error) {
            console.error('Error al guardar producto de fábrica:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            btnGuardar.disabled = false;
            if (guardarTexto) guardarTexto.classList.remove('d-none');
            if (spinner) spinner.classList.add('d-none');
        }
    });

    // ── Cargar al entrar a la sección ──
    const tabLink = document.querySelector('a[href="#productos-fabrica"]');
    if (tabLink) tabLink.addEventListener('click', () => { cargarCategorias(); cargarProductos(); });
    window.addEventListener('hashchange', () => {
        if ((window.location.hash || '') === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }
    });
    window.addEventListener('admin:section-shown', (e) => {
        if (e.detail && e.detail.hash === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }
    });

    cargarGruposMayoristas();
    if ((window.location.hash || '') === '#productos-fabrica') { cargarCategorias(); cargarProductos(); }

    console.log("✅ Módulo Productos Fábrica inicializado");

}
