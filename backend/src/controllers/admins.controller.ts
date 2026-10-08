import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import type { AdminRole } from "@prisma/client";

export async function listAdmins(_req: Request, res: Response) {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: admins });
  } catch (error) {
    console.error("[admins] list error:", error);
    res.status(500).json({ success: false, message: "Failed to list admins" });
  }
}

export async function createAdmin(req: Request, res: Response) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await prisma.admin.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(409).json({ success: false, message: "An admin with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const newAdmin = await prisma.admin.create({
      data: {
        name,
        email: cleanEmail,
        passwordHash,
        role: (role as AdminRole) || "ADMIN",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({ success: true, message: "Admin created successfully", data: newAdmin });
  } catch (error) {
    console.error("[admins] create error:", error);
    res.status(500).json({ success: false, message: "Failed to create admin" });
  }
}

export async function deleteAdmin(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const currentAdminId = (req as Request & { admin?: { id: string } }).admin?.id;

    if (id === currentAdminId) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    }

    const target = await prisma.admin.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    await prisma.admin.delete({ where: { id } });
    res.json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    console.error("[admins] delete error:", error);
    res.status(500).json({ success: false, message: "Failed to delete admin" });
  }
}
