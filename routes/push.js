const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const {
    getVapidPublicKey,
    savePushSubscription,
    deletePushSubscription
} = require("../services/push_service");

router.use(requireAuth);

router.get("/vapid-public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
        return res.status(503).json({ error: "Push notifications are not configured on the server" });
    }
    res.json({ publicKey });
});

router.post("/subscriptions", async (req, res) => {
    try {
        const subscription = await savePushSubscription({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            subscription: req.body?.subscription || req.body,
            userAgent: req.get("user-agent") || ""
        });
        res.status(201).json({ endpoint: subscription.endpoint });
    } catch (err) {
        console.error("Error saving push subscription:", err);
        res.status(400).json({ error: err.message });
    }
});

router.delete("/subscriptions", async (req, res) => {
    try {
        await deletePushSubscription({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            endpoint: req.body?.endpoint
        });
        res.status(204).send();
    } catch (err) {
        console.error("Error deleting push subscription:", err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
