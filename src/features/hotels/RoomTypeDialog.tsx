import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Pencil, Trash2 } from "lucide-react";
import { roomConfigRepo } from "@/data/repositories";
import { useActor } from "@/lib/session";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose,
  Field, Input, Textarea, fieldProps, toast,
} from "@/components/ui";
import type { RoomType } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   ROOM TYPES

   Without these a property cannot be sold: the reservation wizard
   lists room types, so a property with none offers nothing to book.

   ⚠️ No price here, and there cannot be one. Fidato negotiates every
   booking, so the selling rate is typed per reservation and frozen
   onto that folio. What a room type carries is what does not change
   between bookings — how many there are, who fits, what is in it.
   ══════════════════════════════════════════════════════════════════ */

interface Draft {
  name: string;
  code: string;
  description: string;
  totalRooms: string;
  maxOccupancy: string;
  maxExtraBeds: string;
  sizeSqft: string;
  amenities: string;
}

function draftFrom(roomType?: RoomType): Draft {
  return {
    name: roomType?.name ?? "",
    code: roomType?.code ?? "",
    description: roomType?.description ?? "",
    totalRooms: String(roomType?.totalRooms ?? ""),
    maxOccupancy: String(roomType?.maxOccupancy ?? 2),
    maxExtraBeds: String(roomType?.maxExtraBeds ?? 0),
    sizeSqft: String(roomType?.sizeSqft ?? ""),
    amenities: (roomType?.amenities ?? []).join(", "),
  };
}

export function RoomTypeDialog({
  hotelId, hotelName, roomType,
}: {
  hotelId: string;
  hotelName: string;
  roomType?: RoomType;
}) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const isEdit = Boolean(roomType);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(roomType));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        hotelId,
        hotelName,
        name: draft.name.trim(),
        // Falls back to an initials-style code so the column is never blank.
        code: draft.code.trim().toUpperCase() || codeFrom(draft.name),
        description: draft.description.trim(),
        totalRooms: Number(draft.totalRooms) || 0,
        maxOccupancy: Number(draft.maxOccupancy) || 2,
        maxExtraBeds: Number(draft.maxExtraBeds) || 0,
        sizeSqft: Number(draft.sizeSqft) || 0,
        amenities: draft.amenities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      };
      if (roomType) await roomConfigRepo.updateRoomType(roomType.id, payload, actor);
      else await roomConfigRepo.createRoomType(payload, actor);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-room-types", hotelId] });
      toast.success(
        isEdit ? "Room type updated" : "Room type added",
        `${draft.name} is now bookable at ${hotelName}.`,
      );
      setOpen(false);
    },
    onError: () => toast.error("Could not save", "Nothing was changed."),
  });

  const ready = draft.name.trim().length > 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(draftFrom(roomType));
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" leadingIcon={<Pencil className="size-3.5" />}>
            Edit
          </Button>
        ) : (
          <Button size="sm" leadingIcon={<BedDouble className="size-4" />}>
            Add room type
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        title={isEdit ? `Edit ${roomType!.name}` : "Add a room type"}
        description={hotelName}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
              {isEdit ? "Save room type" : "Add room type"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" required className="sm:col-span-2">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Deluxe Room"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Code" hint="Defaults from the name.">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  value={draft.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="DLX"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number of rooms" hint="How many of this type the property has.">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  type="number"
                  numeric
                  min={0}
                  value={draft.totalRooms}
                  onChange={(e) => set("totalRooms", e.target.value)}
                />
              )}
            </Field>
            <Field label="Room size" hint="Square feet. Optional.">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  type="number"
                  numeric
                  min={0}
                  value={draft.sizeSqft}
                  onChange={(e) => set("sizeSqft", e.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sleeps" hint="Adults and children, excluding extra beds.">
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  type="number"
                  numeric
                  min={1}
                  value={draft.maxOccupancy}
                  onChange={(e) => set("maxOccupancy", e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Extra beds allowed"
              hint="Caps what the booking wizard will accept per room."
            >
              {(p) => (
                <Input
                  {...fieldProps(p)}
                  type="number"
                  numeric
                  min={0}
                  value={draft.maxExtraBeds}
                  onChange={(e) => set("maxExtraBeds", e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Amenities" hint="Comma separated. Shown on the property page.">
            {(p) => (
              <Input
                {...fieldProps(p)}
                value={draft.amenities}
                onChange={(e) => set("amenities", e.target.value)}
                placeholder="Air conditioning, Mini bar, Work desk"
              />
            )}
          </Field>

          <Field label="Description">
            {(p) => (
              <Textarea
                {...fieldProps(p)}
                rows={2}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
              />
            )}
          </Field>

          <p className="text-sm text-grey-500 leading-relaxed">
            No rate here. The salesperson types the selling rate on each booking, because
            Fidato negotiates every one — see the property's seasons for meal plans and
            stay rules.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Removal ───────────────────────────────────────────────────── */

export function DeleteRoomTypeButton({
  hotelId, roomType,
}: {
  hotelId: string;
  roomType: RoomType;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => roomConfigRepo.deleteRoomType(roomType.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-room-types", hotelId] });
      toast.success("Room type removed", `${roomType.name} is no longer bookable.`);
    },
    onError: () => toast.error("Could not remove", "Nothing was changed."),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${roomType.name}`}
          leadingIcon={<Trash2 className="size-3.5" />}
        >
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Remove ${roomType.name}?`}
        description="It will no longer be offered in the reservation wizard."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                Remove room type
              </Button>
            </DialogClose>
          </>
        }
      >
        {/* ⚠️ Room types are configuration, not history, so unlike a
            reservation this really is a delete. Existing bookings are
            unaffected: they carry the room type's NAME and the rate
            that was agreed, not a live reference to this document. */}
        <p className="text-base text-grey-600 leading-relaxed">
          Bookings already made keep the room name and rate they were quoted, so nothing
          in the folio or on an invoice changes.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function codeFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "STD";
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}
