const {reportData} = require("../controller/reportData");
const excelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");

const allowedMetrics = {
    temperature: {
        column: "temperature",
        label: "Temperature",
        unit: "°C"
    },
    humidity: {
        column: "humidity",
        label: "Humidity",
        unit: "%"
    },
    co_ppm: {
        column: "co_ppm",
        label: "Carbon Monoxide",
        unit: "ppm"
    },
    o2_pct: {
        column: "o2_pct",
        label: "Oxygen",
        unit: "%"
    },
    co2_ppm: {
        column: "co2_ppm",
        label: "Carbon Dioxide",
        unit: "ppm"
    },
    pm1_0: {
        column: "pm1_0",
        label: "PM1.0",
        unit: "µg/m³"
    },
    pm2_5: {
        column: "pm2_5",
        label: "PM2.5",
        unit: "µg/m³"
    },
    pm10: {
        column: "pm10",
        label: "PM10",
        unit: "µg/m³"
    },
    rssi: {
        column: "rssi",
        label: "RSSI",
        unit: ""
    },
    aqi: {
        column: "aqi",
        label: "aqi",
        unit: ""
    }
};

const rangeToInterval = {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days"
};

const exportExcel = async (deviceMac, range) => {
    try {
        const data = await reportData(deviceMac, range);
        if (!data || data.length === 0) {
            throw new Error("No data found for the specified device and range");
        }

        const webbook = new excelJS.Workbook();
        const worksheet = webbook.addWorksheet("Aerva Report");

        // Define columns based on allowedMetrics
        const columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Device MAC", key: "device_mac", width: 20 },
            { header: "Received At", key: "received_at", width: 20 , style:{numFmt: "yyyy-mm-dd hh:mm:ss"}},
            
        ];

        // Add metric columns dynamically
        Object.keys(data[0].readings).forEach(metric => {
            if (allowedMetrics[metric]) {
                columns.push({
                    header: `${allowedMetrics[metric].label} (${allowedMetrics[metric].unit})`,
                    key: metric,
                    width: 15
                });
            }
        });

        worksheet.columns = columns;

        // Add rows to the worksheet
        data.forEach(row => {
            const rowData = {
                id: row.id,
                device_mac: row.device_mac,
                received_at: row.received_at,
                timestamp: row.timestamp
            };

            Object.keys(row.readings).forEach(metric => {
                if (allowedMetrics[metric]) {
                    rowData[metric] = row.readings[metric];
                }
            });

            worksheet.addRow(rowData);
        });

        // Save the workbook to a file

        const reportsDir = path.join(process.cwd(), "reports");
        await fs.mkdir(reportsDir, { recursive: true });
        const filePath = `./reports/Aerva_Report_${deviceMac}_${range}.xlsx`;
        await webbook.xlsx.writeFile(filePath);
        return filePath  // Return the file path for further use (e.g., sending as a response)
        console.log(`Excel report generated successfully at ${filePath}`);
    } catch (err) {
        console.error("Error exporting data to Excel:", err);
        throw err;
    }
};

module.exports = { exportExcel };   
