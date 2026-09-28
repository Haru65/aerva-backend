const router = require("express").Router();
const { requireSuperAdmin } = require("../middleware/auth");
const {
    deleteRegistryDevice,
    getRegistryDevice,
    listRegistryDevices,
    upsertRegistryDevice
} = require("../controller/deviceRegistry");

router.use(requireSuperAdmin);

router.get("/", async (_req, res) => {
    try {
        const devices = await listRegistryDevices();
        res.json({ devices });
    } catch (err) {
        console.error("Error listing registered devices:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/:deviceMac", async (req, res) => {
    try {
        const device = await getRegistryDevice(req.params.deviceMac);
        if (!device) {
            return res.status(404).json({ error: "Device not registered" });
        }
        res.json(device);
    } catch (err) {
        console.error("Error retrieving registered device:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/", async (req, res) => {
    try {
        const device = await upsertRegistryDevice(req.body || {});
        res.status(201).json(device);
    } catch (err) {
        console.error("Error saving registered device:", err);
        res.status(400).json({ error: err.message });
    }
});

router.delete("/:deviceMac", async (req, res) => {
    try {
        const deleted = await deleteRegistryDevice(req.params.deviceMac);
        if (!deleted) {
            return res.status(404).json({ error: "Device not registered" });
        }
        res.status(204).send();
    } catch (err) {
        console.error("Error deleting registered device:", err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
