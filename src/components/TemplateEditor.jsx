import React, { useMemo, useState } from "react";
import { Plus, Edit3, Trash2, Check, X, Search } from "lucide-react";

/**
 * TemplateEditor — ویرایش اقلام الگوی ساخت / مواد مصرفی
 *
 * امضاهای قابل استفاده:
 *   ✅ (data, template, setTemplate)
 *   ✅ (data, lines, setLines)
 *
 * Props:
 *  - data: { inventory: [{id, name, unit, stock, ...}, ...] }
 *  - template?, setTemplate?   (اختیاری)
 *  - lines?, setLines?         (اختیاری)
 *  - readOnly?                 (اختیاری)
 *  - compact?                  (اختیاری)
 *  - units?                    (اختیاری، تعداد کانتینر/واحدهایی که این مواد برایشان مصرف می‌شود)
 *  - toast?                    (اختیاری، از App/صفحه تزریق می‌شود)
 */
export default function TemplateEditor({
  data,
  template,
  setTemplate,
  lines,
  setLines,
  readOnly = false,
  compact = false,
  units = 1,
  toast,
}) {
  const inventory = useMemo(() => data?.inventory || [], [data?.inventory]);

  // تابع نوتیفیکیشن عمومی
  const notify = (msg, opts) => {
    if (typeof toast === "function") toast(msg, opts);
    else window.alert(msg);
  };

  // تشخیص حالت استفاده
  const usingTemplate = Boolean(template && typeof setTemplate === "function");
  const currentLines = usingTemplate ? template?.lines || [] : lines || [];
  const updateLines = (next) =>
    usingTemplate
      ? setTemplate({ ...(template || {}), lines: next })
      : setLines?.(next);

  // Toolbar states
  const [q, setQ] = useState(""); // فیلتر لیست کالا
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("");

  // Edit row states
  const [editingId, setEditingId] = useState(null);
  const [editItemId, setEditItemId] = useState("");
  const [editQty, setEditQty] = useState("");

  // لیست کالا با فیلتر
  const invFiltered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return inventory;
    const n = needle.toLowerCase();
    return inventory.filter(
      (i) =>
        (i.name || "").toLowerCase().includes(n) ||
        (i.unit || "").toLowerCase().includes(n)
    );
  }, [inventory, q]);

  // اضافه‌کردن قلم جدید
  const addLine = () => {
    if (readOnly) return;
    const id = String(newItemId || "");
    const qty = parseFloat(newQty);

    if (!id) return notify("کالا را انتخاب کنید", { type: "error" });
    if (!(qty > 0)) return notify("مقدار معتبر نیست", { type: "error" });

    if (currentLines.some((l) => String(l.inventoryId) === id)) {
      return notify("این کالا قبلاً اضافه شده است", { type: "warning" });
    }

    updateLines([...(currentLines || []), { inventoryId: id, qty }]);
    setNewItemId("");
    setNewQty("");
  };

  const removeLine = (id) => {
    if (readOnly) return;
    updateLines(
      (currentLines || []).filter(
        (x) => String(x.inventoryId) !== String(id)
      )
    );
  };

  // شروع ویرایش
  const startEdit = (line) => {
    if (readOnly) return;
    setEditingId(String(line.inventoryId));
    setEditItemId(String(line.inventoryId));
    setEditQty(String(line.qty ?? ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItemId("");
    setEditQty("");
  };

  // ذخیرهٔ ویرایش
  const saveEdit = () => {
    if (readOnly) return;

    const id = String(editingId || "");
    const newId = String(editItemId || "");
    const qty = parseFloat(editQty);

    if (!newId) return notify("کالا را انتخاب کنید", { type: "error" });
    if (!(qty > 0)) return notify("مقدار معتبر نیست", { type: "error" });

    // جلوگیری از آیتم تکراری (به‌جز همین سطر)
    if (
      currentLines.some(
        (l) => String(l.inventoryId) === newId && String(l.inventoryId) !== id
      )
    ) {
      return notify("این کالا از قبل در لیست وجود دارد", {
        type: "warning",
      });
    }

    const next = (currentLines || []).map((x) =>
      String(x.inventoryId) === id ? { ...x, inventoryId: newId, qty } : x
    );
    updateLines(next);
    cancelEdit();
  };

  const isEmpty = (currentLines || []).length === 0;

  return (
    <div className={`te-wrapper ${compact ? "te-compact" : ""}`}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="te-toolbar">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="te-search">
              <Search size={16} className="te-search-icon" />
              <input
                className="input"
                placeholder="جستجوی کالا..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <select
              className="input"
              style={{ minWidth: 220, flex: 1 }}
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
            >
              <option value="">انتخاب کالا...</option>
              {invFiltered.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — واحد: {i.unit}
                </option>
              ))}
            </select>

            <input
              className="input"
              placeholder="مقدار مصرفی"
              inputMode="numeric"
              style={{ width: 120 }}
              value={newQty}
              onChange={(e) =>
                setNewQty(e.target.value.replace(/[^\d.]/g, ""))
              }
            />

            <button className="btn" type="button" onClick={addLine}>
              <Plus size={16} /> افزودن قلم
            </button>
          </div>

          <div className="pill" style={{ marginTop: 8 }}>
            تعداد اقلام: {(currentLines || []).length}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="te-card">
        {isEmpty ? (
          <div className="te-empty">هنوز کالایی اضافه نشده است</div>
        ) : (
          <>
            <div className="te-scroll">
              <table className="te-table">
                <thead>
                  <tr>
                    <th>کالا</th>
                    <th>واحد</th>
                    <th>مقدار مصرفی</th>
                    {!readOnly && <th style={{ width: 170 }}>عملیات</th>}
                  </tr>
                </thead>
                <tbody>
                  {(currentLines || []).map((l) => {
                    const item = inventory.find(
                      (i) => String(i.id) === String(l.inventoryId)
                    );
                    const isEditing =
                      String(editingId) === String(l.inventoryId);

                    return (
                      <tr key={l.inventoryId}>
                        <td>
                          {isEditing ? (
                            <select
                              className="input"
                              value={editItemId}
                              onChange={(e) => setEditItemId(e.target.value)}
                            >
                              {inventory.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            item?.name || "—"
                          )}
                        </td>
                        <td>{item?.unit || "—"}</td>
                        <td>
                          {isEditing ? (
                            <input
                              className="input"
                              style={{ width: 100 }}
                              value={editQty}
                              onChange={(e) =>
                                setEditQty(
                                  e.target.value.replace(/[^\d.]/g, "")
                                )
                              }
                            />
                          ) : (
                            l.qty
                          )}

                          {/* 🔍 نمایش نیاز کل و وضعیت موجودی بر اساس units */}
                          {(() => {
                            const unitsCount = Number(units) || 0;
                            const qtyNum = Number(l.qty) || 0;
                            const itemStock = item?.stock ?? 0;

                            if (!unitsCount || !item) return null;

                            const required = unitsCount * qtyNum;
                            const shortage = required > itemStock;
                            const deficit = required - itemStock;

                            return (
                              <div
                                className="muted"
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  color: shortage ? "#dc2626" : "#6b7280",
                                }}
                              >
                                نیاز برای {unitsCount} کانتینر: {required} (موجود:{" "}
                                {itemStock}
                                {shortage ? `، کمبود: ${deficit}` : ""})
                              </div>
                            );
                          })()}
                        </td>

                        {!readOnly && (
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              {isEditing ? (
                                <>
                                  <button
                                    className="btn primary"
                                    type="button"
                                    onClick={saveEdit}
                                  >
                                    <Check size={14} /> ذخیره
                                  </button>
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={cancelEdit}
                                  >
                                    <X size={14} /> انصراف
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => startEdit(l)}
                                  >
                                    <Edit3 size={14} /> ویرایش
                                  </button>
                                  <button
                                    className="btn danger"
                                    type="button"
                                    onClick={() =>
                                      removeLine(l.inventoryId)
                                    }
                                  >
                                    <Trash2 size={14} /> حذف
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* نوار پایینی چسبان */}
            <div className="te-bottom">
              <span className="muted">
                برای تغییر کالا از «ویرایش» استفاده کنید. مقادیر باید بزرگ‌تر از
                صفر باشند.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
