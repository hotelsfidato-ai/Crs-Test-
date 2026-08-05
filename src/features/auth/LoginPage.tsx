import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { signIn, useSession, type AuthIssue } from "@/lib/session";
import { Button, Field, Input, fieldProps } from "@/components/ui";
import { AuthLayout } from "./AuthLayout";

/* ══════════════════════════════════════════════════════════════════
   SIGN IN

   âš ï¸ One error message for every failure mode. "No such account" and
   "wrong password" told apart is an account-enumeration oracle: it
   lets anyone confirm which colleagues have logins here. Firebase
   distinguishes them; this screen deliberately does not.
   ══════════════════════════════════════════════════════════════════ */

const GENERIC_ERROR = "That email and password combination was not recognised.";

/**
 * ⚠️ These are NOT the generic message, deliberately.
 *
 * Reaching either of them means the password was correct — the account
 * authenticated and was then refused for a reason that is not a secret.
 * Staying vague here would leave someone retyping a password that was
 * right the first time, which is what this screen did before.
 */
const ISSUE_MESSAGES: Record<AuthIssue, string> = {
  /* ⚠️ The advice at the end has to be true, and it used to lead to a
     dead end: "Set up your account" refused any address that already
     had an Auth account, which is exactly the state anyone reading this
     message is in. Claiming now signs into an existing account instead
     of insisting on a new one, so the route below actually works —
     using their existing password. */
  no_profile:
    "That account exists but has no access yet. Ask your administrator to invite " +
    "this address, then use “Set up your account” with the same email and your " +
    "existing password — it will attach the invitation to the account you already have.",
  disabled:
    "That account has been disabled. Ask your administrator to re-enable it.",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const issue = useSession((s) => s.issue);
  const clearIssue = useSession((s) => s.clearIssue);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ⚠️ Navigation is driven by the session, not by signIn() returning.
     signIn resolving only means Firebase accepted the password; the
     listener still has to find a profile, and it may sign the account
     straight back out. Navigating on the promise sent people to a
     dashboard that immediately bounced them back here. */
  useEffect(() => {
    if (status === "signed_in") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  useEffect(() => {
    if (issue) setBusy(false);
  }, [issue]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    clearIssue();
    setBusy(true);
    try {
      await signIn(email, password);
      // Deliberately no navigate() here — see the effect above.
    } catch (caught) {
      setError(
        caught instanceof FirebaseError && caught.code === "auth/too-many-requests"
          ? "Too many attempts. Wait a few minutes, or reset your password."
          : GENERIC_ERROR,
      );
      setBusy(false);
    }
  }

  const message = error ?? (issue ? ISSUE_MESSAGES[issue] : null);

  return (
    <AuthLayout
      title="Sign in"
      description="Use the work email your administrator invited."
      footer={
        <>
          First time here?{" "}
          <Link to="/signup" className="text-brand-orange hover:underline">
            Set up your account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email" required>
          {(p) => (
            <Input
              {...fieldProps(p)}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fidatohotels.com"
              autoFocus
            />
          )}
        </Field>

        <Field label="Password" required>
          {(p) => (
            <Input
              {...fieldProps(p)}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        {message && (
          <p role="alert" className="text-sm text-brand-red leading-relaxed">
            {message}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          loading={busy}
          disabled={!email.trim() || !password}
        >
          Sign in
        </Button>

        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-grey-500 hover:text-ink-900">
            Forgotten your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
