const router = require("express").Router();
const {
    listAlertRules,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule
} = require("../controller/alertRules");
const {
    listAlertEvents,
    getAlertSummary
} = require("../services/alert_service");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", async (req, res) => {
    try {
        const alerts = await listAlertRules(req.user.tenantId);
        res.json({ alerts });
    } catch (err) {
        console.error("Error retrieving alert rules:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/events", async (req, res) => {
    try {
        const events = await listAlertEvents(req.query || {}, req.user.tenantId);
        res.json({ events });
    } catch (err) {
        console.error("Error retrieving alert events:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/summary", async (req, res) => {
    try {
        const summary = await getAlertSummary(req.user.tenantId);
        res.json(summary);
    } catch (err) {
        console.error("Error retrieving alert summary:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/", async (req, res) => {
    try {
        const alert = await createAlertRule(req.body || {}, req.user.tenantId);
        res.status(201).json(alert);
    } catch (err) {
        console.error("Error creating alert rule:", err);
        res.status(400).json({ error: err.message });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const alert = await updateAlertRule(req.params.id, req.body || {}, req.user.tenantId);
        if (!alert) {
            return res.status(404).json({ error: "Alert rule not found" });
        }
        res.json(alert);
    } catch (err) {
        console.error("Error updating alert rule:", err);
        res.status(400).json({ error: err.message });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const deleted = await deleteAlertRule(req.params.id, req.user.tenantId);
        if (!deleted) {
            return res.status(404).json({ error: "Alert rule not found" });
        }
        res.status(204).send();
    } catch (err) {
        console.error("Error deleting alert rule:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
