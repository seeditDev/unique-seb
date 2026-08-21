import React, { useRef } from 'react';
import { 
  FaAward, FaCheckCircle, FaVolumeUp, FaDownload, 
  FaExclamationTriangle, FaRedo, FaTrophy, FaVolumeMute, FaInfoCircle
} from 'react-icons/fa';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import '../styles/SpokenEnglishAssessment.css';

const SpokenEnglishReport = ({ evaluation, responses = [], candidateName = 'Candidate', assessmentName = 'Spoken English Assessment', onRetake }) => {
  const reportRef = useRef(null);

  if (!evaluation) return null;

  const { percentage, cefr, parameters, wpm, fillerCount, fillersFound, grammarErrors } = evaluation;

  // PDF Export
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();

    // Header banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pw, 36, 'F');
    doc.setTextColor(56, 189, 248);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('SEED-IT Platform', 14, 14);
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('AI Spoken English & Communication Skills Scorecard', 14, 22);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Candidate: ${candidateName} | Date: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

    // CEFR Level & Overall Score Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 42, pw - 28, 30, 3, 3, 'F');
    doc.setDrawColor(99, 102, 241);
    doc.roundedRect(14, 42, pw - 28, 30, 3, 3, 'S');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`CEFR Level: ${cefr.level} (${cefr.name})`, 22, 54);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Overall Score: ${percentage}% | WPM: ${wpm} | Fillers Used: ${fillerCount}`, 22, 62);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(cefr.desc, 22, 68);

    // Parameters Table
    let y = 80;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('10-Parameter Performance Breakdown', 14, y);
    y += 6;

    const paramRows = Object.values(parameters).map(p => [
      p.label,
      `${p.mark} / ${p.max}`,
      `${Math.round((p.mark / p.max) * 100)}%`
    ]);

    doc.autoTable({
      startY: y,
      head: [['Evaluation Parameter', 'Marks Obtained', 'Percentage']],
      body: paramRows,
      theme: 'striped',
      headStyles: { fillColor: [56, 189, 248], textColor: [15, 23, 42], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 12;

    // Grammar Corrections
    if (grammarErrors.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Grammar & Expression Feedback', 14, y);
      y += 6;

      const grammarRows = grammarErrors.map((g, idx) => [
        `#${idx + 1}`,
        g.spoken,
        g.correction,
        g.explanation
      ]);

      doc.autoTable({
        startY: y,
        head: [['#', 'Spoken Phrase', 'Suggested Correction', 'Explanation']],
        body: grammarRows,
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 }
      });
    }

    doc.save(`Spoken_English_Report_${candidateName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="spe-container" ref={reportRef}>
      <div className="spe-report-card">
        {/* Top Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '24px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Communication Assessment Result</span>
            <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#ffffff', margin: '4px 0 0' }}>{assessmentName}</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: '4px 0 0' }}>Candidate: <strong>{candidateName}</strong></p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {onRetake && (
              <button className="spe-btn spe-btn-secondary" onClick={onRetake}>
                <FaRedo /> Retake Exam
              </button>
            )}
            <button className="spe-btn spe-btn-primary" onClick={handleDownloadPDF}>
              <FaDownload /> Download PDF Report
            </button>
          </div>
        </div>

        {/* CEFR Level Hero Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginTop: '24px' }}>
          
          {/* Badge 1: CEFR Level */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: `2px solid ${cefr.color}`, borderRadius: '20px', padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="spe-cefr-badge" style={{ background: cefr.color }}>
              {cefr.level}
            </div>
            <div>
              <span style={{ color: cefr.color, fontWeight: '800', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CEFR Level Standard</span>
              <h2 style={{ margin: '2px 0 6px', fontSize: '1.6rem', color: 'white', fontWeight: '800' }}>{cefr.name}</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>{cefr.desc}</p>
            </div>
          </div>

          {/* Badge 2: Overall Score & WPM */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700' }}>OVERALL ACCURACY SCORE</span>
              <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#38bdf8' }}>{percentage}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8, #10b981)', borderRadius: '4px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '18px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '12px', textAlign: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>SPEAKING PACE</span>
                <strong style={{ fontSize: '1.1rem', color: '#f1f5f9' }}>{wpm} WPM</strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '12px', textAlign: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>FILLERS USED</span>
                <strong style={{ fontSize: '1.1rem', color: fillerCount === 0 ? '#10b981' : '#f59e0b' }}>{fillerCount} count</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 10 Evaluation Parameters Grid */}
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaTrophy style={{ color: '#fb923c' }} /> 10-Parameter Assessment Breakdown
          </h3>
          <div className="spe-params-grid">
            {Object.values(parameters).map((p, idx) => {
              const pct = Math.round((p.mark / p.max) * 100);
              const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#38bdf8' : pct >= 45 ? '#f59e0b' : '#ef4444';
              return (
                <div key={idx} className="spe-param-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f1f5f9' }}>{p.label}</span>
                    <span style={{ fontWeight: '800', color, fontSize: '0.95rem' }}>{p.mark} / {p.max}</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grammar & Fillers Analysis Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '32px' }}>
          
          {/* Grammar Corrections */}
          <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaCheckCircle /> Grammar & Expression Feedback
            </h4>
            {grammarErrors.length === 0 ? (
              <p style={{ color: '#10b981', fontSize: '0.9rem', margin: 0 }}> Excellent grammar! No obvious grammatical errors detected in speech transcripts.</p>
            ) : (
              <table className="spe-grammar-table">
                <thead>
                  <tr>
                    <th>Spoken Phrase</th>
                    <th>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {grammarErrors.map((err, i) => (
                    <tr key={i}>
                      <td style={{ color: '#ef4444' }}>"{err.spoken}"</td>
                      <td style={{ color: '#10b981', fontWeight: '700' }}>"{err.correction}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Filler Word Analysis */}
          <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: '800', color: '#fb923c', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaExclamationTriangle /> Filler Word Usage
            </h4>
            {fillersFound.length === 0 ? (
              <p style={{ color: '#10b981', fontSize: '0.9rem', margin: 0 }}> Outstanding delivery! Minimal or zero filler words detected.</p>
            ) : (
              <div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Detected <strong>{fillerCount}</strong> filler word instances during responses:
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {fillersFound.map((f, i) => (
                    <span key={i} style={{ background: 'rgba(251, 146, 60, 0.15)', border: '1px solid rgba(251, 146, 60, 0.3)', color: '#fb923c', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700' }}>
                      "{f}"
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Responses Review List */}
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'white', marginBottom: '16px' }}>
            Question-by-Question Response Audio & Transcript Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {responses.map((res, i) => (
              <div key={i} style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '0.85rem' }}>Question #{i + 1} • {res.moduleType ?? ''}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Duration: {res.durationSeconds || 0}s</span>
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.95rem', fontStyle: 'italic', margin: '4px 0 10px 0' }}>
                  "{res.transcript ?? ''}"
                </p>
                {res.audioUrl && (
                  <audio controls src={res.audioUrl} style={{ width: '100%', height: '36px', marginTop: '6px' }} />
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpokenEnglishReport;
