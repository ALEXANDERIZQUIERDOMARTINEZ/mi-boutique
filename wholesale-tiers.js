// Tablas de precios al por mayor según cantidad total comprada por grupo.
// "vestidosLargos" agrupa Vestidos largos y Conjuntos (misma tabla de precios).
export const WHOLESALE_TIER_GROUPS = {
    bodys: {
        label: 'Bodys básicos',
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
        tiers: [
            { min: 1, precio: 40000 },
            { min: 6, precio: 23000 },
            { min: 12, precio: 22000 },
            { min: 24, precio: 21000 },
            { min: 50, precio: 20000 }
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

// Umbral del primer escalón real de mayoreo (ej. 6X), compartido entre todas las
// tablas: no hace falta comprar 6 del MISMO tipo, cuenta el total surtido entre
// bodys, vestidos largos/conjuntos y vestidos cortos combinados.
export function getPrimerEscalonMayorista() {
    const minimos = Object.values(WHOLESALE_TIER_GROUPS)
        .map(g => g.tiers[1]?.min)
        .filter(v => typeof v === 'number');
    return minimos.length ? Math.min(...minimos) : Infinity;
}

// Detecta el grupo de precio mayorista a partir del NOMBRE de la categoría del
// producto (ej: "Vestidos cortos", "Conjuntos"), para que la tabla aplique
// automáticamente sin depender de que alguien la asigne a mano por producto.
export function detectGroupFromCategoryName(nombreCategoria) {
    if (!nombreCategoria) return '';
    const norm = nombreCategoria
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes('body')) return 'bodys';
    if (norm.includes('conjunto')) return 'vestidosLargos';
    if (norm.includes('vestido') && norm.includes('corto')) return 'vestidosCortos';
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
