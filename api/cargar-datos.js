// /api/cargar-datos.js (VERSIÓN SIN DEPENDENCIA DE SUPABASE PARA DATAV2)

// Importa los datos maestros directamente desde el archivo JSON local
const mapaDataV2 = require('../lib/datav2.json'); 
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils');

// Se mantienen los requerimientos de Supabase/DB para la inserción, 
// pero la conexión DEBE ser válida para insertar los datos de huecos.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);


module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { rawData, fechaString } = req.body || {}; 
    
    if (!rawData || !fechaString) {
        return res.status(400).json({ success: false, message: 'Faltan datos de entrada (fecha o datos crudos).' });
    }

    const fechaNormalizada = convertirFormatoFecha(fechaString);
    if (!fechaNormalizada) {
        return res.status(400).json({ success: false, message: 'La fecha ingresada no es válida. Use formato DD-MM-YYYY.' });
    }

    // El mapeo de datos maestros es instantáneo:
    // const mapaDataV2 = dataV2 || []; // <--- ESTA LÍNEA ES ELIMINADA.

    // 3. Procesar datos pegados (Raw Data)
    const delimitador = detectarDelimitador(rawData);
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    const CODIGO_INDEX = 0;
    const CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      
      if (columnas.length < CANTIDAD_HUECOS_INDEX + 1) {
          console.warn(`Saltando fila: No tiene suficientes columnas: ${fila}`);
          continue; 
      }
      
      const codigoInterno = columnas[CODIGO_INDEX] ? columnas[CODIGO_INDEX].trim() : '';
      const cantidadHuecosRaw = columnas[CANTIDAD_HUECOS_INDEX];
      const cantidadHuecos = parseInt(cantidadHuecosRaw, 10);
      
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) {
          console.warn(`Saltando fila: Código inválido o cantidad de huecos no positiva: ${fila}`);
          continue; 
      }
      
      // Obtener datos maestros del JSON local
      const dataMaestra = mapaDataV2[codigoInterno] || {};

      filasProcesadas.push({
        fecha_scaneo: fechaNormalizada,
        codigo_interno: codigoInterno,
        cantidad_huecos: cantidadHuecos,
        // Usamos los datos del JSON local
        departamento: dataMaestra.departamento || 'N/A', 
        codigo_ean: (dataMaestra.codigo_ean || '').padStart(13, '0'),
      });
    }

    // 4. Inserción por lotes (A ESTE PUNTO LA CONEXIÓN DB DEBE SER VÁLIDA PARA INSERTAR)
    if (filasProcesadas.length > 0) {
        const { error: insertError } = await supabase
            .from('scaneo_huecos')
            .insert(filasProcesadas);
    
        if (insertError) throw insertError;
    }

    return res.status(200).json({ success: true, count: filasProcesadas.length });

  } catch (error) {
    console.error('Error en cargar-datos:', error.message);
    // Si la inserción falla por DB (aunque el enriquecimiento fue local), se reporta.
    return res.status(500).json({ success: false, message: 'Error interno del servidor. ¿Son correctas las claves de Supabase para la inserción?' });
  }
};