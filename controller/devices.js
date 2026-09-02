const pool = require("../controller/db_connection");

const DEFAULT_SPARK = [10, 9, 11, 8, 10, 9, 11, 10];
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function normalizeDeviceMac(deviceMac) {
    return String(deviceMac || "").trim().toUpperCase();
}

function fallbackDeviceName(deviceMac) {
    const mac = normalizeDeviceMac(deviceMac);
    return mac ? `Device ${mac.slice(-4)}` : "AERVA Device";
}

function statusFromAqi(aqi) {
    if (aqi == null || Number.isNaN(Number(aqi))) return "off";
    const value = Number(aqi);
    if (value <= 100) return "green";
    if (value <= 300) return "warn";
    return "bad";
}

function isDeviceOnline(lastSeen) {
    if (!lastSeen) return false;
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isNaN(lastSeenMs)) return false;
    return Date.now() - lastSeenMs <= ONLINE_WINDOW_MS;
}

function rowToDevice(row) {
    const aqi = row.aqi == null ? null : Number(row.aqi);
    const lastSeen = row.last_seen || null;
    const online = isDeviceOnline(lastSeen);
    const airStatus = statusFromAqi(aqi);
    return {
        id: row.device_mac,
        mac: row.device_mac,
        name: row.name || fallbackDeviceName(row.device_mac),
        room: row.room || "other",
        sn: row.serial_number || "",
        aqi,
        status: online ? airStatus : "off",
        airStatus,
        connection_status: online ? "online" : "offline",
        online,
        last_seen: lastSeen,
        device_time: row.device_time || null,
        spark: Array.isArray(row.spark) && row.spark.length ? row.spark : DEFAULT_SPARK,
        metadata: row.metadata || {}
    };
}

const listDeviceMetadata = async () => {
    const result = await pool.query(`
        WITH latest_payload AS (
            SELECT DISTINCT ON (UPPER(TRIM(device_mac)))
                UPPER(TRIM(device_mac)) AS device_mac,
                aqi,
                received_at AS last_seen,
                device_time
            FROM mqtt_payload
            WHERE device_mac IS NOT NULL AND TRIM(device_mac) <> ''
            ORDER BY UPPER(TRIM(device_mac)), received_at DESC
        )
        SELECT
            d.device_mac,
            d.name,
            d.room,
            d.serial_number,
            d.spark,
            d.metadata,
            latest_payload.aqi,
            latest_payload.last_seen,
            latest_payload.device_time
        FROM devices d
        LEFT JOIN latest_payload ON latest_payload.device_mac = UPPER(TRIM(d.device_mac))
        ORDER BY d.created_at ASC, d.name ASC
    `);

    return result.rows.map(rowToDevice);
};

const upsertDeviceMetadata = async ({ device_mac, name, room, sn, serial_number, spark, metadata }) => {
    const deviceMac = normalizeDeviceMac(device_mac);
    if (!deviceMac) {
        throw new Error("device_mac is required");
    }

    const result = await pool.query(`
        INSERT INTO devices (
            device_mac,
            name,
            room,
            serial_number,
            spark,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        ON CONFLICT (device_mac) DO UPDATE SET
            name = EXCLUDED.name,
            room = EXCLUDED.room,
            serial_number = EXCLUDED.serial_number,
            spark = EXCLUDED.spark,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING
            device_mac,
            name,
            room,
            serial_number,
            spark,
            metadata,
            NULL::numeric AS aqi,
            NULL::timestamp AS last_seen,
            NULL::varchar AS device_time
    `, [
        deviceMac,
        String(name || fallbackDeviceName(deviceMac)).trim(),
        String(room || "other").trim(),
        sn || serial_number || null,
        JSON.stringify(Array.isArray(spark) && spark.length ? spark : DEFAULT_SPARK),
        JSON.stringify(metadata || {})
    ]);

    return rowToDevice(result.rows[0]);
};

const updateDeviceMetadata = async (deviceMac, changes) => {
    const currentMac = normalizeDeviceMac(deviceMac);
    if (!currentMac) {
        throw new Error("device_mac is required");
    }

    const current = await pool.query("SELECT * FROM devices WHERE device_mac = $1", [currentMac]);
    const existing = current.rows[0] || {
        device_mac: currentMac,
        name: fallbackDeviceName(currentMac),
        room: "other",
        serial_number: null,
        spark: DEFAULT_SPARK,
        metadata: {}
    };

    return upsertDeviceMetadata({
        device_mac: currentMac,
        name: changes.name ?? existing.name,
        room: changes.room ?? existing.room,
        sn: changes.sn ?? changes.serial_number ?? existing.serial_number,
        spark: changes.spark ?? existing.spark,
        metadata: changes.metadata ?? existing.metadata
    });
};

const deleteDeviceMetadata = async (deviceMac) => {
    const currentMac = normalizeDeviceMac(deviceMac);
    if (!currentMac) {
        throw new Error("device_mac is required");
    }

    const result = await pool.query(
        "DELETE FROM devices WHERE device_mac = $1 RETURNING device_mac",
        [currentMac]
    );

    return result.rowCount > 0;
};

const ensureDeviceMetadata = async (deviceMac) => {
    const currentMac = normalizeDeviceMac(deviceMac);
    if (!currentMac) return null;

    await pool.query(`
        INSERT INTO devices (device_mac, name, room, spark)
        VALUES ($1, $2, 'other', $3::jsonb)
        ON CONFLICT (device_mac) DO NOTHING
    `, [
        currentMac,
        fallbackDeviceName(currentMac),
        JSON.stringify(DEFAULT_SPARK)
    ]);
};



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
            { label: "GREEN", min: 0, max: 800, status: "good" },
            { label: "YELLOW", min: 800, max: 1500, status: "moderate" },
            { label: "RED", min: 1500, max: 3000, status: "bad" }
        ]
    },

    pm2_5: {
        column: "pm2_5",
        title: "PM2.5",
        category: "AIR",
        unit: "µg/m³",
        gaugeMin: 0,
        gaugeMax: 500,
        bands: [
            { label: "GREEN", min: 0, max: 60, status: "good" },
            { label: "YELLOW", min: 60, max: 250, status: "moderate" },
            { label: "RED", min: 250, max: 500, status: "bad" }
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
            {label:"GREEN",min:0,max:9,status:"good"},
            {label:"YELLOW",min:9,max:25,status:"moderate"},
            {label:"RED",min:25,max:35,status:"bad"}
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
            { label: "RED", min: 0, max: 18, status: "bad" },
            { label: "YELLOW", min: 18, max: 19.5, status: "moderate" },
            { label: "GREEN", min: 19.5, max: 23, status: "good" },
            { label: "RED", min: 23, max: 25, status: "bad" }
        ]},
    aqi: {
        column: "aqi",
        title: "Air Quality Index",
        category: "AIR",
        unit: "",
        gaugeMin: 0,
        gaugeMax: 500,
        bands: [
            { label: "GREEN", min: 0, max: 100, status: "good" },
            { label: "YELLOW", min: 100, max: 300, status: "moderate" },
            { label: "RED", min: 300, max: 500, status: "bad" },
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
            
                
                
                
module.exports = {
    liveAggregateData,
    listDeviceMetadata,
    upsertDeviceMetadata,
    updateDeviceMetadata,
    deleteDeviceMetadata,
    ensureDeviceMetadata
};
