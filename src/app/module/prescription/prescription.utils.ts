import PDFDocument from "pdfkit";
import { envVars } from "../../config/env";
import { TMedicine } from "./prescription.validation";

interface PrescriptionData {
  doctorName: string;
  doctorEmail: string;
  patientName: string;
  patientEmail: string;
  followUpDate: Date;
  instructions: string;
  medicines: TMedicine[];
  prescriptionId: string;
  appointmentDate: Date;
  createdAt: Date;
}

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);

export const generatePrescriptionPDF = async (data: PrescriptionData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const line = () => {
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
      };
      const heading = (text: string) => doc.fontSize(11).font("Helvetica-Bold").text(text);
      const body = (text: string) => doc.fontSize(10).font("Helvetica").text(text);

      // header
      doc.fontSize(22).font("Helvetica-Bold").text("PRESCRIPTION", { align: "center" });
      doc.fontSize(10).font("Helvetica").text("PH Healthcare Service", { align: "center" });
      line();

      heading("Doctor");
      body(`Dr. ${data.doctorName}  ·  ${data.doctorEmail}`);
      doc.moveDown(0.5);
      heading("Patient");
      body(`${data.patientName}  ·  ${data.patientEmail}`);
      doc.moveDown(0.5);
      body(`Appointment: ${formatDate(data.appointmentDate)}    Issued: ${formatDate(data.createdAt)}    Follow-up: ${formatDate(data.followUpDate)}`);
      line();

      // medicines table: name | dose | frequency | duration
      heading("Medicines");
      doc.moveDown(0.3);
      const columns = [
        { title: "Medicine", x: 50, width: 170 },
        { title: "Dose", x: 225, width: 80 },
        { title: "Frequency", x: 310, width: 140 },
        { title: "Duration", x: 455, width: 90 },
      ];
      let y = doc.y;
      doc.fontSize(9).font("Helvetica-Bold");
      columns.forEach((c) => doc.text(c.title, c.x, y, { width: c.width }));
      y = doc.y + 4;
      doc.font("Helvetica");
      data.medicines.forEach((medicine, index) => {
        const values = [`${index + 1}. ${medicine.name}`, medicine.dose, medicine.frequency, medicine.duration];
        const rowHeight = Math.max(
          ...values.map((value, i) => doc.heightOfString(value, { width: columns[i].width })),
        );
        if (y + rowHeight > 760) {
          doc.addPage();
          y = 50;
        }
        values.forEach((value, i) => doc.text(value, columns[i].x, y, { width: columns[i].width }));
        y += rowHeight + 2;
        if (medicine.notes) {
          doc.fontSize(8).fillColor("#555").text(`   ${medicine.notes}`, 50, y, { width: 495 });
          doc.fillColor("black").fontSize(9);
          y = doc.y + 2;
        }
      });
      doc.x = 50;
      doc.y = y;
      line();

      heading("Instructions");
      body(data.instructions);
      line();

      doc
        .fontSize(8)
        .font("Helvetica")
        .text(`Prescription ID: ${data.prescriptionId}`, { align: "center" })
        .text("Electronically generated; no physical signature required.", { align: "center" })
        .text(envVars.FRONTEND_URL, { align: "center" });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
