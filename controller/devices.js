const pool = require("../controller/db_connection");



const AllowedMetrics = {
    temperature: "temperature",
    humidity: "humidity",
    co_ppm: "co_ppm",
    o2_pct: "o2_pct",
    co2_ppm: "co2_ppm",
    pm1_0: "pm1_0",
    pm2_5: "pm2_5",
    pm10: "pm10",
    aqi: "aqi",
    rssi: "rssi"
};

const metricConfig = {
    co2_ppm: {
        column: "co2_ppm",
        title: "Carbon Dioxide",
        category: "GAS",
        unit: "ppm",
        gaugeMin: 0,
        gaugeMax: 3000,
        bands: [
            { label: "GOOD", min: 0, max: 1000, status: "good" },
            { label: "POOR", min: 1000, max: 2000, status: "poor" },
            { label: "BAD", min: 2000, max: 3000, status: "bad" }
        ]
    },

    pm2_5: {
        column: "pm2_5",
        title: "PM2.5",
        category: "AIR",
        unit: "µg/m³",
        gaugeMin: 0,
        gaugeMax: 250,
        bands: [
            { label: "GOOD", min: 0, max: 30, status: "good" },
            { label: "MODERATE", min: 30, max: 60, status: "moderate" },
            { label: "BAD", min: 60, max: 250, status: "bad" }
        ]
    },

    temperature: {
        column: "temperature",
        title: "Temperature",
        category: "CLIMATE",
        unit: "°C",
        gaugeMin: 0,
        gaugeMax: 45,
        bands: [
            { label: "COOL", min: 0, max: 20, status: "cool" },
            { label: "OPTIMAL", min: 20, max: 26, status: "optimal" },
            { label: "WARM", min: 26, max: 45, status: "warm" }
        ]
    },

    humidity: {
        column: "humidity",
        title: "Humidity",
        category: "CLIMATE",
        unit: "%",
        gaugeMin: 0,
        gaugeMax: 100,
        bands: [
            { label: "DRY", min: 0, max: 30, status: "dry" },
            { label: "GOOD", min: 30, max: 60, status: "good" },
            { label: "HUMID", min: 60, max: 100, status: "humid" }
        ]
    },
    co_ppm: {
        column: "co_ppm",
        title: "Carbon Monoxide",
        category: "GAS",
        unit: "ppm",
        gaugeMin: 0,
        gaugeMax:35,
        bands:[
            {label:"GOOD",min:0,max:9,status:"good"},
            {label:"POOR",min:9,max:25,status:"poor"},
            {label:"BAD",min:25,max:35,status:"bad"}
        ]
    },
    o2_pct: {
        column: "o2_pct",
        title: "Oxygen",
        category: "GAS",
        unit: "%",
        gaugeMin: 0,
        gaugeMax: 25, 
        bands: [
            { label: "LOW", min: 0, max: 19.5, status: "low" },
            { label: "GOOD", min: 19.5, max: 23.5, status: "good" },
            { label: "HIGH", min: 23.5, max: 25, status: "high" }
        ]},
    aqi: {
        column: "aqi",
        title: "Air Quality Index",
        category: "AIR",
        unit: "",
        gaugeMin: 0,
        gaugeMax: 300,
        bands: [
            { label: "GOOD", min: 0, max: 50, status: "good" },
            { label: "MODERATE", min: 51, max: 100, status: "moderate" },
            { label: "UNHEALTHY", min: 101, max: 300, status: "poor" },
        ]}
};

const liveAggregateData = async (device_mac,metric,range) => {
    const deviceMac = device_mac;
    
    try {
        if (!AllowedMetrics[metric]) {
            throw new Error("Invalid metric");
        }
        const column = metricConfig[metric]
        if (!column) {
            throw new Error("Metric configuration not found");
        }

        const configColumn = column.column;
        const result = await pool.query(`
            WITH latest AS (
                SELECT ${configColumn} AS latest_value,received_at
                FROM mqtt_payload
                WHERE device_mac = $1
                ORDER BY received_at DESC
                LIMIT 1
                ),
            stats AS (
                SELECT 
                AVG (${configColumn}) AS avg_value,
                MAX (${configColumn}) AS peak_value
                FROM mqtt_payload
                WHERE device_mac = $1 AND received_at  >= NOW() - $2 ::interval     

            )
            SELECT 
            latest.latest_value,
            latest.received_at,
            stats.avg_value,
            stats.peak_value
            
            FROM latest, stats;
        `, 
        [deviceMac, range === "24h" ? "24 hours" : "24 hours" ]);
        const row = result.rows[0];
        if(!row){
            console.error("No data found for the specified device and metric");
            return null;    
        }
        const current = row.latest_value;
        const average_value = row.avg_value;
        const peak_value = row.peak_value;
        const received_at = row.received_at;
        
        return {
            device_mac: deviceMac,
            metric,
            topic: metricConfig[metric].title,
            category: metricConfig[metric].category,
            unit: metricConfig[metric].unit,
            current_value: current,
            
            
            stats: {
                avg_24hr: average_value,
                peak_today: peak_value,
                received_at: received_at
            },
            
            bands : metricConfig[metric].bands,
            gauge: {
                min: column.gaugeMin,
                max: column.gaugeMax,
                
            },

        }}catch (err) {
        console.error("Error retrieving live aggregate data:", err);
        throw err;
    }
};
            
                
                
                
module.exports = { liveAggregateData
};