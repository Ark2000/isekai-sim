# isekai-sim: 实现指南

## 目录

1. [ECS 实现细节](#ecs-实现细节)
2. [数据驱动实现](#数据驱动实现)
3. [GOAP 实现细节](#goap-实现细节)
4. [性能优化实践](#性能优化实践)
5. [调试工具设计](#调试工具设计)
6. [测试策略](#测试策略)
7. [常见问题与解决方案](#常见问题与解决方案)

---

## ECS 实现细节

### 组件注册系统

```rust
// 组件注册表
struct ComponentRegistry {
    type_ids: HashMap<TypeId, ComponentTypeId>,
    storages: HashMap<ComponentTypeId, Box<dyn ComponentStorage>>,
}

impl ComponentRegistry {
    fn register<T: Component>(&mut self) -> ComponentTypeId {
        let type_id = TypeId::of::<T>();
        if let Some(&component_type_id) = self.type_ids.get(&type_id) {
            return component_type_id;
        }
        
        let component_type_id = ComponentTypeId(self.type_ids.len());
        self.type_ids.insert(type_id, component_type_id);
        self.storages.insert(component_type_id, Box::new(ComponentStorage::<T>::new()));
        component_type_id
    }
    
    fn get_storage<T: Component>(&self) -> Option<&ComponentStorage<T>> {
        let type_id = TypeId::of::<T>();
        let component_type_id = self.type_ids.get(&type_id)?;
        self.storages[component_type_id]
            .as_any()
            .downcast_ref::<ComponentStorage<T>>()
    }
}
```

### 查询系统

```rust
// 查询构建器
struct QueryBuilder {
    required: Vec<ComponentTypeId>,
    excluded: Vec<ComponentTypeId>,
    optional: Vec<ComponentTypeId>,
}

impl QueryBuilder {
    fn with<T: Component>(mut self) -> Self {
        self.required.push(self.registry.get_type_id::<T>());
        self
    }
    
    fn without<T: Component>(mut self) -> Self {
        self.excluded.push(self.registry.get_type_id::<T>());
        self
    }
    
    fn maybe<T: Component>(mut self) -> Self {
        self.optional.push(self.registry.get_type_id::<T>());
        self
    }
    
    fn build(self) -> Query {
        Query {
            required: self.required,
            excluded: self.excluded,
            optional: self.optional,
        }
    }
}

// 查询执行
impl World {
    fn query<Q: QueryTuple>(&self) -> QueryResult<Q> {
        let query = Q::build_query();
        let entities = self.find_matching_entities(&query);
        QueryResult::new(entities, self)
    }
}

// 使用示例
let query = world.query::<(&Position, &Velocity, &mut Health)>();
for (entity, (pos, vel, health)) in query {
    // 处理实体
}
```

### 系统调度器

```rust
struct SystemScheduler {
    systems: Vec<Box<dyn System>>,
    dependencies: DependencyGraph,
    parallel_groups: Vec<Vec<usize>>,  // 可以并行执行的系统组
}

impl SystemScheduler {
    fn add_system(&mut self, system: Box<dyn System>, dependencies: Vec<&str>) {
        let system_id = self.systems.len();
        self.systems.push(system);
        self.dependencies.add_node(system_id, dependencies);
    }
    
    fn build_parallel_groups(&mut self) {
        // 拓扑排序，找出可以并行执行的系统
        let sorted = self.dependencies.topological_sort();
        let mut groups = Vec::new();
        let mut current_group = Vec::new();
        
        for system_id in sorted {
            if self.can_run_parallel(&current_group, system_id) {
                current_group.push(system_id);
            } else {
                if !current_group.is_empty() {
                    groups.push(current_group);
                }
                current_group = vec![system_id];
            }
        }
        
        if !current_group.is_empty() {
            groups.push(current_group);
        }
        
        self.parallel_groups = groups;
    }
    
    fn execute(&mut self, world: &mut World, delta_time: f32) {
        for group in &self.parallel_groups {
            // 并行执行同一组的系统
            group.par_iter().for_each(|&system_id| {
                self.systems[system_id].update(world, delta_time);
            });
        }
    }
}
```

---

## 数据驱动实现

### Lua 与 Rust 的互操作

```rust
use mlua::{Lua, LuaSerdeExt, Value};

struct LuaBridge {
    lua: Lua,
    world_ref: LuaValue,  // 世界状态的 Lua 引用
}

impl LuaBridge {
    fn new(world: &World) -> Result<Self> {
        let lua = Lua::new();
        
        // 注册 Rust 函数到 Lua
        lua.globals().set("get_component", lua.create_function(|lua, (entity_id, component_name): (u64, String)| {
            // 从世界获取组件并转换为 Lua 值
            // ...
        })?)?;
        
        lua.globals().set("set_component", lua.create_function(|lua, (entity_id, component_name, value): (u64, String, Value)| {
            // 设置组件值
            // ...
        })?)?;
        
        lua.globals().set("emit_event", lua.create_function(|lua, event: Value| {
            // 发出事件
            // ...
        })?)?;
        
        Ok(Self {
            lua,
            world_ref: /* ... */,
        })
    }
    
    fn call_interaction_script(
        &self,
        script_path: &str,
        entity_id: EntityId,
        object_id: EntityId,
    ) -> Result<(bool, String)> {
        // 加载脚本
        let script: mlua::Function = self.lua.load_file(script_path)?.eval()?;
        
        // 调用函数
        let result: (bool, String) = script.call((entity_id, object_id))?;
        Ok(result)
    }
}
```

### 数据验证系统

```rust
struct DataValidator {
    schemas: HashMap<String, JsonSchema>,
}

impl DataValidator {
    fn validate_item(&self, item: &Item) -> Result<()> {
        let schema = self.schemas.get("item")
            .ok_or_else(|| Error::SchemaNotFound("item".to_string()))?;
        
        let value = serde_json::to_value(item)?;
        schema.validate(&value)?;
        Ok(())
    }
    
    fn validate_behavior_script(&self, script: &str) -> Result<()> {
        // 语法检查
        let lua = Lua::new();
        lua.load(script).exec()?;
        
        // 检查必需的函数
        let globals = lua.globals();
        if globals.get::<_, mlua::Function>("on_interact").is_err() {
            return Err(Error::MissingFunction("on_interact".to_string()));
        }
        
        Ok(())
    }
}
```

### 热重载系统

```rust
struct HotReloadSystem {
    file_watcher: FileWatcher,
    loaded_files: HashMap<PathBuf, SystemTime>,
}

impl System for HotReloadSystem {
    fn update(&mut self, world: &mut World, delta_time: f32) {
        // 检查文件变化
        for (path, last_modified) in self.file_watcher.check_changes() {
            if let Some(&old_time) = self.loaded_files.get(path) {
                if last_modified > old_time {
                    self.reload_file(world, path);
                    self.loaded_files.insert(path.clone(), last_modified);
                }
            }
        }
    }
    
    fn reload_file(&self, world: &mut World, path: &Path) {
        if path.extension() == Some("lua") {
            // 重新加载 Lua 脚本
            world.data_loader.reload_script(path)?;
        } else if path.extension() == Some("toml") {
            // 重新加载静态数据
            world.data_loader.reload_data(path)?;
        }
    }
}
```

---

## GOAP 实现细节

### 世界状态表示

```rust
// 世界状态使用键值对表示
type WorldState = HashMap<String, WorldStateValue>;

enum WorldStateValue {
    Bool(bool),
    Int(i32),
    Float(f32),
    String(String),
    Entity(EntityId),
}

impl WorldState {
    fn matches(&self, other: &WorldState) -> bool {
        for (key, value) in other {
            if let Some(self_value) = self.get(key) {
                if !self_value.matches(value) {
                    return false;
                }
            } else {
                return false;
            }
        }
        true
    }
    
    fn apply_effects(&mut self, effects: &WorldState) {
        for (key, value) in effects {
            self.insert(key.clone(), value.clone());
        }
    }
}
```

### 启发式函数

```rust
impl GOAPPlanner {
    fn heuristic(&self, current: &WorldState, goal: &WorldState) -> f32 {
        let mut distance = 0.0;
        
        for (key, goal_value) in goal {
            if let Some(current_value) = current.get(key) {
                distance += self.value_distance(current_value, goal_value);
            } else {
                // 缺失的状态值，增加距离
                distance += 1.0;
            }
        }
        
        distance
    }
    
    fn value_distance(&self, a: &WorldStateValue, b: &WorldStateValue) -> f32 {
        match (a, b) {
            (WorldStateValue::Bool(a_val), WorldStateValue::Bool(b_val)) => {
                if a_val == b_val { 0.0 } else { 1.0 }
            }
            (WorldStateValue::Int(a_val), WorldStateValue::Int(b_val)) => {
                ((a_val - b_val).abs() as f32) / 100.0
            }
            (WorldStateValue::Float(a_val), WorldStateValue::Float(b_val)) => {
                (a_val - b_val).abs()
            }
            _ => 1.0,
        }
    }
}
```

### 计划缓存

```rust
struct PlanCache {
    cache: HashMap<PlanCacheKey, CachedPlan>,
    max_size: usize,
}

struct PlanCacheKey {
    goal_hash: u64,
    world_state_hash: u64,
}

impl PlanCache {
    fn get_plan(&self, goal: &Goal, world_state: &WorldState) -> Option<&CachedPlan> {
        let key = PlanCacheKey {
            goal_hash: self.hash_goal(goal),
            world_state_hash: self.hash_world_state(world_state),
        };
        self.cache.get(&key)
    }
    
    fn cache_plan(&mut self, goal: &Goal, world_state: &WorldState, plan: Plan) {
        if self.cache.len() >= self.max_size {
            // LRU 淘汰
            self.evict_lru();
        }
        
        let key = PlanCacheKey {
            goal_hash: self.hash_goal(goal),
            world_state_hash: self.hash_world_state(world_state),
        };
        
        self.cache.insert(key, CachedPlan {
            plan,
            last_used: SystemTime::now(),
        });
    }
}
```

### 动作条件检查

```rust
impl ActionExecutionSystem {
    fn preconditions_met(&self, world: &World, entity: EntityId, action: &Action) -> bool {
        let world_state = self.get_entity_world_state(world, entity);
        
        for (key, required_value) in &action.preconditions {
            if let Some(actual_value) = world_state.get(key) {
                if !actual_value.matches(required_value) {
                    return false;
                }
            } else {
                // 前置条件中要求的状态不存在
                return false;
            }
        }
        
        true
    }
    
    fn get_entity_world_state(&self, world: &World, entity: EntityId) -> WorldState {
        let mut state = WorldState::new();
        
        // 从组件中提取世界状态
        if let Some(needs) = world.get_component::<Needs>(entity) {
            state.insert("hungry".to_string(), WorldStateValue::Bool(needs.physiological < 0.3));
            state.insert("tired".to_string(), WorldStateValue::Bool(needs.physiological < 0.2));
        }
        
        if let Some(inventory) = world.get_component::<Inventory>(entity) {
            state.insert("has_food".to_string(), WorldStateValue::Bool(inventory.has_item("food")));
            state.insert("has_tool".to_string(), WorldStateValue::Bool(inventory.has_item("tool")));
        }
        
        if let Some(pos) = world.get_component::<Position>(entity) {
            // 检查附近的对象
            let nearby_chair = self.find_nearby_object(world, pos, "chair");
            state.insert("near_chair".to_string(), WorldStateValue::Bool(nearby_chair.is_some()));
        }
        
        state
    }
}
```

---

## 性能优化实践

### 组件存储优化

```rust
// 使用 SoA (Structure of Arrays) 存储
struct ComponentStorage<T> {
    entities: Vec<EntityId>,           // 实体 ID 数组
    components: Vec<T>,                 // 组件数据数组
    entity_to_index: SparseSet<EntityId, usize>,  // 快速查找
    generation: Vec<u32>,               // 世代号，用于检测有效性
}

impl<T> ComponentStorage<T> {
    fn add(&mut self, entity: EntityId, component: T) {
        let index = self.components.len();
        self.entities.push(entity);
        self.components.push(component);
        self.generation.push(entity.generation);
        self.entity_to_index.insert(entity.id, index);
    }
    
    fn get(&self, entity: EntityId) -> Option<&T> {
        let index = *self.entity_to_index.get(&entity.id)?;
        if self.generation[index] == entity.generation {
            Some(&self.components[index])
        } else {
            None
        }
    }
    
    // 批量迭代，缓存友好
    fn iter(&self) -> impl Iterator<Item = (EntityId, &T)> {
        self.entities.iter()
            .zip(self.components.iter())
            .zip(self.generation.iter())
            .map(|((&entity_id, component), &gen)| {
                (EntityId { id: entity_id, generation: gen }, component)
            })
    }
}
```

### 并行系统执行

```rust
use rayon::prelude::*;

impl SystemScheduler {
    fn execute_parallel(&mut self, world: &World, delta_time: f32) {
        // 将世界分割为只读部分
        let world_ro = world.as_readonly();
        
        // 并行执行无依赖的系统
        self.parallel_groups.par_iter().for_each(|group| {
            for &system_id in group {
                // 每个系统获取自己的世界视图
                let mut world_view = world_ro.create_view();
                self.systems[system_id].update(&mut world_view, delta_time);
            }
        });
    }
}
```

### 空间索引优化

```rust
use rstar::RTree;

struct SpatialIndex {
    tree: RTree<SpatialEntity>,
}

struct SpatialEntity {
    entity_id: EntityId,
    position: [f32; 2],
    radius: f32,
}

impl SpatialIndex {
    fn find_nearby(&self, position: [f32; 2], radius: f32) -> Vec<EntityId> {
        let search_rect = AABB::from_point(position)
            .extend_uniformly(radius);
        
        self.tree
            .locate_in_envelope(&search_rect)
            .filter(|entity| {
                let distance = self.distance(entity.position, position);
                distance <= radius + entity.radius
            })
            .map(|entity| entity.entity_id)
            .collect()
    }
}
```

### GOAP 性能优化

```rust
// 使用 IDA* 替代 A*，减少内存使用
impl GOAPPlanner {
    fn ida_star_search(
        &self,
        start: WorldState,
        goal: WorldState,
        actions: &[Action],
    ) -> Option<Vec<Action>> {
        let mut threshold = self.heuristic(&start, &goal);
        let mut path = Vec::new();
        
        loop {
            match self.search_recursive(&start, &goal, actions, &mut path, 0.0, threshold) {
                SearchResult::Found(plan) => return Some(plan),
                SearchResult::Cutoff(new_threshold) => {
                    threshold = new_threshold;
                    path.clear();
                }
                SearchResult::NotFound => return None,
            }
        }
    }
}
```

---

## 调试工具设计

### 实体检查器

```rust
struct EntityInspector {
    selected_entity: Option<EntityId>,
}

impl EntityInspector {
    fn render(&mut self, ui: &mut egui::Ui, world: &World) {
        if let Some(entity) = self.selected_entity {
            ui.heading(format!("Entity {}", entity.id));
            
            // 显示所有组件
            ui.separator();
            ui.label("Components:");
            
            if let Some(pos) = world.get_component::<Position>(entity) {
                ui.label(format!("Position: ({:.2}, {:.2}, {:.2})", pos.x, pos.y, pos.z));
            }
            
            if let Some(needs) = world.get_component::<Needs>(entity) {
                ui.label(format!("Needs - Physiological: {:.2}", needs.physiological));
                ui.label(format!("Needs - Safety: {:.2}", needs.safety));
                // ...
            }
            
            if let Some(goal) = world.get_component::<Goal>(entity) {
                ui.label(format!("Goal: {} (priority: {:.2})", goal.name, goal.priority));
            }
            
            if let Some(plan) = world.get_component::<Plan>(entity) {
                ui.label("Plan:");
                for (i, action) in plan.actions.iter().enumerate() {
                    let marker = if i == plan.current_action_index { "→" } else { " " };
                    ui.label(format!("{} {}. {}", marker, i + 1, action.name));
                }
            }
        }
    }
}
```

### 世界状态可视化

```rust
struct WorldStateVisualizer {
    show_entities: bool,
    show_relationships: bool,
    show_paths: bool,
}

impl WorldStateVisualizer {
    fn render(&self, world: &World, renderer: &mut Renderer) {
        if self.show_entities {
            let query = world.query::<(&Position, &Name)>();
            for (entity, (pos, name)) in query {
                renderer.draw_entity(pos, &name.name);
            }
        }
        
        if self.show_relationships {
            let query = world.query::<(&Position, &RelationshipNetwork)>();
            for (entity, (pos, relationships)) in query {
                for (other_entity, relationship) in &relationships.relationships {
                    if let Some(other_pos) = world.get_component::<Position>(*other_entity) {
                        renderer.draw_relationship_line(pos, other_pos, relationship.strength);
                    }
                }
            }
        }
        
        if self.show_paths {
            let query = world.query::<(&Position, &Plan)>();
            for (entity, (pos, plan)) in query {
                if plan.state == PlanState::Executing {
                    renderer.draw_path(pos, &plan.actions);
                }
            }
        }
    }
}
```

### 性能分析器

```rust
struct PerformanceProfiler {
    system_timings: HashMap<String, Vec<f32>>,
    frame_times: Vec<f32>,
}

impl PerformanceProfiler {
    fn record_system(&mut self, system_name: &str, duration: f32) {
        self.system_timings
            .entry(system_name.to_string())
            .or_insert_with(Vec::new)
            .push(duration);
    }
    
    fn render(&self, ui: &mut egui::Ui) {
        ui.heading("Performance");
        
        // 显示系统耗时
        ui.separator();
        ui.label("System Timings (ms):");
        for (name, timings) in &self.system_timings {
            let avg = timings.iter().sum::<f32>() / timings.len() as f32;
            let max = timings.iter().cloned().fold(0.0, f32::max);
            ui.label(format!("{}: avg {:.2}ms, max {:.2}ms", name, avg, max));
        }
        
        // 显示帧时间
        ui.separator();
        if let Some(&last_frame) = self.frame_times.last() {
            ui.label(format!("Last Frame: {:.2}ms", last_frame));
            ui.label(format!("FPS: {:.1}", 1000.0 / last_frame));
        }
    }
}
```

---

## 测试策略

### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_component_storage() {
        let mut storage = ComponentStorage::<Position>::new();
        let entity = EntityId::new(1, 0);
        
        storage.add(entity, Position { x: 1.0, y: 2.0, z: 3.0 });
        
        let pos = storage.get(entity).unwrap();
        assert_eq!(pos.x, 1.0);
        assert_eq!(pos.y, 2.0);
        assert_eq!(pos.z, 3.0);
    }
    
    #[test]
    fn test_goap_planner() {
        let mut planner = GOAPPlanner::new();
        
        let start = hashmap! {
            "hungry".to_string() => WorldStateValue::Bool(true),
            "has_food".to_string() => WorldStateValue::Bool(false),
        };
        
        let goal = hashmap! {
            "hungry".to_string() => WorldStateValue::Bool(false),
        };
        
        let actions = vec![
            Action {
                name: "FindFood".to_string(),
                preconditions: hashmap! {},
                effects: hashmap! {
                    "has_food".to_string() => WorldStateValue::Bool(true),
                },
                cost: 1.0,
                script_path: None,
            },
            Action {
                name: "Eat".to_string(),
                preconditions: hashmap! {
                    "has_food".to_string() => WorldStateValue::Bool(true),
                    "hungry".to_string() => WorldStateValue::Bool(true),
                },
                effects: hashmap! {
                    "hungry".to_string() => WorldStateValue::Bool(false),
                    "has_food".to_string() => WorldStateValue::Bool(false),
                },
                cost: 1.0,
                script_path: None,
            },
        ];
        
        let plan = planner.plan(&start, &goal, &actions).unwrap();
        assert_eq!(plan.actions.len(), 2);
        assert_eq!(plan.actions[0].name, "FindFood");
        assert_eq!(plan.actions[1].name, "Eat");
    }
}
```

### 集成测试

```rust
#[test]
fn test_npc_behavior_flow() {
    let mut world = World::new();
    
    // 创建 NPC
    let npc = world.create_entity();
    world.add_component(npc, Position { x: 0.0, y: 0.0, z: 0.0 });
    world.add_component(npc, Needs {
        physiological: 0.2,  // 很饿
        safety: 0.8,
        belonging: 0.5,
        esteem: 0.5,
        self_actualization: 0.5,
    });
    world.add_component(npc, Goal {
        name: "Satisfy Hunger".to_string(),
        priority: 0.8,
        target_state: hashmap! {
            "hungry".to_string() => WorldStateValue::Bool(false),
        },
        current_state: hashmap! {},
    });
    
    // 创建食物
    let food = world.create_entity();
    world.add_component(food, Position { x: 10.0, y: 0.0, z: 0.0 });
    world.add_component(food, Item { name: "apple".to_string(), item_type: "food".to_string() });
    
    // 运行系统
    let mut ai_system = AISystem::new();
    ai_system.update(&mut world, 1.0);
    
    // 验证 NPC 移动到食物位置
    let pos = world.get_component::<Position>(npc).unwrap();
    assert!(pos.x > 0.0);  // NPC 应该向食物移动
}
```

### 性能测试

```rust
#[bench]
fn bench_component_iteration(b: &mut Bencher) {
    let mut storage = ComponentStorage::<Position>::new();
    
    // 创建 10000 个实体
    for i in 0..10000 {
        let entity = EntityId::new(i, 0);
        storage.add(entity, Position {
            x: i as f32,
            y: i as f32,
            z: i as f32,
        });
    }
    
    b.iter(|| {
        let mut sum = 0.0;
        for (_, pos) in storage.iter() {
            sum += pos.x + pos.y + pos.z;
        }
        sum
    });
}
```

---

## 常见问题与解决方案

### 问题 1: Lua 脚本性能瓶颈

**症状**：Lua 脚本执行成为性能瓶颈

**解决方案**：
1. 使用 LuaJIT 替代标准 Lua
2. 将热点代码用原生代码实现
3. 减少 Lua 与 Rust 之间的数据传递
4. 批量处理 Lua 调用

```rust
// 不好的做法：频繁调用 Lua
for entity in entities {
    lua.call_script("update", entity)?;  // 每次调用都有开销
}

// 好的做法：批量处理
let entities_vec: Vec<EntityId> = entities.collect();
lua.call_script("batch_update", entities_vec)?;  // 一次调用
```

### 问题 2: GOAP 规划时间过长

**症状**：NPC 规划计划需要很长时间

**解决方案**：
1. 限制搜索深度
2. 使用计划缓存
3. 简化世界状态表示
4. 使用启发式剪枝

```rust
impl GOAPPlanner {
    fn plan_with_limit(
        &self,
        start: &WorldState,
        goal: &WorldState,
        max_depth: usize,
    ) -> Option<Plan> {
        // 限制搜索深度
        if max_depth == 0 {
            return None;
        }
        
        // 使用更激进的剪枝
        // ...
    }
}
```

### 问题 3: 组件查询性能问题

**症状**：查询匹配多个组件的实体很慢

**解决方案**：
1. 使用位掩码快速过滤
2. 缓存查询结果
3. 使用稀疏集加速查找

```rust
struct ComponentBitmask {
    bits: u64,  // 每个组件类型对应一个位
}

impl World {
    fn query_fast<Q: QueryTuple>(&self) -> QueryResult<Q> {
        let required_mask = Q::required_mask();
        let excluded_mask = Q::excluded_mask();
        
        // 快速过滤：只检查位掩码匹配的实体
        let candidates = self.entities_with_mask(required_mask, excluded_mask);
        
        // 然后进行精确匹配
        // ...
    }
}
```

### 问题 4: 内存占用过高

**症状**：大量实体导致内存占用过高

**解决方案**：
1. 使用对象池重用实体
2. 压缩组件数据
3. 延迟加载不活跃实体
4. 使用更紧凑的数据结构

```rust
// 使用对象池
struct EntityPool {
    free_entities: Vec<EntityId>,
    active_count: usize,
}

impl EntityPool {
    fn acquire(&mut self) -> EntityId {
        self.free_entities.pop()
            .unwrap_or_else(|| EntityId::new(self.active_count, 0))
    }
    
    fn release(&mut self, entity: EntityId) {
        self.free_entities.push(entity);
    }
}
```

---

## 总结

这份实现指南提供了：

1. **详细的实现细节**：ECS、数据驱动、GOAP 的具体实现
2. **性能优化实践**：组件存储、并行执行、空间索引等
3. **调试工具设计**：实体检查器、可视化、性能分析
4. **测试策略**：单元测试、集成测试、性能测试
5. **问题解决方案**：常见性能问题的解决方法

这些内容应该能够帮助你开始实现 isekai-sim 的核心系统。
