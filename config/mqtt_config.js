const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const server = process.env.server;
const port = Number(process.env.port || 1883);
const username = process.env.username;
const password = process.env.password;
const devices = ["489D31D02758","8857217641FC","EC64C96EDA3C"]
const datatopic = devices.map(device => `AGM/pub/${device}`);


const mqttAgent = {
    url: server,
    dataTopic: datatopic,
    options: {
        port: port,
        username: username,
        password: password,
        reconnectPeriod: 5000,
    }
}

module.exports = mqttAgent;
