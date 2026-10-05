const assert = require("node:assert/strict");
const test = require("node:test");

process.env.OTP_SECRET = "test-only-otp-secret";

const { _test } = require("../services/otpGeneration");

test("generateCode always produces a six-digit code", () => {
    for (let index = 0; index < 1_000; index += 1) {
        assert.match(_test.generateCode(), /^\d{6}$/);
    }
});

test("OTP hashes are deterministic, contextual, and safe to compare", () => {
    const first = _test.hashSecret("123456", "request-one");
    const same = _test.hashSecret("123456", "request-one");
    const differentCode = _test.hashSecret("654321", "request-one");
    const differentRequest = _test.hashSecret("123456", "request-two");

    assert.equal(first.length, 64);
    assert.equal(_test.safeEqualHex(first, same), true);
    assert.equal(_test.safeEqualHex(first, differentCode), false);
    assert.equal(_test.safeEqualHex(first, differentRequest), false);
});

test("email addresses are normalized, validated, and masked", () => {
    assert.equal(_test.normalizeEmail("  User@Example.COM "), "user@example.com");
    assert.equal(_test.maskEmail("username@example.com"), "us******@example.com");
    assert.throws(() => _test.normalizeEmail("not-an-email"), /valid email/i);
});

test("subject IDs and purposes are restricted", () => {
    assert.equal(_test.normalizeSubjectId("device_123456"), "device_123456");
    assert.equal(_test.normalizePurpose("DEVICE_CLAIM"), "device_claim");
    assert.throws(() => _test.normalizeSubjectId("short"), /valid UUID/i);
    assert.throws(() => _test.normalizePurpose("anything"), /unsupported/i);
});
