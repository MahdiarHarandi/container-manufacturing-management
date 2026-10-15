// src/components/Workers.jsx
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Edit3, DollarSign } from "lucide-react";
import OverlayModal from "./OverlayModal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ShamsiDatePicker from "./ShamsiDatePicker";

const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

const defaultWorkerForm = () => ({
  name: "",
  role: "",
  baseSalary: 0,
  overtimeRate: 0,
  workedHours: 0,
  overtimeHours: 0,
});

export default function Workers({ data, setData, toast }) {
  const workers = data.workers || [];
  const wages = data.wages || [];
  const finance = data.finance || [];

  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultWorkerForm());
  const [paymentForm, setPaymentForm] = useState({
    workerId: "",
    date: todayISO(),
    amount: "",
  });

  const isEditing = Boolean(editingId);

  // ---------- افزودن / ویرایش کارگر ----------
  const validateWorker = () => {
    const name = String(form.name || "").trim();
    if (!name) {
      toast("نام کارگر را وارد کنید", { type: "error" });
      return null;
    }

    const baseSalary = +form.baseSalary || 0;
    if (!(baseSalary > 0)) {
      toast("حقوق پایه معتبر نیست", { type: "error" });
      return null;
    }

    return { ...form, name, baseSalary };
  };

  const handleSaveWorker = () => {
    const normalized = validateWorker();
    if (!normalized) return;

    if (isEditing) {
      setData((d) => ({
        ...d,
        workers: (d.workers || []).map((w) =>
          String(w.id) === String(editingId) ? { ...w, ...normalized } : w
        ),
      }));
      toast("اطلاعات کارگر ویرایش شد");
    } else {
      const id = crypto.randomUUID();
      setData((d) => ({
        ...d,
        workers: [...(d.workers || []), { id, ...normalized }],
      }));
      toast("کارگر جدید اضافه شد");
    }

    setForm(defaultWorkerForm());
    setEditingId(null);
    setShowAddWorker(false);
  };

  const openNewWorker = () => {
    setEditingId(null);
    setForm(defaultWorkerForm());
    setShowAddWorker(true);
  };

  const openEditWorker = (worker) => {
    setEditingId(worker.id);
    setForm({
      name: worker.name || "",
      role: worker.role || "",
      baseSalary: worker.baseSalary || 0,
      overtimeRate: worker.overtimeRate || 0,
      workedHours: worker.workedHours || 0,
      overtimeHours: worker.overtimeHours || 0,
    });
    setShowAddWorker(true);
  };

  // ---------- حذف کارگر ----------
  const handleDelete = (id) => {
    if (!window.confirm("آیا از حذف این کارگر مطمئن هستید؟")) return;
    const wid = String(id);

    setData((d) => ({
      ...d,
      workers: (d.workers || []).filter((w) => String(w.id) !== wid),
      wages: (d.wages || []).filter((p) => String(p.workerId) !== wid),
      // رکوردهای مالی مرتبط را نمی‌زنیم؛ برای صحت گزارش‌های مالی بهتر است باقی بمانند
    }));
    toast("کارگر حذف شد");
  };

  // ---------- محاسبه حقوق و باقی‌مانده ----------
  const enrichedWorkers = useMemo(() => {
    const base = (workers || []).map((w) => {
      const baseSalary = +w.baseSalary || 0;
      const overtimeHours = +w.overtimeHours || 0;
      const overtimeRate = +w.overtimeRate || 0;

      const totalPayable = baseSalary + overtimeHours * overtimeRate;

      const paid = (wages || [])
        .filter((p) => String(p.workerId) === String(w.id))
        .reduce((sum, p) => sum + (+p.amount || 0), 0);

      const remaining = totalPayable - paid;

      return { ...w, totalPayable, paid, remaining };
    });

    // اول کسانی که مانده دارند، بعد بقیه، و داخل هر گروه بر اساس نام
    return base.sort((a, b) => {
      const aHas = a.remaining > 0;
      const bHas = b.remaining > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "fa");
    });
  }, [workers, wages]);

  const getWorkerWithTotals = (workerId) =>
    enrichedWorkers.find((w) => String(w.id) === String(workerId));

  // ---------- ثبت پرداخت حقوق ----------
  const validatePayment = () => {
    const { workerId, date, amount } = paymentForm;

    if (!workerId) {
      toast("کارگر را انتخاب کنید", { type: "error" });
      return null;
    }
    if (!date) {
      toast("تاریخ پرداخت را انتخاب کنید", { type: "error" });
      return null;
    }
    const amt = Number(String(amount).replace(/[^\d]/g, "")) || 0;
    if (!(amt > 0)) {
      toast("مبلغ پرداخت معتبر نیست", { type: "error" });
      return null;
    }

    const workerTotals = getWorkerWithTotals(workerId);
    if (workerTotals) {
      if (workerTotals.remaining <= 0) {
        toast("این کارگر مانده پرداختی ندارد", { type: "error" });
        return null;
      }
      if (amt > workerTotals.remaining) {
        toast("مبلغ پرداخت نمی‌تواند بیشتر از مانده باشد", {
          type: "error",
        });
        return null;
      }
    }

    return { workerId, date, amount: amt };
  };

  const handlePay = () => {
    const valid = validatePayment();
    if (!valid) return;

    const { workerId, date, amount } = valid;

    setData((d) => {
      const worker = (d.workers || []).find(
        (w) => String(w.id) === String(workerId)
      );

      const newWages = [
        ...(d.wages || []),
        {
          id: crypto.randomUUID(),
          workerId: String(workerId),
          date,
          amount,
        },
      ];

      const newFinance = [
        ...(d.finance || []),
        {
          id: crypto.randomUUID(),
          date,
          type: "expense",
          method: "نقد",
          title: `پرداخت حقوق ${worker?.name || "کارگر"}`,
          amount,
          note: `ثبت حقوق از بخش کارگران${
            worker?.role ? ` (${worker.role})` : ""
          }`,
        },
      ];

      return { ...d, wages: newWages, finance: newFinance };
    });

    toast("پرداخت حقوق ثبت شد ✅");
    setPaymentForm({ workerId: "", date: todayISO(), amount: "" });
    setShowPay(false);
  };

  // ---------- نمودار پرداخت ماهانه ----------
  const wagesByMonth = useMemo(() => {
    const map = {};
    (wages || []).forEach((w) => {
      const key = String(w.date || "").slice(0, 7) || "نامشخص";
      map[key] = (map[key] || 0) + (+w.amount || 0);
    });
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [wages]);

  const totalPaid = (wages || []).reduce(
    (sum, w) => sum + (+w.amount || 0),
    0
  );

  // ---------- UI ----------
  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ===== لیست کارگران ===== */}
      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">
          <h3>کارگران</h3>
          <div className="row">
            <button className="btn" onClick={openNewWorker}>
              <Plus size={18} /> افزودن کارگر
            </button>
            <button
              className="btn primary"
              onClick={() => setShowPay(true)}
              disabled={workers.length === 0}
            >
              <DollarSign size={18} /> پرداخت جدید
            </button>
          </div>
        </div>

        {enrichedWorkers.length === 0 ? (
          <div
            style={{
              padding: "1rem",
              textAlign: "center",
              color: "var(--text-light)",
            }}
          >
            هنوز کارگری ثبت نشده است.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>سمت</th>
                <th>حقوق پایه</th>
                <th>ساعات کار</th>
                <th>ساعت اضافه‌کاری</th>
                <th>قابل پرداخت</th>
                <th>پرداخت‌شده</th>
                <th>مانده</th>
                <th style={{ textAlign: "right" }}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {enrichedWorkers.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.role || "—"}</td>
                  <td>{currency(w.baseSalary)}</td>
                  <td>{w.workedHours || 0}</td>
                  <td>{w.overtimeHours || 0}</td>
                  <td>{currency(w.totalPayable)}</td>
                  <td>{currency(w.paid)}</td>
                  <td
                    style={{
                      color:
                        w.remaining > 0
                          ? "var(--danger)"
                          : "var(--success)",
                    }}
                  >
                    {currency(w.remaining)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row">
                      <button
                        className="btn"
                        onClick={() => openEditWorker(w)}
                      >
                        <Edit3 size={16} /> ویرایش
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => handleDelete(w.id)}
                      >
                        <Trash2 size={16} /> حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== نمودار پرداخت‌های ماهانه ===== */}
      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">
          <h3>پرداخت‌های ماهانه حقوق</h3>
          <div className="pill">
            جمع کل پرداخت‌شده: {currency(totalPaid)} تومان
          </div>
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={wagesByMonth}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                formatter={(v) => `${currency(v)} تومان`}
                labelFormatter={(label) => `ماه: ${label}`}
              />
              <Bar
                dataKey="amount"
                radius={[6, 6, 0, 0]}
                fill="var(--primary)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== مودال افزودن / ویرایش کارگر ===== */}
      <OverlayModal
        open={showAddWorker}
        onClose={() => {
          setShowAddWorker(false);
          setEditingId(null);
          setForm(defaultWorkerForm());
        }}
        title={isEditing ? "ویرایش اطلاعات کارگر" : "افزودن کارگر جدید"}
        size="md"
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setShowAddWorker(false);
                setEditingId(null);
                setForm(defaultWorkerForm());
              }}
            >
              انصراف
            </button>
            <button className="btn primary" onClick={handleSaveWorker}>
              {isEditing ? "ذخیره تغییرات" : "ثبت"}
            </button>
          </>
        }
      >
        <div className="info-banner">
          <p>
            اطلاعات کارگر را وارد کنید. فیلدهای <b>نام</b> و{" "}
            <b>حقوق پایه</b> الزامی هستند.
          </p>
        </div>

        <section className="form-section">
          <h4>مشخصات کارگر</h4>
          <div className="form-grid">
            <div>
              <label>نام</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="مثلاً رضا احمدی"
                data-autofocus
              />
            </div>
            <div>
              <label>سمت / تخصص</label>
              <input
                className="input"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
                placeholder="مثلاً جوشکار"
              />
            </div>
          </div>
        </section>

        <section className="form-section" style={{ marginTop: 12 }}>
          <h4>اطلاعات حقوق</h4>
          <div className="form-grid">
            <div>
              <label>حقوق پایه (تومان)</label>
              <input
                type="number"
                className="input"
                value={form.baseSalary}
                onChange={(e) =>
                  setForm({
                    ...form,
                    baseSalary: Number(e.target.value) || 0,
                  })
                }
                placeholder="مثلاً ۸,۰۰۰,۰۰۰"
              />
            </div>
            <div>
              <label>نرخ اضافه‌کاری (تومان)</label>
              <input
                type="number"
                className="input"
                value={form.overtimeRate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    overtimeRate: Number(e.target.value) || 0,
                  })
                }
                placeholder="مثلاً ۵۰,۰۰۰"
              />
            </div>
            <div>
              <label>مقدار اضافه‌کاری</label>
              <input
                type="number"
                className="input"
                value={form.overtimeHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    overtimeHours: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label>ساعات کار ماهانه (اختیاری)</label>
              <input
                type="number"
                className="input"
                value={form.workedHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    workedHours: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
        </section>
      </OverlayModal>

      {/* ===== مودال پرداخت حقوق ===== */}
      <OverlayModal
        open={showPay}
        onClose={() => {
          setShowPay(false);
          setPaymentForm({
            workerId: "",
            date: todayISO(),
            amount: "",
          });
        }}
        title="ثبت پرداخت جدید"
        size="md"
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setShowPay(false);
                setPaymentForm({
                  workerId: "",
                  date: todayISO(),
                  amount: "",
                });
              }}
            >
              انصراف
            </button>
            <button
              className="btn primary"
              onClick={handlePay}
              disabled={!paymentForm.workerId}
            >
              ثبت پرداخت
            </button>
          </>
        }
      >
        <div className="info-banner">
          <p>
            اطلاعات پرداخت را وارد کنید.
          </p>
        </div>

        {/* خلاصه مالی کارگر انتخاب‌شده */}
        {paymentForm.workerId && (() => {
          const w = getWorkerWithTotals(paymentForm.workerId);
          if (!w) return null;

          const amountNum =
            Number(String(paymentForm.amount).replace(/[^\d]/g, "")) || 0;
          const remainingAfter = w.remaining - amountNum;

          return (
            <section className="form-section">
              <h4>خلاصه مالی کارگر</h4>

              <div
                className="card"
                style={{
                  padding: "12px",
                  background: "var(--bg-soft)",
                  marginBottom: "12px",
                  fontSize: ".9rem",
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span>قابل پرداخت:</span>
                  <b>{currency(w.totalPayable)} تومان</b>
                </div>

                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span>پرداخت‌شده:</span>
                  <b>{currency(w.paid)} تومان</b>
                </div>

                <div
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    color: "var(--danger)",
                  }}
                >
                  <span>مانده فعلی:</span>
                  <b>{currency(w.remaining)} تومان</b>
                </div>

                {paymentForm.amount && (
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      marginTop: 6,
                      color:
                        remainingAfter < 0
                          ? "var(--danger)"
                          : "var(--primary-dark)",
                    }}
                  >
                    <span>مانده پس از پرداخت:</span>
                    <b>
                      {remainingAfter < 0
                        ? "مبلغ بیشتر از مانده است!"
                        : currency(remainingAfter) + " تومان"}
                    </b>
                  </div>
                )}
              </div>

              {w.remaining > 0 && (
                <button
                  className="btn"
                  style={{ width: "100%", marginBottom: 12 }}
                  onClick={() =>
                    setPaymentForm({
                      ...paymentForm,
                      amount: String(w.remaining),
                    })
                  }
                >
                  پرداخت کل مانده ({currency(w.remaining)})
                </button>
              )}
            </section>
          );
        })()}

        {/* فرم پرداخت */}
        <section className="form-section">
          <h4>جزئیات پرداخت</h4>
          <div className="form-grid">
            <div>
              <label>کارگر</label>
              <select
                className="input"
                value={paymentForm.workerId}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    workerId: e.target.value,
                  })
                }
              >
                <option value="">انتخاب کنید...</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>تاریخ</label>
              <ShamsiDatePicker
                value={paymentForm.date}
                onChange={(v) =>
                  setPaymentForm({ ...paymentForm, date: v })
                }
                className="input"
              />
            </div>
            <div>
              <label>مبلغ (تومان)</label>
              <input
                className="input"
                inputMode="numeric"
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    amount: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
                placeholder="مثلاً ۵,۰۰۰,۰۰۰"
              />
            </div>
          </div>
        </section>
      </OverlayModal>
    </div>
  );
}
