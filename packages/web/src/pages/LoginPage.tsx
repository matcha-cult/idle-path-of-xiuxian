import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '../app/root-context.js';

/** 登录 / 注册（REST `POST /api/auth/{login,register}`，07 §1.1/§1.2）。 */
export const LoginPage = observer(function LoginPage() {
  const root = useRootStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && !submitting;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'login') await root.login(username.trim(), password);
      else await root.register(username.trim(), password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={(e) => void submit(e)}>
        <h1 className="auth-card__title">放置·修仙之路</h1>
        <p className="auth-card__subtitle">
          {mode === 'login' ? '登录已有道号' : '注册新道号'} · 登录后经 <code>?token=</code> 建立 WS 连接
        </p>

        <label className="field">
          <span>道号（3–50 字符）</span>
          <input
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例如：无名道友"
          />
        </label>

        <label className="field">
          <span>口令（≥6 字符）</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </label>

        {root.session.errorMessage !== null ? (
          <div className="form-error">{root.session.errorMessage}</div>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={!canSubmit}>
          {submitting ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        <button
          className="btn btn--link"
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '没有道号？去注册' : '已有道号？去登录'}
        </button>
      </form>
      <p className="auth-page__hint">
        后端：REST <code>/api</code>（认证 + 角色） · WS <code>/ws</code>（其余全部游戏交互）
      </p>
    </div>
  );
});
