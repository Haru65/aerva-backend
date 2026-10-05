const assert = require("node:assert/strict");
const test = require("node:test");

process.env.OTP_SECRET = "test-only-otp-secret";
process.env.JWT_SECRET = "test-only-jwt-secret";

const pool = require("../controller/db_connection");
const authRouter = require("../routes/auth");

test("a valid email OTP proof creates the account and returns a session", async () => {
    const originalConnect = pool.connect;
    pool.connect = async () => fakeClient();

    try {
        const handler = authRouter.stack
            .find(layer => layer.route?.path === "/signup")
            .route.stack[0].handle;
        const req = {
            body: {
                name: "Test User",
                email: "user@example.com",
                password: "correct horse battery staple",
                verificationToken: "valid-proof-token",
                uuid: "signup_12345678"
            }
        };
        const response = fakeResponse();
        await handler(req, response);

        assert.equal(response.statusCode, 201);
        assert.match(response.body.token, /^[^.]+\.[A-Za-z0-9_-]+$/);
        assert.equal(response.body.user.email, "user@example.com");
        assert.equal(response.body.user.tenantId, "tenant_test");
    } finally {
        pool.connect = originalConnect;
    }
});

test("signup is rejected before database access when OTP verification is missing", async () => {
    const originalConnect = pool.connect;
    let connected = false;
    pool.connect = async () => {
        connected = true;
        return fakeClient();
    };

    try {
        const handler = signupHandler();
        const response = fakeResponse();
        await handler({
            body: {
                name: "Test User",
                email: "user@example.com",
                password: "correct horse battery staple"
            }
        }, response);

        assert.equal(response.statusCode, 400);
        assert.equal(connected, false);
    } finally {
        pool.connect = originalConnect;
    }
});

function signupHandler() {
    return authRouter.stack
        .find(layer => layer.route?.path === "/signup")
        .route.stack[0].handle;
}

function fakeClient() {
    return {
        async query(statement) {
            const sql = String(statement).trim();
            if (sql.startsWith("UPDATE otp_codes")) {
                return {
                    rows: [{
                        subject_id: "signup_12345678",
                        email: "user@example.com",
                        purpose: "email_verification",
                        verified_at: new Date()
                    }]
                };
            }
            if (sql.startsWith("SELECT id FROM users")) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.startsWith("INSERT INTO users")) {
                return {
                    rows: [{
                        id: 7,
                        username: "user@example.com",
                        name: "Test User",
                        email: "user@example.com",
                        tenant_id: "tenant_test",
                        workspace: "Test Home",
                        role: "owner"
                    }]
                };
            }
            return { rows: [] };
        },
        release() {}
    };
}

function fakeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}
