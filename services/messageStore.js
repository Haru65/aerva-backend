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

    // Handle two payload formats:
    // 1. AGM format: { MAC, TIME_STATUS, TIME, env:{temp,hum}, gas:{...}, pm:{...}, diag:{...} }
    // 2. New flat format: { device_mac, readings:{...}, status:{...}, received_at }
    
    const isNewFormat = message.device_mac || (message.readings && typeof message.readings === "object");
    
    let deviceMac, timeStatus, deviceTime, temperature, humidity, co_ppm, o2_pct, co2_ppm, pm1_0, pm2_5, pm10, aqi, rssi, o2_warn, uptime, mqtt_err;

    if (isNewFormat) {
        // New flat format
        deviceMac = message.device_mac;
        timeStatus = message.status?.time_status || null;
        deviceTime = message.received_at || new Date().toISOString();
        
        const readings = message.readings || {};
        temperature = readings.temperature;
        humidity = readings.humidity;
        co_ppm = readings.co_ppm;
        o2_pct = readings.o2_pct;
        co2_ppm = readings.co2_ppm;
        pm1_0 = readings.pm1_0;
        pm2_5 = readings.pm2_5;
        pm10 = readings.pm10;
        rssi = readings.rssi;
        
        const status = message.status || {};
        o2_warn = status.o2_warn;
        uptime = null;
        mqtt_err = status.mqtt_err;
        
        // Use provided AQI or calculate from PM2.5
        aqi = message.readings?.aqi || calculateAqiFromPm25(pm2_5);
    } else {
        // AGM format (legacy)
        deviceMac = message.MAC;
        timeStatus = message.TIME_STATUS;
        deviceTime = message.TIME;
        temperature = message.env?.temp;
        humidity = message.env?.hum;
        co_ppm = message.gas?.co_ppm;
        o2_pct = message.gas?.o2_pct;
        co2_ppm = message.gas?.co2_ppm;
        pm1_0 = message.pm?.pm1_0;
        pm2_5 = message.pm?.pm2_5;
        pm10 = message.pm?.pm10;
        rssi = message.diag?.rssi;
        o2_warn = message.diag?.o2_warn;
        uptime = message.diag?.uptime;
        mqtt_err = message.diag?.mqtt_err;
        
        // Calculate AQI if not provided by device
        aqi = message.pm?.aqi;
        if (aqi == null) {
            aqi = calculateAqiFromPm25(pm2_5);
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
        deviceMac,
        timeStatus,
        deviceTime,
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
        message,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

module.exports = savePayload ;
