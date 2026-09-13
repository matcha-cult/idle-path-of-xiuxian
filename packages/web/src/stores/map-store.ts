/**
 * MapStore —— 地图线路图 / 跑图 / 传送（`settings-revision-2.md` §5、§7）。
 *
 * 口径：
 * - 服务端**只下发已发现的节点**、以及**两端都已发现的边**（未发现 = 不下发），
 *   因此 store 不做任何可见性过滤，面板也不得自行造节点；
 * - 战力对比只用服务端给的 `playerPower` 与节点 `threshold`，store/面板都不计算战力；
 * - `enter` / `waypoint` 的业务失败（`NODE_LOCKED` / `NODE_POWER_NOT_ENOUGH` /
 *   `WAYPOINT_NOT_UNLOCKED` …）是**预期分支**：只走 toast 出口并 return，
 *   **不写进 `error`** —— `error` 只表示「面板数据没拉到」，避免一次跑图失败把整张线路图清空。
 * - 协议自 P2.0 v3 起带「当前所在」字段（`MapView.currentNodeCode`，服务端持久化在
 *   `game_map_state`）：`currentCode` 首屏即来自服务端，`enter` / `waypoint` 成功后也会被
 *   随后的 `load()` 刷新为服务端真值（不再只是会话内状态）。
 * - 「能否前往」由服务端下发的 `node.adjacent` 决定（拓扑权威），**前端不做本地邻接推断**。
 *
 * 挂载时不拉取：首屏由 `RootStore.loadPanel()` 并发加载。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import { businessCodeOf, businessErrorMessage, businessMessageOf } from '@idle-path/ionet-transport';
import type { MapEdgeView, MapNodeView, MapObjectView, MapView, NodeProgressView } from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

export class MapStore {
  /** 地图列表（服务端已按角色过滤）。 */
  maps: MapView[] = [];
  /** 当前选中地图的已发现节点（服务端已过滤未发现的）。 */
  nodes: MapNodeView[] = [];
  /** 当前选中地图的邻接边（两端均已发现）。 */
  edges: MapEdgeView[] = [];
  /** 玩家战力（服务端计算，面板只做对比展示）。 */
  playerPower = 0;
  /** 会话内当前所在节点；协议无此字段，首屏为 null。 */
  currentCode: string | null = null;
  /** 当前选中的地图 code（首屏取第一张）。 */
  selectedMapCode: string | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(
      this,
      {
        ctx: false,
        guard: false,
        maps: observable.shallow,
        nodes: observable.shallow,
        edges: observable.shallow,
      },
      { autoBind: true },
    );
  }

  /** 当前选中地图（`maps` 为空时 null）。 */
  get currentMap(): MapView | null {
    return this.maps.find((entry) => entry.code === this.selectedMapCode) ?? this.maps[0] ?? null;
  }

  /** 节点三态（契约字段；DTO 把 progress 内嵌在节点上，这里按 `nodes` 顺序派生）。 */
  get progress(): NodeProgressView[] {
    return this.nodes.map((node) => node.progress);
  }

  /** 当前地图的职能对象（P2.0 §3；面板按宿主 `nodeCode` 过滤）。 */
  get objects(): MapObjectView[] {
    return this.currentMap?.objects ?? [];
  }

  /** 切换地图：只重算节点/边/当前所在，不重新请求（`maps` 已含各图节点）。 */
  selectMap(code: string): void {
    runInAction(() => {
      this.applySelected(this.maps.find((entry) => entry.code === code) ?? null);
    });
  }

  /**
   * 应用选中地图：节点 / 边 / **当前所在**。
   *
   * `currentCode` 以服务端 `currentNodeCode` 为准（P2.0 v3 §5 已持久化到 `game_map_state`），
   * 不再只是会话内状态 —— 刷新后仍能高亮「我在哪」。
   */
  private applySelected(selected: MapView | null): void {
    this.selectedMapCode = selected?.code ?? null;
    this.nodes = selected?.nodes ?? [];
    this.edges = selected?.edges ?? [];
    this.currentCode = selected?.currentNodeCode ?? null;
  }

  /** 拉取地图列表（无业务码）。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.map.list();
      const data = result.data;
      if (data === undefined) throw new Error('地图响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.maps = data.maps;
        this.playerPower = data.playerPower;
        const selected =
          data.maps.find((entry) => entry.code === this.selectedMapCode) ?? data.maps[0] ?? null;
        this.applySelected(selected);
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '地图加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** 跑图：移动到目标节点（确定性战力检定在服务端，恰好等于门槛应通过）。 */
  async enter(nodeCode: string): Promise<void> {
    this.loading = true;
    try {
      const result = await this.ctx.game.map.enter(nodeCode);
      if (result.success === false) {
        this.reportBusinessFailure(result);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('跑图响应缺少 data');
      runInAction(() => {
        this.currentCode = data.node.code;
      });
      this.ctx.toast.success(data.firstVisit ? '首次到达' : '已到达', data.node.name);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '跑图失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 传送：直达已点亮传送点的节点。 */
  async waypoint(nodeCode: string): Promise<void> {
    this.loading = true;
    try {
      const result = await this.ctx.game.map.waypoint(nodeCode);
      if (result.success === false) {
        this.reportBusinessFailure(result);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('传送响应缺少 data');
      runInAction(() => {
        this.currentCode = data.node.code;
      });
      this.ctx.toast.success('已传送', data.node.name);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '传送失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 业务失败统一出口：只 toast（`error` 留给「数据没拉到」，不因一次跑图失败清空线路图）。 */
  private reportBusinessFailure(result: unknown): void {
    const code = businessCodeOf(result);
    const message = businessMessageOf(result) ?? businessErrorMessage(code);
    this.ctx.toast.fromBusinessCode(code, message);
  }
}
