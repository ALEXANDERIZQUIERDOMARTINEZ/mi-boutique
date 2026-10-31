// Cargue masivo Fábrica.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { WHOLESALE_TIER_GROUPS } from "../../../wholesale-tiers.js?v=2";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ========================================================================
// ✅ SECCIÓN: CARGUE MASIVO FÁBRICA — mismo asistente de 3 pasos que
// Boutique, adaptado a productosFabrica: sin precio_detal ni proveedor
// (Fábrica no tiene esos conceptos), con grupo_mayorista opcional. Escribe
// siempre en 'variaciones' (Fábrica no usa el campo plano 'stock').
// ========================================================================
export function init(ctx) {
    const { alEntrarSeccion, categoriesCollection, db, loadExternalLib, productosFabricaCollection, showToast } = ctx;

    const inputArchivo = document.getElementById('cmfab-input-archivo');
    const btnSeleccionarArchivo = document.getElementById('cmfab-btn-seleccionar-archivo');
    if (!inputArchivo || !btnSeleccionarArchivo) return;

    const historialCarguesCollection = collection(db, 'historial_cargues_fabrica');

    const btnCancelar = document.getElementById('cmfab-btn-cancelar');
    const btnProcesarDatos = document.getElementById('cmfab-btn-procesar-datos');
    const btnVolverEdicion = document.getElementById('cmfab-btn-volver-edicion');
    const btnConfirmarCarga = document.getElementById('cmfab-btn-confirmar-carga');

    const pasoSubir = document.getElementById('cmfab-paso-subir');
    const pasoVistaPrevia = document.getElementById('cmfab-paso-vista-previa');
    const pasoConfirmacion = document.getElementById('cmfab-paso-confirmacion');
    const cargueLoader = document.getElementById('cmfab-loader');

    const tbodyVistaPrevia = document.getElementById('cmfab-tbody-vista-previa');
    const nombreArchivoEl = document.getElementById('cmfab-nombre-archivo');
    const totalFilasEl = document.getElementById('cmfab-total-filas');
    const filasValidasEl = document.getElementById('cmfab-filas-validas');
    const filasErroresEl = document.getElementById('cmfab-filas-errores');

    let datosExcel = [];
    let productosAgrupados = [];
    let categoriasMap = new Map();
    let productosExistentes = [];

    // ── 1) Leer Excel ──
    async function leerExcel(archivo) {
        mostrarLoader('Leyendo archivo...', 10);
        await loadExternalLib('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
                    const datos = XLSX.utils.sheet_to_json(primeraHoja, { raw: false });

                    if (datos.length === 0) {
                        reject(new Error('El archivo está vacío'));
                        return;
                    }

                    const datosNormalizados = datos.map(fila => {
                        const filaNormalizada = {};
                        for (let key in fila) {
                            filaNormalizada[key.trim().toLowerCase()] = fila[key];
                        }
                        return filaNormalizada;
                    });

                    const columnas = Object.keys(datosNormalizados[0]);
                    const columnasObligatorias = ['nombre', 'categoria', 'precio_mayor', 'talla', 'color', 'cantidad'];
                    const columnasFaltantes = columnasObligatorias.filter(col => !columnas.includes(col));
                    if (columnasFaltantes.length > 0) {
                        reject(new Error(`Faltan columnas obligatorias: ${columnasFaltantes.join(', ')}`));
                        return;
                    }

                    actualizarProgreso(30);
                    resolve(datosNormalizados);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = function() { reject(new Error('Error al leer el archivo')); };
            reader.readAsArrayBuffer(archivo);
        });
    }

    // ── 2) Validar datos de una fila ──
    function validarDatos(fila, index) {
        const errores = [];

        if (!fila.nombre || fila.nombre.trim() === '') errores.push('Nombre vacío');
        if (!fila.categoria || fila.categoria.trim() === '') errores.push('Categoría vacía');

        const precioMayor = parseFloat(fila.precio_mayor);
        if (isNaN(precioMayor) || precioMayor < 0) errores.push('Precio mayor inválido');

        let costo = parseFloat(fila.costo);
        if (isNaN(costo) || costo < 0) costo = precioMayor * 0.5;

        const descripcion = fila.descripcion?.trim() || '';
        const codigo = fila.codigo?.trim() || '';
        const grupoMayorista = fila.grupo_mayorista?.trim() || '';

        const cantidad = parseInt(fila.cantidad);
        if (isNaN(cantidad) || cantidad <= 0) errores.push('Cantidad inválida o cero');

        return {
            index,
            nombre: fila.nombre?.trim() || '',
            descripcion,
            categoria: fila.categoria?.trim() || '',
            codigo,
            costo,
            precio_mayor: precioMayor,
            grupo_mayorista: grupoMayorista,
            talla: fila.talla?.trim() || '',
            color: fila.color?.trim() || '',
            cantidad,
            errores,
            valida: errores.length === 0
        };
    }

    // ── 3) Agrupar variaciones (clave: código si existe, si no nombre+categoría) ──
    function agruparVariaciones(datos) {
        mostrarLoader('Agrupando productos y variaciones...', 50);
        const grupos = new Map();

        datos.forEach(fila => {
            if (!fila.valida) return;

            const clave = fila.codigo
                ? `codigo_${fila.codigo.trim().toLowerCase()}`
                : `${fila.nombre.trim().toLowerCase()}_${fila.categoria.trim().toLowerCase()}`;

            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    nombre: fila.nombre.trim(),
                    descripcion: fila.descripcion.trim(),
                    categoria: fila.categoria.trim(),
                    codigo: fila.codigo || '',
                    costo: fila.costo,
                    precio_mayor: fila.precio_mayor,
                    grupo_mayorista: fila.grupo_mayorista || '',
                    variaciones: []
                });
            }

            grupos.get(clave).variaciones.push({
                talla: fila.talla?.trim() || '',
                color: fila.color?.trim() || '',
                cantidad: fila.cantidad
            });
        });

        actualizarProgreso(70);
        return Array.from(grupos.values());
    }

    // ── 4) Detectar duplicados contra el catálogo real de Fábrica ──
    async function validarDuplicadosFirestore(productos) {
        mostrarLoader('Validando duplicados en catálogo...', 80);
        try {
            if (categoriasMap.size === 0) await cargarDatosIniciales();

            const snapshot = await getDocs(query(productosFabricaCollection, where('tenantId', '==', window.expectedTenantId)));
            productosExistentes = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const categoriaNombre = categoriasMap.get(data.categoriaId)?.nombre || '';
                productosExistentes.push({
                    id: docSnap.id,
                    nombre: data.nombre?.toLowerCase().trim(),
                    categoria: categoriaNombre.toLowerCase().trim(),
                    categoriaId: data.categoriaId,
                    variaciones: data.variaciones,
                    nombreOriginal: data.nombre,
                    categoriaOriginal: categoriaNombre,
                    ...data
                });
            });

            productos.forEach(producto => {
                const nombreNorm = producto.nombre.toLowerCase().trim();
                const categoriaNorm = producto.categoria.toLowerCase().trim();
                const codigoExcel = producto.codigo?.toLowerCase().trim() || '';

                let productoEncontrado = null;

                if (codigoExcel) {
                    productoEncontrado = productosExistentes.find(existente =>
                        (existente.codigo?.toLowerCase().trim() || '') === codigoExcel);
                    if (productoEncontrado) {
                        producto.esDuplicado = true;
                        producto.productoExistenteId = productoEncontrado.id;
                        producto.productoExistente = productoEncontrado;
                        producto.accionDuplicado = 'sumar';
                        producto.encontradoPorCodigo = true;
                    }
                }

                if (!productoEncontrado) {
                    const productosMismoNombre = productosExistentes.filter(existente => existente.nombre === nombreNorm);

                    if (productosMismoNombre.length > 0) {
                        const matchExacto = productosMismoNombre.find(existente => existente.categoria === categoriaNorm);

                        if (matchExacto) {
                            producto.esDuplicado = true;
                            producto.productoExistenteId = matchExacto.id;
                            producto.productoExistente = matchExacto;
                            producto.accionDuplicado = 'sumar';
                        } else {
                            const primerProducto = productosMismoNombre[0];
                            producto.esDuplicado = true;
                            producto.productoExistenteId = primerProducto.id;
                            producto.productoExistente = primerProducto;
                            producto.accionDuplicado = 'sumar';
                            producto.advertenciaCategoriaProveedor = true;
                        }
                    } else {
                        producto.esDuplicado = false;
                        producto.productoExistenteId = null;
                        producto.productoExistente = null;
                        producto.accionDuplicado = null;
                    }
                }
            });

            actualizarProgreso(90);
            return productos;
        } catch (error) {
            console.error('Error al validar duplicados:', error);
            throw error;
        }
    }

    // ── 5) Guardar producto nuevo ──
    async function guardarProductoFirestore(producto) {
        const categoriaId = await buscarOCrearCategoria(producto.categoria);
        const codigo = generarCodigoProducto();

        const nuevoProducto = {
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            categoriaId,
            grupoMayorista: (producto.grupo_mayorista && WHOLESALE_TIER_GROUPS[producto.grupo_mayorista]) ? producto.grupo_mayorista : null,
            costoCompra: producto.costo,
            precioMayor: producto.precio_mayor,
            codigo,
            visible: false,
            timestamp: serverTimestamp(),
            variaciones: [],
            tenantId: window.expectedTenantId
        };

        const docRef = await addDoc(productosFabricaCollection, nuevoProducto);
        return docRef.id;
    }

    // ── 6) Guardar variaciones de un producto recién creado ──
    async function guardarVariacionesFirestore(productoId, variaciones) {
        const productoRef = doc(db, 'productosFabrica', productoId);
        const variacionesArray = variaciones.map(v => ({
            talla: v.talla || '',
            color: v.color || '',
            stock: v.cantidad || 0
        }));
        await updateDoc(productoRef, { variaciones: variacionesArray });
    }

    // ── 7) Historial del cargue ──
    async function guardarHistorial(totalProductos, totalVariaciones, totalUnidades) {
        try {
            await addDoc(historialCarguesCollection, {
                fecha: serverTimestamp(),
                totalProductos,
                totalVariaciones,
                totalUnidades,
                tenantId: window.expectedTenantId
            });
        } catch (error) {
            console.error('Error al guardar historial de cargue:', error);
        }
    }

    // ── Auxiliares ──
    async function buscarOCrearCategoria(nombreCategoria) {
        const nombreNormalizado = nombreCategoria.trim();

        for (let [id, cat] of categoriasMap) {
            if (cat.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) return id;
        }

        const snapshot = await getDocs(categoriesCollection);
        for (let docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                categoriasMap.set(docSnap.id, { id: docSnap.id, ...data });
                return docSnap.id;
            }
        }

        const docRef = await addDoc(categoriesCollection, { nombre: nombreNormalizado, nombreLower: nombreNormalizado.toLowerCase() });
        categoriasMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        return docRef.id;
    }

    function generarCodigoProducto() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 4).toUpperCase();
        return `PF${timestamp}${random}`;
    }

    function mostrarLoader(mensaje, progreso) {
        cargueLoader.style.display = 'flex';
        document.getElementById('cmfab-loader-mensaje').textContent = mensaje;
        actualizarProgreso(progreso);
    }
    function ocultarLoader() { cargueLoader.style.display = 'none'; }
    function actualizarProgreso(porcentaje) {
        document.getElementById('cmfab-loader-progreso').style.width = `${porcentaje}%`;
        document.getElementById('cmfab-loader-porcentaje').textContent = `${porcentaje}%`;
    }
    function mostrarPaso(paso) {
        pasoSubir.style.display = 'none';
        pasoVistaPrevia.style.display = 'none';
        pasoConfirmacion.style.display = 'none';
        paso.style.display = 'block';
    }

    // ── PASO 1: seleccionar archivo ──
    btnSeleccionarArchivo.addEventListener('click', () => inputArchivo.click());

    inputArchivo.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;

        try {
            nombreArchivoEl.textContent = archivo.name;
            const datos = await leerExcel(archivo);
            datosExcel = datos.map((fila, index) => validarDatos(fila, index));

            totalFilasEl.textContent = datosExcel.length;
            filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
            filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;

            renderizarTablaVistaPrevia();
            btnProcesarDatos.disabled = datosExcel.filter(f => f.valida).length === 0;

            ocultarLoader();
            mostrarPaso(pasoVistaPrevia);
        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar archivo: ' + error.message, 'error');
            console.error(error);
        }
    });

    function renderizarTablaVistaPrevia() {
        tbodyVistaPrevia.innerHTML = '';

        datosExcel.forEach((fila, index) => {
            const tr = document.createElement('tr');
            tr.className = fila.valida ? '' : 'table-danger';
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td contenteditable="true" data-index="${index}" data-field="nombre">${fila.nombre || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="descripcion">${fila.descripcion || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="categoria">${fila.categoria || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="costo">${fila.costo || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_mayor">${fila.precio_mayor || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="talla">${fila.talla || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="color">${fila.color || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="cantidad">${fila.cantidad || 0}</td>
                <td><button class="btn btn-sm btn-outline-danger" data-delete="${index}"><i class="bi bi-trash"></i></button></td>
            `;

            tr.querySelectorAll('[contenteditable]').forEach(celda => {
                celda.addEventListener('blur', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    const field = e.target.dataset.field;
                    datosExcel[idx][field] = e.target.textContent.trim();
                    datosExcel[idx] = validarDatos(datosExcel[idx], idx);
                    filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                    filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
                });
            });

            tr.querySelector('[data-delete]').addEventListener('click', () => {
                datosExcel.splice(index, 1);
                renderizarTablaVistaPrevia();
                totalFilasEl.textContent = datosExcel.length;
                filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
            });

            tbodyVistaPrevia.appendChild(tr);
        });
    }

    // ── PASO 2: procesar datos ──
    btnProcesarDatos.addEventListener('click', async () => {
        try {
            const datosValidos = datosExcel.filter(f => f.valida);
            productosAgrupados = agruparVariaciones(datosValidos);
            productosAgrupados = await validarDuplicadosFirestore(productosAgrupados);

            const totalProductos = productosAgrupados.length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) => sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0);

            document.getElementById('cmfab-resumen-total-productos').textContent = totalProductos;
            document.getElementById('cmfab-resumen-total-variaciones').textContent = totalVariaciones;
            document.getElementById('cmfab-resumen-total-unidades').textContent = totalUnidades;

            const duplicadosConflicto = productosAgrupados.filter(p => p.esDuplicado && p.advertenciaCategoriaProveedor);
            const duplicadosNormales = productosAgrupados.filter(p => p.esDuplicado && !p.advertenciaCategoriaProveedor);

            if (duplicadosConflicto.length > 0) {
                renderizarAdvertencias(duplicadosConflicto.map(producto => ({ producto, existentes: [producto.productoExistente] })));
                document.getElementById('cmfab-seccion-advertencias').style.display = 'block';
            } else {
                document.getElementById('cmfab-seccion-advertencias').style.display = 'none';
            }

            if (duplicadosNormales.length > 0) {
                document.getElementById('cmfab-seccion-duplicados').style.display = 'block';
                renderizarDuplicados(duplicadosNormales);
            } else {
                document.getElementById('cmfab-seccion-duplicados').style.display = 'none';
            }

            ocultarLoader();
            mostrarPaso(pasoConfirmacion);
        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar datos: ' + error.message, 'error');
            console.error(error);
        }
    });

    function renderizarAdvertencias(advertencias) {
        const contenedor = document.getElementById('cmfab-lista-advertencias');
        contenedor.innerHTML = '';

        advertencias.forEach(({ producto, existentes }) => {
            const div = document.createElement('div');
            div.className = 'alert alert-danger mb-2 border-3';
            div.innerHTML = `
                <div class="d-flex align-items-start">
                    <i class="bi bi-x-octagon-fill me-2 flex-shrink-0 text-danger" style="font-size: 1.5rem;"></i>
                    <div class="flex-grow-1">
                        <h6 class="alert-heading mb-2">🚨 CONFLICTO DETECTADO: "${producto.nombre}"</h6>
                        <small class="d-block mb-2">Excel: Categoría: <strong>${producto.categoria}</strong></small>
                        <hr class="my-2">
                        <small class="d-block mb-1"><strong>⚠️ Ya existe(n) ${existentes.length} producto(s) con este nombre:</strong></small>
                        ${existentes.map(p => `
                            <div class="ms-3 mb-1 p-2 bg-white rounded">
                                <small class="d-block">
                                    <strong>Código: ${p.codigo || 'SIN-CÓDIGO'}</strong><br>
                                    Categoría: "${p.categoriaOriginal}"
                                </small>
                            </div>
                        `).join('')}
                        <div class="alert alert-light mt-2 mb-0">
                            <small class="d-block fw-bold text-danger">
                                ⚠️ Las variaciones se agregarán al PRIMER producto existente para evitar duplicados.<br>
                                Si esto es incorrecto, CANCELA el cargue y corrige la categoría en el Excel.
                            </small>
                        </div>
                    </div>
                </div>
            `;
            contenedor.appendChild(div);
        });
    }

    function renderizarDuplicados(duplicados) {
        const contenedor = document.getElementById('cmfab-lista-duplicados');
        contenedor.innerHTML = '';

        duplicados.forEach((producto, index) => {
            const productoExistente = producto.productoExistente;
            const stockActual = (productoExistente.variaciones || []).reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
            const unidadesNuevas = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);

            let variacionesExistentesHTML = '';
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                const variacionesTexto = productoExistente.variaciones.map(v => `${v.talla || '—'}/${v.color || '—'} (${v.stock})`).join(', ');
                variacionesExistentesHTML = `<div class="col-12 mt-2"><small class="text-muted d-block">Variaciones actuales:</small><small><strong>${variacionesTexto}</strong></small></div>`;
            }

            let variacionesNuevasHTML = '';
            if (producto.variaciones && producto.variaciones.length > 0) {
                const variacionesTexto = producto.variaciones.map(v => `${v.talla || '—'}/${v.color || '—'} (${v.cantidad})`).join(', ');
                variacionesNuevasHTML = `<div class="col-12 mt-2"><small class="text-muted d-block">Variaciones del Excel:</small><small class="text-success"><strong>${variacionesTexto}</strong></small></div>`;
            }

            const div = document.createElement('div');
            div.className = 'card mb-2 border-warning';
            div.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">${producto.nombre}</h6>
                            <small class="text-muted d-block">Categoría: ${producto.categoria}</small>
                            <small class="d-block mt-1">
                                <span class="badge bg-secondary">${productoExistente.codigo || 'SIN-CÓDIGO'}</span>
                                <span class="text-muted ms-2">ID: ${productoExistente.id}</span>
                            </small>
                        </div>
                        <span class="badge bg-warning text-dark">Duplicado</span>
                    </div>
                    <div class="row g-2 mb-2">
                        <div class="col-6"><small class="text-muted d-block">Stock actual:</small><strong class="text-primary">${stockActual} unidades</strong></div>
                        <div class="col-6"><small class="text-muted d-block">A cargar:</small><strong class="text-success">+${unidadesNuevas} unidades</strong></div>
                        ${variacionesExistentesHTML}
                        ${variacionesNuevasHTML}
                    </div>
                    <div class="mt-2">
                        <label class="form-label mb-1"><strong>¿Qué deseas hacer?</strong></label>
                        <select class="form-select form-select-sm" data-duplicado-index="${index}">
                            <option value="sumar">✅ Sumar al stock existente (Stock final: ${stockActual + unidadesNuevas})</option>
                            <option value="reemplazar">🔄 Reemplazar stock (Stock final: ${unidadesNuevas})</option>
                            <option value="omitir">❌ Omitir este producto</option>
                        </select>
                    </div>
                </div>
            `;
            div.querySelector('select').addEventListener('change', (e) => { producto.accionDuplicado = e.target.value; });
            contenedor.appendChild(div);
        });
    }

    // ── PASO 3: confirmar carga ──
    btnConfirmarCarga.addEventListener('click', async () => {
        try {
            mostrarLoader('Guardando productos en catálogo...', 0);
            let contador = 0;
            const total = productosAgrupados.length;

            for (const producto of productosAgrupados) {
                if (producto.esDuplicado) {
                    if (producto.accionDuplicado === 'omitir') { contador++; continue; }

                    const productoRef = doc(db, 'productosFabrica', producto.productoExistenteId);
                    const productoExistente = producto.productoExistente;
                    const variacionesActuales = [...(productoExistente.variaciones || [])];

                    producto.variaciones.forEach(nuevaVar => {
                        const tallaVar = nuevaVar.talla || '';
                        const colorVar = nuevaVar.color || '';
                        const indexExistente = variacionesActuales.findIndex(v => (v.talla || '') === tallaVar && (v.color || '') === colorVar);

                        if (indexExistente >= 0) {
                            if (producto.accionDuplicado === 'sumar') {
                                variacionesActuales[indexExistente].stock = (parseFloat(variacionesActuales[indexExistente].stock) || 0) + nuevaVar.cantidad;
                            } else if (producto.accionDuplicado === 'reemplazar') {
                                variacionesActuales[indexExistente].stock = nuevaVar.cantidad;
                            }
                        } else {
                            variacionesActuales.push({ talla: tallaVar, color: colorVar, stock: nuevaVar.cantidad });
                        }
                    });

                    await updateDoc(productoRef, { variaciones: variacionesActuales });
                } else {
                    const nombreNorm = producto.nombre.toLowerCase().trim();
                    const productoConMismoNombre = productosExistentes.find(p => p.nombre === nombreNorm);

                    if (productoConMismoNombre) {
                        const productoRef = doc(db, 'productosFabrica', productoConMismoNombre.id);
                        const variacionesActuales = [...(productoConMismoNombre.variaciones || [])];

                        producto.variaciones.forEach(nuevaVar => {
                            const tallaVar = nuevaVar.talla || '';
                            const colorVar = nuevaVar.color || '';
                            const indexExistente = variacionesActuales.findIndex(v => (v.talla || '') === tallaVar && (v.color || '') === colorVar);

                            if (indexExistente >= 0) {
                                variacionesActuales[indexExistente].stock = (parseFloat(variacionesActuales[indexExistente].stock) || 0) + nuevaVar.cantidad;
                            } else {
                                variacionesActuales.push({ talla: tallaVar, color: colorVar, stock: nuevaVar.cantidad });
                            }
                        });

                        await updateDoc(productoRef, { variaciones: variacionesActuales });
                    } else {
                        const productoId = await guardarProductoFirestore(producto);
                        await guardarVariacionesFirestore(productoId, producto.variaciones);
                    }
                }

                contador++;
                actualizarProgreso(Math.round((contador / total) * 100));
            }

            const totalProductos = productosAgrupados.filter(p => !p.esDuplicado || p.accionDuplicado !== 'omitir').length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) => sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0);

            await guardarHistorial(totalProductos, totalVariaciones, totalUnidades);

            ocultarLoader();
            showToast(`Cargue completado: ${totalProductos} productos, ${totalUnidades} unidades`, 'success');

            datosExcel = [];
            productosAgrupados = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        } catch (error) {
            ocultarLoader();
            showToast('Error al guardar: ' + error.message, 'error');
            console.error(error);
        }
    });

    btnCancelar.addEventListener('click', () => {
        if (confirm('¿Estás seguro de cancelar? Se perderán los datos cargados.')) {
            datosExcel = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        }
    });

    btnVolverEdicion.addEventListener('click', () => mostrarPaso(pasoVistaPrevia));

    async function cargarDatosIniciales() {
        try {
            const catSnapshot = await getDocs(categoriesCollection);
            catSnapshot.forEach(docSnap => categoriasMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
        } catch (error) {
            console.error('Error al cargar categorías para Cargue Masivo:', error);
        }
    }
    // Igual que en Cargue Masivo de Boutique: se consulta al entrar a la
    // sección, no en cada carga del panel.
    let datosInicialesCargados = false;
    alEntrarSeccion('#cargue-masivo-fabrica', () => {
        if (datosInicialesCargados) return;
        datosInicialesCargados = true;
        cargarDatosIniciales();
    });

    console.log("✅ Módulo Cargue Masivo Fábrica inicializado");

}
