const pool = require("./db_connection");

const DEFAULT_PREFERENCES = Object.freeze({
    autoRefresh: "30s",
    notificationSounds: true,
    pushNotifications: true,
    emailAlerts: true,
    dailySummary: false,
    quietHours: "22:00 – 07:00",
    twoFactor: false
});

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_PREFERENCES));

async function getTenantSettings(tenantId) {
    if (!tenantId) throw new Error("tenant_id is required");
    const result = await pool.query(
        "SELECT preferences, updated_at FROM tenant_settings WHERE tenant_id = $1",
        [tenantId]
    );
    return {
        preferences: { ...DEFAULT_PREFERENCES, ...(result.rows[0]?.preferences || {}) },
        updatedAt: result.rows[0]?.updated_at || null
    };
}

async function updateTenantSettings(tenantId, changes = {}) {
    if (!tenantId) throw new Error("tenant_id is required");
    const preferences = normalizePreferences(changes);
    const result = await pool.query(`
        INSERT INTO tenant_settings (tenant_id, preferences)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (tenant_id) DO UPDATE SET
            preferences = tenant_settings.preferences || EXCLUDED.preferences,
            updated_at = NOW()
        RETURNING preferences, updated_at
    `, [tenantId, JSON.stringify(preferences)]);

    return {
        preferences: { ...DEFAULT_PREFERENCES, ...(result.rows[0]?.preferences || {}) },
        updatedAt: result.rows[0]?.updated_at || null
    };
}

function normalizePreferences(changes) {
    const normalized = {};
    for (const [key, value] of Object.entries(changes || {})) {
        if (!ALLOWED_KEYS.has(key)) continue;
        normalized[key] = normalizePreference(key, value);
    }
    if (Object.keys(normalized).length === 0) throw new Error("No valid preferences supplied");
    return normalized;
}

function normalizePreference(key, value) {
    if (key === "autoRefresh") {
        if (!["5s", "30s", "1min"].includes(value)) throw new Error("Invalid auto-refresh interval");
        return value;
    }
    if (key === "quietHours") {
        if (!["Off", "22:00 – 07:00", "Custom"].includes(value)) throw new Error("Invalid quiet-hours option");
        return value;
    }
    return Boolean(value);
}

module.exports = {
    DEFAULT_PREFERENCES,
    getTenantSettings,
    updateTenantSettings,
    _test: { normalizePreferences }
};
