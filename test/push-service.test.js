const assert = require("node:assert/strict");
const test = require("node:test");
const { _test } = require("../services/push_service");

test("push subscriptions are normalized", () => {
    assert.deepEqual(_test.normalizeSubscription({
        endpoint: "https://push.example.test/subscription/123",
        expirationTime: null,
        keys: { p256dh: "public-key", auth: "auth-secret" }
    }), {
        endpoint: "https://push.example.test/subscription/123",
        expirationTime: null,
        keys: { p256dh: "public-key", auth: "auth-secret" }
    });
});

test("push subscriptions reject incomplete and insecure endpoints", () => {
    assert.throws(
        () => _test.normalizeSubscription({ endpoint: "https://push.example.test", keys: {} }),
        /valid push subscription/i
    );
    assert.throws(
        () => _test.normalizeSubscription({
            endpoint: "http://push.example.test",
            keys: { p256dh: "public-key", auth: "auth-secret" }
        }),
        /HTTPS/i
    );
});
