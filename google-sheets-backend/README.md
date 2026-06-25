# Luxmi Hotel Google Sheets Backend

This is the free booking backend for `luxmihotel.com`.

## Setup

1. Open `https://script.new` while signed in to Google.
2. Name the project `Luxmi Hotel Booking Backend`.
3. Paste `Code.gs`.
4. Run `setup()` once and approve permissions. This creates the Google Sheet automatically.
5. Open the generated Sheet URL from the `Settings` tab or the Apps Script log.
6. Deploy: `Deploy > New deployment > Web app`.
7. Select:
   - Execute as: `Me`
   - Who has access: `Anyone`
8. Copy the Web App URL.
9. Replace `GOOGLE_SCRIPT_URL` in `index.html` with that URL.

## Admin

Open the Web App URL with:

```text
?adminKey=YOUR_ADMIN_KEY
```

The admin key is written in the `Settings` tab after running `setup()`.

## Sheets Created

- `Settings`
- `Rooms`
- `Inventory`
- `Bookings`
- `Group Enquiries`
