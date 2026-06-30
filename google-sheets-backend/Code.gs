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
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxLcG88zFFHIWKoaUG_T3GOuBLToqCCuhMz9IzASRA0k65dxUDEo_ygcWIx2K8gPLGo/exec";
const PAYU_MID = "13689292";
const PAYU_PAYMENT_URL = "https://secure.payu.in/_payment";
const BOOKING_HEADERS = ["Timestamp", "Booking ID", "Status", "Name", "Phone", "Email", "Check-in", "Check-out", "Persons", "Room Type", "Rooms Required", "Total", "20% Advance", "Balance at Hotel", "Payment Terms", "Policies", "Message", "Source", "PayU Txn ID", "PayU Payment ID", "Payment Status", "Payment Updated At"];

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
  ensureSheet_(ss, SHEETS.bookings, BOOKING_HEADERS);
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
  if (params.visitor === "1") return visitorCounter_(params);
  if (params.txnid && params.status) return handlePayuReturn_(params);
  if (!isAdmin_(params.adminKey)) return adminLogin_();
  return adminPage_(params.adminKey, params.message || "");
}

function visitorCounter_(params) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  let count = Number(props.getProperty("VISITOR_TOTAL") || "0");

  try {
    lock.waitLock(5000);
    count = Number(props.getProperty("VISITOR_TOTAL") || "0");
    if (String(params.increment || "") === "1") {
      count += 1;
      props.setProperty("VISITOR_TOTAL", String(count));
      props.setProperty("VISITOR_UPDATED_AT", new Date().toISOString());
    }
  } catch (_err) {
    // Keep the public site working even if the counter is temporarily locked.
  } finally {
    try { lock.releaseLock(); } catch (_err) {}
  }

  const payload = { ok: true, count: count };
  const callback = String(params.callback || "").replace(/[^\w.$]/g, "");
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(payload);
}

function doPost(e) {
  const data = parsePost_(e);
  if (data.txnid && data.status) return handlePayuReturn_(data);
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
  if (action === "update-calendar-date") {
    updateCalendarDate_(data);
    return adminPage_(data.adminKey, "Calendar updated for " + clean_(data.date) + ".");
  }
  if (action === "update-booking") {
    updateBookingStatus_(data);
    return adminPage_(data.adminKey, "Booking status updated.");
  }
  if (action === "update-payu") {
    updatePayuSettings_(data);
    return adminPage_(data.adminKey, "PayU settings updated.");
  }
  return text_("Unknown action");
}

function handleBooking_(data) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  const id = "LH-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const wantsPayu = String(data.payuCheckout || "").toLowerCase() === "yes";
  const payuTxnId = wantsPayu ? makePayuTxnId_(id) : "";
  const row = [
    new Date(),
    id,
    wantsPayu ? "Payment Pending" : "Pending",
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
    payuTxnId,
    "",
    wantsPayu ? "Awaiting PayU payment" : "",
    wantsPayu ? new Date() : "",
  ];
  ss.getSheetByName(SHEETS.bookings).appendRow(row);
  sendBookingEmails_(id, data);
  if (wantsPayu) return payuCheckoutPage_(id, payuTxnId, data);
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
  if (hotelEmails.length) {
    MailApp.sendEmail(hotelEmails.join(","), subject, body, {
      name: HOTEL_NAME,
      htmlBody: bookingHotelHtml_(id, data),
    });
  }

  if (clean_(data.email)) {
    const guestSubject = "Luxmi Hotel booking voucher - " + id;
    const guestBody = [
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
    ].join("\n");
    MailApp.sendEmail(clean_(data.email), guestSubject, guestBody, {
      name: HOTEL_NAME,
      htmlBody: bookingVoucherHtml_(id, data),
    });
  }
}

function bookingVoucherHtml_(id, data) {
  return bookingEmailLayout_(id, data, {
    title: "Booking Request Voucher",
    subtitle: "Thank you for choosing Luxmi Hotel, Prayagraj",
    note: "Your booking request has been received. Our team will confirm room availability and payment link shortly.",
    audience: "guest",
  });
}

function bookingHotelHtml_(id, data) {
  return bookingEmailLayout_(id, data, {
    title: "New Booking Enquiry",
    subtitle: "Action needed: check inventory and confirm availability",
    note: "This enquiry has been saved in the hotel booking sheet. Please verify inventory before confirming payment.",
    audience: "hotel",
  });
}

function bookingEmailLayout_(id, data, meta) {
  const room = clean_(data.room);
  const guestName = clean_(data.name) || "Guest";
  const rows = [
    ["Booking ID", id],
    ["Guest Name", guestName],
    ["Phone", clean_(data.phone)],
    ["Email", clean_(data.email)],
    ["Room Type", room],
    ["Persons", clean_(data.guests)],
    ["Rooms Required", clean_(data.rooms)],
    ["Check-in", clean_(data.checkin)],
    ["Check-out", clean_(data.checkout)],
  ];
  const paymentRows = [
    ["Estimated Total", clean_(data.total)],
    ["20% Advance", clean_(data.advance)],
    ["Balance at Hotel", clean_(data.balance)],
  ];
  const policies = [
    "20% advance payment is required online after availability confirmation.",
    "Remaining 80% is payable at the hotel during check-in.",
    "The booking is non-refundable.",
    "Unmarried and unrelated couples are not allowed.",
    "Valid government ID is required at check-in.",
  ];
  const message = clean_(data.message);

  return `
  <div style="margin:0;padding:0;background:#f7efe5;font-family:Arial,Helvetica,sans-serif;color:#191312;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7efe5;padding:24px 0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #ead8c2;border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(122,23,32,.14);">
            <tr>
              <td style="background:#7a1720;padding:26px 30px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#dec798;font-weight:700;">Luxmi Hotel, Prayagraj</div>
                <h1 style="margin:8px 0 6px;font-family:Georgia,serif;font-size:30px;line-height:1.15;color:#ffffff;">${escapeHtml_(meta.title)}</h1>
                <div style="font-size:15px;line-height:1.5;color:#fff5ea;">${escapeHtml_(meta.subtitle)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 10px;">
                <div style="background:#fff8ee;border:1px solid #f0dfc9;border-radius:12px;padding:16px 18px;color:#4c403a;font-size:15px;line-height:1.55;">
                  <strong style="color:#7a1720;">Dear ${escapeHtml_(guestName)},</strong><br>
                  ${escapeHtml_(meta.note)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:14px 14px;background:#f8f2ea;border-radius:12px;border:1px solid #ead8c2;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#9a741f;font-weight:700;">Booking Details</div>
                      ${emailRows_(rows)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="width:33.33%;padding:12px;background:#7a1720;color:#ffffff;border-radius:12px 0 0 12px;text-align:center;">
                      <div style="font-size:12px;color:#dec798;font-weight:700;text-transform:uppercase;">Total</div>
                      <div style="font-size:22px;font-weight:800;margin-top:5px;">${escapeHtml_(clean_(data.total))}</div>
                    </td>
                    <td style="width:33.33%;padding:12px;background:#fff8ee;color:#7a1720;border-top:1px solid #ead8c2;border-bottom:1px solid #ead8c2;text-align:center;">
                      <div style="font-size:12px;color:#9a741f;font-weight:700;text-transform:uppercase;">Advance</div>
                      <div style="font-size:22px;font-weight:800;margin-top:5px;">${escapeHtml_(clean_(data.advance))}</div>
                    </td>
                    <td style="width:33.33%;padding:12px;background:#f8f2ea;color:#191312;border:1px solid #ead8c2;border-radius:0 12px 12px 0;text-align:center;">
                      <div style="font-size:12px;color:#9a741f;font-weight:700;text-transform:uppercase;">At Hotel</div>
                      <div style="font-size:22px;font-weight:800;margin-top:5px;">${escapeHtml_(clean_(data.balance))}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 30px;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#9a741f;font-weight:700;margin-bottom:8px;">Payment and Hotel Rules</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff8ee;border:1px solid #f0dfc9;border-radius:12px;">
                  ${policies.map((policy) => `<tr><td style="width:34px;padding:10px 0 10px 14px;color:#7a1720;font-weight:800;">&#10003;</td><td style="padding:10px 14px 10px 4px;font-size:14px;line-height:1.45;color:#362b27;">${escapeHtml_(policy)}</td></tr>`).join("")}
                </table>
              </td>
            </tr>
            ${message ? `<tr><td style="padding:12px 30px;"><div style="background:#fbfbfb;border:1px solid #eeeeee;border-radius:12px;padding:14px;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#9a741f;font-weight:700;margin-bottom:8px;">Guest Message</div><div style="font-size:14px;line-height:1.5;color:#362b27;white-space:pre-line;">${escapeHtml_(message)}</div></div></td></tr>` : ""}
            <tr>
              <td style="padding:18px 30px 28px;">
                <div style="background:#191312;color:#ffffff;border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.55;">
                  <strong style="font-size:16px;">Luxmi Hotel</strong><br>
                  15, Swami Vivekanand Marg, Johnston Ganj, Chauraha, Prayagraj, Uttar Pradesh 211003<br>
                  Call / WhatsApp: +91 70074 17970 | +91 70543 84239 | +91 90260 88927<br>
                  Email: luxmihotelbooking@gmail.com
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function emailRows_(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">${rows.map((row) => `
    <tr>
      <td style="width:38%;padding:9px 8px;border-top:1px solid #ead8c2;font-size:13px;color:#6f625b;font-weight:700;">${escapeHtml_(row[0])}</td>
      <td style="padding:9px 8px;border-top:1px solid #ead8c2;font-size:14px;color:#191312;font-weight:700;">${escapeHtml_(row[1])}</td>
    </tr>`).join("")}</table>`;
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
  const calendarRows = getCalendarAdminRows_(ss, 30);
  const calendar = ss.getSheetByName(SHEETS.calendar);
  const todaySheet = ss.getSheetByName(SHEETS.today);
  const payu = getPayuSettings_();
  const url = ScriptApp.getService().getUrl() || WEB_APP_URL;
  const sheetUrl = ss.getUrl();
  const calendarUrl = sheetUrl + "#gid=" + (calendar ? calendar.getSheetId() : "");
  const todayUrl = sheetUrl + "#gid=" + (todaySheet ? todaySheet.getSheetId() : "");

  return HtmlService.createHtmlOutput(`
    <!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Luxmi Hotel Admin</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;background:#fffaf4;color:#171210}main{max-width:1180px;margin:auto;padding:22px}h1,h2{color:#7a1720}section{margin:22px 0;padding:18px;background:#fff;border:1px solid #e7ded7;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}input,select,textarea{width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ddd;border-radius:5px;box-sizing:border-box}button{padding:9px 14px;border:0;border-radius:5px;background:#7a1720;color:white;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.msg{padding:10px;background:#e9f8ef;color:#126437;border-radius:6px}.small{font-size:12px;color:#6f625b}.scroll{overflow:auto}.admin-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.admin-tabs a{padding:10px 12px;background:#f5efe5;border:1px solid #dec798;border-radius:6px;color:#7a1720;text-decoration:none;font-weight:700}.calendar-card{border:1px solid #eadfce;border-radius:8px;padding:14px;margin:12px 0;background:#fffdf9}.calendar-card h3{margin:0 0 12px;color:#7a1720}.room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.room-box{background:#fff7ea;border:1px solid #eadfce;border-radius:8px;padding:10px}.room-box strong{display:block;color:#7a1720;margin-bottom:8px}.stat{font-size:12px;color:#6f625b;margin:4px 0}.actions{margin-top:10px}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#e9f8ef;color:#126437;font-weight:700;font-size:12px}@media(max-width:900px){.grid,.room-grid{grid-template-columns:1fr}}
    </style></head><body><main>
      <h1>Luxmi Hotel Admin</h1>
      <p class="small">Web app URL: ${escapeHtml_(url)} | Admin key: ${escapeHtml_(adminKey)}</p>
      <div class="admin-tabs">
        <a href="#rates">Rates</a>
        <a href="#calendar">Inventory Calendar</a>
        <a href="#payment">PayU</a>
        <a href="#today">Today Check-in / Check-out</a>
        <a href="#bookings">Bookings</a>
        <a href="${escapeHtml_(sheetUrl)}" target="_blank" rel="noopener">Open Sheet</a>
      </div>
      ${message ? `<p class="msg">${escapeHtml_(message)}</p>` : ""}
      <section id="rates"><h2>Rooms, Prices and Total Inventory</h2><div class="grid">${rooms.map(roomForm_(adminKey, url)).join("")}</div></section>
      <section id="calendar"><h2>Rates and Inventory Calendar</h2>
        <p class="small">Manage the next 30 days here. Enter blocked/sold rooms and rate for each room type, then save that date. Remaining rooms calculate from total rooms minus blocked/sold.</p>
        ${calendarAdmin_(calendarRows, adminKey, url)}
      </section>
      <section id="today"><h2>Today Check-in / Check-out</h2>
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
      <section id="payment"><h2>PayU Payment Gateway</h2>
        <p class="small">MID is saved as ${escapeHtml_(PAYU_MID)}. Enter Merchant Key and Salt from PayU Dashboard. Salt is stored only in Apps Script properties, not in website code.</p>
        <p class="small"><strong>Status:</strong> ${payu.configured ? "Configured" : "Not configured yet"} | <strong>Mode:</strong> ${escapeHtml_(payu.environment)} | <strong>Payment URL:</strong> ${escapeHtml_(payu.paymentUrl)}</p>
        <form method="post" action="${url}">
          <input type="hidden" name="action" value="update-payu"><input type="hidden" name="adminKey" value="${escapeHtml_(adminKey)}">
          <div class="grid">
            <label>MID<input name="mid" value="${escapeHtml_(payu.mid)}" readonly></label>
            <label>Merchant Key<input name="merchantKey" value="${escapeHtml_(payu.key)}" placeholder="Paste PayU Merchant Key"></label>
            <label>Merchant Salt<input name="merchantSalt" type="password" placeholder="${payu.hasSalt ? "Leave blank to keep existing salt" : "Paste PayU Salt"}"></label>
            <label>Environment<select name="environment"><option ${payu.environment === "live" ? "selected" : ""}>live</option><option ${payu.environment === "test" ? "selected" : ""}>test</option></select></label>
          </div>
          <button type="submit">Save PayU Settings</button>
        </form>
      </section>
      <section id="bookings"><h2>Recent Bookings</h2><div class="scroll">${bookingsTable_(bookings, adminKey, url)}</div></section>
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

function payuCheckoutPage_(bookingId, txnId, data) {
  const payu = getPayuSettings_();
  if (!payu.configured) {
    return HtmlService.createHtmlOutput(`
      <main style="max-width:640px;margin:60px auto;font-family:Arial,sans-serif;line-height:1.5;color:#191312">
        <h1 style="color:#7a1720">Booking enquiry saved</h1>
        <p>Your booking enquiry ID is <strong>${escapeHtml_(bookingId)}</strong>.</p>
        <p>PayU payment is not fully configured yet. The hotel has received your enquiry and will contact you for payment confirmation.</p>
        <p><a href="https://luxmihotel.com" style="display:inline-block;padding:12px 16px;background:#7a1720;color:#fff;text-decoration:none;border-radius:6px">Back to website</a></p>
      </main>
    `).setTitle("Luxmi Hotel Payment Pending");
  }

  const fields = payuFields_(payu, bookingId, txnId, data);
  const inputs = Object.keys(fields).map((key) => `<input type="hidden" name="${escapeHtml_(key)}" value="${escapeHtml_(fields[key])}">`).join("");
  return HtmlService.createHtmlOutput(`
    <!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Redirecting to PayU</title></head>
    <body style="margin:0;background:#fffaf4;font-family:Arial,sans-serif;color:#191312">
      <main style="max-width:640px;margin:70px auto;padding:24px;text-align:center">
        <h1 style="color:#7a1720">Redirecting to secure payment</h1>
        <p>Booking ID: <strong>${escapeHtml_(bookingId)}</strong></p>
        <p>Advance amount: <strong>Rs.${escapeHtml_(fields.amount)}</strong></p>
        <p>Please wait while we open PayU secure checkout.</p>
        <form id="payuForm" method="post" action="${escapeHtml_(payu.paymentUrl)}">${inputs}<button type="submit" style="padding:12px 18px;border:0;border-radius:6px;background:#7a1720;color:#fff;font-weight:700">Proceed to PayU</button></form>
      </main>
      <script>setTimeout(function(){document.getElementById("payuForm").submit();},800);</script>
    </body></html>
  `).setTitle("Redirecting to PayU");
}

function payuFields_(payu, bookingId, txnId, data) {
  const amount = moneyNumber_(data.advance);
  const firstname = firstName_(data.name);
  const email = clean_(data.email) || "luxmihotelbooking@gmail.com";
  const productinfo = "Luxmi Hotel 20% advance " + bookingId;
  const hash = payuRequestHash_(payu.key, txnId, amount, productinfo, firstname, email, payu.salt);
  return {
    key: payu.key,
    txnid: txnId,
    amount: amount,
    productinfo: productinfo,
    firstname: firstname,
    email: email,
    phone: digitsOnly_(data.phone),
    surl: payuReturnUrl_(),
    furl: payuReturnUrl_(),
    hash: hash,
  };
}

function handlePayuReturn_(data) {
  const payu = getPayuSettings_();
  const status = clean_(data.status);
  const txnId = clean_(data.txnid);
  const payuId = clean_(data.mihpayid);
  const verified = payu.configured ? verifyPayuResponse_(data, payu.salt) : false;
  const bookingId = updatePayuBookingStatus_(txnId, payuId, status, verified);
  const isSuccess = status.toLowerCase() === "success" && verified;
  return HtmlService.createHtmlOutput(`
    <main style="max-width:680px;margin:60px auto;font-family:Arial,sans-serif;line-height:1.55;color:#191312;padding:20px">
      <div style="border:1px solid #ead8c2;border-radius:12px;overflow:hidden;background:#fff">
        <div style="background:#7a1720;color:#fff;padding:22px">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#dec798;font-weight:700">Luxmi Hotel Payment</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif">${isSuccess ? "Payment received" : "Payment not confirmed"}</h1>
        </div>
        <div style="padding:22px">
          <p><strong>Booking ID:</strong> ${escapeHtml_(bookingId || "Pending lookup")}</p>
          <p><strong>PayU Transaction:</strong> ${escapeHtml_(txnId)}</p>
          <p><strong>PayU Payment ID:</strong> ${escapeHtml_(payuId)}</p>
          <p><strong>Status:</strong> ${escapeHtml_(status || "Unknown")}</p>
          <p>${isSuccess ? "Thank you. Your advance payment has been recorded. Please keep this page or your PayU receipt for check-in." : "If amount was deducted, please contact Luxmi Hotel with your PayU transaction details."}</p>
          <p><a href="https://luxmihotel.com" style="display:inline-block;padding:12px 16px;background:#7a1720;color:#fff;text-decoration:none;border-radius:6px">Back to Luxmi Hotel</a></p>
        </div>
      </div>
    </main>
  `).setTitle("Luxmi Hotel Payment Status");
}

function updatePayuSettings_(data) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("PAYU_MID", PAYU_MID);
  props.setProperty("PAYU_ENVIRONMENT", clean_(data.environment || "live").toLowerCase() === "test" ? "test" : "live");
  if (clean_(data.merchantKey)) props.setProperty("PAYU_KEY", clean_(data.merchantKey));
  if (clean_(data.merchantSalt)) props.setProperty("PAYU_SALT", clean_(data.merchantSalt));
}

function getPayuSettings_() {
  const props = PropertiesService.getScriptProperties();
  const environment = clean_(props.getProperty("PAYU_ENVIRONMENT") || "live").toLowerCase() === "test" ? "test" : "live";
  const key = clean_(props.getProperty("PAYU_KEY"));
  const salt = clean_(props.getProperty("PAYU_SALT"));
  return {
    mid: props.getProperty("PAYU_MID") || PAYU_MID,
    key: key,
    salt: salt,
    hasSalt: !!salt,
    environment: environment,
    paymentUrl: environment === "test" ? "https://test.payu.in/_payment" : PAYU_PAYMENT_URL,
    configured: !!(key && salt),
  };
}

function payuRequestHash_(key, txnId, amount, productinfo, firstname, email, salt) {
  return sha512_(key + "|" + txnId + "|" + amount + "|" + productinfo + "|" + firstname + "|" + email + "|||||||||||" + salt);
}

function verifyPayuResponse_(data, salt) {
  const hashString = [
    salt,
    clean_(data.status),
    "",
    "",
    "",
    "",
    "",
    "",
    clean_(data.udf5),
    clean_(data.udf4),
    clean_(data.udf3),
    clean_(data.udf2),
    clean_(data.udf1),
    clean_(data.email),
    clean_(data.firstname),
    clean_(data.productinfo),
    clean_(data.amount),
    clean_(data.txnid),
    clean_(data.key),
  ].join("|");
  return sha512_(hashString).toLowerCase() === clean_(data.hash).toLowerCase();
}

function sha512_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, value, Utilities.Charset.UTF_8);
  return bytes.map((byte) => {
    const v = byte < 0 ? byte + 256 : byte;
    return ("0" + v.toString(16)).slice(-2);
  }).join("");
}

function updatePayuBookingStatus_(txnId, payuId, status, verified) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  const sheet = ss.getSheetByName(SHEETS.bookings);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return "";
  const headers = values[0];
  const txnCol = headers.indexOf("PayU Txn ID");
  const payuIdCol = headers.indexOf("PayU Payment ID");
  const payStatusCol = headers.indexOf("Payment Status");
  const payUpdatedCol = headers.indexOf("Payment Updated At");
  const statusCol = headers.indexOf("Status");
  const bookingIdCol = headers.indexOf("Booking ID");
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][txnCol]) === txnId) {
      const row = i + 1;
      if (payuIdCol >= 0) sheet.getRange(row, payuIdCol + 1).setValue(payuId);
      if (payStatusCol >= 0) sheet.getRange(row, payStatusCol + 1).setValue((verified ? "Verified " : "Unverified ") + status);
      if (payUpdatedCol >= 0) sheet.getRange(row, payUpdatedCol + 1).setValue(new Date());
      if (statusCol >= 0 && String(status).toLowerCase() === "success" && verified) sheet.getRange(row, statusCol + 1).setValue("Advance Paid");
      return bookingIdCol >= 0 ? values[i][bookingIdCol] : "";
    }
  }
  return "";
}

function payuReturnUrl_() {
  return ScriptApp.getService().getUrl() || WEB_APP_URL;
}

function makePayuTxnId_(bookingId) {
  return clean_(bookingId).replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
}

function moneyNumber_(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.]/g, "")) || 0;
  return numeric.toFixed(2);
}

function digitsOnly_(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function firstName_(value) {
  return clean_(value).split(/\s+/)[0] || "Guest";
}

function calendarAdmin_(rows, adminKey, url) {
  if (!rows.length) return "<p>No calendar rows found. Run createInventoryCalendar once from Apps Script.</p>";
  return rows.map((row) => {
    return `<form class="calendar-card" method="post" action="${escapeHtml_(url)}">
      <input type="hidden" name="action" value="update-calendar-date">
      <input type="hidden" name="adminKey" value="${escapeHtml_(adminKey)}">
      <input type="hidden" name="date" value="${escapeHtml_(row.dateValue)}">
      <h3>${escapeHtml_(row.label)} <span class="pill">${escapeHtml_(row.day)}</span></h3>
      <div class="room-grid">
        <div class="room-box">
          <strong>Standard Non AC</strong>
          <p class="stat">Total: ${escapeHtml_(row.standardTotal)} | Remaining: ${escapeHtml_(row.standardRemaining)}</p>
          <label>Blocked / Sold<input type="number" min="0" name="standardBlocked" value="${escapeHtml_(row.standardBlocked)}"></label>
          <label>Rate<input type="number" min="0" name="standardRate" value="${escapeHtml_(row.standardRate)}"></label>
        </div>
        <div class="room-box">
          <strong>Deluxe Double AC</strong>
          <p class="stat">Total: ${escapeHtml_(row.deluxeTotal)} | Remaining: ${escapeHtml_(row.deluxeRemaining)}</p>
          <label>Blocked / Sold<input type="number" min="0" name="deluxeBlocked" value="${escapeHtml_(row.deluxeBlocked)}"></label>
          <label>Rate<input type="number" min="0" name="deluxeRate" value="${escapeHtml_(row.deluxeRate)}"></label>
        </div>
        <div class="room-box">
          <strong>Four Bed AC</strong>
          <p class="stat">Total: ${escapeHtml_(row.fourTotal)} | Remaining: ${escapeHtml_(row.fourRemaining)}</p>
          <label>Blocked / Sold<input type="number" min="0" name="fourBlocked" value="${escapeHtml_(row.fourBlocked)}"></label>
          <label>Rate<input type="number" min="0" name="fourRate" value="${escapeHtml_(row.fourRate)}"></label>
        </div>
      </div>
      <label>Notes<input name="notes" value="${escapeHtml_(row.notes)}" placeholder="Optional note for this date"></label>
      <div class="actions"><button type="submit">Save This Date</button></div>
    </form>`;
  }).join("");
}

function getCalendarAdminRows_(ss, days) {
  let sheet = ss.getSheetByName(SHEETS.calendar);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 15) {
    buildInventoryCalendar_(ss, Math.max(days, 180));
    sheet = ss.getSheetByName(SHEETS.calendar);
  }

  const lastRow = Math.min(sheet.getLastRow(), days + 1);
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const display = sheet.getRange(2, 1, lastRow - 1, 15).getDisplayValues();
  const tz = Session.getScriptTimeZone();

  return values.map((row, index) => {
    const shown = display[index];
    const date = row[0] instanceof Date ? row[0] : new Date(shown[0]);
    const dateValue = Utilities.formatDate(date, tz, "yyyy-MM-dd");
    const label = Utilities.formatDate(date, tz, "dd MMM yyyy");
    return {
      dateValue: dateValue,
      label: label,
      day: shown[1],
      standardTotal: shown[2],
      standardBlocked: shown[3],
      standardRemaining: shown[4],
      standardRate: Number(row[5] || shown[5] || 0),
      deluxeTotal: shown[6],
      deluxeBlocked: shown[7],
      deluxeRemaining: shown[8],
      deluxeRate: Number(row[9] || shown[9] || 0),
      fourTotal: shown[10],
      fourBlocked: shown[11],
      fourRemaining: shown[12],
      fourRate: Number(row[13] || shown[13] || 0),
      notes: shown[14],
    };
  });
}

function updateCalendarDate_(data) {
  const ss = getSpreadsheet_();
  setupIfNeeded_(ss);
  let sheet = ss.getSheetByName(SHEETS.calendar);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 15) {
    buildInventoryCalendar_(ss, 180);
    sheet = ss.getSheetByName(SHEETS.calendar);
  }

  const rooms = getRoomDefinitions_(ss);
  const target = clean_(data.date);
  const dateValues = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  const tz = Session.getScriptTimeZone();
  let rowNumber = 0;

  for (let i = 0; i < dateValues.length; i += 1) {
    const value = dateValues[i][0];
    if (!value) continue;
    const current = value instanceof Date ? Utilities.formatDate(value, tz, "yyyy-MM-dd") : clean_(value);
    if (current === target) {
      rowNumber = i + 2;
      break;
    }
  }

  if (!rowNumber) {
    rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1).setValue(target);
    sheet.getRange(rowNumber, 2).setFormula('=TEXT(A' + rowNumber + ',"ddd")');
  }

  sheet.getRange(rowNumber, 3, 1, 13).setValues([[
    rooms[0].totalRooms,
    Number(data.standardBlocked || 0),
    "=MAX(0,C" + rowNumber + "-D" + rowNumber + ")",
    Number(data.standardRate || rooms[0].basePrice),
    rooms[1].totalRooms,
    Number(data.deluxeBlocked || 0),
    "=MAX(0,G" + rowNumber + "-H" + rowNumber + ")",
    Number(data.deluxeRate || rooms[1].basePrice),
    rooms[2].totalRooms,
    Number(data.fourBlocked || 0),
    "=MAX(0,K" + rowNumber + "-L" + rowNumber + ")",
    Number(data.fourRate || rooms[2].basePrice),
    clean_(data.notes),
  ]]);
  sheet.getRange(rowNumber, 1).setNumberFormat("yyyy-mm-dd");
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
  ensureSheet_(ss, SHEETS.bookings, BOOKING_HEADERS);
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
