import { describe, expect, it } from "@jest/globals";
import { GoogleDriveProvider } from "./google-drive.provider";

describe("GoogleDriveProvider fail-closed boundary", () => {
  const provider = new GoogleDriveProvider();

  it("does not claim to upload without an implemented OAuth and credential store", async () => {
    await expect(
      provider.uploadUserSelectedFile("synthetic-connection", {
        filename: "synthetic.pdf",
        mimeType: "application/pdf",
        sizeBytes: 8,
        content: (async function* () {
          yield Buffer.from("synthetic");
        })(),
      }),
    ).rejects.toThrow("Google Drive integration is not implemented");
  });

  it("keeps listing, download, metadata, and revoke operations fail-closed", async () => {
    await expect(
      provider.listAuthorizedFiles("synthetic-connection"),
    ).rejects.toThrow("Google Drive integration is not implemented");
    await expect(
      provider.downloadAuthorizedFile("synthetic-connection", "synthetic-file"),
    ).rejects.toThrow("Google Drive integration is not implemented");
    await expect(
      provider.getFileMetadata("synthetic-connection", "synthetic-file"),
    ).rejects.toThrow("Google Drive integration is not implemented");
    await expect(
      provider.revokeConnection("synthetic-connection"),
    ).rejects.toThrow("Google Drive credential revocation is not implemented");
  });
});
