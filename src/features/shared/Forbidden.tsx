import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Page, Button, Card } from "@/components/ui";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, type Resource } from "@/lib/permissions";
import { humanise } from "@/lib/format";

/* Deliberately distinct from a 404. When demonstrating the role
   model, "you cannot see this" must not look like "this is broken". */

export function Forbidden({ resource }: { resource?: Resource }) {
  const role = useSession((s) => s.role);

  return (
    <Page>
      <Card className="max-w-lg mx-auto mt-12">
        <div className="flex flex-col items-center text-center px-6 py-12">
          <div className="flex items-center justify-center size-11 rounded-full bg-brand-yellow-50 text-[#8a6300] mb-4">
            <Lock className="size-5" />
          </div>

          <h1 className="text-lg font-semibold text-ink-900">Not available for your role</h1>

          <p className="text-base text-grey-500 mt-2 max-w-sm leading-relaxed">
            You are viewing the platform as{" "}
            <span className="text-ink-900 font-medium">{ROLE_LABELS[role]}</span>, which has
            no access to{" "}
            <span className="text-ink-900 font-medium">
              {resource ? humanise(resource).toLowerCase() : "this area"}
            </span>
            .
          </p>

          <p className="text-sm text-grey-500 mt-4 max-w-sm leading-relaxed">
            Switch role from the top bar to see how the platform looks for another team.
          </p>

          <Button asChild variant="secondary" className="mt-6">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </Page>
  );
}
