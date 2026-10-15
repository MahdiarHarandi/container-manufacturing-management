// src/components/Purchases.jsx
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Edit3, Save, Package, Search } from "lucide-react";
import OverlayModal from "./OverlayModal";
import { applyInventoryDelta } from "../utils/inventoryOps";
import ShamsiDatePicker from "./ShamsiDatePicker";

// برای نمایش تاریخ شمسی در جدول
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

// تبدیل ISO (میلادی) به رشته شمسی برای UI
const formatShamsiDate = (iso) => {
  if (!iso) return "";
  try {
    const obj = new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    });
    return obj.format("YYYY/MM/DD");
  } catch {
    return iso;
  }
};

/**
 * Purchases.jsx
 * - ثبت خرید با اقلام
 * - همگام با انبار (applyInventoryDelta)
 * - ثبت هزینه در Finance
 * - ویرایش/حذف با rollback دقیق موجودی
 */
export default function Purchases({ data, setData, toast }) {
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // فرم خرید
  const [form, setForm] = useState({
    date: todayISO(), // به صورت ISO ذخیره می‌شود، ولی در UI شمسی نمایش می‌دهیم
    supplier: "",
    note: "",
    method: "نقد",
  });

  // rows: [{ existingId, name, unit, qty, unitPrice }]
  const [rows, setRows] = useState([]);
  const isEditing = Boolean(editingId);

  const inventory = data.inventory || [];
  const inventoryMap = useMemo(
    () => Object.fromEntries(inventory.map((i) => [String(i.id), i])),
    [inventory]
  );

  const resetForm = () => {
    setForm({
      date: todayISO(),
      supplier: "",
      note: "",
      method: "نقد",
    });
    setRows([]);
    setEditingId(null);
  };

  const total = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0),
        0
      ),
    [rows]
  );

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        existingId: "",
        name: "",
        unit: "عدد",
        qty: "",
        unitPrice: "",
      },
    ]);

  const removeRow = (idx) =>
    setRows((rs) => rs.filter((_, i) => i !== idx));

  const updateRow = (idx, patch) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const openCreate = () => {
    resetForm();
    setShow(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({
      date: p.date || todayISO(),
      supplier: p.supplier || "",
      note: p.note || "",
      method: p.method || "نقد",
    });

    setRows(
      (p.items || []).map((it) => ({
        existingId: it.inventoryId || "",
        name: it.name || "",
        unit: it.unit || "عدد",
        qty: String(it.qty ?? ""),
        unitPrice: String(it.unitPrice ?? ""),
      }))
    );
    setShow(true);
  };

  // ---------- اعتبارسنجی ----------
  const validate = () => {
    if (!form.supplier.trim()) {
      toast("تأمین‌کننده را وارد کنید", { type: "error" });
      return false;
    }
    if (!form.date) {
      toast("تاریخ خرید را انتخاب کنید", { type: "error" });
      return false;
    }
    if (rows.length === 0) {
      toast("حداقل یک قلم کالا اضافه کنید", { type: "error" });
      return false;
    }

    for (const [i, r] of rows.entries()) {
      const inv = r.existingId ? inventoryMap[r.existingId] : null;
      const name = (inv?.name || r.name || "").trim();

      if (!name) {
        toast(`نام کالا در ردیف ${i + 1} خالی است`, {
          type: "error",
        });
        return false;
      }

      const qtyNum = Number(r.qty);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        toast(`تعداد معتبر نیست (ردیف ${i + 1})`, {
          type: "error",
        });
        return false;
      }

      const priceNum = Number(r.unitPrice);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        toast(`قیمت واحد معتبر نیست (ردیف ${i + 1})`, {
          type: "error",
        });
        return false;
      }
    }

    return true;
  };

  // ---------- ذخیره خرید ----------
  const save = () => {
    if (!validate()) return;

    setData((d) => {
      let inventory = [...(d.inventory || [])];
      let purchases = [...(d.purchases || [])];
      let finance = [...(d.finance || [])];

      const currentPurchases = d.purchases || [];
      const currentFinance = d.finance || [];

      let pid = editingId ? String(editingId) : crypto.randomUUID();
      let financeId = null;

      // ۱) اگر در حال ویرایش هستیم، موجودی قبلی را rollback کن و financeId قدیمی را نگه دار
      if (isEditing) {
        const old = currentPurchases.find((x) => String(x.id) === String(editingId));
        if (old) {
          const { inventory: invRollback } = applyInventoryDelta(
            inventory,
            (old.items || []).map((it) => ({
              inventoryId: it.inventoryId,
              name: it.name,
              unit: it.unit,
              qty: it.qty,
            })),
            -1
          );
          inventory = invRollback;
          financeId = old.financeId || null;
        }
      }

      // ۲) اعمال اقلام جدید به انبار
      const sourceItems = rows.map((r) => {
        const inv = r.existingId
          ? inventory.find((i) => String(i.id) === String(r.existingId))
          : null;
        return {
          inventoryId: r.existingId || null,
          name: inv?.name || r.name,
          unit: inv?.unit || r.unit || "عدد",
          qty: Number(r.qty) || 0,
        };
      });

      const { inventory: invAfter, items: normalized } =
        applyInventoryDelta(inventory, sourceItems, +1);
      inventory = invAfter;

      // ۳) ساخت و نهایی‌سازی purchase + finance
      if (!financeId) financeId = crypto.randomUUID();

      const purchaseItems = normalized.map((n, idx) => {
        const invItem = inventory.find(
          (i) => String(i.id) === String(n.inventoryId)
        );
        const row = rows[idx];

        return {
          inventoryId: String(n.inventoryId),
          name: invItem?.name || n.name || row.name,
          unit: invItem?.unit || n.unit || row.unit || "عدد",
          qty: Number(row.qty) || 0,
          unitPrice: Number(row.unitPrice) || 0,
        };
      });

      const purchaseObj = {
        id: String(pid),
        date: form.date, // ذخیره ISO، نمایش شمسی
        supplier: form.supplier.trim(),
        note: form.note?.trim() || "",
        method: form.method,
        items: purchaseItems,
        total,
        financeId: String(financeId),
      };

      // upsert خرید
      const existed = currentPurchases.some((p) => String(p.id) === String(pid));
      purchases = existed
        ? currentPurchases.map((p) =>
            String(p.id) === String(pid) ? purchaseObj : p
          )
        : [...currentPurchases, purchaseObj];

      // upsert رکورد مالی
      const finObj = {
        id: String(financeId),
        date: form.date, // همان ISO، در UI می‌توانی شمسی نشان بدهی
        type: "expense",
        title: `خرید از ${form.supplier}`,
        amount: total,
        method: form.method,
      };

      const finExists = currentFinance.some(
        (f) => String(f.id) === String(financeId)
      );
      finance = finExists
        ? currentFinance.map((f) =>
            String(f.id) === String(financeId) ? finObj : f
          )
        : [...currentFinance, finObj];

      toast(isEditing ? "خرید ویرایش شد" : "خرید ثبت شد");

      return { ...d, inventory, purchases, finance };
    });

    setShow(false);
    resetForm();
  };

  // ---------- حذف خرید + rollback ----------
  const removePurchase = (p) => {
    if (
      !window.confirm(
        "حذف این خرید؟ با این کار موجودیِ افزوده‌شده نیز کسر می‌شود."
      )
    )
      return;

    setData((d) => {
      let inventory = [...(d.inventory || [])];
      let purchases = [...(d.purchases || [])];
      let finance = [...(d.finance || [])];

      const target = purchases.find(
        (x) => String(x.id) === String(p.id)
      );
      if (target) {
        const { inventory: invRollback } = applyInventoryDelta(
          inventory,
          (target.items || []).map((it) => ({
            inventoryId: it.inventoryId,
            name: it.name,
            unit: it.unit,
            qty: it.qty,
          })),
          -1
        );
        inventory = invRollback;

        finance = finance.filter(
          (f) => String(f.id) !== String(target.financeId)
        );
      }

      purchases = purchases.filter(
        (x) => String(x.id) !== String(p.id)
      );
      toast("حذف شد");

      return { ...d, inventory, purchases, finance };
    });
  };

  // ---------- لیست و فیلتر ----------
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    let arr = [...(data.purchases || [])];
    if (q.trim()) {
      arr = arr.filter(
        (p) =>
          p.supplier.includes(q) ||
          (p.note || "").includes(q)
      );
    }
    // مرتب‌سازی بر اساس ISO (که در واقع تاریخ میلادی است)
    return arr.sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [data.purchases, q]);

  // ===================== UI اصلی =====================
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-title">
        <h3>خریدها</h3>
        <div className="row">
          <div className="row" style={{ alignItems: "center" }}>
            <Search size={16} style={{ opacity: 0.6 }} />
            <input
              className="input"
              placeholder="جستجوی تأمین‌کننده یا یادداشت..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 220, paddingLeft: 26 }}
            />
          </div>
          <button className="btn primary" onClick={openCreate}>
            <Plus size={18} /> افزودن خرید
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--sub)",
          }}
        >
          هیچ خریدی ثبت نشده است.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>تأمین‌کننده</th>
              <th>مبلغ</th>
              <th>اقلام</th>
              <th>یادداشت</th>
              <th style={{ textAlign: "right" }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{formatShamsiDate(p.date)}</td>
                <td>{p.supplier}</td>
                <td>{currency(p.total)}</td>
                <td>
                  <div
                    className="row"
                    style={{ flexWrap: "wrap", gap: 6 }}
                  >
                    {p.items?.map((it, i) => (
                      <span key={i} className="pill">
                        <Package size={14} /> {it.name} × {it.qty}
                      </span>
                    ))}
                  </div>
                </td>
                <td
                  style={{
                    maxWidth: 220,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "var(--sub)",
                  }}
                  title={p.note || ""}
                >
                  {p.note || "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div className="row">
                    <button
                      className="btn"
                      onClick={() => openEdit(p)}
                    >
                      <Edit3 size={16} /> ویرایش
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => removePurchase(p)}
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

      {/* ================= Modal ================= */}
      <OverlayModal
        open={show}
        onClose={() => {
          setShow(false);
          resetForm();
        }}
        title={isEditing ? "ویرایش خرید" : "ثبت خرید جدید"}
        size="lg"
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setShow(false);
                resetForm();
              }}
            >
              انصراف
            </button>
            <button className="btn primary" onClick={save}>
              <Save size={16} />{" "}
              {isEditing ? "ذخیره تغییرات" : "ثبت خرید"}
            </button>
          </>
        }
      >
        {/* راهنمای فرم */}
        <div className="info-banner">
          <p>
            اطلاعات خرید را وارد کنید. در صورت انتخاب کالا از انبار، موجودی
            آن به‌صورت خودکار افزایش خواهد یافت.
          </p>
        </div>

        {/* مشخصات خرید */}
        <section className="form-section">
          <h4>مشخصات خرید</h4>
          <div className="form-grid">
            <div>
              <label>تاریخ خرید</label>
              <ShamsiDatePicker
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                className="input"
              />
            </div>
            <div>
              <label>تأمین‌کننده</label>
              <input
                className="input"
                placeholder="نام تأمین‌کننده..."
                value={form.supplier}
                onChange={(e) =>
                  setForm({ ...form, supplier: e.target.value })
                }
              />
            </div>
            <div>
              <label>روش پرداخت</label>
              <select
                className="input"
                value={form.method}
                onChange={(e) =>
                  setForm({ ...form, method: e.target.value })
                }
              >
                <option value="نقد">نقد</option>
                <option value="کارت">کارت</option>
                <option value="چک">چک</option>
              </select>
            </div>
            <div>
              <label>یادداشت (اختیاری)</label>
              <input
                className="input"
                placeholder="توضیح کوتاه درباره خرید..."
                value={form.note}
                onChange={(e) =>
                  setForm({ ...form, note: e.target.value })
                }
              />
            </div>
          </div>
        </section>

        {/* اقلام خرید */}
        <section
          className="form-section"
          style={{ marginTop: 18 }}
        >
          <div className="section-title">
            <h4>اقلام خرید</h4>
            <button className="btn" onClick={addRow}>
              <Plus size={16} /> افزودن قلم
            </button>
          </div>

          <div
            className="template-lines-card"
            style={{ overflowX: "auto", marginTop: 8 }}
          >
			<table
			  style={{
				width: "100%",
				tableLayout: "fixed",
				borderCollapse: "collapse",
			  }}
			>
			  <thead>
				<tr>
				  <th style={{ width: 120, minWidth: 100 }}>کالای موجود</th>
				  <th style={{ width: 140, minWidth: 120 }}>یا نام جدید</th>
				  <th style={{ width: 90 }}>واحد</th>
				  <th style={{ width: 50 }}>تعداد</th>
				  <th style={{ width: 90 }}>قیمت</th>
				  <th style={{ width: 70 }}>جمع</th>
				  <th style={{ width: 50, textAlign: "center" }}>عملیات</th>
				</tr>
			  </thead>

			  <tbody>
				{rows.map((r, idx) => {
				  const inv = r.existingId ? inventoryMap[r.existingId] : null;
				  const unitResolved = inv?.unit ?? r.unit ?? "عدد";
				  const lineTotal = (Number(r.qty) || 0) * (Number(r.unitPrice) || 0);

				  return (
					<tr key={idx}>
					  {/* کالای موجود */}
					  <td>
						<select
						  className="input compact-input"
						  value={r.existingId}
						  onChange={(e) =>
							updateRow(idx, {
							  existingId: e.target.value,
							  name: "",
							})
						  }
						>
						  <option value="">— انتخاب —</option>
						  {inventory.map((i) => (
							<option key={i.id} value={i.id}>
							  {i.name}
							</option>
						  ))}
						</select>
					  </td>

					  {/* نام جدید */}
					  <td>
						<input
						  className="input compact-input"
						  placeholder="اقلام جدید..."
						  value={r.name}
						  onChange={(e) =>
							updateRow(idx, {
							  name: e.target.value,
							  ...(e.target.value.trim() ? { existingId: "" } : {}),
							})
						  }
						/>
					  </td>

					  {/* واحد */}
					  <td>
						<input
						  className="input compact-input"
						  placeholder="عدد / کیلوگرم"
						  value={unitResolved}
						  onChange={(e) => updateRow(idx, { unit: e.target.value })}
						  disabled={!!inv}
						/>
					  </td>

					  {/* تعداد */}
					  <td>
						<input
						  className="input compact-input"
						  inputMode="numeric"
						  value={r.qty}
						  onChange={(e) =>
							updateRow(idx, {
							  qty: e.target.value.replace(/[^\d]/g, ""),
							})
						  }
						/>
					  </td>

					  {/* قیمت */}
					  <td>
						<input
						  className="input compact-input"
						  inputMode="numeric"
						  value={r.unitPrice}
						  onChange={(e) =>
							updateRow(idx, {
							  unitPrice: e.target.value.replace(/[^\d]/g, ""),
							})
						  }
						/>
					  </td>

					  {/* جمع */}
					  <td>{currency(lineTotal)}</td>

					  {/* عملیات */}
					  <td style={{ textAlign: "center" }}>
						<button
						  className="btn danger"
						  onClick={() => removeRow(idx)}
						>
						  <Trash2 size={14} />
						</button>
					  </td>
					</tr>
				  );
				})}
			  </tbody>
			</table>
          </div>

          <div
            className="row total-footer"
            style={{
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "12px 16px",
              marginTop: "8px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="pill primary" style={{ fontSize: "0.95rem" }}>
              جمع کل خرید: <b>{currency(total)}</b> تومان
            </div>
          </div>
        </section>
      </OverlayModal>
    </div>
  );
}
