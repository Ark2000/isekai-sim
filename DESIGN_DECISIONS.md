# isekai-sim: 设计决策快速参考

## 核心设计原则总结

### ✅ 必须遵守的原则

1. **Tick 作为基本单位**
   - 所有模拟以离散 tick 进行
   - 支持时间压缩和多频率更新
   - 保证确定性和可回放性

2. **完全采用 ECS**
   - Entity = ID（无数据，无逻辑）
   - Component = 纯数据（无逻辑）
   - System = 纯逻辑（操作组件）
   - 禁止使用 OOP（类、继承、多态）

3. **数据驱动设计**
   - 静态数据：TOML/JSON
   - 动态行为：Lua 脚本
   - 核心逻辑：原生代码
   - 支持热重载

4. **Smart Object 设计**
   - 对象知道如何交互，而非 NPC 知道如何与对象交互
   - 使用 Lua 脚本定义交互行为
   - 支持多人使用和状态管理

5. **GOAP AI 系统**
   - 目标驱动的规划系统
   - 使用 A* 搜索生成计划
   - 支持计划缓存和增量规划

### ❌ 禁止的做法

1. **禁止使用 OOP**
   - ❌ 不要创建 NPC 类、Object 类
   - ❌ 不要使用继承
   - ❌ 不要使用虚函数/多态
   - ✅ 使用组件组合代替继承

2. **禁止硬编码逻辑**
   - ❌ 不要在代码中硬编码游戏规则
   - ❌ 不要在代码中硬编码 NPC 行为
   - ✅ 使用数据文件和 Lua 脚本

3. **禁止全局状态**
   - ❌ 不要使用全局变量
   - ❌ 不要使用单例模式
   - ✅ 通过 World 和 EventBus 管理状态

## 架构层次

```
Application Layer (渲染、输入、UI)
    ↓
World Layer (Tick、Event、State)
    ↓
ECS Core (Entity、Component、System)
    ↓
Game Systems (Physics、AI、Economy、Social)
    ↓
Data Layer (Lua、JSON/TOML、Assets)
```

## 数据流

```
Tick Start
    ├─→ System Scheduler
    │   ├─→ Physics System
    │   ├─→ AI System (GOAP)
    │   ├─→ Interaction System
    │   └─→ Other Systems
    │
    ├─→ Event Processing
    │   └─→ Event Handlers
    │
    └─→ State Update
        └─→ Component Storage Update
```

## 组件设计模式

### 基础组件
- `Position`: 位置
- `Velocity`: 速度
- `Name`: 名称

### NPC 组件
- `Needs`: 需求（马斯洛需求层次）
- `Personality`: 性格（Big Five）
- `Memory`: 记忆
- `RelationshipNetwork`: 关系网络
- `Goal`: GOAP 目标
- `Plan`: GOAP 计划

### Smart Object 组件
- `Interactable`: 可交互
- `Behavior`: 行为脚本
- `Capabilities`: 功能定义

## 系统设计模式

### 系统更新模式
```rust
impl System for MySystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 1. 查询实体
        let query = world.query::<(&ComponentA, &mut ComponentB)>();
        
        // 2. 处理实体
        for (entity, (a, b)) in query {
            // 处理逻辑
        }
        
        // 3. 发出事件（可选）
        world.event_bus.emit(MyEvent { ... });
    }
}
```

### 系统依赖
- 系统按依赖关系排序
- 无依赖的系统可以并行执行
- 使用依赖图管理执行顺序

## GOAP 设计模式

### 世界状态
```rust
WorldState = HashMap<String, WorldStateValue>
```

### 目标生成
- 基于需求层次理论
- 考虑性格因素
- 动态优先级

### 计划生成
- 使用 A* 搜索
- 支持计划缓存
- 支持增量规划

### 动作执行
- 检查前置条件
- 执行 Lua 脚本或原生逻辑
- 应用效果

## Smart Object 设计模式

### 对象定义
```toml
[object]
id = "chair_wooden"
interaction.script = "behaviors/interactions/chair.lua"
capabilities.provides = ["rest", "seating"]
```

### 交互流程
1. NPC 发现对象（ObjectDiscoverySystem）
2. NPC 请求交互（InteractionRequest 事件）
3. 执行 Lua 脚本（InteractionSystem）
4. 更新对象状态

## 数据驱动模式

### 静态数据（TOML）
```toml
[item]
id = "sword_iron"
properties.damage = 10
```

### 动态行为（Lua）
```lua
function on_interact(entity_id, object_id, world)
    -- 交互逻辑
    return true, "Success"
end
```

### 数据加载
- 启动时加载所有静态数据
- 按需加载 Lua 脚本
- 支持热重载

## 性能优化原则

1. **组件存储**
   - 使用 SoA（Structure of Arrays）
   - 使用稀疏集快速查找
   - 批量处理组件

2. **系统执行**
   - 并行执行无依赖系统
   - 多频率更新（不重要系统降低频率）
   - 按需更新（只更新活跃区域）

3. **空间查询**
   - 使用空间索引（四叉树/R树）
   - 区域划分
   - 距离裁剪

4. **GOAP 优化**
   - 计划缓存
   - 限制搜索深度
   - 启发式剪枝

5. **Lua 优化**
   - 使用 LuaJIT
   - 减少 Lua-Rust 数据传递
   - 批量处理 Lua 调用

## 调试工具

1. **实体检查器**
   - 查看实体组件
   - 查看 GOAP 计划
   - 查看关系网络

2. **世界状态可视化**
   - 实体位置
   - 关系连线
   - 路径显示

3. **性能分析器**
   - 系统耗时
   - 帧时间
   - 内存使用

## 测试策略

1. **单元测试**
   - 组件存储
   - GOAP Planner
   - 系统逻辑

2. **集成测试**
   - NPC 行为流程
   - 交互系统
   - 事件系统

3. **性能测试**
   - 组件迭代
   - 系统更新
   - 空间查询

## 技术栈推荐

### Rust（推荐）
- ECS: Bevy 或自建
- Lua: mlua
- 序列化: serde
- 数学: glam
- 并发: rayon

### Go（备选）
- ECS: 自建
- Lua: gopher-lua
- 序列化: encoding/json, toml
- 并发: goroutines

## 实现优先级

### Phase 1: 核心（必须）
1. ECS 核心
2. Tick 系统
3. 事件系统
4. 数据加载器

### Phase 2: 基础（必须）
1. 物理系统
2. 基础组件
3. 简单 NPC

### Phase 3: AI（核心功能）
1. GOAP Planner
2. 目标生成
3. 动作执行

### Phase 4: 交互（核心功能）
1. Smart Object
2. 交互系统
3. 对象发现

### Phase 5: 高级（扩展）
1. 需求系统
2. 关系网络
3. 记忆系统
4. 分层模拟

## 关键设计决策对比

| 决策 | 传统方法 | 我们的方法 | 理由 |
|------|---------|-----------|------|
| 架构 | OOP | ECS | 性能、可扩展性、数据驱动 |
| 时间 | 连续 | 离散 Tick | 确定性、时间压缩 |
| AI | 状态机/行为树 | GOAP | 灵活性、可预测性 |
| 对象交互 | NPC 知道如何交互 | 对象知道如何交互 | 可扩展性、数据驱动 |
| 数据 | 硬编码 | 外部文件 + Lua | 可配置性、内容创作 |
| 模拟 | 全量模拟 | 分层模拟 | 性能、可扩展性 |

## 常见陷阱

1. **在组件中添加逻辑**
   - ❌ `struct Position { fn move(...) }`
   - ✅ `struct Position { x, y, z }` + `PhysicsSystem`

2. **在系统中存储状态**
   - ❌ `struct MySystem { cache: HashMap }`
   - ✅ 使用组件存储状态

3. **直接修改其他系统的组件**
   - ❌ 在 SystemA 中直接修改 SystemB 的组件
   - ✅ 通过事件系统通信

4. **硬编码游戏规则**
   - ❌ `if needs.hunger > 0.8 { eat() }`
   - ✅ 在 Lua 脚本或数据文件中定义

5. **忽略性能影响**
   - ❌ 每个 tick 重新规划所有 NPC
   - ✅ 使用计划缓存，按需规划

## 检查清单

在实现新功能前，检查：

- [ ] 是否使用 ECS（组件 + 系统）？
- [ ] 是否避免使用 OOP？
- [ ] 是否使用数据驱动（数据文件 + Lua）？
- [ ] 是否在正确的 tick 频率更新？
- [ ] 是否通过事件系统通信？
- [ ] 是否考虑了性能影响？
- [ ] 是否添加了调试支持？
- [ ] 是否编写了测试？

---

*这份文档是快速参考，详细内容请参考 TECHNICAL_ARCHITECTURE.md 和 IMPLEMENTATION_GUIDE.md*
