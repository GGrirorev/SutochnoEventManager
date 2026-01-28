import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2, Loader2, Bell, RefreshCw, TrendingDown, ExternalLink, Settings } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { Link } from "wouter";
import type { EventAlert } from "@shared/schema";
import {
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  formatDateTime,
  formatRelativeTime,
  useAlertCheck,
  useAlerts,
  AlertCheckProgress
} from "@/plugins/alerts";

export default function AlertsPage() {
  const { data: user } = useCurrentUser();
  const [deleteAlert, setDeleteAlert] = useState<EventAlert | null>(null);
  const [viewEventId, setViewEventId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const { checkProgress, startCheck } = useAlertCheck();
  const { alerts: allAlerts, isLoading, deleteMutation, bulkDeleteMutation } = useAlerts();

  const { data: viewEvent } = useQuery<any>({
    queryKey: ["/api/events", viewEventId],
    queryFn: async () => {
      const res = await fetch(`/api/events/${viewEventId}`);
      return res.json();
    },
    enabled: !!viewEventId,
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

  const handleDelete = async () => {
    if (deleteAlert) {
      await deleteMutation.mutateAsync(deleteAlert.id);
      setDeleteAlert(null);
    }
  };

  const handleBulkDelete = async () => {
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowBulkDelete(false);
  };
  
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

            <div className="flex items-center gap-2">
              {user?.role === "admin" && (
                <Link href="/alerts/settings">
                  <Button variant="outline" data-testid="button-alert-settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Настройки
                  </Button>
                </Link>
              )}
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
          </div>

          {/* Progress bar */}
          {checkProgress && <AlertCheckProgress progress={checkProgress} />}

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
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-delete"
                >
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
                  onClick={handleBulkDelete}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-bulk-delete"
                >
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
