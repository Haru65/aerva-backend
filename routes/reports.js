const express = require("express");
const router = express.Router();
const { exportExcel } = require("../services/exportExcelService");
const { exportPDF } = require("../services/exportPDF.js");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/excel", async (req, res) => {
    try {
        const { device_mac } = req.query;

        if (!device_mac) return res.status(400).json({ error: "Device MAC is required" });
        const period = parseReportPeriod(req.query);

        const data = await exportExcel(device_mac, period, req.user.tenantId);
        if (!data || data.length === 0) {
            return res.status(404).json({ error: "No data found for the specified device and range" });
        }

        res.download(data, `report_${device_mac}_${period.label}.xlsx`, (err) => {
            if (err) {
                console.error("Error sending the file:", err);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error("Error retrieving report data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/pdf", async (req, res) => {
    try {
        const { device_mac } = req.query;

        if (!device_mac) return res.status(400).json({ error: "Device MAC is required" });
        const period = parseReportPeriod(req.query);

        const data = await exportPDF(device_mac, period, req.user.tenantId);
        if (!data || data.length === 0) {
            return res.status(404).json({ error: "No data found for the specified device and range" });
        }

        res.download(data, `report_${device_mac}_${period.label}.pdf`, (err) => {
            if (err) {
                console.error("Error sending the file:", err);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error("Error retrieving report data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

function parseReportPeriod({ range, from, to }) {
    if (from || to) {
        if (!isISODate(from) || !isISODate(to)) throw badRequest("Valid from and to dates are required");
        if (from > to) throw badRequest("From date must not be after to date");
        return { from, to, label: `${from}_to_${to}` };
    }

    if (!range || !["1h", "24h", "7d", "30d"].includes(range)) {
        throw badRequest("A valid range or custom date interval is required");
    }
    return { range, label: range };
}

function isISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400 });
}

module.exports = router;
