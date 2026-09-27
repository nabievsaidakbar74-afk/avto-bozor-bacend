import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { loginRateLimiter } from "../../common/middleware/rate-limit.middleware.js";
import { requireJsonRequest } from "../../common/middleware/json-request.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { authController } from "./auth.controller.js";
import { authValidation } from "./auth.validation.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  loginRateLimiter,
  validate({ body: authValidation.register }),
  authController.register,
);
authRouter.post(
  "/login",
  loginRateLimiter,
  validate({ body: authValidation.login }),
  authController.login,
);
authRouter.post("/refresh", requireJsonRequest, authController.refresh);
authRouter.post("/logout", requireJsonRequest, authController.logout);
authRouter.get("/me", authenticate, requireActiveAccount, authController.me);
