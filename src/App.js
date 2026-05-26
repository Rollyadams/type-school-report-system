import React, { useState, useEffect, useRef } from 'react';
import { db, supabase, activateUserContext } from './supabaseClient';

const NIGERIAN_SUBJECTS = {
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

const CLASS_ORDER = [
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

const getGrade = (score) => {
  if (score >= 90) return { g:"A+", r:"Outstanding",   col:"#059669" };
  if (score >= 80) return { g:"A",  r:"Excellent",     col:"#10b981" };
  if (score >= 70) return { g:"B",  r:"Very Good",     col:"#2563eb" };
  if (score >= 60) return { g:"C",  r:"Good",          col:"#d97706" };
  if (score >= 50) return { g:"D",  r:"Average",       col:"#ea580c" };
  if (score >= 40) return { g:"E",  r:"Below Average", col:"#dc2626" };
  return                   { g:"F",  r:"Fail",          col:"#7f1d1d" };
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
    return {sub,ca,exam,total,...getGrade(Math.round(total))};
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
  const overall = getGrade(avg);
  const getStudentTotal = (sid) => subjects.reduce((a,sub)=>{
    const r=allResults.find(r=>r.student_id===sid&&r.subject_name===sub);
    return a+(r?.ca_score||0)+(r?.exam_score||0);
  },0);
  const ranked=[...allStudents.map(s=>s.id)].sort((a,b)=>getStudentTotal(b)-getStudentTotal(a));
  const pos=ranked.indexOf(student.id)+1;
  const promotionStatus=remarks?.promotion_status||"";

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
};

// ── Login (Staff + Parent Result Checker) ─────────────────────
function Login({ onLogin }) {
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState("staff");
  const [admNum,setAdmNum]=useState(""); const [parentLoading,setParentLoading]=useState(false);
  const [parentErr,setParentErr]=useState(""); const [parentData,setParentData]=useState(null);

  const login = async () => {
    if(!email||!pass){setErr("Please enter email and password");return;}
    setLoading(true);setErr("");
    try{
      const users=await db.get("users",{email});
      if(!users.length){setErr("User not found");setLoading(false);return;}
      if(pass!=="school1234"){setErr("Incorrect password");setLoading(false);return;}
      await activateUserContext(users[0].id);
      onLogin(users[0]);
    }catch(e){setErr("Connection error. Try again.");}
    setLoading(false);
  };

  const checkResult = async () => {
    if(!admNum.trim()){setParentErr("Enter admission number");return;}
    setParentLoading(true);setParentErr("");setParentData(null);
    try{
      const students=await db.get("students",{admission_number:admNum.trim()});
      if(!students.length){setParentErr("No student found with that admission number");setParentLoading(false);return;}
      const student=students[0];
      const [classes,terms,schools]=await Promise.all([db.get("classes"),db.get("terms"),db.get("schools")]);
      const term=terms.find(t=>t.is_current);
      if(!term){setParentErr("No current term set by school");setParentLoading(false);return;}
      const cls=classes.find(c=>c.id===student.class_id);
      const subjects=cls?(NIGERIAN_SUBJECTS[cls.name]||[]):[];
      const classmatesAll=await db.get("students",{class_id:student.class_id});
      const [results,allResults,attendance,remarks]=await Promise.all([
        db.get("results",{student_id:student.id,term_id:term.id}),
        db.get("results",{term_id:term.id,student_id:classmatesAll.map(s=>s.id)}),
        db.get("attendance",{student_id:student.id,term_id:term.id}),
        db.get("remarks",{student_id:student.id,term_id:term.id}),
      ]);
      setParentData({student,cls,term,subjects,results,allStudents:classmatesAll,allResults,attendance:attendance[0]||null,remarks:remarks[0]||null,school:schools[0]||null});
    }catch(e){setParentErr("Error fetching result. Try again.");}
    setParentLoading(false);
  };

  if(parentData) return <ParentResultView data={parentData} onBack={()=>setParentData(null)} />;

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a8a,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:24,padding:36,width:"100%",maxWidth:400,boxShadow:"0 20px 60px #0000003a"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:8}}>🎓</div>
          <h1 style={{margin:0,fontSize:20,fontWeight:900,color:"#1e3a8a"}}>School Report System</h1>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[["staff","👩‍🏫 Staff Login"],["parent","👨‍👩‍👧 Check Result"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"10px",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",background:mode===m?"#1e3a8a":"#f1f5f9",color:mode===m?"#fff":"#64748b"}}>{l}</button>
          ))}
        </div>
        {mode==="staff"?(
          <>
            <div style={{marginBottom:16}}><label style={S.label}>Email</label><input style={S.input} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="your@email.com" type="email"/></div>
            <div style={{marginBottom:20}}><label style={S.label}>Password</label><input style={S.input} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" type="password"/></div>
            {err&&<div style={{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={login} disabled={loading} style={{...S.btn(),width:"100%",padding:"13px",fontSize:15}}>{loading?"Signing in…":"Sign In →"}</button>
            <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,marginTop:16}}>Default password: <strong>school1234</strong></p>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}><label style={S.label}>Admission Number</label><input style={S.input} value={admNum} onChange={e=>setAdmNum(e.target.value)} onKeyDown={e=>e.key==="Enter"&&checkResult()} placeholder="e.g. CBS/2024/001"/></div>
            {parentErr&&<div style={{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{parentErr}</div>}
            <button onClick={checkResult} disabled={parentLoading} style={{...S.btn("#10b981"),width:"100%",padding:"13px",fontSize:15}}>{parentLoading?"Checking…":"View My Child's Result →"}</button>
            <p style={{textAlign:"center",color:"#94a3b8",fontSize:12,marginTop:12}}>Enter your child's admission number to view current term result.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Parent Result View ─────────────────────────────────────────
function ParentResultView({ data, onBack }) {
  const {student,cls,term,subjects,results,allStudents,allResults,attendance,remarks,school}=data;
  const [generating,setGenerating]=useState(false);
  const sResults=subjects.map(sub=>{
    const r=results.find(r=>r.subject_name===sub);
    return {sub,ca:r?.ca_score||0,exam:r?.exam_score||0,total:(r?.ca_score||0)+(r?.exam_score||0)};
  });
  const totalMarks=sResults.reduce((a,r)=>a+r.total,0);
  const avg=sResults.length?Math.round(totalMarks/sResults.length):0;
  const overall=getGrade(avg);
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
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
            {["Subject","CA","Exam","Total","Grade"].map(h=><div key={h} style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</div>)}
          </div>
          {sResults.map((r,i)=>{
            const g=getGrade(r.total);
            return(
              <div key={r.sub} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:8,padding:"9px 0",borderBottom:i<sResults.length-1?"1px solid #f1f5f9":"none",alignItems:"center"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{r.sub}</div>
                <div style={{textAlign:"center",fontSize:12,color:"#64748b"}}>{r.ca}</div>
                <div style={{textAlign:"center",fontSize:12,color:"#64748b"}}>{r.exam}</div>
                <div style={{textAlign:"center",fontWeight:800,color:g.col}}>{r.total}</div>
                <div style={{textAlign:"center"}}><span style={S.badge(g.col)}>{g.g}</span></div>
              </div>
            );
          })}
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
function SchoolSettings({ school, reload }) {
  const [form,setForm]=useState({name:school?.name||"",address:school?.address||"",phone:school?.phone||"",email:school?.email||"",logo_url:school?.logo_url||""});
  const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false); const [uploading,setUploading]=useState(false);

  const save=async()=>{
    setSaving(true);
    if(school?.id) await db.patch("schools",school.id,form);
    else await db.post("schools",form);
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
      <div style={S.section("#8b5cf6")}><span>⚙️</span><span style={{fontWeight:800,color:"#8b5cf6"}}>School Settings</span></div>
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
        {saved&&<div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,margin:"12px 0",textAlign:"center"}}>✅ Settings saved!</div>}
        <button onClick={save} disabled={saving} style={{...S.btn("#8b5cf6"),marginTop:12}}>{saving?"Saving…":"💾 Save Settings"}</button>
      </div>
    </div>
  );
}

// ── Promote Students ───────────────────────────────────────────
function PromoteStudents({ students, classes, terms, reload }) {
  const [selectedClass,setSelectedClass]=useState("");
  const [selectedTerm,setSelectedTerm]=useState(terms.find(t=>t.is_current)?.id||"");
  const [results,setResults]=useState([]); const [remarks,setRemarks]=useState([]);
  const [loading,setLoading]=useState(false); const [promoting,setPromoting]=useState(false);
  const [promotionMap,setPromotionMap]=useState({}); const [done,setDone]=useState(false);

  const cls=classes.find(c=>c.id===selectedClass);
  const classStudents=students.filter(s=>s.class_id===selectedClass);
  const subjects=cls?(NIGERIAN_SUBJECTS[cls.name]||[]):[];
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
            const avg=getAvg(s.id); const g=getGrade(avg); const status=promotionMap[s.id]||"Promoted";
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
function ManageStudents({ students, classes, reload, schoolId }) {
  const [form,setForm]=useState({full_name:"",admission_number:"",gender:"",date_of_birth:"",guardian_name:"",guardian_phone:"",class_id:""});
  const [adding,setAdding]=useState(false); const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false); const [editId,setEditId]=useState(null);
  const resetForm=()=>setForm({full_name:"",admission_number:"",gender:"",date_of_birth:"",guardian_name:"",guardian_phone:"",class_id:""});
  const save=async()=>{
    if(!form.full_name.trim()){alert("Student name required");return;}
    if(!form.class_id){alert("Please select a class");return;}
    setSaving(true);
    if(editId){await db.patch("students",editId,form);setEditId(null);}
    else await db.post("students",{...form,school_id:schoolId});
    resetForm();setAdding(false);setSaving(false);reload();
  };
  const startEdit=(s)=>{
    setForm({full_name:s.full_name,admission_number:s.admission_number||"",gender:s.gender||"",date_of_birth:s.date_of_birth||"",guardian_name:s.guardian_name||"",guardian_phone:s.guardian_phone||"",class_id:s.class_id});
    setEditId(s.id);setAdding(true);
  };
  const filtered=students
    .filter(s=>s.full_name.toLowerCase().includes(search.toLowerCase()))
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
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={S.section()}><span>👨‍🎓</span><span style={{fontWeight:800,color:"#6366f1"}}>Students ({students.length})</span></div>
        <button onClick={()=>{if(adding){resetForm();setEditId(null);}setAdding(!adding);}} style={S.btn()}>{adding?"Cancel":"+ Add Student"}</button>
      </div>
      {adding&&(
        <div style={S.card}>
          <div style={{fontWeight:800,color:"#1e293b",marginBottom:16}}>{editId?"Edit Student":"New Student"}</div>
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
          <button onClick={save} disabled={saving} style={{...S.btn("#10b981"),marginTop:16}}>{saving?"Saving…":editId?"Update Student":"Save Student"}</button>
        </div>
      )}
      <input style={{...S.input,marginBottom:12}} placeholder="🔍 Search students…" value={search} onChange={e=>setSearch(e.target.value)}/>
      {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No students found.</div>}
      {filtered.map(s=>{
        const cls=classes.find(c=>c.id===s.class_id);
        return(
          <div key={s.id} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",marginBottom:8}}>
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
        );
      })}
    </div>
  );
}

// ── Manage Classes ─────────────────────────────────────────────
function ManageClasses({ classes, reload, schoolId }) {
  const [adding,setAdding]=useState(false); const [form,setForm]=useState({name:"",arm:"",level:""});
  const levels=Object.keys(NIGERIAN_SUBJECTS);
  const save=async()=>{
    if(!form.name){alert("Please select a class level");return;}
    await db.post("classes",{...form,school_id:schoolId});
    setForm({name:"",arm:"",level:""});setAdding(false);reload();
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={S.section("#0ea5e9")}><span>🏫</span><span style={{fontWeight:800,color:"#0ea5e9"}}>Classes ({classes.length})</span></div>
        <button onClick={()=>setAdding(!adding)} style={S.btn("#0ea5e9")}>{adding?"Cancel":"+ Add Class"}</button>
      </div>
      {adding&&(
        <div style={S.card}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div><label style={S.label}>Class Level</label><select style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}><option value="">Select</option>{levels.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
            <div><label style={S.label}>Arm</label><select style={S.input} value={form.arm} onChange={e=>setForm(p=>({...p,arm:e.target.value}))}><option value="">None</option>{["A","B","C","D"].map(a=><option key={a}>{a}</option>)}</select></div>
            <div><label style={S.label}>Level</label><select style={S.input} value={form.level} onChange={e=>setForm(p=>({...p,level:e.target.value}))}><option value="">Select</option><option>Primary</option><option>Junior Secondary</option><option>Senior Secondary</option></select></div>
          </div>
          <button onClick={save} style={{...S.btn("#0ea5e9"),marginTop:16}}>Save Class</button>
        </div>
      )}
      {classes.length===0&&!adding&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No classes yet.</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {classes.map(c=>(
          <div key={c.id} style={{...S.card,padding:"14px 16px",marginBottom:0}}>
            <div style={{fontWeight:800,color:"#1e293b",fontSize:16}}>{c.name} {c.arm}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{c.level}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{(NIGERIAN_SUBJECTS[c.name]||[]).length} subjects</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Manage Teachers (with class assignment) ────────────────────
function ManageTeachers({ teachers, classes, reload, schoolId }) {
  const [adding,setAdding]=useState(false); const [form,setForm]=useState({full_name:"",email:"",class_id:""});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!form.full_name.trim()||!form.email.trim()){alert("Name and email required");return;}
    setSaving(true);
    await db.post("users",{full_name:form.full_name,email:form.email,role:"teacher",school_id:schoolId,class_id:form.class_id||null});
    setForm({full_name:"",email:"",class_id:""});setAdding(false);setSaving(false);reload();
  };
  const updateClass=async(tid,cid)=>{ await db.patch("users",tid,{class_id:cid||null}); reload(); };
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
            <div style={{gridColumn:"1/-1"}}><label style={S.label}>Assign Class</label>
              <select style={S.input} value={form.class_id} onChange={e=>setForm(p=>({...p,class_id:e.target.value}))}>
                <option value="">No class assigned</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
              </select>
            </div>
          </div>
          <p style={{fontSize:12,color:"#94a3b8",margin:"12px 0 0"}}>Default password: <strong>school1234</strong></p>
          <button onClick={save} disabled={saving} style={{...S.btn("#10b981"),marginTop:12}}>{saving?"Saving…":"Save Teacher"}</button>
        </div>
      )}
      {teachers.length===0&&!adding&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No teachers yet.</div>}
      {teachers.map(t=>{
        const assigned=classes.find(c=>c.id===t.class_id);
        return(
          <div key={t.id} style={{...S.card,padding:"14px 16px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontWeight:700,color:"#1e293b"}}>{t.full_name}</div>
                <div style={{fontSize:12,color:"#64748b"}}>✉️ {t.email}</div>
                <div style={{fontSize:12,color:assigned?"#10b981":"#94a3b8",fontWeight:600,marginTop:4}}>🏫 {assigned?`${assigned.name} ${assigned.arm||""}`:"No class assigned"}</div>
              </div>
              <button onClick={async()=>{if(window.confirm(`Delete ${t.full_name}?`)){await db.delete("users",t.id);reload();}}} style={{background:"#fee2e2",border:"none",borderRadius:8,color:"#ef4444",padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>Delete</button>
            </div>
            <div><label style={S.label}>Change Class Assignment</label>
              <select style={S.input} value={t.class_id||""} onChange={e=>updateClass(t.id,e.target.value)}>
                <option value="">No class assigned</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
              </select>
            </div>
          </div>
        );
      })}
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
    await db.post("terms",{...tForm,total_days:Number(tForm.total_days)||62});
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
  const [selectedClass,setSelectedClass]=useState("");
  const [selectedTerm,setSelectedTerm]=useState(terms.find(t=>t.is_current)?.id||"");
  const [results,setResults]=useState([]); const [attendance,setAttendance]=useState([]); const [remarks,setRemarks]=useState([]);
  const [loading,setLoading]=useState(false); const [reportStudent,setReportStudent]=useState(null);
  const [generating,setGenerating]=useState(null); const [bulkGenerating,setBulkGenerating]=useState(false);
  const [bulkProgress,setBulkProgress]=useState({done:0,total:0}); const [logoDataUrl,setLogoDataUrl]=useState(null);

  const classStudents=students.filter(s=>s.class_id===selectedClass);
  const cls=classes.find(c=>c.id===selectedClass);
  const subjects=cls?(NIGERIAN_SUBJECTS[cls.name]||[]):[];
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

  const handleGenerate=async(student)=>{
    setGenerating(student.id);
    try{
      const cls2=classes.find(c=>c.id===student.class_id);
      const subs=cls2?(NIGERIAN_SUBJECTS[cls2.name]||[]):[];
      const att=attendance.find(a=>a.student_id===student.id);
      const rem=remarks.find(r=>r.student_id===student.id);
      await generateReportPDF(student,cls2,term,subs,results.filter(r=>r.student_id===student.id),att,rem,classStudents,results,school,logoDataUrl);
      setTimeout(()=>{
        const phone=student.guardian_phone?.replace(/\D/g,"");
        const msg=`Dear ${student.guardian_name||"Parent"}, please find attached the report card for ${student.full_name} — ${term?.name||""} — ${school?.name||""}. Please print and sign.`;
        window.open(`https://wa.me/234${phone?.slice(-10)}?text=${encodeURIComponent(msg)}`,"_blank");
        setGenerating(null);
      },1500);
    }catch(e){alert("Error: "+e.message);setGenerating(null);}
  };

  const handleBulk=async()=>{
    if(!classStudents.length) return;
    if(!window.confirm(`Download all ${classStudents.length} report cards for ${cls?.name} ${cls?.arm||""}?`)) return;
    setBulkGenerating(true); setBulkProgress({done:0,total:classStudents.length});
    for(let i=0;i<classStudents.length;i++){
      const student=classStudents[i];
      const att=attendance.find(a=>a.student_id===student.id);
      const rem=remarks.find(r=>r.student_id===student.id);
      try{
        await generateReportPDF(student,cls,term,subjects,results.filter(r=>r.student_id===student.id),att,rem,classStudents,results,school,logoDataUrl);
        await new Promise(r=>setTimeout(r,800));
      }catch(e){console.error(e);}
      setBulkProgress({done:i+1,total:classStudents.length});
    }
    setBulkGenerating(false); alert("✅ All report cards generated!");
  };

  const updatePrincipalRemark=async(sid,remark)=>{
    const rem=remarks.find(r=>r.student_id===sid);
    if(rem?.id) await db.patch("remarks",rem.id,{principal_remark:remark});
    else await db.post("remarks",{student_id:sid,term_id:selectedTerm,principal_remark:remark});
    const ids=classStudents.map(s=>s.id);
    const updated=await db.get("remarks",{term_id:selectedTerm,student_id:ids});
    setRemarks(updated);
  };

  if(reportStudent){
    const att=attendance.find(a=>a.student_id===reportStudent.id);
    const rem=remarks.find(r=>r.student_id===reportStudent.id);
    const sResults=getStudentResults(reportStudent.id);
    const totalMarks=sResults.reduce((a,r)=>a+r.total,0);
    const avg=sResults.length?Math.round(totalMarks/sResults.length):0;
    const pos=getPosition(reportStudent.id);
    const overall=getGrade(avg);
    const promotionStatus=rem?.promotion_status;
    return(
      <div>
        <div style={{display:"flex",gap:8,padding:"12px 0",flexWrap:"wrap"}}>
          <button onClick={()=>setReportStudent(null)} style={S.btn("#64748b")}>← Back</button>
          <button onClick={()=>window.print()} style={S.btn("#10b981")}>🖨 Print</button>
          <button onClick={()=>handleGenerate(reportStudent)} disabled={!!generating} style={S.btn("#25d366")}>{generating===reportStudent.id?"⏳ Generating…":"📥 PDF & WhatsApp"}</button>
        </div>
        {isPrincipal&&(
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontWeight:700,color:"#1e293b",marginBottom:8}}>🏛 Principal's Remark</div>
            <textarea style={{...S.input,height:70,resize:"vertical"}} defaultValue={rem?.principal_remark||""} onBlur={e=>updatePrincipalRemark(reportStudent.id,e.target.value)} placeholder="Enter principal's remarks…"/>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Click outside to save.</div>
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
          <div style={{padding:"20px 32px",background:"#f8faff",borderBottom:"2px solid #e0e7ff",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[["Student Name",reportStudent.full_name],["Admission No",reportStudent.admission_number||"—"],["Class",`${cls?.name||""} ${cls?.arm||""}`],["Gender",reportStudent.gender||"—"],["Date of Birth",reportStudent.date_of_birth||"—"],["Parent/Guardian",reportStudent.guardian_name||"—"]].map(([l,v])=>(
              <div key={l} style={{borderLeft:"3px solid #6366f1",paddingLeft:10}}>
                <div style={{fontSize:10,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"sans-serif"}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#1e293b",marginTop:2,fontFamily:"sans-serif"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"20px 32px"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:13}}>
              <thead><tr style={{background:"linear-gradient(135deg,#1e3a8a,#4338ca)"}}>
                {["Subject","C.A (40%)","Exam (60%)","Total","Grade","Remark"].map(h=><th key={h} style={{padding:"10px 8px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {sResults.map((r,i)=>{
                  const g=getGrade(r.total);
                  return(<tr key={r.subject} style={{background:i%2===0?"#fff":"#f8faff"}}>
                    <td style={{padding:"9px 8px",fontWeight:700,color:"#1e293b"}}>{r.subject}</td>
                    <td style={{padding:"9px 8px",textAlign:"center",color:"#475569"}}>{r.ca}</td>
                    <td style={{padding:"9px 8px",textAlign:"center",color:"#475569"}}>{r.exam}</td>
                    <td style={{padding:"9px 8px",textAlign:"center",fontWeight:800,color:g.col,fontSize:15}}>{r.total}</td>
                    <td style={{padding:"9px 8px",textAlign:"center"}}><span style={S.badge(g.col)}>{g.g}</span></td>
                    <td style={{padding:"9px 8px",textAlign:"center",color:g.col,fontWeight:600,fontSize:12}}>{g.r}</td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"0 32px 20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr",gap:10}}>
            {[["Total",totalMarks,"#6366f1"],["Average",`${avg}%`,"#0ea5e9"],["Position",pos?`${ordinal(pos)} of ${classStudents.length}`:"—","#f59e0b"],["Attendance",att?`${att.days_present}/${att.total_days||"—"}`:"—","#10b981"],["Overall",overall.g,overall.col],["Status",promotionStatus||"—",promotionStatus==="Promoted"?"#10b981":promotionStatus==="Repeated"?"#ef4444":"#94a3b8"]].map(([l,v,col])=>(
              <div key={l} style={{background:`${col}10`,border:`1.5px solid ${col}30`,borderRadius:10,padding:12,textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"sans-serif"}}>{l}</div>
                <div style={{fontSize:16,fontWeight:900,color:col,marginTop:2,fontFamily:"sans-serif"}}>{v}</div>
              </div>
            ))}
          </div>
          {(rem?.teacher_remark||rem?.principal_remark)&&(
            <div style={{margin:"0 32px 20px",fontFamily:"sans-serif"}}>
              {rem?.teacher_remark&&<div style={{background:"#f0fdf4",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #10b981",marginBottom:10}}><div style={{fontSize:11,fontWeight:800,color:"#10b981",textTransform:"uppercase",marginBottom:4}}>🧑‍🏫 Class Teacher</div><p style={{margin:0,color:"#374151",fontSize:13}}>{rem.teacher_remark}</p></div>}
              {rem?.principal_remark&&<div style={{background:"#eff6ff",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #3b82f6"}}><div style={{fontSize:11,fontWeight:800,color:"#3b82f6",textTransform:"uppercase",marginBottom:4}}>🏛 Principal</div><p style={{margin:0,color:"#374151",fontSize:13}}>{rem.principal_remark}</p></div>}
            </div>
          )}
          {term?.resumption_date&&(
            <div style={{margin:"0 32px 20px",background:"#fff7ed",borderRadius:10,padding:"12px 16px",borderLeft:"4px solid #f59e0b",fontFamily:"sans-serif"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#f59e0b",textTransform:"uppercase",marginBottom:4}}>📅 Next Term Resumption</div>
              <p style={{margin:0,color:"#92400e",fontSize:14,fontWeight:700}}>{term.resumption_date}</p>
            </div>
          )}
          <div style={{margin:"0 32px 28px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,fontFamily:"sans-serif"}}>
            {["Class Teacher","Principal","Parent/Guardian"].map(sig=>(
              <div key={sig} style={{textAlign:"center"}}><div style={{borderTop:"2px solid #cbd5e1",paddingTop:8}}><div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>{sig}</div><div style={{fontSize:11,color:"#cbd5e1"}}>Signature & Date</div></div></div>
            ))}
          </div>
          <div style={{background:"linear-gradient(135deg,#1e3a8a,#3730a3)",padding:"12px 32px",textAlign:"center",fontFamily:"sans-serif"}}>
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
            <button onClick={handleBulk} style={{...S.btn("#6366f1"),width:"100%",padding:"12px"}}>📦 Bulk Download — All {classStudents.length} Report Cards</button>
          )}
        </div>
      )}
      {loading&&<div style={{textAlign:"center",padding:40,color:"#64748b"}}>Loading results…</div>}
      {!loading&&selectedClass&&classStudents.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No students in this class.</div>}
      {!loading&&selectedClass&&classStudents.map(s=>{
        const sRes=getStudentResults(s.id);
        const total=sRes.reduce((a,r)=>a+r.total,0);
        const avg=sRes.length?Math.round(total/sRes.length):0;
        const g=getGrade(avg); const pos=getPosition(s.id);
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
    {label:"Current Term",value:currentTerm?.name||"Not set",icon:"📅",col:"#f59e0b",tab:"sessions",hint:"View sessions →"},
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

// ── Free Banner ───────────────────────────────────────────────
function FreeBanner({ school }) {
  const [vis, setVis] = useState(true);
  if (!vis) return null;
  if (school && school.is_paid) return null;
  return (
    <div style={{
      position:"fixed", bottom:0, left:0, right:0, zIndex:500,
      background:"linear-gradient(90deg,#ea580c,#f59e0b)",
      padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between",
      boxShadow:"0 -4px 20px #00000030"
    }}>
      <div>
        <div style={{color:"#fff",fontWeight:900,fontSize:13}}>🔓 Free Limited Version</div>
        <div style={{color:"#fff9",fontSize:11,marginTop:1}}>Contact admin to unlock full access</div>
      </div>
      <button onClick={()=>setVis(false)} style={{background:"#ffffff25",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>Dismiss</button>
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
function SidebarLayout({ user, role, school, onLogout, tabs, activeTab, setActiveTab, loading, children }) {
  const [open, setOpen] = useState(false);
  const activeTabObj = tabs.find(t => t.id === activeTab);
  const isP = role === "principal";
  const grad = isP ? "linear-gradient(135deg,#1e3a8a,#4338ca)" : "linear-gradient(135deg,#0f766e,#0ea5e9)";
  const accent = isP ? "#6366f1" : "#0ea5e9";
  const prevTabRef = useRef(null);
  const defaultTab = tabs[0]?.id;

  // Push initial history entry on mount
  useEffect(() => { window.history.pushState({ tab: activeTab }, ""); }, []);

  // Push new state on every tab change
  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = activeTab; return; }
    if (prevTabRef.current !== activeTab) {
      window.history.pushState({ tab: activeTab }, "");
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  // Handle Android hardware back button
  useEffect(() => {
    const onPop = (e) => {
      if (open) { setOpen(false); window.history.pushState({ tab: activeTab }, ""); return; }
      const prevTab = e.state?.tab;
      if (prevTab && prevTab !== activeTab) {
        setActiveTab(prevTab);
      } else if (activeTab !== defaultTab) {
        setActiveTab(defaultTab);
        window.history.pushState({ tab: defaultTab }, "");
      }
      // already on default tab — let browser handle (exits app correctly)
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeTab, open, defaultTab]);

  return (
    <div style={{ minHeight:"100vh", background:"#eef2ff", fontFamily:"'Segoe UI',sans-serif", maxWidth:"100vw", overflowX:"hidden" }}>

      {/* ── Top Bar ── */}
      <div style={{ background: grad, padding:"0 16px", height:62, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 24px #00000040" }}>
        <button onClick={() => setOpen(true)} style={{ background:"#ffffff18", border:"1px solid #ffffff25", borderRadius:12, width:42, height:42, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5, flexShrink:0 }}>
          <div style={{ width:18, height:2, background:"#fff", borderRadius:2 }}/>
          <div style={{ width:14, height:2, background:"#ffffffaa", borderRadius:2 }}/>
          <div style={{ width:18, height:2, background:"#fff", borderRadius:2 }}/>
        </button>
        <div style={{ textAlign:"center", flex:1, padding:"0 10px", minWidth:0 }}>
          <div style={{ color:"#fff", fontWeight:900, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", letterSpacing:"0.01em" }}>{school?.name || "School Data Center"}</div>
          <div style={{ color:"#c7d2fecc", fontSize:10, marginTop:2, letterSpacing:"0.06em", textTransform:"uppercase" }}>{activeTabObj?.icon} {activeTabObj?.label}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {isP && <NotificationBell schoolId={school && school.id} />}
          <button onClick={onLogout} style={{ background:"#ffffff18", border:"1px solid #ffffff25", color:"#fff", borderRadius:12, padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>Sign Out</button>
        </div>
      </div>

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

      <FreeBanner school={school} />
      {/* ── Page Content ── */}
      <div style={{ padding:"16px 16px 80px", maxWidth:700, margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:80 }}>
            <div style={{ fontSize:48, marginBottom:12, opacity:0.4 }}>{"⏳"}</div>
            <div style={{ color:"#94a3b8", fontWeight:600, fontSize:14 }}>Loading…</div>
          </div>
        ) : children}
      </div>
    </div>
  );
}

function PrincipalDash({ user, onLogout }) {
  const [tab,setTab]=useState("overview");
  const [students,setStudents]=useState([]); const [classes,setClasses]=useState([]);
  const [teachers,setTeachers]=useState([]); const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]); const [school,setSchool]=useState(null); const [loading,setLoading]=useState(true);

  useEffect(()=>{loadAll();},[]);
  const loadAll=async()=>{
    setLoading(true);
    const [s,c,t,se,te,sc]=await Promise.all([db.get("students"),db.get("classes"),db.get("users",{role:"teacher"}),db.get("sessions"),db.get("terms"),db.get("schools")]);
    setStudents(s);setClasses(c);setTeachers(t);setSessions(se);setTerms(te);setSchool(sc[0]||null);setLoading(false);
  };

  const tabs=[
    {id:"overview", label:"Overview",  icon:"📊", desc:"School summary & stats"},
    {id:"students", label:"Students",  icon:"👨‍🎓", desc:"Add & manage students"},
    {id:"classes",  label:"Classes",   icon:"🏫", desc:"Manage class arms"},
    {id:"teachers", label:"Teachers",  icon:"👩‍🏫", desc:"Staff & class assignment"},
    {id:"sessions", label:"Sessions",  icon:"📅", desc:"Academic sessions & terms"},
    {id:"results",  label:"Results",   icon:"📋", desc:"View & generate report cards"},
    {id:"promote",  label:"Promote",   icon:"🎖️", desc:"Promote or retain students"},
    {id:"settings", label:"Settings",  icon:"⚙️", desc:"School name, logo & info"},
    {id:"messages", label:"Messages",  icon:"📨", desc:"WhatsApp parent messages"},
  ];

  return (
    <SidebarLayout user={user} role="principal" school={school} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} loading={loading}>
      {tab==="overview" &&<Overview students={students} classes={classes} teachers={teachers} terms={terms} school={school} onNavigate={setTab}/>}
      {tab==="students"&&<ManageStudents students={students} classes={classes} reload={loadAll} schoolId={school?.id}/>}
      {tab==="classes" &&<ManageClasses classes={classes} reload={loadAll} schoolId={school?.id}/>}
      {tab==="teachers"&&<ManageTeachers teachers={teachers} classes={classes} reload={loadAll} schoolId={school?.id}/>}
      {tab==="sessions"&&<ManageSessions sessions={sessions} terms={terms} reload={loadAll} schoolId={school?.id}/>}
      {tab==="results" &&<ViewResults students={students} classes={classes} terms={terms} school={school} isPrincipal={true}/>}
      {tab==="promote" &&<PromoteStudents students={students} classes={classes} terms={terms} reload={loadAll}/>}
      {tab==="settings"&&<SchoolSettings school={school} reload={loadAll}/>}
      {tab==="messages"&&<Messages students={students} classes={classes} school={school}/>}
    </SidebarLayout>
  );
}

// ── Teacher Dashboard ──────────────────────────────────────────
function TeacherDash({ user, onLogout }) {
  const [tab,setTab]=useState("results");
  const [classes,setClasses]=useState([]); const [students,setStudents]=useState([]);
  const [terms,setTerms]=useState([]); const [school,setSchool]=useState(null);
  const [allStudentsInClass,setAllStudentsInClass]=useState([]);
  const [selectedClass,setSelectedClass]=useState(""); const [selectedTerm,setSelectedTerm]=useState("");
  const [selectedStudent,setSelectedStudent]=useState(null); const [subjects,setSubjects]=useState([]);
  const [scores,setScores]=useState({}); const [attendance,setAttendance]=useState({days_present:"",total_days:""});
  const [remarks,setRemarks]=useState({teacher_remark:""}); const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false); const [generating,setGenerating]=useState(false);
  const [currentResults,setCurrentResults]=useState([]); const [currentAttendance,setCurrentAttendance]=useState(null);
  const [currentRemarks,setCurrentRemarks]=useState(null); const [logoDataUrl,setLogoDataUrl]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{loadData();},[]);
  const loadData=async()=>{
    setLoading(true);
    const [c,t,sc]=await Promise.all([db.get("classes"),db.get("terms"),db.get("schools")]);
    const schoolData=sc[0]||null; setSchool(schoolData); setTerms(t);
    const curr=t.find(t=>t.is_current); if(curr) setSelectedTerm(curr.id);
    if(user.class_id){setClasses(c.filter(cls=>cls.id===user.class_id));setSelectedClass(user.class_id);}
    else setClasses(c);
    if(schoolData?.logo_url){
      fetch(schoolData.logo_url).then(r=>r.blob()).then(blob=>new Promise(res=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.readAsDataURL(blob);})).then(setLogoDataUrl).catch(()=>{});
    }
    setLoading(false);
  };

  useEffect(()=>{
    if(!selectedClass) return;
    const cls=classes.find(c=>c.id===selectedClass);
    setSubjects(cls?(NIGERIAN_SUBJECTS[cls.name]||[]):[]);
    db.get("students",{class_id:selectedClass}).then(s=>{setStudents(s);setAllStudentsInClass(s);});
    setSelectedStudent(null);
  },[selectedClass]);

  useEffect(()=>{if(selectedStudent&&selectedTerm) loadStudentData();},[selectedStudent,selectedTerm]);

  const loadStudentData=async()=>{
    const [r,a,rem]=await Promise.all([
      db.get("results",{student_id:selectedStudent.id,term_id:selectedTerm}),
      db.get("attendance",{student_id:selectedStudent.id,term_id:selectedTerm}),
      db.get("remarks",{student_id:selectedStudent.id,term_id:selectedTerm}),
    ]);
    const sc={};
    r.forEach(res=>{sc[res.subject_name]={ca:res.ca_score,exam:res.exam_score,id:res.id};});
    setScores(sc);setCurrentResults(r);
    const att=a[0]||null; const remRow=rem[0]||null;
    setAttendance(att?{days_present:att.days_present,total_days:att.total_days,id:att.id}:{days_present:"",total_days:""});
    setCurrentAttendance(att);
    setRemarks(remRow?{teacher_remark:remRow.teacher_remark||"",id:remRow.id}:{teacher_remark:""});
    setCurrentRemarks(remRow);
  };

  const saveResults=async()=>{
    if(!selectedStudent){alert("Select a student");return;}
    if(!selectedTerm){alert("Select a term");return;}
    setSaving(true);
    const savedList=[];
    for(const sub of subjects){
      const sc=scores[sub]||{ca:0,exam:0};
      const caVal=Math.min(40,Math.max(0,Number(sc.ca)||0));
      const examVal=Math.min(60,Math.max(0,Number(sc.exam)||0));
      if(sc.id) await db.patch("results",sc.id,{ca_score:caVal,exam_score:examVal});
      else{
        const ins=await db.post("results",{student_id:selectedStudent.id,term_id:selectedTerm,subject_name:sub,ca_score:caVal,exam_score:examVal});
        if(ins) setScores(p=>({...p,[sub]:{...p[sub],id:ins.id}}));
      }
      savedList.push({subject_name:sub,ca_score:caVal,exam_score:examVal});
    }
    const dpVal=Number(attendance.days_present)||0; const tdVal=Number(attendance.total_days)||0;
    if(attendance.id) await db.patch("attendance",attendance.id,{days_present:dpVal,total_days:tdVal});
    else{const ins=await db.post("attendance",{student_id:selectedStudent.id,term_id:selectedTerm,days_present:dpVal,total_days:tdVal});if(ins)setAttendance(p=>({...p,id:ins.id}));}
    if(remarks.id) await db.patch("remarks",remarks.id,{teacher_remark:remarks.teacher_remark});
    else{const ins=await db.post("remarks",{student_id:selectedStudent.id,term_id:selectedTerm,teacher_remark:remarks.teacher_remark});if(ins)setRemarks(p=>({...p,id:ins.id}));}
    setCurrentResults(savedList.map(r=>({...r,student_id:selectedStudent.id,term_id:selectedTerm})));
    // Post notification for principal
    try{
      const termName=(terms.find(t=>t.id===selectedTerm)||{}).name||"";
      await db.post("notifications",{
        school_id:school?school.id:null,
        message:user.full_name+" saved results for "+selectedStudent.full_name+" ("+termName+")",
        teacher_id:user.id,
        read:false
      });
    }catch(e){}
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),3000);
  };

  const generateAndSend=async()=>{
    if(!selectedStudent) return;
    setGenerating(true);
    try{
      const cls=classes.find(c=>c.id===selectedClass);
      const term=terms.find(t=>t.id===selectedTerm);
      const subs=cls?(NIGERIAN_SUBJECTS[cls.name]||[]):[];
      const allClassResults=await db.get("results",{term_id:selectedTerm,student_id:allStudentsInClass.map(s=>s.id)});
      await generateReportPDF(selectedStudent,cls,term,subs,currentResults,currentAttendance,currentRemarks,allStudentsInClass,allClassResults,school,logoDataUrl);
      setTimeout(()=>{
        const phone=selectedStudent.guardian_phone?.replace(/\D/g,"");
        const msg=`Dear ${selectedStudent.guardian_name||"Parent"}, please find attached the report card for ${selectedStudent.full_name} — ${term?.name||""} — ${school?.name||""}. Please print and sign.`;
        window.open(`https://wa.me/234${phone?.slice(-10)}?text=${encodeURIComponent(msg)}`,"_blank");
        setGenerating(false);
      },1500);
    }catch(e){alert("Error: "+e.message);setGenerating(false);}
  };

  const tabs=[
    {id:"results", label:"Enter Results", icon:"📝", desc:"Score entry per student"},
    {id:"report",  label:"View Reports",  icon:"📋", desc:"View & download report cards"},
  ];

  const TeacherResults = () => (
    <div>
      <div style={S.section("#0ea5e9")}><span>📝</span><span style={{fontWeight:800,color:"#0ea5e9"}}>Enter Student Results</span></div>
      {!user.class_id&&<div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#92400e",fontWeight:600}}>⚠️ No class assigned. Ask the Principal to assign you a class.</div>}
      <div style={S.card}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div><label style={S.label}>Class</label>
            <select style={S.input} value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} disabled={!!user.class_id}>
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
            const total=(Number(sc.ca)||0)+(Number(sc.exam)||0);
            const g=getGrade(total);
            return(
              <div key={sub} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8,alignItems:"center",background:"#f8fafc",borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{sub}</div>
                <input type="number" min="0" max="40" value={sc.ca} onChange={e=>setScores(p=>({...p,[sub]:{...p[sub],ca:e.target.value}}))} placeholder="0–40" style={{...S.input,padding:"7px 10px"}}/>
                <input type="number" min="0" max="60" value={sc.exam} onChange={e=>setScores(p=>({...p,[sub]:{...p[sub],exam:e.target.value}}))} placeholder="0–60" style={{...S.input,padding:"7px 10px"}}/>
                <div style={{fontWeight:800,color:g.col,fontSize:15,textAlign:"center"}}>{total||"—"}</div>
              </div>
            );
          })}
          <div style={{marginTop:20,borderTop:"2px solid #e0e7ff",paddingTop:16}}>
            <div style={{fontWeight:800,color:"#1e293b",marginBottom:12}}>📅 Attendance</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div><label style={S.label}>Days Present</label><input type="number" style={S.input} value={attendance.days_present} onChange={e=>setAttendance(p=>({...p,days_present:e.target.value}))} placeholder="e.g. 58"/></div>
              <div><label style={S.label}>Total School Days</label><input type="number" style={S.input} value={attendance.total_days} onChange={e=>setAttendance(p=>({...p,total_days:e.target.value}))} placeholder="e.g. 62"/></div>
            </div>
            <div style={{fontWeight:800,color:"#1e293b",marginBottom:12}}>💬 Class Teacher's Remark</div>
            <textarea style={{...S.input,height:70,resize:"vertical",marginBottom:16}} value={remarks.teacher_remark} onChange={e=>setRemarks(p=>({...p,teacher_remark:e.target.value}))} placeholder="Enter your remarks…"/>
          </div>
          {saved&&<div style={{background:"#f0fdf4",border:"1.5px solid #10b981",borderRadius:10,padding:"10px 16px",color:"#059669",fontWeight:700,marginBottom:12,textAlign:"center"}}>✅ Results saved!</div>}
          <div style={{display:"flex",gap:10,flexDirection:"column"}}>
            <button onClick={saveResults} disabled={saving} style={{...S.btn("#10b981"),width:"100%",padding:"13px",fontSize:15}}>{saving?"Saving…":"💾 Save Results"}</button>
            {saved&&selectedStudent.guardian_phone&&<button onClick={generateAndSend} disabled={generating} style={{...S.btn("#25d366"),width:"100%",padding:"13px",fontSize:15}}>{generating?"⏳ Generating PDF…":"📥 Generate PDF & Send to Parent"}</button>}
            {saved&&!selectedStudent.guardian_phone&&<div style={{background:"#fff7ed",border:"1.5px solid #f59e0b",borderRadius:10,padding:"10px 16px",color:"#92400e",fontSize:13,textAlign:"center"}}>⚠️ No WhatsApp number for this student's guardian</div>}
          </div>
        </div>
      )}
    </div>
  );

  return(
    <SidebarLayout user={user} role="teacher" school={school} onLogout={onLogout} tabs={tabs} activeTab={tab} setActiveTab={setTab} loading={loading}>
      {tab==="results"&&<TeacherResults/>}
      {tab==="report"&&<ViewResults students={students} classes={classes.length?classes:[]} terms={terms} school={school} isPrincipal={false}/>}
    </SidebarLayout>
  );
}

// ── App Root ───────────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null);
  return !user
    ?<Login onLogin={setUser}/>
    :user.role==="principal"
      ?<PrincipalDash user={user} onLogout={()=>setUser(null)}/>
      :<TeacherDash user={user} onLogout={()=>setUser(null)}/>;
}
