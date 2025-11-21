const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { fecha, datos } = req.body;
    
    // Procesar datos (similar a la función procesarDatos original)
    const lineas = datos.split(/\r?\n/).filter(linea => linea.trim() !== "");
    const filasAInsertar = [];

    for (const linea of lineas) {
      if (!linea.trim()) continue;

      const delimitador = detectarDelimitador(linea);
      const columnasPega = linea.split(delimitador, 10);

      while (columnasPega.length < 10) {
        columnasPega.push("");
      }

      // Obtener datos de referencia de DATAV2
      const { data: datosRef, error } = await supabase
        .from('datav2')
        .select('*')
        .eq('sku', columnasPega[0]?.trim())
        .single();

      const filaAInsertar = {
        fecha: formatearFechaBD(fecha),
        sku: columnasPega[0]?.trim() || '',
        // ... mapear otras columnas según tu estructura
        depto: datosRef?.depto || '',
        codigo: datosRef?.columna_f || '',
        pasillo: datosRef?.columna_e || '',
        created_at: new Date().toISOString()
      };

      filasAInsertar.push(filaAInsertar);
    }

    // Insertar en Supabase
    const { data, error } = await supabase
      .from('scaneo_huecos')
      .insert(filasAInsertar);

    if (error) throw error;

    res.status(200).json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function detectarDelimitador(linea) {
  const delimitadores = [";", ",", ":", ".", "/", "-", "_", "|"];
  let maxParts = 0;
  let delActual = ";";
  
  for (const del of delimitadores) {
    const partes = linea.split(del).length;
    if (partes > maxParts) {
      maxParts = partes;
      delActual = del;
    }
  }
  return delActual;
}

function formatearFechaBD(fecha) {
  const partes = fecha.split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}