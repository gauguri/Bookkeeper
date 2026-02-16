type ResetPasswordModalProps = {
  open: boolean;
  email: string;
  password: string;
  confirmPassword: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChangePassword: (value: string) => void;
  onChangeConfirmPassword: (value: string) => void;
  onSave: () => void;
};

export default function ResetPasswordModal({
  open,
  email,
  password,
  confirmPassword,
  saving,
  error,
  onClose,
  onChangePassword,
  onChangeConfirmPassword,
  onSave
}: ResetPasswordModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="app-card w-full max-w-lg space-y-4 p-6">
        <h3 className="text-lg font-semibold">Reset password</h3>
        <p className="text-sm text-muted">{email}</p>
        {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}
        <input className="app-input" placeholder="New password" type="password" value={password} onChange={(e) => onChangePassword(e.target.value)} />
        <input className="app-input" placeholder="Confirm new password" type="password" value={confirmPassword} onChange={(e) => onChangeConfirmPassword(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="app-button-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="app-button" onClick={onSave} disabled={saving} type="button">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
