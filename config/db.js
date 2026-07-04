const {client} = require ("pg");

const pool = require("../controller/db_connection");



//database schema function 

async function createSchema() {
    const query = `
    CREATE TABLE IF NOT EXISTS mqtt_payload (
        id SERIAL PRIMARY KEY,
        device_mac VARCHAR(60) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        time_status VARCHAR(10),
        device_time VARCHAR(20),
        
        temperature NUMERIC,
        humidity NUMERIC,

        co_ppm NUMERIC,
        o2_pct NUMERIC,
        co2_ppm NUMERIC,

        pm1_0 NUMERIC,
        pm2_5 NUMERIC,
        pm10 NUMERIC,

        rssi NUMERIC,
        o2_warn BOOLEAN,
        uptime NUMERIC,
        mqtt_err NUMERIC,

        raw_payload JSONB NOT NULL,

        received_at TIMESTAMP DEFAULT NOW())`
    await pool.query(query);
    console.log("Table created successfully");
    
}

module.exports = createSchema;
