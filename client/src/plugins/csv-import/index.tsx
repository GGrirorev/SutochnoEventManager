import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle, Loader2, Download, Info } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ParsedEvent {
  platforms: string[];
  block: string;
  actionDescription: string;
  category: string;
  action: string;
  name: string;
  valueDescription: string;
  properties: { name: string; type: string; required: boolean; description: string }[];
}

interface ImportPreview {
  newEvents: ParsedEvent[];
  existingEvents: { parsed: ParsedEvent; existingId: number; existingVersion: number }[];
  errors: string[];
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const EXAMPLE_CSV = `Платформа;Блок;Действие;Event Category;Event Action;Event Name;Event Value;dimension1;dimension2
WEB, iOS, Android;Авторизация;Пользователь нажал кнопку входа;auth;login_click;login_button;;user_type;
WEB;Поиск;Пользователь выполнил поиск;search;search_submit;search_form;search_query;search_type;results_count
iOS, Android;Бронирование;Пользователь начал оформление;booking;start_checkout;checkout_form;;object_id;price`;

export function CsvImportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"instructions" | "preview" | "result">("instructions");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("skip");
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<number>>(new Set());
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parseCsvLine = useCallback((line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ";" && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }, []);

  const splitCsvIntoRows = useCallback((content: string): string[] => {
    const rows: string[] = [];
    let currentRow = "";
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentRow += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          currentRow += char;
        }
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = "";
        if (char === '\r') i++;
      } else if (char === '\r' && !inQuotes) {
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = "";
      } else {
        currentRow += char;
      }
    }
    
    if (currentRow.trim()) {
      rows.push(currentRow);
    }
    
    return rows;
  }, []);

  const parseCsv = useCallback((content: string): ParsedEvent[] => {
    const lines = splitCsvIntoRows(content);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const events: ParsedEvent[] = [];

    const platformIndex = headers.findIndex(h => h.toLowerCase().includes("платформа"));
    const blockIndex = headers.findIndex(h => h.toLowerCase() === "блок");
    const actionDescIndex = headers.findIndex(h => h.toLowerCase() === "действие");
    const categoryIndex = headers.findIndex(h => h.toLowerCase().includes("event category"));
    const actionIndex = headers.findIndex(h => h.toLowerCase().includes("event action"));
    const nameIndex = headers.findIndex(h => h.toLowerCase().includes("event name"));
    const valueIndex = headers.findIndex(h => h.toLowerCase().includes("event value"));

    const dimensionIndices: { index: number; name: string }[] = [];
    headers.forEach((h, i) => {
      if (h.toLowerCase().startsWith("dimension")) {
        dimensionIndices.push({ index: i, name: h });
      }
    });

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      
      if (!values[categoryIndex] || !values[actionIndex]) continue;

      const platformsRaw = values[platformIndex] || "";
      const platforms: string[] = [];
      if (platformsRaw.toLowerCase().includes("web")) platforms.push("web");
      if (platformsRaw.toLowerCase().includes("ios")) platforms.push("ios");
      if (platformsRaw.toLowerCase().includes("android")) platforms.push("android");
      if (platformsRaw.toLowerCase().includes("backend")) platforms.push("backend");

      const properties: { name: string; type: string; required: boolean; description: string }[] = [];
      
      if (values[valueIndex]) {
        properties.push({
          name: "eventValue",
          type: "string",
          required: false,
          description: values[valueIndex].replace(/\n/g, " ").trim()
        });
      }

      dimensionIndices.forEach(({ name, index }) => {
        const desc = values[index];
        if (desc) {
          properties.push({
            name: name,
            type: "string",
            required: false,
            description: desc.replace(/\n/g, " ").trim()
          });
        }
      });

      events.push({
        platforms,
        block: values[blockIndex] || "",
        actionDescription: values[actionDescIndex] || "",
        category: values[categoryIndex],
        action: values[actionIndex],
        name: values[nameIndex] || "",
        valueDescription: values[valueIndex] ? values[valueIndex].replace(/\n/g, " ").trim() : "",
        properties
      });
    }

    return events;
  }, [parseCsvLine, splitCsvIntoRows]);

  const previewMutation = useMutation({
    mutationFn: async (parsedEvents: ParsedEvent[]): Promise<ImportPreview> => {
      const response = await apiRequest("POST", "/api/events/import/preview", { events: parsedEvents });
      return response.json();
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedDuplicates(new Set(data.existingEvents.map((_, i) => i)));
      setStep("preview");
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка предпросмотра",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const importMutation = useMutation({
    mutationFn: async (data: {
      newEvents: ParsedEvent[];
      updateEvents: { parsed: ParsedEvent; existingId: number }[];
    }): Promise<ImportResult> => {
      const response = await apiRequest("POST", "/api/events/import", data);
      return response.json();
    },
    onSuccess: (result) => {
      setImportResult(result);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Импорт завершен",
        description: `Создано: ${result.created}, Обновлено: ${result.updated}, Пропущено: ${result.skipped}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка импорта",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseCsv(content);
      if (parsed.length === 0) {
        toast({
          title: "Ошибка",
          description: "Не удалось найти события в CSV файле. Проверьте формат файла.",
          variant: "destructive",
        });
        return;
      }
      previewMutation.mutate(parsed);
    };
    reader.readAsText(file, "UTF-8");
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [parseCsv, previewMutation, toast]);

  const handleImport = useCallback(() => {
    if (!preview) return;

    const updateEvents = duplicateAction === "update" 
      ? preview.existingEvents
          .filter((_, i) => selectedDuplicates.has(i))
          .map(e => ({ parsed: e.parsed, existingId: e.existingId }))
      : [];

    importMutation.mutate({
      newEvents: preview.newEvents,
      updateEvents
    });
  }, [preview, duplicateAction, selectedDuplicates, importMutation]);

  const handleClose = () => {
    setIsOpen(false);
    setStep("instructions");
    setPreview(null);
    setImportResult(null);
    setDuplicateAction("skip");
    setSelectedDuplicates(new Set());
  };

  const handleDownloadExample = () => {
    const blob = new Blob([EXAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "events_example.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const toggleDuplicate = (index: number) => {
    const newSet = new Set(selectedDuplicates);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedDuplicates(newSet);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-csv-file"
      />
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        data-testid="button-import-csv"
      >
        <Upload className="w-4 h-4 mr-2" />
        Импорт
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Импорт событий из CSV
            </DialogTitle>
            <DialogDescription>
              {step === "instructions" && "Загрузите CSV файл для импорта событий"}
              {step === "preview" && "Просмотрите события перед импортом"}
              {step === "result" && "Результаты импорта"}
            </DialogDescription>
          </DialogHeader>

          {step === "instructions" && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
                <div className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300">
                  <Info className="w-5 h-5" />
                  Требования к файлу
                </div>
                <ul className="text-sm space-y-2 text-blue-600 dark:text-blue-400">
                  <li>• Формат файла: CSV с разделителем <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">;</code> (точка с запятой)</li>
                  <li>• Кодировка: UTF-8</li>
                  <li>• Обязательные колонки: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Event Category</code>, <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Event Action</code></li>
                  <li>• Дополнительные колонки: Платформа, Блок, Действие, Event Name, Event Value, dimension1, dimension2...</li>
                  <li>• Платформы указываются через запятую: WEB, iOS, Android, Backend</li>
                </ul>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="font-medium">Структура колонок</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Платформа</TableHead>
                        <TableHead className="text-xs">Блок</TableHead>
                        <TableHead className="text-xs">Действие</TableHead>
                        <TableHead className="text-xs">Event Category</TableHead>
                        <TableHead className="text-xs">Event Action</TableHead>
                        <TableHead className="text-xs">Event Name</TableHead>
                        <TableHead className="text-xs">Event Value</TableHead>
                        <TableHead className="text-xs">dimension*</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground">WEB, iOS</TableCell>
                        <TableCell className="text-xs text-muted-foreground">Авторизация</TableCell>
                        <TableCell className="text-xs text-muted-foreground">Клик по кнопке</TableCell>
                        <TableCell className="text-xs text-muted-foreground">auth</TableCell>
                        <TableCell className="text-xs text-muted-foreground">login_click</TableCell>
                        <TableCell className="text-xs text-muted-foreground">login_btn</TableCell>
                        <TableCell className="text-xs text-muted-foreground">-</TableCell>
                        <TableCell className="text-xs text-muted-foreground">user_type</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 font-medium text-yellow-700 dark:text-yellow-300">
                  <AlertTriangle className="w-5 h-5" />
                  Ограничения
                </div>
                <ul className="text-sm space-y-1 text-yellow-600 dark:text-yellow-400">
                  <li>• Дубликаты определяются по совпадению Event Category + Event Action</li>
                  <li>• При обновлении существующего события создается новая версия</li>
                  <li>• Пустые строки и строки без Category/Action пропускаются</li>
                </ul>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownloadExample}
                  className="w-full sm:w-auto"
                  data-testid="button-download-example"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Скачать пример
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto"
                  disabled={previewMutation.isPending}
                  data-testid="button-select-file"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Анализ файла...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Выбрать файл
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "preview" && preview && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-500">{preview.newEvents.length}</Badge>
                  <span>Новых событий</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-yellow-500">{preview.existingEvents.length}</Badge>
                  <span>Существующих событий</span>
                </div>
              </div>

              {preview.existingEvents.length > 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    Найдены существующие события
                  </div>
                  <RadioGroup
                    value={duplicateAction}
                    onValueChange={(v) => setDuplicateAction(v as "update" | "skip")}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="update" id="update" data-testid="radio-update-duplicates" />
                      <Label htmlFor="update">Обновить события (создать новую версию)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id="skip" data-testid="radio-skip-duplicates" />
                      <Label htmlFor="skip">Пропустить эти события</Label>
                    </div>
                  </RadioGroup>

                  {duplicateAction === "update" && (
                    <ScrollArea className="h-40 border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Версия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.existingEvents.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDuplicates.has(i)}
                                  onCheckedChange={() => toggleDuplicate(i)}
                                  data-testid={`checkbox-duplicate-${i}`}
                                />
                              </TableCell>
                              <TableCell>{e.parsed.category}</TableCell>
                              <TableCell>{e.parsed.action}</TableCell>
                              <TableCell>v{e.existingVersion}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              )}

              {preview.newEvents.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Новые события:</div>
                  <ScrollArea className="h-48 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Платформы</TableHead>
                          <TableHead>Свойства</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.newEvents.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell>{e.category}</TableCell>
                            <TableCell>{e.action}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {e.platforms.map(p => (
                                  <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{e.properties.length}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Ошибки парсинга:
                  </div>
                  <ul className="text-sm text-red-600 list-disc pl-4">
                    {preview.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("instructions")} data-testid="button-back">
                  Назад
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={importMutation.isPending || (preview.newEvents.length === 0 && (duplicateAction === "skip" || selectedDuplicates.size === 0))}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Импортировать
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "result" && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-medium">
                <CheckCircle className="w-6 h-6 text-green-500" />
                Импорт завершен
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.created}</div>
                  <div className="text-sm text-muted-foreground">Создано</div>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-sm text-muted-foreground">Обновлено</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-600">{importResult.skipped}</div>
                  <div className="text-sm text-muted-foreground">Пропущено</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="font-medium text-red-600 mb-2">Ошибки:</div>
                  <ul className="text-sm text-red-600 list-disc pl-4">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button onClick={handleClose} data-testid="button-close-import">Закрыть</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
