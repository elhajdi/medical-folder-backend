export const DocumentType = {
  PRESCRIPTION: 'PRESCRIPTION',
  LAB_RESULT: 'LAB_RESULT',
  MEDICAL_REPORT: 'MEDICAL_REPORT',
  RADIOLOGY: 'RADIOLOGY',
  DISCHARGE_SUMMARY: 'DISCHARGE_SUMMARY',
  VACCINATION: 'VACCINATION',
  OTHER: 'OTHER',
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const MedicationStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type MedicationStatus =
  (typeof MedicationStatus)[keyof typeof MedicationStatus];
