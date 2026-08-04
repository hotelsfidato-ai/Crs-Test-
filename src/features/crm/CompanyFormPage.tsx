import { useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActor } from "@/lib/session";
import { companiesRepo } from "@/data/repositories";
import { INDUSTRIES } from "@/lib/vocabulary";
import {
  Page, PageHeader, Card, CardBody, CardFooter, Button, Field, Input,
  Textarea, NativeSelect, Skeleton, toast,
describeError,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";

const schema = z.object({
  name: z.string().min(1, "Company name is required"),
  legalName: z.string().min(1, "Legal name is required"),
  tier: z.enum(["key_account", "corporate", "sme", "travel_agent"]),
  status: z.enum(["active", "prospect", "dormant"]),
  industry: z.string().min(1, "Industry is required"),
  gstin: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  creditLimit: z.coerce.number().min(0, "Cannot be negative"),
  paymentTermDays: z.coerce.number().min(0).max(180),
  negotiatedDiscountPercent: z.coerce.number().min(0).max(50),
  notes: z.string(),
});

type FormValues = z.input<typeof schema>;

export default function CompanyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const actor = useActor();
  const queryClient = useQueryClient();

  const existing = useQuery({
    queryKey: ["company", id],
    queryFn: () => companiesRepo.get(id!),
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", legalName: "", tier: "sme", status: "prospect", industry: "",
      gstin: "", city: "", state: "", address: "", website: "", phone: "", email: "",
      creditLimit: 0, paymentTermDays: 30, negotiatedDiscountPercent: 0, notes: "",
    },
  });

  useEffect(() => {
    if (existing.data) {
      const c = existing.data;
      form.reset({
        name: c.name, legalName: c.legalName, tier: c.tier, status: c.status,
        industry: c.industry, gstin: c.gstin, city: c.city, state: c.state,
        address: c.address, website: c.website, phone: c.phone, email: c.email,
        creditLimit: c.creditLimit, paymentTermDays: c.paymentTermDays,
        negotiatedDiscountPercent: c.negotiatedDiscountPercent, notes: c.notes,
      });
    }
  }, [existing.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const parsed = schema.parse(values);
      return isEdit
        ? companiesRepo.update(id!, parsed, actor)
        : companiesRepo.create(parsed, actor);
    },
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company", company.id] });
      toast.success(
        isEdit ? "Company updated" : "Company created",
        `${company.name} has been saved.`,
      );
      navigate(`/crm/companies/${company.id}`);
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not save", detail.message ?? "Something went wrong. Try again.");
    },
  });

  if (isEdit && existing.isLoading) return <FormSkeleton />;
  if (isEdit && !existing.data) return <NotFound />;

  const errors = form.formState.errors;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Companies", to: "/crm/companies" },
          ...(isEdit && existing.data
            ? [{ label: existing.data.name, to: `/crm/companies/${id}` }, { label: "Edit" }]
            : [{ label: "New company" }]),
        ]}
        title={isEdit ? "Edit company" : "New company"}
        description="Corporate accounts carry negotiated rates, credit limits and payment terms that apply automatically to their bookings."
      />

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="max-w-3xl">
        <Card>
          <CardBody className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Trading name" required error={errors.name?.message}>
                {({ id: f, describedBy, invalid }) => (
                  <Input id={f} aria-describedby={describedBy} invalid={invalid} autoFocus {...form.register("name")} />
                )}
              </Field>
              <Field label="Legal name" required error={errors.legalName?.message}>
                {({ id: f, describedBy, invalid }) => (
                  <Input id={f} aria-describedby={describedBy} invalid={invalid} {...form.register("legalName")} />
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Tier" hint="Drives default discount">
                {({ id: f }) => (
                  <NativeSelect id={f} {...form.register("tier")}>
                    <option value="key_account">Key account</option>
                    <option value="corporate">Corporate</option>
                    <option value="sme">SME</option>
                    <option value="travel_agent">Travel agent</option>
                  </NativeSelect>
                )}
              </Field>
              <Field label="Status">
                {({ id: f }) => (
                  <NativeSelect id={f} {...form.register("status")}>
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="dormant">Dormant</option>
                  </NativeSelect>
                )}
              </Field>
              <Field label="Industry" required error={errors.industry?.message}>
                {({ id: f, invalid }) => (
                  <NativeSelect id={f} invalid={invalid} {...form.register("industry")}>
                    <option value="">Select…</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" error={errors.email?.message}>
                {({ id: f, invalid }) => (
                  <Input id={f} type="email" invalid={invalid} {...form.register("email")} />
                )}
              </Field>
              <Field label="Phone">
                {({ id: f }) => <Input id={f} numeric {...form.register("phone")} />}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Website">
                {({ id: f }) => <Input id={f} placeholder="www.example.com" {...form.register("website")} />}
              </Field>
              <Field label="GSTIN">
                {({ id: f }) => <Input id={f} numeric {...form.register("gstin")} />}
              </Field>
            </div>

            <Field label="Address">
              {({ id: f }) => <Input id={f} {...form.register("address")} />}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="City" required error={errors.city?.message}>
                {({ id: f, invalid }) => (
                  <Input id={f} invalid={invalid} {...form.register("city")} />
                )}
              </Field>
              <Field label="State">
                {({ id: f }) => <Input id={f} {...form.register("state")} />}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Credit limit" hint="In rupees" error={errors.creditLimit?.message}>
                {({ id: f, invalid }) => (
                  <Input id={f} type="number" numeric invalid={invalid} {...form.register("creditLimit")} />
                )}
              </Field>
              <Field label="Payment terms" hint="Days" error={errors.paymentTermDays?.message}>
                {({ id: f, invalid }) => (
                  <Input id={f} type="number" numeric invalid={invalid} {...form.register("paymentTermDays")} />
                )}
              </Field>
              <Field
                label="Discount"
                hint="% off room charges"
                error={errors.negotiatedDiscountPercent?.message}
              >
                {({ id: f, invalid }) => (
                  <Input
                    id={f} type="number" numeric invalid={invalid}
                    {...form.register("negotiatedDiscountPercent")}
                  />
                )}
              </Field>
            </div>

            <Field label="Notes">
              {({ id: f }) => <Textarea id={f} rows={3} {...form.register("notes")} />}
            </Field>
          </CardBody>

          <CardFooter>
            <Button asChild variant="ghost">
              <Link to={isEdit ? `/crm/companies/${id}` : "/crm/companies"}>Cancel</Link>
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {isEdit ? "Save changes" : "Create company"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Page>
  );
}

function FormSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-64 mb-8" />
      <Skeleton className="h-[560px] w-full max-w-3xl" />
    </Page>
  );
}

