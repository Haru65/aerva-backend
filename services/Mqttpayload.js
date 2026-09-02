const mqtt = require('mqtt');
const mqttAgent = require('../config/mqtt_config');
const  savePayload  = require('./messageStore');
const { emitDeviceUpdate, emitDashboardUpdate } = require("./socket_service");
const mqttSubscriptionEvents = require('./mqttSubscriptionEvents');
const { evaluateAlertRulesForReading } = require('./alert_service');

const client = mqtt.connect(mqttAgent.url, mqttAgent.options);
let subscribedTopics = new Set();

async function refreshSubscriptions() {
    if (!client.connected) return;

    let topics;
    try {
        topics = await mqttAgent.getDataTopics();
    } catch (err) {
        console.error("Error loading MQTT topics from database:", err);
        return;
    }

    const nextTopics = new Set(topics);
    const topicsToSubscribe = topics.filter(topic => !subscribedTopics.has(topic));
    const topicsToUnsubscribe = [...subscribedTopics].filter(topic => !nextTopics.has(topic));

    if (topicsToSubscribe.length) {
        client.subscribe(topicsToSubscribe, (err) => {
            if (err) {
                console.error("Error subscribing to topic:", err);
            } else {
                console.log(`Subscribed to topics: ${topicsToSubscribe.join(", ")}`);
            }
        });
    }

    if (topicsToUnsubscribe.length) {
        client.unsubscribe(topicsToUnsubscribe, (err) => {
            if (err) {
                console.error("Error unsubscribing from topic:", err);
            } else {
                console.log(`Unsubscribed from topics: ${topicsToUnsubscribe.join(", ")}`);
            }
        });
    }

    subscribedTopics = nextTopics;
}

client.on('connect', () => {
    console.log("Connected to MQTT broker");
    refreshSubscriptions();
});

client.on('error', (err) => {
    console.error("Error connecting to MQTT broker:", err);
});

mqttSubscriptionEvents.on('devices:changed', () => {
    refreshSubscriptions();
});

const formatDashboardLatest = (row) => ({
    id: row.id,
    device_mac: row.device_mac,
    device_time: row.device_time,
    received_at: row.received_at,
    readings: {
        temperature: Number(row.temperature),
        humidity: Number(row.humidity),
        co_ppm: Number(row.co_ppm),
        o2_pct: Number(row.o2_pct),
        co2_ppm: Number(row.co2_ppm),
        pm1_0: Number(row.pm1_0),
        pm2_5: Number(row.pm2_5),
        pm10: Number(row.pm10),
        rssi: Number(row.rssi),
        aqi: Number(row.aqi)
    },
    status: {
        o2_warn: row.o2_warn,
        time_status: row.time_status,
        mqtt_err: Number(row.mqtt_err)
    }
});

client.on('message', async (topic, message) => {
    const rawMessage = message.toString();
    let parsedMessage = rawMessage;

    try {
        parsedMessage = JSON.parse(rawMessage);
    } catch (err) {
        // Keep plain text payloads as-is.
    }

    const payload = {
        topic,
        message: parsedMessage,
        receivedAt: new Date().toISOString(),
    };

    try {
        const savedPayload = await savePayload(payload);
        const dashboardLatest = formatDashboardLatest(savedPayload);
        const deviceMac = savedPayload.device_mac;

        // Emit to device-specific room
        emitDeviceUpdate(deviceMac, dashboardLatest);
        
        // Emit to dashboard (for primary device)
        emitDashboardUpdate(dashboardLatest);

        await evaluateAlertRulesForReading(savedPayload);

        console.log(`Stored message on topic ${topic}: ${rawMessage}`);
    } catch (err) {
        console.error("Error storing MQTT payload:", err);
    }
});

module.exports = {
    client,
    refreshSubscriptions
};
