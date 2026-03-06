// Popup script for Are.na Element Capture extension

let capturedImageDataUrl = null;
let capturedSourceUrl = null;
let channels = [];
let displayedChannels = []; // Currently displayed list (may differ from channels during search)
let allChannelsLoaded = false;
let selectedChannelSlug = null;
let isAuthenticated = false;

// DOM elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loadingSection = document.getElementById('loading-section');
const loginBtn = document.getElementById('login-btn');
const startCaptureBtn = document.getElementById('start-capture-btn');
const previewSection = document.getElementById('preview-section');
const previewImage = document.getElementById('preview-image');
const channelSection = document.getElementById('channel-section');
const channelSearch = document.getElementById('channel-search');
const channelList = document.getElementById('channel-list');
const channelsHeader = document.getElementById('channels-header');
const channelLoading = document.getElementById('channel-loading');
const channelError = document.getElementById('channel-error');
const uploadBtn = document.getElementById('upload-btn');
const uploadLoading = document.getElementById('upload-loading');
const messageDiv = document.getElementById('message');
const authError = document.getElementById('auth-error');
const captureStatus = document.getElementById('capture-status');
const resetCaptureBtn = document.getElementById('reset-capture-btn');
const newChannelBtn = document.getElementById('new-channel-btn');
const createChannelForm = document.getElementById('create-channel-form');
const newChannelTitle = document.getElementById('new-channel-title');
const cancelCreateChannel = document.getElementById('cancel-create-channel');
const confirmCreateChannel = document.getElementById('confirm-create-channel');
const statusOptions = document.querySelectorAll('.status-option');
let newChannelStatus = 'closed';

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  // Check for captured image FIRST - if there's one, show it even if not authenticated
  const hasCapturedImage = await checkForCapturedImage();
  // Then check authentication
  await checkAuthentication(hasCapturedImage);
});

// Check if user is authenticated
async function checkAuthentication(hasCapturedImage = false) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    isAuthenticated = response && response.authenticated;
    
    if (isAuthenticated) {
      // If we have a captured image, it's already shown, just load channels
      if (hasCapturedImage) {
        await loadChannels();
      } else {
        showMainSection();
        await loadChannels();
      }
    } else {
      // Not authenticated
      if (hasCapturedImage) {
        // Image is already shown, just show auth prompt
        showMainSectionWithAuthPrompt();
      } else {
        // No image, show auth section
        showAuthSection();
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    if (hasCapturedImage) {
      showMainSectionWithAuthPrompt();
    } else {
      showAuthSection();
    }
  }
}

// Show authentication section
function showAuthSection() {
  loadingSection.classList.add('hidden');
  mainSection.classList.add('hidden');
  authSection.classList.remove('hidden');
}

// Show main section
function showMainSection() {
  loadingSection.classList.add('hidden');
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

// Show main section with auth prompt (when there's a captured image but not authenticated)
function showMainSectionWithAuthPrompt() {
  loadingSection.classList.add('hidden');
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  // Show auth button in main section if not authenticated
  if (!isAuthenticated) {
    const authPrompt = document.createElement('div');
    authPrompt.className = 'auth-prompt';
    authPrompt.innerHTML = '<p class="auth-message">Please authenticate to upload the captured element.</p><button id="auth-in-main-btn" class="btn btn-primary">Login to Are.na</button>';
    authPrompt.id = 'auth-prompt-in-main';
    
    // Remove existing prompt if any
    const existing = document.getElementById('auth-prompt-in-main');
    if (existing) {
      existing.remove();
    }
    
    // Insert at the top of main section
    const mainSectionEl = document.getElementById('main-section');
    mainSectionEl.insertBefore(authPrompt, mainSectionEl.firstChild);
    
    // Add event listener
    document.getElementById('auth-in-main-btn').addEventListener('click', handleLogin);
  }
}

// Setup event listeners
function setupEventListeners() {
  loginBtn.addEventListener('click', handleLogin);
  startCaptureBtn.addEventListener('click', handleStartCapture);
  uploadBtn.addEventListener('click', handleUpload);
  resetCaptureBtn.addEventListener('click', handleResetCapture);
  
  // Search input event listener
  if (channelSearch) {
    channelSearch.addEventListener('input', handleChannelSearch);
  }

  // Create channel event listeners
  if (newChannelBtn) {
    newChannelBtn.addEventListener('click', showCreateChannelForm);
  }
  if (cancelCreateChannel) {
    cancelCreateChannel.addEventListener('click', hideCreateChannelForm);
  }
  if (confirmCreateChannel) {
    confirmCreateChannel.addEventListener('click', handleCreateChannel);
  }
  if (newChannelTitle) {
    newChannelTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateChannel();
      }
    });
  }
  statusOptions.forEach(option => {
    option.addEventListener('click', () => {
      statusOptions.forEach(o => {
        o.classList.remove('selected');
        o.setAttribute('aria-pressed', 'false');
      });
      option.classList.add('selected');
      option.setAttribute('aria-pressed', 'true');
      newChannelStatus = option.dataset.status;
    });
  });
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'elementCaptured') {
      handleElementCaptured(request.imageDataUrl, request.elementInfo, request.sourceUrl);
    }
  });
}

// Handle login
async function handleLogin() {
  loginBtn.disabled = true;
  loginBtn.textContent = 'Authenticating...';
  authError.classList.add('hidden');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authenticate' });
    
    if (response.success) {
      isAuthenticated = true;
      showMainSection();
      await loadChannels();
      // Check for captured image again after authentication
      await checkForCapturedImage();
    } else {
      throw new Error(response.error || 'Authentication failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    authError.textContent = error.message || 'Authentication failed. Please try again.';
    authError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login to Are.na';
  }
}

// Handle start capture
async function handleStartCapture() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showMessage('No active tab found.', 'error');
      return;
    }
    
    // Send message to content script to start capture
    await chrome.tabs.sendMessage(tab.id, { action: 'startCapture' });
    
    // Close popup (user will see notification on page)
    window.close();
  } catch (error) {
    console.error('Error starting capture:', error);
    showMessage('Error starting capture mode. Please refresh the page and try again.', 'error');
  }
}

// Handle reset capture
function handleResetCapture() {
  // Clear captured image data
  capturedImageDataUrl = null;
  capturedSourceUrl = null;
  selectedChannelSlug = null;

  // Clear stored capture from storage
  chrome.storage.local.remove(['capturedImage', 'capturedElementInfo', 'capturedSourceUrl', 'captureTimestamp']);

  // Hide preview section
  previewSection.classList.add('hidden');
  previewImage.src = '';

  // Hide channel section
  channelSection.classList.add('hidden');

  // Update upload button state
  updateUploadButton();

  // Reset status message
  captureStatus.innerHTML = '<p>Click the camera icon to capture elements from the current page.</p>';
}

// Handle element captured
function handleElementCaptured(imageDataUrl, elementInfo, sourceUrl) {
  capturedImageDataUrl = imageDataUrl;
  capturedSourceUrl = sourceUrl || null;

  // Show preview
  previewImage.src = imageDataUrl;
  previewSection.classList.remove('hidden');

  // Show channel selection
  channelSection.classList.remove('hidden');

  // Update upload button state
  updateUploadButton();

  // Update status
  captureStatus.innerHTML = `<p>Element captured! Select a channel and upload.</p>`;
}

// Check for captured image on popup open
// Returns true if a captured image was found and displayed
async function checkForCapturedImage() {
  try {
    const result = await chrome.storage.local.get(['capturedImage', 'capturedElementInfo', 'capturedSourceUrl', 'captureTimestamp']);
    console.log('Checking for captured image:', {
      hasImage: !!result.capturedImage,
      hasSourceUrl: !!result.capturedSourceUrl,
      hasTimestamp: !!result.captureTimestamp,
      timestamp: result.captureTimestamp
    });
    
    if (result.capturedImage && result.captureTimestamp) {
      // Check if capture is recent (within last 5 minutes)
      const age = Date.now() - result.captureTimestamp;
      console.log('Capture age:', age, 'ms');
      if (age < 5 * 60 * 1000) {
        console.log('Showing captured image');
        // Show main section first so image can be displayed
        showMainSection();
        // Show the captured image regardless of auth status
        handleElementCaptured(result.capturedImage, result.capturedElementInfo || {}, result.capturedSourceUrl);
        return true; // Image was found and shown
      } else {
        console.log('Capture too old, clearing');
        // Clear old capture
        chrome.storage.local.remove(['capturedImage', 'capturedElementInfo', 'capturedSourceUrl', 'captureTimestamp']);
        return false;
      }
    } else {
      console.log('No captured image found');
      return false;
    }
  } catch (error) {
    console.error('Error checking for captured image:', error);
    return false;
  }
}

// Load user's channels
async function loadChannels(fetchAll = false) {
  channelLoading.classList.remove('hidden');
  channelError.classList.add('hidden');
  channelList.innerHTML = '<li class="channel-item loading-item"><span>Loading channels...</span></li>';
  if (channelSearch) channelSearch.disabled = true;
  
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getChannels', fetchAll: fetchAll }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background script'));
          return;
        }
        resolve(response);
      });
    });
    
    console.log('Channels response:', response, 'fetchAll:', fetchAll);
    
    if (response && response.success && response.channels) {
      channels = response.channels;
      displayedChannels = channels;
      allChannelsLoaded = fetchAll;
      console.log('Loaded channels:', channels.length, 'allChannelsLoaded:', allChannelsLoaded);
      renderChannelList(displayedChannels);
    } else {
      const errorMsg = response?.error || 'Failed to load channels';
      console.error('Channel loading error:', errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Error loading channels:', error);
    channelError.textContent = error.message || 'Failed to load channels. Please try again.';
    channelError.classList.remove('hidden');
    channelList.innerHTML = '<li class="channel-item loading-item"><span>Error loading channels</span></li>';
  } finally {
    channelLoading.classList.add('hidden');
    if (channelSearch) channelSearch.disabled = false;
  }
}

// Debounce helper
let searchTimeout = null;

// Handle channel search input
async function handleChannelSearch(event) {
  const searchTerm = event.target.value.trim();

  if (!searchTerm) {
    // Show recent channels when search is cleared
    displayedChannels = channels;
    renderChannelList(displayedChannels);
    if (channelsHeader) channelsHeader.textContent = 'Recent channels';
    return;
  }

  // Debounce search
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (channelsHeader) channelsHeader.textContent = 'Searching...';

    // Try server-side search first (v3 API)
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'searchChannels', query: searchTerm }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });

      if (response && response.success && response.channels) {
        displayedChannels = response.channels;
        renderChannelList(displayedChannels);
        if (channelsHeader) channelsHeader.textContent = 'Search results';
        return;
      }
    } catch (error) {
      console.log('Server search failed, falling back to local filter');
    }

    // Fallback: load all channels and filter locally
    if (!allChannelsLoaded) {
      channelList.innerHTML = '<li class="channel-item loading-item"><span>Loading all channels...</span></li>';
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'getChannels', fetchAll: true }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          });
        });

        if (response && response.success && response.channels) {
          channels = response.channels;
          allChannelsLoaded = true;
        }
      } catch (error) {
        console.error('Error loading channels for search:', error);
        return;
      }
    }

    const term = searchTerm.toLowerCase();
    const filteredChannels = channels.filter(channel => {
      const title = (channel.title || '').toLowerCase();
      const slug = (channel.slug || '').toLowerCase();
      return title.includes(term) || slug.includes(term);
    });

    displayedChannels = filteredChannels;
    renderChannelList(displayedChannels);
    if (channelsHeader) channelsHeader.textContent = 'Search results';
  }, 300);
}

// Render channel list
function renderChannelList(channelsList) {
  channelList.innerHTML = '';
  
  if (!channelsList || channelsList.length === 0) {
    channelList.innerHTML = '<li class="channel-item loading-item"><span>No channels found</span></li>';
    return;
  }
  
  channelsList.forEach(channel => {
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    if (selectedChannelSlug === channel.slug) {
      li.classList.add('selected');
      li.setAttribute('aria-pressed', 'true');
    } else {
      li.setAttribute('aria-pressed', 'false');
    }

    // Get channel count (number of blocks) - API might return length or length_
    const count = channel.length !== undefined ? channel.length : (channel.length_ !== undefined ? channel.length_ : 0);

    // Get channel owner
    const ownerName = channel.user ? (channel.user.username || channel.user.slug || channel.user.name || '') : '';

    // Get channel status (public, closed, private)
    const status = channel.status || 'public';
    const statusLabel = status === 'public' ? 'Open' : status.charAt(0).toUpperCase() + status.slice(1);

    li.innerHTML = `
      <span class="channel-status channel-status-${status}" aria-hidden="true"></span>
      <span class="visually-hidden">${statusLabel} channel:</span>
      <span class="channel-name">${channel.title || channel.slug}</span>
      <span class="channel-count">${count}</span>
      <span class="channel-owner">${ownerName || ''}</span>
    `;

    li.addEventListener('click', () => {
      selectChannel(channel.slug);
    });

    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectChannel(channel.slug);
      }
    });

    channelList.appendChild(li);
  });
}

// Select a channel
function selectChannel(slug) {
  selectedChannelSlug = slug;

  // Re-render the currently displayed list to update selection highlight
  renderChannelList(displayedChannels);

  // Update upload button visibility
  updateUploadButton();
}

// Update upload button state
function updateUploadButton() {
  if (selectedChannelSlug && capturedImageDataUrl) {
    uploadBtn.classList.remove('hidden');
    uploadBtn.disabled = false;
  } else {
    uploadBtn.classList.add('hidden');
    uploadBtn.disabled = true;
  }
}

// Handle upload
async function handleUpload() {
  const channelSlug = selectedChannelSlug;
  
  if (!channelSlug) {
    showMessage('Please select a channel.', 'error');
    return;
  }
  
  if (!capturedImageDataUrl) {
    showMessage('No image to upload. Please capture an element first.', 'error');
    return;
  }
  
  uploadBtn.disabled = true;
  uploadBtn.classList.add('hidden');
  uploadLoading.classList.remove('hidden');
  messageDiv.classList.add('hidden');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'uploadBlock',
      channelSlug: channelSlug,
      imageDataUrl: capturedImageDataUrl,
      sourceUrl: capturedSourceUrl
    });
    
    if (response.success) {
      showMessage('Successfully uploaded to Are.na!', 'success');
      
      // Clear stored capture
      chrome.storage.local.remove(['capturedImage', 'capturedElementInfo', 'capturedSourceUrl', 'captureTimestamp']);
      
      // Reset state
      setTimeout(() => {
        capturedImageDataUrl = null;
        capturedSourceUrl = null;
        previewSection.classList.add('hidden');
        channelSection.classList.add('hidden');
        uploadBtn.classList.add('hidden');
        captureStatus.innerHTML = '<p>Click the camera icon to capture elements from the current page.</p>';
      }, 2000);
    } else {
      throw new Error(response.error || 'Upload failed');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showMessage(error.message || 'Upload failed. Please try again.', 'error');
    uploadBtn.disabled = false;
    uploadBtn.classList.remove('hidden');
  } finally {
    uploadLoading.classList.add('hidden');
  }
}

// Show create channel form
function showCreateChannelForm() {
  createChannelForm.classList.remove('hidden');
  newChannelTitle.value = '';
  newChannelTitle.focus();
  newChannelBtn.classList.add('hidden');
}

// Hide create channel form
function hideCreateChannelForm() {
  createChannelForm.classList.add('hidden');
  newChannelTitle.value = '';
  newChannelBtn.classList.remove('hidden');
  // Reset status selection to default (closed)
  statusOptions.forEach(o => {
    o.classList.remove('selected');
    o.setAttribute('aria-pressed', 'false');
  });
  const closedOption = document.querySelector('.status-option[data-status="closed"]');
  if (closedOption) {
    closedOption.classList.add('selected');
    closedOption.setAttribute('aria-pressed', 'true');
  }
  newChannelStatus = 'closed';
}

// Handle create channel
async function handleCreateChannel() {
  const title = newChannelTitle.value.trim();
  if (!title) {
    showMessage('Please enter a channel name.', 'error');
    return;
  }

  confirmCreateChannel.disabled = true;
  confirmCreateChannel.textContent = 'Creating...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'createChannel', title, status: newChannelStatus },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    if (response && response.success && response.channel) {
      const newChannel = response.channel;
      // Add new channel to the top of the list
      channels.unshift(newChannel);
      displayedChannels = channels;
      // Auto-select the new channel
      selectedChannelSlug = newChannel.slug;
      renderChannelList(displayedChannels);
      updateUploadButton();
      hideCreateChannelForm();
      showMessage(`Channel "${newChannel.title}" created!`, 'success');
    } else {
      throw new Error(response?.error || 'Failed to create channel');
    }
  } catch (error) {
    console.error('Error creating channel:', error);
    showMessage(error.message || 'Failed to create channel.', 'error');
  } finally {
    confirmCreateChannel.disabled = false;
    confirmCreateChannel.textContent = 'Create';
  }
}

// Show message
function showMessage(text, type = 'info') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 5000);
}
