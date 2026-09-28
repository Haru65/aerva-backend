const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../controller/db_connection");
const { createToken } = require("../middleware/auth");

const router = express.Router();
const PASSWORD_ROUNDS = 10;

router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        const cleanEmail = normalizeEmail(email);
        const cleanName = String(name || "").trim() || cleanEmail.split("@")[0];

        if (!cleanEmail || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [cleanEmail]);
        if (existing.rowCount > 0) {
            return res.status(409).json({ message: "Account already exists. Please login." });
        }

        const passwordHash = await bcrypt.hash(String(password), PASSWORD_ROUNDS);
        const tenantId = `tenant_${crypto.randomUUID()}`;
        const username = cleanEmail;
        const result = await pool.query(`
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
        res.status(201).json({
            token: createToken(user),
            user: toClientUser(user)
        });
    } catch (err) {
        console.error("Signup failed:", err);
        res.status(500).json({ message: "Could not create account" });
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
