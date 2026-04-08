'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const colors = {
  primary: '#1565C0',
  primaryDark: '#0D47A1',
  accent: '#E31937',
  accentLight: '#FFEBEE',
  lightBg: '#E3F2FD',
  text: '#1A237E',
  textLight: '#546E7A',
  white: '#FFFFFF',
  success: '#2E7D32',
  warning: '#F57C00'
};

interface ScanData {
  face_detected: boolean;
  bounding_box: { x: number; y: number; width: number; height: number };
  head_pose: { pitch: number; yaw: number; roll: number } | null;
  eye_analysis: { left_eye_openness: number; right_eye_openness: number; average_openness: number };
  expressions: { smile_probability: number };
  action_units: Record<string, number> | null;
  landmarks_count: number;
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);
  const [assessmentAnswers, setAssessmentAnswers] = useState<Record<number, number>>({});
  const [assessmentScore, setAssessmentScore] = useState<number | null>(null);

  const assessmentQuestions = [
    "1. เบื่อ ไม่สนใจอยากทำอะไร",
    "2. ไม่สบายใจ ซึมเศร้า ท้อแท้",
    "3. หลับยาก หรือหลับๆ ตื่นๆ หรือหลับมากไป",
    "4. เหนื่อยง่าย หรือ ไม่ค่อยมีแรง",
    "5. เบื่ออาหาร หรือ กินมากเกินไป",
    "6. รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว",
    "7. สมาธิไม่ดีเวลาทำอะไร เช่น ดูโทรทัศน์ ฟังวิทยุ",
    "8. พูดช้า ทำอะไรช้าลง กระสับกระส่าย",
    "9. คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี"
  ];

  const handleAssessmentSubmit = () => {
    if (Object.keys(assessmentAnswers).length < assessmentQuestions.length) {
      alert("กรุณาตอบแบบประเมินให้ครบทุกข้อ");
      return;
    }
    const totalScore = (Object.values(assessmentAnswers) as number[]).reduce((sum: number, val: number) => sum + val, 0);
    setAssessmentScore(totalScore);
    setShowAssessment(false);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    setMounted(true);

    const urlAU04 = searchParams.get('AU04');
    const urlAU15 = searchParams.get('AU15');
    const urlAU12 = searchParams.get('AU12');
    const urlPitch = searchParams.get('pitch');
    const urlSmile = searchParams.get('smile');

    const savedStr = sessionStorage.getItem('facepsy_result');
    if (savedStr) {
      try {
        const parsed = JSON.parse(savedStr) as ScanData;
        if (!parsed.action_units) parsed.action_units = {};
        if (urlAU04 !== null) parsed.action_units['AU04 - Brow Lowerer'] = Number(urlAU04) / 100;
        if (urlAU15 !== null) parsed.action_units['AU15 - Lip Corner Depressor'] = Number(urlAU15) / 100;
        if (urlAU12 !== null) parsed.action_units['AU12 - Lip Corner Puller'] = Number(urlAU12) / 100;
        if (urlPitch !== null && parsed.head_pose) parsed.head_pose.pitch = Number(urlPitch);
        if (urlSmile !== null && parsed.expressions) parsed.expressions.smile_probability = Number(urlSmile) / 100;

        setScanData(parsed);
        return () => clearInterval(timer);
      } catch (err) {
        console.error('Failed to parse session storage data:', err);
      }
    }

    if (urlAU04 !== null || urlAU15 !== null || urlAU12 !== null) {
      setScanData({
        face_detected: true,
        bounding_box: { x: 0, y: 0, width: 0, height: 0 },
        head_pose: { pitch: Number(urlPitch || 0), yaw: 0, roll: 0 },
        eye_analysis: { left_eye_openness: 0, right_eye_openness: 0, average_openness: 0 },
        expressions: { smile_probability: Number(urlSmile || 0) / 100 },
        action_units: {
          'AU04 - Brow Lowerer': Number(urlAU04 || 0) / 100,
          'AU15 - Lip Corner Depressor': Number(urlAU15 || 0) / 100,
          'AU12 - Lip Corner Puller': Number(urlAU12 || 0) / 100
        },
        landmarks_count: 0
      });
      return () => clearInterval(timer);
    }

    setScanData({
      face_detected: true,
      bounding_box: { x: 0, y: 0, width: 0, height: 0 },
      head_pose: { pitch: -15, yaw: 5, roll: -2 },
      eye_analysis: { left_eye_openness: 0.8, right_eye_openness: 0.8, average_openness: 0.8 },
      expressions: { smile_probability: 0.2 },
      action_units: {
        'AU04 - Brow Lowerer': 0.1,
        'AU15 - Lip Corner Depressor': 0.33,
        'AU12 - Lip Corner Puller': 0.2
      },
      landmarks_count: 478
    });

    return () => clearInterval(timer);
  }, [searchParams]);

  const formatThaiDate = (date: Date) => {
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const buddhistYear = date.getFullYear() + 543;
    return `${thaiDays[date.getDay()]}ที่ ${date.getDate()} ${thaiMonths[date.getMonth()]} ${buddhistYear}`;
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return { hours, minutes, seconds };
  };

  const time = formatTime(currentTime);

  const calculateDepressionRisk = () => {
    if (!scanData) return { score: 0, factors: [] as string[] };
    const aus = scanData.action_units || {};
    let riskScore = 0;
    const factors: string[] = [];

    const au04 = Number(Object.entries(aus).find(([k]) => k.includes('AU04'))?.[1] || 0);
    if (au04 > 0.4) { riskScore += 20; factors.push('คิ้วขมวด'); }

    const au15 = Number(Object.entries(aus).find(([k]) => k.includes('AU15'))?.[1] || 0);
    if (au15 > 0.4) { riskScore += 25; factors.push('มุมปากตก'); }

    const au01 = Number(Object.entries(aus).find(([k]) => k.includes('AU01'))?.[1] || 0);
    if (au01 > 0.5) { riskScore += 15; factors.push('คิ้วยกด้านใน'); }

    if (scanData.expressions.smile_probability < 0.2) {
      riskScore += 15; factors.push('ไม่ยิ้ม');
    }

    if (scanData.head_pose && scanData.head_pose.pitch < -10) {
      riskScore += 10; factors.push('ก้มหน้า');
    }

    if (scanData.eye_analysis.average_openness < 0.5 && scanData.eye_analysis.average_openness > 0) {
      riskScore += 15; factors.push('ดวงตาเปิดน้อย');
    }

    return { score: Math.min(100, riskScore), factors };
  };

  const depressionRisk = calculateDepressionRisk();

  const getRiskInfo = (s: number) => {
    if (s <= 33) return { label: 'Low Risk / ความเสี่ยงต่ำ', color: colors.success };
    if (s <= 66) return { label: 'Moderate / ความเสี่ยงปานกลาง', color: colors.warning };
    return { label: 'High Risk / ความเสี่ยงสูง', color: colors.accent };
  };

  const riskInfo = getRiskInfo(depressionRisk.score);
  const currentPitch = scanData?.head_pose?.pitch || 0;
  const pitchText = currentPitch < -5 ? 'ก้มหน้า' : currentPitch > 5 ? 'เงยหน้า' : 'หน้าตรง';

  const computeSyntheticAU = (code: string): number => {
    if (!scanData) return 0;
    const eyeAvg = scanData.eye_analysis?.average_openness || 0.5;
    const smile = scanData.expressions?.smile_probability || 0;
    const pitch = scanData.head_pose?.pitch || 0;
    switch (code) {
      case 'AU04':
        const eyeClosure = Math.max(0, 1 - eyeAvg);
        const pitchContrib = Math.max(0, Math.min(1, Math.abs(pitch) / 20));
        return Math.min(1, eyeClosure * 0.6 + pitchContrib * 0.4);
      case 'AU15':
        return Math.max(0, 1 - smile);
      default:
        return 0;
    }
  };

  const getAUValue = (code: string) => {
    if (!scanData?.action_units) return 0;
    const units = scanData.action_units as Record<string, any>;
    const codeLower = code.toLowerCase();
    const matched = Object.entries(units).find(([key, value]) => {
      const lowerKey = key.toLowerCase();
      return (lowerKey === codeLower || lowerKey.startsWith(codeLower + ' ') || lowerKey.includes(codeLower)) 
              && (typeof value === 'number' || !Number.isNaN(Number(value)));
    });
    if (matched) return Number(matched[1]);
    return 0;
  };

  const au04Val = getAUValue('AU04');
  const au04Raw = au04Val > 0 ? au04Val : computeSyntheticAU('AU04');
  
  const au15Val = getAUValue('AU15');
  const au15Raw = au15Val > 0 ? au15Val : computeSyntheticAU('AU15');
  
  const au12Raw = getAUValue('AU12');
  const computedAu12 = au12Raw > 0 ? au12Raw : (scanData?.expressions?.smile_probability || 0);

  return (
    <div className="result-page" style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F5F7FA 0%, #E8EEF5 100%)',
      padding: '30px 40px',
      fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif'
    }}>
      <div className="print-header" style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        borderRadius: '16px',
        padding: '20px 30px',
        marginBottom: '25px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(21, 101, 192, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src="/LOGO-BKH.svg" alt="Bangkok Hospital" style={{ height: '50px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '700', color: 'white' }}>Bangkok Hospital</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>RATCHASIMA - Mental Wellness Screening</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', color: 'white' }}>
          <div style={{ fontSize: '2rem', fontWeight: '300' }}>
            {time.hours}:{time.minutes}<span style={{ fontSize: '1rem', opacity: 0.8 }}>:{time.seconds}</span>
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{formatThaiDate(currentTime)}</div>
        </div>
      </div>

      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '25px',
        alignItems: 'start'
      }}>
        <div className="print-flex" style={{ display: 'flex', flexWrap: 'wrap', gap: '25px', alignItems: 'stretch' }}>
          
          <div className="print-left" style={{
              flex: '1 1 400px',
              background: 'white',
              borderRadius: '20px',
              padding: '40px 30px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              borderTop: `4px solid ${riskInfo.color}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
          }}>
             <h2 style={{ margin: '0 0 10px', fontSize: '1.3rem', color: colors.text, fontWeight: '700' }}>ผลการประเมินสุขภาพจิต</h2>
             <p style={{ margin: '0 0 25px', fontSize: '0.85rem', color: colors.textLight }}>Mental Health Risk Score</p>

             <div style={{ position: 'relative', width: '220px', height: '110px', marginBottom: '20px' }}>
               <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 200 100">
                  <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#E0E0E0" strokeWidth="16" strokeLinecap="round" />
                  <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke={riskInfo.color} strokeWidth="16" strokeLinecap="round" strokeDasharray="282.7" strokeDashoffset={282.7 - ((mounted ? depressionRisk.score : 0) / 100) * 282.7} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
               </svg>
               <div style={{ position: 'absolute', bottom: '-10px', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <span style={{ fontSize: '4rem', fontWeight: '800', color: riskInfo.color, lineHeight: 1 }}>{mounted ? depressionRisk.score : 0}</span>
               </div>
             </div>
             
             <div style={{ marginTop: '10px', padding: '8px 20px', background: 'rgba(0,0,0,0.03)', borderRadius: '25px', fontSize: '0.95rem', fontWeight: '700', color: riskInfo.color }}>{riskInfo.label}</div>
             
             <p style={{ marginTop: '20px', fontSize: '0.9rem', color: '#5D4037', lineHeight: '1.5', maxWidth: '350px' }}>
               {depressionRisk.score <= 33 && 'สภาวะจิตใจอยู่ในเกณฑ์ปกติและผ่อนคลาย ไม่มีแนวโน้มความเครียดสะสม'}
               {depressionRisk.score > 33 && depressionRisk.score <= 66 && 'มีความเครียดสะสมปานกลาง ควรหาเวลาพักผ่อนและทำกิจกรรมที่ชอบ'}
               {depressionRisk.score > 66 && 'มีความตึงเครียดสูง แนะนำให้ปรึกษาผู้เชี่ยวชาญเพื่อขอคำแนะนำและฟื้นฟูจิตใจ'}
             </p>
             {depressionRisk.factors.length > 0 && (
               <div style={{ marginTop: '15px', color: '#B71C1C', fontSize: '0.85rem' }}>
                 <strong>*พบปัจจัยความเสี่ยงดังนี้: </strong> {depressionRisk.factors.join(', ')}
               </div>
             )}

             <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginTop: 'auto', paddingTop: '20px' }}>
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <button onClick={() => router.push('/')} style={{ flex: 1, padding: '12px', background: '#ECEFF1', color: colors.textLight, border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}>ย้อนกลับหน้าแรก</button>
                  <button onClick={() => window.print()} style={{ flex: 1, padding: '12px', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`, color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 10px rgba(21, 101, 192, 0.2)' }}>พิมพ์เอกสาร</button>
                  <button onClick={() => alert("ระบบกำลังเชื่อมต่อผู้เชี่ยวชาญ...")} style={{ flex: 1, padding: '12px', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`, color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 10px rgba(21, 101, 192, 0.2)' }}>Consult Specialist</button>
                </div>
                {depressionRisk.score > 33 && (
                  <button onClick={() => setShowAssessment(true)} style={{ width: '100%', padding: '14px', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`, color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 15px rgba(21, 101, 192, 0.3)', animation: 'pulse 2s infinite' }}>ทำแบบประเมินความเสี่ยงซึมเศร้าเพิ่มเติม →</button>
                )}
             </div>
          </div>

          <div className="print-expand" style={{ flex: '2 1 500px', background: 'white', borderRadius: '20px', padding: '30px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1.2rem', color: colors.primary, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '2px solid #F5F7FA', paddingBottom: '12px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={colors.primary}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
              รายละเอียดตัวชี้วัดแบบละเอียด (Full Details)
            </h3>

            {scanData && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <ResultSection title="Action Units (ตัวชี้วัดความซึมเศร้า)" color={colors.primary}>
                    <ResultBar label="AU04" sublabel="คิ้วขมวด" value={au04Raw} min={0} max={1} unit="%" multiplier={100} color={au04Raw > 0.4 ? colors.accent : colors.primary} highlight={au04Raw > 0.4} />
                    <ResultBar label="AU15" sublabel="มุมปากตก" value={au15Raw} min={0} max={1} unit="%" multiplier={100} color={au15Raw > 0.4 ? colors.accent : colors.primary} highlight={au15Raw > 0.4} />
                    {scanData.action_units && Object.entries(scanData.action_units).filter(([name]) => !name.includes('AU04') && !name.includes('AU15')).map(([name, value]) => {
                        const auNumber = name.split(' - ')[0];
                        const isDepression = ['AU01'].some(au => name.includes(au));
                        return <ResultBar key={name} label={auNumber} value={value as number} min={0} max={1} unit="%" multiplier={100} color={isDepression && (value as number) > 0.4 ? colors.accent : colors.primary} highlight={isDepression && (value as number) > 0.4} />
                    })}
                  </ResultSection>
                  <ResultSection title="Expressions (การแสดงออกทางสีหน้า)" color={colors.primary}>
                    <ResultBar label="Smile / รอยยิ้ม" value={computedAu12} min={0} max={1} unit="%" multiplier={100} color={colors.success} />
                  </ResultSection>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <ResultSection title="Eye Analysis (การเปิดของดวงตา)" color={colors.primary}>
                    <ResultBar label="Left Eye" value={scanData.eye_analysis.left_eye_openness} min={0} max={1} unit="%" multiplier={100} color={colors.primary} />
                    <ResultBar label="Right Eye" value={scanData.eye_analysis.right_eye_openness} min={0} max={1} unit="%" multiplier={100} color={colors.primary} />
                  </ResultSection>

                  {scanData.head_pose && (
                    <ResultSection title="Head Pose (การหันศีรษะ)" color={colors.primary}>
                      <ResultBar label="Pitch (X) / ก้ม-เงย" value={scanData.head_pose.pitch} min={-45} max={45} unit="°" color={colors.primary} />
                      <ResultBar label="Yaw (Y) / หันซ้าย-ขวา" value={scanData.head_pose.yaw} min={-45} max={45} unit="°" color={colors.primary} />
                      <ResultBar label="Roll (Z) / เอียง" value={scanData.head_pose.roll} min={-45} max={45} unit="°" color={colors.primary} />
                    </ResultSection>
                  )}
                </div>
              </div>
            )}
            
            <div className="no-print" style={{ marginTop: '25px', padding: '12px', borderTop: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#9E9E9E', fontSize: '0.8rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              ผลลัพธ์นี้ไม่ใช่การวินิจฉัยทางการแพทย์ โปรดปรึกษาแพทย์หากมีความกังวล
            </div>
          </div>
        </div>
      </div>

      {showAssessment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowAssessment(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: '#F5F5F5', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', color: '#757575', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>✕</button>
            <h2 style={{ color: colors.primaryDark, marginTop: 0, marginBottom: '8px', fontSize: '1.5rem', fontWeight: '700' }}>แบบประเมินโรคซึมเศร้า (PHQ-9)</h2>
            <p style={{ color: colors.textLight, fontSize: '0.9rem', marginBottom: '30px', lineHeight: '1.6' }}>ในช่วง 2 สัปดาห์ที่ผ่านมา ท่านมีอาการดังต่อไปนี้บ่อยแค่ไหน?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {assessmentQuestions.map((q, idx) => (
                <div key={idx} style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: '600', color: colors.text, marginBottom: '15px' }}>{q}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                    {['ไม่มีเลย', 'เป็นบางวัน', 'เป็นบ่อย', 'เป็นทุกวัน'].map((choice, cIdx) => {
                       const isSelected = assessmentAnswers[idx] === cIdx;
                       return <button key={cIdx} onClick={() => setAssessmentAnswers((prev: Record<number, number>) => ({ ...prev, [idx]: cIdx }))} style={{ padding: '10px 12px', borderRadius: '8px', border: isSelected ? `2px solid ${colors.primary}` : '1px solid #CBD5E1', background: isSelected ? colors.lightBg : 'white', color: isSelected ? colors.primaryDark : colors.textLight, fontSize: '0.85rem', fontWeight: isSelected ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}>{choice}</button>
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '35px', display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #EEEEEE' }}>
              <button onClick={() => setShowAssessment(false)} style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: '#ECEFF1', color: colors.textLight, fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem' }}>ยกเลิก</button>
              <button onClick={handleAssessmentSubmit} style={{ padding: '12px 30px', borderRadius: '10px', border: 'none', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`, color: 'white', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 15px rgba(21,101,192,0.3)', fontSize: '0.95rem' }}>บันทึกผลการประเมิน</button>
            </div>
          </div>
        </div>
      )}

      {assessmentScore !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif' }}>
          <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '450px', padding: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
             <button onClick={() => { setAssessmentScore(null); setAssessmentAnswers({}); }} style={{ position: 'absolute', top: '20px', right: '20px', background: '#F5F5F5', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', color: '#757575', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>✕</button>
             
             <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: assessmentScore >= 15 ? 'rgba(227, 25, 55, 0.1)' : assessmentScore >= 10 ? 'rgba(245, 124, 0, 0.1)' : 'rgba(46, 125, 50, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill={assessmentScore >= 15 ? colors.accent : assessmentScore >= 10 ? colors.warning : colors.success}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
             </div>

             <h2 style={{ color: colors.primaryDark, marginTop: 0, marginBottom: '10px', fontSize: '1.4rem', fontWeight: '700' }}>ผลการประเมิน PHQ-9</h2>
             
             <div style={{ fontSize: '4rem', fontWeight: '800', color: assessmentScore >= 15 ? colors.accent : assessmentScore >= 10 ? colors.warning : colors.success, lineHeight: 1, margin: '15px 0' }}>
               {assessmentScore} <span style={{ fontSize: '1.2rem', color: '#9E9E9E', fontWeight: '500' }}>/ 27</span>
             </div>
             
             <div style={{ padding: '8px 20px', background: 'rgba(0,0,0,0.03)', borderRadius: '20px', fontSize: '1rem', fontWeight: '700', color: assessmentScore >= 15 ? colors.accent : assessmentScore >= 10 ? colors.warning : colors.success, marginBottom: '20px' }}>
                {assessmentScore <= 4 && 'ไม่มีภาวะซึมเศร้า'}
                {assessmentScore >= 5 && assessmentScore <= 9 && 'ภาวะซึมเศร้าระดับอ่อน'}
                {assessmentScore >= 10 && assessmentScore <= 14 && 'ภาวะซึมเศร้าระดับปานกลาง'}
                {assessmentScore >= 15 && assessmentScore <= 19 && 'ภาวะซึมเศร้าระดับรุนแรงค่อนข้างมาก'}
                {assessmentScore >= 20 && 'ภาวะซึมเศร้าระดับรุนแรงมาก'}
             </div>

             <p style={{ color: colors.textLight, fontSize: '0.9rem', marginBottom: '30px', lineHeight: '1.5' }}>
                {assessmentScore >= 10 ? 'แนะนำให้ขอเข้ารับคำปรึกษาจากแพทย์หรือผู้เชี่ยวชาญเพื่อรับคำแนะนำและการดูแลที่เหมาะสม' : 'สภาวะจิตใจของคุณอยู่ในเกณฑ์ที่สามารถจัดการได้ด้วยตัวเอง หากมีความกังวลเพิ่มเติมสามารถปรึกษาผู้เชี่ยวชาญได้'}
             </p>

             <button onClick={() => { setAssessmentScore(null); setAssessmentAnswers({}); }} style={{ padding: '14px', borderRadius: '12px', border: 'none', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`, color: 'white', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 15px rgba(21,101,192,0.3)', fontSize: '0.95rem', width: '100%' }}>รับทราบ และกลับสู่หน้าหลัก</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CFD8DC; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #B0BEC5; }
        
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; }
          .result-page { padding: 0 !important; background: white !important; }
          .print-header { padding: 15px 20px !important; margin-bottom: 20px !important; width: auto !important; }
          .print-flex { flex-direction: column !important; flex-wrap: nowrap !important; gap: 20px !important; align-items: stretch !important; }
          .print-left { padding: 10px 20px 20px !important; width: auto !important; flex: none !important; box-shadow: none !important; border-bottom: 1px solid #EEEEEE !important; }
          .no-print { display: none !important; }
          .print-expand {
             max-height: none !important;
             overflow: visible !important;
             box-shadow: none !important;
             border: none !important;
             padding: 0 20px !important;
             page-break-inside: avoid;
             width: auto !important;
             flex: none !important;
          }
          h2, h3 { font-size: 1.2rem !important; margin-bottom: 12px !important; padding-bottom: 5px !important; }
          p { margin-bottom: 8px !important; font-size: 0.9rem !important; }
        }
      `}</style>
    </div>
  );
}

function ResultSection({ title, subtitle, color, children }: { title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', color: color, fontWeight: '700' }}>{title}</h4>
        {subtitle && <span style={{ fontSize: '0.75rem', color: '#9E9E9E' }}>{subtitle}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {children}
      </div>
    </div>
  );
}

function ResultBar({ label, sublabel, value, min, max, unit, multiplier = 1, color, highlight = false }: { label: string; sublabel?: string; value: number; min: number; max: number; unit: string; multiplier?: number; color: string; highlight?: boolean; }) {
  const normalizedValue = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const displayValue = (value * multiplier).toFixed(1);

  return (
    <div style={{ padding: highlight ? '10px 12px' : '8px 12px', background: highlight ? 'rgba(227, 25, 55, 0.04)' : '#F8FAFC', borderRadius: '8px', borderLeft: highlight ? '4px solid #E31937' : '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: '#37474F', fontWeight: '600' }}>{label}</span>
          {sublabel && <span style={{ fontSize: '0.75rem', color: '#9E9E9E', marginLeft: '6px' }}>{sublabel}</span>}
        </div>
        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: color }}>{displayValue}{unit}</span>
      </div>
      <div style={{ height: '6px', background: '#ECEFF1', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${normalizedValue}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}dd)`, borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><h2>Loading Results...</h2></div>}>
      <ResultContent />
    </Suspense>
  );
}