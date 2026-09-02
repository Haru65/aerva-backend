const path = require('path');
const dotenv = require('dotenv');
const pool = require('../controller/db_connection');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const server = process.env.MQTT_SERVER;
const port = Number(process.env.MQTT_PORT || 1883);
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;

function normalizeDeviceMac(deviceMac) {
    return String(deviceMac || '').trim().toUpperCase();
}

function topicForDevice(deviceMac) {
    return `AGM/pub/${normalizeDeviceMac(deviceMac)}`;
}

async function getDeviceMacs() {
    const result = await pool.query(`
        SELECT device_mac
        FROM devices
        WHERE device_mac IS NOT NULL AND TRIM(device_mac) <> ''
        ORDER BY created_at ASC, name ASC
    `);

    return result.rows
        .map(row => normalizeDeviceMac(row.device_mac))
        .filter(Boolean);
}

async function getDataTopics() {
    const deviceMacs = await getDeviceMacs();
    return deviceMacs.map(topicForDevice);
}


const mqttAgent = {
    url: server,
    getDataTopics,
    topicForDevice,
    options: {
        port: port,
        username: username,
        password: password,
        reconnectPeriod: 5000,
    }
}

module.exports = mqttAgent;
