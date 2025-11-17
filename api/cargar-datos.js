// /api/cargar-datos.js (VERSIÓN CON LECTOR DE CSV LOCAL)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils');

// --- CONEXIÓN A SUPABASE (SE MANTIENE SOLO PARA LA INSERCIÓN DE HUECOS) ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// --- 1. FUNCIÓN PARA CARGAR Y MAPEAR EL CSV DE DATOS MAESTROS ---
function loadDatav2Map() {
    console.log('Cargando DATAV2 desde CSV...');
    
    // Ruta ABSOLUTA (el archivo está un nivel arriba de 'api' y luego dentro de 'lib')
    // __dirname apunta a /var/task/api
    const csvPath = path.join(__dirname, '..', 'lib', 'datav2.csv'); 

    console.log(`Intentando cargar CSV desde: ${csvPath}`); 
    
    // **VERIFICACIÓN CRÍTICA**
    if (!fs.existsSync(csvPath)) {
        // Si el error persiste aquí, el archivo NO FUE INCLUIDO en el despliegue.
        console.error(`ERROR: Archivo CSV no encontrado en: ${csvPath}`);
        throw new Error(`[CRÍTICO] El archivo datav2.csv NO existe en el entorno Vercel. Verifique la configuración 'includeFiles' en vercel.json.`);
    }

    // Leer el archivo CSV completo de forma síncrona (esto ocurre una vez por cold start)
    const csvData = fs.readFileSync(csvPath, 'utf8');
    
    // Dividir por líneas y remover la primera línea (encabezado)
    const lines = csvData.split('\n').slice(1).filter(line => line.trim() !== '');

    const dataMap = {};
    const DELIMITER = ','; // Asumimos coma para CSV estándar

    // Mapeo basado en la imagen de encabezados de su hoja DATAV2:
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

// Cargar y mapear los datos maestros al inicio del Serverless Function
const mapaDataV2 = loadDatav2Map();

// --- 2. HANDLER PRINCIPAL (Lógica de inserción de huecos) ---
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { rawData, fechaString } = req.body || {}; 
    
    // Validación inicial
    if (Object.keys(mapaDataV2).length === 0) {
        return res.status(500).json({ success: false, message: 'Error interno: No se pudo cargar el catálogo de DATAV2.' });
    }
    // ... (restos de validaciones de rawData y fecha)

    const fechaNormalizada = convertirFormatoFecha(fechaString);
    if (!fechaNormalizada) {
        return res.status(400).json({ success: false, message: 'La fecha ingresada no es válida. Use formato DD-MM-YYYY.' });
    }
    
    // 3. Procesar datos pegados (Raw Data)
    const delimitador = detectarDelimitador(rawData); // Se asume delimitador de coma para el Scaneo también
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    // Índices para los datos de Scaneo (Columna 1: Código, Columna 8: Cantidad)
    const SC_CODIGO_INDEX = 0;
    const SC_CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      
      if (columnas.length < SC_CANTIDAD_HUECOS_INDEX + 1) continue;
      
      const codigoInterno = columnas[SC_CODIGO_INDEX] ? columnas[SC_CODIGO_INDEX].trim() : '';
      const cantidadHuecos = parseInt(columnas[SC_CANTIDAD_HUECOS_INDEX], 10);
      
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) continue; 
      
      // Obtener datos maestros del mapa cargado desde el CSV
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
    console.error('Error fatal en cargar-datos:', error);
    return res.status(500).json({ success: false, message: `Error interno: ${error.message}.` });
  }
};