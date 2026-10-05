const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../controller/db_connection");
const { createToken } = require("../middleware/auth");
const { OtpError, consumeVerificationToken } = require("../services/otpGeneration");

const router = express.Router();
const PASSWORD_ROUNDS = 10;

router.post("/signup", async (req, res) => {
    let client;
    let transactionFinished = false;
    try {
        const { name, email, password, verificationToken, uuid } = req.body || {};
        const cleanEmail = normalizeEmail(email);
        const cleanName = String(name || "").trim() || cleanEmail.split("@")[0];

        if (!cleanEmail || !password || !verificationToken || !uuid) {
            return res.status(400).json({ message: "Email, password, and email verification are required" });
        }

        const passwordHash = await bcrypt.hash(String(password), PASSWORD_ROUNDS);
        client = await pool.connect();
        await client.query("BEGIN");

        const verification = await consumeVerificationToken({
            token: verificationToken,
            subjectId: uuid,
            purpose: "email_verification",
            db: client
        });
        if (!verification || normalizeEmail(verification.email) !== cleanEmail) {
            await client.query("ROLLBACK");
            transactionFinished = true;
            return res.status(401).json({ message: "Invalid or expired email verification" });
        }

        const existing = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [cleanEmail]);
        if (existing.rowCount > 0) {
            await client.query("ROLLBACK");
            transactionFinished = true;
            return res.status(409).json({ message: "Account already exists. Please login." });
        }

        const tenantId = `tenant_${crypto.randomUUID()}`;
        const username = cleanEmail;
        const result = await client.query(`
            INSERT INTO users (
                username,
                name,
                email,
                password_hash,
                tenant_id,
                workspace,
                role
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'owner')
            RETURNING id, username, name, email, tenant_id, workspace, role
        `, [
            username,
            cleanName,
            cleanEmail,
            passwordHash,
            tenantId,
            `${cleanName}'s Home`
        ]);

        const user = result.rows[0];
        await client.query("COMMIT");
        transactionFinished = true;
        res.status(201).json({
            token: createToken(user),
            user: toClientUser(user)
        });
    } catch (err) {
        if (client && !transactionFinished) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // Preserve the original signup error.
            }
        }
        if (err instanceof OtpError) {
            return res.status(401).json({ message: "Invalid or expired email verification" });
        }
        if (err?.code === "23505") {
            return res.status(409).json({ message: "Account already exists. Please login." });
        }
        console.error("Signup failed:", err);
        return res.status(500).json({ message: "Could not create account" });
    } finally {
        client?.release();
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const cleanEmail = normalizeEmail(email);

        if (!cleanEmail || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const result = await pool.query(`
            SELECT id, username, name, email, password_hash, tenant_id, workspace, role
            FROM users
            WHERE LOWER(email) = LOWER($1)
        `, [cleanEmail]);

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const valid = await bcrypt.compare(String(password), user.password_hash);
        if (!valid) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        res.json({
            token: createToken(user),
            user: toClientUser(user)
        });
    } catch (err) {
        console.error("Login failed:", err);
        res.status(500).json({ message: "Could not login" });
    }
});

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function toClientUser(user) {
    const displayName = user.name || user.username || user.email;
    return {
        id: String(user.id),
        name: displayName,
        email: user.email,
        tenantId: user.tenant_id,
        workspace: user.workspace || `${displayName}'s Home`,
        role: user.role || "owner"
    };
}

module.exports = router;
