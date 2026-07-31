import { useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useActor, useScope } from "@/lib/session";
import { customersRepo, companiesRepo } from "@/data/repositories";
import { useDebounced } from "@/features/shared/useDebounced";
import { GUEST_PREFERENCES } from "@/lib/vocabulary";
import {
  Page, PageHeader, Card, CardBody, CardFooter, Button, Field, Input,
  Textarea, NativeSelect, Combobox, Checkbox, Skeleton, toast,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";

/* Validation mirrors the business rules in lib/rules.ts — email and
   phone must be unique across the platform. */

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  phone: z
    .string()
    .min(1, "Phone is required")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid 10-digit number"),
  status: z.enum(["active", "lead", "inactive"]),
  source: z.enum(["direct", "referral", "website", "ota", "corporate", "walk_in", "campaign"]),
  companyId: z.string().optional(),
  designation: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  vip: z.boolean(),
  preferences: z.array(z.string()),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

export default function CustomerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const actor = useActor();
  const scope = useScope();
  const queryClient = useQueryClient();

  const existing = useQuery({
    queryKey: ["customer", id],
    queryFn: () => customersRepo.get(id!),
    enabled: isEdit,
  });

  const companies = useQuery({
    queryKey: ["companies-all", scope.role, scope.userId],
    queryFn: () => companiesRepo.all(scope),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "",
      status: "lead", source: "direct", companyId: "", designation: "",
      city: "", state: "", vip: false, preferences: [], notes: "",
    },
  });

  useEffect(() => {
    if (existing.data) {
      const c = existing.data;
      form.reset({
        firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
        status: c.status, source: c.source, companyId: c.companyId ?? "",
        designation: c.designation ?? "", city: c.city, state: c.state,
        vip: c.vip, preferences: c.preferences, notes: c.notes,
      });
    }
  }, [existing.data, form]);

  const companyOptions = useMemo(
    () => [
      { value: "", label: "No company — individual guest" },
      ...(companies.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.industry} · ${c.city}`,
      })),
    ],
    [companies.data],
  );

  const email = form.watch("email");
  const phone = form.watch("phone");

  /* Live duplicate warning, not a hard block — the merge screen is the
     proper place to resolve these.

     ⚠️ Phase 1 scanned the in-memory seed. Against Firestore that would
     mean reading the whole customer book on every keystroke, so this is
     an indexed equality lookup on the normalised fields — one read —
     debounced so typing an address does not fire eleven of them. */
  const debouncedEmail = useDebounced(email, 500);
  const debouncedPhone = useDebounced(phone, 500);

  const duplicates = useQuery({
    queryKey: ["customer-duplicate", debouncedEmail, debouncedPhone, id],
    queryFn: () => customersRepo.findDuplicate(debouncedEmail ?? "", debouncedPhone ?? "", id),
    enabled: Boolean(debouncedEmail || debouncedPhone),
    staleTime: 30_000,
  });

  const duplicateEmail = Boolean(duplicates.data?.byEmail);
  const duplicatePhone = Boolean(duplicates.data?.byPhone);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, companyId: values.companyId || undefined };
      return isEdit
        ? customersRepo.update(id!, payload, actor)
        : customersRepo.create(payload, actor);
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      toast.success(
        isEdit ? "Customer updated" : "Customer created",
        `${customer.fullName} has been saved.`,
      );
      navigate(`/crm/customers/${customer.id}`);
    },
    onError: () => toast.error("Could not save", "Something went wrong. Try again."),
  });

  if (isEdit && existing.isLoading) return <FormSkeleton />;
  if (isEdit && !existing.data) return <NotFound />;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Customers", to: "/crm/customers" },
          ...(isEdit && existing.data
            ? [{ label: existing.data.fullName, to: `/crm/customers/${id}` }, { label: "Edit" }]
            : [{ label: "New customer" }]),
        ]}
        title={isEdit ? "Edit customer" : "New customer"}
        description={
          isEdit
            ? "Changes are written to the audit trail."
            : "Email and phone must be unique across the platform."
        }
      />

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="max-w-3xl">
        <Card>
          <CardBody className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" required error={form.formState.errors.firstName?.message}>
                {({ id: fieldId, describedBy, invalid }) => (
                  <Input
                    id={fieldId} aria-describedby={describedBy} invalid={invalid}
                    autoFocus {...form.register("firstName")}
                  />
                )}
              </Field>

              <Field label="Last name" required error={form.formState.errors.lastName?.message}>
                {({ id: fieldId, describedBy, invalid }) => (
                  <Input
                    id={fieldId} aria-describedby={describedBy} invalid={invalid}
                    {...form.register("lastName")}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Email"
                required
                error={form.formState.errors.email?.message}
                hint={duplicateEmail ? undefined : "Used for confirmations and vouchers"}
              >
                {({ id: fieldId, describedBy, invalid }) => (
                  <>
                    <Input
                      id={fieldId} type="email" aria-describedby={describedBy}
                      invalid={invalid || Boolean(duplicateEmail)}
                      {...form.register("email")}
                    />
                    {duplicateEmail && <DuplicateWarning field="email" />}
                  </>
                )}
              </Field>

              <Field
                label="Phone"
                required
                error={form.formState.errors.phone?.message}
                hint={duplicatePhone ? undefined : "Include the country code"}
              >
                {({ id: fieldId, describedBy, invalid }) => (
                  <>
                    <Input
                      id={fieldId} aria-describedby={describedBy} numeric
                      invalid={invalid || Boolean(duplicatePhone)}
                      placeholder="+91 98765 43210"
                      {...form.register("phone")}
                    />
                    {duplicatePhone && <DuplicateWarning field="phone number" />}
                  </>
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company">
                {({ id: fieldId }) => (
                  <Controller
                    control={form.control}
                    name="companyId"
                    render={({ field }) => (
                      <Combobox
                        id={fieldId}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        options={companyOptions}
                        placeholder="Search companies…"
                      />
                    )}
                  />
                )}
              </Field>

              <Field label="Designation" hint="Their role at the company">
                {({ id: fieldId }) => (
                  <Input id={fieldId} placeholder="Travel Desk Head" {...form.register("designation")} />
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="City" required error={form.formState.errors.city?.message}>
                {({ id: fieldId, describedBy, invalid }) => (
                  <Input
                    id={fieldId} aria-describedby={describedBy} invalid={invalid}
                    {...form.register("city")}
                  />
                )}
              </Field>

              <Field label="State">
                {({ id: fieldId }) => <Input id={fieldId} {...form.register("state")} />}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Status">
                {({ id: fieldId }) => (
                  <NativeSelect id={fieldId} {...form.register("status")}>
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </NativeSelect>
                )}
              </Field>

              <Field label="Source" hint="How this customer reached us">
                {({ id: fieldId }) => (
                  <NativeSelect id={fieldId} {...form.register("source")}>
                    <option value="direct">Direct</option>
                    <option value="corporate">Corporate</option>
                    <option value="referral">Referral</option>
                    <option value="website">Website</option>
                    <option value="ota">OTA</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="campaign">Campaign</option>
                  </NativeSelect>
                )}
              </Field>
            </div>

            <Field label="Stay preferences" hint="Passed to the property with every booking">
              {() => (
                <Controller
                  control={form.control}
                  name="preferences"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-x-5 gap-y-2.5 pt-1">
                      {GUEST_PREFERENCES.map((pref) => (
                        <Checkbox
                          key={pref}
                          label={pref}
                          checked={field.value.includes(pref)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, pref]
                                : field.value.filter((p) => p !== pref),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                />
              )}
            </Field>

            <Controller
              control={form.control}
              name="vip"
              render={({ field }) => (
                <Checkbox
                  label="Flag as VIP — the property is notified before arrival"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />

            <Field label="Internal notes" hint="Never shown to the guest">
              {({ id: fieldId }) => (
                <Textarea id={fieldId} rows={3} {...form.register("notes")} />
              )}
            </Field>
          </CardBody>

          <CardFooter>
            <Button asChild variant="ghost">
              <Link to={isEdit ? `/crm/customers/${id}` : "/crm/customers"}>Cancel</Link>
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {isEdit ? "Save changes" : "Create customer"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Page>
  );
}

function DuplicateWarning({ field }: { field: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-[#8a6300] mt-1.5">
      <AlertTriangle className="size-3.5 shrink-0 mt-px" />
      <span>
        Another customer already has this {field}. You can still save, then resolve it on
        the{" "}
        <Link to="/crm/merge" className="underline">
          duplicates
        </Link>{" "}
        screen.
      </span>
    </p>
  );
}

function FormSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-64 mb-8" />
      <Skeleton className="h-[520px] w-full max-w-3xl" />
    </Page>
  );
}

