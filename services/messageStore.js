const pool = require("../controller/db_connection");

// Calculate AQI from PM2.5 using CPCB (India) breakpoints
function calculateAqiFromPm25(pm25) {
    if (pm25 == null || isNaN(pm25)) return null;
    
    const c = Math.max(0, pm25);
    const breakpoints = [
        { cLow: 0,    cHigh: 30,   iLow: 0,   iHigh: 50 },
        { cLow: 31,   cHigh: 60,   iLow: 51,  iHigh: 100 },
        { cLow: 61,   cHigh: 90,   iLow: 101, iHigh: 200 },
        { cLow: 91,   cHigh: 120,  iLow: 201, iHigh: 300 },
        { cLow: 121,  cHigh: 250,  iLow: 301, iHigh: 400 },
        { cLow: 251,  cHigh: 500,  iLow: 401, iHigh: 500 }
    ];
    
    const bp = breakpoints.find(b => c >= b.cLow && c <= b.cHigh) || breakpoints[breakpoints.length - 1];
    const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow;
    return Math.round(aqi);
}

const savePayload = async (payload) => {
    let message = payload.message && typeof payload.message === "object"
        ? payload.message
        : payload;

    if (message.message && typeof message.message === "object") {
        message = message.message;
    }

    // Calculate AQI if not provided by device
    let aqi = message.pm?.aqi;
    if (aqi == null) {
        const pm25 = message.pm?.pm2_5;
        if (pm25 != null) {
            aqi = calculateAqiFromPm25(pm25);
        }
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
            aqi,
            rssi,
            o2_warn,
            uptime,
            mqtt_err,
            raw_payload
    ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
        aqi,
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
