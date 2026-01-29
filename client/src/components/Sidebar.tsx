import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  List, 
  Database,
  Users,
  LogOut,
  Puzzle,
  Bell,
  Folder,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import logoHeader from "@assets/logo-header_1769085215107.png";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createContext, useContext, useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { label: "Обзор", icon: LayoutDashboard, href: "/" },
  { label: "Схема событий", icon: List, href: "/events" },
  { label: "Свойства событий", icon: Database, href: "/properties" },
  { label: "Категории", icon: Folder, href: "/categories" },
];

const MONITORING_ITEMS = [
  { label: "Алерты", icon: Bell, href: "/alerts" },
];

const ADMIN_ITEMS = [
  { label: "Пользователи", icon: Users, href: "/users" },
  { label: "Модули", icon: Puzzle, href: "/plugins" },
];

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({ collapsed: false, setCollapsed: () => {} });

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });

  const handleSetCollapsed = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem("sidebar-collapsed", String(value));
  };

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed: handleSetCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { data: currentUser } = useCurrentUser();
  const { collapsed, setCollapsed } = useSidebar();
  
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className={cn(
      "h-screen border-r bg-card flex flex-col fixed left-0 top-0 z-30 hidden md:flex transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Toggle button on edge */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 z-40 h-6 w-6 rounded-full border bg-background shadow-md"
        data-testid="button-toggle-sidebar"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </Button>
      
      {/* Brand */}
      <div className="h-20 flex items-center justify-center px-4 border-b">
        {!collapsed && (
          <img src={logoHeader} alt="Sutochno.ru Аналитика" className="h-10 w-auto object-contain" />
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">S</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 overflow-y-auto">
        {!collapsed && (
          <div className="px-3 py-2 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            Рабочая область
          </div>
        )}
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <NavItem 
                key={item.href} 
                item={item} 
                isActive={isActive} 
                collapsed={collapsed} 
              />
            );
          })}
        </div>

        {!collapsed && (
          <div className="px-3 py-2 mt-6 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            Мониторинг
          </div>
        )}
        {collapsed && <div className="mt-6" />}
        <div className="space-y-1">
          {MONITORING_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <NavItem 
                key={item.href} 
                item={item} 
                isActive={isActive} 
                collapsed={collapsed} 
              />
            );
          })}
        </div>

        {isAdmin && (
          <>
            {!collapsed && (
              <div className="px-3 py-2 mt-6 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                Администрирование
              </div>
            )}
            {collapsed && <div className="mt-6" />}
            <div className="space-y-1">
              {ADMIN_ITEMS.map((item) => {
                const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
                return (
                  <NavItem 
                    key={item.href} 
                    item={item} 
                    isActive={isActive} 
                    collapsed={collapsed} 
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* User / Footer */}
      <UserFooter collapsed={collapsed} />
    </div>
  );
}

function NavItem({ 
  item, 
  isActive, 
  collapsed 
}: { 
  item: { label: string; icon: any; href: string }; 
  isActive: boolean; 
  collapsed: boolean;
}) {
  const content = (
    <Link href={item.href}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
          collapsed && "justify-center px-2",
          isActive 
            ? "bg-primary/10 text-primary shadow-sm" 
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        data-testid={`nav-${item.href.slice(1) || 'dashboard'}`}
      >
        <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        {!collapsed && item.label}
      </div>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (collapsed) {
    return (
      <div className="p-2 border-t bg-muted/20 flex flex-col items-center gap-2">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs cursor-default">
              {initials}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              data-testid="button-logout"
              className="h-8 w-8"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Выйти
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="p-4 border-t bg-muted/20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
          {initials}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate" data-testid="text-current-user-name">
            {user.name}
          </p>
          <p className="text-xs text-muted-foreground truncate" data-testid="text-current-user-role">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
