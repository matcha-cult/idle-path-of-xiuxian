/**
 * `@idle-path/ionet-transport` 公共入口。
 *
 * 分层（依赖单向）：
 * - `transport/`：SocketAdapter 接口 + 浏览器实现（平台差异唯一收敛点）；
 * - `client/`：IonetClient 状态机 / 关联策略 / 错误模型；
 * - `api/`：typed API（REST + WS Action）+ DTO + 命令常量 + 错误码文案；
 * - `./testing`：FakeSocketAdapter + MemoryIonetServer（零后端开发/测试）。
 *
 * 协议层不在本包：信封类型 / codec / reqId 关联算法一律来自 `@nbb-ionet/client-protocol`
 * （PROTOCOL.md 唯一真相，见 ai-docs/frontend-solution-exploration/06 §3）。
 */

// ===== 协议层再导出（唯一真相仍是 @nbb-ionet/client-protocol；此处仅为消费便利）=====
export {
  classifyFrame,
  isNotificationFrame,
  envelopeCodec,
  EnvelopeCodec,
  createRequestMessage,
  createResponseMessage,
  createNotificationMessage,
  isSuccess,
  type ResponseKind,
  type FrameKind,
  type WireFrame,
  type EnvelopeMessage,
  type RequestMessage,
  type ResponseMessage,
  type NotificationMessage,
  type NotificationMessageInput,
  type DecodedEnvelope,
} from '@nbb-ionet/client-protocol';

// ===== transport =====
export type {
  SocketAdapter,
  SocketAdapterFactory,
  SocketCloseEvent,
  SocketReadyState,
  Unsubscribe,
} from './transport/socket-adapter.js';
export {
  BrowserSocketAdapter,
  resolveWebSocketCtor,
  type WebSocketCtor,
  type WebSocketLike,
} from './transport/browser-socket-adapter.js';

// ===== client =====
export {
  IonetClient,
  withToken,
  extractServerTime,
  type ConnectionState,
  type HeartbeatOptions,
  type ReconnectOptions,
  type SendOptions,
  type IonetClientOptions,
} from './client/ionet-client.js';
export {
  Correlation,
  defaultReqIdGenerator,
  type CorrelationStrategy,
} from './client/correlation.js';
export {
  assertResponseOk,
  businessCodeOf,
  businessMessageOf,
  isBusinessFailure,
  BusinessError,
  ConnectionError,
  HandshakeError,
  ProtocolError,
  RequestTimeoutError,
  TransportError,
  UNKNOWN_BUSINESS_CODE,
  type ActionFailBody,
  type ActionResult,
} from './client/errors.js';
export {
  BrowserLifecycleAdapter,
  NoopLifecycleAdapter,
  type LifecycleAdapter,
} from './client/lifecycle.js';

// ===== api：命令常量 =====
export {
  CMD_SEGMENTS,
  SYSTEM_CMD,
  ITEM_CMD,
  PROP_CMD,
  EQUIP_CMD,
  SKILL_CMD,
  ECONOMY_CMD,
  REALM_CMD,
  COMBAT_CMD,
  ZONE_CMD,
  QUEST_CMD,
  STORY_CMD,
  IDLE_CMD,
  MAP_CMD,
  PUBLIC_ACTION_KEYS,
  HEARTBEAT_ROUTE,
} from './api/commands.js';

// ===== api：错误码文案 =====
export {
  BUSINESS_ERROR_MESSAGES,
  DEFAULT_BUSINESS_ERROR_MESSAGE,
  TRANSPORT_ERROR_MESSAGES,
  businessErrorMessage,
  type ActionErrorCode,
} from './api/business-error-codes.js';

// ===== api：DTO 与枚举常量 =====
export * from './api/dto.js';

// ===== api：REST =====
export {
  AuthApi,
  CharacterApi,
  RestApi,
  RestClient,
  RestError,
  type FetchLike,
  type RestApiOptions,
} from './api/rest-api.js';

// ===== api：WS Action =====
export {
  GameApi,
  SystemApi,
  ItemApi,
  PropApi,
  EquipApi,
  SkillApi,
  EconomyApi,
  RealmApi,
  CombatApi,
  ZoneApi,
  QuestApi,
  StoryApi,
  IdleApi,
  MapApi,
  type GameApiTransport,
  type InventoryQuery,
  type BasesQuery,
  type PickupRuleCreateInput,
  type PickupRuleUpdateInput,
  type PickupRuleIdInput,
  type GenerateItemInput,
  type SkillPanelUpdateInput,
  type CurrencyGrantInput,
  type EssenceGrantInput,
  type CraftInput,
  type UnitsQuery,
  type SpawnUnitInput,
  type KillUnitInput,
  type IdleSettleInput,
} from './api/game-api.js';
