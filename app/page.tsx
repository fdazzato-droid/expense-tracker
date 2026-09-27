"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

type Currency = "USD" | "UYU";
type EntryType = "expense" | "income";
type RecurringTransaction = {
  id: string;
  userId: string;
  type: EntryType;
  category: string;
  description: string;
  amountOriginal: number;
  currency: Currency;
  fxRate: number;
  paymentMethod?: string;
  notes?: string;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
  active: boolean;
};

type Transaction = {
  id: string;
  date: string;
  type: EntryType;
  category: string;
  description: string;
  amountOriginal: number;
  currency: Currency;
  fxRate: number;
  amountUSD: number;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  recurringId?: string;
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
const PIE_COLORS = ["#146c5b", "#284653", "#77a99f", "#d8a64b", "#7d8fa3", "#b7795f", "#b9c5cb"];

function pieGradient(items: { value: number; color: string }[]) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return "#eef1f3";
  let cursor = 0;
  return `conic-gradient(${items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  }).join(", ")})`;
}

const OWNER_EMAIL = "fdazzato@gmail.com";

function isAllowedEmail(email?: string | null) {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}
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
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [email] = useState(OWNER_EMAIL);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(todayISO().slice(0, 4));
  const [spendingView, setSpendingView] = useState<"bars" | "pie">("pie");

  const [type, setType] = useState<EntryType>("expense");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("Groceries");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("UYU");
  const [fxRate, setFxRate] = useState("40");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [repeatDay, setRepeatDay] = useState("1");
  const [repeatEndDate, setRepeatEndDate] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
        setRecoveryMode(true);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(user);
      if (isAllowedEmail(user?.email)) {
        await loadTransactions();
      }
      setAuthLoading(false);
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (isAllowedEmail(nextUser?.email)) {
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
    await supabase.rpc("materialize_recurring_transactions");

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
      category: row.category,
      description: row.description ?? row.category,
      amountOriginal: Number(row.amount_original),
      currency: row.currency,
      fxRate: Number(row.fx_rate),
      amountUSD: Number(row.amount_usd),
      paymentMethod: row.payment_method ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      recurringId: row.recurring_id ?? undefined,
    })));

    const { data: recurringData, error: recurringError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (recurringError) {
      setAuthMessage(recurringError.message);
      return;
    }

    setRecurringTransactions((recurringData ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      category: row.category,
      description: row.description ?? row.category,
      amountOriginal: Number(row.amount_original),
      currency: row.currency,
      fxRate: Number(row.fx_rate),
      paymentMethod: row.payment_method ?? undefined,
      notes: row.notes ?? undefined,
      dayOfMonth: Number(row.day_of_month),
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      active: Boolean(row.active),
    })));
  }

  async function signInWithPassword(e?: FormEvent) {
    e?.preventDefault();
    setAuthMessage("Ingresando...");
    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedEmail(normalizedEmail)) {
      setAuthMessage("Este email no está habilitado para Money Lens.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      setAuthMessage("Contraseña incorrecta o todavía no configurada.");
      return;
    }
    setAuthMessage("");
    setPassword("");
  }

  async function sendPasswordSetupLink() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedEmail(normalizedEmail)) {
      setAuthMessage("Este email no está habilitado para Money Lens.");
      return;
    }
    setAuthMessage("Enviando email...");
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: window.location.origin,
    });
    setAuthMessage(
      error
        ? error.message
        : "Te envié un email para crear o restablecer tu contraseña."
    );
  }

  async function saveNewPassword(e?: FormEvent) {
    e?.preventDefault();
    if (newPassword.length < 8) {
      setAuthMessage("Usá una contraseña de al menos 8 caracteres.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setNewPassword("");
    setRecoveryMode(false);
    setAuthMessage("Contraseña guardada.");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
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

  const pieCategories = useMemo(() => {
    const top = categoryBreakdown.slice(0, 6);
    const remainder = categoryBreakdown.slice(6).reduce((sum, [, value]) => sum + value, 0);
    const items = remainder > 0 ? [...top, ["Other", remainder] as [string, number]] : top;
    return items.map(([name, value], index) => ({
      name,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [categoryBreakdown]);

  const savingsAllocation = useMemo(() => {
    if (stats.now.income <= 0) return [];
    const spent = Math.min(stats.now.expenses, stats.now.income);
    const saved = Math.max(stats.now.savings, 0);
    return [
      { name: "Spent", value: spent, color: "#284653" },
      { name: "Saved", value: saved, color: "#77a99f" },
    ].filter((item) => item.value > 0);
  }, [stats.now.income, stats.now.expenses, stats.now.savings]);

  const recurringVsOneOff = useMemo(() => {
    const recurring = current
      .filter((t) => t.type === "expense" && Boolean(t.recurringId))
      .reduce((s, t) => s + t.amountUSD, 0);
    const oneOff = current
      .filter((t) => t.type === "expense" && !t.recurringId)
      .reduce((s, t) => s + t.amountUSD, 0);
    return { recurring, oneOff };
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

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setType(t.type);
    setDate(t.date);
    setCategory(t.type === "income" ? "Groceries" : t.category);
    setDescription(t.description ?? "");
    setAmount(String(t.amountOriginal));
    setCurrency(t.currency);
    setFxRate(String(t.currency === "USD" ? 1 : t.fxRate));
    setPaymentMethod(t.paymentMethod ?? "Card");
    setNotes(t.notes ?? "");

    const recurring = t.recurringId
      ? recurringTransactions.find((r) => r.id === t.recurringId)
      : undefined;

    setEditingRecurringId(recurring?.id ?? null);
    setRepeatMonthly(Boolean(recurring));
    setRepeatDay(String(recurring?.dayOfMonth ?? Number(t.date.slice(8, 10))));
    setRepeatEndDate(recurring?.endDate ?? "");
    window.location.hash = "add";
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingRecurringId(null);
    setType("expense");
    setDate(todayISO());
    setCategory("Groceries");
    setDescription("");
    setAmount("");
    setCurrency("UYU");
    setFxRate("40");
    setPaymentMethod("Card");
    setNotes("");
    setRepeatMonthly(false);
    setRepeatDay("1");
    setRepeatEndDate("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    const numericFx = Number(fxRate);

    if (!description.trim()) {
      setAuthMessage("Agregá una descripción para identificar este movimiento.");
      return;
    }
    if (!numericAmount || numericAmount <= 0) return;
    if (currency === "UYU" && (!numericFx || numericFx <= 0)) return;

    const amountUSD = currency === "USD" ? numericAmount : numericAmount / numericFx;

    if (!user || !isAllowedEmail(user.email)) return;

    if (editingId) {
      let recurringId = editingRecurringId;

      if (repeatMonthly) {
        if (editingRecurringId) {
          const { error: recurringError } = await supabase
            .from("recurring_transactions")
            .update({
              type,
              expense_kind: null,
              category: type === "income" ? "Income" : category,
              description: description.trim(),
              amount_original: numericAmount,
              currency,
              fx_rate: currency === "USD" ? 1 : numericFx,
              payment_method: type === "expense" ? paymentMethod : null,
              notes: notes.trim() || null,
              day_of_month: Number(repeatDay),
              end_date: repeatEndDate || null,
              active: true,
            })
            .eq("id", editingRecurringId);

          if (recurringError) {
            setAuthMessage(recurringError.message);
            return;
          }
        } else {
          const { data: recurringRow, error: recurringError } = await supabase
            .from("recurring_transactions")
            .insert({
              user_id: user.id,
              type,
              expense_kind: null,
              category: type === "income" ? "Income" : category,
              description: description.trim(),
              amount_original: numericAmount,
              currency,
              fx_rate: currency === "USD" ? 1 : numericFx,
              payment_method: type === "expense" ? paymentMethod : null,
              notes: notes.trim() || null,
              day_of_month: Number(repeatDay),
              start_date: date,
              end_date: repeatEndDate || null,
              active: true,
            })
            .select("id")
            .single();

          if (recurringError) {
            setAuthMessage(recurringError.message);
            return;
          }
          recurringId = recurringRow.id;
        }
      } else if (editingRecurringId) {
        const { error: recurringError } = await supabase
          .from("recurring_transactions")
          .update({ active: false })
          .eq("id", editingRecurringId);

        if (recurringError) {
          setAuthMessage(recurringError.message);
          return;
        }
        recurringId = null;
      }

      const { error } = await supabase
        .from("transactions")
        .update({
          date,
          type,
          expense_kind: null,
          category: type === "income" ? "Income" : category,
          description: description.trim(),
          amount_original: numericAmount,
          currency,
          fx_rate: currency === "USD" ? 1 : numericFx,
          amount_usd: Number(amountUSD.toFixed(2)),
          payment_method: type === "expense" ? paymentMethod : null,
          notes: notes.trim() || null,
          recurring_id: recurringId,
        })
        .eq("id", editingId);

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      cancelEdit();
      await loadTransactions();
      return;
    }

    let recurringId: string | null = null;

    if (repeatMonthly) {
      const { data: recurringRow, error: recurringError } = await supabase
        .from("recurring_transactions")
        .insert({
          user_id: user.id,
          type,
          expense_kind: null,
          category: type === "income" ? "Income" : category,
          description: description.trim(),
          amount_original: numericAmount,
          currency,
          fx_rate: currency === "USD" ? 1 : numericFx,
          payment_method: type === "expense" ? paymentMethod : null,
          notes: notes.trim() || null,
          day_of_month: Number(repeatDay),
          start_date: date,
          end_date: repeatEndDate || null,
          active: true,
        })
        .select("id")
        .single();

      if (recurringError) {
        setAuthMessage(recurringError.message);
        return;
      }
      recurringId = recurringRow.id;
    }

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      date,
      type,
      expense_kind: null,
      category: type === "income" ? "Income" : category,
      description: description.trim(),
      amount_original: numericAmount,
      currency,
      fx_rate: currency === "USD" ? 1 : numericFx,
      amount_usd: Number(amountUSD.toFixed(2)),
      payment_method: type === "expense" ? paymentMethod : null,
      notes: notes.trim() || null,
      recurring_id: recurringId,
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAmount("");
    setDescription("");
    setNotes("");
    setRepeatMonthly(false);
    setRepeatDay("1");
    setRepeatEndDate("");
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

  async function toggleRecurring(id: string, active: boolean) {
    const { error } = await supabase
      .from("recurring_transactions")
      .update({ active })
      .eq("id", id);
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    await loadTransactions();
  }

  async function deleteRecurring(id: string) {
    const { error } = await supabase
      .from("recurring_transactions")
      .delete()
      .eq("id", id);
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

  if (recoveryMode && isAllowedEmail(user?.email)) {
    return (
      <main className="authShell">
        <form className="authCard" onSubmit={saveNewPassword}>
          <p className="eyebrow">PRIVATE ACCESS</p>
          <h1>Crear contraseña</h1>
          <p>Elegí una contraseña nueva para <strong>{user?.email}</strong>.</p>
          <input
            className="authInput"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="Nueva contraseña"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button className="primary authButton" type="submit">Guardar contraseña</button>
          {authMessage && <p className="authMessage">{authMessage}</p>}
        </form>
      </main>
    );
  }

  if (!user || !isAllowedEmail(user.email)) {
    return (
      <main className="authShell">
        <form className="authCard" onSubmit={signInWithPassword}>
          <p className="eyebrow">PRIVATE ACCESS</p>
          <h1>Money Lens</h1>
          <p>Acceso exclusivo para <strong>{OWNER_EMAIL}</strong>.</p>
          <input
            className="authInput"
            type="password"
            autoComplete="current-password"
            minLength={8}
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary authButton" type="submit">Entrar</button>
          <button className="secondaryAuthButton" type="button" onClick={sendPasswordSetupLink}>
            Restablecer contraseña
          </button>
          {authMessage && <p className="authMessage">{authMessage}</p>}
          <p className="authHint">Esta app está restringida a tu cuenta.</p>
        </form>
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
          <div><strong>{user?.email}</strong><button className="signOut" onClick={signOut}>Sign out</button></div>
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
          <div className="panel visualPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">SPENDING</p>
                <h2>Where your money goes</h2>
              </div>
              <div className="panelHeadActions">
                <strong>{usd(stats.now.expenses)}</strong>
                <div className="viewToggle">
                  <button className={spendingView === "pie" ? "miniSeg active" : "miniSeg"} onClick={() => setSpendingView("pie")}>Pie</button>
                  <button className={spendingView === "bars" ? "miniSeg active" : "miniSeg"} onClick={() => setSpendingView("bars")}>Bars</button>
                </div>
              </div>
            </div>
            {categoryBreakdown.length === 0 ? (
              <EmptyState text="Add your first expense to see the breakdown." />
            ) : spendingView === "pie" ? (
              <div className="pieLayout">
                <div className="donutWrap">
                  <div className="donut" style={{ background: pieGradient(pieCategories) }}>
                    <div className="donutCenter">
                      <span>Expenses</span>
                      <strong>{usd(stats.now.expenses)}</strong>
                    </div>
                  </div>
                </div>
                <div className="pieLegend">
                  {pieCategories.map((item) => (
                    <div className="pieLegendRow" key={item.name}>
                      <span className="legendSwatch" style={{ background: item.color }} />
                      <div>
                        <strong>{item.name}</strong>
                        <small>{stats.now.expenses > 0 ? pct((item.value / stats.now.expenses) * 100) : "0%"}</small>
                      </div>
                      <span>{usd(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
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
            <p className="eyebrow">SPENDING STRUCTURE</p>
            <h2>Recurring vs one-off</h2>
            <div className="splitNumbers">
              <div><span>Recurring</span><strong>{usd(recurringVsOneOff.recurring)}</strong></div>
              <div><span>One-off</span><strong>{usd(recurringVsOneOff.oneOff)}</strong></div>
            </div>
            <div className="stacked">
              <div style={{ width: `${stats.now.expenses ? (recurringVsOneOff.recurring / stats.now.expenses) * 100 : 0}%` }} />
              <div style={{ width: `${stats.now.expenses ? (recurringVsOneOff.oneOff / stats.now.expenses) * 100 : 0}%` }} />
            </div>
            <div className="insight">
              <span className="insightIcon">↗</span>
              <div>
                <strong>Recurring commitment</strong>
                <p>{stats.now.expenses > 0
                  ? `${pct((recurringVsOneOff.recurring / stats.now.expenses) * 100)} of this period's spending is recurring.`
                  : "Add expenses to see how much of your spending is recurring."}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="gridTwo insightGrid">
          <div className="panel visualPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">SAVINGS</p>
                <h2>Income allocation</h2>
              </div>
              <strong>{pct(stats.now.savingsRate)}</strong>
            </div>
            {stats.now.income <= 0 ? (
              <EmptyState text="Add income to visualize savings." />
            ) : (
              <div className="pieLayout compactPie">
                <div className="donutWrap">
                  <div className="donut savingsDonut" style={{ background: pieGradient(savingsAllocation) }}>
                    <div className="donutCenter">
                      <span>Saved</span>
                      <strong>{usd(Math.max(stats.now.savings, 0))}</strong>
                    </div>
                  </div>
                </div>
                <div className="savingsDetails">
                  <div className="summaryLine"><span>Income</span><strong>{usd(stats.now.income)}</strong></div>
                  <div className="summaryLine"><span>Expenses</span><strong>{usd(stats.now.expenses)}</strong></div>
                  <div className="summaryLine highlight"><span>Net savings</span><strong>{usd(stats.now.savings)}</strong></div>
                  {stats.now.savings < 0 && <p className="overspendNote">Expenses exceed income by {usd(Math.abs(stats.now.savings))}.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="panel visualPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">EXPENSE MIX</p>
                <h2>Recurring vs one-off</h2>
              </div>
            </div>
            {stats.now.expenses <= 0 ? (
              <EmptyState text="Add expenses to visualize the mix." />
            ) : (
              <div className="pieLayout compactPie">
                <div className="donutWrap">
                  <div className="donut smallDonut" style={{ background: pieGradient([
                    { value: recurringVsOneOff.recurring, color: "#284653" },
                    { value: recurringVsOneOff.oneOff, color: "#77a99f" },
                  ]) }}>
                    <div className="donutCenter">
                      <span>Total</span>
                      <strong>{usd(stats.now.expenses)}</strong>
                    </div>
                  </div>
                </div>
                <div className="savingsDetails">
                  <div className="summaryLine"><span>Recurring</span><strong>{usd(recurringVsOneOff.recurring)}</strong></div>
                  <div className="summaryLine"><span>One-off</span><strong>{usd(recurringVsOneOff.oneOff)}</strong></div>
                  <div className="summaryLine highlight"><span>Recurring share</span><strong>{pct(stats.now.expenses ? (recurringVsOneOff.recurring / stats.now.expenses) * 100 : 0)}</strong></div>
                </div>
              </div>
            )}
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
              <h2>{editingId ? "Edit movement" : "Add movement"}</h2>
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

            <label className="wide">
              Description
              <input
                placeholder={type === "expense" ? "e.g. Supermarket, car insurance..." : "e.g. September salary, freelance payment..."}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            {type === "expense" && (
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
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

            <label className="wide recurringToggle">
              <span>Recurring</span>
              <span className="checkLine">
                <input
                  type="checkbox"
                  checked={repeatMonthly}
                  onChange={(e) => setRepeatMonthly(e.target.checked)}
                />
                Recurring monthly expense
              </span>
            </label>

            {repeatMonthly && (
              <>
                <label>
                  Day of month
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={repeatDay}
                    onChange={(e) => setRepeatDay(e.target.value)}
                    required
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={repeatEndDate}
                    onChange={(e) => setRepeatEndDate(e.target.value)}
                  />
                  <small className="fieldHint">Leave empty if it has no end date.</small>
                </label>
              </>
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
              {editingId && <button className="ghost" type="button" onClick={cancelEdit}>Cancel</button>}
              <button className="primary" type="submit">{editingId ? "Save changes" : "Save movement"}</button>
            </div>
          </form>
        </section>

        <section className="panel recurringPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">AUTOMATION</p>
              <h2>Recurring expenses</h2>
            </div>
            <span className="muted">{recurringTransactions.length} configured</span>
          </div>

          {recurringTransactions.length === 0 ? (
            <EmptyState text="Mark an expense as recurring to automate it every month." />
          ) : (
            <div className="recurringList">
              {recurringTransactions.map((r) => (
                <div className="recurringItem" key={r.id}>
                  <div>
                    <strong>{r.description}</strong>
                    <span>{r.category} · {usd(r.currency === "USD" ? r.amountOriginal : r.amountOriginal / r.fxRate)} · day {r.dayOfMonth} each month</span>
                    <small>
                      Starts {r.startDate}
                      {r.endDate ? ` · ends ${r.endDate}` : " · no end date"}
                    </small>
                  </div>
                  <div className="recurringActions">
                    <button
                      className={r.active ? "ghost" : "primary"}
                      onClick={() => toggleRecurring(r.id, !r.active)}
                    >
                      {r.active ? "Pause" : "Activate"}
                    </button>
                    <button className="ghost danger" onClick={() => deleteRecurring(r.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel accountPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">ACCOUNT</p>
              <h2>Cambiar contraseña</h2>
            </div>
          </div>
          <form className="passwordChangeRow" onSubmit={saveNewPassword}>
            <input
              className="authInput"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button className="primary" type="submit">Cambiar contraseña</button>
          </form>
          {authMessage && <p className="authMessage">{authMessage}</p>}
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
                  <tr><th>Date</th><th>Type</th><th>Description</th><th>Original</th><th>USD</th><th></th></tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 30).map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td><span className={`badge ${t.type}`}>{t.type}</span></td>
                      <td>
                        <div className="movementDescription">
                          <strong>{t.description}</strong>
                          <small>{t.category}</small>
                        </div>
                      </td>
                      <td>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(t.amountOriginal)} {t.currency}</td>
                      <td><strong>{usd(t.amountUSD)}</strong></td>
                      <td>
                        <div className="rowActions">
                          <button className="ghost" onClick={() => startEdit(t)}>Edit</button>
                          <button className="ghost danger" onClick={() => removeTransaction(t.id)}>Delete</button>
                        </div>
                      </td>
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
