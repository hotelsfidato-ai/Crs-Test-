import {
  LayoutDashboard, Users, Building2, CalendarCheck, Hotel, Receipt,
  BarChart3, Workflow, Bell, Sparkles, Settings, ShieldCheck,
  CalendarRange, GitMerge, Upload, FileText, Wallet,
  Percent, History, Plug, ScrollText, UserCog, Palette, BookOpen,
  type LucideIcon,
} from "lucide-react";
import { canAccess, canImportAnything, type Resource, type Role } from "@/lib/permissions";

/* ══════════════════════════════════════════════════════════════════
   NAVIGATION
   Declared once, filtered by role. A section disappears entirely
   when the role holds no permission on any of its items — which is
   how the sidebar visibly changes as you switch roles.
   ══════════════════════════════════════════════════════════════════ */

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** What this entry is about. Names the refusal when access is denied. */
  resource: Resource;
  /** Matches child routes too, e.g. /reservations/:id */
  matchPrefix?: boolean;
  children?: NavItem[];
  /**
   * Overrides the default "any grant on `resource`" visibility test.
   *
   * ⚠️ For entries that span several resources, where no single one is
   * the right gate. Import is the case: it loads customers, companies
   * and properties, and the grants for those are independent.
   */
  canSee?: (role: Role) => boolean;
}

/** Whether the given role should see this entry at all. */
const visible = (role: Role, item: NavItem): boolean =>
  item.canSee ? item.canSee(role) : canAccess(role, item.resource);

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, resource: "dashboard" },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        label: "Reservations", to: "/reservations", icon: CalendarCheck,
        resource: "reservation", matchPrefix: true,
        children: [
          { label: "All reservations", to: "/reservations", icon: CalendarCheck, resource: "reservation" },
          { label: "Calendar", to: "/reservations/calendar", icon: CalendarRange, resource: "reservation" },
        ],
      },
      {
        label: "Customers", to: "/crm/customers", icon: Users,
        resource: "customer", matchPrefix: true,
        children: [
          { label: "All customers", to: "/crm/customers", icon: Users, resource: "customer" },
          { label: "Duplicates", to: "/crm/merge", icon: GitMerge, resource: "customer" },
        ],
      },
      { label: "Companies", to: "/crm/companies", icon: Building2, resource: "company", matchPrefix: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Properties", to: "/hotels", icon: Hotel, resource: "hotel", matchPrefix: true },
    ],
  },
  {
    /* ⚠️ Top level, not a child of Customers. It loads customers,
       companies AND properties, so filing it under one of the three
       both hid it from the other two and gated it on the wrong grant —
       a role could be entitled to import properties and never see the
       screen because it could not view customers. */
    label: "Data",
    items: [
      {
        label: "Import", to: "/import", icon: Upload,
        resource: "customer", canSee: canImportAnything,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", to: "/finance/invoices", icon: Receipt, resource: "invoice", matchPrefix: true },
      { label: "Payments", to: "/finance/payments", icon: Wallet, resource: "payment" },
      { label: "Commissions", to: "/finance/commissions", icon: Percent, resource: "commission" },
    ],
  },
  {
    label: "Insight",
    items: [
      { label: "Reports", to: "/reports", icon: BarChart3, resource: "report", matchPrefix: true },
      { label: "AI Assistant", to: "/ai", icon: Sparkles, resource: "ai" },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Automation", to: "/automation", icon: Workflow,
        resource: "automation", matchPrefix: true,
        children: [
          { label: "Workflows", to: "/automation", icon: Workflow, resource: "automation" },
          { label: "Run history", to: "/automation/runs", icon: History, resource: "automation" },
        ],
      },
      {
        label: "Notifications", to: "/notifications", icon: Bell,
        resource: "notification", matchPrefix: true,
        children: [
          { label: "Inbox", to: "/notifications", icon: Bell, resource: "notification" },
          { label: "Templates", to: "/notifications/templates", icon: FileText, resource: "notification" },
        ],
      },
      /* Its own entry, not under Administration — this is an
         operational record people work in daily, not a setting. */
      { label: "Booking register", to: "/register", icon: BookOpen, resource: "register" },
      {
        label: "Administration", to: "/admin/users", icon: Settings,
        resource: "user", matchPrefix: false,
        children: [
          { label: "Users", to: "/admin/users", icon: UserCog, resource: "user" },
          { label: "Roles & permissions", to: "/admin/roles", icon: ShieldCheck, resource: "role" },
          { label: "Integrations", to: "/admin/integrations", icon: Plug, resource: "integration" },
          { label: "Audit log", to: "/admin/audit-log", icon: ScrollText, resource: "audit_log" },
          { label: "Settings", to: "/admin/settings", icon: Settings, resource: "setting" },
        ],
      },
      { label: "Design system", to: "/design-system", icon: Palette, resource: "dashboard" },
    ],
  },
];

/** Sections and items the given role can actually reach. */
export function navigationFor(role: Role): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => visible(role, child)),
      }))
      .filter((item) => visible(role, item) || (item.children?.length ?? 0) > 0),
  })).filter((section) => section.items.length > 0);
}

/** Flat list of every reachable route — feeds the command palette. */
export function flatNavigationFor(role: Role): NavItem[] {
  const out: NavItem[] = [];
  for (const section of navigationFor(role)) {
    for (const item of section.items) {
      if (visible(role, item)) out.push(item);
      for (const child of item.children ?? []) {
        if (!out.some((existing) => existing.to === child.to)) out.push(child);
      }
    }
  }
  return out;
}
