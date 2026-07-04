const io = require('socket.io');
const cors = require('cors');

const ioConnection = (server) => {
    
    //actual server connection auth
    const ioserver = io(server,{
        cors:{
            origin: "*",
            methods: ["GET", "POST","DELETE","OPTIONS"],
        }
    })

    //checking connection or failling
    server.on('connection', (socket)=>{
        console.log('Client connected:', socket.id);
        
    server.on('disconnect', (socket)=>{
        console.log('Client disconnected:', socket.id);
    })
    return ioserver;
    })

return ioConnection;
}
const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }

    return io;
};
module.exports = { ioConnection, getIO };