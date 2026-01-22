import { db } from "./db";
import {
  events,
  type Event,
  type InsertEvent,
  type UpdateEventRequest,
  type StatusSummary,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS
} from "@shared/schema";
import { eq, ilike, and, desc } from "drizzle-orm";

export interface IStorage {
  getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    status?: string;
  }): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: UpdateEventRequest): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  getStats(): Promise<{
    total: number;
    byImplementationStatus: Record<string, number>;
    byValidationStatus: Record<string, number>;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getEvents(filters?: {
    search?: string;
    category?: string;
    platform?: string;
    status?: string;
  }): Promise<Event[]> {
    const conditions = [];

    if (filters?.search) {
      conditions.push(ilike(events.name, `%${filters.search}%`));
    }
    if (filters?.category) {
      conditions.push(eq(events.category, filters.category));
    }
    if (filters?.platform) {
      conditions.push(sql`${events.platforms} @> ARRAY[${filters.platform}]::text[]`);
    }
    if (filters?.status) {
      conditions.push(eq(events.implementationStatus, filters.status));
    }

    return await db.select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.createdAt));
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(insertEvent).returning();
    return event;
  }

  async updateEvent(id: number, updates: UpdateEventRequest): Promise<Event> {
    const [event] = await db.update(events)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return event;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async getStats(): Promise<{
    total: number;
    byImplementationStatus: Record<string, number>;
    byValidationStatus: Record<string, number>;
  }> {
    const allEvents = await db.select().from(events);
    
    const byImplementationStatus: Record<string, number> = {};
    IMPLEMENTATION_STATUS.forEach(s => byImplementationStatus[s] = 0);
    
    const byValidationStatus: Record<string, number> = {};
    VALIDATION_STATUS.forEach(s => byValidationStatus[s] = 0);

    allEvents.forEach(event => {
      byImplementationStatus[event.implementationStatus] = (byImplementationStatus[event.implementationStatus] || 0) + 1;
      byValidationStatus[event.validationStatus] = (byValidationStatus[event.validationStatus] || 0) + 1;
    });

    return {
      total: allEvents.length,
      byImplementationStatus,
      byValidationStatus
    };
  }
}

export const storage = new DatabaseStorage();
