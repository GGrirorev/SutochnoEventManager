import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { EventDetailsModal } from "@/pages/EventsList";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Trash2, Loader2, Bell, RefreshCw, TrendingDown, ExternalLink } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import type { EventAlert } from "@shared/schema";

const PLATFORM_LABELS: Record<string, string> = {
  web: "WEB",
  ios: "iOS",
  android: "Android",
  backend: "Backend"
};

const PLATFORM_COLORS: Record<string, string> = {
  web: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  ios: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  android: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  backend: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
};

function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return "";
}

export default function AlertsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteAlert, setDeleteAlert] = useState<EventAlert | null>(null);
  const [viewEventId, setViewEventId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{
    isRunning: boolean;
    completed: number;
    total: number;
    alertsFound: number;
  } | null>(null);

  const { data: alertsData, isLoading, refetch: refetchAlerts } = useQuery<{ alerts: EventAlert[]; total: number }>({
    queryKey: ["/api/alerts"]
  });

  const { data: viewEvent } = useQuery<any>({
    queryKey: ["/api/events", viewEventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${viewEventId}`);
      return res.json();
    },
    enabled: !!viewEventId,
  });

  const startCheck = async () => {
    if (checkProgress?.isRunning) return;
    
    setCheckProgress({ isRunning: true, completed: 0, total: 0, alertsFound: 0 });
    
    try {
      const eventSource = new EventSource("/api/alerts/check-stream");
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          eventSource.close();
          setCheckProgress(null);
          toast({
            title: "Ошибка",
            description: data.error,
            variant: "destructive",
          });
          return;
        }
        
        if (data.status === "started") {
          setCheckProgress({
            isRunning: true,
            completed: 0,
            total: data.total,
            alertsFound: 0,
          });
        } else if (data.status === "progress") {
          setCheckProgress({
            isRunning: true,
            completed: data.completed,
            total: data.total,
            alertsFound: data.alertsFound || 0,
          });
        } else if (data.status === "completed") {
          eventSource.close();
          setCheckProgress(null);
          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
          toast({
            title: "Проверка завершена",
            description: `Проверено: ${data.total} проверок. Создано алертов: ${data.alertsCreated}.`,
          });
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        setCheckProgress(null);
        toast({
          title: "Ошибка",
          description: "Соединение прервано",
          variant: "destructive",
        });
      };
    } catch (error: any) {
      setCheckProgress(null);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось выполнить проверку",
        variant: "destructive",
      });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setDeleteAlert(null);
      toast({
        title: "Алерт удалён",
        description: "Запись успешно удалена из журнала.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить алерт",
        variant: "destructive",
      });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/alerts/bulk-delete", { ids });
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      toast({
        title: "Алерты удалены",
        description: `Удалено записей: ${ids.length}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить алерты",
        variant: "destructive",
      });
    }
  });

  const canDelete = user?.role === "admin" || user?.role === "analyst";

  const toggleSelectAll = () => {
    if (selectedIds.size === alerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map(a => a.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };
  const allAlerts = alertsData?.alerts || [];
  
  // Get unique categories and platforms for filters
  const categories = Array.from(new Set(allAlerts.map(a => a.eventCategory))).sort();
  const platforms = Array.from(new Set(allAlerts.map(a => a.platform)));
  
  // Apply filters
  const alerts = allAlerts.filter(alert => {
    if (categoryFilter !== "all" && alert.eventCategory !== categoryFilter) return false;
    if (platformFilter !== "all" && alert.platform !== platformFilter) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-alerts-title">
                <Bell className="h-6 w-6" />
                Журнал алертов
              </h1>
              <p className="text-muted-foreground mt-1">
                Мониторинг падения количества событий по платформам
              </p>
            </div>

            <Button
              onClick={startCheck}
              disabled={checkProgress?.isRunning}
              data-testid="button-check-alerts"
            >
              {checkProgress?.isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Запустить проверку
            </Button>
          </div>

          {/* Progress bar */}
          {checkProgress?.isRunning && checkProgress.total > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50" data-testid="check-progress">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Проверка событий...</span>
                <span className="text-sm text-muted-foreground">
                  {checkProgress.completed} / {checkProgress.total}
                </span>
              </div>
              <Progress 
                value={(checkProgress.completed / checkProgress.total) * 100} 
                className="h-2"
              />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>Найдено алертов: {checkProgress.alertsFound}</span>
                <span>{Math.round((checkProgress.completed / checkProgress.total) * 100)}%</span>
              </div>
            </div>
          )}

          {/* Filters */}
          {allAlerts.length > 0 && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Категория:</span>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[200px]" data-testid="select-category-filter">
                    <SelectValue placeholder="Все категории" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все категории</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Платформа:</span>
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-platform-filter">
                    <SelectValue placeholder="Все платформы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все платформы</SelectItem>
                    {platforms.map(p => (
                      <SelectItem key={p} value={p}>{PLATFORM_LABELS[p] || p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(categoryFilter !== "all" || platformFilter !== "all") && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setCategoryFilter("all"); setPlatformFilter("all"); }}
                  data-testid="button-clear-filters"
                >
                  Сбросить фильтры
                </Button>
              )}

              <span className="text-sm text-muted-foreground ml-auto">
                Показано: {alerts.length} из {allAlerts.length}
              </span>

              {canDelete && selectedIds.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowBulkDelete(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить выбранные ({selectedIds.size})
                </Button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="loading-alerts">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/50" data-testid="empty-alerts">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Нет алертов</h3>
              <p className="text-muted-foreground mb-4">
                Все события работают стабильно. Алерты появятся при падении событий на 30% и более.
              </p>
              <Button
                variant="outline"
                onClick={startCheck}
                disabled={checkProgress?.isRunning}
                data-testid="button-check-alerts-empty"
              >
                {checkProgress?.isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Запустить проверку
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg" data-testid="alerts-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canDelete && (
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={alerts.length > 0 && selectedIds.size === alerts.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Событие</TableHead>
                    <TableHead>Платформа</TableHead>
                    <TableHead>Падение</TableHead>
                    <TableHead>Вчера</TableHead>
                    <TableHead>Позавчера</TableHead>
                    <TableHead>Время проверки</TableHead>
                    {canDelete && <TableHead className="w-16">Действия</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                      {canDelete && (
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(alert.id)}
                            onCheckedChange={() => toggleSelect(alert.id)}
                            data-testid={`checkbox-alert-${alert.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell data-testid={`text-alert-event-${alert.id}`}>
                        <button 
                          onClick={() => setViewEventId(alert.eventId)}
                          className="group block hover-elevate rounded-md p-1 -m-1 text-left cursor-pointer"
                          data-testid={`button-view-event-${alert.id}`}
                        >
                          <div className="font-medium flex items-center gap-1">
                            {alert.eventCategory}
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-sm text-muted-foreground">@{alert.eventAction}</div>
                        </button>
                      </TableCell>
                      <TableCell data-testid={`text-alert-platform-${alert.id}`}>
                        <Badge 
                          variant="secondary" 
                          className={PLATFORM_COLORS[alert.platform] || ""}
                        >
                          {PLATFORM_LABELS[alert.platform] || alert.platform}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-alert-drop-${alert.id}`}>
                        <div className="flex items-center gap-1 text-destructive font-semibold">
                          <TrendingDown className="h-4 w-4" />
                          {alert.dropPercent}%
                        </div>
                      </TableCell>
                      <TableCell className="font-mono" data-testid={`text-alert-yesterday-${alert.id}`}>
                        {alert.yesterdayCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono" data-testid={`text-alert-daybefore-${alert.id}`}>
                        {alert.dayBeforeCount.toLocaleString()}
                      </TableCell>
                      <TableCell data-testid={`text-alert-time-${alert.id}`}>
                        <div className="flex flex-col">
                          <span>{formatDateTime(alert.checkedAt)}</span>
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.checkedAt)}</span>
                        </div>
                      </TableCell>
                      {canDelete && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteAlert(alert)}
                            data-testid={`button-delete-alert-${alert.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <AlertDialog open={!!deleteAlert} onOpenChange={(open) => !open && setDeleteAlert(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить алерт?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить этот алерт? Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAlert && deleteMutation.mutate(deleteAlert.id)}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить выбранные алерты?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить {selectedIds.size} алертов? Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-bulk-delete">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-bulk-delete"
                >
                  {bulkDeleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Удалить ({selectedIds.size})
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={!!viewEvent} onOpenChange={(open) => !open && setViewEventId(null)}>
            {viewEvent && <EventDetailsModal event={viewEvent} />}
          </Dialog>
        </div>
      </main>
    </div>
  );
}
