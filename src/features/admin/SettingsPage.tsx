import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { adminRepo } from "@/data/repositories";
import { money } from "@/lib/format";
import { APPROVAL_THRESHOLD } from "@/lib/rules";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button,
  Field, Input, NativeSelect, Skeleton, toast, DetailList, DetailRow,
describeError,
} from "@/components/ui";

const schema = z.object({
  brandName: z.string().min(1, "Required"),
  legalName: z.string().min(1, "Required"),
  registeredAddress: z.string().min(1, "Required"),
  gstin: z.string().min(1, "Required"),
  supportEmail: z.string().email("Enter a valid email address"),
  supportPhone: z.string().min(1, "Required"),
  currency: z.string(),
  timezone: z.string(),
  fiscalYearStart: z.string(),
});

type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const role = useSession((s) => s.role);
  const queryClient = useQueryClient();
  const editable = can(role, "edit", "setting");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => adminRepo.settings(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brandName: "", legalName: "", registeredAddress: "", gstin: "",
      supportEmail: "", supportPhone: "", currency: "INR",
      timezone: "Asia/Kolkata", fiscalYearStart: "April",
    },
  });

  useEffect(() => {
    if (settings.data) form.reset(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => adminRepo.updateSettings(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved", "Organisation details have been updated.");
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not save", detail.message ?? "Nothing was changed.");
    },
  });

  if (settings.isLoading) {
    return (
      <Page>
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-[520px] w-full max-w-3xl" />
      </Page>
    );
  }

  const errors = form.formState.errors;

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Organisation details used on invoices, vouchers and outbound messages."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Card>
            <CardHeader
              title="Organisation"
              description="These appear on every document the platform generates."
            />
            <CardBody className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Brand name" required error={errors.brandName?.message}>
                  {({ id, invalid }) => (
                    <Input
                      id={id} invalid={invalid} disabled={!editable}
                      {...form.register("brandName")}
                    />
                  )}
                </Field>
                <Field label="Legal name" required error={errors.legalName?.message}>
                  {({ id, invalid }) => (
                    <Input
                      id={id} invalid={invalid} disabled={!editable}
                      {...form.register("legalName")}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="Registered address"
                required
                error={errors.registeredAddress?.message}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id} invalid={invalid} disabled={!editable}
                    {...form.register("registeredAddress")}
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="GSTIN" required error={errors.gstin?.message}>
                  {({ id, invalid }) => (
                    <Input
                      id={id} numeric invalid={invalid} disabled={!editable}
                      {...form.register("gstin")}
                    />
                  )}
                </Field>
                <Field label="Support phone" required error={errors.supportPhone?.message}>
                  {({ id, invalid }) => (
                    <Input
                      id={id} numeric invalid={invalid} disabled={!editable}
                      {...form.register("supportPhone")}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="Support email"
                required
                hint="Shown on invoices and guest confirmations"
                error={errors.supportEmail?.message}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id} type="email" invalid={invalid} disabled={!editable}
                    {...form.register("supportEmail")}
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Currency">
                  {({ id }) => (
                    <NativeSelect id={id} disabled={!editable} {...form.register("currency")}>
                      <option value="INR">INR — Indian Rupee</option>
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Timezone">
                  {({ id }) => (
                    <NativeSelect id={id} disabled={!editable} {...form.register("timezone")}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Fiscal year starts">
                  {({ id }) => (
                    <NativeSelect
                      id={id}
                      disabled={!editable}
                      {...form.register("fiscalYearStart")}
                    >
                      <option value="April">April</option>
                      <option value="January">January</option>
                    </NativeSelect>
                  )}
                </Field>
              </div>
            </CardBody>

            {editable && (
              <CardFooter>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => settings.data && form.reset(settings.data)}
                >
                  Reset
                </Button>
                <Button type="submit" variant="primary" loading={save.isPending}>
                  Save settings
                </Button>
              </CardFooter>
            )}
          </Card>
        </form>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Platform rules" description="Fixed in Phase 1" />
            <CardBody className="pt-0">
              <DetailList>
                <DetailRow label="Approval threshold">
                  <span className="tabular">{money(APPROVAL_THRESHOLD)}</span>
                </DetailRow>
                <DetailRow label="GST bands">12% / 18%</DetailRow>
                <DetailRow label="Reservation deletion">Not permitted</DetailRow>
                <DetailRow label="Rate editing">Revenue team only</DetailRow>
              </DetailList>
              <p className="text-xs text-grey-400 mt-4 pt-3 border-t border-grey-100 leading-relaxed">
                These become configurable in Phase 2, once they live in Firestore rather
                than in the application bundle.
              </p>
            </CardBody>
          </Card>

          {!editable && (
            <Card className="bg-grey-50">
              <CardBody className="flex items-start gap-2.5">
                <Info className="size-4 text-grey-400 shrink-0 mt-0.5" />
                <p className="text-sm text-grey-600 leading-relaxed">
                  Settings are read-only for your role. Switch to Super Admin in the top
                  bar to edit them.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
