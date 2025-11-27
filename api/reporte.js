// api/reporte.js - CommonJS simple
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  console.log('API /reporte recibió POST');
  
  // Respuesta simple
  return res.status(200).json({
    success: true,
    message: 'Reporte generado',
    timestamp: new Date().toISOString()
  });
};
