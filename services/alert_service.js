const { Resend } = require("resend");
const pool = require("../controller/db_connection");
const { emitAlertEvent } = require("./socket_service");

const SENSOR_CONFIG = {
    aqi: { column: "aqi", label: "AQI", unit: "", warningAbove: 100, criticalAbove: 300 },
    pm25: { column: "pm2_5", label: "PM2.5", unit: "µg/m³", warningAbove: 60, criticalAbove: 250 },
    co2: { column: "co2_ppm", label: "CO₂", unit: "ppm", warningAbove: 800, criticalAbove: 1500 },
    co: { column: "co_ppm", label: "CO", unit: "ppm", warningAbove: 9, criticalAbove: 25 },
    o2: { column: "o2_pct", label: "O₂", unit: "%", warningBelow: 19.5, criticalBelow: 18, criticalAbove: 23 },
    temp: { column: "temperature", label: "Temperature", unit: "°C", warningBelow: 20, warningAbove: 26, criticalAbove: 35 },
    rh: { column: "humidity", label: "Humidity", unit: "%", warningBelow: 40, warningAbove: 60, criticalAbove: 80 }
};

let resendClient = null;

function normalizeDeviceMac(deviceMac) {
    return String(deviceMac || "").trim().toUpperCase();
}

function rowToRule(row) {
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

function rowToAlertEvent(row) {
    if (!row) return null;

    return {
        id: row.id,
        ruleId: row.rule_id,
        deviceMac: row.device_mac,
        deviceName: row.device_name || row.name || fallbackDeviceName(row.device_mac),
        room: row.room || "other",
        serialNumber: row.serial_number || "",
        sensor: row.sensor,
        sensorLabel: getSensorConfig(row.sensor).label,
        condition: row.condition,
        thresholdValue: numberOrNull(row.threshold_value),
        readingValue: numberOrNull(row.reading_value),
        unit: row.unit || getSensorConfig(row.sensor).unit,
        severity: row.status === "cleared" ? "cleared" : row.severity || "warning",
        status: row.status || "active",
        title: row.title || "",
        description: row.description || "",
        emailTo: row.email_to || "",
        emailSentAt: row.email_sent_at || null,
        emailError: row.email_error || "",
        resendId: row.resend_id || "",
        triggeredAt: row.triggered_at,
        lastSeenAt: row.last_seen_at,
        clearedAt: row.cleared_at || null,
        metadata: row.metadata || {}
    };
}

async function evaluateAlertRulesForReading(readingRow) {
    if (!readingRow?.device_mac) return [];

    await cleanupOldAlertEvents();

    const deviceMac = normalizeDeviceMac(readingRow.device_mac);
    const readingTime = readingRow.received_at || new Date();
    const rules = await listEnabledAlertRules(deviceMac);
    const device = await getDevice(deviceMac);
    const results = [];

    for (const rule of rules) {
        const result = await evaluateRuleForReading(rule, readingRow, device, readingTime);
        if (result) results.push(result);
    }

    return results;
}

async function listAlertEvents({ range = "24h", status = "all", limit = 100 } = {}) {
    await cleanupOldAlertEvents();

    const safeLimit = Math.max(1, Math.min(250, Number.parseInt(limit, 10) || 100));
    const rangeInterval = toRangeInterval(range);
    const values = [rangeInterval, safeLimit];
    const statusClause = status === "active" || status === "cleared"
        ? "AND ae.status = $3"
        : "";

    if (statusClause) values.push(status);

    const result = await pool.query(`
        SELECT
            ae.*,
            d.name,
            d.room AS device_room,
            d.serial_number AS device_serial_number
        FROM alert_events ae
        LEFT JOIN devices d ON UPPER(TRIM(d.device_mac)) = UPPER(TRIM(ae.device_mac))
        WHERE ae.triggered_at >= NOW() - $1::interval
        ${statusClause}
        ORDER BY ae.triggered_at DESC, ae.id DESC
        LIMIT $2
    `, values);

    return result.rows.map(row => rowToAlertEvent({
        ...row,
        device_name: row.device_name || row.name,
        room: row.room || row.device_room,
        serial_number: row.serial_number || row.device_serial_number
    }));
}

async function getAlertSummary() {
    await cleanupOldAlertEvents();

    const result = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE triggered_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
            COUNT(*) FILTER (WHERE triggered_at >= NOW() - INTERVAL '7 days')::int AS last_7d
        FROM alert_events
        WHERE triggered_at >= NOW() - INTERVAL '30 days'
    `);

    return {
        active: Number(result.rows[0]?.active || 0),
        last24h: Number(result.rows[0]?.last_24h || 0),
        last7d: Number(result.rows[0]?.last_7d || 0)
    };
}

async function cleanupOldAlertEvents() {
    await pool.query("DELETE FROM alert_events WHERE triggered_at < NOW() - INTERVAL '30 days'");
}

async function evaluateRuleForReading(rule, readingRow, device, readingTime) {
    const sensorConfig = getSensorConfig(rule.sensor);
    const readingValue = numberOrNull(readingRow[sensorConfig.column]);
    if (readingValue == null) return null;

    const deviceMac = normalizeDeviceMac(readingRow.device_mac);
    const thresholdCrossed = isThresholdCrossed(readingValue, rule);

    if (!thresholdCrossed) {
        return clearActiveAlert(rule, deviceMac, readingValue, readingTime);
    }

    const state = await upsertAlertState(rule, deviceMac, readingValue, readingTime);
    const delayMs = getRuleDelayMs(rule);
    const startedAt = new Date(state.condition_started_at).getTime();
    const currentAt = new Date(readingTime).getTime();
    if (delayMs > 0 && currentAt - startedAt < delayMs) {
        return null;
    }

    return triggerAlert(rule, readingRow, device, readingValue, readingTime);
}

async function triggerAlert(rule, readingRow, device, readingValue, readingTime) {
    const deviceMac = normalizeDeviceMac(readingRow.device_mac);
    await clearStaleActiveAlerts(rule, deviceMac, readingTime, readingValue);

    const current = await pool.query(`
        SELECT *
        FROM alert_events
        WHERE rule_id = $1
          AND device_mac = $2
          AND status = 'active'
          AND sensor = $3
          AND condition = $4
          AND threshold_value = $5
        ORDER BY triggered_at DESC
        LIMIT 1
    `, [rule.id, deviceMac, rule.sensor, rule.condition, rule.value]);

    const eventDraft = buildAlertEvent(rule, readingRow, device, readingValue, readingTime);

    if (current.rows[0]) {
        const shouldSendEmail = shouldSendEmailForActiveAlert(current.rows[0], eventDraft.emailTo);
        const updated = await pool.query(`
            UPDATE alert_events
            SET reading_value = $1,
                last_seen_at = $2,
                device_name = $4,
                room = $5,
                serial_number = $6,
                title = $7,
                description = $8,
                email_to = $9
            WHERE id = $3
            RETURNING *
        `, [
            readingValue,
            readingTime,
            current.rows[0].id,
            eventDraft.deviceName,
            eventDraft.room,
            eventDraft.serialNumber,
            eventDraft.title,
            eventDraft.description,
            eventDraft.emailTo || null
        ]);
        let event = rowToAlertEvent(updated.rows[0]);
        emitAlertEvent({ type: "updated", event });

        if (shouldSendEmail && event.emailTo) {
            event = await sendAndRecordAlertEmail(event);
            emitAlertEvent({ type: "updated", event });
        }

        return event;
    }

    const created = await pool.query(`
        INSERT INTO alert_events (
            rule_id,
            device_mac,
            device_name,
            room,
            serial_number,
            sensor,
            condition,
            threshold_value,
            reading_value,
            unit,
            severity,
            status,
            title,
            description,
            email_to,
            triggered_at,
            last_seen_at,
            metadata
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14,$15,$15,$16::jsonb)
        RETURNING *
    `, [
        rule.id,
        eventDraft.deviceMac,
        eventDraft.deviceName,
        eventDraft.room,
        eventDraft.serialNumber,
        rule.sensor,
        rule.condition,
        rule.value,
        readingValue,
        eventDraft.unit,
        eventDraft.severity,
        eventDraft.title,
        eventDraft.description,
        eventDraft.emailTo || null,
        readingTime,
        JSON.stringify({ mqttPayloadId: readingRow.id || null })
    ]);

    let event = rowToAlertEvent(created.rows[0]);
    emitAlertEvent({ type: "triggered", event });

    if (event.emailTo) {
        event = await sendAndRecordAlertEmail(event);
        emitAlertEvent({ type: "updated", event });
    }

    return event;
}

async function clearStaleActiveAlerts(rule, deviceMac, readingTime, readingValue) {
    const result = await pool.query(`
        UPDATE alert_events
        SET status = 'cleared',
            cleared_at = COALESCE(cleared_at, $6),
            last_seen_at = $6,
            reading_value = $7
        WHERE rule_id = $1
          AND device_mac = $2
          AND status = 'active'
          AND NOT (
              sensor = $3
              AND condition = $4
              AND threshold_value = $5
          )
        RETURNING *
    `, [rule.id, deviceMac, rule.sensor, rule.condition, rule.value, readingTime, readingValue]);

    for (const row of result.rows) {
        emitAlertEvent({ type: "cleared", event: rowToAlertEvent(row) });
    }
}

function shouldSendEmailForActiveAlert(currentRow, nextEmailTo) {
    const nextEmail = String(nextEmailTo || "").trim().toLowerCase();
    if (!nextEmail) return false;
    if (currentRow.email_sent_at) return false;

    const currentEmail = String(currentRow.email_to || "").trim().toLowerCase();
    return currentEmail !== nextEmail || !currentRow.email_error;
}

async function clearActiveAlert(rule, deviceMac, readingValue, readingTime) {
    await pool.query(
        "DELETE FROM alert_rule_state WHERE rule_id = $1 AND device_mac = $2",
        [rule.id, deviceMac]
    );

    const result = await pool.query(`
        UPDATE alert_events
        SET status = 'cleared',
            cleared_at = COALESCE(cleared_at, $3),
            last_seen_at = $3,
            reading_value = $4
        WHERE rule_id = $1
          AND device_mac = $2
          AND status = 'active'
        RETURNING *
    `, [rule.id, deviceMac, readingTime, readingValue]);

    if (!result.rows[0]) return null;

    const event = rowToAlertEvent(result.rows[0]);
    emitAlertEvent({ type: "cleared", event });
    return event;
}

async function sendAndRecordAlertEmail(event) {
    const updateEmail = async ({ sentAt = null, resendId = null, error = null }) => {
        const result = await pool.query(`
            UPDATE alert_events
            SET email_sent_at = $1,
                resend_id = $2,
                email_error = $3
            WHERE id = $4
            RETURNING *
        `, [sentAt, resendId, error, event.id]);

        return rowToAlertEvent(result.rows[0]);
    };

    try {
        const emailResult = await sendAlertEmail(event);
        if (emailResult.skipped) {
            return updateEmail({ error: emailResult.reason });
        }
        return updateEmail({
            sentAt: new Date(),
            resendId: emailResult.id || null,
            error: null
        });
    } catch (err) {
        console.error("Error sending alert email:", err);
        return updateEmail({ error: err.message || "Email failed" });
    }
}

async function sendAlertEmail(event) {
    const to = String(event.emailTo || "").trim();
    if (!to) return { skipped: true, reason: "No alert email recipient configured" };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { skipped: true, reason: "RESEND_API_KEY is not configured" };

    const from = process.env.ALERT_EMAIL_FROM || "AERVA Alerts <onboarding@resend.dev>";
    const replyTo = process.env.ALERT_EMAIL_REPLY_TO || undefined;
    if (!resendClient) resendClient = new Resend(apiKey);

    const { data, error } = await resendClient.emails.send({
        from,
        to: [to],
        replyTo,
        subject: event.title,
        html: renderAlertEmailHtml(event),
        text: renderAlertEmailText(event)
    });

    if (error) {
        throw new Error(formatEmailProviderError(error));
    }

    return { id: data?.id || null };
}

function formatEmailProviderError(error) {
    const message = error?.message || "Resend email failed";
    if (/verify a domain|testing emails|own email address/i.test(message)) {
        return [
            message,
            "Resend is rejecting this recipient because the account/domain is still in test mode.",
            "Use your verified Resend account email for testing, or verify a domain and set ALERT_EMAIL_FROM to that domain."
        ].join(" ");
    }
    return message;
}

async function listEnabledAlertRules(deviceMac) {
    const result = await pool.query(`
        SELECT *
        FROM alert_rules
        WHERE enabled = true
          AND (
              device_mac IS NULL
              OR TRIM(device_mac) = ''
              OR UPPER(TRIM(device_mac)) = $1
          )
        ORDER BY created_at ASC, id ASC
    `, [normalizeDeviceMac(deviceMac)]);

    return result.rows.map(rowToRule);
}

async function getDevice(deviceMac) {
    const result = await pool.query(`
        SELECT device_mac, name, room, serial_number
        FROM devices
        WHERE UPPER(TRIM(device_mac)) = $1
        LIMIT 1
    `, [normalizeDeviceMac(deviceMac)]);

    return result.rows[0] || {};
}

async function upsertAlertState(rule, deviceMac, readingValue, readingTime) {
    const result = await pool.query(`
        INSERT INTO alert_rule_state (
            rule_id,
            device_mac,
            condition_started_at,
            last_seen_at,
            last_value
        )
        VALUES ($1,$2,$3,$3,$4)
        ON CONFLICT (rule_id, device_mac) DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at,
            last_value = EXCLUDED.last_value
        RETURNING *
    `, [rule.id, deviceMac, readingTime, readingValue]);

    return result.rows[0];
}

function buildAlertEvent(rule, readingRow, device, readingValue) {
    const sensorConfig = getSensorConfig(rule.sensor);
    const deviceMac = normalizeDeviceMac(readingRow.device_mac);
    const deviceName = device.name || fallbackDeviceName(deviceMac);
    const serialNumber = device.serial_number || "";
    const unit = sensorConfig.unit;
    const severity = getSeverity(rule.sensor, readingValue);
    const valueLabel = formatReading(readingValue, unit);
    const thresholdLabel = formatReading(rule.value, unit);
    const comparator = rule.condition === "above" ? "above" : "below";
    const title = `${sensorConfig.label} ${comparator} ${thresholdLabel} in ${deviceName}`;
    const description = `${sensorConfig.label} reading is ${valueLabel}, ${comparator} the configured ${thresholdLabel} threshold.`;

    return {
        deviceMac,
        deviceName,
        room: device.room || "other",
        serialNumber,
        unit,
        severity,
        title,
        description,
        emailTo: rule.emailOn ? rule.email : ""
    };
}

function isThresholdCrossed(value, rule) {
    if (rule.condition === "below") return value < rule.value;
    return value > rule.value;
}

function getRuleDelayMs(rule) {
    if (rule.delayType !== "after") return 0;
    const hours = Number.parseInt(rule.hours || 0, 10) || 0;
    const minutes = Number.parseInt(rule.minutes || 0, 10) || 0;
    return ((hours * 60) + minutes) * 60 * 1000;
}

function getSeverity(sensor, value) {
    const config = getSensorConfig(sensor);
    if (config.criticalAbove != null && value > config.criticalAbove) return "critical";
    if (config.criticalBelow != null && value < config.criticalBelow) return "critical";
    return "warning";
}

function getSensorConfig(sensor) {
    return SENSOR_CONFIG[sensor] || SENSOR_CONFIG.pm25;
}

function fallbackDeviceName(deviceMac) {
    const mac = normalizeDeviceMac(deviceMac);
    return mac ? `Device ${mac.slice(-4)}` : "AERVA Device";
}

function numberOrNull(value) {
    if (value == null) return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
}

function formatReading(value, unit = "") {
    const numeric = Number(value);
    const display = Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
    return `${display}${unit ? ` ${unit}` : ""}`;
}

function toRangeInterval(range) {
    if (range === "7d") return "7 days";
    if (range === "30d") return "30 days";
    return "24 hours";
}

function renderAlertEmailText(event) {
    return [
        event.title,
        "",
        event.description,
        `Device: ${event.deviceName}${event.serialNumber ? ` (${event.serialNumber})` : ""}`,
        `Current value: ${formatReading(event.readingValue, event.unit)}`,
        `Threshold: ${event.condition} ${formatReading(event.thresholdValue, event.unit)}`,
        `Triggered at: ${new Date(event.triggeredAt).toLocaleString("en-IN")}`
    ].join("\n");
}

function renderAlertEmailHtml(event) {
    return `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#0A1828;max-width:560px">
            <p style="margin:0 0 8px;color:#6F7F95;font-size:12px;letter-spacing:1px;text-transform:uppercase">AERVA Alert</p>
            <h1 style="margin:0 0 14px;font-size:24px;color:#0A2E50">${escapeHtml(event.title)}</h1>
            <p style="margin:0 0 18px">${escapeHtml(event.description)}</p>
            <div style="border:1px solid #E2E8F0;border-radius:8px;padding:14px;background:#F8FAFC">
                <p style="margin:0 0 6px"><strong>Device:</strong> ${escapeHtml(event.deviceName)}${event.serialNumber ? ` · ${escapeHtml(event.serialNumber)}` : ""}</p>
                <p style="margin:0 0 6px"><strong>Current value:</strong> ${escapeHtml(formatReading(event.readingValue, event.unit))}</p>
                <p style="margin:0 0 6px"><strong>Threshold:</strong> ${escapeHtml(event.condition)} ${escapeHtml(formatReading(event.thresholdValue, event.unit))}</p>
                <p style="margin:0"><strong>Triggered:</strong> ${escapeHtml(new Date(event.triggeredAt).toLocaleString("en-IN"))}</p>
            </div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

module.exports = {
    evaluateAlertRulesForReading,
    listAlertEvents,
    getAlertSummary
};
