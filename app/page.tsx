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
  "Miscellaneous",
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

const ALLOWED_EMAILS = ["fdazzato@gmail.com", "mmazzatopaz@gmail.com"] as const;

function isAllowedEmail(email?: string | null) {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase() as (typeof ALLOWED_EMAILS)[number]);
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

function parseLocaleNumber(value: string) {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return NaN;

  // iPhone/Spanish keyboards commonly use a comma as decimal separator.
  if (raw.includes(",") && raw.includes(".")) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      return Number(raw.replace(/\./g, "").replace(",", "."));
    }
    return Number(raw.replace(/,/g, ""));
  }

  return Number(raw.replace(",", "."));
}

function inclusiveMonthCount(startDate: string, endDate: string) {
  const [sy, sm] = startDate.slice(0, 7).split("-").map(Number);
  const [ey, em] = endDate.slice(0, 7).split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("fdazzato@gmail.com");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(todayISO().slice(0, 4));
  const [spendingView, setSpendingView] = useState<"bars" | "pie">("pie");
  const [dashboardTab, setDashboardTab] = useState<"overview" | "commitments" | "details">("overview");
  const [dashboardCategories, setDashboardCategories] = useState<string[]>([]);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [dashboardCommitments, setDashboardCommitments] = useState<string[]>([]);
  const [commitmentFilterOpen, setCommitmentFilterOpen] = useState(false);

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
  const [editScope, setEditScope] = useState<"single" | "future">("single");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [repeatDay, setRepeatDay] = useState("1");
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [movementMessage, setMovementMessage] = useState("");
  const [automationOpen, setAutomationOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);

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
      setAuthMessage("Este email no está habilitado para Finance By Franco.");
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
      setAuthMessage("Este email no está habilitado para Finance By Franco.");
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

  function commitmentTypeForTransaction(t: Transaction) {
    if (t.type !== "expense") return "Income";
    if (!t.recurringId) return "One-off";
    const recurring = recurringTransactions.find((r) => r.id === t.recurringId);
    return recurring?.endDate ? "Installments" : "Recurring ongoing";
  }

  const periodCurrent = useMemo(() => {
    return transactions.filter((t) =>
      view === "month" ? monthKey(t.date) === selectedMonth : t.date.startsWith(selectedYear)
    );
  }, [transactions, view, selectedMonth, selectedYear]);

  const periodPrevious = useMemo(() => {
    if (view === "month") {
      const prev = previousMonthKey(selectedMonth);
      return transactions.filter((t) => monthKey(t.date) === prev);
    }
    const prevYear = String(Number(selectedYear) - 1);
    return transactions.filter((t) => t.date.startsWith(prevYear));
  }, [transactions, view, selectedMonth, selectedYear]);

  const current = useMemo(() => {
    return periodCurrent.filter((t) => {
      if (t.type === "income") return true;

      const categoryMatches =
        dashboardCategories.length === 0 || dashboardCategories.includes(t.category);

      const commitmentMatches =
        dashboardCommitments.length === 0 ||
        dashboardCommitments.includes(commitmentTypeForTransaction(t));

      return categoryMatches && commitmentMatches;
    });
  }, [periodCurrent, dashboardCategories, dashboardCommitments, recurringTransactions]);

  const previous = useMemo(() => {
    return periodPrevious.filter((t) => {
      if (t.type === "income") return true;

      const categoryMatches =
        dashboardCategories.length === 0 || dashboardCategories.includes(t.category);

      const commitmentMatches =
        dashboardCommitments.length === 0 ||
        dashboardCommitments.includes(commitmentTypeForTransaction(t));

      return categoryMatches && commitmentMatches;
    });
  }, [periodPrevious, dashboardCategories, dashboardCommitments, recurringTransactions]);

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
    periodCurrent
      .filter((t) =>
        t.type === "expense" &&
        (
          dashboardCommitments.length === 0 ||
          dashboardCommitments.includes(commitmentTypeForTransaction(t))
        )
      )
      .forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amountUSD));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodCurrent, dashboardCommitments, recurringTransactions]);

  const groupedExpenseSummary = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    periodCurrent
      .filter((t) => {
        if (t.type !== "expense") return false;

        const categoryMatches =
          dashboardCategories.length === 0 || dashboardCategories.includes(t.category);

        const commitmentMatches =
          dashboardCommitments.length === 0 ||
          dashboardCommitments.includes(commitmentTypeForTransaction(t));

        return categoryMatches && commitmentMatches;
      })
      .forEach((t) => {
        const items = groups.get(t.category) || [];
        items.push(t);
        groups.set(t.category, items);
      });

    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        total: items.reduce((sum, t) => sum + t.amountUSD, 0),
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [periodCurrent, dashboardCategories, dashboardCommitments, recurringTransactions]);

  const pieCategories = useMemo(() => {
    const top = categoryBreakdown.slice(0, 6);
    const remainder = categoryBreakdown.slice(6).reduce((sum, [, value]) => sum + value, 0);
    const items = remainder > 0 ? [...top, ["Other categories", remainder] as [string, number]] : top;
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

  const recurringById = useMemo(() => {
    return new Map(recurringTransactions.map((r) => [r.id, r]));
  }, [recurringTransactions]);

  const spendingCommitments = useMemo(() => {
    let oneOff = 0;
    let recurringOngoing = 0;
    let installments = 0;

    current
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        if (!t.recurringId) {
          oneOff += t.amountUSD;
          return;
        }

        const recurring = recurringById.get(t.recurringId);
        if (recurring?.endDate) installments += t.amountUSD;
        else recurringOngoing += t.amountUSD;
      });

    return { oneOff, recurringOngoing, installments };
  }, [current, recurringById]);

  const commitmentDetails = useMemo(() => {
    const types = ["One-off", "Recurring ongoing", "Installments"] as const;

    return types.map((name) => {
      const items = periodCurrent
        .filter((t) => {
          if (t.type !== "expense") return false;

          const categoryMatches =
            dashboardCategories.length === 0 || dashboardCategories.includes(t.category);

          return categoryMatches && commitmentTypeForTransaction(t) === name;
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      return {
        name,
        total: items.reduce((sum, t) => sum + t.amountUSD, 0),
        items,
      };
    });
  }, [periodCurrent, dashboardCategories, recurringTransactions]);

  const installmentSummary = useMemo(() => {
    const today = todayISO();

    return recurringTransactions
      .filter((r) =>
        r.type === "expense" &&
        Boolean(r.endDate) &&
        (dashboardCategories.length === 0 || dashboardCategories.includes(r.category)) &&
        (dashboardCommitments.length === 0 || dashboardCommitments.includes("Installments"))
      )
      .map((r) => {
        const endDate = r.endDate!;
        const totalInstallments = inclusiveMonthCount(r.startDate, endDate);
        const paidMonths = new Set(
          transactions
            .filter((t) =>
              t.type === "expense" &&
              t.recurringId === r.id &&
              t.date <= today &&
              t.date <= endDate
            )
            .map((t) => monthKey(t.date))
        );
        const paidInstallments = Math.min(totalInstallments, paidMonths.size);
        const remainingInstallments = Math.max(totalInstallments - paidInstallments, 0);
        const monthlyUSD = r.currency === "USD" ? r.amountOriginal : r.amountOriginal / r.fxRate;

        return {
          ...r,
          totalInstallments,
          paidInstallments,
          remainingInstallments,
          monthlyUSD,
          remainingUSD: remainingInstallments * monthlyUSD,
        };
      })
      .sort((a, b) => a.endDate!.localeCompare(b.endDate!));
  }, [recurringTransactions, transactions, dashboardCategories, dashboardCommitments]);

  const totalInstallmentBalance = useMemo(
    () => installmentSummary.reduce((sum, item) => sum + item.remainingUSD, 0),
    [installmentSummary]
  );

  const monthlyTrend = useMemo(() => {
    const months = new Map<string, { expenses: number; income: number }>();
    transactions.forEach((t) => {
      const key = monthKey(t.date);
      const row = months.get(key) || { expenses: 0, income: 0 };
      if (t.type === "expense") {
        const categoryMatches =
          dashboardCategories.length === 0 || dashboardCategories.includes(t.category);
        const commitmentMatches =
          dashboardCommitments.length === 0 ||
          dashboardCommitments.includes(commitmentTypeForTransaction(t));

        if (categoryMatches && commitmentMatches) {
          row.expenses += t.amountUSD;
        }
      } else {
        row.income += t.amountUSD;
      }
      months.set(key, row);
    });
    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [transactions, dashboardCategories, dashboardCommitments, recurringTransactions]);

  function toggleDashboardCategory(name: string) {
    setDashboardCategories((current) =>
      current.includes(name)
        ? current.filter((c) => c !== name)
        : [...current, name]
    );
  }

  function clearDashboardCategories() {
    setDashboardCategories([]);
  }

  function selectAllDashboardCategories() {
    setDashboardCategories([...EXPENSE_CATEGORIES]);
  }

  function focusCommitment(name: string) {
    setDashboardCommitments((current) =>
      current.length === 1 && current[0] === name ? [] : [name]
    );
    setDashboardTab("commitments");
  }

  function clearAllDashboardFilters() {
    setDashboardCategories([]);
    setDashboardCommitments([]);
  }

  function toggleDashboardCommitment(name: string) {
    setDashboardCommitments((current) =>
      current.includes(name)
        ? current.filter((c) => c !== name)
        : [...current, name]
    );
  }

  function clearDashboardCommitments() {
    setDashboardCommitments([]);
  }

  function selectAllDashboardCommitments() {
    setDashboardCommitments(["One-off", "Recurring ongoing", "Installments"]);
  }

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
    setEditScope("single");
    setRepeatMonthly(Boolean(recurring));
    setRepeatDay(String(recurring?.dayOfMonth ?? Number(t.date.slice(8, 10))));
    setRepeatEndDate(recurring?.endDate ?? "");
    window.location.hash = "add";
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingRecurringId(null);
    setEditScope("single");
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
    setMovementMessage("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numericAmount = parseLocaleNumber(amount);
    const numericFx = parseLocaleNumber(fxRate);

    setMovementMessage("");

    if (!description.trim()) {
      setMovementMessage("Agregá una descripción para identificar este movimiento.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMovementMessage("Ingresá un monto válido. Podés usar coma o punto para los decimales.");
      return;
    }
    if (currency === "UYU" && (!Number.isFinite(numericFx) || numericFx <= 0)) {
      setMovementMessage("La cotización UYU/USD no es válida.");
      return;
    }

    const amountUSD = currency === "USD" ? numericAmount : numericAmount / numericFx;

    if (!user || !isAllowedEmail(user.email)) {
      setMovementMessage("Tu sesión no está disponible. Volvé a iniciar sesión.");
      return;
    }

    setSavingMovement(true);

    if (editingId) {
      let recurringId = editingRecurringId;

      // Existing recurring expense: choose whether changes affect only this occurrence
      // or the recurring rule used for future months.
      if (editingRecurringId) {
        if (editScope === "future") {
          if (repeatMonthly) {
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
              setMovementMessage(recurringError.message);
              setSavingMovement(false);
              return;
            }
          } else {
            const { error: recurringError } = await supabase
              .from("recurring_transactions")
              .update({ active: false })
              .eq("id", editingRecurringId);

            if (recurringError) {
              setMovementMessage(recurringError.message);
              setSavingMovement(false);
              return;
            }
            recurringId = null;
          }
        }
        // editScope === "single": leave the recurring rule untouched.
      } else if (repeatMonthly) {
        // A previously one-off movement is being converted into a recurring one.
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
          setMovementMessage(recurringError.message);
              setSavingMovement(false);
          return;
        }
        recurringId = recurringRow.id;
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
        setMovementMessage(error.message);
        setSavingMovement(false);
        return;
      }

      cancelEdit();
      await loadTransactions();
      setMovementMessage("Cambios guardados.");
      setSavingMovement(false);
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
        setMovementMessage(recurringError.message);
              setSavingMovement(false);
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
      setMovementMessage(error.message);
        setSavingMovement(false);
      return;
    }

    setAmount("");
    setDescription("");
    setNotes("");
    setRepeatMonthly(false);
    setRepeatDay("1");
    setRepeatEndDate("");
    await loadTransactions();
    setMovementMessage("Movimiento guardado correctamente.");
    setSavingMovement(false);
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
    return <main className="authShell"><div className="authCard"><FinanceByFrancoLogo /><p>Verificando acceso...</p></div></main>;
  }

  if (recoveryMode && isAllowedEmail(user?.email)) {
    return (
      <main className="authShell">
        <form className="authCard" onSubmit={saveNewPassword}>
          <FinanceByFrancoLogo />
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
          <FinanceByFrancoLogo />
          <p className="eyebrow">PRIVATE ACCESS</p>
          <p>Acceso privado e independiente por usuario.</p>
          <input
            className="authInput"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
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
          <p className="authHint">Cada usuario ve únicamente sus propios movimientos.</p>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <FinanceByFrancoLogo compact />
        </div>
        <nav>
          <button className={dashboardTab === "overview" ? "navItem navButton active" : "navItem navButton"} onClick={() => setDashboardTab("overview")}>Overview</button>
          <button className={dashboardTab === "commitments" ? "navItem navButton active" : "navItem navButton"} onClick={() => setDashboardTab("commitments")}>Commitments</button>
          <button className={dashboardTab === "details" ? "navItem navButton active" : "navItem navButton"} onClick={() => setDashboardTab("details")}>Details</button>
          <a href="#add" className="navItem">Add movement</a>
        </nav>
        <div className="sidebarFoot accountFoot">
          <span className="statusDot online" />
          <div><strong>{user?.email}</strong><button className="signOut" onClick={signOut}>Sign out</button></div>
        </div>
      </aside>

      <section className="content">
        <div className="reportHeader">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR FINANCES</p>
            <h1>Dashboard</h1>
            {(dashboardCategories.length > 0 || dashboardCommitments.length > 0) && (
              <p className="filterContext">
                Filtered by {
                  [
                    ...dashboardCategories,
                    ...dashboardCommitments,
                  ].join(", ")
                }
              </p>
            )}
          </div>
          <div className="periodControls">
            <div className="multiFilter">
              <button
                type="button"
                className="dashboardFilter multiFilterButton"
                onClick={() => setCategoryFilterOpen((open) => !open)}
              >
                {dashboardCategories.length === 0
                  ? "All categories"
                  : dashboardCategories.length === 1
                    ? dashboardCategories[0]
                    : `${dashboardCategories.length} categories selected`}
                <span>▾</span>
              </button>
              {categoryFilterOpen && (
                <div className="multiFilterMenu">
                  <div className="multiFilterActions">
                    <button type="button" onClick={clearDashboardCategories}>All categories</button>
                    <button type="button" onClick={selectAllDashboardCategories}>Select all</button>
                  </div>
                  <div className="multiFilterOptions">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <label key={c} className="multiFilterOption">
                        <input
                          type="checkbox"
                          checked={dashboardCategories.includes(c)}
                          onChange={() => toggleDashboardCategory(c)}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="multiFilter">
              <button
                type="button"
                className="dashboardFilter multiFilterButton"
                onClick={() => setCommitmentFilterOpen((open) => !open)}
              >
                {dashboardCommitments.length === 0
                  ? "All commitment types"
                  : dashboardCommitments.length === 1
                    ? dashboardCommitments[0]
                    : `${dashboardCommitments.length} commitment types`}
                <span>▾</span>
              </button>
              {commitmentFilterOpen && (
                <div className="multiFilterMenu">
                  <div className="multiFilterActions">
                    <button type="button" onClick={clearDashboardCommitments}>All types</button>
                    <button type="button" onClick={selectAllDashboardCommitments}>Select all</button>
                  </div>
                  <div className="multiFilterOptions">
                    {["One-off", "Recurring ongoing", "Installments"].map((c) => (
                      <label key={c} className="multiFilterOption">
                        <input
                          type="checkbox"
                          checked={dashboardCommitments.includes(c)}
                          onChange={() => toggleDashboardCommitment(c)}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button className={view === "month" ? "seg active" : "seg"} onClick={() => setView("month")}>Monthly</button>
            <button className={view === "year" ? "seg active" : "seg"} onClick={() => setView("year")}>Annual</button>
            {view === "month" ? (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            ) : (
              <input type="number" min="2020" max="2100" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} />
            )}
          </div>
        </header>

        <div className="dashboardTabs" role="tablist" aria-label="Dashboard views">
          <button
            type="button"
            className={dashboardTab === "overview" ? "dashboardTab active" : "dashboardTab"}
            onClick={() => setDashboardTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={dashboardTab === "commitments" ? "dashboardTab active" : "dashboardTab"}
            onClick={() => setDashboardTab("commitments")}
          >
            Commitments
          </button>
          <button
            type="button"
            className={dashboardTab === "details" ? "dashboardTab active" : "dashboardTab"}
            onClick={() => setDashboardTab("details")}
          >
            Details
          </button>
          {(dashboardCategories.length > 0 || dashboardCommitments.length > 0) && (
            <button type="button" className="clearFiltersButton" onClick={clearAllDashboardFilters}>
              Clear filters
            </button>
          )}
        </div>
        </div>

        <section id="dashboard" className="metrics">
          <MetricCard label="Income" value={usd(stats.now.income)} sub="Total income in USD" />
          <MetricCard label="Expenses" value={usd(stats.now.expenses)} sub={stats.prev.expenses > 0 ? `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}% vs previous period` : "No previous period data"} />
          <MetricCard label="Savings" value={usd(stats.now.savings)} sub="Income minus expenses" />
          <MetricCard label="Savings rate" value={pct(stats.now.savingsRate)} sub="Share of income saved" />
        </section>

        <section className={dashboardTab === "overview" ? "gridTwo biView" : "biHidden"}>
          <div className="panel visualPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">SPENDING</p>
                <h2>Where your money goes</h2>
              </div>
              <div className="panelHeadActions">
                <strong>{usd(
                  dashboardCategories.length === 0
                    ? categoryBreakdown.reduce((sum, [, value]) => sum + value, 0)
                    : stats.now.expenses
                )}</strong>
                <div className="viewToggle">
                  <button className={spendingView === "pie" ? "miniSeg active" : "miniSeg"} onClick={() => setSpendingView("pie")}>Pie</button>
                  <button className={spendingView === "bars" ? "miniSeg active" : "miniSeg"} onClick={() => setSpendingView("bars")}>Bars</button>
                </div>
              </div>
            </div>
            {(dashboardCategories.length === 0
              ? categoryBreakdown
              : categoryBreakdown.filter(([name]) => dashboardCategories.includes(name))
            ).length === 0 ? (
              <EmptyState text="Add your first expense to see the breakdown." />
            ) : spendingView === "pie" ? (
              <div className="pieLayout">
                <div className="donutWrap">
                  <div className="donut" style={{ background: pieGradient(
                    dashboardCategories.length === 0
                      ? pieCategories
                      : categoryBreakdown
                          .filter(([name]) => dashboardCategories.includes(name))
                          .map(([name, value], index) => ({
                            name,
                            value,
                            color: PIE_COLORS[index % PIE_COLORS.length],
                          }))
                  ) }}>
                    <div className="donutCenter">
                      <span>Expenses</span>
                      <strong>{usd(
                        dashboardCategories.length === 0
                          ? categoryBreakdown.reduce((sum, [, value]) => sum + value, 0)
                          : stats.now.expenses
                      )}</strong>
                    </div>
                  </div>
                </div>
                <div className="pieLegend">
                  {(dashboardCategories.length === 0
                    ? pieCategories
                    : categoryBreakdown
                        .filter(([name]) => dashboardCategories.includes(name))
                        .map(([name, value], index) => ({
                          name,
                          value,
                          color: PIE_COLORS[index % PIE_COLORS.length],
                        }))
                  ).map((item) => (
                    <button
                      type="button"
                      className="pieLegendRow pieLegendButton"
                      key={item.name}
                      onClick={() => {
                        if (EXPENSE_CATEGORIES.includes(item.name)) {
                          setDashboardCategories([item.name]);
                          setDashboardTab("details");
                        }
                      }}
                    >
                      <span className="legendSwatch" style={{ background: item.color }} />
                      <div>
                        <strong>{item.name}</strong>
                        <small>{
                          pct((item.value / Math.max(
                            dashboardCategories.length === 0
                              ? categoryBreakdown.reduce((sum, [, value]) => sum + value, 0)
                              : stats.now.expenses,
                            1
                          )) * 100)
                        }</small>
                      </div>
                      <span>{usd(item.value)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bars">
                {(dashboardCategories.length === 0
                  ? categoryBreakdown
                  : categoryBreakdown.filter(([name]) => dashboardCategories.includes(name))
                ).slice(0, 8).map(([name, value]) => (
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
            <h2>Spending commitments</h2>
            <div className="commitmentNumbers">
              <div><span>One-off</span><strong>{usd(spendingCommitments.oneOff)}</strong></div>
              <div><span>Recurring ongoing</span><strong>{usd(spendingCommitments.recurringOngoing)}</strong></div>
              <div><span>Installments</span><strong>{usd(spendingCommitments.installments)}</strong></div>
            </div>
            <div className="stacked commitmentStack">
              <div style={{ width: `${stats.now.expenses ? (spendingCommitments.recurringOngoing / stats.now.expenses) * 100 : 0}%` }} />
              <div style={{ width: `${stats.now.expenses ? (spendingCommitments.installments / stats.now.expenses) * 100 : 0}%` }} />
              <div style={{ width: `${stats.now.expenses ? (spendingCommitments.oneOff / stats.now.expenses) * 100 : 0}%` }} />
            </div>
            <div className="insight">
              <span className="insightIcon">↗</span>
              <div>
                <strong>Installment balance</strong>
                <p>{installmentSummary.length > 0
                  ? `${usd(totalInstallmentBalance)} remains across ${installmentSummary.length} active or historical installment plan${installmentSummary.length === 1 ? "" : "s"}.`
                  : "No installment plans with an end date are configured."}</p>
              </div>
            </div>
          </div>
        </section>

        <section className={dashboardTab === "overview" ? "gridTwo insightGrid biView" : "biHidden"}>
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
                <h2>Commitment mix</h2>
              </div>
            </div>
            {stats.now.expenses <= 0 ? (
              <EmptyState text="Add expenses to visualize the mix." />
            ) : (
              <div className="pieLayout compactPie">
                <div className="donutWrap">
                  <div className="donut smallDonut" style={{ background: pieGradient([
                    { value: spendingCommitments.recurringOngoing, color: "#284653" },
                    { value: spendingCommitments.installments, color: "#d8a64b" },
                    { value: spendingCommitments.oneOff, color: "#77a99f" },
                  ]) }}>
                    <div className="donutCenter">
                      <span>Total</span>
                      <strong>{usd(stats.now.expenses)}</strong>
                    </div>
                  </div>
                </div>
                <div className="savingsDetails">
                  <div className="summaryLine"><span>Recurring ongoing</span><strong>{usd(spendingCommitments.recurringOngoing)}</strong></div>
                  <div className="summaryLine"><span>Installments</span><strong>{usd(spendingCommitments.installments)}</strong></div>
                  <div className="summaryLine"><span>One-off</span><strong>{usd(spendingCommitments.oneOff)}</strong></div>
                  <div className="summaryLine highlight"><span>Future installment balance</span><strong>{usd(totalInstallmentBalance)}</strong></div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={dashboardTab === "commitments" ? "panel commitmentDetailsPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">COMMITMENT DETAILS</p>
              <h2>What makes up each commitment type</h2>
            </div>
            <span className="muted">
              {dashboardCommitments.length === 0
                ? "All types"
                : dashboardCommitments.join(", ")}
            </span>
          </div>

          <div className="commitmentQuickCards">
            {commitmentDetails.map((group) => {
              const active =
                dashboardCommitments.length === 0 ||
                dashboardCommitments.includes(group.name);

              return (
                <button
                  type="button"
                  key={group.name}
                  className={active ? "commitmentQuickCard active" : "commitmentQuickCard"}
                  onClick={() => focusCommitment(group.name)}
                >
                  <span>{group.name}</span>
                  <strong>{usd(group.total)}</strong>
                  <small>{group.items.length} {group.items.length === 1 ? "expense" : "expenses"}</small>
                </button>
              );
            })}
          </div>

          <div className="commitmentDetailGroups">
            {commitmentDetails
              .filter((group) =>
                dashboardCommitments.length === 0 ||
                dashboardCommitments.includes(group.name)
              )
              .map((group) => (
                <details className="commitmentDetailGroup" key={group.name} open>
                  <summary>
                    <div>
                      <strong>{group.name}</strong>
                      <span>{group.items.length} {group.items.length === 1 ? "movement" : "movements"}</span>
                    </div>
                    <strong>{usd(group.total)}</strong>
                  </summary>

                  {group.items.length === 0 ? (
                    <div className="commitmentEmpty">No expenses of this type in the selected period.</div>
                  ) : (
                    <div className="commitmentMovementList">
                      {group.items.map((t) => (
                        <div className="commitmentMovementRow" key={t.id}>
                          <div>
                            <strong>{t.description}</strong>
                            <small>{t.category} · {t.date}</small>
                          </div>
                          <span>{usd(t.amountUSD)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              ))}
          </div>
        </section>

        <section className={dashboardTab === "commitments" ? "panel installmentPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">INSTALLMENTS</p>
              <h2>Installment plans</h2>
            </div>
            <strong>{usd(totalInstallmentBalance)} remaining</strong>
          </div>

          {installmentSummary.length === 0 ? (
            <EmptyState text="Recurring expenses with an end date will appear here as installments." />
          ) : (
            <div className="installmentList">
              {installmentSummary.map((item) => {
                const progress = item.totalInstallments > 0
                  ? (item.paidInstallments / item.totalInstallments) * 100
                  : 0;

                return (
                  <div className="installmentItem" key={item.id}>
                    <div className="installmentHead">
                      <div>
                        <strong>{item.description}</strong>
                        <span>{item.category} · {usd(item.monthlyUSD)}/month</span>
                      </div>
                      <strong>{item.paidInstallments}/{item.totalInstallments}</strong>
                    </div>
                    <div className="installmentProgress">
                      <div style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <div className="installmentMeta">
                      <span>{item.remainingInstallments} installments remaining</span>
                      <strong>{usd(item.remainingUSD)} remaining</strong>
                      <span>Ends {item.endDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={dashboardTab === "details" ? "panel categorySummaryPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">GROUP SUMMARY</p>
              <h2>Expenses by group</h2>
            </div>
            <span className="muted">
              {dashboardCategories.length === 0
                ? "All groups"
                : `${dashboardCategories.length} selected`}
            </span>
          </div>

          {groupedExpenseSummary.length === 0 ? (
            <EmptyState text="No expenses in this period." />
          ) : (
            <div className="groupSummaryList">
              {groupedExpenseSummary.map((group) => (
                  <details className="groupSummaryItem" key={group.name} open={dashboardCategories.length > 0}>
                    <summary>
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.items.length} {group.items.length === 1 ? "expense" : "expenses"}</span>
                      </div>
                      <strong>{usd(group.total)}</strong>
                    </summary>
                    <div className="groupExpenseRows">
                      {group.items.map((t) => (
                        <div className="groupExpenseRow" key={t.id}>
                          <div>
                            <strong>{t.description}</strong>
                            <small>
                              {t.date}
                              {" · " + commitmentTypeForTransaction(t)}
                            </small>
                          </div>
                          <span>{usd(t.amountUSD)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
          )}
        </section>

        <section className={dashboardTab === "details" ? "panel biDetailPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">TRANSACTION DETAIL</p>
              <h2>Expense detail</h2>
            </div>
            <span className="muted">{current.filter((t) => t.type === "expense").length} visible</span>
          </div>

          {current.filter((t) => t.type === "expense").length === 0 ? (
            <EmptyState text="No expenses match the current filters." />
          ) : (
            <div className="tableWrap biTableWrap">
              <table className="biTable">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Group</th>
                    <th>Commitment</th>
                    <th>Date</th>
                    <th>USD</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {current
                    .filter((t) => t.type === "expense")
                    .map((t) => (
                      <tr key={t.id}>
                        <td><strong>{t.description}</strong></td>
                        <td>{t.category}</td>
                        <td><span className="commitmentBadge">{commitmentTypeForTransaction(t)}</span></td>
                        <td>{t.date}</td>
                        <td><strong>{usd(t.amountUSD)}</strong></td>
                        <td><button className="ghost" onClick={() => startEdit(t)}>Edit</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={dashboardTab === "overview" ? "panel trendPanel biView" : "biHidden"}>
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
              <input inputMode="decimal" enterKeyHint="next" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
                <input inputMode="decimal" enterKeyHint="done" value={fxRate} onChange={(e) => setFxRate(e.target.value)} required />
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

            {editingId && editingRecurringId && (
              <div className="wide editScopeBox">
                <span className="editScopeTitle">Apply changes to</span>
                <label className={editScope === "single" ? "scopeOption active" : "scopeOption"}>
                  <input
                    type="radio"
                    name="editScope"
                    value="single"
                    checked={editScope === "single"}
                    onChange={() => setEditScope("single")}
                  />
                  <span>
                    <strong>Only this movement</strong>
                    <small>Changes this month only. Future months keep the current recurring amount and details.</small>
                  </span>
                </label>
                <label className={editScope === "future" ? "scopeOption active" : "scopeOption"}>
                  <input
                    type="radio"
                    name="editScope"
                    value="future"
                    checked={editScope === "future"}
                    onChange={() => setEditScope("future")}
                  />
                  <span>
                    <strong>This and future months</strong>
                    <small>Changes this movement and updates the recurring rule from now on. Past months stay unchanged.</small>
                  </span>
                </label>
              </div>
            )}

            <label className="wide recurringToggle">
              <span>Recurring</span>
              <span className="checkLine">
                <input
                  type="checkbox"
                  checked={repeatMonthly}
                  disabled={Boolean(editingRecurringId && editScope === "single")}
                  onChange={(e) => setRepeatMonthly(e.target.checked)}
                />
                Recurring monthly expense
              </span>
              {editingRecurringId && editScope === "single" && (
                <small className="fieldHint">The recurring rule will not change when editing only this movement.</small>
              )}
            </label>

            {repeatMonthly && (!editingRecurringId || editScope === "future") && (
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
                  <small className="fieldHint">With an end date, this is treated as an installment plan. Leave empty for an ongoing recurring expense.</small>
                </label>
              </>
            )}

            <label className="wide">
              Notes
              <input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div className="wide submitRow">
              <div className="conversionPreview">
                {amount && currency === "UYU" && parseLocaleNumber(fxRate) > 0 && parseLocaleNumber(amount) > 0
                  ? `≈ ${usd(parseLocaleNumber(amount) / parseLocaleNumber(fxRate))}`
                  : currency === "USD" && amount && parseLocaleNumber(amount) > 0
                    ? usd(parseLocaleNumber(amount))
                    : ""}
              </div>
              {movementMessage && (
                <span className={movementMessage.toLowerCase().includes("guardad") ? "movementStatus success" : "movementStatus"}>
                  {movementMessage}
                </span>
              )}
              {editingId && <button className="ghost" type="button" onClick={cancelEdit} disabled={savingMovement}>Cancel</button>}
              <button className="primary" type="submit" disabled={savingMovement}>
                {savingMovement ? "Guardando…" : editingId ? "Save changes" : "Save movement"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel recurringPanel collapsiblePanel">
          <button
            type="button"
            className="collapsibleHead"
            onClick={() => setAutomationOpen((open) => !open)}
            aria-expanded={automationOpen}
          >
            <div>
              <p className="eyebrow">AUTOMATION</p>
              <h2>Recurring expenses & installments</h2>
            </div>
            <div className="collapsibleMeta">
              <span className="muted">{recurringTransactions.length} configured</span>
              <span className="collapseIcon">{automationOpen ? "▾" : "▸"}</span>
            </div>
          </button>
          {automationOpen && (
            <div className="collapsibleBody">

          {recurringTransactions.length === 0 ? (
            <EmptyState text="Mark an expense as recurring to automate it every month." />
          ) : (
            <div className="recurringList">
              {recurringTransactions.map((r) => (
                <div className="recurringItem" key={r.id}>
                  <div>
                    <strong>{r.description}</strong>
                    <span>
                      {r.category} · {usd(r.currency === "USD" ? r.amountOriginal : r.amountOriginal / r.fxRate)} · day {r.dayOfMonth} each month
                    </span>
                    <small>
                      {r.endDate ? "Installment" : "Recurring ongoing"} · starts {r.startDate}
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

        <section id="history" className="panel collapsiblePanel">
          <button
            type="button"
            className="collapsibleHead"
            onClick={() => setActivityOpen((open) => !open)}
            aria-expanded={activityOpen}
          >
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Recent movements</h2>
            </div>
            <div className="collapsibleMeta">
              <span className="muted">{transactions.length} total</span>
              <span className="collapseIcon">{activityOpen ? "▾" : "▸"}</span>
            </div>
          </button>
          {activityOpen && (
            <div className="collapsibleBody">
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

function FinanceByFrancoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brandLockup compact" : "brandLockup"}>
      <div className="markFrame">
        <svg className="francoMark" viewBox="0 0 160 170" aria-hidden="true">
          <path d="M30 48 L130 50" />
          <path d="M30 48 L111 96" />
          <path d="M82 50 L84 156" />
          <path d="M84 112 L111 96" />
        </svg>
      </div>
      <div className="brandText">
        <strong>
          <span className="brandFinance">Finance</span>
          <span className="brandByFranco">By Franco</span>
        </strong>
        <span className="brandTagline">{compact ? "PERSONAL FINANCE" : "Personal Finance Dashboard"}</span>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
