import { Router } from "express";
import { getDailyReport, getWeeklyReport, exportReportCsv } from "../controllers/reports.controller";

export const reportsRouter = Router();

reportsRouter.get("/daily", getDailyReport);
reportsRouter.get("/weekly", getWeeklyReport);
reportsRouter.get("/export", exportReportCsv);
