const express = require("express");
const router = require("express").Router({ mergeParams: true });
const { retrivelLatestData ,graphDataRetrieval } = require("../controller/dashboard_data");
const {liveAggregateData} = require("../controller/devices.js")

const DEVICE_MACS = {
    "living-room": "EC64C96EDA3C",
    "master-bedroom": "8857217641FC",
    "kitchen": "489D31D02758"
};

const getDeviceMac = (req) => DEVICE_MACS[req.params.deviceId];

router.get("/",async(req,res)=>{
    try {
        const deviceMac = getDeviceMac(req);
        if (!deviceMac) {
            return res.status(404).json({ error: "Unknown device" });
        }

        const result = await retrivelLatestData(deviceMac);
        if (!result) {
            return res.status(404).json({ error: "No data found for this device" });
        }
        res.json(result);
    }catch (err){
        console.error("Error retrieving latest data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get("/graph",async(req,res)=>{
    try{
        const { metric, range = "24h" } = req.query;
        const deviceMac = getDeviceMac(req);

        if (!deviceMac || !metric) {
            return res.status(400).json({ error: "Unknown device or missing metric" });
        }
        const graphData = await graphDataRetrieval({deviceMac,
            metric,
            range});
        res.json(graphData);
    }catch(err){
        console.error("error retriving past data",err)
        const status = err.message.startsWith("Invalid metric:") || err.message.startsWith("Invalid range:")
            ? 400
            : 500;
        res.status(status).json({ error: err.message });
    }
}
);

router.get("/metric-card", async (req, res) => {
    try {
        const { metric, range } = req.query;
        const deviceMac = getDeviceMac(req);

        if (!deviceMac || !metric || !range) {
            return res.status(400).json({ error: "Unknown device or missing required query parameters" });
        }

        const metricCardData = await liveAggregateData(deviceMac, metric, range);
        if (!metricCardData) {
            return res.status(404).json({ error: "No data found for the specified device and metric" });
        }

        res.json(metricCardData);
    } catch (err) {
        console.error("Error retrieving metric card data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
