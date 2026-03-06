// Content script for element selection and capture

let isCaptureMode = false;
let selectedElement = null;
let overlay = null;
let dropdownHost = null;
let clickPosition = null;

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startCapture') {
    startCaptureMode();
    sendResponse({ success: true });
  } else if (request.action === 'stopCapture') {
    stopCaptureMode();
    sendResponse({ success: true });
  }
  return true;
});

function startCaptureMode() {
  if (isCaptureMode) return;

  isCaptureMode = true;
  document.body.style.cursor = 'crosshair';

  // Create overlay for highlighting
  overlay = document.createElement('div');
  overlay.id = 'arena-capture-overlay';
  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    border: 2px solid #4A90E2;
    background: rgba(74, 144, 226, 0.1);
    z-index: 999999;
    display: none;
  `;
  document.body.appendChild(overlay);

  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

}

function stopCaptureMode() {
  if (!isCaptureMode) return;

  isCaptureMode = false;
  document.body.style.cursor = '';

  // Remove overlay
  if (overlay) {
    overlay.remove();
    overlay = null;
  }

  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  // Clear selection
  if (selectedElement) {
    selectedElement = null;
  }
}

function handleMouseMove(e) {
  if (!isCaptureMode) return;

  // Find the element under the cursor
  const element = e.target;

  if (element && element !== overlay && element !== document.body && element !== document.documentElement) {
    highlightElement(element);
  }
}

function highlightElement(element) {
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  overlay.style.display = 'block';
  overlay.style.left = (rect.left + scrollX) + 'px';
  overlay.style.top = (rect.top + scrollY) + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
}

function handleClick(e) {
  if (!isCaptureMode) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;

  // Don't select the overlay itself
  if (element === overlay || element.id === 'arena-capture-overlay') {
    return;
  }

  // Save click position for the dropdown
  clickPosition = { x: e.clientX, y: e.clientY };

  selectedElement = element;
  captureElement(element);
}

function handleKeyDown(e) {
  if (!isCaptureMode) return;

  if (e.key === 'Escape') {
    stopCaptureMode();
  }
}

async function captureElement(element) {
  try {
    // Get element position and dimensions
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const elementInfo = {
      x: rect.left + scrollX,
      y: rect.top + scrollY,
      width: rect.width,
      height: rect.height,
      tagName: element.tagName,
      className: element.className,
      id: element.id
    };

    // Remove overlay completely before capture
    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    // Force a repaint and wait for it to complete
    document.body.offsetHeight;
    await new Promise(resolve => requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 100);
      });
    }));

    // Stop capture mode (cleans up event listeners)
    stopCaptureMode();

    // Ask background script to capture using Chrome's native screenshot API
    chrome.runtime.sendMessage({
      action: 'captureElement',
      elementInfo: elementInfo
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError.message);
        return;
      }

      if (response && response.error) {
        console.error('Capture error:', response.error);
        return;
      }

      if (response && response.imageDataUrl) {
        const sourceUrl = window.location.href;

        // Store captured image in storage (for popup fallback)
        chrome.storage.local.set({
          capturedImage: response.imageDataUrl,
          capturedElementInfo: elementInfo,
          capturedSourceUrl: sourceUrl,
          captureTimestamp: Date.now()
        });

        // Show inline dropdown at the click position
        showInlineDropdown(response.imageDataUrl, sourceUrl);
      } else {
        console.error('Capture error: No image received');
      }
    });
  } catch (error) {
    console.error('Error capturing element:', error);
    stopCaptureMode();
  }
}

// ─── Inline Channel Dropdown ───────────────────────────────────────────────────

const DROPDOWN_CSS = `
  :host {
    all: initial;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .arena-dropdown {
    position: fixed;
    z-index: 2147483647;
    width: 280px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #333;
    overflow: hidden;
    animation: arena-drop-in 0.15s ease-out;
  }

  @keyframes arena-drop-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .arena-dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid #eee;
  }

  .arena-dropdown-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
  }

  .arena-dropdown-close {
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    cursor: pointer;
    color: #999;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 16px;
    line-height: 1;
  }

  .arena-dropdown-close:hover {
    background: #f0f0f0;
    color: #333;
  }

  .arena-search-container {
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
  }

  .arena-search-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #ddd;
    border-radius: 5px;
    font-size: 13px;
    font-family: inherit;
    color: #333;
    background: #fafafa;
    outline: none;
    transition: border-color 0.15s;
  }

  .arena-search-input::placeholder {
    color: #aaa;
  }

  .arena-search-input:focus {
    border-color: #4A90E2;
    background: #fff;
    box-shadow: 0 0 0 2px rgba(74,144,226,0.15);
  }

  .arena-section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #bbb;
    padding: 8px 12px 4px;
  }

  .arena-channel-list {
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
  }

  .arena-channel-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    cursor: pointer;
    transition: background-color 0.1s;
    border-bottom: 1px solid #f5f5f5;
  }

  .arena-channel-item:last-child {
    border-bottom: none;
  }

  .arena-channel-item:hover {
    background: #f5f5f5;
  }

  .arena-channel-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .arena-channel-dot.public  { background: #238020; }
  .arena-channel-dot.closed  { background: #333; }
  .arena-channel-dot.private { background: #B93D3D; }

  .arena-channel-name {
    font-size: 13px;
    color: #333;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arena-channel-count {
    font-size: 11px;
    color: #aaa;
    flex-shrink: 0;
  }

  .arena-empty {
    padding: 16px 12px;
    text-align: center;
    color: #aaa;
    font-size: 12px;
  }

  .arena-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px 12px;
    color: #aaa;
    font-size: 12px;
  }

  .arena-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #eee;
    border-top-color: #4A90E2;
    border-radius: 50%;
    animation: arena-spin 0.6s linear infinite;
  }

  @keyframes arena-spin {
    to { transform: rotate(360deg); }
  }

  .arena-upload-status {
    padding: 10px 12px;
    text-align: center;
    font-size: 12px;
    border-top: 1px solid #eee;
  }

  .arena-upload-status.uploading {
    color: #4A90E2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .arena-upload-status.success {
    color: #389e0d;
    background: #f6ffed;
  }

  .arena-upload-status.error {
    color: #ff4d4f;
    background: #fff2f0;
  }

  .arena-not-authed {
    padding: 16px 12px;
    text-align: center;
    font-size: 12px;
    color: #999;
  }

  .arena-auth-btn {
    display: inline-block;
    margin-top: 8px;
    padding: 6px 14px;
    background: #333;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .arena-auth-btn:hover {
    background: #000;
  }
`;

function showInlineDropdown(imageDataUrl, sourceUrl) {
  // Remove any existing dropdown
  removeInlineDropdown();

  // Create shadow DOM host
  dropdownHost = document.createElement('div');
  dropdownHost.id = 'arena-inline-dropdown-host';
  document.body.appendChild(dropdownHost);

  const shadow = dropdownHost.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = DROPDOWN_CSS;
  shadow.appendChild(style);

  // Position: place near click, but keep it on screen
  const pos = clickPosition || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const dropdownWidth = 280;
  const dropdownMaxHeight = 340;

  let left = pos.x + 8;
  let top = pos.y + 8;

  // Keep within viewport
  if (left + dropdownWidth > window.innerWidth - 12) {
    left = pos.x - dropdownWidth - 8;
  }
  if (left < 12) left = 12;

  if (top + dropdownMaxHeight > window.innerHeight - 12) {
    top = pos.y - dropdownMaxHeight - 8;
  }
  if (top < 12) top = 12;

  // Build dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'arena-dropdown';
  dropdown.style.left = left + 'px';
  dropdown.style.top = top + 'px';

  dropdown.innerHTML = `
    <div class="arena-dropdown-header">
      <span class="arena-dropdown-title">Save to Are.na</span>
      <button class="arena-dropdown-close" aria-label="Close">&times;</button>
    </div>
    <div class="arena-search-container">
      <input class="arena-search-input" type="text" placeholder="Search channels..." autocomplete="off" />
    </div>
    <div class="arena-section-label arena-recent-label">Recent</div>
    <ul class="arena-channel-list"></ul>
  `;

  shadow.appendChild(dropdown);

  const closeBtn = shadow.querySelector('.arena-dropdown-close');
  const searchInput = shadow.querySelector('.arena-search-input');
  const channelList = shadow.querySelector('.arena-channel-list');
  const recentLabel = shadow.querySelector('.arena-recent-label');

  // Close button
  closeBtn.addEventListener('click', removeInlineDropdown);

  // Close on Escape
  function onEsc(e) {
    if (e.key === 'Escape') {
      removeInlineDropdown();
      document.removeEventListener('keydown', onEsc, true);
    }
  }
  document.addEventListener('keydown', onEsc, true);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('mousedown', function outsideClick(e) {
      if (dropdownHost && !dropdownHost.contains(e.target)) {
        removeInlineDropdown();
        document.removeEventListener('mousedown', outsideClick, true);
      }
    }, true);
  }, 50);

  // Show loading state
  channelList.innerHTML = '<li class="arena-loading"><span class="arena-spinner"></span> Loading...</li>';

  // Check auth and load recent channels
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (authResp) => {
    if (!authResp || !authResp.authenticated) {
      recentLabel.style.display = 'none';
      channelList.innerHTML = `
        <li class="arena-not-authed">
          Log in to Are.na first via the extension popup.
        </li>
      `;
      searchInput.disabled = true;
      return;
    }

    // Load recent channels
    loadDropdownChannels(shadow, imageDataUrl, sourceUrl, '');
  });

  // Search handler with debounce
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadDropdownChannels(shadow, imageDataUrl, sourceUrl, query);
    }, 250);
  });

  // Focus search input
  setTimeout(() => searchInput.focus(), 50);
}

function loadDropdownChannels(shadow, imageDataUrl, sourceUrl, query) {
  const channelList = shadow.querySelector('.arena-channel-list');
  const recentLabel = shadow.querySelector('.arena-recent-label');

  channelList.innerHTML = '<li class="arena-loading"><span class="arena-spinner"></span> Loading...</li>';

  if (query) {
    // Search mode
    recentLabel.textContent = 'Results';
    chrome.runtime.sendMessage({ action: 'searchChannels', query }, (resp) => {
      if (resp && resp.success && resp.channels && resp.channels.length > 0) {
        renderDropdownChannels(shadow, resp.channels, imageDataUrl, sourceUrl);
      } else {
        channelList.innerHTML = '<li class="arena-empty">No channels found</li>';
      }
    });
  } else {
    // Show recent channels (last 3 used), then fill with recent API channels
    recentLabel.textContent = 'Recent';
    chrome.storage.local.get(['recentChannels'], (stored) => {
      const recentSlugs = (stored.recentChannels || []).slice(0, 3);

      // Also fetch recent channels from API to fill if needed
      chrome.runtime.sendMessage({ action: 'getChannels', fetchAll: false }, (resp) => {
        if (!resp || !resp.success) {
          channelList.innerHTML = '<li class="arena-empty">Could not load channels</li>';
          return;
        }

        const apiChannels = resp.channels || [];

        // Merge: recently-used first (by slug), then API channels, deduped
        let merged = [];
        const seen = new Set();

        // Add recently used channels first, matched from API data for full info
        for (const rc of recentSlugs) {
          const match = apiChannels.find(c => c.slug === rc.slug);
          if (match) {
            merged.push(match);
            seen.add(match.slug);
          } else {
            // Use stored info as fallback
            merged.push(rc);
            seen.add(rc.slug);
          }
        }

        // Fill remaining slots from API channels
        for (const c of apiChannels) {
          if (!seen.has(c.slug)) {
            merged.push(c);
            seen.add(c.slug);
          }
        }

        // Show top entries
        renderDropdownChannels(shadow, merged.slice(0, 6), imageDataUrl, sourceUrl);
      });
    });
  }
}

function renderDropdownChannels(shadow, channels, imageDataUrl, sourceUrl) {
  const channelList = shadow.querySelector('.arena-channel-list');
  channelList.innerHTML = '';

  channels.forEach(channel => {
    const li = document.createElement('li');
    li.className = 'arena-channel-item';

    const status = channel.status || 'public';
    const count = channel.length !== undefined ? channel.length : (channel.length_ !== undefined ? channel.length_ : '');

    li.innerHTML = `
      <span class="arena-channel-dot ${status}"></span>
      <span class="arena-channel-name">${channel.title || channel.slug}</span>
      <span class="arena-channel-count">${count}</span>
    `;

    li.addEventListener('click', () => {
      uploadFromDropdown(shadow, channel, imageDataUrl, sourceUrl);
    });

    channelList.appendChild(li);
  });
}

function uploadFromDropdown(shadow, channel, imageDataUrl, sourceUrl) {
  const dropdown = shadow.querySelector('.arena-dropdown');

  // Show uploading state
  let statusEl = shadow.querySelector('.arena-upload-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'arena-upload-status';
    dropdown.appendChild(statusEl);
  }
  statusEl.className = 'arena-upload-status uploading';
  statusEl.innerHTML = '<span class="arena-spinner"></span> Uploading...';

  // Disable channel clicks
  shadow.querySelectorAll('.arena-channel-item').forEach(item => {
    item.style.pointerEvents = 'none';
    item.style.opacity = '0.5';
  });

  chrome.runtime.sendMessage({
    action: 'uploadBlock',
    channelSlug: channel.slug,
    imageDataUrl: imageDataUrl,
    sourceUrl: sourceUrl
  }, (resp) => {
    if (resp && resp.success) {
      statusEl.className = 'arena-upload-status success';
      statusEl.textContent = `Saved to ${channel.title || channel.slug}`;

      // Track this channel as recently used
      trackRecentChannel(channel);

      // Clear stored capture
      chrome.storage.local.remove(['capturedImage', 'capturedElementInfo', 'capturedSourceUrl', 'captureTimestamp']);

      // Auto-close after a beat
      setTimeout(removeInlineDropdown, 1200);
    } else {
      statusEl.className = 'arena-upload-status error';
      statusEl.textContent = (resp && resp.error) || 'Upload failed';
      // Re-enable channel clicks
      shadow.querySelectorAll('.arena-channel-item').forEach(item => {
        item.style.pointerEvents = '';
        item.style.opacity = '';
      });
    }
  });
}

function trackRecentChannel(channel) {
  chrome.storage.local.get(['recentChannels'], (stored) => {
    let recents = stored.recentChannels || [];

    // Remove duplicate if exists
    recents = recents.filter(r => r.slug !== channel.slug);

    // Add to front
    recents.unshift({
      slug: channel.slug,
      title: channel.title || channel.slug,
      status: channel.status || 'public',
      length: channel.length || channel.length_ || 0
    });

    // Keep max 10
    recents = recents.slice(0, 10);

    chrome.storage.local.set({ recentChannels: recents });
  });
}

function removeInlineDropdown() {
  if (dropdownHost) {
    dropdownHost.remove();
    dropdownHost = null;
  }
}
