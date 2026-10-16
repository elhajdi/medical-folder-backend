import {
  AuthorizedCloudFile,
  CloudStorageProvider,
  DownloadedCloudFile,
} from '../cloud-storage-provider.interface';

/**
 * SECURITY PLACEHOLDER — NOT A WORKING GOOGLE DRIVE INTEGRATION.
 *
 * Implement only after OAuth consent, least-privilege scopes, token storage,
 * account/file authorization, quota, timeout, file-size/type validation,
 * and security tests are approved. This intentionally fails closed.
 */
export class GoogleDriveProvider implements CloudStorageProvider {
  readonly providerName = 'google-drive' as const;

  async listAuthorizedFiles(
    _connectionRef: string,
    _options?: { pageToken?: string; pageSize?: number },
  ): Promise<{ files: AuthorizedCloudFile[]; nextPageToken?: string }> {
    throw new Error('Google Drive integration is not implemented. Fail closed.');
  }

  async downloadAuthorizedFile(
    _connectionRef: string,
    _providerFileId: string,
  ): Promise<DownloadedCloudFile> {
    throw new Error('Google Drive integration is not implemented. Fail closed.');
  }

  async getFileMetadata(
    _connectionRef: string,
    _providerFileId: string,
  ): Promise<AuthorizedCloudFile> {
    throw new Error('Google Drive integration is not implemented. Fail closed.');
  }

  async revokeConnection(_connectionRef: string): Promise<void> {
    throw new Error('Google Drive credential revocation is not implemented. Fail closed.');
  }
}
