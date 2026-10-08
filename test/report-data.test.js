const assert = require("node:assert/strict");
const test = require("node:test");

const pool = require("../controller/db_connection");
const { reportData, _test } = require("../controller/reportData");

test("custom reports query the complete inclusive date interval", async () => {
    const originalQuery = pool.query;
    let captured;
    pool.query = async (sql, params) => {
        captured = { sql: String(sql), params };
        return { rows: [] };
    };

    try {
        await reportData("EC64C96EDA3C", {
            from: "2026-07-01",
            to: "2026-09-01"
        }, "tenant_test");

        assert.deepEqual(captured.params, [
            "EC64C96EDA3C", "2026-07-01", "tenant_test", "2026-09-01"
        ]);
        assert.match(captured.sql, /report_device_time >= \$2::date/);
        assert.match(captured.sql, /report_device_time < \(\$4::date \+ INTERVAL '1 day'\)/);
        assert.doesNotMatch(captured.sql, /NOW\(\) -/);
    } finally {
        pool.query = originalQuery;
    }
});

test("report dates are strictly validated", () => {
    assert.equal(_test.isISODate("2026-09-01"), true);
    assert.equal(_test.isISODate("2026-02-30"), false);
    assert.equal(_test.isISODate("01-09-2026"), false);
});

test("missing readings stay blank instead of becoming zero", () => {
    assert.equal(_test.toNullableNumber(null), null);
    assert.equal(_test.toNullableNumber(undefined), null);
    assert.equal(_test.toNullableNumber(""), null);
    assert.equal(_test.toNullableNumber("24.5"), 24.5);
});
