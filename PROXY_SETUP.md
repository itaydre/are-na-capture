# Backend Proxy Server Setup

This proxy server securely handles the OAuth token exchange with Are.na, storing the `client_secret` on the server side where it's safe.

## Why This Is Needed

Chrome extensions cannot securely store OAuth `client_secret` values. The Are.na API requires a `client_secret` for token exchange, so we use a backend proxy server to handle this securely.

## Setup Instructions

### 1. Install Dependencies

```bash
cd are-na-capture
npm install
```

### 2. Get Your Client Secret

1. Go to [Are.na Developer Settings](https://www.are.na/settings/applications)
2. Find your OAuth application
3. Copy the **Client Secret** (you may need to reveal it)

### 3. Set Environment Variable and Run

**Option A: Set inline (for testing)**
```bash
CLIENT_SECRET=your_client_secret_here node proxy-server.js
```

**Option B: Use a .env file (recommended for production)**

1. Create a `.env` file in the `are-na-capture` directory:
```bash
CLIENT_SECRET=your_client_secret_here
```

2. Install dotenv:
```bash
npm install dotenv
```

3. Update `proxy-server.js` to load .env:
```javascript
require('dotenv').config();
```

4. Run:
```bash
node proxy-server.js
```

### 4. Update Extension Configuration

1. Open `background.js`
2. Find the `PROXY_SERVER_URL` constant (or add it)
3. Set it to your proxy server URL:
   - For local development: `http://localhost:3000`
   - For production: Your deployed server URL

### 5. Test the Proxy

1. Start the proxy server
2. Visit `http://localhost:3000/health` in your browser
3. You should see: `{"status":"ok","message":"Are.na OAuth proxy server is running"}`

## Deployment Options

### Local Development
- Run on `localhost:3000`
- Update extension to use `http://localhost:3000`

### Production Deployment

**Option 1: Heroku**
```bash
heroku create your-app-name
heroku config:set CLIENT_SECRET=your_client_secret
git push heroku main
```

**Option 2: Railway**
1. Connect your GitHub repo
2. Set `CLIENT_SECRET` in environment variables
3. Deploy

**Option 3: Vercel/Netlify**
- These are primarily for frontend, but you can use serverless functions
- Create an API route that handles the token exchange

**Option 4: Your Own Server**
- Deploy the Node.js app to any server
- Set `CLIENT_SECRET` as an environment variable
- Make sure the server is accessible via HTTPS (required for Chrome extensions)

## Security Notes

- **Never commit** `CLIENT_SECRET` to version control
- Use environment variables or secure secret management
- The proxy server should only be accessible by your extension
- Consider adding rate limiting and request validation
- Use HTTPS in production

## Troubleshooting

### "CLIENT_SECRET environment variable is not set"
- Make sure you've set the environment variable before running
- Check that it's spelled correctly

### "CORS error" in extension
- Make sure `cors` middleware is enabled
- Check that the proxy URL in the extension matches the server URL

### "Connection refused"
- Make sure the proxy server is running
- Check the port number matches
- Verify the URL in `background.js` is correct

## Testing

1. Start the proxy server
2. Open the extension popup
3. Click "Login to Are.na"
4. Complete OAuth flow
5. Check proxy server logs for token exchange
