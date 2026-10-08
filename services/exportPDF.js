const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { reportData } = require("../controller/reportData");
const { getReportColumns, toReportRow, getReportCellStyle } = require("./reportFormat");
const { noReportDataError } = require("./reportErrors");

const PAGE_MARGIN = 24;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 20;

const exportPDF = async (deviceMac, period, tenantId) => {
    try {
        const data = await reportData(deviceMac, period, tenantId);
        if (!data || data.length === 0) {
            throw noReportDataError();
        }

        const reportsDir = path.join(process.cwd(), "reports");
        await fs.promises.mkdir(reportsDir, { recursive: true });
        const label = periodLabel(period);
        const pdfPath = path.join(reportsDir, `Aerva_Report_${deviceMac}_${label}.pdf`);
        const doc = new PDFDocument({
            size: "A3",
            layout: "landscape",
            margin: PAGE_MARGIN,
            info: {
                Title: `Aerva Report - ${deviceMac}`,
                Subject: `Device readings for ${label}`
            }
        });
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        const columns = getReportColumns(data);
        const rows = data.map(toReportRow);
        const columnWidths = calculateColumnWidths(doc, columns);

        drawReportHeading(doc, deviceMac, label);
        let y = drawTableHeader(doc, columns, columnWidths, doc.y + 8);

        rows.forEach(row => {
            if (y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
                doc.addPage();
                y = drawTableHeader(doc, columns, columnWidths, PAGE_MARGIN);
            }
            drawTableRow(doc, columns, columnWidths, row, y);
            y += ROW_HEIGHT;
        });

        doc.end();
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            doc.on("error", reject);
        });
        return pdfPath;
    } catch (error) {
        throw error;
    }
};

function periodLabel(period) {
    return period?.from && period?.to ? `${period.from}_to_${period.to}` : period?.range;
}

function drawReportHeading(doc, deviceMac, range) {
    doc.fillColor("#0A2E50").font("Helvetica-Bold").fontSize(16)
        .text("AERVA Device Report", { align: "center" });
    doc.moveDown(0.25);
    doc.fillColor("#334155").font("Helvetica").fontSize(9)
        .text(`Device MAC: ${deviceMac}    Range: ${range}`, { align: "center" });
}

function calculateColumnWidths(doc, columns) {
    const availableWidth = doc.page.width - (PAGE_MARGIN * 2);
    const fixedWidths = { id: 42, device_mac: 105, device_time: 110 };
    const fixedTotal = columns.reduce((sum, column) => sum + (fixedWidths[column.key] || 0), 0);
    const metricCount = columns.filter(column => !fixedWidths[column.key]).length;
    const metricWidth = metricCount ? (availableWidth - fixedTotal) / metricCount : 0;
    return columns.map(column => fixedWidths[column.key] || metricWidth);
}

function drawTableHeader(doc, columns, widths, y) {
    let x = PAGE_MARGIN;
    doc.font("Helvetica-Bold").fontSize(7);
    columns.forEach((column, index) => {
        drawCell(doc, column.header, x, y, widths[index], HEADER_HEIGHT, {
            fill: "#0A2E50",
            color: "#FFFFFF",
            align: "center"
        });
        x += widths[index];
    });
    return y + HEADER_HEIGHT;
}

function drawTableRow(doc, columns, widths, row, y) {
    let x = PAGE_MARGIN;
    doc.font("Helvetica").fontSize(7);
    columns.forEach((column, index) => {
        const style = getReportCellStyle(column.key, row[column.key]);
        drawCell(doc, formatCellValue(row[column.key]), x, y, widths[index], ROW_HEIGHT, {
            fill: style?.pdfFill || "#FFFFFF",
            color: style?.pdfText || "#142033",
            align: column.key === "device_mac" || column.key === "device_time" ? "left" : "right"
        });
        x += widths[index];
    });
}

function drawCell(doc, value, x, y, width, height, { fill, color, align }) {
    doc.save();
    doc.rect(x, y, width, height).fillAndStroke(fill, "#CBD5E1");
    doc.fillColor(color).text(String(value), x + 3, y + 4, {
        width: width - 6,
        height: height - 6,
        align,
        ellipsis: true
    });
    doc.restore();
}

function formatCellValue(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
    return String(value);
}

module.exports = {
    exportPDF,
    _test: { calculateColumnWidths, formatCellValue }
};
