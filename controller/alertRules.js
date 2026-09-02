const pool = require("../controller/db_connection");

function rowToAlertRule(row) {
    return {
        id: row.id,
        deviceMac: row.device_mac || "",
        sensor: row.sensor,
        condition: row.condition,
        value: row.threshold_value == null ? 0 : Number(row.threshold_value),
        delayType: row.delay_type || "immediate",
        hours: row.hours || 0,
        minutes: row.minutes || 0,
        email: row.email || "",
        emailOn: !!row.email_on,
        enabled: !!row.enabled
    };
}

function normalizeAlertRule(rule = {}) {
    const id = String(rule.id || `a${Date.now()}`).trim();
    const sensor = String(rule.sensor || "pm25").trim();
    const condition = String(rule.condition || "above").trim();
    const delayType = String(rule.delayType || rule.delay_type || "immediate").trim();
    const deviceMac = String(rule.deviceMac ?? rule.device_mac ?? "").trim().toUpperCase();
    const value = Number(rule.value ?? rule.threshold_value ?? 0);
    const hours = Number.parseInt(rule.hours ?? 0, 10);
    const minutes = Number.parseInt(rule.minutes ?? 0, 10);

    if (!id) throw new Error("Alert rule id is required");
    if (!sensor) throw new Error("Alert sensor is required");
    if (!["above", "below"].includes(condition)) throw new Error("Alert condition must be above or below");
    if (Number.isNaN(value)) throw new Error("Alert threshold value must be a number");

    return {
        id,
        deviceMac,
        sensor,
        condition,
        value,
        delayType: ["immediate", "after"].includes(delayType) ? delayType : "immediate",
        hours: Number.isNaN(hours) ? 0 : Math.max(0, Math.min(24, hours)),
        minutes: Number.isNaN(minutes) ? 0 : Math.max(0, Math.min(59, minutes)),
        email: String(rule.email || "").trim(),
        emailOn: !!(rule.emailOn ?? rule.email_on),
        enabled: rule.enabled !== false
    };
}

const listAlertRules = async () => {
    const result = await pool.query(`
        SELECT *
        FROM alert_rules
        ORDER BY created_at ASC, id ASC
    `);

    return result.rows.map(rowToAlertRule);
};

const createAlertRule = async (rule) => {
    const normalized = normalizeAlertRule(rule);
    const result = await pool.query(`
        INSERT INTO alert_rules (
            id,
            device_mac,
            sensor,
            condition,
            threshold_value,
            delay_type,
            hours,
            minutes,
            email,
            email_on,
            enabled
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
            device_mac = EXCLUDED.device_mac,
            sensor = EXCLUDED.sensor,
            condition = EXCLUDED.condition,
            threshold_value = EXCLUDED.threshold_value,
            delay_type = EXCLUDED.delay_type,
            hours = EXCLUDED.hours,
            minutes = EXCLUDED.minutes,
            email = EXCLUDED.email,
            email_on = EXCLUDED.email_on,
            enabled = EXCLUDED.enabled,
            updated_at = NOW()
        RETURNING *
    `, [
        normalized.id,
        normalized.deviceMac || null,
        normalized.sensor,
        normalized.condition,
        normalized.value,
        normalized.delayType,
        normalized.hours,
        normalized.minutes,
        normalized.email,
        normalized.emailOn,
        normalized.enabled
    ]);

    return rowToAlertRule(result.rows[0]);
};

const updateAlertRule = async (id, changes = {}) => {
    const current = await pool.query("SELECT * FROM alert_rules WHERE id = $1", [id]);
    if (!current.rows[0]) return null;

    const existing = rowToAlertRule(current.rows[0]);
    const saved = await createAlertRule({ ...existing, ...changes, id });

    if (shouldResetRuntimeState(existing, saved)) {
        await resetAlertRuntimeState(id);
    }

    return saved;
};

const deleteAlertRule = async (id) => {
    const result = await pool.query("DELETE FROM alert_rules WHERE id = $1 RETURNING id", [id]);
    return result.rowCount > 0;
};

function shouldResetRuntimeState(before, after) {
    return before.sensor !== after.sensor ||
        before.condition !== after.condition ||
        Number(before.value) !== Number(after.value) ||
        normalizeMac(before.deviceMac) !== normalizeMac(after.deviceMac) ||
        before.delayType !== after.delayType ||
        Number(before.hours) !== Number(after.hours) ||
        Number(before.minutes) !== Number(after.minutes) ||
        before.enabled !== after.enabled;
}

async function resetAlertRuntimeState(ruleId) {
    await pool.query("DELETE FROM alert_rule_state WHERE rule_id = $1", [ruleId]);
    await pool.query(`
        UPDATE alert_events
        SET status = 'cleared',
            cleared_at = COALESCE(cleared_at, NOW()),
            last_seen_at = NOW()
        WHERE rule_id = $1
          AND status = 'active'
    `, [ruleId]);
}

function normalizeMac(value) {
    return String(value || "").trim().toUpperCase();
}

module.exports = {
    listAlertRules,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule
};
