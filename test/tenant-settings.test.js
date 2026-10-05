const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_PREFERENCES, _test } = require("../controller/tenantSettings");

test("tenant preferences accept supported synchronized settings", () => {
    assert.deepEqual(_test.normalizePreferences({
        autoRefresh: "5s",
        notificationSounds: false,
        pushNotifications: false,
        emailAlerts: true,
        dailySummary: true,
        quietHours: "Off",
        twoFactor: true,
        browserOnlyValue: "ignored"
    }), {
        autoRefresh: "5s",
        notificationSounds: false,
        pushNotifications: false,
        emailAlerts: true,
        dailySummary: true,
        quietHours: "Off",
        twoFactor: true
    });
    assert.equal(DEFAULT_PREFERENCES.autoRefresh, "30s");
});

test("tenant preferences reject invalid enumerated values", () => {
    assert.throws(
        () => _test.normalizePreferences({ autoRefresh: "2h" }),
        /Invalid auto-refresh interval/
    );
    assert.throws(
        () => _test.normalizePreferences({ unknown: true }),
        /No valid preferences supplied/
    );
});
