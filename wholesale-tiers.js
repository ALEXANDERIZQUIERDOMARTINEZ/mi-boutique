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
            { min: 1, precio: 29000 },
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
            { min: 1, precio: 58000 },
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
            { min: 1, precio: 75000 },
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

// Resuelve el grupo de precio mayorista de un producto: si tiene el campo
// grupoMayorista asignado a mano (desde el admin) lo respeta como override;
// si no, lo detecta automáticamente por el nombre de su categoría.
export function resolveWholesaleGroup(product, categoriesMap) {
    if (product?.grupoMayorista && WHOLESALE_TIER_GROUPS[product.grupoMayorista]) {
        return product.grupoMayorista;
    }
    const nombreCategoria = categoriesMap?.get(product?.categoriaId) || '';
    return detectGroupFromCategoryName(nombreCategoria);
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
