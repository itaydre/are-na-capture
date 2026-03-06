# Are.na Element Capture Chrome Extension

A Chrome extension that allows you to capture any HTML element from web pages as images and upload them directly to your Are.na channels.

## Features

- **Element Selection**: Hover over and click any HTML element on a webpage to capture it
- **Multiple Activation Methods**:
  - Click the extension icon and press "Start Capture"
  - Right-click context menu option "Capture Element to Are.na"
  - Keyboard shortcut: `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
- **OAuth Authentication**: Secure authentication with your Are.na account
- **Channel Selection**: Search and choose from your Are.na channels
- **Channel Creation**: Create new channels directly from the extension with privacy controls (Open, Closed, Private)
- **High-Quality Capture**: Uses Chrome's native screenshot API with device pixel ratio support

## Installation

### 1. Clone or Download

Download or clone this repository to your local machine.

### 2. Register OAuth Application with Are.na

1. Go to [Are.na Developer Settings](https://www.are.na/settings/applications)
2. Click "New Application" or "Create Application"
3. Fill in the application details:
   - **Name**: Are.na Element Capture (or any name you prefer)
   - **Redirect URI**: You'll get this after loading the extension (see step 5)
4. Save the application and copy the **Client ID** and **Client Secret**

### 3. Configure the Extension

1. Open `manifest.json`
2. Find the `oauth2` section and replace `YOUR_CLIENT_ID_HERE` with your Client ID:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE",
     "scopes": ["read", "write"]
   }
   ```

### 4. Deploy the Proxy Server

The extension uses a backend proxy to securely exchange OAuth tokens (keeping your Client Secret server-side).

**Option A: Deploy to Vercel (recommended)**

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and log in
2. From the project root, run:
   ```bash
   vercel
   ```
3. Set the `CLIENT_SECRET` environment variable in your Vercel project settings
4. Update `PROXY_SERVER_URL` in `background.js` to your Vercel deployment URL

**Option B: Run locally**

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the proxy server:
   ```bash
   CLIENT_SECRET=your_secret_here npm start
   ```
3. Update `PROXY_SERVER_URL` in `background.js` to `http://localhost:3000`

See [PROXY_SETUP.md](PROXY_SETUP.md) for more deployment options.

### 5. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `are-na-capture` directory

### 6. Set the Redirect URI

1. After loading the extension, open the browser console (F12 on the background service worker) and run:
   ```javascript
   chrome.identity.getRedirectURL()
   ```
2. Copy the returned URL (looks like `https://[extension-id].chromiumapp.org/`)
3. Go back to your Are.na application settings and add this URL as the **Redirect URI**
4. Save the application settings

## Usage

### First Time Setup

1. Click the extension icon in your Chrome toolbar
2. Click "Login to Are.na" to authenticate
3. Authorize the application on Are.na
4. You'll be redirected back and logged in

### Capturing Elements

1. Navigate to any webpage
2. Activate capture mode:
   - Click the extension icon → "Start Capture"
   - Right-click → "Capture Element to Are.na"
   - Press `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac)
3. Hover over elements to see them highlighted
4. Click the element you want to capture
5. The popup opens with your captured element preview
6. Select a channel (or create a new one with "+ New")
7. Click "Upload to Are.na"

### Creating Channels

1. In the popup, click "+ New" next to "Recent channels"
2. Enter a channel name
3. Choose a privacy status: Closed, Open, or Private
4. Click "Create"
5. The new channel is auto-selected and ready for upload

### Tips

- Press `ESC` while in capture mode to cancel
- Use the search bar to quickly find channels
- The captured image is a high-quality PNG
- Captures expire after 5 minutes — upload promptly

## Troubleshooting

### "OAuth client ID not configured" Error
- Make sure you've replaced `YOUR_CLIENT_ID_HERE` in `manifest.json` with your actual Client ID
- Reload the extension after making changes

### "Token exchange failed: Cannot connect to proxy server"
- Verify your proxy server is running and accessible
- Check that `PROXY_SERVER_URL` in `background.js` matches your deployment URL
- Ensure `CLIENT_SECRET` is set in the proxy server environment

### "No authorization code received" Error
- Verify that your Redirect URI in Are.na matches exactly what `chrome.identity.getRedirectURL()` returns

### "Failed to fetch channels" Error
- Check your internet connection
- Try logging out and back in
- Check that your OAuth application has read and write scopes

### Capture Mode Not Starting
- Refresh the page and try again
- Some pages may block content scripts — try a different page
- Check the browser console for errors (F12)

## Development

### File Structure

```
are-na-capture/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (OAuth, API calls)
├── content.js             # Element selection and capture
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic and state management
├── styles.css             # Popup styling
├── icons/                 # Extension icons (16, 48, 128px)
├── proxy-server.js        # Local OAuth proxy server (Node.js)
├── api/
│   └── exchange-token.js  # Vercel serverless function for OAuth
├── vercel.json            # Vercel deployment config
└── README.md
```

### Making Changes

After making changes to the extension:

1. Go to `chrome://extensions/`
2. Find the extension and click the reload icon
3. Test your changes

### API

The extension uses Are.na API v3 with automatic v2 fallback. Key endpoints:

- `GET /v3/me` — Authenticated user info
- `GET /v3/users/:slug/contents?type=Channel` — User's channels
- `POST /v3/channels` — Create a new channel
- `POST /v3/uploads/presign` — Get presigned S3 upload URL
- `POST /v3/blocks` — Create a block in a channel
- `GET /v3/search` — Search channels

See the [Are.na API Documentation](https://dev.are.na/documentation) for details.

## Permissions

- `activeTab` — Interact with the current webpage
- `storage` — Store authentication tokens
- `identity` — OAuth authentication flow
- `contextMenus` — Right-click menu option
- `scripting` — Inject content scripts
- `tabs` — Access tab information for capture

## License

MIT
