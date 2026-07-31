import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { signIn } from "@/lib/session";
import { Button, Field, Input, fieldProps } from "@/components/ui";
import { AuthLayout } from "./AuthLayout";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SIGN IN

   âš ï¸ One error message for every failure mode. "No such account" and
   "wrong password" told apart is an account-enumeration oracle: it
   lets anyone confirm which colleagues have logins here. Firebase
   distinguishes them; this screen deliberately does not.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const GENERIC_ERROR = "That email and password combination was not recognised.";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      // The auth listener populates the session; the guard does the rest.
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof FirebaseError && caught.code === "auth/too-many-requests"
          ? "Too many attempts. Wait a few minutes, or reset your password."
          : GENERIC_ERROR,
      );
      setBusy(false);
    }
  }

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

        {error && (
          <p role="alert" className="text-sm text-brand-red leading-relaxed">
            {error}
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
