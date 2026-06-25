const SHEETS = {
  settings: "Settings",
  rooms: "Rooms",
  inventory: "Inventory",
  bookings: "Bookings",
  groups: "Group Enquiries",
};

const HOTEL_EMAILS_DEFAULT = "luxmihotelbooking@gmail.com,luxmihotel2017@gmail.com,rachit.coolg@gmail.com";
const HOTEL_NAME = "Luxmi Hotel";
const HOTEL_PHONE = "+91 70074 17970";
const SPREADSHEET_NAME = "Luxmi Hotel Booking Admin";

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);

  const ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty("SPREADSHEET_ID", ss.getId());
  return ss;
}

function setup() {
  const ss = getSpreadsheet_();
  const props = PropertiesService.getScriptProperties();
  let adminKey = props.getProperty("ADMIN_KEY");
  if (!adminKey) {
    adminKey = Utilities.getUuid().replace(/-/g, "").slice(0, 18);
    props.setProperty("ADMIN_KEY", adminKey);
  }
  if (!props.getProperty("HOTEL_EMAILS")) props.setProperty("HOTEL_EMAILS", HOTEL_EMAILS_DEFAULT);

  ensureSheet_(ss, SHEETS.settings, ["Key", "Value"]);
  ensureSheet_(ss, SHEETS.rooms, ["Room Type", "Base Price", "Max Persons", "Total Rooms", "Active", "Notes"]);
  ensureSheet_(ss, SHEETS.inventory, ["Date", "Room Type", "Available Rooms", "Price Override", "Notes", "Updated At"]);
  ensureSheet_(ss, SHEETS.bookings, ["Timestamp", "Booking ID", "Status", "Name", "Phone", "Email", "Check-in", "Check-out", "Persons", "Room Type", "Message", "Source"]);
  ensureSheet_(ss, SHEETS.groups, ["Timestamp", "Enquiry ID", "Status", "Name", "Phone", "Email", "Arrival", "Departure", "Persons", "Rooms", "Purpose", "Message", "Source"]);

  seedRooms_(ss.getSheetByName(SHEETS.rooms));
  writeSettings_(ss, adminKey);
  SpreadsheetApp.flush();
  Logger.log("Admin URL: " + ScriptApp.getService().getUrl() + "?adminKey=" + adminKey);
  Logger.log("Admin Key: " + adminKey);
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  return "Setup complete. Admin key: " + adminKey;
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (params.health === "1") return text_("OK");
  if (!isAdmin_(params.adminKey)) return adminLogin_();
  return adminPage_(params.adminKey, params.message || "");
}

function doPost(e) {
  const data = parsePost_(e);
  const action = String(data.action || "booking").trim();

  if (action === "booking") return handleBooking_(data);
  if (action === "group") return handleGroup_(data);

  if (!isAdmin_(data.adminKey)) return text_("Unauthorized");
  if (action === "update-room") {
    updateRoom_(data);
    return adminPage_(data.adminKey, "Room updated.");
  }
  if (action === "update-inventory") {
    updateInventory_(data);
    return adminPage_(data.adminKey, "Inventory updated.");
  }
  if (action === "update-booking") {
    updateBookingStatus_(data);
    return adminPage_(data.adminKey, "Booking status updated.");
  }
  return text_("Unknown action");
}

function handleBooking_(data) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  const id = "LH-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const row = [
    new Date(),
    id,
    "Pending",
    clean_(data.name),
    clean_(data.phone),
    clean_(data.email),
    clean_(data.checkin),
    clean_(data.checkout),
    clean_(data.guests),
    clean_(data.room),
    clean_(data.message),
    clean_(data.source || "Website"),
  ];
  ss.getSheetByName(SHEETS.bookings).appendRow(row);
  sendBookingEmails_(id, data);
  return json_({ ok: true, id: id, message: "Booking enquiry received" });
}

function handleGroup_(data) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  const id = "LG-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const row = [
    new Date(),
    id,
    "New",
    clean_(data.name),
    clean_(data.phone),
    clean_(data.email),
    clean_(data.arrival),
    clean_(data.departure),
    clean_(data.guests),
    clean_(data.rooms),
    clean_(data.purpose),
    clean_(data.message),
    clean_(data.source || "Website"),
  ];
  ss.getSheetByName(SHEETS.groups).appendRow(row);
  sendGroupEmails_(id, data);
  return json_({ ok: true, id: id, message: "Group enquiry received" });
}

function sendBookingEmails_(id, data) {
  const hotelEmails = getHotelEmails_();
  const subject = "Booking enquiry " + id + " - " + HOTEL_NAME;
  const body = [
    "New booking enquiry received.",
    "",
    "Booking ID: " + id,
    "Name: " + clean_(data.name),
    "Phone: " + clean_(data.phone),
    "Email: " + clean_(data.email),
    "Room: " + clean_(data.room),
    "Persons: " + clean_(data.guests),
    "Check-in: " + clean_(data.checkin),
    "Check-out: " + clean_(data.checkout),
    "Message: " + clean_(data.message),
    "",
    "Please confirm availability from the admin sheet.",
  ].join("\n");
  if (hotelEmails.length) MailApp.sendEmail(hotelEmails.join(","), subject, body);

  if (clean_(data.email)) {
    MailApp.sendEmail(clean_(data.email), "Your Luxmi Hotel booking enquiry - " + id, [
      "Dear " + clean_(data.name) + ",",
      "",
      "Thank you for contacting Luxmi Hotel, Prayagraj.",
      "We have received your booking enquiry.",
      "",
      "Booking ID: " + id,
      "Room: " + clean_(data.room),
      "Persons: " + clean_(data.guests),
      "Check-in: " + clean_(data.checkin),
      "Check-out: " + clean_(data.checkout),
      "",
      "Our team will confirm availability shortly.",
      "",
      HOTEL_NAME,
      HOTEL_PHONE,
    ].join("\n"));
  }
}

function sendGroupEmails_(id, data) {
  const hotelEmails = getHotelEmails_();
  const subject = "Group enquiry " + id + " - " + HOTEL_NAME;
  const body = [
    "New group enquiry received.",
    "",
    "Enquiry ID: " + id,
    "Name: " + clean_(data.name),
    "Phone: " + clean_(data.phone),
    "Email: " + clean_(data.email),
    "Arrival: " + clean_(data.arrival),
    "Departure: " + clean_(data.departure),
    "Persons: " + clean_(data.guests),
    "Rooms: " + clean_(data.rooms),
    "Purpose: " + clean_(data.purpose),
    "Message: " + clean_(data.message),
  ].join("\n");
  if (hotelEmails.length) MailApp.sendEmail(hotelEmails.join(","), subject, body);
  if (clean_(data.email)) {
    MailApp.sendEmail(clean_(data.email), "Your Luxmi Hotel group enquiry - " + id, [
      "Dear " + clean_(data.name) + ",",
      "",
      "Thank you for your group enquiry at Luxmi Hotel, Prayagraj.",
      "Enquiry ID: " + id,
      "Our team will contact you shortly.",
      "",
      HOTEL_NAME,
      HOTEL_PHONE,
    ].join("\n"));
  }
}

function adminPage_(adminKey, message) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  const rooms = readObjects_(ss.getSheetByName(SHEETS.rooms));
  const bookings = readObjects_(ss.getSheetByName(SHEETS.bookings)).reverse().slice(0, 80);
  const groups = readObjects_(ss.getSheetByName(SHEETS.groups)).reverse().slice(0, 60);
  const inventory = readObjects_(ss.getSheetByName(SHEETS.inventory)).reverse().slice(0, 80);
  const url = ScriptApp.getService().getUrl();
  const sheetUrl = ss.getUrl();

  return HtmlService.createHtmlOutput(`
    <!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Luxmi Hotel Admin</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;background:#fffaf4;color:#171210}main{max-width:1180px;margin:auto;padding:22px}h1,h2{color:#7a1720}section{margin:22px 0;padding:18px;background:#fff;border:1px solid #e7ded7;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}input,select,textarea{width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ddd;border-radius:5px}button{padding:9px 14px;border:0;border-radius:5px;background:#7a1720;color:white;font-weight:700}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.msg{padding:10px;background:#e9f8ef;color:#126437;border-radius:6px}.small{font-size:12px;color:#6f625b}.scroll{overflow:auto}@media(max-width:800px){.grid{grid-template-columns:1fr}}
    </style></head><body><main>
      <h1>Luxmi Hotel Admin</h1>
      <p class="small">Web app URL: ${escapeHtml_(url)} | Admin key: ${escapeHtml_(adminKey)}</p>
      <p><a href="${escapeHtml_(sheetUrl)}" target="_blank" rel="noopener">Open Google Sheet records</a></p>
      ${message ? `<p class="msg">${escapeHtml_(message)}</p>` : ""}
      <section><h2>Rooms, Prices and Total Inventory</h2><div class="grid">${rooms.map(roomForm_(adminKey, url)).join("")}</div></section>
      <section><h2>Date-wise Inventory / Price Override</h2>
        <form method="post" action="${url}">
          <input type="hidden" name="action" value="update-inventory"><input type="hidden" name="adminKey" value="${escapeHtml_(adminKey)}">
          <div class="grid"><label>Date<input type="date" name="date" required></label><label>Room Type<select name="room">${rooms.map(r=>`<option>${escapeHtml_(r["Room Type"])}</option>`).join("")}</select></label><label>Available Rooms<input type="number" name="available" min="0" required></label><label>Price Override<input type="number" name="price" min="0"></label></div>
          <label>Notes<input name="notes"></label><button type="submit">Save Inventory</button>
        </form>
        <div class="scroll">${table_(inventory)}</div>
      </section>
      <section><h2>Recent Bookings</h2><div class="scroll">${bookingsTable_(bookings, adminKey, url)}</div></section>
      <section><h2>Group Enquiries</h2><div class="scroll">${table_(groups)}</div></section>
    </main></body></html>
  `).setTitle("Luxmi Hotel Admin");
}

function roomForm_(adminKey, url) {
  return function(r) {
    return `<form method="post" action="${url}">
      <input type="hidden" name="action" value="update-room"><input type="hidden" name="adminKey" value="${escapeHtml_(adminKey)}">
      <input type="hidden" name="room" value="${escapeHtml_(r["Room Type"])}">
      <h3>${escapeHtml_(r["Room Type"])}</h3>
      <label>Base Price<input type="number" name="price" value="${escapeHtml_(r["Base Price"])}" required></label>
      <label>Max Persons<input type="number" name="maxPax" value="${escapeHtml_(r["Max Persons"])}" required></label>
      <label>Total Rooms<input type="number" name="totalRooms" value="${escapeHtml_(r["Total Rooms"])}" required></label>
      <label>Active<select name="active"><option ${String(r["Active"]).toLowerCase() !== "no" ? "selected" : ""}>Yes</option><option ${String(r["Active"]).toLowerCase() === "no" ? "selected" : ""}>No</option></select></label>
      <button type="submit">Update</button>
    </form>`;
  };
}

function bookingsTable_(rows, adminKey, url) {
  if (!rows.length) return "<p>No bookings yet.</p>";
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map(h=>`<th>${escapeHtml_(h)}</th>`).join("")}<th>Update</th></tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${escapeHtml_(r[h])}</td>`).join("")}<td><form method="post" action="${url}"><input type="hidden" name="action" value="update-booking"><input type="hidden" name="adminKey" value="${escapeHtml_(adminKey)}"><input type="hidden" name="id" value="${escapeHtml_(r["Booking ID"])}"><select name="status"><option>Pending</option><option>Confirmed</option><option>Cancelled</option><option>Completed</option></select><button type="submit">Save</button></form></td></tr>`).join("")}</tbody></table>`;
}

function table_(rows) {
  if (!rows.length) return "<p>No records yet.</p>";
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map(h=>`<th>${escapeHtml_(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${escapeHtml_(r[h])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function adminLogin_() {
  return HtmlService.createHtmlOutput(`
    <main style="max-width:520px;margin:70px auto;font-family:Arial,sans-serif">
      <h1>Luxmi Hotel Admin</h1>
      <p>Enter admin key from the Settings sheet.</p>
      <form method="get"><input name="adminKey" style="width:100%;padding:12px"><button style="margin-top:10px;padding:10px 16px">Open Admin</button></form>
    </main>
  `);
}

function updateRoom_(data) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.rooms);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.room) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[Number(data.price), Number(data.maxPax), Number(data.totalRooms), data.active]]);
      return;
    }
  }
}

function updateInventory_(data) {
  getSpreadsheet_().getSheetByName(SHEETS.inventory).appendRow([
    clean_(data.date),
    clean_(data.room),
    Number(data.available || 0),
    data.price ? Number(data.price) : "",
    clean_(data.notes),
    new Date(),
  ]);
}

function updateBookingStatus_(data) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.bookings);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.id) {
      sheet.getRange(i + 1, 3).setValue(data.status);
      return;
    }
  }
}

function setupIfNeeded_(ss) {
  if (!ss.getSheetByName(SHEETS.bookings)) setup();
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  return sheet;
}

function seedRooms_(sheet) {
  if (sheet.getLastRow() > 1) return;
  sheet.appendRow(["Standard Double Room NON AC", 800, 3, 1, "Yes", "Air cooler"]);
  sheet.appendRow(["Deluxe Double Room AC", 1200, 3, 1, "Yes", "AC"]);
  sheet.appendRow(["Deluxe Four Bed AC", 1800, 5, 1, "Yes", "Family room"]);
}

function writeSettings_(ss, adminKey) {
  const sheet = ss.getSheetByName(SHEETS.settings);
  sheet.clearContents();
  sheet.appendRow(["Key", "Value"]);
  sheet.appendRow(["Admin Key", adminKey]);
  sheet.appendRow(["Spreadsheet URL", ss.getUrl()]);
  sheet.appendRow(["Hotel Emails", getHotelEmails_().join(",")]);
  sheet.appendRow(["Deploy Web App", "Deploy as Web app: Execute as Me, Access: Anyone"]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(Boolean)).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");
    return obj;
  });
}

function parsePost_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_err) {}
  }
  return e.parameter || {};
}

function isAdmin_(key) {
  return key && key === PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
}

function getHotelEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty("HOTEL_EMAILS") || HOTEL_EMAILS_DEFAULT;
  return raw.split(/[,\n;]/).map(s => s.trim()).filter(Boolean);
}

function clean_(value) {
  return String(value || "").trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function text_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
