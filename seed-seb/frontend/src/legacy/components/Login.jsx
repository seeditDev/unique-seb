import React, { useState, useEffect } from "react";
import { useNavigate } from '../router-compat';
import DataService from "../services/dataService";
import TrackingService from "../services/trackingService";
import desktopBridge from "../utils/desktopBridge";
import { getStorageJson } from "../utils/storageUtils";
import { ROLES } from "../config/constants";
import '../styles/Login.css';

const DASHBOARD_PATHS = {
  student: "/student/dashboard",
  staff:   "/student/dashboard",
  admin:   "/admin/questions",
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = getStorageJson("rememberedUser", null);
    if (saved) {
      setEmail(saved.email ?? "");
      setPassword(saved.password ?? "");
    }

    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason") || sessionStorage.getItem("session_terminated_reason");
    if (reason === "simultaneous_login") {
      setError("Simultaneous login detected: Your account was signed in on another machine or browser. For exam security, your previous session was terminated.");
      sessionStorage.removeItem("session_terminated_reason");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const userData = await DataService.validateCredentials(email.trim(), password);
      if (!userData) {
        setError("Invalid email or password. Please check your credentials.");
        return;
      }

      const effectiveRole = userData.role || ROLES.STUDENT;
      localStorage.setItem("auth_data", JSON.stringify(userData));
      localStorage.setItem("role", effectiveRole);
      if (rememberMe) {
        localStorage.setItem("rememberedUser", JSON.stringify({ email: userData.email, password }));
      } else {
        localStorage.removeItem("rememberedUser");
      }

      try { desktopBridge.setStudentSession(userData); } catch (_) {}
      try { await TrackingService.startTracking(userData); } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(DASHBOARD_PATHS[effectiveRole] || DASHBOARD_PATHS.student);
      }, 1200);
    } catch (err) {
      const code = err?.code ?? "";
      if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
        setError("Invalid email or password. Please try again.");
      } else if (code.includes("too-many-requests")) {
        setError("Too many failed attempts. Please try again later.");
      } else if (code.includes("network-request-failed")) {
        setError("Network connection issue. Please verify your connection.");
      } else {
        setError(err.message || "Sign in failed. Please verify your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-fullscreen-split">
      
      {/* ========================================================
           LEFT PANEL: SEED-SEB Architecture & Visual Showcase
           ======================================================== */}
      <section className="seb-left-panel">
        
        {/* Background Dot Grids & Rings */}
        <div className="seb-dot-grid seb-dot-grid-top-right">
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>

        <div className="seb-dot-grid seb-dot-grid-mid-left">
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>

        <div className="seb-bg-circle-dec seb-dec-circle-1"></div>
        <div className="seb-bg-circle-dec seb-dec-circle-2"></div>

        {/* Main Content Column */}
        <div className="seb-showcase-inner">
          
          {/* Logo & Brand Header */}
          <div className="seb-logo-badge">
            <img 
              src="/SEED_Logo_Transparent.png" 
              alt="SEED Logo" 
              onError={(e) => {
                e.target.src = '/SEED_Logo.png';
                e.target.onerror = null;
              }} 
            />
          </div>

          <h1 className="seb-brand-title">SEED<span>-SEB</span></h1>
          <div className="seb-brand-subtitle">Secure Examination Environment</div>

          <div className="seb-hero-tagline">
            A secure and trusted environment<br />
            for <span>fair</span> and <span>seamless</span> assessments.
          </div>

          {/* 3D Laptop & Security Scene */}
          <div className="seb-laptop-scene-wrapper">
            
            {/* Floating Code Card (Left) */}
            <div className="seb-floating-code-card">
              <div className="seb-f-code-symbol">&lt;/&gt;</div>
              <div className="seb-f-code-line"></div>
              <div className="seb-f-code-line short"></div>
            </div>

            {/* Floating Lock Card (Right) */}
            <div className="seb-floating-lock-card">
              <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            </div>

            {/* Laptop Frame */}
            <div className="seb-laptop-frame">
              <div className="seb-laptop-screen-bezel">
                <div className="seb-screen-dot-grid">
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                  <span></span><span></span><span></span>
                </div>

                {/* Green 3D Shield Vector */}
                <svg className="seb-screen-shield-icon" viewBox="0 0 24 28" fill="none">
                  <path d="M12 1L3 5v8c0 7 9 14 9 14s9-7 9-14V5l-9-4z" fill="#008744"/>
                  <path d="M12 2.5L4.5 5.8v6.7c0 5.8 7.5 11.8 7.5 11.8s7.5-6 7.5-11.8V5.8L12 2.5z" fill="#00a854"/>
                  <path d="M9.5 12.5L11 14l4.5-4.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>

                <div className="seb-screen-env-title">Exam Environment</div>
                <div className="seb-screen-env-badge">
                  <span className="badge-dot"></span>
                  <span>Secure & Protected</span>
                </div>
              </div>

              <div className="seb-laptop-base">
                <div className="seb-laptop-base-notch"></div>
              </div>
            </div>

          </div>

          {/* Four Pill Feature Bar */}
          <div className="seb-feature-card-wrapper">
            
            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
              </div>
              <div className="seb-feat-heading">Secure</div>
              <div className="seb-feat-desc">Locked-down environment</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              </div>
              <div className="seb-feat-heading">Proctored</div>
              <div className="seb-feat-desc">Real-time monitoring</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </div>
              <div className="seb-feat-heading">Reliable</div>
              <div className="seb-feat-desc">Anti-cheating measures</div>
            </div>

            <div className="seb-feature-col">
              <div className="seb-feat-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
              </div>
              <div className="seb-feat-heading">Verified</div>
              <div className="seb-feat-desc">Accurate results & analytics</div>
            </div>

          </div>

          {/* Bottom Evaluation Status Pill */}
          <div className="seb-status-pill-card">
            <div className="seb-status-pill-icon">
              <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            </div>
            <div className="seb-status-pill-text">
              <div className="seb-status-pill-title">Evaluation Engine Connected</div>
              <div className="seb-status-pill-sub">System Ready &nbsp;•&nbsp; 10/10 Test Cases Verified</div>
            </div>
          </div>

        </div>

      </section>

      {/* ========================================================
           RIGHT PANEL: Clean Student Sign In Form
           ======================================================== */}
      <section className="seb-right-panel">
        
        <div className="seb-form-container">
          
          <div className="seb-form-title-group">
            <h1 className="seb-form-main-heading">Student Sign In</h1>
            <p className="seb-form-main-subtitle">Enter your registered credentials to access your scheduled examinations.</p>
          </div>

          {error && (
            <div className="seb-error-banner" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {showSuccess && (
            <div className="seb-success-banner" role="status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>Authentication successful! Launching portal...</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            
            {/* Email / Student ID Field */}
            <div className="seb-form-field-group">
              <label className="seb-field-title" htmlFor="studentEmailInput">Email or Student ID</label>
              <div className="seb-field-input-box">
                <span className="seb-field-icon-left">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input 
                  type="text" 
                  id="studentEmailInput" 
                  className="seb-custom-input" 
                  placeholder="Enter your institutional email or ID" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="seb-form-field-group">
              <label className="seb-field-title" htmlFor="studentPasswordInput">Password</label>
              <div className="seb-field-input-box">
                <span className="seb-field-icon-left">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input 
                  type={showPassword ? "text" : "password"} 
                  id="studentPasswordInput" 
                  className="seb-custom-input" 
                  placeholder="Enter your password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="button" 
                  className="seb-field-eye-btn" 
                  onClick={() => setShowPassword(!showPassword)} 
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Form Meta Options */}
            <div className="seb-form-meta-row">
              <label className="seb-remember-label-wrap">
                <input 
                  type="checkbox" 
                  id="rememberMeCheck" 
                  className="seb-custom-checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember this session</span>
              </label>
              <a 
                href="#forgot" 
                className="seb-forgot-pwd-link"
                onClick={(e) => {
                  e.preventDefault();
                  setError("Please contact your institutional exam coordinator or administrator for password reset.");
                }}
              >
                Forgot password?
              </a>
            </div>

            {/* Primary Sign In Button */}
            <button 
              type="submit" 
              className="seb-btn-sign-in"
              disabled={loading}
            >
              {loading ? "Verifying credentials..." : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div className="seb-or-divider-row">
            <span>OR</span>
          </div>

          {/* Guest Assessment Code Button */}
          <button 
            type="button" 
            className="seb-btn-access-code" 
            onClick={() => navigate('/guest')}
          >
            <svg viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            <span>Enter Assessment Access Code</span>
          </button>

        </div>

        {/* Copyright Footer */}
        <div className="seb-copyright-note">
          &copy; 2023 - 2026 SEED Innovating Technologies and Edu Services. All rights reserved.
        </div>

      </section>

    </div>
  );
};

export default Login;
