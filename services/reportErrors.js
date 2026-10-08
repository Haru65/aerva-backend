class ReportError extends Error {
    constructor(message, { status = 500, code = "REPORT_ERROR" } = {}) {
        super(message);
        this.name = "ReportError";
        this.status = status;
        this.code = code;
    }
}

function noReportDataError() {
    return new ReportError("No readings were found for this device in the selected date range.", {
        status: 404,
        code: "REPORT_NO_DATA"
    });
}

function sendReportError(res, error, context) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
        console.error(context, error);
    }

    if (res.headersSent) {
        res.destroy(error);
        return;
    }

    res.status(status).json({
        error: status >= 500 ? "Could not generate the report. Please try again." : error.message,
        code: error?.code || (status === 400 ? "INVALID_REPORT_REQUEST" : "REPORT_ERROR")
    });
}

module.exports = { ReportError, noReportDataError, sendReportError };
