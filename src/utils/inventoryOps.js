// src/utils/inventoryOps.js

// تولید id امن (هم در مرورگر مدرن، هم در محیط‌های قدیمی‌تر)
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    "inv_" +
    Math.random().toString(36).slice(2) +
    "_" +
    Date.now().toString(36)
  );
}

/**
 * نرمال‌سازی نام کالا:
 * - حذف فاصله‌های اضافه
 * - یکسان‌سازی ی / ی عربی، ک / ك
 * - تبدیل به حروف کوچک برای مقایسه
 */
export function normalizeName(raw) {
  if (!raw) return "";
  return String(raw)
    .trim()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * نرمال‌سازی واحد:
 * - حذف فاصله‌های اضافی
 * - اگر خالی بود → "عدد"
 */
export function normalizeUnit(raw) {
  if (!raw) return "عدد";
  const t = String(raw).trim();
  return t || "عدد";
}

/**
 * applyInventoryDelta
 *
 * ورودی:
 *  - inventory: آرایه‌ی فعلی انبار (items)
 *  - items: آرایه‌ای از اقلام با ساختار:
 *      { inventoryId?, name?, unit?, qty }
 *  - sign: +1 برای افزودن، -1 برای کسر
 *
 * رفتار:
 *  - اگر inventoryId وجود داشته باشد:
 *      → همان آیتم بر اساس id پیدا و موجودی‌اش آپدیت می‌شود.
 *  - اگر inventoryId نباشد:
 *      → آیتم با key = normalizeName(name) + unit جستجو می‌شود.
 *      → اگر پیدا شد: موجودی‌اش آپدیت می‌شود.
 *      → اگر پیدا نشد و sign > 0: آیتم جدید ساخته می‌شود.
 *      → اگر پیدا نشد و sign < 0: هیچ آیتمی ساخته نمی‌شود (برای rollback امن).
 *
 * خروجی:
 *  {
 *    inventory: آرایه‌ی به‌روزرسانی‌شده,
 *    items: آرایه‌ی اقلام با inventoryId و name/unit نهایی (normalized)
 *  }
 */
export function applyInventoryDelta(inventory, items, sign = +1) {
  const inv = Array.isArray(inventory) ? [...inventory] : [];

  // Map برای دسترسی سریع بر اساس id
  const indexById = new Map();
  inv.forEach((it, idx) => {
    if (!it || !it.id) return;
    indexById.set(String(it.id), idx);
  });

  // Map برای دسترسی سریع بر اساس (نام نرمال + واحد)
  const indexByKey = new Map();
  inv.forEach((it, idx) => {
    const key = `${normalizeName(it.name)}|${normalizeUnit(it.unit)}`;
    indexByKey.set(key, idx);
  });

  const normalizedItems = [];

  for (const raw of items || []) {
    const qty = Number(raw.qty);
    if (!Number.isFinite(qty) || qty === 0) continue;

    let id = raw.inventoryId ? String(raw.inventoryId) : "";
    let name = raw.name || "";
    let unit = normalizeUnit(
      raw.unit ||
        (id && indexById.has(id) ? inv[indexById.get(id)]?.unit : "عدد")
    );

    // ۱) اگر inventoryId معتبر است، براساس id آپدیت کن
    if (id && indexById.has(id)) {
      const idx = indexById.get(id);
      const item = inv[idx];

      const newStock = Math.max(0, (Number(item.stock) || 0) + sign * qty);

      inv[idx] = {
        ...item,
        unit: unit || item.unit || "عدد",
        stock: newStock,
      };

      name = item.name;

      normalizedItems.push({
        ...raw,
        inventoryId: id,
        name,
        unit,
        qty,
      });

      continue;
    }

    // ۲) اگر id نداریم، براساس نام + واحد عمل می‌کنیم (برای خریدها)
    const nameKey = normalizeName(name);
    if (!nameKey) {
      // اگر نام خالی است، هیچ کاری انجام نمی‌دهیم
      continue;
    }

    const key = `${nameKey}|${unit}`;
    let idx = indexByKey.get(key);

    // اگر پیدا نشد و sign منفی است (rollback/مصرف)، آیتم جدید نمی‌سازیم
    if (idx == null && sign < 0) {
      continue;
    }

    // اگر پیدا نشد و sign مثبت است، آیتم جدید می‌سازیم
    if (idx == null && sign > 0) {
      const newId = generateId();
      const newItem = {
        id: newId,
        name: name.trim(),
        unit,
        stock: qty,
        min: 0,
        price: 0,
      };

      inv.push(newItem);
      idx = inv.length - 1;

      indexById.set(newId, idx);
      indexByKey.set(key, idx);

      id = newId;

      normalizedItems.push({
        ...raw,
        inventoryId: id,
        name: newItem.name,
        unit,
        qty,
      });

      continue;
    }

    // اگر پیدا شد، روی همان آیتم اعمال می‌کنیم
    const item = inv[idx];
    const newStock = Math.max(0, (Number(item.stock) || 0) + sign * qty);

    inv[idx] = {
      ...item,
      unit: unit || item.unit || "عدد",
      stock: newStock,
    };

    id = item.id;
    name = item.name;

    normalizedItems.push({
      ...raw,
      inventoryId: id,
      name,
      unit,
      qty,
    });
  }

  return { inventory: inv, items: normalizedItems };
}
