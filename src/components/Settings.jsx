// src/components/Settings.jsx
import React from "react";
import {
  Sun,
  Moon,
  Download,
  UploadCloud,
  Trash2,
  Database,
  Info,
  ShieldCheck,
  UserCog,
  Lock,
} from "lucide-react";

import OverlayModal from "./OverlayModal";

export default function Settings({
  theme,
  setTheme,
  toast,
  authConfig,
  setAuthConfig,
}) {
  const VERSION = "1.3.0";
  const notify = (msg, type = "info") =>
    toast ? toast(msg, { type }) : alert(msg);

  // =============================
  //  Account (User & Password)
  // =============================
  const [showAccountModal, setShowAccountModal] = React.useState(false);

  const [newUser, setNewUser] = React.useState("");
  const [oldPass, setOldPass] = React.useState("");
  const [newPass, setNewPass] = React.useState("");
  const [newPassConfirm, setNewPassConfirm] = React.useState("");

  const handleSaveAuth = () => {
    if (!oldPass.trim())
      return notify("رمز عبور فعلی را وارد کنید", "error");

    if (oldPass !== authConfig.password)
      return notify("رمز عبور فعلی اشتباه است", "error");

    if (newPass.trim().length < 4)
      return notify("رمز جدید باید حداقل ۴ کاراکتر باشد", "error");

    if (newPass !== newPassConfirm)
      return notify("تکرار رمز جدید صحیح نیست", "error");

    const updated = {
      username: newUser.trim() || authConfig.username,
      password: newPass,
    };

    setAuthConfig(updated);

    // پاکسازی
    setNewUser("");
    setOldPass("");
    setNewPass("");
    setNewPassConfirm("");

    notify("اطلاعات حساب کاربری با موفقیت ذخیره شد", "success");
    setTimeout(() => {
      localStorage.removeItem("gm-auth");
      window.location.reload();
    }, 600);
  };

  // =============================
  // Backup
  // =============================
  const handleBackup = () => {
    try {
      const dataObj = {
        appData: JSON.parse(localStorage.getItem("gm-data") || "{}"),
      };
      const blob = new Blob([JSON.stringify(dataObj)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `garage-manager-backup-${new
        Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      notify("📦 فایل پشتیبان با موفقیت ایجاد شد", "success");
    } catch {
      notify("خطا در ایجاد فایل پشتیبان", "error");
    }
  };

  // =============================
  // Restore
  // =============================
  const handleRestore = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json";
    inp.onchange = (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const parsed = JSON.parse(r.result);
          if (!parsed || typeof parsed !== "object") throw new Error();
          localStorage.setItem("gm-data", JSON.stringify(parsed.appData || {}));
          if (parsed.auth) {
            localStorage.setItem(
              "gm-auth-config",
              JSON.stringify(parsed.auth)
            );
          }
          notify("داده‌ها بازیابی شدند. برنامه مجدداً بارگذاری می‌شود.", "success");
          window.location.reload();
        } catch {
          notify("فایل معتبر نیست یا خراب است.", "error");
        }
      };
      r.readAsText(f);
    };
    inp.click();
  };

  // =============================
  // Clear all data
  // =============================
  const handleClear = () => {
    if (!window.confirm("آیا از حذف همه داده‌ها مطمئن هستید؟")) return;
    localStorage.removeItem("gm-data");
    notify("تمام داده‌ها حذف شدند", "success");
    window.location.reload();
  };

  // =============================
  // Export CSV Summary
  // =============================
  const handleExportExcel = () => {
    try {
      const data = JSON.parse(localStorage.getItem("gm-data") || "{}");
      const csv = [
        "بخش,تعداد رکورد",
        ...Object.entries(data)
          .filter(([_, v]) => Array.isArray(v))
          .map(([k, v]) => `${k},${v.length}`),
      ].join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "garage-data-summary.csv";
      a.click();

      notify("📊 خلاصه داده‌ها به CSV ذخیره شد", "success");
    } catch {
      notify("خطا در تولید فایل اکسل", "error");
    }
  };

  // =====================================================
  //               RENDER
  // =====================================================
  return (
    <div className="card settings-card">
      <h3 className="settings-title">تنظیمات سیستم</h3>
      <div className="pill">نسخه {VERSION}</div>

      {/* ---- Account ---- */}
      <section className="settings-section">
        <h4>حساب کاربری</h4>

        <div style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            onClick={() => setShowAccountModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <UserCog size={18} />
            مدیریت حساب کاربری
          </button>
        </div>
      </section>

      {/* ---- Account Modal ---- */}
      <OverlayModal
        open={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title="مدیریت حساب کاربری"
        size="sm"
      >
        <div style={{ display: "grid", gap: 16, paddingTop: 8 }}>
          <div>
            <label className="input-label">نام کاربری فعلی</label>
            <input className="input" disabled value={authConfig.username} />
          </div>

          <div>
            <label className="input-label">نام کاربری جدید</label>
            <div style={{ position: "relative" }}>
              <UserCog
                size={18}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  opacity: 0.6,
                }}
              />
              <input
                className="input"
                placeholder="نام کاربری جدید"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                style={{ paddingInlineStart: 36 }}
              />
            </div>
          </div>

          <div>
            <label className="input-label">رمز عبور فعلی</label>
            <div style={{ position: "relative" }}>
              <Lock
                size={18}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  opacity: 0.6,
                }}
              />
              <input
                type="password"
                className="input"
                placeholder="رمز فعلی"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                style={{ paddingInlineStart: 36 }}
              />
            </div>
          </div>

          <div>
            <label className="input-label">رمز عبور جدید</label>
            <div style={{ position: "relative" }}>
              <ShieldCheck
                size={18}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  opacity: 0.6,
                }}
              />
              <input
                type="password"
                className="input"
                placeholder="رمز جدید"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                style={{ paddingInlineStart: 36 }}
              />
            </div>
          </div>

          <div>
            <label className="input-label">تکرار رمز جدید</label>
            <div style={{ position: "relative" }}>
              <ShieldCheck
                size={18}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  opacity: 0.6,
                }}
              />
              <input
                type="password"
                className="input"
                placeholder="تکرار رمز"
                value={newPassConfirm}
                onChange={(e) => setNewPassConfirm(e.target.value)}
                style={{ paddingInlineStart: 36 }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
          }}
        >
          <button className="btn" onClick={() => setShowAccountModal(false)}>
            انصراف
          </button>
          <button className="btn primary" onClick={handleSaveAuth}>
            ذخیره تغییرات
          </button>
        </div>
      </OverlayModal>

      {/* ---- Backup ---- */}
      <section className="settings-section">
        <h4>پشتیبان‌گیری و بازیابی</h4>
        <div className="btn-group">
          <button className="btn" onClick={handleBackup}>
            <Download size={18} /> دانلود پشتیبان
          </button>

          <button className="btn" onClick={handleRestore}>
            <UploadCloud size={18} /> بازیابی داده
          </button>
        </div>
      </section>

      {/* ---- Data Management ---- */}
      <section className="settings-section">
        <h4>مدیریت داده‌ها</h4>
        <div className="btn-group">
          <button className="btn" onClick={handleExportExcel}>
            <Database size={18} /> خروجی اکسل
          </button>

          <button className="btn danger" onClick={handleClear}>
            <Trash2 size={18} /> حذف همه داده‌ها
          </button>
        </div>
      </section>

      {/* ---- Help ---- */}
      <section className="settings-section">
        <h4>راهنما</h4>
        <ul className="settings-help">
          <li>
            <Info size={14} /> داده‌ها به‌صورت خودکار در حافظه ذخیره می‌شوند.
          </li>
          <li>هفتگی فایل پشتیبان ایجاد کنید.</li>
          <li>فایل JSON را می‌توانید در سیستم دیگر وارد کنید.</li>
        </ul>
      </section>
    </div>
  );
}
