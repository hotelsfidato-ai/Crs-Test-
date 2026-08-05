import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose, Field, Input,
} from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   CONFIRM A DELETION

   ⚠️ Type-to-confirm, not a yes/no. Firestore has no undelete and
   nothing here is soft-deleted, so a misplaced click is permanent.
   Making someone type the reference or the name is the cheapest way to
   turn a reflex into a decision — and it means the record they are
   about to destroy is on screen while they do it.

   ⚠️ The consequence line is required, not decorative. "Are you sure?"
   tells nobody anything; "the guest keeps a voucher this will not
   recall" tells them what they are choosing.
   ══════════════════════════════════════════════════════════════════ */

export function DeleteDialog({
  /** What the user must type. The reference or the person's name. */
  confirmWord,
  title,
  /** What is destroyed, and what survives. Shown before the input. */
  consequence,
  pending,
  onConfirm,
  trigger,
  buttonLabel = "Delete",
}: {
  confirmWord: string;
  title: string;
  consequence: React.ReactNode;
  pending?: boolean;
  onConfirm: () => void;
  trigger?: React.ReactNode;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Never leave a confirmed box armed for the next record.
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" leadingIcon={<Trash2 className="size-4" />}>
            {buttonLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        title={title}
        description="This cannot be undone."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="danger"
              leadingIcon={<Trash2 className="size-4" />}
              disabled={!matches}
              loading={pending}
              onClick={() => {
                onConfirm();
                setOpen(false);
                setTyped("");
              }}
            >
              {buttonLabel}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-4 rounded-md border border-brand-red-100 bg-brand-red-50 mb-5">
          <AlertTriangle className="size-4 text-brand-red shrink-0 mt-0.5" />
          <div className="text-sm text-brand-red leading-relaxed">{consequence}</div>
        </div>

        <Field label={`Type ${confirmWord} to confirm`}>
          {({ id }) => (
            <Input
              id={id}
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
            />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  );
}
