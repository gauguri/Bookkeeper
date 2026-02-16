import { useAuth } from "../auth";

export default function NoAccessPage() {
  const { logout } = useAuth();

  return (
    <section className="app-card max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-semibold">No access assigned</h2>
      <p className="text-sm text-muted">Ask your administrator to grant access.</p>
      <div>
        <button className="app-button-ghost" onClick={logout}>Logout</button>
      </div>
    </section>
  );
}
