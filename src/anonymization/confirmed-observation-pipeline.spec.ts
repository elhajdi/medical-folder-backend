import { describe, expect, it, jest } from "@jest/globals";
import {
  AnonymizationGateway,
  ApprovedAnonymousObservation,
  CandidateObservation,
} from "./anonymization-gateway";
import {
  AnonymousObservationStore,
  ConfirmedObservationPipeline,
} from "./confirmed-observation-pipeline";

describe("ConfirmedObservationPipeline", () => {
  const approved: ApprovedAnonymousObservation = {
    observation_category: "synthetic-category",
    normalized_value: 12,
    normalized_unit: "synthetic-unit",
    schema_version: "test-v1",
  };

  function createPipeline(options?: {
    enabled?: boolean;
    approval?: ApprovedAnonymousObservation | null;
    approve?: (
      candidate: CandidateObservation,
    ) => Promise<ApprovedAnonymousObservation | null>;
  }) {
    const store: AnonymousObservationStore = {
      write: jest.fn(async () => undefined),
    };
    const gateway: AnonymizationGateway = {
      approve:
        options?.approve ?? jest.fn(async () => options?.approval ?? null),
    };
    return {
      pipeline: new ConfirmedObservationPipeline(
        store,
        gateway,
        options?.enabled ?? false,
      ),
      store,
      gateway,
    };
  }

  it("is disabled by default and never asks the gateway to approve a record", async () => {
    const { pipeline, gateway, store } = createPipeline({ approval: approved });

    await expect(
      pipeline.submit({
        reviewStatus: "confirmed",
        category: "synthetic-category",
      }),
    ).resolves.toBe(false);
    expect(gateway.approve).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed records without calling the gateway or store", async () => {
    const { pipeline, gateway, store } = createPipeline({
      enabled: true,
      approval: approved,
    });

    await expect(
      pipeline.submit({
        reviewStatus: "unconfirmed",
        category: "synthetic-category",
      }),
    ).resolves.toBe(false);
    expect(gateway.approve).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("writes nothing when the privacy gateway rejects or cannot approve a record", async () => {
    const { pipeline, store } = createPipeline({ enabled: true });

    await expect(
      pipeline.submit({
        reviewStatus: "confirmed",
        category: "synthetic-category",
      }),
    ).resolves.toBe(false);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("does not write when the privacy gateway errors", async () => {
    const { pipeline, store } = createPipeline({
      enabled: true,
      approve: jest.fn(async () => {
        throw new Error("synthetic gateway failure");
      }),
    });

    await expect(
      pipeline.submit({
        reviewStatus: "confirmed",
        category: "synthetic-category",
      }),
    ).rejects.toThrow("synthetic gateway failure");
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects gateway results that contain fields outside the approved schema", async () => {
    const { pipeline, store } = createPipeline({
      enabled: true,
      approve: jest.fn(async () => ({
        ...approved,
        patientId: "synthetic-owner",
      })),
    });

    await expect(
      pipeline.submit({
        reviewStatus: "confirmed",
        category: "synthetic-category",
      }),
    ).rejects.toThrow("Privacy gateway returned an invalid approved record");
    expect(store.write).not.toHaveBeenCalled();
  });

  it("passes only the candidate allowlist to the gateway and stores only its approval", async () => {
    const approve = jest.fn(async () => approved);
    const { pipeline, gateway, store } = createPipeline({
      enabled: true,
      approve,
    });
    const input = {
      reviewStatus: "confirmed" as const,
      category: "synthetic-category",
      value: 12,
      unit: "synthetic-unit",
      observedAt: "2026-01-01T00:00:00.000Z",
      patientId: "synthetic-owner",
      sourceDocumentId: "synthetic-document",
      narrative: "synthetic narrative",
    };

    await expect(pipeline.submit(input)).resolves.toBe(true);

    expect(gateway.approve).toHaveBeenCalledWith({
      category: "synthetic-category",
      value: 12,
      unit: "synthetic-unit",
    });
    expect(store.write).toHaveBeenCalledWith(approved);
  });
});
