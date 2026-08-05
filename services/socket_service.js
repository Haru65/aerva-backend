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

module.exports = { ioConnection, getIO };
