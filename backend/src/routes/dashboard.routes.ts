import { Router } from "express";
import * as dashboard from "../controllers/dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", dashboard.summary);
dashboardRouter.post("/reset", dashboard.resetData);
