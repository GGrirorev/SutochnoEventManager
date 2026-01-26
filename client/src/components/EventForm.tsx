import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { insertEventSchema, PLATFORMS, type InsertEvent, type PropertyTemplate } from "@shared/schema";
import { useCreateEvent, useUpdateEvent } from "@/hooks/use-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Loader2, Library, Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EventFormProps {
  initialData?: InsertEvent & { id?: number };
  onSuccess?: () => void;
  mode: "create" | "edit";
}

const storageFormatToType: Record<string, string> = {
  "текст": "string",
  "целое_число": "number",
  "дробное_число": "number",
  "дата_и_время": "string",
  "булево": "boolean",
  "массив": "array",
  "объект": "object"
};

export function EventForm({ initialData, onSuccess, mode }: EventFormProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();
  
  // State for version confirmation dialog
  const [showVersionConfirm, setShowVersionConfirm] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<InsertEvent | null>(null);
  const [changeDescription, setChangeDescription] = useState("");

  const { data: propertyTemplates = [] } = useQuery<PropertyTemplate[]>({
    queryKey: ["/api/property-templates"],
    queryFn: async () => {
      const res = await fetch("/api/property-templates");
      return res.json();
    }
  });
  
  const form = useForm<InsertEvent>({
    resolver: zodResolver(insertEventSchema),
    defaultValues: initialData || {
      category: "",
      block: "",
      action: "",
      actionDescription: "",
      name: "",
      valueDescription: "",
      platforms: [],
      platformJiraLinks: {},
      platformStatuses: {},
      implementationStatus: "черновик",
      validationStatus: "ожидает_проверки",
      owner: "",
      notes: "",
      properties: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "properties" as never, // Typings for dynamic jsonb are tricky with Zod
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Handler that's triggered by form submission
  const onSubmit = async (data: InsertEvent) => {
    // In edit mode, show confirmation dialog first
    if (mode === "edit" && initialData?.id) {
      setPendingFormData(data);
      setShowVersionConfirm(true);
      return;
    }
    // In create mode, proceed directly
    await performSubmit(data);
  };

  // Actual submit function that performs the update
  const performSubmit = async (data: InsertEvent, description?: string) => {
    let eventId: number;
    
    if (mode === "edit" && initialData?.id) {
      // Include change description and author for versioning
      await updateMutation.mutateAsync({ 
        id: initialData.id, 
        ...data,
        changeDescription: description || "Обновление события",
        createdBy: "Админ" // TODO: Replace with actual user when auth is implemented
      });
      eventId = initialData.id;
      // Platform statuses for the new version are created by the server with default values
      // (черновик / ожидает_проверки). User can change them later in the Health tab.
    } else {
      const newEvent = await createMutation.mutateAsync(data);
      eventId = newEvent.id;
      // Platform statuses are already created by the server for new events
    }
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "platform-statuses"] });
    
    onSuccess?.();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 h-full flex flex-col">
        <div className="flex-1 overflow-y-auto overflow-x-visible px-1 -mx-1">
          <div className="space-y-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Category *</FormLabel>
                    <FormControl>
                      <Input placeholder="например, Авторизация" data-testid="input-event-category" {...field} />
                    </FormControl>
                    <FormDescription>Верхнеуровневая категория событий.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="block"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Блок</FormLabel>
                    <FormControl>
                      <Input placeholder="например, Шапка" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>В каком блоке на странице происходит событие.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="action"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Action *</FormLabel>
                    <FormControl>
                      <Input placeholder="например, click" data-testid="input-event-action" {...field} />
                    </FormControl>
                    <FormDescription>Основное действие конкретного события.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="actionDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-blue-600 dark:text-blue-400">Описание действия *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Что триггерит это действие?" 
                      className="resize-none h-20 border-blue-200 focus-visible:ring-blue-500"
                      data-testid="input-action-description"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Event Name (Вторичное)</FormLabel>
                    <FormControl>
                      <Input placeholder="например, checkout_completed" className="font-mono text-sm bg-muted/30" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Дополнительный контекст к действию.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valueDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Value (Описание)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="например, Сумма оплаты или ID товара" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>Описание передаваемого значения события.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="platforms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Платформы</FormLabel>
                  <div className="space-y-3 pt-1">
                    {PLATFORMS.map((p) => {
                      const isSelected = field.value?.includes(p);
                      return (
                        <div key={p} className={`p-3 rounded-lg border transition-colors ${isSelected ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-transparent'}`}>
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={`platform-${p}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, p]);
                                } else {
                                  field.onChange(current.filter((v: string) => v !== p));
                                  // Remove Jira link when platform is unchecked
                                  const currentLinks = form.getValues("platformJiraLinks") || {};
                                  const { [p]: removedLink, ...restLinks } = currentLinks;
                                  form.setValue("platformJiraLinks", restLinks);
                                }
                              }}
                            />
                            <label
                              htmlFor={`platform-${p}`}
                              className="text-sm font-medium leading-none cursor-pointer uppercase flex-shrink-0"
                            >
                              {p}
                            </label>
                          </div>
                          
                          {isSelected && (
                            <div className="ml-6 mt-2">
                              <div className="flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                <Input
                                  placeholder="Ссылка на задачу Jira (опционально)"
                                  className="h-8 text-xs"
                                  value={form.watch("platformJiraLinks")?.[p] || ""}
                                  onChange={(e) => {
                                    const currentLinks = form.getValues("platformJiraLinks") || {};
                                    form.setValue("platformJiraLinks", {
                                      ...currentLinks,
                                      [p]: e.target.value
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="owner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ответственный</FormLabel>
                  <FormControl>
                    <Input placeholder="Команда или человек" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Properties Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <FormLabel className="text-base font-semibold">Свойства события</FormLabel>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8">
                        <Library className="w-4 h-4 mr-2" />
                        Из библиотеки
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                      <DropdownMenuLabel>Выберите свойство</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {propertyTemplates.length === 0 ? (
                        <DropdownMenuItem disabled>Библиотека пуста</DropdownMenuItem>
                      ) : (
                        propertyTemplates.map((template) => (
                          <DropdownMenuItem
                            key={template.id}
                            onClick={() => append({
                              name: template.name,
                              type: storageFormatToType[template.storageFormat] || "string",
                              required: true,
                              description: template.description || ""
                            })}
                            className="flex flex-col items-start"
                          >
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs text-muted-foreground">
                              D{template.dimension} • {template.storageFormat}
                            </span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => append({ name: "", type: "string", required: true, description: "" })}
                    className="h-8"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Новое
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="h-[200px] rounded-md border p-4 bg-muted/10">
                {fields.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Свойства не определены. Нажмите добавить, чтобы определить схему.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-start p-3 bg-card rounded-md border shadow-sm group relative">
                        <div className="col-span-4">
                          <Input 
                            {...form.register(`properties.${index}.name` as const)} 
                            placeholder="название_свойства" 
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-3">
                          <Select 
                            onValueChange={(val) => form.setValue(`properties.${index}.type` as any, val)}
                            defaultValue={field.type}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Тип" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="object">Object</SelectItem>
                              <SelectItem value="array">Array</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4">
                          <Input 
                            {...form.register(`properties.${index}.description` as const)} 
                            placeholder="Описание..." 
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center pt-2">
                           <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="col-span-12 flex items-center gap-2 mt-2">
                          <Switch 
                             checked={form.watch(`properties.${index}.required` as any)}
                             onCheckedChange={(checked) => form.setValue(`properties.${index}.required` as any, checked)}
                          />
                          <span className="text-xs text-muted-foreground">Обязательно</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Технические заметки</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Любые детали реализации или особенности..." 
                      className="resize-none h-20 font-mono text-xs"
                      {...field}
                      value={field.value || ""} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="pt-4 border-t flex justify-end gap-3 sticky bottom-0 bg-background py-2">
          <Button type="submit" disabled={isPending} className="w-48" data-testid="button-save-event">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "create" ? "Создать событие" : "Сохранить изменения"}
          </Button>
        </div>
      </form>

      {/* Version Confirmation Dialog */}
      <AlertDialog open={showVersionConfirm} onOpenChange={setShowVersionConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создание новой версии</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Вы сохраняете изменения события. Это создаст новую версию (v{(initialData as any)?.currentVersion + 1 || 2}).
              </p>
              <div className="mt-4">
                <label className="text-sm font-medium text-foreground">
                  Описание изменений (опционально)
                </label>
                <Textarea 
                  placeholder="Что изменилось в этой версии?"
                  className="mt-2"
                  data-testid="input-version-description"
                  value={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.value)}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowVersionConfirm(false);
              setPendingFormData(null);
              setChangeDescription("");
            }}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction 
              data-testid="button-save-version"
              onClick={async () => {
                if (pendingFormData) {
                  await performSubmit(pendingFormData, changeDescription || undefined);
                  setShowVersionConfirm(false);
                  setPendingFormData(null);
                  setChangeDescription("");
                }
              }}>
              Сохранить версию
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
