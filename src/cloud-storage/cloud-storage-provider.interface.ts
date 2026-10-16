/**
 * Provider-neutral contract for user-authorized cloud storage.
 * Implementations must verify access, enforce limits, and never mutate source files.
 * This is an architectural interface; adapt signatures to the project's framework/SDK.
 */
export interface AuthorizedCloudFile {
  providerFileId: string;
  displayName: string;
  mimeType: string;
  sizeBytes?: number;
  modifiedTime?: string;
}

export interface DownloadedCloudFile {
  stream: AsyncIterable<Uint8Array>;
  mimeType: string;
  sizeBytes?: number;
}

export interface CloudStorageProvider {
  readonly providerName: 'google-drive' | 'microsoft-onedrive';

  listAuthorizedFiles(connectionRef: string, options?: {
    pageToken?: string;
    pageSize?: number;
  }): Promise<{ files: AuthorizedCloudFile[]; nextPageToken?: string }>;

  downloadAuthorizedFile(
    connectionRef: string,
    providerFileId: string,
  ): Promise<DownloadedCloudFile>;

  getFileMetadata(
    connectionRef: string,
    providerFileId: string,
  ): Promise<AuthorizedCloudFile>;

  revokeConnection(connectionRef: string): Promise<void>;
}
