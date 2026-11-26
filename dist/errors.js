export class CapabilityProfilesError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "CapabilityProfilesError";
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map