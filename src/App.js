import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, supabase, activateUserContext, clearUserContext } from './supabaseClient';
import { useSyncEngine } from './syncEngine';
import { offlineDB } from './offlineDB';
import * as Sentry from '@sentry/react';
import SuperAdminDash, { AnnouncementBanners } from './SuperAdminDash';

const sanitize = (str) => typeof str === 'string' ? str.replace(/[<>"'`]/g, '').trim() : str;

// Single source of truth for "what subjects does this class have".
// Checks the class's own `subjects` column first (set when a school
// customizes a class's subject list) and falls back to the standard
// Nigerian curriculum default for that class name. Used everywhere a
// class's subject list is needed, so admin edits are visible to
// teachers, report cards, and result entry consistently — not just on
// whichever device made the edit.
const getClassSubjects = (cls) => {
  if (!cls) return [];
  if (Array.isArray(cls.subjects) && cls.subjects.length) return cls.subjects;
  return NIGERIAN_SUBJECTS[cls.name] || [];
};

// Emails listed here see developer-only diagnostics (e.g. the sync status
// banner). Add your own login email here. School staff/principals will
// never see this UI regardless of their role.
const DEV_EMAILS = ['YOUR_EMAIL_HERE@example.com'];

const getLocalDate = () => {
  const d = new Date();
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const isHashed = (pw) => typeof pw === 'string' && /^[a-f0-9]{64}$/.test(pw);

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function usePagination(items, pageSize = 20) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [items.length]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paginated  = items.slice((page - 1) * pageSize, page * pageSize);
  return { paginated, page, setPage, totalPages, total: items.length };
}

function Pagination({ page, totalPages, setPage, total, pageSize }) {
  if (totalPages <= 1) return null;
  const from = ((page - 1) * pageSize) + 1;
  const to   = Math.min(page * pageSize, total);
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 4px', marginTop:8 }}>
      <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>{from}–{to} of {total}</span>
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
          style={{ background: page===1?'#f1f5f9':'#6366f1', color: page===1?'#94a3b8':'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontWeight:700, fontSize:13, cursor: page===1?'default':'pointer' }}>
          ‹ Prev
        </button>
        <span style={{ fontSize:12, color:'#64748b', fontWeight:700, alignSelf:'center', minWidth:60, textAlign:'center' }}>
          {page} / {totalPages}
        </span>
        <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
          style={{ background: page===totalPages?'#f1f5f9':'#6366f1', color: page===totalPages?'#94a3b8':'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontWeight:700, fontSize:13, cursor: page===totalPages?'default':'pointer' }}>
          Next ›
        </button>
      </div>
    </div>
  );
}

const NIGERIAN_SUBJECTS = {
  "Creche":  ["Number Work","Letter Work","Rhymes","Colouring","Show & Tell","Physical Activity"],
  "Beginner":  ["Number Work","Letter Work","Rhymes","Colouring","Show & Tell","Physical Activity"],
  "Kindergarten":  ["English Language","Number Work","Phonics","Rhymes","Creative Activity","CRS/IRS","Physical & Health Education"],
  "Nursery":  ["English Language","Number Work","Phonics","Rhymes","Creative Activity","CRS/IRS","Physical & Health Education"],
  "Basic 1":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Basic 2":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Basic 3":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Basic 4":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Basic 5":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 1":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 2":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 3":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 4":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 5":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "Primary 6":  ["English Language","Mathematics","Basic Science & Technology","Social Studies","Civic Education","CRS/IRS","Nigerian Language","Physical & Health Education","Creative & Cultural Arts","Computer Studies"],
  "JSS 1": ["English Language","Mathematics","Basic Science","Social Studies","Basic Technology","Home Economics","Business Studies","French Language","CRS/IRS","Physical & Health Education","Fine Arts","Computer Studies","Agricultural Science"],
  "JSS 2": ["English Language","Mathematics","Basic Science","Social Studies","Basic Technology","Home Economics","Business Studies","French Language","CRS/IRS","Physical & Health Education","Fine Arts","Computer Studies","Agricultural Science"],
  "JSS 3": ["English Language","Mathematics","Basic Science","Social Studies","Basic Technology","Home Economics","Business Studies","French Language","CRS/IRS","Physical & Health Education","Fine Arts","Computer Studies","Agricultural Science"],
  "SS 1 Science":    ["English Language","Mathematics","Physics","Chemistry","Biology","Further Mathematics","Agricultural Science","Computer Science","Geography","CRS/IRS"],
  "SS 2 Science":    ["English Language","Mathematics","Physics","Chemistry","Biology","Further Mathematics","Agricultural Science","Computer Science","Geography","CRS/IRS"],
  "SS 3 Science":    ["English Language","Mathematics","Physics","Chemistry","Biology","Further Mathematics","Agricultural Science","Computer Science","Geography","CRS/IRS"],
  "SS 1 Arts":       ["English Language","Mathematics","Literature-in-English","Government","History","CRS/IRS","Yoruba/Igbo/Hausa","French","Fine Arts","Music"],
  "SS 2 Arts":       ["English Language","Mathematics","Literature-in-English","Government","History","CRS/IRS","Yoruba/Igbo/Hausa","French","Fine Arts","Music"],
  "SS 3 Arts":       ["English Language","Mathematics","Literature-in-English","Government","History","CRS/IRS","Yoruba/Igbo/Hausa","French","Fine Arts","Music"],
  "SS 1 Commercial": ["English Language","Mathematics","Accounting","Commerce","Business Studies","Economics","Marketing","Office Practice","Computer Applications","CRS/IRS"],
  "SS 2 Commercial": ["English Language","Mathematics","Accounting","Commerce","Business Studies","Economics","Marketing","Office Practice","Computer Applications","CRS/IRS"],
  "SS 3 Commercial": ["English Language","Mathematics","Accounting","Commerce","Business Studies","Economics","Marketing","Office Practice","Computer Applications","CRS/IRS"],
};

// Flat, deduplicated, alphabetised list of every subject across all class
// levels — used to power the "Add Subject" autocomplete suggestions.
const ALL_SUBJECTS = [...new Set(Object.values(NIGERIAN_SUBJECTS).flat())].sort();

const CLASS_ORDER = [
  "Creche","Beginner","Kindergarten","Nursery",
  "Basic 1","Basic 2","Basic 3","Basic 4","Basic 5",
  "Primary 1","Primary 2","Primary 3","Primary 4","Primary 5","Primary 6",
  "JSS 1","JSS 2","JSS 3",
  "SS 1 Science","SS 2 Science","SS 3 Science",
  "SS 1 Arts","SS 2 Arts","SS 3 Arts",
  "SS 1 Commercial","SS 2 Commercial","SS 3 Commercial",
];
const getNextClassName = (name) => { const i = CLASS_ORDER.indexOf(name); return i === -1 || i >= CLASS_ORDER.length-1 ? null : CLASS_ORDER[i+1]; };

const MESSAGE_TEMPLATES = {
  "School Resumption":    "Dear [PARENT], school resumes on [DATE]. Please ensure your ward reports on time. — [SCHOOL]",
  "Fee Payment Reminder": "Dear [PARENT], school fees for this term are due. Please pay before [DATE]. — [SCHOOL]",
  "PTA Meeting":          "Dear [PARENT], you are invited to our PTA meeting on [DATE] at [TIME]. — [SCHOOL]",
  "Emergency Notice":     "URGENT: Dear [PARENT], [MESSAGE]. Please contact the school immediately. — [SCHOOL]",
  "Custom Message":       "",
};

const DEFAULT_GRADE_SCALE = [
  { min: 75, max: 100, g:"A", r:"Excellent (Distinction)", col:"#059669" },
  { min: 70, max: 74,  g:"B", r:"Very Good",               col:"#10b981" },
  { min: 65, max: 69,  g:"C", r:"Good",                    col:"#2563eb" },
  { min: 50, max: 64,  g:"C", r:"Average (Credit)",        col:"#0891b2" },
  { min: 40, max: 49,  g:"P", r:"Pass",                    col:"#d97706" },
  { min: 0,  max: 39,  g:"F", r:"Fail",                    col:"#dc2626" },
];
// Normalizes whatever is stored on `schools.grade_scale` (jsonb) into a sorted,
// validated scale array. Falls back to DEFAULT_GRADE_SCALE if missing/invalid —
// so schools that haven't configured one yet keep working exactly as before.
// Supports both the new {min,max} format and legacy {min}-only rows (where max
// is inferred from the next band up), so old saved data doesn't break.
const normalizeGradeScale = (raw) => {
  if(!Array.isArray(raw) || !raw.length) return DEFAULT_GRADE_SCALE;
  let cleaned = raw
    .filter(r => r && typeof r.min === "number" && r.g)
    .map(r => ({ min:r.min, max:typeof r.max==="number"?r.max:null, g:r.g, r:r.r||r.g, col:r.col||"#6366f1" }))
    .sort((a,b) => b.min - a.min);
  // Backfill missing max from the band above (legacy single-box data).
  cleaned = cleaned.map((band,i) => {
    if (band.max != null) return band;
    const above = cleaned[i-1];
    return { ...band, max: above ? above.min - 1 : 100 };
  });
  return cleaned.length ? cleaned : DEFAULT_GRADE_SCALE;
};
const getGrade = (score, scale = DEFAULT_GRADE_SCALE) => {
  for (const band of scale) { if (score >= band.min && score <= (band.max ?? 100)) return band; }
  // Fallback: if score doesn't cleanly fit any band (e.g. gaps in a custom
  // scale), use the old >= min behavior so nothing silently breaks.
  for (const band of scale) { if (score >= band.min) return band; }
  return scale[scale.length-1];
};
const ordinal = (n) => { const s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };

const S = {
  app:   { minHeight:"100vh", background:"#f0f4ff", fontFamily:"'Segoe UI',sans-serif" },
  card:  { background:"#fff", borderRadius:16, padding:24, boxShadow:"0 2px 16px #0000000d", marginBottom:16 },
  btn:   (col="#6366f1") => ({ background:col, color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer" }),
  input: { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  label: { display:"block", fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 },
  badge: (col) => ({ background:col, color:"#fff", borderRadius:20, padding:"3px 12px", fontWeight:800, fontSize:12 }),
  section: (col="#6366f1") => ({ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:`${col}15`, borderRadius:10, marginBottom:20, borderLeft:`4px solid ${col}` }),
};

// ── PDF Generator ─────────────────────────────────────────────
const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) { resolve(window.jspdf); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  s.onload = () => resolve(window.jspdf);
  s.onerror = () => reject(new Error("Failed to load jsPDF"));
  document.head.appendChild(s);
});

const generateReportPDF = async (student, cls, term, subjects, results, attendance, remarks, allStudents, allResults, school, logoDataUrl) => {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W = 210; let y = 0;
  const schoolName = school?.name || "School";
  const scale = normalizeGradeScale(school?.grade_scale);

  doc.setFillColor(30,58,138); doc.rect(0,0,W,55,"F");
  if (logoDataUrl) { try { doc.addImage(logoDataUrl,"PNG",12,8,30,30); } catch(e){} }
  doc.setTextColor(255,255,255);
  doc.setFontSize(20); doc.setFont("helvetica","bold");
  doc.text(schoolName.toUpperCase(), W/2, 18, {align:"center"});
  doc.setDrawColor(251,191,36); doc.setLineWidth(1); doc.line(70,22,140,22);
  doc.setFontSize(11); doc.setFont("helvetica","normal");
  doc.text("ACADEMIC REPORT CARD", W/2, 30, {align:"center"});
  doc.setFontSize(10);
  doc.text(`${term?.name||""} • ${cls?.name||""} ${cls?.arm||""}`, W/2, 38, {align:"center"});
  if (school?.address) { doc.setFontSize(9); doc.text(school.address, W/2, 46, {align:"center"}); }
  y = 63;

  doc.setFillColor(248,250,255); doc.rect(10,y-6,W-20,38,"F");
  doc.setDrawColor(200,210,240); doc.rect(10,y-6,W-20,38,"S");
  const infoLabels=["STUDENT NAME","ADMISSION NO","CLASS","GENDER","DATE OF BIRTH","PARENT/GUARDIAN"];
  const infoValues=[student.full_name, student.admission_number||"—", `${cls?.name||""} ${cls?.arm||""}`, student.gender||"—", student.date_of_birth||"—", student.guardian_name||"—"];
  infoLabels.forEach((label,i)=>{
    const col=i%3, row=Math.floor(i/3), x=14+col*65, iy=y+row*16;
    doc.setTextColor(99,102,241); doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.text(label,x,iy);
    doc.setTextColor(30,41,59); doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.text(String(infoValues[i]),x,iy+6);
  });
  y += 42;

  doc.setFillColor(30,58,138); doc.rect(10,y,W-20,10,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont("helvetica","bold");
  const cols=[10,70,95,120,140,162,185];
  ["SUBJECT","C.A (40%)","EXAM (60%)","TOTAL","%","GRADE","REMARK"].forEach((h,i)=>doc.text(h,cols[i]+2,y+7));
  y += 10;

  const subjectResults = subjects.map(sub => {
    const r = results.find(r=>r.subject_name===sub);
    const ca=r?.ca_score||0, exam=r?.exam_score||0, total=ca+exam;
    return {sub,ca,exam,total,...getGrade(Math.round(total),scale)};
  });
  subjectResults.forEach((r,i)=>{
    if(y>250){doc.addPage();y=20;}
    doc.setFillColor(i%2===0?255:248,i%2===0?255:250,i%2===0?255:255); doc.rect(10,y,W-20,9,"F");
    doc.setTextColor(30,41,59); doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(r.sub,cols[0]+2,y+6);
    doc.text(String(r.ca),cols[1]+6,y+6,{align:"center"});
    doc.text(String(r.exam),cols[2]+6,y+6,{align:"center"});
    const [rr,rg,rb]=r.col?[parseInt(r.col.slice(1,3),16),parseInt(r.col.slice(3,5),16),parseInt(r.col.slice(5,7),16)]:[0,0,0];
    doc.setFont("helvetica","bold"); doc.setTextColor(rr,rg,rb); doc.text(String(r.total),cols[3]+6,y+6,{align:"center"});
    doc.setTextColor(30,41,59); doc.setFont("helvetica","normal"); doc.text(`${r.total}%`,cols[4]+4,y+6,{align:"center"});
    doc.setFont("helvetica","bold"); doc.text(r.g,cols[5]+6,y+6,{align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.text(r.r,cols[6]+2,y+6);
    y += 9;
  });

  y += 6;
  const totalMarks = subjectResults.reduce((a,r)=>a+r.total,0);
  const avg = subjectResults.length ? Math.round(totalMarks/subjectResults.length) : 0;
  const overall = getGrade(avg,scale);
  const getStudentTotal = (sid) => subjects.reduce((a,sub)=>{
    const r=allResults.find(r=>r.student_id===sid&&r.subject_name===sub);
    return a+(r?.ca_score||0)+(r?.exam_score||0);
  },0);
  const ranked=[...allStudents.map(s=>s.id)].sort((a,b)=>getStudentTotal(b)-getStudentTotal(a));
  const pos=ranked.indexOf(student.id)+1;
  const promotionStatus=remarks?.promotion_status||(avg>=40?"Promoted":"Repeated");

  const summaryItems=[
    ["Total Marks",String(totalMarks),"#6366f1"],
    ["Average",`${avg}%`,"#0ea5e9"],
    ["Position",pos?`${ordinal(pos)} of ${allStudents.length}`:"—","#f59e0b"],
    ["Attendance",attendance?`${attendance.days_present}/${attendance.total_days||"—"}`:"—","#10b981"],
    ["Overall",overall.g,overall.col],
    ["Status",promotionStatus||"—",promotionStatus==="Promoted"?"#10b981":promotionStatus==="Repeated"?"#ef4444":"#94a3b8"],
  ];
  const boxW=(W-20)/summaryItems.length;
  summaryItems.forEach((item,i)=>{
    const bx=10+i*boxW;
    const [rr,rg,rb]=[parseInt(item[2].slice(1,3),16),parseInt(item[2].slice(3,5),16),parseInt(item[2].slice(5,7),16)];
    doc.setFillColor(rr,rg,rb); doc.setDrawColor(rr,rg,rb); doc.roundedRect(bx,y,boxW-2,18,2,2,"FD");
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica","bold");
    doc.text(item[0],bx+boxW/2-1,y+7,{align:"center"});
    doc.setFontSize(item[1].length>8?8:11); doc.text(item[1],bx+boxW/2-1,y+15,{align:"center"});
  });
  y += 24;

  if(remarks?.teacher_remark){
    doc.setFillColor(240,253,244); doc.rect(10,y,W-20,18,"F");
    doc.setDrawColor(16,185,129); doc.setLineWidth(0.5); doc.line(10,y,10,y+18);
    doc.setTextColor(16,185,129); doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.text("CLASS TEACHER'S REMARKS",14,y+6);
    doc.setTextColor(55,65,81); doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(remarks.teacher_remark,W-30)[0],14,y+13);
    y += 22;
  }
  if(remarks?.principal_remark){
    doc.setFillColor(239,246,255); doc.rect(10,y,W-20,18,"F");
    doc.setDrawColor(59,130,246); doc.line(10,y,10,y+18);
    doc.setTextColor(59,130,246); doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.text("PRINCIPAL'S REMARKS",14,y+6);
    doc.setTextColor(55,65,81); doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(remarks.principal_remark,W-30)[0],14,y+13);
    y += 22;
  }
  if(term?.resumption_date){
    doc.setFillColor(255,247,237); doc.rect(10,y,W-20,14,"F");
    doc.setDrawColor(251,146,60); doc.line(10,y,10,y+14);
    doc.setTextColor(234,88,12); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text(`NEXT TERM RESUMES: ${term.resumption_date}`,14,y+9);
    y += 18;
  }

  y += 4;
  ["Class Teacher","Principal","Parent/Guardian"].forEach((sig,i)=>{
    const sx=14+i*62;
    doc.setDrawColor(200,210,220); doc.line(sx,y+12,sx+50,y+12);
    doc.setTextColor(148,163,184); doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(sig,sx+25,y+18,{align:"center"});
  });

  doc.setFillColor(30,58,138); doc.rect(0,282,W,15,"F");
  doc.setTextColor(199,210,254); doc.setFontSize(8);
  doc.text(`${schoolName} • Official Academic Report Card • ${term?.name||""}`,W/2,291,{align:"center"});

  doc.save(`${student.full_name.replace(/ /g,"_")}_Report_Card.pdf`);
  return doc.output("blob");
};

// ── Upload PDF to Supabase Storage + save URL to remarks ───────
const uploadAndSaveReport = async (blob, student, term, remarkId, schoolId) => {
  const fileName = `${schoolId}/${student.id}_${term.id}_report.pdf`;
  const { data, error } = await supabase.storage
    .from("report-cards")
    .upload(fileName, blob, { contentType:"application/pdf", upsert:true });
  if (error) throw new Error("Upload failed: " + error.message);
  const { data: urlData } = supabase.storage.from("report-cards").getPublicUrl(fileName);
  const report_url = urlData.publicUrl;
  if (remarkId) await db.patch("remarks", remarkId, { report_url });
  else await db.post("remarks", { student_id:student.id, term_id:term.id, report_url, school_id:schoolId });
  return report_url;
};

// ── Share PDF via native share sheet ──────────────────────────
const sharePDFFile = async (blob, student, term, guardianName) => {
  const fileName = `${student.full_name.replace(/ /g,"_")}_${term?.name||"Report"}.pdf`;
  const file = new File([blob], fileName, { type:"application/pdf" });
  const msg = `Dear ${guardianName||"Parent"}, please find attached the report card for ${student.full_name} — ${term?.name||""}.`;
  const fallback = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=fileName; a.click();
    URL.revokeObjectURL(url);
    const phone = student.guardian_phone?.replace(/\D/g,"");
    if (phone) window.open(`https://wa.me/234${phone.slice(-10)}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
    try {
      await navigator.share({ files:[file], text:msg });
    } catch (e) {
      // The share sheet can be rejected if too much time passed between the
      // tap and this call (e.g. slow PDF generation used up the browser's
      // "user gesture" window) — fall back to download + WhatsApp link
      // instead of surfacing a raw browser error to the user.
      if (e?.name !== "AbortError") fallback();
    }
  } else {
    fallback();
  }
};

// ── Rate Limiter (Supabase-backed — works across all devices) ─
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

async function checkRateLimit(email) {
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data, error } = await Promise.race([
      supabase.from("login_attempts").select("id,attempted_at").eq("email",email.toLowerCase()).eq("success",false).gte("attempted_at",windowStart).order("attempted_at",{ascending:false}),
      new Promise((_,r) => setTimeout(()=>r(new Error("timeout")), 3000))
    ]);
    if (error) return { blocked: false };
    if (data.length >= RATE_LIMIT_MAX) {
      const oldest = new Date(data[data.length - 1].attempted_at).getTime();
      const unlockAt = oldest + RATE_LIMIT_WINDOW_MS;
      const mins = Math.ceil((unlockAt - Date.now()) / 60000);
      return { blocked: true, message: `Too many failed attempts. Try again in ${mins} minute${mins!==1?"s":""}.` };
    }
    return { blocked: false, remaining: RATE_LIMIT_MAX - data.length };
  } catch { return { blocked: false }; }
}

async function recordLoginAttempt(email, success) {
  try {
    await Promise.race([
      supabase.from("login_attempts").insert({ email: email.toLowerCase(), success }),
      new Promise(r => setTimeout(r, 2000))
    ]);
  } catch {}
}


function ForgotPassword({ onBack }) {
  const [email,setEmail]     = useState("");
  const [step,setStep]       = useState("request"); // request | verify | reset | done
  const [code,setCode]       = useState("");
  const [newPass,setNewPass] = useState("");
  const [confirm,setConfirm] = useState("");
  const [loading,setLoading] = useState(false);
  const [err,setErr]         = useState("");
  const [userId,setUserId]   = useState(null);
  const [generatedCode,setGeneratedCode] = useState(null);

  const requestReset = async () => {
    if (!email.trim()) { setErr("Enter your email address"); return; }
    setLoading(true); setErr("");
    const users = await db.get("users", { email: email.trim().toLowerCase() });
    if (!users.length) { setErr("No account found with that email."); setLoading(false); return; }
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires   = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabase.from("users").update({ reset_code: resetCode, reset_expires: expires }).eq("id", users[0].id);
    setUserId(users[0].id);
    setGeneratedCode(resetCode);
    setStep("verify");
    setLoading(false);
  };

  const verifyCode = () => {
    if (!code.trim()) { setErr("Enter the 6-digit code"); return; }
    if (code.trim() !== generatedCode) { setErr("Invalid code. Try again."); return; }
    setErr(""); setStep("reset");
  };

  const resetPassword = async () => {
    if (!newPass) { setErr("Enter a new password"); return; }
    if (newPass.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (newPass !== confirm) { setErr("Passwords do not match"); return; }
    setLoading(true); setErr("");
    const hashed = await hashPassword(newPass);
    await supabase.from("users").update({ password: hashed, reset_code: null, reset_expires: null }).eq("id", userId);
    setLoading(false); setStep("done");
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1e3a8a,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:24, padding:36, width:"100%", maxWidth:400, boxShadow:"0 20px 60px #0000003a" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🔐</div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:900, color:"#1e3a8a" }}>Reset Password</h1>
        </div>

        {step === "request" && (
          <>
            <p style={{ fontSize:13, color:"#64748b", marginBottom:16, textAlign:"center" }}>Enter your registered email address. We'll generate a reset code for you.</p>
            <label style={S.label}>Email</label>
            <input style={{ ...S.input, marginBottom:16 }} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            {err && <div style={{ color:"#ef4444", fontSize:13, marginBottom:12, textAlign:"center" }}>{err}</div>}
            <button onClick={requestReset} disabled={loading} style={{ ...S.btn(), width:"100%", padding:13, fontSize:15 }}>
              {loading ? "Checking…" : "Generate Reset Code →"}
            </button>
          </>
        )}

        {step === "verify" && (
          <>
            <div style={{ background:"#f0fdf4", border:"1.5px solid #10b981", borderRadius:12, padding:16, marginBottom:16, textAlign:"center" }}>
              <div style={{ fontWeight:800, color:"#059669", fontSize:13, marginBottom:4 }}>Reset Code Generated</div>
              <div style={{ fontSize:32, fontWeight:900, color:"#1e3a8a", letterSpacing:8 }}>{generatedCode}</div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Valid for 15 minutes</div>
            </div>
            <p style={{ fontSize:12, color:"#64748b", marginBottom:16, textAlign:"center" }}>Enter the 6-digit code shown above to continue.</p>
            <label style={S.label}>Reset Code</label>
            <input style={{ ...S.input, marginBottom:16, letterSpacing:6, fontSize:20, textAlign:"center", fontWeight:800 }}
              type="text" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value)} />
            {err && <div style={{ color:"#ef4444", fontSize:13, marginBottom:12, textAlign:"center" }}>{err}</div>}
            <button onClick={verifyCode} style={{ ...S.btn("#6366f1"), width:"100%", padding:13, fontSize:15 }}>Verify Code →</button>
          </>
        )}

        {step === "reset" && (
          <>
            <p style={{ fontSize:13, color:"#64748b", marginBottom:16, textAlign:"center" }}>Enter your new password.</p>
            <label style={S.label}>New Password</label>
            <input style={{ ...S.input, marginBottom:12 }} type="password" placeholder="••••••••" value={newPass} onChange={e => setNewPass(e.target.value)} />
            <label style={S.label}>Confirm Password</label>
            <input style={{ ...S.input, marginBottom:16 }} type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} />
            {err && <div style={{ color:"#ef4444", fontSize:13, marginBottom:12, textAlign:"center" }}>{err}</div>}
            <button onClick={resetPassword} disabled={loading} style={{ ...S.btn("#10b981"), width:"100%", padding:13, fontSize:15 }}>
              {loading ? "Saving…" : "Save New Password →"}
            </button>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:800, color:"#059669", fontSize:16, marginBottom:8 }}>Password Reset!</div>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:20 }}>You can now sign in with your new password.</div>
            <button onClick={onBack} style={{ ...S.btn(), width:"100%", padding:13, fontSize:15 }}>Back to Sign In →</button>
          </div>
        )}

        {step !== "done" && (
          <p style={{ textAlign:"center", marginTop:16 }}>
            <span onClick={onBack} style={{ color:"#64748b", fontSize:13, cursor:"pointer" }}>← Back to Sign In</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Login({ onLogin, onRegister }) {
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState("staff");
  const [admNum,setAdmNum]=useState(""); const [parentLoading,setParentLoading]=useState(false);
  const [parentErr,setParentErr]=useState(""); const [parentData,setParentData]=useState(null);
  const [showForgot,setShowForgot]=useState(false);

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />;

  const login = async () => {
    if(!email||!pass){setErr("Please enter email and password");return;}
    const rl = await checkRateLimit(email);
    if(rl.blocked){setErr(rl.message);return;}
    setLoading(true);setErr("");
    try{
      const VERIFY_FN = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/verify-login`;
      const res = await fetch(VERIFY_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password: pass }),
      });
      const result = await res.json();
      if (!result.match) {
        await recordLoginAttempt(email, false);
        const rl2 = await checkRateLimit(email);
        setErr(rl2.blocked
          ? "Too many failed attempts. Account locked for 15 minutes."
          : `Incorrect password. ${rl2.remaining} attempt${rl2.remaining!==1?"s":""} remaining.`
        );
        setLoading(false); return;
      }
      const users = [result.user];
      recordLoginAttempt(email, true); // fire and forget
      // Block login for staff of a deactivated school. super_admin has no
      // school_id so this check never applies to that account.
      if (users[0].school_id) {
        const sc = await db.get('schools', { id: users[0].school_id });
        if (sc[0]?.deactivated) {
          setErr("This school's account has been deactivated. Contact support.");
          setLoading(false); return;
        }
      }
      await activateUserContext(users[0].id);
      const { password: _pw, ...safeUser } = users[0];
      onLogin(safeUser);
    }catch(e){setErr("Connection error. Try again.");}
    setLoading(false);
  };

  const checkResult = async () => {
    if(!admNum.trim()){setParentErr("Enter admission number");return;}
    setParentLoading(true);setParentErr("");setParentData(null);
    clearUserContext(); // parent is unauthenticated — never inherit a stale/leftover staff RLS context
    try{
      const students=await db.get("students",{admission_number:admNum.trim()});
      if(!students.length){setParentErr("No student found with that admission number");setParentLoading(false);return;}
      const student=students[0];
      const [classes,terms,schools,sessions]=await Promise.all([
        db.get("classes",{school_id:student.school_id}),
        db.get("terms",{school_id:student.school_id}),
        db.get("schools",{id:student.school_id}),
        db.get("sessions",{school_id:student.school_id}),
      ]);
      const term=terms.find(t=>t.is_current)||terms[0];
      if(!term){setParentErr("No term records found for this school yet");setParentLoading(false);return;}
      const cls=classes.find(c=>c.id===student.class_id);
      const subjects=getClassSubjects(cls);
      const classmatesAll=await db.get("students",{class_id:student.class_id});
      const [results,allResults,attendance,remarks]=await Promise.all([
        db.get("results",{student_id:student.id,term_id:term.id}),
        db.get("results",{term_id:term.id,student_id:classmatesAll.map(s=>s.id)}),
        db.get("attendance",{student_id:student.id,term_id:term.id}),
        db.get("remarks",{student_id:student.id,term_id:term.id}),
      ]);
      setParentData({student,cls,term,terms,sessions,subjects,results,allStudents:classmatesAll,allResults,attendance:attendance[0]||null,remarks:remarks[0]||null,school:schools[0]||null});
    }catch(e){setParentErr("Error fetching result. Try again.");}
    setParentLoading(false);
  };

  if(parentData) return <ParentResultView data={parentData} onBack={()=>setParentData(null)} />;

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a3d24,#1a6b3f)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:24,padding:36,width:"100%",maxWidth:400,boxShadow:"0 20px 60px #0000003a"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:64,height:64,borderRadius:16,background:"#0a3d24",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:"0 4px 16px #0a3d2440"}}>
            <span style={{color:"#fff",fontWeight:900,fontSize:20,letterSpacing:1}}>SRC</span>
          </div>
          <h1 style={{margin:0,fontSize:18,fontWeight:900,color:"#0a3d24"}}>School Resource Center</h1>
          <p style={{margin:"4px 0 0",fontSize:12,color:"#64748b"}}>School management platform</p>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[["staff","👩‍🏫 Staff Login"],["parent","👨‍👩‍👧 Check Result"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"10px",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",background:mode===m?"#0a3d24":"#f1f5f9",color:mode===m?"#fff":"#64748b"}}>{l}</button>
          ))}
        </div>
        {mode==="staff"?(
          <>
            <div style={{marginBottom:16}}><label style={S.label}>Email</label><input style={S.input} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="your@email.com" type="email"/></div>
            <div style={{marginBottom:20}}><label style={S.label}>Password</label><input style={S.input} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" type="password"/></div>
            {err&&<div style={{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={login} disabled={loading} style={{...S.btn(),width:"100%",padding:"13px",fontSize:15}}>{loading?"Signing in…":"Sign In →"}</button>
            <p style={{textAlign:"center",marginTop:12}}>
              <span onClick={()=>setShowForgot(true)} style={{color:"#6366f1",fontSize:13,cursor:"pointer",fontWeight:600}}>Forgot password?</span>
            </p>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}><label style={S.label}>Admission Number</label><input style={S.input} value={admNum} onChange={e=>setAdmNum(e.target.value)} onKeyDown={e=>e.key==="Enter"&&checkResult()} placeholder="e.g. CBS/2024/001"/></div>
            {parentErr&&<div style={{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{parentErr}</div>}
            <button onClick={checkResult} disabled={parentLoading} style={{...S.btn("#10b981"),width:"100%",padding:"13px",fontSize:15}}>{parentLoading?"Checking…":"View My Child's Result →"}</button>
            <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,marginTop:12}}>Enter your child's admission number. You'll be able to switch between sessions and terms after.</p>
          </>
        )}
        <p style={{textAlign:"center",color:"#94a3b8",fontSize:13,marginTop:20,borderTop:"1px solid #f1f5f9",paddingTop:16}}>
          New school?{" "}
          <span onClick={onRegister} style={{color:"#1e3a8a",fontWeight:800,fontSize:14,cursor:"pointer",textDecoration:"underline"}}>Register here →</span>
        </p>
      </div>
    </div>
  );
}

// ── Parent Result View ─────────────────────────────────────────
function ParentResultView({ data, onBack }) {
  const {student,cls,subjects:initialSubjects,allStudents,school}=data;
  const [generating,setGenerating]=useState(false);
  const [switching,setSwitching]=useState(false);
  const [switchErr,setSwitchErr]=useState("");
  const [view,setView]=useState({
    term:data.term, results:data.results, allResults:data.allResults,
    attendance:data.attendance, remarks:data.remarks, subjects:initialSubjects,
  });
  const sessions = data.sessions||[];
  const allTerms = data.terms||[];
  const [selectedSessionId,setSelectedSessionId]=useState(view.term?.session_id||"");
  const termsInSession = selectedSessionId ? allTerms.filter(t=>t.session_id===selectedSessionId) : allTerms;

  const switchTerm=async(termId)=>{
    const term=allTerms.find(t=>t.id===termId);
    if(!term){return;}
    setSwitching(true);setSwitchErr("");
    clearUserContext(); // unauthenticated parent session — never inherit stale RLS context
    try{
      const classmatesAll=await db.get("students",{class_id:student.class_id});
      const [results,allResults,attendance,remarks]=await Promise.all([
        db.get("results",{student_id:student.id,term_id:term.id}),
        db.get("results",{term_id:term.id,student_id:classmatesAll.map(s=>s.id)}),
        db.get("attendance",{student_id:student.id,term_id:term.id}),
        db.get("remarks",{student_id:student.id,term_id:term.id}),
      ]);
      setView({term,results,allResults,attendance:attendance[0]||null,remarks:remarks[0]||null,subjects:initialSubjects});
    }catch(e){
      setSwitchErr("Could not load that term's result. Check your connection and try again.");
    }
    setSwitching(false);
  };

  const {term,results,allResults,attendance,remarks,subjects}=view;
  const scale=normalizeGradeScale(school?.grade_scale);
  const sResults=subjects.map(sub=>{
    const r=results.find(r=>r.subject_name===sub);
    return {sub,ca:r?.ca_score||0,exam:r?.exam_score||0,total:(r?.ca_score||0)+(r?.exam_score||0)};
  });
  const totalMarks=sResults.reduce((a,r)=>a+r.total,0);
  const avg=sResults.length?Math.round(totalMarks/sResults.length):0;
  const overall=getGrade(avg,scale);
  const getStudentTotal=(sid)=>subjects.reduce((a,sub)=>{
    const r=allResults.find(r=>r.student_id===sid&&r.subject_name===sub);
    return a+(r?.ca_score||0)+(r?.exam_score||0);
  },0);
  const ranked=[...allStudents.map(s=>s.id)].sort((a,b)=>getStudentTotal(b)-getStudentTotal(a));
  const pos=ranked.indexOf(student.id)+1;

  const handleDownload=async()=>{
    setGenerating(true);
    try{ await generateReportPDF(student,cls,term,subjects,results,attendance,remarks,allStudents,allResults,school,null); }
    catch(e){alert("Error: "+e.message);}
    setGenerating(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"#f0f4ff",padding:16}}>
      <div style={{maxWidth:700,margin:"0 auto"}}>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={onBack} style={S.btn("#64748b")}>← Back</button>
          <button onClick={handleDownload} disabled={generating} style={S.btn("#6366f1")}>{generating?"⏳ Generating…":"📥 Download PDF"}</button>
        </div>

        {(sessions.length>0 || allTerms.length>1) && (
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:10}}>📅 Viewing Result For</div>
            <div style={{display:"grid",gridTemplateColumns:sessions.length>0?"1fr 1fr":"1fr",gap:10}}>
              {sessions.length>0&&(
                <div>
                  <label style={S.label}>Session</label>
                  <select style={S.input} value={selectedSessionId} onChange={e=>setSelectedSessionId(e.target.value)}>
                    {sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={S.label}>Term</label>
                <select style={S.input} value={term?.id||""} onChange={e=>switchTerm(e.target.value)} disabled={switching}>
                  {termsInSession.length===0&&<option value="">No terms in this session</option>}
                  {termsInSession.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_current?" ✓":""}</option>)}
                </select>
              </div>
            </div>
            {switching&&<div style={{fontSize:12,color:"#6366f1",marginTop:8}}>Loading result…</div>}
            {switchErr&&<div style={{fontSize:12,color:"#ef4444",marginTop:8}}>⚠️ {switchErr}</div>}
          </div>
        )}

        <div style={{...S.card,background:"linear-gradient(135deg,#1e3a8a,#4338ca)",color:"#fff",textAlign:"center",padding:24}}>
          <div style={{fontSize:32}}>🎓</div>
          <h2 style={{margin:"8px 0 4px",fontSize:18}}>{school?.name||"School"}</h2>
          <div style={{opacity:0.8,fontSize:13}}>Academic Report Card — {term?.name}</div>
        </div>
        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:4}}>{student.full_name}</div>
          <div style={{fontSize:13,color:"#64748b"}}>Class: {cls?.name} {cls?.arm||""} • Adm: {student.admission_number||"—"}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[["Average",`${avg}%`,overall.col],["Position",pos?`${ordinal(pos)} / ${allStudents.length}`:"—","#f59e0b"],["Attendance",attendance?`${attendance.days_present}/${attendance.total_days||"—"}`:"—","#10b981"]].map(([l,v,c])=>(
            <div key={l} style={{background:`${c}10`,border:`1.5px solid ${c}30`,borderRadius:12,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:c,fontWeight:700,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <div style={{minWidth:340}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:6,marginBottom:8}}>
                {["Subject","CA","Exam","Total","Grade"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</div>)}
              </div>
              {sResults.map((r,i)=>{
                const g=getGrade(r.total,scale);
                return(
                  <div key={r.sub} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:6,padding:"8px 0",borderBottom:i<sResults.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                    <div style={{fontWeight:600,fontSize:12,color:"#1e293b"}}>{r.sub}</div>
                    <div style={{textAlign:"center",fontSize:12,color:"#64748b"}}>{r.ca}</div>
                    <div style={{textAlign:"center",fontSize:12,color:"#64748b"}}>{r.exam}</div>
                    <div style={{textAlign:"center",fontWeight:800,color:g.col}}>{r.total}</div>
                    <div style={{textAlign:"center"}}><span style={S.badge(g.col)}>{g.g}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {(remarks?.teacher_remark||remarks?.principal_remark)&&(
          <div style={S.card}>
            {remarks?.teacher_remark&&<div style={{marginBottom:10}}><div style={{fontWeight:700,color:"#10b981",fontSize:12,marginBottom:4}}>🧑‍🏫 Class Teacher</div><p style={{margin:0,color:"#374151",fontSize:13}}>{remarks.teacher_remark}</p></div>}
            {remarks?.principal_remark&&<div><div style={{fontWeight:700,color:"#3b82f6",fontSize:12,marginBottom:4}}>🏛 Principal</div><p style={{margin:0,color:"#374151",fontSize:13}}>{remarks.principal_remark}</p></div>}
          </div>
        )}
        {term?.resumption_date&&(
          <div style={{...S.card,background:"#fff7ed",borderLeft:"4px solid #f59e0b",padding:16}}>
            <div style={{fontWeight:800,color:"#92400e"}}>📅 Next Term Resumes</div>
            <div style={{fontSize:18,fontWeight:900,color:"#ea580c",marginTop:4}}>{term.resumption_date}</div>
          </div>
        )}
        {remarks?.promotion_status&&(
          <div style={{...S.card,background:remarks.promotion_status==="Promoted"?"#f0fdf4":"#fef2f2",borderLeft:`4px solid ${remarks.promotion_status==="Promoted"?"#10b981":"#ef4444"}`,padding:16}}>
            <div style={{fontWeight:800,color:remarks.promotion_status==="Promoted"?"#065f46":"#991b1b",fontSize:15}}>
              {remarks.promotion_status==="Promoted"?"✅ Promoted to Next Class":"🔁 Repeated This Class"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── School Settings ────────────────────────────────────────────
function SchoolSettings({ school, sessions, terms, students, classes, reload, schoolId }) {
  const [subTab,setSubTab]=useState("info");
  const subtabs=[
    {id:"info",    label:"School Info",      icon:"🏫"},
    {id:"sessions",label:"Sessions & Terms", icon:"📅"},
    {id:"promote", label:"Promote Students", icon:"🎖️"},
  ];
  return(
    <div>
      <div style={S.section("#8b5cf6")}><span>⚙️</span><span style={{fontWeight:800,color:"#8b5cf6"}}>Settings</span></div>
      {/* Sub-tab bar */}
      <div style={{display:"flex",gap:8,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
        {subtabs.map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{...S.btn(subTab===t.id?"#8b5cf6":"#e2e8f0"),color:subTab===t.id?"#fff":"#475569",fontWeight:700,fontSize:12,padding:"8px 14px",whiteSpace:"nowrap",flexShrink:0}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {subTab==="info"    &&<SchoolInfoForm school={school} reload={reload}/>}
      {subTab==="sessions"&&<ManageSessions sessions={sessions} terms={terms} reload={reload} schoolId={schoolId}/>}
      {subTab==="promote" &&<PromoteStudents students={students} classes={classes} terms={terms} reload={reload} school={school}/>}
    </div>
  );
}

function SchoolInfoForm({ school, reload }) {
  const [form,setForm]=useState({name:school?.name||"",address:school?.address||"",phone:school?.phone||"",email:school?.email||"",logo_url:school?.logo_url||""});
  const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false); const [uploading,setUploading]=useState(false);
  const [gradeScale,setGradeScale]=useState(normalizeGradeScale(school?.grade_scale));
  const [scaleErr,setScaleErr]=useState("");

  const updateBand=(idx,field,value)=>{
    setGradeScale(prev=>{
      const next=[...prev];
      next[idx]={...next[idx],[field]: (field==="min"||field==="max") ? Number(value) : value};
      return next;
    });
  };
  const resetScale=()=>setGradeScale(DEFAULT_GRADE_SCALE.map(b=>({...b})));

  const save=async()=>{
    // Validate: descending by min, unique/non-overlapping ranges, lowest band starts at 0, highest ends at 100
    const sorted=[...gradeScale].sort((a,b)=>b.min-a.min);
    const lastIsZero=sorted[sorted.length-1]?.min===0;
    const firstIsHundred=sorted[0]?.max===100;
    const hasOverlap = sorted.some((b,i)=> i>0 && b.max >= sorted[i-1].min);
    const hasInvalidRange = sorted.some(b=> b.min > b.max);
    if(hasOverlap||hasInvalidRange||!lastIsZero||!firstIsHundred||sorted.some(b=>!b.g.trim())){
      setScaleErr("Check your grade scale: ranges must not overlap, each needs a letter, the lowest band must start at 0% and the highest must end at 100%.");
      return;
    }
    setScaleErr("");
    setSaving(true);
    const payload={...form, grade_scale: sorted};
    if(school?.id) await db.patch("schools",school.id,payload);
    else await db.post("schools",payload);
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),3000); reload();
  };

  const handleLogoUpload=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    setUploading(true);
    try{
      const ext=file.name.split(".").pop();
      const path=`logos/school_logo_${Date.now()}.${ext}`;
      const {error:upErr}=await supabase.storage.from("school-assets").upload(path,file,{upsert:true});
      if(upErr) throw upErr;
      const {data}=supabase.storage.from("school-assets").getPublicUrl(path);
      setForm(p=>({...p,logo_url:data.publicUrl}));
    }catch(err){
      alert("Logo upload failed: "+err.message+"\n\nCreate a 'school-assets' public bucket in Supabase Storage first.");
    }
    setUploading(false);
  };

  return(
    <div>
      <div style={S.card}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={S.label}>School Name</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. School Data Center"/></div>
          <div style={{gridColumn:"1/-1"}}><label style={S.label}>Address</label><input style={S.input} value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="School address"/></div>
          <div><label style={S.label}>Phone</label><input style={S.input} value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="08012345678"/></div>
          <div><label style={S.label}>Email</label><input style={S.input} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="info@school.com" type="email"/></div>
        </div>
        <div style={{marginTop:16}}>
          <label style={S.label}>School Logo (for Report Cards)</label>
          {form.logo_url&&<img src={form.logo_url} alt="logo" style={{width:80,height:80,objectFit:"contain",borderRadius:10,border:"1.5px solid #e2e8f0",marginBottom:10,display:"block"}}/>}
          <input type="file" accept="image/*" onChange={handleLogoUpload} style={{marginBottom:8,fontSize:13}}/>
          {uploading&&<div style={{color:"#6366f1",fontSize:13}}>Uploading…</div>}
          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Requires a "school-assets" public bucket in Supabase Storage.</div>
        </div>
        <GradeScaleEditor gradeScale={gradeScale} updateBand={updateBand} resetScale={resetScale} scaleErr={scaleErr}/>
        {saved&&<div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,margin:"12px 0",textAlign:"center"}}>✅ Settings saved!</div>}
        <button onClick={save} disabled={saving} style={{...S.btn("#8b5cf6"),marginTop:12}}>{saving?"Saving…":"💾 Save Settings"}</button>
      </div>
    </div>
  );
}

// ── Grading Scale (per-school, configurable) ─────────────────
function GradeScaleEditor({ gradeScale, updateBand, resetScale, scaleErr }) {
  return(
    <div style={{...S.card,marginTop:16}}>
      <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:4}}>📊 Grading Scale</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Set your school's own score ranges for report cards. This is independent of WAEC/BECE exam grading — it only affects this school's termly results.</div>
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{minWidth:380}}>
          <div style={{display:"grid",gridTemplateColumns:"50px 50px 70px minmax(110px,1fr)",gap:6,marginBottom:6,fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>
            <div>Min %</div><div>Max %</div><div>Grade</div><div>Description</div>
          </div>
          {gradeScale.map((band,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"50px 50px 70px minmax(110px,1fr)",gap:6,marginBottom:6,alignItems:"center"}}>
              <input type="number" min="0" max="100" style={{...S.input,padding:"6px 4px",fontSize:13}} value={band.min} onChange={e=>updateBand(i,"min",e.target.value)} disabled={i===gradeScale.length-1}/>
              <input type="number" min="0" max="100" style={{...S.input,padding:"6px 4px",fontSize:13}} value={band.max} onChange={e=>updateBand(i,"max",e.target.value)} disabled={i===0}/>
              <input style={{...S.input,padding:"6px 4px",fontSize:13,textAlign:"center"}} value={band.g} onChange={e=>updateBand(i,"g",e.target.value)} maxLength={3}/>
              <input style={{...S.input,padding:"6px 8px",fontSize:13}} value={band.r} onChange={e=>updateBand(i,"r",e.target.value)} placeholder="e.g. Excellent"/>
            </div>
          ))}
        </div>
      </div>
      {scaleErr&&<div style={{color:"#ef4444",fontSize:12,fontWeight:600,marginTop:6}}>⚠️ {scaleErr}</div>}
      <button onClick={resetScale} style={{...S.btn("#94a3b8"),fontSize:12,padding:"6px 12px",marginTop:8}}>↺ Reset to Default</button>
    </div>
  );
}

// ── Promote Students ───────────────────────────────────────────
function PromoteStudents({ students, classes, terms, reload, school }) {
  const [selectedClass,setSelectedClass]=useState("");
  const [selectedTerm,setSelectedTerm]=useState(terms.find(t=>t.is_current)?.id||"");
  const [results,setResults]=useState([]); const [remarks,setRemarks]=useState([]);
  const [loading,setLoading]=useState(false); const [promoting,setPromoting]=useState(false);
  const [promotionMap,setPromotionMap]=useState({}); const [done,setDone]=useState(false);

  const cls=classes.find(c=>c.id===selectedClass);
  const classStudents=students.filter(s=>s.class_id===selectedClass);
  const subjects=getClassSubjects(cls);
  const nextClassName=cls?getNextClassName(cls.name):null;
  const nextClass=nextClassName?classes.find(c=>c.name===nextClassName):null;

  useEffect(()=>{
    if(!selectedClass||!selectedTerm){return;}
    setLoading(true); setDone(false);
    const ids=students.filter(s=>s.class_id===selectedClass).map(s=>s.id);
    if(!ids.length){setResults([]);setRemarks([]);setLoading(false);return;}
    Promise.all([
      db.get("results",{term_id:selectedTerm,student_id:ids}),
      db.get("remarks",{term_id:selectedTerm,student_id:ids}),
    ]).then(([r,rem])=>{
      setResults(r); setRemarks(rem);
      const map={};
      students.filter(s=>s.class_id===selectedClass).forEach(s=>{
        const total=subjects.reduce((a,sub)=>{
          const res=r.find(x=>x.student_id===s.id&&x.subject_name===sub);
          return a+(res?.ca_score||0)+(res?.exam_score||0);
        },0);
        const avg=subjects.length?Math.round(total/subjects.length):0;
        map[s.id]=avg>=40?"Promoted":"Repeated";
      });
      setPromotionMap(map); setLoading(false);
    });
  },[selectedClass,selectedTerm]);

  const getAvg=(sid)=>{
    const total=subjects.reduce((a,sub)=>{
      const r=results.find(x=>x.student_id===sid&&x.subject_name===sub);
      return a+(r?.ca_score||0)+(r?.exam_score||0);
    },0);
    return subjects.length?Math.round(total/subjects.length):0;
  };

  const applyPromotion=async()=>{
    if(!nextClass&&Object.values(promotionMap).some(v=>v==="Promoted")){
      if(!window.confirm(`No next class found for "${cls?.name}". Promoted students stay. Continue?`)) return;
    }
    setPromoting(true);
    for(const student of classStudents){
      const status=promotionMap[student.id]||"Promoted";
      const rem=remarks.find(r=>r.student_id===student.id);
      if(rem?.id) await db.patch("remarks",rem.id,{promotion_status:status});
      else await db.post("remarks",{student_id:student.id,term_id:selectedTerm,promotion_status:status});
      if(status==="Promoted"&&nextClass) await db.patch("students",student.id,{class_id:nextClass.id});
    }
    setPromoting(false); setDone(true); reload();
  };

  return(
    <div>
      <div style={S.section("#f59e0b")}><span>🎖️</span><span style={{fontWeight:800,color:"#f59e0b"}}>Promote / Retain Students</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div><label style={S.label}>Select Class</label>
          <select style={S.input} value={selectedClass} onChange={e=>{setSelectedClass(e.target.value);setDone(false);}}>
            <option value="">Choose class</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
          </select>
        </div>
        <div><label style={S.label}>Term</label>
          <select style={S.input} value={selectedTerm} onChange={e=>setSelectedTerm(e.target.value)}>
            <option value="">Choose term</option>
            {terms.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_current?" (Current)":""}</option>)}
          </select>
        </div>
      </div>
      {loading&&<div style={{textAlign:"center",padding:30,color:"#64748b"}}>Loading results…</div>}
      {!loading&&selectedClass&&classStudents.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No students in this class.</div>}
      {!loading&&classStudents.length>0&&(
        <>
          {nextClass?(
            <div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#065f46",fontWeight:600}}>
              ✅ Promoted students → <strong>{nextClass.name} {nextClass.arm||""}</strong>
            </div>
          ):(
            <div style={{background:"#fff7ed",border:"1.5px solid #f59e0b",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#92400e",fontWeight:600}}>
              ⚠️ No next class found for {cls?.name}. Create it first.
            </div>
          )}
          {classStudents.map(s=>{
            const avg=getAvg(s.id); const g=getGrade(avg,normalizeGradeScale(school?.grade_scale)); const status=promotionMap[s.id]||"Promoted";
            return(
              <div key={s.id} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,color:"#1e293b"}}>{s.full_name}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>Avg: {avg}% • <span style={{color:g.col,fontWeight:700}}>{g.g}</span></div>
                </div>
                <select value={status} onChange={e=>setPromotionMap(p=>({...p,[s.id]:e.target.value}))} style={{...S.input,width:"auto",padding:"8px 12px",fontWeight:700,color:status==="Promoted"?"#059669":status==="Repeated"?"#dc2626":"#6366f1"}}>
                  <option value="Promoted">✅ Promoted</option>
                  <option value="Repeated">🔁 Repeated</option>
                  <option value="Graduated">🎓 Graduated</option>
                </select>
              </div>
            );
          })}
          {done&&(
            <div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:16,textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:32}}>🎉</div>
              <div style={{fontWeight:800,color:"#065f46",fontSize:16}}>Promotion Applied!</div>
              <div style={{color:"#064e3b",fontSize:13,marginTop:4}}>Students moved to their new classes.</div>
            </div>
          )}
          <button onClick={applyPromotion} disabled={promoting} style={{...S.btn("#f59e0b"),width:"100%",padding:"14px",fontSize:15}}>
            {promoting?"Applying Promotion…":"🎖️ Apply Promotion to All"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Manage Students ────────────────────────────────────────────
// ── CSV/Excel Import ──────────────────────────────────────────
function StudentImport({ classes, schoolId, school, students, onDone }) {
  const [step, setStep]           = useState('upload'); // upload | preview | importing | done
  const [rows, setRows]           = useState([]);
  const [errors, setErrors]       = useState([]);
  const [mapping, setMapping]     = useState({});
  const [headers, setHeaders]     = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [imported, setImported]   = useState(0);
  const [reading, setReading]     = useState(false);
  const [showAllRows, setShowAllRows]     = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const fileRef                   = useRef(null);

  const REQUIRED_FIELDS = [
    { key:'full_name',      label:'Full Name',          required:true  },
    { key:'class_name',     label:'Class (e.g. JSS 1)', required:true  },
    { key:'admission_number',label:'Admission No',      required:false },
    { key:'gender',         label:'Gender',             required:false },
    { key:'date_of_birth',  label:'Date of Birth',      required:false },
    { key:'guardian_name',  label:'Guardian Name',      required:false },
    { key:'guardian_phone', label:'Guardian Phone',     required:false },
  ];

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers:[], rows:[] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
      const row = {};
      headers.forEach((h,i) => { row[h] = cols[i] || ''; });
      return row;
    }).filter(r => Object.values(r).some(v => v));
    return { headers, rows };
  };

  const autoMap = (headers) => {
    const map = {};
    const normalize = s => s.toLowerCase().replace(/[^a-z]/g,'');
    REQUIRED_FIELDS.forEach(f => {
      const match = headers.find(h => {
        const n = normalize(h);
        if (f.key === 'full_name')       return n.includes('name') && !n.includes('guardian') && !n.includes('parent');
        if (f.key === 'class_name')      return n.includes('class') || n.includes('arm');
        if (f.key === 'admission_number')return n.includes('adm') || n.includes('reg') || n.includes('id');
        if (f.key === 'gender')          return n.includes('gender') || n.includes('sex');
        if (f.key === 'date_of_birth')   return n.includes('dob') || n.includes('birth') || n.includes('date');
        if (f.key === 'guardian_name')   return (n.includes('guardian')||n.includes('parent'))&&n.includes('name');
        if (f.key === 'guardian_phone')  return (n.includes('guardian')||n.includes('parent'))&&(n.includes('phone')||n.includes('tel'));
        return false;
      });
      if (match) map[f.key] = match;
    });
    return map;
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      alert('Please select a .csv or .txt file. If your file is from Excel, use "Save As → CSV" first.');
      return;
    }
    setReading(true);
    const reader = new FileReader();

    // Some Android file pickers (e.g. picking from Drive/Sheets instead of
    // a local file) can leave FileReader stuck with no load/error event.
    // A hard timeout guarantees the user always gets feedback.
    const timeout = setTimeout(() => {
      reader.abort();
      setReading(false);
      alert('Reading the file took too long. Please make sure you selected a local CSV file (not a Google Drive/Sheets link) and try again.');
    }, 15000);

    reader.onload = (e) => {
      clearTimeout(timeout);
      setReading(false);
      try {
        const text = e.target.result;
        const { headers, rows } = parseCSV(text);
        if (!headers.length) { alert('Could not read file. Make sure it is a CSV file.'); return; }
        setHeaders(headers);
        setRows(rows);
        setMapping(autoMap(headers));
        setStep('preview');
      } catch (err) {
        alert('Could not read this file. Please confirm it is a valid CSV exported from Excel or Google Sheets.');
      }
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      setReading(false);
      alert('Failed to read the file. Please try selecting it again.');
    };
    reader.onabort = () => {
      clearTimeout(timeout);
      setReading(false);
    };
    reader.readAsText(file);
  };

  const resolveClass = (className) => {
    if (!className) return null;
    const norm = className.toLowerCase().trim();
    return classes.find(c => {
      const full = `${c.name} ${c.arm||''}`.toLowerCase().trim();
      const nameOnly = c.name.toLowerCase().trim();
      return full === norm || nameOnly === norm ||
        full.replace(/\s/g,'') === norm.replace(/\s/g,'') ||
        norm.includes(nameOnly);
    });
  };

  const validateRows = () => {
    const errs = [];
    const badRowIndices = new Set();
    rows.forEach((row, i) => {
      const name = row[mapping.full_name]?.trim();
      const cls  = row[mapping.class_name]?.trim();
      if (!name) { errs.push(`Row ${i+2}: Missing student name`); badRowIndices.add(i); }
      if (!cls)  { errs.push(`Row ${i+2}: Missing class`); badRowIndices.add(i); }
      else if (!resolveClass(cls)) { errs.push(`Row ${i+2}: Class "${cls}" not found — create it first`); badRowIndices.add(i); }
    });
    return { errs, badRowIndices };
  };

  const genAdmNo = (index) => {
    const initials = school?.name
      ? school.name.split(' ').filter(w=>w.length>1).map(w=>w[0].toUpperCase()).join('').slice(0,4)
      : 'SCH';
    const year = new Date().getFullYear();
    return `${initials}/${year}/${String(index).padStart(4,'0')}`;
  };

  const [failed, setFailed] = useState([]);

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

  const [currentRowName, setCurrentRowName] = useState('');

  const [crashError, setCrashError] = useState('');

  const [skippedCount, setSkippedCount] = useState(0);

  const runImport = async (skipInvalid = false) => {
    const { errs, badRowIndices } = validateRows();
    if (errs.length && !skipInvalid) { setErrors(errs); return; }
    setErrors([]);
    setFailed([]);
    setCrashError('');
    setImporting(true);
    setStep('importing');
    let count = 0;
    let failCount = 0;
    const failedRows = [];
    const startIdx = students?.length || 0;
    const rowsToImport = skipInvalid ? rows.filter((_, i) => !badRowIndices.has(i)) : rows;
    setSkippedCount(skipInvalid ? badRowIndices.size : 0);
    try {
      for (const row of rowsToImport) {
        setCurrentRowName(row[mapping.full_name] || `Row ${count+2}`);
        const cls = resolveClass(row[mapping.class_name]?.trim());
        const admNo = row[mapping.admission_number]?.trim() || genAdmNo(startIdx + count + 1);
        try {
          const result = await withTimeout(db.post('students', {
            full_name:        sanitize(row[mapping.full_name]?.trim() || ''),
            admission_number: admNo,
            gender:           row[mapping.gender]?.trim() || '',
            date_of_birth:    row[mapping.date_of_birth]?.trim() || '',
            guardian_name:    sanitize(row[mapping.guardian_name]?.trim() || ''),
            guardian_phone:   row[mapping.guardian_phone]?.trim() || '',
            class_id:         cls?.id || null,
            school_id:        schoolId,
          }), 12000);
          if (!result) { failCount++; failedRows.push(row[mapping.full_name] || `Row ${count+2}`); }
        } catch (e) {
          failCount++;
          failedRows.push(`${row[mapping.full_name] || `Row ${count+2}`} (${e.message === 'timeout' ? 'timed out — check connection' : 'failed'})`);
        }
        count++;
        setProgress(Math.round((count / rowsToImport.length) * 100));
        setImported(count - failCount);
      }
      setFailed(failedRows);
      setImporting(false);
      setStep('done');
      onDone();
    } catch (fatalErr) {
      // Catches anything unexpected that escapes the per-row try/catch above,
      // so the screen never freezes silently with no explanation.
      setImporting(false);
      setCrashError(fatalErr?.message || String(fatalErr) || 'Unknown error during import');
    }
  };

  // ── Download template
  const downloadTemplate = () => {
    const csv = [
      'Full Name,Class,Admission No,Gender,Date of Birth,Guardian Name,Guardian Phone',
      'Chika Okafor,JSS 1 A,SCH/2025/0001,Male,2012-03-15,Mr Okafor,08012345678',
      'Amina Bello,JSS 1 B,,Female,2013-07-22,Mrs Bello,09087654321',
    ].join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'student_import_template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={S.section('#6366f1')}><span>📥</span><span style={{fontWeight:800,color:'#6366f1'}}>Import Students</span></div>

      {step === 'upload' && (
        <>
          <div style={{...S.card,textAlign:'center',padding:32,border:'2px dashed #6366f1',background:'#fafafa'}}>
            <div style={{fontSize:40,marginBottom:12}}>📊</div>
            <div style={{fontWeight:800,color:'#1e293b',fontSize:15,marginBottom:6}}>Upload Student List</div>
            <div style={{fontSize:13,color:'#64748b',marginBottom:20}}>Upload a CSV file with your student data. Download the template below to get started.</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            <button onClick={()=>fileRef.current.click()} disabled={reading} style={{...S.btn('#6366f1'),padding:'12px 28px',fontSize:14,marginBottom:12,width:'100%',opacity:reading?0.7:1}}>
              {reading ? '⏳ Reading file…' : '📂 Choose CSV File'}
            </button>
            <button onClick={downloadTemplate} style={{...S.btn('#e2e8f0'),color:'#6366f1',padding:'10px 20px',fontSize:13,width:'100%'}}>
              ⬇️ Download Template
            </button>
          </div>
          <div style={{...S.card,marginTop:12}}>
            <div style={{fontWeight:700,color:'#1e293b',fontSize:13,marginBottom:8}}>How to import:</div>
            {['Download the template above','Fill in your student data in Excel or Google Sheets','Export/Save as CSV','Upload the CSV file here'].map((s,i)=>(
              <div key={i} style={{display:'flex',gap:10,alignItems:'center',padding:'6px 0',fontSize:13,color:'#64748b'}}>
                <div style={{width:22,height:22,borderRadius:'50%',background:'#6366f1',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,flexShrink:0}}>{i+1}</div>
                {s}
              </div>
            ))}
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <div style={{...S.card,background:'#f0fdf4',border:'1.5px solid #10b981',marginBottom:16}}>
            <div style={{fontWeight:700,color:'#059669',fontSize:13}}>✅ {rows.length} students found in file</div>
            <div style={{fontSize:12,color:'#64748b',marginTop:2}}>Review the column mapping below then tap Import.</div>
          </div>

          {/* Column mapping */}
          <div style={S.card}>
            <div style={{fontWeight:800,color:'#1e293b',fontSize:13,marginBottom:12}}>Column Mapping</div>
            {REQUIRED_FIELDS.map(f=>(
              <div key={f.key} style={{marginBottom:10}}>
                <label style={S.label}>{f.label}{f.required&&<span style={{color:'#ef4444'}}> *</span>}</label>
                <select style={S.input} value={mapping[f.key]||''} onChange={e=>setMapping(p=>({...p,[f.key]:e.target.value}))}>
                  <option value=''>— Not mapped —</option>
                  {headers.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>
              Preview (first 5 rows)
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {['Name','Class','Adm No','Gender','Guardian'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllRows ? rows : rows.slice(0,5)).map((row,i)=>{
                    const cls = resolveClass(row[mapping.class_name]?.trim());
                    return (
                      <tr key={i} style={{borderTop:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                        <td style={{padding:'8px 10px',fontWeight:600,color:'#374151'}}>{row[mapping.full_name]||'—'}</td>
                        <td style={{padding:'8px 10px',color:cls?'#10b981':'#ef4444',fontWeight:600}}>{row[mapping.class_name]||'—'}{!cls&&row[mapping.class_name]?' ⚠️':''}</td>
                        <td style={{padding:'8px 10px',color:'#64748b'}}>{row[mapping.admission_number]||'auto'}</td>
                        <td style={{padding:'8px 10px',color:'#64748b'}}>{row[mapping.gender]||'—'}</td>
                        <td style={{padding:'8px 10px',color:'#64748b'}}>{row[mapping.guardian_name]||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && <div onClick={()=>setShowAllRows(s=>!s)} style={{padding:'8px 16px',fontSize:11,color:'#6366f1',fontWeight:700,textAlign:'center',cursor:'pointer'}}>{showAllRows ? 'Show fewer rows' : `+${rows.length-5} more rows — tap to view all`}</div>}
          </div>

          {errors.length > 0 && (
            <div style={{...S.card,background:'#fef2f2',border:'1.5px solid #ef4444',marginBottom:16}}>
              <div style={{fontWeight:800,color:'#ef4444',marginBottom:8,fontSize:13}}>⚠️ Fix these errors first:</div>
              {(showAllErrors ? errors : errors.slice(0,5)).map((e,i)=><div key={i} style={{fontSize:12,color:'#ef4444',marginBottom:4}}>• {e}</div>)}
              {errors.length>5&&<div onClick={()=>setShowAllErrors(s=>!s)} style={{fontSize:12,color:'#6366f1',fontWeight:700,cursor:'pointer',marginTop:4}}>{showAllErrors ? 'Show less' : `+${errors.length-5} more errors — tap to view all`}</div>}
            </div>
          )}

          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>{setStep('upload');setRows([]);setErrors([]);}} style={{...S.btn('#e2e8f0'),color:'#64748b',flex:1,padding:12,fontSize:13}}>← Back</button>
            <button onClick={runImport} disabled={errors.length>0} style={{...S.btn('#6366f1'),flex:2,padding:12,fontSize:14,opacity:errors.length>0?0.5:1,cursor:errors.length>0?'not-allowed':'pointer'}}>Import {rows.length} Students →</button>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div style={{...S.card,textAlign:'center',padding:40}}>
          {crashError ? (
            <>
              <div style={{fontSize:36,marginBottom:16}}>⚠️</div>
              <div style={{fontWeight:800,color:'#ef4444',fontSize:15,marginBottom:8}}>Import stopped unexpectedly</div>
              <div style={{fontSize:12,color:'#64748b',marginBottom:20,wordBreak:'break-word'}}>{crashError}</div>
              <button onClick={()=>{setStep('preview');setCrashError('');}} style={{...S.btn('#6366f1'),padding:'10px 24px',fontSize:13}}>← Back to Preview</button>
            </>
          ) : (
            <>
              <div style={{fontSize:36,marginBottom:16}}>⏳</div>
              <div style={{fontWeight:800,color:'#1e293b',fontSize:15,marginBottom:8}}>Importing students…</div>
              <div style={{fontSize:13,color:'#64748b',marginBottom:4}}>{imported} of {rows.length} imported</div>
              {currentRowName && <div style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>Currently saving: {currentRowName}</div>}
              <div style={{background:'#e2e8f0',borderRadius:99,height:10,overflow:'hidden',marginBottom:8}}>
                <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,#6366f1,#10b981)',borderRadius:99,transition:'width 0.3s'}}/>
              </div>
              <div style={{fontSize:12,color:'#6366f1',fontWeight:700,marginBottom:20}}>{progress}%</div>
              <div style={{fontSize:11,color:'#cbd5e1'}}>Taking too long? Each student has a built-in 12s timeout and will be skipped automatically.</div>
            </>
          )}
        </div>
      )}

      {step === 'done' && (
        <div style={{...S.card,textAlign:'center',padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>{failed.length ? '⚠️' : '🎉'}</div>
          <div style={{fontWeight:900,color: failed.length ? '#d97706' : '#059669',fontSize:18,marginBottom:8}}>{imported} of {rows.length} Students Imported</div>
          <div style={{fontSize:13,color:'#64748b',marginBottom:failed.length?16:24}}>
            {failed.length ? `${failed.length} row${failed.length>1?'s':''} could not be saved — check your connection and try those again.` : 'All students have been added to the system successfully.'}
          </div>
          {failed.length > 0 && (
            <div style={{...S.card,background:'#fef2f2',border:'1.5px solid #ef4444',textAlign:'left',marginBottom:20}}>
              {failed.slice(0,5).map((f,i)=><div key={i} style={{fontSize:12,color:'#ef4444',marginBottom:4}}>• {f}</div>)}
              {failed.length>5&&<div style={{fontSize:12,color:'#94a3b8'}}>+{failed.length-5} more</div>}
            </div>
          )}
          <button onClick={onDone} style={{...S.btn('#6366f1'),padding:'12px 32px',fontSize:14}}>View Students →</button>
        </div>
      )}
    </div>
  );
}

function ManageStudents({ students, classes, reload, schoolId, school, planInfo, onUpgrade }) {
  const genAdmNumber = () => {
    const initials = school && school.name
      ? school.name.split(" ").filter(w=>w.length>1).map(w=>w[0].toUpperCase()).join("").slice(0,4)
      : "SCH";
    const year = new Date().getFullYear();
    const next = (students.length + 1).toString().padStart(4,"0");
    return initials + "/" + year + "/" + next;
  };
  const [form,setForm]=useState({full_name:"",admission_number:"",gender:"",date_of_birth:"",guardian_name:"",guardian_phone:"",class_id:""});
  const [adding,setAdding]=useState(false); const [search,setSearch]=useState("");
  const [classFilter,setClassFilter]=useState("all");
  const debouncedSearch = useDebounce(search, 300);
  const [saving,setSaving]=useState(false); const [editId,setEditId]=useState(null);
  const [importing,setImporting]=useState(false);
  const resetForm=()=>setForm({full_name:"",admission_number:"",gender:"",date_of_birth:"",guardian_name:"",guardian_phone:"",class_id:""});
  useBackOverride(()=>{ if(importing){setImporting(false);return;} resetForm(); setEditId(null); setAdding(false); }, adding||importing);
  const save=async()=>{
    if(!form.full_name.trim()){alert("Student name required");return;}
    if(!form.class_id){alert("Please select a class");return;}
    setSaving(true);
    if(editId){
      const payload={...form};
      if(!payload.admission_number.trim()) payload.admission_number=genAdmNumber();
      await db.patch("students",editId,payload);setEditId(null);
    } else {
      if(planInfo && !planInfo.canAddStudent(students.length)){
        setSaving(false);
        return alert(`⚠️ Student limit reached (${planInfo.trialActive?30:planInfo.config.studentLimit}). Upgrade to Pro for unlimited students.`);
      }
      const admNo = sanitize(form.admission_number.trim()) || genAdmNumber();
      await db.post("students", {
        ...form,
        full_name: sanitize(form.full_name),
        guardian_name: sanitize(form.guardian_name),
        admission_number: admNo,
        school_id: schoolId,
      });
    }
    resetForm();setAdding(false);setSaving(false);reload();
  };
  const startEdit=(s)=>{
    setForm({full_name:s.full_name,admission_number:s.admission_number||"",gender:s.gender||"",date_of_birth:s.date_of_birth||"",guardian_name:s.guardian_name||"",guardian_phone:s.guardian_phone||"",class_id:s.class_id});
    setEditId(s.id);setAdding(true);
  };
  const filtered=students
    .filter(s=>s.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    .filter(s=>classFilter==="all"||s.class_id===classFilter)
    .sort((a,b)=>{
      const clsA=classes.find(c=>c.id===a.class_id);
      const clsB=classes.find(c=>c.id===b.class_id);
      const orderA=CLASS_ORDER.indexOf(clsA?.name??""); const adjA=orderA===-1?999:orderA;
      const orderB=CLASS_ORDER.indexOf(clsB?.name??""); const adjB=orderB===-1?999:orderB;
      if(adjA!==adjB) return adjA-adjB;
      const armA=clsA?.arm||""; const armB=clsB?.arm||"";
      if(armA!==armB) return armA.localeCompare(armB);
      return a.full_name.localeCompare(b.full_name);
    });
  const { paginated:pageStudents, page, setPage, totalPages, total } = usePagination(filtered, 20);
  return(
    <div>
      {importing && (
        <StudentImport
          classes={classes}
          schoolId={schoolId}
          school={school}
          students={students}
          onDone={()=>{ setImporting(false); reload(); }}
        />
      )}
      {!importing && (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={S.section()}><span>👨‍🎓</span><span style={{fontWeight:800,color:"#6366f1"}}>Students ({students.length})</span></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setImporting(true)} style={{...S.btn('#6366f1'),padding:"8px 12px",fontSize:12}}>📥 Import</button>
              <button onClick={()=>{if(adding){resetForm();setEditId(null);}setAdding(!adding);}} style={S.btn()}>{adding?"Cancel":"+ Add"}</button>
            </div>
          </div>
      {adding&&editId===null&&(
        <div style={S.card}>
          <div style={{fontWeight:800,color:"#1e293b",marginBottom:16}}>New Student</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["full_name","Full Name"],["admission_number","Admission No"],["guardian_name","Guardian Name"],["guardian_phone","Guardian WhatsApp"]].map(([k,l])=>(
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}/></div>
            ))}
            <div><label style={S.label}>Gender</label><select style={S.input} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}><option value="">Select</option><option>Male</option><option>Female</option></select></div>
            <div><label style={S.label}>Date of Birth</label><input style={S.input} type="date" value={form.date_of_birth} onChange={e=>setForm(p=>({...p,date_of_birth:e.target.value}))}/></div>
            <div style={{gridColumn:"1/-1"}}><label style={S.label}>Class</label>
              <select style={S.input} value={form.class_id} onChange={e=>setForm(p=>({...p,class_id:e.target.value}))}>
                <option value="">Select Class</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
              </select>
            </div>
          </div>
          <button onClick={save} disabled={saving} style={{...S.btn("#10b981"),marginTop:16}}>{saving?"Saving…":"Save Student"}</button>
        </div>
      )}
      {editId!==null && (
        <div onClick={()=>{resetForm();setEditId(null);setAdding(false);}} style={{position:"fixed",inset:0,background:"#00000066",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...S.card,width:"100%",maxWidth:440,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:800,color:"#1e293b",fontSize:16}}>✏️ Edit Student</div>
              <button onClick={()=>{resetForm();setEditId(null);setAdding(false);}} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["full_name","Full Name"],["admission_number","Admission No"],["guardian_name","Guardian Name"],["guardian_phone","Guardian WhatsApp"]].map(([k,l])=>(
                <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
              <div><label style={S.label}>Gender</label><select style={S.input} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}><option value="">Select</option><option>Male</option><option>Female</option></select></div>
              <div><label style={S.label}>Date of Birth</label><input style={S.input} type="date" value={form.date_of_birth} onChange={e=>setForm(p=>({...p,date_of_birth:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}><label style={S.label}>Class</label>
                <select style={S.input} value={form.class_id} onChange={e=>setForm(p=>({...p,class_id:e.target.value}))}>
                  <option value="">Select Class</option>
                  {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={()=>{resetForm();setEditId(null);setAdding(false);}} style={{...S.btn('#e2e8f0'),color:'#64748b',flex:1}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{...S.btn("#10b981"),flex:2}}>{saving?"Saving…":"Update Student"}</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <select style={{...S.input,maxWidth:200}} value={classFilter} onChange={e=>setClassFilter(e.target.value)}>
          <option value="all">All Classes ({students.length})</option>
          {[...classes].sort((a,b)=>{
            const oa=CLASS_ORDER.indexOf(a.name); const ob=CLASS_ORDER.indexOf(b.name);
            return (oa===-1?999:oa)-(ob===-1?999:ob);
          }).map(c=>{
            const count=students.filter(s=>s.class_id===c.id).length;
            return <option key={c.id} value={c.id}>{c.name} {c.arm||""} ({count})</option>;
          })}
        </select>
        <input style={{...S.input,flex:1}} placeholder="🔍 Search students…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No students found.</div>}
      {pageStudents.map((s,i)=>{
        const cls=classes.find(c=>c.id===s.class_id);
        const prevCls=i>0?classes.find(c=>c.id===pageStudents[i-1].class_id):null;
        const showHeader=classFilter==="all"&&(i===0||cls?.id!==prevCls?.id);
        return(
          <React.Fragment key={s.id}>
            {showHeader&&(
              <div style={{fontWeight:800,fontSize:13,color:"#6366f1",margin:"18px 0 8px",paddingBottom:6,borderBottom:"2px solid #e0e7ff"}}>
                🏫 {cls?`${cls.name} ${cls.arm||""}`:"No Class Assigned"}
              </div>
            )}
          <div style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",marginBottom:8}}>
            <div>
              <div style={{fontWeight:700,color:"#1e293b"}}>{s.full_name}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{cls?`${cls.name} ${cls.arm||""}`:"No class"} • {s.admission_number||"No ID"}</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>👨‍👩‍👧 {s.guardian_name||"—"} • 📱 {s.guardian_phone||"—"}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>startEdit(s)} style={{...S.btn("#0ea5e9"),padding:"6px 12px",fontSize:12}}>Edit</button>
              <button onClick={async()=>{if(window.confirm(`Delete ${s.full_name}?`)){await db.delete("students",s.id);reload();}}} style={{background:"#fee2e2",border:"none",borderRadius:8,color:"#ef4444",padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>Delete</button>
            </div>
          </div>
          </React.Fragment>
        );
      })}
      <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} pageSize={20}/>
        </>
      )}
    </div>
  );
}

// ── Manage Classes ─────────────────────────────────────────────
// Custom subjects override: key = class.id, value = string[]
const customSubjectsStore = {};

function ManageClasses({ classes: classesProp, reload, schoolId, students, terms, planInfo, onUpgrade }) {
  const [adding,setAdding]=useState(false); const [form,setForm]=useState({name:"",arm:"",level:""});
  const [selectedClass,setSelectedClass]=useState(null);
  const [newSubject,setNewSubject]=useState("");
  const [subjectError,setSubjectError]=useState("");
  const [showSuggestions,setShowSuggestions]=useState(false);
  const [savingSubjects,setSavingSubjects]=useState(false);
  const [classesOverride,setClassesOverride]=useState(null);
  const classes = classesOverride || classesProp;
  useEffect(()=>{ setClassesOverride(null); }, [classesProp]);
  const [autoPromoting,setAutoPromoting]=useState(false);
  const [autoResult,setAutoResult]=useState(null);
  const levels=Object.keys(NIGERIAN_SUBJECTS);
  useBackOverride(()=>{ if(selectedClass){setSelectedClass(null);} else {setAdding(false);setForm({name:"",arm:"",level:""}); } }, adding||!!selectedClass);

  const getSubjects=(cls)=> getClassSubjects(cls);

  // Persists this class's subject list to the database (classes.subjects)
  // so every device/session sees the same list — admin edits now show up
  // for teachers immediately, instead of being stuck in one browser's
  // localStorage.
  const saveSubjectsForClass=async(clsId,newSubjectsList)=>{
    setSavingSubjects(true);
    const updated=await db.patch("classes",clsId,{subjects:newSubjectsList});
    setSavingSubjects(false);
    if(updated){
      // Update local state directly instead of calling the global
      // reload() — that re-fetches students/teachers/sessions/terms too
      // and flips a top-level loading flag, which is unnecessary churn
      // for a single class's subject list and was causing the editor
      // to unexpectedly close back to the classes dashboard.
      setSelectedClass(prev=>prev&&prev.id===clsId?{...prev,subjects:newSubjectsList}:prev);
      setClassesOverride(prev=>{
        const base=prev||classes;
        return base.map(c=>c.id===clsId?{...c,subjects:newSubjectsList}:c);
      });
    }else{
      setSubjectError("Could not save — check your connection and try again.");
    }
  };

  const save=async()=>{
    if(!form.name){alert("Please select a class level");return;}
    if(planInfo && !planInfo.canAddClass(classes.length)){
      return alert(`⚠️ Class limit reached (${planInfo.config.classLimit}). Upgrade to Pro for unlimited classes.`);
    }
    await db.post("classes",{...form,school_id:schoolId});
    setForm({name:"",arm:"",level:""});setAdding(false);reload();
  };

  const deleteClass=async(c,e)=>{
    e.stopPropagation();
    if(!window.confirm(`Delete "${c.name} ${c.arm||""}"? This cannot be undone.`)) return;
    await db.delete("classes",c.id); reload();
  };

  // ── Option B+C: Auto-promote all classes when term ends ──────
  const runAutoPromotion=async()=>{
    const currentTerm=terms.find(t=>t.is_current);
    if(!currentTerm){alert("No current term set. Please set a current term first.");return;}
    if(!currentTerm.name.toLowerCase().includes("third")){alert(`Auto-promotion only runs in Third Term.\n\nCurrent term is "${currentTerm.name}". Please set Third Term as current first.`);return;}
    if(!window.confirm(`Auto-promote ALL students for "${currentTerm.name}"?\n\nRules:\n• Avg ≥ 40% = Promoted\n• Avg < 40% = Repeated\n• Must pass English & Maths (avg ≥ 40 each) to promote\n\nThis will update every student's promotion status.`)) return;
    setAutoPromoting(true); setAutoResult(null);
    let promoted=0,repeated=0,errors=0;
    for(const cls of classes){
      const classStudents=students.filter(s=>s.class_id===cls.id);
      if(!classStudents.length) continue;
      const subjects=getSubjects(cls);
      const nextClassName=getNextClassName(cls.name);
      const nextClass=nextClassName?classes.find(c=>c.name===nextClassName):null;
      const ids=classStudents.map(s=>s.id);
      try{
        const [results,remarks]=await Promise.all([
          db.get("results",{term_id:currentTerm.id,student_id:ids}),
          db.get("remarks",{term_id:currentTerm.id,student_id:ids}),
        ]);
        for(const s of classStudents){
          const total=subjects.reduce((a,sub)=>{const r=results.find(x=>x.student_id===s.id&&x.subject_name===sub);return a+(r?.ca_score||0)+(r?.exam_score||0);},0);
          const avg=subjects.length?Math.round(total/subjects.length):0;
          // Rule: must also pass English & Maths individually
          const engRes=results.find(x=>x.student_id===s.id&&(x.subject_name==="English Language"||x.subject_name==="English"));
          const mathRes=results.find(x=>x.student_id===s.id&&(x.subject_name==="Mathematics"||x.subject_name==="Maths"));
          const engScore=engRes?(engRes.ca_score||0)+(engRes.exam_score||0):0;
          const mathScore=mathRes?(mathRes.ca_score||0)+(mathRes.exam_score||0):0;
          const passCoreSubjects = engScore>=40 && mathScore>=40;
          const isFinalClass=!nextClassName;
          const status=isFinalClass?"Graduated":(avg>=40&&passCoreSubjects?"Promoted":"Repeated");
          const rem=remarks.find(r=>r.student_id===s.id);
          if(rem?.id) await db.patch("remarks",rem.id,{promotion_status:status});
          else await db.post("remarks",{student_id:s.id,term_id:currentTerm.id,promotion_status:status});
          if(status==="Promoted"&&nextClass) await db.patch("students",s.id,{class_id:nextClass.id});
          if(status==="Promoted"||status==="Graduated") promoted++; else repeated++;
        }
      }catch(e){errors++;}
    }
    setAutoPromoting(false);
    setAutoResult({promoted,repeated,errors,term:currentTerm.name});
    reload();
  };

  // ── Detail view: subjects editor ────────────────────────────
  if(selectedClass){
    const subjects=getSubjects(selectedClass);
    const addSubject=(value)=>{
      const s=(value??newSubject).trim();
      if(!s){ setSubjectError("Type a subject name first."); return; }
      if(subjects.some(existing=>existing.toLowerCase()===s.toLowerCase())){
        setSubjectError(`"${s}" is already in this class's subject list.`);
        return;
      }
      saveSubjectsForClass(selectedClass.id,[...subjects,s]);
      setNewSubject(""); setSubjectError(""); setShowSuggestions(false);
    };
    const suggestions = newSubject.trim()
      ? ALL_SUBJECTS.filter(s=>s.toLowerCase().includes(newSubject.trim().toLowerCase()) && !subjects.some(ex=>ex.toLowerCase()===s.toLowerCase())).slice(0,6)
      : [];
    const removeSubject=(sub)=>{
      saveSubjectsForClass(selectedClass.id,subjects.filter(s=>s!==sub));
    };
    const resetSubjects=()=>{
      if(!window.confirm("Reset to default subjects for this class?")) return;
      saveSubjectsForClass(selectedClass.id,null);
    };
    return(
      <div>
        <button onClick={()=>setSelectedClass(null)} style={{...S.btn("#64748b"),marginBottom:16}}>← Back to Classes</button>
        <div style={{...S.card,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:20}}>{selectedClass.name} {selectedClass.arm}</div>
          <div style={{opacity:0.85,fontSize:13,marginTop:4}}>{selectedClass.level} • {subjects.length} Subjects</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={S.section("#0ea5e9")}><span>📚</span><span style={{fontWeight:800,color:"#0ea5e9"}}>Subjects ({subjects.length})</span></div>
          {selectedClass.subjects&&selectedClass.subjects.length>0&&<button onClick={resetSubjects} disabled={savingSubjects} style={{...S.btn("#94a3b8"),padding:"5px 10px",fontSize:11,opacity:savingSubjects?0.6:1}}>↺ Reset Default</button>}
        </div>
        {/* Add subject input */}
        <div style={{position:"relative",marginBottom:subjectError?6:16}}>
          <div style={{display:"flex",gap:8}}>
            <input
              style={{...S.input,flex:1,margin:0}}
              value={newSubject}
              onChange={e=>{setNewSubject(e.target.value);setSubjectError("");setShowSuggestions(true);}}
              onFocus={()=>setShowSuggestions(true)}
              onKeyDown={e=>e.key==="Enter"&&addSubject()}
              placeholder="Add new subject… (e.g. type 'phy')"
            />
            <button onClick={()=>addSubject()} disabled={savingSubjects} style={{...S.btn("#10b981"),opacity:savingSubjects?0.6:1}}>{savingSubjects?"Saving…":"+ Add"}</button>
          </div>
          {showSuggestions && suggestions.length>0 && (
            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,marginTop:4,zIndex:20,boxShadow:"0 8px 24px #00000018",maxHeight:220,overflowY:"auto"}}>
              {suggestions.map(s=>(
                <div key={s} onClick={()=>addSubject(s)} style={{padding:"10px 14px",cursor:"pointer",fontSize:13,color:"#374151",borderBottom:"1px solid #f1f5f9"}}>{s}</div>
              ))}
            </div>
          )}
        </div>
        {subjectError && <div style={{color:"#ef4444",fontSize:12,fontWeight:600,marginBottom:16}}>⚠️ {subjectError}</div>}
        {subjects.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No subjects. Add one above.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {subjects.map((sub,i)=>(
            <div key={sub} style={{...S.card,padding:"10px 14px",marginBottom:0,display:"flex",alignItems:"center",gap:12}}>
              <div style={{background:"#e0f2fe",color:"#0ea5e9",fontWeight:800,fontSize:12,borderRadius:8,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
              <div style={{fontWeight:600,color:"#1e293b",fontSize:14,flex:1}}>{sub}</div>
              <button onClick={()=>removeSubject(sub)} style={{background:"#fee2e2",border:"none",borderRadius:8,color:"#ef4444",padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={S.section("#0ea5e9")}><span>🏫</span><span style={{fontWeight:800,color:"#0ea5e9"}}>Classes ({classes.length})</span></div>
        <button onClick={()=>setAdding(!adding)} style={S.btn("#0ea5e9")}>{adding?"Cancel":"+ Add Class"}</button>
      </div>

      {/* Option B+C: Auto-Promotion Panel */}
      <div style={{...S.card,background:"linear-gradient(135deg,#fef3c7,#fffbeb)",border:"1.5px solid #f59e0b",marginBottom:16,padding:16}}>
        <div style={{fontWeight:800,color:"#92400e",fontSize:14,marginBottom:6}}>🤖 Auto-Promotion Engine</div>
        <div style={{fontSize:12,color:"#78350f",marginBottom:10,lineHeight:1.5}}>Runs promotion for <strong>all classes</strong> using the current term. <strong>Only works in Third Term.</strong> Rules: Avg ≥ 40% + pass English & Maths individually = Promoted. Final class = Graduated.</div>
        {autoResult&&(
          <div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:8,padding:10,marginBottom:10,fontSize:12}}>
            <div style={{fontWeight:800,color:"#065f46"}}>✅ Done for {autoResult.term}</div>
            <div style={{color:"#064e3b",marginTop:4}}>🎓 Promoted/Graduated: <strong>{autoResult.promoted}</strong> &nbsp;•&nbsp; 🔁 Repeated: <strong>{autoResult.repeated}</strong>{autoResult.errors>0&&<span style={{color:"#dc2626"}}> &nbsp;•&nbsp; ⚠️ Errors: {autoResult.errors}</span>}</div>
          </div>
        )}
        <button onClick={runAutoPromotion} disabled={autoPromoting} style={{...S.btn("#f59e0b"),width:"100%",padding:"11px",fontSize:13}}>
          {autoPromoting?"⏳ Promoting all students…":"🚀 Run Auto-Promotion for Current Term"}
        </button>
      </div>

      {adding&&(
        <div style={S.card}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div><label style={S.label}>Class Level</label><select style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}><option value="">Select</option>{levels.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
            <div><label style={S.label}>Arm</label><select style={S.input} value={form.arm} onChange={e=>setForm(p=>({...p,arm:e.target.value}))}><option value="">None</option>{["A","B","C","D"].map(a=><option key={a}>{a}</option>)}</select></div>
            <div><label style={S.label}>Level</label><select style={S.input} value={form.level} onChange={e=>setForm(p=>({...p,level:e.target.value}))}><option value="">Select</option><option>Pre-Nursery</option><option>Basic</option><option>Primary</option><option>Junior Secondary</option><option>Senior Secondary</option></select></div>
          </div>
          <button onClick={save} style={{...S.btn("#0ea5e9"),marginTop:16}}>Save Class</button>
        </div>
      )}
      {classes.length===0&&!adding&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No classes yet.</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {classes.map(c=>(
          <div key={c.id} style={{position:"relative"}}>
            <div onClick={()=>{setSelectedClass(c);setNewSubject("");setSubjectError("");setShowSuggestions(false);}} style={{...S.card,padding:"14px 16px",marginBottom:0,cursor:"pointer",transition:"transform 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.02)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
              <div style={{fontWeight:800,color:"#1e293b",fontSize:15,paddingRight:24}}>{c.name} {c.arm}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:3}}>{c.level}</div>
              <div style={{fontSize:11,color:"#0ea5e9",marginTop:3,fontWeight:600}}>{getSubjects(c).length} subjects →</div>
            </div>
            <button onClick={(e)=>deleteClass(c,e)} title="Delete class"
              style={{position:"absolute",top:8,right:8,background:"#fee2e2",border:"none",borderRadius:6,color:"#ef4444",width:22,height:22,cursor:"pointer",fontSize:13,fontWeight:900,lineHeight:"22px",textAlign:"center",padding:0}}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Manage Teachers (with class assignment) ────────────────────
function ManageTeachers({ teachers, classes, reload, schoolId, planInfo, onUpgrade }) {
  const [adding,setAdding]=useState(false); const [form,setForm]=useState({full_name:"",email:"",class_ids:[],password:"",confirm:""});
  const [saving,setSaving]=useState(false);
  const [tPage,setTPage]=useState(1);
  const T_PAGE_SIZE=20;
  const pagedTeachers=teachers.slice((tPage-1)*T_PAGE_SIZE, tPage*T_PAGE_SIZE);
  useBackOverride(()=>{ setAdding(false); setForm({full_name:"",email:"",class_ids:[],password:"",confirm:""}); }, adding);
  const toggleNewClass=(cid)=>{
    setForm(p=>({...p,class_ids: p.class_ids.includes(cid) ? p.class_ids.filter(id=>id!==cid) : [...p.class_ids,cid]}));
  };

  const [editId,setEditId]=useState(null);
  const [editForm,setEditForm]=useState({full_name:"",email:"",new_password:"",class_ids:[]});
  const [editSaving,setEditSaving]=useState(false);
  const startEdit=(t)=>{ setEditForm({full_name:t.full_name,email:t.email,new_password:"",class_ids:t.class_ids&&t.class_ids.length?t.class_ids:(t.class_id?[t.class_id]:[])}); setEditId(t.id); };
  const closeEdit=()=>{ setEditId(null); setEditForm({full_name:"",email:"",new_password:"",class_ids:[]}); };
  const toggleEditClass=(cid)=>{
    setEditForm(p=>({...p,class_ids: p.class_ids.includes(cid) ? p.class_ids.filter(id=>id!==cid) : [...p.class_ids,cid]}));
  };
  const saveEdit=async()=>{
    if(!editForm.full_name.trim()||!editForm.email.trim()){alert("Name and email required");return;}
    if(editForm.new_password && editForm.new_password.length<6){alert("New password must be at least 6 characters");return;}
    setEditSaving(true);
    const payload={
      full_name:sanitize(editForm.full_name),
      email:sanitize(editForm.email),
      class_ids:editForm.class_ids,
      class_id:editForm.class_ids[0]||null, // kept in sync for backward compatibility
    };
    if(editForm.new_password) payload.password=await hashPassword(editForm.new_password);
    await db.patch("users",editId,payload);
    setEditSaving(false);closeEdit();reload();
  };

  const save=async()=>{
    if(!form.full_name.trim()||!form.email.trim()){alert("Name and email required");return;}
    if(!form.password.trim()){alert("Password is required");return;}
    if(form.password!==form.confirm){alert("Passwords do not match");return;}
    if(form.password.length<6){alert("Password must be at least 6 characters");return;}
    if(planInfo && !planInfo.canAddTeacher(teachers.length)){
      return alert(`⚠️ Teacher limit reached (${planInfo.config.teacherLimit}). Upgrade to Pro for unlimited teachers.`);
    }
    setSaving(true);
    const hashedPw = await hashPassword(form.password);
    await db.post("users",{full_name:sanitize(form.full_name),email:sanitize(form.email),password:hashedPw,role:"teacher",school_id:schoolId,class_ids:form.class_ids,class_id:form.class_ids[0]||null});
    setForm({full_name:"",email:"",class_ids:[],password:"",confirm:""});setAdding(false);setSaving(false);reload();
  };
  const classNamesFor=(t)=>{
    const ids = t.class_ids&&t.class_ids.length ? t.class_ids : (t.class_id ? [t.class_id] : []);
    const names = ids.map(id=>classes.find(c=>c.id===id)).filter(Boolean).map(c=>`${c.name} ${c.arm||""}`.trim());
    return names;
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={S.section("#10b981")}><span>👩‍🏫</span><span style={{fontWeight:800,color:"#10b981"}}>Teachers ({teachers.length})</span></div>
        <button onClick={()=>setAdding(!adding)} style={S.btn("#10b981")}>{adding?"Cancel":"+ Add Teacher"}</button>
      </div>
      {adding&&(
        <div style={S.card}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={S.label}>Full Name</label><input style={S.input} value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} placeholder="Teacher's name"/></div>
            <div><label style={S.label}>Email</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="teacher@school.com"/></div>
            <div><label style={S.label}>Password</label><input style={S.input} type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="Min. 6 characters"/></div>
            <div><label style={S.label}>Confirm Password</label><input style={S.input} type="password" value={form.confirm} onChange={e=>setForm(p=>({...p,confirm:e.target.value}))} placeholder="Repeat password"/></div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={S.label}>Assign Classes {form.class_ids.length>1?`(${form.class_ids.length} selected)`:""}</label>
              <div style={{border:"1.5px solid #e2e8f0",borderRadius:10,maxHeight:160,overflowY:"auto",padding:8}}>
                {classes.length===0 && <div style={{fontSize:12,color:"#94a3b8",padding:4}}>No classes created yet.</div>}
                {classes.map(c=>(
                  <label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer",fontSize:13,color:"#374151"}}>
                    <input type="checkbox" checked={form.class_ids.includes(c.id)} onChange={()=>toggleNewClass(c.id)}/>
                    {c.name} {c.arm||""}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button onClick={save} disabled={saving} style={{...S.btn("#10b981"),marginTop:16}}>{saving?"Saving…":"Save Teacher"}</button>
        </div>
      )}
      {teachers.length===0&&!adding&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No teachers yet.</div>}
      {pagedTeachers.map(t=>{
        const names=classNamesFor(t);
        return(
          <div key={t.id} style={{...S.card,padding:"14px 16px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontWeight:700,color:"#1e293b"}}>{t.full_name}</div>
                <div style={{fontSize:12,color:"#64748b"}}>✉️ {t.email}</div>
                <div style={{fontSize:12,color:names.length?"#10b981":"#94a3b8",fontWeight:600,marginTop:4}}>🏫 {names.length?names.join(", "):"No class assigned"}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>startEdit(t)} style={{...S.btn("#0ea5e9"),padding:"6px 12px",fontSize:12}}>Edit</button>
                <button onClick={async()=>{if(window.confirm(`Delete ${t.full_name}?`)){await db.delete("users",t.id);reload();}}} style={{background:"#fee2e2",border:"none",borderRadius:8,color:"#ef4444",padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
      <Pagination page={tPage} totalPages={Math.max(1,Math.ceil(teachers.length/T_PAGE_SIZE))} setPage={setTPage} total={teachers.length} pageSize={T_PAGE_SIZE}/>

      {editId!==null && (
        <div onClick={closeEdit} style={{position:"fixed",inset:0,background:"#00000066",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{...S.card,width:"100%",maxWidth:440,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:800,color:"#1e293b",fontSize:16}}>✏️ Edit Teacher</div>
              <button onClick={closeEdit} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
              <div><label style={S.label}>Full Name</label><input style={S.input} value={editForm.full_name} onChange={e=>setEditForm(p=>({...p,full_name:e.target.value}))}/></div>
              <div><label style={S.label}>Email</label><input style={S.input} type="email" value={editForm.email} onChange={e=>setEditForm(p=>({...p,email:e.target.value}))}/></div>
              <div><label style={S.label}>Reset Password (optional)</label><input style={S.input} type="password" placeholder="Leave blank to keep current password" value={editForm.new_password} onChange={e=>setEditForm(p=>({...p,new_password:e.target.value}))}/></div>
              <div>
                <label style={S.label}>Assigned Classes {editForm.class_ids.length>1?`(${editForm.class_ids.length} selected)`:""}</label>
                <div style={{border:"1.5px solid #e2e8f0",borderRadius:10,maxHeight:200,overflowY:"auto",padding:8}}>
                  {classes.length===0 && <div style={{fontSize:12,color:"#94a3b8",padding:4}}>No classes created yet.</div>}
                  {classes.map(c=>(
                    <label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer",fontSize:13,color:"#374151"}}>
                      <input type="checkbox" checked={editForm.class_ids.includes(c.id)} onChange={()=>toggleEditClass(c.id)}/>
                      {c.name} {c.arm||""}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={closeEdit} style={{...S.btn('#e2e8f0'),color:'#64748b',flex:1}}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} style={{...S.btn("#10b981"),flex:2}}>{editSaving?"Saving…":"Update Teacher"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manage Sessions & Terms ────────────────────────────────────
function ManageSessions({ sessions, terms, reload, schoolId }) {
  const [addSess,setAddSess]=useState(false); const [addTerm,setAddTerm]=useState(false);
  const [sForm,setSForm]=useState({name:""}); const [tForm,setTForm]=useState({name:"",session_id:"",total_days:"62",is_current:false,resumption_date:""});

  const saveSess=async()=>{
    if(!sForm.name.trim()){alert("Session name required e.g. 2024/2025");return;}
    await db.post("sessions",{...sForm,school_id:schoolId});
    setSForm({name:""});setAddSess(false);reload();
  };
  const saveTerm=async()=>{
    if(!tForm.name||!tForm.session_id){alert("Please fill all fields");return;}
    if(tForm.is_current) for(const t of terms.filter(t=>t.is_current)) await db.patch("terms",t.id,{is_current:false});
    await db.post("terms",{...tForm,total_days:Number(tForm.total_days)||62,school_id:schoolId});
    setTForm({name:"",session_id:"",total_days:"62",is_current:false,resumption_date:""});setAddTerm(false);reload();
  };
  const setCurrentTerm=async(id)=>{
    for(const t of terms) await db.patch("terms",t.id,{is_current:t.id===id});
    reload();
  };
  const updateResumption=async(id,date)=>{ await db.patch("terms",id,{resumption_date:date}); reload(); };

  return(
    <div>
      <div style={S.section("#f59e0b")}><span>📅</span><span style={{fontWeight:800,color:"#f59e0b"}}>Academic Sessions & Terms</span></div>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <button onClick={()=>setAddSess(!addSess)} style={S.btn("#f59e0b")}>{addSess?"Cancel":"+ New Session"}</button>
        <button onClick={()=>setAddTerm(!addTerm)} style={S.btn("#6366f1")}>{addTerm?"Cancel":"+ New Term"}</button>
      </div>
      {addSess&&(
        <div style={S.card}>
          <label style={S.label}>Session Name (e.g. 2024/2025)</label>
          <input style={S.input} value={sForm.name} onChange={e=>setSForm({name:e.target.value})} placeholder="2024/2025"/>
          <button onClick={saveSess} style={{...S.btn("#f59e0b"),marginTop:12}}>Save Session</button>
        </div>
      )}
      {addTerm&&(
        <div style={S.card}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={S.label}>Term Name</label><select style={S.input} value={tForm.name} onChange={e=>setTForm(p=>({...p,name:e.target.value}))}><option value="">Select</option><option>First Term</option><option>Second Term</option><option>Third Term</option></select></div>
            <div><label style={S.label}>Session</label><select style={S.input} value={tForm.session_id} onChange={e=>setTForm(p=>({...p,session_id:e.target.value}))}><option value="">Select</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label style={S.label}>Total School Days</label><input style={S.input} type="number" value={tForm.total_days} onChange={e=>setTForm(p=>({...p,total_days:e.target.value}))}/></div>
            <div><label style={S.label}>Next Term Resumption</label><input style={S.input} type="date" value={tForm.resumption_date} onChange={e=>setTForm(p=>({...p,resumption_date:e.target.value}))}/></div>
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
              <input type="checkbox" id="curr" checked={tForm.is_current} onChange={e=>setTForm(p=>({...p,is_current:e.target.checked}))}/>
              <label htmlFor="curr" style={{fontWeight:700,color:"#1e293b"}}>Set as Current Term</label>
            </div>
          </div>
          <button onClick={saveTerm} style={{...S.btn("#6366f1"),marginTop:12}}>Save Term</button>
        </div>
      )}
      {sessions.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No sessions yet.</div>}
      {sessions.map(sess=>(
        <div key={sess.id} style={S.card}>
          <div style={{fontWeight:800,color:"#1e293b",fontSize:16,marginBottom:10}}>📅 {sess.name}</div>
          {terms.filter(t=>t.session_id===sess.id).length===0&&<div style={{fontSize:12,color:"#94a3b8"}}>No terms yet.</div>}
          {terms.filter(t=>t.session_id===sess.id).map(t=>(
            <div key={t.id} style={{padding:"10px 14px",background:t.is_current?"#f0fdf4":"#f8fafc",borderRadius:10,marginBottom:6,border:t.is_current?"1.5px solid #10b981":"1.5px solid #e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <span style={{fontWeight:700}}>{t.name}</span>
                  {t.is_current&&<span style={{...S.badge("#10b981"),marginLeft:8,fontSize:11}}>CURRENT</span>}
                  <div style={{fontSize:12,color:"#64748b"}}>{t.total_days} days</div>
                </div>
                {!t.is_current&&<button onClick={()=>setCurrentTerm(t.id)} style={{...S.btn("#6366f1"),padding:"5px 12px",fontSize:12}}>Set Current</button>}
              </div>
              <div><label style={S.label}>Next Term Resumption Date</label><input type="date" style={{...S.input,padding:"7px 10px"}} value={t.resumption_date||""} onChange={e=>updateResumption(t.id,e.target.value)}/></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── View Results (Principal) ───────────────────────────────────
function ViewResults({ students, classes, terms, school, isPrincipal }) {
  const scale=normalizeGradeScale(school?.grade_scale);
  const [selectedClass,setSelectedClass]=useState("");
  const [selectedTerm,setSelectedTerm]=useState(terms.find(t=>t.is_current)?.id||"");
  const [results,setResults]=useState([]); const [attendance,setAttendance]=useState([]); const [remarks,setRemarks]=useState([]);
  const [loading,setLoading]=useState(false); const [reportStudent,setReportStudent]=useState(null);
  const [generating,setGenerating]=useState(null); const [bulkGenerating,setBulkGenerating]=useState(false);
  const [bulkProgress,setBulkProgress]=useState({done:0,total:0}); const [logoDataUrl,setLogoDataUrl]=useState(null);

  const classStudents=students.filter(s=>s.class_id===selectedClass);
  const cls=classes.find(c=>c.id===selectedClass);
  const subjects=getClassSubjects(cls);
  const term=terms.find(t=>t.id===selectedTerm);

  useEffect(()=>{
    if(!school?.logo_url){setLogoDataUrl(null);return;}
    fetch(school.logo_url).then(r=>r.blob()).then(blob=>new Promise(res=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.readAsDataURL(blob);})).then(setLogoDataUrl).catch(()=>setLogoDataUrl(null));
  },[school?.logo_url]);

  useEffect(()=>{
    if(!selectedClass||!selectedTerm) return;
    setLoading(true);
    const ids=students.filter(s=>s.class_id===selectedClass).map(s=>s.id);
    if(!ids.length){setResults([]);setAttendance([]);setRemarks([]);setLoading(false);return;}
    Promise.all([
      db.get("results",{term_id:selectedTerm,student_id:ids}),
      db.get("attendance",{term_id:selectedTerm,student_id:ids}),
      db.get("remarks",{term_id:selectedTerm,student_id:ids}),
    ]).then(([r,a,rem])=>{setResults(r);setAttendance(a);setRemarks(rem);setLoading(false);});
  },[selectedClass,selectedTerm]);

  const getStudentResults=(sid)=>subjects.map(sub=>{
    const r=results.find(r=>r.student_id===sid&&r.subject_name===sub);
    return {subject:sub,ca:r?.ca_score||0,exam:r?.exam_score||0,total:(r?.ca_score||0)+(r?.exam_score||0)};
  });
  const getPosition=(sid)=>{
    const totals=classStudents.map(s=>({id:s.id,total:getStudentResults(s.id).reduce((a,r)=>a+r.total,0)})).sort((a,b)=>b.total-a.total);
    return totals.findIndex(t=>t.id===sid)+1;
  };

  const REMARK_TEMPLATES=[
    "Excellent performance. Keep it up!",
    "Very good effort. Continue to strive for excellence.",
    "Good work. There is room for improvement.",
    "Fair performance. More effort is needed.",
    "Below expectation. Please put in more effort next term.",
    "Outstanding result. We are proud of you.",
    "Satisfactory performance. Aim higher next term.",
  ];
  const [bulkRemarkModal,setBulkRemarkModal]=useState(false);
  const [bulkRemarkText,setBulkRemarkText]=useState("");
  const [bulkRemarkTarget,setBulkRemarkTarget]=useState("class");

  const handleGenerate=async(student)=>{
    setGenerating(student.id);
    try{
      // Always pull the freshest remark from the DB right before generating —
      // in-memory `remarks` state can be stale if a save (onBlur) is still
      // in flight when this is clicked, which previously baked old remarks into the PDF.
      const freshRemarks=await db.get("remarks",{student_id:student.id,term_id:selectedTerm});
      const rem=freshRemarks[0]||remarks.find(r=>r.student_id===student.id);
      if(!rem?.principal_remark){setGenerating(null);alert("⛔ Principal's remark required before sending.\n\nAdd a remark for this student first.");return;}
      const cls2=classes.find(c=>c.id===student.class_id);
      const subs=getClassSubjects(cls2);
      const att=attendance.find(a=>a.student_id===student.id);
      const blob=await generateReportPDF(student,cls2,term,subs,results.filter(r=>r.student_id===student.id),att,rem,classStudents,results,school,logoDataUrl);
      await uploadAndSaveReport(blob,student,term,rem?.id,school?.id);
      await sharePDFFile(blob,student,term,student.guardian_name);
    }catch(e){alert("Error: "+e.message);}
    setGenerating(null);
  };

  const handleBulk=async()=>{
    if(!classStudents.length) return;
    const missing=classStudents.filter(s=>!remarks.find(r=>r.student_id===s.id)?.principal_remark);
    if(missing.length){alert(`⛔ ${missing.length} student(s) missing principal remark.\n${missing.map(s=>s.full_name).join("\n")}`);return;}
    if(!window.confirm(`Generate & share all ${classStudents.length} report cards?`)) return;
    setBulkGenerating(true); setBulkProgress({done:0,total:classStudents.length});
    for(let i=0;i<classStudents.length;i++){
      const student=classStudents[i];
      const att=attendance.find(a=>a.student_id===student.id);
      const rem=remarks.find(r=>r.student_id===student.id);
      try{
        const blob=await generateReportPDF(student,cls,term,subjects,results.filter(r=>r.student_id===student.id),att,rem,classStudents,results,school,logoDataUrl);
        await uploadAndSaveReport(blob,student,term,rem?.id,school?.id);
        await new Promise(r=>setTimeout(r,600));
      }catch(e){console.error(e);}
      setBulkProgress({done:i+1,total:classStudents.length});
    }
    setBulkGenerating(false); alert("✅ All report cards generated & uploaded!");
  };

  const [savingRemark,setSavingRemark]=useState(false);
  const [remarkSaveError,setRemarkSaveError]=useState('');
  const updatePrincipalRemark=async(sid,remark)=>{
    setSavingRemark(true);setRemarkSaveError('');
    try{
      const rem=remarks.find(r=>r.student_id===sid);
      const result = await db.upsert("remarks",{
        ...(rem?.id ? {id:rem.id} : {}),
        student_id:sid,
        term_id:selectedTerm,
        principal_remark:remark,
      }, "student_id,term_id");
      if(!result){ setRemarkSaveError('Could not save — check your connection and try again.'); }
      try{
        setRemarks(await db.get("remarks",{term_id:selectedTerm,student_id:classStudents.map(s=>s.id)}));
      }catch(refreshErr){
        // Save itself succeeded even if this refresh fails — don't show
        // a false error, the next normal reload will pick up the change.
      }
    }catch(e){
      setRemarkSaveError('Could not save — check your connection and try again.');
    }finally{
      setSavingRemark(false);
    }
  };

  const applyBulkRemark=async()=>{
    if(!bulkRemarkText.trim()){alert("Please enter or select a remark");return;}
    const targets=bulkRemarkTarget==="class"?classStudents:[classStudents.find(s=>s.id===bulkRemarkTarget)].filter(Boolean);
    for(const student of targets){
      const rem=remarks.find(r=>r.student_id===student.id);
      if(rem?.id) await db.patch("remarks",rem.id,{principal_remark:bulkRemarkText});
      else await db.post("remarks",{student_id:student.id,term_id:selectedTerm,principal_remark:bulkRemarkText});
    }
    setRemarks(await db.get("remarks",{term_id:selectedTerm,student_id:classStudents.map(s=>s.id)}));
    setBulkRemarkModal(false); setBulkRemarkText("");
  };

  if(reportStudent){
    const att=attendance.find(a=>a.student_id===reportStudent.id);
    const rem=remarks.find(r=>r.student_id===reportStudent.id);
    const sResults=getStudentResults(reportStudent.id);
    const totalMarks=sResults.reduce((a,r)=>a+r.total,0);
    const avg=sResults.length?Math.round(totalMarks/sResults.length):0;
    const pos=getPosition(reportStudent.id);
    const overall=getGrade(avg,scale);
    const promotionStatus=rem?.promotion_status||(avg>=40?"Promoted":"Repeated");
    return(
      <div>
        <div style={{display:"flex",gap:8,padding:"12px 0",flexWrap:"wrap"}}>
          <button onClick={()=>setReportStudent(null)} style={S.btn("#64748b")}>← Back</button>
          <button onClick={()=>{ if(isPrincipal&&!rem?.principal_remark){alert("⛔ Principal's remark required before printing.\n\nAdd a remark for this student first.");return;} window.print(); }} style={S.btn("#10b981")}>🖨 Print</button>
          <button onClick={()=>handleGenerate(reportStudent)} disabled={!!generating} style={S.btn("#25d366")}>{generating===reportStudent.id?"⏳ Generating…":"📤 PDF & Share"}</button>
        </div>
        {isPrincipal&&(
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontWeight:700,color:"#1e293b",marginBottom:8}}>🏛 Principal's Remark {!rem?.principal_remark&&<span style={{color:"#ef4444",fontSize:11}}>* Required before sending</span>} {savingRemark&&<span style={{color:"#6366f1",fontSize:11}}>· Saving…</span>}</div>
            <textarea key={reportStudent.id+'-'+(rem?.principal_remark||'')} style={{...S.input,height:60,resize:"vertical"}} defaultValue={rem?.principal_remark||""} onBlur={e=>updatePrincipalRemark(reportStudent.id,e.target.value)} placeholder="Type remark or pick template below…"/>
            {remarkSaveError && <div style={{color:"#ef4444",fontSize:11,marginTop:4,fontWeight:600}}>⚠️ {remarkSaveError}</div>}
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
              {REMARK_TEMPLATES.map(t=>(
                <button key={t} onClick={()=>updatePrincipalRemark(reportStudent.id,t)} style={{background:rem?.principal_remark===t?"#dbeafe":"#f1f5f9",border:rem?.principal_remark===t?"1px solid #6366f1":"1px solid #e2e8f0",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",color:rem?.principal_remark===t?"#4338ca":"#475569",fontWeight:rem?.principal_remark===t?700:400}}>{t}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>Tap template to apply instantly. Or type and click outside.</div>
          </div>
        )}
        <div id="report-card" style={{background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 8px 40px #0000001a",fontFamily:"Georgia,serif"}}>
          <div style={{background:"linear-gradient(135deg,#1e3a8a,#6366f1)",padding:"32px 32px 24px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:16}}>
            {school?.logo_url&&<img src={school.logo_url} alt="logo" style={{width:60,height:60,objectFit:"contain",borderRadius:8}}/>}
            <div>
              <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff",textTransform:"uppercase"}}>{school?.name||"School"}</h1>
              <div style={{width:50,height:3,background:"#fbbf24",margin:"10px auto 8px",borderRadius:2}}/>
              <h2 style={{margin:0,fontSize:14,color:"#fbbf24",letterSpacing:"0.15em",textTransform:"uppercase"}}>Academic Report Card</h2>
              <div style={{color:"#c7d2fe",fontSize:13,marginTop:8}}>{term?.name} • {cls?.name} {cls?.arm||""}</div>
            </div>
          </div>
          <div style={{padding:"16px",background:"#f8faff",borderBottom:"2px solid #e0e7ff",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Student Name",reportStudent.full_name],["Admission No",reportStudent.admission_number||"—"],["Class",`${cls?.name||""} ${cls?.arm||""}`],["Gender",reportStudent.gender||"—"],["Date of Birth",reportStudent.date_of_birth||"—"],["Parent/Guardian",reportStudent.guardian_name||"—"]].map(([l,v])=>(
              <div key={l} style={{borderLeft:"3px solid #6366f1",paddingLeft:8,minWidth:0}}>
                <div style={{fontSize:9,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"sans-serif"}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginTop:2,fontFamily:"sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 16px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",minWidth:360,borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:11}}>
              <thead><tr style={{background:"linear-gradient(135deg,#1e3a8a,#4338ca)"}}>
                {["Subject","C.A","Exam","Total","Grd","Rmk"].map((h,i)=><th key={h} style={{padding:"7px 4px",color:"#fff",textAlign:i===0?"left":"center",fontWeight:700,fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {sResults.map((r,i)=>{
                  const g=getGrade(r.total,scale);
                  return(<tr key={r.subject} style={{background:i%2===0?"#fff":"#f8faff"}}>
                    <td style={{padding:"7px 4px",fontWeight:700,color:"#1e293b",fontSize:11}}>{r.subject}</td>
                    <td style={{padding:"7px 4px",textAlign:"center",color:"#475569",fontSize:11}}>{r.ca}</td>
                    <td style={{padding:"7px 4px",textAlign:"center",color:"#475569",fontSize:11}}>{r.exam}</td>
                    <td style={{padding:"7px 4px",textAlign:"center",fontWeight:800,color:g.col,fontSize:12}}>{r.total}</td>
                    <td style={{padding:"7px 4px",textAlign:"center"}}><span style={{...S.badge(g.col),fontSize:9,padding:"2px 5px"}}>{g.g}</span></td>
                    <td style={{padding:"7px 4px",textAlign:"center",color:g.col,fontWeight:600,fontSize:9,whiteSpace:"nowrap"}}>{g.r}</td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"0 16px 20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[["Total",totalMarks,"#6366f1"],["Average",`${avg}%`,"#0ea5e9"],["Position",pos?`${ordinal(pos)} of ${classStudents.length}`:"—","#f59e0b"],["Attendance",att?`${att.days_present}/${att.total_days||"—"}`:"—","#10b981"],["Overall",overall.g,overall.col],["Status",promotionStatus||"—",promotionStatus==="Promoted"?"#10b981":promotionStatus==="Repeated"?"#ef4444":"#94a3b8"]].map(([l,v,col])=>(
              <div key={l} style={{background:`${col}10`,border:`1.5px solid ${col}30`,borderRadius:10,padding:12,textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"sans-serif"}}>{l}</div>
                <div style={{fontSize:16,fontWeight:900,color:col,marginTop:2,fontFamily:"sans-serif"}}>{v}</div>
              </div>
            ))}
          </div>
          {(rem?.teacher_remark||rem?.principal_remark)&&(
            <div style={{margin:"0 16px 20px",fontFamily:"sans-serif"}}>
              {rem?.teacher_remark&&<div style={{background:"#f0fdf4",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #10b981",marginBottom:10}}><div style={{fontSize:11,fontWeight:800,color:"#10b981",textTransform:"uppercase",marginBottom:4}}>🧑‍🏫 Class Teacher</div><p style={{margin:0,color:"#374151",fontSize:13}}>{rem.teacher_remark}</p></div>}
              {rem?.principal_remark&&<div style={{background:"#eff6ff",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #3b82f6"}}><div style={{fontSize:11,fontWeight:800,color:"#3b82f6",textTransform:"uppercase",marginBottom:4}}>🏛 Principal</div><p style={{margin:0,color:"#374151",fontSize:13}}>{rem.principal_remark}</p></div>}
            </div>
          )}
          {term?.resumption_date&&(
            <div style={{margin:"0 16px 20px",background:"#fff7ed",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #f59e0b",fontFamily:"sans-serif"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#f59e0b",textTransform:"uppercase",marginBottom:4}}>📅 Next Term Resumption</div>
              <p style={{margin:0,color:"#92400e",fontSize:14,fontWeight:700}}>{term.resumption_date}</p>
            </div>
          )}
          <div style={{margin:"0 16px 24px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontFamily:"sans-serif"}}>
            {["Class Teacher","Principal","Parent/Guardian"].map(sig=>(
              <div key={sig} style={{textAlign:"center"}}><div style={{borderTop:"2px solid #cbd5e1",paddingTop:8}}><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{sig}</div><div style={{fontSize:10,color:"#cbd5e1"}}>Signature & Date</div></div></div>
            ))}
          </div>
          <div style={{background:"linear-gradient(135deg,#1e3a8a,#3730a3)",padding:"12px 16px",textAlign:"center",fontFamily:"sans-serif"}}>
            <p style={{margin:0,color:"#c7d2fe",fontSize:11}}>{school?.name||"School"} • Official Academic Report Card • {term?.name}</p>
          </div>
        </div>
        <style>{`@media print{body *{visibility:hidden;}#report-card,#report-card *{visibility:visible;}#report-card{position:fixed;top:0;left:0;width:100%;box-shadow:none;border-radius:0;margin:0;}}`}</style>
      </div>
    );
  }

  return(
    <div>
      <div style={S.section("#8b5cf6")}><span>📋</span><span style={{fontWeight:800,color:"#8b5cf6"}}>View & Generate Report Cards</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div><label style={S.label}>Select Class</label><select style={S.input} value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}><option value="">Choose class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}</select></div>
        <div><label style={S.label}>Select Term</label><select style={S.input} value={selectedTerm} onChange={e=>setSelectedTerm(e.target.value)}><option value="">Choose term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_current?" (Current)":""}</option>)}</select></div>
      </div>
      {selectedClass&&classStudents.length>0&&(
        <div style={{marginBottom:16}}>
          {bulkGenerating?(
            <div style={{...S.card,textAlign:"center"}}>
              <div style={{fontWeight:700,color:"#6366f1",marginBottom:8}}>⏳ Generating… {bulkProgress.done} / {bulkProgress.total}</div>
              <div style={{background:"#e0e7ff",borderRadius:10,height:10}}><div style={{background:"#6366f1",height:"100%",width:`${(bulkProgress.done/bulkProgress.total)*100}%`,borderRadius:10,transition:"width 0.3s"}}/></div>
            </div>
          ):(
            <div>
            <button onClick={handleBulk} style={{...S.btn("#6366f1"),width:"100%",padding:"12px"}}>📦 Bulk Generate & Upload — All {classStudents.length} Report Cards</button>
            {isPrincipal&&<button onClick={()=>setBulkRemarkModal(true)} style={{...S.btn("#f59e0b"),width:"100%",padding:"12px",marginTop:8}}>🏛 Bulk Add Principal Remarks</button>}
            {bulkRemarkModal&&(
              <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:9999,display:"flex",alignItems:"flex-end"}} onClick={()=>setBulkRemarkModal(false)}>
                <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                  <div style={{fontWeight:800,fontSize:16,marginBottom:12}}>🏛 Bulk Principal Remarks</div>
                  <div style={{marginBottom:12}}>
                    <label style={S.label}>Apply to</label>
                    <select style={S.input} value={bulkRemarkTarget} onChange={e=>setBulkRemarkTarget(e.target.value)}>
                      <option value="class">Entire Class ({classStudents.length} students)</option>
                      {classStudents.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={S.label}>Choose Template</label>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {REMARK_TEMPLATES.map(t=>(
                        <button key={t} onClick={()=>setBulkRemarkText(t)} style={{background:bulkRemarkText===t?"#e0e7ff":"#f8fafc",border:`1.5px solid ${bulkRemarkText===t?"#6366f1":"#e2e8f0"}`,borderRadius:10,padding:"10px 14px",textAlign:"left",cursor:"pointer",fontSize:13,color:"#1e293b"}}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:16}}>
                    <label style={S.label}>Or Type Custom Remark</label>
                    <textarea style={{...S.input,height:60}} value={bulkRemarkText} onChange={e=>setBulkRemarkText(e.target.value)} placeholder="Type custom remark…"/>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setBulkRemarkModal(false)} style={{...S.btn("#94a3b8"),flex:1}}>Cancel</button>
                    <button onClick={applyBulkRemark} style={{...S.btn("#6366f1"),flex:2}}>✅ Apply Remark</button>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      )}
      {loading&&<div style={{textAlign:"center",padding:40,color:"#64748b"}}>Loading results…</div>}
      {!loading&&selectedClass&&classStudents.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No students in this class.</div>}
      {!loading&&selectedClass&&classStudents.map(s=>{
        const sRes=getStudentResults(s.id);
        const total=sRes.reduce((a,r)=>a+r.total,0);
        const avg=sRes.length?Math.round(total/sRes.length):0;
        const g=getGrade(avg,scale); const pos=getPosition(s.id);
        const rem=remarks.find(r=>r.student_id===s.id);
        return(
          <div key={s.id} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",marginBottom:8}}>
            <div>
              <div style={{fontWeight:700,color:"#1e293b"}}>{s.full_name}</div>
              <div style={{fontSize:12,color:"#64748b"}}>Avg: {avg}% • <span style={{color:g.col,fontWeight:700}}>{g.g}</span> • {ordinal(pos)} of {classStudents.length}</div>
              {rem?.promotion_status&&<div style={{fontSize:11,color:rem.promotion_status==="Promoted"?"#10b981":"#ef4444",fontWeight:700,marginTop:2}}>{rem.promotion_status==="Promoted"?"✅":"🔁"} {rem.promotion_status}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setReportStudent(s)} style={S.btn("#8b5cf6")}>👁 View</button>
              <button onClick={()=>handleGenerate(s)} disabled={!!generating} style={S.btn("#25d366")}>{generating===s.id?"⏳":"📥 PDF"}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Messages ───────────────────────────────────────────────────
function Messages({ students, classes, school }) {
  const [msgType,setMsgType]=useState("School Resumption");
  const [message,setMessage]=useState(MESSAGE_TEMPLATES["School Resumption"]);
  const [sendTo,setSendTo]=useState("all"); const [selectedClass,setSelectedClass]=useState("");
  const [selectedStudent,setSelectedStudent]=useState(""); const [recipients,setRecipients]=useState([]);
  const [phase,setPhase]=useState("compose"); const [currentIndex,setCurrentIndex]=useState(0); const [sent,setSent]=useState(0);

  useEffect(()=>setMessage(MESSAGE_TEMPLATES[msgType]||""),[msgType]);
  useEffect(()=>{
    let list=[];
    if(sendTo==="all") list=students.filter(s=>s.guardian_phone);
    else if(sendTo==="class"&&selectedClass) list=students.filter(s=>s.class_id===selectedClass&&s.guardian_phone);
    else if(sendTo==="individual"&&selectedStudent){const s=students.find(s=>s.id===selectedStudent);if(s?.guardian_phone)list=[s];}
    setRecipients(list);
  },[sendTo,selectedClass,selectedStudent,students]);

  const sendNext=(index)=>{
    const student=recipients[index];
    const phone=student.guardian_phone?.replace(/\D/g,"");
    const schoolName=school?.name||"School";
    const personalMsg=message.replace("[PARENT]",student.guardian_name||"Parent").replace("[STUDENT]",student.full_name).replace("[SCHOOL]",schoolName);
    window.open(`https://wa.me/234${phone?.slice(-10)}?text=${encodeURIComponent(personalMsg)}`,"_blank");
    setCurrentIndex(index);setSent(index+1);
  };
  const startSending=()=>{if(!message.trim()){alert("Please type a message");return;}if(!recipients.length){alert("No recipients");return;}setPhase("sending");sendNext(0);};
  const handleNext=()=>{const next=currentIndex+1;if(next>=recipients.length)setPhase("done");else sendNext(next);};
  const reset=()=>{setPhase("compose");setSent(0);setCurrentIndex(0);};

  if(phase==="done") return(
    <div style={{textAlign:"center",padding:40}}>
      <div style={{fontSize:64,marginBottom:16}}>🎉</div>
      <h2 style={{color:"#1e293b",marginBottom:8}}>All Messages Sent!</h2>
      <p style={{color:"#64748b",marginBottom:24}}>Sent to {sent} parent{sent!==1?"s":""} via WhatsApp</p>
      <button onClick={reset} style={{...S.btn("#6366f1"),padding:"12px 28px"}}>Send Another Message</button>
    </div>
  );

  if(phase==="sending"){
    const current=recipients[currentIndex];
    const clsName=classes.find(c=>c.id===current?.class_id);
    return(
      <div>
        <div style={S.section("#25d366")}><span>📨</span><span style={{fontWeight:800,color:"#25d366"}}>Sending — {sent} of {recipients.length}</span></div>
        <div style={{background:"#e2e8f0",borderRadius:10,height:10,marginBottom:20}}><div style={{background:"#25d366",height:"100%",width:`${(sent/recipients.length)*100}%`,borderRadius:10,transition:"width 0.3s"}}/></div>
        <div style={{...S.card,textAlign:"center",padding:28}}>
          <div style={{fontSize:40,marginBottom:8}}>📱</div>
          <div style={{fontSize:18,fontWeight:800,color:"#1e293b"}}>{current?.full_name}</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Guardian: {current?.guardian_name} • {clsName?.name} {clsName?.arm||""}</div>
          <div style={{fontSize:15,fontWeight:700,color:"#25d366",marginBottom:16}}>{current?.guardian_phone}</div>
          <p style={{color:"#94a3b8",fontSize:12,marginBottom:20}}>WhatsApp has opened. After sending, tap Next.</p>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={handleNext} style={S.btn("#25d366")}>{currentIndex+1>=recipients.length?"✅ Done":"Next →"}</button>
            <button onClick={()=>sendNext(currentIndex)} style={S.btn("#6366f1")}>🔄 Resend</button>
            <button onClick={reset} style={S.btn("#64748b")}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={S.section("#25d366")}><span>📨</span><span style={{fontWeight:800,color:"#25d366"}}>Send Message to Parents</span></div>
      <div style={S.card}>
        <div style={{marginBottom:16}}><label style={S.label}>Message Type</label><select style={S.input} value={msgType} onChange={e=>setMsgType(e.target.value)}>{Object.keys(MESSAGE_TEMPLATES).map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={{marginBottom:16}}><label style={S.label}>Message</label><textarea style={{...S.input,height:120,resize:"vertical"}} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Type your message…"/><div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Use [PARENT], [STUDENT], [SCHOOL] as placeholders</div></div>
        <div style={{marginBottom:16}}>
          <label style={S.label}>Send To</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[{id:"all",label:`All Parents (${students.filter(s=>s.guardian_phone).length})`},{id:"class",label:"Specific Class"},{id:"individual",label:"One Parent"}].map(o=>(
              <button key={o.id} onClick={()=>setSendTo(o.id)} style={{...S.btn(sendTo===o.id?"#6366f1":"#e2e8f0"),color:sendTo===o.id?"#fff":"#475569",padding:"8px 14px",fontSize:13}}>{o.label}</button>
            ))}
          </div>
        </div>
        {sendTo==="class"&&<div style={{marginBottom:16}}><label style={S.label}>Select Class</label><select style={S.input} value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}><option value="">Choose class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}</select></div>}
        {sendTo==="individual"&&<div style={{marginBottom:16}}><label style={S.label}>Select Student</label><select style={S.input} value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Choose student</option>{students.filter(s=>s.guardian_phone).map(s=><option key={s.id} value={s.id}>{s.full_name} — {s.guardian_name}</option>)}</select></div>}
      </div>
      {recipients.length>0&&(
        <div style={S.card}>
          <div style={{fontWeight:800,color:"#1e293b",marginBottom:12}}>👥 Recipients ({recipients.length})</div>
          {recipients.slice(0,5).map(r=>{
            const clsName=classes.find(c=>c.id===r.class_id);
            return(<div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
              <div><div style={{fontSize:13,fontWeight:700}}>{r.full_name}</div><div style={{fontSize:12,color:"#64748b"}}>{r.guardian_name} • {clsName?.name} {clsName?.arm||""}</div></div>
              <div style={{fontSize:13,color:"#25d366",fontWeight:600}}>📱 {r.guardian_phone}</div>
            </div>);
          })}
          {recipients.length>5&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",paddingTop:8}}>+{recipients.length-5} more</div>}
        </div>
      )}
      <button onClick={startSending} disabled={!recipients.length||!message.trim()} style={{...S.btn("#25d366"),width:"100%",padding:"16px",fontSize:16,opacity:(!recipients.length||!message.trim())?0.5:1}}>
        💬 Send to {recipients.length} Parent{recipients.length!==1?"s":""} via WhatsApp
      </button>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────
function Overview({ students, classes, teachers, terms, school, onNavigate }) {
  const currentTerm=terms.find(t=>t.is_current);
  const [hovered,setHovered]=useState(null);
  const cards=[
    {label:"Total Students",value:students.length,icon:"👨‍🎓",col:"#6366f1",tab:"students",hint:"Manage students →"},
    {label:"Total Classes",value:classes.length,icon:"🏫",col:"#0ea5e9",tab:"classes",hint:"Manage classes →"},
    {label:"Total Teachers",value:teachers.length,icon:"👩‍🏫",col:"#10b981",tab:"teachers",hint:"Manage teachers →"},
    {label:"Current Term",value:currentTerm?.name||"Not set",icon:"📅",col:"#f59e0b",tab:"settings",hint:"Manage sessions →"},
  ];
  return(
    <div>
      <div style={S.section()}><span style={{fontSize:18}}>📊</span><span style={{fontWeight:800,color:"#6366f1",fontSize:15}}>School Overview</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {cards.map(s=>{
          const isHov=hovered===s.label;
          return(
            <div
              key={s.label}
              onClick={()=>onNavigate(s.tab)}
              onMouseEnter={()=>setHovered(s.label)}
              onMouseLeave={()=>setHovered(null)}
              onTouchStart={()=>setHovered(s.label)}
              onTouchEnd={()=>setHovered(null)}
              style={{
                background: isHov ? `${s.col}20` : `${s.col}10`,
                border:`2px solid ${isHov?s.col:`${s.col}40`}`,
                borderRadius:14,padding:16,textAlign:"center",
                cursor:"pointer",
                transform: isHov?"translateY(-2px)":"none",
                transition:"all 0.18s ease",
                boxShadow: isHov?`0 6px 20px ${s.col}30`:"none",
                position:"relative",overflow:"hidden",
              }}
            >
              <div style={{fontSize:28}}>{s.icon}</div>
              <div style={{fontSize:22,fontWeight:900,color:s.col}}>{s.value}</div>
              <div style={{fontSize:12,color:"#64748b",fontWeight:600}}>{s.label}</div>
              <div style={{
                fontSize:10,color:s.col,fontWeight:700,marginTop:6,
                opacity: isHov?1:0,
                transition:"opacity 0.18s ease",
                letterSpacing:"0.03em",
              }}>{s.hint}</div>
            </div>
          );
        })}
      </div>
      {currentTerm?.resumption_date&&(
        <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:14,padding:16,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#92400e",fontWeight:700}}>📅 Next Term Resumes</div>
          <div style={{fontSize:20,fontWeight:900,color:"#ea580c"}}>{currentTerm.resumption_date}</div>
        </div>
      )}
    </div>
  );
}


// ── Notification Bell ─────────────────────────────────────────
function NotificationBell({ schoolId }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    const data = await db.get("notifications", { school_id: schoolId });
    data.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    setNotifs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [schoolId]);

  const unread = notifs.filter(n => !n.read).length;

  const markRead = async (n) => {
    if (!n.read) {
      await db.patch("notifications", n.id, { read: true });
      setNotifs(p => p.map(x => x.id === n.id ? {...x, read:true} : x));
    }
  };

  const markAll = async () => {
    const unreadList = notifs.filter(n => !n.read);
    for (const n of unreadList) await db.patch("notifications", n.id, { read: true });
    setNotifs(p => p.map(x => ({...x, read:true})));
  };

  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => { setOpen(o => !o); load(); }}
        style={{ background:"#ffffff18", border:"1px solid #ffffff25", borderRadius:12, width:42, height:42, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, position:"relative", flexShrink:0 }}>
        🔔
        {unread > 0 && (
          <div style={{ position:"absolute", top:6, right:6, width:16, height:16, borderRadius:"50%", background:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:900, color:"#fff", border:"2px solid #1e3a8a" }}>{unread > 9 ? "9+" : unread}</div>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, zIndex:400 }}/>
          <div style={{ position:"fixed", top:62, right:0, width:300, maxHeight:"70vh", background:"#fff", borderRadius:"0 0 0 16px", boxShadow:"-4px 4px 30px #00000025", zIndex:500, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:14, color:"#1e293b" }}>🔔 Notifications {unread > 0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:20, padding:"1px 7px", fontSize:11 }}>{unread}</span>}</div>
              {unread > 0 && <button onClick={markAll} style={{ background:"none", border:"none", color:"#6366f1", fontSize:11, fontWeight:700, cursor:"pointer" }}>Mark all read</button>}
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {loading && <div style={{ padding:20, textAlign:"center", color:"#94a3b8", fontSize:13 }}>Loading…</div>}
              {!loading && notifs.length === 0 && <div style={{ padding:24, textAlign:"center", color:"#94a3b8", fontSize:13 }}>No notifications yet</div>}
              {notifs.map(n => (
                <div key={n.id} onClick={() => markRead(n)}
                  style={{ padding:"12px 16px", borderBottom:"1px solid #f8fafc", background: n.read ? "#fff" : "#eef2ff", cursor:"pointer" }}>
                  <div style={{ fontSize:12, color: n.read ? "#64748b" : "#1e293b", fontWeight: n.read ? 400 : 700, lineHeight:1.4 }}>{n.message}</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:4 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sidebar Layout Shell ───────────────────────────────────────
function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);
  const [expanded, setExpanded]             = useState(false);
  const [installed, setInstalled]           = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;
    const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
    if (dismissed) return;
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setVisible(true); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    sessionStorage.setItem('pwa_banner_dismissed', '1');
    setVisible(false);
  };

  if (!visible || installed) return null;

  return (
    <div style={{
      position:'fixed', bottom:16, right:16, zIndex:9000,
      display:'flex', flexDirection:'column', alignItems:'flex-end',
      filter:'drop-shadow(0 4px 16px rgba(0,0,0,0.18))',
    }}>
      {expanded ? (
        <div style={{
          background:'#1e3a8a', borderRadius:16, padding:'16px',
          width:220, color:'#fff',
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:22}}>📲</span>
              <span style={{fontWeight:800,fontSize:13}}>Install App</span>
            </div>
            <button onClick={handleDismiss} style={{background:'#ffffff25',border:'none',color:'#fff',borderRadius:6,width:24,height:24,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
          <div style={{fontSize:11,color:'#a5b4fc',marginBottom:12,lineHeight:1.5}}>
            Install School Resource Center on your home screen for faster access and offline use.
          </div>
          <button onClick={handleInstall}
            style={{background:'#6366f1',border:'none',color:'#fff',borderRadius:10,padding:'10px',width:'100%',fontWeight:800,fontSize:13,cursor:'pointer'}}>
            Install Now
          </button>
          <button onClick={() => setExpanded(false)}
            style={{background:'none',border:'none',color:'#a5b4fc',fontSize:11,width:'100%',marginTop:8,cursor:'pointer',padding:4}}>
            Maybe later
          </button>
        </div>
      ) : (
        <div onClick={() => setExpanded(true)} style={{
          background:'#1e3a8a', borderRadius:50, padding:'8px 14px',
          display:'flex', alignItems:'center', gap:6, cursor:'pointer',
          color:'#fff', fontSize:12, fontWeight:700,
        }}>
          <span style={{fontSize:18}}>📲</span>
          <span>Install</span>
          <button onClick={handleDismiss} style={{background:'#ffffff25',border:'none',color:'#fff',borderRadius:50,width:18,height:18,cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',padding:0,marginLeft:2}}>✕</button>
        </div>
      )}
    </div>
  );
}

function SyncBanner() {
  const { online, pendingCount, failedCount, syncing, lastSync, flush, retryFailed: retry } = useSyncEngine();
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [failedItems, setFailedItems] = useState([]);

  useEffect(() => { setDismissed(false); }, [online, pendingCount, failedCount]);

  const loadFailedDetails = async () => {
    const items = await offlineDB.queue.where('status').equals('failed').toArray();
    setFailedItems(items);
    setShowDetails(true);
  };

  const discardFailed = async (id) => {
    await offlineDB.queue.delete(id);
    setFailedItems(items => items.filter(i => i.id !== id));
  };

  if (dismissed) return null;
  if (online && pendingCount === 0 && failedCount === 0) return null;

  const bg      = !online ? '#92400e' : failedCount > 0 ? '#7f1d1d' : '#1e40af';
  const icon    = !online ? '📵' : failedCount > 0 ? '⚠️' : '🔄';
  const message = !online
    ? `Offline — ${pendingCount > 0 ? `${pendingCount} record${pendingCount>1?'s':''} queued` : 'changes saved locally'}`
    : failedCount > 0
    ? `${failedCount} record${failedCount>1?'s':''} failed to sync`
    : syncing
    ? `Syncing ${pendingCount} record${pendingCount>1?'s':''}\u2026`
    : `${pendingCount} record${pendingCount>1?'s':''} pending sync`;

  return (
    <div>
      <div style={{ background: bg, color:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12, fontWeight:600, gap:8 }}>
        <span>{icon} {message}</span>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          {failedCount > 0 && (
            <button onClick={loadFailedDetails} style={{ background:'none', border:'none', color:'#ffffffcc', fontSize:11, cursor:'pointer', textDecoration:'underline', padding:0 }}>Details</button>
          )}
          {online && (pendingCount > 0 || failedCount > 0) && (
            <button onClick={() => failedCount > 0 ? retry() : flush()} disabled={syncing}
              style={{ background:'#ffffff25', border:'none', color:'#fff', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:syncing?'wait':'pointer', opacity:syncing?0.6:1 }}>
              {syncing ? 'Syncing…' : failedCount > 0 ? 'Retry' : 'Sync now'}
            </button>
          )}
          <button onClick={() => setDismissed(true)}
            style={{ background:'none', border:'none', color:'#ffffffaa', fontSize:14, cursor:'pointer', padding:'0 4px' }}>✕</button>
        </div>
      </div>
      {showDetails && (
        <div style={{ background:'#fef2f2', borderBottom:'1px solid #fecaca', padding:'10px 14px', fontSize:11 }}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontWeight:800,color:'#991b1b'}}>Failed sync items ({failedItems.length})</span>
            <span onClick={()=>setShowDetails(false)} style={{cursor:'pointer',color:'#991b1b'}}>✕ close</span>
          </div>
          {failedItems.length===0 && <div style={{color:'#94a3b8'}}>No details available — they may have just been retried.</div>}
          {failedItems.map(item=>(
            <div key={item.id} style={{background:'#fff',borderRadius:8,padding:'8px 10px',marginBottom:6,display:'flex',justifyContent:'space-between',gap:8}}>
              <div>
                <div style={{fontWeight:700,color:'#1e293b'}}>{item.table} · {item.operation}</div>
                <div style={{color:'#ef4444',marginTop:2}}>{item.error || 'Unknown error'}</div>
                <div style={{color:'#94a3b8',marginTop:2}}>Retries: {item.retries}/5</div>
              </div>
              <button onClick={()=>discardFailed(item.id)} style={{background:'#fee2e2',border:'none',borderRadius:6,color:'#ef4444',padding:'4px 8px',fontSize:10,fontWeight:700,cursor:'pointer',flexShrink:0,height:'fit-content'}}>Discard</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BackOverrideContext = React.createContext(null);

function useBackOverride(fn, active) {
  const ctx = React.useContext(BackOverrideContext);
  useEffect(() => {
    if (!ctx) return;
    if (active && fn) { ctx.setOverride(() => fn); }
    else { ctx.setOverride(null); }
    return () => ctx.setOverride(null);
  }, [active]);
}

function SidebarLayout({ user, role, school, onLogout, tabs, activeTab, setActiveTab, loading, children }) {
  const [open, setOpen] = useState(false);
  const [backOverride, setBackOverride] = useState(null);
  const activeTabObj = tabs.find(t => t.id === activeTab);
  const isP = role === "principal";
  const grad = isP ? "linear-gradient(135deg,#1e3a8a,#4338ca)" : "linear-gradient(135deg,#0f766e,#0ea5e9)";
  const accent = isP ? "#6366f1" : "#0ea5e9";
  const prevTabRef = useRef(null);
  const defaultTab = tabs[0]?.id;

  useEffect(() => { window.history.pushState({ tab: activeTab }, ""); }, []);

  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = activeTab; return; }
    if (prevTabRef.current !== activeTab) {
      window.history.pushState({ tab: activeTab }, "");
      prevTabRef.current = activeTab;
      setBackOverride(null);
    }
  }, [activeTab]);

  useEffect(() => {
    const onPop = (e) => {
      if (open) { setOpen(false); window.history.pushState({ tab: activeTab }, ""); return; }
      if (backOverride) { backOverride(); window.history.pushState({ tab: activeTab }, ""); return; }
      const prevTab = e.state?.tab;
      if (prevTab && prevTab !== activeTab) {
        setActiveTab(prevTab);
      } else if (activeTab !== defaultTab) {
        setActiveTab(defaultTab);
        window.history.pushState({ tab: defaultTab }, "");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeTab, open, defaultTab, backOverride]);

  const handleBack = () => {
    if (backOverride) { backOverride(); return; }
    setActiveTab(defaultTab);
    window.history.pushState({ tab: defaultTab }, "");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#eef2ff", fontFamily:"'Segoe UI',sans-serif", maxWidth:"100vw", overflowX:"hidden" }}>

      {/* ── Top Bar ── */}
      <div style={{ background: grad, padding:"0 16px", height:62, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 24px #00000040" }}>
        {/* Back button — shown on all non-default tabs */}
        {activeTab !== defaultTab
          ? <button onClick={handleBack} style={{ background:"#ffffff18", border:"1px solid #ffffff25", borderRadius:12, width:42, height:42, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:18, fontWeight:900 }}>←</button>
          : <button onClick={() => setOpen(true)} style={{ background:"#ffffff18", border:"1px solid #ffffff25", borderRadius:12, width:42, height:42, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5, flexShrink:0 }}>
              <div style={{ width:18, height:2, background:"#fff", borderRadius:2 }}/>
              <div style={{ width:14, height:2, background:"#ffffffaa", borderRadius:2 }}/>
              <div style={{ width:18, height:2, background:"#fff", borderRadius:2 }}/>
            </button>
        }
        <div style={{ textAlign:"center", flex:1, padding:"0 10px", minWidth:0 }}>
          <div style={{ color:"#fff", fontWeight:900, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", letterSpacing:"0.01em" }}>{school?.name || "School Data Center"}</div>
          <div style={{ color:"#c7d2fecc", fontSize:10, marginTop:2, letterSpacing:"0.06em", textTransform:"uppercase" }}>{activeTabObj?.icon} {activeTabObj?.label}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {isP && <NotificationBell schoolId={school && school.id} />}
          <button onClick={onLogout} style={{ background:"#ffffff18", border:"1px solid #ffffff25", color:"#fff", borderRadius:12, padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>Sign Out</button>
        </div>
      </div>

      {/* ── Sync Status Banner — developer-only, hidden from school staff ── */}
      {DEV_EMAILS.includes(user?.email) && <SyncBanner />}
      {/* ── Super Admin Announcements ── */}
      <AnnouncementBanners role={role} onNavigate={setActiveTab} />
      {/* ── PWA Install Banner ── */}
      <InstallBanner />

      {/* ── Overlay ── */}
      {open && <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, background:"#00000065", zIndex:200, backdropFilter:"blur(2px)" }}/>}

      {/* ── Sidebar Drawer ── */}
      <div style={{ position:"fixed", top:0, left:0, height:"100%", width:285, background:"#fff", zIndex:300, transform: open ? "translateX(0)" : "translateX(-100%)", transition:"transform 0.28s cubic-bezier(.4,0,.2,1)", boxShadow:"6px 0 40px #00000030", display:"flex", flexDirection:"column" }}>
        <div style={{ background: grad, padding:"36px 20px 22px", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"#ffffff10" }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
            <div>
              {school?.logo_url
                ? <img src={school.logo_url} alt="logo" style={{ width:48, height:48, objectFit:"contain", borderRadius:12, marginBottom:10, display:"block", background:"#fff", padding:4, boxShadow:"0 2px 10px #00000030" }}/>
                : <div style={{ width:48, height:48, borderRadius:12, marginBottom:10, display:"flex", alignItems:"center", justifyContent:"center", background:"#ffffff25", fontSize:22 }}>{"🎓"}</div>
              }
              <div style={{ color:"#fff", fontWeight:900, fontSize:15 }}>{school?.name || "School"}</div>
              <div style={{ color:"#c7d2fecc", fontSize:12, marginTop:3, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ background:"#ffffff20", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{isP ? "PRINCIPAL" : "TEACHER"}</span>
                {user.full_name}
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background:"#ffffff20", border:"none", color:"#fff", borderRadius:10, width:34, height:34, cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{"×"}</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {tabs.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => { setActiveTab(t.id); setOpen(false); }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"12px 20px", border:"none",
                  background: isActive ? `${accent}12` : "none",
                  borderLeft: isActive ? `4px solid ${accent}` : "4px solid transparent",
                  cursor:"pointer", textAlign:"left" }}>
                <div style={{ width:38, height:38, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
                  background: isActive ? `${accent}20` : "#f8fafc",
                  boxShadow: isActive ? `0 2px 8px ${accent}30` : "none" }}>
                  {t.icon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight: isActive ? 800 : 600, fontSize:14, color: isActive ? accent : "#374151" }}>{t.label}</div>
                  {t.desc && <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{t.desc}</div>}
                </div>
                {isActive && <div style={{ width:6, height:6, borderRadius:"50%", background:accent, flexShrink:0 }}/>}
              </button>
            );
          })}
        </div>

        <div style={{ padding:"14px 16px", borderTop:"1px solid #f1f5f9" }}>
          <button onClick={onLogout} style={{ width:"100%", background:"#fff0f0", border:"1.5px solid #fecaca", borderRadius:12, padding:"12px", color:"#dc2626", fontWeight:800, fontSize:14, cursor:"pointer" }}>{"🚪 Logout"}</button>
        </div>
      </div>

      {/* ── Page Content ── */}
      <div style={{ padding:"16px 16px 80px", maxWidth:700, margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:80 }}>
            <div style={{ fontSize:48, marginBottom:12, opacity:0.4 }}>{"⏳"}</div>
            <div style={{ color:"#94a3b8", fontWeight:600, fontSize:14 }}>Loading…</div>
          </div>
        ) : (
          <BackOverrideContext.Provider value={{ setOverride: setBackOverride }}>
            {children}
          </BackOverrideContext.Provider>
        )}
      </div>
    </div>
  );
}

// ── Daily Attendance ────────────────────────────────────────────
function DailyAttendance({ user, classes, terms, students: allStudents }) {
  const today = getLocalDate();
  const myClassIds = (user.class_ids && user.class_ids.length) ? user.class_ids : (user.class_id ? [user.class_id] : []);
  const myClasses = classes.filter(c => myClassIds.includes(c.id));
  const isAdminOrSingleClass = myClassIds.length <= 1;
  const [selectedClass, setSelectedClass] = useState(myClassIds[0] || '');
  const [selectedDate, setSelectedDate]   = useState(today);
  const [records, setRecords]             = useState({});
  const [existingIds, setExistingIds]     = useState({});
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [viewDate, setViewDate]           = useState(today);
  const [summaryData, setSummaryData]     = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [subView, setSubView]             = useState('mark');
  useBackOverride(()=>{ setSubView('mark'); }, subView === 'summary');
  const [datePage, setDatePage]           = useState(1);
  const [studentPage, setStudentPage]     = useState(1);
  const DATE_PAGE_SIZE    = 15;
  const STUDENT_PAGE_SIZE = 20;

  // ── Live clock ──
  const [clockTime, setClockTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeStr = clockTime.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  const dateStr = clockTime.toLocaleDateString('en-NG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // ── Push Reminder ──
  const VAPID_PUBLIC_KEY = 'BF3kYAQq377ImMwdCudYjbQswRLIM3J3neIxd0_CANNv9yndJhGuh-hpZqh8dE50kNTs7RfhzgFT2RtwVnLNvDo';
  const [reminderTime, setReminderTime] = useState('');
  const [reminderSet,  setReminderSet]  = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [notifStatus, setNotifStatus]   = useState('');

  useEffect(() => {
    supabase.from('push_subscriptions').select('reminder_time').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.reminder_time) { setReminderTime(data.reminder_time); setReminderSet(true); }
      });
  }, [user.id]);

  const saveReminder = async () => {
    if (!reminderTime) return;
    setReminderSaving(true); setNotifStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setNotifStatus('error:Push notifications not supported on this browser.');
        setReminderSaving(false); return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setNotifStatus('error:Please allow notifications in your browser settings.');
        setReminderSaving(false); return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC_KEY,
        });
      }
      const { endpoint, keys } = sub.toJSON();
      await supabase.from('push_subscriptions').upsert({
        user_id:       user.id,
        school_id:     user.school_id,
        endpoint,
        p256dh:        keys.p256dh,
        auth:          keys.auth,
        reminder_time: reminderTime,
      }, { onConflict: 'user_id' });
      setReminderSet(true);
      setNotifStatus('success:Reminder set! You will be notified daily at ' + reminderTime);
    } catch (e) {
      setNotifStatus('error:' + (e.message || 'Failed to set reminder'));
    }
    setReminderSaving(false);
  };

  const clearReminder = async () => {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id);
    setReminderTime(''); setReminderSet(false); setNotifStatus('');
  };

  const classStudents = allStudents.filter(s => s.class_id === selectedClass);
  const cls = classes.find(c => c.id === selectedClass);

  // Load attendance records for selected class + date
  useEffect(() => {
    if (!selectedClass || !selectedDate) return;
    setLoading(true);
    setSaved(false);
    supabase
      .from('daily_attendance')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('date', selectedDate)
      .then(({ data }) => {
        const rec = {}, ids = {};
        (data || []).forEach(row => {
          rec[row.student_id] = row.status;
          ids[row.student_id] = row.id;
        });
        setRecords(rec);
        setExistingIds(ids);
        setLoading(false);
        if (data && data.length > 0) setSaved(true);
      });
  }, [selectedClass, selectedDate]);

  // Load summary for summary view
  useEffect(() => {
    if (subView !== 'summary' || !selectedClass) return;
    setSummaryLoading(true);
    supabase
      .from('daily_attendance')
      .select('*')
      .eq('class_id', selectedClass)
      .order('date', { ascending: false })
      .then(({ data }) => {
        setSummaryData(data || []);
        setSummaryLoading(false);
      });
  }, [subView, selectedClass]);

  const setStatus = (studentId, status) => {
    setSaved(false);
    setRecords(p => ({ ...p, [studentId]: status }));
  };

  const markAll = (status) => {
    setSaved(false);
    const updated = {};
    classStudents.forEach(s => { updated[s.id] = status; });
    setRecords(updated);
  };

  const saveAttendance = async () => {
    if (!selectedClass || !selectedDate) return;
    setSaving(true);
    for (const student of classStudents) {
      const status = records[student.id] || 'absent';
      const payload = {
        class_id:  selectedClass,
        student_id: student.id,
        date:      selectedDate,
        status,
        school_id: user.school_id,
        marked_by: user.id,
      };
      const existingId = existingIds[student.id];
      if (existingId) {
        await db.patch('daily_attendance', existingId, { status });
      } else {
        const data = await db.post('daily_attendance', payload);
        if (data?.id && !data._offline) {
          setExistingIds(p => ({ ...p, [student.id]: data.id }));
        }
      }
    }
    setSaving(false);
    setSaved(true);
  };

  // Summary helpers
  const getSummaryByDate = () => {
    if (!summaryData) return [];
    const byDate = {};
    summaryData.forEach(row => {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date, present: 0, absent: 0, late: 0 };
      byDate[row.date][row.status] = (byDate[row.date][row.status] || 0) + 1;
    });
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  };

  const getStudentSummary = () => {
    if (!summaryData) return [];
    const byStudent = {};
    summaryData.forEach(row => {
      if (!byStudent[row.student_id]) byStudent[row.student_id] = { student_id: row.student_id, present: 0, absent: 0, late: 0, total: 0 };
      byStudent[row.student_id][row.status] = (byStudent[row.student_id][row.status] || 0) + 1;
      byStudent[row.student_id].total += 1;
    });
    return Object.values(byStudent).map(r => ({
      ...r,
      student: classStudents.find(s => s.id === r.student_id),
    })).filter(r => r.student).sort((a, b) => b.absent - a.absent);
  };

  const statusConfig = {
    present: { label: 'Present', color: '#10b981', bg: '#f0fdf4', border: '#10b981' },
    late:    { label: 'Late',    color: '#f59e0b', bg: '#fffbeb', border: '#f59e0b' },
    absent:  { label: 'Absent',  color: '#ef4444', bg: '#fef2f2', border: '#ef4444' },
  };

  const presentCount  = classStudents.filter(s => records[s.id] === 'present').length;
  const lateCount     = classStudents.filter(s => records[s.id] === 'late').length;
  const absentCount   = classStudents.filter(s => !records[s.id] || records[s.id] === 'absent').length;

  return (
    <div>
      <div style={S.section('#10b981')}>
        <span>📅</span>
        <span style={{ fontWeight: 800, color: '#10b981' }}>Daily Attendance</span>
      </div>

      {/* Live clock */}
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#6366f1)', borderRadius:16, padding:'16px', marginBottom:16, textAlign:'center', color:'#fff' }}>
        <div style={{ fontSize:32, fontWeight:900, letterSpacing:2, fontVariantNumeric:'tabular-nums' }}>{timeStr}</div>
        <div style={{ fontSize:12, color:'#a5b4fc', marginTop:4, fontWeight:600 }}>{dateStr}</div>
      </div>

      {/* Reminder setup */}
      <div style={{ ...S.card, marginBottom:16 }}>
        <div style={{ fontWeight:800, color:'#1e293b', fontSize:13, marginBottom:10 }}>⏰ Daily Reminder</div>
        {reminderSet ? (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#10b981' }}>✅ Reminder set for {reminderTime}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Push notification sent daily — even when app is closed</div>
            </div>
            <button onClick={clearReminder} style={{ background:'#fee2e2', border:'none', borderRadius:8, color:'#ef4444', padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>Clear</button>
          </div>
        ) : (
          <div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ display:'flex', gap:6, flex:1, alignItems:'center' }}>
                <select style={{ ...S.input, flex:1 }} value={reminderTime.split(':')[0]||''} onChange={e => setReminderTime(`${e.target.value}:${reminderTime.split(':')[1]||'00'}`)}>
                  <option value=''>HH</option>
                  {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{fontWeight:900,color:'#64748b'}}>:</span>
                <select style={{ ...S.input, flex:1 }} value={reminderTime.split(':')[1]||''} onChange={e => setReminderTime(`${reminderTime.split(':')[0]||'07'}:${e.target.value}`)}>
                  <option value=''>MM</option>
                  {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={saveReminder} disabled={!reminderTime || reminderSaving}
                style={{ ...S.btn('#10b981'), padding:'10px 16px', fontSize:13, flexShrink:0 }}>
                {reminderSaving ? '…' : 'Set'}
              </button>
            </div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:6 }}>You'll receive a push notification at this time daily</div>
          </div>
        )}
        {notifStatus && (
          <div style={{ marginTop:8, fontSize:12, fontWeight:600,
            color: notifStatus.startsWith('success') ? '#059669' : '#ef4444' }}>
            {notifStatus.replace(/^success:|^error:/, '')}
          </div>
        )}
      </div>

      {/* Class selector: admins (no assigned class) choose from all classes;
          teachers with 2+ assigned classes choose from their own classes;
          teachers with exactly 1 class skip the picker entirely. */}
      {myClassIds.length === 0 && (
        <div style={S.card}>
          <label style={S.label}>Class</label>
          <select style={S.input} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">Choose class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
          </select>
        </div>
      )}
      {myClassIds.length > 1 && (
        <div style={S.card}>
          <label style={S.label}>Class</label>
          <select style={S.input} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">Choose class</option>
            {myClasses.map(c => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
          </select>
        </div>
      )}

      {!selectedClass && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>
          Select a class to begin marking attendance.
        </div>
      )}

      {selectedClass && (
        <>
          {/* Sub-view toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[{ id: 'mark', label: '✏️ Mark Attendance' }, { id: 'summary', label: '📊 Summary' }].map(v => (
              <button key={v.id} onClick={() => setSubView(v.id)}
                style={{ ...S.btn(subView === v.id ? '#10b981' : '#e2e8f0'), color: subView === v.id ? '#fff' : '#475569', flex: 1, fontSize: 13 }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* ── MARK ATTENDANCE ── */}
          {subView === 'mark' && (
            <>
              <div style={S.card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
                  <div>
                    <label style={S.label}>Class</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14, padding: '10px 0' }}>
                      {cls ? `${cls.name} ${cls.arm}` : '—'}
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>Date</label>
                    <input type="date" style={S.input} value={selectedDate} max={today}
                      onChange={e => setSelectedDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Summary bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Present', count: presentCount,  color: '#10b981', bg: '#f0fdf4' },
                  { label: 'Late',    count: lateCount,     color: '#f59e0b', bg: '#fffbeb' },
                  { label: 'Absent',  count: absentCount,   color: '#ef4444', bg: '#fef2f2' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, borderRadius: 12, padding: '12px 8px', textAlign: 'center', border: `1.5px solid ${item.color}22` }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: item.color }}>{item.count}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick mark all */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', alignSelf: 'center', flexShrink: 0 }}>Mark all:</span>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <button key={key} onClick={() => markAll(key)}
                    style={{ ...S.btn(cfg.color), fontSize: 12, padding: '6px 12px', flex: 1 }}>
                    {cfg.label}
                  </button>
                ))}
              </div>

              {/* Student rows */}
              {loading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Loading…</div>
              ) : classStudents.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>No students in this class.</div>
              ) : (
                <div style={S.card}>
                  {classStudents.map((student, i) => {
                    const status = records[student.id] || 'absent';
                    const cfg = statusConfig[status];
                    return (
                      <div key={student.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: i < classStudents.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: cfg.bg,
                            border: `2px solid ${cfg.color}`, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 13, fontWeight: 800, color: cfg.color, flexShrink: 0,
                          }}>
                            {student.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {student.full_name}
                            </div>
                            <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                          {Object.entries(statusConfig).map(([key, c]) => (
                            <button key={key} onClick={() => setStatus(student.id, key)}
                              style={{
                                border: `2px solid ${status === key ? c.color : '#e2e8f0'}`,
                                background: status === key ? c.bg : '#fff',
                                color: status === key ? c.color : '#94a3b8',
                                borderRadius: 8, padding: '5px 9px', fontSize: 11, fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}>
                              {key === 'present' ? '✓' : key === 'late' ? '⏰' : '✗'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {saved && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #10b981', borderRadius: 10, padding: '10px 16px', color: '#059669', fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
                  ✅ Attendance saved for {selectedDate}
                </div>
              )}

              <button onClick={saveAttendance} disabled={saving || classStudents.length === 0}
                style={{ ...S.btn(saved ? '#94a3b8' : '#10b981'), width: '100%', padding: '13px', fontSize: 15, marginTop: 4 }}>
                {saving ? 'Saving…' : saved ? '✅ Attendance Saved' : '💾 Save Attendance'}
              </button>
              {saved && (
                <button onClick={() => setSaved(false)}
                  style={{ ...S.btn('#f59e0b'), width: '100%', padding: '10px', fontSize: 13, marginTop: 8 }}>
                  ✏️ Edit
                </button>
              )}
            </>
          )}

          {/* ── SUMMARY VIEW ── */}
          {subView === 'summary' && (
            <div>
              {summaryLoading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Loading…</div>
              ) : !summaryData || summaryData.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 13 }}>No attendance records yet for this class.</div>
              ) : (
                <>
                  {/* By-date table */}
                  <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                      📆 Attendance by Date
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['Date', 'Present', 'Late', 'Absent', 'Total'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(()=>{
                            const byDate = getSummaryByDate();
                            const start  = (datePage-1)*DATE_PAGE_SIZE;
                            const paged  = byDate.slice(start, start+DATE_PAGE_SIZE);
                            return paged.map((row,i)=>(
                              <tr key={row.date} style={{ borderTop:'1px solid #f1f5f9', background:i%2===0?'#fff':'#fafafa' }}>
                                <td style={{ padding:'8px 12px', fontWeight:600, color:'#374151' }}>{row.date}</td>
                                <td style={{ padding:'8px 12px', color:'#10b981', fontWeight:700 }}>{row.present||0}</td>
                                <td style={{ padding:'8px 12px', color:'#f59e0b', fontWeight:700 }}>{row.late||0}</td>
                                <td style={{ padding:'8px 12px', color:'#ef4444', fontWeight:700 }}>{row.absent||0}</td>
                                <td style={{ padding:'8px 12px', color:'#64748b', fontWeight:600 }}>{(row.present||0)+(row.late||0)+(row.absent||0)}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <div style={{padding:'0 12px 8px'}}>
                      <Pagination page={datePage} totalPages={Math.max(1,Math.ceil(getSummaryByDate().length/DATE_PAGE_SIZE))} setPage={setDatePage} total={getSummaryByDate().length} pageSize={DATE_PAGE_SIZE}/>
                    </div>
                  </div>

                  {/* Per-student summary */}
                  <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
                    <div style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                      👨‍🎓 Per-Student Summary
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['Student', 'Present', 'Late', 'Absent', 'Attend. %'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(()=>{
                            const byStudent = getStudentSummary();
                            const start     = (studentPage-1)*STUDENT_PAGE_SIZE;
                            const paged     = byStudent.slice(start, start+STUDENT_PAGE_SIZE);
                            return paged.map((row,i)=>{
                              const pct = row.total ? Math.round(((row.present+row.late)/row.total)*100) : 0;
                              const pctColor = pct>=75?'#10b981':pct>=50?'#f59e0b':'#ef4444';
                              return(
                                <tr key={row.student_id} style={{ borderTop:'1px solid #f1f5f9', background:i%2===0?'#fff':'#fafafa' }}>
                                  <td style={{ padding:'8px 10px', fontWeight:600, color:'#374151', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.student?.full_name}</td>
                                  <td style={{ padding:'8px 10px', color:'#10b981', fontWeight:700 }}>{row.present}</td>
                                  <td style={{ padding:'8px 10px', color:'#f59e0b', fontWeight:700 }}>{row.late}</td>
                                  <td style={{ padding:'8px 10px', color:'#ef4444', fontWeight:700 }}>{row.absent}</td>
                                  <td style={{ padding:'8px 10px' }}>
                                    <span style={{ background:pctColor+'18', color:pctColor, borderRadius:20, padding:'2px 10px', fontWeight:800, fontSize:11 }}>{pct}%</span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <div style={{padding:'0 12px 8px'}}>
                      <Pagination page={studentPage} totalPages={Math.max(1,Math.ceil(getStudentSummary().length/STUDENT_PAGE_SIZE))} setPage={setStudentPage} total={getStudentSummary().length} pageSize={STUDENT_PAGE_SIZE}/>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Receipt / Invoice ──────────────────────────────────────────
const FEE_ITEMS = [
  { id:"tuition",   label:"School Fees (Tuition)" },
  { id:"uniform",   label:"Uniform" },
  { id:"books",     label:"Books & Stationery" },
  { id:"supplies",  label:"School Supplies" },
  { id:"pta",       label:"PTA Levy" },
  { id:"custom",    label:"Other (custom)" },
];

const generateReceiptPDF = async (receipt, student, cls, term, school, logoDataUrl) => {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W = 210; let y = 0;
  doc.setFillColor(30,58,138); doc.rect(0,0,W,50,"F");
  if (logoDataUrl) { try { doc.addImage(logoDataUrl,"PNG",12,8,28,28); } catch(e){} }
  doc.setTextColor(255,255,255);
  doc.setFontSize(18); doc.setFont(undefined,"bold");
  doc.text((school?.name||"School").toUpperCase(), W/2, 20, {align:"center"});
  doc.setFontSize(9); doc.setFont(undefined,"normal");
  if (school?.address) doc.text(school.address, W/2, 28, {align:"center"});
  if (school?.phone)   doc.text("Tel: "+school.phone, W/2, 34, {align:"center"});
  doc.setFontSize(14); doc.setFont(undefined,"bold");
  doc.text("OFFICIAL PAYMENT RECEIPT", W/2, 44, {align:"center"});
  y = 58;
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.4);
  doc.setFillColor(240,245,255); doc.roundedRect(12, y, W-24, 28, 3, 3, "FD");
  doc.setTextColor(30,58,138); doc.setFontSize(9); doc.setFont(undefined,"bold");
  doc.text("Receipt No: "+receipt.receipt_no, 18, y+8);
  doc.text("Date: "+receipt.date, 18, y+15);
  doc.text("Term: "+(term?.name||"—"), 18, y+22);
  doc.text("Issued By: "+(receipt.issued_by||"Principal"), W/2+5, y+8);
  doc.text("Payment Method: "+(receipt.payment_method||"Cash"), W/2+5, y+15);
  y += 35;
  doc.setFillColor(248,250,252); doc.roundedRect(12, y, W-24, 22, 3, 3, "F");
  doc.setTextColor(30,41,59); doc.setFontSize(9); doc.setFont(undefined,"bold");
  doc.text("STUDENT DETAILS", 18, y+7);
  doc.setFont(undefined,"normal"); doc.setFontSize(10);
  doc.text("Name: "+student.full_name, 18, y+14);
  doc.text("Admission No: "+(student.admission_number||"—")+"   Class: "+(cls?.name||"")+" "+(cls?.arm||""), 18, y+20);
  y += 29;
  doc.setFillColor(30,58,138); doc.rect(12, y, W-24, 10, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined,"bold");
  doc.text("DESCRIPTION", 18, y+7);
  doc.text("QTY", 130, y+7, {align:"center"});
  doc.text("UNIT PRICE (N)", 165, y+7, {align:"center"});
  doc.text("AMOUNT (N)", W-14, y+7, {align:"right"});
  y += 10;
  doc.setTextColor(30,41,59); doc.setFont(undefined,"normal");
  let subtotal = 0;
  receipt.items.forEach(function(item, i) {
    const amt = item.qty * item.unit_price;
    subtotal += amt;
    if (i%2===0) { doc.setFillColor(255,255,255); } else { doc.setFillColor(248,250,252); }
    doc.rect(12, y, W-24, 9, "F");
    doc.setFontSize(9);
    doc.text(item.label, 18, y+6);
    doc.text(String(item.qty), 130, y+6, {align:"center"});
    doc.text(item.unit_price.toLocaleString("en-NG"), 165, y+6, {align:"center"});
    doc.text(amt.toLocaleString("en-NG"), W-14, y+6, {align:"right"});
    y += 9;
  });
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.3);
  doc.line(12, y+2, W-12, y+2); y += 7;
  const discount = receipt.discount || 0;
  const total = subtotal - discount;
  [["Subtotal:", subtotal],["Discount:", discount],["TOTAL PAID:", total]].forEach(function(pair, i) {
    if (i===2) { doc.setFont(undefined,"bold"); doc.setFontSize(11); doc.setTextColor(30,58,138); }
    else { doc.setFont(undefined,"normal"); doc.setFontSize(9); doc.setTextColor(100,116,139); }
    doc.text(pair[0], 140, y+7);
    doc.text("N"+pair[1].toLocaleString("en-NG"), W-14, y+7, {align:"right"});
    y += 9;
  });
  y += 4;
  if (receipt.notes) {
    doc.setFontSize(9); doc.setFont(undefined,"italic"); doc.setTextColor(100,116,139);
    doc.text("Note: "+receipt.notes, 14, y+6); y += 12;
  }
  doc.setFillColor(30,58,138); doc.rect(0, 275, W, 22, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont(undefined,"normal");
  doc.text("This is an official receipt. Please keep for your records.", W/2, 282, {align:"center"});
  doc.text((school?.name||"School")+" - "+new Date().getFullYear(), W/2, 290, {align:"center"});
  doc.save("Receipt_"+receipt.receipt_no+"_"+student.full_name.replace(/ /g,"_")+".pdf");
};

function ReceiptInvoice({ students, classes, terms, school, user, logoDataUrl }) {
  const today = getLocalDate();
  const currentTerm = terms.find(function(t){return t.is_current;}) || terms[0];
  const blankForm = function() {
    return {
      student_id:"", term_id:currentTerm?.id||"", date:today,
      payment_method:"Cash", discount:"", notes:"",
      items:[{fee_type:"tuition",label:"School Fees (Tuition)",qty:1,unit_price:""}],
    };
  };
  const [form,setForm]=useState(blankForm());
  const [generating,setGenerating]=useState(false);
  const [success,setSuccess]=useState(false);
  const [filterClass,setFilterClass]=useState("");

  const filteredStudents = filterClass ? students.filter(function(s){return s.class_id===filterClass;}) : students;
  const selectedStudent  = students.find(function(s){return s.id===form.student_id;});
  const selectedClass    = classes.find(function(c){return c.id===selectedStudent?.class_id;});
  const selectedTerm     = terms.find(function(t){return t.id===form.term_id;});

  const updateItem=function(i,field,val){
    setForm(function(p){
      const items=[...p.items]; items[i]={...items[i],[field]:val};
      if(field==="fee_type"){const found=FEE_ITEMS.find(function(f){return f.id===val;});if(found&&found.id!=="custom")items[i].label=found.label;}
      return {...p,items};
    });
  };
  const addItem=function(){setForm(function(p){return {...p,items:[...p.items,{fee_type:"custom",label:"",qty:1,unit_price:""}]};});};
  const removeItem=function(i){setForm(function(p){return {...p,items:p.items.filter(function(_,idx){return idx!==i;})};});};

  const subtotal=form.items.reduce(function(s,it){return s+(Number(it.qty)||0)*(Number(it.unit_price)||0);},0);
  const discount=Number(form.discount)||0;
  const total=subtotal-discount;

  const handleGenerate=async function(){
    if(!form.student_id){alert("Please select a student.");return;}
    if(form.items.some(function(it){return !it.unit_price;})){alert("Please fill in all item prices.");return;}
    setGenerating(true);
    const receipt_no="RCP-"+Date.now().toString(36).toUpperCase();
    const receipt={...form,receipt_no,issued_by:user.full_name||"Principal",discount,
      items:form.items.map(function(it){return {...it,qty:Number(it.qty)||1,unit_price:Number(it.unit_price)||0};})};
    await generateReceiptPDF(receipt,selectedStudent,selectedClass,selectedTerm,school,logoDataUrl);
    // Save the payment record so Analytics → Fees can show who has
    // actually paid this term. Previously this only produced a PDF and
    // never touched the database, so paid/unpaid counts were always 0.
    try{
      await db.post("receipts",{
        student_id:form.student_id,
        term_id:form.term_id,
        school_id:school?.id,
        receipt_no,
        amount:total,
        payment_method:form.payment_method,
        date:form.date,
        notes:form.notes||null,
      });
    }catch(e){
      // Non-fatal: the receipt PDF was already generated and handed to
      // the user. A failed save here shouldn't block that, but we
      // surface it so payment tracking doesn't silently drift.
      console.error("Failed to record receipt for analytics:", e);
    }
    setGenerating(false);setSuccess(true);setTimeout(function(){setSuccess(false);},3000);
  };

  return (
    <div>
      <div style={S.section("#7c3aed")}><span>🧾</span><span style={{fontWeight:800,color:"#7c3aed"}}>Receipt / Invoice</span></div>

      <div style={S.card}>
        <label style={S.label}>Filter by Class</label>
        <select style={{...S.input,marginBottom:12}} value={filterClass} onChange={function(e){setFilterClass(e.target.value);setForm(function(p){return {...p,student_id:""};});}}>
          <option value="">All Classes</option>
          {classes.map(function(c){return <option key={c.id} value={c.id}>{c.name} {c.arm}</option>;})}
        </select>
        <label style={S.label}>Student *</label>
        <select style={S.input} value={form.student_id} onChange={function(e){setForm(function(p){return {...p,student_id:e.target.value};});}}>
          <option value="">Select student…</option>
          {filteredStudents.map(function(s){const cls=classes.find(function(c){return c.id===s.class_id;});return <option key={s.id} value={s.id}>{s.full_name}{cls?" — "+cls.name+" "+cls.arm:""}</option>;})}
        </select>
      </div>

      <div style={S.card}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div><label style={S.label}>Date</label><input type="date" style={S.input} value={form.date} max={today} onChange={function(e){setForm(function(p){return {...p,date:e.target.value};});}}/></div>
          <div><label style={S.label}>Term</label>
            <select style={S.input} value={form.term_id} onChange={function(e){setForm(function(p){return {...p,term_id:e.target.value};});}}>
              <option value="">Select term…</option>
              {terms.map(function(t){return <option key={t.id} value={t.id}>{t.name}</option>;})}
            </select>
          </div>
        </div>
        <label style={S.label}>Payment Method</label>
        <select style={S.input} value={form.payment_method} onChange={function(e){setForm(function(p){return {...p,payment_method:e.target.value};});}}>
          {["Cash","Bank Transfer","POS/Card","Cheque","Other"].map(function(m){return <option key={m}>{m}</option>;})}
        </select>
      </div>

      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{fontWeight:800,color:"#1e293b",fontSize:14}}>Payment Items</span>
          <button onClick={addItem} style={{...S.btn("#7c3aed"),padding:"6px 14px",fontSize:12}}>+ Add Item</button>
        </div>
        {form.items.map(function(item,i){return (
          <div key={i} style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:10,border:"1.5px solid #e2e8f0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"#64748b"}}>Item {i+1}</span>
              {form.items.length>1&&<button onClick={function(){removeItem(i);}} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#ef4444",padding:"2px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>x</button>}
            </div>
            <label style={S.label}>Type</label>
            <select style={{...S.input,marginBottom:8}} value={item.fee_type} onChange={function(e){updateItem(i,"fee_type",e.target.value);}}>
              {FEE_ITEMS.map(function(f){return <option key={f.id} value={f.id}>{f.label}</option>;})}
            </select>
            {item.fee_type==="custom"&&<><label style={S.label}>Description</label><input style={{...S.input,marginBottom:8}} placeholder="e.g. Exam levy" value={item.label} onChange={function(e){updateItem(i,"label",e.target.value);}}/></>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={S.label}>Qty</label><input type="number" style={S.input} min="1" value={item.qty} onChange={function(e){updateItem(i,"qty",e.target.value);}}/></div>
              <div><label style={S.label}>Unit Price (N)</label><input type="number" style={S.input} min="0" placeholder="0" value={item.unit_price} onChange={function(e){updateItem(i,"unit_price",e.target.value);}}/></div>
            </div>
            <div style={{textAlign:"right",marginTop:6,fontSize:12,fontWeight:700,color:"#7c3aed"}}>= N{((Number(item.qty)||0)*(Number(item.unit_price)||0)).toLocaleString("en-NG")}</div>
          </div>
        );})}
        <div style={{borderTop:"1.5px solid #e2e8f0",paddingTop:12,marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>Subtotal</span>
            <span style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>N{subtotal.toLocaleString("en-NG")}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:13,color:"#64748b",fontWeight:600}}>Discount (N)</span>
            <input type="number" min="0" value={form.discount} onChange={function(e){setForm(function(p){return {...p,discount:e.target.value};});}} style={{...S.input,width:120,textAlign:"right",padding:"6px 10px"}} placeholder="0"/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",background:"#7c3aed15",borderRadius:10,padding:"10px 14px"}}>
            <span style={{fontSize:15,fontWeight:800,color:"#7c3aed"}}>TOTAL</span>
            <span style={{fontSize:15,fontWeight:900,color:"#7c3aed"}}>N{total.toLocaleString("en-NG")}</span>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <label style={S.label}>Notes (optional)</label>
        <textarea style={{...S.input,minHeight:60,resize:"vertical"}} placeholder="e.g. Balance outstanding, payment plan, etc." value={form.notes} onChange={function(e){setForm(function(p){return {...p,notes:e.target.value};});}}/>
      </div>

      {success&&<div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,marginBottom:12,textAlign:"center"}}>Receipt PDF downloaded!</div>}

      <button onClick={handleGenerate} disabled={generating} style={{...S.btn("#7c3aed"),width:"100%",padding:14,fontSize:15}}>
        {generating?"Generating...":"Generate & Download Receipt PDF"}
      </button>
      <button onClick={function(){setForm(blankForm());setSuccess(false);}} style={{...S.btn("#e2e8f0"),color:"#64748b",width:"100%",padding:12,fontSize:13,marginTop:10}}>
        Clear Form
      </button>
    </div>
  );
}

// ── Plan Config ────────────────────────────────────────────────
const PLANS = {
  free: {
    id:'free', name:'Free', color:'#64748b',
    monthlyPrice:0, yearlyPrice:0,
    studentLimit:10, teacherLimit:5, classLimit:5,
    trialStudentLimit:30,
    features:['Up to 30 students (trial)','Up to 5 classes','WhatsApp messaging','Basic report viewing'],
    locked:['PDF report cards','Daily attendance','Receipt & Invoice','Priority support'],
  },
  pro: {
    id:'pro', name:'Pro', color:'#6366f1',
    monthlyPrice:10000, yearlyPrice:86000, termPrice:28500,
    studentLimit:Infinity, teacherLimit:Infinity, classLimit:Infinity,
    features:['Unlimited students','Unlimited classes','PDF report cards','Daily attendance','Receipt & Invoice','WhatsApp messaging','Priority support'],
    locked:[],
  },
};

function usePlan(school) {
  const plan       = school?.plan || 'free';
  const trialStart = school?.created_at ? new Date(school.created_at) : new Date();
  const now        = new Date();
  const trialDays  = Math.floor((now - trialStart) / (1000*60*60*24));
  const trialActive= trialDays < 30;
  const isPro      = plan === 'pro' && school?.plan_expires_at && new Date(school.plan_expires_at) > now;
  const isFree     = !isPro;
  const config     = PLANS[isPro ? 'pro' : 'free'];

  const canAddStudent = (count) => {
    if (isPro) return true;
    if (trialActive) return count < PLANS.free.trialStudentLimit;
    return count < config.studentLimit;
  };
  const canAddTeacher = (count) => isPro || count < config.teacherLimit;
  const canAddClass   = (count) => isPro || count < config.classLimit;
  const canUseFeature = (feature) => {
    if (isPro) return true;
    if (trialActive) return true;
    return !['attendance','receipts','results_pdf'].includes(feature);
  };

  return { plan, isPro, isFree, trialActive, trialDays, config, canAddStudent, canAddTeacher, canAddClass, canUseFeature };
}

// ── Plan Warning Banner ────────────────────────────────────────
function PlanBanner({ school, onUpgrade }) {
  const { isPro, trialActive, trialDays, isFree } = usePlan(school);
  const [dismissed, setDismissed] = useState(false);
  if (isPro || dismissed) return null;

  const daysLeft = 30 - trialDays;
  const bg       = trialActive ? '#1e40af' : '#92400e';
  const msg      = trialActive
    ? `🎉 Free trial — ${daysLeft} day${daysLeft!==1?'s':''} left. Upgrade to keep full access.`
    : '⚠️ Trial ended. Limited to 10 students, 5 teachers, 5 classes. Upgrade for full access.';

  return (
    <div style={{background:bg,color:'#fff',padding:'8px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12,fontWeight:600,gap:8,flexWrap:'wrap'}}>
      <span style={{flex:1}}>{msg}</span>
      <div style={{display:'flex',gap:8,flexShrink:0}}>
        <button onClick={onUpgrade} style={{background:'#fff',color:bg,border:'none',borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:800,cursor:'pointer'}}>
          Upgrade
        </button>
        <button onClick={()=>setDismissed(true)} style={{background:'none',border:'none',color:'#ffffffaa',fontSize:14,cursor:'pointer',padding:'0 4px'}}>✕</button>
      </div>
    </div>
  );
}

// ── Feature Gate ───────────────────────────────────────────────
function FeatureGate({ feature, school, onUpgrade, children }) {
  const { canUseFeature } = usePlan(school);
  if (canUseFeature(feature)) return children;
  return (
    <div style={{textAlign:'center',padding:'48px 24px',background:'#f8fafc',borderRadius:16,border:'2px dashed #e2e8f0'}}>
      <div style={{fontSize:36,marginBottom:12}}>🔒</div>
      <div style={{fontWeight:800,color:'#1e293b',fontSize:16,marginBottom:8}}>Pro Feature</div>
      <div style={{color:'#64748b',fontSize:13,marginBottom:20}}>
        {feature==='attendance'&&'Daily attendance tracking is available on the Pro plan.'}
        {feature==='receipts'&&'Receipt & invoice generation is available on the Pro plan.'}
        {feature==='results_pdf'&&'PDF report card generation is available on the Pro plan.'}
      </div>
      <button onClick={onUpgrade} style={{background:'#6366f1',color:'#fff',border:'none',borderRadius:10,padding:'12px 28px',fontWeight:800,fontSize:14,cursor:'pointer'}}>
        Upgrade to Pro
      </button>
    </div>
  );
}

// ── Paystack Billing Screen ────────────────────────────────────
const PAYSTACK_PUBLIC_KEY = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || 'pk_test_cd8cb0d01ef347cf80b63672549d3f4b8f5c600b';

function loadPaystack() {
  return new Promise((resolve) => {
    if (window.PaystackPop) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function BillingScreen({ school, user, onUpgradeSuccess }) {
  const { isPro, trialActive, trialDays, plan, config } = usePlan(school);
  const [billing, setBilling]   = useState('monthly');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [promoInput, setPromoInput]   = useState('');
  const [promoApplied, setPromoApplied] = useState(null); // { code, discount }
  const [promoError, setPromoError]     = useState('');
  const [promoChecking, setPromoChecking] = useState(false);

  const fullPrice = billing === 'monthly' ? PLANS.pro.monthlyPrice
                   : billing === 'termly'  ? PLANS.pro.termPrice
                   : PLANS.pro.yearlyPrice;
  const saving    = (PLANS.pro.monthlyPrice * 12) - PLANS.pro.yearlyPrice;
  const expiresIn = billing === 'monthly' ? 30 : billing === 'termly' ? 120 : 365;

  // Drop any applied promo if the billing cycle changes — codes are scoped
  // to a specific cycle (e.g. termly-only) and shouldn't silently carry over.
  useEffect(() => { setPromoApplied(null); setPromoError(''); }, [billing]);

  const checkPromoCode = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoChecking(true);
    setPromoError('');
    try {
      // promo_codes is locked behind RLS with no public policies — this
      // validates server-side via the validate-promo-code Edge Function
      // instead of querying the table directly from the browser.
      const { data, error } = await supabase.functions.invoke('validate-promo-code', {
        body: { code, billing },
      });
      if (error || !data?.valid) {
        setPromoError(data?.error || 'Invalid or expired promo code.');
        setPromoApplied(null);
        return;
      }
      setPromoApplied({ code: data.code, discount: Number(data.discount) });
    } catch (e) {
      setPromoError('Could not verify promo code. Try again.');
      setPromoApplied(null);
    } finally {
      setPromoChecking(false);
    }
  };

  // Referral credit: capped at 50% of this invoice. The school's available
  // balance may exceed that — only the honored portion is shown/charged here.
  // The webhook independently re-verifies and deducts the real balance,
  // this is just what we SHOW and ask Paystack to charge.
  const creditBalance   = Number(school?.credit_balance) || 0;
  const maxRedeemable   = Math.floor(fullPrice * 0.5);
  const creditApplied   = Math.min(creditBalance, maxRedeemable);
  const promoDiscount   = promoApplied?.discount || 0;
  const price           = Math.max(0, fullPrice - creditApplied - promoDiscount);

  const handlePay = async () => {
    const payerEmail = user?.email || school?.email;
    if (!payerEmail || !payerEmail.includes('@')) {
      alert('No valid email found for this account. Please update the school email under Settings before upgrading.');
      return;
    }
    setLoading(true);
    await loadPaystack();
    setLoading(false);
    const handler = window.PaystackPop.setup({
      key:       PAYSTACK_PUBLIC_KEY,
      email:     payerEmail,
      amount:    Math.round(price) * 100,
      currency:  'NGN',
      ref:       `SRS-${school?.id?.slice(0,8)}-${Date.now()}`,
      metadata: {
        school_id:        school?.id,
        school_name:      school?.name,
        plan:             'pro',
        billing,
        credit_requested: creditApplied, // webhook re-verifies this, never trusts it blindly
        promo_code:       promoApplied?.code || null, // webhook re-verifies and marks used
      },
      onSuccess: async (transaction) => {
        // Webhook handles the DB update server-side.
        // Poll for up to 30 seconds until plan is confirmed.
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const { data } = await supabase.from("schools").select("plan,plan_expires_at").eq("id", school?.id).single();
          if (data?.plan === "pro" || attempts >= 6) {
            clearInterval(poll);
            setSuccess(true);
            if (onUpgradeSuccess) onUpgradeSuccess();
          }
        }, 5000);
      },
      onCancel: () => {},
    });
    handler.open();
  };

  return (
    <div>
      <div style={{...S.section('#6366f1')}}><span>💎</span><span style={{fontWeight:800,color:'#6366f1'}}>Billing & Plans</span></div>
      <div style={{...S.card,background: isPro ? '#f0fdf4' : '#fefce8', border:`1.5px solid ${isPro?'#10b981':'#f59e0b'}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:'#1e293b'}}>{isPro ? '✅ Pro Plan Active' : '🆓 Free Plan'}</div>
            <div style={{fontSize:12,color:'#64748b',marginTop:4}}>
              {isPro ? `Expires: ${new Date(school?.plan_expires_at).toLocaleDateString('en-NG')}` : trialActive ? `Trial: ${30 - trialDays} days remaining` : 'Trial ended — limited access'}
            </div>
          </div>
          <div style={{fontSize:28}}>{isPro ? '👑' : '🔓'}</div>
        </div>
      </div>
      {success && (
        <div style={{background:'#f0fdf4',border:'1.5px solid #10b981',borderRadius:12,padding:16,textAlign:'center',marginBottom:16}}>
          <div style={{fontSize:32,marginBottom:8}}>🎉</div>
          <div style={{fontWeight:800,color:'#059669',fontSize:15}}>Payment Successful!</div>
          <div style={{fontSize:13,color:'#64748b',marginTop:4}}>Your school is now on Pro. All features unlocked.</div>
        </div>
      )}
      {!isPro && (
        <>
          <div style={{marginBottom:20}}>
            <div style={{textAlign:'center',fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Billing Period</div>
            <div style={{display:'flex',background:'#e2e8f0',borderRadius:14,padding:4,gap:4}}>
              {[['monthly','Monthly',null],['termly','Per Term',null],['yearly','Yearly',`Save ₦${saving.toLocaleString('en-NG')}`]].map(([val,label,badge])=>(
                <button key={val} onClick={()=>setBilling(val)}
                  style={{flex:1,padding:'12px 8px',border:'none',borderRadius:10,fontWeight:800,fontSize:14,cursor:'pointer',
                    background:billing===val?'#6366f1':'transparent',color:billing===val?'#fff':'#64748b',
                    boxShadow:billing===val?'0 2px 8px #6366f140':'none',transition:'all 0.2s'}}>
                  {label}
                  {badge&&<div style={{background:'#10b981',color:'#fff',borderRadius:20,padding:'2px 8px',fontSize:10,fontWeight:800,marginTop:3}}>{badge}</div>}
                </button>
              ))}
            </div>
          </div>
          {[{plan:PLANS.free,current:!isPro},{plan:PLANS.pro,current:isPro}].map(({plan:p,current})=>(
            <div key={p.id} style={{...S.card,border:`2px solid ${current&&p.id==='pro'?p.color:p.id==='pro'?p.color+'44':'#e2e8f0'}`,marginBottom:12,background:p.id==='pro'?'#fafafa':'#fff'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <div style={{fontWeight:800,fontSize:16,color:p.color}}>{p.name}</div>
                  {p.id==='free'
                    ? <div style={{fontSize:12,color:'#64748b',marginTop:2}}>Always free</div>
                    : <div style={{marginTop:4}}>
                        {(creditApplied > 0 || promoDiscount > 0) && (
                          <div style={{fontSize:13,color:'#94a3b8',textDecoration:'line-through'}}>₦{fullPrice.toLocaleString('en-NG')}</div>
                        )}
                        <span style={{fontWeight:900,fontSize:20,color:'#1e293b'}}>₦{price.toLocaleString('en-NG')}</span>
                        <span style={{fontSize:12,color:'#64748b'}}>/{billing==='monthly'?'month':billing==='termly'?'term':'year'}</span>
                        {creditApplied > 0 && (
                          <div style={{fontSize:11,color:'#10b981',fontWeight:700,marginTop:2}}>🎁 ₦{creditApplied.toLocaleString('en-NG')} referral credit applied</div>
                        )}
                        {promoDiscount > 0 && (
                          <div style={{fontSize:11,color:'#6366f1',fontWeight:700,marginTop:2}}>🏷️ ₦{promoDiscount.toLocaleString('en-NG')} promo applied ({promoApplied.code})</div>
                        )}
                      </div>
                  }
                </div>
                {p.id==='pro'&&<span style={{background:'#6366f1',color:'#fff',borderRadius:20,padding:'3px 12px',fontSize:11,fontWeight:800}}>RECOMMENDED</span>}
              </div>
              {p.features.map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',fontSize:13,color:'#374151'}}><span style={{color:'#10b981',fontWeight:800,flexShrink:0}}>✓</span>{f}</div>)}
              {p.locked.map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',fontSize:13,color:'#94a3b8'}}><span style={{flexShrink:0}}>✗</span>{f}</div>)}
            </div>
          ))}
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',gap:8}}>
              <input
                value={promoInput}
                onChange={e=>{setPromoInput(e.target.value); setPromoError('');}}
                placeholder="Have a promo code?"
                style={{...S.input,flex:1,fontSize:13,textTransform:'uppercase'}}
                disabled={!!promoApplied}
              />
              {promoApplied ? (
                <button onClick={()=>{setPromoApplied(null); setPromoInput(''); setPromoError('');}} style={{...S.btn('#94a3b8'),fontSize:13,padding:'10px 16px'}}>Remove</button>
              ) : (
                <button onClick={checkPromoCode} disabled={promoChecking || !promoInput.trim()} style={{...S.btn('#6366f1'),fontSize:13,padding:'10px 16px'}}>
                  {promoChecking ? '...' : 'Apply'}
                </button>
              )}
            </div>
            {promoError && <div style={{fontSize:11,color:'#ef4444',marginTop:4}}>{promoError}</div>}
            {promoApplied && <div style={{fontSize:11,color:'#10b981',marginTop:4}}>✓ Promo "{promoApplied.code}" applied — ₦{promoApplied.discount.toLocaleString('en-NG')} off</div>}
          </div>
          <button onClick={handlePay} disabled={loading} style={{...S.btn('#6366f1'),width:'100%',padding:14,fontSize:15,marginTop:4}}>
            {loading ? 'Loading...' : `💳 Pay ₦${price.toLocaleString('en-NG')} — Upgrade to Pro`}
          </button>
          {creditBalance > 0 && (
            <div style={{textAlign:'center',fontSize:11,color:'#64748b',marginTop:6}}>
              Referral balance: ₦{creditBalance.toLocaleString('en-NG')} {creditBalance > maxRedeemable && `(max ₦${maxRedeemable.toLocaleString('en-NG')} usable per invoice)`}
            </div>
          )}
          <div style={{textAlign:'center',fontSize:11,color:'#94a3b8',marginTop:10}}>🔒 Secured by Paystack · 256-bit SSL encryption</div>
        </>
      )}
      {isPro && (
        <div style={{...S.card,textAlign:'center'}}>
          <div style={{fontSize:13,color:'#64748b',marginBottom:4}}>Need to renew or change your plan?</div>
          <button onClick={handlePay} style={{...S.btn('#6366f1'),padding:'10px 24px',fontSize:13}}>🔄 Renew / Extend Pro</button>
        </div>
      )}
    </div>
  );
}

// ── Timetable Generator ────────────────────────────────────────
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

function Timetable({ user, classes, school, isPrincipal }) {
  const [selectedClass, setSelectedClass] = useState(user.class_id || "");
  const [periods, setPeriods]             = useState([]);
  const [timetable, setTimetable]         = useState({});
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [loading, setLoading]             = useState(false);
  const [newPeriod, setNewPeriod]         = useState({ label:"", start:"", end:"" });
  const [addingPeriod, setAddingPeriod]   = useState(false);

  const cls = classes.find(c => c.id === selectedClass);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true); setSaved(false);
    supabase.from("timetable").select("*").eq("class_id", selectedClass)
      .then(({ data }) => {
        if (data && data.length) {
          const p = JSON.parse(data[0].periods || "[]");
          const t = JSON.parse(data[0].slots   || "{}");
          setPeriods(p); setTimetable(t);
        } else {
          setPeriods([]); setTimetable({});
        }
        setLoading(false);
      });
  }, [selectedClass]);

  const slotKey = (day, periodIdx) => `${day}_${periodIdx}`;

  const setSlot = (day, periodIdx, value) => {
    setSaved(false);
    setTimetable(p => ({ ...p, [slotKey(day,periodIdx)]: sanitize(value) }));
  };

  const addPeriod = () => {
    if (!newPeriod.label.trim()) return;
    setPeriods(p => [...p, { ...newPeriod, label: sanitize(newPeriod.label) }]);
    setNewPeriod({ label:"", start:"", end:"" });
    setAddingPeriod(false); setSaved(false);
  };

  const removePeriod = (idx) => {
    setPeriods(p => p.filter((_,i) => i !== idx));
    setSaved(false);
  };

  const saveTimetable = async () => {
    if (!selectedClass) return;
    setSaving(true);
    const payload = {
      class_id:   selectedClass,
      school_id:  school?.id || user.school_id,
      periods:    JSON.stringify(periods),
      slots:      JSON.stringify(timetable),
      updated_at: new Date().toISOString(),
    };
    try {
      if (navigator.onLine) {
        const { data: existing } = await supabase.from("timetable").select("id").eq("class_id", selectedClass).single();
        if (existing?.id) {
          await db.patch("timetable", existing.id, payload);
        } else {
          await db.post("timetable", payload);
        }
      } else {
        // Offline — save to Dexie cache, queue upsert
        await db.upsert("timetable", { ...payload, id: `timetable_${selectedClass}` }, "class_id");
      }
      setSaved(true);
    } catch (e) {
      Sentry.captureException(e);
      alert("Failed to save timetable. Please try again.");
    }
    setSaving(false);
  };

  const printTimetable = () => {
    const clsName = cls ? `${cls.name} ${cls.arm||""}` : "Class";
    const rows = periods.map((p,i) => {
      const cells = DAYS.map(d => `<td style="border:1px solid #ddd;padding:8px;text-align:center;font-size:12px">${timetable[slotKey(d,i)]||""}</td>`).join("");
      return `<tr><td style="border:1px solid #ddd;padding:8px;font-weight:700;font-size:12px;background:#f8fafc">${p.label}${p.start?`<br><span style="font-size:10px;color:#64748b">${p.start}–${p.end}</span>`:""}</td>${cells}</tr>`;
    }).join("");
    const html = `
      <html><head><title>Timetable — ${clsName}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th{background:#1e3a8a;color:#fff;padding:10px;font-size:12px}@media print{button{display:none}}</style>
      </head><body>
      <h2 style="text-align:center;color:#1e3a8a">${school?.name||"School"}</h2>
      <h3 style="text-align:center">Class Timetable — ${clsName}</h3>
      <table><thead><tr><th>Period</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
    const w = window.open("","_blank");
    w.document.write(html); w.document.close();
  };

  return (
    <div>
      <div style={S.section("#0891b2")}><span>📅</span><span style={{fontWeight:800,color:"#0891b2"}}>Timetable</span></div>

      {!user.class_id && (
        <div style={S.card}>
          <label style={S.label}>Select Class</label>
          <select style={S.input} value={selectedClass} onChange={e => { setSelectedClass(e.target.value); }}>
            <option value="">Choose class…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
          </select>
        </div>
      )}

      {!selectedClass && <div style={{textAlign:"center",color:"#94a3b8",padding:40,fontSize:14}}>Select a class to view or edit its timetable.</div>}

      {selectedClass && (
        <>
          {/* Periods manager */}
          <div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontWeight:800,color:"#1e293b",fontSize:14}}>Periods ({periods.length})</span>
              <button onClick={()=>setAddingPeriod(true)} style={{...S.btn("#0891b2"),padding:"6px 14px",fontSize:12}}>+ Add Period</button>
            </div>

            {addingPeriod && (
              <div style={{background:"#f0f9ff",borderRadius:10,padding:12,marginBottom:12,border:"1.5px solid #bae6fd"}}>
                <label style={S.label}>Period Name</label>
                <input style={{...S.input,marginBottom:8}} placeholder="e.g. Period 1 or Assembly" value={newPeriod.label} onChange={e=>setNewPeriod(p=>({...p,label:e.target.value}))}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label style={S.label}>Start Time</label>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <select style={{...S.input,flex:1,padding:'8px 4px'}} value={newPeriod.start.split(':')[0]||''} onChange={e=>setNewPeriod(p=>({...p,start:`${e.target.value}:${p.start.split(':')[1]||'00'}`}))}>
                        <option value=''>HH</option>
                        {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={{fontWeight:900,color:'#64748b'}}>:</span>
                      <select style={{...S.input,flex:1,padding:'8px 4px'}} value={newPeriod.start.split(':')[1]||''} onChange={e=>setNewPeriod(p=>({...p,start:`${p.start.split(':')[0]||'07'}:${e.target.value}`}))}>
                        <option value=''>MM</option>
                        {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>End Time</label>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <select style={{...S.input,flex:1,padding:'8px 4px'}} value={newPeriod.end.split(':')[0]||''} onChange={e=>setNewPeriod(p=>({...p,end:`${e.target.value}:${p.end.split(':')[1]||'00'}`}))}>
                        <option value=''>HH</option>
                        {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={{fontWeight:900,color:'#64748b'}}>:</span>
                      <select style={{...S.input,flex:1,padding:'8px 4px'}} value={newPeriod.end.split(':')[1]||''} onChange={e=>setNewPeriod(p=>({...p,end:`${p.end.split(':')[0]||'07'}:${e.target.value}`}))}>
                        <option value=''>MM</option>
                        {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addPeriod} style={{...S.btn("#0891b2"),flex:1,padding:10,fontSize:13}}>Add</button>
                  <button onClick={()=>setAddingPeriod(false)} style={{...S.btn("#e2e8f0"),color:"#64748b",flex:1,padding:10,fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {periods.length === 0 && !addingPeriod && (
              <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:16}}>No periods yet. Add your first period above.</div>
            )}

            {periods.map((p,i) => (
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<periods.length-1?"1px solid #f1f5f9":"none"}}>
                <div>
                  <span style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{p.label}</span>
                  {p.start && <span style={{fontSize:11,color:"#64748b",marginLeft:8}}>{p.start} – {p.end}</span>}
                </div>
                <button onClick={()=>removePeriod(i)} style={{background:"#fee2e2",border:"none",borderRadius:6,color:"#ef4444",padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Remove</button>
              </div>
            ))}
          </div>

          {/* Timetable grid */}
          {periods.length > 0 && (
            <div style={{...S.card,padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",fontWeight:800,color:"#1e293b",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
                📋 {cls ? `${cls.name} ${cls.arm||""}` : ""} Timetable
              </div>
              {loading ? (
                <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>Loading…</div>
              ) : (
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
                    <thead>
                      <tr style={{background:"#1e3a8a"}}>
                        <th style={{padding:"10px 12px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,minWidth:90}}>Period</th>
                        {DAYS.map(d => <th key={d} style={{padding:"10px 8px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>{d.slice(0,3)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((p,i) => (
                        <tr key={i} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                          <td style={{padding:"8px 12px",fontWeight:700,color:"#374151",fontSize:11}}>
                            {p.label}
                            {p.start && <div style={{fontSize:10,color:"#94a3b8"}}>{p.start}–{p.end}</div>}
                          </td>
                          {DAYS.map(d => (
                            <td key={d} style={{padding:4}}>
                              <input
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 6px",fontSize:11,textAlign:"center",background:"#fff",outline:"none",boxSizing:"border-box"}}
                                placeholder="Subject"
                                value={timetable[slotKey(d,i)]||""}
                                onChange={e => setSlot(d,i,e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {periods.length > 0 && (
            <>
              {saved && <div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,marginBottom:12,textAlign:"center"}}>✅ Timetable saved</div>}
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <button onClick={saveTimetable} disabled={saving} style={{...S.btn(saved?"#94a3b8":"#0891b2"),flex:2,padding:13,fontSize:14}}>
                  {saving?"Saving…":saved?"✅ Saved":"💾 Save Timetable"}
                </button>
                <button onClick={printTimetable} style={{...S.btn("#6366f1"),flex:1,padding:13,fontSize:14}}>🖨️ Print</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}


// ── Onboarding Flow ───────────────────────────────────────────
function OnboardingFlow({ school, user, classes, terms, teachers, students, reload, onComplete }) {
  const steps = [
    { id:'school',   icon:'🏫', title:'School Profile',    desc:'Add your school address and contact details' },
    { id:'session',  icon:'📅', title:'Academic Session',  desc:'Set your current academic session and term' },
    { id:'classes',  icon:'🎓', title:'Create Classes',    desc:'Add your class arms e.g. JSS 1A, JSS 1B' },
    { id:'teachers', icon:'👩‍🏫', title:'Add Teachers',     desc:'Create teacher accounts and assign classes' },
    { id:'students', icon:'👨‍🎓', title:'Add Students',     desc:'Start adding students to your classes' },
  ];

  const completed = {
    school:   !!(school?.address && school?.phone),
    session:  terms.length > 0,
    classes:  classes.length > 0,
    teachers: teachers.length > 0,
    students: students.length > 0,
  };

  const totalDone  = Object.values(completed).filter(Boolean).length;
  const percentage = Math.round((totalDone / steps.length) * 100);
  const allDone    = totalDone === steps.length;

  if (allDone) return null;

  return (
    <div style={{ ...S.card, border:'2px solid #6366f1', background:'#fafafa', marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div>
          <div style={{ fontWeight:900, color:'#1e293b', fontSize:15 }}>🚀 Setup Your School</div>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{totalDone} of {steps.length} steps complete</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:900, color:'#6366f1' }}>{percentage}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background:'#e2e8f0', borderRadius:99, height:6, marginBottom:16, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(90deg,#6366f1,#10b981)', height:'100%', width:`${percentage}%`, borderRadius:99, transition:'width 0.4s ease' }}/>
      </div>

      {steps.map((step, i) => {
        const done = completed[step.id];
        const TAB_MAP = { school:'settings', session:'settings', classes:'classes', teachers:'teachers', students:'students' };
        return (
          <div key={step.id} onClick={() => !done && onComplete(TAB_MAP[step.id] || step.id)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0',
              borderBottom: i < steps.length-1 ? '1px solid #f1f5f9' : 'none',
              cursor: done ? 'default' : 'pointer', opacity: done ? 0.7 : 1 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
              background: done ? '#f0fdf4' : '#f8fafc',
              border: `2px solid ${done ? '#10b981' : '#e2e8f0'}` }}>
              {done ? <span style={{ color:'#10b981', fontWeight:900, fontSize:16 }}>✓</span> : <span style={{ fontSize:18 }}>{step.icon}</span>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, color: done ? '#64748b' : '#1e293b', fontSize:13, textDecoration: done ? 'line-through' : 'none' }}>{step.title}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{step.desc}</div>
            </div>
            {!done && <span style={{ color:'#6366f1', fontSize:18, flexShrink:0 }}>›</span>}
          </div>
        );
      })}

      {totalDone >= 3 && !allDone && (
        <div style={{ background:'#eff6ff', borderRadius:10, padding:'10px 14px', marginTop:12, fontSize:12, color:'#1e40af', fontWeight:600, textAlign:'center' }}>
          🎉 Almost there! Complete the remaining steps to unlock full functionality.
        </div>
      )}
    </div>
  );
}

// ── Analytics Dashboard ───────────────────────────────────────
function Analytics({ students, classes, teachers, terms, school }) {
  const [attData,  setAttData]  = useState([]);
  const [results,  setResults]  = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState('attendance');
  const [feesView, setFeesView] = useState('unpaid');

  const currentTerm = terms.find(t => t.is_current) || terms[0];

  useEffect(() => {
    if (!school?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from('daily_attendance').select('*').eq('school_id', school.id),
      supabase.from('results').select('*').in('student_id', students.length ? students.map(s => s.id) : ['none']),
      supabase.from('receipts').select('*').eq('school_id', school.id),
    ]).then(([att, res, rec]) => {
      setAttData(att.data || []);
      setResults(res.data || []);
      setReceipts(rec.data || []);
      setLoading(false);
    }).catch(() => {
      // receipts table may not exist yet — fall back gracefully
      Promise.all([
        supabase.from('daily_attendance').select('*').eq('school_id', school.id),
        supabase.from('results').select('*').in('student_id', students.length ? students.map(s => s.id) : ['none']),
      ]).then(([att, res]) => {
        setAttData(att.data || []);
        setResults(res.data || []);
        setReceipts([]);
        setLoading(false);
      });
    });
  }, [school?.id, students.length]);

  // ── Attendance analytics
  const attByClass = classes.map(cls => {
    const clsStudents = students.filter(s => s.class_id === cls.id);
    const clsRecords  = attData.filter(r => r.class_id === cls.id);
    const total   = clsRecords.length;
    const present = clsRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate    = total > 0 ? Math.round((present / total) * 100) : null;
    return { name:`${cls.name} ${cls.arm||''}`, rate, total, students: clsStudents.length };
  }).filter(c => c.total > 0).sort((a,b) => (a.rate||0) - (b.rate||0));

  const lowAttStudents = students.map(s => {
    const recs    = attData.filter(r => r.student_id === s.id);
    const total   = recs.length;
    const present = recs.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate    = total > 0 ? Math.round((present / total) * 100) : null;
    const cls     = classes.find(c => c.id === s.class_id);
    return { ...s, attRate: rate, total, clsName: cls ? `${cls.name} ${cls.arm||''}` : '—' };
  }).filter(s => s.attRate !== null && s.attRate < 75).sort((a,b) => a.attRate - b.attRate).slice(0,10);

  // ── Academic analytics
  const subjectAvgs = (() => {
    const bySubject = {};
    results.forEach(r => {
      if (!r.subject_name) return;
      if (!bySubject[r.subject_name]) bySubject[r.subject_name] = { scores:[], name:r.subject_name };
      const total = (Number(r.ca_score)||0) + (Number(r.exam_score)||0);
      if (total > 0) bySubject[r.subject_name].scores.push(total);
    });
    return Object.values(bySubject).map(s => ({
      name: s.name,
      avg:  s.scores.length ? Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length) : 0,
      count: s.scores.length,
    })).sort((a,b) => b.avg - a.avg).slice(0,8);
  })();

  const topStudents = (() => {
    const byStudent = {};
    results.forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { id:r.student_id, scores:[] };
      const total = (Number(r.ca_score)||0) + (Number(r.exam_score)||0);
      if (total > 0) byStudent[r.student_id].scores.push(total);
    });
    return Object.values(byStudent).map(s => {
      const student = students.find(st => st.id === s.id);
      const cls     = classes.find(c => c.id === student?.class_id);
      const avg     = s.scores.length ? Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length) : 0;
      return { ...student, avg, clsName: cls ? `${cls.name} ${cls.arm||''}` : '—' };
    }).filter(s => s.avg > 0).sort((a,b) => b.avg - a.avg).slice(0,5);
  })();

  // ── Enrollment analytics
  const enrollByClass = classes.map(cls => ({
    name:  `${cls.name} ${cls.arm||''}`,
    count: students.filter(s => s.class_id === cls.id).length,
  })).sort((a,b) => b.count - a.count);

  const enrollByMonth = (() => {
    const byMonth = {};
    students.forEach(s => {
      if (!s.created_at) return;
      const month = s.created_at.slice(0,7);
      byMonth[month] = (byMonth[month] || 0) + 1;
    });
    return Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6).map(([month,count])=>({
      month: new Date(month+'-01').toLocaleDateString('en-NG',{month:'short',year:'2-digit'}), count
    }));
  })();

  // ── Fee analytics — based on actual receipts issued this term
  const termReceipts = receipts.filter(r => currentTerm && r.term_id === currentTerm.id);
  const paidStudentIds = [...new Set(termReceipts.map(r => r.student_id))];
  const paidStudents = students.filter(s => paidStudentIds.includes(s.id));
  const unpaidStudents = students.filter(s => !paidStudentIds.includes(s.id));

  const barColor = (val, max) => {
    const pct = max > 0 ? val/max : 0;
    return pct >= 0.75 ? '#10b981' : pct >= 0.5 ? '#f59e0b' : '#ef4444';
  };

  const tabs = [
    { id:'attendance', label:'📅 Attendance' },
    { id:'academic',   label:'📚 Academic' },
    { id:'enrollment', label:'👨‍🎓 Enrollment' },
    { id:'fees',       label:'💰 Fees' },
  ];

  if (loading) return <div style={{textAlign:'center',padding:60,color:'#94a3b8'}}>Loading analytics…</div>;

  return (
    <div>
      <div style={S.section('#0891b2')}><span>📊</span><span style={{fontWeight:800,color:'#0891b2'}}>Analytics</span></div>

      {/* Tab bar — 2x2 grid fits all screens */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{padding:'10px 8px',border:'none',borderRadius:12,fontWeight:700,fontSize:13,cursor:'pointer',
              background: activeTab===t.id?'#0891b2':'#f1f5f9',
              color: activeTab===t.id?'#fff':'#64748b',
              transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Attendance Tab */}
      {activeTab === 'attendance' && (
        <div>
          {attData.length < 10 && (
            <div style={{background:'#fffbeb',border:'1.5px solid #fbbf24',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,color:'#92400e',fontWeight:600}}>
              📊 Analytics improve as more attendance is recorded. Mark daily attendance to see meaningful trends.
            </div>
          )}
          {attByClass.length === 0 ? (
            <div style={{textAlign:'center',color:'#94a3b8',padding:40,fontSize:13}}>No attendance data yet.</div>
          ) : (
            <>
              <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
                <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>Attendance Rate by Class</div>
                <div style={{padding:'12px 16px'}}>
                  {attByClass.map((cls,i) => (
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>{cls.name}</span>
                        <span style={{fontSize:12,fontWeight:900,color:barColor(cls.rate,100)}}>{cls.rate}%</span>
                      </div>
                      <div style={{background:'#f1f5f9',borderRadius:99,height:8,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${cls.rate}%`,background:barColor(cls.rate,100),borderRadius:99,transition:'width 0.4s'}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {lowAttStudents.length > 0 && (
                <div style={{...S.card,padding:0,overflow:'hidden'}}>
                  <div style={{padding:'12px 16px',fontWeight:800,color:'#ef4444',borderBottom:'1px solid #f1f5f9',fontSize:13}}>
                    ⚠️ Low Attendance Students (below 75%)
                  </div>
                  {lowAttStudents.map((s,i) => (
                    <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:i<lowAttStudents.length-1?'1px solid #f1f5f9':'none'}}>
                      <div>
                        <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{s.full_name}</div>
                        <div style={{fontSize:11,color:'#64748b'}}>{s.clsName}</div>
                      </div>
                      <span style={{background:'#fef2f2',color:'#ef4444',borderRadius:20,padding:'3px 12px',fontWeight:800,fontSize:12}}>{s.attRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Academic Tab */}
      {activeTab === 'academic' && (
        <div>
          {results.length < 10 && (
            <div style={{background:'#fffbeb',border:'1.5px solid #fbbf24',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,color:'#92400e',fontWeight:600}}>
              📊 Academic analytics improve as more results are entered. Add scores for more students to see subject trends.
            </div>
          )}
          {subjectAvgs.length === 0 ? (
            <div style={{textAlign:'center',color:'#94a3b8',padding:40,fontSize:13}}>No results data yet.</div>
          ) : (
            <>
              <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
                <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>Average Score by Subject</div>
                <div style={{padding:'12px 16px'}}>
                  {subjectAvgs.map((sub,i) => {
                    const max = subjectAvgs[0]?.avg || 100;
                    return (
                      <div key={i} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#374151',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub.name}</span>
                          <span style={{fontSize:12,fontWeight:900,color:barColor(sub.avg,100)}}>{sub.avg}/100</span>
                        </div>
                        <div style={{background:'#f1f5f9',borderRadius:99,height:8,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${sub.avg}%`,background:barColor(sub.avg,100),borderRadius:99}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {topStudents.length > 0 && (
                <div style={{...S.card,padding:0,overflow:'hidden'}}>
                  <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>🏆 Top 5 Students</div>
                  {topStudents.map((s,i) => (
                    <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:i<topStudents.length-1?'1px solid #f1f5f9':'none'}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'#fef9c3':i===1?'#f1f5f9':i===2?'#fef3c7':'#f8fafc',
                        display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:13,color:i===0?'#ca8a04':'#64748b',flexShrink:0}}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{s.full_name}</div>
                        <div style={{fontSize:11,color:'#64748b'}}>{s.clsName}</div>
                      </div>
                      <span style={{background:'#f0fdf4',color:'#10b981',borderRadius:20,padding:'3px 12px',fontWeight:800,fontSize:12}}>{s.avg}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Enrollment Tab */}
      {activeTab === 'enrollment' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
            {[
              {label:'Total Students',value:students.length,color:'#6366f1'},
              {label:'Total Classes', value:classes.length, color:'#0ea5e9'},
              {label:'Total Teachers',value:teachers.length,color:'#10b981'},
            ].map(item=>(
              <div key={item.label} style={{background:`${item.color}10`,border:`1.5px solid ${item.color}30`,borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:900,color:item.color}}>{item.value}</div>
                <div style={{fontSize:10,color:'#64748b',fontWeight:700,marginTop:2}}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>Students per Class</div>
            <div style={{padding:'12px 16px'}}>
              {enrollByClass.filter(c=>c.count>0).map((cls,i)=>{
                const max = enrollByClass[0]?.count||1;
                return(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>{cls.name}</span>
                      <span style={{fontSize:12,fontWeight:900,color:'#6366f1'}}>{cls.count}</span>
                    </div>
                    <div style={{background:'#f1f5f9',borderRadius:99,height:8,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${(cls.count/max)*100}%`,background:'#6366f1',borderRadius:99}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {enrollByMonth.length > 0 && (
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',fontWeight:800,color:'#1e293b',borderBottom:'1px solid #f1f5f9',fontSize:13}}>Monthly Enrollments (Last 6 months)</div>
              <div style={{padding:'12px 16px',display:'flex',alignItems:'flex-end',gap:8,height:120}}>
                {enrollByMonth.map((m,i)=>{
                  const max = Math.max(...enrollByMonth.map(x=>x.count),1);
                  const h   = Math.max(8, Math.round((m.count/max)*80));
                  return(
                    <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                      <span style={{fontSize:10,fontWeight:800,color:'#6366f1'}}>{m.count}</span>
                      <div style={{width:'100%',height:h,background:'#6366f1',borderRadius:'4px 4px 0 0',minHeight:8}}/>
                      <span style={{fontSize:9,color:'#64748b',fontWeight:600,textAlign:'center'}}>{m.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Fees Tab */}
      {activeTab === 'fees' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
            {[
              {label:'Paid This Term',   value:paidStudents.length, color:'#10b981', bg:'#f0fdf4', key:'paid'},
              {label:'Unpaid This Term', value:unpaidStudents.length, color:'#ef4444', bg:'#fef2f2', key:'unpaid'},
            ].map(item=>(
              <div key={item.label} onClick={()=>setFeesView(item.key)} style={{background:item.bg,border:`1.5px solid ${item.color}${feesView===item.key?'':'30'}`,borderRadius:12,padding:'16px 12px',textAlign:'center',cursor:'pointer',boxShadow:feesView===item.key?`0 0 0 2px ${item.color}`:'none'}}>
                <div style={{fontSize:28,fontWeight:900,color:item.color}}>{item.value}</div>
                <div style={{fontSize:11,color:item.color,fontWeight:700,marginTop:2}}>{item.label}</div>
              </div>
            ))}
          </div>

          {feesView==='paid' && (
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',fontWeight:800,color:'#059669',borderBottom:'1px solid #f1f5f9',fontSize:13}}>
                ✅ Students Who Have Paid This Term
              </div>
              {paidStudents.length===0 && <div style={{padding:'20px 16px',textAlign:'center',color:'#94a3b8',fontSize:13}}>No payments recorded yet this term. Issue a receipt under the Receipts tab to record one.</div>}
              {paidStudents.slice(0,20).map((s,i)=>{
                const cls=classes.find(c=>c.id===s.class_id);
                return(
                  <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:i<Math.min(paidStudents.length,20)-1?'1px solid #f1f5f9':'none'}}>
                    <div>
                      <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{s.full_name}</div>
                      <div style={{fontSize:11,color:'#64748b'}}>{cls?`${cls.name} ${cls.arm||''}`:'—'}</div>
                    </div>
                    <span style={{background:'#f0fdf4',color:'#10b981',borderRadius:20,padding:'3px 12px',fontWeight:800,fontSize:11}}>Paid</span>
                  </div>
                );
              })}
              {paidStudents.length > 20 && (
                <div style={{padding:'10px 16px',textAlign:'center',fontSize:12,color:'#94a3b8'}}>+{paidStudents.length-20} more</div>
              )}
            </div>
          )}

          {feesView==='unpaid' && unpaidStudents.length > 0 && (
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',fontWeight:800,color:'#ef4444',borderBottom:'1px solid #f1f5f9',fontSize:13}}>
                ⚠️ Students with No Fee Record This Term
              </div>
              {unpaidStudents.slice(0,20).map((s,i)=>{
                const cls=classes.find(c=>c.id===s.class_id);
                return(
                  <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:i<Math.min(unpaidStudents.length,20)-1?'1px solid #f1f5f9':'none'}}>
                    <div>
                      <div style={{fontWeight:700,color:'#1e293b',fontSize:13}}>{s.full_name}</div>
                      <div style={{fontSize:11,color:'#64748b'}}>{cls?`${cls.name} ${cls.arm||''}`:'—'}</div>
                    </div>
                    <span style={{background:'#fef2f2',color:'#ef4444',borderRadius:20,padding:'3px 12px',fontWeight:800,fontSize:11}}>Unpaid</span>
                  </div>
                );
              })}
              {unpaidStudents.length > 20 && (
                <div style={{padding:'10px 16px',textAlign:'center',fontSize:12,color:'#94a3b8'}}>+{unpaidStudents.length-20} more</div>
              )}
            </div>
          )}

          {paidStudentIds.length === 0 && unpaidStudents.length === 0 && (
            <div style={{textAlign:'center',color:'#94a3b8',padding:40,fontSize:13}}>No fee records for current term yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PrincipalDash({ user, onLogout }) {
  const [tab,setTab]=useState("overview");
  const [students,setStudents]=useState([]); const [classes,setClasses]=useState([]);
  const [teachers,setTeachers]=useState([]); const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]); const [school,setSchool]=useState(null); const [loading,setLoading]=useState(true);
  const [logoDataUrl,setLogoDataUrl]=useState(null);

  useEffect(()=>{
    if(!school?.logo_url){setLogoDataUrl(null);return;}
    fetch(school.logo_url).then(r=>r.blob()).then(blob=>new Promise(res=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.readAsDataURL(blob);})).then(setLogoDataUrl).catch(()=>setLogoDataUrl(null));
  },[school?.logo_url]);

  useEffect(()=>{loadAll();},[]);
  const loadAll=async()=>{
    setLoading(true);
    const schoolId=user.school_id;
    const [sc,s,c,t,se,te]=await Promise.all([
      db.get("schools",{id:schoolId}),
      db.get("students",{school_id:schoolId}),
      db.get("classes",{school_id:schoolId}),
      db.get("users",{role:"teacher",school_id:schoolId}),
      db.get("sessions",{school_id:schoolId}),
      db.get("terms",{school_id:schoolId}),
    ]);
    setStudents(s);setClasses(c);setTeachers(t);setSessions(se);setTerms(te);setSchool(sc[0]||null);setLoading(false);
  };

  const tabs=[
    {id:"overview",  label:"Overview",  icon:"📊", desc:"School summary & stats"},
    {id:"analytics", label:"Analytics", icon:"📈", desc:"Attendance, academic & fee insights"},
    {id:"students", label:"Students",  icon:"👨‍🎓", desc:"Add & manage students"},
    {id:"classes",  label:"Classes",   icon:"🏫", desc:"Manage class arms"},
    {id:"teachers", label:"Teachers",  icon:"👩‍🏫", desc:"Staff & class assignment"},
    {id:"results",  label:"Results",   icon:"📋", desc:"View & generate report cards"},
    {id:"timetable",label:"Timetable", icon:"🗓️", desc:"Class timetable generator"},
    {id:"receipts", label:"Receipts",  icon:"🧾", desc:"Issue payment receipts"},
    {id:"messages", label:"Messages",  icon:"📨", desc:"WhatsApp parent messages"},
    {id:"billing",  label:"Billing",   icon:"💎", desc:"Plans & subscription"},
    {id:"settings", label:"Settings",  icon:"⚙️", desc:"School config & admin"},
  ];

  const planInfo = usePlan(school);
  const goToBilling = () => setTab('billing');

  return (
    <SidebarLayout user={user} role="principal" school={school} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} loading={loading}>
      <PlanBanner school={school} onUpgrade={goToBilling}/>
      {tab==="overview" &&<><OnboardingFlow school={school} user={user} classes={classes} terms={terms} teachers={teachers} students={students} reload={loadAll} onComplete={setTab}/><Overview students={students} classes={classes} teachers={teachers} terms={terms} school={school} onNavigate={setTab}/></>}
      {tab==="analytics"&&<Analytics students={students} classes={classes} teachers={teachers} terms={terms} school={school}/>}
      {tab==="students"&&<ManageStudents students={students} classes={classes} reload={loadAll} schoolId={user.school_id} school={school} planInfo={planInfo} onUpgrade={goToBilling}/>}
      {tab==="classes" &&<ManageClasses classes={classes} reload={loadAll} schoolId={user.school_id} students={students} terms={terms} planInfo={planInfo} onUpgrade={goToBilling}/>}
      {tab==="teachers"&&<ManageTeachers teachers={teachers} classes={classes} reload={loadAll} schoolId={user.school_id} planInfo={planInfo} onUpgrade={goToBilling}/>}
      {tab==="results" &&<FeatureGate feature="results_pdf" school={school} onUpgrade={goToBilling}><ViewResults students={students} classes={classes} terms={terms} school={school} isPrincipal={true}/></FeatureGate>}
      {tab==="timetable"&&<Timetable user={user} classes={classes} school={school} isPrincipal={true}/>}
      {tab==="receipts"&&<FeatureGate feature="receipts" school={school} onUpgrade={goToBilling}><ReceiptInvoice students={students} classes={classes} terms={terms} school={school} user={user} logoDataUrl={logoDataUrl}/></FeatureGate>}
      {tab==="messages"&&<Messages students={students} classes={classes} school={school}/>}
      {tab==="billing" &&<BillingScreen school={school} user={user} onUpgradeSuccess={loadAll}/>}
      {tab==="settings"&&<SchoolSettings school={school} sessions={sessions} terms={terms} students={students} classes={classes} reload={loadAll} schoolId={user.school_id}/>}
    </SidebarLayout>
  );
}

// ── Previous Results Button ────────────────────────────────────
function PreviousResultsButton({ studentId, terms, currentTermId, classes, school }) {
  const [open,setOpen]=useState(false);
  const [prevRemarks,setPrevRemarks]=useState([]);
  const [loading,setLoading]=useState(false);

  const load=async()=>{
    setLoading(true);
    const all=await db.get("remarks",{student_id:studentId});
    setPrevRemarks(all.filter(r=>r.term_id!==currentTermId&&r.report_url));
    setLoading(false);setOpen(true);
  };

  const shareOld=async(r)=>{
    const term=terms.find(t=>t.id===r.term_id);
    const res=await fetch(r.report_url);
    const blob=await res.blob();
    const file=new File([blob],`Report_${term?.name||"Previous"}.pdf`,{type:"application/pdf"});
    if(navigator.share&&navigator.canShare({files:[file]})) await navigator.share({files:[file]});
    else { const a=document.createElement("a");a.href=r.report_url;a.download=file.name;a.click(); }
  };

  if(!open) return <button onClick={load} style={{...S.btn("#94a3b8"),flex:1,fontSize:12}}>{loading?"Loading…":"📂 Previous Results"}</button>;

  return(
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:9999,display:"flex",alignItems:"flex-end"}} onClick={()=>setOpen(false)}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxHeight:"70vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:16}}>📂 Previous Results</div>
        {prevRemarks.length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:20}}>No previous reports found.</div>}
        {prevRemarks.map(r=>{
          const term=terms.find(t=>t.id===r.term_id);
          return(
            <div key={r.id} style={{...S.card,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{term?.name||"Unknown Term"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{r.promotion_status||"—"}</div>
              </div>
              <button onClick={()=>shareOld(r)} style={S.btn("#25d366")}>📤 Share</button>
            </div>
          );
        })}
        <button onClick={()=>setOpen(false)} style={{...S.btn("#64748b"),width:"100%",marginTop:8}}>Close</button>
      </div>
    </div>
  );
}

// ── Stable score row — uncontrolled inputs, saves only on blur ──
const ScoreRow = React.memo(function ScoreRow({ sub, ca, exam, onUpdate, scale, locked }) {
  const total=(Number(ca)||0)+(Number(exam)||0);
  const g=getGrade(total,scale);
  return(
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8,alignItems:"center",background:locked?"#f1f5f9":"#f8fafc",borderRadius:10,padding:"10px 12px",opacity:locked?0.75:1}}>
      <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{sub}</div>
      <input type="text" inputMode="numeric" pattern="[0-9]*" min="0" max="40" defaultValue={ca} disabled={locked}
        onBlur={e=>onUpdate(sub,"ca",e.target.value)}
        placeholder="0–40" style={{...S.input,padding:"7px 10px",cursor:locked?"not-allowed":"text"}}/>
      <input type="text" inputMode="numeric" pattern="[0-9]*" min="0" max="60" defaultValue={exam} disabled={locked}
        onBlur={e=>onUpdate(sub,"exam",e.target.value)}
        placeholder="0–60" style={{...S.input,padding:"7px 10px",cursor:locked?"not-allowed":"text"}}/>
      <div style={{fontWeight:800,color:g.col,fontSize:15,textAlign:"center"}}>{total||"—"}</div>
    </div>
  );
},(prev,next)=>prev.sub===next.sub&&prev.ca===next.ca&&prev.exam===next.exam&&prev.onUpdate===next.onUpdate&&prev.scale===next.scale&&prev.locked===next.locked);

// ── Teacher Dashboard ──────────────────────────────────────────
function TeacherDash({ user, onLogout }) {
  const [tab,setTab]=useState("results");
  const [classes,setClasses]=useState([]); const [students,setStudents]=useState([]);
  const [terms,setTerms]=useState([]); const [school,setSchool]=useState(null);
  const [allStudentsInClass,setAllStudentsInClass]=useState([]);
  const [allSchoolStudents,setAllSchoolStudents]=useState([]);
  const [selectedClass,setSelectedClass]=useState(""); const [selectedTerm,setSelectedTerm]=useState("");
  const [selectedStudent,setSelectedStudent]=useState(null); const [subjects,setSubjects]=useState([]);
  const [scores,setScores]=useState({}); const [attendance,setAttendance]=useState({days_present:"",total_days:""});
  // Stable reference so ScoreRow's React.memo doesn't see a "new" scale on
  // every keystroke (a fresh array each render defeated memoization and
  // caused the on-screen keyboard to drop while typing in score fields).
  const gradeScale=useMemo(()=>normalizeGradeScale(school?.grade_scale),[school?.grade_scale]);
  const updateScore=useCallback((sub,field,val)=>{
    const max=field==="ca"?40:60;
    const capped=Math.min(Math.max(Number(val)||0,0),max);
    setScores(p=>({...p,[sub]:{...p[sub],[field]:capped}}));
  },[]);
  const [remarks,setRemarks]=useState({teacher_remark:""}); const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false); const [generating,setGenerating]=useState(false);
  const teacherRemarkRef=useRef(null);
  const [remarkErr,setRemarkErr]=useState("");
  const [currentResults,setCurrentResults]=useState([]); const [currentAttendance,setCurrentAttendance]=useState(null);
  const [currentRemarks,setCurrentRemarks]=useState(null); const [logoDataUrl,setLogoDataUrl]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{loadData();},[]);

  // Re-fetch classes whenever the teacher returns to this tab (or on
  // first load), so admin edits to a class's subject list show up
  // without the teacher needing to fully reload the page. This refreshes
  // ALL of the teacher's assigned classes (important for multi-class
  // teachers), not just whichever one happens to be selected.
  const refreshMyClasses=useCallback(()=>{
    db.get("classes",{school_id:user.school_id}).then(c=>{
      const myClassIds=(user.class_ids&&user.class_ids.length)?user.class_ids:(user.class_id?[user.class_id]:[]);
      const filtered=myClassIds.length?c.filter(cls=>myClassIds.includes(cls.id)):c;
      setClasses(filtered);
    });
  },[user.school_id,user.class_ids,user.class_id]);

  useEffect(()=>{ if(tab==="results") refreshMyClasses(); },[tab,refreshMyClasses]);
  const loadData=async()=>{
    setLoading(true);
    const schoolId=user.school_id;
    const [c,t,sc]=await Promise.all([
      db.get("classes",{school_id:schoolId}),
      db.get("terms",{school_id:schoolId}),
      db.get("schools",{id:schoolId}),
    ]);
    const schoolData=sc[0]||null; setSchool(schoolData); setTerms(t);
    const curr=t.find(t=>t.is_current); if(curr) setSelectedTerm(curr.id);
    const myClassIds = (user.class_ids && user.class_ids.length) ? user.class_ids : (user.class_id ? [user.class_id] : []);
    if(myClassIds.length){setClasses(c.filter(cls=>myClassIds.includes(cls.id)));setSelectedClass(myClassIds[0]);}
    else setClasses(c);
    // Load all students for this school (used by DailyAttendance)
    db.get("students",{school_id:schoolId}).then(setAllSchoolStudents);
    if(schoolData?.logo_url){
      fetch(schoolData.logo_url).then(r=>r.blob()).then(blob=>new Promise(res=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.readAsDataURL(blob);})).then(setLogoDataUrl).catch(()=>{});
    }
    setLoading(false);
    refreshMyClasses();
  };

  useEffect(()=>{
    if(!selectedClass) return;
    // Fetch this class fresh rather than trusting `classes` from initial
    // mount — that array can be stale if an admin updated the subject
    // list after this session started, or if the teacher never switches
    // tabs (so the tab-based refresh below never gets a chance to run).
    db.get("classes",{id:selectedClass}).then(c=>{
      const cls=c[0]||classes.find(c=>c.id===selectedClass);
      setSubjects(getClassSubjects(cls));
    });
    db.get("students",{class_id:selectedClass}).then(s=>{setStudents(s);setAllStudentsInClass(s);});
    setSelectedStudent(null);
  },[selectedClass]);

  useEffect(()=>{setSaved(false);if(selectedStudent&&selectedTerm) loadStudentData();},[selectedStudent,selectedTerm]);

  const loadStudentData=async()=>{
    const [r,a,rem]=await Promise.all([
      db.get("results",{student_id:selectedStudent.id,term_id:selectedTerm}),
      db.get("attendance",{student_id:selectedStudent.id,term_id:selectedTerm}),
      db.get("remarks",{student_id:selectedStudent.id,term_id:selectedTerm}),
    ]);
    const sc={};
    r.forEach(res=>{sc[res.subject_name]={ca:res.ca_score,exam:res.exam_score,id:res.id};});
    setScores(sc);setCurrentResults(r);
    if(r.length>0) setSaved(true);
    const att=a[0]||null; const remRow=rem[0]||null;
    setAttendance(att?{days_present:att.days_present,total_days:att.total_days,id:att.id}:{days_present:"",total_days:""});
    setCurrentAttendance(att);
    setRemarks(remRow?{teacher_remark:remRow.teacher_remark||"",id:remRow.id}:{teacher_remark:""});
    setCurrentRemarks(remRow);
  };

  const saveResults=async()=>{
    if(!selectedStudent){alert("Select a student");return;}
    if(!selectedTerm){alert("Select a term");return;}
    // Read the textarea's live value directly (not just state) so a remark
    // typed but not yet blurred still counts — closes the same race that
    // could silently skip a remark if Save was clicked right after typing.
    const liveRemark=(teacherRemarkRef.current?.value ?? remarks.teacher_remark ?? "").trim();
    if(!liveRemark){setRemarkErr("Class teacher's remark is required before saving results.");return;}
    setRemarkErr("");
    setSaving(true);
    // All of these writes are independent of each other, so run them in
    // parallel instead of one-at-a-time — sequential awaits here (one
    // round-trip per subject, plus attendance, plus remark) was the cause
    // of saves taking several seconds longer than necessary on mobile data.
    const resultWrites = subjects.map(async sub=>{
      const sc=scores[sub]||{ca:0,exam:0};
      const caVal=Math.min(40,Math.max(0,Number(sc.ca)||0));
      const examVal=Math.min(60,Math.max(0,Number(sc.exam)||0));
      if(sc.id){ await db.patch("results",sc.id,{ca_score:caVal,exam_score:examVal}); return {subject_name:sub,ca_score:caVal,exam_score:examVal,id:sc.id}; }
      const ins=await db.post("results",{student_id:selectedStudent.id,term_id:selectedTerm,subject_name:sub,ca_score:caVal,exam_score:examVal});
      if(ins) setScores(p=>({...p,[sub]:{...p[sub],id:ins.id}}));
      return {subject_name:sub,ca_score:caVal,exam_score:examVal,id:ins?.id};
    });
    const dpVal=Number(attendance.days_present)||0; const tdVal=Number(attendance.total_days)||0;
    const attendanceWrite=(async()=>{
      if(attendance.id) await db.patch("attendance",attendance.id,{days_present:dpVal,total_days:tdVal});
      else{const ins=await db.post("attendance",{student_id:selectedStudent.id,term_id:selectedTerm,days_present:dpVal,total_days:tdVal});if(ins)setAttendance(p=>({...p,id:ins.id}));}
    })();
    const remarkWrite=(async()=>{
      if(remarks.id) await db.patch("remarks",remarks.id,{teacher_remark:liveRemark});
      else{const ins=await db.post("remarks",{student_id:selectedStudent.id,term_id:selectedTerm,teacher_remark:liveRemark});if(ins)setRemarks(p=>({...p,id:ins.id}));}
      setRemarks(p=>({...p,teacher_remark:liveRemark}));
    })();
    const [savedList]=await Promise.all([Promise.all(resultWrites),attendanceWrite,remarkWrite]);
    setCurrentResults(savedList.map(r=>({...r,student_id:selectedStudent.id,term_id:selectedTerm})));
    // Post notification for principal — fire-and-forget, doesn't need to block "saved" feedback
    (async()=>{
      try{
        const termName=(terms.find(t=>t.id===selectedTerm)||{}).name||"";
        await db.post("notifications",{
          school_id:school?school.id:null,
          message:user.full_name+" saved results for "+selectedStudent.full_name+" ("+termName+")",
          teacher_id:user.id,
          read:false
        });
      }catch(e){}
    })();
    setSaving(false);setSaved(true);
  };

  const generateAndSend=async()=>{
    if(!selectedStudent) return;
    setGenerating(true);
    try{
      // Always check the freshest remark — block teachers from generating/
      // sharing a report until the principal has added their remark, so
      // results can't go to parents without principal sign-off.
      const freshRemarks=await db.get("remarks",{student_id:selectedStudent.id,term_id:selectedTerm});
      const latestRemark=freshRemarks[0]||currentRemarks;
      if(!latestRemark?.principal_remark){
        alert("⛔ Principal's remark required.\n\nThis report can't be shared until the principal adds their remark. Please check back after the principal reviews it.");
        setGenerating(false);
        return;
      }
      const cls=classes.find(c=>c.id===selectedClass);
      const term=terms.find(t=>t.id===selectedTerm);
      const subs=getClassSubjects(cls);
      const allClassResults=await db.get("results",{term_id:selectedTerm,student_id:allStudentsInClass.map(s=>s.id)});
      // 1. Generate PDF blob
      const blob=await generateReportPDF(selectedStudent,cls,term,subs,currentResults,currentAttendance,latestRemark,allStudentsInClass,allClassResults,school,logoDataUrl);
      // 2. Upload to Supabase Storage + save URL
      await uploadAndSaveReport(blob,selectedStudent,term,latestRemark?.id,user.school_id);
      // 3. Share via native share sheet
      await sharePDFFile(blob,selectedStudent,term,selectedStudent.guardian_name);
    }catch(e){alert("Error: "+e.message);}
    setGenerating(false);
  };

  const tabs=[
    {id:"results",    label:"Enter Results",    icon:"📝", desc:"Score entry per student"},
    {id:"attendance", label:"Daily Attendance", icon:"📅", desc:"Mark & track daily attendance"},
    {id:"timetable",  label:"Timetable",        icon:"🗓️", desc:"View & edit class timetable"},
    {id:"report",     label:"View Reports",     icon:"📋", desc:"View & download report cards"},
  ];

  const myClassIds = (user.class_ids && user.class_ids.length) ? user.class_ids : (user.class_id ? [user.class_id] : []);

  const teacherResultsJsx = (
    <div>
      <div style={S.section("#0ea5e9")}><span>📝</span><span style={{fontWeight:800,color:"#0ea5e9"}}>Enter Student Results</span></div>
      {!myClassIds.length&&<div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#92400e",fontWeight:600}}>⚠️ No class assigned. Ask the Principal to assign you a class.</div>}
      {myClassIds.length>0 && (
        <div style={{...S.card,marginBottom:16,background:"#f0fdf4",border:"1.5px solid #bbf7d0"}}>
          <div style={{fontWeight:800,color:"#059669",fontSize:13,marginBottom:8}}>🏫 Your Class{myClassIds.length>1?"es":""} ({myClassIds.length})</div>
          {myClassIds.map(cid=>{
            const c=classes.find(cl=>cl.id===cid);
            if(!c) return null;
            const subs=getClassSubjects(c);
            return (
              <div key={cid} style={{marginBottom:6,paddingBottom:6,borderBottom:"1px solid #d1fae5"}}>
                <div style={{fontWeight:700,color:"#1e293b",fontSize:13}}>{c.name} {c.arm||""}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{subs.length} subjects: {subs.slice(0,4).join(", ")}{subs.length>4?`, +${subs.length-4} more`:""}</div>
              </div>
            );
          })}
        </div>
      )}
      <div style={S.card}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div><label style={S.label}>Class</label>
            <select style={S.input} value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} disabled={myClassIds.length===1}>
              <option value="">Choose class</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
            </select>
          </div>
          <div><label style={S.label}>Term</label>
            <select style={S.input} value={selectedTerm} onChange={e=>setSelectedTerm(e.target.value)}>
              <option value="">Choose term</option>
              {terms.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_current?" ✓":""}</option>)}
            </select>
          </div>
        </div>
        {selectedClass&&(
          <div><label style={S.label}>Select Student</label>
            <select style={S.input} value={selectedStudent?.id||""} onChange={e=>setSelectedStudent(students.find(s=>s.id===e.target.value)||null)}>
              <option value="">Choose student</option>
              {students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
      </div>
      {selectedStudent&&(
        <div style={S.card}>
          <div style={{fontWeight:800,color:"#1e293b",fontSize:16,marginBottom:16}}>📋 {selectedStudent.full_name}</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
            {["Subject","CA (40)","Exam (60)","Total"].map(h=><div key={h} style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</div>)}
          </div>
          {subjects.map(sub=>{
            const sc=scores[sub]||{ca:"",exam:""};
            return <ScoreRow key={sub} sub={sub} ca={sc.ca} exam={sc.exam} onUpdate={updateScore} scale={gradeScale} locked={saved}/>;
          })}
          <div style={{marginTop:20,borderTop:"2px solid #e0e7ff",paddingTop:16}}>
            <div style={{fontWeight:800,color:"#1e293b",marginBottom:12}}>📅 Attendance</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div><label style={S.label}>Days Present</label><input type="text" inputMode="numeric" pattern="[0-9]*" style={{...S.input,cursor:saved?"not-allowed":"text"}} disabled={saved} defaultValue={attendance.days_present} onBlur={e=>setAttendance(p=>({...p,days_present:e.target.value}))} placeholder="e.g. 58"/></div>
              <div><label style={S.label}>Total School Days</label><input type="text" inputMode="numeric" pattern="[0-9]*" style={{...S.input,cursor:saved?"not-allowed":"text"}} disabled={saved} defaultValue={attendance.total_days} onBlur={e=>setAttendance(p=>({...p,total_days:e.target.value}))} placeholder="e.g. 62"/></div>
            </div>
            <div style={{fontWeight:800,color:"#1e293b",marginBottom:12}}>💬 Class Teacher's Remark <span style={{color:"#ef4444",fontWeight:700}}>*Required before saving</span></div>
            <textarea ref={teacherRemarkRef} disabled={saved} style={{...S.input,height:70,resize:"vertical",marginBottom:remarkErr?4:16,cursor:saved?"not-allowed":"text"}} defaultValue={remarks.teacher_remark} onBlur={e=>{setRemarks(p=>({...p,teacher_remark:e.target.value}));if(e.target.value.trim())setRemarkErr("");}} placeholder="Enter your remarks…"/>
            {remarkErr&&<div style={{color:"#ef4444",fontSize:12,fontWeight:600,marginBottom:16}}>⚠️ {remarkErr}</div>}
          </div>
          {saved&&<div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,marginBottom:12,textAlign:"center"}}>✅ Results saved!</div>}
          <div style={{display:"flex",gap:10,flexDirection:"column"}}>
            <button onClick={saveResults} disabled={saving||saved} style={{...S.btn(saved?"#94a3b8":"#10b981"),width:"100%",padding:"13px",fontSize:15,opacity:saved?0.7:1}}>{saving?"Saving…":saved?"✅ Results Saved":"💾 Save Results"}</button>
            {saved&&<button onClick={()=>setSaved(false)} style={{...S.btn("#f59e0b"),width:"100%",padding:"10px",fontSize:13,marginTop:8}}>✏️ Edit Results</button>}
            {saved&&selectedStudent.guardian_phone&&<button onClick={generateAndSend} disabled={generating} style={{...S.btn("#25d366"),width:"100%",padding:"13px",fontSize:15}}>{generating?"⏳ Uploading & Sharing…":"📤 Generate PDF & Share via WhatsApp"}</button>}
            {saved&&!selectedStudent.guardian_phone&&<div style={{background:"#fff7ed",border:"1.5px solid #f59e0b",borderRadius:10,padding:"10px 16px",color:"#92400e",fontSize:13,textAlign:"center"}}>⚠️ No WhatsApp number for this student's guardian</div>}
            {currentRemarks?.report_url&&(
              <div style={{marginTop:10,display:"flex",gap:8}}>
                <button onClick={()=>window.open(currentRemarks.report_url,"_blank")} style={{...S.btn("#6366f1"),flex:1,fontSize:12}}>📄 View Current PDF</button>
                <PreviousResultsButton studentId={selectedStudent.id} terms={terms} currentTermId={selectedTerm} classes={classes} school={school}/>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return(
    <SidebarLayout user={user} role="teacher" school={school} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} loading={loading}>
      {tab==="results"&&teacherResultsJsx}
      {tab==="attendance"&&<FeatureGate feature="attendance" school={school} onUpgrade={()=>{}}><DailyAttendance user={user} classes={classes} terms={terms} students={allSchoolStudents}/></FeatureGate>}
      {tab==="timetable" &&<Timetable user={user} classes={classes} school={school} isPrincipal={false}/>}
      {tab==="report"&&<ViewResults students={students} classes={classes.length?classes:[]} terms={terms} school={school} isPrincipal={false}/>}
    </SidebarLayout>
  );
}

// ── Stable form field — defined OUTSIDE Register to prevent remount on keystroke ──
function FormField({label,value,onChange,type="text",placeholder}){
  return(
    <div style={{marginBottom:14}}>
      <label style={S.label}>{label}</label>
      <input style={S.input} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
    </div>
  );
}

// ── School Registration ────────────────────────────────────────
function Register({ onRegistered }) {
  const [step,setStep]=useState(1);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [school,setSchool]=useState({name:"",address:"",phone:"",email:""});
  const [admin,setAdmin]=useState({full_name:"",email:"",password:"",confirm:""});

  const nextStep=()=>{
    if(!school.name.trim()){setErr("School name is required");return;}
    if(!school.email.trim()){setErr("School email is required");return;}
    setErr("");setStep(2);
  };

  const register=async()=>{
    if(!admin.full_name.trim()||!admin.email.trim()||!admin.password.trim()){setErr("All fields required");return;}
    if(admin.password!==admin.confirm){setErr("Passwords do not match");return;}
    if(admin.password.length<6){setErr("Password must be at least 6 characters");return;}
    setLoading(true);setErr("");
    try{
      const existing=await db.get("schools",{email:school.email.trim()});
      if(existing.length){setErr("A school with this email already exists.");setLoading(false);return;}
      const newSchool=await db.post("schools",{name:school.name.trim(),address:school.address.trim(),phone:school.phone.trim(),email:school.email.trim()});
      if(!newSchool){setErr("Failed to create school. Check browser console for details.");setLoading(false);return;}
      const hashedAdminPw = await hashPassword(admin.password);
      const newUser=await db.post("users",{full_name:admin.full_name.trim(),email:admin.email.trim().toLowerCase(),password:hashedAdminPw,role:"principal",school_id:newSchool.id});
      if(!newUser){setErr("School created but failed to create admin. Contact support.");setLoading(false);return;}
      await activateUserContext(newUser.id);
      const { password: _pw2, ...safeNewUser } = newUser;
      sessionStorage.setItem("school_uid", newUser.id);
      onRegistered(safeNewUser);
    }catch(e){setErr("Registration failed. Check your connection and try again.");}
    setLoading(false);
  };

  

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a8a,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:24,padding:32,width:"100%",maxWidth:420,boxShadow:"0 20px 60px #0000003a"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:44,marginBottom:6}}>🏫</div>
          <h1 style={{margin:0,fontSize:20,fontWeight:900,color:"#1e3a8a"}}>Register Your School</h1>
          <p style={{margin:"6px 0 0",color:"#64748b",fontSize:13}}>Set up your school in under 2 minutes</p>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:24}}>
          {[["1","School Info"],["2","Admin Account"]].map(([n,l])=>(
            <div key={n} style={{flex:1,textAlign:"center"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:step>=Number(n)?"#1e3a8a":"#e2e8f0",color:step>=Number(n)?"#fff":"#94a3b8",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 4px"}}>{n}</div>
              <div style={{fontSize:11,color:step>=Number(n)?"#1e3a8a":"#94a3b8",fontWeight:600}}>{l}</div>
            </div>
          ))}
        </div>
        {err&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",color:"#dc2626",fontSize:13,marginBottom:16}}>{err}</div>}
        {step===1?(
          <>
            <FormField label="School Name *" value={school.name} onChange={v=>setSchool(p=>({...p,name:v}))} placeholder="e.g. Greenfield Academy"/>
            <FormField label="School Email *" value={school.email} onChange={v=>setSchool(p=>({...p,email:v}))} type="email" placeholder="admin@greenfieldacademy.com"/>
            <FormField label="Phone Number" value={school.phone} onChange={v=>setSchool(p=>({...p,phone:v}))} placeholder="e.g. 08012345678"/>
            <FormField label="Address" value={school.address} onChange={v=>setSchool(p=>({...p,address:v}))} placeholder="School address"/>
            <button onClick={nextStep} style={{...S.btn(),width:"100%",padding:"13px",fontSize:15,marginTop:4}}>Next →</button>
          </>
        ):(
          <>
            <FormField label="Principal's Full Name *" value={admin.full_name} onChange={v=>setAdmin(p=>({...p,full_name:v}))} placeholder="e.g. Mrs. Adaeze Okafor"/>
            <FormField label="Login Email *" value={admin.email} onChange={v=>setAdmin(p=>({...p,email:v}))} type="email" placeholder="principal@email.com"/>
            <FormField label="Password *" value={admin.password} onChange={v=>setAdmin(p=>({...p,password:v}))} type="password" placeholder="Min. 6 characters"/>
            <FormField label="Confirm Password *" value={admin.confirm} onChange={v=>setAdmin(p=>({...p,confirm:v}))} type="password" placeholder="Repeat password"/>
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={()=>{setStep(1);setErr("");}} style={{...S.btn("#64748b"),flex:1,padding:"13px",fontSize:14}}>← Back</button>
              <button onClick={register} disabled={loading} style={{...S.btn(),flex:2,padding:"13px",fontSize:15}}>{loading?"Creating account…":"Register School 🎉"}</button>
            </div>
          </>
        )}
        <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,marginTop:20}}>
          Already registered?{" "}
          <span onClick={()=>onRegistered(null)} style={{color:"#1e3a8a",fontWeight:700,cursor:"pointer"}}>Sign in here</span>
        </p>
      </div>
    </div>
  );
}

// ── App Root ───────────────────────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const LAST_ACTIVE_KEY = "last_active_ts";

export default function App() {
  const [user,setUser]=useState(null);
  const [screen,setScreen]=useState("login");
  const [showTimeoutWarning,setShowTimeoutWarning]=useState(false);
  const timerRef=useRef(null);
  const warnRef=useRef(null);

  // Restore session from stored user ID only — never store full user object
  useEffect(()=>{
    try{
      const uid=sessionStorage.getItem("school_uid");
      if(uid){ activateUserContext(uid).then(()=>{ db.get("users",{id:uid}).then(rows=>{ if(rows[0]){ setUser(rows[0]); setScreen("app"); } }); }); }
    }catch(e){}
  },[]);

  const handleLogin=(u)=>{
    sessionStorage.setItem("school_uid", u.id);
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    Sentry.setUser({ id: u.id, email: u.email, username: u.full_name });
    setUser(u); setScreen("app");
  };
  const handleRegistered=(u)=>{ if(u){
    sessionStorage.setItem("school_uid", u.id);
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    Sentry.setUser({ id: u.id, email: u.email, username: u.full_name });
    setUser(u); setScreen("app");
  } else { setScreen("login"); } };

  const handleLogout=useCallback(()=>{
    clearUserContext();
    Sentry.setUser(null);
    sessionStorage.removeItem("school_uid");
    localStorage.removeItem(LAST_ACTIVE_KEY);
    setUser(null); setScreen("login"); setShowTimeoutWarning(false);
    clearTimeout(timerRef.current); clearTimeout(warnRef.current);
  },[]);

  const checkInactivity=useCallback(()=>{
    const last=parseInt(localStorage.getItem(LAST_ACTIVE_KEY)||"0");
    if(!last) return; // fresh login — key set by handleLogin, don't logout
    const elapsed=Date.now()-last;
    if(elapsed>=INACTIVITY_TIMEOUT_MS){ handleLogout(); return; }
    // Only update state when it actually needs to change — calling
    // setShowTimeoutWarning unconditionally here re-renders the ENTIRE
    // app on every check, which (combined with resetTimer firing on
    // every tap/click/touch) was the actual cause of the on-screen
    // keyboard dropping when moving between input fields.
    setShowTimeoutWarning(prev=>{
      const shouldShow=elapsed>=INACTIVITY_TIMEOUT_MS-60000;
      return prev===shouldShow?prev:shouldShow;
    });
  },[handleLogout]);

  const resetTimer=useCallback(()=>{
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    // Functional update + bail-out when already false avoids triggering
    // a re-render of the whole app on every single tap/click/touchstart —
    // this fires globally on EVERY interaction, including tapping from
    // one input into another, so an unconditional setState here was
    // remounting/re-rendering the entire screen (and dropping the mobile
    // keyboard) every time the user moved between score entry fields.
    setShowTimeoutWarning(prev=>prev?false:prev);
    clearTimeout(timerRef.current); clearTimeout(warnRef.current);
    warnRef.current=setTimeout(()=>setShowTimeoutWarning(true), INACTIVITY_TIMEOUT_MS-60000);
    timerRef.current=setTimeout(()=>handleLogout(), INACTIVITY_TIMEOUT_MS);
  },[handleLogout]);

  useEffect(()=>{
    if(!user){ clearTimeout(timerRef.current); clearTimeout(warnRef.current); return; }
    checkInactivity();
    const events=["mousedown","mousemove","keydown","touchstart","touchmove","scroll","click"];
    events.forEach(e=>document.addEventListener(e,resetTimer,{passive:true}));
    const onVisible=()=>{ if(document.visibilityState==="visible") checkInactivity(); };
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",checkInactivity);

    // Logout when app is closed or swiped away
    const onPageHide=()=>{ handleLogout(); };
    window.addEventListener("pagehide", onPageHide);

    resetTimer();
    return()=>{
      events.forEach(e=>document.removeEventListener(e,resetTimer));
      document.removeEventListener("visibilitychange",onVisible);
      window.removeEventListener("focus",checkInactivity);
      window.removeEventListener("pagehide", onPageHide);
      clearTimeout(timerRef.current); clearTimeout(warnRef.current);
    };
  },[user]);

  if(user) return(
    <>
      {showTimeoutWarning&&(
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#1e3a8a",color:"#fff",borderRadius:12,padding:"12px 20px",zIndex:9999,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px #0000004a",display:"flex",gap:12,alignItems:"center",whiteSpace:"nowrap"}}>
          ⏱️ Session expiring in 1 minute
          <button onClick={resetTimer} style={{background:"#fff",color:"#1e3a8a",border:"none",borderRadius:8,padding:"4px 12px",fontWeight:800,cursor:"pointer",fontSize:12}}>Stay Logged In</button>
        </div>
      )}
      {user.role==="super_admin"
        ?<SuperAdminDash user={user} onLogout={handleLogout}/>
        :user.role==="principal"
        ?<PrincipalDash user={user} onLogout={handleLogout}/>
        :<TeacherDash user={user} onLogout={handleLogout}/>}
    </>
  );

  if(screen==="register") return <Register onRegistered={handleRegistered}/>;

  return <Login onLogin={handleLogin} onRegister={()=>setScreen("register")}/>;
}
