import { decryptOptional, decryptText, encryptOptional, encryptText } from "./fieldEncryption";

// Free-text health notes are encrypted at rest (booleans, dates and the blood group rely on
// the database's disk / backup encryption).
const HEALTH_TEXT_FIELDS = ["dietaryPreferences", "mentalHealthHistory", "immunizationStatus"] as const;

export const encryptHealthData = <T extends object>(data: T): T => {
  const out = { ...data } as Record<string, unknown>;
  for (const field of HEALTH_TEXT_FIELDS) {
    if (typeof out[field] === "string") out[field] = encryptOptional(out[field] as string);
  }
  return out as T;
};

export const decryptHealthData = <T extends object | null | undefined>(data: T): T => {
  if (!data) return data;
  const out = { ...data } as Record<string, unknown>;
  for (const field of HEALTH_TEXT_FIELDS) {
    if (typeof out[field] === "string") out[field] = decryptOptional(out[field] as string);
  }
  return out as T;
};

// medical report names can reveal a condition ("HIV test.pdf"), so they are encrypted too
export const encryptReportName = (name: string) => encryptText(name);
export const decryptReport = <T extends { reportName: string }>(report: T): T => ({ ...report, reportName: decryptText(report.reportName) });
