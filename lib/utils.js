// /lib/utils.js

// Función crucial para normalizar el formato de fecha (adaptada de su lógica original)
function convertirFormatoFecha(fechaString) {
  if (!fechaString) return null;
  
  // Reemplaza separadores comunes (/, ., espacio) por guiones
  const partes = fechaString.replace(/[\/\.\s]/g, '-').split('-');
  
  if (partes.length !== 3) return null;

  let [d, m, y] = partes.map(p => parseInt(p, 10));

  // Manejo de año de 2 dígitos (ej: 25 -> 2025). Asume 20xx.
  if (y < 100) y += 2000;
  
  // Validar fecha básica
  if (isNaN(d) || isNaN(m) || isNaN(y) || m < 1 || m > 12) return null;
  
  // Re-ordenar a formato estándar YYYY-MM-DD para PostgreSQL y JavaScript Date
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Su función original para detectar el delimitador de datos pegados
function detectarDelimitador(datos) {
    // Ejemplo simplificado: verificar el delimitador más probable en la primera línea
    if (!datos) return ','; 
    const primeraFila = datos.trim().split('\n')[0];
    if (primeraFila.includes(';')) return ';';
    if (primeraFila.includes('\t')) return '\t'; // Tabulador
    if (primeraFila.includes(',')) return ',';
    // Si no encuentra, asume que es un espacio o coma por defecto. Ajuste según sus datos.
    return ','; 
}

module.exports = { convertirFormatoFecha, detectarDelimitador };