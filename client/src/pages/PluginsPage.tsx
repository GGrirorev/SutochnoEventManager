import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Puzzle, Code, Loader2, TrendingUp, Activity, MessageSquare, Settings, Trash2 } from "lucide-react";
import type { Plugin } from "@shared/schema";

interface AnalyticsChartConfig {
  apiUrl?: string;
  apiToken?: string;
  platformSiteMapping?: Record<string, number>;
}

const PLUGIN_ICONS: Record<string, typeof Code> = {
  "code-generator": Code,
  "analytics-chart": TrendingUp,
  "platform-statuses": Activity,
  "comments": MessageSquare,
};

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  
  // Analytics chart settings state
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [platformMappings, setPlatformMappings] = useState<{ platform: string; siteId: string }[]>([
    { platform: "web", siteId: "1" },
    { platform: "ios", siteId: "2" },
    { platform: "android", siteId: "3" },
  ]);

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
  
  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: any }) => {
      const response = await apiRequest("PATCH", `/api/plugins/${id}`, { config });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plugins"] });
      setSettingsOpen(false);
      toast({
        title: "Настройки сохранены",
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
  
  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/analytics/clear-cache");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Кэш аналитики очищен" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Ошибка очистки кэша" });
    },
  });

  const handleToggle = (plugin: Plugin) => {
    toggleMutation.mutate({ id: plugin.id, isEnabled: !plugin.isEnabled });
  };
  
  const openSettings = (plugin: Plugin) => {
    setEditingPlugin(plugin);
    const config = (plugin.config as AnalyticsChartConfig) || {};
    setApiUrl(config.apiUrl || "");
    setApiToken(config.apiToken || "");
    
    const mapping = config.platformSiteMapping || { web: 1, ios: 2, android: 3 };
    setPlatformMappings(
      Object.entries(mapping).map(([platform, siteId]) => ({
        platform,
        siteId: String(siteId),
      }))
    );
    
    setSettingsOpen(true);
  };
  
  const saveSettings = () => {
    if (!editingPlugin) return;
    
    const platformSiteMapping: Record<string, number> = {};
    platformMappings.forEach(({ platform, siteId }) => {
      if (platform && siteId) {
        platformSiteMapping[platform.toLowerCase()] = parseInt(siteId, 10) || 1;
      }
    });
    
    const config: AnalyticsChartConfig = {
      apiUrl: apiUrl || undefined,
      apiToken: apiToken || undefined,
      platformSiteMapping,
    };
    
    updateConfigMutation.mutate({ id: editingPlugin.id, config });
  };
  
  const addPlatformMapping = () => {
    setPlatformMappings([...platformMappings, { platform: "", siteId: "" }]);
  };
  
  const removePlatformMapping = (index: number) => {
    setPlatformMappings(platformMappings.filter((_, i) => i !== index));
  };
  
  const updatePlatformMapping = (index: number, field: "platform" | "siteId", value: string) => {
    const updated = [...platformMappings];
    updated[index][field] = value;
    setPlatformMappings(updated);
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
                      <div className="flex items-center gap-2">
                        {plugin.id === "analytics-chart" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSettings(plugin)}
                            data-testid="button-plugin-settings"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        )}
                        <Switch
                          checked={plugin.isEnabled}
                          onCheckedChange={() => handleToggle(plugin)}
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-plugin-${plugin.id}`}
                        />
                      </div>
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
      
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Настройки модуля аналитики</DialogTitle>
            <DialogDescription>
              Настройте подключение к Matomo/Piwik API
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiUrl">URL API Matomo</Label>
              <Input
                id="apiUrl"
                placeholder="https://analytics.example.com/index.php"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                data-testid="input-api-url"
              />
              <p className="text-xs text-muted-foreground">
                Оставьте пустым для использования значения по умолчанию
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Токен авторизации Matomo"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                data-testid="input-api-token"
              />
              <p className="text-xs text-muted-foreground">
                Если не указан, используется переменная окружения ANALYTICS_API_TOKEN
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Сопоставление платформ и idSite</Label>
              <div className="space-y-2">
                {platformMappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Платформа (web, ios, android)"
                      value={mapping.platform}
                      onChange={(e) => updatePlatformMapping(index, "platform", e.target.value)}
                      className="flex-1"
                      data-testid={`input-platform-${index}`}
                    />
                    <Input
                      placeholder="idSite"
                      value={mapping.siteId}
                      onChange={(e) => updatePlatformMapping(index, "siteId", e.target.value)}
                      className="w-24"
                      data-testid={`input-siteid-${index}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePlatformMapping(index)}
                      disabled={platformMappings.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addPlatformMapping}
                className="mt-2"
              >
                Добавить платформу
              </Button>
            </div>
            
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Кэш данных</p>
                  <p className="text-xs text-muted-foreground">
                    Результаты кэшируются на 12 часов
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearCacheMutation.mutate()}
                  disabled={clearCacheMutation.isPending}
                  data-testid="button-clear-cache"
                >
                  {clearCacheMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Очистить кэш
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Отмена
            </Button>
            <Button 
              onClick={saveSettings} 
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateConfigMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
