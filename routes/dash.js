const express = require("express");
const router = express.Router();
const {
    retrivelLatestData,
    graphDataRetrieval,
} = require("../controller/dashboard_data");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", async (req, res) => {
    try {
        const result = await retrivelLatestData(null, req.user.tenantId);
        if (!result) return res.status(404).json({ error: "No tenant device data found" });
        return res.json(result);
    } catch (err) {
        console.error("Error retrieving latest data:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/graph", async (req, res) => {
    const {
        device_mac: deviceMac,
        metric,
        range = "24h",
    } = req.query;

    if (!deviceMac || !metric) {
        return res.status(400).json({
            error: "device_mac and metric query parameters are required",
        });
    }

    try {
        const graphData = await graphDataRetrieval({
            deviceMac,
            metric,
            range,
            tenantId: req.user.tenantId
        });

        return res.json(graphData);
    } catch (err) {
        if (err.message.startsWith("Invalid metric:") || err.message.startsWith("Invalid range:")) {
            return res.status(400).json({ error: err.message });
        }

        console.error("Error retrieving graph data:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
