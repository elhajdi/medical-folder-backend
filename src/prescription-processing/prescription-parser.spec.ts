import { describe, expect, it } from "@jest/globals";
import { PrescriptionParser } from "./prescription-parser";

describe("PrescriptionParser", () => {
  const parser = new PrescriptionParser();

  it("extracts only explicit labeled values and retains page provenance", () => {
    const candidate = parser.parse([
      {
        page: 2,
        confidence: 0.96,
        text: [
          "Prescription date: 2026-05-12",
          "Clinician: Synthetic Clinician",
          "Facility: Example Clinic",
          "Medication: Example medicine",
          "Strength: 10 mg",
          "Form: tablet",
          "Dose: one tablet",
          "Route: oral",
          "Frequency: twice daily",
          "Duration: 5 days",
          "Quantity: 10",
          "Instructions: Take with food",
        ].join("\n"),
      },
    ]);

    expect(candidate).toEqual({
      prescriptionDate: {
        value: "2026-05-12",
        confidence: 0.96,
        source: { page: 2 },
      },
      clinician: {
        value: "Synthetic Clinician",
        confidence: 0.96,
        source: { page: 2 },
      },
      facility: {
        value: "Example Clinic",
        confidence: 0.96,
        source: { page: 2 },
      },
      medications: [
        {
          name: {
            value: "Example medicine",
            confidence: 0.96,
            source: { page: 2 },
          },
          strength: {
            value: "10 mg",
            confidence: 0.96,
            source: { page: 2 },
          },
          form: {
            value: "tablet",
            confidence: 0.96,
            source: { page: 2 },
          },
          dose: {
            value: "one tablet",
            confidence: 0.96,
            source: { page: 2 },
          },
          route: {
            value: "oral",
            confidence: 0.96,
            source: { page: 2 },
          },
          frequency: {
            value: "twice daily",
            confidence: 0.96,
            source: { page: 2 },
          },
          duration: {
            value: "5 days",
            confidence: 0.96,
            source: { page: 2 },
          },
          quantity: {
            value: "10",
            confidence: 0.96,
            source: { page: 2 },
          },
          instructions: {
            value: "Take with food",
            confidence: 0.96,
            source: { page: 2 },
          },
        },
      ],
      warnings: [],
      reviewRequired: true,
    });
  });

  it("retains OCR region provenance and region-level OCR scores", () => {
    const candidate = parser.parse([
      {
        page: 1,
        text: "Medication: Synthetic medicine",
        confidence: 0.8,
        regions: [
          {
            text: "Medication: Synthetic medicine",
            confidence: 0.93,
            boundingBox: [
              { x: 10, y: 20 },
              { x: 200, y: 20 },
              { x: 200, y: 50 },
              { x: 10, y: 50 },
            ],
          },
        ],
      },
    ]);

    expect(candidate.medications[0].name).toEqual({
      value: "Synthetic medicine",
      confidence: 0.93,
      source: {
        page: 1,
        regionIndex: 0,
        boundingBox: {
          points: [
            { x: 10, y: 20 },
            { x: 200, y: 20 },
            { x: 200, y: 50 },
            { x: 10, y: 50 },
          ],
        },
      },
    });
  });

  it("keeps missing fields unknown and ambiguous values null", () => {
    const candidate = parser.parse([
      {
        page: 1,
        confidence: null,
        text: [
          "Medication: Synthetic medicine",
          "Frequency: once daily",
          "Frequency: twice daily",
        ].join("\n"),
      },
    ]);

    expect(candidate.prescriptionDate.value).toBeNull();
    expect(candidate.medications[0].dose.value).toBeNull();
    expect(candidate.medications[0].strength.value).toBeNull();
    expect(candidate.medications[0].frequency).toEqual({
      value: null,
      confidence: null,
      source: { page: 1 },
    });
    expect(candidate.warnings).toContain("ambiguous_frequency");
    expect(candidate.warnings).toContain("prescription_date_unknown");
    expect(candidate.reviewRequired).toBe(true);
  });

  it("marks low confidence for review without filling missing directions", () => {
    const candidate = parser.parse([
      {
        page: 3,
        confidence: 0.42,
        text: "Medication: Synthetic medicine",
      },
    ]);

    expect(candidate.medications[0].name.confidence).toBe(0.42);
    expect(candidate.medications[0].dose.value).toBeNull();
    expect(candidate.warnings).toContain("low_confidence");
    expect(candidate.reviewRequired).toBe(true);
  });

  it("does not normalize an unrecognized prescription date by guessing", () => {
    const candidate = parser.parse([
      {
        page: 1,
        confidence: 0.9,
        text: "Date: 12/05/26\nMedication: Synthetic medicine",
      },
    ]);

    expect(candidate.prescriptionDate.value).toBeNull();
    expect(candidate.warnings).toContain("prescription_date_unrecognized");
  });

  it("keeps impossible calendar dates unknown", () => {
    const candidate = parser.parse([
      {
        page: 1,
        confidence: 0.9,
        text: "Date: 2026-13-40\nMedication: Synthetic medicine",
      },
    ]);

    expect(candidate.prescriptionDate.value).toBeNull();
    expect(candidate.warnings).toContain("prescription_date_unrecognized");
  });
});
