/**
 * Unstuck Task Board Webhook — Google Apps Script
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Sheet IDs:
 *   task_board:      135bzbZjYolxAlJJQ3Vv5baMJ6TWI4mwV9oiwEgjm6D4
 *   alerts:          1LlH3dbQ0KiVQ9l7nnxxSq0pDl_nv2XjiGLwENII6xu8
 *   production_log:    1WbfeDCsK8DMnCmfC89P9lVDiseo61HmYqcaxe40Lu_c
 */

const SHEETS = {
  task_board: '135bzbZjYolxAlJJQ3Vv5baMJ6TWI4mwV9oiwEgjm6D4',
  alerts: '1LlH3dbQ0KiVQ9l7nnxxSq0pDl_nv2XjiGLwENII6xu8',
  production_log: '1WbfeDCsK8DMnCmfC89P9lVDiseo61HmYqcaxe40Lu_c',
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const target = body.target || 'task_board';
    const sheetId = SHEETS[target];

    if (!sheetId) {
      return jsonResponse({ ok: false, error: 'unknown target: ' + target });
    }

    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheets()[0];

    if (target === 'task_board') {
      sheet.appendRow([
        body.timestamp || new Date().toISOString(),
        body.source || 'dispatcher',
        body.from || 'Travis',
        body.message || '',
      ]);
    } else if (target === 'alerts') {
      sheet.appendRow([
        body.timestamp || new Date().toISOString(),
        body.source || 'dispatcher',
        body.level || 'info',
        body.message || '',
      ]);
    } else if (target === 'production_log') {
      sheet.appendRow([
        body.timestamp || new Date().toISOString(),
        body.source || 'dispatcher',
        body.event || '',
        body.detail || '',
      ]);
    }

    return jsonResponse({ ok: true, target: target });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'unstuck-board-webhook' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
