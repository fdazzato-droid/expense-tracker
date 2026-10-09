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

const CATEGORY_BUDGETS: { name: string; categories: string[]; limit: number }[] = [
  { name: "Groceries", categories: ["Groceries"], limit: 450 },
  { name: "Going out", categories: ["Dining Out", "Meetings with Friends"], limit: 350 },
  { name: "Health (variable)", categories: ["Health"], limit: 100 },
  { name: "Dog", categories: ["Dog Expenditures"], limit: 40 },
  { name: "Home & misc", categories: ["Miscellaneous", "Home / Furniture"], limit: 60 },
  { name: "Personal, clothing, gifts", categories: ["Personal Care", "Clothing", "Gifts / Donations"], limit: 30 },
];

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

function addMonths(key: string, amount: number) {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1 + amount, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" })
    .format(new Date(year, month - 1, 1));
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

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function hasExtraMarker(notes?: string) {
  return Boolean(notes?.toLowerCase().includes("[extra]"));
}

function stripExtraMarker(notes?: string) {
  return (notes ?? "").replace(/\[extra\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

function storedNotes(notes: string, extraordinary: boolean) {
  const clean = stripExtraMarker(notes);
  if (extraordinary) return clean ? `${clean} [extra]` : "[extra]";
  return clean || null;
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
  const [dashboardTab, setDashboardTab] = useState<"overview" | "commitments" | "details" | "movements" | "account">("overview");
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
  const [extraordinary, setExtraordinary] = useState(false);
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
  const [savingsTarget, setSavingsTarget] = useState(30);
  const [savingsTargetLoaded, setSavingsTargetLoaded] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("finance-by-franco-savings-target");
      const parsed = saved ? Number(saved) : NaN;
      if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 50) {
        setSavingsTarget(parsed);
      }
    } catch {
      // localStorage may be unavailable in private browsing or restricted contexts.
    } finally {
      setSavingsTargetLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!savingsTargetLoaded) return;
    try {
      window.localStorage.setItem("finance-by-franco-savings-target", String(savingsTarget));
    } catch {
      // Keep the slider usable even if localStorage cannot persist it.
    }
  }, [savingsTarget, savingsTargetLoaded]);

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

    const { data: recurringData, error: recurringError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (recurringError) {
      setAuthMessage(recurringError.message);
      return;
    }

    const mappedRecurring: RecurringTransaction[] = (recurringData ?? []).map((row) => ({
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
    }));

    setRecurringTransactions(mappedRecurring);
    const recurringDescriptions = new Map(mappedRecurring.map((r) => [r.id, r.description]));

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setTransactions((data ?? []).map((row) => {
      const storedDescription = row.description?.trim();
      const recurringDescription = row.recurring_id
        ? recurringDescriptions.get(row.recurring_id)
        : undefined;
      const description =
        recurringDescription && (!storedDescription || storedDescription === row.category)
          ? recurringDescription
          : storedDescription || row.category;

      return {
        id: row.id,
        date: row.date,
        type: row.type,
        category: row.category,
        description,
        amountOriginal: Number(row.amount_original),
        currency: row.currency,
        fxRate: Number(row.fx_rate),
        amountUSD: Number(row.amount_usd),
        paymentMethod: row.payment_method ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
        recurringId: row.recurring_id ?? undefined,
      };
    }));
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
    if (!t.recurringId) return "Variable";
    const recurring = recurringTransactions.find((r) => r.id === t.recurringId);
    return recurring?.endDate ? "Installments" : "Fixed";
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

  const recurringById = useMemo(() => {
    return new Map(recurringTransactions.map((r) => [r.id, r]));
  }, [recurringTransactions]);

  const budgetSummary = useMemo(() => {
    const calc = (items: Transaction[], monthForTiming: string | null, annual = false) => {
      const income = items
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amountUSD, 0);

      let fixed = 0;
      let installments = 0;
      let variable = 0;
      let extraordinaryVariable = 0;

      items.filter((t) => t.type === "expense").forEach((t) => {
        const kind = commitmentTypeForTransaction(t);
        if (kind === "Fixed") fixed += t.amountUSD;
        else if (kind === "Installments") installments += t.amountUSD;
        else {
          variable += t.amountUSD;
          if (hasExtraMarker(t.notes)) extraordinaryVariable += t.amountUSD;
        }
      });

      const committed = fixed + installments;
      const actualExpenses = committed + variable;
      const actualSavings = income - actualExpenses;
      const actualSavingsRate = income > 0 ? (actualSavings / income) * 100 : 0;

      if (annual || !monthForTiming) {
        return {
          income,
          fixed,
          installments,
          committed,
          variable,
          extraordinaryVariable,
          variablePace: 0,
          actualExpenses,
          actualSavings,
          actualSavingsRate,
          projectedVariable: variable,
          projectedSavings: actualSavings,
          projectedSavingsRate: actualSavingsRate,
          elapsedPct: 100,
          daysElapsed: 0,
          totalDays: 0,
          isCurrentMonth: false,
        };
      }

      const totalDays = daysInMonth(monthForTiming);
      const currentMonth = todayISO().slice(0, 7);
      const isCurrentMonth = monthForTiming === currentMonth;
      const isPastMonth = monthForTiming < currentMonth;
      const todayDay = Number(todayISO().slice(8, 10));
      const daysElapsed = isCurrentMonth
        ? Math.min(todayDay, totalDays)
        : isPastMonth
          ? totalDays
          : 1;
      const pacedVariable = Math.max(0, variable - extraordinaryVariable);
      const variablePace = daysElapsed > 0 ? pacedVariable / daysElapsed : 0;
      const projectedVariable = isCurrentMonth
        ? variablePace * totalDays + extraordinaryVariable
        : variable;
      const projectedSavings = income - committed - projectedVariable;
      const projectedSavingsRate = income > 0 ? (projectedSavings / income) * 100 : 0;

      return {
        income,
        fixed,
        installments,
        committed,
        variable,
        extraordinaryVariable,
        variablePace,
        actualExpenses,
        actualSavings,
        actualSavingsRate,
        projectedVariable,
        projectedSavings,
        projectedSavingsRate,
        elapsedPct: totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0,
        daysElapsed,
        totalDays,
        isCurrentMonth,
      };
    };

    return {
      now: calc(periodCurrent, view === "month" ? selectedMonth : null, view === "year"),
      prev: calc(periodPrevious, view === "month" ? previousMonthKey(selectedMonth) : null, view === "year"),
    };
  }, [periodCurrent, periodPrevious, recurringTransactions, view, selectedMonth]);

  const allocationComparison = useMemo(() => {
    const build = (summary: typeof budgetSummary.now, projected: boolean) => {
      const variableAmount = projected ? summary.projectedVariable : summary.variable;
      const savingsAmount = projected ? summary.projectedSavings : summary.actualSavings;
      return [
        { name: "Fixed", amount: summary.fixed, color: "#284653" },
        { name: "Installments", amount: summary.installments, color: "#d8a64b" },
        { name: projected ? "Variable (projected)" : "Variable", amount: variableAmount, color: "#77a99f" },
        { name: projected ? "Savings (projected)" : "Savings", amount: Math.max(0, savingsAmount), color: "#4f79c6" },
      ];
    };

    return {
      now: build(budgetSummary.now, view === "month" && budgetSummary.now.isCurrentMonth),
      prev: build(budgetSummary.prev, false),
    };
  }, [budgetSummary, view]);

  const categoryComparison = useMemo(() => {
    const totals = (items: Transaction[]) => {
      const map = new Map<string, number>();
      items
        .filter((t) => {
          if (t.type !== "expense") return false;
          return dashboardCommitments.length === 0 ||
            dashboardCommitments.includes(commitmentTypeForTransaction(t));
        })
        .forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amountUSD));
      return map;
    };

    const now = totals(periodCurrent);
    const prev = totals(periodPrevious);
    const names = new Set([...now.keys(), ...prev.keys()]);

    return [...names]
      .filter((name) => dashboardCategories.length === 0 || dashboardCategories.includes(name))
      .map((name) => ({
        name,
        now: now.get(name) || 0,
        prev: prev.get(name) || 0,
      }))
      .sort((a, b) => b.now - a.now || b.prev - a.prev);
  }, [periodCurrent, periodPrevious, dashboardCategories, dashboardCommitments, recurringTransactions]);

  const categoryBudgetRows = useMemo(() => {
    const variableExpenses = periodCurrent.filter(
      (t) => t.type === "expense" && commitmentTypeForTransaction(t) === "Variable"
    );
    const elapsedFraction = Math.max(budgetSummary.now.elapsedPct / 100, 0.0001);

    return CATEGORY_BUDGETS.map((budget) => {
      const spent = variableExpenses
        .filter((t) => budget.categories.includes(t.category))
        .reduce((sum, t) => sum + t.amountUSD, 0);
      const usage = budget.limit > 0 ? spent / budget.limit : 0;
      const pace = usage / elapsedFraction;

      let status: "On track" | "Fast" | "Over pace" | "Over budget" = "On track";
      if (spent > budget.limit) status = "Over budget";
      else if (pace > 1.35) status = "Over pace";
      else if (pace > 1.05) status = "Fast";

      return { ...budget, spent, usage, pace, status };
    });
  }, [periodCurrent, recurringTransactions, budgetSummary.now.elapsedPct]);

  const savingsTargetSummary = useMemo(() => {
    const targetAmount = budgetSummary.now.income * (savingsTarget / 100);
    const variableRemaining =
      budgetSummary.now.income * (1 - savingsTarget / 100) -
      budgetSummary.now.committed -
      budgetSummary.now.variable;
    const daysRemaining = Math.max(
      budgetSummary.now.totalDays - budgetSummary.now.daysElapsed,
      0
    );
    const perDay = daysRemaining > 0 ? variableRemaining / daysRemaining : variableRemaining;

    return {
      targetAmount,
      variableRemaining,
      daysRemaining,
      perDay,
      paceWorks: perDay >= budgetSummary.now.variablePace,
    };
  }, [budgetSummary, savingsTarget]);

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
    const types = ["Variable", "Fixed", "Installments"] as const;

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

  const installmentCalendar = useMemo(() => {
    const startMonth = view === "month" ? selectedMonth : `${selectedYear}-01`;

    return Array.from({ length: 12 }, (_, index) => {
      const month = addMonths(startMonth, index);
      const plans = recurringTransactions
        .filter((r) =>
          r.type === "expense" &&
          r.active &&
          Boolean(r.endDate) &&
          monthKey(r.startDate) <= month &&
          monthKey(r.endDate!) >= month
        )
        .map((r) => ({
          id: r.id,
          description: r.description,
          amount: r.currency === "USD" ? r.amountOriginal : r.amountOriginal / r.fxRate,
        }));

      return {
        month,
        plans,
        total: plans.reduce((sum, plan) => sum + plan.amount, 0),
      };
    });
  }, [recurringTransactions, view, selectedMonth, selectedYear]);

  const installmentDrop = useMemo(() => {
    let best: { month: string; drop: number } | null = null;
    for (let i = 1; i < installmentCalendar.length; i += 1) {
      const drop = installmentCalendar[i - 1].total - installmentCalendar[i].total;
      if (drop > 0 && (!best || drop > best.drop)) {
        best = { month: installmentCalendar[i].month, drop };
      }
    }
    return best;
  }, [installmentCalendar]);

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
    setDashboardCommitments(["Variable", "Fixed", "Installments"]);
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
    setExtraordinary(hasExtraMarker(t.notes));
    setNotes(stripExtraMarker(t.notes));

    const recurring = t.recurringId
      ? recurringTransactions.find((r) => r.id === t.recurringId)
      : undefined;

    setEditingRecurringId(recurring?.id ?? null);
    setEditScope("single");
    setRepeatMonthly(Boolean(recurring));
    setRepeatDay(String(recurring?.dayOfMonth ?? Number(t.date.slice(8, 10))));
    setRepeatEndDate(recurring?.endDate ?? "");
    setDashboardTab("movements");
    window.setTimeout(() => document.getElementById("add")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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
    setExtraordinary(false);
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
    const notesForStorage = type === "expense"
      ? storedNotes(notes, extraordinary)
      : stripExtraMarker(notes) || null;

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
                notes: notesForStorage,
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
            notes: notesForStorage,
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
          notes: notesForStorage,
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
          notes: notesForStorage,
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
      notes: notesForStorage,
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
    setExtraordinary(false);
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
            placeholder="New password"
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
          <button className={dashboardTab === "movements" ? "navItem navButton active" : "navItem navButton"} onClick={() => setDashboardTab("movements")}>Movements</button>
          <button className={dashboardTab === "account" ? "navItem navButton active" : "navItem navButton"} onClick={() => setDashboardTab("account")}>Account</button>
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
            {["overview", "commitments", "details"].includes(dashboardTab) && (dashboardCategories.length > 0 || dashboardCommitments.length > 0) && (
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
          {["overview", "commitments", "details"].includes(dashboardTab) && (
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
                    {["Variable", "Fixed", "Installments"].map((c) => (
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
          )}
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
          <button
            type="button"
            className={dashboardTab === "movements" ? "dashboardTab active" : "dashboardTab"}
            onClick={() => setDashboardTab("movements")}
          >
            Movements
          </button>
          <button
            type="button"
            className={dashboardTab === "account" ? "dashboardTab active" : "dashboardTab"}
            onClick={() => setDashboardTab("account")}
          >
            Account
          </button>
          {["overview", "commitments", "details"].includes(dashboardTab) && (dashboardCategories.length > 0 || dashboardCommitments.length > 0) && (
            <button type="button" className="clearFiltersButton" onClick={clearAllDashboardFilters}>
              Clear filters
            </button>
          )}
        </div>
        </div>

        <section id="dashboard" className={["overview", "commitments", "details"].includes(dashboardTab) ? "metrics" : "biHidden"}>
          <MetricCard
            label="Income"
            value={usd(budgetSummary.now.income)}
            sub={budgetSummary.prev.income > 0
              ? `${budgetSummary.now.income - budgetSummary.prev.income >= 0 ? "+" : ""}${usd(budgetSummary.now.income - budgetSummary.prev.income)} vs previous period`
              : "No previous period income"}
          />
          <MetricCard
            label="Committed"
            value={usd(budgetSummary.now.committed)}
            sub={`${budgetSummary.now.income > 0 ? pct((budgetSummary.now.committed / budgetSummary.now.income) * 100) : "0.0%"} of income · Fixed ${usd(budgetSummary.now.fixed)} + Installments ${usd(budgetSummary.now.installments)}`}
          />
          <MetricCard
            label="Variable spending"
            value={usd(budgetSummary.now.variable)}
            sub={view === "month"
              ? `${usd(budgetSummary.now.variablePace)}/day pace${budgetSummary.now.extraordinaryVariable > 0 ? ` · ${usd(budgetSummary.now.extraordinaryVariable)} extraordinary` : ""}`
              : "Actual variable spending"}
          />
          <MetricCard
            label={view === "month" && budgetSummary.now.isCurrentMonth ? "Projected savings" : "Savings"}
            value={usd(view === "month" && budgetSummary.now.isCurrentMonth ? budgetSummary.now.projectedSavings : budgetSummary.now.actualSavings)}
            sub={view === "month" && budgetSummary.now.isCurrentMonth
              ? `${pct(budgetSummary.now.projectedSavingsRate)} projected · Actual to date: ${pct(budgetSummary.now.actualSavingsRate)} · month is ${pct(budgetSummary.now.elapsedPct)} elapsed`
              : `${pct(budgetSummary.now.actualSavingsRate)} savings rate`}
          />
        </section>

        <section className={dashboardTab === "overview" ? "panel allocationPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">ALLOCATION</p>
              <h2>Where each dollar goes</h2>
            </div>
            <span className="muted">Share of income</span>
          </div>

          {budgetSummary.now.income <= 0 ? (
            <EmptyState text="Add income to compare how each dollar is allocated." />
          ) : (
            <div className="allocationCompare">
              {[
                {
                  label: view === "month" ? selectedMonth : selectedYear,
                  income: budgetSummary.now.income,
                  segments: allocationComparison.now,
                },
                {
                  label: view === "month" ? previousMonthKey(selectedMonth) : String(Number(selectedYear) - 1),
                  income: budgetSummary.prev.income,
                  segments: allocationComparison.prev,
                },
              ].map((row) => (
                <div className="allocationRow" key={row.label}>
                  <div className="allocationRowHead">
                    <strong>{row.label}</strong>
                    <span>{usd(row.income)} income</span>
                  </div>
                  <div className="allocationStack" aria-label={`Allocation for ${row.label}`}>
                    {row.segments.map((segment) => {
                      const percent = row.income > 0 ? (segment.amount / row.income) * 100 : 0;
                      return (
                        <div
                          key={segment.name}
                          className="allocationSegment"
                          style={{ width: `${Math.max(0, percent)}%`, background: segment.color }}
                          title={`${segment.name}: ${usd(segment.amount)} · ${pct(percent)} of income`}
                        />
                      );
                    })}
                  </div>
                  <div className="allocationLegend">
                    {row.segments.map((segment) => {
                      const percent = row.income > 0 ? (segment.amount / row.income) * 100 : 0;
                      return (
                        <span key={segment.name}>
                          <i style={{ background: segment.color }} />
                          {segment.name} {usd(segment.amount)} · {pct(percent)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={dashboardTab === "overview" ? "panel categoryComparePanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">SPENDING</p>
              <h2>Where your money goes</h2>
            </div>
            <span className="muted">Current vs previous period</span>
          </div>
          {categoryComparison.length === 0 ? (
            <EmptyState text="Add expenses to compare category spending." />
          ) : (
            <div className="categoryCompareList">
              {categoryComparison.map((item) => {
                const scale = Math.max(
                  ...categoryComparison.flatMap((row) => [row.now, row.prev]),
                  1
                );
                const variation = item.prev > 0
                  ? ((item.now - item.prev) / item.prev) * 100
                  : null;
                return (
                  <button
                    type="button"
                    className="categoryCompareRow"
                    key={item.name}
                    onClick={() => {
                      setDashboardCategories([item.name]);
                      setDashboardTab("details");
                    }}
                  >
                    <div className="categoryCompareHead">
                      <strong>{item.name}</strong>
                      <span>
                        {usd(item.now)}
                        <small className={variation !== null && variation > 0 ? "variationUp" : "variationDown"}>
                          {variation === null
                            ? "new"
                            : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                        </small>
                      </span>
                    </div>
                    <div className="comparisonTrack">
                      <div className="comparisonCurrent" style={{ width: `${Math.max(item.now > 0 ? 3 : 0, (item.now / scale) * 100)}%` }} />
                      <div className="comparisonPrevious" style={{ width: `${Math.max(item.prev > 0 ? 2 : 0, (item.prev / scale) * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {view === "month" && (
          <section className={dashboardTab === "overview" ? "panel budgetPanel biView" : "biHidden"}>
            <div className="panelHead">
              <div>
                <p className="eyebrow">VARIABLE BUDGETS</p>
                <h2>Category budgets</h2>
              </div>
              <span className="muted">Variable spending only</span>
            </div>
            <div className="tableWrap">
              <table className="budgetTable">
                <thead>
                  <tr><th>Budget</th><th>Spent</th><th>Limit</th><th>Usage</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {categoryBudgetRows.map((row) => (
                    <tr key={row.name}>
                      <td><strong>{row.name}</strong></td>
                      <td>{usd(row.spent)}</td>
                      <td>{usd(row.limit)}</td>
                      <td>
                        <div className="budgetUsage">
                          <div className="barTrack">
                            <div className="barFill" style={{ width: `${Math.min(100, row.usage * 100)}%` }} />
                          </div>
                          <small>{pct(row.usage * 100)}</small>
                        </div>
                      </td>
                      <td><span className={`budgetStatus ${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="budgetHint">By today you should have used {pct(budgetSummary.now.elapsedPct)} of each limit.</p>
          </section>
        )}

        {view === "month" && budgetSummary.now.isCurrentMonth && (
          <section className={dashboardTab === "overview" ? "panel savingsTargetPanel biView" : "biHidden"}>
            <div className="panelHead">
              <div>
                <p className="eyebrow">GOAL</p>
                <h2>Savings target</h2>
              </div>
              <strong>{savingsTarget}%</strong>
            </div>
            <label className="targetSlider">
              <span>Target savings rate</span>
              <input
                type="range"
                min="10"
                max="50"
                step="1"
                value={savingsTarget}
                onChange={(e) => setSavingsTarget(Number(e.target.value))}
              />
              <div><span>10%</span><span>50%</span></div>
            </label>
            <div className="savingsTargetGrid">
              <div><span>Savings goal</span><strong>{usd(savingsTargetSummary.targetAmount)}</strong></div>
              <div><span>Variable left this month</span><strong>{usd(savingsTargetSummary.variableRemaining)}</strong></div>
              <div className={savingsTargetSummary.paceWorks ? "paceGood" : "paceBad"}>
                <span>Available per remaining day</span>
                <strong>{usd(savingsTargetSummary.perDay)}</strong>
                <small>{savingsTargetSummary.daysRemaining} days left · current pace {usd(budgetSummary.now.variablePace)}/day</small>
              </div>
            </div>
          </section>
        )}

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

        <section className={dashboardTab === "commitments" ? "panel installmentCalendarPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">FORWARD VIEW</p>
              <h2>Installment calendar</h2>
            </div>
            <span className="muted">Next 12 months</span>
          </div>
          <div className="installmentCalendar">
            {installmentCalendar.map((item) => {
              const max = Math.max(...installmentCalendar.map((row) => row.total), 1);
              const detail = item.plans.length > 0
                ? item.plans.map((plan) => `${plan.description}: ${usd(plan.amount)}`).join(" · ")
                : "No installments";
              return (
                <div className="installmentCalendarCol" key={item.month} title={detail}>
                  <strong>{item.total > 0 ? usd(item.total) : "—"}</strong>
                  <div className="installmentCalendarTrack">
                    <div style={{ height: `${item.total > 0 ? Math.max(3, (item.total / max) * 100) : 0}%` }} />
                  </div>
                  <span>{monthLabel(item.month).replace(" ", " ’").replace(",", "")}</span>
                </div>
              );
            })}
          </div>
          {installmentDrop && (
            <div className="installmentDropInsight">
              <span className="insightIcon">↓</span>
              <p>From <strong>{monthLabel(installmentDrop.month)}</strong> your installments drop by <strong>{usd(installmentDrop.drop)}/month</strong>. Send it to savings.</p>
            </div>
          )}
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
                      <span>Last installment: {monthLabel(monthKey(item.endDate!))}</span>
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

        <section className={dashboardTab === "overview" && monthlyTrend.length >= 3 ? "panel trendPanel biView" : "biHidden"}>
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

        <section id="add" className={dashboardTab === "movements" ? "panel addPanel biView" : "biHidden"}>
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

            {type === "expense" && (
              <label className="wide recurringToggle">
                <span>Budget treatment</span>
                <span className="checkLine">
                  <input
                    type="checkbox"
                    checked={extraordinary}
                    onChange={(e) => setExtraordinary(e.target.checked)}
                  />
                  Extraordinary expense (exclude from daily pace)
                </span>
              </label>
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

        <section className={dashboardTab === "movements" ? "panel recurringPanel collapsiblePanel biView" : "biHidden"}>
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
                      {r.endDate ? "Installment" : "Fixed"} · starts {r.startDate}
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

        <section className={dashboardTab === "account" ? "panel accountPanel biView" : "biHidden"}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">ACCOUNT</p>
              <h2>Change password</h2>
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
            <button className="primary" type="submit">Change password</button>
          </form>
          {authMessage && <p className="authMessage">{authMessage}</p>}
        </section>

        <section id="history" className={dashboardTab === "movements" ? "panel collapsiblePanel biView" : "biHidden"}>
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
                  {(showAllMovements ? transactions : transactions.slice(0, 30)).map((t) => (
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
              {transactions.length > 30 && (
                <div className="showAllRow">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setShowAllMovements((show) => !show)}
                  >
                    {showAllMovements ? "Show latest 30" : `Show all (${transactions.length})`}
                  </button>
                </div>
              )}
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
