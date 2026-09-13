/**
 * BagPanel —— 背包（item 段）。**参考实现**：其余面板按同一模式编写。
 *
 * 模式（很重要，M3 全仓统一）：
 * - 本文件是**容器**：只做「store 状态 → ui-kit 通用组件 props」映射，不写业务规则；
 * - **不在挂载时自动拉取**：首屏数据由 `RootStore.loadPanel()` 统一并发加载，面板只管展示与交互；
 * - 视觉原语全部来自 `@idle-path/ui-kit` + antd：不写裸 div 布局、不写内联颜色、不传 `size`（紧凑全局生效）；
 * - 空/加载/错误三态一律交给 `AsyncBoundary`，不要在面板里再写一套。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Pagination, Space } from 'antd';
import { AsyncBoundary, ItemCard, ResourceGrid, SectionCard, Toolbar } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

export const BagPanel = observer(function BagPanel() {
  const root = useRootStore();
  const { item, equip, prop } = root;

  return (
    <SectionCard
      title="背包"
      subtitle={`共 ${item.total} 件 · 第 ${item.page} 页`}
      extra={
        <Button onClick={() => void item.load()} data-testid="bag-refresh">
          刷新背包
        </Button>
      }
    >
      <Toolbar
        left={
          <Space>
            <Button onClick={() => void item.loadBases()} data-testid="bag-load-bases">
              拉取基底库
            </Button>
            <Button onClick={() => void item.loadPickupRules()} data-testid="bag-load-rules">
              拾取规则
            </Button>
          </Space>
        }
        right={<span data-testid="bag-bases-count">基底 {item.bases.length} 项</span>}
      />

      <AsyncBoundary
        loading={item.loading}
        error={item.error}
        empty={item.items.length === 0}
        emptyText="背包空空如也，先去打点东西吧"
        onRetry={() => void item.load()}
      >
        <ResourceGrid
          items={item.items}
          span={8}
          keyOf={(entry) => String(entry.id)}
          renderItem={(entry) => (
            <ItemCard
              name={entry.name}
              tier={entry.tier}
              rarity={entry.rarity}
              meta={`${entry.baseCode} · ${entry.category}${entry.slot === null ? '' : ` · ${entry.slot}`}`}
              affixTexts={entry.affixTexts}
              actions={
                <Space>
                  <Button onClick={() => void equip.equip(entry.id)} data-testid={`bag-equip-${entry.id}`}>
                    装备
                  </Button>
                  <Button
                    danger
                    onClick={() => void prop.discard(entry.id)}
                    data-testid={`bag-discard-${entry.id}`}
                  >
                    丢弃
                  </Button>
                </Space>
              }
            />
          )}
        />
      </AsyncBoundary>

      <Flex justify="flex-end" style={{ marginTop: 12 }}>
        <Pagination
          current={item.page}
          pageSize={Math.max(1, item.pageSize)}
          total={item.total}
          showSizeChanger={false}
          onChange={(page) => item.setPage(page)}
        />
      </Flex>
    </SectionCard>
  );
});
