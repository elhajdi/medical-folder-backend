import {
  CandidateField,
  MedicationCandidate,
  OcrPage,
  PrescriptionCandidate,
} from "./prescription-candidates";

const MIN_REVIEW_CONFIDENCE = 0.75;

type FieldLabel =
  | "name"
  | "strength"
  | "form"
  | "dose"
  | "route"
  | "frequency"
  | "duration"
  | "quantity"
  | "instructions";

const medicationLabels: Record<FieldLabel, string> = {
  name: "medication|medicine|drug",
  strength: "strength",
  form: "form",
  dose: "dose",
  route: "route",
  frequency: "frequency",
  duration: "duration",
  quantity: "quantity",
  instructions: "instructions",
};

function emptyField<T = string>(): CandidateField<T> {
  return { value: null, confidence: null, source: null };
}

function getExplicitValue(
  text: string,
  labels: string,
  page: OcrPage,
  fieldName: string,
  warnings: Set<string>,
): CandidateField {
  const values: string[] = [];
  const matcher = new RegExp(`^\\s*(?:${labels})\\s*:\\s*(.+?)\\s*$`, "gim");
  for (const match of text.matchAll(matcher)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value) values.push(value);
  }

  if (values.length > 1) {
    warnings.add(`ambiguous_${fieldName}`);
    return {
      value: null,
      confidence: null,
      source: { page: page.page },
    };
  }
  if (values.length === 0) return emptyField();

  const confidence =
    page.confidence !== null &&
    Number.isFinite(page.confidence) &&
    page.confidence >= 0 &&
    page.confidence <= 1
      ? page.confidence
      : null;
  if (confidence === null) warnings.add("confidence_unavailable");
  else if (confidence < MIN_REVIEW_CONFIDENCE) warnings.add("low_confidence");
  return { value: values[0], confidence, source: { page: page.page } };
}

function normalizeDate(
  field: CandidateField,
  warnings: Set<string>,
): CandidateField {
  if (field.value === null) return field;
  const value = field.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    warnings.add("prescription_date_unrecognized");
    return { value: null, confidence: field.confidence, source: field.source };
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    warnings.add("prescription_date_unrecognized");
    return { value: null, confidence: field.confidence, source: field.source };
  }
  return field;
}

function emptyMedication(): MedicationCandidate {
  return {
    name: emptyField(),
    strength: emptyField(),
    form: emptyField(),
    dose: emptyField(),
    route: emptyField(),
    frequency: emptyField(),
    duration: emptyField(),
    quantity: emptyField(),
    instructions: emptyField(),
  };
}

export class PrescriptionParser {
  parse(pages: OcrPage[]): PrescriptionCandidate {
    const warnings = new Set<string>();
    let prescriptionDate: CandidateField = emptyField();
    let clinician: CandidateField = emptyField();
    let facility: CandidateField = emptyField();
    const medications: MedicationCandidate[] = [];

    for (const page of pages) {
      prescriptionDate =
        prescriptionDate.value === null
          ? getExplicitValue(
              page.text,
              "prescription\\s+date|date",
              page,
              "prescription_date",
              warnings,
            )
          : prescriptionDate;
      clinician =
        clinician.value === null
          ? getExplicitValue(
              page.text,
              "clinician|prescriber",
              page,
              "clinician",
              warnings,
            )
          : clinician;
      facility =
        facility.value === null
          ? getExplicitValue(
              page.text,
              "facility|clinic|hospital",
              page,
              "facility",
              warnings,
            )
          : facility;

      const starts = [
        ...page.text.matchAll(/^\s*(?:medication|medicine|drug)\s*:/gim),
      ];
      for (let index = 0; index < starts.length; index++) {
        const start = starts[index].index ?? 0;
        const end = starts[index + 1]?.index ?? page.text.length;
        const block = page.text.slice(start, end);
        const medication = emptyMedication();
        for (const field of Object.keys(medicationLabels) as FieldLabel[]) {
          medication[field] = getExplicitValue(
            block,
            medicationLabels[field],
            page,
            field,
            warnings,
          );
        }
        if (medication.name.value !== null) medications.push(medication);
      }
    }

    prescriptionDate = normalizeDate(prescriptionDate, warnings);
    if (medications.length === 0) warnings.add("medication_not_identified");
    if (prescriptionDate.value === null)
      warnings.add("prescription_date_unknown");
    return {
      prescriptionDate,
      clinician,
      facility,
      medications,
      warnings: [...warnings].sort(),
      reviewRequired: true,
    };
  }
}
