import React, { useMemo } from "react";
import {
  Package,
  CreditCard,
  Wrench,
  PieChart as PieIcon,
  ClipboardList,
  ShoppingCart,
  Users,
  Banknote,
  AlertTriangle,
  LineChart as LineIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { computeCustomerDebt } from "../utils/accounting";


// ---------- helpers ----------
const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);
const monthKey = (d) => (d || "").slice(0, 7) || "—";
 const DEFAULT_DATA = {
   customers: [],
   orders: [],
   finance: [],
   checks: [],
   inventory: [],
   wages: [],
   workers: [], // ✅ اضافه شود تا کارت حقوق کارگران ارور ندهد
 };

// ---------- main component ----------
export default function Dashboard({ data, go, kpis }) {
  const d = data ?? DEFAULT_DATA;
  const month = new Date().toISOString().slice(0, 7);

  // totals
  const sums = useMemo(() => {
    const finance = d.finance || [];
    const checks = d.checks || [];
    // چک‌های پاس‌شده‌ای که رکورد income ندارند (سازگاری داده‌های قدیمی)
    const clearedChecksNotLogged = (checks || []).filter(ch =>
      ch.status === "پاس شد" &&
      !finance.some(f =>
        f.type === "income" &&
        f.method === "چک" &&
        String(f.orderId) === String(ch.orderId) &&
        +f.amount === +ch.amount
      )
    );

    const orders = d.orders || [];
    const customers = d.customers || [];
    const workers = d.workers || [];
    const wages = d.wages || []; // ⬅️ برای محاسبه کارت کارگران

    const incomeTotal = finance
      .filter((f) => f.type === "income")
      .reduce((a, b) => a + (+b.amount || 0), 0);

    const expenseTotal = finance
      .filter((f) => f.type === "expense")
      .reduce((a, b) => a + (+b.amount || 0), 0);

    const incomeMonthBase = finance
      .filter((f) => f.type === "income" && monthKey(f.date) === month)
      .reduce((a, b) => a + (+b.amount || 0), 0);
	  
    const clearedChecksMonthDelta = clearedChecksNotLogged
      .filter(ch => monthKey(ch.dueDate) === month)
      .reduce((a, ch) => a + (+ch.amount || 0), 0);
	  
    const incomeMonth = incomeMonthBase + clearedChecksMonthDelta; // ✅ تحقق‌یافته

    const expenseMonth = finance
      .filter((f) => f.type === "expense" && monthKey(f.date) === month)
      .reduce((a, b) => a + (+b.amount || 0), 0);

    const pendingChecks = checks.filter((c) => c.status === "در انتظار");
    const pendingChecksAmount = pendingChecks.reduce(
      (a, c) => a + (+c.amount || 0),
      0
    );

	// بدهی واقعی هر مشتری از تابع جدید گرفته می‌شود
	const debts = customers.map((c) => {
	  const { debt } = computeCustomerDebt(d, c.id);
	  return Math.max(0, debt);
	});
	const totalDebt = debts.reduce((a, b) => a + b, 0);


    const buildingOrders = orders.filter(
      (o) => o.status === "در حال ساخت"
    ).length;

  // ===== Workers (اصلاح‌شده) =====
  const totalPayableWages = workers.reduce((a, w) => {
    const overtimePay = (+w.overtimeHours || 0) * (+w.overtimeRate || 0);
    return a + (+w.baseSalary || 0) + overtimePay;
  }, 0);

  const totalPaidWages = wages.reduce((a, w) => a + (+w.amount || 0), 0);

  const totalRemainingSalary = Math.max(totalPayableWages - totalPaidWages, 0);

	return {
	  incomeTotal,
	  expenseTotal,
	  incomeMonth,
	  expenseMonth,
	  profitMonth: incomeMonth - expenseMonth,
	  totalDebt,
	  pendingChecksCount: pendingChecks.length,
	  pendingChecksAmount,
	  buildingOrders,
	  // workers
	  totalPaidWages,
	  totalRemainingSalary,
	};
  }, [d, month]); // ساختار مشابه نسخه قبلی:contentReference[oaicite:2]{index=2}

  // low stock items
  const lowStock = useMemo(() => {
    const arr = (d.inventory || []).filter(
      (i) => (i.min ?? 0) > (i.stock ?? 0)
    );
    return arr
      .sort((a, b) => (a.stock - a.min) - (b.stock - b.min))
      .slice(0, 5);
  }, [d.inventory]);

  // top debtors
  const topDebtors = useMemo(() => {
   return (d.customers || [])
     .map((c) => {
       const { debt } = computeCustomerDebt(d, c.id);
       return {
         id: c.id,
         name: c.name,
         debt: Math.max(0, debt),
       };
     })
      .filter((x) => x.debt > 0)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 5);
  }, [d.customers, d.orders, d.finance, d.checks]);

  // monthly chart data
   const monthlySeries = useMemo(() => {
     const map = {};
     const finance = d.finance || [];
     const checks = d.checks || [];
 
     // 1) داده‌های فایننس
     finance.forEach((f) => {
       const m = monthKey(f.date);
       if (!map[m]) map[m] = { name: m, income: 0, expense: 0 };
       map[m][f.type] += +f.amount || 0;
     });
 
     // 2) چک‌های پاس‌شدهٔ بی‌رکورد → به درآمد ماه سررسید اضافه کن
     const clearedChecksNotLogged = checks.filter(ch =>
       ch.status === "پاس شد" &&
       !finance.some(f =>
         f.type === "income" &&
         f.method === "چک" &&
         String(f.orderId) === String(ch.orderId) &&
         +f.amount === +ch.amount
       )
     );
     clearedChecksNotLogged.forEach((ch) => {
       const m = monthKey(ch.dueDate);
       if (!map[m]) map[m] = { name: m, income: 0, expense: 0 };
       map[m].income += +ch.amount || 0;
     });
 
     return Object.values(map)
       .sort((a, b) => a.name.localeCompare(b.name))
       .map((r) => ({ ...r, profit: r.income - r.expense }));
   }, [d.finance, d.checks]);


  // quick access buttons
  const mainButtons = [
    { key: "orders", label: "سفارش جدید", icon: ClipboardList },
    { key: "inventory", label: "انبار", icon: Package },
    { key: "purchases", label: "ثبت خرید", icon: ShoppingCart },
    { key: "finance", label: "دریافت/پرداخت", icon: CreditCard },
  ];

  // KPI data
  const KPI = {
    incomeMonth: kpis?.incomeMonth ?? sums.incomeMonth,
    expenseMonth: kpis?.expenseMonth ?? sums.expenseMonth,
    profitMonth: kpis?.profitMonth ?? sums.profitMonth,
    totalDebt: kpis?.debt ?? sums.totalDebt,
    pendingChecksAmount: kpis?.pendingChecksAmount ?? sums.pendingChecksAmount,
    pendingChecksCount: kpis?.pendingChecksCount ?? sums.pendingChecksCount,
    buildingOrders: kpis?.buildingOrders ?? sums.buildingOrders,
    // workers
    workersPaid: kpis?.workersPaid ?? sums.totalPaidWages,
    workersRemaining: kpis?.workersRemaining ?? sums.totalRemainingSalary,
  };

  // ---------- UI ----------
  return (
    <div className="dashboard-cover">
      {/* Section: KPIs */}
      <section className="dashboard-section">
        <h2 className="dashboard-title">نمای کلی عملکرد</h2>
        <div className="kpi-grid">
          <KpiCard
            title="دریافتی ماه"
            value={KPI.incomeMonth}
            hint="جمع درآمد این ماه"
            icon={CreditCard}
            onClick={() => go?.("finance")}
          />
          <KpiCard
            title="پرداختی ماه"
            value={KPI.expenseMonth}
            hint="جمع هزینه این ماه"
            icon={Wrench}
            onClick={() => go?.("finance")}
          />
          <KpiCard
            title="سود / زیان ماه"
            value={KPI.profitMonth}
            hint="درآمد - هزینه"
            icon={PieIcon}
          />
          <KpiCard
            title="بدهی مشتریان"
            value={KPI.totalDebt}
            hint="جمع بدهی‌های باز"
            icon={Users}
            dangerAware
            onClick={() => go?.("customers")}
          />
          <KpiCard
            title="چک‌های در انتظار"
            value={KPI.pendingChecksAmount}
            hint={`${KPI.pendingChecksCount} فقره`}
            icon={Banknote}
            onClick={() => go?.("finance")}
          />
          <KpiCard
            title="سفارش‌ها"
            value={KPI.buildingOrders}
            hint="تعداد"
            icon={ClipboardList}
            plain
            onClick={() => go?.("orders")}
          />
		  <KpiCard
		    title="وضعیت کانتینرها"
		    value={data.containerTypes?.length || 0}
		    hint={`آماده: ${
			  data.containerTypes?.filter((c) => c.status === "آماده").length || 0
		    } / در ساخت: ${
			  data.containerTypes?.filter((c) => c.status === "در حال ساخت").length || 0
		    }`}
		    icon={Package}
		    plain
		    onClick={() => go?.("containers")}
		  />

          {/* ===== کارت جدید: حقوق کارگران ===== */}
          <KpiCard
            title="حقوق کارگران"
            value={KPI.workersRemaining}
            hint={`پرداختی: ${currency(KPI.workersPaid)} | مجموع: ${currency(KPI.workersPaid+KPI.workersRemaining)}`}
            icon={Wrench}
            dangerAware={KPI.workersRemaining > 0}
            onClick={() => go?.("workers")}
          />
        </div>
      </section>

      {/* Section: Analytics & Stock */}
      <div className="dashboard-grid vertical">
        <div className="card chart-card">
          <div className="section-title">
            <h3>درآمد / هزینه / سود ماهانه</h3>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} barSize={35}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="name" stroke="var(--text-light)" />
                <YAxis stroke="var(--text-light)" />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value) => `${value.toLocaleString()} تومان`}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="income" name="درآمد" fill="var(--success, #10b981)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="هزینه" fill="var(--danger, #ef4444)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="سود" fill="var(--primary, #2563eb)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section: Quick Access */}
      <section className="dashboard-section">
        <h2 className="dashboard-title">دسترسی سریع</h2>
        <div className="quick-access">
          {mainButtons.map((b) => (
            <button key={b.key} className="quick-btn" onClick={() => go?.(b.key)}>
              <b.icon size={28} />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
} // ساختار تابع مشابه نسخهٔ قبلی【29†source*/

// ---------- KPI Card ----------
function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  positiveAware,
  dangerAware,
  plain,
  onClick,
}) {
  const val = value ?? 0;
  const isNeg = typeof val === "number" && val < 0;
  const color = plain
    ? undefined
    : isNeg && positiveAware
    ? "var(--danger)"
    : dangerAware
    ? "var(--danger)"
    : undefined;

  return (
    <div
      className={`kpi ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>
            {`${currency(val)}${plain ? "" : " تومان"}`}
          </div>
          {hint && (
            <div
              className="muted"
              style={{ marginTop: 4, fontSize: ".85rem" }}
            >
              {hint}
            </div>
          )}
        </div>
        <div className="icon-btn" style={{ borderRadius: 14 }} aria-hidden>
          <Icon />
        </div>
      </div>
    </div>
  );
}
