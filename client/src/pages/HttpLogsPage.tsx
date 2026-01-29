import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Trash2, CheckCircle, XCircle, Clock, RotateCw, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type HttpLogEntry = {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  status: 'success' | 'timeout' | 'error' | 'retry';
  statusCode?: number;
  duration: number;
  errorMessage?: string;
  retryCount?: number;
};

type HttpStats = {
  total: number;
  success: number;
  timeout: number;
  error: number;
  retry: number;
  avgDuration: number;
  successRate: number;
  rateLimiter: {
    activeRequests: number;
    queueLength: number;
  };
};

function StatCard({ title, value, icon: Icon, variant = "default" }: { 
  title: string; 
  value: string | number; 
  icon: any;
  variant?: "default" | "success" | "warning" | "destructive";
}) {
  const colorClasses = {
    default: "text-muted-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    destructive: "text-red-600 dark:text-red-400",
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${colorClasses[variant]}`}>{value}</p>
          </div>
          <Icon className={`h-8 w-8 ${colorClasses[variant]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: HttpLogEntry['status'] }) {
  const variants: Record<HttpLogEntry['status'], { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    success: { variant: "default", label: "Успешно" },
    timeout: { variant: "destructive", label: "Таймаут" },
    error: { variant: "destructive", label: "Ошибка" },
    retry: { variant: "secondary", label: "Повтор" },
  };

  return (
    <Badge variant={variants[status].variant} data-testid={`badge-status-${status}`}>
      {variants[status].label}
    </Badge>
  );
}

export default function HttpLogsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<HttpStats>({
    queryKey: ["/api/http-logs/stats"],
    refetchInterval: 5000,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: HttpLogEntry[]; total: number }>({
    queryKey: ["/api/http-logs"],
    refetchInterval: 5000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/http-logs/clear");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/http-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/http-logs/stats"] });
      toast({ title: "Логи очищены" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось очистить логи", variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/http-logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/http-logs/stats"] });
  };

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HTTP Логи</h1>
          <p className="text-muted-foreground">Мониторинг внешних HTTP-запросов</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-logs">
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            data-testid="button-clear-logs"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Очистить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard 
          title="Всего запросов" 
          value={stats?.total || 0} 
          icon={Activity}
        />
        <StatCard 
          title="Успешных" 
          value={stats?.success || 0} 
          icon={CheckCircle}
          variant="success"
        />
        <StatCard 
          title="Таймаутов" 
          value={stats?.timeout || 0} 
          icon={Clock}
          variant="warning"
        />
        <StatCard 
          title="Ошибок" 
          value={stats?.error || 0} 
          icon={XCircle}
          variant="destructive"
        />
        <StatCard 
          title="Повторов" 
          value={stats?.retry || 0} 
          icon={RotateCw}
        />
        <StatCard 
          title="Успешность" 
          value={`${stats?.successRate || 0}%`} 
          icon={CheckCircle}
          variant={stats?.successRate && stats.successRate >= 90 ? "success" : stats?.successRate && stats.successRate >= 70 ? "warning" : "destructive"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Среднее время ответа</p>
                <p className="text-2xl font-bold">{stats?.avgDuration || 0} мс</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Активных запросов</p>
                <p className="text-2xl font-bold">{stats?.rateLimiter?.activeRequests || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">В очереди</p>
                <p className="text-2xl font-bold">{stats?.rateLimiter?.queueLength || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Последние запросы</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : logsData?.logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет записей</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Время</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">URL</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Метод</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Статус</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Код</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Время</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-muted-foreground">Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {logsData?.logs.map((log) => (
                    <tr key={log.id} className="border-b hover-elevate" data-testid={`row-log-${log.id}`}>
                      <td className="py-2 px-2 text-sm">
                        {format(new Date(log.timestamp), "HH:mm:ss", { locale: ru })}
                      </td>
                      <td className="py-2 px-2 text-sm font-mono truncate max-w-[200px]" title={log.url}>
                        {log.url}
                      </td>
                      <td className="py-2 px-2 text-sm">
                        <Badge variant="outline">{log.method}</Badge>
                      </td>
                      <td className="py-2 px-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-2 px-2 text-sm">
                        {log.statusCode || '-'}
                      </td>
                      <td className="py-2 px-2 text-sm">
                        {log.duration} мс
                      </td>
                      <td className="py-2 px-2 text-sm text-muted-foreground truncate max-w-[200px]" title={log.errorMessage}>
                        {log.errorMessage || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
