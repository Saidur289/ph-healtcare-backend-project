import z from "zod";
import { BloodGroup, Gender } from "../../../generated/prisma/enums";

const updatePatientProfileZodSchema = z.object({
  patientInfo: z
    .object({
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
    .object({
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
      height: z.string().optional(),
      weight: z.string().optional(),
      smokingStatus: z.boolean().optional(),
      dietaryPreferences: z.string().optional(),
      mentalHealthHistory: z.string().optional(),
      immunizationStatus: z.string().optional(),
      hasPastSurgeries: z.boolean().optional(),
      pregnancyStatus: z.boolean().optional(),
      maritalStatus: z.string().optional(),
      recentAnxiety: z.boolean().optional(),
      recentDepression: z.boolean().optional(),
    })
    .optional(),
  patientMedicalReport: z
    .array(
      z.object({
        shouldDelete: z.boolean().optional(),
        reportId: z.uuid().optional(),
        reportName: z.string().optional(),
        reportLink: z.url().optional(),
      }),
    )
    .optional()
    .refine(
      (reports) => {
        if (!reports || reports.length === 0) {
          return false;
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
