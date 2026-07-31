import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { adminRepo, hotelsRepo } from "@/data/repositories";
import { useQuery } from "@tanstack/react-query";
import { useActor } from "@/lib/session";
import {
  ASSIGNABLE_ROLES, ROLE_LABELS, can, type Role,
} from "@/lib/permissions";
import { useSession } from "@/lib/session";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose,
  Field, Input, NativeSelect, fieldProps, toast,
} from "@/components/ui";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INVITE A USER

   âš ï¸ This creates the *record*, not the account. On the Spark plan
   there is no Admin SDK, so nobody here can mint an Auth user or set a
   password â€” the invited person creates their own credentials at
   /signup, and the record below is what turns that anonymous account
   into someone with a role.

   That ordering is a feature: no administrator ever handles another
   person's password, because there is no point in the flow where one
   exists to handle.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export function InviteUserDialog() {
  const actor = useActor();
  const myRole = useSession((s) => s.account?.role ?? "viewer");
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("salesperson");
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const [hotelId, setHotelId] = useState("");

  const hotels = useQuery({
    queryKey: ["hotels-all"],
    queryFn: () => hotelsRepo.all(),
    enabled: open,
  });

  /**
   * âš ï¸ Only an Owner may create another Owner. Otherwise an Admin can
   * promote themselves to Owner in two moves â€” invite an Owner account
   * at an address they control, then sign in as it.
   */
  const offerableRoles = ASSIGNABLE_ROLES.filter(
    (r) => r !== "owner" || myRole === "owner",
  );

  const canInvite = can(myRole, "create", "user");

  const invite = useMutation({
    mutationFn: () =>
      adminRepo.invite(
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          department: department.trim(),
          branch: branch.trim(),
          ...(hotelId
            ? {
                hotelId,
                hotelName: hotels.data?.find((h) => h.id === hotelId)?.name ?? "",
              }
            : {}),
        },
        actor,
      ),
    onSuccess: (invitation) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user-stats"] });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success(
        "Invitation created",
        `${invitation.name} can now sign up with ${invitation.email} and will land in the ${ROLE_LABELS[invitation.role]} role.`,
      );
      reset();
      setOpen(false);
    },
    onError: () =>
      toast.error("Could not invite", "Nothing was saved. Check the address and try again."),
  });

  function reset() {
    setName("");
    setEmail("");
    setRole("salesperson");
    setDepartment("");
    setBranch("");
    setHotelId("");
  }

  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = name.trim().length > 1 && emailLooksValid;

  if (!canInvite) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button leadingIcon={<UserPlus className="size-4" />}>Invite user</Button>
      </DialogTrigger>

      <DialogContent
        title="Invite a colleague"
        description="They receive access once they sign up with this address and set their own password."
      >
        <div className="space-y-4">
          <Field label="Full name" required>
            {(p) => (
              <Input
                {...fieldProps(p)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rhea Kapoor"
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Work email"
            required
            hint="Must match exactly what they sign up with."
            error={
              email.length > 0 && !emailLooksValid
                ? "That is not a valid email address."
                : undefined
            }
          >
            {(p) => (
              <Input
                {...fieldProps(p)}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rhea@fidatohotels.com"
              />
            )}
          </Field>

          <Field label="Role" required hint={ROLE_HINTS[role]}>
            {(p) => (
              <NativeSelect
                {...fieldProps(p)}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {offerableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Sales"
                />
              )}
            </Field>
            <Field label="Branch">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="Pune"
                />
              )}
            </Field>
          </div>

          <Field
            label="Property"
            hint="Leave blank for someone who works across the whole portfolio."
          >
            {(p) => (
              <NativeSelect
                {...fieldProps(p)}
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
              >
                <option value="">All properties</option>
                {(hotels.data ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} â€” {h.city}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={() => invite.mutate()} disabled={!ready} loading={invite.isPending}>
            Create invitation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ROLE_HINTS: Record<Role, string> = {
  owner: "Everything, including commercial terms and commission.",
  admin: "Everything except transferring ownership.",
  manager: "Approves reservations and sees the invoice module.",
  salesperson: "Sees only their own customers, companies and bookings.",
  finance: "Invoices, payments and reconciliation. No commission terms.",
  viewer: "Read-only across the platform.",
  hotel_manager: "Reserved. Grants nothing until property access is turned on.",
  support: "Reserved. Grants nothing until the support desk is turned on.",
  automation: "Service account for n8n. Never assign this to a person.",
};
