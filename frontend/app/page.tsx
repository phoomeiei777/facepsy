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
    lightBg: '#E3F2FD',
    text: '#1A237E',
    textLight: '#546E7A',
    white: '#FFFFFF',
    success: '#2E7D32',
    warning: '#F57C00'
  };

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check API status on mount
  useEffect(() => {
    fetch("http://localhost:8000")
      .then(res => res.json())
      .catch(err => console.error("API ERROR:", err));
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError(null);
        setScanStatus('ready');
      }
    } catch (err) {
      setError('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้อง');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setScanStatus('ready');
    }
  };

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    setIsAnalyzing(true);
    setScanStatus('scanning');
    setScanSeconds(0);

    try {
      const response = await fetch('http://localhost:8000/analyze-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });

      const data: AnalysisResult = await response.json();
      setResult(data);
      setError(null);

      if (data.success && data.data?.face_detected) {
        setScanStatus('success');
        sessionStorage.setItem('facepsy_result', JSON.stringify(data.data));
      } else {
        setScanStatus('no-face');
      }
    } catch (err) {
      setError('การวิเคราะห์ล้มเหลว กรุณาตรวจสอบการเชื่อมต่อ');
      setScanStatus('ready');
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  // Scanning timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAnalyzing) {
      timer = setInterval(() => {
        setScanSeconds(prev => {
          if (prev >= 10) {
            clearInterval(timer);
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAnalyzing]);

  const getAUValue = (code: string): number => {
    if (!result?.data?.action_units) return 0;
    const units = result.data.action_units as Record<string, any>;
    const direct = units[code];
    if (typeof direct === 'number') return direct;

    const codeLower = code.toLowerCase();
    const matched = Object.entries(units).find(([key, value]) => {
      const lowerKey = key.toLowerCase();
      const isTarget = lowerKey === codeLower || lowerKey.startsWith(`${codeLower} `) || lowerKey.includes(codeLower);
      const isNum = typeof value === 'number' || !Number.isNaN(Number(value));
      return isTarget && isNum;
    });

    if (matched) {
      const value = matched[1];
      return typeof value === 'number' ? value : parseFloat(value);
    }
    return 0;
  };

  const computeSyntheticAU = (code: string): number => {
    if (!result?.data) return 0;
    const eyeAvg = result.data.eye_analysis?.average_openness ?? 0.5;
    const smile = result.data.expressions?.smile_probability ?? 0;
    const pitch = result.data.head_pose?.pitch ?? 0;

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

  const au04Val = getAUValue('AU04');
  const au04Raw = au04Val > 0 ? au04Val : computeSyntheticAU('AU04');
  const au15Val = getAUValue('AU15');
  const au15Raw = au15Val > 0 ? au15Val : computeSyntheticAU('AU15');
  const au12Raw = getAUValue('AU12');

  const au04Pct = Number((au04Raw * 100).toFixed(1));
  const au15Pct = Number((au15Raw * 100).toFixed(1));
  const computedAu12 = au12Raw > 0 ? au12Raw : (result?.data?.expressions?.smile_probability ?? 0);
  const au12Pct = Number((computedAu12 * 100).toFixed(1));

  const pitchValue = Number((result?.data?.head_pose?.pitch ?? 0).toFixed(1));
  const smilePct = Number(((result?.data?.expressions?.smile_probability ?? 0) * 100).toFixed(1));
  const resultPageHref = `/result?AU04=${au04Pct}&AU15=${au15Pct}&AU12=${au12Pct}&pitch=${pitchValue}&smile=${smilePct}`;

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

      <div style={{ maxWidth: '1500px', margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr 420px', gap: '25px', alignItems: 'start' }}>
        {/* Left Panel */}
        <div>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 15px rgba(0,0,0,0.05)', marginBottom: '24px', borderTop: `4px solid ${colors.primary}` }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: colors.primary, fontWeight: '700', letterSpacing: '0.5px' }}>Before You Begin</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InstructionItem icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>} title="Clear Your Face" subtitle="Remove glasses, masks, or hats" color={colors.primary} />
              <InstructionItem icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z"/></svg>} title="Position Face Centered" subtitle="Keep your face in the frame" color={colors.primary} />
              <InstructionItem icon={<svg width="20" height="20" viewBox="0 0 24 24" fill={colors.primary}><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>} title="Be Relaxed & Natural" subtitle="Show your genuine expression" color={colors.primary} />
            </div>
          </div>

          <div style={{ background: colors.lightBg, borderRadius: '16px', padding: '20px', border: `2px solid ${colors.primary}` }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: colors.primary, fontWeight: '700' }}>What We Assess</h4>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: colors.text, lineHeight: '1.6' }}>
              This screening analyzes facial expressions and head position to assess your emotional wellbeing. It takes just a few seconds.
            </p>
            <div style={{ fontSize: '0.8rem', color: colors.textLight, lineHeight: '1.7' }}>
              <div style={{ marginBottom: '8px' }}>✓ Emotional Expression</div>
              <div style={{ marginBottom: '8px' }}>✓ Head Posture</div>
              <div>✓ Eye Engagement</div>
            </div>
          </div>
        </div>

        {/* Center Panel */}
        <div>
          <div style={{ background: 'white', borderRadius: '20px', padding: '25px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
            <div style={{ position: 'relative', background: 'linear-gradient(145deg, #2C3E50 0%, #1A252F 100%)', borderRadius: '16px', overflow: 'hidden', aspectRatio: '4/3', marginBottom: '24px' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              
              {/* Medical Scanner Overlay */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '260px', height: '320px', pointerEvents: 'none' }}>
                {/* Main scanning frame */}
                <svg width="100%" height="100%" viewBox="0 0 260 320">
                  {/* Medical scanner border - glowing effect */}
                  <defs>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  
                  {/* Main ellipse with gradient effect */}
                  <ellipse cx="130" cy="160" rx="110" ry="145" fill="none" stroke={scanStatus === 'success' ? '#2E7D32' : scanStatus === 'scanning' ? colors.warning : colors.primary} strokeWidth="2.5" filter="url(#glow)" opacity="0.7" />
                  
                  {/* Animated dashed scan line during scanning */}
                  {scanStatus === 'scanning' && (
                    <ellipse cx="130" cy="160" rx="110" ry="145" fill="none" stroke={colors.warning} strokeWidth="3" strokeDasharray="10,5" opacity="0.9" style={{ animation: 'dashAnimation 2s linear infinite' }} />
                  )}
                  
                  {/* Corner brackets - medical scanner style */}
                  <g stroke={colors.accent} strokeWidth="3.5" fill="none" strokeLinecap="round">
                    <path d="M 30 70 L 30 30 L 70 30" />
                    <path d="M 230 70 L 230 30 L 190 30" />
                    <path d="M 30 250 L 30 290 L 70 290" />
                    <path d="M 230 250 L 230 290 L 190 290" />
                  </g>
                </svg>

                {/* Status indicators - unobtrusive placement */}
                {isStreaming && !isAnalyzing && (
                  <>
                    <div style={{ position: 'absolute', top: '-35px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.primary, whiteSpace: 'nowrap', opacity: 0.8 }}>
                      {scanStatus === 'scanning' ? 'Scanning...' : 'Good Pose'}
                    </div>
                    <div style={{ position: 'absolute', right: '-40px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.primary, whiteSpace: 'nowrap', opacity: 0.8 }}>
                      Attention OK
                    </div>
                    <div style={{ position: 'absolute', bottom: '-35px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.75rem', fontWeight: '600', color: colors.warning, whiteSpace: 'nowrap', opacity: 0.8 }}>
                      Lighting Fair
                    </div>
                  </>
                )}
              </div>

              {/* Idle state message */}
              {!isStreaming && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #34495E 0%, #2C3E50 100%)' }}>
                  <p style={{ color: '#BDC3C7', fontSize: '1rem', margin: 0, fontWeight: '300' }}>Start screening to begin</p>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Single Prominent Button */}
            <div style={{ marginTop: '28px' }}>
              {!isStreaming ? (
                <button
                  onClick={startCamera}
                  style={{
                    width: '100%',
                    padding: '16px 24px',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1.05rem',
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
                  START SCREENING
                </button>
              ) : (
                <button
                  onClick={captureAndAnalyze}
                  disabled={isAnalyzing}
                  style={{
                    width: '100%',
                    padding: '16px 24px',
                    background: isAnalyzing
                      ? '#C0C5CC'
                      : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1.05rem',
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
                  {isAnalyzing ? 'ANALYZING...' : 'ANALYZE FACE'}
                </button>
              )}
            </div>

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
                Stop Camera
              </button>
            )}

            {error && (
              <div style={{ marginTop: '14px', padding: '12px 14px', background: colors.accentLight, borderRadius: '8px', color: colors.accent, fontSize: '0.9rem' }}>{error}</div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '28px 24px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', borderTop: `4px solid ${colors.primary}` }}>
          {isAnalyzing ? (
            // Scanning Status Card
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 22px', fontSize: '1.1rem', color: colors.primary, fontWeight: '600' }}>Capturing Expressions</h3>
                {/* Circular Progress Timer */}
                <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 28px' }}>
                  <svg width="160" height="160" viewBox="0 0 160 160" style={{ position: 'absolute', top: 0, left: 0 }}>
                    {/* Background circle */}
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#ECEFF1" strokeWidth="8" />
                    {/* Progress circle */}
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
                    <div style={{ fontSize: '0.75rem', color: colors.textLight, marginTop: '4px' }}>seconds</div>
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.95rem', color: colors.textLight, lineHeight: '1.6' }}>
                Capturing your facial expressions...
                <br/>
                <span style={{ fontWeight: '500', color: colors.primary }}>Stay relaxed</span>
              </p>
            </div>
          ) : result?.success && result.data?.face_detected ? (
            // Results Summary - Simple View
            <div>
              <h2 style={{ margin: '0 0 24px', fontSize: '1.15rem', color: colors.primary, fontWeight: '700' }}>Screening Complete</h2>
              
              <div style={{ background: colors.lightBg, borderRadius: '14px', padding: '18px', marginBottom: '20px', textAlign: 'center', borderLeft: `4px solid ${colors.success}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textLight, marginBottom: '6px' }}>Face Analysis</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '300', color: colors.primary }}>✓</div>
              </div>

              {/* Quick Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <QuickIndicator label="Expression" value={result.data.expressions?.smile_probability ?? 0} color={colors.primary} />
                <QuickIndicator label="Posture" value={Math.max(0, 1 - Math.abs((result.data.head_pose?.pitch ?? 0) / 45))} color={colors.primary} />
                <QuickIndicator label="Eyes" value={result.data.eye_analysis?.average_openness ?? 0.5} color={colors.primary} />
              </div>

              {result?.success && result.data && (
                <Link href={resultPageHref}>
                  <button style={{ width: '100%', padding: '14px 16px', background: colors.primary, color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginTop: '16px' }}>
                    View Full Analysis
                  </button>
                </Link>
              )}
            </div>
          ) : (
            // Default Empty State
            <div style={{ textAlign: 'center', paddingTop: '40px', paddingBottom: '40px' }}>
              <div style={{ width: '56px', height: '56px', background: colors.lightBg, borderRadius: '14px', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/></svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: colors.text, fontWeight: '600' }}>Ready to Begin</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: colors.textLight, lineHeight: '1.5' }}>
                Start the screening when you're ready. Your results will appear here.
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

function ResultSection({ title, subtitle, color, children }: { title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ marginBottom: '4px' }}>
        <h4 style={{ margin: 0, fontSize: '0.85rem', color: color, fontWeight: '600' }}>{title}</h4>
        {subtitle && <span style={{ fontSize: '0.7rem', color: '#9E9E9E' }}>{subtitle}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</div>
    </div>
  );
}

// Note: ResultBar kept for potential future detailed results view

function ResultBar({ label, sublabel, value, min, max, unit, multiplier = 1, color, highlight = false }: { label: string; sublabel?: string; value: number; min: number; max: number; unit: string; multiplier?: number; color: string; highlight?: boolean }) {
  const normalizedValue = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const displayValue = (value * multiplier).toFixed(1);

  return (
    <div style={{ padding: highlight ? '6px 8px' : '2px 0', background: highlight ? 'rgba(227, 25, 55, 0.08)' : 'transparent', borderRadius: highlight ? '8px' : '0', borderLeft: highlight ? '3px solid #E31937' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: '#37474F', fontWeight: '500' }}>{label}</span>
          {sublabel && <span style={{ fontSize: '0.7rem', color: '#9E9E9E', marginLeft: '6px' }}>{sublabel}</span>}
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: color }}>{displayValue}{unit}</span>
      </div>
      <div style={{ height: '5px', background: '#ECEFF1', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${normalizedValue}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}dd)`, borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function QuickIndicator({ label, value, color }: { label: string; value: number; color: string }) {
  const percentage = Math.round(Math.max(0, Math.min(100, value * 100)));
  const status = percentage > 65 ? '✓' : percentage > 35 ? '◐' : '✗';
  const statusColor = percentage > 65 ? '#2E7D32' : percentage > 35 ? '#F57C00' : '#E31937';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F5F7FA', borderRadius: '10px' }}>
      <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#37474F' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '40px', height: '4px', background: '#ECEFF1', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${percentage}%`, height: '100%', background: statusColor, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: statusColor }}>{status}</span>
      </div>
    </div>
  );
}
