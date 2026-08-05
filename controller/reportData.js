const e = require("express");
const pool = require("../controller/db_connection");
const excelJS = require("exceljs");


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
    "30d": "30 days"
};

const reportData = async (deviceMac,range) => {
    try{
        const interval = rangeToInterval[range];
        if (!interval) {
            throw new Error(`Invalid range: ${range}`);
        }

        const result = await pool.query(
            `SELECT * FROM mqtt_payload
            WHERE device_mac = $1 AND received_at >= NOW() - $2::interval
            ORDER BY received_at DESC`,
            [deviceMac, interval]
        );
         
        return (result.rows.map(row => ({
           
            id: row.id,
            device_mac: row.device_mac,
            timestamp: row.timestamp,
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

module.exports = { reportData };