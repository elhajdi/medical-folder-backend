export interface CandidateSource {
  page: number | null;
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
}

export interface OcrResult {
  pages: OcrPage[];
}
