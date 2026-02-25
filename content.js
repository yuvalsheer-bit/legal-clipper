// The Hive - Content Script
// Detects text selection and shows a floating "Capture" button
// Supports two-step capture: Quote first, then Citation (from clipboard)

let captureButton = null;
let citationButton = null;
let pendingQuote = null; // Stores captured quote while waiting for citation

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

    const capturedData = {
      text: selectedText,
      html: selectedHtml,
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      source: detectSource(window.location.hostname),
      citation: ''
    };

    // Store as pending quote and show "Paste Citation" button
    pendingQuote = capturedData;
    hideCaptureButton();
    showCitationButton();
  });
}

function createCitationButton() {
  if (citationButton) return;

  citationButton = document.createElement('div');
  citationButton.id = 'the-hive-citation-btn';
  citationButton.style.display = 'none';

  // Main paste area
  const pasteArea = document.createElement('span');
  pasteArea.id = 'the-hive-paste-area';
  pasteArea.textContent = '\u2705 Quote captured!  Copy citation, then click here to paste it';
  citationButton.appendChild(pasteArea);

  // Skip link
  const skipLink = document.createElement('span');
  skipLink.id = 'the-hive-skip-link';
  skipLink.textContent = 'Skip \u2192';
  citationButton.appendChild(skipLink);

  document.body.appendChild(citationButton);

  // "Paste Citation" — reads clipboard and sends both quote + citation
  pasteArea.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!pendingQuote) return;

    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText && clipboardText.trim()) {
        pendingQuote.citation = clipboardText.trim();
      }
    } catch (err) {
      // Clipboard read failed (permissions) — send without citation
    }

    chrome.runtime.sendMessage({
      type: 'TEXT_CAPTURED',
      data: pendingQuote
    });

    pendingQuote = null;
    hideCitationButton();
  });

  // "Skip" — send quote without citation
  skipLink.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    skipCitation();
  });
}

function showCitationButton() {
  if (!citationButton) createCitationButton();

  citationButton.style.display = 'flex';
  // Banner stays visible until user clicks "Paste" or "Skip" — no timeout
}

function hideCitationButton() {
  if (citationButton) {
    citationButton.style.display = 'none';
    clearTimeout(citationButton._timeout);
  }
}

// "Skip" — send quote without citation
function skipCitation() {
  if (!pendingQuote) return;
  chrome.runtime.sendMessage({
    type: 'TEXT_CAPTURED',
    data: pendingQuote
  });
  pendingQuote = null;
  hideCitationButton();
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
  // Ignore clicks on our buttons
  if (e.target.id === 'the-hive-capture-btn') return;
  if (e.target.id === 'the-hive-citation-btn') return;
  if (e.target.classList && e.target.classList.contains('the-hive-skip-btn')) return;

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

// Hide capture button when clicking elsewhere (but not citation button)
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
      citation: ''
    });
  }
});
