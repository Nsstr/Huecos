// api/test.js - Para probar que la API funciona
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    message: '✅ TEST API WORKING!',
    timestamp: new Date().toISOString(),
    method: req.method
  });
}