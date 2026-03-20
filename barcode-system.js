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

        // Formatter para moneda
        const formatoMoneda = new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0});

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
    // BÚSQUEDA POR CÓDIGO DE PRODUCTO (para QR personalizados)
    // ========================================================================

    async function buscarProductoPorCodigo(texto) {
        try {
            const q = query(
                collection(db, 'productos'),
                where('codigo', '==', texto.trim()),
                limit(1)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Error buscando por código:', error);
            return null;
        }
    }

    // Versión local de validación (sin mostrar toast) para uso interno
    function validarCodigoBarrasLocal(codigo) {
        codigo = codigo.replace(/[\s-]/g, '');
        if ((codigo.length !== 13 && codigo.length !== 12) || !/^\d+$/.test(codigo)) {
            return { valido: false };
        }
        if (codigo.length === 12) codigo = '0' + codigo;
        const providedCheck = parseInt(codigo[12]);
        const calculatedCheck = parseInt(calcularDigitoVerificadorEAN13(codigo.substring(0, 12)));
        return { valido: providedCheck === calculatedCheck, codigo };
    }

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
        // ESCÁNER CON CÁMARA (MÓVIL)
        // ====================================================================
        const btnCameraScanner = document.getElementById('btn-camera-scanner');
        const cameraScannerModal = document.getElementById('cameraScannerModal');

        if (btnCameraScanner && cameraScannerModal) {
            let html5QrCode = null;
            let scannerActive = false;

            async function iniciarEscaner() {
                const container = document.getElementById('camera-scanner-container');

                try {
                    html5QrCode = new Html5Qrcode('camera-scanner-container');
                    scannerActive = true;

                    await html5QrCode.start(
                        {
                            facingMode: 'environment',
                            advanced: [{ zoom: 1.5 }]
                        },
                        {
                            fps: 25,
                            qrbox: function(viewfinderWidth, viewfinderHeight) {
                                // Caja ancha y baja — ideal para códigos de barras lineales
                                return {
                                    width: Math.round(viewfinderWidth * 0.9),
                                    height: Math.round(viewfinderHeight * 0.3)
                                };
                            },
                            aspectRatio: 1.7,
                            formatsToSupport: [
                                Html5QrcodeSupportedFormats.EAN_13,
                                Html5QrcodeSupportedFormats.EAN_8,
                                Html5QrcodeSupportedFormats.UPC_A,
                                Html5QrcodeSupportedFormats.CODE_128,
                            ],
                            experimentalFeatures: {
                                useBarCodeDetectorIfSupported: true
                            },
                            videoConstraints: {
                                facingMode: 'environment',
                                width: { ideal: 1280 },
                                height: { ideal: 720 }
                            }
                        },
                        async (decodedText) => {
                            if (!scannerActive) return;
                            scannerActive = false;

                            // Parar escáner sin await para no bloquear
                            html5QrCode.stop().catch(() => {});

                            // Guardar código y cerrar modal INMEDIATAMENTE
                            const codigoEscaneado = decodedText;
                            bootstrap.Modal.getOrCreateInstance(cameraScannerModal).hide();

                            // Buscar producto DESPUÉS de que el modal cierre
                            cameraScannerModal.addEventListener('hidden.bs.modal', function() {
                                const texto = codigoEscaneado.trim();
                                const ean13 = texto.length === 12 && /^\d+$/.test(texto) ? '0' + texto : null;
                                let productoId = null;

                                // Buscar en el mapa local (ya cargado, ya filtrado por tenant, sin red)
                                const mapa = window.localProductsMap;
                                if (mapa && mapa.size > 0) {
                                    for (const [id, p] of mapa) {
                                        if (p.codigoBarras === texto ||
                                            (ean13 && p.codigoBarras === ean13) ||
                                            p.codigo === texto) {
                                            productoId = id;
                                            break;
                                        }
                                    }
                                }

                                if (productoId) {
                                    window.openVariationModal(productoId);
                                } else {
                                    showToast('Producto no encontrado para este código', 'warning');
                                }
                            }, { once: true });
                        },
                        () => { /* errores de frame ignorados */ }
                    );
                } catch (err) {
                    console.error('Error iniciando cámara:', err);
                    if (container) {
                        container.innerHTML = `
                            <div class="p-4 text-center text-danger">
                                <i class="bi bi-camera-video-off fs-1 d-block mb-2"></i>
                                <p>No se pudo acceder a la cámara.</p>
                                <small class="text-muted">Asegúrate de dar permiso de cámara al navegador.</small>
                            </div>`;
                    }
                }
            }

            async function detenerEscaner() {
                scannerActive = false;
                if (html5QrCode) {
                    try {
                        if (html5QrCode.isScanning) {
                            await html5QrCode.stop();
                        }
                    } catch(e) {}
                    html5QrCode = null;
                }
                // Limpiar el contenedor para evitar duplicados
                const container = document.getElementById('camera-scanner-container');
                if (container) container.innerHTML = '';
                const status = document.getElementById('camera-scanner-status');
                if (status) {
                    status.textContent = '';
                    status.classList.add('d-none');
                }
            }

            cameraScannerModal.addEventListener('shown.bs.modal', iniciarEscaner);
            cameraScannerModal.addEventListener('hide.bs.modal', detenerEscaner);
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
        // DESCARGA MASIVA DE CÓDIGOS DE BARRAS EN EXCEL
        // ========================================================================

        const downloadAllBarcodesBtn = document.getElementById('btn-download-all-barcodes');
        if (downloadAllBarcodesBtn) {
            downloadAllBarcodesBtn.addEventListener('click', async function() {
                try {
                    const btn = this;
                    const originalHTML = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando Excel...';

                    // Verificar que Firebase esté disponible
                    if (!window.db || !window.getDocs || !window.collection || !window.query) {
                        throw new Error('Firebase no está disponible');
                    }

                    // Obtener todos los productos con código de barras
                    const productosSnapshot = await window.getDocs(window.query(window.collection(window.db, 'productos')));
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

                    // Preparar datos para Excel
                    const datos = productosConBarcode.map(producto => {
                        const stockTotal = producto.variaciones ?
                            producto.variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0) : 0;

                        return {
                            'Nombre': producto.nombre || '',
                            'Código Producto': producto.codigo || '',
                            'Categoría': producto.categoriaId || '',
                            'Código de Barras': producto.codigoBarras || '',
                            'Precio Detal': producto.precioDetal || 0,
                            'Precio Mayor': producto.precioMayor || 0,
                            'Stock Total': stockTotal
                        };
                    });

                    // Crear libro de Excel
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.json_to_sheet(datos);

                    // Ajustar ancho de columnas
                    const wscols = [
                        { wch: 40 },  // Nombre
                        { wch: 15 },  // Código Producto
                        { wch: 20 },  // Categoría
                        { wch: 15 },  // Código de Barras
                        { wch: 12 },  // Precio Detal
                        { wch: 12 },  // Precio Mayor
                        { wch: 10 }   // Stock Total
                    ];
                    ws['!cols'] = wscols;

                    // Agregar hoja al libro
                    XLSX.utils.book_append_sheet(wb, ws, 'Códigos de Barras');

                    // Descargar archivo
                    const fecha = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, `codigos-barras-${fecha}.xlsx`);

                    showToast(`Excel generado con ${productosConBarcode.length} productos`, 'success');

                    btn.disabled = false;
                    btn.innerHTML = originalHTML;

                } catch (error) {
                    console.error('Error generando Excel:', error);
                    showToast('Error al generar Excel: ' + error.message, 'error');
                    const btn = document.getElementById('btn-download-all-barcodes');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-file-earmark-excel me-1"></i>Descargar Todos los Códigos de Barras (Excel)';
                    }
                }
            });
        }

        console.log('✅ Sistema de códigos de barras inicializado');
    });

})();
