import type { Express } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { api } from "@shared/routes";
import { storage } from "../storage";

export function registerSetupRoutes(app: Express) {
  // ============ Setup Routes ============

  // Check if system is configured
  app.get(api.setup.status.path, async (_req, res) => {
    const users = await storage.getUsers();
    res.json({
      isConfigured: users.length > 0,
      hasUsers: users.length > 0,
    });
  });

  // Complete initial setup - create first admin
  app.post(api.setup.complete.path, async (req, res) => {
    try {
      const users = await storage.getUsers();
      if (users.length > 0) {
        return res.status(409).json({ message: "Система уже настроена" });
      }

      const input = api.setup.complete.input.parse(req.body);
      const passwordHash = await bcrypt.hash(input.password, 10);

      const user = await storage.createUserWithPassword(
        {
          name: input.name,
          email: input.email,
          role: "admin",
          isActive: true,
        },
        passwordHash
      );

      req.session.userId = user.id;

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json({
        success: true,
        user: userWithoutPassword,
      });
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
}
