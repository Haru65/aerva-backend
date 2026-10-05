const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { getTenantSettings, updateTenantSettings } = require("../controller/tenantSettings");
const { emitTenantConfigChanged } = require("../services/socket_service");

router.use(requireAuth);

router.get("/", async (req, res) => {
    try {
        res.json(await getTenantSettings(req.user.tenantId));
    } catch (err) {
        console.error("Error retrieving tenant settings:", err);
        res.status(500).json({ error: "Could not retrieve settings" });
    }
});

router.patch("/", async (req, res) => {
    try {
        const settings = await updateTenantSettings(req.user.tenantId, req.body?.preferences || req.body || {});
        emitTenantConfigChanged(req.user.tenantId, "preferences", "updated");
        res.json(settings);
    } catch (err) {
        console.error("Error updating tenant settings:", err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
