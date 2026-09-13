/**
 * LoginPage —— 登录 / 注册（REST `POST /api/auth/{login,register}`，07 §1.1/§1.2）。
 *
 * 容器层：表单状态由 antd `Form` 管理，提交后交给 `SessionStore`（store 负责 REST 调用与 token 落盘）。
 * 登录成功后由 `RootStore.login()` 继续把 `?token=` 交给 WS 握手并并发拉面板。
 */
import { observer } from 'mobx-react-lite';
import { Alert, Card, Flex, Form, Segmented, Typography } from 'antd';
import { useState } from 'react';
import { PasswordField, SubmitButton, TextField } from '@idle-path/ui-kit';
import { useRootStore } from '../app/root-context.js';

type Mode = 'login' | 'register';

interface LoginFormValues {
  username?: string;
  password?: string;
}

export const LoginPage = observer(function LoginPage() {
  const root = useRootStore();
  const [mode, setMode] = useState<Mode>('login');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: LoginFormValues): Promise<void> => {
    const username = (values.username ?? '').trim();
    const password = values.password ?? '';
    if (username.length === 0 || password.length === 0) return;
    setSubmitting(true);
    try {
      if (mode === 'login') await root.login(username, password);
      else await root.register(username, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Flex align="center" justify="center" vertical gap="middle" data-testid="login-page">
      <Card style={{ width: 420 }}>
        <Typography.Title level={4} data-testid="login-title">
          放置·修仙之路
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          登录后经 <Typography.Text code>?token=</Typography.Text> 建立 WS 连接
        </Typography.Paragraph>

        <Segmented<Mode>
          block
          value={mode}
          onChange={setMode}
          options={[
            { label: '登录', value: 'login' },
            { label: '注册', value: 'register' },
          ]}
          data-testid="login-mode"
        />

        <Form<LoginFormValues>
          layout="vertical"
          onFinish={(values) => void submit(values)}
          disabled={submitting}
          data-testid="login-form"
          style={{ marginTop: 16 }}
        >
          <TextField
            name="username"
            label="道号（3–50 字符）"
            required
            maxLength={50}
            placeholder="例如：无名道友"
          />
          <PasswordField
            name="password"
            label="口令（≥6 字符）"
            required
            minLength={6}
            placeholder="••••••"
          />

          {root.session.errorMessage !== null ? (
            <Alert
              type="error"
              showIcon
              title={root.session.errorMessage}
              data-testid="login-error"
              style={{ marginBottom: 12 }}
            />
          ) : null}

          <SubmitButton loading={submitting} block>
            {mode === 'login' ? '登录' : '注册并登录'}
          </SubmitButton>
        </Form>
      </Card>
      <Typography.Text type="secondary">
        后端：REST <Typography.Text code>/api</Typography.Text>（认证 + 角色） · WS{' '}
        <Typography.Text code>/ws</Typography.Text>（其余全部游戏交互）
      </Typography.Text>
    </Flex>
  );
});
