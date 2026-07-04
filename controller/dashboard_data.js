const pool = require("../controller/db_connection");


const retrivelLatestData = async () => {
    try{
    const result = await pool.query("SELECT * FROM mqtt_payload ORDER BY id DESC LIMIT 1")
    
    const row = result.rows[0];
    if( !row) {
            console.error("Error retrieving latest data:", err);
            throw err;
        };
    return {
                id: row.id,
            device_mac: row.device_mac,
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
                rssi: Number(row.rssi)
            },

            status: {
                o2_warn: row.o2_warn,
                time_status: row.time_status,
                mqtt_err: Number(row.mqtt_err)
            }
    };
}catch (err) {
        console.error("Error retrieving latest data:", err);
        throw err;
    }}

const allowedMetrics = {
    temperature: "temperature",
    humidity: "humidity",
    co_ppm: "co_ppm",
    o2_pct: "o2_pct",
    co2_ppm: "co2_ppm",
    pm1_0: "pm1_0",
    pm2_5: "pm2_5",
    pm10: "pm10",
    rssi: "rssi"
};

const rangeToInterval = {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days"
};
const graphDataRetrieval = async ({ deviceMac, metric, range }) => {
    try{
        const columnName = allowedMetrics[metric];
        if (!columnName) {
            throw new Error(`Invalid metric: ${metric}`);
        }
        
        const interval = rangeToInterval[range];
        if (!interval) {
            throw new Error(`Invalid range: ${range}`);
        }

        const result = await pool.query(
            `SELECT 
                received_at AS time,
                ${columnName} AS value
            FROM mqtt_payload
            WHERE device_mac = $1 AND received_at >= NOW() - $2::interval
            ORDER BY received_at ASC
            `,
            [deviceMac, interval]
        )
        return {
            device_mac: deviceMac,
            metric,
            range,
            points: result.rows.map(row => ({
                time: row.time,
                value: row.value === null ? null : Number(row.value)
            }))
        };
    }catch (err) {
        console.error("Error retrieving graph data:", err);
        throw err;
    }
}
module.exports = { retrivelLatestData, graphDataRetrieval };