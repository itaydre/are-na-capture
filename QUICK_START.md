# Quick Start Guide

## Step 1: Get Your Client Secret

1. Open your browser and go to: **https://www.are.na/settings/applications**
2. Find your OAuth application (the one you created for this extension)
3. Look for **Client Secret** - you may need to click "Show" or "Reveal" to see it
4. **Copy the Client Secret** (it's a long string of characters)

## Step 2: Start the Proxy Server

Open a terminal in the `are-na-capture` directory and run:

**Option A: Using the helper script (easiest)**
```bash
./start-proxy.sh YOUR_CLIENT_SECRET_HERE
```

**Option B: Direct command**
```bash
CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE node proxy-server.js
```

Replace `YOUR_CLIENT_SECRET_HERE` with the actual Client Secret you copied.

You should see:
```
Are.na OAuth Proxy Server running on http://localhost:3000
```

**Keep this terminal window open** - the server needs to keep running.

## Step 3: Test the Proxy Server

Open your browser and visit: **http://localhost:3000/health**

You should see:
```json
{"status":"ok","message":"Are.na OAuth proxy server is running"}
```

If you see this, the server is working! ✅

## Step 4: Reload the Extension

1. Open Chrome and go to: **chrome://extensions/**
2. Find **"Are.na Element Capture"**
3. Click the **reload icon** (circular arrow) 🔄

## Step 5: Test Authentication

1. Click the extension icon in your Chrome toolbar
2. Click **"Login to Are.na"**
3. Complete the OAuth authorization
4. You should be redirected back and logged in! ✅

## Troubleshooting

### "Cannot connect to proxy server"
- Make sure the proxy server is running (check the terminal)
- Make sure it's running on `http://localhost:3000`
- Try visiting `http://localhost:3000/health` in your browser

### "CLIENT_SECRET environment variable is not set"
- Make sure you included the Client Secret when starting the server
- Check that there are no spaces around the `=` sign
- Try using the helper script: `./start-proxy.sh YOUR_SECRET`

### Server won't start
- Make sure you ran `npm install` first
- Check that Node.js is installed: `node --version`
- Make sure you're in the `are-na-capture` directory

## Next Steps

Once everything is working:
- The proxy server needs to stay running while you use the extension
- For production, you'll want to deploy this server (see PROXY_SETUP.md)
- The extension is already configured to use `http://localhost:3000`
