// The Hive - Background Service Worker (Supabase)

const SUPABASE_URL = 'https://enptpydsfxmigfodrjbb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_L3XRLx45c6FLdRQG7oGLeg_faLqqPEU';

// Store captured text temporarily until popup opens
let pendingCapture = null;

// Right-click context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'the-hive-capture',
    title: 'Capture for The Hive',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'the-hive-capture' && info.selectionText) {
    pendingCapture = {
      text: info.selectionText.trim(),
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      source: detectSource(new URL(tab.url).hostname)
    };
    chrome.action.openPopup();
  }
});

// Keyboard shortcut: Ctrl+Shift+L / Cmd+Shift+L
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-selection') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Use scripting.executeScript — works on PDFs and regular pages
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim()
      });

      const selectedText = results && results[0] && results[0].result;
      if (selectedText) {
        pendingCapture = {
          text: selectedText,
          url: tab.url,
          title: tab.title,
          timestamp: new Date().toISOString(),
          source: detectSource(new URL(tab.url).hostname)
        };
      } else {
        // No selection — open popup anyway for manual paste, with tab info pre-filled
        pendingCapture = {
          text: '',
          url: tab.url,
          title: tab.title,
          timestamp: new Date().toISOString(),
          source: detectSource(new URL(tab.url).hostname),
          manualMode: true
        };
      }
      chrome.action.openPopup();
    } catch (e) {
      // If scripting fails (restricted page), open popup for manual paste
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        pendingCapture = {
          text: '',
          url: tab ? tab.url : '',
          title: tab ? tab.title : '',
          timestamp: new Date().toISOString(),
          source: tab ? detectSource(new URL(tab.url).hostname) : '',
          manualMode: true
        };
        chrome.action.openPopup();
      } catch (e2) {
        chrome.action.openPopup();
      }
    }
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEXT_CAPTURED') {
    pendingCapture = msg.data;
    chrome.action.openPopup();
  }

  if (msg.type === 'GET_PENDING_CAPTURE') {
    sendResponse(pendingCapture);
  }

  if (msg.type === 'CLEAR_PENDING_CAPTURE') {
    pendingCapture = null;
  }

  // ── Get current tab info (for manual paste auto-fill) ──
  if (msg.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      const tab = tabs[0];
      if (tab) {
        sendResponse({
          url: tab.url,
          title: tab.title,
          source: detectSource(new URL(tab.url).hostname)
        });
      } else {
        sendResponse({});
      }
    });
    return true;
  }

  // ── Supabase: Save a record ──
  if (msg.type === 'DB_SAVE') {
    supabaseInsert(msg.record)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Supabase: Fetch all records ──
  if (msg.type === 'DB_FETCH') {
    supabaseFetchAll()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Supabase: Update a record (case name / rating) ──
  if (msg.type === 'DB_UPDATE') {
    supabaseUpdate(msg.id, msg.updates)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return true;
});

// ── Supabase helpers ──

async function supabaseInsert(record) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/clips`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      timestamp: record.timestamp || new Date().toISOString(),
      username: record.user || '',
      source: record.source || '',
      page_title: record.pageTitle || '',
      url: record.url || '',
      captured_text: record.text || '',
      captured_html: record.html || '',
      why_it_matters: record.why || '',
      tags: record.tags || '',
      cause_of_action: record.causeOfAction || '',
      case_name: record.caseName || '',
      rating: record.rating || '',
      citation: record.citation || ''
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Save failed: ' + errText.substring(0, 200));
  }

  return { success: true };
}

async function supabaseFetchAll() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/clips?order=created_at.asc&select=*`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Fetch failed: ' + errText.substring(0, 200));
  }

  const rows = await response.json();

  // Map Supabase column names to the field names the popup expects
  const records = rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp || row.created_at,
    user: row.username || '',
    source: row.source || '',
    pageTitle: row.page_title || '',
    url: row.url || '',
    text: row.captured_text || '',
    html: row.captured_html || '',
    why: row.why_it_matters || '',
    tags: row.tags || '',
    causeOfAction: row.cause_of_action || '',
    caseName: row.case_name || '',
    rating: row.rating || '',
    citation: row.citation || ''
  }));

  return { success: true, records: records };
}

async function supabaseUpdate(id, updates) {
  if (!id) throw new Error('No record id for update');

  // Map popup field names to Supabase column names
  const patch = {};
  if (updates.caseName !== undefined) patch.case_name = updates.caseName;
  if (updates.rating !== undefined) patch.rating = updates.rating;
  if (updates.citation !== undefined) patch.citation = updates.citation;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/clips?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Update failed: ' + errText.substring(0, 200));
  }

  return { success: true };
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
