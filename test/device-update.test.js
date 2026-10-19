const assert = require("node:assert/strict");
const test = require("node:test");

test("updateDeviceMetadata renames an owned device without reclaiming it", async () => {
    const queries = [];
    const pool = {
        async query(sql, params) {
            const query = String(sql);
            queries.push({ sql: query, params });

            if (query.includes("SELECT * FROM devices")) {
                return {
                    rowCount: 1,
                    rows: [{
                        device_mac: "DEVICE1",
                        tenant_id: "tenant-1",
                        name: "Old room",
                        room: "living",
                        serial_number: "SN-1",
                        spark: [1, 2],
                        metadata: { floor: 1 },
                        is_pinned: true
                    }]
                };
            }

            if (query.includes("UPDATE devices")) {
                return {
                    rowCount: 1,
                    rows: [{
                        device_mac: "DEVICE1",
                        tenant_id: "tenant-1",
                        name: "Bedroom",
                        room: "bedroom",
                        serial_number: "SN-1",
                        spark: [1, 2],
                        metadata: { floor: 1 },
                        is_pinned: true,
                        aqi: null,
                        last_seen: null,
                        device_time: null
                    }]
                };
            }

            throw new Error(`Unexpected query: ${query}`);
        }
    };

    const dbPath = require.resolve("../controller/db_connection");
    const registryPath = require.resolve("../controller/deviceRegistry");
    const devicesPath = require.resolve("../controller/devices");
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    require.cache[registryPath] = {
        id: registryPath,
        filename: registryPath,
        loaded: true,
        exports: {
            assertRegisteredActiveDevice: async () => {
                throw new Error("rename must not re-check the registry");
            }
        }
    };
    delete require.cache[devicesPath];

    const { updateDeviceMetadata } = require("../controller/devices");
    const updated = await updateDeviceMetadata("device1", {
        name: " Bedroom ",
        room: "bedroom"
    }, "tenant-1");

    assert.equal(updated.name, "Bedroom");
    assert.equal(updated.room, "bedroom");
    assert.equal(updated.is_pinned, true);
    assert.equal(queries.length, 2);
    assert.match(queries[1].sql, /UPDATE devices/);
    assert.deepEqual(queries[1].params, [
        "DEVICE1",
        "tenant-1",
        "Bedroom",
        "bedroom",
        "SN-1",
        JSON.stringify([1, 2]),
        JSON.stringify({ floor: 1 })
    ]);
});
