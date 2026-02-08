export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="app-card p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Coming soon</p>
      <h1 className="text-3xl font-semibold mb-2">{title}</h1>
      <p className="text-muted">This section is not part of the Sales MVP yet.</p>
    </section>
  );
}
