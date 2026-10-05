const assert = require("node:assert/strict");
const test = require("node:test");

process.env.OTP_SECRET = "test-only-otp-secret";

const pool = require("../controller/db_connection");
const { consumeVerificationToken, verifyOTP, _test } = require("../services/otpGeneration");

const REQUEST_ID = "7c959ff6-4c76-4fd0-8bc0-1c18a28f4689";

test("verification consumes a valid OTP and returns a separate proof token", async () => {
    const queries = [];
    const originalConnect = pool.connect;
    pool.connect = async () => fakeClient({
        queries,
        row: validRow("012345")
    });

    try {
        const result = await verifyOTP({ requestId: REQUEST_ID, otp: "012345" });

        assert.match(result.verificationToken, /^[A-Za-z0-9_-]{40,}$/);
        assert.equal(result.subjectId, "device_123456");
        assert.equal(result.purpose, "device_claim");
        assert.ok(queries.some(({ sql }) => sql.includes("verified_at = NOW()")));
        assert.ok(queries.some(({ sql }) => sql === "COMMIT"));
    } finally {
        pool.connect = originalConnect;
    }
});

test("a wrong OTP increments attempts without issuing a proof token", async () => {
    const queries = [];
    const originalConnect = pool.connect;
    pool.connect = async () => fakeClient({
        queries,
        row: validRow("012345")
    });

    try {
        await assert.rejects(
            verifyOTP({ requestId: REQUEST_ID, otp: "999999" }),
            err => err.code === "INVALID_OR_EXPIRED_OTP" && err.status === 401
        );
        assert.ok(queries.some(({ sql }) => sql.includes("SET attempts = attempts + 1")));
        assert.ok(!queries.some(({ sql }) => sql.includes("verified_at = NOW()")));
    } finally {
        pool.connect = originalConnect;
    }
});

test("verification proof consumption is atomic and does not query by plaintext token", async () => {
    const queries = [];
    const db = {
        async query(statement, params) {
            queries.push({ sql: String(statement), params });
            return {
                rows: [{
                    subject_id: "device_123456",
                    email: "user@example.com",
                    purpose: "email_verification",
                    verified_at: new Date()
                }]
            };
        }
    };

    const result = await consumeVerificationToken({
        token: "proof-token",
        subjectId: "device_123456",
        purpose: "email_verification",
        db
    });

    assert.equal(result.email, "user@example.com");
    assert.match(queries[0].sql, /verification_consumed_at = NOW\(\)/);
    assert.notEqual(queries[0].params[0], "proof-token");
    assert.equal(queries[0].params[0].length, 64);
});

function validRow(otp) {
    return {
        otp_request_id: REQUEST_ID,
        subject_id: "device_123456",
        email: "user@example.com",
        purpose: "device_claim",
        otp_hash: _test.hashSecret(otp, REQUEST_ID),
        attempts: 0,
        max_attempts: 5,
        consumed_at: null,
        delivery_status: "sent",
        is_expired: false
    };
}

function fakeClient({ queries, row }) {
    return {
        async query(statement, params = []) {
            const sql = String(statement).trim();
            queries.push({ sql, params });
            if (sql.includes("FROM otp_codes") && sql.includes("FOR UPDATE")) {
                return { rows: [row] };
            }
            return { rows: [] };
        },
        release() {}
    };
}
