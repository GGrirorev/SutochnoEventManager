import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateEventRequest, type UpdateEventRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ============================================
// DATA FETCHING HOOKS
// ============================================

export function useEvents(filters?: { 
  search?: string; 
  category?: string; 
  status?: string; 
  platform?: string;
}) {
  const queryKey = [api.events.list.path, filters];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Filter out empty/undefined values to keep URL clean
      const validFilters = Object.fromEntries(
        Object.entries(filters || {}).filter(([_, v]) => v != null && v !== '')
      ) as Record<string, string>;
      
      const url = buildUrl(api.events.list.path);
      const queryString = new URLSearchParams(validFilters).toString();
      const finalUrl = queryString ? `${url}?${queryString}` : url;
      
      const res = await fetch(finalUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return api.events.list.responses[200].parse(await res.json());
    },
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
