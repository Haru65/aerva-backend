const express = require("express");
const router = require("express").Router({ mergeParams: true });
const { retrivelLatestData ,graphDataRetrieval } = require("../controller/dashboard_data");
const { requireAuth } = require("../middleware/auth");
const {
    liveAggregateData,
    listDeviceMetadata,
    upsertDeviceMetadata,
    updateDeviceMetadata,
    pinDeviceMetadata,
    deleteDeviceMetadata
} = require("../controller/devices.js")
const mqttSubscriptionEvents = require("../services/mqttSubscriptionEvents");
const { emitTenantConfigChanged } = require("../services/socket_service");

router.use(requireAuth);

router.get("/", async (req, res) => {
    try {
        const devices = await listDeviceMetadata(req.user.tenantId);
        res.json({ devices });
    } catch (err) {
        console.error("Error retrieving devices metadata:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/", async (req, res) => {
    try {
        const device = await upsertDeviceMetadata(req.body || {}, req.user.tenantId);
        mqttSubscriptionEvents.emit("devices:changed");
        emitTenantConfigChanged(req.user.tenantId, "devices", "created");
        res.status(201).json(device);
    } catch (err) {
        console.error("Error saving device metadata:", err);
        const status = err.message === "device_mac is required" || err.message === "tenant_id is required"
            ? 400
            : err.message === "device already claimed"
                ? 409
                : err.message === "device is not registered" || err.message === "device is not active"
                    ? 403
                    : 500;
        res.status(status).json({ error: err.message });
    }
});

router.patch("/:deviceMac/pin", async (req, res) => {
    try {
        const device = await pinDeviceMetadata(req.params.deviceMac, req.user.tenantId);
        mqttSubscriptionEvents.emit("devices:changed");
        emitTenantConfigChanged(req.user.tenantId, "devices", "pinned");
        res.json(device);
    } catch (err) {
        console.error("Error pinning device:", err);
        const status = err.message === "device not found"
            ? 404
            : err.message === "device_mac is required" || err.message === "tenant_id is required"
                ? 400
                : 500;
        res.status(status).json({ error: err.message });
    }
});

router.patch("/:deviceMac", async (req, res) => {
    try {
        const { deviceMac } = req.params;
        const device = await updateDeviceMetadata(deviceMac, req.body || {}, req.user.tenantId);
        mqttSubscriptionEvents.emit("devices:changed");
        emitTenantConfigChanged(req.user.tenantId, "devices", "updated");
        res.json(device);
    } catch (err) {
        console.error("Error updating device metadata:", err);
        const status = err.message === "device not found"
            ? 404
            : err.message === "device_mac is required" || err.message === "tenant_id is required"
                ? 400
                : 500;
        res.status(status).json({ error: err.message });
    }
});

router.delete("/:deviceMac", async (req, res) => {
    try {
        const { deviceMac } = req.params;
        const deleted = await deleteDeviceMetadata(deviceMac, req.user.tenantId);
        if (!deleted) {
            return res.status(404).json({ error: "Device not found" });
        }
        mqttSubscriptionEvents.emit("devices:changed");
        emitTenantConfigChanged(req.user.tenantId, "devices", "deleted");
        res.status(204).send();
    } catch (err) {
        console.error("Error deleting device metadata:", err);
        const status = err.message === "device_mac is required" || err.message === "tenant_id is required" ? 400 : 500;
        res.status(status).json({ error: err.message });
    }
});

router.get("/:deviceMac",async(req,res)=>{
    try {
        const { deviceMac } = req.params;
        const result = await retrivelLatestData(deviceMac, req.user.tenantId);
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
            range,
            tenantId: req.user.tenantId});
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

        const metricCardData = await liveAggregateData(deviceMac, metric, range, req.user.tenantId);
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
