import os
import smtplib
import sqlite3
from datetime import date, datetime, timedelta
from email.message import EmailMessage

from flask import Flask, flash, g, redirect, render_template_string, request, session, url_for


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.environ.get("DATABASE_PATH", os.path.join(BASE_DIR, "luxmi_booking.db"))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "luxmi-admin-2026")
ASSET_BASE = "https://luxmihotel.com/assets/"
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "luxmihotel2017@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD") or os.environ.get("MAIL_PASSWORD")
MAIL_FROM = os.environ.get("MAIL_FROM", SMTP_USERNAME)
HOTEL_EMAIL = os.environ.get("HOTEL_EMAIL", "luxmihotel2017@gmail.com")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "true").lower() not in {"0", "false", "no"}

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-before-deploy")


ROOM_SEED = [
    {
        "code": "standard_non_ac",
        "name": "Standard Double Room NON AC",
        "description": "Air cooler double room for up to 3 guests.",
        "base_price": 800,
        "total_units": 1,
        "max_pax": 3,
        "amenities": "Air Cooler, Wi-Fi, Hot Water",
        "image": "standard-non-ac-room-1.jpeg",
    },
    {
        "code": "deluxe_double_ac",
        "name": "Deluxe Double Room AC",
        "description": "AC double room for couples and small families.",
        "base_price": 1200,
        "total_units": 1,
        "max_pax": 3,
        "amenities": "AC, Wi-Fi, Attached Bath",
        "image": "deluxe-double-ac-main.jpeg",
    },
    {
        "code": "deluxe_four_bed_ac",
        "name": "Deluxe Four Bed AC",
        "description": "Larger AC room with four beds for families and groups.",
        "base_price": 1800,
        "total_units": 1,
        "max_pax": 5,
        "amenities": "AC, Four Beds, Geyser",
        "image": "deluxe-four-bed-main.jpeg",
    },
]


BASE_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--wine:#7a1720;--wine-dark:#4d0d14;--gold:#bf8f2f;--ink:#171210;--muted:#6f625b;--line:#e7ded7;--paper:#fffaf4;--soft:#f6efe8;--white:#fff;--body:"Inter",system-ui,sans-serif;--display:"Cormorant Garamond",Georgia,serif}
    *{box-sizing:border-box}body{margin:0;font-family:var(--body);color:var(--ink);background:var(--paper);line-height:1.55}a{color:inherit}img{width:100%;display:block;object-fit:cover}label{display:block;font-weight:800;font-size:12px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em}
    input,select,textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:6px;padding:10px 12px;font:inherit;background:var(--white)}textarea{resize:vertical}h1,h2,h3{font-family:var(--display);line-height:1.05;color:var(--wine);margin:0 0 12px}h1{font-size:clamp(42px,7vw,76px)}h2{font-size:clamp(30px,4vw,48px)}h3{font-size:28px}
    .topbar{display:flex;justify-content:space-between;gap:14px;padding:8px 24px;background:var(--wine-dark);color:rgba(255,255,255,.88);font-size:13px}.nav{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:72px;padding:0 max(20px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,250,244,.96)}
    .brand{display:flex;align-items:center;gap:10px;color:var(--wine);text-decoration:none;font-family:var(--display);font-size:32px;font-weight:700}.brand img{width:56px;height:56px;object-fit:contain}.nav-links{display:flex;gap:18px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.nav-links a{text-decoration:none}
    .hero{min-height:620px;display:grid;align-items:end;padding:90px max(20px,calc((100vw - 1120px)/2));color:var(--white);background:linear-gradient(90deg,rgba(34,10,10,.88),rgba(34,10,10,.38)),url("{{ asset_base }}reception-hero.jpeg") center/cover}.hero h1{color:var(--white);max-width:760px}.hero p{max-width:560px;font-size:19px;color:rgba(255,255,255,.82)}
    .kicker{color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:6px;padding:12px 18px;font-weight:900;text-decoration:none;cursor:pointer}.btn.primary{color:var(--white);background:var(--wine)}.btn.secondary{color:var(--wine);background:var(--soft);border:1px solid var(--line)}.btn.light{color:var(--wine);background:var(--white)}
    .booking-band{width:min(1120px,calc(100% - 32px));margin:-48px auto 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--white);box-shadow:0 18px 44px rgba(23,18,16,.12)}.booking-form{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:12px;align-items:end}
    .section,.admin-wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:82px 0}.section.narrow{width:min(760px,calc(100% - 32px))}.section-head{max-width:760px;margin-bottom:28px}.room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.room-card,.panel,.table-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--white);box-shadow:0 12px 30px rgba(23,18,16,.08)}.room-card img{aspect-ratio:4/3}.room-body{padding:22px}.room-body p{color:var(--muted)}
    .tags{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.tags span{border-radius:999px;padding:6px 10px;color:var(--wine);background:rgba(122,23,32,.08);font-size:12px;font-weight:800}.price-row,.admin-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.availability{margin:12px 0;padding:10px 12px;border-radius:6px;font-weight:900}.availability.ok{color:#126437;background:#e9f8ef}.availability.no{color:#8a111b;background:#fae8ea}.total{font-size:22px;font-weight:900;margin:14px 0}.confirm-form{display:grid;gap:10px;margin-top:16px}
    .split-section{width:min(1120px,calc(100% - 32px));margin:0 auto 80px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:34px;border-radius:8px;color:var(--white);background:var(--wine)}.split-section h2{color:var(--white)}.split-section p{max-width:650px;color:rgba(255,255,255,.75)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid .full{grid-column:1/-1}.panel{padding:22px}.panel.compact{display:grid;gap:10px}.inline-form{display:grid;grid-template-columns:1.1fr .8fr .8fr .8fr 1fr auto;gap:12px;align-items:end}.admin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:36px}.check{display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0}.check input{width:auto;min-height:auto}
    table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.table-panel{margin:18px 0 38px;overflow-x:auto}.success-page{width:min(760px,calc(100% - 32px));margin:0 auto;padding:92px 0}.flash-wrap{width:min(1120px,calc(100% - 32px));margin:18px auto 0}.flash{padding:12px 14px;border-radius:6px;font-weight:800}.flash.error{color:#8a111b;background:#fae8ea}.flash.success{color:#126437;background:#e9f8ef}.empty-state{padding:24px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);background:var(--white)}.footer{display:flex;justify-content:space-between;gap:20px;padding:36px max(20px,calc((100vw - 1120px)/2));color:rgba(255,255,255,.72);background:var(--wine-dark)}
    @media (max-width:900px){.topbar,.nav,.footer,.split-section{flex-direction:column;align-items:flex-start}.booking-form,.room-grid,.admin-grid,.inline-form{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.nav-links{flex-wrap:wrap}.hero{min-height:520px}}
  </style>
</head>
<body>
  <header class="topbar">
    <div>Luxmi Hotel, Prayagraj</div>
    <div><a href="tel:+917007417970">70074 17970</a> | <a href="tel:+917054384239">70543 84239</a> | <a href="tel:+919026088927">90260 88927</a></div>
  </header>
  <nav class="nav">
    <a class="brand" href="{{ url_for('index') }}"><img src="{{ asset_base }}luxmi-logo-dark.png" alt="Luxmi Hotel logo"><span>Luxmi Hotel</span></a>
    <div class="nav-links"><a href="{{ url_for('index') }}#booking">Book</a><a href="{{ url_for('group_enquiry') }}">Group Enquiry</a><a href="{{ url_for('admin') }}">Admin</a></div>
  </nav>
  <main>
    {% with messages = get_flashed_messages(with_categories=true) %}
      {% if messages %}<div class="flash-wrap">{% for category, message in messages %}<div class="flash {{ category }}">{{ message }}</div>{% endfor %}</div>{% endif %}
    {% endwith %}
    {{ content|safe }}
  </main>
  <footer class="footer">
    <div><strong>Luxmi Hotel</strong><br>15, Swami Vivekanand Marg, Johnston Ganj, Chauraha, Prayagraj, Uttar Pradesh 211003</div>
    <div><a href="https://wa.me/917007417970">WhatsApp</a> | <a href="mailto:luxmihotel2017@gmail.com">luxmihotel2017@gmail.com</a></div>
  </footer>
</body>
</html>
"""


def page(title, body, **context):
    content = render_template_string(body, asset_base=ASSET_BASE, **context)
    return render_template_string(BASE_HTML, title=title, content=content, asset_base=ASSET_BASE)


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS room_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            base_price INTEGER NOT NULL,
            total_units INTEGER NOT NULL,
            max_pax INTEGER NOT NULL,
            amenities TEXT NOT NULL,
            image TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inventory_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_type_id INTEGER NOT NULL,
            stay_date TEXT NOT NULL,
            available_units INTEGER,
            price INTEGER,
            note TEXT,
            UNIQUE(room_type_id, stay_date),
            FOREIGN KEY(room_type_id) REFERENCES room_types(id)
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_code TEXT NOT NULL UNIQUE,
            room_type_id INTEGER NOT NULL,
            guest_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            checkin TEXT NOT NULL,
            checkout TEXT NOT NULL,
            guests INTEGER NOT NULL,
            rooms INTEGER NOT NULL DEFAULT 1,
            total_amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            special_request TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(room_type_id) REFERENCES room_types(id)
        );
        CREATE TABLE IF NOT EXISTS group_enquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enquiry_code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            arrival_date TEXT,
            departure_date TEXT,
            guests INTEGER,
            rooms_required INTEGER,
            purpose TEXT,
            message TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL
        );
        """
    )
    existing = db.execute("SELECT COUNT(*) AS count FROM room_types").fetchone()["count"]
    if existing == 0:
        now = datetime.utcnow().isoformat(timespec="seconds")
        for room in ROOM_SEED:
            db.execute(
                """
                INSERT INTO room_types
                (code, name, description, base_price, total_units, max_pax, amenities, image, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (room["code"], room["name"], room["description"], room["base_price"], room["total_units"], room["max_pax"], room["amenities"], room["image"], now),
            )
    db.commit()


@app.before_request
def ensure_db():
    init_db()


def parse_date(value, field):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValueError(f"Please enter a valid {field}.")


def date_range(start_date, end_date):
    current = start_date
    while current < end_date:
        yield current
        current += timedelta(days=1)


def get_rooms(active_only=True):
    query = "SELECT * FROM room_types"
    if active_only:
        query += " WHERE is_active = 1"
    query += " ORDER BY base_price"
    return get_db().execute(query).fetchall()


def room_daily_info(room_id, stay_date):
    db = get_db()
    room = db.execute("SELECT * FROM room_types WHERE id = ?", (room_id,)).fetchone()
    override = db.execute(
        "SELECT * FROM inventory_overrides WHERE room_type_id = ? AND stay_date = ?",
        (room_id, stay_date.isoformat()),
    ).fetchone()
    price = override["price"] if override and override["price"] is not None else room["base_price"]
    total_units = override["available_units"] if override and override["available_units"] is not None else room["total_units"]
    booked = db.execute(
        """
        SELECT COALESCE(SUM(rooms), 0) AS booked
        FROM bookings
        WHERE room_type_id = ?
          AND status IN ('confirmed', 'pending')
          AND checkin <= ?
          AND checkout > ?
        """,
        (room_id, stay_date.isoformat(), stay_date.isoformat()),
    ).fetchone()["booked"]
    return {"price": int(price), "available": max(int(total_units) - int(booked), 0)}


def quote_room(room_id, checkin, checkout, rooms_required=1):
    total = 0
    min_available = None
    for stay_date in date_range(checkin, checkout):
        info = room_daily_info(room_id, stay_date)
        total += info["price"] * rooms_required
        min_available = info["available"] if min_available is None else min(min_available, info["available"])
    return {"total": total, "available": min_available or 0}


def booking_code(prefix):
    return f"{prefix}-{datetime.now().strftime('%y%m%d%H%M%S')}"


def booking_voucher(code, room, guest_name, phone, email, checkin, checkout, guests, rooms_required, total, special_request):
    subject = f"Luxmi Hotel booking confirmation - {code}"
    text = f"""Luxmi Hotel Booking Confirmation Voucher

Booking Code: {code}
Guest Name: {guest_name}
Phone: {phone}
Email: {email}
Room: {room['name']}
Check-in: {checkin.strftime('%d %b %Y')}
Check-out: {checkout.strftime('%d %b %Y')}
Guests: {guests}
Rooms: {rooms_required}
Total Amount: Rs.{total}
Special Request: {special_request or 'None'}

Hotel Address:
Luxmi Hotel
15, Swami Vivekanand Marg, Johnston Ganj, Chauraha, Prayagraj, Uttar Pradesh 211003

For help, call or WhatsApp: +91 70074 17970
"""
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#171210;line-height:1.5">
      <h2 style="color:#7a1720;margin-bottom:4px">Luxmi Hotel Booking Confirmation Voucher</h2>
      <p style="margin-top:0">Please keep this booking code for check-in.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e7ded7">
        <tr><td><strong>Booking Code</strong></td><td>{code}</td></tr>
        <tr><td><strong>Guest Name</strong></td><td>{guest_name}</td></tr>
        <tr><td><strong>Phone</strong></td><td>{phone}</td></tr>
        <tr><td><strong>Email</strong></td><td>{email}</td></tr>
        <tr><td><strong>Room</strong></td><td>{room['name']}</td></tr>
        <tr><td><strong>Check-in</strong></td><td>{checkin.strftime('%d %b %Y')}</td></tr>
        <tr><td><strong>Check-out</strong></td><td>{checkout.strftime('%d %b %Y')}</td></tr>
        <tr><td><strong>Guests</strong></td><td>{guests}</td></tr>
        <tr><td><strong>Rooms</strong></td><td>{rooms_required}</td></tr>
        <tr><td><strong>Total Amount</strong></td><td>Rs.{total}</td></tr>
        <tr><td><strong>Special Request</strong></td><td>{special_request or 'None'}</td></tr>
      </table>
      <p><strong>Hotel Address:</strong><br>Luxmi Hotel, 15, Swami Vivekanand Marg, Johnston Ganj, Chauraha, Prayagraj, Uttar Pradesh 211003</p>
      <p><strong>Call/WhatsApp:</strong> +91 70074 17970</p>
    </div>
    """
    return subject, text, html


def send_email(to_addresses, subject, text, html):
    recipients = [addr for addr in to_addresses if addr]
    if not recipients:
        return False, "No recipient email address."
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        return False, "SMTP password is not configured."

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"Luxmi Hotel <{MAIL_FROM}>"
    message["To"] = ", ".join(recipients)
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_STARTTLS:
            smtp.starttls()
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)
    return True, "Email sent."


def send_booking_vouchers(code, room, guest_name, phone, email, checkin, checkout, guests, rooms_required, total, special_request):
    subject, text, html = booking_voucher(
        code, room, guest_name, phone, email, checkin, checkout, guests, rooms_required, total, special_request
    )
    results = []
    hotel_subject = f"New Luxmi Hotel booking - {code}"
    for recipients, mail_subject, label in [
        ([email], subject, "customer"),
        ([HOTEL_EMAIL], hotel_subject, "hotel"),
    ]:
        try:
            sent, message = send_email(recipients, mail_subject, text, html)
        except Exception as exc:
            sent, message = False, str(exc)
        results.append({"label": label, "sent": sent, "message": message})
    return results


def login_required():
    if not session.get("admin"):
        return redirect(url_for("login", next=request.path))
    return None


@app.route("/")
def index():
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    return page(
        "Luxmi Hotel Prayagraj | Automatic Booking",
        """
        <section class="hero"><div><div class="kicker">Since 1960 | Automatic Room Booking</div><h1>Book your stay at Luxmi Hotel Prayagraj.</h1><p>Check live room availability, see updated pricing, and confirm your booking directly.</p><a class="btn light" href="#booking">Check Availability</a></div></section>
        <section class="booking-band" id="booking"><form class="booking-form" method="post" action="{{ url_for('availability') }}">
          <div><label>Check-in</label><input type="date" name="checkin" min="{{ today }}" value="{{ today }}" required></div>
          <div><label>Check-out</label><input type="date" name="checkout" min="{{ tomorrow }}" value="{{ tomorrow }}" required></div>
          <div><label>Guests</label><input type="number" name="guests" min="1" value="2" required></div>
          <div><label>Rooms</label><input type="number" name="rooms" min="1" value="1" required></div>
          <button class="btn primary" type="submit">Search Rooms</button>
        </form></section>
        <section class="section"><div class="section-head"><div class="kicker">Room Types</div><h2>Live prices from admin panel</h2><p>Update prices and inventory any time from the backend.</p></div><div class="room-grid">
          {% for room in rooms %}<article class="room-card"><img src="{{ asset_base }}{{ room.image }}" alt="{{ room.name }}"><div class="room-body"><h3>{{ room.name }}</h3><p>{{ room.description }}</p><div class="tags">{% for amenity in room.amenities.split(',') %}<span>{{ amenity.strip() }}</span>{% endfor %}</div><div class="price-row"><strong>Rs.{{ room.base_price }}</strong><span>Max {{ room.max_pax }} pax</span></div></div></article>{% endfor %}
        </div></section>
        <section class="split-section"><div><div class="kicker">Groups</div><h2>Need multiple rooms?</h2><p>Use the group enquiry form for weddings, families, company stays and bulk bookings.</p></div><a class="btn light" href="{{ url_for('group_enquiry') }}">Open Group Enquiry Form</a></section>
        """,
        rooms=get_rooms(),
        today=today,
        tomorrow=tomorrow,
    )


@app.route("/availability", methods=["POST"])
def availability():
    try:
        checkin = parse_date(request.form.get("checkin"), "check-in date")
        checkout = parse_date(request.form.get("checkout"), "check-out date")
        guests = int(request.form.get("guests", "1"))
        rooms_required = int(request.form.get("rooms", "1"))
        if checkout <= checkin:
            raise ValueError("Check-out must be after check-in.")
        if guests <= 0 or rooms_required <= 0:
            raise ValueError("Guests and rooms must be greater than zero.")
    except ValueError as exc:
        flash(str(exc), "error")
        return redirect(url_for("index") + "#booking")

    results = []
    for room in get_rooms():
        quote = quote_room(room["id"], checkin, checkout, rooms_required)
        if room["max_pax"] * rooms_required >= guests:
            results.append({"room": room, "quote": quote})
    return page(
        "Available Rooms | Luxmi Hotel",
        """
        <section class="section"><div class="section-head"><div class="kicker">Available Rooms</div><h1>{{ checkin.strftime("%d %b %Y") }} to {{ checkout.strftime("%d %b %Y") }}</h1><p>{{ nights }} night(s), {{ guests }} guest(s), {{ rooms_required }} room(s)</p></div><div class="room-grid">
        {% for item in results %}{% set room = item.room %}{% set quote = item.quote %}
          <article class="room-card"><img src="{{ asset_base }}{{ room.image }}" alt="{{ room.name }}"><div class="room-body"><h3>{{ room.name }}</h3><p>{{ room.description }}</p>
          {% if quote.available >= rooms_required %}<div class="availability ok">Available: {{ quote.available }} room(s)</div><div class="total">Total: Rs.{{ quote.total }}</div>
          <form class="confirm-form" method="post" action="{{ url_for('book') }}"><input type="hidden" name="room_type_id" value="{{ room.id }}"><input type="hidden" name="checkin" value="{{ checkin.isoformat() }}"><input type="hidden" name="checkout" value="{{ checkout.isoformat() }}"><input type="hidden" name="guests" value="{{ guests }}"><input type="hidden" name="rooms" value="{{ rooms_required }}"><label>Full Name</label><input type="text" name="guest_name" required><label>Phone</label><input type="tel" name="phone" required><label>Email for Voucher</label><input type="email" name="email" required><label>Special Request</label><textarea name="special_request" rows="3"></textarea><button class="btn primary" type="submit">Confirm Booking</button></form>
          {% else %}<div class="availability no">Not enough rooms available</div>{% endif %}</div></article>
        {% else %}<div class="empty-state">No matching rooms found for these guests.</div>{% endfor %}</div></section>
        """,
        results=results,
        checkin=checkin,
        checkout=checkout,
        guests=guests,
        rooms_required=rooms_required,
        nights=max((checkout - checkin).days, 0),
    )


@app.route("/book", methods=["POST"])
def book():
    try:
        room_id = int(request.form.get("room_type_id"))
        checkin = parse_date(request.form.get("checkin"), "check-in date")
        checkout = parse_date(request.form.get("checkout"), "check-out date")
        guests = int(request.form.get("guests", "1"))
        rooms_required = int(request.form.get("rooms", "1"))
        guest_name = request.form.get("guest_name", "").strip()
        phone = request.form.get("phone", "").strip()
        email = request.form.get("email", "").strip()
        special_request = request.form.get("special_request", "").strip()
        if not guest_name or not phone or not email:
            raise ValueError("Name, phone number and email are required.")
        if checkout <= checkin:
            raise ValueError("Check-out must be after check-in.")
        room = get_db().execute("SELECT * FROM room_types WHERE id = ?", (room_id,)).fetchone()
        if not room:
            raise ValueError("Selected room was not found.")
        if room["max_pax"] * rooms_required < guests:
            raise ValueError("Selected room cannot fit this many guests.")
        quote = quote_room(room_id, checkin, checkout, rooms_required)
        if quote["available"] < rooms_required:
            raise ValueError("Sorry, this room is no longer available for these dates.")
    except ValueError as exc:
        flash(str(exc), "error")
        return redirect(url_for("index") + "#booking")

    code = booking_code("LH")
    get_db().execute(
        """
        INSERT INTO bookings
        (booking_code, room_type_id, guest_name, phone, email, checkin, checkout, guests, rooms, total_amount, status, special_request, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
        """,
        (code, room_id, guest_name, phone, email, checkin.isoformat(), checkout.isoformat(), guests, rooms_required, quote["total"], special_request, datetime.utcnow().isoformat(timespec="seconds")),
    )
    get_db().commit()
    email_results = send_booking_vouchers(
        code, room, guest_name, phone, email, checkin, checkout, guests, rooms_required, quote["total"], special_request
    )
    return page(
        "Booking Confirmed | Luxmi Hotel",
        "<section class='success-page'><div class='kicker'>Booking Confirmed</div><h1>Your booking is confirmed.</h1><p>Booking code: <strong>{{ code }}</strong></p><p>Room: {{ room.name }}</p><p>Total amount: <strong>Rs.{{ total }}</strong></p><p>Voucher email: {{ voucher_message }}</p><a class='btn primary' href='{{ url_for('index') }}'>Back to Website</a></section>",
        code=code,
        room=room,
        total=quote["total"],
        voucher_message="Sent to customer and hotel." if all(item["sent"] for item in email_results) else "Booking saved. Email delivery needs SMTP setup or retry.",
    )


@app.route("/group-enquiry", methods=["GET", "POST"])
def group_enquiry():
    if request.method == "GET":
        return page(
            "Group Enquiry | Luxmi Hotel",
            """
            <section class="section narrow"><div class="section-head"><div class="kicker">Group Enquiry</div><h1>Tell us about your group stay.</h1><p>This form does not block inventory. The hotel team can respond with a custom price.</p></div>
            <form class="panel form-grid" method="post"><div><label>Name</label><input type="text" name="name" required></div><div><label>Phone</label><input type="tel" name="phone" required></div><div><label>Email</label><input type="email" name="email"></div><div><label>Purpose</label><input type="text" name="purpose" placeholder="Wedding, family, business, students"></div><div><label>Arrival Date</label><input type="date" name="arrival_date"></div><div><label>Departure Date</label><input type="date" name="departure_date"></div><div><label>Guests</label><input type="number" name="guests" min="1"></div><div><label>Rooms Required</label><input type="number" name="rooms_required" min="1"></div><div class="full"><label>Message</label><textarea name="message" rows="5"></textarea></div><button class="btn primary" type="submit">Submit Group Enquiry</button></form></section>
            """,
        )
    name = request.form.get("name", "").strip()
    phone = request.form.get("phone", "").strip()
    if not name or not phone:
        flash("Name and phone number are required.", "error")
        return redirect(url_for("group_enquiry"))
    code = booking_code("GROUP")
    get_db().execute(
        """
        INSERT INTO group_enquiries
        (enquiry_code, name, phone, email, arrival_date, departure_date, guests, rooms_required, purpose, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (code, name, phone, request.form.get("email", "").strip(), request.form.get("arrival_date", ""), request.form.get("departure_date", ""), request.form.get("guests") or None, request.form.get("rooms_required") or None, request.form.get("purpose", "").strip(), request.form.get("message", "").strip(), datetime.utcnow().isoformat(timespec="seconds")),
    )
    get_db().commit()
    return page("Group Enquiry Received | Luxmi Hotel", "<section class='success-page'><div class='kicker'>Group Enquiry Received</div><h1>Thank you.</h1><p>Your enquiry code is <strong>{{ code }}</strong>.</p><a class='btn primary' href='{{ url_for('index') }}'>Back to Website</a></section>", code=code)


@app.route("/admin/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("password") == ADMIN_PASSWORD:
            session["admin"] = True
            return redirect(request.args.get("next") or url_for("admin"))
        flash("Incorrect password.", "error")
    return page("Admin Login | Luxmi Hotel", "<section class='section narrow'><div class='section-head'><div class='kicker'>Admin</div><h1>Login</h1></div><form class='panel' method='post'><label>Password</label><input type='password' name='password' required><br><br><button class='btn primary' type='submit'>Login</button></form></section>")


@app.route("/admin/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/admin")
def admin():
    guard = login_required()
    if guard:
        return guard
    db = get_db()
    rooms = get_rooms(active_only=False)
    bookings = db.execute("SELECT b.*, r.name AS room_name FROM bookings b JOIN room_types r ON r.id = b.room_type_id ORDER BY b.created_at DESC LIMIT 50").fetchall()
    enquiries = db.execute("SELECT * FROM group_enquiries ORDER BY created_at DESC LIMIT 50").fetchall()
    overrides = db.execute("SELECT o.*, r.name AS room_name FROM inventory_overrides o JOIN room_types r ON r.id = o.room_type_id WHERE o.stay_date >= ? ORDER BY o.stay_date, r.name LIMIT 100", (date.today().isoformat(),)).fetchall()
    return page(
        "Admin Backend | Luxmi Hotel",
        """
        <section class="admin-wrap"><div class="admin-head"><div><div class="kicker">Backend</div><h1>Inventory and Price Update</h1></div><a class="btn secondary" href="{{ url_for('logout') }}">Logout</a></div>
        <h2>Room Master</h2><div class="admin-grid">{% for room in rooms %}<form class="panel compact" method="post" action="{{ url_for('update_room', room_id=room.id) }}"><h3>{{ room.name }}</h3><label>Base Price</label><input type="number" name="base_price" min="0" value="{{ room.base_price }}" required><label>Total Rooms / Inventory</label><input type="number" name="total_units" min="0" value="{{ room.total_units }}" required><label>Max Pax Per Room</label><input type="number" name="max_pax" min="1" value="{{ room.max_pax }}" required><label class="check"><input type="checkbox" name="is_active" {% if room.is_active %}checked{% endif %}> Active</label><button class="btn primary" type="submit">Update</button></form>{% endfor %}</div>
        <h2>Date-wise Price / Inventory Override</h2><form class="panel inline-form" method="post" action="{{ url_for('update_inventory') }}"><div><label>Room</label><select name="room_type_id" required>{% for room in rooms %}<option value="{{ room.id }}">{{ room.name }}</option>{% endfor %}</select></div><div><label>Date</label><input type="date" name="stay_date" min="{{ today }}" value="{{ today }}" required></div><div><label>Available Units</label><input type="number" name="available_units" min="0" placeholder="Normal"></div><div><label>Price</label><input type="number" name="price" min="0" placeholder="Normal"></div><div><label>Note</label><input type="text" name="note"></div><button class="btn primary" type="submit">Save Override</button></form>
        {% if overrides %}<div class="table-panel"><h3>Upcoming Overrides</h3><table><tr><th>Date</th><th>Room</th><th>Available</th><th>Price</th><th>Note</th></tr>{% for item in overrides %}<tr><td>{{ item.stay_date }}</td><td>{{ item.room_name }}</td><td>{{ item.available_units if item.available_units is not none else "Normal" }}</td><td>{{ item.price if item.price is not none else "Normal" }}</td><td>{{ item.note }}</td></tr>{% endfor %}</table></div>{% endif %}
        <h2>Bookings</h2><div class="table-panel"><table><tr><th>Code</th><th>Guest</th><th>Room</th><th>Dates</th><th>Total</th><th>Status</th><th>Action</th></tr>{% for booking in bookings %}<tr><td>{{ booking.booking_code }}</td><td>{{ booking.guest_name }}<br><small>{{ booking.phone }}</small></td><td>{{ booking.room_name }} x {{ booking.rooms }}</td><td>{{ booking.checkin }} to {{ booking.checkout }}<br><small>{{ booking.guests }} guest(s)</small></td><td>Rs.{{ booking.total_amount }}</td><td>{{ booking.status }}</td><td><form method="post" action="{{ url_for('update_booking_status', booking_id=booking.id) }}"><select name="status">{% for status in ["confirmed","pending","cancelled","checked_in","completed"] %}<option value="{{ status }}" {% if booking.status == status %}selected{% endif %}>{{ status }}</option>{% endfor %}</select><button class="btn primary" type="submit">Save</button></form></td></tr>{% else %}<tr><td colspan="7">No bookings yet.</td></tr>{% endfor %}</table></div>
        <h2>Group Enquiries</h2><div class="table-panel"><table><tr><th>Code</th><th>Contact</th><th>Dates</th><th>Group</th><th>Message</th><th>Status</th></tr>{% for enquiry in enquiries %}<tr><td>{{ enquiry.enquiry_code }}</td><td>{{ enquiry.name }}<br><small>{{ enquiry.phone }}</small></td><td>{{ enquiry.arrival_date }} to {{ enquiry.departure_date }}</td><td>{{ enquiry.guests }} guest(s), {{ enquiry.rooms_required }} room(s)<br><small>{{ enquiry.purpose }}</small></td><td>{{ enquiry.message }}</td><td><form method="post" action="{{ url_for('update_group_status', enquiry_id=enquiry.id) }}"><select name="status">{% for status in ["new","contacted","quoted","converted","closed"] %}<option value="{{ status }}" {% if enquiry.status == status %}selected{% endif %}>{{ status }}</option>{% endfor %}</select><button class="btn primary" type="submit">Save</button></form></td></tr>{% else %}<tr><td colspan="6">No group enquiries yet.</td></tr>{% endfor %}</table></div></section>
        """,
        rooms=rooms,
        bookings=bookings,
        enquiries=enquiries,
        overrides=overrides,
        today=date.today().isoformat(),
    )


@app.route("/admin/rooms/<int:room_id>", methods=["POST"])
def update_room(room_id):
    guard = login_required()
    if guard:
        return guard
    get_db().execute(
        "UPDATE room_types SET base_price = ?, total_units = ?, max_pax = ?, is_active = ?, updated_at = ? WHERE id = ?",
        (int(request.form.get("base_price")), int(request.form.get("total_units")), int(request.form.get("max_pax")), 1 if request.form.get("is_active") else 0, datetime.utcnow().isoformat(timespec="seconds"), room_id),
    )
    get_db().commit()
    flash("Room updated.", "success")
    return redirect(url_for("admin"))


@app.route("/admin/inventory", methods=["POST"])
def update_inventory():
    guard = login_required()
    if guard:
        return guard
    available_units = request.form.get("available_units")
    price = request.form.get("price")
    get_db().execute(
        """
        INSERT INTO inventory_overrides (room_type_id, stay_date, available_units, price, note)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(room_type_id, stay_date)
        DO UPDATE SET available_units = excluded.available_units, price = excluded.price, note = excluded.note
        """,
        (int(request.form.get("room_type_id")), request.form.get("stay_date"), int(available_units) if available_units != "" else None, int(price) if price != "" else None, request.form.get("note", "").strip()),
    )
    get_db().commit()
    flash("Inventory override saved.", "success")
    return redirect(url_for("admin"))


@app.route("/admin/bookings/<int:booking_id>/status", methods=["POST"])
def update_booking_status(booking_id):
    guard = login_required()
    if guard:
        return guard
    status = request.form.get("status")
    if status not in {"confirmed", "pending", "cancelled", "checked_in", "completed"}:
        flash("Invalid booking status.", "error")
        return redirect(url_for("admin"))
    get_db().execute("UPDATE bookings SET status = ? WHERE id = ?", (status, booking_id))
    get_db().commit()
    flash("Booking status updated.", "success")
    return redirect(url_for("admin"))


@app.route("/admin/group-enquiries/<int:enquiry_id>/status", methods=["POST"])
def update_group_status(enquiry_id):
    guard = login_required()
    if guard:
        return guard
    get_db().execute("UPDATE group_enquiries SET status = ? WHERE id = ?", (request.form.get("status") or "new", enquiry_id))
    get_db().commit()
    flash("Group enquiry status updated.", "success")
    return redirect(url_for("admin"))


if __name__ == "__main__":
    app.run(debug=True)
