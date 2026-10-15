// src/components/ContainerModels.jsx
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

import OverlayModal from "./OverlayModal";
import TemplateEditor from "./TemplateEditor";
import { pushAudit } from "../utils/audit";
import { normalizeName } from "../utils/inventoryOps";

/**
 * صفحه «مدل‌های ساخت»
 *  - مدیریت انواع کانتینر (containerKinds)
 *  - مدیریت الگوهای ساخت (containerTemplates)
 *  - نگه‌داشت ارتباط نوع ↔ الگو از طریق template.kindIds
 *  - نمایش آمار استفاده الگو در واحدها (containerUnits)
 *
 * نکته:
 *  - مصرف/برگشت مواد انبار در صفحه‌ی «کانتینرها» و بر اساس containerUnits انجام می‌شود،
 *    نه در این صفحه؛ این‌جا فقط تعریف و مدیریت مدل‌هاست.
 */
export default function ContainerModels({ data, setData, toast, go }) {
  // ---------- داده‌های اصلی ----------
  const allKinds = data.containerKinds || [];
  const allTemplates = data.containerTemplates || [];
  const allUnits = data.containerUnits || [];
  const inventory = data.inventory || [];

  // ---------- استیت جستجو ----------
  const [kindQuery, setKindQuery] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");

  // ---------- استیت انواع کانتینر ----------
  const [showKindModal, setShowKindModal] = useState(false);
  const [editingKindId, setEditingKindId] = useState(null);
  const [kindForm, setKindForm] = useState({
    name: "",
    note: "",
  });
  // انتخاب الگوهای مجاز برای این نوع (بر اساس template.id)
  const [kindTemplateIds, setKindTemplateIds] = useState([]);

  // ---------- استیت الگوها ----------
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    note: "",
    lines: [],
    kindIds: [],
  });

  const [expandedTemplateId, setExpandedTemplateId] = useState(null);

  const kindNameRef = useRef(null);
  const templateNameRef = useRef(null);

  // فوکوس خودکار روی فرم نوع/الگو
  useEffect(() => {
    if (showKindModal && kindNameRef.current) {
      kindNameRef.current.focus();
    }
  }, [showKindModal]);

  useEffect(() => {
    if (showTemplateModal && templateNameRef.current) {
      templateNameRef.current.focus();
    }
  }, [showTemplateModal]);

  // ---------- KINDS: لیست فیلترشده ----------
  const filteredKinds = useMemo(() => {
    const q = kindQuery.trim().toLowerCase();
    return allKinds
      .filter((k) => !q || (k.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "fa"));
  }, [allKinds, kindQuery]);

  // تعداد الگوهای مرتبط با یک نوع
  const countTemplatesForKind = (kindId) =>
    allTemplates.filter((t) =>
      Array.isArray(t.kindIds)
        ? t.kindIds.some((x) => String(x) === String(kindId))
        : false
    ).length;

  // تعداد واحدهای ثبت‌شده از یک نوع (containerUnits)
  const countUnitsForKind = (kindId) =>
    allUnits.filter((u) => String(u.kindId) === String(kindId)).length;

  // ---------- TEMPLATES: لیست فیلترشده ----------
  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    return allTemplates
      .filter((t) => !q || (t.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "fa"));
  }, [allTemplates, templateQuery]);

  // نام نوع‌های مرتبط با یک الگو
  const getKindNamesForTemplate = (t) => {
    const ids = Array.isArray(t.kindIds) ? t.kindIds : [];
    if (!ids.length) return [];
    return allKinds
      .filter((k) => ids.some((id) => String(id) === String(k.id)))
      .map((k) => k.name)
      .filter(Boolean);
  };

  // تعداد واحدهایی که از یک الگو استفاده می‌کنند
  const countUnitsForTemplate = (templateId) =>
    allUnits.filter((u) => String(u.templateId) === String(templateId)).length;

  // =====================================================
  //   KINDS: باز کردن / بستن فرم
  // =====================================================
  const openNewKind = () => {
    setEditingKindId(null);
    setKindForm({
      name: "",
      note: "",
    });
    setKindTemplateIds([]); // در حالت ثبت نوع جدید، هیچ الگویی انتخاب نشده
    setShowKindModal(true);
  };

  const openEditKind = (kind) => {
    setEditingKindId(kind.id);
    setKindForm({
      name: kind.name || "",
      note: kind.note || "",
    });

    // استخراج الگوهای متصل به این نوع بر اساس kindIds در template
    const selectedTemplates = allTemplates
      .filter((t) =>
        Array.isArray(t.kindIds)
          ? t.kindIds.some((x) => String(x) === String(kind.id))
          : false
      )
      .map((t) => t.id);

    setKindTemplateIds(selectedTemplates);
    setShowKindModal(true);
  };

  const closeKindModal = () => {
    setShowKindModal(false);
    setEditingKindId(null);
    setKindForm({
      name: "",
      note: "",
    });
    setKindTemplateIds([]);
  };

  // =====================================================
  //   KINDS: ثبت / ویرایش نوع + اتصال الگوهای مجاز
  // =====================================================
  const handleSubmitKind = () => {
    const rawName = (kindForm.name || "").trim();
    if (!rawName) {
      toast("نام نوع کانتینر را وارد کنید", { type: "error" });
      return;
    }

    const norm = normalizeName(rawName);
    const existsWithSameName = allKinds.some(
      (k) =>
        String(k.id) !== String(editingKindId) &&
        normalizeName(k.name || "") === norm
    );
    if (existsWithSameName) {
      toast("نوعی با این نام قبلاً ثبت شده است", { type: "error" });
      return;
    }

    // مجموعه الگوهای انتخاب شده برای این نوع
    const selectedTemplateIdSet = new Set(
      (kindTemplateIds || []).map((id) => String(id))
    );

    if (editingKindId) {
      // --- ویرایش نوع موجود + به‌روزرسانی kindIds روی الگوها
      const kindId = editingKindId;

      setData((d) => {
        const containerKinds = (d.containerKinds || []).map((k) =>
          String(k.id) === String(kindId)
            ? { ...k, name: rawName, note: kindForm.note || "" }
            : k
        );

        const containerTemplates = (d.containerTemplates || []).map((t) => {
          const currentKindIds = Array.isArray(t.kindIds) ? t.kindIds : [];
          const hasThisKind = currentKindIds.some(
            (x) => String(x) === String(kindId)
          );
          const shouldHave = selectedTemplateIdSet.has(String(t.id));

          let nextKindIds = currentKindIds;

          if (shouldHave && !hasThisKind) {
            nextKindIds = [...currentKindIds, kindId];
          } else if (!shouldHave && hasThisKind) {
            nextKindIds = currentKindIds.filter(
              (x) => String(x) !== String(kindId)
            );
          }

          return { ...t, kindIds: nextKindIds };
        });

        return {
          ...d,
          containerKinds,
          containerTemplates,
        };
      });

      pushAudit(setData, {
        type: "CONTAINER_KIND_EDIT",
        message: `ویرایش نوع کانتینر ${rawName}`,
        payload: {
          id: editingKindId,
          name: rawName,
          note: kindForm.note || "",
          templateIds: [...selectedTemplateIdSet],
        },
      });

      toast("نوع کانتینر و الگوهای مرتبط آن به‌روزرسانی شد", {
        type: "success",
      });
    } else {
      // --- افزودن نوع جدید + ثبت اتصال به الگوهای انتخاب شده
      const kindId = `kind_${rawName.replace(/\s+/g, "_")}_${Date.now()}`;

      setData((d) => {
        const containerKinds = [
          ...(d.containerKinds || []),
          { id: kindId, name: rawName, note: kindForm.note || "" },
        ];

        const containerTemplates = (d.containerTemplates || []).map((t) => {
          const currentKindIds = Array.isArray(t.kindIds) ? t.kindIds : [];
          if (!selectedTemplateIdSet.has(String(t.id))) {
            return { ...t, kindIds: currentKindIds };
          }
          // اگر این نوع از قبل در لیست نبود، اضافه شود
          if (currentKindIds.some((x) => String(x) === String(kindId))) {
            return { ...t, kindIds: currentKindIds };
          }
          return { ...t, kindIds: [...currentKindIds, kindId] };
        });

        return {
          ...d,
          containerKinds,
          containerTemplates,
        };
      });

      pushAudit(setData, {
        type: "CONTAINER_KIND_ADD",
        message: `افزودن نوع کانتینر ${rawName}`,
        payload: {
          id: kindId,
          name: rawName,
          note: kindForm.note || "",
          templateIds: [...selectedTemplateIdSet],
        },
      });

      toast("نوع کانتینر جدید ثبت شد و الگوهای مجاز آن تنظیم شد", {
        type: "success",
      });
    }

    closeKindModal();
  };

  // =====================================================
  //   KINDS: حذف نوع
  // =====================================================
  const handleDeleteKind = (id) => {
    const kind = (data.containerKinds || []).find((k) => k.id === id);
    const kindName = kind?.name || "";

    // اگر واحدی از این نوع موجود است، حذف مجاز نیست
    const usedInUnits = (data.containerUnits || []).some(
      (u) => String(u.kindId) === String(id)
    );

    if (usedInUnits) {
      toast(
        "امکان حذف این نوع وجود ندارد؛ واحدهایی از این نوع ثبت شده‌اند. ابتدا واحدها را حذف یا به نوع دیگری منتقل کنید.",
        { type: "error" }
      );
      return;
    }

    // اگر فقط در الگوها استفاده شده، با تأیید کاربر، ارتباط از الگوها قطع می‌شود
    const usedInTemplates = (data.containerTemplates || []).some((t) =>
      Array.isArray(t.kindIds)
        ? t.kindIds.some((x) => String(x) === String(id))
        : false
    );

    if (usedInTemplates) {
      const ok = window.confirm(
        `این نوع به برخی الگوها متصل است.\nبا حذف آن، از لیست نوع‌ها و ارتباط با الگوها حذف می‌شود.\n\nنام نوع: ${kindName}\n\nآیا مطمئن هستید؟`
      );
      if (!ok) return;
    }

    setData((d) => {
      const containerKinds = (d.containerKinds || []).filter(
        (k) => String(k.id) !== String(id)
      );

      const containerTemplates = (d.containerTemplates || []).map((t) => ({
        ...t,
        kindIds: (t.kindIds || []).filter(
          (x) => String(x) !== String(id)
        ),
      }));

      return {
        ...d,
        containerKinds,
        containerTemplates,
      };
    });

    toast("نوع کانتینر حذف شد", { type: "success" });
    if (kindName) {
      pushAudit(setData, {
        type: "CONTAINER_KIND_DELETE",
        message: `حذف نوع کانتینر ${kindName}`,
        payload: { id, name: kindName },
      });
    }

    if (editingKindId && String(editingKindId) === String(id)) {
      closeKindModal();
    }
  };

  // =====================================================
  //   TEMPLATES: باز کردن / بستن فرم
  // =====================================================
  const openNewTemplate = () => {
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      note: "",
      lines: [],
      kindIds: [],
    });
    setShowTemplateModal(true);
  };

  const openEditTemplate = (template) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name || "",
      note: template.note || "",
      lines: template.lines || [],
      kindIds: Array.isArray(template.kindIds) ? template.kindIds : [],
    });
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      note: "",
      lines: [],
      kindIds: [],
    });
  };

  // =====================================================
  //   TEMPLATES: حذف
  // =====================================================
  const handleDeleteTemplate = (id) => {
    const usedInUnits = (data.containerUnits || []).some(
      (u) => String(u.templateId) === String(id)
    );

    if (usedInUnits) {
      toast(
        "این الگو برای برخی واحدهای کانتینر استفاده شده و قابل حذف نیست.",
        {
          type: "error",
        }
      );
      return;
    }

    setData((d) => ({
      ...d,
      containerTemplates: (d.containerTemplates || []).filter(
        (t) => String(t.id) !== String(id)
      ),
    }));

    toast("الگو حذف شد", { type: "success" });
    pushAudit(setData, {
      type: "TEMPLATE_DELETE",
      message: "حذف الگوی ساخت کانتینر",
      payload: { id },
    });

    if (editingTemplateId && String(editingTemplateId) === String(id)) {
      closeTemplateModal();
    }
  };

  // =====================================================
  //   TEMPLATES: ثبت / ویرایش + kindIds
  // =====================================================
  const handleSubmitTemplate = () => {
    const name = (templateForm.name || "").trim();
    if (!name) {
      toast("نام الگو را وارد کنید", { type: "error" });
      return;
    }

    if (!templateForm.lines || templateForm.lines.length === 0) {
      toast("حداقل یک قلم باید اضافه شود", { type: "error" });
      return;
    }

    // جلوگیری از نام تکراری
    if (
      (data.containerTemplates || []).some(
        (t) =>
          String(t.id) !== String(editingTemplateId) &&
          (t.name || "").trim().toLowerCase() === name.toLowerCase()
      )
    ) {
      toast("الگویی با همین نام قبلاً ثبت شده است", {
        type: "error",
      });
      return;
    }

    const cleanForm = {
      name,
      note: templateForm.note || "",
      lines: templateForm.lines || [],
      kindIds: Array.isArray(templateForm.kindIds)
        ? [...templateForm.kindIds]
        : [],
    };

    if (editingTemplateId) {
      // ویرایش الگو
      setData((d) => ({
        ...d,
        containerTemplates: (d.containerTemplates || []).map((t) =>
          String(t.id) === String(editingTemplateId)
            ? { ...t, ...cleanForm }
            : t
        ),
      }));

      toast("الگو ویرایش شد", { type: "success" });
      pushAudit(setData, {
        type: "TEMPLATE_EDIT",
        message: `ویرایش الگوی ساخت ${cleanForm.name}`,
        payload: { id: editingTemplateId, ...cleanForm },
      });

      setEditingTemplateId(null);
      setShowTemplateModal(false);
    } else {
      // افزودن الگوی جدید
      const newId =
        (typeof window !== "undefined" &&
          window.crypto &&
          typeof window.crypto.randomUUID === "function" &&
          window.crypto.randomUUID()) ||
        `tpl_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

      setData((d) => ({
        ...d,
        containerTemplates: [
          ...(d.containerTemplates || []),
          { id: newId, ...cleanForm },
        ],
      }));

      toast("الگوی جدید اضافه شد", { type: "success" });
      pushAudit(setData, {
        type: "TEMPLATE_ADD",
        message: `افزودن الگوی ساخت ${cleanForm.name}`,
        payload: { id: newId, ...cleanForm },
      });

      setShowTemplateModal(false);
    }

    setTemplateForm({
      name: "",
      note: "",
      lines: [],
      kindIds: [],
    });
  };

  // ---------- آمار کوچک برای هدر ----------
  const totalKinds = allKinds.length;
  const totalTemplates = allTemplates.length;
  const totalUnits = allUnits.length;

  // =====================================================
  //   UI
  // =====================================================
  return (
    <div className="card" style={{ padding: 16 }}>
      {/* ===== هدر و خلاصه ===== */}
      <div className="section-title" style={{ marginTop: "-2.4px" }}>
        <div className="header-line">
          <h3 className="header-title">مدیریت</h3>

          <div className="header-tabs">
            <h3 className="header-tab" onClick={() => go("containers")}>
              کانتینرها
            </h3>

            <span className="header-separator">/</span>

            <h3 className="header-tab active" onClick={() => go("models")}>
              مدل‌های ساخت
            </h3>
          </div>
        </div>

        <div
          className="row"
          style={{
            marginLeft: 8,
            gap: 12,
            fontSize: 12,
            color: "var(--text-light)",
          }}
        >
          <span>انواع: {totalKinds}</span>
          <span>الگوها: {totalTemplates}</span>
          <span>واحدهای ثبت‌شده: {totalUnits}</span>
        </div>
      </div>

      {/* ===== کارت انواع کانتینر ===== */}
      <div
        className="card"
        style={{ padding: 16, marginTop: 16, marginBottom: 16 }}
      >
        <div className="section-title">
          <h3>انواع کانتینر</h3>

          <div className="row" style={{ gap: 10 }}>
            <div className="row" style={{ alignItems: "center" }}>
              <Search size={16} style={{ opacity: 0.6 }} />
              <input
                className="input"
                placeholder="جستجوی نوع..."
                value={kindQuery}
                onChange={(e) => setKindQuery(e.target.value)}
                style={{ width: 180 }}
              />
            </div>

            <button className="btn primary" onClick={openNewKind}>
              <Plus size={18} /> ثبت نوع جدید
            </button>
          </div>
        </div>

        {filteredKinds.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={20} />
            <div>
              <h4 style={{ margin: 0 }}>هنوز هیچ نوع کانتینری ثبت نشده است.</h4>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>نام نوع</th>
                  <th>تعداد الگوهای مرتبط</th>
                  <th>تعداد واحدهای ثبت‌شده</th>
                  <th>وضعیت</th>
                  <th style={{ minWidth: 160 }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredKinds.map((k) => {
                  const templateCount = countTemplatesForKind(k.id);
                  const unitCount = countUnitsForKind(k.id);
                  return (
                    <tr key={k.id}>
                      <td>{k.name || "—"}</td>
                      <td>{templateCount}</td>
                      <td>{unitCount}</td>
                      <td>
                        {templateCount > 0 ? (
                          <span
                            className="pill"
                            style={{
                              background: "#e0f7e9",
                              color: "#16a34a",
                            }}
                          >
                            دارای الگو
                          </span>
                        ) : (
                          <span
                            className="pill"
                            style={{
                              background: "#fef3c7",
                              color: "#b45309",
                            }}
                          >
                            بدون الگو
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            className="btn"
                            onClick={() => openEditKind(k)}
                          >
                            <Edit3 size={14} /> ویرایش
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => handleDeleteKind(k.id)}
                          >
                            <Trash2 size={14} /> حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== کارت الگوهای ساخت ===== */}
      <div className="card" style={{ padding: 20 }}>
        <div className="section-title">
          <h3>الگوهای ساخت</h3>

          <div className="row" style={{ gap: 10 }}>
            <div className="row" style={{ alignItems: "center" }}>
              <Search size={16} style={{ opacity: 0.6 }} />
              <input
                className="input"
                placeholder="جستجوی الگو..."
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                style={{ width: 180 }}
              />
            </div>

            <button className="btn primary" onClick={openNewTemplate}>
              <Plus size={18} /> ثبت الگوی جدید
            </button>
          </div>
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={24} />
            <div>
              <h4 style={{ margin: 0 }}>هیچ الگویی یافت نشد.</h4>
            </div>
          </div>
        ) : (
          <div className="template-accordion">
            {filteredTemplates.map((t) => {
              const isOpen = expandedTemplateId === t.id;
              const kindNames = getKindNamesForTemplate(t);
              const unitsCount = countUnitsForTemplate(t.id);

              return (
                <div
                  key={t.id}
                  className="template-item"
                  style={{
                    overflow: "hidden",
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.08)",
                    marginBottom: 12,
                    background: isOpen ? "#fafbff" : "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    transition: "background 0.2s",
                  }}
                >
                  {/* -------- HEADER -------- */}
                  <button
                    className="template-header"
                    onClick={() =>
                      setExpandedTemplateId(isOpen ? null : t.id)
                    }
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      className="row"
                      style={{
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* نام الگو */}
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 600,
                          marginLeft: "8px",
                        }}
                      >
                        {t.name}
                      </h4>

                      {/* بادج نوع‌ها */}
                      {(kindNames.length === 0 ? ["الگوی عمومی"] : kindNames).map(
                        (name) => (
                          <span
                            key={name}
                            className="badge"
                            style={{
                              background: "#eef2ff",
                              color: "#4f46e5",
                              fontSize: "0.75rem",
                              padding: "3px 7px",
                              borderRadius: 8,
                            }}
                          >
                            {name}
                          </span>
                        )
                      )}

                      {/* بادج اقلام */}
                      <span
                        className="badge"
                        style={{
                          background: "#f0fdf4",
                          color: "#16a34a",
                          fontSize: "0.75rem",
                          padding: "3px 7px",
                          borderRadius: 8,
                        }}
                      >
                        اقلام: {t.lines?.length || 0}
                      </span>

                      {/* بادج تعداد واحدها */}
                      <span
                        className="badge"
                        style={{
                          background: "#fff7ed",
                          color: "#b45309",
                          fontSize: "0.75rem",
                          padding: "3px 7px",
                          borderRadius: 8,
                        }}
                      >
                        واحدهای استفاده‌کننده: {unitsCount}
                      </span>
                    </div>

                    <div style={{ opacity: 0.7 }}>
                      {isOpen ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </div>
                  </button>

                  {/* -------- BODY -------- */}
                  {isOpen && (
                    <div
                      style={{
                        padding: "14px 16px",
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      {/* Note + Buttons */}
                      <div
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          marginBottom: 14,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            color: "var(--text-light)",
                          }}
                        >
                          {t.note ? (
                            <>
                              <b>یادداشت:</b> {t.note}
                            </>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>
                              یادداشتی برای این الگو ثبت نشده است.
                            </span>
                          )}
                        </p>

                        <div className="row" style={{ gap: 8 }}>
                          <button
                            className="btn"
                            onClick={() => openEditTemplate(t)}
                          >
                            <Edit3 size={14} /> ویرایش
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => handleDeleteTemplate(t.id)}
                          >
                            <Trash2 size={14} /> حذف
                          </button>
                        </div>
                      </div>

                      {/* Lines Table */}
                      <div style={{ overflowX: "auto" }}>
                        {!t.lines || t.lines.length === 0 ? (
                          <p
                            style={{
                              color: "var(--text-light)",
                              marginTop: 8,
                            }}
                          >
                            هیچ ماده مصرفی تعریف نشده است.
                          </p>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>کالا</th>
                                <th>مقدار</th>
                                <th>واحد</th>
                              </tr>
                            </thead>

                            <tbody>
                              {t.lines.map((line, idx) => {
                                const item = inventory.find(
                                  (inv) => inv.id === line.inventoryId
                                );
                                return (
                                  <tr
                                    key={`${t.id}-${line.inventoryId}-${idx}`}
                                  >
                                    <td>{item?.name || "—"}</td>
                                    <td>{line.qty}</td>
                                    <td>{item?.unit || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- مودال نوع کانتینر ---------- */}
      <OverlayModal
        open={showKindModal}
        onClose={closeKindModal}
        title={editingKindId ? "ویرایش نوع کانتینر" : "افزودن نوع کانتینر"}
        footer={
          <>
            <button className="btn" onClick={closeKindModal}>
              انصراف
            </button>
            <button className="btn primary" onClick={handleSubmitKind}>
              {editingKindId ? "ذخیره تغییرات" : "ثبت نوع"}
            </button>
          </>
        }
      >
        <section className="form-section">
          <h4>مشخصات نوع کانتینر</h4>
          <div className="form-grid">
            <div>
              <label>نام نوع کانتینر</label>
              <input
                ref={kindNameRef}
                className="input"
                placeholder="مثلاً ۲۰ فوت اداری"
                value={kindForm.name}
                onChange={(e) =>
                  setKindForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>یادداشت (اختیاری)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="توضیح کوتاه درباره این نوع."
                value={kindForm.note}
                onChange={(e) =>
                  setKindForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
          </div>
        </section>

        <section className="form-section" style={{ marginTop: 12 }}>
          <h4>الگوهای مجاز برای این نوع</h4>
          {allTemplates.length === 0 ? (
            <p className="template-hint">
              هنوز الگوی ساختی ثبت نشده است. ابتدا یک الگو در بخش «الگوهای ساخت»
              ایجاد کنید.
            </p>
          ) : (
            <>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                  padding: 8,
                }}
              >
                {allTemplates.map((t) => {
                  const checked = (kindTemplateIds || []).some(
                    (tid) => String(tid) === String(t.id)
                  );
                  const unitsCount = countUnitsForTemplate(t.id);

                  return (
                    <label
                      key={t.id}
                      className="row"
                      style={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 6px",
                        borderRadius: 8,
                        cursor: "pointer",
                        gap: 8,
                      }}
                    >
                      <div className="row" style={{ gap: 8, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setKindTemplateIds((prev) => {
                              const prevIds = prev || [];
                              const strId = String(t.id);
                              const exists = prevIds.some(
                                (x) => String(x) === strId
                              );
                              if (exists) {
                                return prevIds.filter(
                                  (x) => String(x) !== strId
                                );
                              }
                              return [...prevIds, t.id];
                            });
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                            {t.name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.5rem",
                              color: "var(--text-light)",
                              marginTop: 4,
                            }}
                          >
                            اقلام: {t.lines?.length || 0} | واحدهای ساخته‌شده با
                            این الگو: {unitsCount}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </OverlayModal>

      {/* ---------- مودال الگوی ساخت ---------- */}
      <OverlayModal
        open={showTemplateModal}
        onClose={closeTemplateModal}
        title={editingTemplateId ? "ویرایش الگوی ساخت" : "افزودن الگوی ساخت"}
        size="lg"
        footer={
          <>
            <button className="btn" onClick={closeTemplateModal}>
              انصراف
            </button>
            <button className="btn primary" onClick={handleSubmitTemplate}>
              {editingTemplateId ? "ذخیره تغییرات" : "ثبت الگو"}
            </button>
          </>
        }
      >
        <div className="info-banner">
          <p>
            یک <b>الگوی ساخت</b> مجموعه‌ای از مواد مصرفی برای ساخت ۱ واحد
            کانتینر است.
          </p>
        </div>

        <section className="form-section" style={{ marginTop: 12 }}>
          <h4>مشخصات الگو</h4>
          <div className="form-grid">
            <div>
              <label>نام الگوی ساخت</label>
              <input
                ref={templateNameRef}
                className="input"
                placeholder="مثلاً الگوی استاندارد ۲۰ فوت"
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>یادداشت (اختیاری)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="توضیح کوتاه درباره این الگو."
                value={templateForm.note}
                onChange={(e) =>
                  setTemplateForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
          </div>
        </section>

        <section className="form-section" style={{ marginTop: 14 }}>
          <h4>نوع‌های مجاز برای این الگو</h4>
          {allKinds.length === 0 ? (
            <p className="template-hint">
              هنوز هیچ نوع کانتینری ثبت نشده است. می‌توانید بعد از ثبت انواع،
              این الگو را ویرایش و نوع‌های مجاز را انتخاب کنید.
            </p>
          ) : (
            <>
              <p
                className="template-hint"
                style={{ fontSize: "0.8rem", marginBottom: 8 }}
              >
                اگر هیچ نوعی انتخاب نشود، این الگو <b>عمومی</b> است و می‌تواند
                برای همهٔ انواع مورد استفاده قرار گیرد.
              </p>

              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                  padding: 8,
                }}
              >
                {allKinds.map((k) => {
                  const checked = (templateForm.kindIds || []).some(
                    (id) => String(id) === String(k.id)
                  );
                  return (
                    <label
                      key={k.id}
                      className="row"
                      style={{
                        gap: 8,
                        alignItems: "center",
                        cursor: "pointer",
                        padding: "4px 6px",
                        borderRadius: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setTemplateForm((f) => {
                            const prev = Array.isArray(f.kindIds)
                              ? f.kindIds
                              : [];
                            const strId = String(k.id);
                            const exists = prev.some(
                              (x) => String(x) === strId
                            );
                            return {
                              ...f,
                              kindIds: exists
                                ? prev.filter((x) => String(x) !== strId)
                                : [...prev, k.id],
                            };
                          });
                        }}
                      />
                      <span>{k.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="form-section" style={{ marginTop: 14 }}>
          <div className="section-title">
            <h4>مواد مصرفی (اقلام الگو)</h4>
          </div>
          <div className="template-lines-card" style={{ overflowX: "auto" }}>
            <TemplateEditor
              data={data}
              lines={templateForm.lines}
              setLines={(lines) =>
                setTemplateForm((f) => ({ ...f, lines }))
              }
              toast={toast}
            />
          </div>
          {(!templateForm.lines || templateForm.lines.length === 0) && (
            <div className="info-banner" style={{ marginTop: 10 }}>
              <p>حداقل یک قلم برای ثبت الگو لازم است.</p>
            </div>
          )}
        </section>
      </OverlayModal>
    </div>
  );
}
