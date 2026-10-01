import z from "zod";
import { BloodGroup, Gender } from "../../../generated/prisma/enums";

const updatePatientProfileZodSchema = z.strictObject({
  patientInfo: z
    .strictObject({
      name: z
        .string("Name is required")
        .min(5, "Name must be at least 5 characters long")
        .max(30, "Name must be less than 30 characters")
        .optional(),
      profilePhoto: z.url("Profile photo is required").optional(),
      contactNumber: z
        .string("Contact number is required")
        .min(11, "Contact number must be at least 11 characters long")
        .max(14, "Contact number must be less than 14 characters")
        .optional(),
      address: z
        .string("Address is required")
        .max(100, "Address must be less than 100 characters")
        .optional(),
    })
    .optional(),
  patientHealthData: z
    .strictObject({
      gender: z
        .enum([Gender.FEMALE, Gender.MALE], "Gender must be either")
        .optional(),
      dateOfBirth: z
        .string()
        .refine((date) => !isNaN(Date.parse(date)), {
          message: "Date of birth must be a valid date",
        })
        .optional(),
      bloodGroup: z
        .enum(
          [
            BloodGroup.AB_NEGATIVE,
            BloodGroup.AB_POSITIVE,
            BloodGroup.A_NEGATIVE,
            BloodGroup.A_POSITIVE,
            BloodGroup.B_NEGATIVE,
            BloodGroup.B_POSITIVE,
            BloodGroup.O_NEGATIVE,
            BloodGroup.O_POSITIVE,
            BloodGroup.A_NEGATIVE,
          ],
          "Blood group must be either",
        )
        .optional(),
      hasAllergies: z.boolean().optional(),
      hasDiabetes: z.boolean().optional(),
      // free text such as "170 cm" / "65 kg"
      height: z.string().trim().min(1).max(20).optional(),
      weight: z.string().trim().min(1).max(20).optional(),
      smokingStatus: z.boolean().optional(),
      dietaryPreferences: z.string().trim().max(500).optional(),
      mentalHealthHistory: z.string().trim().max(1000).optional(),
      immunizationStatus: z.string().trim().max(500).optional(),
      hasPastSurgeries: z.boolean().optional(),
      pregnancyStatus: z.boolean().optional(),
      maritalStatus: z.string().trim().max(30).optional(),
      recentAnxiety: z.boolean().optional(),
      recentDepression: z.boolean().optional(),
    })
    .optional(),
  patientMedicalReport: z
    .array(
      z.strictObject({
        shouldDelete: z.boolean().optional(),
        reportId: z.uuid().optional(),
        reportName: z.string().optional(),
        reportLink: z.url().optional(),
      }),
    )
    .optional()
    .refine(
      (reports) => {
        // no reports in this update is fine
        if (!reports || reports.length === 0) {
          return true;
        }
        for (const report of reports) {
          if (!report.reportName && report.reportLink) {
            return false;
          }
          if (report.reportName && !report.reportLink) {
            return false;
          }
          if (!report.shouldDelete && report.reportId) {
            return false;
          }
          if (report.shouldDelete && !report.reportId) {
            return false;
          }
        }
        return true;
      },
      {
        message: "Invalid report format",
      },
    ),
});

export const PatientValidation = {
  updatePatientProfileZodSchema,
};
