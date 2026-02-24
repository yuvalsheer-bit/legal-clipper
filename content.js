// The Hive - Content Script
// Detects text selection and shows a floating "Capture" button

let captureButton = null;

function createCaptureButton() {
  if (captureButton) return;

  captureButton = document.createElement('div');
  captureButton.id = 'the-hive-capture-btn';
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
        source: detectSource(window.location.hostname),
        citation: detectCitation(window.location.hostname)
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

function detectCitation(hostname) {
  // Auto-detect citation from Westlaw pages
  if (hostname.includes('westlaw')) {
    // Try common Westlaw DOM selectors for citation
    const selectors = [
      '#co_docHeaderContainer .co_title',
      '.document-title .citation',
      '[data-testid="document-title"]',
      '#co_docHeader_citation',
      '.co_cites',
      '#coid_website_documentTitle',
      '.headnotes-title',
      '#title'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (e) {}
    }

    // Fallback: extract from page title (e.g. "Smith v. Jones, 123 F.3d 456 | Westlaw")
    const title = document.title || '';
    const cleaned = title.replace(/\s*[\|\-]\s*Westlaw.*$/i, '').trim();
    if (cleaned && cleaned !== title.trim()) {
      return cleaned;
    }
  }

  // Auto-detect from LexisNexis pages
  if (hostname.includes('lexis')) {
    const selectors = [
      '.document-title',
      '[data-testid="doc-title"]',
      '.case-title'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (e) {}
    }

    const title = document.title || '';
    const cleaned = title.replace(/\s*[\|\-]\s*Lexis.*$/i, '').trim();
    if (cleaned && cleaned !== title.trim()) {
      return cleaned;
    }
  }

  return '';
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
  if (e.target.id === 'the-hive-capture-btn') return;

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
  if (e.target.id !== 'the-hive-capture-btn') {
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
      source: detectSource(window.location.hostname),
      citation: detectCitation(window.location.hostname)
    });
  }
});
