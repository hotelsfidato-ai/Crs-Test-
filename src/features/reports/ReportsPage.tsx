import { Link } from "react-router-dom";
import {
  TrendingUp, Users, BedDouble, Hotel, LineChart, ArrowRight,
} from "lucide-react";
import { Page, PageHeader, Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/* The report gallery. Each entry states what question the report
   answers, because "Revenue" alone never tells you which one to open. */

const REPORTS = [
  {
    to: "/reports/revenue",
    icon: TrendingUp,
    title: "Revenue",
    question: "Where is the money coming from, and is it growing?",
    detail: "Monthly booked revenue, room nights and channel mix over the last year.",
  },
  {
    to: "/reports/sales-performance",
    icon: Users,
    title: "Sales performance",
    question: "Who is selling, and how well?",
    detail: "Per-salesperson bookings, revenue, conversion and cancellations.",
  },
  {
    to: "/reports/occupancy",
    icon: BedDouble,
    title: "Occupancy",
    question: "How full are we, and where are the gaps?",
    detail: "Room nights against capacity, broken down by city.",
  },
  {
    to: "/reports/hotel-performance",
    icon: Hotel,
    title: "Property performance",
    question: "Which properties are earning their place?",
    detail: "Revenue, average rate and occupancy for all 32 properties.",
  },
  {
    to: "/reports/forecast",
    icon: LineChart,
    title: "Forecast",
    question: "What does the next six months look like?",
    detail: "Projection from the last six months' trend, with the history behind it.",
  },
];

export default function ReportsPage() {
  return (
    <Page>
      <PageHeader
        title="Reports"
        description="Five views onto the same data. Each answers one question."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.to} to={report.to} className="group">
              <Card
                className={cn(
                  "h-full p-5 transition-colors duration-150",
                  "hover:border-grey-300",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center justify-center size-9 rounded-md bg-brand-orange-50 text-brand-orange shrink-0">
                    <Icon className="size-[18px]" />
                  </span>
                  <ArrowRight className="size-4 text-grey-300 group-hover:text-brand-orange transition-colors duration-150" />
                </div>

                <h2 className="text-md font-semibold text-ink-900 mt-4">{report.title}</h2>
                <p className="text-base text-grey-600 mt-1.5 leading-relaxed">
                  {report.question}
                </p>
                <p className="text-sm text-grey-500 mt-2.5 leading-relaxed">{report.detail}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}
