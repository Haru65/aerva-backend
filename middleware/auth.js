const crypto = require("crypto");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getJwtSecret() {
    return process.env.JWT_SECRET || process.env.AUTH_SECRET || "aerva-local-dev-secret";
}

function base64url(input) {
    return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signPayload(payload) {
    return crypto
        .createHmac("sha256", getJwtSecret())
        .update(payload)
        .digest("base64url");
}

function createToken(user) {
    const payload = {
        sub: String(user.id),
        tenantId: user.tenant_id,
        email: user.email,
        exp: Date.now() + TOKEN_TTL_MS
    };
    const encodedPayload = base64url(payload);
    return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function verifyToken(token) {
    if (!token || !token.includes(".")) return null;
    const [encodedPayload, signature] = token.split(".");
    const expectedSignature = signPayload(encodedPayload);

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }
    } catch {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

function optionalAuth(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);
    req.user = payload ? {
        id: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email
    } : null;
    next();
}

function requireAuth(req, res, next) {
    optionalAuth(req, res, () => {
        if (!req.user?.tenantId) {
            return res.status(401).json({ error: "Authentication required" });
        }
        next();
    });
}

module.exports = {
    createToken,
    verifyToken,
    optionalAuth,
    requireAuth
};
