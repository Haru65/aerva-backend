const createSchema = require("./config/db")
const express = require("express");
const {ioConnection} = require("./services/socket_service");
const app = express();
const dotenv = require("dotenv");
const { Server } = require("socket.io");



const cors = require("cors");
const http = require("http");
const dashboa = require("./routes/dash");
const mydevice = require("./routes/mydevice");
const exportExcel = require("./routes/reports")


// Middleware to parse JSON requests
app.use(express.json());
dotenv.config();
app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
}));
app.use(express.json());

const server = http.createServer(app);
const io = ioConnection(server);
const client = require("./services/Mqttpayload");
createSchema();

app.set("io", io);

app.get("/",(req,res)=>{
    res.send("aerva backend server is running")
    
})


app.use("/api/dashboard", dashboa);

app.use("/devices/:deviceId", mydevice);
app.use("/api/reports", exportExcel);


server.listen(3000,()=>{
    console.log("http server running on port 3000")
    
})
