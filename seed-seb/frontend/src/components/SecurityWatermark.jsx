import React, { useMemo, useState, useEffect } from 'react';
import '../styles/SecurityWatermark.css';
import { getAuthData } from '../utils/storageUtils';

/**
 * Synchronously read initial auth data from localStorage so watermark
 * renders instantly on 1st frame before any assessment logic or async state.
 */
const getInitialAuth = () => {
  try {
    const authData = getAuthData();
    const user = authData;
    const roll = (user.rollNumber ?? user.uid ?? user.email) ?? '';
    const tenant = user.tenantId;
    return { roll, tenant };
  } catch (_) {
    return { roll: '', tenant: 'SEED-SEB' };
  }
};

/**
 * SecurityWatermark
 * Renders an unobtrusive, tamper-resistant, full-screen diagonal security watermark
 * with randomly dispersed "SEEDIT", "{TENANTID}", and "ROLLNO" across the viewport.
 */
const SecurityWatermark = ({ email: propEmail, rollNumber: propRoll, tenantId: propTenant, customText }) => {
  const initial = useMemo(() => getInitialAuth(), []);
  const [candidateRoll, setCandidateRoll] = useState(propRoll || initial.roll || 'CANDIDATE');
  const [candidateTenant, setCandidateTenant] = useState(propTenant || initial.tenant || 'SEED-SEB');

  useEffect(() => {
    if (propRoll) setCandidateRoll(propRoll);
    if (propTenant) setCandidateTenant(propTenant);

    try {
      const user = getAuthData();
      const resolvedRoll = propRoll || user.rollNumber || user.uid || user.email || (propEmail ?? '');
      const resolvedTenant = propTenant || user.tenantId;

      if (resolvedRoll) setCandidateRoll(resolvedRoll);
      if (resolvedTenant) setCandidateTenant(resolvedTenant);
    } catch (_) {}
  }, [propRoll, propTenant, propEmail]);

  // Generate Base64 encoded SVG pattern with dispersed, scattered entries
  const patternBase64 = useMemo(() => {
    const roll = candidateRoll || 'CANDIDATE';
    const tenant = candidateTenant || 'SEED-SEB';

    const sanitize = (str) =>
      String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const sRoll = sanitize(roll);
    const sTenant = sanitize(tenant);

    // Multi-row diagonal grid with scattered placement of SEEDIT, TENANT, ROLL
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="360" viewBox="0 0 560 360">
      <defs>
        <style>
          .wm-txt {
            fill: #64748b;
            fill-opacity: 0.16;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 1.5px;
          }
        </style>
      </defs>
      <!-- Row 1 -->
      <text x="110" y="60" text-anchor="middle" transform="rotate(-20, 110, 60)" class="wm-txt">SEEDIT</text>
      <text x="390" y="70" text-anchor="middle" transform="rotate(-20, 390, 70)" class="wm-txt">${sRoll}</text>
      
      <!-- Row 2 -->
      <text x="260" y="170" text-anchor="middle" transform="rotate(-20, 260, 170)" class="wm-txt">${sTenant}</text>
      <text x="500" y="180" text-anchor="middle" transform="rotate(-20, 500, 180)" class="wm-txt">SEEDIT</text>

      <!-- Row 3 -->
      <text x="90" y="280" text-anchor="middle" transform="rotate(-20, 90, 280)" class="wm-txt">${sRoll}</text>
      <text x="370" y="300" text-anchor="middle" transform="rotate(-20, 370, 300)" class="wm-txt">${sTenant}</text>
    </svg>`;

    try {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    } catch (_) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  }, [candidateRoll, candidateTenant]);

  return (
    <div className="seedit-security-watermark-overlay" aria-hidden="true">
      <div
        className="seedit-watermark-grid"
        style={{ backgroundImage: `url("${patternBase64}")` }}
      />
    </div>
  );
};

export default SecurityWatermark;

