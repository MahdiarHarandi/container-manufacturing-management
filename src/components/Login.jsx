// src/components/Login.jsx
import React, { useState } from "react";
import { User, Lock, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";

/**
 * فرم ورود به سیستم (نسخه حرفه‌ای و کاملاً هماهنگ)
 */
export default function Login({ onLogin, authConfig, toast }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const expectedUsername = (authConfig && authConfig.username) || "admin";
  const expectedPassword = (authConfig && authConfig.password) || "1234";

  const notify = (msg, type = "error") =>
    toast ? toast(msg, { type }) : alert(msg);

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (error) setError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;

    const username = form.username.trim();
    const password = form.password;

    if (!username || !password) {
      const msg = "نام کاربری و رمز عبور را کامل وارد کنید.";
      setError(msg);
      notify(msg);
      return;
    }

    setSubmitting(true);

    setTimeout(() => {
      if (username === expectedUsername && password === expectedPassword) {
        localStorage.setItem("gm-auth", "true");
        notify("ورود با موفقیت انجام شد.", "success");
        onLogin && onLogin();
      } else {
        const msg = "نام کاربری یا رمز عبور نادرست است.";
        setError(msg);
        notify(msg, "error");
      }
      setSubmitting(false);
    }, 200);
  };

  return (
    <div
      className="login-container"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        padding: "0px",
      }}
    >
      <form
        className="login-box"
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface, #fff)",
          borderRadius: 24,
          padding: "32px 32px 32px 32px",
          boxShadow:
            "0 18px 45px rgba(15,23,42,0.06), 0 0 1px rgba(15,23,42,0.06)",
          direction: "rtl", // مهم برای راست‌چین شدن فرم
        }}
      >
        {/* هدر */}
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            ورود به سیستم
          </h2>
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 12,
              color: "var(--text-light)",
            }}
          >
            برای استفاده از سامانه مدیریت تولید کانتینر، اطلاعات ورود را وارد کنید.
          </p>
        </div>

        {/* نام کاربری */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              marginBottom: 6,
              color: "var(--text-light)",
            }}
          >
            نام کاربری
          </label>
          <div style={{ position: "relative" }}>
            {/* آیکون سمت راست */}
            <span
              style={{
                position: "absolute",
                top: "55%",
                right: 10,
                transform: "translateY(-50%)",
                color: "var(--primary)",
              }}
            >
              <User size={18} />
            </span>

            <input
              className="input"
              placeholder="نام کاربری"
              value={form.username}
              onChange={handleChange("username")}
              autoFocus
              style={{
                paddingInlineStart: 120,
                paddingInlineEnd: 120,
                textAlign: "center", // شروع از چپ
              }}
            />
          </div>
        </div>

        {/* رمز عبور */}
        <div style={{ marginBottom: 6 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              marginBottom: 6,
              color: "var(--text-light)",
            }}
          >
            رمز عبور
          </label>
          <div style={{ position: "relative" }}>
            {/* آیکون قفل سمت راست */}
            <span
              style={{
                position: "absolute",
                top: "55%",
                right: 10,
                transform: "translateY(-50%)",
                color: "var(--primary)",
              }}
            >
              <Lock size={18} />
            </span>

            <input
              type={showPassword ? "text" : "password"}
              className="input"
              placeholder="رمز عبور"
              value={form.password}
              onChange={handleChange("password")}
              style={{
                paddingInlineStart: 120,
                paddingInlineEnd: 120,
                textAlign: "center",
              }}
            />

            {/* دکمه نمایش/مخفی کردن - سمت چپ */}
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              style={{
                position: "absolute",
                top: "50%",
                left: 10,
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--text-light)",
                cursor: "pointer",
                display: "flex",
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* پیام خطا */}
        {error && (
          <div
            style={{
              marginTop: 4,
              marginBottom: 6,
              fontSize: 11,
              color: "#b91c1c",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* دکمه ورود */}
        <button
          type="submit"
          className="btn primary"
          style={{
            width: "100%",
            marginTop: 14,
            display: "inline-flex",
            gap: 6,
            justifyContent: "center",
            alignItems: "center",
          }}
          disabled={submitting}
        >
          {submitting ? "در حال ورود..." : (
            <>
              <LogIn size={16} />
              <span>ورود</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
