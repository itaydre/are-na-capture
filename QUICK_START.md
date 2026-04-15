# Quick Start Guide

## Step 1: Configure Your Are.na OAuth App

1. Open **https://www.are.na/settings/applications**
2. Open the OAuth app you want this extension to use
3. Add this redirect URI:
   `https://<your-extension-id>.chromiumapp.org/`
4. Copy the app's **Client ID**
5. Put that value into `manifest.json` under `oauth2.client_id`

This extension now uses PKCE, so you do not need a proxy server or client secret.

## Step 2: Reload the Extension

1. Open `chrome://extensions/`
2. Find **Are.na Capture**
3. Click the reload icon

## Step 3: Test Authentication

1. Click the extension icon
2. Click **Login to Are.na**
3. Complete the Are.na authorization flow
4. You should return to the extension already signed in

## Troubleshooting

### "Login completed without an authorization code"
- Make sure the redirect URI in your Are.na app exactly matches `https://<your-extension-id>.chromiumapp.org/`
- Reload the extension after changing `manifest.json`

### "Token exchange failed"
- Confirm the `client_id` in `manifest.json` belongs to your own Are.na OAuth app
- Confirm that same app has the Chrome redirect URI registered
- Try the flow once more after reloading the extension

## Next Steps

- You can delete or ignore the old proxy/Vercel deployment pieces
- Authentication is now handled directly between the extension and Are.na
