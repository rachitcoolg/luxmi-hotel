const SHEETS = {
  settings: "Settings",
  rooms: "Rooms",
  inventory: "Inventory",
  calendar: "Inventory Calendar",
  today: "Today Check-in Checkout",
  bookings: "Bookings",
  groups: "Group Enquiries",
};

const HOTEL_EMAILS_DEFAULT = "luxmihotelbooking@gmail.com,luxmihotel2017@gmail.com,rachit.coolg@gmail.com";
const HOTEL_NAME = "Luxmi Hotel";
const HOTEL_PHONE = "+91 70074 17970";
const SPREADSHEET_NAME = "Luxmi Hotel Booking Admin";
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwN09jObid5UTMDhlht_LwD-FJK7Ib5KE6duqQRY3nZ6KtYBpyp28H5oxgOmoea6MBVbg/exec";

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
  ensureSheet_(ss, SHEETS.calendar, ["Date"]);
  ensureSheet_(ss, SHEETS.today, ["Today Check-in Checkout"]);
  ensureSheet_(ss, SHEETS.bookings, ["Timestamp", "Booking ID", "Status", "Name", "Phone", "Email", "Check-in", "Check-out", "Persons", "Room Type", "Rooms Required", "Total", "20% Advance", "Balance at Hotel", "Payment Terms", "Policies", "Message", "Source"]);
  ensureSheet_(ss, SHEETS.groups, ["Timestamp", "Enquiry ID", "Status", "Name", "Phone", "Email", "Arrival", "Departure", "Persons", "Rooms", "Purpose", "Message", "Source"]);

  seedRooms_(ss.getSheetByName(SHEETS.rooms));
  buildInventoryCalendar_(ss, 180);
  buildTodayDashboard_(ss);
  writeSettings_(ss, adminKey);
  SpreadsheetApp.flush();
  Logger.log("Admin URL: " + ScriptApp.getService().getUrl() + "?adminKey=" + adminKey);
  Logger.log("Admin Key: " + adminKey);
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  return "Setup complete. Admin key: " + adminKey;
}

function rotateAdminKey() {
  const ss = getSpreadsheet_();
  const props = PropertiesService.getScriptProperties();
  const adminKey = Utilities.getUuid().replace(/-/g, "").slice(0, 18);
  props.setProperty("ADMIN_KEY", adminKey);
  writeSettings_(ss, adminKey);
  SpreadsheetApp.flush();
  Logger.log("New Admin URL: " + ScriptApp.getService().getUrl() + "?adminKey=" + adminKey);
  Logger.log("New Admin Key: " + adminKey);
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  return "Admin key rotated: " + adminKey;
}

function showApplicationKey() {
  const ss = getSpreadsheet_();
  const props = PropertiesService.getScriptProperties();
  let adminKey = props.getProperty("ADMIN_KEY");
  if (!adminKey) {
    adminKey = Utilities.getUuid().replace(/-/g, "").slice(0, 18);
    props.setProperty("ADMIN_KEY", adminKey);
  }
  if (!props.getProperty("HOTEL_EMAILS")) props.setProperty("HOTEL_EMAILS", HOTEL_EMAILS_DEFAULT);
  writeSettings_(ss, adminKey);
  SpreadsheetApp.flush();
  Logger.log("Application Key: " + adminKey);
  Logger.log("Admin URL: " + adminUrl_(adminKey));
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  return "Application key added to Settings sheet.";
}

function createInventoryCalendar() {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  seedRooms_(ss.getSheetByName(SHEETS.rooms));
  buildInventoryCalendar_(ss, 180);
  SpreadsheetApp.flush();
  Logger.log("Inventory calendar ready: " + ss.getUrl());
  return "Inventory calendar created for 180 days.";
}

function createTodayDashboard() {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  buildTodayDashboard_(ss);
  SpreadsheetApp.flush();
  Logger.log("Today check-in / check-out sheet ready: " + ss.getUrl());
  return "Today check-in / check-out sheet created.";
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
    clean_(data.rooms),
    clean_(data.total),
    clean_(data.advance),
    clean_(data.balance),
    clean_(data.paymentTerms),
    clean_(data.policies),
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
    "Total: " + clean_(data.total),
    "20% advance payable online: " + clean_(data.advance),
    "Balance payable at hotel: " + clean_(data.balance),
    "Payment terms: " + clean_(data.paymentTerms),
    "Policies: " + clean_(data.policies),
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
      "Estimated total: " + clean_(data.total),
      "20% advance payable online: " + clean_(data.advance),
      "Balance payable at hotel: " + clean_(data.balance),
      "Policies: " + clean_(data.policies),
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
  const calendar = ss.getSheetByName(SHEETS.calendar);
  const todaySheet = ss.getSheetByName(SHEETS.today);
  const url = ScriptApp.getService().getUrl();
  const sheetUrl = ss.getUrl();
  const calendarUrl = sheetUrl + "#gid=" + (calendar ? calendar.getSheetId() : "");
  const todayUrl = sheetUrl + "#gid=" + (todaySheet ? todaySheet.getSheetId() : "");

  return HtmlService.createHtmlOutput(`
    <!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Luxmi Hotel Admin</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;background:#fffaf4;color:#171210}main{max-width:1180px;margin:auto;padding:22px}h1,h2{color:#7a1720}section{margin:22px 0;padding:18px;background:#fff;border:1px solid #e7ded7;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}input,select,textarea{width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ddd;border-radius:5px}button{padding:9px 14px;border:0;border-radius:5px;background:#7a1720;color:white;font-weight:700}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.msg{padding:10px;background:#e9f8ef;color:#126437;border-radius:6px}.small{font-size:12px;color:#6f625b}.scroll{overflow:auto}@media(max-width:800px){.grid{grid-template-columns:1fr}}
    </style></head><body><main>
      <h1>Luxmi Hotel Admin</h1>
      <p class="small">Web app URL: ${escapeHtml_(url)} | Admin key: ${escapeHtml_(adminKey)}</p>
      <p><a href="${escapeHtml_(sheetUrl)}" target="_blank" rel="noopener">Open Google Sheet records</a></p>
      <p><a href="${escapeHtml_(todayUrl)}" target="_blank" rel="noopener">Open Today Check-in / Check-out</a></p>
      <p><a href="${escapeHtml_(calendarUrl)}" target="_blank" rel="noopener">Open Inventory Calendar</a></p>
      ${message ? `<p class="msg">${escapeHtml_(message)}</p>` : ""}
      <section><h2>Rooms, Prices and Total Inventory</h2><div class="grid">${rooms.map(roomForm_(adminKey, url)).join("")}</div></section>
      <section><h2>Today Check-in / Check-out</h2>
        <p class="small">Open this tab every morning to see today's arrivals and departures with guest contact, room, amount and payment details.</p>
        <p><a href="${escapeHtml_(todayUrl)}" target="_blank" rel="noopener">Open today sheet</a></p>
      </section>
      <section><h2>Inventory Calendar</h2>
        <p class="small">Use the Google Sheet calendar to manage daily inventory. Edit the yellow Blocked/Sold and Rate cells. Remaining rooms calculate automatically.</p>
        <p><a href="${escapeHtml_(calendarUrl)}" target="_blank" rel="noopener">Open date-wise inventory calendar</a></p>
      </section>
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
  ensureSheet_(ss, SHEETS.settings, ["Key", "Value"]);
  ensureSheet_(ss, SHEETS.rooms, ["Room Type", "Base Price", "Max Persons", "Total Rooms", "Active", "Notes"]);
  ensureSheet_(ss, SHEETS.inventory, ["Date", "Room Type", "Available Rooms", "Price Override", "Notes", "Updated At"]);
  ensureSheet_(ss, SHEETS.calendar, ["Date"]);
  ensureSheet_(ss, SHEETS.today, ["Today Check-in Checkout"]);
  ensureSheet_(ss, SHEETS.bookings, ["Timestamp", "Booking ID", "Status", "Name", "Phone", "Email", "Check-in", "Check-out", "Persons", "Room Type", "Rooms Required", "Total", "20% Advance", "Balance at Hotel", "Payment Terms", "Policies", "Message", "Source"]);
  ensureSheet_(ss, SHEETS.groups, ["Timestamp", "Enquiry ID", "Status", "Name", "Phone", "Email", "Arrival", "Departure", "Persons", "Rooms", "Purpose", "Message", "Source"]);
  seedRooms_(ss.getSheetByName(SHEETS.rooms));
  buildTodayDashboard_(ss);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  if (name === SHEETS.bookings) normalizeSheetHeaders_(sheet, headers);
  ensureHeaders_(sheet, headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  return sheet;
}

function normalizeSheetHeaders_(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(String);
  if (current.slice(0, headers.length).join("|") === headers.join("|")) return;

  const rowCount = Math.max(sheet.getLastRow() - 1, 0);
  const data = rowCount ? sheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
  const normalized = data.map((row) => headers.map((header) => {
    const index = current.indexOf(header);
    return index >= 0 ? row[index] : "";
  }));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (normalized.length) sheet.getRange(2, 1, normalized.length, headers.length).setValues(normalized);
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  const missing = headers.filter((header) => current.indexOf(header) === -1);
  if (!missing.length) return;
  sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
}

function seedRooms_(sheet) {
  const desired = [
    ["Standard Double Room NON AC", 800, 3, 8, "Yes", "Air cooler"],
    ["Deluxe Double Room AC", 1200, 3, 11, "Yes", "AC"],
    ["Deluxe Four Bed AC", 1800, 5, 5, "Yes", "Family room"],
  ];
  const values = sheet.getDataRange().getValues();
  const existing = {};
  for (let i = 1; i < values.length; i += 1) existing[String(values[i][0])] = i + 1;
  desired.forEach((room) => {
    const row = existing[room[0]];
    if (row) sheet.getRange(row, 2, 1, 4).setValues([[room[1], room[2], room[3], room[4]]]);
    else sheet.appendRow(room);
  });
}

function buildInventoryCalendar_(ss, days) {
  const sheet = ss.getSheetByName(SHEETS.calendar) || ss.insertSheet(SHEETS.calendar);
  sheet.clear();

  const rooms = getRoomDefinitions_(ss);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const headers = [
    "Date",
    "Day",
    rooms[0].shortName + " Total",
    rooms[0].shortName + " Blocked/Sold",
    rooms[0].shortName + " Remaining",
    rooms[0].shortName + " Rate",
    rooms[1].shortName + " Total",
    rooms[1].shortName + " Blocked/Sold",
    rooms[1].shortName + " Remaining",
    rooms[1].shortName + " Rate",
    rooms[2].shortName + " Total",
    rooms[2].shortName + " Blocked/Sold",
    rooms[2].shortName + " Remaining",
    rooms[2].shortName + " Rate",
    "Notes",
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const rowNumber = i + 2;
    rows.push([
      date,
      '=TEXT(A' + rowNumber + ',"ddd")',
      rooms[0].totalRooms,
      0,
      "=MAX(0,C" + rowNumber + "-D" + rowNumber + ")",
      rooms[0].basePrice,
      rooms[1].totalRooms,
      0,
      "=MAX(0,G" + rowNumber + "-H" + rowNumber + ")",
      rooms[1].basePrice,
      rooms[2].totalRooms,
      0,
      "=MAX(0,K" + rowNumber + "-L" + rowNumber + ")",
      rooms[2].basePrice,
      "",
    ]);
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#7a1720").setFontColor("#ffffff");
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(2, 3, rows.length, 12).setNumberFormat("0");
  sheet.getRange(2, 6, rows.length, 1).setNumberFormat("₹#,##0");
  sheet.getRange(2, 10, rows.length, 1).setNumberFormat("₹#,##0");
  sheet.getRange(2, 14, rows.length, 1).setNumberFormat("₹#,##0");
  sheet.getRange(2, 4, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 6, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 8, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 10, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 12, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 14, rows.length, 1).setBackground("#fff2cc");
  sheet.getRange(2, 5, rows.length, 1).setBackground("#e2f0d9");
  sheet.getRange(2, 9, rows.length, 1).setBackground("#e2f0d9");
  sheet.getRange(2, 13, rows.length, 1).setBackground("#e2f0d9");
  sheet.autoResizeColumns(1, headers.length);
  sheet.getRange("A1:O1").createFilter();
}

function buildTodayDashboard_(ss) {
  const sheet = ss.getSheetByName(SHEETS.today) || ss.insertSheet(SHEETS.today);
  sheet.clear();

  const headers = [
    "Booking ID",
    "Status",
    "Name",
    "Phone",
    "Email",
    "Check-in",
    "Check-out",
    "Persons",
    "Room Type",
    "Rooms Required",
    "Total",
    "20% Advance",
    "Balance at Hotel",
  ];
  const dataColumns = "{Bookings!B2:B,Bookings!C2:C,Bookings!D2:D,Bookings!E2:E,Bookings!F2:F,Bookings!G2:G,Bookings!H2:H,Bookings!I2:I,Bookings!J2:J,Bookings!K2:K,Bookings!L2:L,Bookings!M2:M,Bookings!N2:N}";
  const checkinFormula = '=IFERROR(FILTER(' + dataColumns + ',Bookings!G2:G=TEXT(TODAY(),"yyyy-mm-dd"),Bookings!C2:C<>"Cancelled"),"No check-ins today")';
  const checkoutFormula = '=IFERROR(FILTER(' + dataColumns + ',Bookings!H2:H=TEXT(TODAY(),"yyyy-mm-dd"),Bookings!C2:C<>"Cancelled"),"No check-outs today")';

  sheet.getRange("A1").setValue("Luxmi Hotel - Today Check-in / Check-out");
  sheet.getRange("A2").setFormula('="Date: "&TEXT(TODAY(),"dd mmm yyyy")');
  sheet.getRange("A4").setValue("Today Check-ins");
  sheet.getRange(5, 1, 1, headers.length).setValues([headers]);
  sheet.getRange("A6").setFormula(checkinFormula);
  sheet.getRange("A24").setValue("Today Check-outs");
  sheet.getRange(25, 1, 1, headers.length).setValues([headers]);
  sheet.getRange("A26").setFormula(checkoutFormula);

  sheet.setFrozenRows(5);
  sheet.getRange("A1:M1").merge().setFontWeight("bold").setFontSize(16).setBackground("#7a1720").setFontColor("#ffffff");
  sheet.getRange("A2:M2").merge().setFontWeight("bold").setBackground("#fff2cc");
  sheet.getRange("A4:M4").merge().setFontWeight("bold").setBackground("#dec798").setFontColor("#7a1720");
  sheet.getRange("A24:M24").merge().setFontWeight("bold").setBackground("#dec798").setFontColor("#7a1720");
  sheet.getRange("A5:M5").setFontWeight("bold").setBackground("#f5efe5");
  sheet.getRange("A25:M25").setFontWeight("bold").setBackground("#f5efe5");
  sheet.getRange("A:M").setWrap(true);
  sheet.autoResizeColumns(1, headers.length);
}

function getRoomDefinitions_(ss) {
  const rows = readObjects_(ss.getSheetByName(SHEETS.rooms));
  const fallback = [
    { roomType: "Standard Double Room NON AC", shortName: "Standard Non AC", basePrice: 800, totalRooms: 8 },
    { roomType: "Deluxe Double Room AC", shortName: "Deluxe Double AC", basePrice: 1200, totalRooms: 11 },
    { roomType: "Deluxe Four Bed AC", shortName: "Four Bed AC", basePrice: 1800, totalRooms: 5 },
  ];
  if (!rows.length) return fallback;
  return fallback.map((item) => {
    const found = rows.find((row) => row["Room Type"] === item.roomType);
    return {
      roomType: item.roomType,
      shortName: item.shortName,
      basePrice: Number(found && found["Base Price"] ? found["Base Price"] : item.basePrice),
      totalRooms: Number(found && found["Total Rooms"] ? found["Total Rooms"] : item.totalRooms),
    };
  });
}

function writeSettings_(ss, adminKey) {
  const sheet = ss.getSheetByName(SHEETS.settings);
  sheet.clearContents();
  sheet.appendRow(["Key", "Value"]);
  sheet.appendRow(["Application Key", adminKey]);
  sheet.appendRow(["Admin Key", adminKey]);
  sheet.appendRow(["Admin URL", adminUrl_(adminKey)]);
  sheet.appendRow(["Spreadsheet URL", ss.getUrl()]);
  sheet.appendRow(["Hotel Emails", getHotelEmails_().join(",")]);
  sheet.appendRow(["Deploy Web App", "Deploy as Web app: Execute as Me, Access: Anyone"]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
  sheet.autoResizeColumns(1, 2);
}

function adminUrl_(adminKey) {
  const serviceUrl = ScriptApp.getService().getUrl();
  const baseUrl = serviceUrl || WEB_APP_URL;
  return baseUrl + "?adminKey=" + adminKey;
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
