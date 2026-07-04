const mqtt = require('mqtt');
const mqttAgent = require('../config/mqtt_config');
const  savePayload  = require('./messageStore');

const client = mqtt.connect(mqttAgent.url, mqttAgent.options);

client.on('connect', () => {
    console.log("Connected to MQTT broker");

    client.subscribe(mqttAgent.dataTopic, (err) => {
        if (err) {
            console.error("Error subscribing to topic:", err);
        } else {
            console.log(`Subscribed to topic: ${mqttAgent.dataTopic}`);
        }
    });
});

client.on('error', (err) => {
    console.error("Error connecting to MQTT broker:", err);
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
        await savePayload(payload);
        console.log(`Stored message on topic ${topic}: ${rawMessage}`);
    } catch (err) {
        console.error("Error storing MQTT payload:", err);
    }
});

module.exports = client;
