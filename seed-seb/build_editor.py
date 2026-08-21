import base64
import os

logo_path = r'c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\frontend\public\SEED_Logo.png'
logo_b64 = ''
if os.path.exists(logo_path):
    with open(logo_path, 'rb') as f:
        logo_b64 = base64.b64encode(f.read()).decode('utf-8')

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SEED IT SEB Platform - Interactive Proposal Editor</title>
<style>
  @page {{
    size: A4;
    margin: 12mm 15mm 12mm 15mm;
  }}
  body {{
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1E293B;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    font-size: 12.5px;
    background-color: #F1F5F9;
  }}

  /* TOOLBAR (Hidden in Print) */
  .editor-toolbar {{
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 55px;
    background: #0F172A;
    color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
  }}
  .toolbar-title {{
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .toolbar-actions {{
    display: flex;
    gap: 12px;
  }}
  .btn {{
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }}
  .btn-primary {{
    background: #2563EB;
    color: white;
  }}
  .btn-primary:hover {{
    background: #1D4ED8;
  }}
  .btn-success {{
    background: #16A34A;
    color: white;
  }}
  .btn-success:hover {{
    background: #15803D;
  }}

  /* PAGE CONTAINER */
  .page-wrapper {{
    width: 210mm;
    min-height: 297mm;
    margin: 75px auto 40px auto;
    background: white;
    padding: 15mm 18mm;
    box-sizing: border-box;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    border-radius: 4px;
  }}

  /* CONTENT EDITABLE HIGHLIGHT ON HOVER */
  [contenteditable="true"]:hover {{
    outline: 1.5px dashed #3B82F6 !important;
    background-color: rgba(59, 130, 246, 0.03);
    cursor: text;
  }}
  [contenteditable="true"]:focus {{
    outline: 2px solid #2563EB !important;
    background-color: rgba(59, 130, 246, 0.05);
    border-radius: 2px;
  }}

  /* DOCUMENT STYLES */
  .header-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    border-bottom: 3px solid #0F172A;
    padding-bottom: 8px;
  }}
  .logo {{
    max-height: 60px;
  }}
  .title-block {{
    text-align: right;
  }}
  .title-block h1 {{
    margin: 0;
    color: #0F172A;
    font-size: 20px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .title-block p {{
    margin: 3px 0 0 0;
    color: #64748B;
    font-size: 11.5px;
    font-weight: 600;
  }}
  .meta-box {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
  }}
  .meta-box td {{
    padding: 3px 6px;
    font-size: 11.5px;
  }}
  .meta-label {{
    font-weight: bold;
    color: #475569;
    width: 110px;
  }}
  h2 {{
    color: #0F172A;
    font-size: 14px;
    border-left: 4px solid #2563EB;
    padding-left: 8px;
    margin-top: 20px;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .intro-text {{
    background: #EFF6FF;
    border-left: 4px solid #3B82F6;
    padding: 10px 14px;
    border-radius: 4px;
    font-size: 12px;
    color: #1E3A8A;
    margin-bottom: 14px;
  }}
  table.data-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }}
  table.data-table th {{
    background: #0F172A;
    color: #FFFFFF;
    text-align: center;
    padding: 7px 8px;
    font-size: 11.5px;
    font-weight: 600;
  }}
  table.data-table td {{
    border: 1px solid #CBD5E1;
    padding: 6px 8px;
    font-size: 11.5px;
    text-align: center;
  }}
  table.data-table td.left {{
    text-align: left;
    font-weight: 500;
  }}
  table.data-table tr:nth-child(even) {{
    background: #F8FAFC;
  }}
  .badge-recommended {{
    background: #FEF3C7;
    color: #92400E;
    font-weight: bold;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 9.5px;
  }}
  .check {{
    color: #16A34A;
    font-weight: bold;
  }}
  .cross {{
    color: #DC2626;
  }}
  .addon {{
    color: #D97706;
    font-size: 10.5px;
    font-weight: 600;
  }}
  .bullet-list {{
    margin: 4px 0 12px 18px;
    padding: 0;
  }}
  .bullet-list li {{
    margin-bottom: 4px;
    font-size: 11.5px;
  }}
  .terms-box {{
    background: #FFFBEB;
    border: 1px solid #FDE68A;
    border-radius: 6px;
    padding: 10px 14px;
    margin-top: 14px;
  }}
  .terms-box h3 {{
    margin: 0 0 6px 0;
    color: #92400E;
    font-size: 12.5px;
  }}
  .terms-box ul {{
    margin: 0;
    padding-left: 16px;
  }}
  .terms-box li {{
    color: #78350F;
    font-size: 11px;
    margin-bottom: 3px;
  }}
  .signature-table {{
    width: 100%;
    margin-top: 25px;
    border-collapse: collapse;
  }}
  .signature-table td {{
    vertical-align: top;
    width: 50%;
  }}
  .signature-box {{
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 10px 12px;
    background: #FFFFFF;
  }}

  /* PRINT MEDIA OVERRIDES */
  @media print {{
    .editor-toolbar {{
      display: none !important;
    }}
    body {{
      background: white !important;
    }}
    .page-wrapper {{
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      width: 100% !important;
      border-radius: 0 !important;
    }}
    [contenteditable="true"]:hover, [contenteditable="true"]:focus {{
      outline: none !important;
      background: transparent !important;
    }}
    .page-break {{
      page-break-before: always !important;
    }}
  }}
</style>
</head>
<body>

  <!-- EDITOR CONTROL TOOLBAR -->
  <div class="editor-toolbar">
    <div class="toolbar-title">
      <span>📝 Interactive Proposal Editor</span>
      <span style="font-size: 11px; opacity: 0.7; font-weight: normal;">(Click any text below to edit directly)</span>
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-success" onclick="window.print()">
        🖨️ Save as PDF / Print
      </button>
      <button class="btn btn-primary" onclick="exportHTML()">
        💾 Export Editable HTML
      </button>
    </div>
  </div>

  <!-- EDITABLE PROPOSAL DOCUMENT -->
  <div class="page-wrapper">

    <!-- HEADER -->
    <table class="header-table">
      <tr>
        <td>
          <img class="logo" src="data:image/png;base64,{logo_b64}" alt="SEED IT Logo" />
        </td>
        <td class="title-block">
          <h1 contenteditable="true">Institutional Quotation</h1>
          <p contenteditable="true">SEED IT SEB Platform & Assessment Ecosystem</p>
        </td>
      </tr>
    </table>

    <!-- META INFO -->
    <div class="meta-box">
      <table style="width: 100%;">
        <tr>
          <td class="meta-label">Ref Number:</td>
          <td contenteditable="true">SEED/QUO/2026/INST-005</td>
          <td class="meta-label">Date:</td>
          <td contenteditable="true">July 22, 2026</td>
        </tr>
        <tr>
          <td class="meta-label">Target Entity:</td>
          <td contenteditable="true">The Training & Placement Officer / Head of Institution</td>
          <td class="meta-label">Valid Until:</td>
          <td contenteditable="true">August 31, 2026</td>
        </tr>
        <tr>
          <td class="meta-label">Platform:</td>
          <td contenteditable="true"><strong>SEED IT SEB Platform</strong> (Safe Exam Browser Edition)</td>
          <td class="meta-label">Prepared By:</td>
          <td contenteditable="true">SEED-IT EDU Services, Coimbatore</td>
        </tr>
      </table>
    </div>

    <div class="intro-text" contenteditable="true">
      <strong>Executive Overview:</strong> SEED IT SEB Platform delivers an end-to-end AI-powered employability & placement ecosystem combining secure Safe Exam Browser (SEB) desktop environment, multi-language IDE, automated proctoring, and comprehensive student skill diagnostics for engineering and degree colleges.
    </div>

    <!-- SECTION 1: ANNUAL SUBSCRIPTION PRICING -->
    <h2 contenteditable="true">1. Annual Subscription Pricing (Per Student / Year)</h2>
    <p style="font-size: 11px; color: #475569; margin-top: -4px;" contenteditable="true">Special Academic Partnership Offer (Applicable for First-Year Partner Institutions)</p>
    <table class="data-table">
      <thead>
        <tr>
          <th>Student Strength Tier</th>
          <th>Regular Plan</th>
          <th>Premium Plan <span class="badge-recommended">RECOMMENDED</span></th>
          <th>Exclusive Pro Plan</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="left" contenteditable="true">350 – 500 Students</td>
          <td contenteditable="true"><strong>₹499</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹849</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹999</strong> / student / yr</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">501 – 1,000 Students</td>
          <td contenteditable="true"><strong>₹449</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹799</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹949</strong> / student / yr</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">1,001 – 1,500 Students</td>
          <td contenteditable="true"><strong>₹399</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹699</strong> / student / yr</td>
          <td contenteditable="true"><strong>₹849</strong> / student / yr</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">1,500+ Students</td>
          <td contenteditable="true"><strong>Custom Quote</strong></td>
          <td contenteditable="true"><strong>Custom Quote</strong></td>
          <td contenteditable="true"><strong>Custom Quote</strong></td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 2: DELIVERABLES COMPARISON -->
    <h2 contenteditable="true">2. Deliverables & Feature Comparison Matrix</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th style="text-align: left;">Feature / Deliverable</th>
          <th>Regular</th>
          <th>Premium</th>
          <th>Exclusive Pro</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="left" contenteditable="true">AI Coding Platform</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Multi-Language Compiler (C, C++, Java, Py, JS)</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Coding Question Bank</td>
          <td contenteditable="true">Basic</td>
          <td contenteditable="true">Full (3,000+ Qs)</td>
          <td contenteditable="true">Full (3,000+ Qs)</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Aptitude Question Bank</td>
          <td contenteditable="true">Basic</td>
          <td contenteditable="true">Full</td>
          <td contenteditable="true">Full</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Company-Wise Question Bank</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">AI Generated Coding Questions</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Interactive Structured Courses</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Weekly Coding Contests & Leaderboards</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Placement Readiness Score</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Company-Specific Mock Tests</td>
          <td class="cross" contenteditable="true">❌</td>
          <td contenteditable="true">Limited</td>
          <td contenteditable="true"><strong>Unlimited</strong></td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Spoken English Assessment (CEFR)</td>
          <td class="addon" contenteditable="true">Add-on</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Psychometric Assessment</td>
          <td class="addon" contenteditable="true">Add-on</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">AI Interview Practice</td>
          <td class="cross" contenteditable="true">❌</td>
          <td contenteditable="true">Limited</td>
          <td contenteditable="true"><strong>Unlimited</strong></td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">AI Video & Audio Proctoring</td>
          <td contenteditable="true">Basic</td>
          <td contenteditable="true">Advanced</td>
          <td contenteditable="true">Enterprise</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">CEFR English Report (A1 to C2)</td>
          <td class="cross" contenteditable="true">❌</td>
          <td class="check" contenteditable="true">✓</td>
          <td class="check" contenteditable="true">✓</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Student Performance Analytics</td>
          <td contenteditable="true">Basic</td>
          <td contenteditable="true">Advanced</td>
          <td contenteditable="true">Enterprise</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">TPO Management Dashboard</td>
          <td contenteditable="true">Basic</td>
          <td contenteditable="true">Advanced</td>
          <td contenteditable="true">Enterprise</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Monthly Assessments Included</td>
          <td contenteditable="true">Pay per Use</td>
          <td contenteditable="true"><strong>25 / month</strong></td>
          <td contenteditable="true"><strong>40 / month</strong></td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Email & Technical Support</td>
          <td contenteditable="true">Standard</td>
          <td contenteditable="true">Priority</td>
          <td contenteditable="true">Dedicated Manager</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Onboarding & Staff Support</td>
          <td contenteditable="true">Standard</td>
          <td contenteditable="true">Standard</td>
          <td contenteditable="true">Dedicated Staff</td>
        </tr>
      </tbody>
    </table>

    <!-- PAGE BREAK FOR CLEAN PRINT LAYOUT -->
    <div class="page-break"></div>

    <!-- HEADER PAGE 2 -->
    <table class="header-table" style="margin-top: 20px;">
      <tr>
        <td>
          <img class="logo" src="data:image/png;base64,{logo_b64}" alt="SEED IT Logo" />
        </td>
        <td class="title-block">
          <h1 contenteditable="true">Institutional Quotation (Contd.)</h1>
          <p contenteditable="true">SEED IT SEB Platform Assessment & Services</p>
        </td>
      </tr>
    </table>

    <!-- SECTION 3: ASSESSMENT USAGE LIMITS -->
    <h2 contenteditable="true">3. Assessment Usage Limits Clarification</h2>
    <ul class="bullet-list">
      <li contenteditable="true"><strong>Regular Plan:</strong> Pay-per-use assessment model for custom institutional tests.</li>
      <li contenteditable="true"><strong>Premium Plan:</strong> Includes <strong>up to 25 official assessments per month</strong>, plus <strong>unlimited</strong> practice questions, <strong>unlimited</strong> coding practice, and <strong>unlimited</strong> weekly contests.</li>
      <li contenteditable="true"><strong>Exclusive Pro Plan:</strong> Includes <strong>up to 40 official assessments per month</strong>, plus <strong>unlimited</strong> practice, <strong>dedicated</strong> company-specific mock placement tests, and <strong>unlimited</strong> AI interview practice sessions.</li>
    </ul>

    <!-- SECTION 4: MODULAR ASSESSMENT-ONLY PRICING -->
    <h2 contenteditable="true">4. Modular "Assessment-Only" Pricing (Pay-As-You-Go)</h2>
    <p style="font-size: 11px; color: #475569; margin-top: -4px;" contenteditable="true">For institutions seeking standalone testing infrastructure without annual course subscriptions:</p>
    <table class="data-table">
      <thead>
        <tr>
          <th style="text-align: left;">Assessment Component / Service</th>
          <th>Investment Rate</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="left" contenteditable="true">Platform Account Access (Annual)</td>
          <td contenteditable="true"><strong>₹150</strong> / student / year</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">MCQ Assessment</td>
          <td contenteditable="true"><strong>₹25</strong> / student / test</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Coding Assessment</td>
          <td contenteditable="true"><strong>₹35</strong> / student / test</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">AI Proctored Full Length Assessment</td>
          <td contenteditable="true"><strong>₹50</strong> / student / test</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Spoken English Assessment (CEFR)</td>
          <td contenteditable="true"><strong>₹60</strong> / student / test</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">Psychometric Assessment</td>
          <td contenteditable="true"><strong>₹75</strong> / student / test</td>
        </tr>
        <tr>
          <td class="left" contenteditable="true">AI Interview Assessment</td>
          <td contenteditable="true"><strong>₹100</strong> / student / test</td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 5: TERMS AND CONDITIONS -->
    <div class="terms-box">
      <h3 contenteditable="true">Commercial Terms & Regulatory Conditions</h3>
      <ul>
        <li contenteditable="true"><strong>Taxation:</strong> Applicable <strong>GST @ 18% extra</strong> on all subscription packages and pay-per-use assessment rates.</li>
        <li contenteditable="true"><strong>Payment Terms:</strong> 50% advance upon order confirmation & agreement signing; balance 50% upon student account batch provisioning.</li>
        <li contenteditable="true"><strong>Proposal Validity:</strong> This quotation is valid for 30 days from the date of issue (until August 31, 2026).</li>
        <li contenteditable="true"><strong>Security & Environment:</strong> Assessments execute inside the <strong>SEED IT SEB Platform</strong> (Safe Exam Browser desktop environment) guaranteeing strict anti-cheat compliance.</li>
        <li contenteditable="true"><strong>Onboarding & Support:</strong> Institutional portal configuration, roster integration, and TPO staff training completed within 48 hours.</li>
      </ul>
    </div>

    <!-- SECTION 6: SIGNATURE & CONTACT -->
    <h2 contenteditable="true">5. Authorization & Contact Details</h2>
    <table class="signature-table">
      <tr>
        <td style="padding-right: 10px;">
          <div class="signature-box">
            <p style="margin: 0 0 6px 0; font-size: 10.5px; text-transform: uppercase; color: #64748B;">For Provider:</p>
            <p style="margin: 0; font-weight: bold; font-size: 13.5px; color: #0F172A;" contenteditable="true">Ashok Selva Kumar E</p>
            <p style="margin: 2px 0; color: #334155; font-weight: 600;" contenteditable="true">Managing Director</p>
            <p style="margin: 0; color: #475569;" contenteditable="true">SEED-IT EDU Services, Coimbatore.</p>
            <p style="margin: 5px 0 0 0; color: #2563EB; font-weight: bold;" contenteditable="true">Phone: +91 9442730135</p>
            <div style="margin-top: 22px; border-top: 1px dashed #94A3B8; padding-top: 4px; font-size: 9.5px; color: #94A3B8;">
              Authorized Signature & Seal
            </div>
          </div>
        </td>
        <td style="padding-left: 10px;">
          <div class="signature-box">
            <p style="margin: 0 0 6px 0; font-size: 10.5px; text-transform: uppercase; color: #64748B;">For Institution Acceptance:</p>
            <p style="margin: 0; font-weight: bold; font-size: 13.5px; color: #0F172A;" contenteditable="true">[Name & Designation]</p>
            <p style="margin: 2px 0; color: #334155;" contenteditable="true">Training & Placement Officer / Principal</p>
            <p style="margin: 0; color: #475569;" contenteditable="true">[College / Institution Name]</p>
            <p style="margin: 5px 0 0 0; color: #475569;" contenteditable="true">Date: ____ / ____ / 2026</p>
            <div style="margin-top: 22px; border-top: 1px dashed #94A3B8; padding-top: 4px; font-size: 9.5px; color: #94A3B8;">
              Accepted Signature & Seal
            </div>
          </div>
        </td>
      </tr>
    </table>

  </div>

  <script>
    function exportHTML() {{
      const content = document.documentElement.outerHTML;
      const blob = new Blob([content], {{ type: 'text/html' }});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'SEED_IT_SEB_Platform_Proposal_Customized.html';
      a.click();
    }}
  </script>

</body>
</html>
"""

output_path = r'c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\SEED_IT_SEB_Platform_Proposal_Editor.html'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print('SUCCESS: Created interactive editable HTML proposal at:', output_path)
