import { UserCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor } from "@/lib/session";
import { Tooltip } from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   LEAD OWNERSHIP

   Whose lead this is. A salesperson only ever sees their own, so for
   them the tag is confirmation; for Owner, Admin and the CRS desk —
   who see everybody's — it is the only thing distinguishing one
   salesperson's book from another's in a shared list.

   ⚠️ Presentation only. The boundary is enforced in firestore.rules
   and covered by rules tests: a salesperson cannot read a colleague's
   customer even by guessing its id. Removing this tag would hide who
   owns what; it would not expose anything.
   ══════════════════════════════════════════════════════════════════ */

export function OwnerTag({
  ownerId, ownerName, className,
}: {
  ownerId?: string;
  ownerName?: string;
  className?: string;
}) {
  const actor = useActor();

  if (!ownerId && !ownerName) {
    return (
      <Tooltip content="No salesperson is assigned to this record">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full",
            "bg-grey-100 text-2xs text-grey-500",
            className,
          )}
        >
          Unassigned
        </span>
      </Tooltip>
    );
  }

  const isMine = ownerId === actor.id;

  return (
    <Tooltip content={isMine ? "Your lead" : `${ownerName}'s lead`}>
      <span
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-2xs",
          isMine
            ? "bg-brand-orange-50 text-brand-orange-700"
            : "bg-grey-100 text-grey-600",
          className,
        )}
      >
        <UserCircle2 className="size-3 shrink-0" />
        {isMine ? "My lead" : ownerName}
      </span>
    </Tooltip>
  );
}
