const { Server } = require("socket.io");

let io;

const ioConnection = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST", "DELETE", "OPTIONS"],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        // Subscribe to device updates
        // Client sends: { deviceMac: "EC64C96EDA3C" }
        socket.on("subscribe:device", (data) => {
            const deviceMac = data?.deviceMac;
            if (deviceMac) {
                const room = `device:${deviceMac}`;
                socket.join(room);
                console.log(`Client ${socket.id} subscribed to ${room}`);
                socket.emit("subscribed", { deviceMac, status: "connected" });
            }
        });

        // Unsubscribe from device updates
        socket.on("unsubscribe:device", (data) => {
            const deviceMac = data?.deviceMac;
            if (deviceMac) {
                const room = `device:${deviceMac}`;
                socket.leave(room);
                console.log(`Client ${socket.id} unsubscribed from ${room}`);
            }
        });

        // Subscribe to all devices
        socket.on("subscribe:all-devices", () => {
            socket.join("all-devices");
            console.log(`Client ${socket.id} subscribed to all-devices`);
            socket.emit("subscribed", { status: "connected", scope: "all-devices" });
        });

        socket.on("subscribe:alerts", () => {
            socket.join("alerts");
            console.log(`Client ${socket.id} subscribed to alerts`);
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
const emitDeviceUpdate = (deviceMac, data) => {
    if (!io) return;
    const room = `device:${deviceMac}`;
    io.to(room).emit(`/devices/${deviceMac}`, data);
    // Also emit to all-devices room
    io.to("all-devices").emit("/devices/all", { deviceMac, data });
};

// Emit dashboard update (primary device)
const emitDashboardUpdate = (data) => {
    if (!io) return;
    io.emit("/api/dashboard/", data);
};

const emitAlertEvent = (data) => {
    if (!io) return;
    io.to("alerts").emit("/api/alerts/events", data);
};

module.exports = { ioConnection, getIO, emitDeviceUpdate, emitDashboardUpdate, emitAlertEvent };
