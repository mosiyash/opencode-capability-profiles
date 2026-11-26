export type CapabilityProfilesErrorCode =
  | "INVALID_ARGUMENT"
  | "UNSAFE_PATH"
  | "WRITE_FAILED"
  | "LOCK_TIMEOUT"
  | "PLAN_CHANGED"
  | "CONFIRMATION_REQUIRED"
  | "CONFLICT_DECISION_REQUIRED";

export class CapabilityProfilesError extends Error {
  readonly code: CapabilityProfilesErrorCode;

  constructor(code: CapabilityProfilesErrorCode, message: string) {
    super(message);
    this.name = "CapabilityProfilesError";
    this.code = code;
  }
}
