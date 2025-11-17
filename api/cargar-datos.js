// /api/cargar-datos.js (Código CORREGIDO)
const { createClient } = require('@supabase/supabase-js');
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils');

// Configuración de Supabase (las variables son inyectadas por Vercel)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    // 1. Validar y extraer datos de entrada de forma defensiva
    const { rawData, fechaString } = req.body || {}; 
    
    if (!rawData || !fechaString) {
        return res.status(400).json({ success: false, message: 'Faltan datos de entrada (fecha o datos crudos). Por favor, ingréselos nuevamente.' });
    }

    const fechaNormalizada = convertirFormatoFecha(fechaString);
    if (!fechaNormalizada) {
        return res.status(400).json({ success: false, message: 'La fecha ingresada no es válida. Use formato DD-MM-YYYY.' });
    }

    // 2. Obtener la data maestra (DATAV2) para enriquecer
    const { data: dataV2, error: errorV2 } = await supabase
      .from('datav2')
      .select('codigo_interno, departamento, codigo_ean');

    if (errorV2) throw errorV2;
    
    // Mapeo en memoria (dataV2 || [] asegura que sea un array)
    const dataV2Array = dataV2 || []; 
    const mapaDataV2 = dataV2Array.reduce((acc, row) => {
        acc[row.codigo_interno] = row;
        return acc;
    }, {});
    
    // 3. Procesar datos pegados (Raw Data)
    const delimitador = detectarDelimitador(rawData);
    const filasProcesadas = [];
    const filas = rawData.trim().split('\n').filter(line => line.trim() !== '');

    // Se asume que el Código Interno está en la Columna 1 (Índice 0) 
    // y la Cantidad de Huecos está en la Columna 8 (Índice 7)
    const CODIGO_INDEX = 0;
    const CANTIDAD_HUECOS_INDEX = 7; 
    
    for (const fila of filas) {
      const columnas = fila.split(delimitador);
      
      // Mínimo de columnas necesarias
      if (columnas.length < CANTIDAD_HUECOS_INDEX + 1) {
          console.warn(`Saltando fila: No tiene suficientes columnas: ${fila}`);
          continue; 
      }
      
      const codigoInterno = columnas[CODIGO_INDEX] ? columnas[CODIGO_INDEX].trim() : '';
      const cantidadHuecosRaw = columnas[CANTIDAD_HUECOS_INDEX];
      const cantidadHuecos = parseInt(cantidadHuecosRaw, 10);
      
      // Validar datos esenciales
      if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) {
          console.warn(`Saltando fila: Código inválido o cantidad de huecos no positiva: ${fila}`);
          continue; 
      }
      
      // Obtener datos maestros
      const dataMaestra = mapaDataV2[codigoInterno] || {};

      filasProcesadas.push({
        fecha_scaneo: fechaNormalizada,
        codigo_interno: codigoInterno,
        cantidad_huecos: cantidadHuecos,
        departamento: dataMaestra.departamento || 'N/A',
        codigo_ean: (dataMaestra.codigo_ean || '').padStart(13, '0'),
        // Añadir más campos si es necesario
      });
    }

    // 4. Inserción por lotes (Bulk Insert)
    const { error: insertError } = await supabase
        .from('scaneo_huecos')
        .insert(filasProcesadas);

    if (insertError) throw insertError;

    return res.status(200).json({ success: true, count: filasProcesadas.length });

  } catch (error) {
    console.error('Error en cargar-datos:', error.message);
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
};