// ─────────────────────────────────────────────────────────────────────────────
// Central navigation registry — the SINGLE source of truth for every route.
//
// Add a new feature/page here ONCE and it automatically shows up in:
//   • the dashboard sidebar (collapsible, mobile-responsive)
//   • the dashboard landing cards
//
// Each section groups related routes. Each route is { href, label, Icon, desc }.
// `desc` is a short blurb shown on the dashboard cards (optional).
//
// Set `disabled: true` on a route to hide it from the sidebar and the dashboard
// cards while keeping the page itself reachable by URL. Use it for work that
// isn't ready to be shown yet; delete the flag to bring the route back.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FiEdit3,
  FiSend,
  FiArchive,
  FiFolder,
  FiBarChart2,
  FiTrendingUp,
  FiInbox,
  FiMessageCircle,
  FiLink,
  FiUser,
  FiGrid,
  FiZap,
  FiCalendar,
} from "react-icons/fi";
import { FaYoutube, FaFacebook } from "react-icons/fa6";

export const NAV_SECTIONS = [
  {
    label: "Overview",
    Icon: FiGrid,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        Icon: FiGrid,
        desc: "Your control center — jump to any feature.",
      },
    ],
  },
  {
    label: "Content",
    Icon: FiEdit3,
    items: [
      // Hidden from the nav for now — still being worked on. The pages remain
      // reachable directly by URL; remove `disabled` to list them again.
      { href: "/post", label: "Compose", Icon: FiEdit3, desc: "Write a post for every platform at once.", disabled: true },
      { href: "/publish", label: "Publish All", Icon: FiSend, desc: "Push your draft out to all destinations.", disabled: false },
      { href: "/queue", label: "Queue", Icon: FiCalendar, desc: "Line up posts now, publish them on a date and time." },
      { href: "/autopilot", label: "Autopilot", Icon: FiZap, desc: "AI writes and publishes for you, on a schedule." },
      { href: "/profile/posts", label: "Saved Posts", Icon: FiArchive, desc: "Drafts and posts you saved for later.", disabled: true },
    ],
  },
  {
    label: "Facebook",
    Icon: FaFacebook,
    items: [
      { href: "/manage", label: "Manage", Icon: FiFolder, desc: "Manage your Facebook page posts." },
      { href: "/insights", label: "Insights", Icon: FiBarChart2, desc: "Reach, engagement and page analytics." },
    ],
  },
  {
    label: "YouTube",
    Icon: FaYoutube,
    items: [
      { href: "/youtube", label: "YouTube", Icon: FaYoutube, desc: "Your channel and video tools." },
      { href: "/youtube-insights", label: "YT Analytics", Icon: FiTrendingUp, desc: "Views, watch-time and subscriber trends." },
    ],
  },
  {
    label: "Engage",
    Icon: FiInbox,
    items: [
      { href: "/inbox", label: "Inbox", Icon: FiInbox, desc: "All comments and messages in one feed." },
      { href: "/messages", label: "Messages", Icon: FiMessageCircle, desc: "Messenger-style DM threads per platform." },
    ],
  },
  {
    label: "Account",
    Icon: FiUser,
    items: [
      { href: "/connect", label: "Connect", Icon: FiLink, desc: "Link your social accounts." },
      { href: "/profile", label: "Profile", Icon: FiUser, desc: "Your account and settings." },
    ],
  },
];

// Flat list of every route, handy for lookups / search. Includes disabled ones,
// since a hidden route is still a real page that may need to be resolved.
export const ALL_ROUTES = NAV_SECTIONS.flatMap((s) => s.items);

// What the navigation surfaces actually render: disabled routes dropped, and
// any section left with nothing in it removed so no empty heading is shown.
// Both the sidebar and the dashboard cards read this rather than NAV_SECTIONS,
// so hiding a route takes effect in one place.
export const VISIBLE_NAV_SECTIONS = NAV_SECTIONS.map((section) => ({
  ...section,
  items: section.items.filter((item) => !item.disabled),
})).filter((section) => section.items.length > 0);
