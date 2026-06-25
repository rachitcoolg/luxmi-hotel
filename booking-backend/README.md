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
- `SMTP_HOST`: `smtp-relay.brevo.com`
- `SMTP_PORT`: `587`
- `SMTP_USERNAME`: Brevo SMTP login, for example `afea85001@smtp-brevo.com`
- `SMTP_PASSWORD`: Brevo SMTP key
- `MAIL_FROM`: `luxmihotelbooking@gmail.com`
- `HOTEL_EMAILS`: comma-separated hotel record email list, for example `luxmihotelbooking@gmail.com,luxmihotel2017@gmail.com,rachit.coolg@gmail.com`

The booking form requires customer email. After a booking is confirmed, the backend sends a voucher to the customer and a copy to the hotel email.
