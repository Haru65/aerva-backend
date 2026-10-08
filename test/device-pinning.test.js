const assert = require("node:assert/strict");
const test = require("node:test");

test("pinDeviceMetadata switches the tenant pin in one transaction", async () => {
    const transactionQueries = [];
    let released = false;
    const client = {
        async query(sql, params) {
            transactionQueries.push({ sql: String(sql), params });
            if (String(sql).includes("SELECT device_mac")) {
                return { rowCount: 1, rows: [{ device_mac: "NEWDEVICE" }] };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {
            released = true;
        }
    };
    const pool = {
        connect: async () => client,
        query: async () => ({
            rows: [{
                device_mac: "NEWDEVICE",
                tenant_id: "tenant-1",
                name: "Office",
                room: "office",
                serial_number: "SN-1",
                spark: [],
                metadata: {},
                is_pinned: true,
                aqi: null,
                last_seen: null,
                device_time: null
            }]
        })
    };

    const dbPath = require.resolve("../controller/db_connection");
    const registryPath = require.resolve("../controller/deviceRegistry");
    const devicesPath = require.resolve("../controller/devices");
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    require.cache[registryPath] = {
        id: registryPath,
        filename: registryPath,
        loaded: true,
        exports: { assertRegisteredActiveDevice: async () => ({}) }
    };
    delete require.cache[devicesPath];

    const { pinDeviceMetadata } = require("../controller/devices");
    const pinned = await pinDeviceMetadata("newdevice", "tenant-1");

    assert.equal(pinned.mac, "NEWDEVICE");
    assert.equal(pinned.is_pinned, true);
    assert.equal(released, true);
    assert.match(transactionQueries[0].sql, /BEGIN/);
    assert.match(transactionQueries[2].sql, /is_pinned = \(device_mac = \$2\)/);
    assert.deepEqual(transactionQueries[2].params, ["tenant-1", "NEWDEVICE"]);
    assert.match(transactionQueries[3].sql, /COMMIT/);
});
