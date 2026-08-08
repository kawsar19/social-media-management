// ─────────────────────────────────────────────────────────────────────────────
// Central navigation registry — the SINGLE source of truth for every route.
//
// Add a new feature/page here ONCE and it automatically shows up in:
//   • the dashboard sidebar (collapsible, mobile-responsive)
//   • the dashboard landing cards
//
// Each section groups related routes. Each route is { href, label, Icon, desc }.
// `desc` is a short blurb shown on the dashboard cards (optional).
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
      { href: "/post", label: "Compose", Icon: FiEdit3, desc: "Write a post for every platform at once." },
      { href: "/publish", label: "Publish All", Icon: FiSend, desc: "Push your draft out to all destinations." },
      { href: "/profile/posts", label: "Saved Posts", Icon: FiArchive, desc: "Drafts and posts you saved for later." },
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

// Flat list of every route, handy for lookups / search.
export const ALL_ROUTES = NAV_SECTIONS.flatMap((s) => s.items);
