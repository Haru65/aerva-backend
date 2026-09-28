function requireAdminKey(req, res, next) {
    const expectedKey = process.env.ADMIN_DEVICE_REGISTRY_KEY;
    if (!expectedKey) {
        return res.status(503).json({ error: "Admin registry key is not configured" });
    }

    const providedKey = req.headers["x-admin-key"];
    if (providedKey !== expectedKey) {
        return res.status(401).json({ error: "Invalid admin key" });
    }

    next();
}

module.exports = { requireAdminKey };
