# aerva-backend

## OTP API

The OTP service sends six-digit, single-use codes through Resend. Configure these
environment variables before using it:

- `RESEND_API_KEY` — required for delivery.
- `OTP_EMAIL_FROM` — verified sender address; falls back to `ALERT_EMAIL_FROM`.
- `OTP_SECRET` — required in production; keep it stable and secret. The service
  falls back to `JWT_SECRET` or `AUTH_SECRET` when one of those is configured.

Request a code with `POST /api/otp/generate-otp`:

```json
{
  "uuid": "device_123456",
  "email": "user@example.com",
  "purpose": "device_claim"
}
```

Supported purposes are `email_verification`, `password_reset`, and
`device_claim`. The response contains a `requestId`, not the OTP.

Verify the emailed code with `POST /api/otp/verify-otp`:

```json
{
  "requestId": "b16f594b-9197-4f99-a77b-cb5f36b796fd",
  "otp": "012345"
}
```

A successful response contains a ten-minute `verificationToken`. The backend
action being protected must call `consumeVerificationToken` from
`services/otpGeneration.js` with that token, the same UUID, and the same purpose.
Consumption is atomic and can succeed only once.

To create an account, send that proof with the registration fields to
`POST /api/auth/signup`:

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "password": "a-strong-password",
  "verificationToken": "the-token-from-verification",
  "uuid": "device_123456"
}
```

The UUID and email must match the original OTP request. The user is inserted only
after this proof is consumed successfully. Login remains email-and-password only.
