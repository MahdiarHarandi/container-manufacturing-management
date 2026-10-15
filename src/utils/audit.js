// src/utils/audit.js
/**
 * ثبت لاگ عملیات (Audit Trail)
 * Author: Mahdiar
 *
 * ساختار لاگ‌ها در data.audit ذخیره می‌شود.
 * هر ورودی شامل:
 *  id: شناسه یکتا
 *  at: زمان ثبت (ISO)
 *  type: نوع رویداد (مثلاً ORDER_DELIVERED)
 *  message: توضیح کوتاه انسانی
 *  payload: داده جزئی (اختیاری)
 */

export function pushAudit(setData, { type, message, payload }) {
  setData((d) => ({
    ...d,
    audit: [
      ...(d.audit || []),
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        type,
        message,
        payload: payload || null,
      },
    ],
  }));
}

/**
 * فیلتر ساده برای خواندن لاگ‌ها
 * type: نوع خاصی از لاگ‌ها (اختیاری)
 * limit: تعداد رکورد آخر (اختیاری)
 */
export function getAuditLogs(data, { type, limit } = {}) {
  let logs = (data.audit || []);
  if (type) logs = logs.filter((a) => a.type === type);
  if (limit) logs = logs.slice(-limit);
  return logs.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/**
 * پاکسازی یا نگه‌داشت لاگ‌های قدیمی‌تر از n روز
 */
export function pruneAudit(setData, days = 180) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  setData((d) => ({
    ...d,
    audit: (d.audit || []).filter((a) => new Date(a.at).getTime() > cutoff),
  }));
}
