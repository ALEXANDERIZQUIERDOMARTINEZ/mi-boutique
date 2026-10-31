// Backup / exportación a Excel.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: BACKUP Y EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════════
export function init(ctx) {
    const { alEntrarSeccion, db, loadExternalLib, showToast } = ctx;

    // Función auxiliar para formatear fecha
    function formatDate(date) {
        if (!date) return '';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-CO');
    }

    // Función auxiliar para formatear moneda
    function formatCurrency(value) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(value || 0);
    }

    // Función para generar nombre de archivo con timestamp
    function generateFileName(prefix) {
        const now = new Date();
        const timestamp = now.toISOString().slice(0,10) + '_' +
                         now.toTimeString().slice(0,5).replace(':','');
        return `${prefix}_${timestamp}.xlsx`;
    }

    // ============================================================
    // 1. EXPORTAR INVENTARIO
    // ============================================================
    const exportInventarioBtn = document.getElementById('export-inventario-btn');
    if (exportInventarioBtn) {
        exportInventarioBtn.addEventListener('click', async () => {
            try {
                const btn = exportInventarioBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                // Obtener productos
                const productosSnapshot = await getDocs(collection(db, 'productos'));

                // Obtener categorías
                const categoriasSnapshot = await getDocs(collection(db, 'categorias'));
                const categoriasMap = new Map();
                categoriasSnapshot.forEach(doc => {
                    categoriasMap.set(doc.id, doc.data().nombre);
                });

                const data = [];
                productosSnapshot.forEach(doc => {
                    const producto = doc.data();
                    const categoria = categoriasMap.get(producto.categoriaId) || 'Sin categoría';

                    if (producto.variaciones && producto.variaciones.length > 0) {
                        // Producto con variaciones
                        producto.variaciones.forEach(variacion => {
                            data.push({
                                'Código': producto.codigo || '',
                                'Nombre': producto.nombre || '',
                                'Categoría': categoria,
                                'Talla': variacion.talla || '',
                                'Color': variacion.color || '',
                                'Stock': variacion.stock || 0,
                                'Costo': producto.costoCompra || 0,
                                'Precio Detal': producto.precioDetal || 0,
                                'Precio Mayor': producto.precioMayor || 0,
                                'Proveedor': producto.proveedor || '',
                                'Visible': producto.visible ? 'Sí' : 'No',
                                'Descripción': producto.descripcion || ''
                            });
                        });
                    } else {
                        // Producto sin variaciones
                        data.push({
                            'Código': producto.codigo || '',
                            'Nombre': producto.nombre || '',
                            'Categoría': categoria,
                            'Talla': '',
                            'Color': '',
                            'Stock': 0,
                            'Costo': producto.costoCompra || 0,
                            'Precio Detal': producto.precioDetal || 0,
                            'Precio Mayor': producto.precioMayor || 0,
                            'Proveedor': producto.proveedor || '',
                            'Visible': producto.visible ? 'Sí' : 'No',
                            'Descripción': producto.descripcion || ''
                        });
                    }
                });

                // Crear libro de Excel
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

                // Descargar
                XLSX.writeFile(wb, generateFileName('Inventario_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Inventario exportado: ${data.length} productos`, 'success');
            } catch (error) {
                console.error('Error exportando inventario:', error);
                exportInventarioBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportInventarioBtn.disabled = false;
                showToast('Error al exportar inventario', 'error');
            }
        });
    }

    // ============================================================
    // 2. EXPORTAR CLIENTES
    // ============================================================
    const exportClientesBtn = document.getElementById('export-clientes-btn');
    if (exportClientesBtn) {
        exportClientesBtn.addEventListener('click', async () => {
            try {
                const btn = exportClientesBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                const clientesSnapshot = await getDocs(collection(db, 'clientes'));
                const data = [];

                clientesSnapshot.forEach(doc => {
                    const cliente = doc.data();
                    data.push({
                        'Cédula': cliente.cedula || '',
                        'Nombre': cliente.nombre || '',
                        'Celular': cliente.celular || '',
                        'Dirección': cliente.direccion || '',
                        'Fecha Registro': formatDate(cliente.fechaRegistro)
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
                XLSX.writeFile(wb, generateFileName('Clientes_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Clientes exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando clientes:', error);
                exportClientesBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportClientesBtn.disabled = false;
                showToast('Error al exportar clientes', 'error');
            }
        });
    }

    // ============================================================
    // 3. EXPORTAR VENTAS
    // ============================================================
    const exportVentasBtn = document.getElementById('export-ventas-btn');
    if (exportVentasBtn) {
        exportVentasBtn.addEventListener('click', async () => {
            try {
                const btn = exportVentasBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                const ventasSnapshot = await getDocs(query(collection(db, 'ventas'), orderBy('fecha', 'desc')));
                const data = [];

                ventasSnapshot.forEach(doc => {
                    const venta = doc.data();
                    const productosStr = venta.productos ?
                        venta.productos.map(p => `${p.nombre} (${p.cantidad})`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(venta.fecha),
                        'Cliente': venta.clienteNombre || '',
                        'Productos': productosStr,
                        'Subtotal': venta.subtotal || 0,
                        'Descuento': venta.descuento || 0,
                        'Total': venta.total || 0,
                        'Método Pago': venta.metodoPago || '',
                        'Estado': venta.estado || 'completada',
                        'Requiere Envío': venta.requiereEnvio ? 'Sí' : 'No',
                        'Repartidor': venta.repartidorNombre || '',
                        'Costo Envío': venta.costoEnvio || 0
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
                XLSX.writeFile(wb, generateFileName('Ventas_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Ventas exportadas: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando ventas:', error);
                exportVentasBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportVentasBtn.disabled = false;
                showToast('Error al exportar ventas', 'error');
            }
        });
    }

    // ============================================================
    // 4. EXPORTAR FINANZAS
    // ============================================================
    const exportFinanzasBtn = document.getElementById('export-finanzas-btn');
    if (exportFinanzasBtn) {
        exportFinanzasBtn.addEventListener('click', async () => {
            try {
                const btn = exportFinanzasBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                const finanzasSnapshot = await getDocs(query(collection(db, 'finanzas'), orderBy('fecha', 'desc')));
                const data = [];

                finanzasSnapshot.forEach(doc => {
                    const registro = doc.data();
                    data.push({
                        'Fecha': formatDate(registro.fecha),
                        'Tipo': registro.tipo || '',
                        'Monto': registro.monto || 0,
                        'Método': registro.metodo || registro.metodoPago || '',
                        'Descripción': registro.descripcion || '',
                        'Categoría': registro.categoria || ''
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Finanzas');
                XLSX.writeFile(wb, generateFileName('Finanzas_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Finanzas exportadas: ${data.length} registros`, 'success');
            } catch (error) {
                console.error('Error exportando finanzas:', error);
                exportFinanzasBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportFinanzasBtn.disabled = false;
                showToast('Error al exportar finanzas', 'error');
            }
        });
    }

    // ============================================================
    // 5. EXPORTAR APARTADOS
    // ============================================================
    const exportApartadosBtn = document.getElementById('export-apartados-btn');
    if (exportApartadosBtn) {
        exportApartadosBtn.addEventListener('click', async () => {
            try {
                const btn = exportApartadosBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
                const data = [];

                apartadosSnapshot.forEach(doc => {
                    const apartado = doc.data();
                    const productosStr = apartado.productos ?
                        apartado.productos.map(p => `${p.nombre} (${p.cantidad})`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(apartado.fecha),
                        'Cliente': apartado.clienteNombre || '',
                        'Productos': productosStr,
                        'Total': apartado.total || 0,
                        'Abono': apartado.abono || 0,
                        'Saldo': apartado.saldo || 0,
                        'Estado': apartado.estado || '',
                        'Vence': formatDate(apartado.fechaVencimiento)
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Apartados');
                XLSX.writeFile(wb, generateFileName('Apartados_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Apartados exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando apartados:', error);
                exportApartadosBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportApartadosBtn.disabled = false;
                showToast('Error al exportar apartados', 'error');
            }
        });
    }

    // ============================================================
    // 6. EXPORTAR PEDIDOS WEB
    // ============================================================
    const exportPedidosBtn = document.getElementById('export-pedidos-btn');
    if (exportPedidosBtn) {
        exportPedidosBtn.addEventListener('click', async () => {
            try {
                const btn = exportPedidosBtn;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
                btn.disabled = true;
                await loadExternalLib('xlsx');

                const pedidosSnapshot = await getDocs(query(collection(db, 'pedidos'), orderBy('createdAt', 'desc')));
                const data = [];

                pedidosSnapshot.forEach(doc => {
                    const pedido = doc.data();
                    const productosStr = pedido.items ?
                        pedido.items.map(p => `${p.nombre} x${p.cantidad}`).join(', ') : '';

                    data.push({
                        'Fecha': formatDate(pedido.createdAt),
                        'Cliente': pedido.cliente?.nombre || '',
                        'Celular': pedido.cliente?.celular || '',
                        'Dirección': pedido.cliente?.direccion || '',
                        'Productos': productosStr,
                        'Total': pedido.total || 0,
                        'Estado': pedido.estado || '',
                        'Método Pago': pedido.metodoPago || ''
                    });
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, 'Pedidos Web');
                XLSX.writeFile(wb, generateFileName('PedidosWeb_MishellBoutique'));

                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast(`✅ Pedidos exportados: ${data.length}`, 'success');
            } catch (error) {
                console.error('Error exportando pedidos:', error);
                exportPedidosBtn.innerHTML = '<i class="bi bi-download me-2"></i>Descargar';
                exportPedidosBtn.disabled = false;
                showToast('Error al exportar pedidos', 'error');
            }
        });
    }

    // ============================================================
    // 7. BACKUP COMPLETO
    // ============================================================
    const exportBackupBtn = document.getElementById('export-backup-completo-btn');
    const backupSpinner = document.getElementById('backup-spinner');
    const backupStatus = document.getElementById('backup-status');

    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', async () => {
            try {
                const btn = exportBackupBtn;
                btn.disabled = true;
                backupSpinner?.classList.remove('d-none');
                await loadExternalLib('xlsx');

                const wb = XLSX.utils.book_new();

                // 1. Productos
                if (backupStatus) backupStatus.textContent = 'Exportando productos...';
                const productosSnapshot = await getDocs(collection(db, 'productos'));
                const categoriasSnapshot = await getDocs(collection(db, 'categorias'));
                const categoriasMap = new Map();
                categoriasSnapshot.forEach(doc => {
                    categoriasMap.set(doc.id, doc.data().nombre);
                });

                const productosData = [];
                productosSnapshot.forEach(doc => {
                    const producto = doc.data();
                    const categoria = categoriasMap.get(producto.categoriaId) || 'Sin categoría';

                    if (producto.variaciones && producto.variaciones.length > 0) {
                        producto.variaciones.forEach(variacion => {
                            productosData.push({
                                'Código': producto.codigo || '',
                                'Nombre': producto.nombre || '',
                                'Categoría': categoria,
                                'Talla': variacion.talla || '',
                                'Color': variacion.color || '',
                                'Stock': variacion.stock || 0,
                                'Costo': producto.costoCompra || 0,
                                'Precio Detal': producto.precioDetal || 0,
                                'Precio Mayor': producto.precioMayor || 0
                            });
                        });
                    }
                });
                const wsProductos = XLSX.utils.json_to_sheet(productosData);
                XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos');

                // 2. Clientes
                if (backupStatus) backupStatus.textContent = 'Exportando clientes...';
                const clientesSnapshot = await getDocs(collection(db, 'clientes'));
                const clientesData = [];
                clientesSnapshot.forEach(doc => {
                    const cliente = doc.data();
                    clientesData.push({
                        'Cédula': cliente.cedula || '',
                        'Nombre': cliente.nombre || '',
                        'Celular': cliente.celular || '',
                        'Dirección': cliente.direccion || ''
                    });
                });
                const wsClientes = XLSX.utils.json_to_sheet(clientesData);
                XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes');

                // 3. Ventas
                if (backupStatus) backupStatus.textContent = 'Exportando ventas...';
                const ventasSnapshot = await getDocs(collection(db, 'ventas'));
                const ventasData = [];
                ventasSnapshot.forEach(doc => {
                    const venta = doc.data();
                    ventasData.push({
                        'Fecha': formatDate(venta.fecha),
                        'Cliente': venta.clienteNombre || '',
                        'Total': venta.total || 0,
                        'Método Pago': venta.metodoPago || ''
                    });
                });
                const wsVentas = XLSX.utils.json_to_sheet(ventasData);
                XLSX.utils.book_append_sheet(wb, wsVentas, 'Ventas');

                // 4. Finanzas
                if (backupStatus) backupStatus.textContent = 'Exportando finanzas...';
                const finanzasSnapshot = await getDocs(collection(db, 'finanzas'));
                const finanzasData = [];
                finanzasSnapshot.forEach(doc => {
                    const registro = doc.data();
                    finanzasData.push({
                        'Fecha': formatDate(registro.fecha),
                        'Tipo': registro.tipo || '',
                        'Monto': registro.monto || 0,
                        'Descripción': registro.descripcion || ''
                    });
                });
                const wsFinanzas = XLSX.utils.json_to_sheet(finanzasData);
                XLSX.utils.book_append_sheet(wb, wsFinanzas, 'Finanzas');

                // 5. Apartados
                if (backupStatus) backupStatus.textContent = 'Exportando apartados...';
                const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
                const apartadosData = [];
                apartadosSnapshot.forEach(doc => {
                    const apartado = doc.data();
                    apartadosData.push({
                        'Fecha': formatDate(apartado.fecha),
                        'Cliente': apartado.clienteNombre || '',
                        'Total': apartado.total || 0,
                        'Abono': apartado.abono || 0,
                        'Saldo': apartado.saldo || 0,
                        'Estado': apartado.estado || ''
                    });
                });
                const wsApartados = XLSX.utils.json_to_sheet(apartadosData);
                XLSX.utils.book_append_sheet(wb, wsApartados, 'Apartados');

                // 6. Categorías
                if (backupStatus) backupStatus.textContent = 'Exportando categorías...';
                const categoriasData = [];
                categoriasSnapshot.forEach(doc => {
                    categoriasData.push({
                        'Nombre': doc.data().nombre || ''
                    });
                });
                const wsCategorias = XLSX.utils.json_to_sheet(categoriasData);
                XLSX.utils.book_append_sheet(wb, wsCategorias, 'Categorías');

                // 7. Proveedores
                if (backupStatus) backupStatus.textContent = 'Exportando proveedores...';
                const proveedoresSnapshot = await getDocs(collection(db, 'proveedores'));
                const proveedoresData = [];
                proveedoresSnapshot.forEach(doc => {
                    const proveedor = doc.data();
                    proveedoresData.push({
                        'Nombre': proveedor.nombre || '',
                        'Contacto': proveedor.contacto || '',
                        'Teléfono': proveedor.telefono || ''
                    });
                });
                const wsProveedores = XLSX.utils.json_to_sheet(proveedoresData);
                XLSX.utils.book_append_sheet(wb, wsProveedores, 'Proveedores');

                // 8. Pedidos Web
                if (backupStatus) backupStatus.textContent = 'Exportando pedidos web...';
                const pedidosSnapshot = await getDocs(collection(db, 'pedidos'));
                const pedidosData = [];
                pedidosSnapshot.forEach(doc => {
                    const pedido = doc.data();
                    pedidosData.push({
                        'Fecha': formatDate(pedido.createdAt),
                        'Cliente': pedido.cliente?.nombre || '',
                        'Total': pedido.total || 0,
                        'Estado': pedido.estado || ''
                    });
                });
                const wsPedidos = XLSX.utils.json_to_sheet(pedidosData);
                XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos Web');

                // Descargar
                if (backupStatus) backupStatus.textContent = 'Generando archivo...';
                XLSX.writeFile(wb, generateFileName('BackupCompleto_MishellBoutique'));

                backupSpinner?.classList.add('d-none');
                if (backupStatus) backupStatus.textContent = '✅ Backup completado';
                btn.disabled = false;

                setTimeout(() => {
                    if (backupStatus) backupStatus.textContent = '';
                }, 3000);

                showToast('✅ Backup completo descargado exitosamente', 'success');
            } catch (error) {
                console.error('Error en backup completo:', error);
                backupSpinner?.classList.add('d-none');
                if (backupStatus) backupStatus.textContent = '❌ Error';
                exportBackupBtn.disabled = false;
                showToast('Error al generar backup completo', 'error');
            }
        });
    }

    // ============================================================
    // 8. ACTUALIZAR CONTADORES
    // ============================================================
    async function actualizarContadores() {
        try {
            // Productos
            const productosSnapshot = await getDocs(collection(db, 'productos'));
            let totalProductos = 0;
            productosSnapshot.forEach(doc => {
                const producto = doc.data();
                if (producto.variaciones && producto.variaciones.length > 0) {
                    totalProductos += producto.variaciones.length;
                } else {
                    totalProductos += 1;
                }
            });
            const inventarioCount = document.getElementById('export-inventario-count');
            if (inventarioCount) inventarioCount.textContent = `${totalProductos} productos`;

            // Clientes
            const clientesSnapshot = await getDocs(collection(db, 'clientes'));
            const clientesCount = document.getElementById('export-clientes-count');
            if (clientesCount) clientesCount.textContent = `${clientesSnapshot.size} clientes`;

            // Ventas
            const ventasSnapshot = await getDocs(collection(db, 'ventas'));
            const ventasCount = document.getElementById('export-ventas-count');
            if (ventasCount) ventasCount.textContent = `${ventasSnapshot.size} ventas`;

            // Finanzas
            const finanzasSnapshot = await getDocs(collection(db, 'finanzas'));
            const finanzasCount = document.getElementById('export-finanzas-count');
            if (finanzasCount) finanzasCount.textContent = `${finanzasSnapshot.size} registros`;

            // Apartados
            const apartadosSnapshot = await getDocs(collection(db, 'apartados'));
            const apartadosCount = document.getElementById('export-apartados-count');
            if (apartadosCount) apartadosCount.textContent = `${apartadosSnapshot.size} apartados`;

            // Pedidos
            const pedidosSnapshot = await getDocs(collection(db, 'pedidos'));
            const pedidosCount = document.getElementById('export-pedidos-count');
            if (pedidosCount) pedidosCount.textContent = `${pedidosSnapshot.size} pedidos`;

        } catch (error) {
            console.error('Error actualizando contadores de backup:', error);
        }
    }

    // Los contadores descargan colecciones completas (productos, clientes,
    // ventas, finanzas, apartados, pedidos) solo para contarlas. Antes eso
    // pasaba en cada carga del admin; ahora solo la primera vez que se entra
    // a la sección Backup.
    let contadoresCargados = false;
    alEntrarSeccion('#backup', () => {
        if (contadoresCargados) return;
        contadoresCargados = true;
        actualizarContadores();
    });

    console.log("✅ Sistema de Backup/Exportación inicializado");

}
