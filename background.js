// Background service worker for Are.na Element Capture extension
// Using Are.na API v3

const ARE_NA_API_BASE = 'https://api.are.na/v3';
const ARE_NA_AUTH_URL = 'https://www.are.na/oauth/authorize';

// Backend proxy server URL for OAuth token exchange
const PROXY_SERVER_URL = 'https://are-na-capture.vercel.app';

// Auth state to prevent multiple simultaneous auth windows
let isAuthenticating = false;
let authPromise = null;

// Initialize context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-element',
    title: 'Capture Element to Are.na',
    contexts: ['page', 'selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-element') {
    startCaptureMode(tab.id);
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'start-capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startCaptureMode(tabs[0].id);
      }
    });
  }
});

// Start capture mode in content script
function startCaptureMode(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'startCapture' }).catch(() => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).then(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'startCapture' });
      }, 100);
    });
  });
}

// OAuth2 Authentication
async function authenticate() {
  if (isAuthenticating && authPromise) {
    return authPromise;
  }

  authPromise = new Promise((resolve, reject) => {
    chrome.storage.local.get(['access_token'], async (result) => {
      // Are.na tokens never expire per v3 docs
      if (result.access_token) {
        resolve(result.access_token);
        return;
      }

      isAuthenticating = true;

      const manifest = chrome.runtime.getManifest();
      const clientId = manifest.oauth2?.client_id;

      if (!clientId || clientId === 'YOUR_CLIENT_ID_HERE') {
        isAuthenticating = false;
        reject(new Error('OAuth client ID not configured. Please set it in manifest.json'));
        return;
      }

      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl = `${ARE_NA_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read+write`;

      try {
        const responseUrl = await chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        });

        const urlParams = new URLSearchParams(new URL(responseUrl).search);
        const code = urlParams.get('code');

        if (!code) {
          isAuthenticating = false;
          reject(new Error('No authorization code received'));
          return;
        }

        const tokenResponse = await fetch(`${PROXY_SERVER_URL}/exchange-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            client_id: clientId,
            redirect_uri: redirectUri
          })
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          let errorMessage = `Token exchange failed`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = `Token exchange failed: ${errorJson.error_description || errorJson.error || errorText}`;
          } catch (e) {
            errorMessage = `Token exchange failed: ${errorText}`;
          }

          if (tokenResponse.status === 0 || tokenResponse.status === 500) {
            errorMessage = `Token exchange failed: Cannot connect to proxy server at ${PROXY_SERVER_URL}`;
          }

          isAuthenticating = false;
          reject(new Error(errorMessage));
          return;
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const storageData = { access_token: accessToken };
        if (tokenData.user) {
          storageData.user_info = tokenData.user;
        }

        chrome.storage.local.set(storageData);
        isAuthenticating = false;
        resolve(accessToken);
      } catch (error) {
        isAuthenticating = false;
        reject(error);
      }
    });
  });

  return authPromise;
}

// Get stored access token
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['access_token'], async (result) => {
      if (result.access_token) {
        resolve(result.access_token);
      } else {
        try {
          const token = await authenticate();
          resolve(token);
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

// Get authenticated user information — tries v3 then v2
async function getAuthenticatedUser() {
  const token = await getAccessToken();

  // Check stored user info first
  const stored = await chrome.storage.local.get(['user_info']);
  if (stored.user_info && stored.user_info.slug) {
    return stored.user_info;
  }

  // Try v3 then v2
  const endpoints = [`${ARE_NA_API_BASE}/me`, 'https://api.are.na/v2/me'];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        chrome.storage.local.set({ user_info: userData });
        return userData;
      }
    } catch (error) {
      console.log(`${endpoint} failed:`, error.message);
    }
  }

  throw new Error('Could not get user information');
}

// Fetch user's channels — tries v3 first, falls back to v2
async function getUserChannels(fetchAll = false) {
  const token = await getAccessToken();
  const userInfo = await getAuthenticatedUser();
  const userSlug = userInfo.slug || userInfo.username;

  if (!userSlug) {
    throw new Error('Could not determine user slug');
  }

  // Try v3 users/{id}/contents with type=Channel
  try {
    const allChannels = await fetchChannelsFromAPI(
      `${ARE_NA_API_BASE}/users/${userSlug}/contents?type=Channel`,
      token, fetchAll
    );
    if (allChannels.length > 0) return allChannels;
  } catch (error) {
    console.log('v3 channel fetch failed, trying v2:', error.message);
  }

  // Fallback: v2 user channels endpoint
  const allChannels = await fetchChannelsFromAPI(
    `https://api.are.na/v2/users/${userSlug}/channels`,
    token, fetchAll
  );
  return allChannels;
}

// Generic paginated channel fetcher
async function fetchChannelsFromAPI(baseUrl, token, fetchAll) {
  let allChannels = [];
  let page = 1;
  const perPage = fetchAll ? 100 : 24;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}per=${perPage}&page=${page}&sort=updated_at_desc`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 || errorText.includes('rate limited')) {
        throw new Error('Rate limited: Are.na API is temporarily restricting requests. Please wait a few minutes and try again.');
      }
      if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      }
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    const data = await response.json();
    const pageChannels = data.data || data.channels || (Array.isArray(data) ? data : []);
    allChannels = allChannels.concat(pageChannels);

    const hasMore = data.meta?.has_more_pages || data.has_more_pages;

    if (!fetchAll || !hasMore || pageChannels.length === 0) {
      break;
    }
    page++;
  }

  // Sort by updated_at descending
  allChannels.sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || 0);
    const bTime = new Date(b.updated_at || b.created_at || 0);
    return bTime - aTime;
  });

  if (!fetchAll && allChannels.length > 5) {
    allChannels = allChannels.slice(0, 5);
  }

  return allChannels;
}

// Search channels using v3 search endpoint (falls back to v2 search)
async function searchChannels(query) {
  const token = await getAccessToken();

  // Try v3 first, then v2
  const urls = [
    `${ARE_NA_API_BASE}/search?query=${encodeURIComponent(query)}&type=Channel&scope=my&per=20&sort=score_desc`,
    `https://api.are.na/v2/search/channels?q=${encodeURIComponent(query)}&per=20`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || data.channels || (Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.log(`Search endpoint failed: ${url}`, error.message);
    }
  }

  // All search endpoints failed, return null to trigger client-side filtering
  return null;
}

// Create a new channel
async function createChannel(title, status = 'closed') {
  const token = await getAccessToken();

  // Try v3 first
  try {
    const response = await fetch(`${ARE_NA_API_BASE}/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, status })
    });

    if (response.ok) {
      return await response.json();
    }

    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error('Authentication failed. Please log in again.');
    }
    if (response.status === 429 || errorText.includes('rate limited')) {
      throw new Error('Rate limited: Please wait a few minutes and try again.');
    }
    console.log('v3 channel creation failed, trying v2');
  } catch (error) {
    if (error.message.includes('Authentication') || error.message.includes('Rate limited')) {
      throw error;
    }
    console.log('v3 channel creation error, trying v2:', error.message);
  }

  // Fallback to v2
  const response = await fetch('https://api.are.na/v2/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, status })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create channel: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch (e) {
      if (errorText && errorText.length < 500) {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

// Upload image using v3 presigned S3 upload (replaces Imgur)
async function uploadImageToArena(imageDataUrl) {
  const token = await getAccessToken();

  // Convert data URL to blob
  const blobResponse = await fetch(imageDataUrl);
  const blob = await blobResponse.blob();
  const filename = `capture-${Date.now()}.png`;

  // Step 1: Get presigned URL
  const presignResponse = await fetch(`${ARE_NA_API_BASE}/uploads/presign`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: [{
        filename: filename,
        content_type: 'image/png'
      }]
    })
  });

  if (!presignResponse.ok) {
    const errorText = await presignResponse.text();
    console.error('Presign failed:', presignResponse.status, errorText);
    throw new Error('PRESIGN_FAILED');
  }

  const presignData = await presignResponse.json();
  console.log('Presign response:', JSON.stringify(presignData));

  // Handle different response shapes
  const uploads = presignData.uploads || presignData.data || presignData;
  const upload = Array.isArray(uploads) ? uploads[0] : uploads;

  if (!upload) {
    console.error('No upload object in presign response:', presignData);
    throw new Error('PRESIGN_FAILED');
  }

  const uploadUrl = upload.upload_url || upload.url || upload.presigned_url;
  const key = upload.key || upload.id;

  if (!uploadUrl) {
    console.error('No upload_url in presign upload object:', upload);
    throw new Error('PRESIGN_FAILED');
  }

  // Step 2: Upload file to S3
  const s3Response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png'
    },
    body: blob
  });

  if (!s3Response.ok) {
    throw new Error('Failed to upload file to storage');
  }

  // Step 3: Return the S3 URL for block creation
  return `https://s3.amazonaws.com/arena_images-temp/${key}`;
}

// Upload image to Imgur as fallback when v3 presign is unavailable
async function uploadImageToImgur(imageDataUrl) {
  const base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;

  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': 'Client-ID 546c25a59c58ad7',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: base64Data,
      type: 'base64'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to upload image to Imgur');
  }

  const result = await response.json();
  if (result.success && result.data && result.data.link) {
    return result.data.link;
  }
  throw new Error('Imgur upload failed: Invalid response');
}

// Upload block to channel — tries v3 presign first, falls back to v2 + Imgur
async function uploadBlockToChannel(channelSlug, imageDataUrl, sourceUrl, title) {
  const token = await getAccessToken();

  let imageUrl;

  // Try v3 presigned upload first
  try {
    imageUrl = await uploadImageToArena(imageDataUrl);
  } catch (error) {
    if (error.message === 'PRESIGN_FAILED') {
      console.log('v3 presign unavailable, falling back to Imgur');
      imageUrl = await uploadImageToImgur(imageDataUrl);
    } else {
      throw error;
    }
  }

  // Try v3 block creation first
  try {
    // Get channel ID from slug
    const channelResponse = await fetch(`${ARE_NA_API_BASE}/channels/${channelSlug}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (channelResponse.ok) {
      const channelData = await channelResponse.json();
      const channelId = channelData.id;

      const blockBody = {
        value: imageUrl,
        channel_ids: [channelId]
      };
      if (title) {
        blockBody.title = title;
      }
      if (sourceUrl) {
        blockBody.description = `Source: ${sourceUrl}`;
      }

      const uploadResponse = await fetch(`${ARE_NA_API_BASE}/blocks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(blockBody)
      });

      if (uploadResponse.ok) {
        return await uploadResponse.json();
      }
      console.log('v3 block creation failed, falling back to v2');
    }
  } catch (error) {
    console.log('v3 block creation error, falling back to v2:', error.message);
  }

  // Fallback: v2 channel blocks endpoint
  const formData = new FormData();
  formData.append('source', imageUrl);
  if (title) {
    formData.append('title', title);
  }
  if (sourceUrl) {
    formData.append('description', `Source: ${sourceUrl}`);
  }

  const uploadResponse = await fetch(`https://api.are.na/v2/channels/${channelSlug}/blocks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    let errorMessage = `Upload failed: ${uploadResponse.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch (e) {
      if (errorText && errorText.length < 500) {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }

  return await uploadResponse.json();
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate') {
    authenticate()
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getChannels') {
    const fetchAll = request.fetchAll || false;
    getUserChannels(fetchAll)
      .then(channels => sendResponse({ success: true, channels }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'searchChannels') {
    searchChannels(request.query)
      .then(channels => sendResponse({ success: true, channels }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'createChannel') {
    createChannel(request.title, request.status)
      .then(channel => sendResponse({ success: true, channel }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'uploadBlock') {
    uploadBlockToChannel(request.channelSlug, request.imageDataUrl, request.sourceUrl, request.title)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'checkAuth') {
    chrome.storage.local.get(['access_token'], (result) => {
      sendResponse({ success: true, authenticated: !!result.access_token });
    });
    return true;
  }

  if (request.action === 'captureElement') {
    captureElementScreenshot(sender.tab.id, request.elementInfo)
      .then(async (dataUrl) => {
        sendResponse({ success: true, imageDataUrl: dataUrl });
        // The inline dropdown in content.js handles channel selection now
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Capture element using Chrome's native screenshot API
async function captureElementScreenshot(tabId, elementInfo) {
  const tab = await chrome.tabs.get(tabId);

  const viewportInfo = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function() {
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX || window.pageXOffset,
        scrollY: window.scrollY || window.pageYOffset,
        devicePixelRatio: window.devicePixelRatio || 1
      };
    }
  });

  if (!viewportInfo || !viewportInfo[0] || !viewportInfo[0].result) {
    throw new Error('Failed to get viewport info');
  }

  const vp = viewportInfo[0].result;

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png'
  });

  const processedImage = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function(dataUrl, elementInfo, viewportInfo) {
      return new Promise(function(resolve, reject) {
        const img = new Image();
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const elementX = elementInfo.x - viewportInfo.scrollX;
            const elementY = elementInfo.y - viewportInfo.scrollY;

            if (elementX + elementInfo.width < 0 ||
                elementY + elementInfo.height < 0 ||
                elementX > viewportInfo.viewportWidth ||
                elementY > viewportInfo.viewportHeight) {
              reject(new Error('Element is not visible in viewport. Please scroll to make it visible.'));
              return;
            }

            const dpr = viewportInfo.devicePixelRatio || 1;

            const cropX = Math.max(0, elementX * dpr);
            const cropY = Math.max(0, elementY * dpr);
            const cropWidth = Math.min(elementInfo.width * dpr, img.width - cropX);
            const cropHeight = Math.min(elementInfo.height * dpr, img.height - cropY);

            canvas.width = cropWidth;
            canvas.height = cropHeight;

            ctx.drawImage(
              img,
              cropX, cropY, cropWidth, cropHeight,
              0, 0, cropWidth, cropHeight
            );

            resolve(canvas.toDataURL('image/png'));
          } catch (error) {
            reject(error);
          }
        };
        img.onerror = function() {
          reject(new Error('Failed to load screenshot'));
        };
        img.src = dataUrl;
      });
    },
    args: [dataUrl, elementInfo, vp]
  });

  if (!processedImage || !processedImage[0] || !processedImage[0].result) {
    throw new Error('Failed to process screenshot');
  }

  return processedImage[0].result;
}
