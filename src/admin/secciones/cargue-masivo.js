// Cargue masivo de productos desde Excel.
// Separado de admin.js para que no se descargue ni se ejecute al abrir el
// panel: admin.js lo importa la primera vez que se entra a la sección
// (ver cargarSeccionDiferida en admin.js). Lo que antes leía del closure de
// admin.js (db, colecciones, helpers) llega ahora en `ctx`.
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ========================================================================
// MÓDULO: CARGUE MASIVO DE PRODUCTOS DESDE EXCEL
// ========================================================================
export function init(ctx) {
    const { alEntrarSeccion, categoriesCollection, db, loadExternalLib, productsCollection, showToast, suppliersCollection } = ctx;

    console.log("📦 Inicializando módulo de Cargue Masivo de Productos...");

    // --- Collection References ---
    const historialCarguesCollection = collection(db, 'historial_cargues');

    // --- DOM References ---
    const inputArchivo = document.getElementById('input-archivo-excel');
    const btnSeleccionarArchivo = document.getElementById('btn-seleccionar-archivo');
    const btnCancelarCargue = document.getElementById('btn-cancelar-cargue');
    const btnProcesarDatos = document.getElementById('btn-procesar-datos');
    const btnVolverEdicion = document.getElementById('btn-volver-edicion');
    const btnConfirmarCarga = document.getElementById('btn-confirmar-carga');

    const pasoSubir = document.getElementById('paso-subir');
    const pasoVistaPrevia = document.getElementById('paso-vista-previa');
    const pasoConfirmacion = document.getElementById('paso-confirmacion');
    const cargueLoader = document.getElementById('cargue-loader');

    const tbodyVistaPrevia = document.getElementById('tbody-vista-previa');
    const nombreArchivoEl = document.getElementById('nombre-archivo');
    const totalFilasEl = document.getElementById('total-filas');
    const filasValidasEl = document.getElementById('filas-validas');
    const filasErroresEl = document.getElementById('filas-errores');

    // --- Variables globales del módulo ---
    let datosExcel = []; // Datos cargados del Excel
    let productosAgrupados = []; // Productos agrupados con variaciones
    let categoriasMap = new Map(); // Mapa de categorías
    let proveedoresMap = new Map(); // Mapa de proveedores
    let productosExistentes = []; // Productos ya en Firestore

    // =====================================================================
    // 1️⃣ FUNCIÓN: LEER EXCEL
    // =====================================================================
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

                    // Validar que el archivo tenga las columnas requeridas
                    if (datos.length === 0) {
                        reject(new Error('El archivo está vacío'));
                        return;
                    }

                    // Normalizar nombres de columnas (trim y lowercase)
                    const datosNormalizados = datos.map(fila => {
                        const filaNormalizada = {};
                        for (let key in fila) {
                            const keyNormalizada = key.trim().toLowerCase();
                            filaNormalizada[keyNormalizada] = fila[key];
                        }
                        return filaNormalizada;
                    });

                    const columnas = Object.keys(datosNormalizados[0]);
                    const columnasObligatorias = ['nombre', 'categoria', 'proveedor', 'precio_detal', 'precio_mayor', 'talla', 'color', 'cantidad'];

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

            reader.onerror = function() {
                reject(new Error('Error al leer el archivo'));
            };

            reader.readAsArrayBuffer(archivo);
        });
    }

    // =====================================================================
    // 2️⃣ FUNCIÓN: VALIDAR DATOS
    // =====================================================================
    function validarDatos(fila, index) {
        const errores = [];

        // Validar nombre
        if (!fila.nombre || fila.nombre.trim() === '') {
            errores.push('Nombre vacío');
        }

        // Validar categoría
        if (!fila.categoria || fila.categoria.trim() === '') {
            errores.push('Categoría vacía');
        }

        // Validar proveedor
        if (!fila.proveedor || fila.proveedor.trim() === '') {
            errores.push('Proveedor vacío');
        }

        // Validar precios
        const precioDetal = parseFloat(fila.precio_detal);
        const precioMayor = parseFloat(fila.precio_mayor);

        if (isNaN(precioDetal) || precioDetal < 0) {
            errores.push('Precio detal inválido');
        }
        if (isNaN(precioMayor) || precioMayor < 0) {
            errores.push('Precio mayor inválido');
        }

        // Costo: opcional, si no existe se calcula como 50% del precio_detal
        let costo = parseFloat(fila.costo);
        if (isNaN(costo) || costo < 0) {
            costo = precioDetal * 0.5; // 50% del precio detal por defecto
        }

        // Descripción: opcional, si no existe se usa cadena vacía
        const descripcion = fila.descripcion?.trim() || '';

        // Código: opcional, si existe se usa para buscar producto existente
        const codigo = fila.codigo?.trim() || '';

        // Validar cantidad
        const cantidad = parseInt(fila.cantidad);
        if (isNaN(cantidad) || cantidad <= 0) {
            errores.push('Cantidad inválida o cero');
        }

        return {
            index: index,
            nombre: fila.nombre?.trim() || '',
            descripcion: descripcion,
            categoria: fila.categoria?.trim() || '',
            proveedor: fila.proveedor?.trim() || '',
            codigo: codigo,
            costo: costo,
            precio_detal: precioDetal,
            precio_mayor: precioMayor,
            talla: fila.talla?.trim() || '',
            color: fila.color?.trim() || '',
            cantidad: cantidad,
            errores: errores,
            valida: errores.length === 0
        };
    }

    // =====================================================================
    // 3️⃣ FUNCIÓN: AGRUPAR VARIACIONES
    // =====================================================================
    function agruparVariaciones(datos) {
        mostrarLoader('Agrupando productos y variaciones...', 50);

        const grupos = new Map();

        datos.forEach(fila => {
            if (!fila.valida) return; // Ignorar filas con errores

            // Clave única: código (si existe) o nombre + categoria + proveedor
            let clave;
            if (fila.codigo) {
                // Si tiene código, agrupar por código
                clave = `codigo_${fila.codigo.trim().toLowerCase()}`;
            } else {
                // Si no tiene código, agrupar por nombre + categoria + proveedor
                clave = `${fila.nombre.trim().toLowerCase()}_${fila.categoria.trim().toLowerCase()}_${fila.proveedor.trim().toLowerCase()}`;
            }

            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    nombre: fila.nombre.trim(),
                    descripcion: fila.descripcion.trim(),
                    categoria: fila.categoria.trim(),
                    proveedor: fila.proveedor.trim(),
                    codigo: fila.codigo || '',
                    costo: fila.costo,
                    precio_detal: fila.precio_detal,
                    precio_mayor: fila.precio_mayor,
                    variaciones: []
                });
            }

            // Agregar variación
            grupos.get(clave).variaciones.push({
                talla: fila.talla?.trim() || '',
                color: fila.color?.trim() || '',
                cantidad: fila.cantidad
            });
        });

        actualizarProgreso(70);
        return Array.from(grupos.values());
    }

    // =====================================================================
    // 4️⃣ FUNCIÓN: VALIDAR DUPLICADOS EN FIRESTORE
    // =====================================================================
    async function validarDuplicadosFirestore(productos) {
        mostrarLoader('Validando duplicados en inventario...', 80);

        try {
            // Asegurar que tenemos las categorías y proveedores cargados
            if (categoriasMap.size === 0 || proveedoresMap.size === 0) {
                await cargarDatosIniciales();
            }

            // Cargar todos los productos existentes
            const snapshot = await getDocs(productsCollection);
            productosExistentes = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();

                // Convertir IDs a nombres
                const categoriaNombre = categoriasMap.get(data.categoriaId)?.nombre || '';
                const proveedorNombre = proveedoresMap.get(data.proveedorId)?.nombre || '';

                productosExistentes.push({
                    id: docSnap.id,
                    nombre: data.nombre?.toLowerCase().trim(),
                    categoria: categoriaNombre.toLowerCase().trim(),
                    proveedor: proveedorNombre.toLowerCase().trim(),
                    categoriaId: data.categoriaId,
                    proveedorId: data.proveedorId,
                    stock: data.stock,
                    variaciones: data.variaciones,
                    nombreOriginal: data.nombre,
                    categoriaOriginal: categoriaNombre,
                    proveedorOriginal: proveedorNombre,
                    ...data
                });
            });

            console.log(`✅ Productos existentes cargados: ${productosExistentes.length}`);
            console.log('📋 Lista de productos existentes:');
            productosExistentes.forEach(p => {
                console.log(`  - "${p.nombreOriginal}" | Código: "${p.codigo || 'SIN-CÓDIGO'}" | Cat: "${p.categoriaOriginal}" | Prov: "${p.proveedorOriginal}" | ID: ${p.id}`);
            });

            // Marcar duplicados - NUEVA LÓGICA: Buscar por CÓDIGO primero, luego por nombre
            productos.forEach(producto => {
                const nombreNorm = producto.nombre.toLowerCase().trim();
                const categoriaNorm = producto.categoria.toLowerCase().trim();
                const proveedorNorm = producto.proveedor.toLowerCase().trim();
                const codigoExcel = producto.codigo?.toLowerCase().trim() || '';

                console.log(`\n🔍 Verificando producto del Excel: "${producto.nombre}"`);
                if (codigoExcel) {
                    console.log(`   📌 Código del Excel: "${codigoExcel}"`);
                }
                console.log(`   Normalizado: nombre="${nombreNorm}" | cat="${categoriaNorm}" | prov="${proveedorNorm}"`);

                let productoEncontrado = null;

                // 1️⃣ BUSCAR PRIMERO POR CÓDIGO (si el Excel tiene código)
                if (codigoExcel) {
                    productoEncontrado = productosExistentes.find(existente => {
                        const codigoExistente = existente.codigo?.toLowerCase().trim() || '';
                        return codigoExistente === codigoExcel;
                    });

                    if (productoEncontrado) {
                        console.log(`   ✅ ENCONTRADO POR CÓDIGO: "${productoEncontrado.nombreOriginal}"`);
                        console.log(`      └─ Código: ${productoEncontrado.codigo}`);
                        console.log(`      └─ ID: ${productoEncontrado.id}`);
                        console.log(`      └─ Stock: ${productoEncontrado.stock || 0}`);
                        if (productoEncontrado.variaciones && productoEncontrado.variaciones.length > 0) {
                            console.log(`      └─ Variaciones: ${productoEncontrado.variaciones.map(v => `${v.talla}/${v.color} (${v.stock})`).join(', ')}`);
                        }

                        producto.esDuplicado = true;
                        producto.productoExistenteId = productoEncontrado.id;
                        producto.productoExistente = productoEncontrado;
                        producto.accionDuplicado = 'sumar';
                        producto.encontradoPorCodigo = true;
                    } else {
                        console.log(`   ⚠️  Código "${codigoExcel}" no encontrado en inventario`);
                    }
                }

                // 2️⃣ SI NO SE ENCONTRÓ POR CÓDIGO, BUSCAR POR NOMBRE
                if (!productoEncontrado) {
                    const productosMismoNombre = productosExistentes.filter(existente => existente.nombre === nombreNorm);

                    if (productosMismoNombre.length > 0) {
                        console.log(`   📌 Encontrado(s) ${productosMismoNombre.length} producto(s) con el mismo nombre:`);
                        productosMismoNombre.forEach(p => {
                            console.log(`      - Código: ${p.codigo || 'SIN-CÓDIGO'} | Cat: "${p.categoriaOriginal}" | Prov: "${p.proveedorOriginal}"`);
                        });

                        // Buscar match exacto (nombre + categoría + proveedor)
                        const matchExacto = productosMismoNombre.find(existente =>
                            existente.categoria === categoriaNorm &&
                            existente.proveedor === proveedorNorm
                        );

                        if (matchExacto) {
                            console.log(`   ✅ MATCH EXACTO encontrado con: "${matchExacto.nombreOriginal}"`);
                            console.log(`      └─ Código: ${matchExacto.codigo || 'SIN-CÓDIGO'}`);
                            console.log(`      └─ ID: ${matchExacto.id}`);

                            producto.esDuplicado = true;
                            producto.productoExistenteId = matchExacto.id;
                            producto.productoExistente = matchExacto;
                            producto.accionDuplicado = 'sumar';

                        } else {
                            // Nombre igual pero categoría/proveedor diferente
                            console.error(`   🚨 ERROR CRÍTICO: Ya existe un producto con el nombre "${producto.nombre}"`);
                            console.error(`      Excel tiene: Cat="${producto.categoria}" | Prov="${producto.proveedor}"`);
                            productosMismoNombre.forEach(p => {
                                console.error(`      Existente: Cat="${p.categoriaOriginal}" | Prov="${p.proveedorOriginal}" | Código: ${p.codigo || 'SIN-CÓDIGO'}`);
                            });
                            console.error(`   🚨 Se tratará como duplicado del PRIMERO encontrado para evitar crear producto duplicado`);

                            // FORZAR como duplicado usando el primer producto encontrado
                            const primerProducto = productosMismoNombre[0];
                            producto.esDuplicado = true;
                            producto.productoExistenteId = primerProducto.id;
                            producto.productoExistente = primerProducto;
                            producto.accionDuplicado = 'sumar';
                            producto.advertenciaCategoriaProveedor = true;
                        }
                    } else {
                        console.log(`   ✅ No existe producto con este nombre, se creará como NUEVO`);
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
            console.error('❌ Error al validar duplicados:', error);
            throw error;
        }
    }

    // =====================================================================
    // 5️⃣ FUNCIÓN: GUARDAR PRODUCTO EN FIRESTORE
    // =====================================================================
    async function guardarProductoFirestore(producto) {
        try {
            // Buscar o crear categoría
            let categoriaId = await buscarOCrearCategoria(producto.categoria);

            // Buscar o crear proveedor
            let proveedorId = await buscarOCrearProveedor(producto.proveedor);

            // Generar código autogenerado
            const codigo = await generarCodigoProducto();

            // Estructura del producto
            const nuevoProducto = {
                nombre: producto.nombre,
                descripcion: producto.descripcion,
                categoriaId: categoriaId,
                proveedorId: proveedorId,
                costoCompra: producto.costo,
                precioDetal: producto.precio_detal,
                precioMayor: producto.precio_mayor,
                codigo: codigo,
                visible: false, // Oculto por defecto en tienda virtual
                timestamp: serverTimestamp(),
                stock: 0, // Se actualiza con variaciones
                variaciones: [],
                // Requerido por firestore.rules (hasRequiredTenantId()) al crear —
                // ver misma nota en el submit de #form-producto más arriba.
                tenantId: window.expectedTenantId ?? null
            };

            // Crear producto
            const docRef = await addDoc(productsCollection, nuevoProducto);
            return docRef.id;

        } catch (error) {
            console.error('❌ Error al guardar producto:', error);
            throw error;
        }
    }

    // =====================================================================
    // 6️⃣ FUNCIÓN: GUARDAR VARIACIONES EN FIRESTORE
    // =====================================================================
    async function guardarVariacionesFirestore(productoId, variaciones) {
        try {
            const productoRef = doc(db, 'productos', productoId);

            // Si el producto tiene talla o color, crear variaciones
            const tieneVariaciones = variaciones.some(v => v.talla || v.color);

            if (tieneVariaciones) {
                const variacionesArray = variaciones.map(v => ({
                    talla: v.talla || 'Única',
                    color: v.color || 'Único',
                    stock: v.cantidad || 0,
                    sku: `${productoId.substring(0, 6).toUpperCase()}-${v.talla || 'U'}-${v.color || 'U'}`
                }));

                await updateDoc(productoRef, {
                    variaciones: variacionesArray
                });
            } else {
                // Sin variaciones, actualizar stock directo
                const stockTotal = variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                await updateDoc(productoRef, {
                    stock: stockTotal
                });
            }

        } catch (error) {
            console.error('❌ Error al guardar variaciones:', error);
            throw error;
        }
    }

    // =====================================================================
    // 7️⃣ FUNCIÓN: GUARDAR HISTORIAL
    // =====================================================================
    async function guardarHistorial(totalProductos, totalVariaciones, totalUnidades) {
        try {
            await addDoc(historialCarguesCollection, {
                fecha: serverTimestamp(),
                usuario: 'Admin', // Puedes cambiar esto por el usuario actual
                totalProductos: totalProductos,
                totalVariaciones: totalVariaciones,
                totalUnidades: totalUnidades,
                // Requerido por firestore.rules (hasRequiredTenantId()) al crear —
                // ver misma nota en guardarProductoFirestore() más arriba.
                tenantId: window.expectedTenantId ?? null
            });

            console.log('✅ Historial de cargue guardado');

        } catch (error) {
            console.error('❌ Error al guardar historial:', error);
        }
    }

    // =====================================================================
    // FUNCIONES AUXILIARES
    // =====================================================================
    async function buscarOCrearCategoria(nombreCategoria) {
        const nombreNormalizado = nombreCategoria.trim();

        console.log(`🔍 Buscando categoría: "${nombreNormalizado}"`);

        // Buscar en caché (case-insensitive)
        for (let [id, cat] of categoriasMap) {
            if (cat.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Categoría encontrada en caché: "${cat.nombre}" (ID: ${id})`);
                return id;
            }
        }

        // Buscar en Firestore (cargar todas y comparar en memoria porque Firestore no soporta case-insensitive)
        const snapshot = await getDocs(categoriesCollection);

        for (let doc of snapshot.docs) {
            const data = doc.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Categoría encontrada en Firestore: "${data.nombre}" (ID: ${doc.id})`);
                categoriasMap.set(doc.id, { id: doc.id, ...data });
                return doc.id;
            }
        }

        // Crear nueva categoría
        console.log(`➕ Creando nueva categoría: "${nombreNormalizado}"`);
        const docRef = await addDoc(categoriesCollection, {
            nombre: nombreNormalizado,
            timestamp: serverTimestamp()
        });

        categoriasMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        console.log(`✅ Categoría creada con ID: ${docRef.id}`);
        return docRef.id;
    }

    async function buscarOCrearProveedor(nombreProveedor) {
        const nombreNormalizado = nombreProveedor.trim();

        console.log(`🔍 Buscando proveedor: "${nombreNormalizado}"`);

        // Buscar en caché (case-insensitive)
        for (let [id, prov] of proveedoresMap) {
            if (prov.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Proveedor encontrado en caché: "${prov.nombre}" (ID: ${id})`);
                return id;
            }
        }

        // Buscar en Firestore (cargar todas y comparar en memoria)
        const snapshot = await getDocs(suppliersCollection);

        for (let doc of snapshot.docs) {
            const data = doc.data();
            if (data.nombre.toLowerCase().trim() === nombreNormalizado.toLowerCase()) {
                console.log(`✅ Proveedor encontrado en Firestore: "${data.nombre}" (ID: ${doc.id})`);
                proveedoresMap.set(doc.id, { id: doc.id, ...data });
                return doc.id;
            }
        }

        // Crear nuevo proveedor
        console.log(`➕ Creando nuevo proveedor: "${nombreNormalizado}"`);
        const docRef = await addDoc(suppliersCollection, {
            nombre: nombreNormalizado,
            contacto: '',
            telefono: '',
            timestamp: serverTimestamp()
        });

        proveedoresMap.set(docRef.id, { id: docRef.id, nombre: nombreNormalizado });
        console.log(`✅ Proveedor creado con ID: ${docRef.id}`);
        return docRef.id;
    }

    async function generarCodigoProducto() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `PROD-${timestamp}-${random}`;
    }

    function mostrarLoader(mensaje, progreso) {
        cargueLoader.style.display = 'flex';
        document.getElementById('loader-mensaje').textContent = mensaje;
        actualizarProgreso(progreso);
    }

    function ocultarLoader() {
        cargueLoader.style.display = 'none';
    }

    function actualizarProgreso(porcentaje) {
        const barra = document.getElementById('loader-progreso');
        const texto = document.getElementById('loader-porcentaje');
        barra.style.width = `${porcentaje}%`;
        texto.textContent = `${porcentaje}%`;
    }

    function mostrarPaso(paso) {
        pasoSubir.style.display = 'none';
        pasoVistaPrevia.style.display = 'none';
        pasoConfirmacion.style.display = 'none';

        paso.style.display = 'block';
    }

    // =====================================================================
    // FLUJO PRINCIPAL
    // =====================================================================

    // PASO 1: Seleccionar archivo
    btnSeleccionarArchivo.addEventListener('click', () => {
        inputArchivo.click();
    });

    inputArchivo.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;

        try {
            nombreArchivoEl.textContent = archivo.name;

            // Leer Excel
            const datos = await leerExcel(archivo);

            // Validar datos
            datosExcel = datos.map((fila, index) => validarDatos(fila, index));

            // Actualizar contadores
            totalFilasEl.textContent = datosExcel.length;
            filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
            filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;

            // Renderizar tabla
            renderizarTablaVistaPrevia();

            // Habilitar botón si hay filas válidas
            btnProcesarDatos.disabled = datosExcel.filter(f => f.valida).length === 0;

            ocultarLoader();
            mostrarPaso(pasoVistaPrevia);

        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar archivo: ' + error.message, 'error');
            console.error(error);
        }
    });

    // Renderizar tabla de vista previa
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
                <td contenteditable="true" data-index="${index}" data-field="proveedor">${fila.proveedor || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="costo">${fila.costo || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_detal">${fila.precio_detal || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="precio_mayor">${fila.precio_mayor || 0}</td>
                <td contenteditable="true" data-index="${index}" data-field="talla">${fila.talla || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="color">${fila.color || ''}</td>
                <td contenteditable="true" data-index="${index}" data-field="cantidad">${fila.cantidad || 0}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" data-delete="${index}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;

            // Event: Editar celda
            tr.querySelectorAll('[contenteditable]').forEach(celda => {
                celda.addEventListener('blur', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    const field = e.target.dataset.field;
                    const valor = e.target.textContent.trim();

                    datosExcel[index][field] = valor;

                    // Re-validar
                    datosExcel[index] = validarDatos(datosExcel[index], index);

                    // Actualizar contadores
                    filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                    filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
                });
            });

            // Event: Eliminar fila
            tr.querySelector('[data-delete]').addEventListener('click', () => {
                datosExcel.splice(index, 1);
                renderizarTablaVistaPrevia();

                // Actualizar contadores
                totalFilasEl.textContent = datosExcel.length;
                filasValidasEl.textContent = datosExcel.filter(f => f.valida).length;
                filasErroresEl.textContent = datosExcel.filter(f => !f.valida).length;
            });

            tbodyVistaPrevia.appendChild(tr);
        });
    }

    // PASO 2: Procesar datos
    btnProcesarDatos.addEventListener('click', async () => {
        try {
            // Agrupar variaciones
            const datosValidos = datosExcel.filter(f => f.valida);
            productosAgrupados = agruparVariaciones(datosValidos);

            // Validar duplicados
            productosAgrupados = await validarDuplicadosFirestore(productosAgrupados);

            // Calcular totales
            const totalProductos = productosAgrupados.length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) =>
                sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0
            );

            // Actualizar resumen
            document.getElementById('resumen-total-productos').textContent = totalProductos;
            document.getElementById('resumen-total-variaciones').textContent = totalVariaciones;
            document.getElementById('resumen-total-unidades').textContent = totalUnidades;

            // Separar duplicados normales vs duplicados con conflicto de categoría/proveedor
            const duplicadosConflicto = productosAgrupados.filter(p => p.esDuplicado && p.advertenciaCategoriaProveedor);
            const duplicadosNormales = productosAgrupados.filter(p => p.esDuplicado && !p.advertenciaCategoriaProveedor);

            // Mostrar advertencias de conflicto PRIMERO (más grave)
            if (duplicadosConflicto.length > 0) {
                const advertencias = duplicadosConflicto.map(producto => ({
                    producto: producto,
                    existentes: [producto.productoExistente]
                }));
                renderizarAdvertencias(advertencias);
                document.getElementById('seccion-advertencias').style.display = 'block';
            } else {
                document.getElementById('seccion-advertencias').style.display = 'none';
            }

            // Mostrar duplicados normales
            if (duplicadosNormales.length > 0) {
                document.getElementById('seccion-duplicados').style.display = 'block';
                renderizarDuplicados(duplicadosNormales);
            } else {
                document.getElementById('seccion-duplicados').style.display = 'none';
            }

            ocultarLoader();
            mostrarPaso(pasoConfirmacion);

        } catch (error) {
            ocultarLoader();
            showToast('Error al procesar datos: ' + error.message, 'error');
            console.error(error);
        }
    });

    // Renderizar advertencias de nombres similares
    function renderizarAdvertencias(advertencias) {
        const contenedor = document.getElementById('lista-advertencias');
        contenedor.innerHTML = '';

        advertencias.forEach(({ producto, existentes }) => {
            const div = document.createElement('div');
            div.className = 'alert alert-danger mb-2 border-3';
            div.innerHTML = `
                <div class="d-flex align-items-start">
                    <i class="bi bi-x-octagon-fill me-2 flex-shrink-0 text-danger" style="font-size: 1.5rem;"></i>
                    <div class="flex-grow-1">
                        <h6 class="alert-heading mb-2">🚨 CONFLICTO DETECTADO: "${producto.nombre}"</h6>
                        <small class="d-block mb-2">Excel: Categoría: <strong>${producto.categoria}</strong> | Proveedor: <strong>${producto.proveedor}</strong></small>
                        <hr class="my-2">
                        <small class="d-block mb-1"><strong>⚠️ Ya existe(n) ${existentes.length} producto(s) con este nombre:</strong></small>
                        ${existentes.map(p => `
                            <div class="ms-3 mb-1 p-2 bg-white rounded">
                                <small class="d-block">
                                    <strong>Código: ${p.codigo || 'SIN-CÓDIGO'}</strong><br>
                                    Categoría: "${p.categoriaOriginal}" | Proveedor: "${p.proveedorOriginal}"
                                </small>
                            </div>
                        `).join('')}
                        <div class="alert alert-light mt-2 mb-0">
                            <small class="d-block fw-bold text-danger">
                                ⚠️ Las variaciones se agregarán al PRIMER producto existente para evitar duplicados.<br>
                                Si esto es incorrecto, CANCELA el cargue y corrige categoría/proveedor en el Excel.
                            </small>
                        </div>
                    </div>
                </div>
            `;
            contenedor.appendChild(div);
        });
    }

    // Renderizar lista de duplicados
    function renderizarDuplicados(duplicados) {
        const contenedor = document.getElementById('lista-duplicados');
        contenedor.innerHTML = '';

        duplicados.forEach((producto, index) => {
            const productoExistente = producto.productoExistente;

            // Calcular stock actual
            let stockActual = 0;
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                stockActual = productoExistente.variaciones.reduce((sum, v) => sum + (v.stock || 0), 0);
            } else {
                stockActual = productoExistente.stock || 0;
            }

            // Calcular unidades a agregar
            const unidadesNuevas = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);

            // Obtener variaciones existentes
            let variacionesExistentesHTML = '';
            if (productoExistente.variaciones && productoExistente.variaciones.length > 0) {
                const variacionesTexto = productoExistente.variaciones.map(v => `${v.talla}/${v.color} (${v.stock})`).join(', ');
                variacionesExistentesHTML = `
                    <div class="col-12 mt-2">
                        <small class="text-muted d-block">Variaciones actuales:</small>
                        <small><strong>${variacionesTexto}</strong></small>
                    </div>
                `;
            }

            // Obtener variaciones nuevas del Excel
            let variacionesNuevasHTML = '';
            if (producto.variaciones && producto.variaciones.length > 0) {
                const variacionesTexto = producto.variaciones.map(v => `${v.talla}/${v.color} (${v.cantidad})`).join(', ');
                variacionesNuevasHTML = `
                    <div class="col-12 mt-2">
                        <small class="text-muted d-block">Variaciones del Excel:</small>
                        <small class="text-success"><strong>${variacionesTexto}</strong></small>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = 'card mb-2 border-warning';
            div.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">${producto.nombre}</h6>
                            <small class="text-muted d-block">Categoría: ${producto.categoria} | Proveedor: ${producto.proveedor}</small>
                            <small class="d-block mt-1">
                                <span class="badge bg-secondary">${productoExistente.codigo || 'SIN-CÓDIGO'}</span>
                                <span class="text-muted ms-2">ID: ${productoExistente.id}</span>
                            </small>
                        </div>
                        <span class="badge bg-warning text-dark">Duplicado</span>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <small class="text-muted d-block">Stock actual:</small>
                            <strong class="text-primary">${stockActual} unidades</strong>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">A cargar:</small>
                            <strong class="text-success">+${unidadesNuevas} unidades</strong>
                        </div>
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

            div.querySelector('select').addEventListener('change', (e) => {
                producto.accionDuplicado = e.target.value;
            });

            contenedor.appendChild(div);
        });
    }

    // PASO 3: Confirmar carga
    btnConfirmarCarga.addEventListener('click', async () => {
        try {
            mostrarLoader('Guardando productos en inventario...', 0);

            let contador = 0;
            const total = productosAgrupados.length;

            for (const producto of productosAgrupados) {
                if (producto.esDuplicado) {
                    if (producto.accionDuplicado === 'omitir') {
                        contador++;
                        continue;
                    }

                    // Actualizar producto existente
                    const productoRef = doc(db, 'productos', producto.productoExistenteId);
                    const productoExistente = producto.productoExistente;

                    // Verificar si el producto existente tiene variaciones
                    const tieneVariaciones = productoExistente.variaciones && productoExistente.variaciones.length > 0;

                    if (tieneVariaciones) {
                        // Producto con variaciones: actualizar cada variación
                        const variacionesActuales = [...productoExistente.variaciones];

                        producto.variaciones.forEach(nuevaVar => {
                            const tallaVar = nuevaVar.talla || 'Única';
                            const colorVar = nuevaVar.color || 'Único';

                            // Buscar si la variación ya existe
                            const indexExistente = variacionesActuales.findIndex(v =>
                                v.talla === tallaVar && v.color === colorVar
                            );

                            if (indexExistente >= 0) {
                                // Variación existe: sumar o reemplazar
                                if (producto.accionDuplicado === 'sumar') {
                                    variacionesActuales[indexExistente].stock += nuevaVar.cantidad;
                                } else if (producto.accionDuplicado === 'reemplazar') {
                                    variacionesActuales[indexExistente].stock = nuevaVar.cantidad;
                                }
                            } else {
                                // Variación no existe: agregar nueva
                                variacionesActuales.push({
                                    talla: tallaVar,
                                    color: colorVar,
                                    stock: nuevaVar.cantidad,
                                    sku: `${producto.productoExistenteId.substring(0, 6).toUpperCase()}-${tallaVar}-${colorVar}`
                                });
                            }
                        });

                        await updateDoc(productoRef, {
                            variaciones: variacionesActuales
                        });

                    } else {
                        // Producto sin variaciones: actualizar stock general
                        if (producto.accionDuplicado === 'sumar') {
                            const stockActual = productoExistente.stock || 0;
                            const nuevoStock = stockActual + producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        } else if (producto.accionDuplicado === 'reemplazar') {
                            const nuevoStock = producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        }
                    }

                    console.log(`✅ Actualizado: ${producto.nombre} (${producto.accionDuplicado})`);

                } else {
                    // ⚠️ VERIFICACIÓN FINAL: Revisar si el nombre ya existe antes de crear
                    const nombreNorm = producto.nombre.toLowerCase().trim();
                    const productoConMismoNombre = productosExistentes.find(p => p.nombre === nombreNorm);

                    if (productoConMismoNombre) {
                        console.error(`🚨🚨🚨 BLOQUEADO: Intento de crear producto duplicado "${producto.nombre}"`);
                        console.error(`      Ya existe: Código ${productoConMismoNombre.codigo || 'SIN-CÓDIGO'} | ID: ${productoConMismoNombre.id}`);
                        console.error(`      AGREGANDO VARIACIONES AL EXISTENTE EN VEZ DE CREAR NUEVO`);

                        // FORZAR actualización del producto existente
                        const productoRef = doc(db, 'productos', productoConMismoNombre.id);
                        const tieneVariaciones = productoConMismoNombre.variaciones && productoConMismoNombre.variaciones.length > 0;

                        if (tieneVariaciones) {
                            const variacionesActuales = [...productoConMismoNombre.variaciones];

                            producto.variaciones.forEach(nuevaVar => {
                                const tallaVar = nuevaVar.talla || 'Única';
                                const colorVar = nuevaVar.color || 'Único';

                                const indexExistente = variacionesActuales.findIndex(v =>
                                    v.talla === tallaVar && v.color === colorVar
                                );

                                if (indexExistente >= 0) {
                                    variacionesActuales[indexExistente].stock += nuevaVar.cantidad;
                                } else {
                                    variacionesActuales.push({
                                        talla: tallaVar,
                                        color: colorVar,
                                        stock: nuevaVar.cantidad,
                                        sku: `${productoConMismoNombre.id.substring(0, 6).toUpperCase()}-${tallaVar}-${colorVar}`
                                    });
                                }
                            });

                            await updateDoc(productoRef, { variaciones: variacionesActuales });
                        } else {
                            const stockActual = productoConMismoNombre.stock || 0;
                            const nuevoStock = stockActual + producto.variaciones.reduce((sum, v) => sum + v.cantidad, 0);
                            await updateDoc(productoRef, { stock: nuevoStock });
                        }

                        console.log(`✅ BLOQUEADO Y REDIRIGIDO: Variaciones agregadas a ${productoConMismoNombre.codigo || 'SIN-CÓDIGO'}`);
                    } else {
                        // Crear nuevo producto solo si NO existe nombre duplicado
                        const productoId = await guardarProductoFirestore(producto);
                        await guardarVariacionesFirestore(productoId, producto.variaciones);
                        console.log(`✅ Creado: ${producto.nombre}`);
                    }
                }

                contador++;
                const progreso = Math.round((contador / total) * 100);
                actualizarProgreso(progreso);
            }

            // Guardar historial
            const totalProductos = productosAgrupados.filter(p => !p.esDuplicado || p.accionDuplicado !== 'omitir').length;
            const totalVariaciones = productosAgrupados.reduce((sum, p) => sum + p.variaciones.length, 0);
            const totalUnidades = productosAgrupados.reduce((sum, p) =>
                sum + p.variaciones.reduce((s, v) => s + v.cantidad, 0), 0
            );

            await guardarHistorial(totalProductos, totalVariaciones, totalUnidades);

            ocultarLoader();
            showToast(`✅ Cargue completado: ${totalProductos} productos, ${totalUnidades} unidades`, 'success');

            // Resetear
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

    // Botones de navegación
    btnCancelarCargue.addEventListener('click', () => {
        if (confirm('¿Estás seguro de cancelar? Se perderán los datos cargados.')) {
            datosExcel = [];
            inputArchivo.value = '';
            mostrarPaso(pasoSubir);
        }
    });

    btnVolverEdicion.addEventListener('click', () => {
        mostrarPaso(pasoVistaPrevia);
    });

    // Cargar categorías y proveedores al inicio
    async function cargarDatosIniciales() {
        try {
            // Cargar categorías
            const catSnapshot = await getDocs(categoriesCollection);
            catSnapshot.forEach(doc => {
                categoriasMap.set(doc.id, { id: doc.id, ...doc.data() });
            });

            // Cargar proveedores
            const provSnapshot = await getDocs(suppliersCollection);
            provSnapshot.forEach(doc => {
                proveedoresMap.set(doc.id, { id: doc.id, ...doc.data() });
            });

            console.log(`✅ Datos iniciales cargados: ${categoriasMap.size} categorías, ${proveedoresMap.size} proveedores`);

        } catch (error) {
            console.error('❌ Error al cargar datos iniciales:', error);
        }
    }

    // Inicializar: categorías y proveedores solo hacen falta dentro de
    // Cargue Masivo, así que se consultan la primera vez que se entra ahí
    // en vez de en cada carga del panel.
    let datosInicialesCargados = false;
    alEntrarSeccion('#cargue-masivo', () => {
        if (datosInicialesCargados) return;
        datosInicialesCargados = true;
        cargarDatosIniciales();
    });

    console.log("✅ Módulo de Cargue Masivo de Productos inicializado");

}
