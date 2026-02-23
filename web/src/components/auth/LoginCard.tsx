import { FormEvent, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { APP_NAME } from "../../branding";

type LoginCardProps = {
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LoginCard({
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit
}: LoginCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);


  return (
    <section className="bedrock-login-panel relative w-full max-w-md rounded-2xl border p-6 sm:p-8" aria-label="Login panel">
      <div className="mb-6 space-y-2">
        <p className="text-center text-4xl font-semibold tracking-tight text-[#1798d5]">{APP_NAME}</p>
        <p className="text-center text-sm text-[var(--bedrock-muted)]">Sign in to your Bedrock workspace</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--bedrock-label)]" htmlFor="login-email">Username</label>
          <div className="relative">
            <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-invalid={Boolean(error)}
              autoComplete="username"
              className="bedrock-input"
              id="login-email"
              name="email"
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="Enter username"
              required
              type="text"
              value={email}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--bedrock-label)]" htmlFor="login-password">Password</label>
          <div className="relative">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-invalid={Boolean(error)}
              autoComplete="current-password"
              className="bedrock-input pr-11"
              id="login-password"
              name="password"
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter your password"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bedrock-accent)]"
              onClick={() => setShowPassword((prev) => !prev)}
              type="button"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-[color:rgba(226,85,85,0.35)] bg-[rgba(226,85,85,0.08)] px-3 py-2.5 text-sm text-[#812d2d]" role="alert">
            <span className="mr-3 inline-block h-4 w-1 rounded-full bg-[var(--bedrock-danger)] align-middle" />
            {error}
          </p>
        ) : null}

        <button className="bedrock-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "AUTHENTICATING..." : "ENTER SYSTEM"}
        </button>

        <div className="space-y-2 border-t border-slate-200 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              checked={rememberMe}
              className="h-4 w-4 rounded border-slate-300 text-[var(--bedrock-accent)] focus:ring-[var(--bedrock-accent)]"
              onChange={(e) => setRememberMe(e.target.checked)}
              type="checkbox"
            />
            Remember me
          </label>
          <div className="flex items-center justify-between text-sm">
            <span aria-disabled="true" className="cursor-not-allowed text-sky-700/70" title="Forgot password flow is not configured yet">
              Forgot Your Password?
            </span>
            <span aria-disabled="true" className="cursor-not-allowed text-sky-700/70" title="Custom domains are not configured yet">
              Use Custom Domain
            </span>
          </div>
        </div>
      </form>
    </section>
  );
}
