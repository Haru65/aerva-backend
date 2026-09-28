const pool = require("./db_connection");

function normalizeDeviceMac(deviceMac) {
    return String(deviceMac || "").trim().toUpperCase();
}

function rowToRegistryDevice(row) {
    return {
        mac: row.device_mac,
        serialNumber: row.serial_number || "",
        model: row.model || "",
        batch: row.batch || "",
        status: row.status || "active",
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listRegistryDevices() {
    const result = await pool.query(`
        SELECT *
        FROM device_registry
        ORDER BY created_at DESC, device_mac ASC
    `);

    return result.rows.map(rowToRegistryDevice);
}

async function getRegistryDevice(deviceMac) {
    const mac = normalizeDeviceMac(deviceMac);
    if (!mac) return null;

    const result = await pool.query(
        "SELECT * FROM device_registry WHERE device_mac = $1",
        [mac]
    );

    return result.rows[0] ? rowToRegistryDevice(result.rows[0]) : null;
}

async function upsertRegistryDevice({ device_mac, mac, serial_number, serialNumber, model, batch, status, metadata }) {
    const deviceMac = normalizeDeviceMac(device_mac || mac);
    if (!deviceMac) {
        throw new Error("device_mac is required");
    }

    const cleanStatus = String(status || "active").trim().toLowerCase();
    if (!["active", "retired", "blocked"].includes(cleanStatus)) {
        throw new Error("status must be active, retired, or blocked");
    }

    const result = await pool.query(`
        INSERT INTO device_registry (
            device_mac,
            serial_number,
            model,
            batch,
            status,
            metadata
        )
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
        ON CONFLICT (device_mac) DO UPDATE SET
            serial_number = EXCLUDED.serial_number,
            model = EXCLUDED.model,
            batch = EXCLUDED.batch,
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING *
    `, [
        deviceMac,
        serial_number || serialNumber || null,
        model || null,
        batch || null,
        cleanStatus,
        JSON.stringify(metadata || {})
    ]);

    return rowToRegistryDevice(result.rows[0]);
}

async function deleteRegistryDevice(deviceMac) {
    const mac = normalizeDeviceMac(deviceMac);
    if (!mac) {
        throw new Error("device_mac is required");
    }

    const result = await pool.query(
        "DELETE FROM device_registry WHERE device_mac = $1 RETURNING device_mac",
        [mac]
    );

    return result.rowCount > 0;
}

async function assertRegisteredActiveDevice(deviceMac) {
    const mac = normalizeDeviceMac(deviceMac);
    if (!mac) {
        throw new Error("device_mac is required");
    }

    const result = await pool.query(
        "SELECT * FROM device_registry WHERE device_mac = $1",
        [mac]
    );
    const row = result.rows[0];

    if (!row) {
        throw new Error("device is not registered");
    }

    if (row.status !== "active") {
        throw new Error("device is not active");
    }

    return rowToRegistryDevice(row);
}

module.exports = {
    assertRegisteredActiveDevice,
    deleteRegistryDevice,
    getRegistryDevice,
    listRegistryDevices,
    upsertRegistryDevice
};
