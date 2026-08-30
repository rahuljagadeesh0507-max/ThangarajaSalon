function getResponsesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Responses");

  if (!sheet) {
    sheet = ss.insertSheet("Responses");
    sheet.getRange(1, 1, 1, 4).setValues([
      ["Timestamp", "Name", "Email", "Phone"]
    ]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([
      ["Timestamp", "Name", "Email", "Phone"]
    ]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
  }

  return sheet;
}

function jsonResponse_(success) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveResponse_(name, email, phone) {
  name = String(name || "").trim();
  email = String(email || "").trim();
  phone = String(phone || "").trim();

  if (!name || !email || !phone) {
    return false;
  }

  const sheet = getResponsesSheet_();
  sheet.appendRow([new Date(), name, email, phone]);
  return true;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const success = saveResponse_(params.name, params.email, params.phone);
    return jsonResponse_(success);
  } catch (error) {
    return jsonResponse_(false);
  }
}

function doPost(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const success = saveResponse_(params.name, params.email, params.phone);
    return jsonResponse_(success);
  } catch (error) {
    return jsonResponse_(false);
  }
}
