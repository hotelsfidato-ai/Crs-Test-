import { useQuery } from "@tanstack/react-query";
import { reportsRepo, financeRepo, hotelsRepo } from "@/data/repositories";
import { useScope } from "@/lib/session";
import { EMPTY_SNAPSHOT, type AssistantSnapshot } from "./responses";

/* ══════════════════════════════════════════════════════════════════
   ASSISTANT SNAPSHOT

   Phase 1's assistant read the whole in-memory seed on every question.
   Against Firestore that would cost a document read per row, per
   question. Instead the panel fetches one bounded snapshot, caches it,
   and answers every question from that.

   ⚠️ Deliberately scoped. A salesperson's assistant must not quote
   figures covering the whole book — the numbers it reads out have to
   match the dashboard the same person is looking at.
   ══════════════════════════════════════════════════════════════════ */

export function useAssistantSnapshot(): { snapshot: AssistantSnapshot; isLoading: boolean } {
  const scope = useScope();

  const { data, isLoading } = useQuery({
    queryKey: ["assistant-snapshot", scope.role, scope.userId],
    // Five minutes. The assistant is a reading aid, not a live monitor,
    // and re-fetching per question is exactly the cost this avoids.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AssistantSnapshot> => {
      const [kpis, invoices, hotels, performance] = await Promise.all([
        reportsRepo.kpis(scope),
        financeRepo.invoiceTotals(),
        hotelsRepo.all(),
        reportsRepo.hotelPerformance(),
      ]);

      return {
        liveReservations: kpis.reservationsThisMonth,
        bookedValue: kpis.revenueThisMonth,
        roomNights: kpis.roomNightsThisMonth,
        averageBookingValue: kpis.averageBookingValue,
        cancellationRate: kpis.cancellationRate,
        pendingApprovals: kpis.pendingApprovals,
        pendingApprovalValue: kpis.pendingApprovalValue,
        activeProperties: hotels.filter((h) => h.status === "active").length,
        totalProperties: hotels.length,
        overdueInvoices: invoices.overdueCount,
        overdueValue: invoices.overdueValue,
        topAccounts: performance.slice(0, 5).map((h) => ({
          name: h.hotelName,
          revenue: h.revenue,
          bookings: h.bookings,
        })),
      };
    },
  });

  return { snapshot: data ?? EMPTY_SNAPSHOT, isLoading };
}
