import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import EventsList from "@/pages/EventsList";
import PropertiesPage from "@/pages/PropertiesPage";
import UsersPage from "@/pages/UsersPage";
import PluginsPage from "@/pages/PluginsPage";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import { useIsAuthenticated } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

function useSetupStatus() {
  return useQuery<{ isConfigured: boolean; hasUsers: boolean }>({
    queryKey: ["/api/setup/status"],
    staleTime: 1000 * 60 * 5,
  });
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading: authLoading } = useIsAuthenticated();
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();

  if (authLoading || setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!setupStatus?.isConfigured) {
    return <Redirect to="/setup" />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading: authLoading } = useIsAuthenticated();
  const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();

  if (authLoading || setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!setupStatus?.isConfigured) {
    return <Redirect to="/setup" />;
  }

  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function SetupRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: setupStatus, isLoading } = useSetupStatus();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (setupStatus?.isConfigured) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/setup">
        <SetupRoute component={SetupPage} />
      </Route>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/events">
        <ProtectedRoute component={EventsList} />
      </Route>
      <Route path="/properties">
        <ProtectedRoute component={PropertiesPage} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UsersPage} />
      </Route>
      <Route path="/plugins">
        <ProtectedRoute component={PluginsPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
