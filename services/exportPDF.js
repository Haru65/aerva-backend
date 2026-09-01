const PDFDocument = require("pdfkit");
const fs = require("fs");
const {reportData} = require("../controller/reportData");
const path = require("path");
const {createWriteStream} = require("fs");

const exportPDF = async (deviceMac,  range) => {
    try {
        const data = await reportData(deviceMac, range);

        if (!data || data.length === 0) {
            throw new Error("No data available for the specified device and range.");
        }
        
        const pdfPath = path.join(__dirname, `../reports/${deviceMac}_${range}.pdf`);
        const doc = new PDFDocument();
        const writeStream = createWriteStream(pdfPath);
        
        doc.pipe(writeStream);
        doc.fontSize(16).text(`Report for Device: ${deviceMac}`, { align: "center" });
        doc.moveDown();
        doc.fontSize(12).text(`Range: ${range}`, { align: "center" });
        doc.moveDown();

        data.forEach((entry, index) => {
            doc.text(`Entry ${index + 1}:`);
            doc.text(`Device Time: ${entry.device_time}`);
            Object.keys(entry.readings).forEach(metric => {
                doc.text(`${metric}: ${entry.readings[metric]}`);
            });
            doc.moveDown();
        });

        doc.end();

        await new Promise((resolve, reject) => {
            writeStream.on("finish", () => resolve(pdfPath));
            writeStream.on("error", reject);
        });
        return pdfPath;
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    }
}

module.exports = { exportPDF };
