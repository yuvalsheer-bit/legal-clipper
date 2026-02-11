// Legal Clipper - Content Script
// Detects text selection and shows a floating "Capture" button

let captureButton = null;

function createCaptureButton() {
  if (captureButton) return;

  captureButton = document.createElement('div');
  captureButton.id = 'legal-clipper-capture-btn';
  captureButton.textContent = 'Capture';
  captureButton.style.display = 'none';
  document.body.appendChild(captureButton);

  captureButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Get HTML of selection (preserves hyperlinks)
    let selectedHtml = '';
    try {
      const range = selection.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      selectedHtml = container.innerHTML;
    } catch (err) {}

    // Send the captured data to the extension popup
    chrome.runtime.sendMessage({
      type: 'TEXT_CAPTURED',
      data: {
        text: selectedText,
        html: selectedHtml,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        source: detectSource(window.location.hostname)
      }
    });

    hideCaptureButton();
  });
}

function detectSource(hostname) {
  if (hostname.includes('pacer')) return 'PACER';
  if (hostname.includes('westlaw')) return 'Westlaw';
  if (hostname.includes('lexis')) return 'LexisNexis';
  if (hostname.includes('courtlistener')) return 'CourtListener';
  if (hostname.includes('scholar.google')) return 'Google Scholar';
  if (hostname.includes('law.justia')) return 'Justia';
  return hostname;
}

function showCaptureButton(x, y) {
  if (!captureButton) createCaptureButton();

  // Position near the selection but within viewport
  const btnWidth = 90;
  const btnHeight = 36;
  const padding = 8;

  let left = x + padding;
  let top = y - btnHeight - padding;

  // Keep within viewport
  if (left + btnWidth > window.innerWidth) {
    left = window.innerWidth - btnWidth - padding;
  }
  if (top < 0) {
    top = y + padding;
  }

  captureButton.style.left = `${left + window.scrollX}px`;
  captureButton.style.top = `${top + window.scrollY}px`;
  captureButton.style.display = 'flex';
}

function hideCaptureButton() {
  if (captureButton) {
    captureButton.style.display = 'none';
  }
}

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  // Ignore clicks on the capture button itself
  if (e.target.id === 'legal-clipper-capture-btn') return;

  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 10) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showCaptureButton(rect.right, rect.top);
    } else {
      hideCaptureButton();
    }
  }, 10);
});

// Hide button when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (e.target.id !== 'legal-clipper-capture-btn') {
    hideCaptureButton();
  }
});

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SELECTION') {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    let selectedHtml = '';
    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());
        selectedHtml = container.innerHTML;
      }
    } catch (err) {}

    sendResponse({
      text: selectedText,
      html: selectedHtml,
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      source: detectSource(window.location.hostname)
    });
  }
});
