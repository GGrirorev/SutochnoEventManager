import { useState } from "react";
import { useEvents, useDeleteEvent, useEventVersions } from "@/hooks/use-events";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileText,
  Activity,
  Copy,
  Check,
  History,
  ChevronDown
} from "lucide-react";
import { EventForm } from "@/components/EventForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Sidebar } from "@/components/Sidebar";
import { AnalyticsChart } from "@/components/AnalyticsChart";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS, PLATFORMS, type Event } from "@shared/schema";

function MatomoCodeGenerator({ event }: { event: any }) {
  const [copied, setCopied] = useState<string | null>(null);
  
  const generateMatomoCode = (platform: string) => {
    const category = event.category || 'Category';
    const action = event.action || 'Action';
    const name = event.name || '';
    
    // Generate properties string if there are properties
    const propsComment = event.properties?.length > 0 
      ? `\n// Properties: ${event.properties.map((p: any) => p.name).join(', ')}`
      : '';
    
    if (platform === 'web') {
      return `// ${action}${propsComment}
_paq.push(['trackEvent', '${category}', '${action}'${name ? `, '${name}'` : ''}]);`;
    } else if (platform === 'ios') {
      return `// ${action}${propsComment}
MatomoTracker.shared.track(eventWithCategory: "${category}", action: "${action}"${name ? `, name: "${name}"` : ''})`;
    } else if (platform === 'android') {
      return `// ${action}${propsComment}
TrackHelper.track().event("${category}", "${action}")${name ? `.name("${name}")` : ''}.with(tracker)`;
    }
    return '';
  };

  const copyToClipboard = async (code: string, platform: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  const platforms = event.platforms || ['web'];

  return (
    <div className="border-t pt-4">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Code className="w-4 h-4" />
        Код для Matomo
      </h4>
      <div className="space-y-3">
        {platforms.map((platform: string) => {
          const code = generateMatomoCode(platform);
          return (
            <div key={platform} className="relative">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="secondary" className="uppercase text-[10px]">
                  {platform}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyToClipboard(code, platform)}
                >
                  {copied === platform ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span className="ml-1">{copied === platform ? 'Скопировано' : 'Копировать'}</span>
                </Button>
              </div>
              <pre className="text-xs font-mono bg-muted p-3 rounded border overflow-x-auto">
                <code>{code}</code>
              </pre>
            </div>
          );
        })}
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
          {latestVersion?.createdBy && (
            <div className="text-muted-foreground">Автор: {latestVersion.createdBy}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function EventDetailsModal({ event: initialEvent }: { event: any }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Fetch fresh event data to get updated statuses
  const { data: event = initialEvent } = useQuery({
    queryKey: ["/api/events", initialEvent.id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${initialEvent.id}`);
      return res.json();
    }
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["/api/events", event.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event.id}/comments`);
      return res.json();
    }
  });

  // Determine the version to display
  const displayVersion = selectedVersion || event.currentVersion || 1;

  // Fetch platform statuses for the selected version
  const { data: platformStatuses = [] } = useQuery({
    queryKey: ["/api/events", event.id, "platform-statuses", displayVersion],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event.id}/platform-statuses?version=${displayVersion}`);
      return res.json();
    }
  });

  // Fetch event versions
  const { data: versions = [] } = useEventVersions(event.id);
  
  // Get the currently displayed version data
  const currentVersionNumber = selectedVersion || event.currentVersion || 1;
  const currentVersionData = versions.find((v: any) => v.version === (event.currentVersion || 1));
  const displayedVersion = selectedVersion 
    ? versions.find((v: any) => v.version === selectedVersion) 
    : currentVersionData;
  
  // Use version data if viewing an old version, otherwise use current event data
  const displayData = displayedVersion || event;

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/events/${event.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, author: "Пользователь" })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", event.id, "comments"] });
      setComment("");
    }
  });

  // Mutation for updating platform status (without creating new version)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ platform, implementationStatus, validationStatus, versionNumber }: { 
      platform: string; 
      implementationStatus?: string; 
      validationStatus?: string;
      versionNumber: number;
    }) => {
      const res = await fetch(`/api/events/${event.id}/platform-statuses/${platform}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationStatus, validationStatus, versionNumber })
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["/api/events", event.id, "platform-statuses", displayVersion] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", event.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    }
  });

  // Helper function to get status color class
  const getStatusColor = (status: string | null) => {
    if (!status) return "text-muted-foreground";
    const normalized = status.toLowerCase().replace(/ /g, '_');
    switch (normalized) {
      case 'внедрено':
      case 'корректно':
        return "text-emerald-600 dark:text-emerald-400 font-medium";
      case 'в_разработке':
      case 'предупреждение':
        return "text-amber-600 dark:text-amber-400 font-medium";
      case 'черновик':
        return "text-blue-600 dark:text-blue-400 font-medium";
      case 'ошибка':
        return "text-rose-600 dark:text-rose-400 font-medium";
      case 'архив':
      case 'ожидает_проверки':
      default:
        return "text-slate-600 dark:text-slate-400";
    }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="text-2xl flex items-center gap-2">
            {displayData.category}
            <Badge variant="outline">{displayData.action}</Badge>
          </DialogTitle>
          <div className="flex items-center gap-2">
            {/* Version Badge */}
            <Badge variant="secondary" className="text-xs">
              v{event.currentVersion || 1}
            </Badge>
            
            {/* Version Selector */}
            {versions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1">
                    <History className="w-3 h-3" />
                    {selectedVersion ? `v${selectedVersion}` : 'История'}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Версии</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setSelectedVersion(null)}
                    className={!selectedVersion ? "bg-accent" : ""}
                  >
                    Текущая (v{event.currentVersion || 1})
                  </DropdownMenuItem>
                  {/* Filter out current version to avoid duplicate */}
                  {versions.filter((v: any) => v.version !== (event.currentVersion || 1)).map((v: any) => (
                    <DropdownMenuItem 
                      key={v.version}
                      onClick={() => setSelectedVersion(v.version)}
                      className={selectedVersion === v.version ? "bg-accent" : ""}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {v.createdAt && format(new Date(v.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {v.changeDescription || `Версия ${v.version}`}
                        </span>
                        {v.createdBy && (
                          <span className="text-[10px] text-muted-foreground/70">
                            Автор: {v.createdBy}
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {selectedVersion && displayedVersion && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-700 dark:text-amber-300">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Просмотр версии v{selectedVersion}</span>
              {displayedVersion.createdAt && (
                <span className="text-xs opacity-80">
                  от {format(new Date(displayedVersion.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                </span>
              )}
              {displayedVersion.createdBy && (
                <span className="text-xs opacity-80">
                  • Автор: {displayedVersion.createdBy}
                </span>
              )}
              <button className="underline ml-auto" onClick={() => setSelectedVersion(null)}>Вернуться к текущей</button>
            </div>
            {displayedVersion.changeDescription && displayedVersion.version > 1 && (
              <div className="text-xs opacity-80 mt-1">
                Изменения: {displayedVersion.changeDescription}
              </div>
            )}
          </div>
        )}
        {!selectedVersion && currentVersionData && (
          <div className="mt-2 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Текущая версия v{event.currentVersion || 1}</span>
              {currentVersionData.createdAt && (
                <span className="text-xs opacity-80">
                  от {format(new Date(currentVersionData.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                </span>
              )}
              {currentVersionData.createdBy && (
                <span className="text-xs opacity-80">
                  • Автор: {currentVersionData.createdBy}
                </span>
              )}
            </div>
            {currentVersionData.changeDescription && currentVersionData.version > 1 && (
              <div className="text-xs opacity-70 mt-1">
                Изменения: {currentVersionData.changeDescription}
              </div>
            )}
          </div>
        )}
      </DialogHeader>

      <Tabs defaultValue="description" className="pt-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="description" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Описание
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Здоровье
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Описание */}
        <TabsContent value="description" className="space-y-6 pt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Описание действия</h4>
              <p className="text-sm">
                {displayData.actionDescription || "Нет описания"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Event Name</h4>
                <p className="text-sm font-mono bg-muted p-2 rounded">{displayData.name || "-"}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Значение (Value)</h4>
                <p className="text-sm bg-muted p-2 rounded">{displayData.valueDescription || "-"}</p>
              </div>
            </div>
            {displayData.block && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Блок</h4>
                <p className="text-sm">{displayData.block}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Ответственный</h4>
              <p className="text-sm">{displayData.owner || "Не назначен"}</p>
            </div>
          </div>

          {displayData.properties && displayData.properties.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Свойства (Properties)</h4>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="h-8 text-xs">Название</TableHead>
                      <TableHead className="h-8 text-xs">Тип</TableHead>
                      <TableHead className="h-8 text-xs">Описание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.properties.map((prop: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="py-2 text-xs font-mono">{prop.name}</TableCell>
                        <TableCell className="py-2 text-xs">{prop.type}</TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{prop.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {displayData.notes && (
            <div>
              <h4 className="text-sm font-semibold mb-1 text-muted-foreground">Заметки</h4>
              <p className="text-xs font-mono bg-muted/50 p-3 rounded border">{displayData.notes}</p>
            </div>
          )}

          {/* Matomo Code Generator */}
          <MatomoCodeGenerator event={displayData} />

          <div className="border-t pt-6">
            <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Комментарии ({comments.length})
            </h4>
            
            <div className="space-y-4 mb-6">
              {comments.map((c: any) => (
                <div key={c.id} className="bg-muted/30 p-3 rounded-lg border border-border/50">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(c.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90">{c.content}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Нет комментариев. Будьте первым!</p>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea 
                placeholder="Оставьте комментарий к событию..." 
                className="min-h-[80px] text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button 
                size="icon" 
                className="self-end" 
                disabled={!comment.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate(comment)}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Здоровье */}
        <TabsContent value="health" className="space-y-6 pt-4">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Платформы и статусы</h4>
            <div className="space-y-3">
              {/* Use version-specific platform statuses from API */}
              {(platformStatuses.length > 0 
                ? platformStatuses 
                : (displayData.platforms || []).map((p: string) => ({
                    platform: p,
                    implementationStatus: "черновик",
                    validationStatus: "ожидает_проверки"
                  }))
              ).map((ps: any) => {
                const p = ps.platform;
                const jiraLink = ps.jiraLink || displayData.platformJiraLinks?.[p];
                return (
                  <div key={p} className="p-3 bg-muted/30 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className="uppercase text-[10px]">
                        {p}
                      </Badge>
                      {jiraLink && (
                        <a
                          href={jiraLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Jira
                        </a>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <span className="text-xs text-muted-foreground">Внедрение:</span>
                          <div className="mt-1">
                            <Select
                              value={ps.implementationStatus || "черновик"}
                              onValueChange={(value) => 
                                updateStatusMutation.mutate({ 
                                  platform: p, 
                                  implementationStatus: value,
                                  versionNumber: displayVersion
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`select-implementation-${p}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {IMPLEMENTATION_STATUS.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs" data-testid={`option-impl-${s}-${p}`}>
                                    {s.replace(/_/g, ' ')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-xs text-muted-foreground">Валидация:</span>
                          <div className="mt-1">
                            <Select
                              value={ps.validationStatus || "ожидает_проверки"}
                              onValueChange={(value) => 
                                updateStatusMutation.mutate({ 
                                  platform: p, 
                                  validationStatus: value,
                                  versionNumber: displayVersion
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`select-validation-${p}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VALIDATION_STATUS.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs" data-testid={`option-valid-${s}-${p}`}>
                                    {s.replace(/_/g, ' ')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      {ps.history && ps.history.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            История изменений ({ps.history.length})
                          </summary>
                          <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                            {ps.history.slice().reverse().map((h: any, i: number) => (
                              <div key={`hist-${i}`} className="flex items-center gap-2 text-muted-foreground py-1">
                                {h.statusType === 'implementation' ? (
                                  <Rocket className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                )}
                                <span className="font-medium text-foreground">
                                  {h.statusType === 'implementation' ? 'Внедрение:' : 'Валидация:'}
                                </span>
                                <span className={getStatusColor(h.oldStatus)}>
                                  {h.oldStatus?.replace(/_/g, ' ') || '-'}
                                </span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className={getStatusColor(h.newStatus)}>
                                  {h.newStatus?.replace(/_/g, ' ')}
                                </span>
                                <span className="ml-auto opacity-70 whitespace-nowrap">
                                  {h.createdAt ? new Date(h.createdAt).toLocaleDateString('ru-RU') : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analytics Chart */}
          <AnalyticsChart 
            eventAction={event.action} 
            eventCategory={event.category}
            platforms={event.platforms || []}
          />
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function EventsList() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>(PLATFORMS[0]);
  const [status, setStatus] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
  // Sheet state for creating/editing
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);

    const { data: events, isLoading } = useEvents({ 
    search, 
    platform: platform,
    status: status === "all" ? undefined : status 
  });
  
  const deleteMutation = useDeleteEvent();

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
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

  const getPlatformIcon = (p: string) => {
    switch (p) {
      case 'web': return <Globe className="w-3.5 h-3.5" />;
      case 'ios': 
      case 'android': return <Smartphone className="w-3.5 h-3.5" />;
      case 'backend': return <Server className="w-3.5 h-3.5" />;
      default: return <Code className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-muted/5">
      <Sidebar />
      <main className="flex-1 md:ml-64 p-6 lg:p-10 space-y-6">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Схема событий</h1>
            <p className="text-muted-foreground mt-1">Управление определениями аналитических событий продукта.</p>
          </div>
          <Button onClick={handleCreate} className="shadow-md hover:shadow-lg transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Новое событие
          </Button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Поиск по названию или категории..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-none bg-muted/50 focus-visible:ring-1"
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
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Event Category</TableHead>
                <TableHead>Блок</TableHead>
                <TableHead>Event Action</TableHead>
                <TableHead className="w-[200px]">Event Name</TableHead>
                <TableHead>Event Value</TableHead>
                <TableHead>Платформы и статусы</TableHead>
                <TableHead className="w-[50px]"></TableHead>
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
                    <TableCell />
                  </TableRow>
                ))
              ) : events?.length === 0 ? (
                // Empty State
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
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
                      <Badge variant="outline" className="font-normal">
                        {event.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground/80">{event.block || '-'}</span>
                    </TableCell>
                    <TableCell className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => setSelectedEvent(event)}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium group-hover:text-primary transition-colors underline-offset-4 group-hover:underline">{event.action}</span>
                              <VersionBadge event={event} />
                            </div>
                            {event.actionDescription && (
                              <span className="text-sm text-muted-foreground/80 line-clamp-2">
                                {event.actionDescription}
                              </span>
                            )}
                          </div>
                        </DialogTrigger>
                        {selectedEvent && <EventDetailsModal event={selectedEvent} />}
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
                        {event.platforms?.map((p) => {
                          const platformStatus = event.platformStatuses?.[p];
                          return (
                            <div key={p} className="flex items-center gap-1">
                              <Badge variant="secondary" className="font-normal capitalize gap-1 pl-1.5 text-[10px] min-w-[70px]">
                                {getPlatformIcon(p)}
                                {p}
                              </Badge>
                              {platformStatus && (
                                <div className="flex gap-0.5">
                                  <StatusBadge status={platformStatus.implementationStatus} size="sm" />
                                  <StatusBadge status={platformStatus.validationStatus} size="sm" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Действия</DropdownMenuLabel>
                          <DropdownMenuItem data-testid={`button-edit-event-${event.id}`} onClick={() => handleEdit(event)}>Редактировать</DropdownMenuItem>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-2xl w-full flex flex-col h-full">
            <SheetHeader className="mb-6 px-1">
              <SheetTitle>{editingEvent ? "Редактировать событие" : "Создать новое событие"}</SheetTitle>
              <SheetDescription>
                Определите схему и свойства вашего аналитического события.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto overflow-x-visible -mx-6 px-7 py-1">
              <EventForm 
                mode={editingEvent ? "edit" : "create"}
                initialData={editingEvent || undefined}
                onSuccess={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

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
