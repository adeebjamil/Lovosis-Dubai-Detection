import { Router } from "express";
import { listAdmins, createAdmin, deleteAdmin } from "../controllers/admins.controller";

export const adminsRouter = Router();

adminsRouter.get("/", listAdmins);
adminsRouter.post("/", createAdmin);
adminsRouter.delete("/:id", deleteAdmin);
