import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { ROLE_PERMISSIONS, UserRole, User } from "@shared/schema";

export interface AuthenticatedRequest extends Request {
  user: User;
}

type RateLimitEntry = {
  attempts: number[];
  blockedUntil?: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
};

export const createRateLimiter = (options: {
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
  scope: string;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${options.scope}:${ip}`;
    const entry = rateLimitStore.get(key) ?? { attempts: [] };

    if (entry.blockedUntil && entry.blockedUntil > now) {
      console.warn(
        `Brute force blocked (${options.scope}) from ${ip} on ${req.method} ${req.path}`
      );
      return res.status(429).json({ message: "Слишком много попыток. Попробуйте позже." });
    }

    entry.attempts = entry.attempts.filter((timestamp) => now - timestamp < options.windowMs);
    entry.attempts.push(now);

    if (entry.attempts.length > options.maxAttempts) {
      entry.blockedUntil = now + options.blockMs;
      console.warn(
        `Brute force detected (${options.scope}) from ${ip} on ${req.method} ${req.path}`
      );
      rateLimitStore.set(key, entry);
      return res.status(429).json({ message: "Слишком много попыток. Попробуйте позже." });
    }

    rateLimitStore.set(key, entry);
    next();
  };
};

export const loginRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
  scope: "auth-login",
});

export const setupRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
  scope: "auth-setup",
});

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  const host = req.get('Host');
  
  if (!origin && !referer) {
    console.warn('CSRF: Missing Origin/Referer for state-changing request to', req.path);
    return res.status(403).json({ message: "Missing Origin or Referer header" });
  }
  
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isAllowed = originUrl.hostname === 'localhost' || 
                       originUrl.hostname === '127.0.0.1' ||
                       originUrl.hostname.endsWith('.replit.dev') ||
                       originUrl.hostname.endsWith('.repl.co') ||
                       originUrl.hostname.endsWith('.replit.app');
      
      if (!isAllowed && host && !origin.includes(host)) {
        console.warn(`CSRF blocked: Origin ${origin} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid origin" });
    }
  }
  
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer);
      const isAllowed = refererUrl.hostname === 'localhost' || 
                       refererUrl.hostname === '127.0.0.1' ||
                       refererUrl.hostname.endsWith('.replit.dev') ||
                       refererUrl.hostname.endsWith('.repl.co') ||
                       refererUrl.hostname.endsWith('.replit.app');
      
      if (!isAllowed && host && !referer.includes(host)) {
        console.warn(`CSRF blocked: Referer ${referer} doesn't match Host ${host}`);
        return res.status(403).json({ message: "Cross-origin request blocked" });
      }
    } catch (e) {
      return res.status(403).json({ message: "Invalid referer" });
    }
  }
  
  if (req.body && Object.keys(req.body).length > 0) {
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(403).json({ message: "Content-Type must be application/json" });
    }
  }
  
  next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Сессия недействительна" });
  }
  
  (req as AuthenticatedRequest).user = user;
  next();
};

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

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Доступ только для администраторов" });
  }
  next();
};
