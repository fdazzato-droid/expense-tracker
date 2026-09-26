"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

type Currency = "USD" | "UYU";
type EntryType = "expense" | "income";
type ExpenseKind = "fixed" | "variable";

type Transaction = {
  id: string;
  date: string;
  type: EntryType;
  expenseKind?: ExpenseKind;
  category: string;
  amountOriginal: number;
  currency: Currency;
  fxRate: number;
  amountUSD: number;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
};

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Condo Fees",
  "Car Expenditures",
  "Health",
  "Accountant",
  "Retirement Insurance",
  "Groceries",
  "Dining Out",
  "Meetings with Friends",
  "Clothing",
  "Dog Expenditures",
  "Car Rental",
  "Tickets",
  "Hotel",
  "Subscriptions",
  "Taxes",
  "Transport / Fuel",
  "Personal Care",
  "Gifts / Donations",
  "Other",
];

const PAYMENT_METHODS = ["Card", "Cash", "Bank Transfer", "Other"];

const OWNER_EMAIL = "fdazzato@gmail.com";
const supabase = createClient(
  "https://ltxnpfnuifltxdfcaoni.supabase.co",
  "sb_publishable_KOk0kOjwf62LdX_DH6AMxg_QWJGL-3a"
);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function previousMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(todayISO().slice(0, 4));

  const [type, setType] = useState<EntryType>("expense");
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>("variable");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("Groceries");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("UYU");
  const [fxRate, setFxRate] = useState("40");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(user);
      if (user?.email?.toLowerCase() === OWNER_EMAIL) {
        await loadTransactions();
      }
      setAuthLoading(false);
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser?.email?.toLowerCase() === OWNER_EMAIL) {
        await loadTransactions();
      } else {
        setTransactions([]);
      }
      setAuthLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadTransactions() {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setTransactions((data ?? []).map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      expenseKind: row.expense_kind ?? undefined,
      category: row.category,
      amountOriginal: Number(row.amount_original),
      currency: row.currency,
      fxRate: Number(row.fx_rate),
      amountUSD: Number(row.amount_usd),
      paymentMethod: row.payment_method ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    })));
  }

  async function sendLoginLink() {
    setAuthMessage("Enviando enlace...");
    const { error } = await supabase.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });
    setAuthMessage(error ? error.message : "Te envié un enlace de acceso a tu email.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTransactions([]);
  }

  const current = useMemo(() => {
    return transactions.filter((t) =>
      view === "month" ? monthKey(t.date) === selectedMonth : t.date.startsWith(selectedYear)
    );
  }, [transactions, view, selectedMonth, selectedYear]);

  const previous = useMemo(() => {
    if (view === "month") {
      const prev = previousMonthKey(selectedMonth);
      return transactions.filter((t) => monthKey(t.date) === prev);
    }
    const prevYear = String(Number(selectedYear) - 1);
    return transactions.filter((t) => t.date.startsWith(prevYear));
  }, [transactions, view, selectedMonth, selectedYear]);

  const stats = useMemo(() => {
    const calc = (items: Transaction[]) => {
      const income = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amountUSD, 0);
      const expenses = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountUSD, 0);
      const savings = income - expenses;
      const savingsRate = income > 0 ? (savings / income) * 100 : 0;
      return { income, expenses, savings, savingsRate };
    };
    return { now: calc(current), prev: calc(previous) };
  }, [current, previous]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    current
      .filter((t) => t.type === "expense")
      .forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amountUSD));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [current]);

  const fixedVsVariable = useMemo(() => {
    const fixed = current
      .filter((t) => t.type === "expense" && t.expenseKind === "fixed")
      .reduce((s, t) => s + t.amountUSD, 0);
    const variable = current
      .filter((t) => t.type === "expense" && t.expenseKind !== "fixed")
      .reduce((s, t) => s + t.amountUSD, 0);
    return { fixed, variable };
  }, [current]);

  const monthlyTrend = useMemo(() => {
    const months = new Map<string, { expenses: number; income: number }>();
    transactions.forEach((t) => {
      const key = monthKey(t.date);
      const row = months.get(key) || { expenses: 0, income: 0 };
      if (t.type === "expense") row.expenses += t.amountUSD;
      else row.income += t.amountUSD;
      months.set(key, row);
    });
    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [transactions]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    const numericFx = Number(fxRate);

    if (!numericAmount || numericAmount <= 0) return;
    if (currency === "UYU" && (!numericFx || numericFx <= 0)) return;

    const amountUSD = currency === "USD" ? numericAmount : numericAmount / numericFx;

    if (!user || user.email?.toLowerCase() !== OWNER_EMAIL) return;

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      date,
      type,
      expense_kind: type === "expense" ? expenseKind : null,
      category: type === "income" ? "Income" : category,
      amount_original: numericAmount,
      currency,
      fx_rate: currency === "USD" ? 1 : numericFx,
      amount_usd: Number(amountUSD.toFixed(2)),
      payment_method: type === "expense" ? paymentMethod : null,
      notes: notes.trim() || null,
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAmount("");
    setNotes("");
    await loadTransactions();
  }

  async function removeTransaction(id: string) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    await loadTransactions();
  }

  const expenseChange = stats.prev.expenses > 0
    ? ((stats.now.expenses - stats.prev.expenses) / stats.prev.expenses) * 100
    : 0;

  const maxCategory = categoryBreakdown[0]?.[1] || 1;
  const maxTrend = Math.max(...monthlyTrend.flatMap(([, v]) => [v.expenses, v.income]), 1);

  if (authLoading) {
    return <main className="authShell"><div className="authCard"><h1>Money Lens</h1><p>Verificando acceso...</p></div></main>;
  }

  if (!user || user.email?.toLowerCase() !== OWNER_EMAIL) {
    return (
      <main className="authShell">
        <div className="authCard">
          <p className="eyebrow">PRIVATE ACCESS</p>
          <h1>Money Lens</h1>
          <p>Esta app está reservada para <strong>{OWNER_EMAIL}</strong>.</p>
          <button className="primary authButton" onClick={sendLoginLink}>Enviar enlace de acceso</button>
          {authMessage && <p className="authMessage">{authMessage}</p>}
          <p className="authHint">Abrí el email desde el dispositivo donde querés usar la app. No necesitás crear una contraseña.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Money Lens</div>
          <p className="muted">Personal finance dashboard</p>
        </div>
        <nav>
          <a href="#dashboard" className="navItem active">Dashboard</a>
          <a href="#add" className="navItem">Add movement</a>
          <a href="#history" className="navItem">History</a>
        </nav>
        <div className="sidebarFoot accountFoot">
          <span className="statusDot online" />
          <div><strong>{OWNER_EMAIL}</strong><button className="signOut" onClick={signOut}>Sign out</button></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR FINANCES</p>
            <h1>Dashboard</h1>
          </div>
          <div className="periodControls">
            <button className={view === "month" ? "seg active" : "seg"} onClick={() => setView("month")}>Monthly</button>
            <button className={view === "year" ? "seg active" : "seg"} onClick={() => setView("year")}>Annual</button>
            {view === "month" ? (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            ) : (
              <input type="number" min="2020" max="2100" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} />
            )}
          </div>
        </header>

        <section id="dashboard" className="metrics">
          <MetricCard label="Income" value={usd(stats.now.income)} sub="Total income in USD" />
          <MetricCard label="Expenses" value={usd(stats.now.expenses)} sub={stats.prev.expenses > 0 ? `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}% vs previous period` : "No previous period data"} />
          <MetricCard label="Savings" value={usd(stats.now.savings)} sub="Income minus expenses" />
          <MetricCard label="Savings rate" value={pct(stats.now.savingsRate)} sub="Share of income saved" />
        </section>

        <section className="gridTwo">
          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">SPENDING</p>
                <h2>Where your money goes</h2>
              </div>
              <strong>{usd(stats.now.expenses)}</strong>
            </div>
            {categoryBreakdown.length === 0 ? (
              <EmptyState text="Add your first expense to see the breakdown." />
            ) : (
              <div className="bars">
                {categoryBreakdown.slice(0, 8).map(([name, value]) => (
                  <div className="barRow" key={name}>
                    <div className="barLabel"><span>{name}</span><strong>{usd(value)}</strong></div>
                    <div className="barTrack"><div className="barFill" style={{ width: `${Math.max(4, (value / maxCategory) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <p className="eyebrow">STRUCTURE</p>
            <h2>Fixed vs variable</h2>
            <div className="splitNumbers">
              <div><span>Fixed</span><strong>{usd(fixedVsVariable.fixed)}</strong></div>
              <div><span>Variable</span><strong>{usd(fixedVsVariable.variable)}</strong></div>
            </div>
            <div className="stacked">
              <div style={{ width: `${stats.now.expenses ? (fixedVsVariable.fixed / stats.now.expenses) * 100 : 0}%` }} />
              <div style={{ width: `${stats.now.expenses ? (fixedVsVariable.variable / stats.now.expenses) * 100 : 0}%` }} />
            </div>
            <div className="insight">
              <span className="insightIcon">↗</span>
              <div>
                <strong>Focus point</strong>
                <p>{stats.now.income > 0
                  ? `You are saving ${pct(stats.now.savingsRate)} of your income in this period.`
                  : "Add monthly income to calculate your savings rate."}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel trendPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">TREND</p>
              <h2>Monthly income vs expenses</h2>
            </div>
          </div>
          {monthlyTrend.length === 0 ? <EmptyState text="Your trend will appear after you add movements." /> : (
            <div className="trendChart">
              {monthlyTrend.map(([month, values]) => (
                <div className="trendCol" key={month}>
                  <div className="trendBars">
                    <div className="trendIncome" title={`Income ${usd(values.income)}`} style={{ height: `${Math.max(2, (values.income / maxTrend) * 100)}%` }} />
                    <div className="trendExpense" title={`Expenses ${usd(values.expenses)}`} style={{ height: `${Math.max(2, (values.expenses / maxTrend) * 100)}%` }} />
                  </div>
                  <span>{month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="legend"><span><i className="dot income" />Income</span><span><i className="dot expense" />Expenses</span></div>
        </section>

        <section id="add" className="panel addPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">QUICK ENTRY</p>
              <h2>Add movement</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="formGrid">
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>

            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            {type === "expense" && (
              <>
                <label>
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label>
                  Expense type
                  <select value={expenseKind} onChange={(e) => setExpenseKind(e.target.value as ExpenseKind)}>
                    <option value="variable">Variable</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
              </>
            )}

            <label>
              Amount
              <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>

            <label>
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                <option value="UYU">UYU</option>
                <option value="USD">USD</option>
              </select>
            </label>

            {currency === "UYU" && (
              <label>
                UYU per USD
                <input inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} required />
              </label>
            )}

            {type === "expense" && (
              <label>
                Payment method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            )}

            <label className="wide">
              Notes
              <input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div className="wide submitRow">
              <div className="conversionPreview">
                {amount && currency === "UYU" && Number(fxRate) > 0
                  ? `≈ ${usd(Number(amount) / Number(fxRate))}`
                  : currency === "USD" && amount ? usd(Number(amount)) : ""}
              </div>
              <button className="primary" type="submit">Save movement</button>
            </div>
          </form>
        </section>

        <section id="history" className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Recent movements</h2>
            </div>
            <span className="muted">{transactions.length} total</span>
          </div>
          {transactions.length === 0 ? <EmptyState text="No movements yet." /> : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Category</th><th>Original</th><th>USD</th><th></th></tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 30).map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td><span className={`badge ${t.type}`}>{t.type}</span></td>
                      <td>{t.category}</td>
                      <td>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(t.amountOriginal)} {t.currency}</td>
                      <td><strong>{usd(t.amountUSD)}</strong></td>
                      <td><button className="ghost danger" onClick={() => removeTransaction(t.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="metricCard">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
