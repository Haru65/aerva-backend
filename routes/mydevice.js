const express = require("express");
const router = require("express").Router({ mergeParams: true });
const { retrivelLatestData ,graphDataRetrieval } = require("../controller/dashboard_data");
const {liveAggregateData} = require("../controller/devices.js")

router.get("/:deviceMac",async(req,res)=>{
    try {
        const { deviceMac } = req.params;
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

router.get("/:deviceMac/graph",async(req,res)=>{
    try{
        const { deviceMac } = req.params;
        const { metric, range = "24h" } = req.query;

        if (!metric) {
            return res.status(400).json({ error: "Missing required parameter: metric" });
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

router.get("/:deviceMac/metric-card", async (req, res) => {
    try {
        const { deviceMac } = req.params;
        const { metric, range } = req.query;

        if (!metric || !range) {
            return res.status(400).json({ error: "Missing required query parameters: metric, range" });
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
