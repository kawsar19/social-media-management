"use client";

import Link from "next/link";
import { FiArrowRight, FiGrid } from "react-icons/fi";
import { NAV_SECTIONS } from "../lib/navigation";

// Cards on the landing grid — everything except the Overview/Dashboard entry
// itself (no point linking the dashboard to the dashboard).
const CARD_SECTIONS = NAV_SECTIONS.filter((s) => s.label !== "Overview");

export default function DashboardPage() {
  return (
    <div className="rise-in mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
            <h1 className="balance flex items-center gap-3 text-3xl font-bold" style={{ color: "var(--text-strong)" }}>
              <FiGrid className="h-7 w-7 text-indigo-400" />
              Dashboard
            </h1>
            <p className="pretty mt-2" style={{ color: "var(--text-muted)" }}>
              Your control center. Jump into any tool — new features show up here automatically.
            </p>
          </header>

          <div className="flex flex-col gap-10">
            {CARD_SECTIONS.map((section) => {
              const { Icon } = section;
              return (
                <section key={section.label}>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.items.map((item) => {
                      const { Icon: ItemIcon } = item;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="glass group flex flex-col gap-2 rounded-2xl p-5 transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
                              <ItemIcon className="h-5 w-5" />
                            </span>
                            <FiArrowRight className="h-4 w-4 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60" style={{ color: "var(--text-muted)" }} />
                          </div>
                          <span className="font-semibold" style={{ color: "var(--text-strong)" }}>
                            {item.label}
                          </span>
                          {item.desc && (
                            <span className="text-sm leading-snug" style={{ color: "var(--text-muted)" }}>
                              {item.desc}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
        })}
      </div>
    </div>
  );
}
