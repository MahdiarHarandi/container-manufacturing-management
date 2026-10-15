import React, { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Search,
  AlertTriangle,
  ChevronDown,
  Eye,
  Printer,
} from "lucide-react";
import OverlayModal from "./OverlayModal";
import { pushAudit } from "../utils/audit";
import ShamsiDatePicker from "./ShamsiDatePicker";
import { createPortal } from "react-dom";

// ====================== Utils ======================
const makeId = () =>
  (typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.randomUUID === "function" &&
    window.crypto.randomUUID()) ||
  `id_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;


const currency = (n) => new Intl.NumberFormat("fa-IR").format(n ?? 0);
const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR").format(date);
};

const normalizeName = (str) =>
  String(str || "")
    .trim()
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/\s+/g, " ");

// ساخت فرم خالی
const createDefaultForm = () => ({
  date: todayISO(),
  customerId: "",
  customerName: "",
  customerPhone: "",
  containerUnitIds: [], // واحدهای انتخاب‌شده برای این سفارش
  total: "",
  paymentType: "نقد", // نقد | چک | نقد + چک
  payments: { cash: 0, checks: [] },
  installment: { enabled: false, list: [] }, // اقساط؛ وصول در Finance
  status: "در جریان",
  note: "",
});

// بررسی وضعیت تسویه واقعی سفارش برای آرشیو
const getOrderSettlementStatus = (order, finance, checks) => {
  const total = Number(order.total) || 0;

  // دریافت‌های نقدی واقعی
  const cashIncome = (finance || [])
    .filter(
      (f) =>
        f.type === "income" &&
        String(f.orderId) === String(order.id) &&
        f.method === "نقد"
    )
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  // دریافت‌های اقساطی واقعی
  const installmentIncome = (finance || [])
    .filter(
      (f) =>
        f.type === "income" &&
        String(f.orderId) === String(order.id) &&
        f.method === "قسط"
    )
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  // چک‌های پاس‌شده
  const clearedChecksTotal = (checks || [])
    .filter(
      (ch) =>
        String(ch.orderId) === String(order.id) && ch.status === "پاس شد"
    )
    .reduce((sum, ch) => sum + (Number(ch.amount) || 0), 0);

  const actualPaidTotal = cashIncome + installmentIncome + clearedChecksTotal;
  const remaining = total - actualPaidTotal;

  // چک‌های در انتظار
  const hasPendingChecks = (checks || []).some(
    (ch) =>
      String(ch.orderId) === String(order.id) && ch.status === "در انتظار"
  );

  // اقساط برنامه‌ریزی‌شده
  const plannedInstallmentsTotal = order.installment?.enabled
    ? (order.installment.list || []).reduce(
        (sum, ins) => sum + (Number(ins.amount) || 0),
        0
      )
    : 0;

  const installmentsSettled = installmentIncome >= plannedInstallmentsTotal;

  const fullyPaid = actualPaidTotal >= total;

  return {
    total,
    actualPaidTotal,
    remaining,
    fullyPaid,
    hasPendingChecks,
    installmentsSettled,
    plannedInstallmentsTotal,
  };
};

const SELECTABLE_UNIT_STATUSES = ["در انتظار ساخت", "در حال ساخت", "آماده"];

// ====================== Component ======================
export default function Orders({ data, setData, toast, go }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // id سفارش در حال ویرایش
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active"); // active | archived
  
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  
  const [form, setForm] = useState(createDefaultForm());
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  // باز/بسته بودن گروه‌ها و فرم ثبت واحد جدید
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const [showUnitInlineForm, setShowUnitInlineForm] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({
    kindId: "",
    templateId: "",
    price: "",
    note: "",
  });

  const customers = data.customers || [];
  const containerUnits = data.containerUnits || [];
  const containerKinds = data.containerKinds || [];
  const containerTemplates = data.containerTemplates || [];
  // الگوهای مجاز برای نوع انتخاب‌شده در فرم واحد جدید
  const templatesForNewUnitKind = useMemo(() => {
    const kindId = newUnitForm.kindId;
    return containerTemplates.filter((t) => {
      const ids = Array.isArray(t.kindIds) ? t.kindIds : [];
      if (!ids.length) return true; // عمومی
      if (!kindId) return false;
      return ids.some((id) => String(id) === String(kindId));
    });
  }, [containerTemplates, newUnitForm.kindId]);

  const orders = data.orders || [];
  const finance = data.finance || [];
  const checks = data.checks || [];
  const archivedOrders = data.archivedOrders || [];

  // ----------------- Helpers -----------------
   // چاپ فاکتور جاری
  const handlePrintInvoice = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const notifyError = (msg) => {
    toast(msg, { type: "error" });
    return false;
  };

  const getCustomerName = (id) =>
    customers.find((c) => String(c.id) === String(id))?.name || "—";

  const getKindName = (id) =>
    containerKinds.find((k) => String(k.id) === String(id))?.name || "—";

  const getTemplateName = (id) =>
    containerTemplates.find((t) => String(t.id) === String(id))?.name || "—";

  const getOrderUnits = (order) => {
    const ids = order.containerUnitIds || [];
    if (!ids.length) return [];
    const idSet = new Set(ids.map(String));
    return containerUnits.filter((u) => idSet.has(String(u.id)));
  };

  const buildOrderUnitsSummary = (order) => {
    const units = getOrderUnits(order);
    if (!units.length) return "بدون کانتینر";

    // گروه‌بندی بر اساس (نوع + الگو)
    const map = new Map();
    for (const u of units) {
      const key = `${u.kindId || "—"}::${u.templateId || "—"}`;
      if (!map.has(key)) {
        map.set(key, { kindId: u.kindId, templateId: u.templateId, count: 0 });
      }
      map.get(key).count += 1;
    }

    const parts = [];
    for (const g of map.values()) {
      const kindName = getKindName(g.kindId) || "نوع ناشناخته";
      const templateName = g.templateId
        ? getTemplateName(g.templateId)
        : "";
      const label = templateName
        ? `${kindName} — ${templateName}`
        : kindName;
      parts.push(`${label} ×${g.count}`);
    }

    return parts.join(" ، ");
  };

  // آیا این سفارش طبق وضعیت واحدها قابل تحویل هست؟ (گزینه B)
  const canDeliverOrder = (order) => {
    const units = getOrderUnits(order);
    if (!units.length) return false;
    if (order.status === "تحویل شده") return false;

    // تحویل فقط وقتی مجاز است که تمام واحدها "آماده" باشند
    return units.every((u) => u.status === "آماده");
  };

  const generateOrderId = (existing) => {
    const set = new Set((existing || []).map((o) => String(o.id)));
    let id;
    do {
      id = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (set.has(id));
    return id;
  };
  
  const generateContainerUnitId = (existing) => {
    const set = new Set((existing || []).map((u) => String(u.id)));
    let id;
    do {
      id = `CNT-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (set.has(id));
    return id;
  };

  // ----------------- محاسبات لحظه‌ای فرم -----------------
  const totalInvoice = Number(form.total || 0);

  const cashPaid = Number(form.payments?.cash || 0);

  const checksPaid = (form.payments?.checks || []).reduce(
    (sum, ch) => sum + Number(ch.amount || 0),
    0
  );

  const installmentsPlanned = (form.installment?.list || []).reduce(
    (sum, ins) => sum + Number(ins.amount || 0),
    0
  );

  const totalPlannedPayments = cashPaid + checksPaid + installmentsPlanned;
  const remaining = totalInvoice - totalPlannedPayments;

  const selectedUnits = useMemo(() => {
    const ids = form.containerUnitIds || [];
    if (!ids.length) return [];
    const idSet = new Set(ids.map(String));
    return containerUnits.filter((u) => idSet.has(String(u.id)));
  }, [containerUnits, form.containerUnitIds]);

  const unitsTotalPrice = selectedUnits.reduce(
    (sum, u) => sum + (Number(u.price) || 0),
    0
  );

  const selectableUnits = useMemo(() => {
    return containerUnits.filter((u) => {
      // فقط واحدهایی با وضعیت مجاز
      if (!SELECTABLE_UNIT_STATUSES.includes(u.status)) {
        return false;
      }

      // و نباید به سفارش دیگری اختصاص داده شده باشند
      if (
        u.assignedOrderId &&
        String(u.assignedOrderId) !== String(editing || "")
      ) {
        return false;
      }

      return true;
    });
  }, [containerUnits, editing]);

  // گروه‌بندی واحدهای قابل سفارش بر اساس (نوع + مدل ساخت)
  const selectableGroups = useMemo(() => {
    const map = new Map();

    for (const u of selectableUnits) {
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
  }, [selectableUnits, containerKinds, containerTemplates]);

  // ----------------- اعتبارسنجی فرم -----------------
  const validateForm = () => {
    // مشتری
    if (!isNewCustomer && !form.customerId) {
      return notifyError("لطفاً مشتری را انتخاب کنید");
    }
    if (isNewCustomer && !normalizeName(form.customerName)) {
      return notifyError("نام مشتری را وارد کنید");
    }

    // کانتینرها (واحدها)
    if (!form.containerUnitIds || form.containerUnitIds.length === 0) {
      return notifyError("حداقل یک واحد کانتینر را برای این سفارش انتخاب کنید");
    }

    const selected = selectedUnits;
    if (!selected.length) {
      return notifyError("واحدهای انتخاب‌شده معتبر نیستند");
    }

    const invalidStatusUnit = selected.find(
      (u) => !SELECTABLE_UNIT_STATUSES.includes(u.status)
    );
	
	// جلوگیری از رزرو واحدهایی که اکنون در سفارش دیگری هستند
	const unavailableUnit = selected.find(
	  (u) =>
		u.assignedOrderId &&
		String(u.assignedOrderId) !== String(editing || "")
	);

	if (unavailableUnit) {
	  return notifyError(
		`واحد #${String(unavailableUnit.id).slice(-6)} قبلاً به سفارش دیگری اختصاص داده شده است`
	  );
	}

    if (invalidStatusUnit) {
      return notifyError(
        "برخی واحدهای انتخاب‌شده وضعیت مناسبی برای ثبت سفارش ندارند"
      );
    }

    // مبلغ
    const total = Number(form.total || 0);
    if (!(total > 0)) {
      return notifyError("مبلغ فاکتور معتبر نیست");
    }

    // پرداخت‌ها
	let cash = 0;
	let checksList = [];

	if (form.paymentType === "نقد") {
	  cash = Number(form.payments?.cash || 0);
	  checksList = [];
	} else if (form.paymentType === "چک") {
	  cash = 0;
	  checksList = form.payments?.checks || [];
	} else if (form.paymentType === "نقد + چک") {
	  cash = Number(form.payments?.cash || 0);
	  checksList = form.payments?.checks || [];
	}
    const checksTotal = checksList.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0
    );

    if (
      form.paymentType === "چک" &&
      (!checksList || checksList.length === 0)
    ) {
      return notifyError("در حالت پرداخت چک، حداقل یک چک باید وارد شود");
    }

    if (
      form.paymentType === "نقد + چک" &&
      cash === 0 &&
      (!checksList || checksList.length === 0)
    ) {
      return notifyError("در حالت نقد + چک باید مبلغ نقد یا حداقل یک چک ثبت شود");
    }

    // اقساط
    let installmentsTotal = 0;
    if (form.installment?.enabled) {
      const list = form.installment.list || [];
      if (list.length === 0) {
        return notifyError("برنامهٔ اقساط خالی است");
      }
      for (let i = 0; i < list.length; i++) {
        const ins = list[i];
        if (!ins.date) {
          return notifyError(`تاریخ قسط ${i + 1} وارد نشده است`);
        }
        const amt = Number(ins.amount || 0);
        if (!(amt > 0)) {
          return notifyError(`مبلغ قسط ${i + 1} معتبر نیست`);
        }
        installmentsTotal += amt;
      }
    }

    // مجموع پرداخت‌ها باید دقیقاً برابر مبلغ فاکتور باشد
    const totalPayments = cash + checksTotal + installmentsTotal;

    if (totalPayments < total) {
      return notifyError(
        "مجموع نقد + چک + اقساط کمتر از مبلغ فاکتور است؛ فاکتور باید به‌طور کامل پوشش داده شود"
      );
    }

    if (totalPayments > total) {
      return notifyError(
        "مجموع نقد + چک + اقساط از مبلغ فاکتور بیشتر است"
      );
    }

    if (!form.date) {
      return notifyError("تاریخ سفارش مشخص نیست");
    }

	if (Number(form.total) < unitsTotalPrice) {
	  return notifyError(
		"مبلغ فاکتور نمی‌تواند از مجموع قیمت واحدهای انتخاب‌شده کمتر باشد"
	  );
	}

    return true;
  };

  // ----------------- لیست + جستجو -----------------
  const normalizedQuery = normalizeName(query);

  const ordersFiltered = useMemo(() => {
    let arr = [...orders];
    if (normalizedQuery) {
      arr = arr.filter((o) => {
        const custName = normalizeName(getCustomerName(o.customerId));
        const unitsSummary = normalizeName(buildOrderUnitsSummary(o));
        const note = normalizeName(o.note || "");
        return (
          custName.includes(normalizedQuery) ||
          unitsSummary.includes(normalizedQuery) ||
          note.includes(normalizedQuery)
        );
      });
    }
    return arr.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [orders, normalizedQuery]);

  const archivedFiltered = useMemo(() => {
    let arr = [...archivedOrders];
    if (normalizedQuery) {
      arr = arr.filter((o) => {
        const custName = normalizeName(getCustomerName(o.customerId));
        const unitsSummary = normalizeName(
          o.unitsSummary || buildOrderUnitsSummary(o)
        );
        const note = normalizeName(o.note || "");
        return (
          custName.includes(normalizedQuery) ||
          unitsSummary.includes(normalizedQuery) ||
          note.includes(normalizedQuery)
        );
      });
    }
    return arr.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [archivedOrders, normalizedQuery]);

  // ----------------- Submit (ایجاد / ویرایش) -----------------
  const handleSubmit = () => {
    if (!validateForm()) return;

    // ۱) ایجاد مشتری جدید در صورت نیاز
    let customerId = form.customerId;
	if (isNewCustomer) {
	  const normalized = normalizeName(form.customerName);

	  const exists = customers.find(
		(c) =>
		  normalizeName(c.name) === normalized &&
		  c.phone === form.customerPhone
	  );

	  if (exists)
		return notifyError("مشتری با همین نام و شماره تماس قبلاً ثبت شده است");

	  const newCustomer = {
		id: makeId(),
		name: normalized,
		phone: form.customerPhone || "",
	  };

	  setData((d) => ({
		...d,
		customers: [...(d.customers || []), newCustomer],
	  }));
	  customerId = newCustomer.id;
	}

    // ۲) ساخت آبجکت سفارش
    const total = Number(form.total);
    const orderId = editing || generateOrderId([...orders, ...archivedOrders]);

    const containerUnitIds = [...(form.containerUnitIds || [])];

    const newOrder = {
      id: orderId,
      date: form.date,
      customerId,
      containerUnitIds,
      total,
      paymentType: form.paymentType,
      payments: {
        cash: Number(form.payments?.cash || 0),
        checks: (form.payments?.checks || []).map((c) => ({
          bank: c.bank || "",
          number: c.number || "",
          dueDate: c.dueDate || "",
          amount: Number(c.amount || 0),
        })),
      },
      installment: {
        enabled: !!form.installment?.enabled,
        list: (form.installment?.list || []).map((i) => ({
          date: i.date,
          amount: Number(i.amount || 0),
        })),
      },
      status: form.status || "در جریان",
      note: form.note || "",
    };

    // ۳) ویرایش / ایجاد
    if (editing) {
      setData((d) => {
        const oldOrder = (d.orders || []).find((o) => o.id === editing);
        if (!oldOrder) return d;

        const oldCustomerId = oldOrder.customerId;

        const hasClearedCheck = (d.checks || []).some(
          (ch) =>
            String(ch.orderId) === String(editing) &&
            ch.status === "پاس شد"
        );
        if (hasClearedCheck) {
          toast(
            "این سفارش دارای چک پاس‌شده است و امکان ویرایش آن وجود ندارد",
            { type: "error" }
          );
          return d;
        }

        const hasCollectedInstallment = (d.finance || []).some(
          (f) =>
            f.type === "income" &&
            f.method === "قسط" &&
            String(f.orderId) === String(editing)
        );
        if (hasCollectedInstallment && oldCustomerId !== customerId) {
          toast(
            "تغییر مشتری برای سفارشی که قسط وصول‌شده دارد مجاز نیست",
            { type: "error" }
          );
          return d;
        }

        // حذف تراکنش نقدی قبلی مرتبط با سفارش
        const cleanedFinance = (d.finance || []).filter(
          (f) =>
            !(
			  f.type === "income" &&
			  f.method === "نقد" &&
			  String(f.orderId) === String(editing) &&
			  f.source === "orders"
            )
        );

        // حذف چک‌های قبلی این سفارش (برای جایگزینی)
        const cleanedChecks = (d.checks || []).filter(
          (c) => !( String(c.orderId) === String(editing) && c.source === "orders")
        );

        // به‌روزرسانی سفارش
        const ordersNext = (d.orders || []).map((o) =>
          o.id === editing ? newOrder : o
        );

        // به‌روزرسانی واحدهای کانتینر (آزادسازی واحدهای قبلی و اختصاص واحدهای جدید)
        const prevUnitIds = oldOrder.containerUnitIds || [];
        const nextUnitIds = newOrder.containerUnitIds || [];
        const prevSet = new Set(prevUnitIds.map(String));
        const nextSet = new Set(nextUnitIds.map(String));

        const containerUnitsNext = (d.containerUnits || []).map((u) => {
          const uid = String(u.id);
          const assignedId = u.assignedOrderId
            ? String(u.assignedOrderId)
            : null;

          // واحدهایی که قبلاً به این سفارش اختصاص داشتند ولی اکنون حذف شده‌اند → آزاد شود
          if (
            assignedId === String(editing) &&
            prevSet.has(uid) &&
            !nextSet.has(uid)
          ) {
            return { ...u, assignedOrderId: null };
          }

          // واحدهای جدیدی که به این سفارش اضافه شده‌اند → اختصاص داده شود
          if (nextSet.has(uid)) {
            return { ...u, assignedOrderId: newOrder.id };
          }

          return u;
        });

        return {
          ...d,
          orders: ordersNext,
          finance: cleanedFinance,
          checks: cleanedChecks,
          containerUnits: containerUnitsNext,
        };
      });
    } else {
      // سفارش جدید
      setData((d) => {
        const ordersNext = [...(d.orders || []), newOrder];

        const unitIdSet = new Set(
          (newOrder.containerUnitIds || []).map(String)
        );
        const containerUnitsNext = (d.containerUnits || []).map((u) =>
          unitIdSet.has(String(u.id))
            ? { ...u, assignedOrderId: newOrder.id }
            : u
        );

        return {
          ...d,
          orders: ordersNext,
          containerUnits: containerUnitsNext,
        };
      });
    }

    // ۴) ثبت تراکنش نقدی
    if (newOrder.payments.cash > 0) {
      setData((d) => ({
        ...d,
        finance: [
          ...(d.finance || []),
          {
            id: makeId(),
            date: newOrder.date,
            type: "income",
            method: "نقد",
            amount: newOrder.payments.cash,
            customerId: newOrder.customerId,
            orderId: newOrder.id,
			source: "orders",
            note: `دریافت نقد بابت سفارش ${String(orderId).slice(-6)}`,
          },
        ],
      }));
    }

    // ۵) ثبت چک‌ها
    if (newOrder.payments.checks.length > 0) {
      setData((d) => ({
        ...d,
        checks: [
          ...(d.checks || []),
          ...newOrder.payments.checks.map((ch) => ({
            id: makeId(),
            bank: ch.bank,
            number: ch.number,
            dueDate: ch.dueDate,
            amount: Number(ch.amount || 0),
            customerId: newOrder.customerId,
            orderId: newOrder.id,
			source: "orders",
            status: "در انتظار",
          })),
        ],
      }));
    }

    toast(editing ? "سفارش با موفقیت ویرایش شد" : "سفارش جدید ثبت شد", {
      type: "success",
    });

    setShowForm(false);
    setEditing(null);
    setForm(createDefaultForm());
    setIsNewCustomer(false);
  };

  // ----------------- Edit / Delete -----------------
  const handleEdit = (order) => {
    setEditing(order.id);
    setForm({
      ...order,
      customerName: "",
      customerPhone: "",
    });
    setIsNewCustomer(false);
    setShowForm(true);

    // نرمال‌سازی پرداخت‌ها بر اساس نوع پرداخت
    if (order.paymentType === "نقد") {
      setForm((f) => ({
        ...f,
        payments: {
          cash: order.payments?.cash || 0,
          checks: [],
        },
      }));
    } else if (order.paymentType === "چک") {
      setForm((f) => ({
        ...f,
        payments: {
          cash: 0,
          checks: order.payments?.checks || [],
        },
      }));
    }
  };

  const handleDelete = (id) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return;

    const hasClearedCheck = (checks || []).some(
      (ch) => String(ch.orderId) === String(id) && ch.status === "پاس شد"
    );
    if (hasClearedCheck) {
      toast("این سفارش دارای چک پاس‌شده است و قابل حذف نیست", {
        type: "error",
      });
      return;
    }

    const hasCollectedInstallment = (finance || []).some(
      (f) =>
        f.type === "income" &&
        f.method === "قسط" &&
        String(f.orderId) === String(id)
    );
    if (hasCollectedInstallment) {
      toast(
        "این سفارش وصول قسط دارد و به‌دلیل گزارش‌های مالی قابل حذف نیست",
        { type: "error" }
      );
      return;
    }

    const hasPendingCheck = (checks || []).some(
      (ch) => String(ch.orderId) === String(id) && ch.status === "در انتظار"
    );
    if (
      hasPendingCheck &&
      !window.confirm(
        "این سفارش چک‌های در انتظار دارد. با حذف، وضعیت چک‌ها لغو می‌شود. ادامه می‌دهید؟"
      )
    )
      return;

    if (!window.confirm("آیا از حذف این سفارش مطمئن هستید؟")) return;

    setData((d) => {
      const ordersNext = (d.orders || []).filter((x) => x.id !== id);

	  const financeNext = (d.finance || []).filter(
	    (f) =>
		  !(
		    String(f.orderId) === String(id) &&
		    f.type === "income" &&
		    f.method === "نقد" &&
		    f.source === "orders"
		  )
	  );

	  const checksNext = (d.checks || []).map((c) =>
	    String(c.orderId) === String(id) && c.source === "orders"
		  ? { ...c, status: "لغو‌شده" }
		  : c
	  );

      const containerUnitsNext = (d.containerUnits || []).map((u) =>
        String(u.assignedOrderId) === String(id)
          ? { ...u, assignedOrderId: null }
          : u
      );

      return {
        ...d,
        orders: ordersNext,
        finance: financeNext,
        checks: checksNext,
        containerUnits: containerUnitsNext,
      };
    });

    toast("سفارش حذف شد", { type: "success" });
  };

  // ----------------- تحویل -----------------
  const markOrderDelivered = (orderId) => {
    setData((d) => {
      const ordersArr = [...(d.orders || [])];
      const idx = ordersArr.findIndex((o) => String(o.id) === String(orderId));
      if (idx < 0) return d;

      const order = ordersArr[idx];
      if (order.status === "تحویل شده") {
        toast("این سفارش قبلاً تحویل شده است", { type: "info" });
        return d;
      }

	  const idSet = new Set((order.containerUnitIds || []).map(String));
	  const units = (d.containerUnits || []).filter((u) =>
	    idSet.has(String(u.id))
	  );

      if (!units.length) {
        toast("هیچ واحد کانتینری برای این سفارش ثبت نشده است", {
          type: "error",
        });
        return d;
      }

      const notReady = units.filter((u) => u.status !== "آماده");
      if (notReady.length > 0) {
        toast(
          "برخی از واحدهای این سفارش هنوز در وضعیت «آماده» نیستند و امکان تحویل وجود ندارد.",
          { type: "error" }
        );
        return d;
      }

      const updatedOrder = {
        ...order,
        status: "تحویل شده",
        deliveredAt: new Date().toISOString(),
        prevStatus: order.status || "در جریان",
      };

      const nextOrders = [...ordersArr];
      nextOrders[idx] = updatedOrder;

      setTimeout(() => {
        pushAudit(setData, {
          type: "ORDER_DELIVERED",
          message: `سفارش #${order.id} تحویل شد`,
          payload: {
            orderId: order.id,
            customerId: order.customerId,
            containerUnitIds: order.containerUnitIds || [],
          },
        });
      }, 0);

      toast("وضعیت سفارش به «تحویل شده» تغییر کرد ✅", {
        type: "success",
      });

      return {
        ...d,
        orders: nextOrders,
      };
    });
  };

  // ----------------- انتقال به آرشیو -----------------
  const moveOrderToArchive = (orderId) => {
    setData((d) => {
      const ordersArr = [...(d.orders || [])];
      const idx = ordersArr.findIndex((o) => String(o.id) === String(orderId));
      if (idx < 0) return d;

      const order = ordersArr[idx];

      if (order.status !== "تحویل شده") {
        toast("فقط سفارش‌های تحویل‌شده را می‌توان به آرشیو منتقل کرد.", {
          type: "error",
        });
        return d;
      }

      const settlement = getOrderSettlementStatus(
        order,
        d.finance || [],
        d.checks || []
      );

      if (!settlement.fullyPaid || settlement.remaining > 0) {
        toast(
          `این سفارش هنوز به طور کامل تسویه نشده است. مانده: ${currency(
            settlement.remaining
          )} تومان`,
          { type: "error" }
        );
        return d;
      }

      if (settlement.hasPendingChecks) {
        toast(
          "چک‌های در انتظار برای این سفارش وجود دارد. تا زمان پاس‌شدن تمام چک‌ها امکان آرشیو وجود ندارد.",
          { type: "error" }
        );
        return d;
      }

      if (order.installment?.enabled && !settlement.installmentsSettled) {
        toast(
          "اقساط این سفارش به طور کامل وصول نشده‌اند و امکان آرشیو وجود ندارد.",
          { type: "error" }
        );
        return d;
      }

      const unitsSummary = buildOrderUnitsSummary(order);

      const archivedOrder = {
        ...order,
        status: "تحویل شده",
        unitsSummary,
        archivedAt: new Date().toISOString(),
        archiveMeta: { reason: "delivered_and_settled" },
      };

      const nextArchived = [...(d.archivedOrders || []), archivedOrder];

      const nextOrders = ordersArr.filter(
        (o) => String(o.id) !== String(orderId)
      );

      setTimeout(() => {
        pushAudit(setData, {
          type: "ORDER_ARCHIVED",
          message: `سفارش #${order.id} پس از تسویه کامل به آرشیو منتقل شد`,
          payload: {
            orderId: order.id,
            customerId: order.customerId,
            containerUnitIds: order.containerUnitIds || [],
          },
        });
      }, 0);

      toast("سفارش به آرشیو منتقل شد", { type: "success" });

      return {
        ...d,
        orders: nextOrders,
        archivedOrders: nextArchived,
      };
    });
  };

  // ----------------- بازگردانی از آرشیو -----------------
  const rollbackDelivered = (orderId) => {
    setData((d) => {
      const archived = [...(d.archivedOrders || [])];
      const idx = archived.findIndex((o) => String(o.id) === String(orderId));
      if (idx === -1) return d;

      const arc = archived[idx];

      const ordersNext = [
        ...(d.orders || []),
        { ...arc, status: arc.prevStatus || "در جریان" },
      ];

      archived.splice(idx, 1);

      setTimeout(() => {
        pushAudit(setData, {
          type: "ROLLBACK_ORDER_DELIVERED",
          message: `Rollback سفارش #${arc.id}`,
          payload: { orderId: arc.id },
        });
      }, 0);

      toast("سفارش از آرشیو بازگردانی شد", { type: "success" });

      return {
        ...d,
        orders: ordersNext,
        archivedOrders: archived,
      };
    });
  };

  // ----------------- Helperهای UI فرم -----------------
  const addCheck = () =>
    setForm((f) => ({
      ...f,
      payments: {
        ...f.payments,
        checks: [
          ...(f.payments?.checks || []),
          { bank: "", number: "", dueDate: "", amount: "" },
        ],
      },
    }));

  const removeCheck = (i) =>
    setForm((f) => ({
      ...f,
      payments: {
        ...f.payments,
        checks: (f.payments?.checks || []).filter((_, idx) => idx !== i),
      },
    }));

  const addInstallment = () =>
    setForm((f) => ({
      ...f,
      installment: {
        ...f.installment,
        list: [
          ...(f.installment?.list || []),
          { date: todayISO(), amount: "" },
        ],
      },
    }));

  const removeInstallment = (i) =>
    setForm((f) => ({
      ...f,
      installment: {
        ...f.installment,
        list: (f.installment?.list || []).filter((_, idx) => idx !== i),
      },
    }));

  const handleCustomerSelect = (id) => {
    if (id === "new") {
      setIsNewCustomer(true);
      setForm((f) => ({
        ...f,
        customerId: "",
        customerName: "",
        customerPhone: "",
      }));
    } else {
      setIsNewCustomer(false);
      setForm((f) => ({ ...f, customerId: id }));
    }
  };

  const toggleUnitSelection = (unitId) => {
    setForm((f) => {
      const ids = new Set((f.containerUnitIds || []).map(String));
      const key = String(unitId);
      if (ids.has(key)) {
        ids.delete(key);
      } else {
        ids.add(key);
      }
      return {
        ...f,
        containerUnitIds: Array.from(ids),
      };
    });
  };
  
  const handleCreateInlineUnit = () => {
    if (!newUnitForm.kindId) {
      return notifyError("نوع کانتینر را انتخاب کنید");
    }

    const kind = containerKinds.find(
      (k) => String(k.id) === String(newUnitForm.kindId)
    );
    if (!kind) {
      return notifyError("نوع کانتینر انتخاب‌شده معتبر نیست");
    }

    const price = Number(newUnitForm.price || 0);
    if (!Number.isFinite(price) || price < 0) {
      return notifyError("قیمت واحد معتبر نیست");
    }

  const template = containerTemplates.find(
    (t) => String(t.id) === String(newUnitForm.templateId)
  );

  // اگر الگو مواد دارد ولی کاربر "بدون الگو" زده → هشدار
  if (!template && newUnitForm.templateId) {
    return notifyError("الگوی انتخاب‌شده معتبر نیست");
  }

  // حالا مواد را از الگو بگیریم
  const materials = template ? template.lines.map((l) => ({ ...l })) : [];
  const hasMaterials = materials.length > 0;

  if (hasMaterials) {
    const shortages = [];
    const invSnapshot = data.inventory || [];

    materials.forEach((m) => {
      const item = invSnapshot.find((i) => i.id === m.inventoryId);
      const required = Number(m.qty) || 0;
      const available = Number(item?.stock ?? 0);

      if (!item || required > available) {
        shortages.push(
          `${item?.name || "—"} (نیاز: ${required} / موجود: ${available})`
        );
      }
    });

    if (shortages.length > 0) {
      return notifyError(
        "موجودی مواد برای ساخت این واحد کافی نیست:\n" + shortages.join("، ")
      );
    }
  }

    const unitId = generateContainerUnitId(containerUnits);
    const templateId = newUnitForm.templateId || null;

  const newUnit = {
    id: unitId,
    kindId: newUnitForm.kindId,
    templateId,
    price,
    status: hasMaterials ? "در حال ساخت" : "در انتظار ساخت",
    note: newUnitForm.note || "",
    materials: materials.map((l) => ({ ...l })), // الگو روی واحد ذخیره می‌شود
    materialsConsumed: hasMaterials,
    assignedOrderId: null,
    createdAt: new Date().toISOString(),
  };


  // مصرف مواد
  setData((d) => {
    let inv = d.inventory || [];
    if (hasMaterials) {
      inv = inv.map((i) => {
        const line = materials.find((m) => m.inventoryId === i.id);
        if (!line) return i;
        const next = Number(i.stock) - Number(line.qty);
        return { ...i, stock: Math.max(0, next) };
      });
    }

    return {
      ...d,
      inventory: inv,
      containerUnits: [...(d.containerUnits || []), newUnit],
    };
  });


    // انتخاب خودکار
    setForm((f) => ({
      ...f,
      containerUnitIds: [...(f.containerUnitIds || []), unitId],
    }));

    toast("واحد ساخته و به سفارش اضافه شد", { type: "success" });
    setShowUnitInlineForm(false);
    setNewUnitForm({ kindId: "", templateId: "", price: "", note: "" });
  };

  const openNewOrder = () => {
    setForm(createDefaultForm());
    setEditing(null);
    setIsNewCustomer(false);
    setShowForm(true);
  };

  // ====================== UI ======================
  return (
    <div className="card" style={{ padding: 16 }}>
      {/* هدر و نوار ابزار */}
      <div className="section-title">
        <h3>سفارش‌ها</h3>
        <div className="row">
          <button
            className={`btn ${activeTab === "active" ? "primary" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            سفارش‌های جاری
          </button>
          <button
            className={`btn ${activeTab === "archived" ? "primary" : ""}`}
            onClick={() => setActiveTab("archived")}
          >
            آرشیو ({archivedOrders.length})
          </button>

          <div className="row" style={{ alignItems: "center" }}>
            <Search size={16} style={{ opacity: 0.6 }} />
            <input
              className="input"
              placeholder="جستجوی مشتری یا کانتینر..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 220 }}
            />
          </div>

          <button className="btn primary" onClick={openNewOrder}>
            <Plus size={18} /> سفارش جدید
          </button>
        </div>
      </div>

      {/* جدول / آرشیو */}
      {activeTab === "active" ? (
        ordersFiltered.length === 0 ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--text-light)",
            }}
          >
            سفارشی ثبت نشده است.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>مشتری</th>
                <th>مبلغ</th>
                <th>روش پرداخت</th>
                <th>اقساطی</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {ordersFiltered.map((o) => {
                const units = getOrderUnits(o);
                const deliverable = canDeliverOrder(o);
                const unitsSummary = buildOrderUnitsSummary(o);

                return (
                  <tr key={o.id}>
                    <td>{formatDate(o.date)}</td>
                    <td>{getCustomerName(o.customerId)}</td>
                    <td>{currency(o.total)}</td>
                    <td>{o.paymentType}</td>
                    <td>{o.installment?.enabled ? "بله" : "خیر"}</td>
                    <td>{o.status}</td>

                    {/* عملیات */}
					<td style={{ textAlign: "left" }}>
					  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>

						{/* ویرایش */}
						<button className="btn action-btn" onClick={() => handleEdit(o)}>
						  <Edit3 size={16} /> ویرایش
						</button>

						{/* حذف */}
						<button className="btn danger action-btn" onClick={() => handleDelete(o.id)}>
						  <Trash2 size={16} /> حذف
						</button>

						{/* فاکتور */}
						<button
						  className="btn action-btn"
						  onClick={() => setInvoiceOrder(o)}
						>
						  <Eye size={16} /> فاکتور
						</button>
						
						{/* تحویل سفارش */}
						{o.status !== "تحویل شده" && (
						  <button
							className="btn primary action-btn"
							onClick={() => {
							  const unitsLocal = getOrderUnits(o);

							  // 1) هیچ کانتینری انتخاب نشده
							  if (!unitsLocal.length) {
								return toast("هیچ واحد کانتینری برای این سفارش ثبت نشده است", {
								  type: "error",
								});
							  }

							  // 2) برخی از واحدها آماده نیستند
							  const notReady = unitsLocal.filter((u) => u.status !== "آماده");
							  if (notReady.length > 0) {
								return toast(
								  "برخی از واحدهای این سفارش هنوز در وضعیت «آماده» نیستند و نمی‌توان تحویل کرد.",
								  { type: "error" }
								);
							  }

							  // 3) تأیید نهایی
							  if (!window.confirm("آیا از تحویل این سفارش اطمینان دارید؟")) return;

							  // 4) تحویل سفارش
							  markOrderDelivered(o.id);

							  // 5) اگر پرداخت چکی یا اقساطی داشت، اطلاع بده
							  if (o.installment?.enabled || (o.payments?.checks || []).length > 0) {
								toast(
								  "این سفارش شامل چک یا اقساط است؛ تحویل فقط وضعیت سفارش را تغییر می‌دهد.",
								  { type: "info" }
								);
							  }
							}}
						  >
							تحویل شد
						  </button>
						)}

						{/* انتقال به آرشیو */}
						{o.status === "تحویل شده" && (
						  <button
							className="btn action-btn"
							onClick={() => {
							  if (
								window.confirm("سفارش تحویل شده است. آیا مایلید آن را به آرشیو منتقل کنید؟")
							  ) {
								moveOrderToArchive(o.id);
							  }
							}}
						  >
							انتقال به آرشیو
						  </button>
						)}

					  </div>
					</td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : archivedFiltered.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-light)",
          }}
        >
          هنوز سفارشی در آرشیو نیست.
        </div>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>تاریخ سفارش</th>
              <th>مشتری</th>
              <th>مبلغ</th>
              <th>تاریخ تحویل</th>
              <th>یادداشت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {archivedFiltered.map((o) => (
              <tr key={o.id}>
                <td>{formatDate(o.date)}</td>
                <td>{getCustomerName(o.customerId)}</td>
                <td>{currency(o.total)}</td>
                <td>{formatDate(o.deliveredAt)}</td>
                <td>{o.note || "—"}</td>
                <td style={{ textAlign: "right" }}>
				{/* فاکتور */}
				<div
				  className="action-buttons"
				  style={{
					display: "flex",
					alignItems: "center",
					gap: "10px",
					flexWrap: "wrap",
				  }}
				>
				  <button
					className="btn action-btn"
					style={{
					  display: "inline-flex",
					  alignItems: "center",
					  justifyContent: "center",
					  gap: "6px",
					  padding: "6px 14px",
					  height: "28px",
					}}
					onClick={() => setInvoiceOrder(o)}
				  >
					<Eye size={16} />
					فاکتور
				  </button>

				  <button
					className="btn action-btn"
					style={{
					  display: "inline-flex",
					  alignItems: "center",
					  justifyContent: "center",
					  gap: "6px",
					  padding: "6px 14px",
					  height: "28px",
					}}
					onClick={() => {
					  if (
						window.confirm("آیا از بازگردانی این سفارش مطمئن هستید؟")
					  ) {
						rollbackDelivered(o.id);
					  }
					}}
				  >
					بازگردانی
				  </button>
				</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* مودال ثبت/ویرایش سفارش */}
      <OverlayModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "ویرایش سفارش" : "ثبت سفارش جدید"}
        footer={
          <>
            <button className="btn" onClick={() => setShowForm(false)}>
              انصراف
            </button>
            <button className="btn primary" onClick={handleSubmit}>
              {editing ? "ذخیره تغییرات" : "ثبت سفارش"}
            </button>
          </>
        }
      >
        {/* پیام راهنما */}
        <div className="info-banner">
          <AlertTriangle size={50} />
          <div>
            <p>
              مجموع پرداخت‌ها{" "}
              <b>(نقد + چک + اقساط)</b> باید{" "}
              <b>دقیقاً برابر مبلغ فاکتور</b> باشد.
              <br />
              اقساط فقط هنگام <b>وصول در بخش مالی</b> از بدهی مشتری کم
              می‌شوند.
              <br />
            </p>
          </div>
        </div>

        {/* اطلاعات سفارش */}
        <section className="form-section">
          <h4>اطلاعات سفارش</h4>
          <div className="form-grid">
            <div>
              <label>تاریخ سفارش</label>
              <ShamsiDatePicker
                value={form.date}
                onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                className="input"
              />
            </div>
            <div>
              <label>مبلغ کل فاکتور (تومان)</label>
              <input
                type="number"
                className="input"
                placeholder="مثلاً 45,000,000"
                value={form.total}
                onChange={(e) =>
                  setForm((f) => ({ ...f, total: e.target.value }))
                }
                min={0}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="payment-summary-box">
            <div className="summary-row">
              <span>مبلغ فاکتور:</span>
              <b>{currency(totalInvoice)}</b>
            </div>
            <div className="summary-row">
              <span>جمع قیمت کانتینرهای انتخاب‌شده:</span>
              <b>{currency(unitsTotalPrice)}</b>
            </div>
            <div className="summary-row">
              <span>جمع پرداخت‌های برنامه‌ریزی‌شده:</span>
              <b>{currency(totalPlannedPayments)}</b>
            </div>
            <div
              className="summary-row"
              style={{
                color:
                  remaining > 0
                    ? "var(--danger)"
                    : remaining < 0
                    ? "#d97706"
                    : "var(--success)",
              }}
            >
              <span>مانده:</span>
              <b>{currency(remaining)}</b>
            </div>
          </div>
        </section>

        {/* مشتری */}
        <section className="form-section">
          <h4>مشخصات مشتری</h4>
          <select
            className="input"
            value={isNewCustomer ? "new" : form.customerId}
            onChange={(e) => handleCustomerSelect(e.target.value)}
          >
            <option value="">انتخاب مشتری...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="new">+ افزودن مشتری جدید</option>
          </select>

          {isNewCustomer && (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div>
                <label>نام مشتری</label>
                <input
                  className="input"
                  value={form.customerName}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      customerName: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label>شماره تماس</label>
                <input
                  type="tel"
                  className="input"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.customerPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 11) {
                      setForm((f) => ({ ...f, customerPhone: val }));
                    }
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* کانتینرهای این سفارش */}
        <section className="form-section">
          <h4>کانتینرهای این سفارش</h4>

          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              {selectableGroups.length === 0
                ? "در حال حاضر هیچ واحد قابل سفارشی وجود ندارد."
                : `${selectableGroups.length} نوع کانتینر با مجموع ${
                    selectableGroups.reduce(
                      (sum, g) => sum + g.units.length,
                      0
                    )
                  } واحد قابل سفارش`}
            </span>

            <button
              type="button"
              className="btn"
              onClick={() => setShowUnitInlineForm((v) => !v)}
            >
              <Plus size={14} /> ثبت کانتینر جدید
            </button>
          </div>

          {showUnitInlineForm && (
            <div
              className="card"
              style={{ marginBottom: 12, padding: 12, borderRadius: 12 }}
            >
              <div className="form-grid">
                <div>
                  <label>نوع کانتینر</label>
                  <select
                    className="input"
                    value={newUnitForm.kindId}
                    onChange={(e) =>
                      setNewUnitForm((f) => ({
                        ...f,
                        kindId: e.target.value,
                        templateId: "",
                      }))
                    }
                  >
                    <option value="">انتخاب نوع...</option>
                    {containerKinds.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>الگوی ساخت</label>
                  <select
                    className="input"
                    value={newUnitForm.templateId}
                    onChange={(e) =>
                      setNewUnitForm((f) => ({
                        ...f,
                        templateId: e.target.value,
                      }))
                    }
                    disabled={!newUnitForm.kindId}
                  >
                    <option value="">
                      {newUnitForm.kindId
                        ? "بدون الگوی خاص"
                        : "ابتدا نوع را انتخاب کنید"}
                    </option>
                    {templatesForNewUnitKind.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: 8 }}>
                <div>
                  <label>قیمت واحد (تومان)</label>
                  <input
                    className="input"
                    type="number"
                    value={newUnitForm.price}
                    onChange={(e) =>
                      setNewUnitForm((f) => ({ ...f, price: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label>یادداشت</label>
                  <input
                    className="input"
                    value={newUnitForm.note}
                    onChange={(e) =>
                      setNewUnitForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                </div>
              </div>

			  <p
			    className="muted"
			    style={{ marginTop: 8, marginRight: 4, fontSize: 9.6 }}
			  >
			    اگر برای این نوع کانتینر <b>الگوی ساخت</b> انتخاب کنید، و الگو دارای
			    مواد مصرفی باشد، واحد با وضعیت <b>«در حال ساخت»</b> ثبت شده و مواد آن
			    بلافاصله از انبار کسر می‌شود. در غیر این صورت (بدون الگو یا الگوی بدون
			    مواد)، واحد با وضعیت <b>«در انتظار ساخت»</b> ثبت می‌شود و در این مرحله
			    مصرفی از انبار انجام نمی‌شود.
			  </p>

              <div
                className="row"
                style={{ justifyContent: "flex-end", marginTop: 8, gap: 8 }}
              >
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowUnitInlineForm(false);
                    setNewUnitForm({
                      kindId: "",
                      templateId: "",
                      price: "",
                      note: "",
                    });
                  }}
                >
                  انصراف
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleCreateInlineUnit}
                >
                  ثبت واحد کانتینر
                </button>
              </div>
            </div>
          )}

          {selectableGroups.length === 0 ? (
            <div className="empty-state">
              <p className="muted" style={{ marginBottom: 4 }}>
                هیچ واحد کانتینری برای انتخاب وجود ندارد.
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                می‌توانید از همین‌جا واحد جدید ثبت کنید یا بعداً از صفحهٔ کانتینرها
                اضافه کنید.
              </p>
            </div>
          ) : (
            <table className="details-table">
              <thead>
                <tr>
                  <th>نوع</th>
                  <th>الگوی ساخت</th>
                  <th>تعداد قابل سفارش</th>
                  <th>انتخاب‌شده</th>
                  <th style={{width: 0}}></th>
                </tr>
              </thead>
              <tbody>
                {selectableGroups.map((g) => {
                  const isExpanded = expandedGroupKey === g.key;
                  const selectedCount = g.units.filter((u) =>
                    (form.containerUnitIds || []).some(
                      (id) => String(id) === String(u.id)
                    )
                  ).length;

                  return (
                    <React.Fragment key={g.key}>
                      <tr>
                        <td>{getKindName(g.kindId)}</td>
                        <td>
                          {g.templateId
                            ? getTemplateName(g.templateId)
                            : "—"}
                        </td>
                        <td>{g.units.length}</td>
                        <td>
                          {selectedCount > 0 ? `${selectedCount} واحد` : "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
						<button
						  type="button"
						  className={`accordion-toggle ${isExpanded ? "open" : ""}`}
						  onClick={() => setExpandedGroupKey(isExpanded ? null : g.key)}
						>
						  <ChevronDown size={16} />
						</button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="expanded-row">
                          <td colSpan={5}>
                            <table className="details-table">
                              <thead>
                                <tr>
                                  <th>انتخاب</th>
                                  <th>شناسه واحد</th>
                                  <th>وضعیت</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.units.map((u) => {
                                  const checked = (
                                    form.containerUnitIds || []
                                  ).some((id) => String(id) === String(u.id));

                                  return (
                                    <tr key={u.id}>
                                      <td style={{ textAlign: "right" }}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            toggleUnitSelection(u.id)
                                          }
                                        />
                                      </td>
                                      <td>#{String(u.id).slice(-6)}</td>
                                      <td>{u.status || "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 8, fontSize: 12 }} className="muted">
            واحدهای انتخاب‌شده:{" "}
            <b>{(form.containerUnitIds || []).length || 0} واحد</b>
          </div>
        </section>
		
        {/* پرداخت */}
        <section className="form-section">
          <h4>روش پرداخت</h4>
			<select
			  className="input"
			  value={form.paymentType}
			  onChange={(e) => {
				const value = e.target.value;
				setForm((f) => {
				  const prevPayments = f.payments || { cash: 0, checks: [] };
				  let nextPayments = prevPayments;

				  if (value === "نقد") {
					// فقط نقد → چک‌ها را پاک کن
					nextPayments = { ...prevPayments, checks: [] };
				  } else if (value === "چک") {
					// فقط چک → مبلغ نقد را صفر کن
					nextPayments = { ...prevPayments, cash: 0 };
				  }
				  // در حالت نقد + چک چیزی را خودکار پاک نکن

				  return {
					...f,
					paymentType: value,
					payments: nextPayments,
				  };
				});
			  }}
			>
            <option value="نقد">نقد</option>
            <option value="چک">چک</option>
            <option value="نقد + چک">نقد + چک</option>
          </select>

          {(form.paymentType === "نقد" ||
            form.paymentType === "نقد + چک") && (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div>
                <label>مبلغ نقدی (تومان)</label>
                <input
                  type="number"
                  className="input"
                  value={form.payments.cash}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payments: {
                        ...f.payments,
                        cash: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          )}

          {(form.paymentType === "چک" ||
            form.paymentType === "نقد + چک") && (
            <div className="check-box">
              <label>چک‌ها</label>
              {(form.payments.checks || []).map((ch, i) => (
                <div
                  key={i}
                  className="row"
                  style={{ gap: 6, marginBottom: 6 }}
                >
                  <input
                    placeholder="بانک"
                    className="input"
                    value={ch.bank}
                    onChange={(e) => {
                      const arr = [...(form.payments.checks || [])];
                      arr[i] = { ...arr[i], bank: e.target.value };
                      setForm((f) => ({
                        ...f,
                        payments: { ...f.payments, checks: arr },
                      }));
                    }}
                  />
                  <input
                    placeholder="شماره چک"
                    className="input"
                    value={ch.number}
                    onChange={(e) => {
                      const arr = [...(form.payments.checks || [])];
                      arr[i] = { ...arr[i], number: e.target.value };
                      setForm((f) => ({
                        ...f,
                        payments: { ...f.payments, checks: arr },
                      }));
                    }}
                  />
				  <ShamsiDatePicker
				    value={ch.dueDate}
				    onChange={(v) => {
					  const arr = [...(form.payments.checks || [])];
					  arr[i] = { ...arr[i], dueDate: v };
					  setForm((f) => ({
					    ...f,
					    payments: { ...f.payments, checks: arr },
					  }));
				    }}
				    className="input"
				  />
                  <input
                    type="number"
                    placeholder="مبلغ"
                    className="input"
                    value={ch.amount}
                    onChange={(e) => {
                      const arr = [...(form.payments.checks || [])];
                      arr[i] = { ...arr[i], amount: e.target.value };
                      setForm((f) => ({
                        ...f,
                        payments: { ...f.payments, checks: arr },
                      }));
                    }}
                  />
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => removeCheck(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn" onClick={addCheck}>
                <Plus size={14} /> افزودن چک
              </button>
            </div>
          )}
        </section>

        {/* اقساط */}
        <section className="form-section">
          <h4>اقساط</h4>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={form.installment.enabled}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  installment: {
                    ...f.installment,
                    enabled: e.target.checked,
                  },
                }))
              }
            />
            خرید اقساطی (وصول اقساط از منوی مالی انجام می‌شود)
          </label>

          {form.installment.enabled && (
            <div className="check-box">
              <label>لیست اقساط</label>
              {(form.installment.list || []).map((ins, i) => (
                <div
                  key={i}
                  className="row"
                  style={{ gap: 6, marginBottom: 6 }}
                >
				<ShamsiDatePicker
				  value={ins.date}
				  onChange={(v) => {
					const list = [...(form.installment.list || [])];
					list[i] = { ...list[i], date: v };
					setForm((f) => ({
					  ...f,
					  installment: { ...f.installment, list },
					}));
				  }}
				  className="input"
				/>
                  <input
                    type="number"
                    placeholder="مبلغ"
                    className="input"
                    value={ins.amount}
                    onChange={(e) => {
                      const list = [...(form.installment.list || [])];
                      list[i] = { ...list[i], amount: e.target.value };
                      setForm((f) => ({
                        ...f,
                        installment: { ...f.installment, list },
                      }));
                    }}
                  />
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => removeInstallment(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                onClick={addInstallment}
              >
                <Plus size={14} /> افزودن قسط
              </button>
            </div>
          )}
        </section>

        {/* یادداشت */}
        <section className="form-section">
          <h4>یادداشت</h4>
          <textarea
            className="input"
            rows={3}
            value={form.note}
            onChange={(e) =>
              setForm((f) => ({ ...f, note: e.target.value }))
            }
            placeholder="یادداشت مربوط به سفارش..."
          />
        </section>
      </OverlayModal>

      {/* ✅ مودال فاکتور سفارش */}
      <OverlayModal
        open={!!invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
        title={
          invoiceOrder
            ? `فاکتور سفارش ${String(invoiceOrder.id)}`
            : "فاکتور سفارش"
        }
        size="lg"
        footer={
          <>
            <button className="btn" onClick={() => setInvoiceOrder(null)}>
              بستن
            </button>
            <button className="btn primary" onClick={handlePrintInvoice}>
              <Printer size={16} /> چاپ فاکتور
            </button>
          </>
        }
      >
        {/* استایل‌های مخصوص فاکتور و چاپ، فقط وقتی این مودال باز است فعال می‌شوند */}
        <style>
          {`
            .invoice-print-wrapper {
              font-family: inherit;
              color: var(--text);
            }
            .invoice-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 16px;
            }
            .invoice-title {
              font-size: 1.1rem;
              font-weight: 600;
              margin-bottom: 4px;
            }
            .invoice-meta {
              font-size: 0.8rem;
              color: var(--text-light);
              text-align: left;
            }
            .invoice-meta div {
              margin-bottom: 2px;
            }
            .invoice-section {
              margin-top: 12px;
            }
            .invoice-section h4 {
              margin: 0 0 6px;
              font-size: 0.95rem;
            }
            .invoice-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit,minmax(160px,1fr));
              gap: 6px 18px;
              font-size: 0.85rem;
            }
            .invoice-grid span {
              color: var(--text-light);
              margin-left: 4px;
            }
            .invoice-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.85rem;
              margin-top: 4px;
            }
            .invoice-table th,
            .invoice-table td {
              border: 1px solid var(--border);
              padding: 4px 6px;
            }
            .invoice-table th {
              background: rgba(0,0,0,0.03);
              font-weight: 600;
            }
            .invoice-subtotal td {
              font-weight: 500;
            }
            .invoice-total-row td {
              font-weight: 700;
              background: rgba(34,197,94,0.08);
            }
            .invoice-footer {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              margin-top: 24px;
              font-size: 0.85rem;
            }
            .invoice-sign {
              flex: 1;
              border-top: 1px dashed var(--border);
              padding-top: 6px;
              text-align: center;
            }

            /* --- حالت چاپ: فقط فاکتور دیده شود --- */
            @media print {
              body * {
                visibility: hidden;
              }
              #invoice-print-root,
              #invoice-print-root * {
                visibility: visible;
              }
              #invoice-print-root {
                position: absolute;
                inset: 0;
                margin: 0;
                padding: 16px 24px;
                background: #ffffff;
              }
            }
          `}
        </style>

        {invoiceOrder && (() => {
          const customer =
            customers.find(
              (c) => String(c.id) === String(invoiceOrder.customerId)
            ) || {};

          const units = getOrderUnits(invoiceOrder);
          const groupsMap = new Map();
          let containersTotal = 0;

          for (const u of units) {
            const unitPrice = Number(u.price || 0);
            const key = `${u.kindId || "—"}::${u.templateId || "—"}::${unitPrice}`;
            if (!groupsMap.has(key)) {
              groupsMap.set(key, {
                kindId: u.kindId,
                templateId: u.templateId,
                unitPrice,
                count: 0,
              });
            }
            const g = groupsMap.get(key);
            g.count += 1;
            containersTotal += unitPrice;
          }

          const groups = Array.from(groupsMap.values());
          const invoiceTotal = Number(invoiceOrder.total || 0);
          const extra = Math.max(0, invoiceTotal - containersTotal);

          const cash = Number(invoiceOrder.payments?.cash || 0);
          const checksTotal = (invoiceOrder.payments?.checks || []).reduce(
            (sum, ch) => sum + (Number(ch.amount) || 0),
            0
          );
          const installmentsTotal = invoiceOrder.installment?.enabled
            ? (invoiceOrder.installment.list || []).reduce(
                (sum, ins) => sum + (Number(ins.amount) || 0),
                0
              )
            : 0;

          return (
            <div id="invoice-print-root" className="invoice-print-wrapper">
              {/* هدر فاکتور */}
              <div className="invoice-header">
                <div>
                  <div className="invoice-title">فاکتور فروش</div>
                  <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                    سامانه مدیریت تولید کانتینر
                  </div>
                </div>
                <div className="invoice-meta">
                  <div>
                    <span>شماره فاکتور:</span>{" "}
                    <b>{String(invoiceOrder.id)}</b>
                  </div>
                  <div>
                    <span>تاریخ فاکتور:</span>{" "}
                    <b>{formatDate(invoiceOrder.date)}</b>
                  </div>
                  {invoiceOrder.deliveredAt && (
                    <div>
                      <span>تاریخ تحویل:</span>{" "}
                      <b>{formatDate(invoiceOrder.deliveredAt)}</b>
                    </div>
                  )}
                  <div>
                    <span>وضعیت:</span>{" "}
                    <b>{invoiceOrder.status || "در جریان"}</b>
                  </div>
                </div>
              </div>

              {/* مشخصات مشتری */}
              <section className="invoice-section">
                <h4>مشخصات مشتری</h4>
                <div className="invoice-grid">
                  <div>
                    <span>نام مشتری:</span>
                    <b>{customer.name || "—"}</b>
                  </div>
                  <div>
                    <span>شماره تماس:</span>
                    <b>{customer.phone || "—"}</b>
                  </div>
                </div>
              </section>

              {/* اقلام سفارش */}
              <section className="invoice-section">
                <h4>اقلام سفارش</h4>
                {units.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    برای این سفارش واحد کانتینری ثبت نشده است.
                  </div>
                ) : (
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>ردیف</th>
                        <th>شرح کالا / کانتینر</th>
                        <th>تعداد</th>
                        <th>فی (تومان)</th>
                        <th>جمع (تومان)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, idx) => {
                        const kindName = getKindName(g.kindId);
                        const templateName = g.templateId
                          ? getTemplateName(g.templateId)
                          : "";
                        const desc = templateName
                          ? `${kindName} — ${templateName}`
                          : kindName;
                        const lineTotal = g.unitPrice * g.count;

                        return (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{desc}</td>
                            <td>{g.count}</td>
                            <td>{currency(g.unitPrice)}</td>
                            <td>{currency(lineTotal)}</td>
                          </tr>
                        );
                      })}
                      <tr className="invoice-subtotal">
                        <td colSpan={4}>جمع کانتینرها</td>
                        <td>{currency(containersTotal)}</td>
                      </tr>
                      {extra > 0 && (
                        <tr>
                          <td colSpan={4}>خدمات / هزینه‌های اضافی</td>
                          <td>{currency(extra)}</td>
                        </tr>
                      )}
                      <tr className="invoice-total-row">
                        <td colSpan={4}>مبلغ کل فاکتور</td>
                        <td>{currency(invoiceTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </section>

              {/* روش پرداخت */}
              <section className="invoice-section">
                <h4>روش پرداخت</h4>
                <table className="invoice-table">
                  <tbody>
                    <tr>
                      <td>نقد</td>
                      <td>{currency(cash)}</td>
                    </tr>
                    <tr>
                      <td>چک</td>
                      <td>{currency(checksTotal)}</td>
                    </tr>
                    <tr>
                      <td>اقساط برنامه‌ریزی‌شده</td>
                      <td>{currency(installmentsTotal)}</td>
                    </tr>
                    <tr className="invoice-total-row">
                      <td>جمع کل پرداخت‌ها (برنامه‌ریزی‌شده)</td>
                      <td>
                        {currency(cash + checksTotal + installmentsTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {invoiceOrder.paymentType && (
                  <div
                    className="muted"
                    style={{ marginTop: 4, fontSize: 12 }}
                  >
                  </div>
                )}
              </section>

              {/* توضیحات */}
              {invoiceOrder.note && (
                <section className="invoice-section">
                  <h4>توضیحات</h4>
                  <p style={{ fontSize: 12 }}>{invoiceOrder.note}</p>
                </section>
              )}

              {/* امضاها */}
              <section className="invoice-footer">
                <div className="invoice-sign">امضای فروشنده</div>
                <div className="invoice-sign">امضای خریدار</div>
              </section>
            </div>
          );
        })()}
      </OverlayModal>
    </div>
  );
}
