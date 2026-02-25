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

  // Label
  const label = document.createElement('span');
  label.id = 'the-hive-cite-label';
  label.textContent = '\u2705 Quote captured! Paste citation:';
  citationButton.appendChild(label);

  // Paste input (contenteditable to preserve formatting like italics/underline)
  const input = document.createElement('div');
  input.id = 'the-hive-cite-input';
  input.contentEditable = 'true';
  input.setAttribute('data-placeholder', 'Ctrl+V to paste citation here...');
  citationButton.appendChild(input);

  // Save button
  const saveBtn = document.createElement('span');
  saveBtn.id = 'the-hive-cite-save';
  saveBtn.textContent = 'Save \u2713';
  citationButton.appendChild(saveBtn);

  // Skip link
  const skipLink = document.createElement('span');
  skipLink.id = 'the-hive-skip-link';
  skipLink.textContent = 'Skip \u2192';
  citationButton.appendChild(skipLink);

  document.body.appendChild(citationButton);

  // Save — attach citation and send
  function saveCitation() {
    if (!pendingQuote) return;
    // Get HTML content to preserve italics, underline, bold
    const html = input.innerHTML.trim();
    // Strip if only whitespace/empty tags
    if (html && html !== '<br>' && html !== '<div><br></div>') {
      pendingQuote.citation = html;
    }

    chrome.runtime.sendMessage({
      type: 'TEXT_CAPTURED',
      data: pendingQuote
    });

    pendingQuote = null;
    input.innerHTML = '';
    hideCitationButton();
  }

  saveBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveCitation();
  });

  // Enter key saves
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCitation();
    }
  });

  // Skip — send quote without citation
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
  // Don't show Capture button while waiting for citation paste
  if (pendingQuote) return;

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
