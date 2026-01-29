import type { Express } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "./middleware";

export function registerUserRoutes(app: Express) {
  // Users API - All user management requires admin role (canManageUsers)
  app.get(api.users.list.path, requireAuth, requirePermission("canManageUsers"), async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get(api.users.get.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.post(api.users.create.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);

      // Check if email already exists
      const existing = await storage.getUserByEmail(input.email);
      if (existing) {
        return res.status(400).json({ message: "Email already exists", field: "email" });
      }

      // Hash password
      const { password, ...userData } = input;
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await storage.createUserWithPassword(userData, passwordHash);
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.patch(api.users.update.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }

      const input = api.users.update.input.parse(req.body);

      // Check email uniqueness if email is being changed
      if (input.email && input.email !== existing.email) {
        const emailExists = await storage.getUserByEmail(input.email);
        if (emailExists) {
          return res.status(400).json({ message: "Email already exists", field: "email" });
        }
      }

      // Handle password update
      const { password, ...userData } = input;
      let passwordHash: string | undefined;
      if (password) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      const user = await storage.updateUser(id, userData, passwordHash);
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.delete(api.users.delete.path, requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getUser(id);
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.deleteUser(id);
    res.status(204).send();
  });

  // User login logs API (admin only)
  app.get("/api/login-logs", requireAuth, requirePermission("canManageUsers"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getLoginLogs(limit, offset);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch login logs:", error);
      res.status(500).json({ message: "Failed to fetch login logs" });
    }
  });
}
