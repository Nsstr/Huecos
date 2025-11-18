// /api/cargar-datos.js

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
// Importa funciones auxiliares (asumimos que existen en lib/utils.js)
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils'); 

// --- 1. CONFIGURACIÓN DE SUPABASE (PARA LA INSERCIÓN DE HUECOS) ---
// Las variables SUPABASE_URL y SUPABASE_SERVICE_KEY DEBEN estar en Vercel
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// --- 2. FUNCIÓN PARA CARGAR Y MAPEAR EL CSV DE DATOS MAESTROS ---
function loadDatav2Map() {
    console.log('Iniciando carga de DATAV2 desde CSV...');
    
    // RUTA ESTABLE PARA VERCEL: Se mueve un nivel arriba de 'api' y entra a 'lib'
    // __dirname es el directorio actual del archivo JS (/var/task/api)
    const csvPath = path.join(__dirname, '..', 'lib', 'datav2.csv'); 

    // **VERIFICACIÓN CRÍTICA DEL ERROR ENOENT**
    if (!fs.existsSync(csvPath)) {
        console.error(`ERROR CRÍTICO (ENOENT): Archivo no encontrado en la ruta: ${csvPath}`);
        // Lanzar un error para que Vercel lo muestre claramente en el log.
        throw new Error('CONFIG_ERROR: El archivo datav2.csv no fue incluido. Revise el .gitignore y vercel.json.'); 
    }

    // Lectura del CSV (síncrona, solo ocurre una vez por cold start)
    const csvData = fs.readFileSync(csvPath, 'utf8');
    
    // Dividir por líneas y remover la primera línea (encabezado)
    const lines = csvData.split('\n').slice(1).filter(line => line.trim() !== '');

    const dataMap = {};
    const DELIMITER = ','; // Delimitador estándar para su CSV

    // Mapeo basado en su hoja DATAV2: (A=0, C=2, F=5)
    const CODIGO_INTERNO_INDEX = 0; // Columna A
    const DEPARTAMENTO_INDEX = 2;   // Columna C
    const CODIGO_EAN_INDEX = 5;     // Columna F

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
    // Si la carga falla, el mapa estará vacío, y el handler principal devolverá un error 500.
    mapaDataV2 = {};
}


// --- 3. HANDLER PRINCIPAL (Lógica de inserción de huecos) ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { rawData, fechaString } = req.body || {}; 
    
    // Validación de carga de Data Maestra
    if (Object.keys(mapaDataV2).length === 0) {
        return res.status(500).json({ success: false, message: 'Error interno: El catálogo de DATAV2 no pudo ser cargado al iniciar el servidor.' });
    }

    // Validación de Datos de Entrada
    if (!rawData || !fechaString) {
        return res.status(400).json({ success: false, message: 'Faltan datos de entrada (fecha o datos crudos).' });
    }

    const fechaNormalizada = convertirFormatoFecha(fechaString);
    if (!fechaNormalizada) {
        return res.status(400).json({ success: false, message: 'La fecha ingresada no es válida. Use formato DD-MM-YYYY.' });
    }
    
    // Procesar datos pegados (Raw Data)
    const delimitador = detectarDelimitador(rawData);
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    // Índices para los datos de Scaneo (Columna 1=0, Columna 8=7)
    const SC_CODIGO_INDEX = 0;
    const SC_CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      
      if (columnas.length < SC_CANTIDAD_HUECOS_INDEX + 1) continue;
      
      const codigoInterno = columnas[SC_CODIGO_INDEX] ? columnas[SC_CODIGO_INDEX].trim() : '';
      const cantidadHuecos = parseInt(columnas[SC_CANTIDAD_HUECOS_INDEX], 10);
      
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) continue; 
      
      // Obtener datos maestros del mapa cargado
      const dataMaestra = mapaDataV2[codigoInterno] || {};

      filasProcesadas.push({
        fecha_scaneo: fechaNormalizada,
        codigo_interno: codigoInterno,
        cantidad_huecos: cantidadHuecos,
        departamento: dataMaestra.departamento || 'N/A',
        codigo_ean: (dataMaestra.codigo_ean || '').padStart(13, '0'),
      });
    }

    // 4. Inserción por lotes en Supabase
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