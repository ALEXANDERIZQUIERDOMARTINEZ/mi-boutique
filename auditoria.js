/**
 * auditoria.js - Módulo de Auditoría / Trazabilidad
 *
 * Registra quién crea, edita, elimina o anula productos, ventas y usuarios,
 * y expone la sección "Auditoría" del panel admin para consultar ese
 * historial con filtros (módulo, acción, usuario, rango de fechas, texto).
 *
 * Uso desde otros módulos:
 *   import { registrarAuditoria } from './auditoria.js';
 *   await registrarAuditoria({
 *       accion: 'crear' | 'editar' | 'eliminar' | 'anular',
 *       modulo: 'producto' | 'venta' | 'usuario' | ...,
 *       entidadId: 'ID del documento afectado',
 *       entidadNombre: 'Nombre legible (ej: nombre del producto)',
 *       descripcion: 'Frase corta y legible de lo que pasó',
 *       detalles: { ...datos adicionales opcionales... }
 *   });
 */

import { collection, addDoc, query, orderBy, where, limit, startAfter, getDocs, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const COLLECTION_NAME = 'auditoria';
const PAGE_SIZE = 50;

// ═══════════════════════════════════════════════════════════════════════
// REGISTRO DE EVENTOS (usado por admin.js y usuarios.js)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Registra un evento de auditoría. Nunca lanza: un fallo aquí no debe
 * interrumpir la operación (crear/editar/eliminar) que lo disparó.
 */
export async function registrarAuditoria({ accion, modulo, entidadId = null, entidadNombre = '', descripcion = '', detalles = {} }) {
    try {
        if (!window.db) {
            console.warn('Auditoría: Firestore no disponible todavía, se omite el registro.');
            return;
        }
        const usuario = window.appContext || {};
        await addDoc(collection(window.db, COLLECTION_NAME), {
            accion,
            modulo,
            entidadId,
            entidadNombre,
            descripcion,
            detalles,
            usuarioId: usuario.userId || null,
            usuarioNombre: usuario.nombre || 'Desconocido',
            usuarioEmail: usuario.email || null,
            usuarioRol: usuario.rol || null,
            tenantId: usuario.tenantId ?? null,
            fecha: serverTimestamp()
        });
    } catch (error) {
        console.error('No se pudo registrar el evento de auditoría:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// DESCRIPCIÓN DE CAMBIOS EN PRODUCTOS (color, talla, precios, visibilidad)
// ═══════════════════════════════════════════════════════════════════════

function claveVariacion(v) {
    return `${(v.color || '').trim().toLowerCase()}__${(v.talla || '').trim().toLowerCase()}`;
}

function describirVariacion(v) {
    return [v.color, v.talla].filter(Boolean).join(' / ') || 'sin color/talla';
}

/**
 * Resume, en una frase corta, qué colores/tallas tiene un producto recién
 * creado (para usar en la descripción del registro de auditoría de creación).
 */
export function resumenVariacionesProducto(productData) {
    const partes = [];
    const colores = [...new Set((productData.variaciones || []).map(v => (v.color || '').trim()).filter(Boolean))];
    const tallas = [...new Set((productData.variaciones || []).map(v => (v.talla || '').trim()).filter(Boolean))];
    if (colores.length > 0) partes.push(`colores: ${colores.join(', ')}`);
    if (tallas.length > 0) partes.push(`tallas: ${tallas.join(', ')}`);

    const coloresGaleria = (productData.variantes_color || []).map(c => (c.nombre || '').trim()).filter(Boolean);
    if (coloresGaleria.length > 0) partes.push(`galería de colores: ${coloresGaleria.join(', ')}`);

    return partes.length > 0 ? ` — ${partes.join(' | ')}` : '';
}

/**
 * Compara el producto antes y después de una edición y devuelve una lista de
 * cambios en lenguaje natural (para la descripción del registro) más un
 * objeto de detalles estructurado (para el modal "Ver detalles").
 */
export function describirCambiosProducto(anterior, nuevo) {
    const cambios = [];
    const detalles = {};
    anterior = anterior || {};

    const camposPrecio = [
        { campo: 'precioDetal', etiqueta: 'el precio al detal' },
        { campo: 'precioMayor', etiqueta: 'el precio al mayor' },
        { campo: 'costoCompra', etiqueta: 'el costo de compra' }
    ];
    camposPrecio.forEach(({ campo, etiqueta }) => {
        const antes = anterior[campo] ?? 0;
        const despues = nuevo[campo] ?? 0;
        if (antes !== despues) {
            cambios.push(`cambió ${etiqueta} de $${antes.toLocaleString('es-CO')} a $${despues.toLocaleString('es-CO')}`);
            detalles[campo] = { antes, despues };
        }
    });

    if (!!anterior.visible !== !!nuevo.visible) {
        cambios.push(nuevo.visible ? 'lo marcó como visible en la tienda' : 'lo ocultó de la tienda');
        detalles.visible = { antes: !!anterior.visible, despues: !!nuevo.visible };
    }

    const antesVar = new Map((anterior.variaciones || []).map(v => [claveVariacion(v), v]));
    const despuesVar = new Map((nuevo.variaciones || []).map(v => [claveVariacion(v), v]));

    const agregadas = [];
    const eliminadas = [];
    const stockCambiado = [];

    despuesVar.forEach((v, k) => {
        if (!antesVar.has(k)) {
            agregadas.push(v);
        } else {
            const anteriorV = antesVar.get(k);
            if ((anteriorV.stock || 0) !== (v.stock || 0)) {
                stockCambiado.push(`${describirVariacion(v)} (de ${anteriorV.stock || 0} a ${v.stock || 0} unidades)`);
            }
        }
    });
    antesVar.forEach((v, k) => {
        if (!despuesVar.has(k)) eliminadas.push(v);
    });

    if (agregadas.length > 0) {
        cambios.push(`agregó ${agregadas.length === 1 ? 'la variación' : 'las variaciones'} ${agregadas.map(describirVariacion).join(', ')}`);
        detalles.variacionesAgregadas = agregadas.map(v => `${describirVariacion(v)} (stock ${v.stock || 0})`);
    }
    if (eliminadas.length > 0) {
        cambios.push(`eliminó ${eliminadas.length === 1 ? 'la variación' : 'las variaciones'} ${eliminadas.map(describirVariacion).join(', ')}`);
        detalles.variacionesEliminadas = eliminadas.map(describirVariacion);
    }
    if (stockCambiado.length > 0) {
        cambios.push(`cambió el stock de ${stockCambiado.join(', ')}`);
        detalles.stockCambiado = stockCambiado;
    }

    const nombreColor = c => (c.nombre || '').trim().toLowerCase();
    const antesColores = new Set((anterior.variantes_color || []).map(nombreColor).filter(Boolean));
    const despuesColores = new Set((nuevo.variantes_color || []).map(nombreColor).filter(Boolean));

    const coloresAgregados = [...despuesColores].filter(c => !antesColores.has(c));
    const coloresEliminados = [...antesColores].filter(c => !despuesColores.has(c));

    if (coloresAgregados.length > 0) {
        cambios.push(`agregó ${coloresAgregados.length === 1 ? 'el color' : 'los colores'} ${coloresAgregados.join(', ')} a la galería`);
        detalles.coloresGaleriaAgregados = coloresAgregados;
    }
    if (coloresEliminados.length > 0) {
        cambios.push(`quitó ${coloresEliminados.length === 1 ? 'el color' : 'los colores'} ${coloresEliminados.join(', ')} de la galería`);
        detalles.coloresGaleriaEliminados = coloresEliminados;
    }

    return { cambios, detalles };
}

// ═══════════════════════════════════════════════════════════════════════
// UI DE LA SECCIÓN "AUDITORÍA"
// ═══════════════════════════════════════════════════════════════════════

const ACCION_LABELS = {
    crear:    { texto: 'Creación',   clase: 'bg-success',            icono: 'bi-plus-circle' },
    editar:   { texto: 'Edición',    clase: 'bg-warning text-dark',  icono: 'bi-pencil' },
    eliminar: { texto: 'Eliminación',clase: 'bg-danger',             icono: 'bi-trash' },
    anular:   { texto: 'Anulación',  clase: 'bg-secondary',          icono: 'bi-x-circle' }
};

const MODULO_LABELS = {
    producto: 'Productos',
    venta: 'Ventas',
    usuario: 'Usuarios',
    apartado: 'Apartados',
    cliente: 'Clientes'
};

function etiquetaAccion(accion) {
    return ACCION_LABELS[accion] || { texto: accion || 'Desconocida', clase: 'bg-light text-dark', icono: 'bi-question-circle' };
}

function etiquetaModulo(modulo) {
    if (MODULO_LABELS[modulo]) return MODULO_LABELS[modulo];
    if (!modulo) return 'General';
    return modulo.charAt(0).toUpperCase() + modulo.slice(1);
}

function formatearFecha(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '—';
    return timestamp.toDate().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

// Estado de paginación/filtros de la vista actual
const estado = {
    ultimoDoc: null,
    hayMas: true,
    cargando: false,
    filtros: { modulo: '', accion: '', usuario: '', desde: '', hasta: '', busqueda: '' },
    filasActuales: [] // Filas ya filtradas y mostradas (para exportar)
};

let inicializado = false;
let usuariosVistos = new Set();

function el(id) { return document.getElementById(id); }

function construirQueryBase(afterDoc) {
    const clauses = [orderBy('fecha', 'desc')];

    if (estado.filtros.desde) {
        const inicio = new Date(estado.filtros.desde + 'T00:00:00');
        clauses.push(where('fecha', '>=', Timestamp.fromDate(inicio)));
    }
    if (estado.filtros.hasta) {
        const fin = new Date(estado.filtros.hasta + 'T23:59:59');
        clauses.push(where('fecha', '<=', Timestamp.fromDate(fin)));
    }

    clauses.push(limit(PAGE_SIZE));
    if (afterDoc) clauses.push(startAfter(afterDoc));

    return query(collection(window.db, COLLECTION_NAME), ...clauses);
}

/**
 * Aplica los filtros que NO se pueden combinar en la consulta a Firestore
 * (módulo, acción, usuario y texto libre) sobre los documentos ya
 * descargados. Combinar estos filtros con el rango de fechas en una sola
 * consulta exigiría índices compuestos adicionales; filtrarlos aquí evita
 * esa dependencia a cambio de traer los datos por páginas.
 */
function pasaFiltrosLocales(data) {
    const f = estado.filtros;
    if (f.modulo && data.modulo !== f.modulo) return false;
    if (f.accion && data.accion !== f.accion) return false;
    if (f.usuario && data.usuarioNombre !== f.usuario) return false;
    if (f.busqueda) {
        const texto = f.busqueda.toLowerCase();
        const campos = [data.entidadNombre, data.descripcion, data.usuarioNombre].join(' ').toLowerCase();
        if (!campos.includes(texto)) return false;
    }
    return true;
}

function renderFila(id, data) {
    const tbody = el('auditoria-tabla-body');
    if (!tbody) return;

    if (data.usuarioNombre && !usuariosVistos.has(data.usuarioNombre)) {
        usuariosVistos.add(data.usuarioNombre);
        agregarOpcionUsuario(data.usuarioNombre);
    }

    const accionInfo = etiquetaAccion(data.accion);
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="text-muted small text-nowrap">${formatearFecha(data.fecha)}</td>
        <td>
            <div class="fw-semibold">${escaparHtml(data.usuarioNombre || 'Desconocido')}</div>
            <div class="text-muted small">${escaparHtml(data.usuarioRol || '')}</div>
        </td>
        <td><span class="badge ${accionInfo.clase}"><i class="bi ${accionInfo.icono} me-1"></i>${accionInfo.texto}</span></td>
        <td><span class="badge bg-light text-dark border">${escaparHtml(etiquetaModulo(data.modulo))}</span></td>
        <td>${escaparHtml(data.entidadNombre || '—')}</td>
        <td class="small">${escaparHtml(data.descripcion || '')}</td>
        <td class="text-center">
            ${data.detalles && Object.keys(data.detalles).length > 0
                ? `<button type="button" class="btn btn-sm btn-outline-secondary btn-auditoria-detalle" title="Ver detalles"><i class="bi bi-eye"></i></button>`
                : ''}
        </td>
    `;
    const btnDetalle = tr.querySelector('.btn-auditoria-detalle');
    if (btnDetalle) btnDetalle.addEventListener('click', () => mostrarDetalle(data));

    tbody.appendChild(tr);
    estado.filasActuales.push(data);
}

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function agregarOpcionUsuario(nombre) {
    const select = el('auditoria-filtro-usuario');
    if (!select) return;
    if ([...select.options].some(o => o.value === nombre)) return;
    const opt = document.createElement('option');
    opt.value = nombre;
    opt.textContent = nombre;
    select.appendChild(opt);
}

function mostrarDetalle(data) {
    const modalEl = el('auditoriaDetalleModal');
    const body = el('auditoria-detalle-body');
    if (!modalEl || !body) return;

    const filas = Object.entries(data.detalles || {})
        .map(([clave, valor]) => `<tr><th class="text-muted small">${escaparHtml(clave)}</th><td>${escaparHtml(typeof valor === 'object' ? JSON.stringify(valor) : valor)}</td></tr>`)
        .join('');

    body.innerHTML = `
        <p class="mb-3">${escaparHtml(data.descripcion || '')}</p>
        <table class="table table-sm mb-0">${filas || '<tr><td class="text-muted">Sin detalles adicionales</td></tr>'}</table>
    `;

    new bootstrap.Modal(modalEl).show();
}

function mostrarVacio(mensaje) {
    const tbody = el('auditoria-tabla-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${escaparHtml(mensaje)}</td></tr>`;
}

async function cargarPagina(reset) {
    if (estado.cargando) return;
    if (!reset && !estado.hayMas) return;

    estado.cargando = true;
    const btnCargarMas = el('auditoria-btn-cargar-mas');
    if (btnCargarMas) { btnCargarMas.disabled = true; btnCargarMas.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Cargando...'; }

    if (reset) {
        estado.ultimoDoc = null;
        estado.hayMas = true;
        estado.filasActuales = [];
        const tbody = el('auditoria-tabla-body');
        if (tbody) tbody.innerHTML = '';
    }

    try {
        const snapshot = await getDocs(construirQueryBase(estado.ultimoDoc));

        if (snapshot.empty && estado.filasActuales.length === 0) {
            mostrarVacio('No hay registros de auditoría para estos filtros.');
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (pasaFiltrosLocales(data)) {
                renderFila(docSnap.id, data);
            }
        });

        estado.ultimoDoc = snapshot.docs[snapshot.docs.length - 1] || estado.ultimoDoc;
        estado.hayMas = snapshot.docs.length === PAGE_SIZE;

        if (estado.filasActuales.length === 0 && !estado.hayMas) {
            mostrarVacio('No se encontraron registros que coincidan con los filtros.');
        }

    } catch (error) {
        console.error('Error al cargar la auditoría:', error);
        mostrarVacio('No se pudo cargar el historial de auditoría.');
        if (typeof window.showToast === 'function') {
            window.showToast('No tienes permiso para ver la auditoría o hubo un error al cargarla.', 'error');
        }
        estado.hayMas = false;
    } finally {
        estado.cargando = false;
        if (btnCargarMas) {
            btnCargarMas.innerHTML = 'Cargar más registros';
            btnCargarMas.disabled = !estado.hayMas;
            btnCargarMas.style.display = estado.hayMas ? 'inline-block' : 'none';
        }
    }
}

function leerFiltrosDesdeUI() {
    estado.filtros = {
        modulo: el('auditoria-filtro-modulo')?.value || '',
        accion: el('auditoria-filtro-accion')?.value || '',
        usuario: el('auditoria-filtro-usuario')?.value || '',
        desde: el('auditoria-filtro-desde')?.value || '',
        hasta: el('auditoria-filtro-hasta')?.value || '',
        busqueda: el('auditoria-filtro-busqueda')?.value.trim() || ''
    };
}

function exportarExcel() {
    if (typeof XLSX === 'undefined') {
        window.showToast?.('El exportador de Excel aún no está listo, intenta de nuevo en un momento.', 'warning');
        return;
    }
    if (estado.filasActuales.length === 0) {
        window.showToast?.('No hay registros cargados para exportar.', 'warning');
        return;
    }

    const data = estado.filasActuales.map(d => ({
        Fecha: formatearFecha(d.fecha),
        Usuario: d.usuarioNombre || '',
        Rol: d.usuarioRol || '',
        Accion: etiquetaAccion(d.accion).texto,
        Modulo: etiquetaModulo(d.modulo),
        Elemento: d.entidadNombre || '',
        Descripcion: d.descripcion || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoría');

    const ahora = new Date();
    const marca = ahora.toISOString().slice(0, 10) + '_' + ahora.toTimeString().slice(0, 5).replace(':', '');
    XLSX.writeFile(wb, `Auditoria_MishellBoutique_${marca}.xlsx`);
}

function wireEventos() {
    el('auditoria-btn-filtrar')?.addEventListener('click', () => { leerFiltrosDesdeUI(); cargarPagina(true); });
    el('auditoria-filtro-busqueda')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); leerFiltrosDesdeUI(); cargarPagina(true); } });
    el('auditoria-btn-limpiar')?.addEventListener('click', () => {
        ['auditoria-filtro-modulo', 'auditoria-filtro-accion', 'auditoria-filtro-usuario'].forEach(id => { const elm = el(id); if (elm) elm.value = ''; });
        ['auditoria-filtro-desde', 'auditoria-filtro-hasta', 'auditoria-filtro-busqueda'].forEach(id => { const elm = el(id); if (elm) elm.value = ''; });
        leerFiltrosDesdeUI();
        cargarPagina(true);
    });
    el('auditoria-btn-cargar-mas')?.addEventListener('click', () => cargarPagina(false));
    el('auditoria-btn-exportar')?.addEventListener('click', exportarExcel);
}

function tienePermisoAuditoria(appContext) {
    if (!appContext) return false;
    return appContext.isSuperAdmin || appContext.permisos?.auditoria_ver === true;
}

function inicializarSeccionAuditoria(appContext) {
    if (inicializado) return;
    if (!el('auditoria-tabla-body')) return; // La sección no existe en esta página
    if (!tienePermisoAuditoria(appContext)) return;

    inicializado = true;
    wireEventos();
    leerFiltrosDesdeUI();
    cargarPagina(true);
}

// Se inicializa cuando admin-auth-init.js confirma sesión + permisos.
window.addEventListener('adminAuthReady', (e) => inicializarSeccionAuditoria(e.detail));
// Si el usuario ya estaba autenticado (contexto cacheado) antes de que este
// script terminara de cargar, el evento anterior ya pudo haberse disparado.
if (window.appContext) inicializarSeccionAuditoria(window.appContext);
