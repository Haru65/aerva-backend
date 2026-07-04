const pool = require("../controller/db_connection");

const savePayload = async (payload) => {
    let message = payload.message && typeof payload.message === "object"
        ? payload.message
        : payload;

    if (message.message && typeof message.message === "object") {
        message = message.message;
    }

    const query = `
    INSERT INTO mqtt_payload (
            device_mac,
            time_status,
            device_time,
            temperature,
            humidity,
            co_ppm,
            o2_pct,
            co2_ppm,
            pm1_0,
            pm2_5,
            pm10,
            rssi,
            o2_warn,
            uptime,
            mqtt_err,
            raw_payload
    ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *;`;

    const values = [
        message.MAC,
        message.TIME_STATUS,
        message.TIME,
        message.env?.temp,
        message.env?.hum,
        message.gas?.co_ppm,
        message.gas?.o2_pct,
        message.gas?.co2_ppm,
        message.pm?.pm1_0,
        message.pm?.pm2_5,
        message.pm?.pm10,
        message.diag?.rssi,
        message.diag?.o2_warn,
        message.diag?.uptime,
        message.diag?.mqtt_err,
        message,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

module.exports = savePayload ;
