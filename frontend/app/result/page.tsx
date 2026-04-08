'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const colors = {
  primary: '#1565C0',
  primaryDark: '#0D47A1',
  accent: '#E31937',
  lightBg: '#E3F2FD',
  text: '#1A237E',
  textLight: '#546E7A',
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

export default function ResultPage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);
  const [assessmentAnswers, setAssessmentAnswers] = useState<number[]>(Array(9).fill(-1));
  const [assessmentResult, setAssessmentResult] = useState<{ score: number; severity: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    setMounted(true);

    // Retrieve analysis results from sessionStorage
    const savedAnalysisStr = sessionStorage.getItem('facepsy_analysis_result');
    console.log('📥 SessionStorage retrieved:', savedAnalysisStr);
    
    if (savedAnalysisStr) {
      try {
        const parsed = JSON.parse(savedAnalysisStr) as ScanData;
        console.log('✅ Parsed scanData:', parsed);
        setScanData(parsed);
      } catch (err) {
        console.error('❌ Failed to parse analysis result:', err);
        setScanData(getDefaultScanData());
      }
    } else {
      console.log('⚠️ No data in sessionStorage, using defaults');
      setScanData(getDefaultScanData());
    }

    return () => clearInterval(timer);
  }, []);

  const getDefaultScanData = (): ScanData => ({
    face_detected: true,
    bounding_box: { x: 0, y: 0, width: 0, height: 0 },
    head_pose: { pitch: -15, yaw: 5, roll: -2 },
    eye_analysis: { left_eye_openness: 0.8, right_eye_openness: 0.8, average_openness: 0.8 },
    expressions: { smile_probability: 0.2 },
    action_units: { 'AU04': 0.1, 'AU15': 0.33 },
    landmarks_count: 478
  });

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

  const getAUValue = (code: string): number => {
    if (!scanData?.action_units) return 0;
    const units = scanData.action_units as Record<string, any>;
    const codeLower = code.toLowerCase();
    const matched = Object.entries(units).find(([key, value]) => {
      const lowerKey = key.toLowerCase();
      return (lowerKey === codeLower || lowerKey.startsWith(codeLower + ' ') || lowerKey.includes(codeLower))
              && (typeof value === 'number' || !Number.isNaN(Number(value)));
    });
    return matched ? Number(matched[1]) : 0;
  };

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

  const calculateMentalHealthRiskScore = () => {
    if (!scanData) return { score: 0, factors: [] };

    const au04Val = getAUValue('AU04');
    const au04Raw = au04Val > 0 ? au04Val : computeSyntheticAU('AU04');
    const au15Val = getAUValue('AU15');
    const au15Raw = au15Val > 0 ? au15Val : computeSyntheticAU('AU15');
    const eyeAvg = scanData.eye_analysis?.average_openness ?? 0.5;
    const pitch = scanData.head_pose?.pitch ?? 0;
    const smile = scanData.expressions?.smile_probability ?? 0;

    // DEBUG: Log actual values
    console.log('🔍 Risk Calculation DEBUG:', {
      scanDataKeys: scanData ? Object.keys(scanData) : 'no scanData',
      actionUnitsKeys: scanData?.action_units ? Object.keys(scanData.action_units) : 'no action_units',
      au04Val,
      au04Raw,
      au15Val,
      au15Raw,
      eyeAvg,
      pitch,
      smile
    });

    let riskScore = 0;
    const factors: string[] = [];

    if (au04Raw > 0.4) { riskScore += 25; factors.push('🔴 ความตึงเครียดบริเวณคิ้ว'); }
    if (au15Raw > 0.4) { riskScore += 25; factors.push('🔴 ลักษณะมุมปากตก'); }
    if (pitch < -10) { riskScore += 15; factors.push('🔴 ท่าทีก้มหน้า'); }
    if (eyeAvg < 0.5 && eyeAvg > 0) { riskScore += 20; factors.push('🔴 ดวงตาเปิดน้อย'); }
    if (smile < 0.2) { riskScore += 15; factors.push('🔴 การยิ้มน้อย'); }

    console.log('📊 Risk Score Result:', { riskScore, factors });
    return { score: Math.min(100, riskScore), factors };
  };

  const getRiskLevel = (score: number) => {
    if (score <= 33) return { label: 'ความเสี่ยงต่ำ', color: colors.success };
    if (score <= 66) return { label: 'ความเสี่ยงปานกลาง', color: colors.warning };
    return { label: 'ความเสี่ยงสูง', color: colors.accent };
  };

  const getRiskDescription = (score: number) => {
    if (score <= 33) return 'สภาวะจิตใจอยู่ในเกณฑ์ปกติ ไม่มีแนวโน้มความเครียดสะสม';
    if (score <= 66) return 'มีความเครียดสะสมปานกลาง ควรหาเวลาพักผ่อนและทำกิจกรรมที่ชอบ';
    return 'มีความตึงเครียดสูง แนะนำให้ปรึกษาผู้เชี่ยวชาญเพื่อขอคำแนะนำ';
  };

  const getRecommendations = (score: number) => {
    if (score <= 33) {
      return [];
    }
    
    if (score <= 66) {
      return [
        '👤 พักผ่อนให้เพียงพอ - ควรนอนหลับอย่างน้อย 7-8 ชั่วโมงต่อวัน',
        '🎯 ทำกิจกรรมที่ชอบ - สละเวลาในการทำสิ่งที่ทำให้มีความสุข',
        '🚶 ออกกำลังกาย - เดินหรือออกกำลังกาย 30 นาทีต่อวัน',
        '📞 พูดคุยกับบุคคลที่ใกล้ชิด - แบ่งปันความรู้สึกกับเพื่อนหรือครอบครัว',
        '🎵 ฟังเพลงโปรด - หรือทำกิจกรรมบำรุงจิตใจอื่น ๆ'
      ];
    }
    
    return [
      '⚠️ ขอความช่วยเหลือจากผู้เชี่ยวชาญ - หากอาการวิตกกังวลหรือซึมเศร้าเพิ่มขึ้น',
      '👨‍⚕️ ปรึกษาแพทย์จิตเวช - เพื่อรับการประเมินและการรักษาที่เหมาะสม',
      '🆘 ติดต่อสถานพยาบาล - Bangkok Hospital ให้บริการด้านสุขภาพจิต 24 ชั่วโมง',
      '💊 อย่าลดค่าตัวเอง - สภาวะจิตใจขาดสภาพสมดุลสามารถปรับปรุงได้ด้วยการช่วยเหลือ',
      '📱 ติดต่อ: 1719 (Hotline) หรือมาที่สถานพยาบาลโดยตรง'
    ];
  };

  const phq9Questions = [
    'น้อยลง - ไม่สนใจหรือเพลิดเพลินกับการทำงานในปกติ',
    'รู้สึกเศร้า มึนงง หรือหมดหวัง',
    'ลำบากในการนอนหลับ นอนตื่นตรงกลางคืน หรือนอนมากเกินไป',
    'รู้สึกเหนื่อย หรือไม่มีพลังงาน',
    'อยากอาหารมากเกินไป หรือลดลง',
    'รู้สึกแย่เกี่ยวกับตนเองหรือไม่ดีพอ',
    'ยากในการมีสมาธิ เช่น ดูรายการทีวี อ่าน หรือทำกิจกรรมอื่น ๆ',
    'เคลื่อนไหวหรือพูดคำช้า หรือเร่งรัว (บ่อยขึ้น)',
    'คิดว่าตนเองคุณค่าไม่มาก หรือว่าตนเองเป็นอันตรายต่อครอบครัว'
  ];

  const phq9Options = [
    { value: 0, label: 'ไม่เลย (0 วัน)' },
    { value: 1, label: 'บ่อยกว่า (1-7 วัน)' },
    { value: 2, label: 'บ่อยครั้ง (8-14 วัน)' },
    { value: 3, label: 'เกือบทุกวัน (15-21 วัน)' }
  ];

  const getPHQ9Severity = (score: number) => {
    if (score <= 4) return { severity: 'ไม่มีความเศร้า', color: colors.success };
    if (score <= 9) return { severity: 'ความเศร้าเล็กน้อย', color: colors.success };
    if (score <= 14) return { severity: 'ความเศร้าปานกลาง', color: colors.warning };
    if (score <= 19) return { severity: 'ความเศร้าค่อนข้างรุนแรง', color: colors.accent };
    return { severity: 'ความเศร้ารุนแรง', color: colors.accent };
  };

  const handleAssessmentAnswer = (questionIdx: number, value: number) => {
    const newAnswers = [...assessmentAnswers];
    newAnswers[questionIdx] = value;
    setAssessmentAnswers(newAnswers);
  };

  const submitAssessment = () => {
    if (assessmentAnswers.some((a) => a === -1)) {
      alert('กรุณาตอบคำถามทั้งหมดก่อนส่งแบบประเมิน');
      return;
    }
    const total = assessmentAnswers.reduce((a, b) => a + b, 0);
    const severity = getPHQ9Severity(total);
    setAssessmentResult({ score: total, severity: severity.severity });
  };

  const resetAssessment = () => {
    setAssessmentAnswers(Array(9).fill(-1));
    setAssessmentResult(null);
    setShowAssessment(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>กำลังโหลด...</div>
      </div>
    );
  }

  const riskData = calculateMentalHealthRiskScore();
  const riskLevel = getRiskLevel(riskData.score);
  const time = formatTime(currentTime);
  const au04Val = getAUValue('AU04');
  const au04Raw = au04Val > 0 ? au04Val : computeSyntheticAU('AU04');
  const au15Val = getAUValue('AU15');
  const au15Raw = au15Val > 0 ? au15Val : computeSyntheticAU('AU15');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F5F7FA 0%, #E8EEF5 100%)',
      padding: '30px 40px',
      fontFamily: '"Noto Sans Thai", system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        borderRadius: '16px',
        padding: '20px 30px',
        marginBottom: '25px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(21, 101, 192, 0.3)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '700', color: 'white' }}>Bangkok Hospital</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>Mental Wellness Screening</p>
        </div>
        <div style={{ textAlign: 'right', color: 'white' }}>
          <div style={{ fontSize: '2rem', fontWeight: '300' }}>
            {time.hours}:{time.minutes}<span style={{ fontSize: '1rem', opacity: 0.8 }}>:{time.seconds}</span>
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{formatThaiDate(currentTime)}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '25px' }}>
        {/* Gauge and Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '25px' }}>
          {/* Gauge Chart */}
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '40px 30px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            borderTop: `4px solid ${riskLevel.color}`,
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
                <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke={riskLevel.color} strokeWidth="16" strokeLinecap="round"
                  strokeDasharray="282.7" strokeDashoffset={282.7 - (riskData.score / 100) * 282.7} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
              </svg>
              <div style={{ position: 'absolute', bottom: '-10px', left: 0, right: 0, textAlign: 'center' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: '800', color: riskLevel.color, lineHeight: 1 }}>{riskData.score}</span>
              </div>
            </div>

            <div style={{ padding: '8px 20px', background: 'rgba(0,0,0,0.03)', borderRadius: '25px', fontSize: '0.95rem', fontWeight: '700', color: riskLevel.color, marginBottom: '20px' }}>
              {riskLevel.label}
            </div>

            <p style={{ fontSize: '0.9rem', color: '#5D4037', lineHeight: '1.5', maxWidth: '350px' }}>
              {getRiskDescription(riskData.score)}
            </p>

            {riskData.factors.length > 0 && (
              <div style={{ fontSize: '0.85rem', color: '#B71C1C', lineHeight: '1.4', marginTop: '15px' }}>
                <strong>พบปัจจัยความเสี่ยง:</strong><br />
                {riskData.factors.join(' ')}
              </div>
            )}
          </div>

          {/* Progress Bars */}
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: colors.primary, fontWeight: '700', borderBottom: '2px solid #E3F2FD', paddingBottom: '10px' }}>
              ตัวชี้วัดรายละเอียด
            </h3>

            {[
              { label: 'AU04 - ความตึงเครียดบริเวณคิ้ว', value: au04Raw, color: au04Raw > 0.4 ? colors.accent : colors.success },
              { label: 'AU15 - ลักษณะมุมปากตก', value: au15Raw, color: au15Raw > 0.4 ? colors.accent : colors.success },
              { label: 'Smile - การยิ้ม', value: scanData?.expressions?.smile_probability ?? 0, color: colors.success },
              { label: 'Eye Openness - การ เปิดของดวงตา', value: scanData?.eye_analysis?.average_openness ?? 0.5, color: colors.success }
            ].map((metric, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: '600', color: colors.text }}>{metric.label}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: metric.color, background: metric.color === colors.accent ? '#FFEBEE' : '#E8F5E9', padding: '4px 12px', borderRadius: '16px' }}>
                    {(metric.value * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: '8px', background: '#E0E0E0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, metric.value * 100)}%`, height: '100%', background: metric.color, transition: 'width 0.5s ease-out' }} />
                </div>
              </div>
            ))}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '600', color: colors.text }}>Head Pose - ท่าทีศีรษะ</span>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', color: (scanData?.head_pose?.pitch ?? 0) < -10 ? colors.accent : colors.success, background: (scanData?.head_pose?.pitch ?? 0) < -10 ? '#FFEBEE' : '#E8F5E9', padding: '4px 12px', borderRadius: '16px' }}>
                  {(scanData?.head_pose?.pitch ?? 0) < -10 ? 'ก้มหน้า' : (scanData?.head_pose?.pitch ?? 0) > 10 ? 'เงยหน้า' : 'หน้าตรง'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations Section */}
        {getRecommendations(riskData.score).length > 0 && (
          <div style={{
            background: riskData.score > 66 ? 'linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)' : 'linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            borderLeft: `6px solid ${riskData.score > 66 ? colors.accent : colors.warning}`,
            maxWidth: '1200px'
          }}>
            <h3 style={{ 
              margin: '0 0 20px 0', 
              fontSize: '1.2rem', 
              color: riskData.score > 66 ? colors.accent : colors.warning, 
              fontWeight: '700'
            }}>
              {riskData.score > 66 ? '💡 คำแนะนำเพื่อสุขภาพจิตที่ดีขึ้น' : '💡 เคล็ดลับการดูแลตนเอง'}
            </h3>
            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {getRecommendations(riskData.score).map((rec, idx) => (
                <div key={idx} style={{
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.6)',
                  borderLeft: `3px solid ${riskData.score > 66 ? colors.accent : colors.warning}`,
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  color: colors.text,
                  lineHeight: '1.5'
                }}>
                  {rec}
                </div>
              ))}
            </div>
            {riskData.score >= 50 && (
              <button
                onClick={() => setShowAssessment(true)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: `linear-gradient(135deg, ${colors.warning} 0%, #E65100 100%)`,
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(245, 124, 0, 0.4)',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                📋 ทำแบบประเมินภาวะซึมเศร้าเพิ่มเติม (PHQ-9 / 2Q)
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '16px 20px',
              background: 'transparent',
              color: colors.primary,
              border: `2px solid ${colors.primary}`,
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}>
              ย้อนกลับหน้าแรก
            </button>
          </Link>

          <button onClick={handlePrint} style={{
            width: '100%',
            padding: '16px 20px',
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(21, 101, 192, 0.3)'
          }}>
            พิมพ์เอกสาร
          </button>

          <button onClick={() => alert('ระบบติดต่อผู้เชี่ยวชาญจะเปิดในเร็วๆ นี้')} style={{
            width: '100%',
            padding: '16px 20px',
            background: colors.warning,
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 124, 0, 0.3)'
          }}>
            ปรึกษาผู้เชี่ยวชาญ
          </button>
        </div>
      </div>

      {/* Assessment Modal */}
      {showAssessment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            padding: '40px'
          }}>
            {!assessmentResult ? (
              <>
                <h2 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', color: colors.primary, fontWeight: '700' }}>
                  📋 แบบประเมินภาวะซึมเศร้า (PHQ-9)
                </h2>
                <p style={{ margin: '0 0 25px 0', color: colors.textLight, fontSize: '0.95rem' }}>
                  ระบุว่าในช่วง 2 สัปดาห์ที่ผ่านมา คุณได้ประสบปัญหาต่อไปนี้บ่อยแค่ไหน
                </p>

                <div style={{ display: 'grid', gap: '25px' }}>
                  {phq9Questions.map((question, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid #E0E0E0', paddingBottom: '25px' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '600', color: colors.text }}>
                        {idx + 1}. {question}
                      </p>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {phq9Options.map((option) => (
                          <label key={option.value} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '8px', background: assessmentAnswers[idx] === option.value ? '#E3F2FD' : 'transparent' }}>
                            <input
                              type="radio"
                              name={`question-${idx}`}
                              value={option.value}
                              checked={assessmentAnswers[idx] === option.value}
                              onChange={() => handleAssessmentAnswer(idx, option.value)}
                              style={{ marginRight: '12px', width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: colors.text }}>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '30px' }}>
                  <button
                    onClick={() => setShowAssessment(false)}
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      color: colors.primary,
                      border: `2px solid ${colors.primary}`,
                      borderRadius: '12px',
                      fontSize: '1rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={submitAssessment}
                    style={{
                      padding: '12px 20px',
                      background: `linear-gradient(135deg, ${colors.warning} 0%, #E65100 100%)`,
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '1rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(245, 124, 0, 0.3)'
                    }}
                  >
                    ส่งแบบประเมิน
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 20px 0', fontSize: '1.5rem', color: colors.primary, fontWeight: '700', textAlign: 'center' }}>
                  ผลการประเมิน PHQ-9
                </h2>

                <div style={{
                  background: getPHQ9Severity(assessmentResult.score).color === colors.success ? '#E8F5E9' : getPHQ9Severity(assessmentResult.score).color === colors.warning ? '#FFF8E1' : '#FFEBEE',
                  borderLeft: `6px solid ${getPHQ9Severity(assessmentResult.score).color}`,
                  borderRadius: '12px',
                  padding: '25px',
                  marginBottom: '25px',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: colors.textLight }}>คะแนนรวม</p>
                  <h3 style={{ margin: '0 0 15px 0', fontSize: '2.5rem', fontWeight: '800', color: getPHQ9Severity(assessmentResult.score).color }}>
                    {assessmentResult.score} / 27
                  </h3>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: colors.text }}>
                    {assessmentResult.severity}
                  </p>
                </div>

                <div style={{ background: '#F5F7FA', borderRadius: '12px', padding: '20px', marginBottom: '25px', lineHeight: '1.6' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: colors.primary, fontWeight: '700' }}>📌 ความหมายของคะแนน:</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: colors.text, fontSize: '0.9rem' }}>
                    <li>0-4: ไม่มีความเศร้า (Normal)</li>
                    <li>5-9: ความเศร้าเล็กน้อย (Mild)</li>
                    <li>10-14: ความเศร้าปานกลาง (Moderate)</li>
                    <li>15-19: ความเศร้าค่อนข้างรุนแรง (Moderately Severe)</li>
                    <li>20-27: ความเศร้ารุนแรง (Severe)</li>
                  </ul>
                </div>

                {assessmentResult.score >= 10 && (
                  <div style={{ background: '#FFF3E0', borderLeft: `6px solid ${colors.warning}`, borderRadius: '12px', padding: '16px', marginBottom: '25px' }}>
                    <p style={{ margin: 0, color: colors.text, fontSize: '0.9rem', lineHeight: '1.5' }}>
                      ⚠️ <strong>ข้อแนะนำ:</strong> สหการประเมินแสดงสัญญาณของภาวะซึมเศร้า หากคุณรู้สึกกังวล โปรดติดต่อผู้เชี่ยวชาญด้านสุขภาพจิตหรือจิตแพทย์เพื่อรับการประเมินเพิ่มเติม
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    onClick={resetAssessment}
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      color: colors.primary,
                      border: `2px solid ${colors.primary}`,
                      borderRadius: '12px',
                      fontSize: '1rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    ทำแบบประเมินใหม่
                  </button>
                  <button
                    onClick={() => {
                      alert('ระบบติดต่อผู้เชี่ยวชาญจะเปิดในเร็วๆ นี้');
                      resetAssessment();
                    }}
                    style={{
                      padding: '12px 20px',
                      background: `linear-gradient(135deg, ${colors.warning} 0%, #E65100 100%)`,
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '1rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(245, 124, 0, 0.3)'
                    }}
                  >
                    ปรึกษาผู้เชี่ยวชาญ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @media print {
          body { background: white; }
          button { display: none !important; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>
    </div>
  );
}
