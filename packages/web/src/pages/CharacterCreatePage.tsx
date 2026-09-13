import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useRootStore } from '../app/root-context.js';

/** 建角（REST `POST /api/character/create`，07 §1.4）。 */
export const CharacterCreatePage = observer(function CharacterCreatePage() {
  const root = useRootStore();
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = nickname.trim().length > 0 && nickname.trim().length <= 50 && !submitting;

  return (
    <div className="auth-page">
      <form
        className="card auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setSubmitting(true);
          void root.createCharacter(nickname.trim(), gender).finally(() => setSubmitting(false));
        }}
      >
        <h1 className="auth-card__title">开辟道途</h1>
        <p className="auth-card__subtitle">
          道号：{root.session.user?.username ?? '—'}（尚未创建角色）
        </p>

        <label className="field">
          <span>角色昵称（≤50 字符）</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例如：验收道友" />
        </label>

        <div className="field">
          <span>性别</span>
          <div className="radio-row">
            <label className="radio">
              <input type="radio" checked={gender === 'male'} onChange={() => setGender('male')} /> 男
            </label>
            <label className="radio">
              <input type="radio" checked={gender === 'female'} onChange={() => setGender('female')} /> 女
            </label>
          </div>
        </div>

        {root.session.errorMessage !== null ? (
          <div className="form-error">{root.session.errorMessage}</div>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={!canSubmit}>
          {submitting ? '创建中…' : '创建角色'}
        </button>
        <button className="btn btn--link" type="button" onClick={() => root.logout()}>
          退出登录
        </button>
      </form>
    </div>
  );
});
