// src/components/Reports.jsx
import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Banknote,
  TrendingUp,
  AlertTriangle,
  PieChart as PieIcon,
  Users,
  Package,
  ClipboardList,
  FileDown,
} from "lucide-react";
import ShamsiDatePicker from "./ShamsiDatePicker";
import { computeCustomerDebt } from "../utils/accounting";

// ===== Utils =====
const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);

// تاریخ برای جدول رویدادها
const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return new Intl.DateTimeFormat("fa-IR").format(date);
};

// فرمت ماه (کلید YYYY-MM روی محور X)
const fmtMonth = (key) => {
  if (!key) return "—";
  const str = String(key);
  const base = str.length === 7 ? `${str}-01` : str;
  const date = new Date(base);
  if (isNaN(date)) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    month: "short",
    year: "numeric",
  }).format(date);
};

const CHART_MARGIN = { top: 16, right: 16, bottom: 40, left: 24 };
const AXIS_TICK = { fontSize: 11, fill: "var(--text-light, #64748b)" };
const TICK_MARGIN = 12;

const COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#8b5cf6"];
const RADIAN = Math.PI / 180;

// برچسب درصد داخل نمودار دایره‌ای
const renderPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}) => {
  if (!percent) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12 }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

// استایل چاپ مخصوص گزارشات (از خالی شدن PDF جلوگیری می‌کند)
const REPORTS_PRINT_STYLES = `
@media print {
  body * {
    visibility: hidden;
  }
  #reports-print-root,
  #reports-print-root * {
    visibility: visible;
  }
  #reports-print-root {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 16px 24px;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

// ===== Component =====
export default function Reports({ data }) {
  const finance = data.finance || [];
  const checks = data.checks || [];
  const customers = data.customers || [];
  const orders = data.orders || [];
  const archivedOrders = data.archivedOrders || [];
  const audit = data.audit || [];
  const containerUnits = data.containerUnits || [];
  const containerKinds = data.containerKinds || [];
  const containerTypes = data.containerTypes || []; // مدل قدیمی کانتینر

  // ----------------- فیلتر تاریخ (هماهنگ با Finance) -----------------
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const within = (date) => {
    if (!from && !to) return true;
    if (!date) return false;
    const d = String(date).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // نسخه‌ی فیلترشده داده‌ها
  const F_finance = useMemo(
    () => (finance || []).filter((f) => within(f.date)),
    [finance, from, to]
  );
  const F_checks = useMemo(
    () => (checks || []).filter((c) => within(c.dueDate)),
    [checks, from, to]
  );
  const F_orders = useMemo(
    () => (orders || []).filter((o) => within(o.date)),
    [orders, from, to]
  );
  const F_archived = useMemo(
    () =>
      (archivedOrders || []).filter((o) =>
        within(o.archivedAt || o.date || o.deliveredAt)
      ),
    [archivedOrders, from, to]
  );
  const F_audit = useMemo(
    () => (audit || []).filter((a) => within(a.at)),
    [audit, from, to]
  );

  // ----------------- ۱) خلاصه مالی -----------------
  const sumIncome = useMemo(
    () =>
      F_finance.filter((f) => f.type === "income").reduce(
        (s, f) => s + (Number(f.amount) || 0),
        0
      ),
    [F_finance]
  );

  const sumExpense = useMemo(
    () =>
      F_finance.filter((f) => f.type === "expense").reduce(
        (s, f) => s + (Number(f.amount) || 0),
        0
      ),
    [F_finance]
  );

  const pendingChecks = useMemo(
    () => (checks || []).filter((c) => c.status === "در انتظار"),
    [checks]
  );
  const returnedChecks = useMemo(
    () => (checks || []).filter((c) => c.status === "برگشتی"),
    [checks]
  );

  // چک‌های پاس‌شده در بازه
  const clearedChecks = useMemo(
    () => F_checks.filter((c) => c.status === "پاس شد"),
    [F_checks]
  );

  // چک‌های پاس‌شده‌ای که هنوز رکورد درآمد برایشان ثبت نشده
  const clearedChecksNotLogged = useMemo(
    () =>
      clearedChecks.filter(
        (ch) =>
          !F_finance.some(
            (f) =>
              f.type === "income" &&
              f.method === "چک" &&
              String(f.orderId || "") === String(ch.orderId || "") &&
              Number(f.amount) === Number(ch.amount)
          )
      ),
    [clearedChecks, F_finance]
  );

  const clearedChecksDelta = useMemo(
    () =>
      clearedChecksNotLogged.reduce(
        (s, ch) => s + (Number(ch.amount) || 0),
        0
      ),
    [clearedChecksNotLogged]
  );

  // درآمد واقعی (با احتساب چک‌های پاس‌شده بدون رکورد)
  const sumIncomeReal = sumIncome + clearedChecksDelta;
  const balance = sumIncome - sumExpense;

  const pendingChecksAmount = useMemo(
    () =>
      pendingChecks.reduce(
        (s, c) => s + (Number(c.amount) || 0),
        0
      ),
    [pendingChecks]
  );
  const returnedChecksAmount = useMemo(
    () =>
      returnedChecks.reduce(
        (s, c) => s + (Number(c.amount) || 0),
        0
      ),
    [returnedChecks]
  );

  // کل بدهی مشتریان
  const totalDebt = useMemo(() => {
    const arr = (customers || []).map((c) => {
      const { debt } = computeCustomerDebt(data, c.id);
      return Math.max(0, debt);
    });
    return arr.reduce((a, b) => a + b, 0);
  }, [customers, data]);

  // ----------------- ۲) نمودار درآمد/هزینه ماهانه -----------------
  const monthly = useMemo(() => {
    const map = new Map();

    // درآمد / هزینه‌ی مستقیم finance
    F_finance.forEach((f) => {
      const key = String(f.date || "").slice(0, 7);
      if (!key) return;
      if (!map.has(key)) map.set(key, { month: key, income: 0, expense: 0 });

      const row = map.get(key);
      const amt = Number(f.amount) || 0;
      if (f.type === "income") row.income += amt;
      else if (f.type === "expense") row.expense += amt;
    });

    // اضافه‌کردن چک‌های پاس‌شده‌ای که در finance ثبت نشده‌اند
    clearedChecksNotLogged.forEach((ch) => {
      const key = String(ch.dueDate || ch.date || "").slice(0, 7);
      if (!key) return;
      if (!map.has(key)) map.set(key, { month: key, income: 0, expense: 0 });
      const row = map.get(key);
      row.income += Number(ch.amount) || 0;
    });

    const arr = Array.from(map.values());
    arr.forEach((r) => {
      r.profit = (r.income || 0) - (r.expense || 0);
    });

    arr.sort((a, b) => a.month.localeCompare(b.month));
    return arr;
  }, [F_finance, clearedChecksNotLogged]);

  // ----------------- ۳) روش‌های پرداخت -----------------
  const paymentMethods = useMemo(() => {
    const map = {
      نقد: 0,
      چک: 0,
      قسط: 0,
    };

    F_finance.forEach((f) => {
      if (f.type !== "income") return;
      const amt = Number(f.amount) || 0;
      if (f.method === "نقد") map["نقد"] += amt;
      else if (f.method === "چک") map["چک"] += amt;
      else if (f.method === "قسط") map["قسط"] += amt;
    });

    // حجم چک‌های در انتظار را هم در دسته‌ی چک لحاظ می‌کنیم
    const pendingChecksAmountRange = F_checks
      .filter((c) => c.status === "در انتظار")
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    map["چک"] += pendingChecksAmountRange;

    return Object.entries(map)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [F_finance, F_checks]);

  // ----------------- ۴) وضعیت چک‌ها -----------------
  const checkStatusData = useMemo(
    () => [
      { name: "در انتظار", value: pendingChecks.length },
      {
        name: "پاس شد",
        value: (checks || []).filter((c) => c.status === "پاس شد").length,
      },
      { name: "برگشتی", value: returnedChecks.length },
    ],
    [pendingChecks, returnedChecks, checks]
  );

  // ----------------- ۵) بدهکارترین مشتری‌ها -----------------
  const debtors = useMemo(
    () =>
      (customers || [])
        .map((c) => {
          const { debt, pendingChecks } = computeCustomerDebt(data, c.id);
          return {
            id: c.id,
            name: c.name,
            debt: Math.max(0, debt),
            pendingChecksAmount: pendingChecks,
          };
        })
        .filter((x) => x.debt > 0)
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 5),
    [customers, data]
  );

  // ----------------- ۶) گزارش کانتینرها (هماهنگ با مدل جدید) -----------------
  const containerIncomeOverview = useMemo(() => {
    const hasNewModel =
      containerUnits.length > 0 && containerKinds.length > 0;

    // حالت جدید: containerUnits + containerKinds
    if (hasNewModel) {
      const unitsById = new Map(
        containerUnits.map((u) => [String(u.id), u])
      );
      const kindMap = new Map();

      (F_orders || [])
        .filter((o) => o.status !== "لغو‌شده")
        .forEach((o) => {
          const unitIds = o.containerUnitIds || [];
          if (!unitIds.length) return;

          const units = unitIds
            .map((id) => unitsById.get(String(id)))
            .filter(Boolean);

          if (!units.length) return;

          const orderTotal = Number(o.total) || 0;
          const totalUnitPrice =
            units.reduce((s, u) => s + (Number(u.price) || 0), 0) ||
            units.length;

          units.forEach((u) => {
            const kindId = String(u.kindId || "unknown");
            const base = Number(u.price) || 0;
            const allocated =
              totalUnitPrice > 0
                ? (orderTotal * base) / totalUnitPrice
                : orderTotal / units.length;

            if (!kindMap.has(kindId)) {
              const kindName =
                (containerKinds.find(
                  (k) => String(k.id) === String(kindId)
                )?.name || "نوع نامشخص") + "";
              kindMap.set(kindId, {
                kindId,
                name: kindName,
                amount: 0,
                unitsCount: 0,
              });
            }

            const row = kindMap.get(kindId);
            row.amount += allocated;
            row.unitsCount += 1;
          });
        });

      const byKind = Array.from(kindMap.values()).sort(
        (a, b) => b.amount - a.amount
      );

      // نمودار ماهانه فروش کانتینرها (کل مبلغ فاکتور سفارش‌های مربوطه)
      const monthlyMap = {};
      (F_orders || [])
        .filter((o) => o.status !== "لغو‌شده")
        .forEach((o) => {
          const m = String(o.date || "").slice(0, 7);
          if (!m) return;
          if (!monthlyMap[m]) monthlyMap[m] = { month: m, amount: 0 };
          monthlyMap[m].amount += Number(o.total) || 0;
        });

      const monthlySeries = Object.values(monthlyMap).sort((a, b) =>
        a.month.localeCompare(b.month)
      );

      return { byKind, monthlySeries };
    }

    // حالت قدیمی: containerTypes + o.containerId
    const ordersByContainer = {};
    (F_orders || [])
      .filter((o) => o.status !== "لغو‌شده")
      .forEach((o) => {
        const key = o.containerId || "unknown";
        ordersByContainer[key] =
          (ordersByContainer[key] || 0) + (Number(o.total) || 0);
      });

    const byKind = Object.entries(ordersByContainer).map(
      ([id, amount]) => ({
        kindId: id,
        name:
          containerTypes.find((c) => String(c.id) === String(id))?.name ||
          "نامشخص",
        amount,
        unitsCount: null,
      })
    );

    const monthlyMap = {};
    (F_orders || []).forEach((o) => {
      const m = String(o.date || "").slice(0, 7);
      if (!m) return;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, amount: 0 };
      monthlyMap[m].amount += Number(o.total) || 0;
    });
    const monthlySeries = Object.values(monthlyMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    return { byKind, monthlySeries };
  }, [F_orders, containerUnits, containerKinds, containerTypes]);

  const containerTotalIncome = useMemo(
    () =>
      (containerIncomeOverview.byKind || []).reduce(
        (s, k) => s + (Number(k.amount) || 0),
        0
      ),
    [containerIncomeOverview]
  );

  // ----------------- ۷) تحویل و Rollback سفارش‌ها -----------------
  const deliveries = useMemo(
    () => F_audit.filter((a) => a.type === "ORDER_DELIVERED"),
    [F_audit]
  );
  const rollbacks = useMemo(
    () => F_audit.filter((a) => a.type === "ROLLBACK_ORDER_DELIVERED"),
    [F_audit]
  );

  const deliveryCount = deliveries.length;
  const rollbackCount = rollbacks.length;

  const monthlyDeliveryStats = useMemo(() => {
    const map = new Map();

    deliveries.forEach((a) => {
      const key = String(a.at || "").slice(0, 7);
      if (!key) return;
      if (!map.has(key))
        map.set(key, { month: key, delivered: 0, rollback: 0 });
      map.get(key).delivered += 1;
    });
    rollbacks.forEach((a) => {
      const key = String(a.at || "").slice(0, 7);
      if (!key) return;
      if (!map.has(key))
        map.set(key, { month: key, delivered: 0, rollback: 0 });
      map.get(key).rollback += 1;
    });

    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [deliveries, rollbacks]);

  const totalOrdersCount = (F_orders || []).length + (F_archived || []).length;

  // ======= Render =======
  return (
    <div className="card" style={{ padding: 16 }}>
      {/* استایل چاپ */}
      <style>{REPORTS_PRINT_STYLES}</style>

      <div id="reports-print-root">
        {/* هدر صفحه + فیلتر تاریخ + چاپ */}
        <div
          className="section-title"
          style={{ marginTop: "-2.4px", marginBottom: 12 }}
        >
          <div className="header-line">
            <h3 className="header-title">گزارش‌ها و تحلیل مالی</h3>
          </div>

          <div
            className="row"
            style={{
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: ".85rem" }}>
                از تاریخ:
              </span>
              <ShamsiDatePicker
                value={from}
                onChange={setFrom}
                style={{ width: 130 }}
              />
            </div>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: ".85rem" }}>
                تا تاریخ:
              </span>
              <ShamsiDatePicker
                value={to}
                onChange={setTo}
                style={{ width: 130 }}
              />
            </div>

            <button
              className="btn"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              پاک کردن فیلتر
            </button>

            <button
              className="btn primary"
              onClick={() => {
                if (typeof window !== "undefined") window.print();
              }}
            >
              <FileDown size={16} />
              <span style={{ marginInlineStart: 4 }}>چاپ / PDF</span>
            </button>
          </div>
        </div>

        {/* خلاصه شاخص‌ها */}
        <div
          className="kpi-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <MiniKpi
            title="دریافتی واقعی در این بازه"
            value={sumIncomeReal}
            hint={`شامل چک‌های پاس‌شده بدون رکورد ( +${currency(
              clearedChecksDelta
            )} )`}
            icon={Banknote}
          />
          <MiniKpi
            title="پرداختی‌ها در این بازه"
            value={sumExpense}
            hint="همه‌ی هزینه‌های ثبت‌شده"
            icon={AlertTriangle}
          />
          <MiniKpi
            title="سود / زیان خالص"
            value={sumIncomeReal - sumExpense}
            hint={`سود ثبت‌شده: ${currency(balance)} تومان`}
            icon={TrendingUp}
            danger={sumIncomeReal - sumExpense < 0}
          />
          <MiniKpi
            title="چک‌های در انتظار"
            value={pendingChecksAmount}
            hint={`${pendingChecks.length.toLocaleString(
              "fa-IR"
            )} فقره در انتظار`}
            icon={Banknote}
            danger={pendingChecksAmount > 0}
          />
          <MiniKpi
            title="چک‌های برگشتی"
            value={returnedChecksAmount}
            hint={`${returnedChecks.length.toLocaleString(
              "fa-IR"
            )} فقره برگشتی`}
            icon={AlertTriangle}
            danger={returnedChecksAmount > 0}
          />
          <MiniKpi
            title="بدهی مشتریان"
            value={totalDebt}
            hint="جمع بدهیِ باز همه مشتری‌ها"
            icon={Users}
            danger={totalDebt > 0}
          />
          <MiniKpi
            title="فروش کانتینر در این بازه"
            value={containerTotalIncome}
            hint="جمع مبلغ فاکتور سفارش‌های کانتینر"
            icon={Package}
          />
          <MiniKpi
            title="تعداد سفارش‌ها"
            value={`${totalOrdersCount.toLocaleString(
              "fa-IR"
            )} سفارش (فعال + آرشیو در بازه)`}
            hint="تعداد کل سفارش‌های ثبت‌شده در بازه"
            icon={ClipboardList}
          />
        </div>

        {/* ردیف ۱: روند مالی + روش‌های پرداخت */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,2.1fr) minmax(0,1.4fr)",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {/* نمودار درآمد/هزینه ماهانه */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <h4>روند درآمد و هزینه ماهانه</h4>
              <span className="muted" style={{ fontSize: ".8rem" }}>
                {from || to ? "بر اساس بازه انتخاب‌شده" : "بر اساس کل داده‌ها"}
              </span>
            </div>

            {monthly.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={monthly}
                  margin={{ top: 24, right: 80, bottom: 36, left: 30 }}
                  barCategoryGap={24}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148,163,184,0.35)"
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    tick={AXIS_TICK}
                    tickMargin={TICK_MARGIN}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickMargin={TICK_MARGIN}
                    width={72}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <Tooltip
                    formatter={(v) => `${currency(v)} تومان`}
                    labelFormatter={(val) => fmtMonth(val)}
                    contentStyle={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 6 }}
                  />
                  <Bar
                    dataKey="income"
                    name="درآمد"
                    fill="var(--success, #10b981)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    name="هزینه"
                    fill="var(--danger, #ef4444)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="profit"
                    name="سود"
                    fill="var(--primary, #2563eb)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                در این بازه زمانی تراکنش مالی ثبت نشده است.
              </div>
            )}
          </div>

          {/* نمودار روش‌های پرداخت */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 className="mb-2" style={{ marginBottom: 8 }}>
              <span className="row" style={{ gap: 6, alignItems: "center" }}>
                <PieIcon size={16} />
                <span>سهم روش‌های پرداخت</span>
              </span>
            </h4>
            {paymentMethods.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={40}
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {paymentMethods.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${currency(v)} تومان`}
                    contentStyle={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 6 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                در این بازه دریافتی ثبت نشده است.
              </div>
            )}

            <div
              className="muted"
              style={{ marginTop: 16,marginRight: 16, fontSize: ".8rem" }}
            >
              * حجم چک‌های در انتظار نیز در سهم «چک» لحاظ شده است.
            </div>
          </div>
        </div>

        {/* ردیف ۲: وضعیت چک‌ها + تحویل سفارش‌ها */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2.0fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* وضعیت چک‌ها */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 className="mb-2" style={{ marginBottom: 8 }}>
              <span className="row" style={{ gap: 6, alignItems: "center" }}>
                <PieIcon size={16} />
                <span>وضعیت چک‌ها</span>
              </span>
            </h4>

            {checkStatusData.some((x) => x.value > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={checkStatusData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={40}
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {checkStatusData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 6 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                هیچ چکی در سیستم ثبت نشده است.
              </div>
            )}

            <ul
              className="muted"
              style={{ fontSize: ".85rem", marginTop: 12, marginRight: 48, lineHeight: 1.6 }}
            >
              <li>
                در انتظار: {pendingChecks.length.toLocaleString("fa-IR")} فقره،{" "}
                مجموع{" "}
                {currency(pendingChecksAmount)} تومان
              </li>
              <li>
                برگشتی: {returnedChecks.length.toLocaleString("fa-IR")} فقره،{" "}
                مجموع{" "}
                {currency(returnedChecksAmount)} تومان
              </li>
            </ul>
          </div>

          {/* تحویل و Rollback سفارش‌ها */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <h4>تحویل و بازگشت از تحویل سفارش‌ها</h4>
              <span className="muted" style={{ fontSize: ".8rem" }}>
                {`تحویل شده: ${deliveryCount.toLocaleString(
                  "fa-IR"
                )} | برگشت از تحویل: ${rollbackCount.toLocaleString("fa-IR")}`}
              </span>
            </div>

            {monthlyDeliveryStats.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={monthlyDeliveryStats}
                  margin={{ top: 28, right: 80, bottom: 0, left: 30 }}
                  barCategoryGap={24}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148,163,184,0.35)"
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    tick={AXIS_TICK}
                    tickMargin={TICK_MARGIN}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickMargin={TICK_MARGIN}
                    width={64}
                    allowDecimals={false}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <Tooltip
                    formatter={(v) => `${v.toLocaleString("fa-IR")} سفارش`}
                    labelFormatter={(val) => fmtMonth(val)}
                    contentStyle={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 6 }}
                  />
                  <Bar
                    dataKey="delivered"
                    name="تحویل شده"
                    fill="var(--success, #22c55e)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="rollback"
                    name="بازگشت از تحویل"
                    fill="var(--danger, #ef4444)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                در این بازه تحویلی ثبت نشده است.
              </div>
            )}
          </div>
        </div>

        {/* ردیف ۳: کانتینرها */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1.7fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* درآمد به تفکیک نوع کانتینر */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 style={{ marginBottom: 8 }}>درآمد به تفکیک نوع کانتینر</h4>

            {containerIncomeOverview.byKind &&
            containerIncomeOverview.byKind.length ? (
              <ResponsiveContainer width="120%" height={260}>
                <BarChart
                  data={containerIncomeOverview.byKind}
                  layout="vertical"
                  margin={{ top: 16, right: 80, bottom: 16, left: 50 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(148,163,184,0.3)"
                  />
                  <XAxis
                    type="number"
                    tick={12}
                    tickMargin={8}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
					tickMargin={28}
                    width={140}
                  />
                  <Tooltip
                    formatter={(v) => `${currency(v)} تومان`}
                    contentStyle={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    name="مبلغ فروش"
                    fill="var(--primary, #2563eb)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                در این بازه سفارشی برای کانتینر ثبت نشده است.
              </div>
            )}
          </div>

          {/* فروش ماهانه کانتینرها */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 style={{ marginBottom: 8 }}>فروش ماهانه کانتینرها</h4>

            {containerIncomeOverview.monthlySeries &&
            containerIncomeOverview.monthlySeries.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={containerIncomeOverview.monthlySeries}
                  margin={{ top: 16, right: 80, bottom: 16, left: 20 }}
                  barCategoryGap={24}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148,163,184,0.35)"
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    tick={AXIS_TICK}
                    tickMargin={TICK_MARGIN}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickMargin={16}
                    width={72}
                    axisLine={{ stroke: "rgba(148,163,184,0.6)" }}
                  />
                  <Tooltip
                    formatter={(v) => `${currency(v)} تومان`}
                    labelFormatter={(val) => fmtMonth(val)}
                    contentStyle={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    name="مبلغ فروش"
                    fill="var(--primary, #2563eb)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                داده‌ای برای نمایش نیست.
              </div>
            )}
          </div>
        </div>

        {/* ردیف ۴: بدهکارترین مشتری‌ها + آخرین رویدادهای سیستمی */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1.8fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* بدهکارترین مشتری‌ها */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 style={{ marginBottom: 8 }}>۵ مشتری با بیشترین بدهی</h4>
            {debtors.length ? (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>مشتری</th>
                    <th>بدهی (تومان)</th>
                    <th>چک / بدهی معلق</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{currency(d.debt)}</td>
                      <td>{currency(d.pendingChecksAmount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "32px 0" }}
              >
                بدهی فعالی برای مشتریان ثبت نشده است.
              </div>
            )}
          </div>

          {/* آخرین رویدادهای ثبت‌شده (audit) */}
          <div className="card" style={{ margin: 0, padding: 16 }}>
            <h4 style={{ marginBottom: 8 }}>آخرین رویدادهای سیستمی</h4>
            {F_audit.length ? (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>تاریخ</th>
                    <th>نوع رویداد</th>
                    <th>توضیح</th>
                  </tr>
                </thead>
                <tbody>
                  {[...F_audit]
                    .sort((a, b) => (a.at < b.at ? 1 : -1))
                    .slice(0, 10)
                    .map((a) => (
                      <tr key={a.id || a.at}>
                        <td>{fmtDate(a.at)}</td>
                        <td>{a.type}</td>
                        <td style={{ maxWidth: 320 }}>{a.message || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div
                className="muted"
                style={{ textAlign: "center", padding: "32px 0" }}
              >
                در این بازه رویدادی ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Mini KPI Card مخصوص این صفحه =====
function MiniKpi({ title, value, hint, icon: Icon, danger }) {
  const val = value ?? 0;
  const isNumber = typeof val === "number";
  const display = isNumber ? `${currency(val)} تومان` : val;
  const color =
    danger && isNumber && val > 0 ? "var(--danger)" : undefined;

  return (
    <div className="kpi">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <div className="muted" style={{ marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color }}>
            {display}
          </div>
          {hint && (
            <div
              className="muted"
              style={{ marginTop: 4, fontSize: ".8rem" }}
            >
              {hint}
            </div>
          )}
        </div>
        {Icon && (
          <div className="icon-btn" style={{ borderRadius: 14 }} aria-hidden>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
