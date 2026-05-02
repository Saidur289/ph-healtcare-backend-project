import PDFDocument from "pdfkit";
interface InvoiceData {
  invoiceId: string;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  appointmentDate: string;
  amount: number;
  transactionId: string;
  paymentDate: string;
}
export const generateInvoicePDF = async (
  data: InvoiceData,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });
      doc.on("end", () => {
        const result = Buffer.concat(chunks);
        resolve(result);
      });
      doc.on("error", (err) => {
        reject(err);
      });
      // Title

      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("INVOICE", { align: "center" });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .font("Helvetica ")
        .text("PH Healthcare Service", { align: "center" });
      doc.text("Your Health, Our Priority", { align: "center" });
      doc.moveDown(1);
      //horizontal line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      //Invoice Details -left side
      doc.fontSize(11).font("Helvetica-Bold").text("Invoice Details");
      doc.fontSize(10).font("Helvetica").text(`Invoice ID: ${data.invoiceId}`);
      doc.text(`Transaction ID: ${data.transactionId}`);
      doc.text(`Payment Date: ${data.paymentDate}`);
      doc.moveDown(0.8);
      //Patient Details - right side
      doc.fontSize(11).font("Helvetica-Bold").text("Patient Details");
      doc.fontSize(10).font("Helvetica").text(`Name: ${data.patientName}`);
      doc.text(`Email: ${data.patientEmail}`);
      doc.moveDown(0.8);
      //Doctor Details
      doc.fontSize(11).font("Helvetica-Bold").text("Doctor Details");
      doc.fontSize(10).font("Helvetica").text(`Name: ${data.doctorName}`);
      //   appointment details
      doc.moveDown(0.8);
      doc.fontSize(11).font("Helvetica-Bold").text("Appointment Details");
      doc.fontSize(10).font("Helvetica").text(`Date: ${data.appointmentDate}`);
      doc.moveDown(1);
      //   horizontal line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
      //   amount table
      const tableTop = doc.y;
      const col1X = 50;
      const col2X = 450;
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("Description", col1X, tableTop);
      doc.moveDown(0.8);
      //table header
      const headerY = doc.y;
      doc.fontSize(10).font("Helvetica");
      doc.text("Description", col1X, headerY);
      doc.text("Amount", col2X, headerY, { align: "right" });

      //separator line
      doc
        .moveTo(col1X, doc.y)
        .lineTo(col2X + 80, doc.y)
        .stroke();
      doc.moveDown(0.5);
      //   amount row
      const amountY = doc.y;
      doc.fontSize(10).font("Helvetica");
      doc.text("Consultation Fee", col1X, amountY);
      doc.text(`$${data.amount.toFixed(2)} BDT`, col2X, amountY, {
        align: "right",
      });
      doc.moveDown(0.8);
      // Total Row
      const totalY = doc.y;
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text("Total Amount", col1X, totalY);
      doc.text(`${data.amount.toFixed(2)} BDT`, col2X, totalY, {
        align: "right",
      });

      // Separator line
      doc
        .moveTo(col1X, doc.y)
        .lineTo(col2X + 80, doc.y)
        .stroke();

      doc.moveDown(1.5);

      // Footer
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          "Thank you for choosing PH Healthcare. This is an electronically generated invoice.",
          {
            align: "center",
          },
        );

      doc.text(
        "If you have any questions, please contact us at support@ph-healthcare.com",
        {
          align: "center",
        },
      );

      doc.text("Payment processed securely through Stripe", {
        align: "center",
      });

      // End the document
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
