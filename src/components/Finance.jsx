import React, { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import OverlayModal from "./OverlayModal";
import ShamsiDatePicker from "./ShamsiDatePicker";

// ===== Utils =====
const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => {
  if (!d) return "—";
  const x = new Date(d);
  if (isNaN(x)) return "—";
  return new Intl.DateTimeFormat("fa-IR").format(x);
};
const num = (x) =>
  x === "" || x === null || x === undefined ? 0 : +x;

/**
 * Finance.jsx — صفحه‌ی مرکزی مدیریت مالی، هماهنگ با Orders / Purchases / Reports
 *
 * اصول کلیدی:
 * - دریافتی نقدی اولیه‌ی سفارش‌ها در Orders ثبت می‌شود؛ اینجا فقط نمایش و گزارش.
 * - وصول اقساط سفارش‌ها فقط در این صفحه ثبت می‌شود و بدهی مشتری را همان لحظه کم می‌کند.
 * - تغییر وضعیت چک:
 *    • «در انتظار» → بدون تغییر مالی
 *    • «پاس شد»   → ثبت رکورد income با روش «چک» و کاهش بدهی مشتری
 *    • «برگشتی»   → افزایش بدهی مشتری (بدون ثبت income جدید)
 * - پرداختی‌ها (expense) در این صفحه و سایر صفحات (مثل Purchases / Workers) به جدول finance اضافه می‌شوند.
 */

export default function Finance({ data, setData, toast }) {
  const [tab, setTab] = useState("income"); // income | expense | checks

  // ------- Filters -------
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [checkStatus, setCheckStatus] = useState("");

  // وصول قسط
  const [showInstallment, setShowInstallment] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedInstallment, setSelectedInstallment] = useState(null);

  // افزودن تراکنش عمومی (دستی)
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [tmpChecks, setTmpChecks] = useState([]);

  const customers = data.customers || [];
  const orders = data.orders || [];
  const checks = data.checks || [];
  const finance = data.finance || [];

  // ------ Helpers ------
  const notify = (msg, type = "info") => {
    if (typeof toast === "function") {
      toast(msg, { type });
    } else {
      window.alert(msg);
    }
  };

  function defaultForm() {
    return {
      date: todayISO(),
      title: "",
      note: "",
      type: "income",
      paymentKind: "نقد",
      customerId: "",
      orderId: "",
      amount: "",
      cashAmount: "",
      expenseMethod: "نقد",
    };
  }

  const within = (date) => {
    if (!date) return true;
    const d = String(date).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const shortOrder = (id) => {
    if (!id) return "—";
    const s = String(id);
    if (s.startsWith("ORD-")) return s;
    return "—";
  };

  const statusClass = (s) =>
    s === "پاس شد" ? "ok" : s === "برگشتی" ? "err" : "warn";

  const customersMap = useMemo(
    () =>
      Object.fromEntries(
        (customers || []).map((c) => [String(c.id), c.name])
      ),
    [customers]
  );

  const ordersMap = useMemo(
    () =>
      Object.fromEntries(
        (orders || []).map((o) => [String(o.id), o])
      ),
    [orders]
  );

  const ordersForCustomer = (cid) =>
    orders.filter((o) => String(o.customerId) === String(cid));

  const getOrder = (orderId) =>
    orders.find((o) => String(o.id) === String(orderId));

  const mapInstallmentsWithUid = (order) => {
    if (!order?.installment?.enabled) return [];
    const list = order.installment.list || [];
    return list.map((ins, idx) => ({
      ...ins,
      amount: num(ins.amount),
      _uid: `${order.id}-${idx}`,
    }));
  };

  const isInstallmentCollected = (orderId, uid) =>
    (finance || []).some(
      (f) =>
        f.type === "income" &&
        f.method === "قسط" &&
        String(f.orderId) === String(orderId) &&
        f.installmentId === uid
    );

  // ===== Derived Lists =====
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const base = (finance || []).filter((f) => f.type === tab);
    const f1 = base.filter((r) => within(r.date));
    const f2 = method ? f1.filter((r) => r.method === method) : f1;
    const q = search.trim();
    const f3 = q
      ? f2.filter((r) => {
          const cname = customersMap[String(r.customerId)] || "";
          return (
            String(r.title || "").includes(q) ||
            String(r.note || "").includes(q) ||
            String(r.orderId || "").includes(q) ||
            cname.includes(q)
          );
        })
      : f2;
    return [...f3].sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [finance, tab, from, to, method, search, customersMap]);

  const filteredChecks = useMemo(() => {
    let arr = (checks || []).filter((ch) => within(ch.dueDate));
    if (checkStatus) arr = arr.filter((c) => c.status === checkStatus);
    const q = search.trim();
    if (q) {
      arr = arr.filter((c) => {
        const cname = customersMap[String(c.customerId)] || "";
        return (
          String(c.bank || "").includes(q) ||
          String(c.number || "").includes(q) ||
          String(c.orderId || "").includes(q) ||
          cname.includes(q)
        );
      });
    }
    return [...arr].sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }, [checks, from, to, checkStatus, search, customersMap]);

  // ===== Sums =====
  const sumIncome = (finance || [])
    .filter((f) => f.type === "income")
    .reduce((a, b) => a + (num(b.amount) || 0), 0);

  const sumExpense = (finance || [])
    .filter((f) => f.type === "expense")
    .reduce((a, b) => a + (num(b.amount) || 0), 0);

  const pendingChecksAmount = (checks || [])
    .filter((c) => c.status === "در انتظار")
    .reduce((a, c) => a + (num(c.amount) || 0), 0);

  // ===== Persist: Add / Edit =====
  const resetModal = () => {
    setTmpChecks([]);
    setForm(defaultForm());
    setShow(false);
  };

  const openCreate = (kind = "income") => {
    setTmpChecks([]);
    setForm({
      ...defaultForm(),
      type: kind,
    });
    setShow(true);
  };

  const addTmpCheck = () => {
    setTmpChecks((cs) => [
      ...cs,
      {
        id: crypto.randomUUID(),
        financeId: null,
        orderId: form.orderId ? String(form.orderId) : null,
        customerId: form.customerId ? String(form.customerId) : null,
        bank: "",
        number: "",
        dueDate: todayISO(),
        amount: "",
        status: "در انتظار",
      },
    ]);
  };

  const patchTmpCheck = (id, field, value) =>
    setTmpChecks((cs) =>
      cs.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );

  const removeTmpCheck = (id) =>
    setTmpChecks((cs) => cs.filter((c) => c.id !== id));

  const save = () => {
    const n = num;

    // ----- پرداختی عمومی -----
    if (form.type === "expense") {
      if (!form.title.trim()) {
        notify("عنوان پرداخت را وارد کنید", "error");
        return;
      }
      if (!form.date) {
        notify("تاریخ پرداخت را انتخاب کنید", "error");
        return;
      }
      if (n(form.amount) <= 0) {
        notify("مبلغ پرداختی معتبر نیست", "error");
        return;
      }

      const rec = {
        id: crypto.randomUUID(),
        date: form.date,
        type: "expense",
        title: form.title,
        amount: n(form.amount),
        method: form.expenseMethod || "نقد", 
        note: form.note || "",
      };
      setData((d) => ({
        ...d,
        finance: [...(d.finance || []), rec],
      }));
      notify("پرداختی ثبت شد", "success");
      resetModal();
      setTab("expense");
      return;
    }

    // ----- دریافتی عمومی -----
    if (!form.date) {
      notify("تاریخ دریافتی را انتخاب کنید", "error");
      return;
    }
    if (!form.title.trim()) {
      notify("عنوان دریافتی را وارد کنید", "error");
      return;
    }

    const fid = crypto.randomUUID();
    const baseInfo = {
      id: fid,
      date: form.date,
      type: "income",
      title: form.title,
      note: form.note || "",
    };
    if (form.customerId) {
      baseInfo.customerId = String(form.customerId);
    }
    if (form.orderId) {
      baseInfo.orderId = String(form.orderId);
    }

    setData((d) => {
      let financeNext = [...(d.finance || [])];
      let checksNext = [...(d.checks || [])];
      let customersNext = [...(d.customers || [])];

      // --- نقدی ---
      if (form.paymentKind === "نقد") {
        if (n(form.amount) <= 0) {
          notify("مبلغ نقدی معتبر نیست", "error");
          return d;
        }
        financeNext.push({
          ...baseInfo,
          amount: n(form.amount),
          method: "نقد",
        });
      }

      // --- قسط (برای سازگاری با داده‌های قدیمی؛ در UI جدید دیگر انتخاب نمی‌شود) ---
      if (form.paymentKind === "قسط") {
        if (!form.customerId) {
          notify("برای ثبت قسط، انتخاب مشتری الزامی است", "error");
          return d;
        }
        if (n(form.amount) <= 0) {
          notify("مبلغ قسط معتبر نیست", "error");
          return d;
        }
        const rec = {
          ...baseInfo,
          customerId: String(form.customerId),
          orderId: form.orderId ? String(form.orderId) : undefined,
          amount: n(form.amount),
          method: "قسط",
        };
        financeNext.push(rec);
        customersNext = customersNext.map((c) =>
          String(c.id) === String(form.customerId)
            ? { ...c, debt: n(c.debt) - n(form.amount) }
            : c
        );
      }

      // --- فقط چک ---
      if (form.paymentKind === "چک") {
        if (tmpChecks.length === 0) {
          notify("حداقل یک چک اضافه کنید", "error");
          return d;
        }
        checksNext.push(
          ...tmpChecks.map((c) => ({
            ...c,
            financeId: fid,
          }))
        );
      }

      // --- نقد + چک ---
      if (form.paymentKind === "نقد + چک") {
        const cash = n(form.cashAmount);
        if (cash <= 0 && tmpChecks.length === 0) {
          notify(
            "در حالت نقد + چک، حداقل یکی از مبلغ نقدی یا چک باید پر شود",
            "error"
          );
          return d;
        }
        if (cash > 0) {
          financeNext.push({
            ...baseInfo,
            amount: cash,
            method: "نقد",
          });
        }
        if (tmpChecks.length > 0) {
          checksNext.push(
            ...tmpChecks.map((c) => ({
              ...c,
              financeId: fid,
              orderId: form.orderId ? String(form.orderId) : null,
            }))
          );
        }
      }

      return {
        ...d,
        finance: financeNext,
        checks: checksNext,
        customers: customersNext,
      };
    });

    notify("دریافتی ثبت شد", "success");
    resetModal();
    setTab("income");
  };

  // 📘 تغییر وضعیت چک با کنترل تکرار و اثر مالی
  const updateCheckStatus = (id, status) =>
    setData((d) => {
      const ch = (d.checks || []).find((c) => c.id === id);
      if (!ch) return d;

      const prevStatus = ch.status;
      if (status === prevStatus) return d; // تکراری

      const checksNext = (d.checks || []).map((c) =>
        c.id === id ? { ...c, status } : c
      );

      // حذف رکوردهای قبلی income مرتبط با این چک
      let financeNext = (d.finance || []).filter(
        (f) => f.checkId !== ch.id
      );

      let customersNext = [...(d.customers || [])];

      if (status === "پاس شد") {
        financeNext.push({
          id: crypto.randomUUID(),
          checkId: ch.id,
          date: todayISO(),
          type: "income",
          method: "چک",
          amount: +ch.amount || 0,
          customerId: ch.customerId,
          orderId: ch.orderId,
          note: `وصول چک شماره ${ch.number || ""}`,
        });

        customersNext = customersNext.map((c) =>
          String(c.id) === String(ch.customerId)
            ? {
                ...c,
                debt: Math.max(
                  0,
                  (+c.debt || 0) - (+ch.amount || 0)
                ),
              }
            : c
        );
      }

      if (status === "برگشتی") {
        customersNext = customersNext.map((c) =>
          String(c.id) === String(ch.customerId)
            ? {
                ...c,
                debt: (+c.debt || 0) + (+ch.amount || 0),
              }
            : c
        );
      }

      // در حالت «در انتظار» فقط وضعیت چک عوض می‌شود؛ اثر مالی ندارد

      return {
        ...d,
        checks: checksNext,
        finance: financeNext,
        customers: customersNext,
      };
    });

  // ===== UI =====
  return (
    <div className="card" style={{ padding: 16 }}>
      {/* ==== HEADER / FILTER WRAPPER ==== */}
      <div className="finance-header">
        {/* --- ردیف اول: عنوان و کنترل‌های اصلی --- */}
        <div className="section-title" style={{ marginBottom: 6 }}>
          <h3>مالی</h3>

          <div
            className="row"
            style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}
          >
            {/* Tabs */}
            <button
              className={`btn ${tab === "income" ? "primary" : ""}`}
              onClick={() => setTab("income")}
            >
              دریافتی‌ها
            </button>
            <button
              className={`btn ${tab === "expense" ? "primary" : ""}`}
              onClick={() => setTab("expense")}
            >
              پرداختی‌ها
            </button>
            <button
              className={`btn ${tab === "checks" ? "primary" : ""}`}
              onClick={() => setTab("checks")}
            >
              چک‌ها
            </button>

            {/* 🔍 نوار جستجو */}
            <div className="row" style={{ alignItems: "center" }}>
              <Search size={16} style={{ opacity: 0.6 }} />
              <input
                className="input"
                placeholder="جستجوی تراکنش یا مشتری..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 200 }}
              />
            </div>

            {/* ➕ دکمه وصول قسط */}
            <button
              className="btn secondary"
              onClick={() => setShowInstallment(true)}
            >
              <Plus size={18} /> وصول قسط
            </button>

            {/* ➕ دکمه تراکنش عمومی */}
            <button
              className="btn primary"
              onClick={() =>
                openCreate(tab === "expense" ? "expense" : "income")
              }
            >
              <Plus size={18} /> تراکنش عمومی
            </button>
          </div>
        </div>

        {/* --- ردیف دوم: فیلترها --- */}
        <div
          className="filters-row"
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <div
            className="row"
            style={{ alignItems: "center", gap: 6 }}
          >
            <label>از تاریخ:</label>
            <ShamsiDatePicker
              value={from}
              onChange={(v) => setFrom(v)}
              style={{ width: 150 }}
            />
          </div>

          <div
            className="row"
            style={{ alignItems: "center", gap: 6 }}
          >
            <label>تا تاریخ:</label>
            <ShamsiDatePicker
              value={to}
              onChange={(v) => setTo(v)}
              style={{ width: 150 }}
            />
          </div>

          {tab !== "checks" ? (
            <select
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={{ width: 150 }}
            >
              <option value="">همه روش‌ها</option>
              <option value="نقد">نقد</option>
              <option value="چک">چک</option>
              <option value="قسط">قسط</option>
            </select>
          ) : (
            <select
              className="input"
              value={checkStatus}
              onChange={(e) => setCheckStatus(e.target.value)}
              style={{ width: 150 }}
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="در انتظار">در انتظار</option>
              <option value="پاس شد">پاس شده</option>
              <option value="برگشتی">برگشتی</option>
            </select>
          )}
        </div>
      </div>

      {/* Summary */}
      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="pill">
          جمع دریافتی‌ها: {currency(sumIncome)} تومان
        </div>
        <div className="pill">
          جمع پرداختی‌ها: {currency(sumExpense)} تومان
        </div>
        <div className="pill">
          تراز کل: {currency(sumIncome - sumExpense)} تومان
        </div>
        <div className="pill">
          چک‌های در انتظار: {currency(pendingChecksAmount)} تومان
        </div>
      </div>

      {/* Tables */}
      {tab === "income" && (
        <table className="audit-table">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>مرجع سفارش</th>
              <th>مشتری</th>
              <th>روش پرداخت</th>
              <th>مبلغ (تومان)</th>
              <th>توضیح</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  style={{
                    textAlign: "center",
                    padding: "12px",
                  }}
                >
                  هیچ دریافتی ثبت نشده است.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cname =
                  customersMap[String(r.customerId)] || "—";
                return (
                  <tr key={r.id}>
                    <td>{fmt(r.date)}</td>
                    <td>
                      <span className="mono">
                        {shortOrder(r.orderId)}
                      </span>
                    </td>
                    <td>{cname}</td>
                    <td>
                      <span className="tag">
                        {r.paymentKind || r.method || "—"}
                      </span>
                    </td>
                    <td>{currency(+r.amount || 0)}</td>
                    <td>
                      {(r.title || r.note || "—").replace(
                        /[0-9a-fA-F-]{8,}/g,
                        (m) => m.slice(-6)
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}

      {tab === "expense" && (
        <table className="audit-table">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>عنوان پرداخت</th>
              <th>روش پرداخت</th>
              <th>مبلغ (تومان)</th>
              <th>توضیحات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: "center",
                    padding: "12px",
                  }}
                >
                  هیچ پرداختی ثبت نشده است.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.date)}</td>
                  <td>{r.title || "—"}</td>
                  <td>
                    <span className="tag">
                      {r.method || r.paymentKind || "—"}
                    </span>
                  </td>
                  <td>{currency(+r.amount || 0)}</td>
                  <td>{r.note || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {tab === "checks" && (
        <table className="audit-table">
          <thead>
            <tr>
              <th>تاریخ سررسید</th>
              <th>مرجع سفارش</th>
              <th>مشتری</th>
              <th>بانک</th>
              <th>شماره چک</th>
              <th>مبلغ (تومان)</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {filteredChecks.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  style={{
                    textAlign: "center",
                    padding: "12px",
                  }}
                >
                  هیچ چکی ثبت نشده است.
                </td>
              </tr>
            ) : (
              filteredChecks.map((c) => {
                const cname =
                  customersMap[String(c.customerId)] || "—";
                return (
                  <tr key={c.id}>
                    <td>{fmt(c.dueDate)}</td>
                    <td>
                      <span className="mono">
                        {shortOrder(c.orderId)}
                      </span>
                    </td>
                    <td>{cname}</td>
                    <td>{c.bank || "—"}</td>
                    <td className="mono">{c.number || "—"}</td>
                    <td>{currency(+c.amount || 0)}</td>
                    <td>
                      <select
                        className={`input status-select ${statusClass(
                          c.status || "در انتظار"
                        )}`}
                        value={c.status}
                        onChange={(e) =>
                          updateCheckStatus(c.id, e.target.value)
                        }
                      >
                        {["در انتظار", "پاس شد", "برگشتی"].map(
                          (s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}

      {/* Modal — تراکنش عمومی (دریافتی / پرداختی) */}
      <OverlayModal
        open={show}
        onClose={resetModal}
        title={
          form.type === "income"
            ? "ثبت دریافتی عمومی"
            : "ثبت پرداختی عمومی"
        }
        footer={
          <>
            <button className="btn" onClick={resetModal}>
              انصراف
            </button>
            <button
              className="btn primary"
              onClick={save}
            >
              {form.type === "income"
                ? "ثبت دریافتی"
                : "ثبت پرداختی"}
            </button>
          </>
        }
      >
        {/* نوع تراکنش */}
        <section className="form-section">
          <h4>نوع تراکنش</h4>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn ${
                form.type === "income" ? "primary" : "ghost"
              }`}
              onClick={() =>
                setForm((f) => ({ ...f, type: "income" }))
              }
            >
              دریافتی
            </button>
            <button
              type="button"
              className={`btn ${
                form.type === "expense" ? "primary" : "ghost"
              }`}
              onClick={() =>
                setForm((f) => ({ ...f, type: "expense" }))
              }
            >
              پرداختی
            </button>
          </div>
        </section>

        {/* مشخصات پایه */}
        <section className="form-section">
          <h4>مشخصات پایه</h4>
          <div className="form-grid">
            <div>
              <label>تاریخ</label>
              <ShamsiDatePicker
                value={form.date}
                onChange={(v) =>
                  setForm((f) => ({ ...f, date: v }))
                }
              />
            </div>
            <div>
              <label>عنوان</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    title: e.target.value,
                  }))
                }
                placeholder={
                  form.type === "income"
                    ? "مثلاً دریافت بابت خدمات"
                    : "مثلاً هزینه‌ی متفرقه"
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <label>توضیحات</label>
            <textarea
              className="input"
              rows={2}
              value={form.note}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  note: e.target.value,
                }))
              }
              placeholder="توضیح مختصر (اختیاری)"
            />
          </div>
        </section>

        {/* بخش مخصوص دریافتی‌ها */}
        {form.type === "income" && (
          <>
            <section className="form-section">
              <h4>روش پرداخت</h4>
              <div className="form-grid">
                <div>
                  <label>نوع پرداخت</label>
                  <select
                    className="input"
                    value={form.paymentKind}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentKind: e.target.value,
                      }))
                    }
                  >
                    <option value="نقد">نقد</option>
                    <option value="چک">چک</option>
                    <option value="نقد + چک">نقد + چک</option>
                  </select>
                </div>

                {form.paymentKind === "نقد" && (
                  <div>
                    <label>مبلغ (تومان)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1000"
                      value={form.amount}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          amount: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}

                {form.paymentKind === "نقد + چک" && (
                  <div>
                    <label>مبلغ نقدی (تومان)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1000"
                      value={form.cashAmount}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          cashAmount: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {(form.paymentKind === "چک" ||
                form.paymentKind === "نقد + چک") && (
                <div
                  className="check-box"
                  style={{ marginTop: 12 }}
                >
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <label>چک‌ها</label>
                    <button
                      type="button"
                      className="btn"
                      onClick={addTmpCheck}
                    >
                      <Plus size={14} /> افزودن چک
                    </button>
                  </div>

                  {tmpChecks.length === 0 ? (
                    <div
                      className="muted"
                      style={{ fontSize: 12 }}
                    >
                      هیچ چکی ثبت نشده است. با دکمهٔ «افزودن چک»
                      یک مورد اضافه کنید.
                    </div>
                  ) : (
                    tmpChecks.map((ch) => (
                      <div
                        key={ch.id}
                        className="row"
                        style={{
                          gap: 6,
                          marginBottom: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          className="input"
                          placeholder="بانک"
                          value={ch.bank || ""}
                          onChange={(e) =>
                            patchTmpCheck(
                              ch.id,
                              "bank",
                              e.target.value
                            )
                          }
                          style={{ minWidth: 80 }}
                        />
                        <input
                          className="input"
                          placeholder="شماره چک"
                          value={ch.number || ""}
                          onChange={(e) =>
                            patchTmpCheck(
                              ch.id,
                              "number",
                              e.target.value
                            )
                          }
                          style={{ minWidth: 120 }}
                        />
                        <ShamsiDatePicker
                          value={ch.dueDate}
                          onChange={(v) =>
                            patchTmpCheck(ch.id, "dueDate", v)
                          }
                          className="input"
                        />
                        <input
                          className="input"
                          type="number"
                          min="0"
                          placeholder="مبلغ"
                          value={ch.amount}
                          onChange={(e) =>
                            patchTmpCheck(
                              ch.id,
                              "amount",
                              e.target.value
                            )
                          }
                          style={{ minWidth: 120 }}
                        />
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => removeTmpCheck(ch.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* بخش مخصوص پرداختی‌ها */}
        {form.type === "expense" && (
          <section className="form-section">
            <h4>جزئیات پرداخت</h4>
            <div className="form-grid">
              <div>
                <label>روش پرداخت</label>
                <select
                  className="input"
                  value={form.expenseMethod}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      expenseMethod: e.target.value,
                    }))
                  }
                >
                  <option value="نقد">نقد</option>
                  <option value="چک">چک</option>
                </select>
              </div>
              <div>
                <label>مبلغ (تومان)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      amount: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </section>
        )}
      </OverlayModal>

      {/* Modal — وصول قسط */}
      <OverlayModal
        open={showInstallment}
        onClose={() => setShowInstallment(false)}
        title="وصول قسط مشتری"
        footer={
          <>
            <button
              className="btn"
              onClick={() => setShowInstallment(false)}
            >
              انصراف
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (
                  !selectedCustomer ||
                  !selectedOrder ||
                  !selectedInstallment
                ) {
                  notify(
                    "لطفاً مشتری، سفارش و قسط را انتخاب کنید.",
                    "error"
                  );
                  return;
                }

                const ins = selectedInstallment;
                if (
                  isInstallmentCollected(
                    selectedOrder,
                    ins._uid
                  )
                ) {
                  notify(
                    "این قسط قبلاً وصول شده است.",
                    "error"
                  );
                  return;
                }

                setData((d) => ({
                  ...d,
                  finance: [
                    ...(d.finance || []),
                    {
                      id: crypto.randomUUID(),
                      date: todayISO(),
                      type: "income",
                      method: "قسط",
                      amount: num(ins.amount),
                      customerId: selectedCustomer,
                      orderId: selectedOrder,
                      installmentId: ins._uid,
                      note: `وصول قسط از سفارش ${String(
                        selectedOrder
                      ).slice(-6)}`,
                    },
                  ],
                  customers: (d.customers || []).map((c) =>
                    String(c.id) === String(selectedCustomer)
                      ? {
                          ...c,
                          debt:
                            num(c.debt) - num(ins.amount),
                        }
                      : c
                  ),
                }));

                notify("قسط وصول شد", "success");
                setShowInstallment(false);
              }}
            >
              ثبت وصول قسط
            </button>
          </>
        }
      >
        <div className="info-banner">
          <p>
            از این بخش می‌توانید اقساط مشتریان را وصول
            کنید. اگر قسطی قبلاً وصول شده باشد، در لیست
            به‌صورت غیرفعال نمایش داده می‌شود.
          </p>
        </div>

        <section className="form-section">
          <h4>انتخاب مشتری و سفارش</h4>
          <div className="form-grid">
            <div>
              <label>مشتری</label>
              <select
                className="input"
                value={selectedCustomer}
                onChange={(e) => {
                  setSelectedCustomer(e.target.value);
                  setSelectedOrder("");
                  setSelectedInstallment(null);
                }}
              >
                <option value="">انتخاب مشتری...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>سفارش</label>
              <select
                className="input"
                value={selectedOrder}
                onChange={(e) => {
                  setSelectedOrder(e.target.value);
                  setSelectedInstallment(null);
                }}
              >
                <option value="">انتخاب سفارش...</option>
                {orders
                  .filter(
                    (o) =>
                      String(o.customerId) ===
                      String(selectedCustomer)
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      سفارش #{o.id} — مبلغ{" "}
                      {currency(o.total)} تومان
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </section>

        {selectedOrder &&
          (() => {
            const order = getOrder(selectedOrder);
            const insList = mapInstallmentsWithUid(order);
            return insList.length === 0 ? (
              <div
                className="muted"
                style={{ marginTop: 10 }}
              >
                این سفارش برنامهٔ اقساط ندارد.
              </div>
            ) : (
              <section className="form-section">
                <h4>انتخاب قسط</h4>
                <select
                  className="input"
                  value={selectedInstallment?._uid || ""}
                  onChange={(e) => {
                    const picked = insList.find(
                      (i) => i._uid === e.target.value
                    );
                    setSelectedInstallment(picked || null);
                  }}
                >
                  <option value="">
                    انتخاب قسط...
                  </option>
                  {insList.map((ins, i) => (
                    <option
                      key={ins._uid}
                      value={ins._uid}
                      disabled={isInstallmentCollected(
                        selectedOrder,
                        ins._uid
                      )}
                    >
                      {`قسط ${i + 1} — ${fmt(
                        ins.date
                      )} — ${currency(
                        ins.amount
                      )} تومان`}
                      {isInstallmentCollected(
                        selectedOrder,
                        ins._uid
                      )
                        ? " (وصول‌شده)"
                        : ""}
                    </option>
                  ))}
                </select>
              </section>
            );
          })()}
      </OverlayModal>
    </div>
  );
}
