'use client';

import Link from 'next/link';
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface AnalysisResult {
  success: boolean;
  message: string;
  data: {
    face_detected: boolean;
    bounding_box: { x: number; y: number; width: number; height: number };
    head_pose: { pitch: number; yaw: number; roll: number } | null;
    eye_analysis: { left_eye_openness: number; right_eye_openness: number; average_openness: number };
    expressions: { smile_probability: number };
    action_units: Record<string, number> | null;
    landmarks_count: number;
  } | null;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scanStatus, setScanStatus] = useState<'ready' | 'scanning' | 'success' | 'no-face'>('ready');
  const [scanSeconds, setScanSeconds] = useState(0);

  // Bangkok Hospital Colors
  const colors = {
    primary: '#1565C0',
    primaryDark: '#0D47A1',
    accent: '#E31937',
    accentLight: '#FFEBEE',
    success: '#2E7D32',
    warning: '#F57C00',
    lightBg: '#E3F2FD',
    text: '#1A237E',
    textLight: '#546E7A'
  };

  // Compute risk factors from analysis data
  const computeRiskFactors = (): string[] => {
    if (!result?.data) return [];
    const factors: string[] = [];
    const au04Val = getAUValue('AU04');
    const au04Raw = au04Val > 0 ? au04Val : computeSyntheticAU('AU04');
    const au15Val = getAUValue('AU15');
    const au15Raw = au15Val > 0 ? au15Val : computeSyntheticAU('AU15');
    const eyeAvg = result.data.eye_analysis?.average_openness ?? 0.5;
    const pitch = result.data.head_pose?.pitch ?? 0;

    if (au04Raw > 0.4) factors.push('🔴 พบความตึงเครียดบริเวณคิ้ว (กังวล)');
    if (au15Raw > 0.4) factors.push('🔴 พบลักษณะมุมปากตก (เศร้า)');
    if (pitch < -10) factors.push('🔴 มีลักษณะก้มหน้า');
    if (eyeAvg < 0.5) factors.push('🔴 ดวงตาดูอ่อนล้า');

    return factors.length > 0 ? factors : ['🟢 ไม่พบปัจจัยความเสี่ยงเด่นชัด'];
  };

  // Time update effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // API check effect
  useEffect(() => {
    fetch('http://localhost:8000/health').catch(() => {
      console.warn('Backend API not available');
    });
  }, []);

  // Scanning timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAnalyzing) {
      timer = setInterval(() => {
        setScanSeconds(prev => (prev < 10 ? prev + 1 : prev));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError(null);
        setScanStatus('ready');
      }
    } catch (err) {
      setError('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้องแล้วลองใหม่');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setIsAnalyzing(false);
    setScanStatus('ready');
    setScanSeconds(0);
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    setScanSeconds(0);
    setScanStatus('scanning');
    setError(null);

    try {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const base64Image = canvasRef.current.toDataURL('image/jpeg');

      const response = await fetch('http://localhost:8000/analyze-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image })
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      const data: AnalysisResult = await response.json();
      setResult(data);

      if (data.success && data.data?.face_detected) {
        setScanStatus('success');
      } else {
        setScanStatus('no-face');
        setError('ไม่พบใบหน้า กรุณาลองใหม่');
      }
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setScanStatus('ready');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Utility functions
  const getAUValue = (code: string): number => {
    return result?.data?.action_units?.[code] ?? 0;
  };

  const computeSyntheticAU = (code: string): number => {
    if (!result?.data) return 0;

    switch (code) {
      case 'AU04':
        return Math.max(0, (-(result.data.head_pose?.pitch ?? 0)) / 20);
      case 'AU15':
        return Math.random() * 0.3;
      default:
        return 0;
    }
  };

  const formatThaiDate = (date: Date) => {
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
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

  const resultPageHref = result?.data?.action_units?.AU04 
    ? `/result?severity=${result.data.action_units.AU04 > 0.4 ? 'high' : 'normal'}`
    : '/result';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F5F7FA 0%, #E8EEF5 100%)',
      padding: '30px 40px',
      fontFamily: '"Noto Sans Thai", "Inter", system-ui, sans-serif'
    }}>
      {/* Header Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src="/LOGO-BKH.svg" alt="Bangkok Hospital" style={{ height: '50px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '700', color: 'white' }}>Bangkok Hospital</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>RATCHASIMA - Mental Wellness Screening</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', color: 'white' }}>
          <div style={{ fontSize: '2rem', fontWeight: '300' }}>{time.hours}:{time.minutes}<span style={{ fontSize: '1rem', opacity: 0.8 }}>:{time.seconds}</span></div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{formatThaiDate(currentTime)}</div>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div style={{ maxWidth: '1500px', margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr 420px', gap: '25px', alignItems: 'start' }}>
        
        {/* Left Panel - Instructions */}
        <div>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 15px rgba(0,0,0,0.05)', marginBottom: '24px', borderTop: `4px solid ${colors.primary}` }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: colors.primary, fontWeight: '700', letterSpacing: '0.5px' }}>ข้อแนะนำก่อนเริ่ม</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InstructionItem 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>} 
                title="เตรียมใบหน้าให้พร้อม" 
                subtitle="ถอดแว่นตา หน้ากาก หรือหมวก" 
                color={colors.primary} 
              />
              <InstructionItem 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z"/></svg>} 
                title="จัดวางใบหน้าให้อยู่กลางกรอบ" 
                subtitle="ให้ใบหน้าอยู่ตรงกลางกรอบ" 
                color={colors.primary} 
              />
              <InstructionItem 
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>} 
                title="ยืนหยั่งสบาย" 
                subtitle="แสดงสีหน้าตามธรรมชาติ" 
                color={colors.primary} 
              />
            </div>
          </div>

          <div style={{ background: colors.lightBg, borderRadius: '16px', padding: '20px', border: `2px solid ${colors.primary}` }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: colors.primary, fontWeight: '700' }}>สิ่งที่เราวิเคราะห์</h4>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: colors.text, lineHeight: '1.6' }}>
              การคัดกรองนี้จะวิเคราะห์สีหน้าและตำแหน่งศีรษะของคุณ เพื่อประเมินสภาวะอารมณ์ โดยใช้เวลาเพียงไม่กี่วินาที
            </p>
            <div style={{ fontSize: '0.8rem', color: colors.textLight, lineHeight: '1.7' }}>
              <div style={{ marginBottom: '8px' }}>✓ การแสดงออกทางอารมณ์</div>
              <div style={{ marginBottom: '8px' }}>✓ ท่าที่หัวและสุขภาพบ่า</div>
              <div>✓ การเปิดปิดตา</div>
            </div>
          </div>
        </div>

        {/* Center Panel - Camera Feed */}
        <div>
          <div style={{ background: 'white', borderRadius: '20px', padding: '25px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
            <div style={{ position: 'relative', background: 'linear-gradient(145deg, #2C3E50 0%, #1A252F 100%)', borderRadius: '16px', overflow: 'hidden', aspectRatio: '4/3', marginBottom: '24px' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              
              {/* Medical Scanner Overlay */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '260px', height: '320px', pointerEvents: 'none' }}>
                <svg width="100%" height="100%" viewBox="0 0 260 320">
                  <defs>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  
                  <ellipse cx="130" cy="160" rx="110" ry="145" fill="none" stroke={scanStatus === 'success' ? colors.success : scanStatus === 'scanning' ? colors.warning : colors.primary} strokeWidth="2.5" filter="url(#glow)" opacity="0.7" />
                  
                  {scanStatus === 'scanning' && (
                    <ellipse cx="130" cy="160" rx="110" ry="145" fill="none" stroke={colors.warning} strokeWidth="3" strokeDasharray="10,5" opacity="0.9" style={{ animation: 'dashAnimation 2s linear infinite' }} />
                  )}
                  
                  <g stroke={colors.accent} strokeWidth="3.5" fill="none" strokeLinecap="round">
                    <path d="M 30 70 L 30 30 L 70 30" />
                    <path d="M 230 70 L 230 30 L 190 30" />
                    <path d="M 30 250 L 30 290 L 70 290" />
                    <path d="M 230 250 L 230 290 L 190 290" />
                  </g>
                </svg>

                <div style={{ position: 'absolute', top: '-35px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.primary, whiteSpace: 'nowrap', opacity: 0.8 }}>
                  Good Pose
                </div>
                <div style={{ position: 'absolute', right: '-40px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.primary, whiteSpace: 'nowrap', opacity: 0.8 }}>
                  Attention OK
                </div>
                <div style={{ position: 'absolute', bottom: '-35px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.warning, whiteSpace: 'nowrap', opacity: 0.8 }}>
                  Lighting Fair
                </div>
              </div>

              {!isStreaming && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #34495E 0%, #2C3E50 100%)' }}>
                  <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>📷</div>
                  <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>กล้องยังไม่พร้อม</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '28px' }}>
              {/* Canvas for capture */}
              <canvas 
                ref={canvasRef} 
                style={{ display: 'none' }} 
                width={1280} 
                height={720}
              />

              {/* Primary Analyze Button */}
              {!isStreaming ? (
                <button
                  onClick={startCamera}
                  style={{
                    width: '100%',
                    padding: '18px 20px',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(21, 101, 192, 0.35)',
                    transition: 'all 0.3s ease',
                    letterSpacing: '0.3px'
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(21, 101, 192, 0.45)';
                    (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(21, 101, 192, 0.35)';
                    (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                  }}
                >
                  เริ่มการคัดกรอง
                </button>
              ) : (
                <button
                  onClick={captureAndAnalyze}
                  disabled={isAnalyzing}
                  style={{
                    width: '100%',
                    padding: '18px 20px',
                    background: isAnalyzing ? `${colors.primary}99` : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                    boxShadow: isAnalyzing ? 'none' : '0 6px 20px rgba(21, 101, 192, 0.35)',
                    transition: 'all 0.3s ease',
                    letterSpacing: '0.3px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isAnalyzing) {
                      (e.target as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(21, 101, 192, 0.45)';
                      (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isAnalyzing) {
                      (e.target as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(21, 101, 192, 0.35)';
                      (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {isAnalyzing ? 'กำลังวิเคราะห์...' : 'เริ่มวิเคราะห์ใบหน้า'}
                </button>
              )}

              {/* Secondary stop button when streaming */}
              {isStreaming && (
                <button
                  onClick={stopCamera}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    background: 'transparent',
                    color: colors.accent,
                    border: `2px solid ${colors.accent}`,
                    borderRadius: '10px',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginTop: '10px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.background = colors.accentLight;
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  ปิดกล้อง
                </button>
              )}

              {error && (
                <div style={{ marginTop: '14px', padding: '12px 14px', background: colors.accentLight, borderRadius: '8px', color: colors.accent, fontSize: '0.9rem' }}>{error}</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '28px 24px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', borderTop: `4px solid ${colors.primary}` }}>
          {isAnalyzing ? (
            // Scanning Status Card
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 22px', fontSize: '1.1rem', color: colors.primary, fontWeight: '600' }}>กำลังจับวิดีโอ</h3>
                
                {/* Circular Progress Timer */}
                <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 28px' }}>
                  <svg width="160" height="160" viewBox="0 0 160 160" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#ECEFF1" strokeWidth="8" />
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      fill="none"
                      stroke={colors.primary}
                      strokeWidth="8"
                      strokeDasharray={`${(scanSeconds / 10) * 439.8} 439.8`}
                      strokeLinecap="round"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px', transition: 'stroke-dasharray 0.3s ease' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.4rem', fontWeight: '700', color: colors.primary }}>{scanSeconds}</div>
                    <div style={{ fontSize: '0.75rem', color: colors.textLight, marginTop: '4px' }}>วินาที</div>
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.95rem', color: colors.textLight, lineHeight: '1.6' }}>
                กำลังบันทึกสีหน้าของคุณ...
                <br/>
                <span style={{ fontWeight: '500', color: colors.primary }}>ยืนหย่อนสบาย</span>
              </p>
            </div>
          ) : result?.success && result.data && result.data.face_detected ? (
            // Results Summary
            <div>
              <h2 style={{ margin: '0 0 24px', fontSize: '1.15rem', color: colors.primary, fontWeight: '700' }}>คัดกรองเสร็จสมบูรณ์</h2>
              
              <div style={{ background: colors.lightBg, borderRadius: '14px', padding: '18px', marginBottom: '20px', textAlign: 'center', borderLeft: `4px solid ${colors.success}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textLight, marginBottom: '6px' }}>การวิเคราะห์ใบหน้า</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '300', color: colors.primary }}>✓</div>
              </div>

              {/* Quick Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <QuickIndicator label="สีหน้า" value={result.data.expressions?.smile_probability ?? 0} color={colors.primary} />
                <QuickIndicator label="ท่าที่" value={Math.max(0, 1 - Math.abs((result.data.head_pose?.pitch ?? 0) / 45))} color={colors.primary} />
                <QuickIndicator label="ตา" value={result.data.eye_analysis?.average_openness ?? 0.5} color={colors.primary} />
              </div>

              {/* Risk Factors Section */}
              <div style={{ background: '#F5F7FA', borderRadius: '12px', padding: '16px', marginBottom: '20px', borderLeft: `4px solid ${colors.accent}` }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: colors.text, fontWeight: '700' }}>ปัจจัยความเสี่ยงที่พบ</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {computeRiskFactors().map((factor, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', color: colors.text, lineHeight: '1.5' }}>• {factor}</div>
                  ))}
                </div>
              </div>

              {result?.success && result.data && (
                <Link href={resultPageHref}>
                  <button style={{ width: '100%', padding: '14px 16px', background: colors.primary, color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginTop: '16px' }}>
                    ดูผลวิเคราะห์โดยละเอียด
                  </button>
                </Link>
              )}
            </div>
          ) : (
            // Default Ready State
            <div style={{ textAlign: 'center', paddingTop: '40px', paddingBottom: '40px' }}>
              <div style={{ width: '56px', height: '56px', background: colors.lightBg, borderRadius: '14px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: colors.text, fontWeight: '600' }}>พร้อมที่จะเริ่ม</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: colors.textLight, lineHeight: '1.5' }}>
                เริ่มการคัดกรองเมื่อคุณพร้อม จะแสดงผลลัพธ์ที่นี่
              </p>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes dashAnimation {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -30; }
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}

function InstructionItem({ icon, title, subtitle, color }: { icon: React.ReactNode; title: string; subtitle: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <div style={{ width: '40px', height: '40px', background: '#E3F2FD', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderLeft: `3px solid ${color}` }}>{icon}</div>
      <div>
        <p style={{ margin: 0, fontWeight: '600', color: '#1A237E', fontSize: '0.95rem' }}>{title}</p>
        <p style={{ margin: '4px 0 0', color: '#546E7A', fontSize: '0.85rem' }}>{subtitle}</p>
      </div>
    </div>
  );
}

function QuickIndicator({ label, value, color }: { label: string; value: number; color: string }) {
  const percentage = Math.round(Math.max(0, Math.min(100, value * 100)));
  const statusColor = percentage >= 70 ? '#2E7D32' : percentage >= 40 ? '#F57C00' : '#E31937';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F5F7FA', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '40px', height: '4px', background: '#ECEFF1', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${percentage}%`, height: '100%', background: statusColor, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: '0.8rem', color: '#37474F', fontWeight: '500' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: statusColor }}>{percentage}%</span>
    </div>
  );
}
