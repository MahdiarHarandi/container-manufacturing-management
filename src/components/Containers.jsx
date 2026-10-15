// src/components/Containers.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { Plus, Trash2, Edit3, Search, Eye, ChevronDown } from "lucide-react";
import OverlayModal from "./OverlayModal";
import TemplateEditor from "./TemplateEditor";
import { pushAudit } from "../utils/audit";
import { normalizeName } from "../utils/inventoryOps";

const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);

// وضعیت‌های مجاز برای واحد کانتینر
const UNIT_STATUSES = ["در انتظار ساخت", "در حال ساخت", "آماده"];

// وضعیت‌هایی که باعث مصرف مواد از انبار می‌شوند
const isConsumptiveStatus = (status) =>
  status === "در حال ساخت" || status === "آماده";

export default function Containers({ data, setData, toast, go }) {
  const allKinds = data.containerKinds || [];
  const allTemplates = data.containerTemplates || [];
  const units = data.containerUnits || [];
  const inventory = data.inventory || [];
  const orders = data.orders || [];
  const archivedOrders = data.archivedOrders || [];
  const customers = data.customers || [];

  const generateContainerUnitId = (existing) => {
    const set = new Set((existing || []).map((u) => String(u.id)));
    let id;
    do {
      id = `CNT-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (set.has(id));
    return id;
  };

  // ======= فیلترها و UI =======
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);

  // فرم‌ها
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState("add"); // 'add' | 'edit'
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [form, setForm] = useState({
    kindId: "",
    templateId: "",
    price: "",
    count: 1,
    status: "در انتظار ساخت",
    note: "",
    materials: [],
  });

  // جزئیات واحد
  const [showUnitDetails, setShowUnitDetails] = useState(null);

  // Smart select نوع کانتینر
  const [kindInput, setKindInput] = useState("");
  const [kindDropdownOpen, setKindDropdownOpen] = useState(false);
  const kindWrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (kindWrapperRef.current && !kindWrapperRef.current.contains(e.target)) {
        setKindDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ======= Helpers عمومی =======
  const getKindById = (kindId) =>
    allKinds.find((k) => k.id === kindId) || null;

  const getKindName = (kindId) => getKindById(kindId)?.name || "—";

  const getTemplateById = (templateId) =>
    allTemplates.find((t) => t.id === templateId) || null;

  const getTemplateName = (templateId) =>
    getTemplateById(templateId)?.name || "—";

  const getCustomerName = (id) =>
    customers.find((c) => c.id === id)?.name || "—";

  const templatesForKind = useMemo(() => {
    const kindId = form.kindId;
    return allTemplates.filter((t) => {
      const ids = Array.isArray(t.kindIds) ? t.kindIds : [];
      if (!ids.length) return true; // عمومی
      if (!kindId) return false;
      return ids.some((id) => String(id) === String(kindId));
    });
  }, [allTemplates, form.kindId]);

  // ======= فیلتر واحدها =======
  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();

    return units.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;

      if (!q) return true;

      const kindName = getKindName(u.kindId).toLowerCase();
      const templateName = getTemplateName(u.templateId).toLowerCase();
      const note = (u.note || "").toLowerCase();
      const idShort = String(u.id || "").toLowerCase();

      const fields = [
        kindName,
        templateName,
        note,
        (u.status || "").toLowerCase(),
        idShort,
      ];

      return fields.some((f) => f.includes(q));
    });
  }, [units, statusFilter, query, allKinds, allTemplates]);

  // ======= گروه‌بندی واحدها بر اساس (نوع + الگو) =======
  const groups = useMemo(() => {
    const map = new Map();

    for (const u of filteredUnits) {
      const key = `${u.kindId || "—"}::${u.templateId || "—"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          kindId: u.kindId || null,
          templateId: u.templateId || null,
          units: [],
        });
      }
      map.get(key).units.push(u);
    }

    return Array.from(map.values()).sort((a, b) => {
      const ak = getKindName(a.kindId);
      const bk = getKindName(b.kindId);
      const cmp = ak.localeCompare(bk, "fa");
      if (cmp !== 0) return cmp;
      const at = getTemplateName(a.templateId);
      const bt = getTemplateName(b.templateId);
      return at.localeCompare(bt, "fa");
    });
  }, [filteredUnits, allKinds, allTemplates]);

  // ======= آمار کلی =======
  const stats = useMemo(() => {
    let totalReady = 0;
    let totalBuilding = 0;
    let totalPending = 0;
    let totalValue = 0;

    for (const u of units) {
      const price = Number(u.price) || 0;
      totalValue += price;
      if (u.status === "آماده") totalReady += 1;
      else if (u.status === "در حال ساخت") totalBuilding += 1;
      else if (u.status === "در انتظار ساخت") totalPending += 1;
    }

    return { totalReady, totalBuilding, totalPending, totalValue };
  }, [units]);

  const filteredValue = useMemo(
    () =>
      filteredUnits.reduce((sum, u) => sum + (Number(u.price) || 0), 0),
    [filteredUnits]
  );

  // ======= مدیریت مواد و انبار برای یک واحد =======

  const applyInventoryDeltaForUnit = (inv, materials, multiplier) => {
    // multiplier: +1 برای بازگردانی، -1 برای مصرف
    let newInv = inv;
    materials.forEach((line) => {
      const delta = (Number(line.qty) || 0) * multiplier;
      if (!delta) return;
      newInv = newInv.map((i) => {
        if (i.id !== line.inventoryId) return i;
        const current = Number(i.stock) || 0;
        const next = current + delta;
        return { ...i, stock: Math.max(0, next) };
      });
    });
    return newInv;
  };

  const canConsumeMaterialsForUnits = (invSnapshot, materials, unitCount) => {
    const shortages = [];

    materials.forEach((line) => {
      const item = invSnapshot.find((i) => i.id === line.inventoryId);
      const required = (Number(line.qty) || 0) * unitCount;
      const available = Number(item?.stock ?? 0) || 0;
      if (!item || required > available) {
        shortages.push(
          `${item?.name || "کالا"} (نیاز: ${required}، موجود: ${available})`
        );
      }
    });

    if (shortages.length > 0) {
      toast(
        `موجودی مواد برای این عملیات کافی نیست:\n${shortages.join("، ")}`,
        { type: "error" }
      );
      return false;
    }
    return true;
  };

  // ======= تغییر وضعیت یک واحد =======
  const changeUnitStatus = (unit, newStatus) => {
    const oldStatus = unit.status;
    if (oldStatus === newStatus) return;

    const wasConsumptive = isConsumptiveStatus(oldStatus);
    const willBeConsumptive = isConsumptiveStatus(newStatus);
    const hasMaterials = (unit.materials || []).length > 0;

    // 🛑 هماهنگی با سفارش‌ها:
    // اگر این واحد به سفارشی که تحویل شده/آرشیو شده متصل است
    // اجازه نمی‌دهیم از «آماده» به وضعیت دیگر برگردد
    if (
      unit.assignedOrderId &&
      oldStatus === "آماده" &&
      newStatus !== "آماده"
    ) {
      const deliveredOrder = orders.find(
        (o) =>
          String(o.id) === String(unit.assignedOrderId) &&
          o.status === "تحویل شده"
      );
      const archivedOrder = archivedOrders.find(
        (o) => String(o.id) === String(unit.assignedOrderId)
      );

      if (deliveredOrder || archivedOrder) {
        toast(
          "این واحد به سفارشی که تحویل شده و/یا در آرشیو است متصل است؛ امکان تغییر وضعیت از «آماده» وجود ندارد.",
          { type: "error" }
        );
        return;
      }
    }

    if (willBeConsumptive && !hasMaterials) {
      toast("برای ورود به این وضعیت باید مواد مصرفی واحد مشخص شود", {
        type: "error",
      });
      return;
    }

    setData((d) => {
      let inv = d.inventory || [];
      const allUnitsCurrent = d.containerUnits || [];
      const current = allUnitsCurrent.find((u) => u.id === unit.id);
      if (!current) return d;

      const currentHasMaterials = (current.materials || []).length > 0;

      // خروج از وضعیت مصرفی → بازگردانی مواد
      if (
        wasConsumptive &&
        !willBeConsumptive &&
        current.materialsConsumed &&
        currentHasMaterials
      ) {
        inv = applyInventoryDeltaForUnit(inv, current.materials, +1);
      }

      // ورود به وضعیت مصرفی → مصرف مواد (اگر قبلاً مصرف نشده)
      if (
        willBeConsumptive &&
        !wasConsumptive &&
        currentHasMaterials &&
        !current.materialsConsumed
      ) {
        if (!canConsumeMaterialsForUnits(inv, current.materials, 1)) {
          return d;
        }
        inv = applyInventoryDeltaForUnit(inv, current.materials, -1);
      }

      const updatedUnits = allUnitsCurrent.map((u) =>
        u.id === current.id
          ? {
              ...u,
              status: newStatus,
              materialsConsumed:
                willBeConsumptive && currentHasMaterials
                  ? true
                  : !willBeConsumptive
                  ? false
                  : u.materialsConsumed,
            }
          : u
      );

      return {
        ...d,
        inventory: inv,
        containerUnits: updatedUnits,
      };
    });

    const displayName = `${getKindName(unit.kindId)} — ${getTemplateName(
      unit.templateId
    )} — واحد #${String(unit.id).slice(-6)}`;

    toast(`وضعیت واحد کانتینر (${displayName}) تغییر کرد`, {
      type: "success",
    });

    pushAudit(setData, {
      type: "CONTAINER_UNIT_STATUS_CHANGE",
      message: `تغییر وضعیت واحد کانتینر ${displayName} از ${oldStatus} به ${newStatus}`,
      payload: {
        unitId: unit.id,
        oldStatus,
        newStatus,
      },
    });
  };

  // ======= فرم‌ها =======
  const resetForm = () => {
    setShowForm(false);
    setFormMode("add");
    setEditingUnitId(null);
    setKindInput("");
    setKindDropdownOpen(false);
    setForm({
      kindId: "",
      templateId: "",
      price: "",
      count: 1,
      status: "در انتظار ساخت",
      note: "",
      materials: [],
    });
  };

  const openNewUnitForm = (group) => {
    setFormMode("add");
    setEditingUnitId(null);

    const kindId = group?.kindId || "";
    const templateId = group?.templateId || "";
    const priceHint = group && group.units.length > 0 ? group.units[0].price : "";

    setKindInput(kindId ? getKindName(kindId) : "");
    setForm({
      kindId,
      templateId,
      price: priceHint,
      count: 1,
      status: "در انتظار ساخت",
      note: "",
      materials:
        templateId && getTemplateById(templateId)
          ? getTemplateById(templateId).lines || []
          : [],
    });

    setShowForm(true);
  };

  const openEditUnitForm = (unit) => {
    setFormMode("edit");
    setEditingUnitId(unit.id);
    setKindInput(getKindName(unit.kindId));
    setForm({
      kindId: unit.kindId,
      templateId: unit.templateId || "",
      price: unit.price,
      count: 1, // در ویرایش همیشه روی یک واحد
      status: unit.status,
      note: unit.note || "",
      materials: unit.materials || [],
    });
    setShowForm(true);
  };

  const handleSubmitForm = () => {
    if (!form.kindId) {
      toast("نوع کانتینر را انتخاب کنید", { type: "warning" });
      return;
    }

    const kind = getKindById(form.kindId);
    if (!kind) {
      toast("نوع کانتینر انتخاب‌شده معتبر نیست", { type: "error" });
      return;
    }

    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast("قیمت واحد معتبر نیست", { type: "error" });
      return;
    }

    const status = form.status;
    const materials = form.materials || [];
    const isConsumptive = isConsumptiveStatus(status);
    const hasMaterials = materials.length > 0;

    if (formMode === "add") {
      const count = Number(form.count) || 1;
      if (count <= 0) {
        toast("تعداد واحدها باید حداقل ۱ باشد", { type: "error" });
        return;
      }

      if (isConsumptive && !hasMaterials) {
        toast("برای وضعیت انتخاب‌شده باید مواد مصرفی واحد مشخص شود", {
          type: "error",
        });
        return;
      }

      if (isConsumptive && hasMaterials) {
        if (!canConsumeMaterialsForUnits(inventory, materials, count)) {
          return;
        }
      }

      // ساخت واحدها
      const now = new Date().toISOString();
      const templateId = form.templateId || null;
      const newUnits = [];
      // برای جلوگیری از تکرار شناسه در یک batch
      const existingPlusNew = [...units];

      for (let i = 0; i < count; i += 1) {
        const id = generateContainerUnitId(existingPlusNew);

        const unit = {
          id,
          kindId: form.kindId,
          templateId,
          price,
          status,
          note: form.note || "",
          materials: materials.map((m) => ({ ...m })), // کپی
          materialsConsumed: isConsumptive && hasMaterials ? true : false,
          assignedOrderId: null,
          createdAt: now,
        };

        newUnits.push(unit);
        // فقط id برای جلوگیری از تکرار کافی است
        existingPlusNew.push({ id });
      }

      setData((d) => {
        let inv = d.inventory || [];
        if (isConsumptive && hasMaterials) {
          // مصرف مواد برای count واحد
          materials.forEach((line) => {
            const total = (Number(line.qty) || 0) * count;
            if (!total) return;
            inv = inv.map((i) => {
              if (i.id !== line.inventoryId) return i;
              const current = Number(i.stock) || 0;
              const next = current - total;
              return { ...i, stock: Math.max(0, next) };
            });
          });
        }

        const updatedUnits = [...(d.containerUnits || []), ...newUnits];

        return {
          ...d,
          inventory: inv,
          containerUnits: updatedUnits,
        };
      });

      pushAudit(setData, {
        type: "CONTAINER_UNITS_ADD",
        message: `افزودن ${count} واحد کانتینر از نوع «${kind.name}»`,
        payload: {
          kindId: form.kindId,
          templateId: form.templateId || null,
          count,
          status,
          price,
          materials,
        },
      });

      toast(`ثبت ${count} واحد کانتینر جدید انجام شد`, {
        type: "success",
      });
      resetForm();
      return;
    }

    // === ویرایش یک واحد ===
    if (formMode === "edit") {
      const allUnitsSnapshot = units;
      const unit = allUnitsSnapshot.find((u) => u.id === editingUnitId);
      if (!unit) {
        toast("واحد مورد نظر پیدا نشد", { type: "error" });
        return;
      }

      const oldStatus = unit.status;
      const oldMaterials = unit.materials || [];
      const wasConsumptive = isConsumptiveStatus(oldStatus);
      const willBeConsumptive = isConsumptiveStatus(status);
      const hadMaterials = oldMaterials.length > 0;
      const materialsChanged =
        JSON.stringify(
          [...materials].sort((a, b) =>
            a.inventoryId > b.inventoryId ? 1 : -1
          )
        ) !==
        JSON.stringify(
          [...oldMaterials].sort((a, b) =>
            a.inventoryId > b.inventoryId ? 1 : -1
          )
        );

      // اگر واحد به سفارش تحویل‌شده/آرشیو شده متصل است و قرار است از آماده خارج شود → ممنوع
      if (
        unit.assignedOrderId &&
        oldStatus === "آماده" &&
        status !== "آماده"
      ) {
        const deliveredOrder = orders.find(
          (o) =>
            String(o.id) === String(unit.assignedOrderId) &&
            o.status === "تحویل شده"
        );
        const archivedOrder = archivedOrders.find(
          (o) => String(o.id) === String(unit.assignedOrderId)
        );
        if (deliveredOrder || archivedOrder) {
          toast(
            "این واحد به سفارشی که تحویل شده و/یا در آرشیو است متصل است؛ وضعیت آن را نمی‌توان از «آماده» تغییر داد.",
            { type: "error" }
          );
          return;
        }
      }

      // اگر وضعیت جدید مصرفی است ولی مواد وجود ندارد
      if (willBeConsumptive && !hasMaterials) {
        toast("برای وضعیت انتخاب‌شده باید مواد مصرفی واحد مشخص شود", {
          type: "error",
        });
        return;
      }

      setData((d) => {
        let inv = d.inventory || [];
        const allUnitsCurrent = d.containerUnits || [];
        const current = allUnitsCurrent.find((u) => u.id === unit.id);
        if (!current) return d;

        const currentHasMaterials = (current.materials || []).length > 0;

        // 1) اگر از وضعیت مصرفی خارج می‌شویم → بازگردانی مواد قبلی
        if (
          wasConsumptive &&
          !willBeConsumptive &&
          current.materialsConsumed &&
          hadMaterials
        ) {
          inv = applyInventoryDeltaForUnit(inv, oldMaterials, +1);
        }

        // 2) اگر وارد وضعیت مصرفی می‌شویم و قبلا مصرف نکرده بودیم → مصرف مواد جدید
        if (
          !wasConsumptive &&
          willBeConsumptive &&
          hasMaterials &&
          !current.materialsConsumed
        ) {
          if (!canConsumeMaterialsForUnits(inv, materials, 1)) {
            return d;
          }
          inv = applyInventoryDeltaForUnit(inv, materials, -1);
        }

        // 3) اگر هر دو وضعیت مصرفی هستند و قبلا مواد مصرف شده و مواد تغییر کرده‌اند
        if (
          wasConsumptive &&
          willBeConsumptive &&
          current.materialsConsumed &&
          materialsChanged
        ) {
          // ابتدا مواد قبلی را برمی‌گردانیم
          inv = applyInventoryDeltaForUnit(inv, oldMaterials, +1);

          // سپس مواد جدید را مصرف می‌کنیم (در صورت کافی بودن موجودی)
          const invSnapshot = inv;
          const shortages = [];
          materials.forEach((line) => {
            const item = invSnapshot.find((i) => i.id === line.inventoryId);
            const required = Number(line.qty) || 0;
            const available = Number(item?.stock ?? 0) || 0;
            if (!item || required > available) {
              shortages.push(
                `${item?.name || "کالا"} (نیاز: ${required}، موجود: ${available})`
              );
            }
          });
          if (shortages.length > 0) {
            toast(
              `مواد اولیه برای مواد جدید این واحد کافی نیست:\n${shortages.join(
                "، "
              )}`,
              { type: "error" }
            );
            // موجودی را تغییر ندهیم
            return d;
          }

          // حالا مواد جدید را مصرف می‌کنیم
          inv = applyInventoryDeltaForUnit(inv, materials, -1);
        }

        const updatedUnits = allUnitsCurrent.map((u) =>
          u.id === current.id
            ? {
                ...u,
                kindId: form.kindId,
                templateId: form.templateId || null,
                price,
                status,
                note: form.note || "",
                materials: materials.map((m) => ({ ...m })),
                materialsConsumed:
                  willBeConsumptive && hasMaterials
                    ? true
                    : !willBeConsumptive
                    ? false
                    : u.materialsConsumed,
              }
            : u
        );

        return {
          ...d,
          inventory: inv,
          containerUnits: updatedUnits,
        };
      });

      pushAudit(setData, {
        type: "CONTAINER_UNIT_EDIT",
        message: `ویرایش واحد کانتینر از نوع «${kind.name}»`,
        payload: {
          unitId: unit.id,
          oldStatus,
          newStatus: status,
          oldMaterials,
          newMaterials: materials,
          price,
        },
      });

      toast("ویرایش واحد کانتینر انجام شد", { type: "success" });
      resetForm();
      return;
    }
  };

  // حذف واحد
  const handleDeleteUnit = (unit) => {
    if (unit.assignedOrderId) {
      toast("این واحد به یک سفارش اختصاص یافته و قابل حذف نیست.", {
        type: "error",
      });
      return;
    }

    if (!window.confirm("آیا از حذف این واحد کانتینر اطمینان دارید؟")) {
      return;
    }

    setData((d) => {
      let inv = d.inventory || [];
      const allUnitsCurrent = d.containerUnits || [];
      const current = allUnitsCurrent.find((u) => u.id === unit.id);
      if (!current) return d;

      if (current.materialsConsumed && (current.materials || []).length > 0) {
        inv = applyInventoryDeltaForUnit(inv, current.materials, +1);
      }

      const updatedUnits = allUnitsCurrent.filter((u) => u.id !== unit.id);

      return {
        ...d,
        inventory: inv,
        containerUnits: updatedUnits,
      };
    });

    const displayName = `${getKindName(unit.kindId)} — ${getTemplateName(
      unit.templateId
    )} — واحد #${String(unit.id).slice(-6)}`;

    toast("واحد کانتینر حذف شد", { type: "success" });

    pushAudit(setData, {
      type: "CONTAINER_UNIT_DELETE",
      message: `حذف واحد کانتینر ${displayName}`,
      payload: {
        unitId: unit.id,
      },
    });
  };

  // نمایش جزئیات یک واحد
  const openUnitDetails = (unit) => {
    setShowUnitDetails(unit);
    pushAudit(setData, {
      type: "CONTAINER_UNIT_VIEW",
      message: `مشاهده جزئیات واحد کانتینر #${String(unit.id).slice(-6)}`,
      payload: { unitId: unit.id },
    });
  };

  const relatedOrdersForUnit = useMemo(() => {
    if (!showUnitDetails) return { active: [], archived: [] };
    const unitId = showUnitDetails.id;

    const active = orders.filter(
      (o) =>
        Array.isArray(o.containerUnitIds) &&
        o.containerUnitIds.includes(unitId)
    );
    const archived = archivedOrders.filter(
      (o) =>
        Array.isArray(o.containerUnitIds) &&
        o.containerUnitIds.includes(unitId)
    );

    return { active, archived };
  }, [showUnitDetails, orders, archivedOrders]);

  // ======= Render =======
  return (
    <div className="card" style={{ padding: 16 }}>
      {/* هدر صفحه + تب‌ها */}
      <div className="section-title" style={{ marginTop: "-2.4px" }}>
        <div className="header-line">
          <h3 className="header-title">مدیریت</h3>

          <div className="header-tabs">
            <h3 className="header-tab active" onClick={() => go("containers")}>
              کانتینرها
            </h3>
            <span className="header-separator">/</span>
            <h3 className="header-tab" onClick={() => go("models")}>
              مدل‌های ساخت
            </h3>
          </div>
        </div>

        {/* نوار ابزار سمت راست */}
        <div
          className="row"
          style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}
        >
          <div className="row" style={{ alignItems: "center" }}>
            <Search size={16} style={{ opacity: 0.6 }} />
            <input
              className="input"
              placeholder="جستجوی کانتینر..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 200 }}
            />
          </div>

          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">همه وضعیت‌ها</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button className="btn primary" onClick={() => openNewUnitForm(null)}>
            <Plus size={18} /> ثبت کانتینر جدید
          </button>
        </div>
      </div>

      {/* آمار بالای جدول */}
      <div
        className="row"
        style={{
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          justifyContent: "flex-start",
        }}
      >
        <div className="pill pill-soft-success">
          <span>آماده: {stats.totalReady}</span>
        </div>
        <div className="pill pill-soft-warning">
          <span>در حال ساخت: {stats.totalBuilding}</span>
        </div>
        <div className="pill pill-soft-muted">
          <span>در انتظار ساخت: {stats.totalPending}</span>
        </div>
        <div className="pill" style={{ background: "rgba(251,191,36,0.12)" }}>
          ارزش کل: {currency(filteredValue)} تومان
        </div>
      </div>

      {/* جدول گروه‌ها + اکاردئون واحدها */}
      {groups.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-light)",
          }}
        >
          هنوز هیچ واحد کانتینری ثبت نشده است.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>نوع کانتینر</th>
              <th>الگوی ساخت</th>
              <th>تعداد واحد</th>
              <th>آماده</th>
              <th>در حال ساخت</th>
              <th>در انتظار</th>
              <th>ارزش تقریبی گروه</th>
              <th>عملیات</th>
              <th style={{ width: 0 }}></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isExpanded = expandedGroupKey === g.key;
              const readyCount = g.units.filter((u) => u.status === "آماده")
                .length;
              const buildingCount = g.units.filter(
                (u) => u.status === "در حال ساخت"
              ).length;
              const pendingCount = g.units.filter(
                (u) => u.status === "در انتظار ساخت"
              ).length;
              const groupValue = g.units.reduce(
                (sum, u) => sum + (Number(u.price) || 0),
                0
              );

              return (
                <React.Fragment key={g.key}>
                  <tr>
                    <td>{getKindName(g.kindId)}</td>
                    <td>{g.templateId ? getTemplateName(g.templateId) : "—"}</td>
                    <td>{g.units.length}</td>
                    <td>{readyCount}</td>
                    <td>{buildingCount}</td>
                    <td>{pendingCount}</td>
                    <td>{currency(groupValue)} تومان</td>
                    <td style={{ textAlign: "left" }}>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => openNewUnitForm(g)}
                        >
                          <Plus size={14} /> افزودن واحد
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className={`accordion-toggle ${isExpanded ? "open" : ""}`}
                        onClick={() =>
                          setExpandedGroupKey(isExpanded ? null : g.key)
                        }
                        title={isExpanded ? "بستن" : "نمایش واحدها"}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="expanded-row">
                      <td colSpan={9}>
                        {/* جدول واحدهای این گروه */}
                        {g.units.length === 0 ? (
                          <p className="muted">
                            هنوز واحدی برای این گروه ثبت نشده است.
                          </p>
                        ) : (
                          <table className="details-table">
                            <thead>
                              <tr>
                                <th>شناسه واحد</th>
                                <th>وضعیت</th>
                                <th>قیمت</th>
                                <th>سفارش</th>
                                <th>یادداشت</th>
                                <th>عملیات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.units.map((u) => (
                                <tr key={u.id}>
                                  <td>#{String(u.id).slice(-6)}</td>
                                  <td>
                                    <select
                                      className="input"
                                      value={u.status}
                                      onChange={(e) =>
                                        changeUnitStatus(u, e.target.value)
                                      }
                                    >
                                      {UNIT_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>{currency(u.price)} تومان</td>
                                  <td>
                                    {u.assignedOrderId
                                      ? `#${String(
                                          u.assignedOrderId
                                        ).slice(-6)}`
                                      : "—"}
                                  </td>
                                  <td>{u.note || "—"}</td>
                                  <td style={{ textAlign: "left" }}>
                                    <div
                                      className="row"
                                      style={{
                                        gap: 6,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <button
                                        className="btn"
                                        type="button"
                                        onClick={() => openUnitDetails(u)}
                                      >
                                        <Eye size={14} /> جزئیات
                                      </button>
                                      <button
                                        className="btn"
                                        type="button"
                                        onClick={() => openEditUnitForm(u)}
                                      >
                                        <Edit3 size={14} /> ویرایش
                                      </button>
                                      <button
                                        className="btn danger"
                                        type="button"
                                        onClick={() => handleDeleteUnit(u)}
                                      >
                                        <Trash2 size={14} /> حذف
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {/* مودال فرم افزودن/ویرایش واحدها */}
      <OverlayModal
        open={showForm}
        onClose={resetForm}
        title={
          formMode === "add"
            ? "ثبت واحدهای جدید کانتینر"
            : "ویرایش واحد کانتینر"
        }
        size="lg"
        footer={
          <>
            <button className="btn" onClick={resetForm}>
              انصراف
            </button>
            <button className="btn primary" onClick={handleSubmitForm}>
              {formMode === "add" ? "ثبت واحدها" : "ذخیره تغییرات"}
            </button>
          </>
        }
      >
        {/* اطلاعات پایه */}
        <section className="form-section">
          <h4>اطلاعات پایه</h4>
          <div className="form-grid">
            {/* نوع کانتینر (Smart Select) */}
            <div ref={kindWrapperRef} style={{ position: "relative" }}>
              <label>نوع کانتینر</label>
              <input
                className="input"
                placeholder="مثلاً ۲۰ فوت اداری..."
                value={kindInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setKindInput(val);
                  setKindDropdownOpen(true);
                  const matched = allKinds.find(
                    (k) =>
                      normalizeName(k.name) === normalizeName(val.trim())
                  );
                  setForm((f) => ({
                    ...f,
                    kindId: matched ? matched.id : "",
                    templateId: "", // وقتی نوع عوض شد، الگو هم ریست شود
                  }));
                }}
                onFocus={() => setKindDropdownOpen(true)}
              />
              {kindDropdownOpen && (
                <div className="smart-dropdown">
                  {allKinds
                    .filter((k) =>
                      normalizeName(k.name).includes(
                        normalizeName(kindInput)
                      )
                    )
                    .map((k) => (
                      <div
                        key={k.id}
                        className="smart-option"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            kindId: k.id,
                          }));
                          setKindInput(k.name);
                          setKindDropdownOpen(false);
                          const input =
                            kindWrapperRef.current?.querySelector("input");
                          if (input) input.blur();
                        }}
                      >
                        {k.name}
                      </div>
                    ))}

                  {!allKinds.some(
                    (k) =>
                      normalizeName(k.name) ===
                      normalizeName(kindInput.trim())
                  ) &&
                    kindInput.trim() !== "" && (
                      <div
                        className="smart-option add-new"
                        onClick={() => {
                          const raw = kindInput.trim();
                          const id = `kind_${Date.now()}`;
                          setData((d) => ({
                            ...d,
                            containerKinds: [
                              ...(d.containerKinds || []),
                              { id, name: raw },
                            ],
                          }));
                          setForm((f) => ({
                            ...f,
                            kindId: id,
                          }));
                          setKindInput(raw);
                          setKindDropdownOpen(false);
                          toast("نوع جدید اضافه شد", { type: "success" });

                          pushAudit(setData, {
                            type: "CONTAINER_KIND_QUICK_ADD",
                            message: `افزودن نوع جدید کانتینر «${raw}» از صفحه کانتینرها`,
                            payload: { kindId: id, name: raw },
                          });
                        }}
                      >
                        ➕ افزودن نوع جدید "{kindInput}"
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* الگوی ساخت */}
            <div>
              <label>الگوی ساخت</label>
              <select
                className="input"
                value={form.templateId || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    templateId: e.target.value || "",
                    materials:
                      e.target.value && getTemplateById(e.target.value)
                        ? getTemplateById(e.target.value).lines || []
                        : f.materials, // در حالت بدون الگو، مواد فعلی حفظ می‌شود (برای سفارشی‌سازی دستی)
                  }))
                }
              >
                <option value="">بدون الگو (سفارشی)</option>
                {templatesForKind.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* قیمت */}
            <div>
              <label>قیمت واحد (تومان)</label>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="مثلاً 45,000,000"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
              />
            </div>

            {/* تعداد واحدها (فقط در حالت افزودن) */}
            {formMode === "add" && (
              <div>
                <label>تعداد واحد</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  step={1}
                  value={form.count}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      count: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
            )}

            {/* وضعیت */}
            <div>
              <label>وضعیت اولیه</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* یادداشت */}
            <div className="form-grid-span-2">
              <label>یادداشت</label>
              <textarea
                className="input"
                rows={2}
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="توضیحات تکمیلی..."
              />
            </div>
          </div>
        </section>

        {/* مواد مصرفی واحد */}
        <section className="form-section">
          <h4>مواد مصرفی</h4>
		  <TemplateEditor
		    data={data}
		    template={null}
		    lines={form.materials}
		    setLines={(lines) => setForm((f) => ({ ...f, materials: lines }))}
		    toast={toast}
		    units={formMode === "add" ? Number(form.count) || 1 : 1} // ✅ اسم درست پراپ
		    compact
		  />
        </section>
      </OverlayModal>

      {/* مودال جزئیات واحد */}
      <OverlayModal
        open={!!showUnitDetails}
        onClose={() => setShowUnitDetails(null)}
        title={
          showUnitDetails
            ? `جزئیات واحد کانتینر #${String(showUnitDetails.id).slice(-6)}`
            : "جزئیات واحد کانتینر"
        }
        size="lg"
        footer={
          <button className="btn" onClick={() => setShowUnitDetails(null)}>
            بستن
          </button>
        }
      >
        {showUnitDetails && (
          <div className="details-wrapper">
            {/* مشخصات کلی */}
            <section className="details-card">
              <h4>📦 مشخصات واحد</h4>
              <div className="details-row">
                <span className="label">شناسه واحد:</span>
                <span className="value">
                  #{String(showUnitDetails.id).slice(-6)}
                </span>
              </div>
              <div className="details-row">
                <span className="label">نوع کانتینر:</span>
                <span className="value">
                  {getKindName(showUnitDetails.kindId)}
                </span>
              </div>
              <div className="details-row">
                <span className="label">الگوی ساخت:</span>
                <span className="value">
                  {showUnitDetails.templateId
                    ? getTemplateName(showUnitDetails.templateId)
                    : "—"}
                </span>
              </div>
              <div className="details-row">
                <span className="label">قیمت:</span>
                <span className="value">
                  {currency(showUnitDetails.price)} تومان
                </span>
              </div>
              <div className="details-row">
                <span className="label">وضعیت:</span>
                <span className="value">{showUnitDetails.status}</span>
              </div>
              <div className="details-row">
                <span className="label">سفارش مرتبط:</span>
                <span className="value">
                  {showUnitDetails.assignedOrderId
                    ? `سفارش #${String(
                        showUnitDetails.assignedOrderId
                      ).slice(-6)}`
                    : "—"}
                </span>
              </div>
              <div className="details-row">
                <span className="label">تاریخ ایجاد:</span>
                <span className="value">
                  {showUnitDetails.createdAt
                    ? new Date(
                        showUnitDetails.createdAt
                      ).toLocaleString("fa-IR")
                    : "—"}
                </span>
              </div>
              <div className="details-row">
                <span className="label">یادداشت:</span>
                <span className="value">
                  {showUnitDetails.note || "—"}
                </span>
              </div>
            </section>

            {/* مواد مصرفی */}
            <section className="details-card">
              <h4>🧩 مواد مصرفی واحد</h4>
              {(showUnitDetails.materials || []).length === 0 ? (
                <p className="muted">هیچ ماده‌ای ثبت نشده است.</p>
              ) : (
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>کالا</th>
                      <th>مقدار مصرف واحد</th>
                      <th>واحد</th>
                      <th>موجودی فعلی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showUnitDetails.materials.map((m, idx) => {
                      const item = inventory.find(
                        (i) => i.id === m.inventoryId
                      );
                      return (
                        <tr
                          key={`${showUnitDetails.id}-${m.inventoryId}-${idx}`}
                        >
                          <td>{item?.name || "—"}</td>
                          <td>{m.qty}</td>
                          <td>{item?.unit || "—"}</td>
                          <td>{item?.stock ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </OverlayModal>
    </div>
  );
}
