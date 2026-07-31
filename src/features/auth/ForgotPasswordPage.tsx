import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/lib/session";
import { Button, Field, Input } from "@/components/ui";
import { AuthLayout } from "./AuthLayout";

/* ══════════════════════════════════════════════════════════════════
   PASSWORD RESET

   ⚠️ Always reports success. Telling the visitor "no account with that
   address" turns this form into a way to test which email addresses
   belong to staff here. The link is sent when the account exists and
   silently not sent when it does not — the screen reads identically
   either way.
   ══════════════════════════════════════════════════════════════════ */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="If an account exists for that address, a reset link is on its way. The link expires in an hour."
        footer={
          <Link to="/login" className="text-brand-orange hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 p-4 rounded-md bg-grey-50 border border-grey-200">
          <MailCheck className="size-4 text-grey-400 shrink-0 mt-0.5" />
          <p className="text-sm text-grey-600 leading-relaxed">
            Nothing arrived? Check your spam folder, then confirm with your administrator
            that this is the address on your account.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a link to set a new one."
      footer={
        <Link to="/login" className="text-brand-orange hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fidatohotels.com"
              autoFocus
            />
          )}
        </Field>

        <Button type="submit" className="w-full" loading={busy} disabled={!email.trim()}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
