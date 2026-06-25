# Luxmi Hotel Booking Backend

Online booking/admin backend for Luxmi Hotel.

## Render Settings

- Root Directory: `booking-backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`

## Environment Variables

- `ADMIN_PASSWORD`: strong admin password
- `SECRET_KEY`: long random secret
- `DATABASE_PATH`: `/var/data/luxmi_booking.db` when using a Render persistent disk

