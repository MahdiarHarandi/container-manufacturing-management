// src/components/Customers.jsx
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Edit3, Search, Eye } from "lucide-react";
import OverlayModal from "./OverlayModal";
import { computeCustomerDebt } from "../utils/accounting";

const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);

const normalizeName = (str) =>
  String(str || "")
    .trim()
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/\s+/g, " ");

const normalizePhone = (str) => String(str || "").replace(/\D/g, "");

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR").format(dt);
};

export default function Customers({ data, setData, toast }) {
  const customersRaw = data.customers || [];
  const orders = data.orders || [];
  const checks = data.checks || [];
  const finance = data.finance || [];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [query, setQuery] = useState("");
  const [detailsId, setDetailsId] = useState(null);

  // --- محاسبه آمار کلی و غنی‌سازی مشتریان ---
  const {
    enrichedCustomers,
    totalCustomers,
    totalDebt,
    totalPendingChecks,
  } = useMemo(() => {
    let totalDebtAcc = 0;
    let totalPendingAcc = 0;

    const enriched = customersRaw.map((c) => {
      const { debt, pendingChecks } = computeCustomerDebt(data, c.id);

      totalDebtAcc += debt || 0;
      totalPendingAcc += pendingChecks || 0;

      const customerOrders = orders.filter(
        (o) => String(o.customerId) === String(c.id)
      );
      const orderCount = customerOrders.length;
      const lastOrder = customerOrders.reduce(
        (max, o) =>
          !max || new Date(o.date) > new Date(max.date) ? o : max,
        null
      );

      return {
        ...c,
        debt,
        pendingChecks,
        orderCount,
        lastOrderDate: lastOrder ? lastOrder.date : null,
      };
    });

    // مرتب‌سازی: اول بر اساس بدهی (بیشتر → بالاتر)، سپس نام
    enriched.sort((a, b) => {
      if ((b.debt || 0) !== (a.debt || 0)) {
        return (b.debt || 0) - (a.debt || 0);
      }
      return normalizeName(a.name).localeCompare(
        normalizeName(b.name),
        "fa"
      );
    });

    return {
      enrichedCustomers: enriched,
      totalCustomers: customersRaw.length,
      totalDebt: totalDebtAcc,
      totalPendingChecks: totalPendingAcc,
    };
  }, [data]);

  // --- فیلتر بر اساس جستجو ---
  const customersFiltered = useMemo(() => {
    const q = query.trim();
    if (!q) return enrichedCustomers;

    const qName = normalizeName(q);
    const qPhone = normalizePhone(q);

    return enrichedCustomers.filter((c) => {
      const nameNorm = normalizeName(c.name);
      const phoneNorm = normalizePhone(c.phone);
      return (
        (qName && nameNorm.includes(qName)) ||
        (qPhone && phoneNorm.includes(qPhone))
      );
    });
  }, [enrichedCustomers, query]);

  const resetForm = () => {
    setForm({ name: "", phone: "" });
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
    });
    setShowForm(true);
  };

  const openDetails = (customer) => {
    setDetailsId(customer.id);
  };

  const closeDetails = () => setDetailsId(null);

  // --- اعتبارسنجی فرم مشتری ---
  const validate = () => {
    const nameNorm = normalizeName(form.name);
    const phoneNorm = normalizePhone(form.phone);

    if (!nameNorm) {
      toast("نام مشتری را وارد کنید", { type: "error" });
      return null;
    }

    const conflict = customersRaw.find((c) => {
      if (editingId && String(c.id) === String(editingId)) return false;
      const cName = normalizeName(c.name);
      const cPhone = normalizePhone(c.phone);
      return (
        (nameNorm && cName === nameNorm) ||
        (phoneNorm && phoneNorm.length > 0 && cPhone === phoneNorm)
      );
    });

    if (conflict) {
      toast("مشتری دیگری با همین نام یا شماره تماس ثبت شده است", {
        type: "error",
      });
      return null;
    }

    return { name: nameNorm, phone: phoneNorm };
  };

  // --- ذخیره مشتری ---
  const handleSubmit = () => {
    const normalized = validate();
    if (!normalized) return;

    const { name, phone } = normalized;

    if (editingId) {
      setData((d) => ({
        ...d,
        customers: (d.customers || []).map((c) =>
          String(c.id) === String(editingId) ? { ...c, name, phone } : c
        ),
      }));
      toast("اطلاعات مشتری ویرایش شد", { type: "success" });
    } else {
      const newCustomer = {
        id: crypto.randomUUID(),
        name,
        phone,
      };
      setData((d) => ({
        ...d,
        customers: [...(d.customers || []), newCustomer],
      }));
      toast("مشتری جدید با موفقیت اضافه شد", { type: "success" });
    }

    setShowForm(false);
    resetForm();
  };

  // --- حذف مشتری ---
  const handleDelete = (id) => {
    const cid = String(id);

    const hasOrders = orders.some(
      (o) => String(o.customerId) === cid
    );
    const hasFinance = (finance || []).some(
      (f) => String(f.customerId) === cid
    );
    const hasChecks = (checks || []).some(
      (ch) => String(ch.customerId) === cid
    );

    if (hasOrders || hasFinance || hasChecks) {
      toast(
        "امکان حذف این مشتری وجود ندارد؛ این مشتری دارای سفارش یا تراکنش مالی/چک ثبت‌شده است.",
        { type: "error" }
      );
      return;
    }

    if (!window.confirm("آیا از حذف این مشتری مطمئن هستید؟")) return;

    setData((d) => ({
      ...d,
      customers: (d.customers || []).filter(
        (c) => String(c.id) !== cid
      ),
    }));
    toast("مشتری حذف شد", { type: "success" });
  };

  // --- داده‌های مشتری انتخاب‌شده برای جزئیات ---
  const selectedCustomer =
    detailsId &&
    enrichedCustomers.find((c) => String(c.id) === String(detailsId));

  const selectedCustomerOrders =
    selectedCustomer &&
    orders
      .filter((o) => String(o.customerId) === String(selectedCustomer.id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* ===== هدر و نوار ابزار ===== */}
      <div className="section-title">
        <h3>مشتریان</h3>
        <div className="row">
          <div
            className="row"
            style={{ alignItems: "center", gap: 6 }}
          >
            <Search size={16} style={{ opacity: 0.6 }} />
            <input
              className="input"
              placeholder="جستجوی نام یا تلفن..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
          <button className="btn primary" onClick={openNew}>
            <Plus size={18} /> افزودن مشتری
          </button>
        </div>
      </div>

      {/* ===== خلاصه آماری بالای جدول ===== */}
      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="pill">
          تعداد مشتریان: <b>{totalCustomers}</b>
        </div>
        <div className="pill">
          مجموع بدهی ثبت‌شده: <b>{currency(totalDebt)}</b> تومان
        </div>
        <div className="pill">
          چک‌های در انتظار: <b>{currency(totalPendingChecks)}</b> تومان
        </div>
      </div>

      {/* ===== جدول مشتریان ===== */}
      {customersFiltered.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--sub)",
          }}
        >
          هیچ مشتری یافت نشد.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>نام مشتری</th>
              <th>شماره تماس</th>
              <th>تعداد سفارش‌ها</th>
              <th>بدهی (تومان)</th>
              <th>چک‌های در انتظار</th>
              <th style={{ textAlign: "right" }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {customersFiltered.map((c) => (
              <tr key={c.id}>
                <td>
                  <button
                    className="link-button"
                    onClick={() => openDetails(c)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--primary)",
                    }}
                  >
                    {c.name}
                  </button>
                </td>
                <td>{c.phone || "—"}</td>
                <td>{c.orderCount || 0}</td>
                <td
                  style={{
                    color:
                      c.debt > 0
                        ? "var(--danger)"
                        : "var(--success)",
                  }}
                >
                  {currency(c.debt || 0)}
                </td>
                <td>
                  {c.pendingChecks
                    ? currency(c.pendingChecks)
                    : "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div className="row">
                    <button
                      className="btn"
                      onClick={() => openDetails(c)}
                    >
                      <Eye size={16} /> جزئیات
                    </button>
                    <button
                      className="btn"
                      onClick={() => openEdit(c)}
                    >
                      <Edit3 size={16} /> ویرایش
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => handleDelete(c.id)}
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

      {/* ===== مودال افزودن / ویرایش مشتری ===== */}
      <OverlayModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editingId ? "ویرایش مشتری" : "افزودن مشتری جدید"}
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              انصراف
            </button>
            <button className="btn primary" onClick={handleSubmit}>
              {editingId ? "ذخیره تغییرات" : "ثبت مشتری"}
            </button>
          </>
        }
      >
        {/* 💡 راهنمای فرم */}
        <div className="info-banner">
          <p>
            لطفاً اطلاعات مشتری را به‌دقت وارد کنید. در صورت ثبت
            شماره تماس، از تکرار نام یا تلفن جلوگیری می‌شود.
          </p>
        </div>

        {/* 👤 اطلاعات مشتری */}
        <section className="form-section">
          <h4>مشخصات مشتری</h4>
          <div className="form-grid">
            <div>
              <label>نام کامل</label>
              <input
                className="input"
                placeholder="مثلاً علی رضایی"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                data-autofocus
              />
            </div>
            <div>
              <label>شماره تماس (اختیاری)</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="0912XXXXXXX"
                maxLength={11}
                value={form.phone}
                onChange={(e) => {
                  const val = normalizePhone(e.target.value);
                  if (val.length <= 11)
                    setForm({ ...form, phone: val });
                }}
              />
            </div>
          </div>
        </section>
      </OverlayModal>

      {/* ===== مودال جزئیات مشتری ===== */}
      <OverlayModal
        open={Boolean(selectedCustomer)}
        onClose={closeDetails}
        title={
          selectedCustomer
            ? `جزئیات مشتری: ${selectedCustomer.name}`
            : "جزئیات مشتری"
        }
        size="lg"
        footer={
          <>
            <button className="btn" onClick={closeDetails}>
              بستن
            </button>
            {selectedCustomer && (
              <button
                className="btn primary"
                onClick={() => {
                  closeDetails();
                  openEdit(selectedCustomer);
                }}
              >
                ویرایش
              </button>
            )}
          </>
        }
      >
        {selectedCustomer && (
          <>
            <section className="form-section">
              <h4>اطلاعات پایه</h4>
              <div className="form-grid">
                <div>
                  <label>نام و نام خانوادگی:</label>
                  <div>{selectedCustomer.name}</div>
                </div>
                <div>
                  <label>شماره تماس:</label>
                  <div>{selectedCustomer.phone || "—"}</div>
                </div>
                <div>
                  <label>تعداد سفارش‌ها:</label>
                  <div>{selectedCustomer.orderCount || 0}</div>
                </div>
                <div>
                  <label>آخرین سفارش:</label>
                  <div>{formatDate(selectedCustomer.lastOrderDate)}</div>
                </div>
              </div>
            </section>

            <section className="form-section" style={{ marginTop: 12 }}>
              <h4>وضعیت مالی</h4>
              <div className="form-grid">
                <div>
                  <label>بدهی جاری</label>
                  <div
                    style={{
                      color:
                        selectedCustomer.debt > 0
                          ? "var(--danger)"
                          : "var(--success)",
                    }}
                  >
                    {currency(selectedCustomer.debt || 0)} تومان
                  </div>
                </div>
                <div>
                  <label>چک‌های در انتظار</label>
                  <div>
                    {currency(selectedCustomer.pendingChecks || 0)} تومان
                  </div>
                </div>
              </div>
            </section>

            <section className="form-section" style={{ marginTop: 12 }}>
              <h4>آخرین سفارش‌ها</h4>
              {selectedCustomerOrders && selectedCustomerOrders.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>تاریخ</th>
                      <th>مبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomerOrders.map((o) => (
                      <tr key={o.id}>
                        <td>{formatDate(o.date)}</td>
                        <td>{currency(o.total || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div
                  style={{
                    padding: "0.75rem 0",
                    color: "var(--text-light)",
                  }}
                >
                  سفارشی برای این مشتری ثبت نشده است.
                </div>
              )}
            </section>
          </>
        )}
      </OverlayModal>
    </div>
  );
}
