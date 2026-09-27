import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api';
import { useAuth, WORKER_MESSAGE } from '../auth';
import { Logo } from '../components/Layout';

const DEMO = [
  { email: 'hq@buildup.kr', name: '정본사', desc: '본사 관계자 · 한빛건설 본사' },
  { email: 'admin@buildup.kr', name: '이영호', desc: '현장 관리자 · 현장 2곳' },
  { email: 'park@buildup.kr', name: '박철근', desc: '현장 관리자 · 최고 책임자' },
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault();
    const em = (override?.email ?? email).trim();
    const pw = override?.password ?? password;
    if (!em || !pw) {
      setError('이메일과 비밀번호를 입력해 주세요');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(em, pw);
    } catch (err) {
      if (err instanceof Error && err.message === WORKER_MESSAGE) setError(WORKER_MESSAGE);
      else setError(errorMessage(err, '이메일 또는 비밀번호를 확인해 주세요'));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero">
        <Logo size="lg" />
        <h1>현장의 오늘을 본사에서 한눈에</h1>
        <p>공정별 진행률, 계획 대비 지연, 사진 보고와 자재 요청까지 — 모든 현장을 한 화면에서 검토하세요.</p>
        <ul className="login-points">
          <li>현장별 계획 대비 진행률과 지연 현장 알림</li>
          <li>사진·위치 확인이 붙은 진행 보고 검토</li>
          <li>자재 요청 승인과 작업일보 엑셀 내려받기</li>
        </ul>
      </div>
      <div className="login-panel">
        <form className="card login-card" onSubmit={submit}>
          <h2>로그인</h2>
          <p className="muted small">본사 관계자 또는 현장 관리자 계정으로 로그인해 주세요.</p>
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.kr"
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
            />
          </label>
          {error && <div className="alert alert-danger">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>

          <div className="demo">
            <div className="demo-title">체험용 계정 (비밀번호 1234)</div>
            {DEMO.map((d) => (
              <button
                type="button"
                key={d.email}
                className="demo-item"
                disabled={busy}
                onClick={() => {
                  setEmail(d.email);
                  setPassword('1234');
                  void submit(undefined, { email: d.email, password: '1234' });
                }}
              >
                <span className="avatar avatar-sm">{d.name.slice(0, 1)}</span>
                <span className="demo-text">
                  <b>{d.name}</b>
                  <small>{d.desc}</small>
                </span>
                <span className="demo-email">{d.email}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
