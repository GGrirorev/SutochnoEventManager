import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcrypt";
import { loginSchema } from "@shared/schema";
import { loginRateLimiter, setupRateLimiter } from "./middleware";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password format" });
      }

      const { email, password } = result.data;
      const user = await storage.getUserByEmail(email);
      
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Аккаунт деактивирован" });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      req.session.userId = user.id;
      
      const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || undefined;
      const userAgent = req.headers['user-agent'] || undefined;
      await storage.recordLoginLog(user.id, ipAddress, userAgent);
      
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Ошибка при выходе" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Выход выполнен" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Не авторизован" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Пользователь не найден" });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.get(api.setup.status.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json({
      isConfigured: users.length > 0,
      hasUsers: users.length > 0,
    });
  });

  app.post(api.setup.complete.path, setupRateLimiter, async (req, res) => {
    try {
      const users = await storage.getUsers();
      if (users.length > 0) {
        return res.status(409).json({ message: "Система уже настроена" });
      }

      const input = api.setup.complete.input.parse(req.body);
      const passwordHash = await bcrypt.hash(input.password, 10);

      const user = await storage.createUserWithPassword({
        name: input.name,
        email: input.email,
        role: "admin",
        isActive: true,
      }, passwordHash);

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
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });
}
