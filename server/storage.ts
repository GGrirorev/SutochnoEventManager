import { db } from "./db";
import {
  events,
  comments,
  propertyTemplates,
  eventPlatformStatuses,
  statusHistory,
  eventVersions,
  type Event,
  type InsertEvent,
  type UpdateEventRequest,
  type StatusSummary,
  type Comment,
  type InsertComment,
  type PropertyTemplate,
  type InsertPropertyTemplate,
  type EventPlatformStatus,
  type InsertEventPlatformStatus,
  type StatusHistory,
  type InsertStatusHistory,
  type EventVersion,
  type InsertEventVersion,
  IMPLEMENTATION_STATUS,
  VALIDATION_STATUS
} from "@shared/schema";
import { eq, ilike, and, desc, sql } from "drizzle-orm";

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
  // Comment operations
  getComments(eventId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  
  // Property template operations
  getPropertyTemplates(category?: string): Promise<PropertyTemplate[]>;
  getPropertyTemplate(id: number): Promise<PropertyTemplate | undefined>;
  createPropertyTemplate(template: InsertPropertyTemplate): Promise<PropertyTemplate>;
  updatePropertyTemplate(id: number, updates: Partial<InsertPropertyTemplate>): Promise<PropertyTemplate>;
  deletePropertyTemplate(id: number): Promise<void>;
  getNextDimension(): Promise<number>;
  
  // Event platform status operations
  getEventPlatformStatuses(eventId: number): Promise<EventPlatformStatus[]>;
  getEventPlatformStatus(eventId: number, platform: string): Promise<EventPlatformStatus | undefined>;
  createEventPlatformStatus(status: InsertEventPlatformStatus): Promise<EventPlatformStatus>;
  updateEventPlatformStatus(id: number, updates: Partial<InsertEventPlatformStatus>): Promise<EventPlatformStatus>;
  deletePlatformStatus(id: number): Promise<void>;
  deleteEventPlatformStatuses(eventId: number): Promise<void>;
  
  // Status history operations
  getStatusHistory(eventPlatformStatusId: number): Promise<StatusHistory[]>;
  createStatusHistory(history: InsertStatusHistory): Promise<StatusHistory>;
  
  // Event version operations
  getEventVersions(eventId: number): Promise<EventVersion[]>;
  getEventVersion(eventId: number, version: number): Promise<EventVersion | undefined>;
  createEventVersion(version: InsertEventVersion): Promise<EventVersion>;
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

  // Comment operations
  async getComments(eventId: number): Promise<Comment[]> {
    return await db.select().from(comments).where(eq(comments.eventId, eventId)).orderBy(desc(comments.createdAt));
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  // Property template operations
  async getPropertyTemplates(category?: string): Promise<PropertyTemplate[]> {
    if (category) {
      return await db.select().from(propertyTemplates)
        .where(eq(propertyTemplates.category, category))
        .orderBy(propertyTemplates.dimension);
    }
    return await db.select().from(propertyTemplates).orderBy(propertyTemplates.dimension);
  }

  async getPropertyTemplate(id: number): Promise<PropertyTemplate | undefined> {
    const [template] = await db.select().from(propertyTemplates).where(eq(propertyTemplates.id, id));
    return template;
  }

  async createPropertyTemplate(template: InsertPropertyTemplate): Promise<PropertyTemplate> {
    const [newTemplate] = await db.insert(propertyTemplates).values(template).returning();
    return newTemplate;
  }

  async updatePropertyTemplate(id: number, updates: Partial<InsertPropertyTemplate>): Promise<PropertyTemplate> {
    const [template] = await db.update(propertyTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(propertyTemplates.id, id))
      .returning();
    return template;
  }

  async deletePropertyTemplate(id: number): Promise<void> {
    await db.delete(propertyTemplates).where(eq(propertyTemplates.id, id));
  }

  async getNextDimension(): Promise<number> {
    const result = await db.select().from(propertyTemplates).orderBy(desc(propertyTemplates.dimension)).limit(1);
    return result.length > 0 ? result[0].dimension + 1 : 1;
  }

  // Event platform status operations
  async getEventPlatformStatuses(eventId: number): Promise<EventPlatformStatus[]> {
    return await db.select()
      .from(eventPlatformStatuses)
      .where(eq(eventPlatformStatuses.eventId, eventId))
      .orderBy(eventPlatformStatuses.platform);
  }

  async getEventPlatformStatus(eventId: number, platform: string): Promise<EventPlatformStatus | undefined> {
    const [status] = await db.select()
      .from(eventPlatformStatuses)
      .where(and(
        eq(eventPlatformStatuses.eventId, eventId),
        eq(eventPlatformStatuses.platform, platform)
      ));
    return status;
  }

  async createEventPlatformStatus(status: InsertEventPlatformStatus): Promise<EventPlatformStatus> {
    const [newStatus] = await db.insert(eventPlatformStatuses).values(status).returning();
    return newStatus;
  }

  async updateEventPlatformStatus(id: number, updates: Partial<InsertEventPlatformStatus>): Promise<EventPlatformStatus> {
    const [status] = await db.update(eventPlatformStatuses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(eventPlatformStatuses.id, id))
      .returning();
    return status;
  }

  async deletePlatformStatus(id: number): Promise<void> {
    // First delete related status history
    await db.delete(statusHistory).where(eq(statusHistory.eventPlatformStatusId, id));
    // Then delete platform status
    await db.delete(eventPlatformStatuses).where(eq(eventPlatformStatuses.id, id));
  }

  async deleteEventPlatformStatuses(eventId: number): Promise<void> {
    // First delete related status history
    const platformStatuses = await this.getEventPlatformStatuses(eventId);
    for (const ps of platformStatuses) {
      await db.delete(statusHistory).where(eq(statusHistory.eventPlatformStatusId, ps.id));
    }
    // Then delete platform statuses
    await db.delete(eventPlatformStatuses).where(eq(eventPlatformStatuses.eventId, eventId));
  }

  // Status history operations
  async getStatusHistory(eventPlatformStatusId: number): Promise<StatusHistory[]> {
    return await db.select()
      .from(statusHistory)
      .where(eq(statusHistory.eventPlatformStatusId, eventPlatformStatusId))
      .orderBy(desc(statusHistory.createdAt));
  }

  async createStatusHistory(history: InsertStatusHistory): Promise<StatusHistory> {
    const [newHistory] = await db.insert(statusHistory).values(history).returning();
    return newHistory;
  }

  // Event version operations
  async getEventVersions(eventId: number): Promise<EventVersion[]> {
    return await db.select()
      .from(eventVersions)
      .where(eq(eventVersions.eventId, eventId))
      .orderBy(desc(eventVersions.version));
  }

  async getEventVersion(eventId: number, version: number): Promise<EventVersion | undefined> {
    const [eventVersion] = await db.select()
      .from(eventVersions)
      .where(and(
        eq(eventVersions.eventId, eventId),
        eq(eventVersions.version, version)
      ));
    return eventVersion;
  }

  async createEventVersion(version: InsertEventVersion): Promise<EventVersion> {
    const [newVersion] = await db.insert(eventVersions).values(version).returning();
    return newVersion;
  }
}

export const storage = new DatabaseStorage();
