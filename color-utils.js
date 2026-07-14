/**
 * color-utils.js - Nombre de color → hex / swatch visual
 * Extraído de app.js para poder reutilizarse también en mayor.js sin duplicar
 * el mapa de colores en cada archivo.
 */

const COLOR_MAP = {
    // Colores básicos
    'rojo': '#E53935',
    'roja': '#E53935',
    'azul': '#1E88E5',
    'verde': '#43A047',
    'amarillo': '#FDD835',
    'naranja': '#FB8C00',
    'rosa': '#FF8DA1',
    'morado': '#8E24AA',
    'violeta': '#8E24AA',
    'negro': '#212121',
    'negra': '#212121',
    'blanca': '#FFFFFF',
    'blanco': '#FFFFFF',
    'blanco 50%': '#F5F5F5',
    'blanco50%': '#F5F5F5',
    'negro%': '#424242',
    'negro %': '#424242',
    'gris': '#9E9E9E',
    'cafe': '#6D4C41',
    'café': '#6D4C41',
    'cafe claro': '#a18262',
    'café claro': '#a18262',
    'marron': '#6D4C41',
    'cafe oscuro': '#59412f',
    'marrón': '#6D4C41',
    'beige': '#D7CCC8',
    'crema': '#FFF8E1',

    // Tonos de rojo
    'rojo oscuro': '#C62828',
    'rojo claro': '#EF5350',
    'coral': '#FF6F61',
    'salmon': '#FA8072',
    'salmón': '#FA8072',
    'fucsia': '#E91E63',
    'magenta': '#E91E63',

    // Tonos de azul
    'azul rey': '#1414b8',
    'azul marino': '#0D47A1',
    'azul oscuro': '#0D47A1',
    'azul medio': '#1976D2',
    'azul claro': '#64B5F6',
    'azul bebe': '#64B5F6',
    'azul bebé': '#64B5F6',
    'celeste': '#81D4FA',
    'turquesa': '#00ACC1',
    'aguamarina': '#00BCD4',
    'cyan': '#00BCD4',

    // Tonos de verde
    'verde oscuro': '#2E7D32',
    'verde claro': '#81C784',
    'lima': '#CDDC39',
    'oliva': '#7CB342',
    'menta': '#80CBC4',

    // Tonos de morado
    'morado oscuro': '#6A1B9A',
    'morado claro': '#BA68C8',
    'lavanda': '#B39DDB',
    'lila': '#E1BEE7',

    // Tonos de rosa
    'rosa claro': '#F48FB1',
    'rosa fuerte': '#D81B60',
    'rosado': '#F8BBD0',
    'durazno': '#FFAB91',
    'palo de rosa': '#E6C9C9',

    // Tonos de gris
    'gris oscuro': '#424242',
    'gris claro': '#E0E0E0',
    'plata': '#BDBDBD',
    'plateado': '#BDBDBD',

    // Otros colores
    'dorado': '#FFD700',
    'oro': '#FFD700',
    'bronce': '#CD7F32',
    'cobre': '#B87333',
    'mostaza': '#E5AE0F',
    'bordo': '#900C3F',
    'vino tinto': '#722F37',
    'terracota': '#CC5233',
    'unico': '#9E9E9E',
    'único': '#9E9E9E',

    // Estampados (color neutral)
    'camel': '#bf8a3d',
    'marfil': '#e1cc4f',
    'estampado': '#9E9E9E',
    'floral': '#9E9E9E',
    'rayas': '#9E9E9E',
    'puntos': '#9E9E9E',
};

const SPECIAL_COLORS = {
    'animal print': 'radial-gradient(circle at 20% 50%, #C19A6B 0%, #C19A6B 15%, transparent 15%), radial-gradient(circle at 60% 30%, #8B6914 0%, #8B6914 12%, transparent 12%), radial-gradient(circle at 80% 70%, #C19A6B 0%, #C19A6B 15%, transparent 15%), linear-gradient(135deg, #DEB887 0%, #F4A460 100%)',
    'blanco/negro': 'linear-gradient(to right, #FFFFFF 0%, #FFFFFF 50%, #212121 50%, #212121 100%)',
    'blanco lineas beig': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
    'blanco con lineas beige': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
    'blanco con beige': 'repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 8px, #D7CCC8 8px, #D7CCC8 16px)',
};

/** Convierte un nombre de color a código hex (o gradiente para colores especiales). */
export function getColorHex(colorName) {
    if (!colorName) return '#9E9E9E';
    const normalized = colorName.toLowerCase().trim();

    if (SPECIAL_COLORS[normalized]) {
        return SPECIAL_COLORS[normalized];
    }

    if (COLOR_MAP[normalized]) {
        return COLOR_MAP[normalized];
    }

    const basicColors = {
        'blanco': '#FFFFFF',
        'negro': '#000000',
        'rojo': '#FF0000',
        'azul': '#0000FF',
        'verde': '#008000',
        'amarillo': '#FFFF00',
        'naranja': '#FFA500',
        'morado': '#800080',
        'rosa': '#FFC0CB',
        'gris': '#808080'
    };

    for (const [colorBase, hex] of Object.entries(basicColors)) {
        if (normalized.includes(colorBase)) {
            return hex;
        }
    }

    return '#9E9E9E';
}

/** Devuelve el estilo CSS para una bolita de color:
 *  - Si la variante tiene imagen, usa recorte circular (igual que las tarjetas del catálogo).
 *  - Si no, usa el color sólido hex.
 */
export function getColorSwatchStyle(vc) {
    const imgs = vc?.imagenes || [];
    if (imgs.length) {
        const sorted = [...imgs].sort((a, b) => (a.orden || 0) - (b.orden || 0));
        const frenteImg = (sorted.find(i => i.angulo === 'frente') || sorted[0])?.url || '';
        if (frenteImg) {
            const dp = vc.dotPosition || { x: 50, y: 15 };
            return `background-image:url('${frenteImg}');background-size:400%;background-position:${dp.x}% ${dp.y}%;`;
        }
    }
    if (vc?.hex) return `background-color:${vc.hex};`;
    return 'background-color:#ccc;';
}
