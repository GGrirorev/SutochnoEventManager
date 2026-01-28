import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useEvents, useDeleteEvent, useEventPlatformStatuses } from "@/hooks/use-events";
import type { EventFormData } from "@/components/EventForm";
import { usePlugins } from "@/hooks/usePlugins";
import { useCurrentUser } from "@/hooks/useAuth";
import { ROLE_PERMISSIONS } from "@shared/schema";
import { getPluginsForSlot, type EventsListPluginContext } from "@/plugins/registry";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventEditSheet } from "@/components/EventEditSheet";
import { EventDetailsModal } from "@/components/EventDetailsModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2,
  Globe,
  Smartphone,
  Layout,
  Server,
  Monitor,
  MessageSquare,
  Send,
  Calendar,
  Code,
  ExternalLink,
  Rocket,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
  History,
  ChevronDown,
  Pencil
} from "lucide-react";
import { EventForm } from "@/components/EventForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Sidebar } from "@/components/Sidebar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS, PLATFORMS, type Event, type EventCategory } from "@shared/schema";

function CopyableText({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  
  return (
    <span className={`inline-flex items-center gap-1 group/copy ${className}`}>
      <span>{text}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover/copy:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
        data-testid={`button-copy-${text.replace(/\s+/g, '-').toLowerCase()}`}
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
      data-testid={`button-copy-${text.replace(/\s+/g, '-').toLowerCase()}`}
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground" />
      )}
    </button>
  );
}

const getPlatformIcon = (p: string) => {
  switch (p) {
    case 'web': return <Globe className="w-3.5 h-3.5" />;
    case 'ios': 
    case 'android': return <Smartphone className="w-3.5 h-3.5" />;
    case 'backend': return <Server className="w-3.5 h-3.5" />;
    default: return <Code className="w-3.5 h-3.5" />;
  }
};

function PlatformWithStatus({ eventId, platform, currentVersion }: { eventId: number; platform: string; currentVersion: number }) {
  const { data: statuses } = useEventPlatformStatuses(eventId);
  
  const status = statuses?.find((s: any) => s.platform === platform && s.versionNumber === currentVersion);
  
  const getImplStatusColor = (implStatus?: string) => {
    switch (implStatus) {
      case "внедрено": return "bg-green-500";
      case "в_разработке": return "bg-blue-500";
      case "черновик": return "bg-gray-400";
      case "архив": return "bg-gray-300";
      default: return "bg-gray-400";
    }
  };

  const getValidationStatusColor = (valStatus?: string) => {
    switch (valStatus) {
      case "корректно": return "bg-green-500";
      case "ошибка": return "bg-red-500";
      case "предупреждение": return "bg-yellow-500";
      case "ожидает_проверки": return "bg-gray-400";
      default: return "bg-gray-400";
    }
  };
  
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="secondary" className="font-normal capitalize gap-1 pl-1.5 text-[10px] w-[75px] justify-start">
        {getPlatformIcon(platform)}
        {platform}
      </Badge>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`w-2 h-2 rounded-full ${getImplStatusColor(status?.implementationStatus)}`} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div>Внедрение: {status?.implementationStatus || "черновик"}</div>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`w-2 h-2 rounded-full ${getValidationStatusColor(status?.validationStatus)}`} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div>Валидация: {status?.validationStatus || "ожидает_проверки"}</div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function VersionBadge({ event }: { event: any }) {
  const version = event.currentVersion || 1;
  
  // Lazy load version details on hover
  const { data: versions } = useQuery({
    queryKey: ["/api/events", event.id, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event.id}/versions`);
      return res.json();
    },
    staleTime: 60000 // Cache for 1 minute
  });
  
  const latestVersion = versions?.find((v: any) => v.version === version);
  
  const formattedDate = latestVersion?.createdAt 
    ? format(new Date(latestVersion.createdAt), "d MMM yyyy, HH:mm", { locale: ru })
    : null;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground/60 cursor-default">
          v{version}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-0.5">
          <div>Версия {version}</div>
          {formattedDate && <div className="text-muted-foreground">{formattedDate}</div>}
          {latestVersion?.authorName && (
            <div className="text-muted-foreground">Автор: {latestVersion.authorName}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function EventsList() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [platform, setPlatform] = useState<string>(PLATFORMS[0]);
  const [status, setStatus] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
  // Get current user permissions
  const { data: currentUser } = useCurrentUser();
  const userPermissions = currentUser ? ROLE_PERMISSIONS[currentUser.role] : null;
  const canCreate = userPermissions?.canCreateEvents ?? false;
  const canEdit = userPermissions?.canEditEvents ?? false;
  const canChangeStatuses = userPermissions?.canChangeStatuses ?? false;
  
  // Fetch categories for filter (uses default fetcher from queryClient)
  const { data: categories = [] } = useQuery<EventCategory[]>({
    queryKey: ["/api/categories"],
  });
  
  // Check if plugins are enabled
  const { data: plugins = [] } = usePlugins();
  
  // Sheet state for creating/editing
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventFormData | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  // Handle ?open=ID query parameter to auto-open event details
  // Handle ?edit=ID query parameter to auto-open edit form
  const [location, setLocation] = useLocation();
  const [openEventId, setOpenEventId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open");
    return id ? parseInt(id, 10) : null;
  });
  const [editEventId, setEditEventId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("edit");
    return id ? parseInt(id, 10) : null;
  });

    const { 
    data, 
    isLoading, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useEvents({ 
    search, 
    category: categoryFilter === "all" ? undefined : categoryFilter,
    platform: platform,
    status: status === "all" ? undefined : status 
  });
  
  const events = useMemo(() => {
    return data?.pages.flatMap(page => page.events) ?? [];
  }, [data]);
  
  const totalCount = data?.pages[0]?.total ?? 0;
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  // Auto-open event from query parameter
  useEffect(() => {
    if (openEventId && events.length > 0) {
      const eventToOpen = events.find(e => e.id === openEventId);
      if (eventToOpen) {
        setSelectedEvent(eventToOpen);
        setOpenEventId(null);
        // Clear the query parameter from URL
        setLocation("/events", { replace: true });
      }
    }
  }, [openEventId, events, setLocation]);

  // Auto-open edit form from query parameter
  useEffect(() => {
    if (editEventId && events.length > 0) {
      const eventToEdit = events.find(e => e.id === editEventId);
      if (eventToEdit) {
        setEditingEvent({
          ...eventToEdit,
          category: eventToEdit.category || "",
        });
        setSheetOpen(true);
        setEditEventId(null);
        // Clear the query parameter from URL
        setLocation("/events", { replace: true });
      }
    }
  }, [editEventId, events, setLocation]);
  
  const deleteMutation = useDeleteEvent();

  const enabledPluginIds = new Set(
    plugins.filter((plugin) => plugin.isEnabled).map((plugin) => plugin.id)
  );
  const pluginContext: EventsListPluginContext = { canCreate };
  const isPlatformStatusesEnabled = enabledPluginIds.has("platform-statuses");

  const renderHeaderPlugins = () =>
    getPluginsForSlot("events-list-header-actions")
      .filter((plugin) => enabledPluginIds.has(plugin.id))
      .map((plugin) => {
        const renderer = plugin.renderers["events-list-header-actions"];
        if (!renderer) return null;
        return <div key={plugin.id}>{renderer(pluginContext)}</div>;
      });

  const handleEdit = (event: Event) => {
    setEditingEvent({
      ...event,
      category: event.category || "",
    });
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setEditingEvent(null);
    setSheetOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-muted/5">
      <Sidebar />
      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        <div className="p-6 lg:p-10 pb-0 space-y-6">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Схема событий</h1>
            <p className="text-muted-foreground mt-1">Управление определениями аналитических событий продукта.</p>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              {renderHeaderPlugins()}
              <Button onClick={handleCreate} className="shadow-md hover:shadow-lg transition-all">
                <Plus className="w-4 h-4 mr-2" />
                Новое событие
              </Button>
            </div>
          )}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value)}>
            <SelectTrigger className="w-[200px] border-none bg-muted/50" data-testid="select-category-filter">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layout className="w-4 h-4" />
                <SelectValue placeholder="Все категории" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-all-categories">Все категории</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.name} data-testid={`option-category-${c.id}`}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Поиск по Event Action или описанию..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-none bg-muted/50 focus-visible:ring-1"
              data-testid="input-search"
            />
          </div>
          
          <div className="flex gap-3">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[180px] border-none bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                   <Smartphone className="w-4 h-4" />
                   <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isPlatformStatusesEnabled && (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[180px] border-none bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground">
                     <Filter className="w-4 h-4" />
                     <SelectValue placeholder="Статус" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {IMPLEMENTATION_STATUS.map(s => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden p-6 lg:px-10 pt-4">
        <div ref={tableContainerRef} className="rounded-xl border bg-card shadow-sm h-full overflow-auto">
          <Table className="relative">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-muted">
                <TableHead className="bg-muted">Event Category</TableHead>
                <TableHead className="bg-muted">Блок</TableHead>
                <TableHead className="bg-muted">Event Action</TableHead>
                <TableHead className="bg-muted w-[200px]">Event Name</TableHead>
                <TableHead className="bg-muted">Event Value</TableHead>
                <TableHead className="bg-muted">{isPlatformStatusesEnabled ? "Платформы и статусы" : "Платформы"}</TableHead>
                <TableHead className="bg-muted w-[60px]">Версия</TableHead>
                {canEdit && <TableHead className="bg-muted w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading Skeleton
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-8 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : events?.length === 0 ? (
                // Empty State
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="p-4 rounded-full bg-muted mb-3">
                        <Filter className="w-6 h-6" />
                      </div>
                      <p className="font-medium">События не найдены</p>
                      <p className="text-sm mt-1">Попробуйте изменить фильтры или создать новое событие.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Data
                events?.map((event) => (
                  <TableRow key={event.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-1 group">
                        <Badge variant="outline" className="font-normal">
                          {event.category}
                        </Badge>
                        <CopyButton text={event.category || ""} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground/80">{event.block || '-'}</span>
                    </TableCell>
                    <TableCell className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => setSelectedEvent(event)}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="flex flex-col gap-1">
                            <CopyableText text={event.action} className="text-sm font-medium group-hover:text-primary transition-colors underline-offset-4 group-hover:underline" />
                            {event.actionDescription && (
                              <span className="text-sm text-muted-foreground/80 line-clamp-2">
                                {event.actionDescription}
                              </span>
                            )}
                          </div>
                        </DialogTrigger>
                        {selectedEvent && <EventDetailsModal event={selectedEvent} onEdit={(e) => { setSelectedEvent(null); setEditingEvent({ ...e, category: e.category || "" }); setSheetOpen(true); }} />}
                      </Dialog>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground/80">{event.name || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground/80">{event.valueDescription || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {isPlatformStatusesEnabled ? (
                          event.platforms?.map((p: string) => (
                            <PlatformWithStatus
                              key={p}
                              eventId={event.id}
                              platform={p}
                              currentVersion={event.currentVersion || 1}
                            />
                          ))
                        ) : (
                          event.platforms?.map((p: string) => (
                            <Badge key={p} variant="secondary" className="font-normal capitalize gap-1 pl-1.5 text-[10px] min-w-[70px]">
                              {getPlatformIcon(p)}
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <VersionBadge event={event} />
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            data-testid={`button-edit-event-${event.id}`}
                            onClick={() => handleEdit(event)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Действия</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(event, null, 2))}>
                                Копировать JSON
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteId(event.id)}
                              >
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-4">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
            </div>
          )}
          {!isLoading && !hasNextPage && events.length > 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Показано {events.length} из {totalCount} событий
            </div>
          )}
        </div>
        </div>

        <EventEditSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          event={editingEvent}
          mode={editingEvent ? "edit" : "create"}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Вы абсолютно уверены?</AlertDialogTitle>
              <AlertDialogDescription>
                Это действие нельзя отменить. Это навсегда удалит определение события
                из вашего плана отслеживания.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
                Удалить событие
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
