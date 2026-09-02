const {client} = require ("pg");

const pool = require("../controller/db_connection");



//database schema function 

async function createSchema() {
    const payloadTableQuery = `
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
        aqi NUMERIC,

        rssi NUMERIC,
        o2_warn BOOLEAN,
        uptime NUMERIC,
        mqtt_err NUMERIC,

        raw_payload JSONB NOT NULL,

        received_at TIMESTAMP DEFAULT NOW())`
    await pool.query(payloadTableQuery);

    const devicesTableQuery = `
    CREATE TABLE IF NOT EXISTS devices (
        device_mac VARCHAR(60) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        room VARCHAR(40) DEFAULT 'other',
        serial_number VARCHAR(60),
        spark JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(devicesTableQuery);

    const alertRulesTableQuery = `
    CREATE TABLE IF NOT EXISTS alert_rules (
        id VARCHAR(80) PRIMARY KEY,
        sensor VARCHAR(40) NOT NULL,
        condition VARCHAR(20) NOT NULL,
        threshold_value NUMERIC NOT NULL,
        delay_type VARCHAR(20) DEFAULT 'immediate',
        hours INTEGER DEFAULT 0,
        minutes INTEGER DEFAULT 0,
        device_mac VARCHAR(60),
        email VARCHAR(255),
        email_on BOOLEAN DEFAULT false,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(alertRulesTableQuery);

    await pool.query(`
        ALTER TABLE alert_rules
        ADD COLUMN IF NOT EXISTS device_mac VARCHAR(60)
    `);

    const alertEventsTableQuery = `
    CREATE TABLE IF NOT EXISTS alert_events (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(80) REFERENCES alert_rules(id) ON DELETE SET NULL,
        device_mac VARCHAR(60),
        device_name VARCHAR(120),
        room VARCHAR(40),
        serial_number VARCHAR(60),
        sensor VARCHAR(40) NOT NULL,
        condition VARCHAR(20) NOT NULL,
        threshold_value NUMERIC NOT NULL,
        reading_value NUMERIC NOT NULL,
        unit VARCHAR(30),
        severity VARCHAR(20) DEFAULT 'warning',
        status VARCHAR(20) DEFAULT 'active',
        title TEXT,
        description TEXT,
        email_to VARCHAR(255),
        email_sent_at TIMESTAMP,
        email_error TEXT,
        resend_id VARCHAR(120),
        triggered_at TIMESTAMP DEFAULT NOW(),
        last_seen_at TIMESTAMP DEFAULT NOW(),
        cleared_at TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb
    )`;
    await pool.query(alertEventsTableQuery);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alert_events_feed
        ON alert_events (triggered_at DESC, id DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alert_events_active
        ON alert_events (rule_id, device_mac, status)
    `);

    const alertRuleStateTableQuery = `
    CREATE TABLE IF NOT EXISTS alert_rule_state (
        rule_id VARCHAR(80) NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
        device_mac VARCHAR(60) NOT NULL,
        condition_started_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP NOT NULL,
        last_value NUMERIC,
        PRIMARY KEY (rule_id, device_mac)
    )`;
    await pool.query(alertRuleStateTableQuery);

    await pool.query(`
        INSERT INTO alert_rules (
            id,
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
        VALUES
            ('a1', 'pm25', 'above', 75, 'immediate', 0, 0, '', false, true),
            ('a2', 'co2', 'above', 1000, 'after', 0, 15, 'ashish@zeptac.com', true, true),
            ('a3', 'temp', 'above', 32, 'immediate', 0, 0, '', false, false)
        ON CONFLICT (id) DO NOTHING
    `);

    await pool.query(`
        INSERT INTO devices (device_mac, name, room, serial_number, spark)
        SELECT *
        FROM (VALUES
            ('8857217641FC', 'Master Bedroom', 'bedroom', 'H488', '[10,9,11,8,10,9,11,10]'::jsonb),
            ('489D31D02758', 'Kitchen', 'kitchen', 'H491', '[8,10,12,14,16,18,17,19]'::jsonb),
            ('EC64C96EDA3C', 'Living Room', 'living', 'H487', '[12,14,11,15,13,16,12,14]'::jsonb)
        ) AS defaults(device_mac, name, room, serial_number, spark)
        WHERE NOT EXISTS (SELECT 1 FROM devices)
        ON CONFLICT (device_mac) DO NOTHING
    `);

    await pool.query(`
        INSERT INTO devices (device_mac, name, room)
        SELECT DISTINCT
            device_mac,
            'Device ' || RIGHT(device_mac, 4),
            'other'
        FROM mqtt_payload
        WHERE device_mac IS NOT NULL AND TRIM(device_mac) <> ''
        ON CONFLICT (device_mac) DO NOTHING
    `);

    console.log("Tables created successfully");
    
}

module.exports = createSchema;
