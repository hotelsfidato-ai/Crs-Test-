import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Lock } from "lucide-react";
import { useActor, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { hotelsRepo } from "@/data/repositories";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  Input, NativeSelect, Textarea, Skeleton, fieldProps, toast,
describeError,
} from "@/components/ui";
import { Forbidden } from "@/features/shared/Forbidden";
import type { HotelCategory, HotelStatus } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   ADD / EDIT A PROPERTY

   ⚠️ Commission is not on this form, and cannot be. It lives in
   hotels/{id}/private/commercial with its own rule, so an Admin sets
   it from the property page after onboarding. Adding a commission
   input here would mean writing the field somewhere every role can
   read — which is exactly what Phase 2 moved it out of.

   Room types and seasons are configured per property afterwards. A
   property with no rooms is a valid record: onboarding often starts
   before the fact sheet arrives.
   ══════════════════════════════════════════════════════════════════ */

const CATEGORIES: { value: HotelCategory; label: string }[] = [
  { value: "business", label: "Business hotel" },
  { value: "resort", label: "Resort" },
  { value: "heritage", label: "Heritage" },
  { value: "beach", label: "Beach" },
  { value: "hill_station", label: "Hill station" },
  { value: "banquet", label: "Banquet and conventions" },
];

const STATUSES: { value: HotelStatus; label: string; hint: string }[] = [
  { value: "onboarding", label: "Onboarding", hint: "Not yet sellable." },
  { value: "active", label: "Active", hint: "Available in the reservation wizard." },
  { value: "paused", label: "Paused", hint: "Temporarily not sellable." },
];

interface FormState {
  name: string;
  shortName: string;
  city: string;
  state: string;
  country: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: HotelCategory;
  status: HotelStatus;
  starRating: string;
  totalRooms: string;
  description: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  bankBranch: string;
  bankIfsc: string;
}

const BLANK: FormState = {
  name: "", shortName: "", city: "", state: "", country: "India", address: "",
  contactPerson: "", email: "", phone: "",
  category: "business", status: "onboarding",
  starRating: "3", totalRooms: "", description: "",
  bankAccountName: "", bankAccountNumber: "", bankName: "",
  bankBranch: "", bankIfsc: "",
};

export default function HotelFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const actor = useActor();
  const role = useSession((s) => s.role);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(BLANK);

  const existing = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => hotelsRepo.get(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    const h = existing.data;
    if (!h) return;
    setForm({
      name: h.name ?? "",
      shortName: h.shortName ?? "",
      city: h.city ?? "",
      state: h.state ?? "",
      country: h.country ?? "India",
      address: h.address ?? "",
      contactPerson: h.contactPerson ?? "",
      bankAccountName: h.bankAccountName ?? "",
      bankAccountNumber: h.bankAccountNumber ?? "",
      bankName: h.bankName ?? "",
      bankBranch: h.bankBranch ?? "",
      bankIfsc: h.bankIfsc ?? "",
      email: h.email ?? "",
      phone: h.phone ?? "",
      category: h.category ?? "business",
      status: h.status ?? "onboarding",
      starRating: String(h.starRating ?? 3),
      totalRooms: String(h.totalRooms ?? ""),
      description: h.description ?? "",
    });
  }, [existing.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        /* Falls back to the full name. A blank short name would render
           as an empty chip in every table that uses it. */
        shortName: form.shortName.trim() || form.name.trim(),
        starRating: Number(form.starRating) || 0,
        totalRooms: Number(form.totalRooms) || 0,
        email: form.email.trim().toLowerCase(),
        /* IFSC is uppercase by definition, and it is printed on a
           voucher a guest types into a banking app. Normalising here
           beats trusting whoever filled the form in. */
        bankIfsc: form.bankIfsc.trim().toUpperCase(),
        bankAccountNumber: form.bankAccountNumber.replace(/\s/g, ""),
        ...(isEdit ? {} : { onboardedAt: new Date().toISOString().slice(0, 10) }),
      };
      return isEdit
        ? hotelsRepo.update(id!, payload, actor)
        : hotelsRepo.create(payload, actor);
    },
    onSuccess: (hotel) => {
      queryClient.invalidateQueries({ queryKey: ["hotels"] });
      queryClient.invalidateQueries({ queryKey: ["hotels-all"] });
      queryClient.invalidateQueries({ queryKey: ["hotel", hotel.id] });
      toast.success(
        isEdit ? "Property updated" : "Property added",
        isEdit
          ? `${hotel.name} has been saved.`
          : `${hotel.name} is onboarded. Add room types and seasons next.`,
      );
      navigate(`/hotels/${hotel.id}`);
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not save", detail.message ?? "Nothing was changed.");
    },
  });

  if (!can(role, isEdit ? "edit" : "create", "hotel")) {
    return <Forbidden resource="hotel" />;
  }
  if (isEdit && existing.isLoading) return <FormSkeleton />;

  const ready = form.name.trim().length > 1 && form.city.trim().length > 1;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Properties", to: "/hotels" },
          { label: isEdit ? form.name || "Edit" : "Add property" },
        ]}
        title={isEdit ? form.name || "Edit property" : "Add a property"}
        description={
          isEdit
            ? "Room types, seasons and commercial terms are managed on the property page."
            : "Onboard a partner property. Room types and seasons come next; commission is set separately."
        }
      />

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader title="Identity" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Property name" required>
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Marigold Banquets 'n' Conventions"
                    autoFocus
                  />
                )}
              </Field>
              <Field label="Short name" hint="Used in tables and chips. Defaults to the full name.">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.shortName}
                    onChange={(e) => set("shortName", e.target.value)}
                    placeholder="Marigold"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                {(p) => (
                  <NativeSelect
                    {...fieldProps(p)}
                    value={form.category}
                    onChange={(e) => set("category", e.target.value as HotelCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field
                label="Status"
                required
                hint={STATUSES.find((s) => s.value === form.status)?.hint}
              >
                {(p) => (
                  <NativeSelect
                    {...fieldProps(p)}
                    value={form.status}
                    onChange={(e) => set("status", e.target.value as HotelStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Star rating">
                {(p) => (
                  <NativeSelect
                    {...fieldProps(p)}
                    value={form.starRating}
                    onChange={(e) => set("starRating", e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} star</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Total rooms" hint="The property's own house count.">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    type="number"
                    numeric
                    min={0}
                    value={form.totalRooms}
                    onChange={(e) => set("totalRooms", e.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="Description" hint="Shown on the property page and in proposals.">
              {(p) => (
                <Textarea
                  {...fieldProps(p)}
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Location" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" required>
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Pune"
                  />
                )}
              </Field>
              <Field label="State">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.state}
                    onChange={(e) => set("state", e.target.value)}
                    placeholder="Maharashtra"
                  />
                )}
              </Field>
              <Field label="Country">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="Address">
              {(p) => (
                <Textarea
                  {...fieldProps(p)}
                  rows={2}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Reservations contact"
            description="Who Fidato calls to confirm a booking."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contact person">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.contactPerson}
                    onChange={(e) => set("contactPerson", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Email">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Phone">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                )}
              </Field>
            </div>
          </CardBody>
        </Card>

        {/* ⚠️ Not commission. These are the property's own payment
            instructions and they are PRINTED ON THE GUEST'S VOUCHER —
            which is why they live on the hotel record rather than in
            the Owner-only commercial subcollection. Anyone who can read
            a booking can read these. */}
        <Card>
          <CardHeader
            title="Bank details"
            description="Printed on the voucher so a guest can settle by transfer. Leave blank and the voucher simply omits the section."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Account name"
                hint="Exactly as the bank holds it — a mismatch fails the transfer"
              >
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.bankAccountName}
                    onChange={(e) => set("bankAccountName", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Account number">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    className="font-mono"
                    value={form.bankAccountNumber}
                    onChange={(e) => set("bankAccountNumber", e.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bank">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    placeholder="Indian Overseas Bank"
                    value={form.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Branch">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    value={form.bankBranch}
                    onChange={(e) => set("bankBranch", e.target.value)}
                  />
                )}
              </Field>
              <Field label="IFSC">
                {(p) => (
                  <Input
                    {...fieldProps(p)}
                    className="font-mono uppercase"
                    placeholder="IOBA0001593"
                    value={form.bankIfsc}
                    onChange={(e) => set("bankIfsc", e.target.value)}
                  />
                )}
              </Field>
            </div>

            <p className="text-xs text-grey-500 leading-relaxed">
              The voucher shows this block only when an account name and number are
              both present — a bare IFSC, or an account with nobody to pay, is worse
              on a guest's document than no bank section at all.
            </p>
          </CardBody>
          <CardFooter>
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button
              leadingIcon={<Building2 className="size-4" />}
              loading={save.isPending}
              disabled={!ready}
              onClick={() => save.mutate()}
            >
              {isEdit ? "Save property" : "Add property"}
            </Button>
          </CardFooter>
        </Card>

        <p className="flex items-start gap-2 text-xs text-grey-400">
          <Lock className="size-3.5 shrink-0 mt-px" />
          Commission is not set here. It is stored separately from the property record so
          that only Owner and Admin can read it, and is set from the property page after
          onboarding.
        </p>
      </div>
    </Page>
  );
}

function FormSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-56 mb-3" />
      <Skeleton className="h-8 w-64 mb-8" />
      <div className="max-w-3xl space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </Page>
  );
}
