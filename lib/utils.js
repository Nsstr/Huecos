// /lib/utils.js

// Función crucial para normalizar el formato de fecha (adaptada y corregida)
function convertirFormatoFecha(fechaString) {
    if (!fechaString) return null;
    
    // 1. Limpia y normaliza separadores a guiones, eliminando cualquier espacio residual.
    const partes = fechaString
        .trim() // Elimina espacios al inicio y al final
        .replace(/[\/\.\s]/g, '-') // Reemplaza separadores comunes por guiones
        .split('-')
        .filter(p => p.length > 0); // Elimina entradas vacías (ej: si hay doble guion)
    
    if (partes.length !== 3) return null;

    // 2. Parsed de enteros con manejo de limpieza (usamos slice() para evitar modificar el array original)
    let [d, m, y] = partes.slice(0, 3).map(p => parseInt(p.trim(), 10));

    // 3. Manejo de año de 2 dígitos (ej: 25 -> 2025). Asume 20xx.
    if (y < 100) y += 2000;
    
    // 4. Validación de fecha básica (y día/mes/año no son NaN)
    if (isNaN(d) || isNaN(m) || isNaN(y) || m < 1 || m > 12 || d < 1 || d > 31) {
        return null;
    }
    
    // 5. Re-ordenar a formato estándar YYYY-MM-DD para Supabase/PostgreSQL
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Su función original para detectar el delimitador de datos pegados (sin cambios necesarios)
function detectarDelimitador(datos) {
    if (!datos) return ','; 
    const primeraFila = datos.trim().split('\n')[0];
    if (primeraFila.includes(';')) return ';';
    if (primeraFila.includes('\t')) return '\t'; // Tabulador
    if (primeraFila.includes(',')) return ',';
    return ','; 
}

module.exports = { convertirFormatoFecha, detectarDelimitador };