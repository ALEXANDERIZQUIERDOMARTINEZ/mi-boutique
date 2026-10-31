// Apartados — lista, detalle, abonos y cancelación.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que hace falta (ver
// cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers, modales) llega ahora en `ctx`.
import { Timestamp, addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { registrarAuditoria } from "../../../auditoria.js?v=1.0.1";

export function init(ctx) {
    const { abonoApartadoModalInstance, actualizarStock, apartadosCollection, db, eliminarFormatoNumero, formatoMoneda, localProductsMap, openWhatsApp, showToast, verApartadoModalInstance } = ctx;

    // ========================================================================
    // ✅ --- SECCIÓN 4: APARTADOS COMPLETOS (REEMPLAZO) ---
    // ========================================================================
    (() => {
        const apartadosListTableBody = document.getElementById('lista-apartados');
        if (!apartadosListTableBody) { 
            console.warn("Elementos de Apartados no encontrados."); 
            return; 
        }
        
        const renderApartados = (snapshot) => { 
            apartadosListTableBody.innerHTML = ''; 
            
            if (snapshot.empty) {
                apartadosListTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay apartados pendientes.</td></tr>';
                return;
            } 
            
            snapshot.forEach(docSnap => {
                const ap = docSnap.data();
                const id = docSnap.id;
                const tr = document.createElement('tr');
                tr.dataset.id = id;

                const vence = ap.fechaVencimiento?.toDate ?
                    ap.fechaVencimiento.toDate().toLocaleDateString('es-CO') : 'N/A';

                const hoy = new Date();
                const fechaVenc = ap.fechaVencimiento?.toDate ? ap.fechaVencimiento.toDate() : null;
                let diasRestantes = 0;
                let vencimientoClass = '';

                if (fechaVenc) {
                    diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
                    if (diasRestantes < 0) {
                        vencimientoClass = 'text-danger fw-bold';
                    } else if (diasRestantes <= 7) {
                        vencimientoClass = 'text-warning fw-bold';
                    }
                }

                const saldo = ap.saldo || 0;
                const porcentajePagado = ap.total > 0 ? ((ap.abonado / ap.total) * 100).toFixed(0) : 0;

                // Construir columna de productos con información completa
                let productosHtml = '';
                if (ap.items && ap.items.length > 0) {
                    const productosDetalles = ap.items.map(item => {
                        const product = localProductsMap.get(item.productoId);
                        if (!product) return '';

                        const imagenUrl = product.imagenUrl || product.imageUrl || 'https://placehold.co/40x40/f0f0f0/cccccc?text=?';
                        const nombre = product.nombre || item.nombre || 'Producto';

                        // Resolver categoría desde categoriesMap
                        let categoria = 'Sin categoría';
                        if (typeof categoriesMap !== 'undefined' && categoriesMap instanceof Map && product.categoriaId) {
                            categoria = categoriesMap.get(product.categoriaId) || 'Sin categoría';
                        }

                        const variacion = item.talla && item.color ? `${item.talla} - ${item.color}` : 'N/A';

                        // El campo correcto es 'precio', no 'precioUnitario'
                        const precioNum = parseFloat(item.precio) || 0;
                        const precio = precioNum > 0 ? formatoMoneda.format(precioNum) : '$0';

                        const cantidad = item.cantidad || 0;

                        return `
                            <div class="d-flex gap-2 mb-2 align-items-start" style="font-size: 0.85rem;">
                                <img src="${imagenUrl}" alt="${nombre}"
                                    style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;">
                                <div class="flex-grow-1" style="min-width:0;">
                                    <div class="fw-semibold text-truncate" style="max-width:200px;" title="${nombre}">${nombre}</div>
                                    <small class="text-muted d-block"><i class="bi bi-tag-fill me-1"></i>${categoria}</small>
                                    <small class="text-muted d-block">${variacion} | x${cantidad}</small>
                                    <small class="fw-bold text-primary">${precio} c/u</small>
                                </div>
                            </div>
                        `;
                    }).filter(html => html !== '').join('');

                    productosHtml = productosDetalles || '<small class="text-muted">Sin detalles</small>';
                } else {
                    productosHtml = '<small class="text-muted">Sin productos</small>';
                }

                tr.innerHTML = `
                    <td>
                        ${ap.clienteNombre || '?'}
                        <small class="d-block text-muted">${porcentajePagado}% pagado</small>
                    </td>
                    <td>${productosHtml}</td>
                    <td>${formatoMoneda.format(ap.total || 0)}</td>
                    <td class="text-success">${formatoMoneda.format(ap.abonado || 0)}</td>
                    <td class="text-danger fw-bold">${formatoMoneda.format(saldo)}</td>
                    <td class="${vencimientoClass}">
                        ${vence}
                        ${diasRestantes > 0 ? `<small class="d-block">(${diasRestantes} días)</small>` : ''}
                        ${diasRestantes < 0 ? '<small class="d-block">(VENCIDO)</small>' : ''}
                    </td>
                    <td class="action-buttons">
                        <button class="btn btn-action btn-action-view btn-ver-apartado" data-apartado-id="${id}">
                            <i class="bi bi-eye"></i><span class="btn-action-text">Ver</span>
                        </button>
                        <button class="btn btn-action btn-action-info btn-informar-apartado" data-apartado-id="${id}">
                            <i class="bi bi-whatsapp"></i><span class="btn-action-text">Informar</span>
                        </button>
                        <button class="btn btn-action btn-action-primary btn-abono-apartado" data-apartado-id="${id}">
                            <i class="bi bi-cash-coin"></i><span class="btn-action-text">Abonar</span>
                        </button>
                        <button class="btn btn-action btn-action-success btn-completar-apartado" data-apartado-id="${id}" ${saldo > 0 ? 'disabled' : ''}>
                            <i class="bi bi-check-circle"></i><span class="btn-action-text">Completar</span>
                        </button>
                        <button class="btn btn-action btn-action-danger btn-cancel-apartado" data-apartado-id="${id}">
                            <i class="bi bi-x-circle"></i><span class="btn-action-text">Cancelar</span>
                        </button>
                    </td>
                `;
                apartadosListTableBody.appendChild(tr);
            }); 
        };
        
        // Solo los apartados pendientes (filtro de igualdad simple, no
        // necesita índice compuesto) — antes se descargaba la colección
        // entera, incluidos todos los apartados ya completados o
        // cancelados, solo para descartarlos en memoria. El orden se sigue
        // haciendo en memoria.
        onSnapshot(query(apartadosCollection, where('estado', '==', 'Pendiente')), (snapshot) => {
            // Filtrar y ordenar en memoria
            const apartadosPendientes = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.estado === 'Pendiente') {
                    apartadosPendientes.push({ id: doc.id, ...data });
                }
            });

            // Ordenar por fecha de vencimiento
            apartadosPendientes.sort((a, b) => {
                const fechaA = a.fechaVencimiento?.toDate?.() || new Date(0);
                const fechaB = b.fechaVencimiento?.toDate?.() || new Date(0);
                return fechaA - fechaB;
            });

            // Crear snapshot simulado para renderApartados
            const mockSnapshot = {
                empty: apartadosPendientes.length === 0,
                forEach: (callback) => {
                    apartadosPendientes.forEach(apt => {
                        callback({
                            id: apt.id,
                            data: () => apt
                        });
                    });
                }
            };

            renderApartados(mockSnapshot);
        }, e => {
            console.error("Error apartados:", e);
            if (apartadosListTableBody) {
                apartadosListTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar.</td></tr>';
            }
        });
        
        // EVENTOS
        if (apartadosListTableBody) {
            apartadosListTableBody.addEventListener('click', async (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const apartadoId = target.dataset.apartadoId;
                if (!apartadoId) return;

                e.preventDefault();

                if (target.classList.contains('btn-ver-apartado')) {
                    await abrirModalVerApartado(apartadoId);
                } else if (target.classList.contains('btn-informar-apartado')) {
                    await informarApartadoWhatsApp(apartadoId);
                } else if (target.classList.contains('btn-abono-apartado')) {
                    await abrirModalAbono(apartadoId);
                } else if (target.classList.contains('btn-completar-apartado')) {
                    await completarApartado(apartadoId);
                } else if (target.classList.contains('btn-cancel-apartado')) {
                    console.log('🗑️ Cancelando apartado:', apartadoId);
                    await cancelarApartado(apartadoId);
                }
            });
        }

        // ✅ FUNCIÓN: INFORMAR VÍA WHATSAPP (VERSIÓN ROBUSTA)
        async function informarApartadoWhatsApp(apartadoId) {
            console.log('📱 [WhatsApp] Iniciando función informar, apartadoId:', apartadoId);

            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);

            if (!apartadoSnap.exists()) {
                console.error('❌ [WhatsApp] Apartado no encontrado:', apartadoId);
                showToast('Apartado no encontrado', 'error');
                return;
            }

            const apartadoData = apartadoSnap.data();
            console.log('📦 [WhatsApp] Datos del apartado completos:', JSON.stringify(apartadoData, null, 2));

            const saldo = apartadoData.saldo || 0;
            const porcentajePagado = apartadoData.total > 0 ? ((apartadoData.abonado / apartadoData.total) * 100).toFixed(0) : 0;

            // Calcular días restantes
            const hoy = new Date();
            const fechaVenc = apartadoData.fechaVencimiento?.toDate ? apartadoData.fechaVencimiento.toDate() : null;
            let diasRestantes = 0;
            let mensajeVencimiento = '';

            if (fechaVenc) {
                diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
                if (diasRestantes < 0) {
                    mensajeVencimiento = `⚠️ *VENCIDO* hace ${Math.abs(diasRestantes)} días`;
                } else if (diasRestantes === 0) {
                    mensajeVencimiento = `⚠️ *Vence HOY*`;
                } else if (diasRestantes <= 7) {
                    mensajeVencimiento = `⏰ Vence en ${diasRestantes} días`;
                } else {
                    mensajeVencimiento = `📅 Vence: ${fechaVenc.toLocaleDateString('es-CO')}`;
                }
            }

            // ✅ ESTRATEGIA ROBUSTA DE BÚSQUEDA DE CELULAR
            let whatsapp = '';

            console.log('🔍 [WhatsApp] === INICIO BÚSQUEDA DE CELULAR ===');

            // INTENTO 1: Buscar en la venta asociada (PRIMERO, porque es más confiable)
            if (apartadoData.ventaId) {
                console.log('🔗 [WhatsApp] Intento 1: Buscando en venta asociada:', apartadoData.ventaId);
                try {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();
                        console.log('📄 [WhatsApp] Venta encontrada:', JSON.stringify(ventaData, null, 2));

                        if (ventaData.clienteCelular) {
                            whatsapp = ventaData.clienteCelular;
                            console.log('✅ [WhatsApp] Celular encontrado en venta:', whatsapp);
                        } else {
                            console.warn('⚠️ [WhatsApp] Venta no tiene campo clienteCelular');
                        }
                    } else {
                        console.warn('⚠️ [WhatsApp] Venta no existe en Firebase');
                    }
                } catch (error) {
                    console.error('❌ [WhatsApp] Error al buscar venta:', error);
                }
            } else {
                console.warn('⚠️ [WhatsApp] Apartado no tiene ventaId');
            }

            // INTENTO 2: Buscar directamente en el apartado (apartados nuevos)
            if (!whatsapp && apartadoData.clienteCelular) {
                console.log('🔗 [WhatsApp] Intento 2: Celular encontrado en apartado');
                whatsapp = apartadoData.clienteCelular;
                console.log('✅ [WhatsApp] Usando celular del apartado:', whatsapp);
            }

            // INTENTO 3: Buscar en colección de clientes por nombre
            if (!whatsapp && apartadoData.clienteNombre) {
                console.log('🔗 [WhatsApp] Intento 3: Buscando cliente por nombre:', apartadoData.clienteNombre);
                try {
                    const clientesRef = collection(db, 'clientes');
                    const clientesQuery = query(clientesRef, where('nombre', '==', apartadoData.clienteNombre));
                    const clientesSnap = await getDocs(clientesQuery);

                    if (!clientesSnap.empty) {
                        const clienteData = clientesSnap.docs[0].data();
                        console.log('👤 [WhatsApp] Cliente encontrado:', JSON.stringify(clienteData, null, 2));

                        if (clienteData.celular) {
                            whatsapp = clienteData.celular;
                            console.log('✅ [WhatsApp] Celular encontrado en cliente:', whatsapp);
                        }
                    } else {
                        console.warn('⚠️ [WhatsApp] No se encontró cliente con nombre:', apartadoData.clienteNombre);
                    }
                } catch (error) {
                    console.error('❌ [WhatsApp] Error al buscar cliente:', error);
                }
            }

            console.log('🔍 [WhatsApp] === FIN BÚSQUEDA DE CELULAR ===');
            console.log('📞 [WhatsApp] Número final obtenido:', whatsapp || 'NO ENCONTRADO');

            if (!whatsapp) {
                console.error('❌ [WhatsApp] FALLO TOTAL: No se pudo obtener número de ninguna fuente');
                showToast('❌ No se encontró número de WhatsApp. Verifica que el cliente tenga celular registrado.', 'error');
                return;
            }

            // Limpiar número de WhatsApp (quitar espacios, guiones, etc)
            let whatsappLimpio = whatsapp.replace(/\D/g, '');
            console.log('🧹 [WhatsApp] Número limpio (sin caracteres):', whatsappLimpio);

            // Validar que el número tenga al menos 10 dígitos
            if (whatsappLimpio.length < 10) {
                console.error('❌ [WhatsApp] Número muy corto:', whatsappLimpio);
                showToast('El número de WhatsApp es inválido (muy corto)', 'error');
                return;
            }

            // Si el número comienza con 57 (código de Colombia), quitarlo para evitar duplicación
            if (whatsappLimpio.startsWith('57')) {
                whatsappLimpio = whatsappLimpio.substring(2);
                console.log('✂️ [WhatsApp] Prefijo 57 eliminado. Nuevo número:', whatsappLimpio);
            }

            // Validar que después de quitar el prefijo tenga 10 dígitos (formato colombiano)
            if (whatsappLimpio.length !== 10) {
                console.error('❌ [WhatsApp] Número no tiene 10 dígitos:', whatsappLimpio);
                showToast('El número de WhatsApp no tiene un formato válido (debe tener 10 dígitos)', 'error');
                return;
            }

            // Crear mensaje
            const mensaje = `Hola *${apartadoData.clienteNombre}*! 👋

Te escribo de *MISHELL'ES BOUTIQUE* para recordarte sobre tu apartado:

📦 *Productos:* ${apartadoData.items?.length || 0} item(s)
💰 *Total:* ${formatoMoneda.format(apartadoData.total || 0)}
✅ *Abonado:* ${formatoMoneda.format(apartadoData.abonado || 0)} (${porcentajePagado}%)
⚠️ *Saldo pendiente:* ${formatoMoneda.format(saldo)}

${mensajeVencimiento}

${saldo > 0 ? '¿Cuándo podrías realizar el siguiente abono? 😊' : '🎉 ¡Tu apartado está completamente pagado! Puedes pasar a recogerlo cuando gustes.'}

¡Quedamos atentos! 💕`;

            // Codificar mensaje para URL
            const mensajeCodificado = encodeURIComponent(mensaje);

            // Abrir WhatsApp
            const whatsappUrl = `https://wa.me/57${whatsappLimpio}?text=${mensajeCodificado}`;
            console.log('🌐 [WhatsApp] URL final:', whatsappUrl);
            console.log('🚀 [WhatsApp] Abriendo WhatsApp...');

            openWhatsApp(whatsappUrl);
            showToast('Abriendo WhatsApp...', 'success');
        }

        // ✅ FUNCIÓN: ABRIR MODAL DE VER APARTADO (con historial de pagos)
        async function abrirModalVerApartado(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);

            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }

            const apartadoData = apartadoSnap.data();
            const saldo = apartadoData.saldo || 0;

            // Poblar información general
            document.getElementById('detalle-cliente-nombre').textContent = apartadoData.clienteNombre || 'N/A';
            document.getElementById('detalle-total').textContent = formatoMoneda.format(apartadoData.total || 0);
            document.getElementById('detalle-abonado').textContent = formatoMoneda.format(apartadoData.abonado || 0);
            document.getElementById('detalle-saldo').textContent = formatoMoneda.format(saldo);

            // Estado con badge
            const estadoEl = document.getElementById('detalle-estado');
            estadoEl.textContent = apartadoData.estado || 'Pendiente';
            estadoEl.className = 'badge';
            if (apartadoData.estado === 'Completado') {
                estadoEl.classList.add('bg-success');
            } else if (apartadoData.estado === 'Cancelado') {
                estadoEl.classList.add('bg-danger');
            } else {
                estadoEl.classList.add('bg-warning', 'text-dark');
            }

            // Fecha de vencimiento
            const vencimientoDate = apartadoData.fechaVencimiento?.toDate();
            document.getElementById('detalle-vencimiento').textContent = vencimientoDate
                ? vencimientoDate.toLocaleDateString('es-CO')
                : 'N/A';

            // Poblar historial de pagos
            const historialBody = document.getElementById('detalle-historial-pagos');
            historialBody.innerHTML = '';

            const abonos = apartadoData.abonos || [];
            if (abonos.length === 0) {
                historialBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay pagos registrados</td></tr>';
            } else {
                abonos.forEach(abono => {
                    const tr = document.createElement('tr');
                    const fechaAbono = abono.fecha?.toDate ? abono.fecha.toDate().toLocaleDateString('es-CO') : 'N/A';
                    tr.innerHTML = `
                        <td>${fechaAbono}</td>
                        <td class="fw-bold text-success">${formatoMoneda.format(abono.monto || 0)}</td>
                        <td><span class="badge ${abono.metodoPago === 'Efectivo' ? 'bg-success' : 'bg-primary'}">${abono.metodoPago || 'N/A'}</span></td>
                        <td>${abono.observaciones || '-'}</td>
                    `;
                    historialBody.appendChild(tr);
                });
            }

            if (verApartadoModalInstance) {
                verApartadoModalInstance.show();
            }
        }

        // FUNCIÓN: ABRIR MODAL DE ABONO
        async function abrirModalAbono(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);
            
            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }
            
            const apartadoData = apartadoSnap.data();
            const saldo = apartadoData.saldo || 0;
            
            document.getElementById('abono-apartado-id').value = apartadoId;
            document.getElementById('abono-saldo-actual').value = saldo;
            document.getElementById('abono-cliente-nombre').textContent = apartadoData.clienteNombre || 'N/A';
            document.getElementById('abono-total').textContent = formatoMoneda.format(apartadoData.total || 0);
            document.getElementById('abono-abonado').textContent = formatoMoneda.format(apartadoData.abonado || 0);
            document.getElementById('abono-saldo').textContent = formatoMoneda.format(saldo);
            
            const abonoMontoEl = document.getElementById('abono-monto');
            const abonoHelperEl = document.getElementById('abono-helper');
            abonoMontoEl.value = '';
            abonoMontoEl.setAttribute('max', saldo);
            document.getElementById('abono-metodo-pago').value = 'Efectivo';
            document.getElementById('abono-observaciones').value = '';
            abonoHelperEl.textContent = `Máximo: ${formatoMoneda.format(saldo)}`;
            abonoHelperEl.classList.remove('text-danger', 'text-success');

            
            if (abonoApartadoModalInstance) {
                abonoApartadoModalInstance.show();
            }
        }
        
        // FUNCIÓN: COMPLETAR APARTADO
        async function completarApartado(apartadoId) {
            const apartadoRef = doc(db, 'apartados', apartadoId);
            const apartadoSnap = await getDoc(apartadoRef);
            
            if (!apartadoSnap.exists()) {
                showToast('Apartado no encontrado', 'error');
                return;
            }
            
            const apartadoData = apartadoSnap.data();
            
            if (apartadoData.saldo > 0) {
                showToast('El apartado aún tiene saldo pendiente', 'warning');
                return;
            }
            
            if (!confirm('¿Confirmas que este apartado está completamente pagado?')) {
                return;
            }
            
            try {
                await updateDoc(apartadoRef, {
                    estado: 'Completado',
                    fechaCompletado: serverTimestamp()
                });
                
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    await updateDoc(ventaRef, {
                        estado: 'Completada'
                    });
                }
                
                showToast('¡Apartado completado exitosamente!', 'success');
                
            } catch (error) {
                console.error('Error al completar apartado:', error);
                showToast('Error al completar el apartado', 'error');
            }
        }
        
        // FUNCIÓN: CANCELAR APARTADO
        async function cancelarApartado(apartadoId) {
            console.log('📋 Iniciando cancelación de apartado:', apartadoId);

            if (!confirm('¿Estás seguro de cancelar este apartado?\n\nEsta acción devolverá el stock de los productos.')) {
                console.log('❌ Cancelación abortada por el usuario');
                return;
            }

            try {
                const apartadoRef = doc(db, 'apartados', apartadoId);
                const apartadoSnap = await getDoc(apartadoRef);

                if (!apartadoSnap.exists()) {
                    console.error('❌ Apartado no encontrado:', apartadoId);
                    showToast('Apartado no encontrado', 'error');
                    return;
                }

                const apartadoData = apartadoSnap.data();
                console.log('📦 Datos del apartado:', apartadoData);

                if (apartadoData.ventaId) {
                    console.log('🔗 Procesando venta asociada:', apartadoData.ventaId);
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        const ventaData = ventaSnap.data();

                        // Solo devolver stock si la venta no estaba ya cancelada
                        if (ventaData.estado !== 'Cancelada' && ventaData.estado !== 'Anulada') {
                            console.log('📦 Devolviendo stock...');
                            await actualizarStock(ventaData.items, 'sumar');
                        } else {
                            console.log('⚠️ Venta ya estaba cancelada, no se devuelve stock');
                        }

                        await updateDoc(ventaRef, {
                            estado: 'Cancelada'
                        });
                        console.log('✅ Venta marcada como cancelada');
                    }
                }

                await updateDoc(apartadoRef, {
                    estado: 'Cancelado',
                    fechaCancelacion: serverTimestamp()
                });
                console.log('✅ Apartado marcado como cancelado');

                showToast('Apartado cancelado y stock devuelto', 'info');

            } catch (error) {
                console.error('❌ Error al cancelar apartado:', error);
                showToast('Error al cancelar el apartado: ' + error.message, 'error');
            }
        }
    })();

    // ✅ LISTENER PARA FORMULARIO DE ABONO (MEJORADO)
    const formAbonoApartado = document.getElementById('form-abono-apartado');
    if (formAbonoApartado) {
        formAbonoApartado.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("📝 Iniciando registro de abono...");

            const apartadoId = document.getElementById('abono-apartado-id').value;
            const monto = parseFloat(eliminarFormatoNumero(document.getElementById('abono-monto').value));
            const saldoActual = parseFloat(document.getElementById('abono-saldo-actual').value);
            const metodoPago = document.getElementById('abono-metodo-pago').value;
            const observaciones = document.getElementById('abono-observaciones').value.trim();

            console.log("Datos del abono:", { apartadoId, monto, saldoActual, metodoPago, observaciones });

            // Validaciones
            if (!apartadoId) {
                showToast('Error: ID de apartado no encontrado', 'error');
                return;
            }

            if (isNaN(monto) || monto <= 0) {
                showToast('El monto debe ser mayor a cero', 'error');
                return;
            }

            if (monto > saldoActual) {
                showToast(`El abono (${formatoMoneda.format(monto)}) no puede ser mayor al saldo (${formatoMoneda.format(saldoActual)})`, 'warning');
                return;
            }

            try {
                // ✅ PASO 1: Obtener apartado actual
                const apartadoRef = doc(db, 'apartados', apartadoId);
                const apartadoSnap = await getDoc(apartadoRef);

                if (!apartadoSnap.exists()) {
                    showToast('Apartado no encontrado en la base de datos', 'error');
                    console.error("❌ Apartado no existe:", apartadoId);
                    return;
                }

                const apartadoData = apartadoSnap.data();
                console.log("Apartado actual:", apartadoData);

                // ✅ PASO 2: Calcular nuevos valores
                const nuevoAbonado = (apartadoData.abonado || 0) + monto;
                const nuevoSaldo = apartadoData.total - nuevoAbonado;

                console.log("Cálculos:", {
                    abonado_anterior: apartadoData.abonado,
                    monto_abono: monto,
                    nuevo_abonado: nuevoAbonado,
                    total: apartadoData.total,
                    nuevo_saldo: nuevoSaldo
                });

                // ✅ PASO 3: Agregar abono al historial
                // Convertir abonos existentes para asegurar que usen Timestamp
                const abonosExistentes = apartadoData.abonos || [];
                const abonosConvertidos = abonosExistentes.map(abono => {
                    // Si la fecha es un Timestamp, mantenerlo; si no, convertirlo
                    const fecha = abono.fecha?.toDate ? abono.fecha : (abono.fecha ? Timestamp.fromDate(new Date(abono.fecha)) : Timestamp.fromDate(new Date()));
                    return {
                        ...abono,
                        fecha: fecha
                    };
                });

                const nuevoAbono = {
                    fecha: Timestamp.fromDate(new Date()),
                    monto: monto,
                    metodoPago: metodoPago,
                    observaciones: observaciones || 'Sin observaciones'
                };
                abonosConvertidos.push(nuevoAbono);

                // ✅ PASO 4: Actualizar apartado
                await updateDoc(apartadoRef, {
                    abonado: nuevoAbonado,
                    saldo: nuevoSaldo,
                    abonos: abonosConvertidos,
                    estado: nuevoSaldo <= 0 ? 'Completado' : 'Pendiente',
                    ultimaModificacion: serverTimestamp()
                });
                console.log("✅ Apartado actualizado correctamente");

                // ✅ PASO 4.5: Crear NUEVA VENTA con el abono (como si fuera otra venta)
                let ventaAbonoRegistrada = null; // { ventaId, ventaData } — para ofrecer factura después
                try {
                    // Obtener datos de la venta original para copiar información del cliente
                    let clienteNombre = apartadoData.clienteNombre || 'Cliente General';
                    let clienteDireccion = '';
                    let clienteCelular = apartadoData.clienteCelular || '';

                    if (apartadoData.ventaId) {
                        const ventaOriginalSnap = await getDoc(doc(db, 'ventas', apartadoData.ventaId));
                        if (ventaOriginalSnap.exists()) {
                            const ventaOriginal = ventaOriginalSnap.data();
                            clienteNombre = ventaOriginal.clienteNombre || clienteNombre;
                            clienteDireccion = ventaOriginal.clienteDireccion || '';
                            clienteCelular = ventaOriginal.clienteCelular || clienteCelular;
                        }
                    }

                    // Crear la nueva venta con el monto del abono
                    const nuevaVentaData = {
                        clienteNombre: clienteNombre,
                        clienteDireccion: clienteDireccion,
                        clienteCelular: clienteCelular,
                        tipoVenta: 'detal', // Es una venta normal, ya no es apartado
                        tipoEntrega: 'tienda',
                        pedidoWhatsapp: false,
                        repartidorId: null,
                        repartidorNombre: null,
                        costoRuta: 0,
                        rutaPagadaTransferencia: false,
                        items: apartadoData.items || [], // Los mismos items del apartado
                        observaciones: `Abono de apartado. ${observaciones || 'Pago restante del apartado.'}`,
                        descuento: 0,
                        descuentoTipo: 'monto',
                        pagoEfectivo: metodoPago === 'Efectivo' ? monto : 0,
                        pagoTransferencia: metodoPago === 'Transferencia' ? monto : 0,
                        totalVenta: monto, // El total es el monto del abono
                        montoTotalProducto: null, // No es apartado, no necesita este campo
                        estado: 'Completada',
                        esCatalogoExterno: false,
                        esAbonoApartado: true, // Flag para identificar que es un abono
                        apartadoIdRelacionado: apartadoId, // Referencia al apartado
                        timestamp: serverTimestamp()
                    };

                    const nuevaVentaRef = await addDoc(collection(db, 'ventas'), nuevaVentaData);
                    console.log("✅ Nueva venta creada con el abono. ID:", nuevaVentaRef.id);
                    console.log("💰 Monto de la venta:", formatoMoneda.format(monto));
                    ventaAbonoRegistrada = { ventaId: nuevaVentaRef.id, ventaData: nuevaVentaData };

                    registrarAuditoria({
                        accion: 'crear',
                        modulo: 'venta',
                        entidadId: nuevaVentaRef.id,
                        entidadNombre: `Venta de ${clienteNombre}`,
                        descripcion: `Registró un abono de apartado como venta para "${clienteNombre}" por ${formatoMoneda.format(monto)}`,
                        detalles: { esAbonoApartado: true, apartadoId, monto }
                    });

                } catch (ventaErr) {
                    console.error("❌ Error al crear venta con el abono:", ventaErr);
                    showToast("Error al registrar la venta del abono. El apartado se actualizó correctamente.", 'warning');
                }

                // ✅ PASO 5: Actualizar venta original asociada (solo el estado, NO los montos)
                if (apartadoData.ventaId) {
                    const ventaRef = doc(db, 'ventas', apartadoData.ventaId);
                    const ventaSnap = await getDoc(ventaRef);

                    if (ventaSnap.exists()) {
                        // Solo actualizar el estado, NO los montos de pago
                        // Los montos ya se registraron con el abono inicial
                        // Los abonos posteriores se contarán desde el historial de abonos
                        const updateVenta = {
                            estado: nuevoSaldo <= 0 ? 'Completada' : 'Pendiente'
                        };

                        await updateDoc(ventaRef, updateVenta);
                        console.log("✅ Venta actualizada correctamente (solo estado)");
                    } else {
                        console.warn("⚠️ Venta asociada no encontrada:", apartadoData.ventaId);
                    }
                }

                // ✅ PASO 6: Cerrar modal y mostrar confirmación
                if (typeof abonoApartadoModalInstance !== 'undefined' && abonoApartadoModalInstance) {
                    abonoApartadoModalInstance.hide();
                }

                if (nuevoSaldo <= 0) {
                    showToast('¡Apartado completado exitosamente! 🎉', 'success');
                } else {
                    showToast(`Abono registrado. Nuevo saldo: ${formatoMoneda.format(nuevoSaldo)}`, 'success');
                }

                // Igual que al registrar una venta nueva desde el formulario principal:
                // el abono que se acaba de guardar ya quedó en el historial de ventas
                // como su propio movimiento, así que se ofrece facturarlo ya mismo.
                // Se espera a que el modal de abono termine de ocultarse (hidden.bs.modal)
                // antes de abrir el de factura, para no dejar dos backdrops de Bootstrap
                // en transición a la vez (mismo bug ya resuelto en generarYMostrarFactura).
                // ofrecerFacturaTrasVenta vive en ventas.js (carga diferida).
                if (ventaAbonoRegistrada) await window.asegurarModuloVentas?.();
                if (ventaAbonoRegistrada && typeof window.ofrecerFacturaTrasVenta === 'function') {
                    const elAbonoModal = abonoApartadoModalInstance?._element;
                    if (elAbonoModal) {
                        elAbonoModal.addEventListener('hidden.bs.modal', () => {
                            window.ofrecerFacturaTrasVenta(ventaAbonoRegistrada.ventaId, ventaAbonoRegistrada.ventaData);
                        }, { once: true });
                    } else {
                        window.ofrecerFacturaTrasVenta(ventaAbonoRegistrada.ventaId, ventaAbonoRegistrada.ventaData);
                    }
                }

                // Limpiar formulario
                formAbonoApartado.reset();

            } catch (error) {
                console.error('❌ Error crítico al registrar abono:', error);
                showToast(`Error al registrar el abono: ${error.message}`, 'error');
            }
        });
    }

    // VALIDACIÓN EN TIEMPO REAL
    const abonoMontoInput = document.getElementById('abono-monto');
    if (abonoMontoInput) {
        abonoMontoInput.addEventListener('input', (e) => {
            const monto = parseFloat(e.target.value);
            const saldoActual = parseFloat(document.getElementById('abono-saldo-actual').value);
            const helper = document.getElementById('abono-helper');
            
            if (isNaN(monto)) {
                 helper.textContent = `Máximo: ${formatoMoneda.format(saldoActual)}`;
                 helper.classList.remove('text-danger', 'text-success');
                 return;
            }
            
            if (monto > saldoActual) {
                helper.textContent = '⚠️ El monto supera el saldo pendiente';
                helper.classList.add('text-danger');
            } else if (monto === saldoActual) {
                helper.textContent = '✓ Esto completará el apartado';
                helper.classList.remove('text-danger');
                helper.classList.add('text-success');
            } else {
                helper.textContent = `Máximo: ${formatoMoneda.format(saldoActual)}`;
                helper.classList.remove('text-danger', 'text-success');
            }
        });
    }
}
