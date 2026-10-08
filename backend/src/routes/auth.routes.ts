import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import * as auth from "../controllers/auth.controller";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, auth.login);
authRouter.post("/refresh", refreshLimiter, auth.refresh);
authRouter.post("/logout", auth.logout);
authRouter.post("/logout-all", requireAuth, auth.logoutAll);
authRouter.get("/me", requireAuth, auth.me);
authRouter.post("/change-password", requireAuth, auth.changePassword);
