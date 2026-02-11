// PASTE THIS INTO YOUR GOOGLE APPS SCRIPT EDITOR
// (Google Sheet → Extensions → Apps Script)
// Then: Deploy → Manage deployments → Edit → Version: "New version" → Deploy

function doGet(e) {
  try {
    var payload = e.parameter.payload;
    if (!payload) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var data = JSON.parse(payload);
    return handleRequest(data);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return handleRequest(data);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleRequest(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (data.action === 'save') {
    var record = data.record;
    sheet.appendRow([
      record.timestamp || '',
      record.user || '',
      record.source || '',
      record.pageTitle || '',
      record.url || '',
      record.text || '',
      record.why || '',
      record.tags || '',
      record.causeOfAction || '',
      record.caseName || '',
      record.rating || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'getAll') {
    var rows = sheet.getDataRange().getValues();
    var records = [];
    for (var i = 1; i < rows.length; i++) {
      records.push({
        rowNumber: i + 1,
        timestamp: rows[i][0],
        user: rows[i][1],
        source: rows[i][2],
        pageTitle: rows[i][3],
        url: rows[i][4],
        text: rows[i][5],
        why: rows[i][6],
        tags: rows[i][7],
        causeOfAction: rows[i][8] || '',
        caseName: rows[i][9] || '',
        rating: rows[i][10] || ''
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, records: records }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'update') {
    var row = data.rowNumber;
    if (!row || row < 2) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid row number' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.caseName !== undefined) {
      sheet.getRange(row, 10).setValue(data.caseName);
    }
    if (data.rating !== undefined) {
      sheet.getRange(row, 11).setValue(data.rating);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupHeaders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange(1, 1, 1, 11).setValues([['Timestamp', 'User', 'Source', 'Page Title', 'URL', 'Captured Text', 'Why It Matters', 'Tags', 'Cause of Action', 'Case Name', 'Rating']]);
}
