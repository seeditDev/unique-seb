import base64
import os
import subprocess

# Read logo and encode as base64
logo_path = r'c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\frontend\public\SEED_Logo.png'

logo_b64 = ""
if os.path.exists(logo_path):
    with open(logo_path, "rb") as image_file:
        logo_b64 = base64.b64encode(image_file.read()).decode('utf-8')

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SEED IT SEB Platform - Commercial Proposal & Institutional Quotation</title>
<style>
  @page {{
    size: A4;
    margin: 15mm 15mm 15mm 15mm;
  }}
  body {{
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1E293B;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }}
  .header-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    border-bottom: 3px solid #0F172A;
    padding-bottom: 10px;
  }}
  .header-table td {{
    vertical-align: middle;
  }}
  .logo {{
    max-height: 65px;
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
    font-size: 12px;
    font-weight: 600;
  }}
  .meta-box {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }}
  .meta-box td {{
    padding: 4px 8px;
    font-size: 12px;
  }}
  .meta-label {{
    font-weight: bold;
    color: #475569;
    width: 120px;
  }}
  h2 {{
    color: #0F172A;
    font-size: 15px;
    border-left: 4px solid #2563EB;
    padding-left: 10px;
    margin-top: 22px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .intro-text {{
    background: #EFF6FF;
    border-left: 4px solid #3B82F6;
    padding: 10px 14px;
    border-radius: 4px;
    font-size: 12.5px;
    color: #1E3A8A;
    margin-bottom: 15px;
  }}
  table.data-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
  }}
  table.data-table th {{
    background: #0F172A;
    color: #FFFFFF;
    text-align: center;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
  }}
  table.data-table td {{
    border: 1px solid #E2E8F0;
    padding: 7px 10px;
    font-size: 12px;
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
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
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
    font-size: 11px;
    font-weight: 600;
  }}
  .bullet-list {{
    margin: 6px 0 15px 18px;
    padding: 0;
  }}
  .bullet-list li {{
    margin-bottom: 5px;
    font-size: 12px;
  }}
  .terms-box {{
    background: #FFFBEB;
    border: 1px solid #FDE68A;
    border-radius: 6px;
    padding: 12px 16px;
    margin-top: 15px;
  }}
  .terms-box h3 {{
    margin: 0 0 8px 0;
    color: #92400E;
    font-size: 13px;
  }}
  .terms-box ul {{
    margin: 0;
    padding-left: 18px;
  }}
  .terms-box li {{
    color: #78350F;
    font-size: 11.5px;
    margin-bottom: 4px;
  }}
  .signature-table {{
    width: 100%;
    margin-top: 30px;
    border-collapse: collapse;
  }}
  .signature-table td {{
    vertical-align: top;
    width: 50%;
  }}
  .signature-box {{
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 12px;
    background: #FFFFFF;
  }}
  .page-break {{
    page-break-before: always;
  }}
</style>
</head>
<body>

  <!-- HEADER -->
  <table class="header-table">
    <tr>
      <td>
        <img class="logo" src="data:image/png;base64,{logo_b64}" alt="SEED IT Logo" />
      </td>
      <td class="title-block">
        <h1>Institutional Quotation</h1>
        <p>SEED IT SEB Platform & Assessment Ecosystem</p>
      </td>
    </tr>
  </table>

  <!-- META INFO -->
  <div class="meta-box">
    <table style="width: 100%;">
      <tr>
        <td class="meta-label">Ref Number:</td>
        <td>SEED/QUO/2026/INST-005</td>
        <td class="meta-label">Date:</td>
        <td>July 22, 2026</td>
      </tr>
      <tr>
        <td class="meta-label">Target Entity:</td>
        <td>The Training & Placement Officer / Head of Institution</td>
        <td class="meta-label">Valid Until:</td>
        <td>August 31, 2026</td>
      </tr>
      <tr>
        <td class="meta-label">Platform:</td>
        <td><strong>SEED IT SEB Platform</strong> (Safe Exam Browser Edition)</td>
        <td class="meta-label">Prepared By:</td>
        <td>SEED-IT EDU Services, Coimbatore</td>
      </tr>
    </table>
  </div>

  <div class="intro-text">
    <strong>Executive Overview:</strong> SEED IT SEB Platform delivers an end-to-end AI-powered employability & placement ecosystem combining secure Safe Exam Browser (SEB) desktop environment, multi-language IDE, automated proctoring, and comprehensive student skill diagnostics for engineering and degree colleges.
  </div>

  <!-- SECTION 1: ANNUAL SUBSCRIPTION PRICING -->
  <h2>1. Annual Subscription Pricing (Per Student / Year)</h2>
  <p style="font-size: 11.5px; color: #475569; margin-top: -5px;">Special Academic Partnership Offer (Applicable for First-Year Partner Institutions)</p>
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
        <td class="left">350 – 500 Students</td>
        <td><strong>₹499</strong> / student / yr</td>
        <td><strong>₹849</strong> / student / yr</td>
        <td><strong>₹999</strong> / student / yr</td>
      </tr>
      <tr>
        <td class="left">501 – 1,000 Students</td>
        <td><strong>₹449</strong> / student / yr</td>
        <td><strong>₹799</strong> / student / yr</td>
        <td><strong>₹949</strong> / student / yr</td>
      </tr>
      <tr>
        <td class="left">1,001 – 1,500 Students</td>
        <td><strong>₹399</strong> / student / yr</td>
        <td><strong>₹699</strong> / student / yr</td>
        <td><strong>₹849</strong> / student / yr</td>
      </tr>
      <tr>
        <td class="left">1,500+ Students</td>
        <td><strong>Custom Quote</strong></td>
        <td><strong>Custom Quote</strong></td>
        <td><strong>Custom Quote</strong></td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 2: DELIVERABLES COMPARISON -->
  <h2>2. Deliverables & Feature Comparison Matrix</h2>
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
        <td class="left">AI Coding Platform</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Multi-Language Compiler (C, C++, Java, Py, JS)</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Coding Question Bank</td>
        <td>Basic</td>
        <td>Full (3,000+ Qs)</td>
        <td>Full (3,000+ Qs)</td>
      </tr>
      <tr>
        <td class="left">Aptitude Question Bank</td>
        <td>Basic</td>
        <td>Full</td>
        <td>Full</td>
      </tr>
      <tr>
        <td class="left">Company-Wise Question Bank</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">AI Generated Coding Questions</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Interactive Structured Courses</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Weekly Coding Contests & Leaderboards</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Placement Readiness Score</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Company-Specific Mock Tests</td>
        <td class="cross">❌</td>
        <td>Limited</td>
        <td><strong>Unlimited</strong></td>
      </tr>
      <tr>
        <td class="left">Spoken English Assessment (CEFR)</td>
        <td class="addon">Add-on</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Psychometric Assessment</td>
        <td class="addon">Add-on</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">AI Interview Practice</td>
        <td class="cross">❌</td>
        <td>Limited</td>
        <td><strong>Unlimited</strong></td>
      </tr>
      <tr>
        <td class="left">AI Video & Audio Proctoring</td>
        <td>Basic</td>
        <td>Advanced</td>
        <td>Enterprise</td>
      </tr>
      <tr>
        <td class="left">CEFR English Report (A1 to C2)</td>
        <td class="cross">❌</td>
        <td class="check">✓</td>
        <td class="check">✓</td>
      </tr>
      <tr>
        <td class="left">Student Performance Analytics</td>
        <td>Basic</td>
        <td>Advanced</td>
        <td>Enterprise</td>
      </tr>
      <tr>
        <td class="left">TPO Management Dashboard</td>
        <td>Basic</td>
        <td>Advanced</td>
        <td>Enterprise</td>
      </tr>
      <tr>
        <td class="left">Monthly Assessments Included</td>
        <td>Pay per Use</td>
        <td><strong>25 / month</strong></td>
        <td><strong>40 / month</strong></td>
      </tr>
      <tr>
        <td class="left">Email & Technical Support</td>
        <td>Standard</td>
        <td>Priority</td>
        <td>Dedicated Manager</td>
      </tr>
      <tr>
        <td class="left">Onboarding & Staff Support</td>
        <td>Standard</td>
        <td>Standard</td>
        <td>Dedicated Staff</td>
      </tr>
    </tbody>
  </table>

  <!-- PAGE BREAK FOR CLEAN PRINT LAYOUT -->
  <div class="page-break"></div>

  <!-- HEADER PAGE 2 -->
  <table class="header-table">
    <tr>
      <td>
        <img class="logo" src="data:image/png;base64,{logo_b64}" alt="SEED IT Logo" />
      </td>
      <td class="title-block">
        <h1>Institutional Quotation (Contd.)</h1>
        <p>SEED IT SEB Platform Assessment & Services</p>
      </td>
    </tr>
  </table>

  <!-- SECTION 3: ASSESSMENT USAGE LIMITS -->
  <h2>3. Assessment Usage Limits Clarification</h2>
  <ul class="bullet-list">
    <li><strong>Regular Plan:</strong> Pay-per-use assessment model for custom institutional tests.</li>
    <li><strong>Premium Plan:</strong> Includes <strong>up to 25 official assessments per month</strong>, plus <strong>unlimited</strong> practice questions, <strong>unlimited</strong> coding practice, and <strong>unlimited</strong> weekly contests.</li>
    <li><strong>Exclusive Pro Plan:</strong> Includes <strong>up to 40 official assessments per month</strong>, plus <strong>unlimited</strong> practice, <strong>dedicated</strong> company-specific mock placement tests, and <strong>unlimited</strong> AI interview practice sessions.</li>
  </ul>

  <!-- SECTION 4: MODULAR ASSESSMENT-ONLY PRICING -->
  <h2>4. Modular "Assessment-Only" Pricing (Pay-As-You-Go)</h2>
  <p style="font-size: 11.5px; color: #475569; margin-top: -5px;">For institutions seeking standalone testing infrastructure without annual course subscriptions:</p>
  <table class="data-table">
    <thead>
      <tr>
        <th style="text-align: left;">Assessment Component / Service</th>
        <th>Investment Rate</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="left">Platform Account Access (Annual)</td>
        <td><strong>₹150</strong> / student / year</td>
      </tr>
      <tr>
        <td class="left">MCQ Assessment</td>
        <td><strong>₹25</strong> / student / test</td>
      </tr>
      <tr>
        <td class="left">Coding Assessment</td>
        <td><strong>₹35</strong> / student / test</td>
      </tr>
      <tr>
        <td class="left">AI Proctored Full Length Assessment</td>
        <td><strong>₹50</strong> / student / test</td>
      </tr>
      <tr>
        <td class="left">Spoken English Assessment (CEFR)</td>
        <td><strong>₹60</strong> / student / test</td>
      </tr>
      <tr>
        <td class="left">Psychometric Assessment</td>
        <td><strong>₹75</strong> / student / test</td>
      </tr>
      <tr>
        <td class="left">AI Interview Assessment</td>
        <td><strong>₹100</strong> / student / test</td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 5: TERMS AND CONDITIONS -->
  <div class="terms-box">
    <h3>Commercial Terms & Regulatory Conditions</h3>
    <ul>
      <li><strong>Taxation:</strong> Applicable <strong>GST @ 18% extra</strong> on all subscription packages and pay-per-use assessment rates.</li>
      <li><strong>Payment Terms:</strong> 50% advance upon order confirmation & agreement signing; balance 50% upon student account batch provisioning.</li>
      <li><strong>Proposal Validity:</strong> This quotation is valid for 30 days from the date of issue (until August 31, 2026).</li>
      <li><strong>Security & Environment:</strong> Assessments execute inside the <strong>SEED IT SEB Platform</strong> (Safe Exam Browser desktop environment) guaranteeing strict anti-cheat compliance.</li>
      <li><strong>Onboarding & Support:</strong> Institutional portal configuration, roster integration, and TPO staff training completed within 48 hours.</li>
    </ul>
  </div>

  <!-- SECTION 6: SIGNATURE & CONTACT -->
  <h2>5. Authorization & Contact Details</h2>
  <table class="signature-table">
    <tr>
      <td style="padding-right: 10px;">
        <div class="signature-box">
          <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; color: #64748B;">For Provider:</p>
          <p style="margin: 0; font-weight: bold; font-size: 14px; color: #0F172A;">Ashok Selva Kumar E</p>
          <p style="margin: 2px 0; color: #334155; font-weight: 600;">Managing Director</p>
          <p style="margin: 0; color: #475569;">SEED-IT EDU Services, Coimbatore.</p>
          <p style="margin: 6px 0 0 0; color: #2563EB; font-weight: bold;">Phone: +91 9442730135</p>
          <div style="margin-top: 25px; border-top: 1px dashed #94A3B8; padding-top: 5px; font-size: 10px; color: #94A3B8;">
            Authorized Signature & Seal
          </div>
        </div>
      </td>
      <td style="padding-left: 10px;">
        <div class="signature-box">
          <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; color: #64748B;">For Institution Acceptance:</p>
          <p style="margin: 0; font-weight: bold; font-size: 14px; color: #0F172A;">[Name & Designation]</p>
          <p style="margin: 2px 0; color: #334155;">Training & Placement Officer / Principal</p>
          <p style="margin: 0; color: #475569;">[College / Institution Name]</p>
          <p style="margin: 6px 0 0 0; color: #475569;">Date: ____ / ____ / 2026</p>
          <div style="margin-top: 25px; border-top: 1px dashed #94A3B8; padding-top: 5px; font-size: 10px; color: #94A3B8;">
            Accepted Signature & Seal
          </div>
        </div>
      </td>
    </tr>
  </table>

</body>
</html>
"""

html_file_path = os.path.join(os.getcwd(), 'SEED_IT_SEB_Platform_Proposal.html')
pdf_file_path = os.path.join(os.getcwd(), 'SEED_IT_SEB_Platform_Proposal.pdf')

with open(html_file_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print('Saved HTML proposal to:', html_file_path)

# Convert to PDF using Chrome Headless
chrome_cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    f'--print-to-pdf={pdf_file_path}',
    html_file_path
]

try:
    res = subprocess.run(chrome_cmd, capture_output=True, text=True, check=True)
    print('SUCCESS: PDF proposal generated at:', pdf_file_path)
except Exception as e:
    print('PDF conversion error:', str(e))
