import { Router } from "express";
import { getHistory, exportHistoryCsv } from "../controllers/history.controller";

export const historyRouter = Router();

historyRouter.get("/", getHistory);
historyRouter.get("/export", exportHistoryCsv);
