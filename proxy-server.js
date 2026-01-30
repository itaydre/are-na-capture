// Backend proxy server for Are.na OAuth token exchange
// This server securely stores the client_secret and handles token exchange

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow requests from Chrome extension
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Get client_secret from environment variable
// Set this when running: CLIENT_SECRET=your_secret node proxy-server.js
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_SECRET) {
  console.error('ERROR: CLIENT_SECRET environment variable is not set!');
  console.error('Set it with: CLIENT_SECRET=your_secret node proxy-server.js');
  process.exit(1);
}

// Are.na OAuth endpoints
// Token endpoint is on dev.are.na according to API documentation
const ARE_NA_TOKEN_URL = 'https://dev.are.na/oauth/token';

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Are.na OAuth proxy server is running',
    endpoints: {
      health: '/health',
      tokenExchange: '/exchange-token (POST)'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Are.na OAuth proxy server is running' });
});

// Token exchange endpoint
app.post('/exchange-token', async (req, res) => {
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
    console.log('Token endpoint URL:', ARE_NA_TOKEN_URL);

    // Exchange authorization code for access token
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: client_id,
      client_secret: CLIENT_SECRET, // Securely stored on server
      redirect_uri: redirect_uri
    });
    
    console.log('Request body params:', {
      grant_type: 'authorization_code',
      code: code.substring(0, 20) + '...', // Log partial code for security
      client_id: client_id,
      redirect_uri: redirect_uri
    });

    const tokenResponse = await fetch(ARE_NA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody
    });
    
    console.log('Token response status:', tokenResponse.status, tokenResponse.statusText);
    console.log('Token response URL:', tokenResponse.url);

    const responseText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: responseText
      });

      // Try to parse error as JSON
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { error: 'unknown_error', error_description: responseText };
      }

      return res.status(tokenResponse.status).json(errorData);
    }

    // Parse successful response
    const tokenData = JSON.parse(responseText);
    console.log('Token exchange successful');

    // Return token data to extension
    res.json(tokenData);
  } catch (error) {
    console.error('Error in token exchange:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Are.na OAuth Proxy Server running on http://localhost:${PORT}`);
  console.log('Make sure to set CLIENT_SECRET environment variable');
  console.log('Example: CLIENT_SECRET=your_secret_here node proxy-server.js');
});
