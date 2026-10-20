import { PrescriptionProcessingService } from "./prescription-processing.service";
import { PrescriptionExtractionController } from "./prescription-processing.controller";

describe("PrescriptionExtractionController", () => {
  const ownerId = "owner-synthetic";
  const documentId = "document-synthetic";
  let processing: {
    getExtraction: jest.Mock;
    reviewExtraction: jest.Mock;
    confirmExtraction: jest.Mock;
    rejectExtraction: jest.Mock;
  };
  let controller: PrescriptionExtractionController;

  beforeEach(() => {
    processing = {
      getExtraction: jest.fn(),
      reviewExtraction: jest.fn(),
      confirmExtraction: jest.fn(),
      rejectExtraction: jest.fn(),
    };
    controller = new PrescriptionExtractionController(
      processing as unknown as PrescriptionProcessingService,
    );
  });

  it("reads extraction using the authenticated owner and document id", () => {
    controller.getExtraction({ user: { id: ownerId } }, documentId);

    expect(processing.getExtraction).toHaveBeenCalledWith(ownerId, documentId);
  });

  it("routes candidate edits to the review service with the authenticated owner", () => {
    const patch = {
      prescriptionDate: { value: "2026-01-01" },
    };

    controller.reviewExtraction({ user: { id: ownerId } }, documentId, patch);

    expect(processing.reviewExtraction).toHaveBeenCalledWith(
      ownerId,
      documentId,
      patch,
    );
  });

  it("routes confirmation to the confirmation service with the authenticated owner", () => {
    const payload = {
      prescriptionDate: { value: "2026-01-01" },
    };

    controller.confirmExtraction({ user: { id: ownerId } }, documentId, payload);

    expect(processing.confirmExtraction).toHaveBeenCalledWith(
      ownerId,
      documentId,
      payload,
    );
  });

  it("routes rejection reason to the rejection service with the authenticated owner", () => {
    controller.rejectExtraction(
      { user: { id: ownerId } },
      documentId,
      { reason: "Synthetic test rejection" },
    );

    expect(processing.rejectExtraction).toHaveBeenCalledWith(
      ownerId,
      documentId,
      "Synthetic test rejection",
    );
  });
});
