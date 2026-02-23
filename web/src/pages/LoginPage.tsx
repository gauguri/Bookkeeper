import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getDefaultRoute } from "../auth-routing";
import { BrandPanel } from "../components/auth/BrandPanel";
import { LoginCard } from "../components/auth/LoginCard";
import { StoneBackground } from "../components/auth/StoneBackground";
import "./LoginPage.css";

export default function LoginPage() {
  const { login, token, loading, isAdmin, allowedModules } = useAuth();
  const [email, setEmail] = useState("admin@bedrock.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (token && !loading) {
    return <Navigate to={getDefaultRoute({ isAdmin, allowedModules })} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bedrock-login-shell relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <StoneBackground />
      <main className="relative z-10 mx-auto grid w-full max-w-7xl items-stretch gap-6 lg:grid-cols-2 lg:gap-0">
        <div className="flex items-center justify-center rounded-[2rem] border border-slate-300/70 bg-white/45 p-4 shadow-sm backdrop-blur-sm sm:p-8 lg:rounded-r-none lg:border-r-0 lg:p-12">
          <LoginCard
            email={email}
            error={error}
            isSubmitting={isSubmitting || loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
            password={password}
          />
        </div>
        <BrandPanel />
      </main>
    </div>
  );
}
