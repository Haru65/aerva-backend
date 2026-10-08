const {reportData} = require("../controller/reportData");
const excelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");
const { getReportColumns, toReportRow, getReportCellStyle } = require("./reportFormat");
const { noReportDataError } = require("./reportErrors");

const exportExcel = async (deviceMac, period, tenantId) => {
    try {
        const data = await reportData(deviceMac, period, tenantId);
        if (!data || data.length === 0) {
            throw noReportDataError();
        }

        const webbook = new excelJS.Workbook();
        const worksheet = webbook.addWorksheet("Aerva Report");

        const columns = getReportColumns(data);
        worksheet.columns = columns;

        // Add rows to the worksheet
        data.forEach(row => {
            const reportRow = toReportRow(row);
            const worksheetRow = worksheet.addRow(reportRow);
            columns.forEach(column => {
                const style = getReportCellStyle(column.key, reportRow[column.key]);
                if (!style) return;

                const cell = worksheetRow.getCell(column.key);
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: style.excelFill }
                };
                cell.font = {
                    ...cell.font,
                    bold: true,
                    color: { argb: style.excelText }
                };
            });
        });

        // Save the workbook to a file

        const reportsDir = path.join(process.cwd(), "reports");
        await fs.mkdir(reportsDir, { recursive: true });
        const filePath = `./reports/Aerva_Report_${deviceMac}_${periodLabel(period)}.xlsx`;
        await webbook.xlsx.writeFile(filePath);
        return filePath;
    } catch (err) {
        throw err;
    }
};

function periodLabel(period) {
    return period?.from && period?.to ? `${period.from}_to_${period.to}` : period?.range;
}

module.exports = { exportExcel };   
