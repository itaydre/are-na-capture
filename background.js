// Background service worker for Are.na Element Capture extension

const ARE_NA_API_BASE = 'https://api.are.na/v2';
// Note: Are.na API might require different endpoints for channels
// Try /channels for user's channels or check API docs
const ARE_NA_AUTH_URL = 'https://www.are.na/oauth/authorize';
const ARE_NA_TOKEN_URL = 'https://www.are.na/oauth/token';

// Backend proxy server URL for OAuth token exchange
// Change this to your deployed proxy server URL
// For local development: 'http://localhost:3000'
// For production: 'https://your-proxy-server.com'
const PROXY_SERVER_URL = 'http://localhost:3000';

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
    // If content script isn't ready, inject it first
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
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['access_token', 'token_expires'], async (result) => {
      // Check if token exists and is not expired
      if (result.access_token && result.token_expires && Date.now() < result.token_expires) {
        resolve(result.access_token);
        return;
      }

      // Get OAuth client ID from manifest
      const manifest = chrome.runtime.getManifest();
      const clientId = manifest.oauth2?.client_id;

      if (!clientId || clientId === 'YOUR_CLIENT_ID_HERE') {
        reject(new Error('OAuth client ID not configured. Please set it in manifest.json'));
        return;
      }

      // Build OAuth URL
      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl = `${ARE_NA_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read+write`;

      try {
        // Launch OAuth flow
        const responseUrl = await chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        });

        // Extract authorization code from response URL
        const urlParams = new URLSearchParams(new URL(responseUrl).search);
        const code = urlParams.get('code');

        if (!code) {
          reject(new Error('No authorization code received'));
          return;
        }

        // Exchange code for access token via proxy server
        // The proxy server securely stores the client_secret
        console.log('Exchanging token via proxy server:', PROXY_SERVER_URL);
        
        const tokenResponse = await fetch(`${PROXY_SERVER_URL}/exchange-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: code,
            client_id: clientId,
            redirect_uri: redirectUri
          })
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          let errorMessage = `Token exchange failed`;
          let errorDetails = errorText;
          
          // Try to parse error if it's JSON
          try {
            const errorJson = JSON.parse(errorText);
            errorDetails = errorJson.error_description || errorJson.error || errorText;
            errorMessage = `Token exchange failed: ${errorDetails}`;
          } catch (e) {
            // Not JSON, use text as-is
            errorMessage = `Token exchange failed: ${errorText}`;
          }
          
          console.error('Token exchange error details:', {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            error: errorText,
            errorDetails: errorDetails
          });
          
          // Provide helpful error message
          if (tokenResponse.status === 0 || tokenResponse.status === 500) {
            errorMessage = `Token exchange failed: Cannot connect to proxy server. Make sure the proxy server is running at ${PROXY_SERVER_URL}`;
          }
          
          reject(new Error(errorMessage));
          return;
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;
        const expiresAt = Date.now() + (expiresIn * 1000);

        // Store token and any user info if available
        const storageData = {
          access_token: accessToken,
          token_expires: expiresAt
        };
        
        // If token response includes user info, store it
        if (tokenData.user) {
          storageData.user_info = tokenData.user;
        }

        chrome.storage.local.set(storageData);

        resolve(accessToken);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Get stored access token
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['access_token', 'token_expires'], (result) => {
      if (result.access_token && result.token_expires && Date.now() < result.token_expires) {
        resolve(result.access_token);
      } else {
        // Token expired or doesn't exist, re-authenticate
        authenticate().then(resolve).catch(reject);
      }
    });
  });
}

// Get authenticated user information
async function getAuthenticatedUser() {
  try {
    const token = await getAccessToken();
    
    // Try to get user info from stored data first
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['user_info'], async (result) => {
        if (result.user_info && result.user_info.slug) {
          console.log('Using stored user info:', result.user_info);
          resolve(result.user_info);
          return;
        }
        
        // If not stored, try to get from API
        // Try different possible endpoints
        const endpoints = [
          `${ARE_NA_API_BASE}/me`,
          `${ARE_NA_API_BASE}/users/me`,
          'https://api.are.na/v2/me'
        ];
        
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
              // Store for future use
              chrome.storage.local.set({ user_info: userData });
              console.log('Got user info from API:', userData);
              resolve(userData);
              return;
            }
          } catch (error) {
            console.log(`Endpoint ${endpoint} failed:`, error);
          }
        }
        
        // If all endpoints fail, reject
        reject(new Error('Could not get user information'));
      });
    });
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    throw error;
  }
}

// Fetch user's channels (only channels created by the user)
// According to Are.na API docs: https://dev.are.na/documentation/channels
// fetchAll: if true, fetch all channels; if false, fetch only 5 most recently updated
async function getUserChannels(fetchAll = false) {
  try {
    const token = await getAccessToken();
    console.log('Fetching channels with token:', token ? 'token exists' : 'no token');
    
    // First, try to get the authenticated user's info
    let userSlug = null;
    let userId = null;
    
    try {
      const userInfo = await getAuthenticatedUser();
      userSlug = userInfo.slug || userInfo.username;
      userId = userInfo.id;
      console.log('Authenticated user:', { slug: userSlug, id: userId });
    } catch (error) {
      console.log('Could not get user info from API, will try to extract from channels:', error);
    }
    
    // If we have user slug, try fetching directly from user endpoint
    if (userSlug) {
      try {
        const endpointUrl = `${ARE_NA_API_BASE}/users/${userSlug}/channels`;
        console.log(`Fetching channels from user endpoint: ${endpointUrl}, fetchAll: ${fetchAll}`);
        
        let allUserChannels = [];
        let hasMore = true;
        let pageNum = 1;
        const perPage = 100; // Request up to 100 channels per page
        
        // Fetch all pages if fetchAll is true, otherwise just first page
        while (hasMore) {
          // Build URL with pagination parameters
          const urlObj = new URL(endpointUrl);
          urlObj.searchParams.set('per', String(perPage));
          if (pageNum > 1) {
            urlObj.searchParams.set('page', String(pageNum));
          }
          const url = urlObj.toString();
          
          const userChannelsResponse = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!userChannelsResponse.ok) {
            const errorText = await userChannelsResponse.text();
            console.log(`User endpoint returned ${userChannelsResponse.status}:`, errorText);
            
            // Check for rate limiting
            if (userChannelsResponse.status === 429 || errorText.includes('Error 1015') || errorText.includes('rate limited')) {
              throw new Error('Rate limited: Are.na API is temporarily restricting requests. Please wait a few minutes and try again.');
            }
            
            // On error, break - we've loaded what we can
            break;
          }
          
          const userChannelsData = await userChannelsResponse.json();
          let pageChannels = [];
          
          // Handle different response formats
          if (Array.isArray(userChannelsData)) {
            pageChannels = userChannelsData;
          } else if (userChannelsData.channels && Array.isArray(userChannelsData.channels)) {
            pageChannels = userChannelsData.channels;
          } else if (userChannelsData.data && Array.isArray(userChannelsData.data)) {
            pageChannels = userChannelsData.data;
          }
          
          allUserChannels = allUserChannels.concat(pageChannels);
          console.log(`Fetched page ${pageNum}: ${pageChannels.length} channels (total so far: ${allUserChannels.length})`);
          
          // Determine if there are more pages
          if (fetchAll && pageChannels.length > 0) {
            // Check Link header for next page
            const linkHeader = userChannelsResponse.headers.get('Link');
            if (linkHeader) {
              const links = {};
              linkHeader.split(',').forEach(link => {
                const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
                if (match) {
                  links[match[2]] = match[1];
                }
              });
              hasMore = !!links.next;
            } else {
              // Check pagination metadata in response
              const totalPages = userChannelsData.total_pages || (userChannelsData.pagination && userChannelsData.pagination.total_pages);
              if (totalPages) {
                hasMore = pageNum < totalPages;
              } else {
                // If we got a full page (100 items), there might be more
                // If we got fewer, we're probably done
                hasMore = pageChannels.length >= perPage;
              }
            }
            pageNum++;
          } else {
            // Not fetching all, or no more results
            hasMore = false;
          }
        }
        
        if (allUserChannels.length > 0) {
          // Sort by updated_at descending (most recent first)
          allUserChannels.sort((a, b) => {
            const aTime = new Date(a.updated_at || a.created_at || 0);
            const bTime = new Date(b.updated_at || b.created_at || 0);
            return bTime - aTime;
          });
          
          // If not fetching all, return only 5 most recent
          if (!fetchAll && allUserChannels.length > 5) {
            allUserChannels = allUserChannels.slice(0, 5);
          }
          
          console.log(`Found ${allUserChannels.length} channels from user endpoint for ${userSlug}`);
          return allUserChannels;
        }
      } catch (error) {
        // If it's a rate limit error, re-throw it
        if (error.message && error.message.includes('Rate limited')) {
          throw error;
        }
        console.log('Error fetching from user endpoint:', error);
      }
    }
    
    // Fallback: Fetch all channels and filter
    console.log('Fetching all channels and filtering...');
    const response = await fetch(`${ARE_NA_API_BASE}/channels`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Channels API response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Channels API error:', errorText);
      
      if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      }
      
      // Check for Cloudflare rate limiting (status 429 or HTML error page with 1015)
      if (response.status === 429 || (errorText.includes('Error 1015') || errorText.includes('rate limited'))) {
        throw new Error('Rate limited: Are.na API is temporarily restricting requests. Please wait a few minutes and try again.');
      }
      
      // Truncate HTML error messages
      let errorMessage = `Failed to fetch channels: ${response.statusText}`;
      if (errorText && !errorText.includes('<!doctype')) {
        // Only include text if it's not HTML
        const shortError = errorText.substring(0, 200);
        errorMessage += ` - ${shortError}`;
      }
      
      throw new Error(errorMessage);
    }

    // Parse JSON response
    const data = await response.json();
    console.log('Channels data received:', Array.isArray(data) ? `${data.length} channels` : 'not an array');
    
    // Extract channels array
    let channels = [];
    if (Array.isArray(data)) {
      channels = data;
    } else if (data.channels && Array.isArray(data.channels)) {
      channels = data.channels;
    } else if (data.data && Array.isArray(data.data)) {
      channels = data.data;
    } else {
      console.warn('Unexpected channels data format:', data);
      return [];
    }
    
    // If we don't have user info yet, try to extract it from channels
    // Find the most common user in the channels (likely the authenticated user)
    if (!userSlug || !userId) {
      const userCounts = {};
      for (const channel of channels) {
        const channelUserSlug = channel.user?.slug || channel.user_slug;
        const channelUserId = channel.user?.id || channel.user_id;
        
        if (channelUserSlug) {
          const key = `slug:${channelUserSlug}`;
          userCounts[key] = (userCounts[key] || 0) + 1;
        }
        if (channelUserId) {
          const key = `id:${channelUserId}`;
          userCounts[key] = (userCounts[key] || 0) + 1;
        }
      }
      
      // Find the user with the most channels
      let maxCount = 0;
      let mostCommonUser = null;
      for (const [key, count] of Object.entries(userCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonUser = key;
        }
      }
      
      if (mostCommonUser) {
        if (mostCommonUser.startsWith('slug:')) {
          userSlug = mostCommonUser.replace('slug:', '');
        } else if (mostCommonUser.startsWith('id:')) {
          userId = mostCommonUser.replace('id:', '');
        }
        console.log('Detected user from channel analysis:', { slug: userSlug, id: userId, channelCount: maxCount });
      }
    }
    
    // Filter channels to only show channels created by the authenticated user
    let userChannels = channels.filter(channel => {
      const channelUserSlug = channel.user?.slug || channel.user_slug;
      const channelUserId = channel.user?.id || channel.user_id;
      
      // Match by slug first (more reliable)
      if (userSlug && channelUserSlug) {
        return channelUserSlug === userSlug;
      }
      
      // Match by ID as fallback
      if (userId && channelUserId) {
        return String(channelUserId) === String(userId);
      }
      
      return false;
    });
    
    // Sort by updated_at descending (most recent first)
    userChannels.sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0);
      const bTime = new Date(b.updated_at || b.created_at || 0);
      return bTime - aTime;
    });
    
    // If not fetching all, return only 5 most recent
    if (!fetchAll && userChannels.length > 5) {
      userChannels = userChannels.slice(0, 5);
    }
    
    console.log(`Filtered ${channels.length} channels to ${userChannels.length} channels for user ${userSlug || userId}`);
    
    return userChannels;
  } catch (error) {
    console.error('Error fetching channels:', error);
    throw error;
  }
}

// Upload image to Are.na channel
// Upload image to Imgur to get a public URL
// Are.na API requires source to be a URL, not a file upload
async function uploadImageToImgur(imageDataUrl) {
  try {
    console.log('Uploading image to Imgur...');
    
    // Extract base64 data from data URL
    const base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
    
    // Imgur API accepts base64-encoded images
    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7', // Public Imgur client ID for anonymous uploads
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: base64Data,
        type: 'base64'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Imgur upload failed:', errorText);
      throw new Error(`Failed to upload image to Imgur: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data && result.data.link) {
      console.log('Image uploaded to Imgur, URL:', result.data.link);
      return result.data.link;
    } else {
      throw new Error('Imgur upload failed: Invalid response');
    }
  } catch (error) {
    console.error('Error uploading to Imgur:', error);
    throw error;
  }
}

async function uploadBlockToChannel(channelSlug, imageDataUrl, sourceUrl) {
  try {
    const token = await getAccessToken();
    console.log('Uploading block to channel:', channelSlug);
    console.log('Source URL:', sourceUrl);
    
    // Step 1: Upload image to Imgur to get a public URL
    // Are.na API requires source to be a URL string, not a file upload
    let imageUrl;
    try {
      imageUrl = await uploadImageToImgur(imageDataUrl);
    } catch (imgurError) {
      console.error('Failed to upload to Imgur, trying alternative method:', imgurError);
      // If Imgur fails, we could try other services or fallback
      throw new Error('Failed to upload image. Please try again.');
    }
    
    // Step 2: Send the image URL to Are.na API
    // According to Are.na API docs: POST /v2/channels/:slug/blocks
    // Parameters: :source (required*) - URL of content
    // The source field in the response will show where the content came from
    console.log('Sending image URL to Are.na:', imageUrl);
    console.log('Original source URL:', sourceUrl);
    
    const formData = new FormData();
    
    // Send the image URL as source to create an image block
    // The source URL (original website) will be included in the description
    formData.append('source', imageUrl);
    console.log('Using image URL as source parameter:', imageUrl);
    
    // Add source URL to description so it's visible on Are.na
    // Note: The source field in the block response shows where content was saved from
    // but we can't set it directly - Are.na populates it automatically
    // So we'll include it in the description for now
    if (sourceUrl) {
      const description = `Source: ${sourceUrl}`;
      formData.append('description', description);
      console.log('Adding source URL to description:', sourceUrl);
    }
    
    const uploadResponse = await fetch(`${ARE_NA_API_BASE}/channels/${channelSlug}/blocks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type - let browser set it for FormData
      },
      body: formData
    });
    
    console.log('Are.na upload response status:', uploadResponse.status, uploadResponse.statusText);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Are.na upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText
      });
      
      let errorMessage = `Upload failed: ${uploadResponse.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorJson.error_description || errorMessage;
      } catch (e) {
        if (errorText && errorText.length < 500) {
          errorMessage = errorText;
        }
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await uploadResponse.json();
    console.log('Upload successful! Block created:', result);
    console.log('Block source field:', result.source);
    
    // The source field should now contain the original website URL
    // since we sent it as the source parameter
    return result;
  } catch (error) {
    console.error('Error uploading block:', error);
    throw error;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate') {
    authenticate()
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }

  if (request.action === 'getChannels') {
    const fetchAll = request.fetchAll || false;
    getUserChannels(fetchAll)
      .then(channels => {
        console.log('Sending channels response:', { success: true, count: channels.length, fetchAll });
        sendResponse({ success: true, channels });
      })
      .catch(error => {
        console.error('Error in getChannels handler:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (request.action === 'uploadBlock') {
    uploadBlockToChannel(request.channelSlug, request.imageDataUrl, request.sourceUrl)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }

  if (request.action === 'checkAuth') {
    // Just check if token exists and is valid, don't trigger authentication
    chrome.storage.local.get(['access_token', 'token_expires'], (result) => {
      const hasValidToken = result.access_token && 
                           result.token_expires && 
                           Date.now() < result.token_expires;
      sendResponse({ success: true, authenticated: hasValidToken });
    });
    return true; // Async response
  }

  if (request.action === 'captureElement') {
    captureElementScreenshot(sender.tab.id, request.elementInfo)
      .then(async (dataUrl) => {
        sendResponse({ success: true, imageDataUrl: dataUrl });
        
        // Wait a moment for the image to be stored, then open the popup
        // We open it as a window since openPopup() has restrictions
        setTimeout(async () => {
          try {
            // Try to open the popup first (only works in user gesture context)
            chrome.action.openPopup();
          } catch (error) {
            // If that fails, open as a window instead
            console.log('Opening popup as window after capture');
            chrome.windows.create({
              url: chrome.runtime.getURL('popup.html'),
              type: 'popup',
              width: 520, // 500px + padding
              height: 700
            });
          }
        }, 100);
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }
});

// Capture element using Chrome's native screenshot API
async function captureElementScreenshot(tabId, elementInfo) {
  try {
    // Get tab info to get the window
    const tab = await chrome.tabs.get(tabId);
    
    // Get viewport dimensions from the page
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
    
    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });
    
    // Use content script to process the image (service workers can't use DOM APIs)
    const processedImage = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function(dataUrl, elementInfo, viewportInfo) {
        return new Promise(function(resolve, reject) {
          const img = new Image();
          img.onload = function() {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              // Calculate element position relative to viewport
              const elementX = elementInfo.x - viewportInfo.scrollX;
              const elementY = elementInfo.y - viewportInfo.scrollY;
              
              // Check if element is visible in viewport
              if (elementX + elementInfo.width < 0 || 
                  elementY + elementInfo.height < 0 ||
                  elementX > viewportInfo.viewportWidth ||
                  elementY > viewportInfo.viewportHeight) {
                reject(new Error('Element is not visible in viewport. Please scroll to make it visible.'));
                return;
              }
              
              // Screenshot from captureVisibleTab is at device pixel ratio
              const dpr = viewportInfo.devicePixelRatio || 1;
              
              // Element coordinates are in CSS pixels, screenshot is in device pixels
              // Convert element position to screenshot coordinates
              const cropX = Math.max(0, elementX * dpr);
              const cropY = Math.max(0, elementY * dpr);
              const cropWidth = Math.min(elementInfo.width * dpr, img.width - cropX);
              const cropHeight = Math.min(elementInfo.height * dpr, img.height - cropY);
              
              // Set canvas size to match the element size in CSS pixels
              canvas.width = elementInfo.width;
              canvas.height = elementInfo.height;
              
              // Draw the cropped portion from screenshot (device pixels) to canvas (CSS pixels)
              // This automatically scales down from device pixels to CSS pixels
              ctx.drawImage(
                img,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, canvas.width, canvas.height
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
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  }
}
