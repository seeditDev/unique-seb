/**
 * GuestPortal.jsx  (Redesigned — v2)
 *
 * New flow:
 *   Step 1 — College: Select college from south_india_index.json (no code entry needed)
 *   Step 2 — Details: Enter name, roll no, dept, year
 *   Step 3 — Dashboard: Show assessment cards from tenantAssessments/{collegeCode}/guestTests
 *   Step 4 — Start: Enter passkey (if required) → launch engine
 *   Step 5 — Done: Submission complete, re-attempt blocked
 *
 * Guest ID strategy:
 *   guestId = {collegeCode}_{YYYYMMDD}_{6-char-random}  (device-scoped, session-persistent)
 *   Stored in localStorage('seed_guest_id') — reused across all assessments in one session.
 *
 * Re-attempt blocking:
 *   assessmentResults/{testId}/guests/{guestId}  → if doc exists → blocked
 *   localStorage key `guest_done_{testId}_{guestId}` → fast client-side check
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '../router-compat';
import { db } from '../firebase-config';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

// ─── Guest ID (device-scoped, session-persistent) ─────────────────────────────
function getOrCreateGuestId(collegeCode) {
  const key = 'seed_guest_id';
  const stored = localStorage.getItem(key);
  if (stored && stored.startsWith(collegeCode + '_')) return stored;
  // Generate new one for this college
  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand  = Math.random().toString(36).toUpperCase().slice(2, 8);
  const newId = `${collegeCode}_${date}_${rand}`;
  localStorage.setItem(key, newId);
  return newId;
}

// ─── Flatten all colleges from the south_india_index.json structure ──────────
// JSON shape: collegesMap[state][city] = [{code, name, shortName}]
function flattenColleges(indexData) {
  const result = [];
  if (!indexData || !indexData.collegesMap) return result;
  for (const cityMap of Object.values(indexData.collegesMap)) {
    for (const [city, colleges] of Object.entries(cityMap)) {
      if (!Array.isArray(colleges)) continue;
      for (const c of colleges) {
        if (typeof c === 'object' && c.code) {
          result.push({ code: c.code, name: c.name, shortName: c.shortName ?? '', city });
        }
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Scan cohorts for a matching gate key ─────────────────────────────────────
// Returns { cohortId, cohortLabel, allowedModules } if found, or null if no match.
// Also handles the case where a cohort has NO gate key set (open access).
async function findCohortByGateKey(collegeCode, enteredKey) {
  try {
    const cohortsSnap = await getDocs(collection(db, 'tenants', collegeCode, 'cohorts'));
    if (cohortsSnap.empty) return null;

    const entered = enteredKey.trim().toUpperCase();

    // Look for exact match first
    for (const d of cohortsSnap.docs) {
      const data = d.data();
      const cohortKey = (data.gateKey ?? '').trim().toUpperCase();
      if (cohortKey && cohortKey === entered) {
        return {
          cohortId: d.id,
          cohortLabel: String(data.label || d.id),
          year: String(data.year ?? ''),
          allowedModules: Array.isArray(data.allowedModules) ? data.allowedModules : [],
        };
      }
    }
    return null; // no cohort matched
  } catch {
    return null;
  }
}

// ─── Check if the college has ANY cohort with a gate key set ──────────────────
async function collegeHasGateKeys(collegeCode) {
  try {
    const snap = await getDocs(collection(db, 'tenants', collegeCode, 'cohorts'));
    return snap.docs.some(d => (d.data().gateKey ?? '').trim().length > 0);
  } catch {
    return false; // fail open
  }
}

async function fetchGuestTests(collegeCode, allowedModules = [], guestYear = '') {
  const now = new Date();
  let tests = [];

  // 1. Primary: If cohort has allowedModules, try fetching via getAllowedTests
  if (Array.isArray(allowedModules) && allowedModules.length > 0) {
    try {
      const { getAllowedTests } = await import('../../lib/firestore/courses');
      const docs = await getAllowedTests(allowedModules);
      if (Array.isArray(docs) && docs.length > 0) {
        tests = docs.map(d => ({ assessmentId: d.id, ...d }));
      }
    } catch (e) {
      console.warn('[GuestPortal] getAllowedTests error:', e);
    }
  }

  // 2. Secondary: Read from tenantCourses/{collegeCode}/tests
  if (tests.length === 0 && collegeCode) {
    try {
      const col = collection(db, 'tenantCourses', collegeCode, 'tests');
      const snap = await getDocs(col);
      if (!snap.empty) {
        tests = snap.docs.map(d => ({ assessmentId: d.id, ...d.data() }));
      }
    } catch (e) {
      console.warn('[GuestPortal] tenantCourses read error:', e);
    }
  }

  // 3. Fallback: Read from legacy top-level assessments collection
  if (tests.length === 0) {
    try {
      const col = collection(db, 'assessments');
      const snap = await getDocs(col);
      if (!snap.empty) {
        tests = snap.docs.map(d => ({ assessmentId: d.id, ...d.data() }));
      }
    } catch (e) {
      console.warn('[GuestPortal] assessments fallback error:', e);
    }
  }

  // Extract bare testIds from allowedModules keys (courseId::seriesId::testId)
  const allowedTestIds = new Set(
    (allowedModules || []).map(key => {
      const parts = key.split('::');
      return parts[parts.length - 1]; // last segment is testId
    }).filter(Boolean)
  );
  const filterByModule = allowedTestIds.size > 0 && tests.length > allowedTestIds.size;
  const cleanGuestYear = String(guestYear ?? '').trim();

  return tests.filter(t => {
    // Scope to cohort's allowed tests (if cohort has allowedModules defined)
    if (filterByModule && !allowedTestIds.has(t.assessmentId) && !allowedTestIds.has(t.id)) return false;
    // Skip explicitly disabled guest tests
    if (t.guestEnabled === false) return false;
    // Schedule filter
    if (t.schedule?.start && new Date(t.schedule.start) > now) return false;
    if (t.schedule?.end   && new Date(t.schedule.end)   < now) return false;

    // Year-based filter: if targetYears is defined on test, filter by student's graduation year
    const targetYears = Array.isArray(t.years)
      ? t.years
      : Array.isArray(t.targetYears)
      ? t.targetYears
      : Array.isArray(t.targeting?.years)
      ? t.targeting.years
      : [];
    if (targetYears.length > 0 && cleanGuestYear) {
      if (!targetYears.includes(cleanGuestYear)) return false;
    }

    return true;
  });
}



// ─── Check if already attempted ──────────────────────────────────────────────
async function checkAlreadyAttempted(testId, guestId) {
  const lsKey = `guest_done_${testId}_${guestId}`;
  if (localStorage.getItem(lsKey)) return true;
  try {
    const snap = await getDoc(doc(db, `assessmentResults/${testId}/guests/${guestId}`));
    if (snap.exists()) {
      localStorage.setItem(lsKey, 'true');
      return true;
    }
  } catch { /* non-fatal */ }
  return false;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '1rem',
  },
  centered: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
  },
  card: {
    background: 'rgba(30,41,59,0.97)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
  },
  wideCard: {
    background: 'rgba(30,41,59,0.97)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '820px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
  },
  logo: {
    textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 800,
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em',
  },
  title:    { textAlign: 'center', color: '#f1f5f9', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' },
  subtitle: { textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '2rem' },
  label:    { display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:    { width: '100%', padding: '0.7rem 1rem', borderRadius: '0.75rem', border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(15,23,42,0.8)', color: '#f1f5f9', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem', transition: 'border-color 0.2s' },
  select:   { width: '100%', padding: '0.7rem 1rem', borderRadius: '0.75rem', border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(15,23,42,0.9)', color: '#f1f5f9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' },
  btn:      { width: '100%', padding: '0.85rem', borderRadius: '0.75rem', border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem', transition: 'opacity 0.2s', fontFamily: 'inherit' },
  btnSecondary: { width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid rgba(99,102,241,0.4)', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem', fontFamily: 'inherit' },
  error:   { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' },
  badge:   { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', borderRadius: '999px', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 600 },
  badgeGreen:  { background: 'rgba(16,185,129,0.15)', color: '#34d399', borderRadius: '999px', padding: '0.2rem 0.65rem', fontSize: '0.75rem', fontWeight: 600 },
  badgeYellow: { background: 'rgba(234,179,8,0.15)',  color: '#fbbf24', borderRadius: '999px', padding: '0.2rem 0.65rem', fontSize: '0.75rem', fontWeight: 600 },
  stepDot: (active, done) => ({
    width: active ? '2rem' : '0.6rem', height: '0.6rem', borderRadius: '999px',
    background: done ? '#10b981' : active ? '#6366f1' : 'rgba(99,102,241,0.25)',
    transition: 'all 0.3s ease',
  }),
  assessmentCard: {
    background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
    border: '1px solid rgba(99,102,241,0.3)', borderRadius: '1rem', padding: '1.25rem',
    marginBottom: '1rem', cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s',
  },
  assessmentTitle: { color: '#f1f5f9', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem' },
  assessmentMeta:  { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' },
  successCard: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' },
  blockedCard: { background: 'rgba(234,179,8,0.08)',  border: '1px solid rgba(234,179,8,0.3)',  borderRadius: '1rem', padding: '2rem', textAlign: 'center' },
};

const YEARS  = ['2027', '2028', '2029', '2030', '2031', '2032'];
const YEAR_L = {
  '2027': 'Graduating 2027',
  '2028': 'Graduating 2028',
  '2029': 'Graduating 2029',
  '2030': 'Graduating 2030',
  '2031': 'Graduating 2031',
  '2032': 'Graduating 2032',
};

// ─────────────────────────────────────────────────────────────────────────────

const GuestPortal = () => {
  const navigate = useNavigate();

  // Step management
  // 'college' | 'gate' | 'details' | 'dashboard' | 'assessment' | 'done'
  const [step, setStep]   = useState('college');
  const [error, setError] = useState('');

  // College selection
  const [indexData, setIndexData]       = useState(null);
  const [allColleges, setAllColleges]   = useState([]);
  const [collegeSearch, setSearch]      = useState('');
  const [suggestions, setSuggestions]   = useState([]);
  const [selectedCollege, setCollege]   = useState(null); // { code, name, shortName }

  // Department data
  const [deptData, setDeptData] = useState([]);

  // Personal details
  const [form, setForm] = useState({
    name: '', rollNo: '', rollNoConfirm: '',
    email: '', emailConfirm: '',
    phone: '', phoneConfirm: '',
    department: '', year: '',
  });

  // Guest assessments
  const [guestTests, setGuestTests]   = useState([]);
  const [loadingTests, setLoadingTests] = useState(false);

  // Selected test + passkey step
  const [selectedTest, setSelectedTest]   = useState(null);
  const [passkey, setPasskey]             = useState('');
  const [passkeyError, setPasskeyErr]     = useState('');
  const [alreadyAttempted, setAttempted]  = useState(false);
  const [checkingAttempt, setChecking]    = useState(false);
  const passkeyRef = useRef(null);

  // GateKey step — cohort-based
  const [matchedCohort, setMatchedCohort]     = useState(null); // { cohortId, cohortLabel, year, allowedModules }
  const [gateInput, setGateInput]             = useState('');
  const [gateError, setGateError]             = useState('');
  const [gateLoading, setGateLoading]         = useState(false);
  const gateInputRef = useRef(null);

  // ── Load reference data ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/south_india_index.json').then(r => r.json()).then(data => {
      setIndexData(data);
      setAllColleges(flattenColleges(data));
    }).catch(() => {});
    fetch('/departments.json').then(r => r.json()).then(setDeptData).catch(() => {});
  }, []);

  // ── College autocomplete ────────────────────────────────────────────────────
  useEffect(() => {
    if (!collegeSearch || collegeSearch.length < 2) { setSuggestions([]); return; }
    const q = collegeSearch.toLowerCase();
    setSuggestions(
      allColleges.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.shortName?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [collegeSearch, allColleges]);

  // ── Load guest tests scoped to matched cohort ──────────────────────────────
  const loadGuestTests = useCallback(async (college, cohort) => {
    setLoadingTests(true);
    setGuestTests([]);
    try {
      const allowedModules = cohort?.allowedModules || [];
      const cohortYear = cohort?.year || (selectedYear ?? '');
      const tests = await fetchGuestTests(college.code, allowedModules, cohortYear);
      setGuestTests(tests);
    } catch (e) {
      console.error('[GuestPortal] fetchGuestTests error:', e);
      setError('Could not load assessments for your college. Try again.');
    } finally {
      setLoadingTests(false);
    }
  }, [selectedYear]);


  // ── Check re-attempt when assessment is selected ────────────────────────────
  useEffect(() => {
    if (!selectedTest || !selectedCollege) return;
    const guestId = getOrCreateGuestId(selectedCollege.code);
    setChecking(true);
    setAttempted(false);
    checkAlreadyAttempted(selectedTest.assessmentId, guestId)
      .then(attempted => setAttempted(attempted))
      .finally(() => setChecking(false));
  }, [selectedTest, selectedCollege]);

  // ── STEP 1: College selection ───────────────────────────────────────────────────
  const handleCollegeSelect = (college) => {
    setCollege(college);
    setSearch(college.name);
    setSuggestions([]);
    setError('');
  };

  const handleCollegeContinue = async () => {
    if (!selectedCollege) { setError('Please select your college from the list.'); return; }
    setError('');
    setGateLoading(true);
    // Check if any cohort in this college has a gate key configured
    const hasKeys = await collegeHasGateKeys(selectedCollege.code);
    setGateLoading(false);
    if (hasKeys) {
      // Check session cache
      const cached = sessionStorage.getItem(`cohort_ok_${selectedCollege.code}`);
      if (cached) {
        try {
          const c = JSON.parse(cached);
          setMatchedCohort(c);
          setStep('details');
          return;
        } catch { /* ignore */ }
      }
      setGateInput('');
      setGateError('');
      setStep('gate');
      setTimeout(() => gateInputRef.current?.focus(), 100);
    } else {
      // No gate keys — open access, no cohort scoping
      setMatchedCohort(null);
      setStep('details');
    }
  };

  // ── GATE STEP: Scan cohorts for matching key ────────────────────────────────
  const handleGateSubmit = async () => {
    if (!gateInput.trim()) { setGateError('Enter your cohort gate key.'); return; }
    setGateLoading(true);
    const cohort = await findCohortByGateKey(selectedCollege.code, gateInput);
    setGateLoading(false);
    if (!cohort) {
      setGateError('Incorrect key. Please check with your placement coordinator.');
      setGateInput('');
      setTimeout(() => gateInputRef.current?.focus(), 50);
      return;
    }
    // Cache for this session
    sessionStorage.setItem(`cohort_ok_${selectedCollege.code}`, JSON.stringify(cohort));
    setMatchedCohort(cohort);
    setGateError('');
    setStep('details');
  };

  // ── STEP 2: Details ────────────────────────────────────────────────────────
  const handleDetailsSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim())              { setError('Please enter your full name.'); return; }
    if (!form.rollNo.trim())            { setError('Please enter your roll number.'); return; }
    if (form.rollNo.trim() !== form.rollNoConfirm.trim()) { setError('Roll numbers do not match. Please re-enter.'); return; }
    if (!form.email.trim())             { setError('Please enter your college email.'); return; }
    if (form.email.trim() !== form.emailConfirm.trim()) { setError('Email addresses do not match. Please re-enter.'); return; }
    if (!form.phone.trim())             { setError('Please enter your phone number.'); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) { setError('Enter a valid 10-digit Indian mobile number.'); return; }
    if (form.phone.trim() !== form.phoneConfirm.trim()) { setError('Phone numbers do not match. Please re-enter.'); return; }
    if (!form.department)               { setError('Please select your department.'); return; }
    if (!form.year)                     { setError('Please select your graduation year.'); return; }
    setError('');
    loadGuestTests(selectedCollege, matchedCohort);
    setStep('dashboard');
  };

  // ── STEP 3: Select assessment ──────────────────────────────────────────────
  const handleSelectTest = (test) => {
    setSelectedTest(test);
    setPasskey('');
    setPasskeyErr('');
    setAttempted(false);
    setStep('assessment');
  };

  // ── STEP 4: Validate passkey & launch ─────────────────────────────────────
  const launchAssessment = useCallback(() => {
    if (!selectedTest || !selectedCollege) return;
    const guestId = getOrCreateGuestId(selectedCollege.code);

    const guestSession = {
      isGuest:        true,
      guestId,
      name:           form.name.trim(),
      rollNo:         form.rollNo.trim(),
      college:        selectedCollege.name,
      collegeCode:    selectedCollege.code,
      cohortId:       matchedCohort?.cohortId ?? '',
      cohortLabel:    matchedCohort?.cohortLabel ?? '',
      department:     form.department,
      graduationYear: form.year,
      email:          form.email.trim(),
      phone:          form.phone.trim(),
      assessmentId:         selectedTest.assessmentId,
      launchedAt:     new Date().toISOString(),
    };
    localStorage.setItem('guest_session', JSON.stringify(guestSession));

    const type = selectedTest.type;
    if (type === 'mcq') {
      navigate(`/student/mcq/${selectedTest.assessmentId}`, { state: { guestSession, testDoc: selectedTest } });
    } else if (type === 'coding') {
      navigate(`/student/coding/${selectedTest.assessmentId}`, { state: { guestSession, testDoc: selectedTest } });
    } else if (type === 'sea' || type === 'spoken-english') {
      navigate(`/student/sea/${selectedTest.assessmentId}`, { state: { guestSession, testDoc: selectedTest } });
    } else if (type === 'msa' || type === 'multisection') {
      navigate(`/student/assessment/id/${selectedTest.assessmentId}`, { state: { guestSession, testDoc: selectedTest } });
    } else {
      setError(`Unsupported assessment type: ${type}`);
    }
  }, [selectedTest, selectedCollege, form, navigate]);

  const handleStartClick = () => {
    if (selectedTest?.passkey) {
      if (!passkey.trim()) { setPasskeyErr('Enter the access passkey.'); return; }
      if (passkey.trim() !== selectedTest.passkey) {
        setPasskeyErr('Incorrect passkey. Please try again.');
        setPasskey('');
        passkeyRef.current?.focus();
        return;
      }
    }
    launchAssessment();
  };

  // ── Step indicator ─────────────────────────────────────────────────────────
  const STEPS = ['college', 'gate', 'details', 'dashboard', 'assessment'];
  const stepIdx = STEPS.indexOf(step === 'gate' ? 'gate' : step);

  // ── Render ────────────────────────────────────────────────────────────────
  const isWideStep = step === 'dashboard';

  return (
    <div style={{ ...S.page, ...(isWideStep ? {} : S.centered) }}>
      <div style={{ ...(isWideStep ? { maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem' } : {}), display: isWideStep ? 'block' : 'contents' }}>
        <div style={isWideStep ? S.wideCard : S.card}>

          {/* Logo */}
          <div style={S.logo}>SEED · Guest Portal</div>

          {/* Step dots */}
          {step !== 'done' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {STEPS.map((s, i) => (
                <div key={s} style={S.stepDot(i === stepIdx, i < stepIdx)} />
              ))}
            </div>
          )}

          {/* ══ STEP 1: College ════════════════════════════════════════════════ */}
          {step === 'college' && (
            <>
              <div style={S.title}>Guest Assessment Portal</div>
              <div style={S.subtitle}>No account required · Search your college to begin</div>
              {error && <div style={S.error}> {error}</div>}

              <label style={S.label}>Your College</label>
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <input
                  id="guest-college-search"
                  style={{ ...S.input, marginBottom: 0 }}
                  value={collegeSearch}
                  onChange={e => {
                    setSearch(e.target.value);
                    if (selectedCollege && e.target.value !== selectedCollege.name) setCollege(null);
                  }}
                  placeholder="Search college name or short code…"
                  autoFocus
                />
                {suggestions.length > 0 && !selectedCollege && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#1e293b', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '0.75rem', marginTop: '0.25rem', maxHeight: '240px', overflowY: 'auto' }}>
                    {suggestions.map(c => (
                      <div
                        key={c.code}
                        onClick={() => handleCollegeSelect(c)}
                        style={{ padding: '0.65rem 1rem', color: '#f1f5f9', fontSize: '0.87rem', cursor: 'pointer', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <span>{c.name}</span>
                        <span style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, marginLeft: '0.5rem', flexShrink: 0 }}>{c.shortName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCollege && (
                <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}></span>
                  <div>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem' }}>{selectedCollege.name}</div>
                    <div style={{ color: '#6366f1', fontSize: '0.78rem' }}>{selectedCollege.code} · {selectedCollege.city}</div>
                  </div>
                </div>
              )}

              {gateLoading
                ? <div style={{ textAlign: 'center', color: '#6366f1', fontSize: '0.85rem', padding: '0.5rem' }}> Checking access…</div>
                : <button id="guest-college-btn" style={S.btn} onClick={handleCollegeContinue}>Continue →</button>
              }
              <button style={S.btnSecondary} onClick={() => navigate('/login')}>
                ← Have an account? Login
              </button>
            </>
          )}

          {/* ══ GATE STEP: Cohort GateKey ═══════════════════════════════════ */}
          {step === 'gate' && (
            <>
              <div style={S.title}>Cohort Access</div>
              <div style={S.subtitle}>{selectedCollege?.name}</div>

              <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}></div>
                <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>{selectedCollege?.name}</div>
                <div style={{ color: '#64748b', fontSize: '0.82rem' }}>
                  Enter your batch gate key to access your cohort's assessments.
                  Each batch (year) has a unique key — contact your coordinator.
                </div>
              </div>

              <label style={S.label}>Batch Gate Key</label>
              <input
                id="guest-gate-input"
                ref={gateInputRef}
                style={{ ...S.input, letterSpacing: '0.15em', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700 }}
                type="password"
                value={gateInput}
                onChange={e => { setGateInput(e.target.value); setGateError(''); }}
                onKeyDown={e => e.key === 'Enter' && !gateLoading && handleGateSubmit()}
                placeholder="Enter cohort gate key"
                autoComplete="off"
                disabled={gateLoading}
              />
              {gateError && <div style={{ ...S.error, marginTop: '-0.5rem' }}> {gateError}</div>}

              {gateLoading
                ? <div style={{ textAlign: 'center', color: '#6366f1', fontSize: '0.85rem', padding: '0.5rem' }}> Verifying…</div>
                : <button id="guest-gate-btn" style={S.btn} onClick={handleGateSubmit}>Verify & Continue →</button>
              }
              <button style={S.btnSecondary} onClick={() => { setStep('college'); setGateInput(''); setGateError(''); }}>← Change College</button>
            </>
          )}

          {/* ══ STEP 2: Details ════════════════════════════════════════════════ */}
          {step === 'details' && (
            <>
              <div style={S.title}>Your Details</div>
              <div style={S.subtitle}>{selectedCollege?.shortName || selectedCollege?.name} · All fields are required</div>
              {error && <div style={S.error}> {error}</div>}
              <form onSubmit={handleDetailsSubmit}>

                <label style={S.label}>Full Name *</label>
                <input id="guest-name" style={S.input} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Your full name" autoFocus />

                <label style={S.label}>Roll Number *</label>
                <input id="guest-roll" style={S.input} value={form.rollNo}
                  onChange={e => setForm(p => ({ ...p, rollNo: e.target.value }))}
                  placeholder="e.g. 22CS001" autoComplete="off" />

                <label style={S.label}>Confirm Roll Number *</label>
                <input id="guest-roll-confirm"
                  style={{ ...S.input, borderColor: form.rollNoConfirm && form.rollNo !== form.rollNoConfirm ? 'rgba(239,68,68,0.8)' : undefined }}
                  value={form.rollNoConfirm}
                  onChange={e => setForm(p => ({ ...p, rollNoConfirm: e.target.value }))}
                  placeholder="Re-enter roll number" autoComplete="off" />

                <label style={S.label}>College Email *</label>
                <input id="guest-email" style={S.input} type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@college.edu" autoComplete="off" />

                <label style={S.label}>Confirm Email *</label>
                <input id="guest-email-confirm"
                  style={{ ...S.input, borderColor: form.emailConfirm && form.email !== form.emailConfirm ? 'rgba(239,68,68,0.8)' : undefined }}
                  type="email" value={form.emailConfirm}
                  onChange={e => setForm(p => ({ ...p, emailConfirm: e.target.value }))}
                  placeholder="Re-enter email" autoComplete="off" />

                <label style={S.label}>Phone Number *</label>
                <input id="guest-phone" style={S.input} type="tel" value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10-digit mobile number" autoComplete="off" maxLength={10} />

                <label style={S.label}>Confirm Phone Number *</label>
                <input id="guest-phone-confirm"
                  style={{ ...S.input, borderColor: form.phoneConfirm && form.phone !== form.phoneConfirm ? 'rgba(239,68,68,0.8)' : undefined }}
                  type="tel" value={form.phoneConfirm}
                  onChange={e => setForm(p => ({ ...p, phoneConfirm: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="Re-enter phone number" autoComplete="off" maxLength={10} />

                <label style={S.label}>Department *</label>
                <select id="guest-dept" style={S.select} value={form.department}
                  onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                  <option value="">Select department…</option>
                  {deptData.map(d => <option key={d.code} value={d.code}>{d.name} ({d.shortName})</option>)}
                </select>

                <label style={S.label}>Graduation Year *</label>
                <select id="guest-year" style={S.select} value={form.year}
                  onChange={e => setForm(p => ({ ...p, year: e.target.value }))}>
                  <option value="">Select graduation year…</option>
                  {YEARS.map(y => <option key={y} value={y}>{YEAR_L[y]}</option>)}
                </select>

                <button id="guest-details-btn" style={S.btn} type="submit">View Assessments →</button>
                <button style={S.btnSecondary} type="button" onClick={() => { setStep('college'); setError(''); }}>← Change College</button>
              </form>
            </>
          )}

          {/* ══ STEP 3: Dashboard — assessment cards ════════════════════════════ */}
          {step === 'dashboard' && (
            <>
              <div style={S.title}>Available Assessments</div>
              <div style={S.subtitle}>
                {selectedCollege?.name} · Logged in as <strong style={{ color: '#e2e8f0' }}>{form.name}</strong> ({form.rollNo})
              </div>

              {loadingTests && (
                <div style={{ textAlign: 'center', color: '#6366f1', padding: '2rem', fontSize: '0.9rem' }}>
                   Loading assessments for your college…
                </div>
              )}

              {!loadingTests && guestTests.length === 0 && (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem', background: 'rgba(99,102,241,0.05)', borderRadius: '1rem', border: '1px dashed rgba(99,102,241,0.2)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}></div>
                  <div style={{ fontWeight: 600, color: '#94a3b8' }}>No active assessments right now</div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Check back later or contact your placement coordinator.</div>
                </div>
              )}

              {!loadingTests && guestTests.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                  {guestTests.map(test => (
                    <div
                      key={test.assessmentId}
                      style={S.assessmentCard}
                      onClick={() => handleSelectTest(test)}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.7)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                        <span style={S.badge}>{(test.type || 'MCQ').toUpperCase()}</span>
                        <span style={S.badgeGreen}> Guest</span>
                      </div>
                      <div style={S.assessmentTitle}>{test.name}</div>
                      <div style={S.assessmentMeta}>
                        <span> {test.duration} min</span>
                        {test.maxScore > 0 && <span> {test.maxScore} marks</span>}
                        {test.passkey && <span style={S.badge}> Passkey</span>}
                        {test.proctored && <span style={S.badgeYellow}> Proctored</span>}
                      </div>
                      <div style={{ color: '#6366f1', fontSize: '0.8rem', fontWeight: 600 }}>Click to start →</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1.5rem' }}>
                <button style={S.btnSecondary} onClick={() => { setStep('details'); setError(''); }}>← Edit Details</button>
              </div>
            </>
          )}

          {/* ══ STEP 4: Assessment start page ══════════════════════════════════ */}
          {step === 'assessment' && selectedTest && (
            <>
              <div style={S.title}>Ready to Begin</div>
              <div style={S.subtitle}>{selectedTest.name}</div>

              {/* Already attempted */}
              {alreadyAttempted && (
                <div style={S.blockedCard}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}></div>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Already Submitted</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                    Your response for this assessment has already been recorded for Roll No <strong style={{ color: '#f1f5f9' }}>{form.rollNo}</strong>. Re-attempts are not allowed.
                  </div>
                  <button style={S.btnSecondary} onClick={() => setStep('dashboard')}>← Back to Assessments</button>
                </div>
              )}

              {/* Normal start */}
              {!alreadyAttempted && (
                <>
                  {/* Assessment info card */}
                  <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={S.badge}>{(selectedTest.type || 'MCQ').toUpperCase()}</span>
                      <span style={S.badgeGreen}> Guest Access</span>
                    </div>
                    <div style={S.assessmentTitle}>{selectedTest.name}</div>
                    <div style={S.assessmentMeta}>
                      <span> {selectedTest.duration} min</span>
                      {selectedTest.maxScore > 0 && <span> {selectedTest.maxScore} marks</span>}
                      {selectedTest.proctored && <span style={S.badgeYellow}> Proctored</span>}
                    </div>
                    {/* Student info */}
                    <div style={{ borderTop: '1px solid rgba(99,102,241,0.15)', paddingTop: '0.75rem', marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span> <strong style={{ color: '#e2e8f0' }}>{form.name}</strong></span>
                      <span> <strong style={{ color: '#e2e8f0' }}>{form.rollNo}</strong></span>
                      <span> {selectedCollege?.shortName || selectedCollege?.name}</span>
                      <span> {YEAR_L[form.year] || form.year}</span>
                    </div>
                  </div>

                  {/* Passkey */}
                  {selectedTest.passkey && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ ...S.label, color: '#a5b4fc' }}> Access Passkey</label>
                      <input
                        id="guest-passkey-input"
                        ref={passkeyRef}
                        style={{ ...S.input, letterSpacing: '0.08em', marginBottom: '0.25rem' }}
                        type="password"
                        value={passkey}
                        onChange={e => { setPasskey(e.target.value); setPasskeyErr(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleStartClick()}
                        placeholder="Enter access passkey"
                        autoFocus
                      />
                      {passkeyError && <div style={{ color: '#fca5a5', fontSize: '0.82rem', marginBottom: '0.5rem' }}> {passkeyError}</div>}
                    </div>
                  )}

                  {/* Warning */}
                  <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fde68a', fontSize: '0.82rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                     Once started, the timer begins immediately. You can only submit once — re-attempts are not allowed.
                    {selectedTest.proctored && ' Camera access is required.'}
                  </div>

                  {checkingAttempt && (
                    <div style={{ textAlign: 'center', color: '#6366f1', fontSize: '0.85rem', marginBottom: '1rem' }}> Checking eligibility…</div>
                  )}

                  {!checkingAttempt && (
                    <>
                      <button id="guest-start-btn" style={S.btn} onClick={handleStartClick}> Start Assessment</button>
                      <button style={S.btnSecondary} onClick={() => { setStep('dashboard'); setPasskey(''); setPasskeyErr(''); }}>← Back to Assessments</button>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ══ DONE ════════════════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div style={S.successCard}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
              <div style={{ color: '#34d399', fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Assessment Submitted!</div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.5' }}>
                Your responses have been recorded. Thank you for participating.
              </div>
              <button style={S.btn} onClick={() => setStep('dashboard')}>← View Other Assessments</button>
              <button style={{ ...S.btnSecondary, marginTop: '0.5rem' }} onClick={() => navigate('/login')}>Back to Login</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default GuestPortal;
