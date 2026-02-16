import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { getDefaultRoute } from "../auth-routing";

export default function NoAccessPage() {
  const location = useLocation();
  const { logout, isAdmin, allowedModules } = useAuth();
  const defaultRoute = getDefaultRoute({ isAdmin, allowedModules });
  const params = new URLSearchParams(location.search);
  const attemptedPath = params.get("from");

  return (
    <section className="app-card max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-semibold">You don’t have access to this module</h2>
      <p className="text-sm text-muted">
        {attemptedPath ? `The route ${attemptedPath} is not available for your account.` : "Ask your administrator to grant access."}
      </p>
      <div className="flex gap-2">
        {defaultRoute !== "/no-access" ? (
          <Link className="app-button" to={defaultRoute}>
            Go to your first allowed module
          </Link>
        ) : null}
        <button className="app-button-ghost" onClick={logout}>Logout</button>
      </div>
    </section>
  );
}
