// /api/cargar-datos.js (VERSIÓN ESTABLE Y CORREGIDA)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
// Importa funciones auxiliares (asumimos que existen en lib/utils.js)
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils'); 

// --- 1. CONFIGURACIÓN DE SUPABASE ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// --- 2. FUNCIÓN PARA CARGAR Y MAPEAR EL CSV DE DATOS MAESTROS ---
function loadDatav2Map() {
    console.log('Iniciando carga de DATAV2 desde CSV...');
    
    // RUTA ESTABLE PARA VERCEL: Se mueve un nivel arriba de 'api' y entra a 'lib'
    const csvPath = path.join(__dirname, '..', 'lib', 'datav2.csv'); 

    if (!fs.existsSync(csvPath)) {
        console.error(`ERROR CRÍTICO (ENOENT): Archivo no encontrado en la ruta: ${csvPath}`);
        // Lanzamos un error claro si el archivo no está
        throw new Error('CONFIG_ERROR: El archivo datav2.csv no fue incluido. Revise el .gitignore y vercel.json.'); 
    }

    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n').slice(1).filter(line => line.trim() !== '');

    const dataMap = {};
    const DELIMITER = ','; 
    const CODIGO_INTERNO_INDEX = 0; 
    const DEPARTAMENTO_INDEX = 2;   
    const CODIGO_EAN_INDEX = 5;     

    lines.forEach(line => {
        const columns = line.split(DELIMITER);
        if (columns.length > CODIGO_EAN_INDEX) {
            const codigoInterno = columns[CODIGO_INTERNO_INDEX].trim();
            if (codigoInterno) {
                dataMap[codigoInterno] = {
                    codigo_interno: codigoInterno,
                    departamento: columns[DEPARTAMENTO_INDEX].trim(),
                    codigo_ean: columns[CODIGO_EAN_INDEX].trim()
                };
            }
        }
    });

    console.log(`DATAV2 cargado. ${Object.keys(dataMap).length} registros mapeados.`);
    return dataMap;
}

// Carga la data maestra al inicio del script.
let mapaDataV2;
try {
    mapaDataV2 = loadDatav2Map();
} catch (error) {
    console.error("Fallo la carga de DATAV2:", error.message);
    mapaDataV2 = {};
}


// --- 3. HANDLER PRINCIPAL ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { rawData, fechaString } = req.body || {}; 
    
    // Validación de carga de Data Maestra
    if (Object.keys(mapaDataV2).length === 0) {
        // Devolver 503 Service Unavailable si la data maestra (que es crítica) no se cargó.
        return res.status(503).json({ success: false, message: 'Servicio no disponible: Catálogo de datos maestros (DATAV2) no cargado.' });
    }

    // ... (El resto de la lógica de parsing e inserción de Supabase)
    // ...

    const delimitador = detectarDelimitador(rawData);
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    const SC_CODIGO_INDEX = 0;
    const SC_CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      if (columnas.length < SC_CANTIDAD_HUECOS_INDEX + 1) continue;
      
      const codigoInterno = columnas[SC_CODIGO_INDEX] ? columnas[SC_CODIGO_INDEX].trim() : '';
      const cantidadHuecos = parseInt(columnas[SC_CANTIDAD_HUECOS_INDEX], 10);
      
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) continue; 
      
      const dataMaestra = mapaDataV2[codigoInterno] || {};

      filasProcesadas.push({
        fecha_scaneo: convertirFormatoFecha(fechaString),
        codigo_interno: codigoInterno,
        cantidad_huecos: cantidadHuecos,
        departamento: dataMaestra.departamento || 'N/A',
        codigo_ean: (dataMaestra.codigo_ean || '').padStart(13, '0'),
      });
    }

    if (filasProcesadas.length > 0) {
        const { error: insertError } = await supabase
            .from('scaneo_huecos')
            .insert(filasProcesadas);
        if (insertError) throw insertError;
    }

    return res.status(200).json({ success: true, count: filasProcesadas.length });

  } catch (error) {
    console.error('Error fatal en cargar-datos:', error.message);
    return res.status(500).json({ success: false, message: `Error interno del servidor: ${error.message}.` });
  }
};