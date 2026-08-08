"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiChevronDown, FiChevronsLeft, FiChevronsRight, FiX, FiMenu } from "react-icons/fi";
import { NAV_SECTIONS } from "../lib/navigation";

// A single collapsible section (group of routes).
function Section({ section, pathname, collapsed, onNavigate }) {
  const { Icon } = section;
  const hasActive = section.items.some((it) => it.href === pathname);
  const [open, setOpen] = useState(hasActive || section.label === "Overview");

  // When the rail is collapsed to icons, sections are always "open" (we render
  // just the item icons), so this toggle only matters in the expanded state.
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        {section.items.map((it) => {
          const active = pathname === it.href;
          const { Icon: ItemIcon } = it;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.label}
              aria-current={active ? "page" : undefined}
              style={{
                color: active ? "var(--text-strong)" : "var(--text-muted)",
                background: active ? "var(--fill-track)" : "transparent",
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/5"
            >
              <ItemIcon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ color: hasActive ? "var(--text-strong)" : "var(--text-muted)" }}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-white"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{section.label}</span>
        <FiChevronDown
          className={"h-3.5 w-3.5 transition-transform duration-150 " + (open ? "rotate-180" : "")}
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {section.items.map((it) => {
            const active = pathname === it.href;
            const { Icon: ItemIcon } = it;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                style={{
                  color: active ? "var(--text-strong)" : "var(--text-body)",
                  background: active ? "var(--fill-track)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--fill-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
                className="flex items-center gap-3 rounded-lg py-2 pl-9 pr-3 text-sm font-medium transition-colors"
              >
                <ItemIcon className="h-4 w-4 opacity-80" />
                {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The inner nav — shared by desktop rail and mobile drawer.
function NavBody({ pathname, collapsed, onNavigate }) {
  return (
    <nav className={"flex flex-col gap-1 " + (collapsed ? "px-2 py-3" : "p-3")}>
      {NAV_SECTIONS.map((section) => (
        <Section
          key={section.label}
          section={section}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  // Lazy initializer reads the saved preference once, on mount (client-only
  // component), so there's no setState-in-effect cascade.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("dashboard_sidebar_collapsed") === "1"
  );
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("dashboard_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      {/* Mobile trigger — floating button, only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open dashboard menu"
        className="glass fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg lg:hidden"
        style={{ color: "var(--text-strong)" }}
      >
        <FiMenu className="h-5 w-5" />
      </button>

      {/* Desktop rail */}
      <aside
        className={
          "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 overflow-y-auto border-r lg:block transition-[width] duration-200 " +
          (collapsed ? "w-[68px]" : "w-64")
        }
        style={{ borderColor: "var(--glass-border)", background: "var(--fill-subtle)" }}
      >
        <div className="flex items-center justify-between px-3 pt-3">
          {!collapsed && (
            <span className="px-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Menu
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={"flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5 " + (collapsed ? "mx-auto" : "")}
            style={{ color: "var(--text-muted)" }}
          >
            {collapsed ? <FiChevronsRight className="h-4 w-4" /> : <FiChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
        <NavBody pathname={pathname} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto shadow-2xl"
            style={{ background: "var(--bar-bg)", backdropFilter: "blur(16px) saturate(140%)", WebkitBackdropFilter: "blur(16px) saturate(140%)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--glass-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-strong)" }}>
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <NavBody pathname={pathname} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
