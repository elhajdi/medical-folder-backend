/**
 * SECURITY PLACEHOLDER — NOT AN ANONYMIZATION ALGORITHM.
 *
 * Unknown fields and unreviewed schemas must be rejected. Do not implement a
 * pass-through "anonymizer". Require privacy review, an allowlisted schema,
 * re-identification risk testing, and a documented purpose before enabling writes.
 */
export interface CandidateObservation {
  category: string;
  value?: string | number;
  unit?: string;
  observedAt?: string;
  [key: string]: unknown;
}

export interface ApprovedAnonymousObservation {
  observation_category: string;
  normalized_value?: string | number;
  normalized_unit?: string;
  coarse_period?: string;
  schema_version: string;
}

export interface AnonymizationGateway {
  approve(
    candidate: CandidateObservation,
  ): Promise<ApprovedAnonymousObservation | null>;
}

export class FailClosedAnonymizationGateway implements AnonymizationGateway {
  async approve(
    _candidate: CandidateObservation,
  ): Promise<ApprovedAnonymousObservation | null> {
    // No observation is approved until a reviewed policy is implemented.
    return null;
  }
}
