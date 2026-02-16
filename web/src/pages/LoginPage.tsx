import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getDefaultRoute } from "../auth-routing";

export default function LoginPage() {
  const { login, token, loading, isAdmin, allowedModules } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@bookkeeper.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);

  if (token && !loading) {
    return <Navigate to={getDefaultRoute({ isAdmin, allowedModules })} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form className="app-card w-full max-w-md space-y-4 p-6" onSubmit={handleSubmit}>
        <h1 className="text-xl font-semibold">Bookkeeper Login</h1>
        <input className="app-input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input className="app-input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button className="app-button-primary w-full" type="submit">Sign in</button>
      </form>
    </div>
  );
}
