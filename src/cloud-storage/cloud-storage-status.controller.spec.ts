import { describe, expect, it } from "@jest/globals";
import { CloudStorageStatusController } from "./cloud-storage-status.controller";

describe("CloudStorageStatusController", () => {
  it("reports unavailable integrations without claiming a connection or approval", () => {
    expect(new CloudStorageStatusController().getStatus()).toEqual({
      googleDrive: {
        state: "disabled",
        reasonCode: "PROVIDER_NOT_CONFIGURED",
      },
      anonymousData: {
        state: "disabled",
        reasonCode: "PRIVACY_GATE_NOT_APPROVED",
      },
    });
  });
});
