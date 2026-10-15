// src/utils/accounting.js

/**
 * محاسبه بدهی واقعی مشتری بر اساس داده‌ها
 * Author: Mahdiar — unified financial logic
 */
export function computeCustomerDebt(data, customerId) {
  const cid = String(customerId);

  const orders = (data.orders || []).filter(
    (o) => String(o.customerId) === cid
  );
  const totalOrders = orders.reduce((sum, o) => sum + (+o.total || 0), 0);

  // پرداخت نقدی وصول‌شده
  const cashPayments = (data.finance || [])
    .filter(
      (f) =>
        f.type === "income" && f.method === "نقد" && String(f.customerId) === cid
    )
    .reduce((sum, f) => sum + (+f.amount || 0), 0);

  // اقساط وصول‌شده
  const collectedInstallments = (data.finance || [])
    .filter(
      (f) =>
        f.type === "income" && f.method === "قسط" && String(f.customerId) === cid
    )
    .reduce((sum, f) => sum + (+f.amount || 0), 0);

  // چک‌های پاس‌شده
  const clearedChecks = (data.checks || [])
    .filter(
      (ch) => String(ch.customerId) === cid && ch.status === "پاس شد"
    )
    .reduce((sum, ch) => sum + (+ch.amount || 0), 0);

  // چک‌های در انتظار
  const pendingChecks = (data.checks || [])
    .filter(
      (ch) => String(ch.customerId) === cid && ch.status === "در انتظار"
    )
    .reduce((sum, ch) => sum + (+ch.amount || 0), 0);

  const realDebt =
    totalOrders - (cashPayments + clearedChecks + collectedInstallments);

  return {
    debt: Math.max(0, realDebt),
    pendingChecks,
  };
}
