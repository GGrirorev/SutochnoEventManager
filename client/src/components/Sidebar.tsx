import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  List, 
  Settings, 
  Activity,
  GitGraph,
  Database
} from "lucide-react";
import logoHeader from "@assets/logo-header_1769085215107.png";

const NAV_ITEMS = [
  { label: "Обзор", icon: LayoutDashboard, href: "/" },
  { label: "Схема событий", icon: List, href: "/events" },
  { label: "Валидация", icon: Activity, href: "/validation" },
  { label: "Интеграция", icon: GitGraph, href: "/integration" },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 h-screen border-r bg-card flex flex-col fixed left-0 top-0 z-30 hidden md:flex">
      {/* Brand */}
      <div className="h-20 flex items-center px-4 border-b">
        <img src={logoHeader} alt="Суточно.ру Аналитика" className="h-10 w-auto object-contain" />
      </div>

      {/* Navigation */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Рабочая область
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                  isActive 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* User / Footer */}
      <div className="p-4 border-t bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            АД
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">Админ</p>
            <p className="text-xs text-muted-foreground truncate">Продукт-менеджер</p>
          </div>
          <Settings className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground" />
        </div>
      </div>
    </div>
  );
}
