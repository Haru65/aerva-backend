const express = require("express");
const router = express.Router();
const { retrivelLatestData ,graphDataRetrieval } = require("../controller/dashboard_data");

router.get("/latest",async(req,res)=>{
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

module.exports = router;