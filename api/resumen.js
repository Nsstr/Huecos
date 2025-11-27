// api/resumen.js - CommonJS simple
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  console.log('API /resumen recibió GET');
  
  // Respuesta simple
  return res.status(200).json({
    fecha: req.query.fecha || '23/11/2025',
    totalItems: 10,
    departamentos: [
      { codigo: '01', nombre: 'TEST 1', cantidad: 4 },
      { codigo: '02', nombre: 'TEST 2', cantidad: 6 }
    ]
  });
};
