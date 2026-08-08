"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import DashboardSidebar from "./DashboardSidebar";

// Routes that render full-width with NO sidebar (public / auth pages).
const NO_SIDEBAR_ROUTES = ["/login", "/signup"];

// Wraps every page. Shows the collapsible dashboard sidebar on all app routes
// (once the user is logged in), and gets out of the way on public pages.
export default function AppShell({ children }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const showSidebar = Boolean(user) && !NO_SIDEBAR_ROUTES.includes(pathname);

  if (!showSidebar) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex flex-1">
      <DashboardSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
