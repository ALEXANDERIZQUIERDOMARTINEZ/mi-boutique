// Tablas de precios al por mayor según cantidad total comprada por grupo.
// "vestidosLargos" agrupa Vestidos largos y Conjuntos (misma tabla de precios).
export const WHOLESALE_TIER_GROUPS = {
    bodys: {
        label: 'Bodys básicos',
        surtido: true,
        tiers: [
            { min: 1, precio: 28000 },
            { min: 6, precio: 17000 },
            { min: 12, precio: 16000 },
            { min: 24, precio: 15000 },
            { min: 50, precio: 14000 },
            { min: 100, precio: 13000 },
            { min: 500, precio: 12000 },
            { min: 1000, precio: 10000 }
        ]
    },
    vestidosLargos: {
        label: 'Vestidos largos / Conjuntos',
        surtido: true,
        tiers: [
            { min: 1, precio: 55000 },
            { min: 6, precio: 32000 },
            { min: 12, precio: 31000 },
            { min: 24, precio: 30000 },
            { min: 50, precio: 29000 },
            { min: 100, precio: 28000 }
        ]
    },
    vestidosCortos: {
        label: 'Vestidos cortos básicos',
        surtido: true,
        tiers: [
            { min: 1, precio: 40000 },
            { min: 6, precio: 23000 },
            { min: 12, precio: 22000 },
            { min: 24, precio: 21000 },
            { min: 50, precio: 20000 }
        ]
    },
    bodyMallatex: {
        label: 'Body en mallatex',
        tiers: [
            { min: 6, precio: 22000 },
            { min: 50, precio: 21000 },
            { min: 100, precio: 20000 }
        ]
    },
    bodyElaborados: {
        label: 'Body Elaborados',
        tiers: [
            { min: 6, precio: 18000 },
            { min: 12, precio: 17000 },
            { min: 24, precio: 16000 },
            { min: 50, precio: 15000 },
            { min: 100, precio: 14000 },
            { min: 500, precio: 13000 },
            { min: 1000, precio: 12000 }
        ]
    },
    vestidosCortosElaborados: {
        label: 'Vestidos cortos elaborados',
        tiers: [
            { min: 6, precio: 33000 },
            { min: 12, precio: 32000 },
            { min: 24, precio: 31000 },
            { min: 50, precio: 30000 },
            { min: 100, precio: 29000 }
        ]
    },
    vestidosCortosSemiElaborados: {
        label: 'Vestidos cortos semi elaborados',
        tiers: [
            { min: 6, precio: 27000 },
            { min: 12, precio: 26000 },
            { min: 24, precio: 25000 },
            { min: 50, precio: 24000 }
        ]
    },
    vestidosLargosElaborados: {
        label: 'Vestidos largos Elaborados',
        tiers: [
            { min: 6, precio: 38000 },
            { min: 12, precio: 37000 },
            { min: 24, precio: 36000 },
            { min: 50, precio: 35000 }
        ]
    }
};

// Precio por unidad para una cantidad total dada dentro de un grupo.
export function getTierPrice(grupo, cantidadTotal) {
    const group = WHOLESALE_TIER_GROUPS[grupo];
    if (!group) return null;
    let precio = group.tiers[0].precio;
    for (const tier of group.tiers) {
        if (cantidadTotal >= tier.min) precio = tier.precio;
    }
    return precio;
}

// Precio base (1 unidad) de un grupo, usado como precio de vitrina.
export function getBaseTierPrice(grupo) {
    const group = WHOLESALE_TIER_GROUPS[grupo];
    return group ? group.tiers[0].precio : null;
}

// Umbral del primer escalón real de mayoreo (ej. 6X) para los grupos que
// participan del surtido (bodys, vestidos largos/conjuntos y vestidos cortos
// básicos): no hace falta comprar 6 del MISMO tipo entre ellos, cuenta el
// total combinado. Los grupos elaborados/semi elaborados no entran aquí.
export function getPrimerEscalonMayorista() {
    const minimos = Object.values(WHOLESALE_TIER_GROUPS)
        .filter(g => g.surtido)
        .map(g => g.tiers[1]?.min)
        .filter(v => typeof v === 'number');
    return minimos.length ? Math.min(...minimos) : Infinity;
}

// Cantidad mínima del primer escalón REAL de un grupo (ignora el escalón min:1
// de "vitrina" que solo existe para mostrar el precio en el catálogo). Para
// bodys/vestidosLargos/vestidosCortos es 6; para los grupos elaborados que no
// tienen escalón min:1 (ya arrancan en 6, 12, etc.) es el mínimo de su propio
// primer escalón.
export function getFirstRealTierMin(grupo) {
    const group = WHOLESALE_TIER_GROUPS[grupo];
    if (!group) return null;
    const real = group.tiers.find(t => t.min > 1) || group.tiers[0];
    return real.min;
}

// Precio/escalón real de un grupo combinando dos totales:
// - totalPropio: cuántas prendas de ESA MISMA categoría hay en el pedido.
// - totalMixto: cuántas prendas hay en total sumando los grupos "surtido" (bodys,
//   vestidos largos/conjuntos y vestidos cortos básicos).
// Mezclar categorías solo alcanza para desbloquear el primer escalón real (ej. 6X),
// y solo entre esos grupos básicos marcados con surtido:true — las líneas elaboradas
// (Body Elaborados, Vestidos cortos/largos Elaborados, semi elaborados, mallatex)
// llevan su conteo aparte: necesitan su propia cantidad para subir de escalón, sin
// beneficiarse de mezclar con básicos ni con otras líneas elaboradas.
// Para subir a escalones más altos (12X, 24X...) siempre hace falta esa cantidad
// DENTRO de la misma categoría, sin mezclar.
export function getHybridTierInfo(grupo, totalPropio, totalMixto) {
    const group = WHOLESALE_TIER_GROUPS[grupo];
    if (!group) return null;
    let idxPropio = 0;
    for (let i = 0; i < group.tiers.length; i++) {
        if (totalPropio >= group.tiers[i].min) idxPropio = i;
    }
    let idxMixto = 0;
    if (group.surtido && group.tiers[1] && totalMixto >= group.tiers[1].min) idxMixto = 1;
    const idx = Math.max(idxPropio, idxMixto);
    return {
        precio: group.tiers[idx].precio,
        nivel: group.tiers[idx].min,
        idx,
        porPropio: idxPropio >= idxMixto
    };
}

export function getHybridTierPrice(grupo, totalPropio, totalMixto) {
    const info = getHybridTierInfo(grupo, totalPropio, totalMixto);
    return info ? info.precio : null;
}

// Si un grupo participa del "surtido" (bodys, vestidos largos/conjuntos y vestidos
// cortos básicos): usado por las páginas para saber qué cantidades sumar al calcular
// el total mixto, sin mezclar ahí las líneas elaboradas/semi elaboradas/mallatex.
export function isSurtidoGroup(grupo) {
    return !!WHOLESALE_TIER_GROUPS[grupo]?.surtido;
}

// Detecta el grupo de precio mayorista a partir del NOMBRE de la categoría del
// producto (ej: "Vestidos cortos", "Conjuntos"), para que la tabla aplique
// automáticamente sin depender de que alguien la asigne a mano por producto.
export function detectGroupFromCategoryName(nombreCategoria) {
    if (!nombreCategoria) return '';
    const norm = nombreCategoria
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes('mallatex')) return 'bodyMallatex';
    if (norm.includes('body') && norm.includes('elabora')) return 'bodyElaborados';
    if (norm.includes('body')) return 'bodys';
    if (norm.includes('conjunto')) return 'vestidosLargos';
    if (norm.includes('vestido') && norm.includes('corto') && norm.includes('semi') && norm.includes('elabora')) return 'vestidosCortosSemiElaborados';
    if (norm.includes('vestido') && norm.includes('corto') && norm.includes('elabora')) return 'vestidosCortosElaborados';
    if (norm.includes('vestido') && norm.includes('corto')) return 'vestidosCortos';
    if (norm.includes('vestido') && norm.includes('largo') && norm.includes('elabora')) return 'vestidosLargosElaborados';
    if (norm.includes('vestido') && norm.includes('largo')) return 'vestidosLargos';
    return '';
}

// Resuelve el grupo de precio mayorista de un producto de FÁBRICA: siempre a
// partir de su categoría, sin permitir overrides manuales por producto. Así el
// precio que ve el cliente mayorista en mayor.html queda atado estrictamente
// a la categoría asignada, sin que un grupoMayorista desalineado a mano pueda
// mostrar una tabla de precios distinta a la de su categoría.
export function resolveWholesaleGroupByCategory(product, categoriesMap) {
    const nombreCategoria = categoriesMap?.get(product?.categoriaId) || '';
    return detectGroupFromCategoryName(nombreCategoria);
}

// Resuelve el grupo de precio mayorista de un producto:
// - grupoMayorista === 'ninguno': override explícito para IGNORAR la detección
//   por categoría y usar siempre el Precio Mayor fijo del producto (ej. un
//   producto en categoría "Bodys" que no debe entrar a esa tabla de precios).
// - grupoMayorista con un grupo real: lo respeta como override.
// - grupoMayorista vacío/sin definir (nunca se tocó el campo): lo detecta
//   automáticamente por el nombre de su categoría, para que la tabla aplique
//   sin depender de que alguien la asigne a mano.
export function resolveWholesaleGroup(product, categoriesMap) {
    if (product?.grupoMayorista === 'ninguno') return '';
    if (product?.grupoMayorista && WHOLESALE_TIER_GROUPS[product.grupoMayorista]) {
        return product.grupoMayorista;
    }
    const nombreCategoria = categoriesMap?.get(product?.categoriaId) || '';
    return detectGroupFromCategoryName(nombreCategoria);
}

// Respaldo cuando no hay override ni categoría reconocible (ej. producto sin
// categoriaId, categoría con nombre atípico o borrada): busca a qué tabla
// pertenece el Precio Mayor ya configurado a mano en el producto, comparándolo
// contra los escalones de cada grupo. Así el carrito de ventas del admin igual
// aplica los descuentos por cantidad aunque la detección automática falle.
export function inferGroupFromMayorPrice(precioMayor) {
    const pm = parseFloat(precioMayor) || 0;
    if (pm <= 0) return '';
    for (const [key, group] of Object.entries(WHOLESALE_TIER_GROUPS)) {
        if (group.tiers.some(t => t.precio === pm)) return key;
    }
    return '';
}

// Resuelve el grupo con el mismo criterio de resolveWholesaleGroup, pero cayendo
// a inferGroupFromMayorPrice como último respaldo antes de rendirse.
export function resolveWholesaleGroupConRespaldo(product, categoriesMap) {
    if (product?.grupoMayorista === 'ninguno') return '';
    const grupo = resolveWholesaleGroup(product, categoriesMap);
    if (grupo) return grupo;
    return inferGroupFromMayorPrice(product?.precioMayor);
}

// HTML de las tarjetas de tablas de precios por cantidad, compartido entre
// encargo.html y mayor.html (estilos .wtiers-* definidos en style.css).
export function buildTiersTablesHtml() {
    const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return Object.values(WHOLESALE_TIER_GROUPS).map(group => `
        <div class="wtiers-card">
            <div class="wtiers-card-header">${group.label}</div>
            <table class="wtiers-table">
                ${group.tiers.map(t => `<tr><td>${t.min}X</td><td>${formatoMoneda.format(t.precio)}</td></tr>`).join('')}
            </table>
        </div>
    `).join('');
}
