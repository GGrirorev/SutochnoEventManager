import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { insertEventSchema, IMPLEMENTATION_STATUS, PLATFORMS, VALIDATION_STATUS, type InsertEvent, type PropertyTemplate, type PlatformStatuses, type PlatformStatus } from "@shared/schema";
import { useCreateEvent, useUpdateEvent, useCreatePlatformStatus, useUpdatePlatformStatus, useDeletePlatformStatus, useEventPlatformStatuses } from "@/hooks/use-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

// Helper to create default platform status
const createDefaultPlatformStatus = (): PlatformStatus => ({
  implementationStatus: "черновик",
  validationStatus: "ожидает_проверки",
  implementationHistory: [{ status: "черновик", timestamp: new Date().toISOString() }],
  validationHistory: [{ status: "ожидает_проверки", timestamp: new Date().toISOString() }]
});

// Helper to update platform status with history
const updatePlatformStatus = (
  currentStatus: PlatformStatus | undefined,
  statusType: "implementationStatus" | "validationStatus",
  newStatus: string
): PlatformStatus => {
  const base = currentStatus || createDefaultPlatformStatus();
  const historyKey = statusType === "implementationStatus" ? "implementationHistory" : "validationHistory";
  
  return {
    ...base,
    [statusType]: newStatus,
    [historyKey]: [
      ...base[historyKey],
      { status: newStatus, timestamp: new Date().toISOString() }
    ]
  };
};

export function EventForm({ initialData, onSuccess, mode }: EventFormProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();
  const createPlatformStatusMutation = useCreatePlatformStatus();
  const updatePlatformStatusMutation = useUpdatePlatformStatus();
  const deletePlatformStatusMutation = useDeletePlatformStatus();
  
  // Fetch existing platform statuses when editing
  const { data: existingPlatformStatuses = [], refetch: refetchPlatformStatuses } = useEventPlatformStatuses(initialData?.id || 0);

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
      action: "",
      actionDescription: "",
      name: "",
      valueDescription: "",
      platforms: ["все"],
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

  const isPending = createMutation.isPending || updateMutation.isPending || createPlatformStatusMutation.isPending || updatePlatformStatusMutation.isPending || deletePlatformStatusMutation.isPending;

  const onSubmit = async (data: InsertEvent) => {
    let eventId: number;
    
    if (mode === "edit" && initialData?.id) {
      await updateMutation.mutateAsync({ id: initialData.id, ...data });
      eventId = initialData.id;
      
      // Refetch platform statuses to get latest data before diffing
      const { data: freshPlatformStatuses } = await refetchPlatformStatuses();
      const currentPlatformStatuses = freshPlatformStatuses || existingPlatformStatuses;
      
      // Save platform statuses to the new table
      const platforms = data.platforms || [];
      const platformStatusesData = data.platformStatuses || {};
      const jiraLinks = data.platformJiraLinks || {};
      
      // Delete platform statuses for removed platforms
      const existingPlatformNames = currentPlatformStatuses.map((s: any) => s.platform);
      for (const existingPlatform of existingPlatformNames) {
        if (!platforms.includes(existingPlatform)) {
          await deletePlatformStatusMutation.mutateAsync({ eventId, platform: existingPlatform });
        }
      }
      
      // Create or update platform statuses for current platforms
      for (const platform of platforms) {
        const status = platformStatusesData[platform];
        const jiraLink = jiraLinks[platform];
        
        // Check if this platform status already exists
        const existingStatus = currentPlatformStatuses.find((s: any) => s.platform === platform);
        
        if (existingStatus) {
          // Update existing platform status
          await updatePlatformStatusMutation.mutateAsync({
            eventId,
            platform,
            jiraLink: jiraLink || undefined,
            implementationStatus: status?.implementationStatus,
            validationStatus: status?.validationStatus,
          });
        } else {
          // Create new platform status
          await createPlatformStatusMutation.mutateAsync({
            eventId,
            platform,
            jiraLink: jiraLink || undefined,
            implementationStatus: status?.implementationStatus || "черновик",
            validationStatus: status?.validationStatus || "ожидает_проверки",
          });
        }
      }
    } else {
      const newEvent = await createMutation.mutateAsync(data);
      eventId = newEvent.id;
      
      // For new events, create platform statuses for all platforms
      const platforms = data.platforms || [];
      const platformStatusesData = data.platformStatuses || {};
      const jiraLinks = data.platformJiraLinks || {};
      
      for (const platform of platforms) {
        const status = platformStatusesData[platform];
        const jiraLink = jiraLinks[platform];
        
        await createPlatformStatusMutation.mutateAsync({
          eventId,
          platform,
          jiraLink: jiraLink || undefined,
          implementationStatus: status?.implementationStatus || "черновик",
          validationStatus: status?.validationStatus || "ожидает_проверки",
        });
      }
    }
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "platform-statuses"] });
    
    onSuccess?.();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 h-full flex flex-col">
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          <div className="space-y-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Category *</FormLabel>
                    <FormControl>
                      <Input placeholder="например, Авторизация" {...field} />
                    </FormControl>
                    <FormDescription>Верхнеуровневая категория событий.</FormDescription>
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
                      <Input placeholder="например, click" {...field} />
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
                      const platformStatus = form.watch("platformStatuses")?.[p];
                      return (
                        <div key={p} className={`p-3 rounded-lg border transition-colors ${isSelected ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-transparent'}`}>
                          <div className="flex items-center gap-3 mb-2">
                            <Checkbox
                              id={`platform-${p}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, p]);
                                  // Initialize platform status
                                  const currentStatuses = form.getValues("platformStatuses") || {};
                                  if (!currentStatuses[p]) {
                                    form.setValue("platformStatuses", {
                                      ...currentStatuses,
                                      [p]: createDefaultPlatformStatus()
                                    });
                                  }
                                } else {
                                  field.onChange(current.filter((v: string) => v !== p));
                                  // Remove Jira link and status when platform is unchecked
                                  const currentLinks = form.getValues("platformJiraLinks") || {};
                                  const { [p]: removedLink, ...restLinks } = currentLinks;
                                  form.setValue("platformJiraLinks", restLinks);
                                  const currentStatuses = form.getValues("platformStatuses") || {};
                                  const { [p]: removedStatus, ...restStatuses } = currentStatuses;
                                  form.setValue("platformStatuses", restStatuses);
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
                            <div className="ml-6 space-y-3">
                              {/* Jira Link */}
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
                              
                              {/* Platform-specific statuses */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Внедрение</label>
                                  <Select
                                    value={platformStatus?.implementationStatus || "черновик"}
                                    onValueChange={(value) => {
                                      const currentStatuses = form.getValues("platformStatuses") || {};
                                      form.setValue("platformStatuses", {
                                        ...currentStatuses,
                                        [p]: updatePlatformStatus(currentStatuses[p], "implementationStatus", value)
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {IMPLEMENTATION_STATUS.map(s => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                          {s.replace('_', ' ').toUpperCase()}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground mb-1 block">Валидация</label>
                                  <Select
                                    value={platformStatus?.validationStatus || "ожидает_проверки"}
                                    onValueChange={(value) => {
                                      const currentStatuses = form.getValues("platformStatuses") || {};
                                      form.setValue("platformStatuses", {
                                        ...currentStatuses,
                                        [p]: updatePlatformStatus(currentStatuses[p], "validationStatus", value)
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {VALIDATION_STATUS.map(s => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                          {s.replace('_', ' ').toUpperCase()}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
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
          <Button type="submit" disabled={isPending} className="w-48">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "create" ? "Создать событие" : "Сохранить изменения"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
