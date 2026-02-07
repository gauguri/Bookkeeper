import { Link } from "react-router-dom";

const cards = [
  { title: "Customers", description: "Manage customer profiles and contacts.", to: "/sales/customers" },
  { title: "Items", description: "Maintain your sales catalog.", to: "/sales/items" },
  { title: "Invoices", description: "Create and manage customer invoices.", to: "/sales/invoices" },
  { title: "Payments", description: "Apply customer payments to invoices.", to: "/sales/payments" },
  { title: "Reports", description: "Monitor revenue and receivables.", to: "/sales/reports" }
];

export default function SalesLanding() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Sales</h1>
        <p className="text-slate-600">Manage your customers, invoices, and cash collections.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm hover:border-slate-300 transition"
          >
            <h2 className="text-xl font-semibold mb-2">{card.title}</h2>
            <p className="text-slate-600">{card.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
