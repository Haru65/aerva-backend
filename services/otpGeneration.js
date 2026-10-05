const crypto = require("crypto");
const { Resend } = require("resend");
const pool = require("../controller/db_connection");

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MINUTES = 15;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_ATTEMPTS = 5;
const ALLOWED_PURPOSES = new Set([
    "email_verification",
    "password_reset",
    "device_claim"
]);

let resendClient = null;

class OtpError extends Error {
    constructor(message, { status = 400, code = "OTP_ERROR", retryAfter = null } = {}) {
        super(message);
        this.name = "OtpError";
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}

function getOtpSecret() {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || process.env.AUTH_SECRET;
    const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    if (!secret && isProduction) {
        throw new OtpError("OTP service is not configured", {
            status: 503,
            code: "OTP_NOT_CONFIGURED"
        });
    }

    return secret || "aerva-local-development-otp-secret";
}

function normalizeEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (
        normalized.length < 3 ||
        normalized.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
        throw new OtpError("A valid email address is required", { code: "INVALID_EMAIL" });
    }
    return normalized;
}

function normalizeSubjectId(subjectId) {
    const normalized = String(subjectId || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/.test(normalized)) {
        throw new OtpError("A valid UUID is required", { code: "INVALID_SUBJECT" });
    }
    return normalized;
}

function normalizePurpose(purpose) {
    const normalized = String(purpose || "email_verification").trim().toLowerCase();
    if (!ALLOWED_PURPOSES.has(normalized)) {
        throw new OtpError("Unsupported OTP purpose", { code: "INVALID_PURPOSE" });
    }
    return normalized;
}

function generateCode() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashSecret(value, context) {
    return crypto
        .createHmac("sha256", getOtpSecret())
        .update(`${context}:${value}`)
        .digest("hex");
}

function safeEqualHex(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
    } catch {
        return false;
    }
}

async function requestOTP({ subjectId, email, purpose = "email_verification" }) {
    const cleanSubjectId = normalizeSubjectId(subjectId);
    const cleanEmail = normalizeEmail(email);
    const cleanPurpose = normalizePurpose(purpose);
    const requestId = crypto.randomUUID();
    const otp = generateCode();
    const otpHash = hashSecret(otp, requestId);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const lockKeys = [`email:${cleanEmail}`, `subject:${cleanSubjectId}:${cleanPurpose}`].sort();
        for (const lockKey of lockKeys) {
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [lockKey]
            );
        }
        await client.query(`
            DELETE FROM otp_codes
            WHERE created_at < NOW() - INTERVAL '24 hours'
              AND (
                  verification_token_expires_at IS NULL
                  OR verification_token_expires_at < NOW()
              )
        `);

        const recent = await client.query(`
            SELECT
                COUNT(*) FILTER (WHERE LOWER(email) = LOWER($1))::int AS email_requests,
                COUNT(*) FILTER (WHERE subject_id = $2 AND purpose = $3)::int AS subject_requests
            FROM otp_codes
            WHERE created_at > NOW() - ($4 * INTERVAL '1 minute')
        `, [cleanEmail, cleanSubjectId, cleanPurpose, REQUEST_WINDOW_MINUTES]);

        const emailRequests = Number(recent.rows[0]?.email_requests || 0);
        const subjectRequests = Number(recent.rows[0]?.subject_requests || 0);
        if (emailRequests >= MAX_REQUESTS_PER_WINDOW || subjectRequests >= MAX_REQUESTS_PER_WINDOW) {
            throw new OtpError("Too many OTP requests. Please try again later.", {
                status: 429,
                code: "OTP_RATE_LIMITED",
                retryAfter: REQUEST_WINDOW_MINUTES * 60
            });
        }

        await client.query(`
            UPDATE otp_codes
            SET consumed_at = COALESCE(consumed_at, NOW())
            WHERE subject_id = $1
              AND purpose = $2
              AND consumed_at IS NULL
        `, [cleanSubjectId, cleanPurpose]);

        await client.query(`
            INSERT INTO otp_codes (
                otp_request_id,
                subject_id,
                email,
                purpose,
                otp_hash,
                expires_at,
                max_attempts,
                delivery_status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
        `, [requestId, cleanSubjectId, cleanEmail, cleanPurpose, otpHash, expiresAt, MAX_ATTEMPTS]);
        await client.query("COMMIT");
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // Preserve the original database error if rollback itself fails.
        }
        throw err;
    } finally {
        client.release();
    }

    try {
        await sendOtpEmail({ email: cleanEmail, otp, purpose: cleanPurpose });
        await pool.query(`
            UPDATE otp_codes
            SET delivery_status = 'sent'
            WHERE otp_request_id = $1
        `, [requestId]);
    } catch (err) {
        await pool.query(`
            UPDATE otp_codes
            SET delivery_status = 'failed',
                consumed_at = COALESCE(consumed_at, NOW())
            WHERE otp_request_id = $1
        `, [requestId]);
        console.error("OTP email delivery failed:", err.message || err);
        throw new OtpError("Could not deliver OTP. Please try again later.", {
            status: 503,
            code: "OTP_DELIVERY_FAILED"
        });
    }

    return {
        requestId,
        expiresAt,
        maskedEmail: maskEmail(cleanEmail)
    };
}

async function verifyOTP({ requestId, otp }) {
    const cleanRequestId = String(requestId || "").trim();
    const cleanOtp = String(otp || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanRequestId)) {
        throw invalidOtpError();
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
        throw invalidOtpError();
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`
            SELECT
                otp_request_id,
                subject_id,
                email,
                purpose,
                otp_hash,
                expires_at,
                attempts,
                max_attempts,
                consumed_at,
                delivery_status,
                expires_at <= NOW() AS is_expired
            FROM otp_codes
            WHERE otp_request_id = $1
            FOR UPDATE
        `, [cleanRequestId]);

        const row = result.rows[0];
        const unusable = !row ||
            row.delivery_status !== "sent" ||
            row.consumed_at ||
            row.is_expired ||
            Number(row.attempts) >= Number(row.max_attempts);

        if (unusable) {
            await client.query("COMMIT");
            throw invalidOtpError();
        }

        const candidateHash = hashSecret(cleanOtp, cleanRequestId);
        if (!safeEqualHex(candidateHash, row.otp_hash)) {
            await client.query(`
                UPDATE otp_codes
                SET attempts = attempts + 1,
                    consumed_at = CASE
                        WHEN attempts + 1 >= max_attempts THEN NOW()
                        ELSE consumed_at
                    END
                WHERE otp_request_id = $1
            `, [cleanRequestId]);
            await client.query("COMMIT");
            throw invalidOtpError();
        }

        const verificationToken = crypto.randomBytes(32).toString("base64url");
        const verificationTokenHash = hashSecret(verificationToken, "verification-token");
        const tokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
        await client.query(`
            UPDATE otp_codes
            SET attempts = attempts + 1,
                consumed_at = NOW(),
                verified_at = NOW(),
                verification_token_hash = $2,
                verification_token_expires_at = $3
            WHERE otp_request_id = $1
        `, [cleanRequestId, verificationTokenHash, tokenExpiresAt]);
        await client.query("COMMIT");

        return {
            verificationToken,
            expiresAt: tokenExpiresAt,
            subjectId: row.subject_id,
            purpose: row.purpose
        };
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // The transaction may already have been committed for an expected invalid-code result.
        }
        throw err;
    } finally {
        client.release();
    }
}

async function consumeVerificationToken({ token, subjectId, purpose, db = pool }) {
    const cleanToken = String(token || "").trim();
    const cleanSubjectId = normalizeSubjectId(subjectId);
    const cleanPurpose = normalizePurpose(purpose);
    if (!cleanToken) return null;

    const tokenHash = hashSecret(cleanToken, "verification-token");
    const result = await db.query(`
        UPDATE otp_codes
        SET verification_consumed_at = NOW()
        WHERE verification_token_hash = $1
          AND subject_id = $2
          AND purpose = $3
          AND verified_at IS NOT NULL
          AND verification_token_expires_at > NOW()
          AND verification_consumed_at IS NULL
        RETURNING subject_id, email, purpose, verified_at
    `, [tokenHash, cleanSubjectId, cleanPurpose]);

    return result.rows[0] || null;
}

async function sendOtpEmail({ email, otp, purpose }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    if (!resendClient) resendClient = new Resend(apiKey);

    const from = process.env.OTP_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "AERVA <onboarding@resend.dev>";
    const replyTo = process.env.OTP_EMAIL_REPLY_TO || process.env.ALERT_EMAIL_REPLY_TO || undefined;
    const action = purposeLabel(purpose);
    const { error } = await resendClient.emails.send({
        from,
        to: [email],
        replyTo,
        subject: `${otp} is your AERVA verification code`,
        text: `Your AERVA code for ${action} is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
        html: `<p>Your AERVA code for ${escapeHtml(action)} is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${otp}</p><p>It expires in 5 minutes. If you did not request this code, you can ignore this email.</p>`
    });
    if (error) throw new Error(error.message || "Resend email failed");
}

function invalidOtpError() {
    return new OtpError("Invalid or expired OTP", {
        status: 401,
        code: "INVALID_OR_EXPIRED_OTP"
    });
}

function maskEmail(email) {
    const [local, domain] = email.split("@");
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function purposeLabel(purpose) {
    return {
        email_verification: "email verification",
        password_reset: "password reset",
        device_claim: "device setup"
    }[purpose] || "verification";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

module.exports = {
    OtpError,
    requestOTP,
    verifyOTP,
    consumeVerificationToken,
    _test: {
        generateCode,
        hashSecret,
        maskEmail,
        normalizeEmail,
        normalizePurpose,
        normalizeSubjectId,
        safeEqualHex
    }
};
