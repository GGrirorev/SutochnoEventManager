import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

type UserWithoutPassword = Omit<User, "passwordHash">;

export function useCurrentUser() {
  return useQuery<UserWithoutPassword | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      navigate("/login");
    },
  });
}

export function useIsAuthenticated() {
  const { data: user, isLoading, error } = useCurrentUser();
  return {
    isAuthenticated: !!user && !error,
    isLoading,
    user,
  };
}
