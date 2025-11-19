// /api/cargar-datos.js

// Ya no se requiere 'fs' ni 'path'
const { createClient } = require('@supabase/supabase-js');
// Asumimos que esta función auxiliar existe en lib/utils.js
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils'); 

// --- 1. CONFIGURACIÓN DE SUPABASE ---
// Asegúrese de que estas variables estén configuradas en Vercel
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// --- 2. FUNCIÓN PARA CARGAR Y MAPEAR DATOS MAESTROS DESDE SUPABASE ---
/**
 * Carga los datos de DATAV2 desde la tabla 'datos_maestros' en Supabase.
 * @returns {Promise<Object>} Un mapa de objetos indexado por codigo_interno.
 */
async function loadDatav2Map() {
    console.log('Iniciando carga de DATAV2 desde SUPABASE...');
    
    // Nombres EXACTOS de las columnas de su tabla 'data', encerrados en comillas dobles.
    const CODIGO_COL = '"SKU ID"'; 
    const DEPARTAMENTO_COL = '"Clase DESC"'; // Usaremos Clase DESC como 'departamento' para mapeo
    const EAN_COL = '"Código SKU ID"'; 
    
    // La consulta ahora usa los nombres de columna con comillas dobles
    const { data: rawData, error } = await supabase
        .from('data') 
        .select(`${CODIGO_COL}, ${DEPARTAMENTO_COL}, ${EAN_COL}`); 

    if (error) {
        // Esto registrará el error de Supabase (si es que existe)
        console.error('Error de Consulta en Supabase:', error);
        throw new Error(`FALLO_SUPABASE: No se pudo cargar el catálogo. Mensaje: ${error.message}`);
    }

    const dataMap = {};
    rawData.forEach(item => {
        // Mapeamos los datos de la base de datos a los nombres que espera su Handler 
        const codigoInterno = item['SKU ID'] ? String(item['SKU ID']).trim() : ''; // Usamos el nombre real de la columna para acceder al valor
        
        if (codigoInterno) {
            dataMap[codigoInterno] = {
                codigo_interno: codigoInterno,
                departamento: item['Clase DESC'] || 'N/A', // Usamos Clase DESC como departamento
                codigo_ean: item['Código SKU ID'] || '0'
            };
        }
    });

    console.log(`DATAV2 cargado. ${Object.keys(dataMap).length} registros mapeados.`);
    return dataMap;
}

// Carga los datos maestros una vez (promesa) en el arranque en frío.
// Esto mejora el rendimiento, ya que la consulta solo se ejecuta una vez por instancia de función.
let mapaDataV2Promise = loadDatav2Map().catch(error => {
    console.error("Fallo la carga de DATAV2, mapaDataV2 será un objeto vacío:", error.message);
    return {}; 
});


// --- 3. HANDLER PRINCIPAL (Lógica de inserción de huecos) ---
module.exports = async (req, res) => {
  // Solo permite solicitudes POST
  if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. Esperar a que los datos maestros se carguen
    const mapaDataV2 = await mapaDataV2Promise;

    if (Object.keys(mapaDataV2).length === 0) {
        // Devuelve 503 si el catálogo (DATAV2) no se cargó por fallo de Supabase.
        return res.status(503).json({ 
            success: false, 
            message: 'Servicio no disponible: Catálogo de datos maestros no cargado.' 
        });
    }

    // 2. Extracción y Validación de Datos de Entrada
    const { rawData, fechaString } = req.body || {}; 
    
    if (!rawData || !fechaString) {
        return res.status(400).json({ success: false, message: 'Faltan datos de entrada (fecha o datos crudos).' });
    }

    const fechaNormalizada = convertirFormatoFecha(fechaString);
    if (!fechaNormalizada) {
        return res.status(400).json({ success: false, message: 'La fecha ingresada no es válida. Use formato DD-MM-YYYY.' });
    }
    
    // 3. Procesar datos pegados (Raw Data)
    const delimitador = detectarDelimitador(rawData);
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    // Índices del Raw Data de Scaneo
    const SC_CODIGO_INDEX = 0;
    const SC_CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      
      // Valida que la fila tenga suficientes columnas
      if (columnas.length < SC_CANTIDAD_HUECOS_INDEX + 1) continue;
      
      const codigoInterno = columnas[SC_CODIGO_INDEX] ? columnas[SC_CODIGO_INDEX].trim() : '';
      const cantidadHuecos = parseInt(columnas[SC_CANTIDAD_HUECOS_INDEX], 10);
      
      // Valida que el código y la cantidad sean válidos
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) continue; 
      
      // Obtener datos maestros del mapa
      const dataMaestra = mapaDataV2[codigoInterno] || {};

      filasProcesadas.push({
        fecha_scaneo: fechaNormalizada,
        codigo_interno: codigoInterno,
        cantidad_huecos: cantidadHuecos,
        // Usar datos maestros o 'N/A' si no se encuentra
        departamento: dataMaestra.departamento || 'N/A',
        // Asegurar que el EAN tenga 13 dígitos
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

    // 5. Respuesta exitosa
    return res.status(200).json({ success: true, count: filasProcesadas.length });

  } catch (error) {
    // 1. Determina un mensaje de error seguro.
    // Intenta leer .message. Si falla, convierte el objeto entero a cadena.
    const errorMessage = error && error.message 
                         ? error.message 
                         : (typeof error === 'string' ? error : 'Error desconocido o no estructurado en la ejecución principal.');

    console.error('Error fatal en cargar-datos:', errorMessage);
    
    // 2. Devuelve la respuesta 500 al cliente
    return res.status(500).json({ 
        success: false, 
        message: `Error interno del servidor: ${errorMessage}.` 
    });
  }
};