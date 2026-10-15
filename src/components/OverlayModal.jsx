// src/components/OverlayModal.jsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * OverlayModal.jsx — شیء مودال حرفه‌ای با UX و دسترسی (A11y) مناسب
 *
 * Props:
 *  - open: boolean                 // نمایش/عدم نمایش مودال
 *  - title: ReactNode | string     // عنوان بالای مودال
 *  - children: ReactNode           // محتوای اصلی
 *  - footer: ReactNode             // ناحیه دکمه‌ها/فوتر
 *  - onClose: () => void           // بستن مودال
 *  - size: 'sm' | 'md' | 'lg'      // اندازه عرض مودال (پیش‌فرض: md)
 *  - showClose: boolean            // نمایش/عدم نمایش دکمه ×
 *  - preventCloseOnBackdrop: bool  // جلوگیری از بستن با کلیک روی بک‌دراپ
 *  - initialFocusRef: Ref          // اگر داده شود، بعد از باز شدن روی این المنت فوکوس می‌شود
 */

const SIZE_MAP = {
  sm: 420,
  md: 640,
  lg: 900,
};

function getMaxWidth(size) {
  return SIZE_MAP[size] || SIZE_MAP.md;
}

export default function OverlayModal({
  open,
  title,
  children,
  footer,
  onClose,
  size = "md",
  showClose = true,
  preventCloseOnBackdrop = false,
  initialFocusRef,
}) {
  const portalEl = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  // ساخت پورتال روی body
  if (typeof document !== "undefined" && !portalEl.current) {
    const el = document.createElement("div");
    el.className = "overlay-portal";
    document.body.appendChild(el);
    portalEl.current = el;
  }

  // قفل اسکرول بدنه + ESC برای بستن
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!preventCloseOnBackdrop && onClose) {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, preventCloseOnBackdrop]);

  // فوکوس اولیه بعد از باز شدن
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [open, initialFocusRef]);

  if (!open || !portalEl.current) {
    return null;
  }

  const maxW = getMaxWidth(size);
  const titleId =
    typeof title === "string" ? `overlay-title-${title}` : undefined;

  const handleBackdropMouseDown = (e) => {
    if (preventCloseOnBackdrop) return;
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  const sheet = (
    <div
      className="overlay-backdrop"
      onMouseDown={handleBackdropMouseDown}
      aria-hidden={false}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        ref={dialogRef}
        className="sheet card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: `min(96vw, ${maxW}px)`,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 16,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.38)",
          background:
            "var(--bg-elevated, var(--bg, #ffffff))",
        }}
      >
        {/* Header */}
        <div
          className="section-title"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h3
            id={titleId}
            style={{
              margin: 0,
              fontSize: "1.05rem",
              fontWeight: 600,
            }}
          >
            {title}
          </h3>

          {showClose && (
            <button
              ref={closeButtonRef}
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="بستن"
              style={{
                marginRight: "auto",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div
          className="body"
          style={{
            padding: "12px 16px 16px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="overlay-footer"
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border, #e5e7eb)",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              background:
                "var(--bg-elevated, var(--bg, #ffffff))",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, portalEl.current);
}
