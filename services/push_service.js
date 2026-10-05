const webpush = require("web-push");
const pool = require("../controller/db_connection");

function getVapidConfig() {
    const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
    const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
    const subject = String(process.env.VAPID_SUBJECT || "mailto:alerts@aerva.app").trim();

    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey, subject };
}

function getVapidPublicKey() {
    return getVapidConfig()?.publicKey || "";
}

function normalizeSubscription(input) {
    const subscription = input?.subscription || input;
    const endpoint = String(subscription?.endpoint || "").trim();
    const p256dh = String(subscription?.keys?.p256dh || "").trim();
    const auth = String(subscription?.keys?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
        throw new Error("A valid push subscription is required");
    }

    let endpointUrl;
    try {
        endpointUrl = new URL(endpoint);
    } catch {
        throw new Error("Push subscription endpoint is invalid");
    }
    if (endpointUrl.protocol !== "https:") {
        throw new Error("Push subscription endpoint must use HTTPS");
    }

    return {
        endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: { p256dh, auth }
    };
}

async function savePushSubscription({ tenantId, userId, subscription, userAgent = "" }) {
    const normalized = normalizeSubscription(subscription);
    await pool.query(`
        INSERT INTO push_subscriptions (
            endpoint,
            tenant_id,
            user_id,
            subscription,
            user_agent
        )
        VALUES ($1,$2,$3,$4::jsonb,$5)
        ON CONFLICT (endpoint) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            user_id = EXCLUDED.user_id,
            subscription = EXCLUDED.subscription,
            user_agent = EXCLUDED.user_agent,
            updated_at = NOW()
    `, [
        normalized.endpoint,
        tenantId,
        userId || null,
        JSON.stringify(normalized),
        String(userAgent || "").slice(0, 1000) || null
    ]);
    return normalized;
}

async function deletePushSubscription({ tenantId, userId, endpoint }) {
    const normalizedEndpoint = String(endpoint || "").trim();
    if (!normalizedEndpoint) throw new Error("Push subscription endpoint is required");

    const result = await pool.query(`
        DELETE FROM push_subscriptions
        WHERE endpoint = $1
          AND tenant_id = $2
          AND (user_id = $3 OR user_id IS NULL)
    `, [normalizedEndpoint, tenantId, userId || null]);
    return result.rowCount > 0;
}

async function tenantAllowsPush(tenantId) {
    const result = await pool.query(`
        SELECT preferences->>'pushNotifications' AS enabled
        FROM tenant_settings
        WHERE tenant_id = $1
    `, [tenantId]);
    return result.rows[0]?.enabled !== "false";
}

async function sendPushForAlert(event, tenantId) {
    const vapid = getVapidConfig();
    if (!vapid) return { sent: 0, skipped: "VAPID keys are not configured" };
    if (!tenantId || !(await tenantAllowsPush(tenantId))) {
        return { sent: 0, skipped: "Push notifications are disabled" };
    }

    const result = await pool.query(`
        SELECT endpoint, subscription
        FROM push_subscriptions
        WHERE tenant_id = $1
    `, [tenantId]);
    if (result.rows.length === 0) return { sent: 0 };

    const payload = JSON.stringify({
        title: event.title || "AERVA air quality alert",
        body: event.description || "An air-quality threshold was crossed.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `aerva-alert-${event.id || event.ruleId || "new"}`,
        data: {
            url: `/alerts${event.id ? `?event=${encodeURIComponent(event.id)}` : ""}`,
            eventId: event.id || null,
            severity: event.severity || "warning"
        }
    });

    const expiredEndpoints = [];
    let sent = 0;
    await Promise.all(result.rows.map(async row => {
        try {
            await webpush.sendNotification(row.subscription, payload, {
                TTL: 60 * 60,
                urgency: event.severity === "critical" ? "high" : "normal",
                vapidDetails: {
                    subject: vapid.subject,
                    publicKey: vapid.publicKey,
                    privateKey: vapid.privateKey
                }
            });
            sent += 1;
        } catch (err) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
                expiredEndpoints.push(row.endpoint);
                return;
            }
            console.error("Error sending Web Push notification:", err?.message || err);
        }
    }));

    if (expiredEndpoints.length > 0) {
        await pool.query(
            "DELETE FROM push_subscriptions WHERE tenant_id = $1 AND endpoint = ANY($2::text[])",
            [tenantId, expiredEndpoints]
        );
    }

    return { sent, removed: expiredEndpoints.length };
}

module.exports = {
    getVapidPublicKey,
    savePushSubscription,
    deletePushSubscription,
    sendPushForAlert,
    _test: { normalizeSubscription }
};
