import type { AccessTokenPayload } from "../common/security/jwt.js";
import type { SafeUser } from "../modules/auth/auth.dto.js";

declare global {
  // Express publishes Request extensions through its global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      actor?: SafeUser;
    }
  }
}

export {};
