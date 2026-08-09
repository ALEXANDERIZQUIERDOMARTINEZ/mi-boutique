// ============================================================================
// 🏷️ IMPRESIÓN MASIVA DE ETIQUETAS - MI BOUTIQUE
// ============================================================================
// Genera hojas de etiquetas (código de barras EAN-13 o QR) para pegar en la
// prenda física, con nombre, referencia, talla/color y precio. Al escanear
// la etiqueta con la pistola láser (input #barcode-scanner-input en Ventas)
// o con la cámara, se recupera automáticamente el producto — ver
// barcode-system.js (buscarProductoPorBarcode / buscarProductoPorCodigo).
// ============================================================================

(function() {
    'use strict';

    const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    // clave -> cantidad de etiquetas a imprimir para esa variación. Persiste
    // la selección aunque el usuario filtre/busque y la tabla se repinte.
    const seleccion = new Map();

    function claveVar(productoId, talla, color) {
        return `${productoId}::${talla || ''}::${color || ''}`;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function debounce(fn, ms) {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // ========================================================================
    // GENERAR Y GUARDAR CÓDIGO DE BARRAS FALTANTE
    // ========================================================================

    async function generarYGuardarCodigoBarras(productoId) {
        const nuevo = window.generarCodigoEAN13();
        await window.updateDoc(window.doc(window.db, 'productos', productoId), { codigoBarras: nuevo });
        const p = window.localProductsMap.get(productoId);
        if (p) p.codigoBarras = nuevo;
        return nuevo;
    }

    // ========================================================================
    // RENDER DE LA TABLA DE SELECCIÓN
    // ========================================================================

    let retryPendiente = 0;

    function poblarFiltroCategorias() {
        const sel = document.getElementById('etiquetas-filter-categoria');
        if (!sel || !window.categoriesMap || sel.options.length > 1) return;
        window.categoriesMap.forEach((nombre, id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = nombre;
            sel.appendChild(opt);
        });
    }

    function renderVarControl(productoId, v) {
        const talla = v.talla || '';
        const color = v.color || '';
        const key = claveVar(productoId, talla, color);
        const marcado = seleccion.has(key);
        const stock = parseInt(v.stock, 10) || 0;
        const qty = marcado ? seleccion.get(key) : Math.max(stock, 1);
        const etiquetaTexto = [talla, color].filter(Boolean).join(' / ') || 'Única';

        return `
            <label class="d-inline-flex align-items-center gap-1 border rounded px-2 py-1 me-1 mb-1">
                <input type="checkbox" class="form-check-input etq-check-var" data-key="${key}" ${marcado ? 'checked' : ''}>
                <span class="small">${escapeHtml(etiquetaTexto)}${stock ? ` <span class="text-muted">(stock ${stock})</span>` : ''}</span>
                <input type="number" class="form-control form-control-sm etq-qty" style="width:58px;" min="0" value="${qty}" data-key="${key}">
            </label>`;
    }

    function renderRow(productoId, p) {
        const categoriasMap = window.categoriesMap;
        const catNombre = (categoriasMap && categoriasMap.get(p.categoriaId)) || 'Sin categoría';
        const imgUrl = p.imagenUrl || 'https://placehold.co/40x50.png?text=%20';
        const barcodeCell = p.codigoBarras
            ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle me-1"></i>${p.codigoBarras}</span>`
            : `<button type="button" class="btn btn-sm btn-outline-warning etq-btn-generar" data-producto-id="${productoId}"><i class="bi bi-magic me-1"></i>Generar</button>`;

        const variaciones = (p.variaciones && p.variaciones.length > 0) ? p.variaciones : [{ talla: '', color: '' }];
        const varsHtml = variaciones.map(v => renderVarControl(productoId, v)).join('');
        const todasMarcadas = variaciones.every(v => seleccion.has(claveVar(productoId, v.talla || '', v.color || '')));

        return `
            <tr>
                <td><input type="checkbox" class="form-check-input etq-check-producto" ${todasMarcadas ? 'checked' : ''}></td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${imgUrl}" alt="" style="width:34px;height:44px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.visibility='hidden'">
                        <div>
                            <div class="fw-semibold">${escapeHtml(p.nombre)}</div>
                            <div class="text-muted small">${escapeHtml(catNombre)}</div>
                        </div>
                    </div>
                </td>
                <td><code>${escapeHtml(p.codigo || '—')}</code></td>
                <td>${barcodeCell}</td>
                <td>${formatoMoneda.format(p.precioDetal || 0)}</td>
                <td>${varsHtml}</td>
            </tr>`;
    }

    function render() {
        const tbody = document.getElementById('etiquetas-tabla-body');
        if (!tbody) return;

        poblarFiltroCategorias();

        const mapa = window.localProductsMap;
        if (!mapa || mapa.size === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Cargando productos...</td></tr>';
            if (retryPendiente < 6) {
                retryPendiente++;
                setTimeout(render, 600);
            }
            actualizarContador();
            return;
        }
        retryPendiente = 0;

        const searchVal = (document.getElementById('etiquetas-search').value || '').toLowerCase().trim();
        const catVal = document.getElementById('etiquetas-filter-categoria').value;

        const productos = [...mapa.entries()]
            .filter(([, p]) => {
                if (catVal && p.categoriaId !== catVal) return false;
                if (!searchVal) return true;
                return (p.nombre || '').toLowerCase().includes(searchVal) || (p.codigo || '').toLowerCase().includes(searchVal);
            })
            .sort((a, b) => (a[1].nombre || '').localeCompare(b[1].nombre || ''));

        if (productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin resultados.</td></tr>';
            actualizarContador();
            return;
        }

        tbody.innerHTML = productos.map(([id, p]) => renderRow(id, p)).join('');
        actualizarContador();
    }

    function actualizarContador() {
        let total = 0;
        seleccion.forEach(qty => { total += qty; });
        const contador = document.getElementById('etiquetas-contador');
        const btnImprimir = document.getElementById('etiquetas-btn-imprimir');
        if (contador) contador.textContent = total;
        if (btnImprimir) btnImprimir.disabled = total === 0;
    }

    // ========================================================================
    // SELECCIÓN (checkboxes + cantidades)
    // ========================================================================

    function onTbodyChange(e) {
        const chkProd = e.target.closest('.etq-check-producto');
        if (chkProd) {
            const row = chkProd.closest('tr');
            row.querySelectorAll('.etq-check-var').forEach(chk => {
                const key = chk.dataset.key;
                const qtyInput = chk.closest('label').querySelector('.etq-qty');
                chk.checked = chkProd.checked;
                if (chkProd.checked) {
                    seleccion.set(key, Math.max(parseInt(qtyInput.value, 10) || 1, 1));
                } else {
                    seleccion.delete(key);
                }
            });
            actualizarContador();
            return;
        }

        const chk = e.target.closest('.etq-check-var');
        if (chk) {
            const key = chk.dataset.key;
            const qtyInput = chk.closest('label').querySelector('.etq-qty');
            if (chk.checked) {
                const qty = Math.max(parseInt(qtyInput.value, 10) || 1, 1);
                qtyInput.value = qty;
                seleccion.set(key, qty);
            } else {
                seleccion.delete(key);
            }
            actualizarContador();
            return;
        }

        const qtyInput = e.target.closest('.etq-qty');
        if (qtyInput) {
            const key = qtyInput.dataset.key;
            const label = qtyInput.closest('label');
            const chkVar = label.querySelector('.etq-check-var');
            const qty = parseInt(qtyInput.value, 10) || 0;
            if (qty <= 0) {
                qtyInput.value = 0;
                chkVar.checked = false;
                seleccion.delete(key);
            } else {
                chkVar.checked = true;
                seleccion.set(key, qty);
            }
            actualizarContador();
        }
    }

    async function onTbodyClick(e) {
        const btn = e.target.closest('.etq-btn-generar');
        if (!btn) return;
        const productoId = btn.dataset.productoId;
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            await generarYGuardarCodigoBarras(productoId);
            showToast('Código de barras generado', 'success');
            render();
        } catch (err) {
            console.error('Error generando código de barras:', err);
            showToast('Error al generar código: ' + err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    function setTodosVisibles(marcar) {
        document.querySelectorAll('#etiquetas-tabla-body .etq-check-var').forEach(chk => {
            const key = chk.dataset.key;
            const qtyInput = chk.closest('label').querySelector('.etq-qty');
            chk.checked = marcar;
            if (marcar) {
                seleccion.set(key, Math.max(parseInt(qtyInput.value, 10) || 1, 1));
            } else {
                seleccion.delete(key);
            }
        });
        document.querySelectorAll('#etiquetas-tabla-body .etq-check-producto').forEach(chk => { chk.checked = marcar; });
        actualizarContador();
    }

    function seleccionarTodoElCatalogo() {
        const mapa = window.localProductsMap;
        if (!mapa || mapa.size === 0) return;
        mapa.forEach((p, id) => {
            const variaciones = (p.variaciones && p.variaciones.length > 0) ? p.variaciones : [{ talla: '', color: '' }];
            variaciones.forEach(v => {
                const key = claveVar(id, v.talla || '', v.color || '');
                const stock = parseInt(v.stock, 10) || 0;
                seleccion.set(key, Math.max(stock, 1));
            });
        });
        render();
        showToast('Todos los productos seleccionados', 'success');
    }

    function limpiarSeleccion() {
        seleccion.clear();
        render();
    }

    // ========================================================================
    // GENERACIÓN DE LA HOJA DE ETIQUETAS E IMPRESIÓN
    // ========================================================================

    function renderBarcodeSvg(codigo) {
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svgEl, codigo, {
            format: 'EAN13',
            width: 1.6,
            height: 45,
            displayValue: true,
            fontSize: 11,
            margin: 2,
            background: '#ffffff',
            lineColor: '#000000'
        });
        return svgEl.outerHTML;
    }

    // qrcodejs dibuja de forma síncrona (canvas) dentro del contenedor que
    // se le pasa — no necesita estar insertado en el documento vivo. Se
    // extrae como <img> con la imagen ya "horneada" en un data URL para
    // poder incrustarla tal cual en la ventana de impresión.
    function renderQrHtml(texto, sizePx = 160) {
        const holder = document.createElement('div');
        new QRCode(holder, {
            text: String(texto),
            width: sizePx,
            height: sizePx,
            correctLevel: QRCode.CorrectLevel.M
        });
        const canvas = holder.querySelector('canvas');
        if (canvas) return `<img src="${canvas.toDataURL('image/png')}" alt="QR">`;
        const img = holder.querySelector('img');
        if (img) return `<img src="${img.src}" alt="QR">`;
        throw new Error('No se pudo generar el código QR');
    }

    function buildLabelHtml(item, codeMarkup, incluir) {
        const p = item.producto;
        const partes = [];
        if (incluir.nombre) partes.push(`<div class="lbl-nombre">${escapeHtml(p.nombre)}</div>`);
        if (incluir.referencia) partes.push(`<div class="lbl-ref">Ref: ${escapeHtml(p.codigo || '')}</div>`);
        if (incluir.talla) {
            const tallaTxt = [item.talla, item.color].filter(Boolean).join(' / ') || 'Única';
            partes.push(`<div class="lbl-talla">${escapeHtml(tallaTxt)}</div>`);
        }
        if (incluir.precio) partes.push(`<div class="lbl-precio">${formatoMoneda.format(p.precioDetal || 0)}</div>`);

        return `<div class="lbl"><div class="lbl-code">${codeMarkup}</div><div class="lbl-info">${partes.join('')}</div></div>`;
    }

    function construirHojaEtiquetas(labelsHtml, wMm, hMm, cols) {
        const alturaCodigo = Math.max(hMm * 0.55, 10);
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 4mm; font-family: Arial, Helvetica, sans-serif; background: #fff; }
.lbl-grid { display: grid; grid-template-columns: repeat(${cols}, ${wMm}mm); gap: 2mm; }
.lbl { width: ${wMm}mm; height: ${hMm}mm; border: 1px dashed #bbb; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
.lbl-code svg, .lbl-code img { width: 100%; height: auto; max-height: ${alturaCodigo}mm; }
.lbl-info { text-align: center; width: 100%; line-height: 1.15; }
.lbl-nombre { font-size: 7.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.lbl-ref, .lbl-talla { font-size: 6.5pt; color: #333; }
.lbl-precio { font-size: 8pt; font-weight: 700; }
@media print { body { padding: 2mm; } .lbl { border-color: transparent; } }
@page { size: auto; margin: 4mm; }
</style>
</head><body>
<div class="lbl-grid">${labelsHtml.join('')}</div>
</body></html>`;
    }

    // Mismo patrón que imprimirFacturaPDF (admin.js): iframe oculto + blob
    // URL en vez de window.open(), para no depender del permiso de
    // ventanas emergentes del navegador tras varios await (carga de
    // JsBarcode/QRCode, guardado de códigos faltantes, etc.).
    function imprimirHojaEtiquetas(html) {
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        let iframe = document.getElementById('etiquetas-print-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'etiquetas-print-iframe';
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
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        };
        iframe.src = blobUrl;
    }

    async function imprimirEtiquetas() {
        if (seleccion.size === 0) return;
        const btn = document.getElementById('etiquetas-btn-imprimir');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

        try {
            const tipo = document.querySelector('input[name="etiquetas-tipo"]:checked').value;
            const [wMm, hMm, cols] = document.getElementById('etiquetas-tamano').value.split('x').map(Number);
            const incluir = {
                nombre: document.getElementById('etiquetas-campo-nombre').checked,
                referencia: document.getElementById('etiquetas-campo-referencia').checked,
                talla: document.getElementById('etiquetas-campo-talla').checked,
                precio: document.getElementById('etiquetas-campo-precio').checked
            };

            const items = [];
            for (const [key, qty] of seleccion.entries()) {
                if (qty <= 0) continue;
                const [productoId, talla, color] = key.split('::');
                const producto = window.localProductsMap.get(productoId);
                if (!producto) continue;
                items.push({ productoId, producto, talla, color, qty });
            }

            if (items.length === 0) {
                showToast('No hay productos seleccionados', 'warning');
                return;
            }

            if (tipo === 'barcode') {
                const pendientes = new Set();
                items.forEach(it => { if (!it.producto.codigoBarras) pendientes.add(it.productoId); });
                if (pendientes.size > 0) {
                    showToast(`Generando código de barras para ${pendientes.size} producto(s)...`, 'info');
                    for (const id of pendientes) await generarYGuardarCodigoBarras(id);
                }
                await window.loadExternalLib('jsbarcode');
            } else {
                await window.loadExternalLib('qrcode');
            }

            const labelsHtml = [];
            for (const item of items) {
                const codeMarkup = tipo === 'barcode'
                    ? renderBarcodeSvg(item.producto.codigoBarras)
                    : renderQrHtml(item.producto.codigo || item.producto.codigoBarras || item.productoId);
                const labelHtml = buildLabelHtml(item, codeMarkup, incluir);
                for (let i = 0; i < item.qty; i++) labelsHtml.push(labelHtml);
            }

            imprimirHojaEtiquetas(construirHojaEtiquetas(labelsHtml, wMm, hMm, cols));
        } catch (err) {
            console.error('Error generando etiquetas:', err);
            showToast('Error al generar etiquetas: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    // ========================================================================
    // INICIALIZACIÓN
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function() {
        const tbody = document.getElementById('etiquetas-tabla-body');
        if (!tbody) return;

        if ((window.location.hash || '#dashboard') === '#etiquetas') render();
        window.addEventListener('admin:section-shown', (e) => {
            if (e.detail && e.detail.hash === '#etiquetas') render();
        });

        document.getElementById('etiquetas-search').addEventListener('input', debounce(render, 200));
        document.getElementById('etiquetas-filter-categoria').addEventListener('change', render);
        document.getElementById('etiquetas-check-header').addEventListener('change', (e) => setTodosVisibles(e.target.checked));
        document.getElementById('etiquetas-select-all-btn').addEventListener('click', seleccionarTodoElCatalogo);
        document.getElementById('etiquetas-clear-selection-btn').addEventListener('click', limpiarSeleccion);
        document.getElementById('etiquetas-btn-imprimir').addEventListener('click', imprimirEtiquetas);
        tbody.addEventListener('change', onTbodyChange);
        tbody.addEventListener('click', onTbodyClick);

        console.log('✅ Módulo de etiquetas inicializado');
    });

})();
