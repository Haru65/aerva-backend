const {reportData} = require("../controller/reportData");
const excelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");
const { getReportColumns, toReportRow } = require("./reportFormat");

const exportExcel = async (deviceMac, period, tenantId) => {
    try {
        const data = await reportData(deviceMac, period, tenantId);
        if (!data || data.length === 0) {
            throw new Error("No data found for the specified device and range");
        }

        const webbook = new excelJS.Workbook();
        const worksheet = webbook.addWorksheet("Aerva Report");

        worksheet.columns = getReportColumns(data);

        // Add rows to the worksheet
        data.forEach(row => worksheet.addRow(toReportRow(row)));

        // Save the workbook to a file

        const reportsDir = path.join(process.cwd(), "reports");
        await fs.mkdir(reportsDir, { recursive: true });
        const filePath = `./reports/Aerva_Report_${deviceMac}_${periodLabel(period)}.xlsx`;
        await webbook.xlsx.writeFile(filePath);
        return filePath;
    } catch (err) {
        console.error("Error exporting data to Excel:", err);
        throw err;
    }
};

function periodLabel(period) {
    return period?.from && period?.to ? `${period.from}_to_${period.to}` : period?.range;
}

module.exports = { exportExcel };   
