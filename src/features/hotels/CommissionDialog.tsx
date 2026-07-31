import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import { hotelsRepo } from "@/data/repositories";
import { useActor } from "@/lib/session";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose,
  Field, Input, Textarea, fieldProps, toast,
} from "@/components/ui";
import type { HotelCommercial } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   COMMERCIAL TERMS

   ⚠️ Writes to hotels/{id}/private/commercial, guarded by its own
   security rule. The dialog is only rendered for Owner and Admin, but
   that is presentation — the rule is what stops anyone else, including
   someone calling the SDK directly with no interface at all.
   ══════════════════════════════════════════════════════════════════ */

export function CommissionDialog({
  hotelId, hotelName, current,
}: {
  hotelId: string;
  hotelName: string;
  current?: HotelCommercial | null;
}) {
  const actor = useActor();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(String(current?.commissionPercent ?? ""));
  const [effectiveFrom, setEffectiveFrom] = useState(
    current?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
  );
  const [negotiatedBy, setNegotiatedBy] = useState(current?.negotiatedBy ?? actor.name);
  const [notes, setNotes] = useState(current?.contractNotes ?? "");

  const value = Number(percent);
  const outOfRange = percent !== "" && (!Number.isFinite(value) || value < 0 || value > 100);

  const save = useMutation({
    mutationFn: () =>
      hotelsRepo.setCommercial(
        hotelId,
        {
          commissionPercent: value,
          effectiveFrom,
          negotiatedBy: negotiatedBy.trim(),
          contractNotes: notes.trim(),
        },
        actor,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-commercial", hotelId] });
      queryClient.invalidateQueries({ queryKey: ["hotel-performance"] });
      toast.success("Commercial terms saved", `${hotelName} is now at ${value}%.`);
      setOpen(false);
    },
    onError: () => toast.error("Could not save", "Nothing was changed."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" leadingIcon={<Percent className="size-3.5" />}>
          {current ? "Edit commission" : "Set commission"}
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Commercial terms"
        description={`${hotelName} — visible to Owner and Admin only.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              loading={save.isPending}
              disabled={percent === "" || outOfRange}
              onClick={() => save.mutate()}
            >
              Save terms
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Commission"
            required
            hint="Percent of booking value Fidato earns."
            error={outOfRange ? "Enter a percentage between 0 and 100." : undefined}
          >
            {(p) => (
              <Input
                {...fieldProps(p)}
                type="number"
                numeric
                min={0}
                max={100}
                step="0.5"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Effective from"
            hint="Bookings already made keep the terms they were raised under."
          >
            {(p) => (
              <Input
                {...fieldProps(p)}
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            )}
          </Field>

          <Field label="Negotiated by">
            {(p) => (
              <Input
                {...fieldProps(p)}
                value={negotiatedBy}
                onChange={(e) => setNegotiatedBy(e.target.value)}
              />
            )}
          </Field>

          <Field label="Contract notes" hint="Never shown outside this dialog.">
            {(p) => (
              <Textarea
                {...fieldProps(p)}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Slab revision agreed for peak season; review each April."
              />
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
