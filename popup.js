// The Hive - Popup Logic (Synced to Supabase)

document.addEventListener('DOMContentLoaded', async () => {
  // ── State ──
  let capturedData = null;
  let captureRating = '';
  let sessionDefaultCase = '';  // Persists across clips during one session
  let sessionDefaultCoa = '';   // Persists COA across clips during one session

  // ── App Elements ──
  const views = {
    capture: document.getElementById('view-capture'),
    brain: document.getElementById('view-brain'),
    settings: document.getElementById('view-settings')
  };

  const emptyState = document.getElementById('empty-state');
  const captureForm = document.getElementById('capture-form');
  const successState = document.getElementById('success-state');

  const sourceBadge = document.getElementById('source-badge');
  const sourceLink = document.getElementById('source-link');
  const sourceTitle = document.getElementById('source-title');
  const capturedText = document.getElementById('captured-text');
  const whyInput = document.getElementById('why-input');
  const whyError = document.getElementById('why-error');

  // ── Capture form: Case Name + Rating ──
  const captureCaseSelect = document.getElementById('capture-case-select');
  const captureCaseNewInput = document.getElementById('capture-case-new-input');
  const sessionDefaultCheck = document.getElementById('session-default-check');
  const sessionDefaultBadge = document.getElementById('session-default-badge');
  const captureRatingBtns = document.getElementById('capture-rating-btns');

  const btnSave = document.getElementById('btn-save');
  const btnSaveText = document.getElementById('btn-save-text');
  const btnSaveSpinner = document.getElementById('btn-save-spinner');
  const btnCancel = document.getElementById('btn-cancel');

  const btnNewCapture = document.getElementById('btn-new-capture');

  const navBtns = document.querySelectorAll('.nav-btn');

  const brainSearch = document.getElementById('brain-search');
  const brainLoading = document.getElementById('brain-loading');
  const brainEmpty = document.getElementById('brain-empty');
  const brainList = document.getElementById('brain-list');

  const userNameInput = document.getElementById('user-name');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingsFeedback = document.getElementById('settings-feedback');

  // ── Hive Toggle ──
  const hiveToggleInput = document.getElementById('hive-toggle-input');
  const hiveToggleLabel = document.getElementById('hive-toggle-label');

  // ── Auth Elements ──
  const lockScreen = document.getElementById('lock-screen');
  const setupScreen = document.getElementById('setup-screen');
  const appMain = document.getElementById('app-main');
  const lockInput = document.getElementById('lock-input');
  const lockError = document.getElementById('lock-error');
  const btnUnlock = document.getElementById('btn-unlock');
  const setupInput = document.getElementById('setup-input');
  const setupError = document.getElementById('setup-error');
  const btnSetup = document.getElementById('btn-setup');

  // ── Auth Check ──
  const authData = await getStorage(['teamPassword', 'unlocked']);

  if (!authData.teamPassword) {
    // First time — show setup screen
    setupScreen.style.display = 'flex';
  } else if (authData.unlocked) {
    // Already unlocked — go straight to app
    showApp();
  } else {
    // Password exists but not yet unlocked — show lock screen
    lockScreen.style.display = 'flex';
  }

  // ── Setup (first time) ──
  btnSetup.addEventListener('click', async () => {
    const pw = setupInput.value.trim();
    if (!pw) {
      setupError.style.display = 'block';
      return;
    }
    await chrome.storage.local.set({ teamPassword: pw, unlocked: true });
    setupScreen.style.display = 'none';
    showApp();
  });

  setupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSetup.click();
  });
  setupInput.addEventListener('input', () => { setupError.style.display = 'none'; });

  // ── Unlock ──
  btnUnlock.addEventListener('click', async () => {
    const entered = lockInput.value;
    const data = await getStorage(['teamPassword']);

    if (entered === data.teamPassword) {
      await chrome.storage.local.set({ unlocked: true });
      lockError.style.display = 'none';
      lockScreen.style.display = 'none';
      showApp();
    } else {
      lockError.style.display = 'block';
      lockInput.classList.add('shake');
      setTimeout(() => lockInput.classList.remove('shake'), 400);
      lockInput.select();
    }
  });

  lockInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnUnlock.click();
  });

  async function showApp() {
    appMain.style.display = 'block';

    // Initialize toggle state from storage
    const toggleData = await getStorage(['hiveEnabled']);
    const isEnabled = toggleData.hiveEnabled === true;
    hiveToggleInput.checked = isEnabled;
    hiveToggleLabel.textContent = isEnabled ? 'ON' : 'OFF';
    hiveToggleLabel.classList.toggle('on', isEnabled);

    await loadSettings();

    // Restore session defaults from storage (survive popup close/reopen)
    const sessionStore = await getStorage(['sessionDefaultCase', 'sessionDefaultCoa']);
    sessionDefaultCase = sessionStore.sessionDefaultCase || '';
    sessionDefaultCoa = sessionStore.sessionDefaultCoa || '';

    // Pre-load case names so capture form dropdown is populated immediately
    try {
      const records = await fetchFromDb();
      await loadCaseNames(records);
    } catch (e) {
      // Fall back to storage-only case names
      const stored = await getStorage(['caseNames']);
      knownCaseNames = (stored.caseNames || []).filter(n => n && n.trim()).sort();
    }

    await checkForPendingCapture();
  }

  // ── Navigation ──
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.values(views).forEach(v => v.classList.remove('active'));
      views[view].classList.add('active');

      if (view === 'brain') loadBrain();
    });
  });

  // ── Hive ON/OFF Toggle ──
  hiveToggleInput.addEventListener('change', () => {
    const isEnabled = hiveToggleInput.checked;
    chrome.storage.local.set({ hiveEnabled: isEnabled });
    hiveToggleLabel.textContent = isEnabled ? 'ON' : 'OFF';
    hiveToggleLabel.classList.toggle('on', isEnabled);
  });

  // ── Draft Persistence ──
  // Saves in-progress work so it survives popup close/reopen
  function saveDraft() {
    const citationInput = document.getElementById('citation-input');
    const draft = {
      capturedData: capturedData,
      manualText: manualText ? manualText.value : '',
      manualSource: manualSource ? manualSource.value : '',
      manualUrl: manualUrl ? manualUrl.value : '',
      why: whyInput ? whyInput.value : '',
      citation: citationInput ? citationInput.innerHTML : '',
      // Track which screen was showing
      screen: manualForm.style.display === 'block' ? 'manual'
            : captureForm.style.display === 'block' ? 'capture'
            : 'empty'
    };
    chrome.storage.local.set({ draft: draft });
  }

  function clearDraft() {
    chrome.storage.local.remove('draft');
  }

  async function restoreDraft() {
    const data = await getStorage(['draft']);
    if (!data.draft) return false;

    const d = data.draft;

    if (d.screen === 'manual') {
      // Restore manual paste form
      emptyState.style.display = 'none';
      manualForm.style.display = 'block';
      manualText.value = d.manualText || '';
      manualSource.value = d.manualSource || '';
      manualUrl.value = d.manualUrl || '';
      return true;
    }

    if (d.screen === 'capture' && d.capturedData) {
      // Restore capture form with previously captured data
      capturedData = d.capturedData;
      emptyState.style.display = 'none';
      captureForm.style.display = 'block';
      successState.style.display = 'none';

      sourceBadge.textContent = capturedData.source || 'Website';
      sourceLink.href = capturedData.url || '#';
      sourceTitle.textContent = capturedData.title || capturedData.url || '';
      capturedText.textContent = capturedData.text || '';

      whyInput.value = d.why || '';
      const citationInput = document.getElementById('citation-input');
      if (citationInput) citationInput.innerHTML = d.citation || '';
      return true;
    }

    return false;
  }

  // ── Check for pending capture from content script ──
  const loadingSplash = document.getElementById('loading-splash');

  async function checkForPendingCapture() {
    // First check for a pending capture from background (highlight or keyboard shortcut)
    try {
      const pending = await chrome.runtime.sendMessage({ type: 'GET_PENDING_CAPTURE' });
      if (pending && pending.manualMode) {
        // Keyboard shortcut with no selection — open manual paste with tab info pre-filled
        chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_CAPTURE' });
        if (loadingSplash) loadingSplash.style.display = 'none';
        manualForm.style.display = 'block';
        manualText.value = '';
        manualSource.value = pending.title || '';
        manualUrl.value = pending.url || '';
        manualTextError.style.display = 'none';
        manualSourceError.style.display = 'none';
        manualText.focus();
        return;
      }
      if (pending && pending.text) {
        if (loadingSplash) loadingSplash.style.display = 'none';
        showCaptureForm(pending);
        chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_CAPTURE' });
        return;
      }
    } catch (e) {}

    // Then check for selection from active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
        if (response && response.text) {
          if (loadingSplash) loadingSplash.style.display = 'none';
          showCaptureForm(response);
          return;
        }
      }
    } catch (e) {}

    // Nothing found — hide splash, show empty state or restore draft
    if (loadingSplash) loadingSplash.style.display = 'none';
    const restored = await restoreDraft();
    if (!restored) {
      emptyState.style.display = 'block';
    }
  }

  // ── Show Capture Form ──
  function showCaptureForm(data) {
    capturedData = data;

    emptyState.style.display = 'none';
    captureForm.style.display = 'block';
    successState.style.display = 'none';

    sourceBadge.textContent = data.source || 'Website';
    sourceLink.href = data.url;
    sourceTitle.textContent = data.title || data.url;

    // If we have HTML with links, render it; otherwise plain text
    if (data.html) {
      capturedText.innerHTML = sanitizeHtml(data.html);
    } else {
      capturedText.textContent = data.text;
    }

    // Show character count warning for long text
    const textLen = (data.text || '').length;
    const lengthWarning = document.getElementById('text-length-warning');
    if (lengthWarning) {
      if (textLen > 5000) {
        lengthWarning.textContent = `${textLen.toLocaleString()} characters — text will be truncated to 5,000 characters on save.`;
        lengthWarning.className = 'text-length-warning over';
        lengthWarning.style.display = 'block';
      } else if (textLen > 3000) {
        lengthWarning.textContent = `${textLen.toLocaleString()} characters — approaching the 5,000 character limit.`;
        lengthWarning.className = 'text-length-warning warn';
        lengthWarning.style.display = 'block';
      } else {
        lengthWarning.style.display = 'none';
      }
    }

    whyInput.value = '';
    whyInput.classList.remove('error');
    whyError.style.display = 'none';

    // Reset rating
    captureRating = '';
    captureRatingBtns.querySelectorAll('.capture-rating-btn').forEach(b => {
      b.className = 'capture-rating-btn';
    });

    // Populate case dropdown and apply session default
    populateCaptureCaseDropdown();
    if (sessionDefaultCase) {
      captureCaseSelect.value = sessionDefaultCase;
      sessionDefaultCheck.checked = true;
      sessionDefaultBadge.textContent = sessionDefaultCase;
      sessionDefaultBadge.style.display = 'inline';
    } else {
      captureCaseSelect.value = '';
      sessionDefaultCheck.checked = false;
      sessionDefaultBadge.style.display = 'none';
    }

    // Apply session default COA
    const coaSelect = document.getElementById('coa-select');
    if (coaSelect) {
      coaSelect.value = sessionDefaultCoa || '';
    }

    // Pre-fill citation (from two-step clipboard capture or empty)
    const citationInput = document.getElementById('citation-input');
    if (citationInput) citationInput.innerHTML = data.citation || '';

    whyInput.focus();
  }

  // Populate the case dropdown in the capture form
  function populateCaptureCaseDropdown() {
    const current = captureCaseSelect.value;
    captureCaseSelect.innerHTML = '<option value="">— None —</option>';
    knownCaseNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      captureCaseSelect.appendChild(opt);
    });
    const addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = '\u2795 Add new...';
    captureCaseSelect.appendChild(addOpt);
    // Restore previous selection if still valid
    if (current && Array.from(captureCaseSelect.options).some(o => o.value === current)) {
      captureCaseSelect.value = current;
    }
  }

  // Sanitize HTML — only keep <a> tags with href, strip everything else
  function sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // Walk the DOM and only keep text nodes and <a> tags
    function clean(node) {
      const result = document.createDocumentFragment();
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          result.appendChild(document.createTextNode(child.textContent));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'A' && child.href) {
            const a = document.createElement('a');
            a.href = child.href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = child.textContent;
            result.appendChild(a);
          } else if (child.tagName === 'BR') {
            result.appendChild(document.createElement('br'));
          } else {
            // Recurse into other elements but don't keep the element itself
            result.appendChild(clean(child));
          }
        }
      });
      return result;
    }
    const safeDiv = document.createElement('div');
    safeDiv.appendChild(clean(div));
    return safeDiv.innerHTML;
  }

  // ── Manual Paste ──
  const manualForm = document.getElementById('manual-form');
  const btnManual = document.getElementById('btn-manual');
  const manualText = document.getElementById('manual-text');
  const manualTextError = document.getElementById('manual-text-error');
  const manualSource = document.getElementById('manual-source');
  const manualSourceError = document.getElementById('manual-source-error');
  const manualUrl = document.getElementById('manual-url');
  const btnManualCancel = document.getElementById('btn-manual-cancel');
  const btnManualNext = document.getElementById('btn-manual-next');

  btnManual.addEventListener('click', async () => {
    emptyState.style.display = 'none';
    manualForm.style.display = 'block';
    manualText.value = '';
    manualSource.value = '';
    manualUrl.value = '';
    manualTextError.style.display = 'none';
    manualSourceError.style.display = 'none';

    // Auto-fill source and URL from current tab
    try {
      const tabInfo = await chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' });
      if (tabInfo) {
        manualSource.value = tabInfo.title || '';
        manualUrl.value = tabInfo.url || '';
      }
    } catch (e) {}

    manualText.focus();
  });

  btnManualCancel.addEventListener('click', () => {
    manualForm.style.display = 'none';
    emptyState.style.display = 'block';
    clearDraft();
  });

  btnManualNext.addEventListener('click', () => {
    let valid = true;
    if (!manualText.value.trim()) {
      manualTextError.style.display = 'block';
      valid = false;
    } else {
      manualTextError.style.display = 'none';
    }
    if (!manualSource.value.trim()) {
      manualSourceError.style.display = 'block';
      valid = false;
    } else {
      manualSourceError.style.display = 'none';
    }
    if (!valid) return;

    const data = {
      text: manualText.value.trim(),
      url: manualUrl.value.trim() || '',
      title: manualSource.value.trim(),
      source: manualSource.value.trim(),
      timestamp: new Date().toISOString()
    };
    manualForm.style.display = 'none';
    showCaptureForm(data);
  });

  // ── PDF Text Cleanup ──
  // Simply let the paste happen natively, then clean the result on the next tick
  manualText.addEventListener('paste', () => {
    // Wait one tick so the browser finishes pasting the text
    setTimeout(() => {
      const raw = manualText.value;
      const cleaned = cleanPdfText(raw);
      if (cleaned !== raw) {
        manualText.value = cleaned;
      }
    }, 0);
  });

  function cleanPdfText(text) {
    if (!text) return '';
    let t = text;
    // Normalize line endings
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Remove form feed / page break characters
    t = t.replace(/\f/g, '\n');
    // Remove null bytes and other control chars (except newline/tab)
    t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    // Remove zero-width and invisible unicode characters
    t = t.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');
    // Remove standalone page numbers (lines that are just a number)
    t = t.replace(/\n\s*\d{1,4}\s*\n/g, '\n');
    // Remove common PDF headers/footers (Case x:xx-xx, Page x of x, etc.)
    t = t.replace(/\n\s*Page\s+\d+\s+of\s+\d+\s*\n/gi, '\n');
    // Remove "Case X:XX-cv-XXXXX ..." style court headers
    t = t.replace(/\n\s*Case\s+\d+:\d+-\S+-\S+.*?\n/gi, '\n');
    // Join lines broken mid-sentence by PDF line wrapping:
    // If a line ends with a lowercase letter/comma/semicolon and next starts with lowercase, join them
    t = t.replace(/([a-z,;])\s*\n\s*([a-z])/g, '$1 $2');
    // Join lines where previous line doesn't end with sentence-ending punctuation
    t = t.replace(/([^.!?:"\u201d\n])\s*\n\s*([A-Za-z])/g, '$1 $2');
    // Fix hyphenated words split across lines
    t = t.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');
    // Collapse multiple spaces/tabs into one
    t = t.replace(/[ \t]+/g, ' ');
    // Collapse 3+ newlines into double newline (paragraph break)
    t = t.replace(/\n{3,}/g, '\n\n');
    // Clean up spaces around newlines
    t = t.replace(/ *\n */g, '\n');
    return t.trim();
  }

  manualText.addEventListener('input', () => { manualTextError.style.display = 'none'; saveDraft(); });
  manualSource.addEventListener('input', () => { manualSourceError.style.display = 'none'; saveDraft(); });
  manualUrl.addEventListener('input', () => { saveDraft(); });

  // ── Capture Form: Case Name Dropdown ──
  captureCaseSelect.addEventListener('change', () => {
    if (captureCaseSelect.value === '__add_new__') {
      captureCaseSelect.style.display = 'none';
      captureCaseNewInput.style.display = 'block';
      captureCaseNewInput.value = '';
      captureCaseNewInput.focus();
    }
  });

  function commitCaptureCaseName() {
    const caseName = captureCaseNewInput.value.trim();
    if (caseName) {
      if (!knownCaseNames.includes(caseName)) {
        knownCaseNames.push(caseName);
        knownCaseNames.sort();
        saveCaseName(caseName);
      }
      populateCaptureCaseDropdown();
      captureCaseSelect.value = caseName;
    } else {
      captureCaseSelect.value = '';
    }
    captureCaseNewInput.style.display = 'none';
    captureCaseSelect.style.display = 'block';
  }

  captureCaseNewInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitCaptureCaseName(); }
    if (e.key === 'Escape') {
      captureCaseNewInput.style.display = 'none';
      captureCaseSelect.style.display = 'block';
      captureCaseSelect.value = '';
    }
  });
  captureCaseNewInput.addEventListener('blur', () => {
    setTimeout(commitCaptureCaseName, 150);
  });

  // ── Session Default ──
  sessionDefaultCheck.addEventListener('change', () => {
    if (sessionDefaultCheck.checked) {
      const caseName = captureCaseSelect.value;
      if (caseName && caseName !== '__add_new__') {
        sessionDefaultCase = caseName;
        sessionDefaultBadge.textContent = caseName;
        sessionDefaultBadge.style.display = 'inline';
        chrome.storage.local.set({ sessionDefaultCase });
      } else {
        sessionDefaultCheck.checked = false;
      }
    } else {
      sessionDefaultCase = '';
      sessionDefaultBadge.style.display = 'none';
      chrome.storage.local.set({ sessionDefaultCase: '' });
    }
  });

  // ── Capture Form: Rating Buttons ──
  captureRatingBtns.querySelectorAll('.capture-rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rating = btn.dataset.rating;
      const newRating = (captureRating === rating) ? '' : rating;
      captureRating = newRating;
      captureRatingBtns.querySelectorAll('.capture-rating-btn').forEach(b => {
        b.className = 'capture-rating-btn';
      });
      if (newRating) {
        btn.classList.add('active-' + newRating.toLowerCase());
      }
    });
  });

  // ── Save (local + Supabase) ──
  btnSave.addEventListener('click', async () => {
    const why = whyInput.value.trim();
    if (!why) {
      whyInput.classList.add('error');
      whyError.style.display = 'block';
      whyInput.focus();
      return;
    }

    const settings = await getSettings();

    btnSave.disabled = true;
    btnSaveText.style.display = 'none';
    btnSaveSpinner.style.display = 'inline-block';

    const coaSelect = document.getElementById('coa-select');
    const citationInput = document.getElementById('citation-input');
    const caseName = captureCaseSelect.value === '__add_new__' ? '' : (captureCaseSelect.value || '');

    // Truncate text if over 5000 characters
    let savedText = capturedData.text || '';
    let savedHtml = capturedData.html || '';
    if (savedText.length > 5000) {
      savedText = savedText.substring(0, 5000);
      savedHtml = ''; // HTML can't be reliably truncated, fall back to plain text
    }

    const record = {
      text: savedText,
      html: savedHtml,
      url: capturedData.url,
      pageTitle: capturedData.title,
      source: capturedData.source,
      why: why,
      tags: '',
      user: settings.userName || 'Unknown',
      timestamp: capturedData.timestamp || new Date().toISOString(),
      causeOfAction: coaSelect ? coaSelect.value : '',
      caseName: caseName,
      rating: captureRating,
      citation: citationInput ? citationInput.innerHTML.trim() : ''
    };

    // Auto-set session defaults so next clip keeps the same case + COA
    sessionDefaultCase = caseName || '';
    sessionDefaultCoa = coaSelect ? coaSelect.value : '';
    // Persist to storage so defaults survive popup close/reopen
    chrome.storage.local.set({ sessionDefaultCase, sessionDefaultCoa });

    // Save locally as backup
    await saveLocally(record);

    // Sync to Supabase (fire-and-forget — don't block on failure)
    saveToDb(record).catch(err => console.warn('DB sync failed:', err));

    clearDraft();

    // Show success
    captureForm.style.display = 'none';
    successState.style.display = 'block';

    btnSave.disabled = false;
    btnSaveText.style.display = 'inline';
    btnSaveSpinner.style.display = 'none';
  });

  function formatBroadcast(record) {
    const title = record.pageTitle || record.source || 'something interesting';

    let msg = `\uD83D\uDCCC ${title}\n\n`;
    msg += `\uD83D\uDCA1 Why it matters: ${record.why}\n\n`;
    msg += `\uD83D\uDCD6 Key Quote:\n"${record.text}"\n\n`;
    if (record.citation) msg += `\uD83D\uDCCE Citation: ${record.citation}\n`;
    if (record.url) msg += `\uD83D\uDD17 ${record.url}\n`;
    if (record.tags) msg += `\n#${record.tags.split(',').map(t => t.trim()).join(' #')}`;
    return msg;
  }

  // ── New Capture ──
  btnNewCapture.addEventListener('click', () => {
    capturedData = null;
    emptyState.style.display = 'block';
    captureForm.style.display = 'none';
    successState.style.display = 'none';
    manualForm.style.display = 'none';
    clearDraft();
  });

  // ── Cancel ──
  btnCancel.addEventListener('click', () => {
    capturedData = null;
    emptyState.style.display = 'block';
    captureForm.style.display = 'none';
    successState.style.display = 'none';
    manualForm.style.display = 'none';
    clearDraft();
  });

  // ── Why input validation reset + auto-save draft ──
  whyInput.addEventListener('input', () => {
    whyInput.classList.remove('error');
    whyError.style.display = 'none';
    saveDraft();
  });

  // ── Citation auto-save draft ──
  const citationDraftInput = document.getElementById('citation-input');
  if (citationDraftInput) {
    citationDraftInput.addEventListener('input', () => { saveDraft(); });
  }

  // ── Cached case names (loaded once per Brain open) ──
  let knownCaseNames = [];
  // ── Live in-memory copy of Brain records (updated as user edits case/rating) ──
  let liveBrainRecords = [];

  async function loadCaseNames(records) {
    // Combine case names from DB records + chrome.storage.local
    const fromRecords = records.map(r => r.caseName).filter(n => n && n.trim());
    const stored = await getStorage(['caseNames']);
    const fromStorage = (stored.caseNames || []).filter(n => n && n.trim());
    knownCaseNames = [...new Set([...fromRecords, ...fromStorage])].sort();
  }

  // ── Brain (Knowledge Bank) — reads from Supabase (shared) ──
  async function loadBrain() {
    brainLoading.style.display = 'block';
    brainEmpty.style.display = 'none';
    brainList.innerHTML = '';

    let records = [];
    try {
      records = await fetchFromDb();
    } catch (err) {
      console.warn('Failed to load from DB, falling back to local:', err);
      records = await getLocalRecords();
    }

    // Keep a live reference so Case Report can use in-memory edits
    liveBrainRecords = records;

    // Build combined list of known case names
    await loadCaseNames(records);

    brainLoading.style.display = 'none';

    if (records.length === 0) {
      brainEmpty.style.display = 'block';
    } else {
      renderBrainItems(records);
    }
  }

  function renderBrainItems(records) {
    const query = brainSearch.value.trim().toLowerCase();

    const filtered = query
      ? records.filter(r =>
          (r.why || '').toLowerCase().includes(query) ||
          (r.text || '').toLowerCase().includes(query) ||
          (r.tags || '').toLowerCase().includes(query) ||
          (r.source || '').toLowerCase().includes(query) ||
          (r.causeOfAction || '').toLowerCase().includes(query) ||
          (r.caseName || '').toLowerCase().includes(query)
        )
      : records;

    if (filtered.length === 0) {
      brainEmpty.style.display = 'block';
      brainList.innerHTML = '';
      return;
    }

    brainEmpty.style.display = 'none';

    brainList.innerHTML = filtered.map((r, idx) => {
      const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '';
      const tagsHtml = (r.tags || '').split(',').filter(t => t.trim()).map(t =>
        `<span class="brain-item-tag">${escapeHtml(t.trim())}</span>`
      ).join('');
      const coaBadge = r.causeOfAction
        ? `<span class="brain-item-coa">${escapeHtml(r.causeOfAction)}</span>`
        : '';
      const currentRating = r.rating || '';
      const currentCase = r.caseName || '';

      // Build case name dropdown options
      let caseOptions = '<option value="">— Assign case —</option>';
      knownCaseNames.forEach(name => {
        const selected = name === currentCase ? ' selected' : '';
        caseOptions += `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
      });
      // If current value exists but isn't in knownCaseNames, add it
      if (currentCase && !knownCaseNames.includes(currentCase)) {
        caseOptions += `<option value="${escapeHtml(currentCase)}" selected>${escapeHtml(currentCase)}</option>`;
      }
      caseOptions += '<option value="__add_new__">➕ Add new...</option>';

      const citationHtml = r.citation
        ? `<div class="brain-item-citation">${r.citation}</div>`
        : '';

      return `
        <div class="brain-item">
          <div class="brain-item-header">
            <div class="brain-item-badges">
              <span class="brain-item-source">${escapeHtml(r.source || 'Web')}</span>
              ${coaBadge}
            </div>
            <span class="brain-item-date">${date}</span>
          </div>
          ${citationHtml}
          <div class="brain-item-why">${escapeHtml(r.why || '')}</div>
          <div class="brain-item-text">${r.html ? sanitizeHtml(r.html) : escapeHtml(r.text || '')}</div>
          ${tagsHtml ? `<div class="brain-item-tags">${tagsHtml}</div>` : ''}
          <div class="brain-item-case-row">
            <select class="brain-case-select" data-idx="${idx}">
              ${caseOptions}
            </select>
            <input type="text" class="brain-case-new-input" data-idx="${idx}" placeholder="Type case name..." style="display: none;" />
            <div class="brain-rating-btns">
              <button class="brain-rating-btn ${currentRating === 'Helpful' ? 'active-helpful' : ''}" data-idx="${idx}" data-rating="Helpful" title="Helpful">✅</button>
              <button class="brain-rating-btn ${currentRating === 'Negative' ? 'active-negative' : ''}" data-idx="${idx}" data-rating="Negative" title="Negative">⚠️</button>
              <button class="brain-rating-btn ${currentRating === 'Neutral' ? 'active-neutral' : ''}" data-idx="${idx}" data-rating="Neutral" title="Neutral">➖</button>
            </div>
          </div>
          <div class="brain-item-actions">
            <button class="btn-brain-broadcast" data-idx="${idx}">&#128225; Broadcast</button>
          </div>
          <div class="brain-broadcast-card" id="brain-broadcast-${idx}" style="display: none;">
            <div class="brain-broadcast-text" id="brain-broadcast-text-${idx}"></div>
            <button class="btn btn-secondary btn-full btn-brain-copy" data-idx="${idx}">&#128203; Copy to Clipboard</button>
            <p class="brain-copy-feedback" id="brain-copy-feedback-${idx}" style="display: none;">Copied!</p>
          </div>
        </div>
      `;
    }).join('');

    // Attach broadcast button handlers
    brainList.querySelectorAll('.btn-brain-broadcast').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const card = document.getElementById(`brain-broadcast-${idx}`);
        const textEl = document.getElementById(`brain-broadcast-text-${idx}`);

        if (card.style.display === 'block') {
          card.style.display = 'none';
          btn.textContent = '📢 Broadcast';
          return;
        }

        // Close any other open broadcast cards
        brainList.querySelectorAll('.brain-broadcast-card').forEach(c => c.style.display = 'none');
        brainList.querySelectorAll('.btn-brain-broadcast').forEach(b => b.textContent = '📢 Broadcast');

        textEl.textContent = formatBroadcast(filtered[idx]);
        card.style.display = 'block';
        btn.textContent = '▲ Hide';
      });
    });

    // Attach copy button handlers
    brainList.querySelectorAll('.btn-brain-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = btn.dataset.idx;
        const text = document.getElementById(`brain-broadcast-text-${idx}`).textContent;
        const feedback = document.getElementById(`brain-copy-feedback-${idx}`);
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        feedback.style.display = 'block';
        setTimeout(() => { feedback.style.display = 'none'; }, 2000);
      });
    });

    // Attach case name dropdown handlers
    brainList.querySelectorAll('.brain-case-select').forEach(select => {
      select.addEventListener('change', () => {
        const idx = parseInt(select.dataset.idx);
        const r = filtered[idx];

        if (select.value === '__add_new__') {
          // Show text input, hide dropdown
          select.style.display = 'none';
          const newInput = select.parentElement.querySelector('.brain-case-new-input');
          newInput.style.display = 'block';
          newInput.focus();
          return;
        }

        const caseName = select.value;
        filtered[idx].caseName = caseName;
        updateRecordInDb(r.id, { caseName: caseName });
      });
    });

    // Attach "Add new" text input handlers (shown when user picks "➕ Add new...")
    brainList.querySelectorAll('.brain-case-new-input').forEach(input => {
      function commitNewCase() {
        const idx = parseInt(input.dataset.idx);
        const r = filtered[idx];
        const caseName = input.value.trim();
        const select = input.parentElement.querySelector('.brain-case-select');

        if (caseName) {
          // Add to known list and save
          if (!knownCaseNames.includes(caseName)) {
            knownCaseNames.push(caseName);
            knownCaseNames.sort();
          }
          saveCaseName(caseName);

          // Add option to this dropdown and all others on the page
          brainList.querySelectorAll('.brain-case-select').forEach(s => {
            // Check if option already exists
            const exists = Array.from(s.options).some(o => o.value === caseName);
            if (!exists) {
              const addNewOpt = s.querySelector('option[value="__add_new__"]');
              const newOpt = document.createElement('option');
              newOpt.value = caseName;
              newOpt.textContent = caseName;
              s.insertBefore(newOpt, addNewOpt);
            }
          });

          // Select the new value
          select.value = caseName;
          filtered[idx].caseName = caseName;
          updateRecordInDb(r.id, { caseName: caseName });
        } else {
          // Empty — revert to whatever was selected before
          select.value = r.caseName || '';
        }

        // Hide input, show dropdown
        input.style.display = 'none';
        select.style.display = 'block';
        input.value = '';
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitNewCase();
        }
        if (e.key === 'Escape') {
          const select = input.parentElement.querySelector('.brain-case-select');
          select.value = filtered[parseInt(input.dataset.idx)].caseName || '';
          input.style.display = 'none';
          select.style.display = 'block';
          input.value = '';
        }
      });

      input.addEventListener('blur', () => {
        // Small delay to allow click events to fire first
        setTimeout(() => commitNewCase(), 150);
      });
    });

    // Attach rating button handlers
    brainList.querySelectorAll('.brain-rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const r = filtered[idx];
        const rating = btn.dataset.rating;

        // Toggle: if already active, clear it
        const newRating = (r.rating === rating) ? '' : rating;
        filtered[idx].rating = newRating;

        // Update button styles in this row
        const row = btn.closest('.brain-item-case-row');
        row.querySelectorAll('.brain-rating-btn').forEach(b => {
          b.className = 'brain-rating-btn';
        });
        if (newRating) {
          btn.classList.add('active-' + newRating.toLowerCase());
        }

        updateRecordInDb(r.id, { rating: newRating });
      });
    });
  }

  // ── Update record in Supabase ──
  async function updateRecordInDb(id, updates) {
    if (!id) {
      console.warn('No id — cannot update DB. Record:', updates);
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'DB_UPDATE',
        id: id,
        updates: updates
      });
      console.log('DB update result:', JSON.stringify(result), 'id:', id, 'updates:', JSON.stringify(updates));
    } catch (e) {
      console.warn('Failed to update DB:', e);
    }
  }

  // ── Save case name for autocomplete ──
  async function saveCaseName(name) {
    if (!name) return;
    const data = await getStorage(['caseNames']);
    const names = data.caseNames || [];
    if (!names.includes(name)) {
      names.push(name);
      await chrome.storage.local.set({ caseNames: names });
    }
  }

  // ── Case Report ──
  const btnCaseReport = document.getElementById('btn-case-report');
  const caseReportPanel = document.getElementById('case-report-panel');
  const caseReportSelect = document.getElementById('case-report-select');
  const btnGenerateReport = document.getElementById('btn-generate-report');
  const caseReportOutput = document.getElementById('case-report-output');
  const caseReportText = document.getElementById('case-report-text');
  const btnCopyReport = document.getElementById('btn-copy-report');
  const reportCopyFeedback = document.getElementById('report-copy-feedback');
  const btnCloseReport = document.getElementById('btn-close-report');

  let allRecordsForReport = [];

  btnCaseReport.addEventListener('click', async () => {
    // Use the live in-memory records (which include any case/rating edits
    // the user made during this session) instead of re-fetching from DB
    allRecordsForReport = liveBrainRecords;

    // If Brain hasn't been loaded yet, fetch now
    if (allRecordsForReport.length === 0) {
      try {
        allRecordsForReport = await fetchFromDb();
      } catch (e) {
        allRecordsForReport = await getLocalRecords();
      }
      liveBrainRecords = allRecordsForReport;
      await loadCaseNames(allRecordsForReport);
    }

    // Get case names that actually have records assigned
    const caseNamesWithRecords = [...new Set(allRecordsForReport.map(r => r.caseName).filter(n => n && n.trim()))].sort();

    caseReportSelect.innerHTML = '<option value="">— Pick a case —</option>';
    caseNamesWithRecords.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      caseReportSelect.appendChild(opt);
    });

    if (caseNamesWithRecords.length === 0) {
      caseReportSelect.innerHTML = '<option value="">No cases assigned yet</option>';
    }

    caseReportOutput.style.display = 'none';
    caseReportPanel.style.display = 'block';
  });

  btnCloseReport.addEventListener('click', () => {
    caseReportPanel.style.display = 'none';
  });

  btnGenerateReport.addEventListener('click', () => {
    const caseName = caseReportSelect.value;
    if (!caseName) return;

    const caseRecords = allRecordsForReport.filter(r => r.caseName === caseName);

    const helpful = caseRecords.filter(r => r.rating === 'Helpful');
    const negative = caseRecords.filter(r => r.rating === 'Negative');
    const neutral = caseRecords.filter(r => r.rating === 'Neutral');
    const unrated = caseRecords.filter(r => !r.rating);

    let report = `📋 Case Report: ${caseName}\n`;
    report += `📅 Generated: ${new Date().toLocaleDateString()}\n`;
    report += `📊 ${caseRecords.length} clip${caseRecords.length !== 1 ? 's' : ''} total\n\n`;

    function formatSection(title, emoji, items) {
      if (items.length === 0) return '';
      let s = `${emoji} ${title} (${items.length})\n\n`;
      items.forEach((r, i) => {
        const source = r.pageTitle || r.source || 'Unknown source';
        s += `  ${i + 1}. 📌 ${source}\n`;
        s += `     💡 Why it matters: ${r.why || ''}\n`;
        s += `     📖 Key Quote:\n     "${r.text || ''}"\n`;
        if (r.citation) s += `     📎 Citation: ${r.citation}\n`;
        if (r.url) s += `     🔗 ${r.url}\n`;
        s += '\n';
      });
      return s;
    }

    report += formatSection('HELPFUL', '✅', helpful);
    report += formatSection('NEGATIVE', '⚠️', negative);
    report += formatSection('NEUTRAL', '➖', neutral);
    if (unrated.length > 0) {
      report += formatSection('UNRATED', '📂', unrated);
    }

    caseReportText.textContent = report;
    caseReportOutput.style.display = 'block';
  });

  btnCopyReport.addEventListener('click', async () => {
    const text = caseReportText.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    reportCopyFeedback.style.display = 'block';
    setTimeout(() => { reportCopyFeedback.style.display = 'none'; }, 2000);
  });

  // Debounced search
  let searchTimeout;
  brainSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadBrain, 300);
  });

  // ── Export as CSV ──
  const btnExport = document.getElementById('btn-export');
  btnExport.addEventListener('click', async () => {
    let records = [];
    try {
      records = await fetchFromDb();
    } catch (err) {
      records = await getLocalRecords();
    }
    if (records.length === 0) return;

    const headers = ['Timestamp', 'User', 'Source', 'Page Title', 'URL', 'Captured Text', 'Why It Matters', 'Tags', 'Cause of Action', 'Case Name', 'Rating', 'Citation'];
    const rows = records.map(r => [
      r.timestamp || '',
      r.user || '',
      r.source || '',
      r.pageTitle || '',
      r.url || '',
      r.text || '',
      r.why || '',
      r.tags || '',
      r.causeOfAction || '',
      r.caseName || '',
      r.rating || '',
      r.citation || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the-hive-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Settings (just your name now) ──
  async function loadSettings() {
    const settings = await getSettings();
    userNameInput.value = settings.userName || '';
  }

  btnSaveSettings.addEventListener('click', async () => {
    const userName = userNameInput.value.trim();
    await chrome.storage.local.set({ userName: userName });
    showSettingsFeedback('Settings saved!', 'success');
  });

  function showSettingsFeedback(msg, type) {
    settingsFeedback.textContent = msg;
    settingsFeedback.className = `settings-feedback ${type}`;
    settingsFeedback.style.display = 'block';
    setTimeout(() => { settingsFeedback.style.display = 'none'; }, 3000);
  }

  // ── Supabase Sync ──
  async function saveToDb(record) {
    const result = await chrome.runtime.sendMessage({
      type: 'DB_SAVE',
      record: record
    });
    if (!result || !result.success) throw new Error((result && result.error) || 'Save failed');
    return result;
  }

  async function fetchFromDb() {
    const result = await chrome.runtime.sendMessage({
      type: 'DB_FETCH'
    });
    if (!result || !result.success) throw new Error((result && result.error) || 'Fetch failed');
    // Return newest first
    return (result.records || []).reverse();
  }

  // ── Helpers ──
  async function getStorage(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, (data) => {
        resolve(data || {});
      });
    });
  }

  async function getSettings() {
    return getStorage(['userName']);
  }

  async function saveLocally(record) {
    return new Promise(resolve => {
      chrome.storage.local.get(['localRecords'], (data) => {
        const records = data.localRecords || [];
        records.unshift(record);
        if (records.length > 500) records.length = 500;
        chrome.storage.local.set({ localRecords: records }, resolve);
      });
    });
  }

  async function getLocalRecords() {
    return new Promise(resolve => {
      chrome.storage.local.get(['localRecords'], (data) => {
        resolve(data.localRecords || []);
      });
    });
  }

  function switchToView(viewName) {
    navBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    Object.entries(views).forEach(([name, el]) => {
      el.classList.toggle('active', name === viewName);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
