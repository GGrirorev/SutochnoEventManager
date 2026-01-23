import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsChartProps {
  eventAction: string;
  eventCategory: string;
  platforms: string[];
}

interface AnalyticsDataPoint {
  date: string;
  web?: number;
  ios?: number;
  android?: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  web: "#3b82f6",
  ios: "#f97316", 
  android: "#22c55e"
};

const PLATFORM_LABELS: Record<string, string> = {
  web: "WEB",
  ios: "iOS",
  android: "Android"
};

export function AnalyticsChart({ eventAction, eventCategory, platforms }: AnalyticsChartProps) {
  const label = `${eventCategory} > @${eventAction}`;
  
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const activePlatforms = platforms.filter(p => ["web", "ios", "android"].includes(p.toLowerCase()));
  
  const webQuery = useQuery({
    queryKey: ["/api/analytics/events", label, "web", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/events?label=${encodeURIComponent(label)}&platform=web&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: activePlatforms.some(p => p.toLowerCase() === "web"),
    staleTime: 5 * 60 * 1000,
  });

  const iosQuery = useQuery({
    queryKey: ["/api/analytics/events", label, "ios", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/events?label=${encodeURIComponent(label)}&platform=ios&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: activePlatforms.some(p => p.toLowerCase() === "ios"),
    staleTime: 5 * 60 * 1000,
  });

  const androidQuery = useQuery({
    queryKey: ["/api/analytics/events", label, "android", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/events?label=${encodeURIComponent(label)}&platform=android&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: activePlatforms.some(p => p.toLowerCase() === "android"),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = webQuery.isLoading || iosQuery.isLoading || androidQuery.isLoading;
  const hasError = webQuery.isError || iosQuery.isError || androidQuery.isError;
  
  const chartData: AnalyticsDataPoint[] = [];
  
  const processData = (data: any, platform: string) => {
    if (!data || typeof data !== 'object') return;
    
    Object.entries(data).forEach(([date, dayData]: [string, any]) => {
      let existing = chartData.find(d => d.date === date);
      if (!existing) {
        existing = { date };
        chartData.push(existing);
      }
      
      // Handle array format: each day is an array of objects
      if (Array.isArray(dayData) && dayData.length > 0) {
        const events = dayData[0]?.nb_events || dayData[0]?.nb_visits || 0;
        (existing as any)[platform] = typeof events === 'number' ? events : parseInt(events) || 0;
      } else if (typeof dayData === 'object' && dayData !== null) {
        // Handle object format directly
        const events = dayData.nb_events || dayData.nb_visits || 0;
        (existing as any)[platform] = typeof events === 'number' ? events : parseInt(events) || 0;
      } else {
        (existing as any)[platform] = 0;
      }
    });
  };
  
  if (webQuery.data) processData(webQuery.data, 'web');
  if (iosQuery.data) processData(iosQuery.data, 'ios');
  if (androidQuery.data) processData(androidQuery.data, 'android');
  
  chartData.sort((a, b) => a.date.localeCompare(b.date));

  if (activePlatforms.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Аналитика событий (последние 30 дней)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загрузка данных...</span>
          </div>
        ) : hasError ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <AlertCircle className="w-5 h-5 mr-2" />
            Не удалось загрузить данные аналитики
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            Нет данных за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getDate()}.${date.getMonth() + 1}`;
                }}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('ru-RU');
                }}
              />
              <Legend 
                formatter={(value) => PLATFORM_LABELS[value] || value}
                wrapperStyle={{ fontSize: '12px' }}
              />
              {activePlatforms.map(platform => {
                const p = platform.toLowerCase();
                if (!["web", "ios", "android"].includes(p)) return null;
                return (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={PLATFORM_COLORS[p]}
                    strokeWidth={2}
                    dot={false}
                    name={p}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
