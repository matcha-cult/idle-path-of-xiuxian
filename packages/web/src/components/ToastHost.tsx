import { observer } from 'mobx-react-lite';
import { useRootStore } from '../app/root-context.js';

const LEVEL_ICON: Record<string, string> = { info: 'ℹ', success: '✓', error: '✕' };

/** 错误 Toaster（02 §4.1 ToastStore）：传输层/业务层错误统一出口。 */
export const ToastHost = observer(function ToastHost() {
  const { toast } = useRootStore();
  if (toast.toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toast.toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.level}`}>
          <span className="toast__icon">{LEVEL_ICON[item.level] ?? '•'}</span>
          <div className="toast__body">
            <div className="toast__title">{item.title}</div>
            {item.message !== undefined ? <div className="toast__message">{item.message}</div> : null}
          </div>
          <button className="toast__close" onClick={() => toast.dismiss(item.id)} aria-label="关闭">
            ×
          </button>
        </div>
      ))}
    </div>
  );
});
