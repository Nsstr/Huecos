// /lib/utils.js

/**
 * Convierte fecha en formato DD-MM-YYYY → YYYY-MM-DD
 * Retorna null si la fecha no es válida.
 */
function convertirFormatoFecha(str) {
    if (!str) return null;

    const partes = str.split('-');
    if (partes.length !== 3) return null;

    const [dd, mm, yyyy] = partes;

    // Validaciones básicas
    if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
    if (isNaN(dd) || isNaN(mm) || isNaN(yyyy)) return null;

    const dia = parseInt(dd, 10);
    const mes = parseInt(mm, 10);
    const año = parseInt(yyyy, 10);

    if (dia < 1 || dia > 31) return null;
    if (mes < 1 || mes > 12) return null;
    if (año < 1900) return null;

    return `${año}-${mm}-${dd}`;
}


/**
 * Detecta automáticamente el delimitador más probable en texto pegado.
 * Revisa: tab (\t), coma, punto y coma.
 */
function detectarDelimitador(texto) {
    if (!texto) return ',';

    const primeraLinea = texto.split('\n')[0];

    const candidatos = [
        { delimiter: '\t', count: (primeraLinea.match(/\t/g) || []).length },
        { delimiter: ';', count: (primeraLinea.match(/;/g) || []).length },
        { delimiter: ',', count: (primeraLinea.match(/,/g) || []).length }
    ];

    candidatos.sort((a, b) => b.count - a.count);

    return candidatos[0].count > 0 ? candidatos[0].delimiter : ',';
}


module.exports = {
    convertirFormatoFecha,
    detectarDelimitador
};
