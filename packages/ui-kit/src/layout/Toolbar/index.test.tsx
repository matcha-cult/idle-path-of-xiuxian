/**
 * Toolbar：左/右/中三插槽操作条。
 * 覆盖：正常渲染三插槽、空态（无 props / 空串）、只有单侧时的对齐、点击与禁用交互、
 * 可访问名称、超长文本。
 *
 * 注意：antd `Button` 默认会对「恰好两个汉字」的文案自动插入空格（`autoInsertSpace`），
 * 故用例统一使用 3 个以上汉字的按钮文案，避免把 antd 的排版行为误判为可访问名错误。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './index.js';

describe('Toolbar', () => {
  it('正常渲染：left/right/children 三个插槽都出现', () => {
    render(
      <Toolbar left={<Button>刷新列表</Button>} right={<Button type="primary">新增物品</Button>}>
        <span>中间区</span>
      </Toolbar>,
    );

    expect(screen.getByTestId('toolbar-root')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-left')).toContainElement(screen.getByRole('button', { name: '刷新列表' }));
    expect(screen.getByTestId('toolbar-right')).toContainElement(screen.getByRole('button', { name: '新增物品' }));
    expect(screen.getByTestId('toolbar-center')).toHaveTextContent('中间区');
  });

  it('空态：不传任何插槽时只渲染一个空操作条，无左右占位、无中间区', () => {
    render(<Toolbar />);

    const root = screen.getByTestId('toolbar-root');
    expect(root).toBeInTheDocument();
    expect(root).toBeEmptyDOMElement();
    expect(screen.queryByTestId('toolbar-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toolbar-center')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toolbar-right')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('边界：空串与 null 视为未提供，对应插槽完全不渲染', () => {
    render(<Toolbar left="" right={null} />);

    expect(screen.getByTestId('toolbar-root')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('toolbar-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toolbar-right')).not.toBeInTheDocument();
  });

  it('边界：只有右侧操作时右对齐（flex-end），左侧插槽不出现', () => {
    render(<Toolbar right={<Button>仅右侧</Button>} />);

    expect(screen.queryByTestId('toolbar-left')).not.toBeInTheDocument();
    expect(screen.getByTestId('toolbar-right')).toContainElement(screen.getByRole('button', { name: '仅右侧' }));
    expect(screen.getByTestId('toolbar-root')).toHaveClass('ant-flex-justify-flex-end');
  });

  it('交互：点击右侧主按钮触发回调，禁用按钮不触发', async () => {
    const onPrimary = vi.fn();
    const onDisabled = vi.fn();
    render(
      <Toolbar
        left={<Button disabled onClick={onDisabled}>导出数据</Button>}
        right={<Button type="primary" onClick={onPrimary}>保存设置</Button>}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    const disabled = screen.getByRole('button', { name: '导出数据' });
    expect(disabled).toBeDisabled();
    await userEvent.click(disabled);
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('可访问性：按钮保留可读名称，键盘可聚焦并触发', async () => {
    const onClick = vi.fn();
    render(<Toolbar right={<Button onClick={onClick}>确认保存</Button>} />);

    const button = screen.getByRole('button', { name: '确认保存' });
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('超长文本：内容完整渲染，不被截断为省略', () => {
    const longText = '超长操作名称'.repeat(40);
    render(<Toolbar left={<span>{longText}</span>} />);

    expect(screen.getByTestId('toolbar-left')).toHaveTextContent(longText);
  });
});
