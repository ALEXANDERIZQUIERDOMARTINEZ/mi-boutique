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
