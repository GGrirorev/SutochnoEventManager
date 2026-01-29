import type { Express } from "express";
import bcrypt from "bcrypt";
import { loginSchema } from "@shared/schema";
import { storage } from "../storage";

export function registerAuthRoutes(app: Express) {
  // ============ Auth Routes ============

  // Login
  app.post("/api/auth/login", async (req, res) => {
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

      // Record login log
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined;
      const userAgent = req.headers["user-agent"] || undefined;
      await storage.recordLoginLog(user.id, ipAddress, userAgent);

      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Ошибка при выходе" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Выход выполнен" });
    });
  });

  // Get current user
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
}
