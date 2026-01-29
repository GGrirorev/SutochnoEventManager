import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Sidebar, useSidebar, MobileHeader } from "@/components/Sidebar";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Users, Loader2, Shield, Eye, Code, BarChart3, Clock, History } from "lucide-react";
import { USER_ROLES, ROLE_LABELS, insertUserSchema, type User, type UserRole, type InsertUser } from "@shared/schema";

type UserLoginLogWithUser = {
  id: number;
  userId: number;
  loginAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  userName: string;
  userEmail: string;
};

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Никогда";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) return "Только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} мес. назад`;
  return `${Math.floor(diffDays / 365)} г. назад`;
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const createUserFormSchema = insertUserSchema.extend({
  email: z.string().email("Введите корректный email"),
  name: z.string().min(1, "Введите имя пользователя"),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
});

const editUserFormSchema = insertUserSchema.extend({
  email: z.string().email("Введите корректный email"),
  name: z.string().min(1, "Введите имя пользователя"),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов").optional().or(z.literal("")),
});

type CreateUserFormData = z.infer<typeof createUserFormSchema>;
type EditUserFormData = z.infer<typeof editUserFormSchema>;
type UserFormData = CreateUserFormData | EditUserFormData;

function UserForm({ 
  initialData, 
  onSuccess, 
  mode 
}: { 
  initialData?: User; 
  onSuccess: () => void; 
  mode: "create" | "edit" 
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const formSchema = mode === "create" ? createUserFormSchema : editUserFormSchema;

  const form = useForm<UserFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initialData?.email || "",
      name: initialData?.name || "",
      role: initialData?.role || "viewer",
      department: initialData?.department || "",
      isActive: initialData?.isActive ?? true,
      password: "",
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const url = mode === "create" 
        ? "/api/users" 
        : `/api/users/${initialData?.id}`;
      
      const payload = { ...data };
      if (mode === "edit" && (!payload.password || payload.password === "")) {
        delete (payload as EditUserFormData).password;
      }
      
      const res = await apiRequest(mode === "create" ? "POST" : "PATCH", url, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: mode === "create" ? "Пользователь создан" : "Пользователь обновлён",
        description: "Изменения успешно сохранены."
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось сохранить пользователя."
      });
    }
  });

  const onSubmit = (data: UserFormData) => {
    mutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input 
                  type="email"
                  placeholder="user@example.com"
                  data-testid="input-user-email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Имя</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Иван Иванов"
                  data-testid="input-user-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {mode === "create" ? "Пароль" : "Новый пароль (оставьте пустым, чтобы не менять)"}
              </FormLabel>
              <FormControl>
                <Input 
                  type="password"
                  placeholder={mode === "create" ? "Минимум 6 символов" : "Оставьте пустым, чтобы не менять"}
                  data-testid="input-user-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Роль</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-user-role">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {USER_ROLES.map(role => (
                    <SelectItem key={role} value={role} data-testid={`option-role-${role}`}>
                      <div className="flex items-center gap-2">
                        <RoleIcon role={role} />
                        <span>{ROLE_LABELS[role]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                <RoleDescription role={field.value} />
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Отдел</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Например: Аналитика, Разработка, Маркетинг"
                  data-testid="input-user-department"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center space-x-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-user-active"
                />
              </FormControl>
              <FormLabel className="!mt-0">Активен</FormLabel>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-user">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function RoleIcon({ role }: { role: UserRole }) {
  switch (role) {
    case "viewer": return <Eye className="h-4 w-4 text-muted-foreground" />;
    case "developer": return <Code className="h-4 w-4 text-blue-500" />;
    case "analyst": return <BarChart3 className="h-4 w-4 text-green-500" />;
    case "admin": return <Shield className="h-4 w-4 text-orange-500" />;
  }
}

function RoleDescription({ role }: { role: UserRole | undefined }) {
  const descriptions: Record<UserRole, string> = {
    viewer: "Может только просматривать события и свойства",
    developer: "Может просматривать события и изменять статусы платформ",
    analyst: "Может создавать и редактировать события, изменять статусы",
    admin: "Полный доступ ко всем функциям, включая управление пользователями"
  };
  if (!role) return null;
  return <span className="text-xs text-muted-foreground">{descriptions[role]}</span>;
}

function RoleBadge({ role }: { role: UserRole }) {
  const variants: Record<UserRole, string> = {
    viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    developer: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    analyst: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    admin: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
  };
  return (
    <Badge className={`${variants[role]} no-default-hover-elevate`} data-testid={`badge-role-${role}`}>
      <RoleIcon role={role} />
      <span className="ml-1">{ROLE_LABELS[role]}</span>
    </Badge>
  );
}

export default function UsersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"]
  });
  
  const { data: loginLogsData, isLoading: isLoadingLogs } = useQuery<{ logs: UserLoginLogWithUser[]; total: number }>({
    queryKey: ["/api/login-logs"]
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Пользователь удалён",
        description: "Пользователь успешно удалён из системы."
      });
      setDeleteUser(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось удалить пользователя."
      });
    }
  });

  const { collapsed } = useSidebar();
  
  return (
    <div className="flex min-h-screen" data-testid="users-page">
      <MobileHeader />
      <Sidebar />
      
      <main className={`flex-1 p-8 pt-20 md:pt-8 transition-all duration-300 ${collapsed ? "md:ml-16" : "md:ml-64"}`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
                <Users className="h-8 w-8" />
                Пользователи
              </h1>
              <p className="text-muted-foreground mt-1">
                Управление пользователями и правами доступа
              </p>
            </div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить пользователя
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый пользователь</DialogTitle>
                </DialogHeader>
                <UserForm 
                  mode="create" 
                  onSuccess={() => setIsCreateOpen(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="users" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="users" data-testid="tab-users">
                <Users className="h-4 w-4 mr-2" />
                Пользователи
              </TabsTrigger>
              <TabsTrigger value="logs" data-testid="tab-login-logs">
                <History className="h-4 w-4 mr-2" />
                Журнал входов
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="users">
          {isLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="loading-users">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/50" data-testid="empty-users">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Нет пользователей</h3>
              <p className="text-muted-foreground mb-4">Добавьте первого пользователя</p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-first-user">
                <Plus className="h-4 w-4 mr-2" />
                Добавить пользователя
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg" data-testid="users-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Отдел</TableHead>
                    <TableHead>Последний вход</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-[100px]">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow 
                      key={user.id}
                      onMouseEnter={() => setHoveredRow(user.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      data-testid={`row-user-${user.id}`}
                    >
                      <TableCell className="font-medium" data-testid={`text-user-name-${user.id}`}>
                        {user.name}
                      </TableCell>
                      <TableCell data-testid={`text-user-email-${user.id}`}>
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell data-testid={`text-user-department-${user.id}`}>
                        {user.department || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell data-testid={`text-user-last-login-${user.id}`}>
                        {user.lastLoginAt ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span title={formatDateTime(user.lastLoginAt)}>
                              {formatRelativeTime(user.lastLoginAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Никогда</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.isActive ? "default" : "secondary"}
                          className="no-default-hover-elevate"
                          data-testid={`badge-user-status-${user.id}`}
                        >
                          {user.isActive ? "Активен" : "Неактивен"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div 
                          className="flex items-center gap-1"
                          style={{ visibility: hoveredRow === user.id ? 'visible' : 'hidden' }}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditUser(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteUser(user)}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
            </TabsContent>
            
            <TabsContent value="logs">
              {isLoadingLogs ? (
                <div className="flex items-center justify-center h-64" data-testid="loading-logs">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !loginLogsData?.logs?.length ? (
                <div className="text-center py-12 border rounded-lg bg-muted/50" data-testid="empty-logs">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Нет записей</h3>
                  <p className="text-muted-foreground">Журнал входов пуст</p>
                </div>
              ) : (
                <div className="border rounded-lg" data-testid="login-logs-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Пользователь</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Время входа</TableHead>
                        <TableHead>IP-адрес</TableHead>
                        <TableHead>Браузер / Устройство</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginLogsData.logs.map((log) => (
                        <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                          <TableCell className="font-medium" data-testid={`text-log-user-${log.id}`}>
                            {log.userName}
                          </TableCell>
                          <TableCell data-testid={`text-log-email-${log.id}`}>
                            {log.userEmail}
                          </TableCell>
                          <TableCell data-testid={`text-log-time-${log.id}`}>
                            <div className="flex flex-col">
                              <span>{formatDateTime(log.loginAt)}</span>
                              <span className="text-xs text-muted-foreground">{formatRelativeTime(log.loginAt)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm" data-testid={`text-log-ip-${log.id}`}>
                            {log.ipAddress || "—"}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm" title={log.userAgent || ""} data-testid={`text-log-agent-${log.id}`}>
                            {log.userAgent ? (
                              log.userAgent.length > 50 ? log.userAgent.substring(0, 50) + "..." : log.userAgent
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Редактирование пользователя</DialogTitle>
              </DialogHeader>
              {editUser && (
                <UserForm 
                  mode="edit" 
                  initialData={editUser} 
                  onSuccess={() => setEditUser(null)} 
                />
              )}
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить пользователя "{deleteUser?.name}"? 
                  Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}
