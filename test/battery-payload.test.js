const assert = require('node:assert/strict');
const test = require('node:test');

test('legacy MQTT BATTERY value is persisted, including zero', async () => {
    let captured;
    const pool = {
        async query(sql, params) {
            captured = { sql: String(sql), params };
            return { rows: [{ device_mac: '8857217641FC', battery: params[12] }] };
        }
    };

    const dbPath = require.resolve('../controller/db_connection');
    const devicesPath = require.resolve('../controller/devices');
    const storePath = require.resolve('../services/messageStore');

    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    require.cache[devicesPath] = {
        id: devicesPath,
        filename: devicesPath,
        loaded: true,
        exports: { ensureDeviceMetadata: async () => null }
    };
    delete require.cache[storePath];

    const savePayload = require('../services/messageStore');
    const saved = await savePayload({
        message: {
            MAC: '8857217641FC',
            BATTERY: 0,
            env: { temp: 26.5, hum: 45 },
            gas: { co_ppm: 0, o2_pct: 20.4, co2_ppm: 262 },
            pm: { pm1_0: 35, pm2_5: 44, pm10: 49, aqi: 73 },
            diag: { rssi: 5, o2_warn: true, uptime: 10, mqtt_err: 0 }
        }
    });

    assert.match(captured.sql, /\bbattery\b/);
    assert.equal(captured.params[12], 0);
    assert.equal(saved.battery, 0);
});
