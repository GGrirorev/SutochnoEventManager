import type { Express } from "express";
import { z } from "zod";
import { insertCommentSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAdmin, requireAuth, requirePermission } from "./middleware";

const createCommentSchema = insertCommentSchema
  .pick({
    content: true,
    author: true,
  })
  .partial({ author: true });

export function registerCommentRoutes(app: Express) {
  // Comments - Read (requires auth)
  app.get("/api/events/:id/comments", requireAuth, async (req, res) => {
    const comments = await storage.getComments(Number(req.params.id));
    res.json(comments);
  });

  // Comments - Create (requires auth + canComment)
  app.post("/api/events/:id/comments", requireAuth, requirePermission("canComment"), async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const user = (req as any).user;
      const input = createCommentSchema.parse(req.body);
      const comment = await storage.createComment({
        eventId,
        content: input.content,
        author: user?.name || input.author || "Аноним",
      });
      res.status(201).json(comment);
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

  // Comments - Delete (requires admin role)
  app.delete("/api/comments/:id", requireAuth, requireAdmin, async (req, res) => {
    await storage.deleteComment(Number(req.params.id));
    res.status(204).send();
  });
}
