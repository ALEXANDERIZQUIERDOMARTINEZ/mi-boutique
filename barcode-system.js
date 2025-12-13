// ============================================================================
// 🔍 SISTEMA DE CÓDIGOS DE BARRAS - MI BOUTIQUE
// ============================================================================
// Funcionalidades:
// - Generación automática de códigos de barras EAN-13
// - Búsqueda rápida por código (escáner USB compatible)
// - Generación visual de códigos de barras con JsBarcode
// - Impresión de etiquetas
// ============================================================================

(function() {
    'use strict';

    // ========================================================================
    // GENERACIÓN AUTOMÁTICA DE CÓDIGOS EAN-13
    // ========================================================================

    /**
     * Genera un código de barras EAN-13 válido
     * Formato: 750 (GS1 México) + 10 dígitos únicos
     */
    function generarCodigoEAN13() {
        // Prefijo GS1 para México: 750
        const prefix = '750';

        // Generar 9 dígitos aleatorios
        let randomDigits = '';
        for (let i = 0; i < 9; i++) {
            randomDigits += Math.floor(Math.random() * 10);
        }

        // Los primeros 12 dígitos
        const code12 = prefix + randomDigits;

        // Calcular dígito verificador
        const checkDigit = calcularDigitoVerificadorEAN13(code12);

        return code12 + checkDigit;
    }

    /**
     * Calcula el dígito verificador para código EAN-13
     */
    function calcularDigitoVerificadorEAN13(code12) {
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const digit = parseInt(code12[i]);
            sum += (i % 2 === 0) ? digit : digit * 3;
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        return checkDigit.toString();
    }

    // ========================================================================
    // VALIDACIÓN DE CÓDIGOS DE BARRAS
    // ========================================================================

    function validarCodigoBarras(codigo) {
        // Remover espacios y guiones
        codigo = codigo.replace(/[\s-]/g, '');

        // Validar longitud (EAN-13 o UPC-A)
        if (codigo.length !== 13 && codigo.length !== 12) {
            return { valido: false, mensaje: 'Debe tener 12 o 13 dígitos' };
        }

        // Validar que solo contenga números
        if (!/^\d+$/.test(codigo)) {
            return { valido: false, mensaje: 'Solo debe contener números' };
        }

        // Si es UPC-A (12 dígitos), convertir a EAN-13
        if (codigo.length === 12) {
            codigo = '0' + codigo;
        }

        // Validar dígito verificador
        const providedCheck = parseInt(codigo[12]);
        const calculatedCheck = parseInt(calcularDigitoVerificadorEAN13(codigo.substring(0, 12)));

        if (providedCheck !== calculatedCheck) {
            return { valido: false, mensaje: 'Dígito verificador inválido' };
        }

        return { valido: true, codigo: codigo };
    }

    // ========================================================================
    // GENERACIÓN VISUAL DE CÓDIGOS DE BARRAS
    // ========================================================================

    window.generarBarcodeVisual = function(codigo, elementId = 'barcode-svg') {
        try {
            JsBarcode(`#${elementId}`, codigo, {
                format: 'EAN13',
                width: 2,
                height: 100,
                displayValue: true,
                fontSize: 20,
                margin: 10,
                background: '#ffffff',
                lineColor: '#000000'
            });
            return true;
        } catch (error) {
            console.error('Error generando código de barras:', error);
            showToast('Error al generar código de barras visual', 'error');
            return false;
        }
    };

    // ========================================================================
    // BÚSQUEDA RÁPIDA POR CÓDIGO DE BARRAS
    // ========================================================================

    window.buscarProductoPorBarcode = async function(codigo) {
        try {
            // Validar código
            const validacion = validarCodigoBarras(codigo);
            if (!validacion.valido) {
                showToast(`Código inválido: ${validacion.mensaje}`, 'warning');
                return null;
            }

            // Buscar en Firebase
            const q = query(
                collection(db, 'productos'),
                where('codigoBarras', '==', validacion.codigo),
                limit(1)
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                showToast('Producto no encontrado con ese código de barras', 'warning');
                return null;
            }

            const doc = snapshot.docs[0];
            const producto = { id: doc.id, ...doc.data() };

            return producto;
        } catch (error) {
            console.error('Error buscando producto:', error);
            showToast('Error al buscar producto', 'error');
            return null;
        }
    };

    // ========================================================================
    // MOSTRAR MODAL DE CÓDIGO DE BARRAS
    // ========================================================================

    window.mostrarBarcodeModal = function(producto) {
        if (!producto.codigoBarras) {
            showToast('Este producto no tiene código de barras asignado', 'warning');
            return;
        }

        // Actualizar información del producto
        document.getElementById('barcode-product-name').textContent = producto.nombre;
        document.getElementById('barcode-product-code').textContent = `Código: ${producto.codigo || 'N/A'}`;
        document.getElementById('barcode-product-price').textContent = formatoMoneda.format(producto.precioDetal || 0);
        document.getElementById('barcode-number').textContent = producto.codigoBarras;

        // Generar código de barras visual
        window.generarBarcodeVisual(producto.codigoBarras);

        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('barcodeModal'));
        modal.show();
    };

    // ========================================================================
    // DESCARGAR CÓDIGO DE BARRAS COMO PNG
    // ========================================================================

    window.downloadBarcode = function() {
        const svg = document.getElementById('barcode-svg');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();

        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `barcode-${document.getElementById('barcode-number').textContent}.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    // ========================================================================
    // INICIALIZACIÓN
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function() {

        // ====================================================================
        // BOTÓN GENERAR CÓDIGO DE BARRAS EN FORMULARIO DE PRODUCTO
        // ====================================================================
        const btnGenerarBarcode = document.getElementById('btn-generar-barcode');
        const inputCodigoBarras = document.getElementById('codigo-barras');

        if (btnGenerarBarcode) {
            btnGenerarBarcode.addEventListener('click', function() {
                const nuevoBarcode = generarCodigoEAN13();
                inputCodigoBarras.value = nuevoBarcode;
                showToast('Código de barras generado', 'success');
            });
        }

        // ====================================================================
        // INPUT DE ESCANEO RÁPIDO EN VENTAS
        // ====================================================================
        const barcodeScannerInput = document.getElementById('barcode-scanner-input');

        if (barcodeScannerInput) {
            let barcodeBuffer = '';
            let lastKeypressTime = 0;

            barcodeScannerInput.addEventListener('keypress', async function(e) {
                const currentTime = new Date().getTime();

                // Si pasa más de 100ms entre teclas, reiniciar buffer
                // Los escáneres USB son muy rápidos (<50ms entre teclas)
                if (currentTime - lastKeypressTime > 100) {
                    barcodeBuffer = '';
                }

                lastKeypressTime = currentTime;

                if (e.key === 'Enter') {
                    e.preventDefault();

                    const codigo = barcodeBuffer || barcodeScannerInput.value;

                    if (codigo.length < 12) {
                        showToast('Código muy corto', 'warning');
                        barcodeBuffer = '';
                        barcodeScannerInput.value = '';
                        return;
                    }

                    // Buscar producto
                    const producto = await window.buscarProductoPorBarcode(codigo);

                    if (producto) {
                        // Abrir modal de selección de variación
                        window.openVariationModal(producto.id);
                        showToast(`Producto encontrado: ${producto.nombre}`, 'success');
                    }

                    // Limpiar input
                    barcodeBuffer = '';
                    barcodeScannerInput.value = '';
                } else {
                    barcodeBuffer += e.key;
                }
            });

            // También manejar pegado de código
            barcodeScannerInput.addEventListener('paste', async function(e) {
                e.preventDefault();
                const codigo = (e.clipboardData || window.clipboardData).getData('text');

                const producto = await window.buscarProductoPorBarcode(codigo);

                if (producto) {
                    window.openVariationModal(producto.id);
                    showToast(`Producto encontrado: ${producto.nombre}`, 'success');
                }

                barcodeScannerInput.value = '';
            });
        }

        // ========================================================================
        // DESCARGA MASIVA DE CÓDIGOS DE BARRAS
        // ========================================================================

        const downloadAllBarcodesBtn = document.getElementById('btn-download-all-barcodes');
        if (downloadAllBarcodesBtn) {
            downloadAllBarcodesBtn.addEventListener('click', async function() {
                try {
                    const btn = this;
                    const originalHTML = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando PDF...';

                    // Obtener todos los productos con código de barras
                    const productosSnapshot = await getDocs(query(collection(db, 'productos')));
                    const productosConBarcode = [];

                    productosSnapshot.forEach(doc => {
                        const producto = doc.data();
                        if (producto.codigoBarras) {
                            productosConBarcode.push({
                                id: doc.id,
                                ...producto
                            });
                        }
                    });

                    if (productosConBarcode.length === 0) {
                        showToast('No hay productos con código de barras', 'warning');
                        btn.disabled = false;
                        btn.innerHTML = originalHTML;
                        return;
                    }

                    // Crear PDF usando jsPDF
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4'
                    });

                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    const margin = 10;
                    const labelWidth = 90;
                    const labelHeight = 40;
                    const cols = 2;
                    const rows = Math.floor((pageHeight - 2 * margin) / labelHeight);

                    let currentPage = 1;
                    let currentRow = 0;
                    let currentCol = 0;

                    for (let i = 0; i < productosConBarcode.length; i++) {
                        const producto = productosConBarcode[i];

                        // Calcular posición
                        const x = margin + (currentCol * labelWidth);
                        const y = margin + (currentRow * labelHeight);

                        // Crear SVG temporal para el código de barras
                        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        try {
                            JsBarcode(tempSvg, producto.codigoBarras, {
                                format: "EAN13",
                                width: 2,
                                height: 60,
                                displayValue: true,
                                fontSize: 14,
                                margin: 5
                            });

                            // Convertir SVG a imagen
                            const svgData = new XMLSerializer().serializeToString(tempSvg);
                            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                            const svgUrl = URL.createObjectURL(svgBlob);

                            const img = new Image();
                            await new Promise((resolve, reject) => {
                                img.onload = () => {
                                    // Agregar nombre del producto
                                    doc.setFontSize(9);
                                    doc.setFont(undefined, 'bold');
                                    const nombreCorto = producto.nombre.length > 35 ? producto.nombre.substring(0, 35) + '...' : producto.nombre;
                                    doc.text(nombreCorto, x + labelWidth / 2, y + 5, { align: 'center' });

                                    // Agregar precio
                                    doc.setFontSize(10);
                                    const precio = producto.precioDetal || 0;
                                    doc.text(`$${precio.toLocaleString('es-CO')}`, x + labelWidth / 2, y + 12, { align: 'center' });

                                    // Agregar código de barras como imagen
                                    doc.addImage(img, 'PNG', x + 5, y + 15, labelWidth - 10, 20);

                                    URL.revokeObjectURL(svgUrl);
                                    resolve();
                                };
                                img.onerror = reject;
                                img.src = svgUrl;
                            });

                        } catch (error) {
                            console.error(`Error generando código de barras para ${producto.nombre}:`, error);
                        }

                        // Actualizar posición
                        currentCol++;
                        if (currentCol >= cols) {
                            currentCol = 0;
                            currentRow++;
                        }

                        // Crear nueva página si es necesario
                        if (currentRow >= rows && i < productosConBarcode.length - 1) {
                            doc.addPage();
                            currentPage++;
                            currentRow = 0;
                            currentCol = 0;
                        }
                    }

                    // Descargar PDF
                    doc.save(`codigos-barras-${new Date().toISOString().split('T')[0]}.pdf`);
                    showToast(`PDF generado con ${productosConBarcode.length} códigos de barras`, 'success');

                    btn.disabled = false;
                    btn.innerHTML = originalHTML;

                } catch (error) {
                    console.error('Error generando PDF:', error);
                    showToast('Error al generar PDF: ' + error.message, 'error');
                    const btn = document.getElementById('btn-download-all-barcodes');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-download me-1"></i>Descargar Todos los Códigos de Barras';
                    }
                }
            });
        }

        console.log('✅ Sistema de códigos de barras inicializado');
    });

})();
