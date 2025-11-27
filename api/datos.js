// api/datos.js - ENDPOINT UNIVERSAL
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // CARGAR DATOS DESDE GOOGLE SHEETS (transición)
      const response = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2hQjvDxU5W6k2n7N7Z4QaJ7Y8xXbL6pM0yFvGgPqyHrYlWmTt0cA1B9oQyHdS5wUe3fXjKqY/pub?gid=0&single=true&output=csv');
      
      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
      
      const csvData = await response.text();
      
      res.status(200).json({ 
        success: true, 
        data: csvData 
      });

    } else if (req.method === 'POST') {
      // GUARDAR DATOS EN SUPABASE (futuro)
      const { fecha, datos } = req.body;
      
      // Por ahora solo simulamos guardado
      console.log('📝 Guardando datos para:', fecha);
      console.log('Datos:', datos);
      
      res.status(200).json({ 
        success: true, 
        message: 'Datos guardados (simulación)',
        inserted: datos.split('\n').length - 1
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Error en el servidor',
      message: error.message 
    });
  }
}