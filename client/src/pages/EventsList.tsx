import { useState } from "react";
import { useEvents, useDeleteEvent } from "@/hooks/use-events";
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
  Code
} from "lucide-react";
import { EventForm } from "@/components/EventForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Sidebar } from "@/components/Sidebar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { IMPLEMENTATION_STATUS, VALIDATION_STATUS, PLATFORMS, type Event } from "@shared/schema";

function EventDetailsModal({ event }: { event: any }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["/api/events", event.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event.id}/comments`);
      return res.json();
    }
  });

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

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-2xl flex items-center gap-2">
          {event.action}
          <Badge variant="outline">{event.category}</Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-6 pt-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Описание действия</h4>
              <p className="text-sm text-blue-600 dark:text-blue-400 italic">
                {event.actionDescription || "Нет описания"}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Event Name</h4>
              <p className="text-sm font-mono bg-muted p-2 rounded">{event.name || "-"}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Значение (Value)</h4>
              <p className="text-sm italic">{event.valueDescription || "Не указано"}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Платформы</h4>
              <div className="flex flex-wrap gap-1">
                {event.platforms?.map((p: string) => (
                  <Badge key={p} variant="secondary" className="uppercase text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Внедрение</h4>
                <StatusBadge status={event.implementationStatus} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Валидация</h4>
                <StatusBadge status={event.validationStatus} />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1">Ответственный</h4>
              <p className="text-sm">{event.owner || "Не назначен"}</p>
            </div>
          </div>
        </div>

        {event.properties && event.properties.length > 0 && (
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
                  {event.properties.map((prop: any, i: number) => (
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

        {event.notes && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-muted-foreground">Заметки</h4>
            <p className="text-xs font-mono bg-muted/50 p-3 rounded border">{event.notes}</p>
          </div>
        )}

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
      </div>
    </DialogContent>
  );
}

export default function EventsList() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
  // Sheet state for creating/editing
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);

    const { data: events, isLoading } = useEvents({ 
    search, 
    platform: platform === "all" ? undefined : platform,
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
                <SelectItem value="all">Все платформы</SelectItem>
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
                <TableHead>Event Action</TableHead>
                <TableHead className="w-[200px]">Event Name</TableHead>
                <TableHead>Event Value</TableHead>
                <TableHead>Платформа</TableHead>
                <TableHead>Внедрение</TableHead>
                <TableHead>Валидация</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading Skeleton
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-32 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted/50 rounded animate-pulse" /></TableCell>
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
                      <Badge variant="outline" className="font-normal">
                        {event.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => setSelectedEvent(event)}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors underline-offset-4 group-hover:underline">{event.action}</span>
                            {event.actionDescription && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 line-clamp-2 italic">
                                {event.actionDescription}
                              </span>
                            )}
                          </div>
                        </DialogTrigger>
                        {selectedEvent && <EventDetailsModal event={selectedEvent} />}
                      </Dialog>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 opacity-70">
                        <span className="font-mono text-xs text-muted-foreground">{event.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {event.valueDescription && (
                          <span className="text-sm italic text-muted-foreground">
                            {event.valueDescription}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {event.platforms?.map((p) => (
                          <Badge key={p} variant="secondary" className="font-normal capitalize gap-1 pl-1.5 text-[10px]">
                            {getPlatformIcon(p)}
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.implementationStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.validationStatus} />
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
                          <DropdownMenuItem onClick={() => handleEdit(event)}>Редактировать</DropdownMenuItem>
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
          <SheetContent className="sm:max-w-xl w-full flex flex-col h-full">
            <SheetHeader className="mb-6">
              <SheetTitle>{editingEvent ? "Редактировать событие" : "Создать новое событие"}</SheetTitle>
              <SheetDescription>
                Определите схему и свойства вашего аналитического события.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-hidden -mx-6 px-6">
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
