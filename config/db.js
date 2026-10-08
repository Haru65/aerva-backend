const {client} = require ("pg");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const pool = require("../controller/db_connection");



//database schema function 

async function createSchema() {
    const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(80) UNIQUE NOT NULL,
        name VARCHAR(120),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(120) UNIQUE NOT NULL,
        workspace VARCHAR(120),
        role VARCHAR(40) DEFAULT 'owner',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(createUserTableQuery);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(120)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(120)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace VARCHAR(120)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(40) DEFAULT 'owner'`);
    await pool.query(`
        UPDATE users
        SET
            tenant_id = COALESCE(tenant_id, 'tenant_legacy_' || id),
            name = COALESCE(name, username),
            workspace = COALESCE(workspace, COALESCE(name, username) || '''s Home'),
            role = COALESCE(role, 'owner')
        WHERE tenant_id IS NULL OR workspace IS NULL OR role IS NULL
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id)`);
    await ensureSuperAdminUser();

    const tenantSettingsTableQuery = `
    CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id VARCHAR(120) PRIMARY KEY,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(tenantSettingsTableQuery);

    const pushSubscriptionsTableQuery = `
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        tenant_id VARCHAR(120) NOT NULL,
        user_id VARCHAR(120),
        subscription JSONB NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await pool.query(pushSubscriptionsTableQuery);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant
        ON push_subscriptions (tenant_id)
    `);

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
        tenant_id VARCHAR(120),
        name VARCHAR(120) NOT NULL,
        room VARCHAR(40) DEFAULT 'other',
        serial_number VARCHAR(60),
        spark JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(devicesTableQuery);

    await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(120)`);
    await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`
        WITH ranked_pins AS (
            SELECT
                device_mac,
                ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY device_mac) AS pin_rank
            FROM devices
            WHERE is_pinned = TRUE
        )
        UPDATE devices AS device
        SET is_pinned = FALSE
        FROM ranked_pins
        WHERE device.device_mac = ranked_pins.device_mac
          AND ranked_pins.pin_rank > 1
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices (tenant_id)`);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_one_pinned_per_tenant
        ON devices (tenant_id)
        WHERE is_pinned = TRUE
    `);

    const deviceRegistryTableQuery = `
    CREATE TABLE IF NOT EXISTS device_registry (
        device_mac VARCHAR(60) PRIMARY KEY,
        serial_number VARCHAR(80),
        model VARCHAR(80),
        batch VARCHAR(80),
        status VARCHAR(30) DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`;
    await pool.query(deviceRegistryTableQuery);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_device_registry_status ON device_registry (status)`);

    await pool.query(`
        INSERT INTO device_registry (device_mac, serial_number, model, batch, status)
        VALUES
            ('8857217641FC', 'H488', 'AERVA Home', 'dev-seed', 'active'),
            ('489D31D02758', 'H491', 'AERVA Home', 'dev-seed', 'active'),
            ('EC64C96EDA3C', 'H487', 'AERVA Home', 'dev-seed', 'active')
        ON CONFLICT (device_mac) DO NOTHING
    `);

    const alertRulesTableQuery = `
    CREATE TABLE IF NOT EXISTS alert_rules (
        id VARCHAR(80) PRIMARY KEY,
        tenant_id VARCHAR(120),
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
    await pool.query(`ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(120)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_id ON alert_rules (tenant_id)`);

    const alertEventsTableQuery = `
    CREATE TABLE IF NOT EXISTS alert_events (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(80) REFERENCES alert_rules(id) ON DELETE SET NULL,
        tenant_id VARCHAR(120),
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
    await pool.query(`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(120)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_events_tenant_id ON alert_events (tenant_id)`);

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
        tenant_id VARCHAR(120),
        device_mac VARCHAR(60) NOT NULL,
        condition_started_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP NOT NULL,
        last_value NUMERIC,
        PRIMARY KEY (rule_id, device_mac)
    )`;
    await pool.query(alertRuleStateTableQuery);
    await pool.query(`ALTER TABLE alert_rule_state ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(120)`);

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

    const createOTPTableQuery = `
    CREATE TABLE IF NOT EXISTS otp_codes (
        id BIGSERIAL PRIMARY KEY,
        otp_request_id UUID UNIQUE NOT NULL,
        subject_id VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL,
        purpose VARCHAR(40) NOT NULL,
        otp_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
        consumed_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        verification_token_hash CHAR(64),
        verification_token_expires_at TIMESTAMPTZ,
        verification_consumed_at TIMESTAMPTZ,
        delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await pool.query(createOTPTableQuery);
    await pool.query(`
        ALTER TABLE otp_codes
        ADD COLUMN IF NOT EXISTS otp_request_id UUID,
        ADD COLUMN IF NOT EXISTS subject_id VARCHAR(120),
        ADD COLUMN IF NOT EXISTS email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(40),
        ADD COLUMN IF NOT EXISTS otp_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_attempts SMALLINT NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verification_token_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verification_consumed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
    await pool.query(`
        DELETE FROM otp_codes
        WHERE otp_request_id IS NULL
           OR subject_id IS NULL
           OR email IS NULL
           OR purpose IS NULL
           OR otp_hash IS NULL
    `);
    await pool.query(`
        ALTER TABLE otp_codes
        DROP COLUMN IF EXISTS uuid,
        DROP COLUMN IF EXISTS otp,
        ALTER COLUMN otp_request_id SET NOT NULL,
        ALTER COLUMN subject_id SET NOT NULL,
        ALTER COLUMN email SET NOT NULL,
        ALTER COLUMN purpose SET NOT NULL,
        ALTER COLUMN otp_hash SET NOT NULL
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_request_id
        ON otp_codes (otp_request_id)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_otp_codes_email_created
        ON otp_codes (LOWER(email), created_at DESC)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_otp_codes_subject_purpose_created
        ON otp_codes (subject_id, purpose, created_at DESC)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_otp_codes_cleanup
        ON otp_codes (created_at)
    `);
    await pool.query("DROP TABLE IF EXISTS otp");

    console.log("Tables created successfully");
}

async function ensureSuperAdminUser() {
    const email = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.SUPERADMIN_PASSWORD || "");
    const name = String(process.env.SUPERADMIN_NAME || "AERVA Superadmin").trim();

    if (!email || !password) {
        return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const tenantId = `superadmin_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 16)}`;

    await pool.query(`
        INSERT INTO users (
            username,
            name,
            email,
            password_hash,
            tenant_id,
            workspace,
            role
        )
        VALUES ($1,$2,$3,$4,$5,'AERVA Admin','superadmin')
        ON CONFLICT (email) DO UPDATE SET
            username = EXCLUDED.username,
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            tenant_id = COALESCE(users.tenant_id, EXCLUDED.tenant_id),
            workspace = 'AERVA Admin',
            role = 'superadmin',
            updated_at = NOW()
    `, [
        email,
        name,
        email,
        passwordHash,
        tenantId
    ]);



}



module.exports = createSchema;
