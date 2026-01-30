# Are.na Element Capture Chrome Extension

A Chrome extension that allows you to capture any HTML element from web pages as images and upload them directly to your Are.na channels.

## Features

- **Element Selection**: Hover over and click any HTML element on a webpage to capture it
- **Multiple Activation Methods**:
  - Click the extension icon and press "Start Capture"
  - Right-click context menu option "Capture Element to Are.na"
  - Keyboard shortcut: `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
- **OAuth Authentication**: Secure authentication with your Are.na account
- **Channel Selection**: Choose from your Are.na channels to upload captured elements
- **High-Quality Capture**: Uses html2canvas for high-resolution element rendering

## Installation

### 1. Clone or Download

Download or clone this repository to your local machine.

### 2. Register OAuth Application with Are.na

Before using the extension, you need to register an OAuth application with Are.na:

1. Go to [Are.na Developer Settings](https://www.are.na/settings/applications)
2. Click "New Application" or "Create Application"
3. Fill in the application details:
   - **Name**: Are.na Element Capture (or any name you prefer)
   - **Redirect URI**: You'll need to get this after loading the extension (see step 4)
4. Save the application and copy the **Client ID**

### 3. Configure the Extension

1. Open the `manifest.json` file
2. Find the `oauth2` section:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE",
     "scopes": ["read", "write"]
   }
   ```
3. Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID from step 2

### 4. Get Your Redirect URI

1. Load the extension in Chrome (see step 5)
2. Open the browser console (F12) and run:
   ```javascript
   chrome.identity.getRedirectURL()
   ```
3. Copy the returned URL (it will look like `https://[extension-id].chromiumapp.org/`)
4. Go back to your Are.na application settings and add this URL as a Redirect URI
5. Save the application settings

### 5. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `are-na-capture` directory
5. The extension should now appear in your extensions list

### 6. Create Extension Icons

The extension requires icon files. You can:

- Create your own icons (16x16, 48x48, and 128x128 pixels) and save them as:
  - `icons/icon16.png`
  - `icons/icon48.png`
  - `icons/icon128.png`

Or use a simple placeholder:
- Create a simple colored square image and save it in the three required sizes

## Usage

### First Time Setup

1. Click the extension icon in your Chrome toolbar
2. Click "Login to Are.na" to authenticate
3. You'll be redirected to Are.na to authorize the application
4. After authorization, you'll be redirected back and logged in

### Capturing Elements

1. Navigate to any webpage
2. Activate capture mode using one of these methods:
   - Click the extension icon → "Start Capture"
   - Right-click on the page → "Capture Element to Are.na"
   - Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
3. Hover over elements to see them highlighted
4. Click on the element you want to capture
5. The extension popup will open (or reopen if closed) with your captured element
6. Select a channel from the dropdown
7. Click "Upload to Are.na"

### Tips

- Press `ESC` while in capture mode to cancel
- The captured image is a high-quality PNG
- You can capture any HTML element, not just divs
- The extension works on any website

## Troubleshooting

### "OAuth client ID not configured" Error

- Make sure you've replaced `YOUR_CLIENT_ID_HERE` in `manifest.json` with your actual Client ID
- Reload the extension after making changes

### "No authorization code received" Error

- Verify that your Redirect URI in Are.na matches exactly what `chrome.identity.getRedirectURL()` returns
- Make sure there are no trailing slashes or extra characters

### "Failed to fetch channels" Error

- Check your internet connection
- Verify you're logged in (try logging out and back in)
- Check that your OAuth application has the correct scopes (read, write)

### Capture Mode Not Starting

- Refresh the page and try again
- Some pages may block content scripts - try a different page
- Check the browser console for errors (F12)

### Image Not Uploading

- Verify you've selected a channel
- Check that the channel slug is correct
- Try capturing a different element
- Check the browser console for detailed error messages

## Development

### File Structure

```
are-na-capture/
├── manifest.json       # Extension configuration
├── background.js       # Service worker (OAuth, API calls)
├── content.js          # Element selection and capture
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
├── styles.css          # Popup styling
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### Making Changes

After making any changes to the extension:

1. Go to `chrome://extensions/`
2. Find the extension
3. Click the reload icon (circular arrow)
4. Test your changes

### API Endpoints Used

- `GET /v2/channels` - Fetch user's channels
- `POST /v2/channels/:slug/blocks` - Upload image block

See the [Are.na API Documentation](https://dev.are.na/documentation/channels) for more details.

## Permissions

The extension requires the following permissions:

- `activeTab` - To interact with the current webpage
- `storage` - To store authentication tokens
- `identity` - For OAuth authentication
- `contextMenus` - For right-click menu option
- `scripting` - To inject content scripts
- `https://api.are.na/*` - To communicate with Are.na API
- `https://www.are.na/*` - For OAuth authentication

## License

This extension is provided as-is for personal use.

## Support

For issues or questions:
- Check the [Are.na API Documentation](https://dev.are.na/documentation)
- Review Chrome Extension documentation
- Check browser console for error messages
