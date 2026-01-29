import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api, buildUrl, type CreateEventRequest, type UpdateEventRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { EventWithAuthor } from "@shared/schema";

// ============================================
// DATA FETCHING HOOKS
// ============================================

const PAGE_SIZE = 50;

interface EventsResponse {
  events: EventWithAuthor[];
  total: number;
  hasMore: boolean;
}

export function useEvents(filters?: { 
  search?: string; 
  category?: string; 
  platform?: string;
  ownerId?: number;
  authorId?: number;
  implementationStatus?: string;
  validationStatus?: string;
  jira?: string;
}) {
  const queryKey = [api.events.list.path, filters];
  
  return useInfiniteQuery<EventsResponse>({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      const validFilters = Object.fromEntries(
        Object.entries(filters || {}).filter(([_, v]) => v != null && v !== '')
      ) as Record<string, string>;
      
      const params = new URLSearchParams(validFilters);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam));
      
      const url = buildUrl(api.events.list.path);
      const finalUrl = `${url}?${params.toString()}`;
      
      const res = await fetch(finalUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json() as Promise<EventsResponse>;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: [api.events.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.events.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch event");
      return api.events.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useEventStats() {
  return useQuery({
    queryKey: [api.events.stats.path],
    queryFn: async () => {
      const res = await fetch(api.events.stats.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return api.events.stats.responses[200].parse(await res.json());
    },
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateEventRequest) => {
      const validated = api.events.create.input.parse(data);
      const res = await fetch(api.events.create.path, {
        method: api.events.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.events.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create event");
      }
      return api.events.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.events.stats.path] });
      toast({
        title: "Event created",
        description: "The tracking event has been successfully defined.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error creating event",
        description: error.message,
      });
    }
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateEventRequest) => {
      const validated = api.events.update.input.parse(updates);
      const url = buildUrl(api.events.update.path, { id });
      
      const res = await fetch(url, {
        method: api.events.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.events.update.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update event");
      }
      return api.events.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.events.get.path, data.id] });
      queryClient.invalidateQueries({ queryKey: [api.events.stats.path] });
      toast({
        title: "Event updated",
        description: "Changes have been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error updating event",
        description: error.message,
      });
    }
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.events.delete.path, { id });
      const res = await fetch(url, { 
        method: api.events.delete.method,
        credentials: "include" 
      });
      
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.events.stats.path] });
      toast({
        title: "Event deleted",
        description: "The event has been removed from the schema.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error deleting event",
        description: error.message,
      });
    }
  });
}

// ============================================
// PLATFORM STATUS HOOKS
// ============================================

export function useEventPlatformStatuses(eventId: number) {
  return useQuery({
    queryKey: ["/api/events", eventId, "platform-statuses"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platform statuses");
      return res.json();
    },
    enabled: !!eventId,
  });
}

export function useEventPlatformStatusesBatch(eventIds: number[], versions?: Record<number, number>) {
  return useQuery<Record<number, any[]>>({
    queryKey: ["/api/events/platform-statuses-batch", eventIds.sort().join(","), JSON.stringify(versions || {})],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const res = await fetch("/api/events/platform-statuses-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventIds, versions }),
      });
      if (!res.ok) throw new Error("Failed to fetch platform statuses batch");
      return res.json();
    },
    enabled: eventIds.length > 0,
    staleTime: 30000,
  });
}

export function useCreatePlatformStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, platform, jiraLink, implementationStatus, validationStatus }: {
      eventId: number;
      platform: string;
      jiraLink?: string;
      implementationStatus?: string;
      validationStatus?: string;
    }) => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, jiraLink, implementationStatus, validationStatus }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create platform status");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", variables.eventId, "platform-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/platform-statuses-batch"] });
    }
  });
}

export function useUpdatePlatformStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, platform, jiraLink, implementationStatus, validationStatus }: {
      eventId: number;
      platform: string;
      jiraLink?: string;
      implementationStatus?: string;
      validationStatus?: string;
    }) => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses/${platform}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraLink, implementationStatus, validationStatus }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update platform status");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", variables.eventId, "platform-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/platform-statuses-batch"] });
    }
  });
}

export function useDeletePlatformStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, platform }: {
      eventId: number;
      platform: string;
    }) => {
      const res = await fetch(`/api/events/${eventId}/platform-statuses/${platform}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete platform status");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", variables.eventId, "platform-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/platform-statuses-batch"] });
    }
  });
}

// ============================================
// EVENT VERSION HOOKS
// ============================================

export function useEventVersions(eventId: number) {
  return useQuery({
    queryKey: ["/api/events", eventId, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event versions");
      return res.json();
    },
    enabled: !!eventId,
  });
}

export function useEventVersion(eventId: number, version: number) {
  return useQuery({
    queryKey: ["/api/events", eventId, "versions", version],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/versions/${version}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event version");
      return res.json();
    },
    enabled: !!eventId && !!version,
  });
}
