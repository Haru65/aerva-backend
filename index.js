const createSchema = require("./config/db")
const express = require("express");
const {ioConnection} = require("./services/socket_service");
const app = express();
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const otpManagement = require("./routes/otpRoute");


const cors = require("cors");
const http = require("http");
const dashboa = require("./routes/dash");
const mydevice = require("./routes/mydevice");
const exportExcel = require("./routes/reports")
const alerts = require("./routes/alerts")
const auth = require("./routes/auth")
const adminDevices = require("./routes/adminDevices")
const settings = require("./routes/settings")
const push = require("./routes/push")


// Middleware to parse JSON requests
app.use(express.json());
dotenv.config();
app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json());

const server = http.createServer(app);
const io = ioConnection(server);

app.set("io", io);

app.get("/",(req,res)=>{
    res.send("aerva backend server is running")
    
})


app.use("/api/auth", auth);
app.use("/api/admin/devices", adminDevices);
app.use("/api/dashboard", dashboa);
app.use("/api/otp", otpManagement);
app.use("/devices", mydevice);
app.use("/api/reports", exportExcel);
app.use("/api/alerts", alerts);
app.use("/api/settings", settings);
app.use("/api/push", push);


createSchema()
    .then(() => {
        require("./services/Mqttpayload");
        server.listen(3000,()=>{
            console.log("http server running on port 3000")
            
        })
    })
    .catch((err) => {
        console.error("Failed to initialize database schema:", err);
        process.exit(1);
    });
