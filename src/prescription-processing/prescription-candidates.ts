export interface OcrPoint {
  x: number;
  y: number;
}

export type OcrBoundingBox = [OcrPoint, OcrPoint, OcrPoint, OcrPoint];

export interface OcrTextRegion {
  text: string;
  confidence: number | null;
  boundingBox: OcrBoundingBox;
}

export interface CandidateSource {
  page: number | null;
  regionIndex?: number | null;
  boundingBox?: { points: OcrBoundingBox } | null;
}

export interface CandidateField<T = string> {
  value: T | null;
  confidence: number | null;
  source: CandidateSource | null;
}

export interface MedicationCandidate {
  name: CandidateField;
  strength: CandidateField;
  form: CandidateField;
  dose: CandidateField;
  route: CandidateField;
  frequency: CandidateField;
  duration: CandidateField;
  quantity: CandidateField;
  instructions: CandidateField;
}

export interface PrescriptionCandidate {
  prescriptionDate: CandidateField;
  clinician: CandidateField;
  facility: CandidateField;
  medications: MedicationCandidate[];
  warnings: string[];
  reviewRequired: true;
}

export interface OcrPage {
  page: number;
  text: string;
  confidence: number | null;
  regions?: OcrTextRegion[];
}

export interface OcrResult {
  pages: OcrPage[];
  status?: "completed" | "empty";
  languages?: string[];
  modelVersion?: string;
}
