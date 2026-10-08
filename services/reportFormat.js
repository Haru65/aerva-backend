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

const WARNING_STYLE = {
    level: "warning",
    excelFill: "FFF9ED85",
    excelText: "FF7B6F00",
    pdfFill: "#FFFBE0",
    pdfText: "#7B6F00"
};

const DANGER_STYLE = {
    level: "danger",
    excelFill: "FFFFE7E7",
    excelText: "FFB51212",
    pdfFill: "#FFE7E7",
    pdfText: "#B51212"
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

function getReportCellStyle(metric, rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;

    switch (metric) {
        case "aqi":
            if (value < 100) return null;
            return value <= 300 ? WARNING_STYLE : DANGER_STYLE;
        case "pm2_5":
            if (value < 60) return null;
            return value <= 250 ? WARNING_STYLE : DANGER_STYLE;
        case "co2_ppm":
            if (value < 800) return null;
            return value <= 1500 ? WARNING_STYLE : DANGER_STYLE;
        case "co_ppm":
            if (value < 9) return null;
            return value <= 25 ? WARNING_STYLE : DANGER_STYLE;
        case "o2_pct":
            if (value >= 19.5 && value <= 23) return null;
            return value >= 18 && value < 19.5 ? WARNING_STYLE : DANGER_STYLE;
        case "temperature":
            return value >= 20 && value <= 26 ? null : WARNING_STYLE;
        case "humidity":
            return value >= 40 && value <= 60 ? null : WARNING_STYLE;
        default:
            return null;
    }
}

module.exports = { getReportColumns, toReportRow, getReportCellStyle };
