const assert = require("node:assert/strict");
const test = require("node:test");
const { getReportColumns, toReportRow } = require("../services/reportFormat");

const sample = {
    id: 17,
    device_mac: "EC64C96EDA3C",
    device_time: "2026-10-05 12:30:00",
    timestamp: "not-exported",
    readings: {
        temperature: 24.5,
        humidity: 51,
        pm2_5: 18,
        unsupported_metric: 999
    }
};

test("PDF and Excel share the same report columns and row structure", () => {
    const columns = getReportColumns([sample]);
    const row = toReportRow(sample);

    assert.deepEqual(columns.map(column => column.key), [
        "id", "device_mac", "device_time", "temperature", "humidity", "pm2_5"
    ]);
    assert.deepEqual(Object.keys(row), columns.map(column => column.key));
    assert.equal(row.pm2_5, 18);
    assert.equal(row.unsupported_metric, undefined);
    assert.equal(row.timestamp, undefined);
});
