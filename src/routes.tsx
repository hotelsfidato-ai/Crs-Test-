import { Suspense, lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useAuthListener } from "@/lib/session";
import { canAccess, type Resource } from "@/lib/permissions";
import { Forbidden } from "@/features/shared/Forbidden";
import { NotFound } from "@/features/shared/NotFound";
import { RouteFallback } from "@/features/shared/RouteFallback";

/* Code-split by feature so the first paint stays quick even though
   the platform carries ~35 screens. */
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const SignupPage = lazy(() => import("@/features/auth/SignupPage"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/ForgotPasswordPage"));

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));

const ReservationsPage = lazy(() => import("@/features/reservations/ReservationsPage"));
const ReservationCalendarPage = lazy(() => import("@/features/reservations/CalendarPage"));
const NewReservationPage = lazy(() => import("@/features/reservations/NewReservationPage"));
const ReservationDetailPage = lazy(() => import("@/features/reservations/ReservationDetailPage"));

const CustomersPage = lazy(() => import("@/features/crm/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/features/crm/CustomerDetailPage"));
const CustomerFormPage = lazy(() => import("@/features/crm/CustomerFormPage"));
const CompaniesPage = lazy(() => import("@/features/crm/CompaniesPage"));
const CompanyDetailPage = lazy(() => import("@/features/crm/CompanyDetailPage"));
const CompanyFormPage = lazy(() => import("@/features/crm/CompanyFormPage"));
const MergePage = lazy(() => import("@/features/crm/MergePage"));
const ImportPage = lazy(() => import("@/features/crm/ImportPage"));

const HotelsPage = lazy(() => import("@/features/hotels/HotelsPage"));
const HotelFormPage = lazy(() => import("@/features/hotels/HotelFormPage"));
const HotelDetailPage = lazy(() => import("@/features/hotels/HotelDetailPage"));
const HotelInventoryPage = lazy(() => import("@/features/hotels/InventoryPage"));
const HotelRatesPage = lazy(() => import("@/features/hotels/RatesPage"));

const InvoicesPage = lazy(() => import("@/features/finance/InvoicesPage"));
const InvoiceDetailPage = lazy(() => import("@/features/finance/InvoiceDetailPage"));
const PaymentsPage = lazy(() => import("@/features/finance/PaymentsPage"));
const CommissionsPage = lazy(() => import("@/features/finance/CommissionsPage"));

const ReportsPage = lazy(() => import("@/features/reports/ReportsPage"));
const RevenueReportPage = lazy(() => import("@/features/reports/RevenueReportPage"));
const SalesReportPage = lazy(() => import("@/features/reports/SalesReportPage"));
const OccupancyReportPage = lazy(() => import("@/features/reports/OccupancyReportPage"));
const HotelReportPage = lazy(() => import("@/features/reports/HotelReportPage"));
const ForecastReportPage = lazy(() => import("@/features/reports/ForecastReportPage"));

const WorkflowsPage = lazy(() => import("@/features/automation/WorkflowsPage"));
const WorkflowDetailPage = lazy(() => import("@/features/automation/WorkflowDetailPage"));
const RunsPage = lazy(() => import("@/features/automation/RunsPage"));

const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage"));
const TemplatesPage = lazy(() => import("@/features/notifications/TemplatesPage"));

const AiPage = lazy(() => import("@/features/ai/AiPage"));

const UsersPage = lazy(() => import("@/features/admin/UsersPage"));
const RolesPage = lazy(() => import("@/features/admin/RolesPage"));
const IntegrationsPage = lazy(() => import("@/features/admin/IntegrationsPage"));
const AuditLogPage = lazy(() => import("@/features/admin/AuditLogPage"));
const SettingsPage = lazy(() => import("@/features/admin/SettingsPage"));

const DesignSystemPage = lazy(() => import("@/features/design-system/DesignSystemPage"));

/* ══════════════════════════════════════════════════════════════════
   PERMISSION GUARD
   A route the current role cannot reach renders Forbidden rather
   than 404 — the distinction matters when demonstrating the role
   model, because "you can't see this" reads differently from
   "this doesn't exist".
   ══════════════════════════════════════════════════════════════════ */

function Guard({ resource, children }: { resource: Resource; children: ReactNode }) {
  const role = useSession((s) => s.role);
  if (!canAccess(role, resource)) return <Forbidden resource={resource} />;
  return <>{children}</>;
}

/* ══════════════════════════════════════════════════════════════════
   AUTH GATE

   ⚠️ Cosmetic, not a security boundary. It decides which screens
   render; firestore.rules decides what data anyone can actually read.
   Removing this gate would expose empty screens, not records — which
   is the property that makes it safe to keep it this simple.
   ══════════════════════════════════════════════════════════════════ */

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();

  // Auth resolves asynchronously on every load. Redirecting during
  // that window bounces a signed-in user to the login screen on
  // every refresh.
  if (status === "loading") return <RouteFallback />;

  if (status === "signed_out") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  useAuthListener();

  return (
    <Routes>
      {/* Public. Everything else is behind RequireAuth. */}
      <Route
        path="/login"
        element={<Suspense fallback={<RouteFallback />}><LoginPage /></Suspense>}
      />
      <Route
        path="/signup"
        element={<Suspense fallback={<RouteFallback />}><SignupPage /></Suspense>}
      />
      <Route
        path="/forgot-password"
        element={<Suspense fallback={<RouteFallback />}><ForgotPasswordPage /></Suspense>}
      />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route
          path="*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                <Route
                  path="/dashboard"
                  element={<Guard resource="dashboard"><DashboardPage /></Guard>}
                />

                {/* ── Reservations ── */}
                <Route
                  path="/reservations"
                  element={<Guard resource="reservation"><ReservationsPage /></Guard>}
                />
                <Route
                  path="/reservations/calendar"
                  element={<Guard resource="reservation"><ReservationCalendarPage /></Guard>}
                />
                <Route
                  path="/reservations/new"
                  element={<Guard resource="reservation"><NewReservationPage /></Guard>}
                />
                <Route
                  path="/reservations/:id"
                  element={<Guard resource="reservation"><ReservationDetailPage /></Guard>}
                />

                {/* ── CRM ── */}
                <Route
                  path="/crm/customers"
                  element={<Guard resource="customer"><CustomersPage /></Guard>}
                />
                <Route
                  path="/crm/customers/new"
                  element={<Guard resource="customer"><CustomerFormPage /></Guard>}
                />
                <Route
                  path="/crm/customers/:id"
                  element={<Guard resource="customer"><CustomerDetailPage /></Guard>}
                />
                <Route
                  path="/crm/customers/:id/edit"
                  element={<Guard resource="customer"><CustomerFormPage /></Guard>}
                />
                <Route
                  path="/crm/companies"
                  element={<Guard resource="company"><CompaniesPage /></Guard>}
                />
                <Route
                  path="/crm/companies/new"
                  element={<Guard resource="company"><CompanyFormPage /></Guard>}
                />
                <Route
                  path="/crm/companies/:id"
                  element={<Guard resource="company"><CompanyDetailPage /></Guard>}
                />
                <Route
                  path="/crm/companies/:id/edit"
                  element={<Guard resource="company"><CompanyFormPage /></Guard>}
                />
                <Route
                  path="/crm/merge"
                  element={<Guard resource="customer"><MergePage /></Guard>}
                />
                <Route
                  path="/crm/import"
                  element={<Guard resource="customer"><ImportPage /></Guard>}
                />

                {/* ── Properties ── */}
                <Route path="/hotels" element={<Guard resource="hotel"><HotelsPage /></Guard>} />
                {/* Before /hotels/:id, or "new" is read as an id. */}
                <Route
                  path="/hotels/new"
                  element={<Guard resource="hotel"><HotelFormPage /></Guard>}
                />
                <Route
                  path="/hotels/:id/edit"
                  element={<Guard resource="hotel"><HotelFormPage /></Guard>}
                />
                <Route
                  path="/hotels/:id"
                  element={<Guard resource="hotel"><HotelDetailPage /></Guard>}
                />
                <Route
                  path="/hotels/:id/inventory"
                  element={<Guard resource="inventory"><HotelInventoryPage /></Guard>}
                />
                <Route
                  path="/hotels/:id/rates"
                  element={<Guard resource="rate"><HotelRatesPage /></Guard>}
                />

                {/* ── Finance ── */}
                <Route
                  path="/finance/invoices"
                  element={<Guard resource="invoice"><InvoicesPage /></Guard>}
                />
                <Route
                  path="/finance/invoices/:id"
                  element={<Guard resource="invoice"><InvoiceDetailPage /></Guard>}
                />
                <Route
                  path="/finance/payments"
                  element={<Guard resource="payment"><PaymentsPage /></Guard>}
                />
                <Route
                  path="/finance/commissions"
                  element={<Guard resource="commission"><CommissionsPage /></Guard>}
                />

                {/* ── Reports ── */}
                <Route path="/reports" element={<Guard resource="report"><ReportsPage /></Guard>} />
                <Route
                  path="/reports/revenue"
                  element={<Guard resource="report"><RevenueReportPage /></Guard>}
                />
                <Route
                  path="/reports/sales-performance"
                  element={<Guard resource="report"><SalesReportPage /></Guard>}
                />
                <Route
                  path="/reports/occupancy"
                  element={<Guard resource="report"><OccupancyReportPage /></Guard>}
                />
                <Route
                  path="/reports/hotel-performance"
                  element={<Guard resource="report"><HotelReportPage /></Guard>}
                />
                <Route
                  path="/reports/forecast"
                  element={<Guard resource="report"><ForecastReportPage /></Guard>}
                />

                {/* ── Automation ── */}
                <Route
                  path="/automation"
                  element={<Guard resource="automation"><WorkflowsPage /></Guard>}
                />
                <Route
                  path="/automation/runs"
                  element={<Guard resource="automation"><RunsPage /></Guard>}
                />
                <Route
                  path="/automation/:id"
                  element={<Guard resource="automation"><WorkflowDetailPage /></Guard>}
                />

                {/* ── Notifications ── */}
                <Route
                  path="/notifications"
                  element={<Guard resource="notification"><NotificationsPage /></Guard>}
                />
                <Route
                  path="/notifications/templates"
                  element={<Guard resource="notification"><TemplatesPage /></Guard>}
                />

                {/* ── AI ── */}
                <Route path="/ai" element={<Guard resource="ai"><AiPage /></Guard>} />

                {/* ── Administration ── */}
                <Route path="/admin/users" element={<Guard resource="user"><UsersPage /></Guard>} />
                <Route path="/admin/roles" element={<Guard resource="role"><RolesPage /></Guard>} />
                <Route
                  path="/admin/integrations"
                  element={<Guard resource="integration"><IntegrationsPage /></Guard>}
                />
                <Route
                  path="/admin/audit-log"
                  element={<Guard resource="audit_log"><AuditLogPage /></Guard>}
                />
                <Route
                  path="/admin/settings"
                  element={<Guard resource="setting"><SettingsPage /></Guard>}
                />

                {/* ── Internal ── */}
                <Route path="/design-system" element={<DesignSystemPage />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
