const assert = require("node:assert/strict");
const test = require("node:test");
const { noReportDataError, sendReportError } = require("../services/reportErrors");

function mockResponse() {
    return {
        headersSent: false,
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        destroy() {
            throw new Error("response should not be destroyed");
        }
    };
}

test("empty reports return a useful 404 response", () => {
    const response = mockResponse();
    sendReportError(response, noReportDataError(), "unused");

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
        error: "No readings were found for this device in the selected date range.",
        code: "REPORT_NO_DATA"
    });
});

test("unexpected report errors do not expose internal details", () => {
    const response = mockResponse();
    const originalError = console.error;
    console.error = () => {};
    try {
        sendReportError(response, new Error("database password leaked"), "Report failed:");
    } finally {
        console.error = originalError;
    }

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
        error: "Could not generate the report. Please try again.",
        code: "REPORT_ERROR"
    });
});
