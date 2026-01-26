import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Puzzle, Code, Loader2, TrendingUp, Activity, MessageSquare } from "lucide-react";
import type { Plugin } from "@shared/schema";

const PLUGIN_ICONS: Record<string, typeof Code> = {
  "code-generator": Code,
  "analytics-chart": TrendingUp,
  "platform-statuses": Activity,
  "comments": MessageSquare,
};

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: plugins, isLoading } = useQuery<Plugin[]>({
    queryKey: ["/api/plugins"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/plugins/${id}`, { isEnabled });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plugins"] });
      toast({
        title: data.isEnabled ? "Модуль включён" : "Модуль выключен",
        description: data.name,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  const handleToggle = (plugin: Plugin) => {
    toggleMutation.mutate({ id: plugin.id, isEnabled: !plugin.isEnabled });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Puzzle className="h-6 w-6" />
              Модули
            </h1>
            <p className="text-muted-foreground mt-1">
              Управление расширениями системы
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : plugins?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Нет установленных модулей
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {plugins?.map((plugin) => {
                const IconComponent = PLUGIN_ICONS[plugin.id] || Puzzle;
                return (
                  <Card key={plugin.id} data-testid={`card-plugin-${plugin.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {plugin.name}
                            <Badge variant="secondary" className="text-xs">
                              v{plugin.version}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {plugin.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={plugin.isEnabled}
                        onCheckedChange={() => handleToggle(plugin)}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-plugin-${plugin.id}`}
                      />
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>ID: {plugin.id}</span>
                        {plugin.installedAt && (
                          <span>
                            Установлен: {new Date(plugin.installedAt).toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
