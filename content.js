// Content script for element selection and capture

let isCaptureMode = false;
let selectedElement = null;
let overlay = null;

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
        console.log('Storing captured image, data URL length:', response.imageDataUrl.length);
        
        // Capture the current page URL as the source
        const sourceUrl = window.location.href;
        console.log('Captured source URL:', sourceUrl);
        
        // Store captured image in storage so popup can access it even if closed
        chrome.storage.local.set({
          capturedImage: response.imageDataUrl,
          capturedElementInfo: elementInfo,
          capturedSourceUrl: sourceUrl,
          captureTimestamp: Date.now()
        }, () => {
          console.log('Image and source URL stored in chrome.storage.local');
          // Verify it was stored
          chrome.storage.local.get(['capturedImage', 'capturedSourceUrl'], (result) => {
            console.log('Verification - stored image exists:', !!result.capturedImage);
            console.log('Verification - stored source URL:', result.capturedSourceUrl);
          });
        });
        
        // Send image to popup (if it's open)
        chrome.runtime.sendMessage({
          action: 'elementCaptured',
          imageDataUrl: response.imageDataUrl,
          elementInfo: elementInfo,
          sourceUrl: sourceUrl
        }).catch(() => {
          // Popup might be closed, that's okay - it will check storage on open
          console.log('Popup is closed, image stored for later');
        });
      } else {
        console.error('Capture error: No image received');
      }
    });
  } catch (error) {
    console.error('Error capturing element:', error);
    stopCaptureMode();
  }
}

