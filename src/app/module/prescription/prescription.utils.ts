import PDFDocument from "pdfkit";
import { envVars } from "../../config/env";
interface PrescriptionData {
  doctorName: string;
  doctorEmail: string;
  patientName: string;
  patientEmail: string;
  followUpDate: Date;
  instructions: string;
  prescriptionId: string;
  appointmentDate: Date;
  createdAt: Date;
}

export const generatePrescriptionPDF = async (
  prescriptionData: PrescriptionData,
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
        .text("PRESCRIPTION", { align: "center" });
      doc.moveDown(0.5);
      // Doctor and Patient Information
      doc
        .fontSize(10)
        .font("Helvetica ")
        .text("PH Healthcare Service", { align: "center" });
      doc.text("Your Health, Our Priority", { align: "center" });
      doc.moveDown(1);
      //horizontal line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.fontSize(10).font("Helvetica-Bold").text("Doctor Information");
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`Name: ${prescriptionData.doctorName}`);
      doc.text(`Email: ${prescriptionData.doctorEmail}`);
      doc.moveDown(0.8);
      doc.fontSize(10).font("Helvetica-Bold").text("Patient Information");
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`Name: ${prescriptionData.patientName}`);
      doc.text(`Email: ${prescriptionData.patientEmail}`);
      doc.moveDown(0.8);
      doc.fontSize(10).font("Helvetica-Bold").text("Prescription Details");
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(
          `Follow-up Date: ${prescriptionData.followUpDate.toDateString()}`,
        );
      doc.text(`Instructions: ${prescriptionData.instructions}`);
      doc.moveDown(0.8);
      doc.fontSize(10).font("Helvetica-Bold").text("Additional Information");
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`Prescription ID: ${prescriptionData.prescriptionId}`);
      doc.text(
        `Appointment Date: ${prescriptionData.appointmentDate.toLocaleDateString()}`,
      );
      doc.text(
        `Issued Date: ${new Date(prescriptionData.createdAt).toLocaleDateString()}`,
      );
      if (prescriptionData.followUpDate) {
        doc.text(
          `Follow-up Date: ${prescriptionData.followUpDate.toLocaleDateString()}`,
        );
      }
      doc.moveDown(1);
      //horizontal line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      // instruction medication
      doc.text(prescriptionData.instructions, {
        align: "left",
        width: 445,
      });
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      // Footer
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          "This prescription is electronically generated and does not require a physical signature.",
          { align: "center" },
        );
      doc.text(`For more information, visit: ${envVars.FRONTEND_URL}`, {
        align: "center",
      });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
