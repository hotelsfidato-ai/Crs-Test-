import { Check, Minus, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, RESOURCE_LABELS,
  ACTION_LABELS, can, type Role, type Action, type Resource,
} from "@/lib/permissions";
import { BUSINESS_RULES } from "@/lib/rules";
import { useQuery } from "@tanstack/react-query";
import { adminRepo } from "@/data/repositories";
import {
  Page, PageHeader, Card, CardHeader, CardBody, StatusPill, Tooltip,
} from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   ROLES & PERMISSIONS
   The matrix here is not a diagram of the permission model — it IS
   the permission model, read from lib/permissions.ts. If a cell says
   a hotel manager cannot edit rates, that is exactly what the Rates
   screen enforces.
   ══════════════════════════════════════════════════════════════════ */

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const RESOURCES = Object.keys(RESOURCE_LABELS) as Resource[];
const ACTIONS = Object.keys(ACTION_LABELS) as Action[];

export default function RolesPage() {
  const currentRole = useSession((s) => s.role);
  const stats = useQuery({ queryKey: ["user-stats"], queryFn: () => adminRepo.userStats() });

  return (
    <Page>
      <PageHeader
        title="Roles & permissions"
        description="Read live from the permission matrix the application enforces. Your current role is highlighted."
      />

      {/* ── Role cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {ROLES.map((role) => {
          const count = stats.data?.byRole[role] ?? 0;
          const grants = RESOURCES.reduce(
            (sum, resource) => sum + ACTIONS.filter((a) => can(role, a, resource)).length,
            0,
          );

          return (
            <Card
              key={role}
              className={cn(
                "p-5",
                role === currentRole && "ring-1 ring-brand-orange border-brand-orange",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-ink-900">{ROLE_LABELS[role]}</h2>
                {role === currentRole && (
                  <StatusPill tone="accent" dot={false}>
                    You
                  </StatusPill>
                )}
              </div>
              <p className="text-sm text-grey-600 mt-1.5 leading-relaxed">
                {ROLE_DESCRIPTIONS[role]}
              </p>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-grey-100 text-sm text-grey-500">
                <span className="tabular">{count} user{count === 1 ? "" : "s"}</span>
                <span className="text-grey-300">·</span>
                <span className="tabular">{grants} permissions</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── The matrix ── */}
      <Card className="mb-8 overflow-hidden">
        <CardHeader
          title="Permission matrix"
          description="Resource by role. Hover any cell for the actions it grants."
        />

        <div className="overflow-x-auto scrollbar-quiet">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50">
                <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-5 h-11 sticky left-0 bg-grey-50 z-10 border-r border-grey-200">
                  Resource
                </th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    className={cn(
                      "px-2 h-11 text-2xs font-semibold uppercase tracking-wide",
                      role === currentRole ? "text-brand-orange bg-brand-orange-50" : "text-grey-500",
                    )}
                  >
                    <span className="block leading-tight">{ROLE_LABELS[role]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((resource) => (
                <tr key={resource} className="border-b border-grey-100 last:border-b-0">
                  <td className="px-5 py-2.5 text-base text-ink-900 sticky left-0 bg-white z-10 border-r border-grey-200 whitespace-nowrap">
                    {RESOURCE_LABELS[resource]}
                  </td>
                  {ROLES.map((role) => {
                    const granted = ACTIONS.filter((a) => can(role, a, resource));
                    const level =
                      granted.length === 0
                        ? "none"
                        : granted.length === 1 && granted[0] === "view"
                          ? "read"
                          : "write";

                    return (
                      <td
                        key={role}
                        className={cn(
                          "px-2 py-2.5 text-center",
                          role === currentRole && "bg-brand-orange-50/40",
                        )}
                      >
                        <Tooltip
                          content={
                            granted.length
                              ? granted.map((a) => ACTION_LABELS[a]).join(", ")
                              : "No access"
                          }
                        >
                          <span
                            className={cn(
                              "inline-flex items-center justify-center size-6 rounded-full",
                              level === "write"
                                ? "bg-success-50 text-success"
                                : level === "read"
                                  ? "bg-grey-100 text-grey-500"
                                  : "bg-transparent text-grey-300",
                            )}
                          >
                            {level === "write" ? (
                              <Check className="size-3.5" />
                            ) : level === "read" ? (
                              <span className="text-2xs font-semibold">R</span>
                            ) : (
                              <Minus className="size-3.5" />
                            )}
                          </span>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CardBody className="border-t border-grey-200 bg-grey-50">
          <div className="flex items-center gap-5 flex-wrap">
            <Legend
              icon={<Check className="size-3.5" />}
              className="bg-success-50 text-success"
              label="Can change"
            />
            <Legend
              icon={<span className="text-2xs font-semibold">R</span>}
              className="bg-grey-100 text-grey-500"
              label="Read only"
            />
            <Legend
              icon={<Minus className="size-3.5" />}
              className="text-grey-300"
              label="No access"
            />
            <span className="text-sm text-grey-500 ml-auto">
              {RESOURCES.length} resources × {ROLES.length} roles
            </span>
          </div>
        </CardBody>
      </Card>

      {/* ── Business rules ── */}
      <Card>
        <CardHeader
          title="Business rules"
          description="Constraints the platform enforces regardless of role"
        />
        <CardBody className="pt-0">
          <ul className="divide-y divide-grey-100">
            {BUSINESS_RULES.map((rule) => (
              <li key={rule.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="text-2xs text-grey-400 tabular shrink-0 mt-1 w-8">
                    {rule.id}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base text-ink-900 leading-relaxed">{rule.rule}</p>
                    <p className="text-sm text-grey-500 mt-1 leading-relaxed">
                      {rule.rationale}
                    </p>
                    <p className="text-2xs text-grey-400 mt-1.5 font-mono">
                      {rule.enforcedIn}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-4">
        <Info className="size-3.5 shrink-0 mt-px" />
        This matrix is generated from{" "}
        <code className="text-grey-500">src/lib/permissions.ts</code> — the same module the
        navigation, route guards and every action button consult. In Phase 2 it becomes
        the source for Firestore security rules, so the client and the database cannot
        disagree.
      </p>
    </Page>
  );
}

function Legend({
  icon, className, label,
}: {
  icon: React.ReactNode;
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center justify-center size-5 rounded-full",
          className,
        )}
      >
        {icon}
      </span>
      <span className="text-sm text-grey-600">{label}</span>
    </span>
  );
}
