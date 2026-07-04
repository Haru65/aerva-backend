const express = require("express");
const router = require("express").Router();
const { retrivelLatestData ,graphDataRetrieval } = require("../controller/dashboard_data");
const {liveAggregateData} = require("../controller/devices.js")

router.get("/",async(req,res)=>{
    try {
        const result = await retrivelLatestData();
        res.json(result);
    }catch (err){
        console.error("Error retrieving latest data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get("/graph",async(req,res)=>{
    try{
        const { device_mac, metric, range } = req.query;

        if (!device_mac || !metric || !range) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }
        const graphData = await graphDataRetrieval({deviceMac:device_mac,
            metric,
            range:range || "24hr"});
        res.json(graphData);
    }catch(err){
        console.error("error retriving past data",err)
        res.status(500).json({ error: "Internal Server Error" });
    }
}
);

router.get("/metric-card", async (req, res) => {
    try {
        const { device_mac, metric, range } = req.query;

        if (!device_mac || !metric || !range) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }

        const metricCardData = await liveAggregateData( device_mac, metric , range || "24h");
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