import { useQuery } from "@tanstack/react-query";
import type { Plugin } from "@shared/schema";

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ["/api/plugins"],
  });
}

export function usePlugin(id: string) {
  const { data: plugins, isLoading } = usePlugins();
  const plugin = plugins?.find((p) => p.id === id);
  return { plugin, isLoading };
}

export function useIsPluginEnabled(id: string) {
  const { plugin, isLoading } = usePlugin(id);
  return {
    isEnabled: plugin?.isEnabled ?? false,
    isLoading,
  };
}
