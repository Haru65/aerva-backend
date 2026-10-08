const assert = require("node:assert/strict");
const test = require("node:test");
const { getReportColumns, toReportRow, getReportCellStyle } = require("../services/reportFormat");

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

test("report cells use the application sensor ranges", () => {
    assert.equal(getReportCellStyle("temperature", 20), null);
    assert.equal(getReportCellStyle("temperature", 26), null);
    assert.equal(getReportCellStyle("temperature", 27).level, "warning");

    assert.equal(getReportCellStyle("humidity", 40), null);
    assert.equal(getReportCellStyle("humidity", 60), null);
    assert.equal(getReportCellStyle("humidity", 61).level, "warning");

    assert.equal(getReportCellStyle("co2_ppm", 799), null);
    assert.equal(getReportCellStyle("co2_ppm", 800).level, "warning");
    assert.equal(getReportCellStyle("co2_ppm", 1501).level, "danger");

    assert.equal(getReportCellStyle("o2_pct", 19.5), null);
    assert.equal(getReportCellStyle("o2_pct", 18).level, "warning");
    assert.equal(getReportCellStyle("o2_pct", 17.9).level, "danger");
    assert.equal(getReportCellStyle("o2_pct", 23.1).level, "danger");

    assert.equal(getReportCellStyle("pm10", 999), null);
    assert.equal(getReportCellStyle("rssi", -120), null);
});
