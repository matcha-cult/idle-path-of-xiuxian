/**
 * CharacterCreatePage —— 建角（REST `POST /api/character/create`，07 §1.4）。
 *
 * 容器层：表单交给 antd `Form`，提交交给 `SessionStore.createCharacter`。
 */
import { observer } from 'mobx-react-lite';
import { Alert, Button, Card, Flex, Form, Typography } from 'antd';
import { useState } from 'react';
import { SelectField, SubmitButton, TextField } from '@idle-path/ui-kit';
import { useRootStore } from '../app/root-context.js';

interface CharacterFormValues {
  nickname?: string;
  gender?: 'male' | 'female';
}

export const CharacterCreatePage = observer(function CharacterCreatePage() {
  const root = useRootStore();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: CharacterFormValues): Promise<void> => {
    const nickname = (values.nickname ?? '').trim();
    const gender = values.gender ?? 'male';
    if (nickname.length === 0) return;
    setSubmitting(true);
    try {
      await root.createCharacter(nickname, gender);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Flex align="center" justify="center" vertical gap="middle" data-testid="character-create-page">
      <Card style={{ width: 420 }}>
        <Typography.Title level={4}>开辟道途</Typography.Title>
        <Typography.Paragraph type="secondary" data-testid="character-create-account">
          道号：{root.session.user?.username ?? '—'}（尚未创建角色）
        </Typography.Paragraph>

        <Form<CharacterFormValues>
          layout="vertical"
          initialValues={{ gender: 'male' }}
          onFinish={(values) => void submit(values)}
          disabled={submitting}
          data-testid="character-create-form"
        >
          <TextField
            name="nickname"
            label="角色昵称（≤50 字符）"
            required
            maxLength={50}
            placeholder="例如：验收道友"
          />
          <SelectField
            name="gender"
            label="性别"
            required
            options={[
              { label: '男', value: 'male' },
              { label: '女', value: 'female' },
            ]}
          />

          {root.session.errorMessage !== null ? (
            <Alert
              type="error"
              showIcon
              title={root.session.errorMessage}
              data-testid="character-create-error"
              style={{ marginBottom: 12 }}
            />
          ) : null}

          <SubmitButton loading={submitting} block>
            创建角色
          </SubmitButton>
        </Form>

        <Button type="link" block onClick={() => root.logout()} data-testid="character-create-logout">
          退出登录
        </Button>
      </Card>
    </Flex>
  );
});
