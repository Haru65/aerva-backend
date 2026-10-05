const pool = require("../controller/db_connection");


const allowedMetrics = {
    temperature: {
        column: "temperature",
        label: "Temperature",
        unit: "°C"
    },
    humidity: {
        column: "humidity",
        label: "Humidity",
        unit: "%"
    },
    co_ppm: {
        column: "co_ppm",
        label: "Carbon Monoxide",
        unit: "ppm"
    },
    o2_pct: {
        column: "o2_pct",
        label: "Oxygen",
        unit: "%"
    },
    co2_ppm: {
        column: "co2_ppm",
        label: "Carbon Dioxide",
        unit: "ppm"
    },
    pm1_0: {
        column: "pm1_0",
        label: "PM1.0",
        unit: "µg/m³"
    },
    pm2_5: {
        column: "pm2_5",
        label: "PM2.5",
        unit: "µg/m³"
    },
    pm10: {
        column: "pm10",
        label: "PM10",
        unit: "µg/m³"
    },
    rssi: {
        column: "rssi",
        label: "RSSI",
        unit: ""
    },
    aqi: {
        column: "aqi",
        label: "Air Quality Index",
        unit: ""
    }
};

const rangeToInterval = {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
    "60d": "60 days",
    "90d": "90 days",
    "180d": "180 days",
    "1y": "1 year"
};

const reportData = async (deviceMac, period, tenantId = null) => {
    if (!tenantId) return [];

    try{
        const selection = typeof period === "string" ? { range: period } : (period || {});
        const interval = rangeToInterval[selection.range];
        const hasCustomDates = isISODate(selection.from) && isISODate(selection.to);
        if (!interval && !hasCustomDates) throw new Error("A valid report range or date interval is required");
        if (hasCustomDates && selection.from > selection.to) throw new Error("Report start date must not be after end date");

        const reportRowsQuery = `WITH report_rows AS (
                SELECT
                    *,
                    CASE
                        WHEN device_time ~ '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{2}:\\d{2}(:\\d{2})?)?$'
                        THEN device_time::timestamp
                        ELSE NULL
                    END AS report_device_time
                FROM mqtt_payload mp
                INNER JOIN devices d ON UPPER(TRIM(d.device_mac)) = UPPER(TRIM(mp.device_mac))
                WHERE UPPER(TRIM(mp.device_mac)) = UPPER(TRIM($1))
                  AND d.tenant_id = $3
            )
            SELECT * FROM report_rows`;

        const result = hasCustomDates
            ? await pool.query(
                `${reportRowsQuery}
                WHERE report_device_time >= $2::date
                  AND report_device_time < ($4::date + INTERVAL '1 day')
                ORDER BY report_device_time DESC`,
                [deviceMac, selection.from, tenantId, selection.to]
            )
            : await pool.query(
                `${reportRowsQuery}
                WHERE report_device_time >= (NOW() - $2::interval)::timestamp
                ORDER BY report_device_time DESC`,
                [deviceMac, interval, tenantId]
            );
         
        return (result.rows.map(row => ({
           
            id: row.id,
            device_mac: row.device_mac,
            timestamp: row.timestamp,
            device_time: row.device_time,
            received_at: row.received_at,
            
            readings: {
                temperature: Number(row.temperature),
                humidity: Number(row.humidity),
                co_ppm: Number(row.co_ppm),
                o2_pct: Number(row.o2_pct),
                co2_ppm: Number(row.co2_ppm),
                pm1_0: Number(row.pm1_0),
                pm2_5: Number(row.pm2_5),
                pm10: Number(row.pm10),
                aqi: Number(row.aqi),
                rssi: Number(row.rssi)
            }
        })));
        console.log("Data retrieved for Excel export:", result.rows.length, "rows");
    }catch(err){
        console.error("Error exporting data to Excel:", err);
        throw err;
    }   
}

function isISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = { reportData, _test: { isISODate } };
