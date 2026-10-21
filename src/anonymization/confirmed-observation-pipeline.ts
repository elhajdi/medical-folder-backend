import {
  AnonymizationGateway,
  ApprovedAnonymousObservation,
  CandidateObservation,
  FailClosedAnonymizationGateway,
} from "./anonymization-gateway";

export interface ConfirmedObservationInput {
  reviewStatus: "confirmed" | "unconfirmed";
  category: string;
  value?: string | number;
  unit?: string;
  [key: string]: unknown;
}

export interface AnonymousObservationStore {
  write(observation: ApprovedAnonymousObservation): Promise<void>;
}

const approvedFields = new Set([
  "observation_category",
  "normalized_value",
  "normalized_unit",
  "coarse_period",
  "schema_version",
]);

function validateApproval(observation: ApprovedAnonymousObservation): void {
  const fields = Object.keys(observation);
  const hasUnexpectedField = fields.some((field) => !approvedFields.has(field));
  const validValue =
    observation.normalized_value === undefined ||
    (typeof observation.normalized_value === "number" &&
      Number.isFinite(observation.normalized_value)) ||
    (typeof observation.normalized_value === "string" &&
      observation.normalized_value.length <= 128);

  if (
    hasUnexpectedField ||
    typeof observation.observation_category !== "string" ||
    observation.observation_category.length === 0 ||
    observation.observation_category.length > 64 ||
    typeof observation.schema_version !== "string" ||
    observation.schema_version.length === 0 ||
    observation.schema_version.length > 32 ||
    !validValue ||
    (observation.normalized_unit !== undefined &&
      (typeof observation.normalized_unit !== "string" ||
        observation.normalized_unit.length > 32)) ||
    (observation.coarse_period !== undefined &&
      (typeof observation.coarse_period !== "string" ||
        observation.coarse_period.length > 32))
  ) {
    throw new Error("Privacy gateway returned an invalid approved record");
  }
}

export class ConfirmedObservationPipeline {
  constructor(
    private readonly store: AnonymousObservationStore,
    private readonly gateway: AnonymizationGateway = new FailClosedAnonymizationGateway(),
    private readonly enabled = false,
  ) {}

  async submit(input: ConfirmedObservationInput): Promise<boolean> {
    if (!this.enabled || input.reviewStatus !== "confirmed") return false;

    const candidate: CandidateObservation = {
      category: input.category,
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
    };
    const approved = await this.gateway.approve(candidate);
    if (approved == null) return false;

    validateApproval(approved);
    await this.store.write(approved);
    return true;
  }
}
