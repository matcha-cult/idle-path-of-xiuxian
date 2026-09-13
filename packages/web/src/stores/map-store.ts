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
 * - **`loading` 只服务于「首屏 / 整图重新加载」**：`enter` / `waypoint` 这类**移动**动作走
 *   `refreshQuiet()`（静默刷新，不碰 `loading`），否则点一下「前往」就会把整块面板
 *   （画布 + 详情）卸载换成骨架屏 —— 玩家点「前往」时画布不该消失（用户实测 B1 的形态之一）。
 *   移动中的反馈走**按钮级** `moving` / `movingTo`，面板内容全程保持挂载。
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
  /** 「前往 / 传送」进行中（**按钮级**反馈；不参与面板级 `loading`，见类注释）。 */
  moving = false;
  /** 正在前往 / 传送的目标节点 code；按钮 loading 只给它，其余移动按钮只禁用。 */
  movingTo: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态。 */
  private readonly guard = new LoadGuard();
  /**
   * 静默刷新的竞态守卫。
   *
   * **必须与 `guard` 分开**：共用一个序号时，`enter` 的静默刷新会让在飞的 `load()` 令牌过期，
   * 而 `load()` 的 `finally` 判 `isCurrent` 才清 `loading` —— 结果就是 `loading` 永远卡在 true
   * （面板永久骨架屏）。分开后两条路径互不取消对方的收尾。
   */
  private readonly quietGuard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard' | 'quietGuard'>(
      this,
      {
        ctx: false,
        guard: false,
        quietGuard: false,
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

  /**
   * **静默刷新**：与 `load()` 拉同一份数据，但
   * - **不碰面板级 `loading` / `error`** —— 面板内容（画布 + 详情）全程保持挂载，不闪骨架屏；
   * - 失败时**保留旧数据**，只 toast（地图数据没刷新成功 ≠ 玩家脚下这张图不存在）。
   *
   * 用于 `enter` / `waypoint` 结束后的对齐（以及后续任何「不影响地图主体」的刷新）。
   */
  async refreshQuiet(): Promise<void> {
    const token = this.quietGuard.next();
    try {
      const result = await this.ctx.game.map.list();
      const data = result.data;
      if (data === undefined) throw new Error('地图响应缺少 data');
      if (!this.quietGuard.isCurrent(token)) return;
      runInAction(() => {
        this.maps = data.maps;
        this.playerPower = data.playerPower;
        const selected =
          data.maps.find((entry) => entry.code === this.selectedMapCode) ?? data.maps[0] ?? null;
        this.applySelected(selected);
      });
    } catch (error) {
      if (!this.quietGuard.isCurrent(token)) return;
      this.ctx.toast.fromError(error, '地图刷新失败');
    }
  }

  /** 跑图：移动到目标节点（确定性战力检定在服务端，恰好等于门槛应通过）。 */
  async enter(nodeCode: string): Promise<void> {
    this.beginMove(nodeCode);
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
      // 静默对齐服务端真值：**不**走 `load()`，面板不闪骨架屏（B1 修复点）
      await this.refreshQuiet();
    } catch (error) {
      // 移动失败是预期分支：只 toast，不写 `error`（写它会把整张线路图换成错误页）
      this.ctx.toast.fromError(error, '跑图失败');
    } finally {
      this.endMove();
    }
  }

  /** 传送：直达已点亮传送点的节点。 */
  async waypoint(nodeCode: string): Promise<void> {
    this.beginMove(nodeCode);
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
      await this.refreshQuiet();
    } catch (error) {
      this.ctx.toast.fromError(error, '传送失败');
    } finally {
      this.endMove();
    }
  }

  /** 移动开始：置按钮级 busy（**不动 `loading`**）。 */
  private beginMove(nodeCode: string): void {
    runInAction(() => {
      this.moving = true;
      this.movingTo = nodeCode;
    });
  }

  /** 移动结束：清按钮级 busy。 */
  private endMove(): void {
    runInAction(() => {
      this.moving = false;
      this.movingTo = null;
    });
  }

  /** 业务失败统一出口：只 toast（`error` 留给「数据没拉到」，不因一次跑图失败清空线路图）。 */
  private reportBusinessFailure(result: unknown): void {
    const code = businessCodeOf(result);
    const message = businessMessageOf(result) ?? businessErrorMessage(code);
    this.ctx.toast.fromBusinessCode(code, message);
  }
}
