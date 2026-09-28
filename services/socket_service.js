const { Server } = require("socket.io");
const pool = require("../controller/db_connection");
const { verifyToken } = require("../middleware/auth");

let io;

function normalizeDeviceMac(deviceMac) {
    return String(deviceMac || "").trim().toUpperCase();
}

async function getDeviceTenantId(deviceMac) {
    const result = await pool.query(
        "SELECT tenant_id FROM devices WHERE UPPER(TRIM(device_mac)) = $1 LIMIT 1",
        [normalizeDeviceMac(deviceMac)]
    );
    return result.rows[0]?.tenant_id || null;
}

async function tenantOwnsDevice(tenantId, deviceMac) {
    if (!tenantId || !deviceMac) return false;
    const result = await pool.query(
        "SELECT 1 FROM devices WHERE tenant_id = $1 AND UPPER(TRIM(device_mac)) = $2 LIMIT 1",
        [tenantId, normalizeDeviceMac(deviceMac)]
    );
    return result.rowCount > 0;
}

const ioConnection = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST", "DELETE", "OPTIONS"],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.use((socket, next) => {
        const header = socket.handshake.headers.authorization || "";
        const token = socket.handshake.auth?.token ||
            (header.startsWith("Bearer ") ? header.slice(7) : "");
        const payload = verifyToken(token);

        if (!payload?.tenantId) {
            return next(new Error("Authentication required"));
        }

        socket.user = {
            id: payload.sub,
            tenantId: payload.tenantId,
            email: payload.email
        };
        next();
    });

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);
        socket.join(`tenant:${socket.user.tenantId}`);

        // Subscribe to device updates
        // Client sends: { deviceMac: "EC64C96EDA3C" }
        socket.on("subscribe:device", async (data) => {
            const deviceMac = normalizeDeviceMac(data?.deviceMac);
            if (deviceMac && await tenantOwnsDevice(socket.user.tenantId, deviceMac)) {
                const room = `tenant:${socket.user.tenantId}:device:${deviceMac}`;
                socket.join(room);
                console.log(`Client ${socket.id} subscribed to ${room}`);
                socket.emit("subscribed", { deviceMac, status: "connected" });
            } else {
                socket.emit("subscription:error", { deviceMac, error: "Device not found" });
            }
        });

        // Unsubscribe from device updates
        socket.on("unsubscribe:device", (data) => {
            const deviceMac = normalizeDeviceMac(data?.deviceMac);
            if (deviceMac) {
                const room = `tenant:${socket.user.tenantId}:device:${deviceMac}`;
                socket.leave(room);
                console.log(`Client ${socket.id} unsubscribed from ${room}`);
            }
        });

        // Subscribe to all devices
        socket.on("subscribe:all-devices", () => {
            const room = `tenant:${socket.user.tenantId}:all-devices`;
            socket.join(room);
            console.log(`Client ${socket.id} subscribed to ${room}`);
            socket.emit("subscribed", { status: "connected", scope: "all-devices" });
        });

        socket.on("subscribe:alerts", () => {
            const room = `tenant:${socket.user.tenantId}:alerts`;
            socket.join(room);
            console.log(`Client ${socket.id} subscribed to ${room}`);
            socket.emit("subscribed", { status: "connected", scope: "alerts" });
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });

        socket.on("error", (error) => {
            console.error("Socket error:", socket.id, error);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }

    return io;
};

// Emit device-specific updates
const emitDeviceUpdate = async (deviceMac, data) => {
    if (!io) return;
    const normalizedMac = normalizeDeviceMac(deviceMac);
    const tenantId = await getDeviceTenantId(normalizedMac);
    if (!tenantId) return;

    const room = `tenant:${tenantId}:device:${normalizedMac}`;
    io.to(room).emit(`/devices/${deviceMac}`, data);
    io.to(`tenant:${tenantId}:all-devices`).emit("/devices/all", { deviceMac: normalizedMac, data });
};

// Emit dashboard update (primary device)
const emitDashboardUpdate = async (data) => {
    if (!io) return;
    const tenantId = await getDeviceTenantId(data?.device_mac);
    if (!tenantId) return;
    io.to(`tenant:${tenantId}`).emit("/api/dashboard/", data);
};

const emitAlertEvent = (data) => {
    if (!io) return;
    const tenantId = data?.tenantId || data?.event?.tenantId;
    if (!tenantId) return;
    io.to(`tenant:${tenantId}:alerts`).emit("/api/alerts/events", data);
};

module.exports = { ioConnection, getIO, emitDeviceUpdate, emitDashboardUpdate, emitAlertEvent };
