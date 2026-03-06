# div to Are.na

A Chrome extension that lets you capture any HTML element from a webpage and save it directly to your Are.na channels.

## Install

```bash
git clone https://github.com/itaydre/are-na-capture.git
cd are-na-capture
```

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `are-na-capture` folder

The extension icon should now appear in your toolbar.

## Setup

### Are.na OAuth

1. Go to [Are.na Developer Settings](https://www.are.na/settings/applications)
2. Create a new application
3. After loading the extension in Chrome, get your redirect URI:
   - Go to `chrome://extensions/`, find the extension, click "service worker" under Inspect views
   - In the console run: `chrome.identity.getRedirectURL()`
   - Copy the result (looks like `https://[extension-id].chromiumapp.org/`)
4. Paste that URL as the **Redirect URI** in your Are.na application settings
5. Copy your **Client ID** and update `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE",
     "scopes": ["read", "write"]
   }
   ```
6. Reload the extension in `chrome://extensions/`

### Proxy Server (for OAuth token exchange)

The extension needs a backend to securely exchange OAuth tokens.

**Vercel (recommended):**

1. Install [Vercel CLI](https://vercel.com/docs/cli) and log in
2. Deploy: `vercel`
3. Set `CLIENT_SECRET` in your Vercel project environment variables
4. Update `PROXY_SERVER_URL` in `background.js` to your deployment URL

## Usage

1. Click the extension icon and **Login to Are.na**
2. Start capture mode using any of:
   - Extension icon → **Start Capture**
   - Right-click → **Capture Element to Are.na**
   - `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Windows/Linux)
3. Hover over elements — they'll highlight in blue
4. Click to capture
5. A dropdown appears near your click — select a channel, optionally name the block, and click **Connect**
6. Press `ESC` to cancel capture mode

## File Structure

```
are-na-capture/
├── manifest.json          # Extension config
├── background.js          # Service worker (OAuth, API, screenshot)
├── content.js             # Element selection + inline dropdown
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── styles.css             # Popup styles
├── icons/                 # Extension icons
├── api/
│   ├── exchange-token.js  # Vercel serverless OAuth proxy
│   └── health.js          # Health check endpoint
└── vercel.json            # Vercel config
```

## Permissions

- `activeTab` — interact with the current page
- `storage` — store auth tokens
- `identity` — OAuth flow
- `contextMenus` — right-click menu
- `scripting` — inject content scripts
- `tabs` — capture screenshots

## License

MIT
