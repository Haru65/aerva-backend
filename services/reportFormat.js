const REPORT_METRICS = {
    temperature: { label: "Temperature", unit: "°C" },
    humidity: { label: "Humidity", unit: "%" },
    co_ppm: { label: "Carbon Monoxide", unit: "ppm" },
    o2_pct: { label: "Oxygen", unit: "%" },
    co2_ppm: { label: "Carbon Dioxide", unit: "ppm" },
    pm1_0: { label: "PM1.0", unit: "µg/m³" },
    pm2_5: { label: "PM2.5", unit: "µg/m³" },
    pm10: { label: "PM10", unit: "µg/m³" },
    rssi: { label: "RSSI", unit: "" },
    aqi: { label: "aqi", unit: "" }
};

function getReportColumns(data) {
    const columns = [
        { header: "ID", key: "id", width: 10 },
        { header: "Device MAC", key: "device_mac", width: 20 },
        { header: "Device Time", key: "device_time", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } }
    ];

    const readings = data?.[0]?.readings || {};
    Object.keys(readings).forEach(metric => {
        const definition = REPORT_METRICS[metric];
        if (!definition) return;

        columns.push({
            header: `${definition.label} (${definition.unit})`,
            key: metric,
            width: 15
        });
    });

    return columns;
}

function toReportRow(row) {
    const result = {
        id: row.id,
        device_mac: row.device_mac,
        device_time: row.device_time
    };

    Object.keys(row.readings || {}).forEach(metric => {
        if (REPORT_METRICS[metric]) result[metric] = row.readings[metric];
    });

    return result;
}

module.exports = { getReportColumns, toReportRow };
