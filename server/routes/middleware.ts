import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { ROLE_PERMISSIONS, UserRole, User } from "@shared/schema";

// Extend Express Request to include authenticated user
export interface AuthenticatedRequest extends Request {
  user: User;
}

// CSRF protection middleware for state-changing requests
// Validates Origin/Referer header and Content-Type for cookie-based sessions
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Only check state-changing methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // For state-changing requests, require either Origin or Referer header
  const origin = req.get("Origin");
  const referer = req.get("Referer");
  const host = req.get("Host");

  // Must have at least Origin or Referer for all state-changing browser requests
  // This protects against CSRF even for login/setup endpoints
  if (!origin && !referer) {
    console.warn("CSRF: Missing Origin/Referer for state-changing request to", req.path);
    return res.status(403).json({ message: "Missing Origin or Referer header" });
  }

  // Validate Origin if present
  if (origin) {
    try {
      const originUrl = new URL(origin);
      // In development, allow localhost and Replit domains
      const isAllowed =
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1" ||
        originUrl.hostname.endsWith(".replit.dev") ||
        originUrl.hostname.endsWith(".repl.co") ||
        originUrl.hostname.endsWith(".replit.app");

      // In production, strictly compare origin with host
      if (!isAllowed && host && !origin.includes(host)) {
        console.warn(`CSRF blocked: Origin ${origin} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid origin" });
    }
  }

  // Validate Referer if Origin not present
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer);
      const isAllowed =
        refererUrl.hostname === "localhost" ||
        refererUrl.hostname === "127.0.0.1" ||
        refererUrl.hostname.endsWith(".replit.dev") ||
        refererUrl.hostname.endsWith(".repl.co") ||
        refererUrl.hostname.endsWith(".replit.app");

      if (!isAllowed && host && !referer.includes(host)) {
        console.warn(`CSRF blocked: Referer ${referer} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid referer" });
    }
  }

  // Validate Content-Type for requests with body
  if (req.body && Object.keys(req.body).length > 0) {
    const contentType = req.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      return res.status(403).json({ message: "Content-Type must be application/json" });
    }
  }

  next();
};

// Authentication middleware - requires valid session
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Сессия недействительна" });
  }

  // Attach user to request for downstream use
  (req as AuthenticatedRequest).user = user;
  next();
};

// Role-based access control middleware factory
export const requirePermission = (permission: keyof typeof ROLE_PERMISSIONS.admin) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ message: "Требуется авторизация" });
    }

    const userPermissions = ROLE_PERMISSIONS[user.role as UserRole];
    if (!userPermissions || !userPermissions[permission]) {
      return res.status(403).json({ message: "Недостаточно прав для выполнения операции" });
    }

    next();
  };
};

// Admin-only middleware (shortcut)
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Доступ только для администраторов" });
  }
  next();
};
