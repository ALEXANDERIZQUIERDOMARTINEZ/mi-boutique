// ============================================================================
// 🏷️ IMPRESIÓN MASIVA DE ETIQUETAS - MISHELL'ES FÁBRICA
// ============================================================================
// Misma idea que etiquetas.js (Boutique), pero solo con código QR: Fábrica
// no tiene código de barras EAN-13 en su modelo de datos (productosFabrica
// no tiene el campo codigoBarras, y Registrar Venta no tiene lector de
// código de barras), así que el QR codifica directamente la referencia
// (campo 'codigo', que todo producto de Fábrica siempre tiene).
// Lee el catálogo ya cargado por el módulo de Productos Fábrica en
// window.fabricaProductsMap / window.fabricaCategoriasMap (admin-fabrica.js).
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
    // RENDER DE LA TABLA DE SELECCIÓN
    // ========================================================================

    let retryPendiente = 0;

    function poblarFiltroCategorias() {
        const sel = document.getElementById('etqfab-filter-categoria');
        if (!sel || !window.fabricaCategoriasMap || sel.options.length > 1) return;
        window.fabricaCategoriasMap.forEach((nombre, id) => {
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
                <input type="checkbox" class="form-check-input etqfab-check-var" data-key="${key}" ${marcado ? 'checked' : ''}>
                <span class="small">${escapeHtml(etiquetaTexto)}${stock ? ` <span class="text-muted">(stock ${stock})</span>` : ''}</span>
                <input type="number" class="form-control form-control-sm etqfab-qty" style="width:58px;" min="0" value="${qty}" data-key="${key}">
            </label>`;
    }

    function renderRow(productoId, p) {
        const categoriasMap = window.fabricaCategoriasMap;
        const catNombre = (categoriasMap && categoriasMap.get(p.categoriaId)) || 'Sin categoría';
        const imgUrl = p.imagenUrl || 'https://placehold.co/40x50.png?text=%20';

        const variaciones = (p.variaciones && p.variaciones.length > 0) ? p.variaciones : [{ talla: '', color: '' }];
        const varsHtml = variaciones.map(v => renderVarControl(productoId, v)).join('');
        const todasMarcadas = variaciones.every(v => seleccion.has(claveVar(productoId, v.talla || '', v.color || '')));

        return `
            <tr>
                <td><input type="checkbox" class="form-check-input etqfab-check-producto" ${todasMarcadas ? 'checked' : ''}></td>
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
                <td>${formatoMoneda.format(p.precioMayor || 0)}</td>
                <td>${varsHtml}</td>
            </tr>`;
    }

    function render() {
        const tbody = document.getElementById('etqfab-tabla-body');
        if (!tbody) return;

        poblarFiltroCategorias();

        const mapa = window.fabricaProductsMap;
        if (!mapa || mapa.size === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Cargando productos...</td></tr>';
            if (retryPendiente < 6) {
                retryPendiente++;
                setTimeout(render, 600);
            }
            actualizarContador();
            return;
        }
        retryPendiente = 0;

        const searchVal = (document.getElementById('etqfab-search').value || '').toLowerCase().trim();
        const catVal = document.getElementById('etqfab-filter-categoria').value;

        const productos = [...mapa.entries()]
            .filter(([, p]) => {
                if (catVal && p.categoriaId !== catVal) return false;
                if (!searchVal) return true;
                return (p.nombre || '').toLowerCase().includes(searchVal) || (p.codigo || '').toLowerCase().includes(searchVal);
            })
            .sort((a, b) => (a[1].nombre || '').localeCompare(b[1].nombre || ''));

        if (productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin resultados.</td></tr>';
            actualizarContador();
            return;
        }

        tbody.innerHTML = productos.map(([id, p]) => renderRow(id, p)).join('');
        actualizarContador();
    }

    function actualizarContador() {
        let total = 0;
        seleccion.forEach(qty => { total += qty; });
        const contador = document.getElementById('etqfab-contador');
        const btnImprimir = document.getElementById('etqfab-btn-imprimir');
        if (contador) contador.textContent = total;
        if (btnImprimir) btnImprimir.disabled = total === 0;
    }

    // ========================================================================
    // SELECCIÓN (checkboxes + cantidades)
    // ========================================================================

    function onTbodyChange(e) {
        const chkProd = e.target.closest('.etqfab-check-producto');
        if (chkProd) {
            const row = chkProd.closest('tr');
            row.querySelectorAll('.etqfab-check-var').forEach(chk => {
                const key = chk.dataset.key;
                const qtyInput = chk.closest('label').querySelector('.etqfab-qty');
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

        const chk = e.target.closest('.etqfab-check-var');
        if (chk) {
            const key = chk.dataset.key;
            const qtyInput = chk.closest('label').querySelector('.etqfab-qty');
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

        const qtyInput = e.target.closest('.etqfab-qty');
        if (qtyInput) {
            const key = qtyInput.dataset.key;
            const label = qtyInput.closest('label');
            const chkVar = label.querySelector('.etqfab-check-var');
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

    function setTodosVisibles(marcar) {
        document.querySelectorAll('#etqfab-tabla-body .etqfab-check-var').forEach(chk => {
            const key = chk.dataset.key;
            const qtyInput = chk.closest('label').querySelector('.etqfab-qty');
            chk.checked = marcar;
            if (marcar) {
                seleccion.set(key, Math.max(parseInt(qtyInput.value, 10) || 1, 1));
            } else {
                seleccion.delete(key);
            }
        });
        document.querySelectorAll('#etqfab-tabla-body .etqfab-check-producto').forEach(chk => { chk.checked = marcar; });
        actualizarContador();
    }

    function seleccionarTodoElCatalogo() {
        const mapa = window.fabricaProductsMap;
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

    // qrcodejs dibuja de forma síncrona (canvas) dentro del contenedor que se
    // le pasa — no necesita estar insertado en el documento vivo. Se extrae
    // como <img> con la imagen ya "horneada" en un data URL para poder
    // incrustarla tal cual en la ventana de impresión.
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
        if (incluir.precio) partes.push(`<div class="lbl-precio">${formatoMoneda.format(p.precioMayor || 0)}</div>`);

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

    // Mismo patrón que en Boutique: iframe oculto + blob URL en vez de
    // window.open(), para no depender del permiso de ventanas emergentes
    // del navegador tras varios await (carga de QRCode, etc.).
    function imprimirHojaEtiquetas(html) {
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        let iframe = document.getElementById('etqfab-print-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'etqfab-print-iframe';
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
        const btn = document.getElementById('etqfab-btn-imprimir');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

        try {
            const [wMm, hMm, cols] = document.getElementById('etqfab-tamano').value.split('x').map(Number);
            const incluir = {
                nombre: document.getElementById('etqfab-campo-nombre').checked,
                referencia: document.getElementById('etqfab-campo-referencia').checked,
                talla: document.getElementById('etqfab-campo-talla').checked,
                precio: document.getElementById('etqfab-campo-precio').checked
            };

            const items = [];
            for (const [key, qty] of seleccion.entries()) {
                if (qty <= 0) continue;
                const [productoId, talla, color] = key.split('::');
                const producto = window.fabricaProductsMap.get(productoId);
                if (!producto) continue;
                items.push({ productoId, producto, talla, color, qty });
            }

            if (items.length === 0) {
                showToast('No hay productos seleccionados', 'warning');
                return;
            }

            await window.loadExternalLib('qrcode');

            const labelsHtml = [];
            for (const item of items) {
                const codeMarkup = renderQrHtml(item.producto.codigo || item.productoId);
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
        const tbody = document.getElementById('etqfab-tabla-body');
        if (!tbody) return;

        if ((window.location.hash || '#dashboard') === '#etiquetas-fabrica') render();
        window.addEventListener('admin:section-shown', (e) => {
            if (e.detail && e.detail.hash === '#etiquetas-fabrica') render();
        });

        document.getElementById('etqfab-search').addEventListener('input', debounce(render, 200));
        document.getElementById('etqfab-filter-categoria').addEventListener('change', render);
        document.getElementById('etqfab-check-header').addEventListener('change', (e) => setTodosVisibles(e.target.checked));
        document.getElementById('etqfab-select-all-btn').addEventListener('click', seleccionarTodoElCatalogo);
        document.getElementById('etqfab-clear-selection-btn').addEventListener('click', limpiarSeleccion);
        document.getElementById('etqfab-btn-imprimir').addEventListener('click', imprimirEtiquetas);
        tbody.addEventListener('change', onTbodyChange);

        console.log('✅ Módulo de etiquetas de Fábrica inicializado');
    });

})();
