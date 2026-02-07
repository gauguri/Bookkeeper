import { useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Sales", to: "/sales" },
  { label: "Expenses", to: "/expenses" },
  { label: "Banking", to: "/banking" },
  { label: "Chart of Accounts", to: "/accounts" },
  { label: "Reports", to: "/reports" },
  { label: "Import", to: "/import" }
];

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r border-slate-200 p-6">
        <div className="text-xl font-semibold mb-6">Bookkeeper</div>
        <nav className="flex flex-col gap-2 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

const SectionCard = ({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
    <div>
      <h1 className="text-2xl font-semibold mb-2">{title}</h1>
      <p className="text-slate-600">{description}</p>
    </div>
    {children}
  </div>
);

type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";
type ExpenseStatus = "Pending" | "Scheduled" | "Paid";
type BankStatus = "Unreconciled" | "Cleared";

type Invoice = {
  id: string;
  customer: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
};

type Expense = {
  id: string;
  vendor: string;
  category: string;
  amount: number;
  dueDate: string;
  status: ExpenseStatus;
};

type BankTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  status: BankStatus;
};

type Account = {
  id: string;
  name: string;
  type: "Asset" | "Liability" | "Income" | "Expense";
  balance: number;
};

const currency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([
    { id: "INV-1001", customer: "Juniper & Co", amount: 3200, dueDate: "2024-08-05", status: "Sent" },
    { id: "INV-1002", customer: "Moraine Labs", amount: 1850, dueDate: "2024-08-12", status: "Draft" },
    { id: "INV-1003", customer: "Starlight Design", amount: 4125, dueDate: "2024-07-28", status: "Overdue" }
  ]);
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: "BILL-210", vendor: "Northwind Hosting", category: "Software", amount: 240, dueDate: "2024-08-03", status: "Scheduled" },
    { id: "BILL-211", vendor: "Paperworks Co", category: "Office", amount: 560, dueDate: "2024-07-30", status: "Paid" },
    { id: "BILL-212", vendor: "Metro Utilities", category: "Utilities", amount: 910, dueDate: "2024-08-10", status: "Pending" }
  ]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([
    { id: "BNK-01", description: "Deposit - Starlight Design", amount: 4125, date: "2024-07-20", status: "Cleared" },
    { id: "BNK-02", description: "Payment - Metro Utilities", amount: -910, date: "2024-07-22", status: "Unreconciled" },
    { id: "BNK-03", description: "Payment - Paperworks Co", amount: -560, date: "2024-07-24", status: "Cleared" }
  ]);
  const [accounts, setAccounts] = useState<Account[]>([
    { id: "ACC-100", name: "Cash", type: "Asset", balance: 18450 },
    { id: "ACC-110", name: "Accounts Receivable", type: "Asset", balance: 9175 },
    { id: "ACC-200", name: "Accounts Payable", type: "Liability", balance: 1710 },
    { id: "ACC-400", name: "Service Revenue", type: "Income", balance: 28900 },
    { id: "ACC-500", name: "Operating Expenses", type: "Expense", balance: 6420 }
  ]);
  const [invoiceForm, setInvoiceForm] = useState({
    customer: "",
    amount: "",
    dueDate: "",
    status: "Draft" as InvoiceStatus
  });
  const [expenseForm, setExpenseForm] = useState({
    vendor: "",
    category: "",
    amount: "",
    dueDate: "",
    status: "Pending" as ExpenseStatus
  });
  const [transactionForm, setTransactionForm] = useState({
    description: "",
    amount: "",
    date: "",
    status: "Unreconciled" as BankStatus
  });
  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "Asset" as Account["type"],
    balance: ""
  });
  const [importStep, setImportStep] = useState(1);

  const cashBalance = useMemo(
    () => accounts.find((account) => account.name === "Cash")?.balance ?? 0,
    [accounts]
  );
  const accountsReceivable = useMemo(
    () => invoices.filter((invoice) => invoice.status !== "Paid").reduce((sum, invoice) => sum + invoice.amount, 0),
    [invoices]
  );
  const accountsPayable = useMemo(
    () => expenses.filter((expense) => expense.status !== "Paid").reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );
  const totalIncome = useMemo(
    () => invoices.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0),
    [invoices]
  );
  const totalExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "Paid").reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );
  const netIncome = totalIncome - totalExpenses;

  const addInvoice = () => {
    if (!invoiceForm.customer || !invoiceForm.amount || !invoiceForm.dueDate) {
      return;
    }
    setInvoices((prev) => [
      {
        id: `INV-${1000 + prev.length + 1}`,
        customer: invoiceForm.customer,
        amount: Number(invoiceForm.amount),
        dueDate: invoiceForm.dueDate,
        status: invoiceForm.status
      },
      ...prev
    ]);
    setInvoiceForm({ customer: "", amount: "", dueDate: "", status: "Draft" });
  };

  const addExpense = () => {
    if (!expenseForm.vendor || !expenseForm.amount || !expenseForm.dueDate) {
      return;
    }
    setExpenses((prev) => [
      {
        id: `BILL-${210 + prev.length + 1}`,
        vendor: expenseForm.vendor,
        category: expenseForm.category || "General",
        amount: Number(expenseForm.amount),
        dueDate: expenseForm.dueDate,
        status: expenseForm.status
      },
      ...prev
    ]);
    setExpenseForm({ vendor: "", category: "", amount: "", dueDate: "", status: "Pending" });
  };

  const addTransaction = () => {
    if (!transactionForm.description || !transactionForm.amount || !transactionForm.date) {
      return;
    }
    setTransactions((prev) => [
      {
        id: `BNK-${prev.length + 4}`.padStart(6, "0"),
        description: transactionForm.description,
        amount: Number(transactionForm.amount),
        date: transactionForm.date,
        status: transactionForm.status
      },
      ...prev
    ]);
    setTransactionForm({ description: "", amount: "", date: "", status: "Unreconciled" });
  };

  const addAccount = () => {
    if (!accountForm.name || !accountForm.balance) {
      return;
    }
    setAccounts((prev) => [
      ...prev,
      {
        id: `ACC-${100 + prev.length + 1}`,
        name: accountForm.name,
        type: accountForm.type,
        balance: Number(accountForm.balance)
      }
    ]);
    setAccountForm({ name: "", type: "Asset", balance: "" });
  };

  const markInvoicePaid = (id: string) => {
    setInvoices((prev) =>
      prev.map((invoice) => (invoice.id === id ? { ...invoice, status: "Paid" } : invoice))
    );
  };

  const markExpensePaid = (id: string) => {
    setExpenses((prev) =>
      prev.map((expense) => (expense.id === id ? { ...expense, status: "Paid" } : expense))
    );
  };

  const toggleTransactionStatus = (id: string) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              status: transaction.status === "Cleared" ? "Unreconciled" : "Cleared"
            }
          : transaction
      )
    );
  };

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <div className="grid gap-6">
              <SectionCard
                title="Dashboard"
                description="Snapshot of cash, AR/AP, and recent activity."
              >
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="text-sm text-slate-500">Cash</div>
                    <div className="text-2xl font-semibold">{currency(cashBalance)}</div>
                    <div className="text-xs text-slate-500 mt-2">Operating balance</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="text-sm text-slate-500">Accounts Receivable</div>
                    <div className="text-2xl font-semibold">{currency(accountsReceivable)}</div>
                    <div className="text-xs text-slate-500 mt-2">Outstanding invoices</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="text-sm text-slate-500">Accounts Payable</div>
                    <div className="text-2xl font-semibold">{currency(accountsPayable)}</div>
                    <div className="text-xs text-slate-500 mt-2">Unpaid bills</div>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">Recent Invoices</h2>
                      <span className="text-xs text-slate-500">Last 3</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {invoices.slice(0, 3).map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{invoice.customer}</div>
                            <div className="text-xs text-slate-500">
                              {invoice.id} · Due {invoice.dueDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{currency(invoice.amount)}</div>
                            <span className="text-xs text-slate-500">{invoice.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">Cash Activity</h2>
                      <span className="text-xs text-slate-500">Last 3</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {transactions.slice(0, 3).map((transaction) => (
                        <div key={transaction.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{transaction.description}</div>
                            <div className="text-xs text-slate-500">{transaction.date}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{currency(transaction.amount)}</div>
                            <span className="text-xs text-slate-500">{transaction.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          }
        />
        <Route
          path="/sales"
          element={
            <SectionCard title="Sales" description="Invoices, payments, and customer follow-up.">
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Open Invoices</h2>
                    <span className="text-xs text-slate-500">{invoices.length} total</span>
                  </div>
                  <div className="space-y-3">
                    {invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{invoice.customer}</div>
                            <div className="text-xs text-slate-500">
                              {invoice.id} · Due {invoice.dueDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{currency(invoice.amount)}</div>
                            <span className="text-xs text-slate-500">{invoice.status}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1 text-xs rounded bg-slate-900 text-white"
                            onClick={() => markInvoicePaid(invoice.id)}
                            disabled={invoice.status === "Paid"}
                          >
                            Mark paid
                          </button>
                          <span className="text-xs text-slate-500">Send reminder</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Create invoice</h2>
                    <p className="text-xs text-slate-500">Add a new invoice and track status.</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Customer</span>
                      <input
                        value={invoiceForm.customer}
                        onChange={(event) => setInvoiceForm({ ...invoiceForm, customer: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="Customer name"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Amount</span>
                      <input
                        value={invoiceForm.amount}
                        onChange={(event) => setInvoiceForm({ ...invoiceForm, amount: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="0.00"
                        type="number"
                        min="0"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Due date</span>
                      <input
                        value={invoiceForm.dueDate}
                        onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        type="date"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Status</span>
                      <select
                        value={invoiceForm.status}
                        onChange={(event) =>
                          setInvoiceForm({ ...invoiceForm, status: event.target.value as InvoiceStatus })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-2"
                      >
                        {["Draft", "Sent", "Paid", "Overdue"].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="w-full rounded bg-slate-900 text-white py-2 text-sm font-medium"
                      onClick={addInvoice}
                    >
                      Save invoice
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          }
        />
        <Route
          path="/expenses"
          element={
            <SectionCard title="Expenses" description="Track bills, vendors, and upcoming payments.">
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Bills & expenses</h2>
                    <span className="text-xs text-slate-500">{expenses.length} total</span>
                  </div>
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{expense.vendor}</div>
                            <div className="text-xs text-slate-500">
                              {expense.category} · Due {expense.dueDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{currency(expense.amount)}</div>
                            <span className="text-xs text-slate-500">{expense.status}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="self-start px-3 py-1 text-xs rounded bg-slate-900 text-white"
                          onClick={() => markExpensePaid(expense.id)}
                          disabled={expense.status === "Paid"}
                        >
                          Mark paid
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Add expense</h2>
                    <p className="text-xs text-slate-500">Schedule a bill payment.</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Vendor</span>
                      <input
                        value={expenseForm.vendor}
                        onChange={(event) => setExpenseForm({ ...expenseForm, vendor: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="Vendor name"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Category</span>
                      <input
                        value={expenseForm.category}
                        onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="Office, Utilities, etc."
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Amount</span>
                      <input
                        value={expenseForm.amount}
                        onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="0.00"
                        type="number"
                        min="0"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Due date</span>
                      <input
                        value={expenseForm.dueDate}
                        onChange={(event) => setExpenseForm({ ...expenseForm, dueDate: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        type="date"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Status</span>
                      <select
                        value={expenseForm.status}
                        onChange={(event) =>
                          setExpenseForm({ ...expenseForm, status: event.target.value as ExpenseStatus })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-2"
                      >
                        {["Pending", "Scheduled", "Paid"].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="w-full rounded bg-slate-900 text-white py-2 text-sm font-medium"
                      onClick={addExpense}
                    >
                      Save expense
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          }
        />
        <Route
          path="/banking"
          element={
            <SectionCard title="Banking" description="Monitor deposits, payments, and reconciliation.">
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Bank activity</h2>
                    <span className="text-xs text-slate-500">{transactions.length} transactions</span>
                  </div>
                  <div className="space-y-3">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div>
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-xs text-slate-500">{transaction.date}</div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="font-semibold">{currency(transaction.amount)}</div>
                          <button
                            type="button"
                            onClick={() => toggleTransactionStatus(transaction.id)}
                            className="text-xs px-2 py-1 rounded border border-slate-200"
                          >
                            {transaction.status}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Add transaction</h2>
                    <p className="text-xs text-slate-500">Record a new deposit or payment.</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Description</span>
                      <input
                        value={transactionForm.description}
                        onChange={(event) =>
                          setTransactionForm({ ...transactionForm, description: event.target.value })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="Deposit - Client"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Amount</span>
                      <input
                        value={transactionForm.amount}
                        onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        type="number"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Date</span>
                      <input
                        value={transactionForm.date}
                        onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        type="date"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Status</span>
                      <select
                        value={transactionForm.status}
                        onChange={(event) =>
                          setTransactionForm({ ...transactionForm, status: event.target.value as BankStatus })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-2"
                      >
                        {["Unreconciled", "Cleared"].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="w-full rounded bg-slate-900 text-white py-2 text-sm font-medium"
                      onClick={addTransaction}
                    >
                      Save transaction
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          }
        />
        <Route
          path="/accounts"
          element={
            <SectionCard title="Chart of Accounts" description="Manage ledger accounts and balances.">
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Account list</h2>
                    <span className="text-xs text-slate-500">{accounts.length} accounts</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                      >
                        <div>
                          <div className="font-medium">{account.name}</div>
                          <div className="text-xs text-slate-500">
                            {account.id} · {account.type}
                          </div>
                        </div>
                        <div className="font-semibold">{currency(account.balance)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Add account</h2>
                    <p className="text-xs text-slate-500">Create a new ledger account.</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Account name</span>
                      <input
                        value={accountForm.name}
                        onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        placeholder="Account name"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Type</span>
                      <select
                        value={accountForm.type}
                        onChange={(event) =>
                          setAccountForm({ ...accountForm, type: event.target.value as Account["type"] })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-2"
                      >
                        {["Asset", "Liability", "Income", "Expense"].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-500">Opening balance</span>
                      <input
                        value={accountForm.balance}
                        onChange={(event) => setAccountForm({ ...accountForm, balance: event.target.value })}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                        type="number"
                      />
                    </label>
                    <button
                      type="button"
                      className="w-full rounded bg-slate-900 text-white py-2 text-sm font-medium"
                      onClick={addAccount}
                    >
                      Save account
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          }
        />
        <Route
          path="/reports"
          element={
            <SectionCard title="Reports" description="Review performance and cash trends.">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Total Income</div>
                  <div className="text-2xl font-semibold">{currency(totalIncome)}</div>
                  <div className="text-xs text-slate-500 mt-2">Paid invoices</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Total Expenses</div>
                  <div className="text-2xl font-semibold">{currency(totalExpenses)}</div>
                  <div className="text-xs text-slate-500 mt-2">Paid bills</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Net Income</div>
                  <div className="text-2xl font-semibold">{currency(netIncome)}</div>
                  <div className="text-xs text-slate-500 mt-2">Income minus expenses</div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <h2 className="text-sm font-semibold">Top customers</h2>
                  <div className="space-y-2 text-sm">
                    {invoices.slice(0, 4).map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between">
                        <span>{invoice.customer}</span>
                        <span className="font-medium">{currency(invoice.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <h2 className="text-sm font-semibold">Expense breakdown</h2>
                  <div className="space-y-2 text-sm">
                    {expenses.slice(0, 4).map((expense) => (
                      <div key={expense.id} className="flex items-center justify-between">
                        <span>{expense.category}</span>
                        <span className="font-medium">{currency(expense.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          }
        />
        <Route
          path="/import"
          element={
            <SectionCard title="Import" description="Bring in data from other bookkeeping tools.">
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Import checklist</h2>
                    <p className="text-xs text-slate-500">Complete each step to finish the import.</p>
                  </div>
                  <ol className="space-y-3 text-sm">
                    {[
                      "Connect to source system",
                      "Map customers, vendors, and accounts",
                      "Review transactions",
                      "Finalize import"
                    ].map((step, index) => (
                      <li
                        key={step}
                        className={`flex items-start gap-3 rounded-lg border border-slate-200 p-3 ${
                          importStep === index + 1 ? "bg-slate-50" : ""
                        }`}
                      >
                        <span className="h-7 w-7 rounded-full border border-slate-200 flex items-center justify-center text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-medium">{step}</div>
                          <div className="text-xs text-slate-500">
                            {importStep > index + 1 ? "Completed" : "Pending"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 text-sm rounded border border-slate-200"
                      onClick={() => setImportStep((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 text-sm rounded bg-slate-900 text-white"
                      onClick={() => setImportStep((prev) => Math.min(4, prev + 1))}
                    >
                      Next step
                    </button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Upload data</h2>
                    <p className="text-xs text-slate-500">Drag files or select from your device.</p>
                  </div>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
                    Drop files here or browse to upload.
                  </div>
                  <div className="text-xs text-slate-500">
                    Supported files: CSV, XLSX, QuickBooks exports.
                  </div>
                  <button type="button" className="w-full rounded bg-slate-900 text-white py-2 text-sm font-medium">
                    Start import
                  </button>
                </div>
              </div>
            </SectionCard>
          }
        />
      </Routes>
    </Layout>
  );
}
