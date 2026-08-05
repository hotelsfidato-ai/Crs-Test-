import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { claimInvitation, NoInvitationError, AlreadySetUpError } from "@/lib/session";
import { Button, Field, Input, fieldProps } from "@/components/ui";
import { AuthLayout } from "./AuthLayout";

/* ══════════════════════════════════════════════════════════════════
   COMPLETE AN INVITATION

   âš ï¸ This is not open registration, even though the form is public.
   Firebase Spark has no Admin SDK, so an administrator cannot create
   an account for someone — the person must create their own. What the
   administrator controls is the `users` record, and without one the
   session listener signs the account straight back out.

   The password is typed here and nowhere else. No administrator sets
   it, sees it, or resets it to a known value.
   ══════════════════════════════════════════════════════════════════ */

const MIN_PASSWORD = 10;

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready =
    email.trim().length > 3 && password.length >= MIN_PASSWORD && confirm === password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setError(null);
    setBusy(true);
    try {
      await claimInvitation(email, password, name);
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Set up your account"
      description="Your administrator has invited you. Use the same work email they invited — if you already had an account here, enter its existing password."
      footer={
        <>
          Already set up?{" "}
          <Link to="/login" className="text-brand-orange hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          {(p) => (
            <Input
              {...fieldProps(p)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
            />
          )}
        </Field>

        <Field label="Work email" required hint="Must match the address you were invited on.">
          {(p) => (
            <Input
              {...fieldProps(p)}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fidatohotels.com"
            />
          )}
        </Field>

        <Field
          label="Password"
          required
          hint={`At least ${MIN_PASSWORD} characters. Nobody else can see or set this.`}
          error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : undefined}
        >
          {(p) => (
            <Input
              {...fieldProps(p)}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Confirm password"
          required
          error={mismatch ? "The two passwords do not match." : undefined}
        >
          {(p) => (
            <Input
              {...fieldProps(p)}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="text-sm text-brand-red leading-relaxed">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={busy} disabled={!ready}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof NoInvitationError) {
    return (
      "No invitation exists for that address, so nothing was set up. " +
      "Check the spelling, or ask your administrator to invite you."
    );
  }
  if (caught instanceof AlreadySetUpError) {
    return "That account is already set up. Sign in instead.";
  }
  if (caught instanceof FirebaseError) {
    switch (caught.code) {
      /* ⚠️ These now mean "the address is right, the password is not".
         An existing Auth account is no longer a dead end — the claim
         signs into it — so the only way to reach here is a mismatch,
         and telling someone to sign in instead would loop them back to
         a screen that also refuses them. */
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return (
          "An account already exists for that address, but that password does not " +
          "match it. Use the one you set previously, or reset it from the sign-in page."
        );
      case "auth/too-many-requests":
        return "Too many attempts. Wait a few minutes, then try again.";
      case "auth/weak-password":
        return "That password is too easy to guess. Try a longer one.";
      case "auth/invalid-email":
        return "That does not look like a valid email address.";
      default:
        return "Could not set up the account. Try again in a moment.";
    }
  }
  return "Could not set up the account. Try again in a moment.";
}
