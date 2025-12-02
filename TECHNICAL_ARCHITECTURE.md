# isekai-sim: 技术架构文档

## 目录

1. [核心设计原则](#核心设计原则)
2. [系统架构概览](#系统架构概览)
3. [ECS 系统设计](#ecs-系统设计)
4. [Tick 系统](#tick-系统)
5. [数据驱动架构](#数据驱动架构)
6. [Smart Object 系统](#smart-object-系统)
7. [GOAP AI 系统](#goap-ai-系统)
8. [分层模拟系统](#分层模拟系统)
9. [事件系统](#事件系统)
10. [性能优化策略](#性能优化策略)
11. [技术栈选择](#技术栈选择)
12. [实现路线图](#实现路线图)

---

## 核心设计原则

### 1. 完全采用 ECS（Entity Component System）

**原则**：禁止使用 OOP，所有游戏逻辑通过 ECS 实现。

**理由**：
- **数据驱动**：组件是纯数据，系统是纯逻辑，完全分离
- **性能优化**：结构数组（SoA）提供优秀的缓存局部性
- **组合优于继承**：通过组合组件创建复杂行为，而非继承
- **关系导向**：实体是关系的节点，而非独立对象
- **可扩展性**：新功能通过添加组件和系统实现，无需修改现有代码

### 2. Tick 作为基本单位

**原则**：所有模拟以离散的 tick 为单位进行。

**理由**：
- **确定性**：相同输入产生相同输出，便于调试和回放
- **时间压缩**：可以跳过不重要的 tick，加速模拟
- **事件同步**：所有事件在 tick 边界同步，保证一致性
- **多尺度处理**：不同系统可以在不同的 tick 频率运行

### 3. 数据驱动设计

**原则**：游戏逻辑与数据完全分离，使用外部数据文件定义行为。

**理由**：
- **可配置性**：无需重新编译即可修改游戏规则
- **可扩展性**：通过添加数据文件扩展内容
- **可测试性**：可以轻松创建测试场景
- **内容创作**：非程序员可以参与内容创作

### 4. 禁止 OOP

**原则**：不使用类、继承、多态等 OOP 特性。

**理由**：
- **关系导向**：实体是关系的产物，而非独立对象
- **性能**：避免虚函数调用、对象分配等开销
- **组合优于继承**：ECS 通过组合实现复杂行为
- **数据与逻辑分离**：组件是数据，系统是逻辑

---

## 系统架构概览

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  (Game Loop, Rendering, Input, UI)                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    World Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Tick Manager │  │ Event Bus    │  │ World State  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    ECS Core                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Entity       │  │ Component    │  │ System       │  │
│  │ Registry     │  │ Storage      │  │ Scheduler    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Game Systems                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Physics      │  │ AI (GOAP)    │  │ Economy      │  │
│  │ Interaction  │  │ Social       │  │ Culture      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Data Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Lua Runtime  │  │ Data Loader  │  │ Asset Cache  │  │
│  │ (Behaviors)  │  │ (JSON/TOML)  │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
Tick Start
    │
    ├─→ System Scheduler
    │       │
    │       ├─→ Physics System
    │       ├─→ AI System (GOAP)
    │       ├─→ Interaction System
    │       ├─→ Economy System
    │       └─→ Social System
    │
    ├─→ Event Processing
    │       │
    │       └─→ Event Handlers
    │
    └─→ State Update
            │
            └─→ Component Storage Update
```

---

## ECS 系统设计

### Entity（实体）

**定义**：实体是一个唯一的 ID，不包含任何数据或逻辑。

```rust
// 伪代码示例
type EntityId = u64;

struct Entity {
    id: EntityId,
    generation: u32,  // 用于检测实体是否仍然有效
}
```

**设计要点**：
- 实体只是标识符，不包含任何数据
- 使用世代号（generation）检测实体是否有效
- 实体可以快速创建和销毁

### Component（组件）

**定义**：组件是纯数据结构，不包含任何逻辑。

**核心组件类型**：

#### 1. 基础组件

```rust
// 位置组件
struct Position {
    x: f32,
    y: f32,
    z: f32,
}

// 速度组件
struct Velocity {
    vx: f32,
    vy: f32,
    vz: f32,
}

// 名称组件
struct Name {
    name: String,
}
```

#### 2. NPC 相关组件

```rust
// 需求组件（基于马斯洛需求层次）
struct Needs {
    physiological: f32,  // 生理需求（饥饿、口渴、睡眠）
    safety: f32,         // 安全需求
    belonging: f32,      // 归属需求
    esteem: f32,         // 尊重需求
    self_actualization: f32,  // 自我实现
}

// 性格组件（Big Five）
struct Personality {
    openness: f32,           // 开放性
    conscientiousness: f32,  // 尽责性
    extraversion: f32,       // 外向性
    agreeableness: f32,      // 宜人性
    neuroticism: f32,        // 神经质
}

// 记忆组件
struct Memory {
    episodic: Vec<EpisodicMemory>,  // 情景记忆
    semantic: Vec<SemanticMemory>,   // 语义记忆
    procedural: Vec<ProceduralMemory>, // 程序记忆
}

// 关系网络组件
struct RelationshipNetwork {
    relationships: HashMap<EntityId, Relationship>,  // 与其他实体的关系
}
```

#### 3. Smart Object 组件

```rust
// 可交互组件
struct Interactable {
    object_type: String,           // 对象类型（如"chair", "bed"）
    interaction_script: String,    // Lua 脚本路径
    current_user: Option<EntityId>, // 当前使用者
    state: InteractionState,       // 当前状态
}

// 行为组件（Lua 脚本）
struct Behavior {
    script_path: String,           // Lua 脚本路径
    state: LuaValue,               // 脚本状态
}

// 功能组件（对象能做什么）
struct Capabilities {
    provides: Vec<String>,         // 提供的功能（如"rest", "storage"）
    requires: Vec<String>,         // 需要的条件（如"seated", "empty"）
}
```

#### 4. GOAP 相关组件

```rust
// GOAP 目标组件
struct Goal {
    name: String,                  // 目标名称
    priority: f32,                 // 优先级
    conditions: WorldState,        // 目标条件
}

// GOAP 动作组件
struct Action {
    name: String,                  // 动作名称
    preconditions: WorldState,     // 前置条件
    effects: WorldState,           // 效果
    cost: f32,                     // 成本
    script_path: String,           // Lua 脚本路径（可选）
}

// GOAP 计划组件
struct Plan {
    actions: Vec<Action>,          // 动作序列
    current_action_index: usize,   // 当前执行的动作
    state: PlanState,              // 计划状态
}
```

### System（系统）

**定义**：系统是纯逻辑，操作匹配特定组件组合的实体。

**系统设计模式**：

```rust
// 系统 trait
trait System {
    fn update(&mut self, world: &mut World, delta_time: f32);
    fn name(&self) -> &str;
}

// 示例：物理系统
struct PhysicsSystem;

impl System for PhysicsSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 查询所有有 Position 和 Velocity 的实体
        let query = world.query::<(&mut Position, &Velocity)>();
        
        for (entity, (pos, vel)) in query {
            // 更新位置
            pos.x += vel.vx * delta_time;
            pos.y += vel.vy * delta_time;
            pos.z += vel.vz * delta_time;
        }
    }
}
```

**核心系统列表**：

1. **PhysicsSystem**：处理物理移动和碰撞
2. **AISystem**：处理 GOAP 规划和执行
3. **InteractionSystem**：处理 Smart Object 交互
4. **NeedsSystem**：更新 NPC 需求
5. **SocialSystem**：处理关系网络更新
6. **EconomySystem**：处理经济交易
7. **MemorySystem**：处理记忆的存储和遗忘
8. **CultureSystem**：处理文化传播和演化

### Component Storage（组件存储）

**设计**：使用结构数组（SoA - Structure of Arrays）存储组件。

```rust
// 组件存储
struct ComponentStorage<T> {
    entities: Vec<EntityId>,      // 实体 ID 数组
    components: Vec<T>,            // 组件数据数组
    entity_to_index: HashMap<EntityId, usize>,  // 快速查找
}

// 优点：
// 1. 缓存友好：相同类型的数据连续存储
// 2. 批量处理：可以高效地批量处理组件
// 3. 并行化：容易并行处理
```

---

## Tick 系统

### Tick 定义

**Tick**：模拟的基本时间单位，所有系统在一个 tick 内完成一次更新。

```rust
struct Tick {
    number: u64,           // Tick 编号
    delta_time: f32,       // 从上一个 tick 到当前 tick 的时间（秒）
    timestamp: u64,        // 时间戳
}
```

### Tick 调度

```rust
struct TickManager {
    current_tick: u64,
    tick_rate: f32,        // 每秒 tick 数
    accumulated_time: f32,
    systems: Vec<Box<dyn System>>,
    event_bus: EventBus,
}

impl TickManager {
    fn update(&mut self, delta_time: f32) {
        self.accumulated_time += delta_time;
        let tick_duration = 1.0 / self.tick_rate;
        
        while self.accumulated_time >= tick_duration {
            self.process_tick(tick_duration);
            self.accumulated_time -= tick_duration;
        }
    }
    
    fn process_tick(&mut self, delta_time: f32) {
        let tick = Tick {
            number: self.current_tick,
            delta_time,
            timestamp: /* ... */,
        };
        
        // 1. 系统更新
        for system in &mut self.systems {
            system.update(&mut self.world, delta_time);
        }
        
        // 2. 事件处理
        self.event_bus.process_events();
        
        // 3. 状态同步
        self.world.sync_state();
        
        self.current_tick += 1;
    }
}
```

### 多频率 Tick

不同系统可以在不同的 tick 频率运行：

```rust
struct MultiFrequencyTickManager {
    high_frequency_systems: Vec<(Box<dyn System>, u32)>,  // (系统, 每 N tick 运行一次)
    low_frequency_systems: Vec<(Box<dyn System>, u32)>,
}

// 示例：
// - PhysicsSystem: 每 1 tick 运行（60 tick/s）
// - AISystem: 每 2 tick 运行（30 tick/s）
// - EconomySystem: 每 10 tick 运行（6 tick/s）
// - CultureSystem: 每 100 tick 运行（0.6 tick/s）
```

### 时间压缩

```rust
struct TimeCompression {
    enabled: bool,
    compression_factor: f32,  // 压缩倍数（如 10.0 表示 10 倍速）
    skip_threshold: f32,      // 跳过 tick 的阈值
}

impl TimeCompression {
    fn process_ticks(&mut self, num_ticks: u64) {
        // 跳过不重要的 tick，只处理关键事件
        for _ in 0..num_ticks {
            if self.should_process_tick() {
                self.process_tick();
            } else {
                self.skip_tick();
            }
        }
    }
}
```

---

## 数据驱动架构

### 数据层次

```
Data/
├── static/              # 静态数据（JSON/TOML）
│   ├── items/          # 物品定义
│   ├── objects/        # Smart Object 定义
│   ├── npcs/           # NPC 模板
│   ├── locations/      # 地点定义
│   └── rules/          # 游戏规则
│
├── behaviors/          # 行为脚本（Lua）
│   ├── interactions/   # 交互行为
│   ├── ai/            # AI 行为
│   └── objects/       # 对象行为
│
└── config/            # 配置文件（TOML）
    ├── world.toml     # 世界配置
    ├── economy.toml   # 经济配置
    └── ai.toml        # AI 配置
```

### 静态数据格式（TOML/JSON）

#### 物品定义

```toml
# items/sword.toml
[item]
id = "sword_iron"
name = "Iron Sword"
type = "weapon"

[item.properties]
damage = 10
durability = 100
weight = 2.5

[item.requirements]
crafting_skill = 30
materials = ["iron_ingot", "wood"]
```

#### Smart Object 定义

```toml
# objects/chair.toml
[object]
id = "chair_wooden"
name = "Wooden Chair"
type = "furniture"

[object.interaction]
script = "behaviors/interactions/chair.lua"
provides = ["rest", "seating"]
requires = ["empty"]

[object.properties]
comfort = 5
capacity = 1
```

### 动态行为脚本（Lua）

#### 交互行为示例

```lua
-- behaviors/interactions/chair.lua
local ChairInteraction = {}

function ChairInteraction.on_interact(entity_id, object_id, world)
    -- 检查椅子是否被占用
    local chair = world:get_component(object_id, "Interactable")
    if chair.current_user then
        return false, "Chair is occupied"
    end
    
    -- 设置使用者
    chair.current_user = entity_id
    
    -- 更新实体位置
    local pos = world:get_component(entity_id, "Position")
    local chair_pos = world:get_component(object_id, "Position")
    pos.x = chair_pos.x
    pos.y = chair_pos.y
    pos.z = chair_pos.z
    
    -- 更新需求（休息）
    local needs = world:get_component(entity_id, "Needs")
    needs.physiological = math.min(needs.physiological + 0.1, 1.0)
    
    return true, "Sitting on chair"
end

function ChairInteraction.on_stop_interact(entity_id, object_id, world)
    local chair = world:get_component(object_id, "Interactable")
    if chair.current_user == entity_id then
        chair.current_user = nil
    end
end

return ChairInteraction
```

#### GOAP 动作定义

```lua
-- behaviors/ai/actions/eat.lua
local EatAction = {}

EatAction.name = "Eat"
EatAction.cost = 1.0

function EatAction.preconditions(world_state)
    return {
        has_food = true,
        hungry = true,
    }
end

function EatAction.effects(world_state)
    return {
        has_food = false,
        hungry = false,
        satiety = true,
    }
end

function EatAction.execute(entity_id, world)
    -- 查找食物
    local inventory = world:get_component(entity_id, "Inventory")
    local food = inventory:find_item("food")
    
    if not food then
        return false, "No food available"
    end
    
    -- 消耗食物
    inventory:remove_item(food)
    
    -- 更新需求
    local needs = world:get_component(entity_id, "Needs")
    needs.physiological = math.min(needs.physiological + 0.3, 1.0)
    
    return true, "Ate food"
end

return EatAction
```

### 数据加载器

```rust
struct DataLoader {
    lua_runtime: Lua,
    static_data_cache: HashMap<String, Value>,
}

impl DataLoader {
    fn load_item(&mut self, path: &str) -> Result<Item> {
        // 加载 TOML 文件
        let content = std::fs::read_to_string(path)?;
        let item: Item = toml::from_str(&content)?;
        Ok(item)
    }
    
    fn load_behavior_script(&mut self, path: &str) -> Result<LuaFunction> {
        // 加载 Lua 脚本
        let content = std::fs::read_to_string(path)?;
        let func = self.lua_runtime.load(&content).eval()?;
        Ok(func)
    }
}
```

---

## Smart Object 系统

### 设计理念

Smart Object 是模拟人生风格的对象系统，对象知道如何与 NPC 交互，而不是 NPC 知道如何与对象交互。

### 组件设计

```rust
// 可交互对象组件
struct Interactable {
    object_type: String,
    interaction_script: String,      // Lua 脚本路径
    current_users: Vec<EntityId>,    // 当前使用者（支持多人）
    state: InteractionState,
    capabilities: Capabilities,
}

// 交互状态
enum InteractionState {
    Idle,
    InUse { user: EntityId },
    Broken,
    Locked,
}

// 功能定义
struct Capabilities {
    provides: Vec<String>,    // 提供的功能
    requires: Vec<String>,    // 需要的条件
    duration: Option<f32>,    // 交互持续时间
}
```

### 交互系统

```rust
struct InteractionSystem;

impl System for InteractionSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 1. 处理交互请求
        let interaction_events = world.event_bus.get_events::<InteractionRequest>();
        for event in interaction_events {
            self.handle_interaction_request(world, event);
        }
        
        // 2. 更新进行中的交互
        let query = world.query::<(&mut Interactable, &mut Behavior)>();
        for (entity, (interactable, behavior)) in query {
            if let InteractionState::InUse { .. } = interactable.state {
                self.update_interaction(world, entity, interactable, behavior, delta_time);
            }
        }
    }
    
    fn handle_interaction_request(
        &mut self,
        world: &mut World,
        event: InteractionRequest,
    ) {
        let interactable = world.get_component::<Interactable>(event.object_id)?;
        let script = world.data_loader.load_behavior_script(&interactable.interaction_script)?;
        
        // 调用 Lua 脚本
        let result = script.call::<_, (bool, String)>((event.entity_id, event.object_id))?;
        
        if result.0 {
            // 交互成功，更新状态
            interactable.state = InteractionState::InUse { user: event.entity_id };
        }
    }
}
```

### 对象发现系统

NPC 需要能够发现和选择可用的 Smart Object：

```rust
struct ObjectDiscoverySystem;

impl System for ObjectDiscoverySystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 查询所有需要交互的 NPC
        let query = world.query::<(&Position, &Needs, &mut Goal)>();
        
        for (entity, (pos, needs, goal)) in query {
            // 根据需求查找合适的对象
            let required_capability = self.needs_to_capability(needs);
            let nearby_objects = self.find_nearby_objects(world, pos, required_capability);
            
            if let Some(object) = nearby_objects.first() {
                // 创建交互目标
                goal.target = Some(*object);
            }
        }
    }
    
    fn find_nearby_objects(
        &self,
        world: &World,
        position: &Position,
        capability: &str,
    ) -> Vec<EntityId> {
        let mut objects = Vec::new();
        let query = world.query::<(&Position, &Interactable)>();
        
        for (entity, (obj_pos, interactable)) in query {
            // 检查距离
            let distance = self.distance(position, obj_pos);
            if distance > 10.0 {
                continue;
            }
            
            // 检查功能
            if interactable.capabilities.provides.contains(&capability.to_string()) {
                // 检查可用性
                if matches!(interactable.state, InteractionState::Idle) {
                    objects.push(entity);
                }
            }
        }
        
        // 按距离排序
        objects.sort_by_key(|&id| {
            let obj_pos = world.get_component::<Position>(id).unwrap();
            (self.distance(position, obj_pos) * 100.0) as u32
        });
        
        objects
    }
}
```

---

## GOAP AI 系统

### GOAP 概述

GOAP (Goal-Oriented Action Planning) 是一种基于目标的 AI 规划系统，NPC 通过规划一系列动作来实现目标。

### 核心概念

1. **World State（世界状态）**：描述当前世界的状态
2. **Goal（目标）**：NPC 想要达到的状态
3. **Action（动作）**：可以改变世界状态的操作
4. **Plan（计划）**：实现目标的动作序列

### 组件设计

```rust
// 世界状态
type WorldState = HashMap<String, Value>;

// GOAP 目标组件
struct Goal {
    name: String,
    priority: f32,
    target_state: WorldState,
    current_state: WorldState,
}

// GOAP 动作组件
struct Action {
    name: String,
    preconditions: WorldState,
    effects: WorldState,
    cost: f32,
    script_path: Option<String>,  // Lua 脚本路径
}

// GOAP 计划组件
struct Plan {
    actions: Vec<Action>,
    current_action_index: usize,
    state: PlanState,
}

enum PlanState {
    Planning,
    Executing,
    Completed,
    Failed,
}
```

### GOAP Planner 系统

```rust
struct GOAPPlannerSystem {
    available_actions: Vec<Action>,
}

impl System for GOAPPlannerSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        let query = world.query::<(&Goal, &mut Plan, &Needs)>();
        
        for (entity, (goal, plan, needs)) in query {
            match plan.state {
                PlanState::Planning => {
                    // 规划新计划
                    if let Some(new_plan) = self.plan(world, entity, goal) {
                        *plan = new_plan;
                        plan.state = PlanState::Executing;
                    }
                }
                PlanState::Executing => {
                    // 执行当前动作
                    self.execute_action(world, entity, plan);
                }
                PlanState::Completed | PlanState::Failed => {
                    // 计划完成或失败，重新规划
                    plan.state = PlanState::Planning;
                }
            }
        }
    }
    
    fn plan(&self, world: &World, entity: EntityId, goal: &Goal) -> Option<Plan> {
        // A* 搜索算法寻找最优计划
        let current_state = self.get_world_state(world, entity);
        let target_state = &goal.target_state;
        
        // 使用 A* 搜索
        let path = self.a_star_search(current_state, target_state, &self.available_actions)?;
        
        Some(Plan {
            actions: path,
            current_action_index: 0,
            state: PlanState::Executing,
        })
    }
    
    fn a_star_search(
        &self,
        start: WorldState,
        goal: WorldState,
        actions: &[Action],
    ) -> Option<Vec<Action>> {
        // A* 搜索实现
        // 使用优先队列，按 f(n) = g(n) + h(n) 排序
        // g(n): 从起点到当前节点的成本
        // h(n): 从当前节点到目标的启发式估计
        
        let mut open_set = BinaryHeap::new();
        let mut came_from = HashMap::new();
        let mut g_score = HashMap::new();
        let mut f_score = HashMap::new();
        
        g_score.insert(start.clone(), 0.0);
        f_score.insert(start.clone(), self.heuristic(&start, &goal));
        open_set.push(SearchNode {
            state: start.clone(),
            f_score: f_score[&start],
        });
        
        while let Some(current) = open_set.pop() {
            if self.state_matches(&current.state, &goal) {
                // 重建路径
                return Some(self.reconstruct_path(came_from, current.state));
            }
            
            // 尝试所有可能的动作
            for action in actions {
                if self.preconditions_met(&current.state, action) {
                    let new_state = self.apply_effects(&current.state, action);
                    let tentative_g = g_score[&current.state] + action.cost;
                    
                    if tentative_g < *g_score.get(&new_state).unwrap_or(&f32::INFINITY) {
                        came_from.insert(new_state.clone(), (current.state.clone(), action.clone()));
                        g_score.insert(new_state.clone(), tentative_g);
                        f_score.insert(new_state.clone(), tentative_g + self.heuristic(&new_state, &goal));
                        open_set.push(SearchNode {
                            state: new_state,
                            f_score: f_score[&new_state],
                        });
                    }
                }
            }
        }
        
        None
    }
}
```

### 目标生成系统

```rust
struct GoalGenerationSystem;

impl System for GoalGenerationSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        let query = world.query::<(&Needs, &Personality, &mut Goal)>();
        
        for (entity, (needs, personality, goal)) in query {
            // 根据需求和性格生成目标
            let new_goal = self.generate_goal(needs, personality);
            
            // 如果新目标优先级更高，替换当前目标
            if new_goal.priority > goal.priority {
                *goal = new_goal;
            }
        }
    }
    
    fn generate_goal(&self, needs: &Needs, personality: &Personality) -> Goal {
        // 根据需求层次理论生成目标
        let mut goals = Vec::new();
        
        // 生理需求
        if needs.physiological < 0.3 {
            goals.push(Goal {
                name: "Satisfy Hunger".to_string(),
                priority: 1.0 - needs.physiological,
                target_state: hashmap! {
                    "hungry".to_string() => Value::Bool(false),
                    "has_food".to_string() => Value::Bool(true),
                },
                current_state: hashmap! {},
            });
        }
        
        // 归属需求
        if needs.belonging < 0.5 && personality.extraversion > 0.6 {
            goals.push(Goal {
                name: "Socialize".to_string(),
                priority: (1.0 - needs.belonging) * personality.extraversion,
                target_state: hashmap! {
                    "socialized".to_string() => Value::Bool(true),
                },
                current_state: hashmap! {},
            });
        }
        
        // 选择优先级最高的目标
        goals.into_iter()
            .max_by(|a, b| a.priority.partial_cmp(&b.priority).unwrap())
            .unwrap_or_else(|| Goal {
                name: "Idle".to_string(),
                priority: 0.0,
                target_state: hashmap! {},
                current_state: hashmap! {},
            })
    }
}
```

### 动作执行系统

```rust
struct ActionExecutionSystem;

impl System for ActionExecutionSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        let query = world.query::<(&mut Plan, &Position)>();
        
        for (entity, (plan, pos)) in query {
            if plan.state != PlanState::Executing {
                continue;
            }
            
            if plan.current_action_index >= plan.actions.len() {
                plan.state = PlanState::Completed;
                continue;
            }
            
            let action = &plan.actions[plan.current_action_index];
            
            // 检查前置条件
            if !self.preconditions_met(world, entity, action) {
                // 前置条件不满足，重新规划
                plan.state = PlanState::Failed;
                continue;
            }
            
            // 执行动作
            if self.execute_action(world, entity, action) {
                // 动作完成，应用效果
                self.apply_effects(world, entity, action);
                plan.current_action_index += 1;
            }
        }
    }
    
    fn execute_action(&self, world: &mut World, entity: EntityId, action: &Action) -> bool {
        if let Some(ref script_path) = action.script_path {
            // 执行 Lua 脚本
            let script = world.data_loader.load_behavior_script(script_path)?;
            let (success, message) = script.call::<_, (bool, String)>((entity,))?;
            return success;
        }
        
        // 默认动作执行逻辑
        match action.name.as_str() {
            "MoveTo" => self.execute_move_to(world, entity, action),
            "PickUp" => self.execute_pick_up(world, entity, action),
            _ => false,
        }
    }
}
```

---

## 分层模拟系统

### 设计理念

借鉴量子退相干理论，不同区域使用不同详细程度的模拟。

### 分层定义

```rust
enum SimulationLevel {
    Full,      // Level 1: 完整模拟（玩家附近）
    Simplified, // Level 2: 简化模拟（同一区域）
    Statistical, // Level 3: 统计模拟（其他区域）
}

struct SimulationLayer {
    level: SimulationLevel,
    region: Region,
    entities: Vec<EntityId>,
}
```

### 分层策略

```rust
struct LayeredSimulationSystem {
    player_position: Position,
    layers: Vec<SimulationLayer>,
}

impl LayeredSimulationSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 根据距离玩家位置更新模拟层
        for layer in &mut self.layers {
            let distance = self.distance_to_player(&layer.region);
            
            match distance {
                d if d < 100.0 => {
                    // Level 1: 完整模拟
                    layer.level = SimulationLevel::Full;
                    self.update_full_simulation(world, &layer.entities);
                }
                d if d < 1000.0 => {
                    // Level 2: 简化模拟
                    layer.level = SimulationLevel::Simplified;
                    self.update_simplified_simulation(world, &layer.entities);
                }
                _ => {
                    // Level 3: 统计模拟
                    layer.level = SimulationLevel::Statistical;
                    self.update_statistical_simulation(world, &layer.entities);
                }
            }
        }
    }
    
    fn update_full_simulation(&self, world: &mut World, entities: &[EntityId]) {
        // 完整 AI、物理、交互
        for &entity in entities {
            // 运行所有系统
        }
    }
    
    fn update_simplified_simulation(&self, world: &mut World, entities: &[EntityId]) {
        // 简化 AI、关键物理、重要交互
        for &entity in entities {
            // 运行关键系统
        }
    }
    
    fn update_statistical_simulation(&self, world: &mut World, entities: &[EntityId]) {
        // 概率事件、统计数据
        // 不模拟个体，而是模拟群体
    }
}
```

### 状态转换

当实体在不同层之间移动时，需要平滑转换：

```rust
struct LayerTransitionSystem;

impl System for LayerTransitionSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 检测需要转换的实体
        let transitions = self.detect_transitions(world);
        
        for transition in transitions {
            match transition {
                Transition::ToFull(entity) => {
                    // 从统计/简化转换到完整
                    self.promote_to_full(world, entity);
                }
                Transition::ToSimplified(entity) => {
                    // 从完整转换到简化
                    self.demote_to_simplified(world, entity);
                }
                Transition::ToStatistical(entity) => {
                    // 从简化转换到统计
                    self.demote_to_statistical(world, entity);
                }
            }
        }
    }
    
    fn promote_to_full(&self, world: &mut World, entity: EntityId) {
        // 重建完整状态
        // 使用历史数据或统计推断
        if let Some(statistical_data) = world.get_statistical_data(entity) {
            self.reconstruct_from_statistics(world, entity, statistical_data);
        }
    }
}
```

---

## 事件系统

### 事件总线

```rust
type EventId = u64;

trait Event: Send + Sync {
    fn event_type(&self) -> &str;
}

struct EventBus {
    events: Vec<Box<dyn Event>>,
    handlers: HashMap<String, Vec<Box<dyn EventHandler>>>,
}

impl EventBus {
    fn emit(&mut self, event: Box<dyn Event>) {
        self.events.push(event);
    }
    
    fn process_events(&mut self) {
        while let Some(event) = self.events.pop() {
            if let Some(handlers) = self.handlers.get(event.event_type()) {
                for handler in handlers {
                    handler.handle(&*event);
                }
            }
        }
    }
}
```

### 核心事件类型

```rust
// 交互事件
struct InteractionRequest {
    entity_id: EntityId,
    object_id: EntityId,
    interaction_type: String,
}

// 社交事件
struct SocialInteraction {
    entity_a: EntityId,
    entity_b: EntityId,
    interaction_type: String,
    outcome: SocialOutcome,
}

// 经济事件
struct TradeEvent {
    buyer: EntityId,
    seller: EntityId,
    item: String,
    price: f32,
}

// 状态变化事件
struct StateChangeEvent {
    entity_id: EntityId,
    component_type: String,
    old_value: Value,
    new_value: Value,
}
```

---

## 性能优化策略

### 1. 组件存储优化

- **结构数组（SoA）**：相同类型组件连续存储，提高缓存命中率
- **稀疏集（Sparse Set）**：快速查找和迭代
- **批量处理**：一次处理多个组件

### 2. 系统调度优化

- **依赖图**：系统按依赖关系排序
- **并行执行**：无依赖的系统并行运行
- **多频率更新**：不重要系统降低更新频率

### 3. 空间查询优化

- **空间索引**：四叉树或 R 树加速空间查询
- **区域划分**：将世界划分为区域，只查询相关区域

### 4. GOAP 优化

- **计划缓存**：缓存相似情况的计划
- **增量规划**：只重新规划失败的部分
- **动作共享**：多个 NPC 共享相同的动作定义

### 5. Lua 性能优化

- **JIT 编译**：使用 LuaJIT
- **关键路径原生化**：性能关键逻辑用原生代码实现
- **脚本缓存**：缓存编译后的 Lua 脚本

---

## 技术栈选择

### 推荐技术栈

#### 选项 1：Rust（推荐）

**优点**：
- 内存安全，无 GC 开销
- 优秀的性能
- 强大的并发支持
- 丰富的 ECS 库（Bevy, Legion, Shipyard）

**库选择**：
- **ECS**：Bevy 或自建
- **Lua 绑定**：mlua
- **序列化**：serde (JSON/TOML)
- **数学库**：glam 或 nalgebra
- **并发**：tokio 或 rayon

#### 选项 2：Go

**优点**：
- 简洁的语法
- 优秀的并发（goroutines）
- 快速编译
- 良好的工具链

**库选择**：
- **ECS**：自建（Go 没有成熟的 ECS 库）
- **Lua 绑定**：gopher-lua
- **序列化**：encoding/json, toml
- **并发**：原生 goroutines

### 数据格式

- **配置**：TOML（人类可读，支持注释）
- **数据**：JSON（广泛支持，易于解析）
- **行为**：Lua（灵活，易于扩展）

---

## 实现路线图

### Phase 1: 核心基础设施（2-3 个月）

- [ ] ECS 核心实现
- [ ] Tick 系统
- [ ] 事件系统
- [ ] 数据加载器
- [ ] Lua 集成

### Phase 2: 基础系统（2-3 个月）

- [ ] 物理系统
- [ ] 基础组件（Position, Velocity, Name）
- [ ] 简单的 NPC 系统
- [ ] 基础渲染（调试视图）

### Phase 3: Smart Object 系统（1-2 个月）

- [ ] Interactable 组件
- [ ] 交互系统
- [ ] 对象发现系统
- [ ] 基础交互行为（Lua）

### Phase 4: GOAP AI 系统（2-3 个月）

- [ ] GOAP Planner
- [ ] 目标生成系统
- [ ] 动作执行系统
- [ ] 基础动作库

### Phase 5: 高级系统（3-4 个月）

- [ ] 需求系统
- [ ] 关系网络系统
- [ ] 记忆系统
- [ ] 社交系统

### Phase 6: 分层模拟（2-3 个月）

- [ ] 分层系统
- [ ] 状态转换
- [ ] 统计模拟

### Phase 7: 经济和文化系统（3-4 个月）

- [ ] 经济系统
- [ ] 交易系统
- [ ] 文化系统
- [ ] 聚落系统

---

## 总结

这个技术架构文档定义了 isekai-sim 的核心技术设计：

1. **完全 ECS**：所有逻辑通过组件和系统实现
2. **Tick 基础**：离散时间模拟
3. **数据驱动**：Lua 脚本 + 静态数据文件
4. **Smart Object**：对象知道如何交互
5. **GOAP AI**：目标驱动的 NPC 行为
6. **分层模拟**：多尺度性能优化

这个架构支持项目的核心愿景：创造一个真正自主、涌现式的世界。
