// Vercel serverless function for Are.na OAuth token exchange

const fetch = require('node-fetch');

const CLIENT_SECRET = process.env.CLIENT_SECRET;
const ARE_NA_TOKEN_URL = 'https://dev.are.na/oauth/token';

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CLIENT_SECRET) {
    console.error('CLIENT_SECRET environment variable is not set');
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Server configuration error'
    });
  }

  try {
    const { code, client_id, redirect_uri } = req.body;

    // Validate required parameters
    if (!code || !client_id || !redirect_uri) {
      return res.status(400).json({
        error: 'missing_parameters',
        error_description: 'Missing required parameters: code, client_id, or redirect_uri'
      });
    }

    console.log('Exchanging token for:', { client_id, redirect_uri });

    // Exchange authorization code for access token
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: client_id,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirect_uri
    });

    const tokenResponse = await fetch(ARE_NA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody
    });

    console.log('Token response status:', tokenResponse.status);

    const responseText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', responseText);

      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { error: 'unknown_error', error_description: responseText };
      }

      return res.status(tokenResponse.status).json(errorData);
    }

    const tokenData = JSON.parse(responseText);
    console.log('Token exchange successful');

    return res.status(200).json(tokenData);
  } catch (error) {
    console.error('Error in token exchange:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
};
