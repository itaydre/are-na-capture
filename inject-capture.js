// This script is injected into the page context to use html2canvas
// Wait for html2canvas to be available
function waitForHtml2Canvas(maxAttempts) {
  maxAttempts = maxAttempts || 50;
  return new Promise(function(resolve, reject) {
    var attempts = 0;
    var check = function() {
      attempts++;
      if (typeof html2canvas !== 'undefined' && typeof html2canvas === 'function') {
        resolve(html2canvas);
      } else if (attempts >= maxAttempts) {
        reject(new Error('html2canvas not available after waiting'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// Capture function that will be called from content script
window.__arenaCaptureElement = function(elementId) {
  return new Promise(function(resolve, reject) {
    try {
      var element = document.querySelector('[data-arena-temp-id="' + elementId + '"]');
      if (!element) {
        reject(new Error('Element not found'));
        return;
      }
      
      // Wait for html2canvas
      waitForHtml2Canvas().then(function(html2canvasFn) {
        // Capture the element
        html2canvasFn(element, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true
        }).then(function(canvas) {
          resolve(canvas.toDataURL('image/png'));
        }).catch(function(error) {
          reject(error);
        });
      }).catch(function(error) {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
};
