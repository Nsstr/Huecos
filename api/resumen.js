const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { fecha } = req.query;
    
    // Convertir fecha al formato de la BD
    const fechaFormateada = formatearFechaBD(fecha);
    
    // Obtener datos de scaneo_huecos para la fecha
    const { data: datosHuecos, error } = await supabase
      .from('scaneo_huecos')
      .select('depto, sku')
      .eq('fecha', fechaFormateada);

    if (error) throw error;

    // Obtener detalles de departamentos
    const { data: detallesDepto } = await supabase
      .from('base')
      .select('*');

    const deptoDetalles = {};
    detallesDepto?.forEach(item => {
      deptoDetalles[item.codigo_depto] = item.nombre_depto;
    });

    // Contar SKUs por departamento
    const conteoDepto = {};
    let totalItems = 0;

    datosHuecos?.forEach(item => {
      const depto = item.depto?.trim();
      if (depto) {
        if (!conteoDepto[depto]) conteoDepto[depto] = 0;
        conteoDepto[depto]++;
        totalItems++;
      }
    });

    // Preparar resultado
    const resultado = {
      fecha: fechaFormateada,
      totalItems: totalItems,
      departamentos: []
    };

    // Ordenar departamentos
    const departamentos = Object.keys(conteoDepto).sort((a, b) => {
      return parseInt(a) - parseInt(b);
    });

    departamentos.forEach(depto => {
      if (conteoDepto[depto] > 0) {
        resultado.departamentos.push({
          codigo: depto,
          nombre: deptoDetalles[depto] || "Depto " + depto,
          cantidad: conteoDepto[depto]
        });
      }
    });

    res.status(200).json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function formatearFechaBD(fecha) {
  const partes = fecha.split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}