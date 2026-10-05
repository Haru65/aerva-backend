# aerva-backend

## Web Push notifications

The alert service sends Web Push notifications to subscribed Android devices and
installed iPhone/iPad Home Screen apps. Generate one VAPID key pair for the
deployment:

```bash
npx web-push generate-vapid-keys
```

Set these environment variables on the backend and keep the same key pair across
deployments:

- `VAPID_PUBLIC_KEY` — the generated public key.
- `VAPID_PRIVATE_KEY` — the generated private key; never expose it to the frontend.
- `VAPID_SUBJECT` — a monitored contact such as `mailto:alerts@example.com`.

The authenticated `/api/push` endpoints register and remove browser
subscriptions. New alert events are dispatched from `services/alert_service.js`.
Expired subscriptions are removed automatically after the push provider returns
HTTP 404 or 410.

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
