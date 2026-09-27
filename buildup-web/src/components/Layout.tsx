import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { formatDate } from '../utils/format';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`logo logo-${size}`}>
      <span className="logo-mark" aria-hidden>
        <i style={{ height: '40%' }} />
        <i style={{ height: '70%' }} />
        <i style={{ height: '100%' }} />
      </span>
      <span className="logo-text">
        Build <b>Up</b>
      </span>
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = { hq: '본사 관계자', admin: '현장 관리자', worker: '작업자' };

export default function Layout() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const org = user.role === 'hq' ? user.company : user.company || user.hqName;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="topbar-brand">
            <Logo />
            <span className="topbar-sub">{user.role === 'hq' ? '본사 대시보드' : '현장 대시보드'}</span>
          </Link>
          <div className="topbar-right">
            <span className="topbar-date">{formatDate()}</span>
            <div className="topbar-user">
              <span className="avatar" aria-hidden>
                {user.name.slice(0, 1)}
              </span>
              <span className="topbar-user-text">
                <b>{user.name}</b>
                <small>
                  {ROLE_LABEL[user.role]}
                  {org ? ` · ${org}` : ''}
                </small>
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
