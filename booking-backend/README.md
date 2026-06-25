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
- `SMTP_HOST`: `smtp.gmail.com`
- `SMTP_PORT`: `587`
- `SMTP_USERNAME`: `luxmihotel2017@gmail.com`
- `SMTP_PASSWORD`: Gmail app password for `luxmihotel2017@gmail.com`
- `MAIL_FROM`: `luxmihotel2017@gmail.com`
- `HOTEL_EMAIL`: `luxmihotel2017@gmail.com`

The booking form requires customer email. After a booking is confirmed, the backend sends a voucher to the customer and a copy to the hotel email.
