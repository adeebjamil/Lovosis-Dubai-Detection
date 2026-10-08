import { Router } from "express";
import { getModels, trainAttireModel } from "../controllers/models.controller";

export const modelsRouter = Router();

modelsRouter.get("/", getModels);
modelsRouter.post("/train", trainAttireModel);
