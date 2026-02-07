export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <h1 className="text-2xl font-semibold mb-2">{title}</h1>
      <p className="text-slate-600">This section is not part of the Sales MVP yet.</p>
    </section>
  );
}
