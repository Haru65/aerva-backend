const express = require("express");
const router = express.Router();
const { exportExcel } = require("../services/exportExcelService");
const { exportPDF } = require("../services/exportPDF.js");

router.get("/excel", async (req, res) => {
    try {
        const { device_mac, range } = req.query;

        if (!device_mac || !range) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }

        const data = await exportExcel(device_mac, range);
        if (!data || data.length === 0) {
            return res.status(404).json({ error: "No data found for the specified device and range" });
        }

        res.download(data, `report_${device_mac}_${range}.xlsx`, (err) => {
            if (err) {
                console.error("Error sending the file:", err);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });
    } catch (err) {
        console.error("Error retrieving report data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/pdf", async (req, res) => {
    try {
        const { device_mac, range } = req.query;

        if (!device_mac || !range) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }

        const data = await exportPDF(device_mac, range);
        if (!data || data.length === 0) {
            return res.status(404).json({ error: "No data found for the specified device and range" });
        }

        res.download(data, `report_${device_mac}_${range}.pdf`, (err) => {
            if (err) {
                console.error("Error sending the file:", err);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });
    } catch (err) {
        console.error("Error retrieving report data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
