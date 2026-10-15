import React, { useMemo } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

export default function ShamsiDatePicker({ value, onChange, style, className }) {
  // ✅ مقدار ورودی (میلادی) را به آبجکت شمسی تبدیل می‌کنیم
  const dateValue = useMemo(() => {
    if (!value) return null;
    try {
      // اگر مقدار ISO میلادی بود (مثلاً 2025-11-10)
      return new DateObject({
        date: new Date(value),
        calendar: persian,
        locale: persian_fa,
      });
    } catch {
      return null;
    }
  }, [value]);

  return (
    <DatePicker
      value={dateValue}
      onChange={(date) => {
        if (!date) return onChange("");
        // خروجی ISO (میلادی) برای ذخیره
        const iso = date.toDate().toISOString().slice(0, 10);
        onChange(iso);
      }}
      calendar={persian}
      locale={persian_fa}
      digits="fa"               // 🔹 تمام اعداد فارسی
      format="YYYY/MM/DD"       // 🔹 نمایش کامل شمسی
      inputClass={className || "input"}
      style={style}
      calendarPosition="bottom-right"
      placeholder="تاریخ را انتخاب کنید"
      showOtherDays
      fixMainPosition
      shadow={true}
      mapDays={({ date }) => ({
        className:
          date.month.index === 0 ? "rmdp-first-month" : undefined,
      })}
    />
  );
}
