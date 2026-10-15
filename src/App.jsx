import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Package,
  ShoppingCart,
  DollarSign,
  BarChart2,
  Settings as Gear,
  Menu,
  Truck,
  Box,
  Wrench,
  UserRound,
} from "lucide-react";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Orders from "./components/Orders";
import Customers from "./components/Customers";
import Inventory from "./components/Inventory";
import Purchases from "./components/Purchases";
import Finance from "./components/Finance";
import Reports from "./components/Reports";
import Workers from "./components/Workers";
import Settings from "./components/Settings";
import Containers from "./components/Containers";
import ContainerModels from "./components/ContainerModels";

import "./App.css";

/* ======================== DEFAULT DATA ======================== */
const defaultData = {
  customers: [],
  orders: [],
  inventory: [],
  purchases: [],
  finance: [],
  checks: [],
  workers: [],
  wages: [],
  containerKinds: [],
  containerTemplates: [],
  containerUnits: [],
  archivedOrders: [],
  audit: [],
};

const defaultAuthConfig = {
  username: "admin",
  password: "1234",
};

/* ======================== LOADERS ======================== */
const loadInitialData = () => {
  try {
    const stored = localStorage.getItem("gm-data");
    if (!stored) return defaultData;
    const parsed = JSON.parse(stored);
    return { ...defaultData, ...parsed };
  } catch {
    return defaultData;
  }
};

const loadInitialTheme = () => {
  try {
    return localStorage.getItem("theme") || "light";
  } catch {
    return "light";
  }
};

const loadAuthState = () => {
  try {
    return localStorage.getItem("gm-auth") === "true";
  } catch {
    return false;
  }
};

const loadInitialAuthConfig = () => {
  try {
    return (
      JSON.parse(localStorage.getItem("gm-auth-config")) || defaultAuthConfig
    );
  } catch {
    return defaultAuthConfig;
  }
};

/* ======================== TOAST ======================== */
const useToast = () => {
  return (msg, opts = {}) => {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;

    if (opts.type === "error") el.style.background = "#e11d48";
    if (opts.type === "success") el.style.background = "#059669";
    if (opts.type === "warning") el.style.background = "#d97706";
    if (opts.type === "info") el.style.background = "#3b82f6";

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => el.classList.remove("show"), 2500);
    setTimeout(() => el.remove(), 3000);
  };
};

/* ======================== SIDEBAR PAGES ======================== */
const sidebarPages = [
  { key: "dashboard", label: "داشبورد", icon: LayoutDashboard, component: Dashboard },
  { key: "orders", label: "سفارش‌ها", icon: ClipboardList, component: Orders },
  { key: "customers", label: "مشتریان", icon: Users, component: Customers },
  { key: "containers", label: "کانتینرها", icon: Box, component: Containers },
  { key: "inventory", label: "انبار", icon: Package, component: Inventory },
  { key: "purchases", label: "خریدها", icon: ShoppingCart, component: Purchases },
  { key: "finance", label: "مالی", icon: DollarSign, component: Finance },
  { key: "reports", label: "گزارشات", icon: BarChart2, component: Reports },
  { key: "workers", label: "کارگران", icon: Wrench, component: Workers },
  { key: "settings", label: "تنظیمات", icon: Gear, component: Settings },
];

const internalPages = {
  models: ContainerModels,
};

/* ======================== APP ======================== */
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(loadInitialTheme);
  const [data, setData] = useState(loadInitialData);
  const [isLoggedIn, setIsLoggedIn] = useState(loadAuthState);
  const [authConfig, setAuthConfig] = useState(loadInitialAuthConfig);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef(null);
  const toast = useToast();

  /* ------------------------ sync theme ------------------------ */
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  /* ------------------------ sync data ------------------------ */
  useEffect(() => {
    localStorage.setItem("gm-data", JSON.stringify(data));
  }, [data]);

  /* ------------------------ sync auth config ------------------------ */
  useEffect(() => {
    localStorage.setItem("gm-auth-config", JSON.stringify(authConfig));
  }, [authConfig]);

  /* ------------------------ sync login ------------------------ */
  useEffect(() => {
    if (isLoggedIn) localStorage.setItem("gm-auth", "true");
    else localStorage.removeItem("gm-auth");
  }, [isLoggedIn]);

  /* ------------------------ click outside ------------------------ */
  useEffect(() => {
    if (!menuOpen) return;

    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  /* ------------------------ page title ------------------------ */
  useEffect(() => {
    const title =
      sidebarPages.find((p) => p.key === active)?.label ||
      (active === "models" ? "مدل‌های ساخت" : "داشبورد");
    document.title = `سامانه مدیریت تولید کانتینر - ${title}`;
  }, [active]);

  /* ------------------------ PAGE COMPONENT ------------------------ */
  const CurrentPageComponent = useMemo(() => {
    const sidebarMatch = sidebarPages.find((p) => p.key === active);
    if (sidebarMatch) return sidebarMatch.component;
    if (internalPages[active]) return internalPages[active];
    return Dashboard;
  }, [active]);

  const activePageLabel =
    sidebarPages.find((p) => p.key === active)?.label ||
    (active === "models" ? "مدل‌های ساخت" : "داشبورد");

  /* ======================== RENDER ======================== */
  return (
    <div className="app-shell">

      {/* LOGIN MODE */}
      {!isLoggedIn ? (
        <Login
          onLogin={() => setIsLoggedIn(true)}
          authConfig={authConfig}
          toast={toast}
        />
      ) : (
        <>
          {/* SIDEBAR */}
          <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
            <div className="sidebar-header">
              {collapsed ? (
                <div className="logo-collapsed">
                  <Truck size={26} color="var(--primary)" />
                </div>
              ) : (
                <div className="logo">
                  <Truck size={22} style={{ marginInlineEnd: 6 }} />
                  <span>سامانه مدیریت تولید کانتینر</span>
                </div>
              )}

              <button
                className="icon-btn toggle-btn"
                onClick={() => setCollapsed((c) => !c)}
              >
                <Menu size={22} />
              </button>
            </div>

            <nav className="sidebar-nav">
              {sidebarPages.map(({ key, label, icon: Icon }) => {
                const isActive =
                  active === key ||
                  (active === "models" && key === "containers");

                return (
                  <button
                    key={key}
                    onClick={() => setActive(key)}
                    className={`nav-link ${isActive ? "active" : ""}`}
                  >
                    <Icon size={20} />
                    {!collapsed && <span>{label}</span>}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* MAIN */}
          <main className="main-area">
            <header className="topbar glass">
              <h1>{activePageLabel}</h1>

              <div className="row" style={{ gap: 12 }}>
                <div className="user-menu" ref={menuRef}>
                  <button
                    className="avatar-btn"
                    onClick={() => setMenuOpen((m) => !m)}
                  >
                    <UserRound size={20} aria-label="حساب کاربری" />
                  </button>

                  {menuOpen && (
                    <div className="user-dropdown show">
                      <div className="user-name">
                        <span>{authConfig.username || "کاربر سیستم"}</span>
                      </div>

                      <button
                        className="logout-btn"
                        onClick={() => setIsLoggedIn(false)}
                      >
                        خروج از حساب
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <section className="content-area">
              <div className="content-wrapper glass compact-content">
                <CurrentPageComponent
                  data={data}
                  setData={setData}
                  toast={toast}
                  theme={theme}
                  setTheme={setTheme}
                  go={setActive}
                  authConfig={authConfig}
                  setAuthConfig={setAuthConfig}
                />
              </div>

              <div id="invoice-print-root"></div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}
