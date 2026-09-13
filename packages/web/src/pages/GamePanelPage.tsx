import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { EQUIP_SLOT_KEYS, RARITY_NAMES, REALMS, type ItemView } from '@idle-path/ionet-transport';
import { useRootStore } from '../app/root-context.js';
import { ConnectionBar } from '../components/ConnectionBar.js';

type TabKey =
  | 'bag'
  | 'equip'
  | 'skill'
  | 'realm'
  | 'economy'
  | 'zone'
  | 'quest'
  | 'combat'
  | 'story'
  | 'idle'
  | 'settings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'bag', label: '背包' },
  { key: 'equip', label: '装备' },
  { key: 'skill', label: '功法' },
  { key: 'realm', label: '境界' },
  { key: 'economy', label: '通货' },
  { key: 'zone', label: '秘境' },
  { key: 'quest', label: '任务' },
  { key: 'combat', label: '战斗' },
  { key: 'story', label: '剧情' },
  { key: 'idle', label: '挂机' },
  { key: 'settings', label: '设置' },
];

function rarityClass(rarity: number): string {
  return `rarity-${Math.max(0, Math.min(3, rarity))}`;
}

function rarityName(rarity: number): string {
  return RARITY_NAMES[rarity] ?? `#${rarity}`;
}

function realmName(realm: number): string {
  return REALMS[realm - 1] ?? `第 ${realm} 境`;
}

const Loading = observer(function Loading({ store }: { store: { loading: boolean } }) {
  return store.loading ? <div className="muted">加载中…</div> : null;
});

function ItemCard({ item, action }: { item: ItemView; action?: React.ReactNode }) {
  return (
    <div className="item-card">
      <div className={`item-card__name ${rarityClass(item.rarity)}`}>
        {item.name} <span className="muted">T{item.tier}</span>
      </div>
      <div className="item-card__meta">
        {item.baseCode} · {rarityName(item.rarity)} · {item.category}
        {item.slot !== null ? ` · ${item.slot}` : ''}
      </div>
      {item.affixTexts.length > 0 ? (
        <ul className="item-card__affixes">
          {item.affixTexts.map((text, index) => (
            <li key={`${item.id}-${index}`}>{text}</li>
          ))}
        </ul>
      ) : null}
      {action !== undefined ? <div className="item-card__actions">{action}</div> : null}
    </div>
  );
}

// ===== 背包 =====

const BagTab = observer(function BagTab() {
  const root = useRootStore();
  const { item, equip, prop } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">背包</h2>
        <span className="muted">共 {item.total} 件</span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void item.load()}>
          刷新
        </button>
      </div>
      <Loading store={item} />
      {item.items.length === 0 && !item.loading ? (
        <div className="empty">背包空空如也。可在「设置」页生成一件试玩装备。</div>
      ) : (
        <div className="grid">
          {item.items.map((entry) => (
            <ItemCard
              key={entry.id}
              item={entry}
              action={
                <>
                  <button className="btn btn--sm" onClick={() => void equip.equip(entry.id)}>
                    装备
                  </button>
                  <button className="btn btn--sm" onClick={() => void prop.discard(entry.id)}>
                    丢弃
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
      <div className="pager">
        <button className="btn btn--sm" disabled={item.page <= 1} onClick={() => item.setPage(item.page - 1)}>
          上一页
        </button>
        <span className="muted">
          第 {item.page} 页 / 每页 {item.pageSize}
        </span>
        <button
          className="btn btn--sm"
          disabled={item.page * item.pageSize >= item.total}
          onClick={() => item.setPage(item.page + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  );
});

// ===== 装备 =====

const EquipTab = observer(function EquipTab() {
  const root = useRootStore();
  const { equip } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">装备栏</h2>
        <span className="muted">已装备 {equip.equippedCount} 件</span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void equip.load()}>
          刷新
        </button>
      </div>
      <Loading store={equip} />
      <div className="slot-grid">
        {EQUIP_SLOT_KEYS.map((slot) => {
          const worn = equip.slots[slot] ?? null;
          return (
            <div key={slot} className={`slot ${worn !== null ? 'slot--filled' : ''}`}>
              <div className="slot__label">{slot}</div>
              {worn !== null ? (
                <>
                  <div className={rarityClass(worn.rarity)}>
                    {worn.name} <span className="muted">T{worn.tier}</span>
                  </div>
                  <button className="btn btn--sm" onClick={() => void equip.unequip(worn.id)}>
                    卸下
                  </button>
                </>
              ) : (
                <div className="muted">空</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

// ===== 功法 =====

const SkillTab = observer(function SkillTab() {
  const root = useRootStore();
  const { skill } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">功法</h2>
        <span className="muted">
          心法主槽：{skill.panel?.xinfa.main ?? '空'} · 术法 {skill.panel?.shufa.length ?? 0} 个
        </span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void skill.load()}>
          刷新
        </button>
      </div>
      <Loading store={skill} />
      {skill.catalog.length === 0 && !skill.loading ? (
        <div className="empty">暂无功法数据。</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>code</th>
              <th>名称</th>
              <th>类型</th>
              <th>道基</th>
              <th>神识</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {skill.catalog.map((entry) => (
              <tr key={entry.code}>
                <td>{entry.code}</td>
                <td>{entry.name}</td>
                <td>{entry.skillType ?? '—'}</td>
                <td>{String(entry.daoji ?? '—')}</td>
                <td>{entry.spiritCost ?? '—'}</td>
                <td>
                  <button className="btn btn--sm" onClick={() => void skill.learn(entry.id)}>
                    修习
                  </button>
                  <button className="btn btn--sm" onClick={() => void skill.enlighten(entry.id)}>
                    参悟
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
});

// ===== 境界 =====

const RealmTab = observer(function RealmTab() {
  const root = useRootStore();
  const { realm } = root;
  const status = realm.status;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">境界</h2>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void realm.load()}>
          刷新
        </button>
      </div>
      <Loading store={realm} />
      {status === null ? (
        <div className="empty">暂无境界数据。</div>
      ) : (
        <div className="card">
          <dl className="kv">
            <dt>当前境界</dt>
            <dd>
              {status.realmName}（第 {status.realm} 境 / 共 {REALMS.length} 境）
            </dd>
            <dt>灵韵</dt>
            <dd>{status.lingyun}</dd>
            <dt>下一境消耗</dt>
            <dd>{status.isMax ? '已至封顶' : (status.nextCost ?? '—')}</dd>
          </dl>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--primary" disabled={status.isMax} onClick={() => void realm.breakthrough()}>
              突破
            </button>
          </div>
        </div>
      )}
    </section>
  );
});

// ===== 通货 =====

const EconomyTab = observer(function EconomyTab() {
  const root = useRootStore();
  const { economy } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">通货与精华</h2>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void economy.load()}>
          刷新
        </button>
      </div>
      <Loading store={economy} />
      <div className="grid grid--wide">
        <div className="card">
          <h3 className="panel-title">通货</h3>
          {economy.currencies.length === 0 ? (
            <div className="muted">暂无</div>
          ) : (
            <table className="table">
              <tbody>
                {economy.currencies.map((entry) => (
                  <tr key={entry.code}>
                    <td>{entry.name ?? entry.code}</td>
                    <td>{entry.owned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 className="panel-title">精华</h3>
          {economy.essences.length === 0 ? (
            <div className="muted">暂无</div>
          ) : (
            <table className="table">
              <tbody>
                {economy.essences.map((entry) => (
                  <tr key={entry.code}>
                    <td>{entry.name ?? entry.code}</td>
                    <td>{entry.owned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {economy.lastCraft !== null ? (
        <div className="card" style={{ marginTop: 10 }}>
          <h3 className="panel-title">最近炼器结果</h3>
          <pre className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(economy.lastCraft, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
});

// ===== 秘境 =====

const ZoneTab = observer(function ZoneTab() {
  const root = useRootStore();
  const { zone } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">秘境</h2>
        <span className="muted">战力 {zone.playerPower}</span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void zone.load()}>
          刷新
        </button>
      </div>
      <Loading store={zone} />
      <div className="grid grid--wide">
        <div className="card">
          <h3 className="panel-title">秘境列表</h3>
          <table className="table">
            <thead>
              <tr>
                <th>code</th>
                <th>名称</th>
                <th>层数</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {zone.zones.map((entry) => (
                <tr key={entry.code}>
                  <td>{entry.code}</td>
                  <td>{entry.name}</td>
                  <td>
                    {entry.progress.bestFloor}/{entry.maxFloor}
                  </td>
                  <td>{entry.unlocked === true ? '已解锁' : '未解锁'}</td>
                  <td>
                    <button
                      className="btn btn--sm"
                      disabled={entry.unlocked !== true}
                      onClick={() => void zone.enter(entry.code)}
                    >
                      进入
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="panel-title">当前进度</h3>
          {zone.progress === null ? (
            <div className="muted">暂无</div>
          ) : (
            <dl className="kv">
              <dt>当前秘境</dt>
              <dd>{zone.currentZone ?? '—'}</dd>
              <dt>层数 / 最佳</dt>
              <dd>
                {zone.progress.floor} / {zone.progress.bestFloor}
              </dd>
              <dt>通关</dt>
              <dd>{zone.progress.cleared === true ? '是' : '否'}</dd>
              <dt>可挑战</dt>
              <dd>{zone.progress.canChallenge === true ? '是' : '否'}</dd>
            </dl>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--primary" onClick={() => void zone.challenge()}>
              挑战当前层
            </button>
          </div>
          {zone.lastChallenge !== null ? (
            <pre className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
              {JSON.stringify(zone.lastChallenge, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
});

// ===== 任务 =====

const QuestTab = observer(function QuestTab() {
  const root = useRootStore();
  const { quest } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">任务</h2>
        <span className="muted">
          已完成 {quest.completed}/{quest.total} · 章节 {quest.chapters.length}
        </span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void quest.load()}>
          刷新
        </button>
        <button className="btn btn--sm" onClick={() => void quest.sync()}>
          一键同步
        </button>
      </div>
      <Loading store={quest} />
      <table className="table">
        <thead>
          <tr>
            <th>code</th>
            <th>名称</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {quest.quests.map((entry) => (
            <tr key={entry.code}>
              <td>{entry.code}</td>
              <td>{entry.name}</td>
              <td>{entry.status}</td>
              <td>
                <button className="btn btn--sm" onClick={() => void quest.detail(entry.code)}>
                  详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});

// ===== 战斗 =====

const CombatTab = observer(function CombatTab() {
  const root = useRootStore();
  const { combat } = root;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">战斗</h2>
        <span className="muted">单位 {combat.total}</span>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void combat.load()}>
          刷新
        </button>
      </div>
      <Loading store={combat} />
      <table className="table">
        <thead>
          <tr>
            <th>code</th>
            <th>名称</th>
            <th>阵营</th>
            <th>境界</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {combat.units.map((entry) => (
            <tr key={entry.code}>
              <td>{entry.code}</td>
              <td>{entry.name}</td>
              <td>{entry.camp}</td>
              <td>{realmName(entry.realm)}</td>
              <td>
                <button className="btn btn--sm" onClick={() => void combat.spawn({ code: entry.code })}>
                  生成
                </button>
                <button className="btn btn--sm" onClick={() => void combat.kill({ code: entry.code, count: 1 })}>
                  击杀
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});

// ===== 剧情 =====

const StoryTab = observer(function StoryTab() {
  const root = useRootStore();
  const { story } = root;
  const [code, setCode] = useState('1');
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">剧情</h2>
        <span className="panel-head__spacer" />
        <input
          className="field"
          style={{ background: '#0b0e13', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--text)' }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="章节序号或 code"
        />
        <button className="btn btn--sm" onClick={() => void story.loadChapter(code)}>
          加载
        </button>
      </div>
      <Loading store={story} />
      <h3 className="panel-title">{story.chapter?.name ?? '（未加载章节）'}</h3>
      {story.nodes.length === 0 ? (
        <div className="empty">暂无剧情节点。</div>
      ) : (
        <ul className="item-card__affixes">
          {story.nodes.map((node) => (
            <li key={node.nodeKey}>
              <strong>{node.nodeKey}</strong>（{node.type}）：{node.text}
              <button className="btn btn--sm" onClick={() => void story.markSeen(node.nodeKey)}>
                标记已读
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

// ===== 挂机 =====

const IdleTab = observer(function IdleTab() {
  const root = useRootStore();
  const { idle } = root;
  const status = idle.status;
  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">挂机</h2>
        <span className="panel-head__spacer" />
        <button className="btn btn--sm" onClick={() => void idle.load()}>
          刷新
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => void idle.settle({})}>
          结算离线收益
        </button>
      </div>
      <Loading store={idle} />
      {status === null ? (
        <div className="empty">暂无挂机数据。</div>
      ) : (
        <div className="card">
          <dl className="kv">
            <dt>上次结算</dt>
            <dd>{status.lastSettleAt}</dd>
            <dt>待结算时长</dt>
            <dd>{status.pendingHours} 小时（有效 {status.effectiveHours}）</dd>
            <dt>预计击杀</dt>
            <dd>{status.estimatedKills}</dd>
            <dt>预计灵韵</dt>
            <dd>{status.estimatedLingyun}</dd>
            <dt>日产出上限</dt>
            <dd>
              {status.dailyItemsProduced}/{status.dailyItemCap}
            </dd>
          </dl>
        </div>
      )}
      {idle.lastSettle !== null ? (
        <div className="card" style={{ marginTop: 10 }}>
          <h3 className="panel-title">最近结算</h3>
          <pre className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(idle.lastSettle, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
});

// ===== 设置（开发/诊断）=====

const SettingsTab = observer(function SettingsTab() {
  const root = useRootStore();
  const { item, prop, session, economy, skill } = root;
  const [baseId, setBaseId] = useState('1');
  const [rarity, setRarity] = useState('0');
  const [lingyun, setLingyun] = useState('1000');

  return (
    <section>
      <div className="panel-head">
        <h2 className="panel-title">设置 / 开发工具</h2>
      </div>
      <div className="grid grid--wide">
        <div className="card">
          <h3 className="panel-title">账号</h3>
          <dl className="kv">
            <dt>道号</dt>
            <dd>{session.user?.username ?? '—'}</dd>
            <dt>角色</dt>
            <dd>{session.character?.nickname ?? '—'}</dd>
            <dt>角色 id</dt>
            <dd>{session.character?.id ?? '—'}</dd>
          </dl>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn--sm" onClick={() => void session.refreshCharacter()}>
              刷新角色
            </button>
            <button className="btn btn--sm" onClick={() => root.logout()}>
              退出登录
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="panel-title">生成装备（dev prop.generate）</h3>
          <label className="field">
            <span>基底 id</span>
            <input value={baseId} onChange={(e) => setBaseId(e.target.value)} />
          </label>
          <label className="field">
            <span>稀有度 0–3</span>
            <input value={rarity} onChange={(e) => setRarity(e.target.value)} />
          </label>
          <button
            className="btn btn--primary btn--sm"
            onClick={() =>
              void prop
                .generate({
                  baseId: Number(baseId),
                  rarity: Number(rarity),
                  characterId: session.character?.id ?? null,
                })
                .then(() => item.load())
            }
          >
            生成
          </button>
          <p className="muted">基底 id 可在「背包 → 刷新」后由套装基底库（item.bases）查询；默认 1。</p>
        </div>

        <div className="card">
          <h3 className="panel-title">开发注入</h3>
          <label className="field">
            <span>灵韵数量</span>
            <input value={lingyun} onChange={(e) => setLingyun(e.target.value)} />
          </label>
          <button
            className="btn btn--sm"
            onClick={() => void skill.grantLingyun(Number(lingyun))}
          >
            注入灵韵
          </button>
          <button
            className="btn btn--sm"
            onClick={() => void economy.grantCurrency({ code: 'chaos', count: 10 })}
          >
            注入混沌石 ×10
          </button>
          <button className="btn btn--sm" onClick={() => void item.loadBases()}>
            拉取基底库（{item.bases.length}）
          </button>
        </div>
      </div>
    </section>
  );
});

/** 游戏主面板（T3/T4）：连接状态 + 角色头 + 分页签。 */
export const GamePanelPage = observer(function GamePanelPage() {
  const root = useRootStore();
  const [tab, setTab] = useState<TabKey>('bag');

  useEffect(() => {
    void root.loadPanel();
  }, [root]);

  const character = root.session.character;

  return (
    <div className="game">
      <ConnectionBar />

      <header className="hero">
        <span className="hero__name">{character?.nickname ?? '—'}</span>
        <span className="hero__title">{character?.title ?? '散修'}</span>
        <span className="hero__realm">{realmName(character?.realm ?? 1)}</span>
        <span className="hero__spacer" />
        <span className="hero__stats">
          <span>灵石 {character?.spiritStones ?? 0}</span>
          <span>灵韵 {character?.lingyun ?? 0}</span>
          <span>玉简 {character?.jadeSlips ?? 0}</span>
        </span>
        <button className="btn btn--sm" onClick={() => void root.loadPanel()}>
          全量刷新
        </button>
      </header>

      <nav className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            className={`tab ${tab === entry.key ? 'tab--active' : ''}`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <main className="card">
        {tab === 'bag' ? <BagTab /> : null}
        {tab === 'equip' ? <EquipTab /> : null}
        {tab === 'skill' ? <SkillTab /> : null}
        {tab === 'realm' ? <RealmTab /> : null}
        {tab === 'economy' ? <EconomyTab /> : null}
        {tab === 'zone' ? <ZoneTab /> : null}
        {tab === 'quest' ? <QuestTab /> : null}
        {tab === 'combat' ? <CombatTab /> : null}
        {tab === 'story' ? <StoryTab /> : null}
        {tab === 'idle' ? <IdleTab /> : null}
        {tab === 'settings' ? <SettingsTab /> : null}
      </main>
    </div>
  );
});
