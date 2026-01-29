import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sidebar, useSidebar, MobileHeader } from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Settings, Bell, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const alertSettingsSchema = z.object({
  matomoUrl: z.string().min(1, "URL обязателен"),
  matomoToken: z.string().min(1, "Токен обязателен"),
  matomoSiteId: z.string().min(1, "ID сайтов обязательны"),
  dropThreshold: z.number().min(1).max(100),
  maxConcurrency: z.number().min(1).max(20),
  isEnabled: z.boolean(),
});

type AlertSettingsForm = z.infer<typeof alertSettingsSchema>;

interface AlertSettings {
  id?: number;
  matomoUrl: string;
  matomoToken: string;
  matomoSiteId: string;
  dropThreshold: number;
  maxConcurrency: number;
  isEnabled: boolean;
  updatedAt?: string;
}

export default function AlertSettingsPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const { collapsed } = useSidebar();

  const { data: settings, isLoading: isLoadingSettings } = useQuery<AlertSettings>({
    queryKey: ["/api/alerts/settings"],
  });

  const form = useForm<AlertSettingsForm>({
    resolver: zodResolver(alertSettingsSchema),
    defaultValues: {
      matomoUrl: "https://analytics.sutochno.ru/index.php",
      matomoToken: "",
      matomoSiteId: "web:1,ios:2,android:3",
      dropThreshold: 30,
      maxConcurrency: 5,
      isEnabled: true,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        matomoUrl: settings.matomoUrl || "https://analytics.sutochno.ru/index.php",
        matomoToken: settings.matomoToken || "",
        matomoSiteId: settings.matomoSiteId || "web:1,ios:2,android:3",
        dropThreshold: settings.dropThreshold || 30,
        maxConcurrency: settings.maxConcurrency || 5,
        isEnabled: settings.isEnabled ?? true,
      });
      setIsLoading(false);
    }
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: AlertSettingsForm) => {
      const response = await apiRequest("PUT", "/api/alerts/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/settings"] });
      toast({
        title: "Настройки сохранены",
        description: "Конфигурация модуля алертов обновлена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить настройки",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AlertSettingsForm) => {
    saveMutation.mutate(data);
  };

  if (isLoadingSettings || isLoading) {
    return (
      <div className="flex min-h-screen">
        <MobileHeader />
        <Sidebar />
        <main className={`flex-1 p-6 pt-20 md:pt-6 transition-all duration-300 ${collapsed ? "md:ml-16" : "md:ml-64"}`}>
          <div className="flex items-center justify-center h-64" data-testid="loading-settings">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <MobileHeader />
      <Sidebar />
      <main className={`flex-1 p-6 pt-20 md:pt-6 space-y-6 transition-all duration-300 ${collapsed ? "md:ml-16" : "md:ml-64"}`}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/alerts">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-settings-title">
                <Settings className="h-6 w-6" />
                Настройки модуля алертов
              </h1>
              <p className="text-muted-foreground mt-1">
                Конфигурация мониторинга событий аналитики
              </p>
            </div>
          </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Подключение к Matomo
          </CardTitle>
          <CardDescription>
            Настройте подключение к API аналитики для мониторинга событий
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Модуль включен</FormLabel>
                      <FormDescription>
                        Включить или отключить проверку алертов
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="matomoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL API Matomo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://analytics.example.com/index.php"
                        {...field}
                        data-testid="input-matomo-url"
                      />
                    </FormControl>
                    <FormDescription>
                      Базовый URL для API Matomo
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="matomoToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Token</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Введите токен авторизации"
                        {...field}
                        data-testid="input-matomo-token"
                      />
                    </FormControl>
                    <FormDescription>
                      Токен для авторизации в API Matomo. Если не указан, будет использоваться переменная окружения ANALYTICS_API_TOKEN.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="matomoSiteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID сайтов по платформам</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="web:1,ios:2,android:3"
                        {...field}
                        data-testid="input-site-ids"
                      />
                    </FormControl>
                    <FormDescription>
                      Формат: платформа:id через запятую. Например: web:1,ios:2,android:3
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dropThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Порог падения (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                          data-testid="input-drop-threshold"
                        />
                      </FormControl>
                      <FormDescription>
                        Минимальный процент падения для создания алерта
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxConcurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Параллельных запросов</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 5)}
                          data-testid="input-max-concurrency"
                        />
                      </FormControl>
                      <FormDescription>
                        Максимальное количество одновременных запросов к API
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Сохранить настройки
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Автоматическая проверка (Cron)</CardTitle>
          <CardDescription>
            Настройте внешнее задание для автоматической проверки алертов
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-medium mb-2">URL для вызова:</p>
            <code className="text-xs bg-background px-2 py-1 rounded block overflow-x-auto">
              POST {window.location.origin}/api/alerts/check
            </code>
          </div>
          <p className="text-sm text-muted-foreground">
            Рекомендуемое расписание: ежедневно после 23:00, чтобы данные за вчерашний день были полными.
            Используйте сервисы cron-job.org, EasyCron или UptimeRobot.
          </p>
        </CardContent>
      </Card>
        </div>
      </main>
    </div>
  );
}
