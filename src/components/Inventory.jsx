// src/components/Inventory.jsx
import React, { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
} from "lucide-react";
import OverlayModal from "./OverlayModal";
import { pushAudit } from "../utils/audit";
import { normalizeName } from "../utils/inventoryOps";

const makeId = () =>
  (typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.randomUUID === "function" &&
    window.crypto.randomUUID()) ||
  `inv_${Date.now()}_${Math.floor(Math.random() * 999999)}`;

const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);

export default function Inventory({ data, setData, toast }) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showEnter, setShowEnter] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("");

  const [newForm, setNewForm] = useState({
    name: "",
    unit: "عدد",
    price: "",
    stock: "",
    min: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    unit: "عدد",
    price: "",
    min: "",
  });

  const inventory = data.inventory || [];
  const pick = (id) => inventory.find((i) => i.id === id);

  // ---------- فیلتر و مرتب‌سازی ----------
  const filteredInventory = useMemo(() => {
    const q = query.trim();
    let arr = inventory;

    if (q) {
      const qq = normalizeName(q);
      arr = arr.filter(
        (i) =>
          normalizeName(i.name).includes(qq) ||
          normalizeName(i.unit || "").includes(qq)
      );
    }

    return [...arr].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "fa")
    );
  }, [inventory, query]);

  // ---------- آمار کلی ----------
  const totalValue = useMemo(
    () =>
      inventory.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.stock) || 0),
        0
      ),
    [inventory]
  );

  const lowCount = useMemo(
    () =>
      inventory.filter(
        (i) => (Number(i.stock) || 0) < (Number(i.min) || 0)
      ).length,
    [inventory]
  );

  // ---------- باز کردن مودال‌ها ----------
  const openEnter = (id) => {
    const it = pick(id);
    if (!it) return;
    setSelected(it);
    setQty("");
    setShowEnter(true);
  };

  const openExit = (id) => {
    const it = pick(id);
    if (!it) return;
    setSelected(it);
    setQty("");
    setShowExit(true);
  };

  const openEdit = (id) => {
    const it = pick(id);
    if (!it) return;
    setSelected(it);
    setEditForm({
      name: it.name,
      unit: it.unit,
      price: String(it.price ?? ""),
      min: String(it.min ?? ""),
    });
    setShowEdit(true);
  };

  // ---------- ورود کالا ----------
  const doEnter = () => {
    const qNum = Number(qty);
    if (!Number.isFinite(qNum) || qNum <= 0)
      return toast("تعداد معتبر نیست", { type: "error" });

    setData((d) => ({
      ...d,
      inventory: (d.inventory || []).map((i) =>
        i.id === selected.id
          ? { ...i, stock: (Number(i.stock) || 0) + qNum }
          : i
      ),
    }));

    pushAudit(setData, {
      type: "INVENTORY_ENTER",
      message: `ورود ${qNum} ${selected.unit} از ${selected.name}`,
      payload: { id: selected.id, qty: qNum },
    });

    toast(`${qNum} ${selected.unit} ${selected.name} وارد شد`);
    setShowEnter(false);
  };

  // ---------- خروج کالا ----------
  const doExit = () => {
    const qNum = Number(qty);
    if (!Number.isFinite(qNum) || qNum <= 0)
      return toast("تعداد معتبر نیست", { type: "error" });

    const item = pick(selected.id);
    const current = Number(item?.stock) || 0;

    if (current < qNum)
      return toast("موجودی کافی نیست", { type: "error" });

    // هشدار تأیید کاهش زیر حداقل
    if (current - qNum < Number(item.min)) {
      const ok = window.confirm(
        `⚠ با این خروج، موجودی ${item.name} کمتر از حداقل تعیین‌شده می‌شود. ادامه می‌دهید؟`
      );
      if (!ok) return;
    }

    setData((d) => {
      const updated = (d.inventory || []).map((i) =>
        i.id === selected.id
          ? { ...i, stock: Math.max(0, (Number(i.stock) || 0) - qNum) }
          : i
      );

      return { ...d, inventory: updated };
    });

    pushAudit(setData, {
      type: "INVENTORY_EXIT",
      message: `خروج ${qNum} ${selected.unit} از ${selected.name}`,
      payload: { id: selected.id, qty: qNum },
    });

    toast(`${qNum} ${selected.unit} از ${selected.name} خارج شد`);
    setShowExit(false);
  };

  // ---------- ویرایش کالا ----------
  const doEdit = () => {
    const { name, unit, price, min } = editForm;
    const p = Number(price);
    const m = Number(min);

    if (!name.trim()) return toast("نام کالا الزامی است", { type: "error" });
    if (!unit.trim()) return toast("واحد الزامی است", { type: "error" });
    if (!Number.isFinite(p) || p <= 0) return toast("قیمت معتبر نیست", { type: "error" });
    if (!Number.isFinite(m) || m < 0) return toast("حداقل موجودی معتبر نیست", { type: "error" });

    // جلوگیری از تکراری شدن کالا
    if (
      inventory.some(
        (i) =>
          i.id !== selected.id &&
          normalizeName(i.name) === normalizeName(name) &&
          String(i.unit).trim() === unit.trim()
      )
    ) {
      return toast("کالایی با همین نام و واحد وجود دارد", { type: "warning" });
    }

    setData((d) => ({
      ...d,
      inventory: (d.inventory || []).map((i) =>
        i.id === selected.id
          ? { ...i, name, unit, price: p, min: m }
          : i
      ),
    }));

    pushAudit(setData, {
      type: "INVENTORY_EDIT",
      message: `ویرایش کالا ${name}`,
      payload: { id: selected.id, name, unit, price: p, min: m },
    });

    toast("ویرایش انجام شد");
    setShowEdit(false);
  };

  // ---------- افزودن کالا ----------
  const addNew = () => {
    const n = newForm.name.trim();
    const u = newForm.unit.trim();
    const p = Number(newForm.price);
    const s = Number(newForm.stock || "0");
    const m = Number(newForm.min || "0");

    if (!n) return toast("نام کالا الزامی است", { type: "error" });
    if (!u) return toast("واحد الزامی است", { type: "error" });

    if (
      inventory.some(
        (i) =>
          normalizeName(i.name) === normalizeName(n) &&
          String(i.unit).trim() === u
      )
    ) {
      return toast("این کالا قبلاً ثبت شده است", { type: "warning" });
    }

    if (!Number.isFinite(p) || p <= 0)
      return toast("قیمت معتبر نیست", { type: "error" });
    if (!Number.isFinite(s) || s < 0)
      return toast("موجودی اولیه معتبر نیست", { type: "error" });
    if (!Number.isFinite(m) || m < 0)
      return toast("حداقل موجودی معتبر نیست", { type: "error" });

    setData((d) => ({
      ...d,
      inventory: [
        ...(d.inventory || []),
        {
          id: makeId(),
          name: n,
          unit: u,
          price: p,
          stock: s,
          min: m,
        },
      ],
    }));

    pushAudit(setData, {
      type: "INVENTORY_ADD",
      message: `افزودن کالای جدید ${n}`,
      payload: { name: n, unit: u, price: p, stock: s, min: m },
    });

    toast(`کالای ${n} اضافه شد`);

    setNewForm({
      name: "",
      unit: "عدد",
      price: "",
      stock: "",
      min: "",
    });

    setShowNew(false);
  };

  // ---------- UI ----------
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-title">
        <h3>مدیریت انبار</h3>
        <div className="row">
          <div className="row" style={{ alignItems: "center" }}>
            <Search size={16} style={{ opacity: 0.6 }} />
            <input
              className="input"
              placeholder="جستجوی نام یا واحد..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Plus size={18} /> افزودن کالا
          </button>
        </div>
      </div>

      {/* --- آمار کلی --- */}
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <div className="pill" style={{ background: "rgba(37,99,235,0.1)" }}>
          موجودی کل: {currency(totalValue)} تومان
        </div>
        <div
          className="pill"
          style={{
            background: "rgba(239,68,68,0.1)",
            color: "var(--danger)",
          }}
        >
          <AlertTriangle size={14} /> اقلام کم‌موجودی: {lowCount}
        </div>
      </div>

      {/* --- جدول --- */}
      {filteredInventory.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--sub)",
          }}
        >
          هیچ کالایی یافت نشد.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>نام کالا</th>
              <th>واحد</th>
              <th>قیمت واحد</th>
              <th>موجودی</th>
              <th>حداقل</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((i) => {
              const low = (Number(i.stock) || 0) < (Number(i.min) || 0);
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.unit}</td>
                  <td>{currency(i.price)}</td>
                  <td>{i.stock}</td>
                  <td>{i.min}</td>
                  <td>
                    {low ? (
                      <span
                        className="pill"
                        style={{
                          background: "rgba(239,68,68,.12)",
                          borderColor: "rgba(239,68,68,.4)",
                          color: "var(--danger)",
                        }}
                      >
                        کمبود موجودی
                      </span>
                    ) : (
                      <span
                        className="pill"
                        style={{
                          background: "rgba(34,197,94,.1)",
                          color: "var(--success)",
                        }}
                      >
                        عادی
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <div className="row">
                      <button className="btn" onClick={() => openEnter(i.id)}>
                        <ArrowDownToLine size={14} /> ورود
                      </button>
                      <button className="btn" onClick={() => openExit(i.id)}>
                        <ArrowUpFromLine size={14} /> خروج
                      </button>
                      <button className="btn" onClick={() => openEdit(i.id)}>
                        <Edit3 size={14} /> ویرایش
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* =============== مودال افزودن کالا =============== */}
      <OverlayModal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="افزودن کالای جدید"
        footer={
          <>
            <button className="btn" onClick={() => setShowNew(false)}>
              انصراف
            </button>
            <button type="submit" form="newItemForm" className="btn primary">
              ثبت کالا
            </button>
          </>
        }
      >
        <div className="info-banner">
          <p>لطفاً مشخصات کالا را دقیق وارد کنید. از نام‌های تکراری پرهیز کنید.</p>
        </div>

        <form
          id="newItemForm"
          onSubmit={(e) => {
            e.preventDefault();
            addNew();
          }}
        >
          <section className="form-section">
            <h4>مشخصات کالا</h4>
            <div className="form-grid">
              <div>
                <label>نام کالا</label>
                <input
                  className="input"
                  placeholder="مثلاً ورق فلزی"
                  value={newForm.name}
                  onChange={(e) =>
                    setNewForm({ ...newForm, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label>واحد</label>
                <input
                  className="input"
                  placeholder="عدد / کیلوگرم"
                  value={newForm.unit}
                  onChange={(e) =>
                    setNewForm({ ...newForm, unit: e.target.value })
                  }
                />
              </div>

              <div>
                <label>قیمت واحد (تومان)</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={newForm.price}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      price: e.target.value.replace(/[^\d]/g, ""),
                    })
                  }
                />
              </div>

              <div>
                <label>موجودی اولیه</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={newForm.stock}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      stock: e.target.value.replace(/[^\d]/g, ""),
                    })
                  }
                />
              </div>

              <div>
                <label>حداقل موجودی</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={newForm.min}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      min: e.target.value.replace(/[^\d]/g, ""),
                    })
                  }
                />
              </div>
            </div>
          </section>
        </form>
      </OverlayModal>

      {/* =============== مودال ورود کالا =============== */}
      <OverlayModal
        open={showEnter}
        onClose={() => setShowEnter(false)}
        title="ورود کالا به انبار"
        footer={
          <>
            <button className="btn" onClick={() => setShowEnter(false)}>
              انصراف
            </button>
            <button type="submit" form="enterForm" className="btn primary">
              تأیید
            </button>
          </>
        }
      >
        <form
          id="enterForm"
          onSubmit={(e) => {
            e.preventDefault();
            doEnter();
          }}
        >
          {selected && (
            <div className="pill">
              {selected.name} — واحد: {selected.unit} (موجودی فعلی:{" "}
              {selected.stock})
            </div>
          )}

          <label style={{ marginTop: 8 }}>تعداد</label>
          <input
            className="input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
          />
        </form>
      </OverlayModal>

      {/* =============== مودال خروج کالا =============== */}
      <OverlayModal
        open={showExit}
        onClose={() => setShowExit(false)}
        title="خروج کالا از انبار"
        footer={
          <>
            <button className="btn" onClick={() => setShowExit(false)}>
              انصراف
            </button>
            <button type="submit" form="exitForm" className="btn primary">
              تأیید خروج
            </button>
          </>
        }
      >
        <form
          id="exitForm"
          onSubmit={(e) => {
            e.preventDefault();
            doExit();
          }}
        >
          {selected && (
            <div className="pill">
              {selected.name} — واحد: {selected.unit} (موجودی فعلی:{" "}
              {selected.stock})
            </div>
          )}

          <label style={{ marginTop: 8 }}>تعداد خروج</label>
          <input
            className="input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
          />

          {/* هشدار کاهش زیر حداقل */}
          {selected && (() => {
            const qNum = Number(qty) || 0;
            const low = selected.stock - qNum < selected.min;
            return low ? (
              <div
                className="info-banner"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "var(--danger)",
                  marginTop: 10,
                }}
              >
                ⚠️ با این خروج، موجودی کالا کمتر از حداقل تعیین‌شده خواهد شد.
              </div>
            ) : null;
          })()}
        </form>
      </OverlayModal>

      {/* =============== مودال ویرایش کالا =============== */}
      <OverlayModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="ویرایش کالا"
        footer={
          <>
            <button className="btn" onClick={() => setShowEdit(false)}>
              انصراف
            </button>
            <button type="submit" form="editForm" className="btn primary">
              ذخیره
            </button>
          </>
        }
      >
        <form
          id="editForm"
          onSubmit={(e) => {
            e.preventDefault();
            doEdit();
          }}
        >
          {selected && <div className="pill">{selected.name}</div>}

          <label style={{ marginTop: 8 }}>نام کالا</label>
          <input
            className="input"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />

          <div className="row" style={{ marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label>واحد</label>
              <input
                className="input"
                value={editForm.unit}
                onChange={(e) =>
                  setEditForm({ ...editForm, unit: e.target.value })
                }
              />
            </div>

            <div style={{ flex: 1 }}>
              <label>قیمت (تومان)</label>
              <input
                className="input"
                inputMode="numeric"
                value={editForm.price}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    price: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
              />
            </div>

            <div style={{ flex: 1 }}>
              <label>حداقل موجودی</label>
              <input
                className="input"
                inputMode="numeric"
                value={editForm.min}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    min: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
              />
            </div>
          </div>
        </form>
      </OverlayModal>
    </div>
  );
}
