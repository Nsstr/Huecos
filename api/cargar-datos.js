// /api/cargar-datos.js

const { createClient } = require('@supabase/supabase-js');
// Asegúrese de que lib/utils.js existe en el mismo nivel que api/ y que exporta correctamente.
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils'); 

// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Inicialización del cliente. Clave de servicio usada directamente.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);


// --- 2. FUNCIÓN PARA CARGAR Y MAPEAR DATOS MAESTROS DESDE SUPABASE ---
async function loadDatav2Map() {
    console.log('Iniciando carga de DATAV2 desde SUPABASE...');
    
    // Nombres EXACTOS de las columnas con comillas dobles para manejar espacios.
    const columnasSQL = '"SKU ID", "Clase DESC", "Código SKU ID"'; 
    
    const { data: rawData, error } = await supabase
        .from('data') 
        .select(columnasSQL); 

    if (error) {
        console.error('Error de Consulta en Supabase:', error);
        throw new Error(`FALLO_SUPABASE: No se pudo cargar el catálogo. Mensaje: ${error.message}`);
    }

    const dataMap = {};
    rawData.forEach(item => {
        const codigoInterno = item['SKU ID'] ? String(item['SKU ID']).trim() : '';
        
        if (codigoInterno) {
            dataMap[codigoInterno] = {
                codigo_interno: codigoInterno,
                departamento: item['Clase DESC'] || 'N/A', 
                codigo_ean: item['Código SKU ID'] || '0'
            };
        }
    });

    console.log(`DATAV2 cargado. ${Object.keys(dataMap).length} registros mapeados.`);
    return dataMap;
}

// Inicialización de la promesa de datos maestros. Captura fallos para que la carga no se rompa.
let mapaDataV2Promise = loadDatav2Map().catch(error => {
    console.error("Fallo la carga de DATAV2, mapaDataV2 será un objeto vacío:", error.message);
    return {}; 
});


// --- 3. HANDLER PRINCIPAL (Lógica de inserción de huecos) ---
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // 1. Esperar a que los datos maestros se carguen
        const mapaDataV2 = await mapaDataV2Promise;

        if (Object.keys(mapaDataV2).length === 0) {
            // Error 503: Si la carga falló (generalmente por credenciales o conexión de Supabase).
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

        // 5. Respuesta exitosa
        return res.status(200).json({ success: true, count: filasProcesadas.length });

    } catch (error) {
        // Manejo de error final para errores de inserción o errores no controlados.
        const errorMessage = error && error.message 
                             ? error.message 
                             : 'Error desconocido o no estructurado en la ejecución principal.';

        console.error('Error fatal en cargar-datos:', errorMessage);
        
        return res.status(500).json({ 
            success: false, 
            message: `Error interno del servidor: ${errorMessage}.` 
        });
    }
};