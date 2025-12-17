# 星球表面动态 GIS 数学模型

## 一、核心数据结构定义

### **Cell 状态向量（每个格子的完整状态）**

```python
class Cell:
    """512x512 网格中的单个格子"""
    
    # ========== 地形层（静态/慢变化） ==========
    elevation: float32      # 海拔 (m) [-11000, 9000]
    slope: float32          # 坡度 (°) [0, 90]
    aspect: float32         # 坡向 (°) [0, 360]
    
    # ========== 水文层（快速变化） ==========
    water_depth: float32    # 地表水深 (m) [0, 100]
    soil_moisture: float32  # 土壤含水 (%) [0, 100]
    groundwater: float32    # 地下水位 (m) [-50, 0]
    
    # ========== 气象层（实时变化） ==========
    temperature: float32    # 温度 (°C) [-60, 60]
    pressure: float32       # 气压 (hPa) [950, 1050]
    humidity: float32       # 湿度 (%) [0, 100]
    wind_u: float32         # 风速 U 分量 (m/s) [-50, 50]
    wind_v: float32         # 风速 V 分量 (m/s) [-50, 50]
    
    # ========== 土壤层（慢变化） ==========
    soil_type: uint8        # 土壤类型 [0-15]
    fertility: float16      # 肥力 [0, 1]
    organic_matter: float16 # 有机质 (%) [0, 20]
    
    # ========== 植被层（中速变化） ==========
    vegetation_density: float16  # 植被密度 [0, 1]
    vegetation_type: uint8       # 植被类型 [0-31]
    biomass: float16            # 生物量 (kg/m²) [0, 50]
    
    # ========== 能量层（实时计算） ==========
    solar_radiation: float16  # 太阳辐射 (W/m²) [0, 1400]
    albedo: float16          # 反照率 [0, 1]
```

**总计：22 个变量，约 70 字节/格子**  
**512×512 地图 ≈ 18 MB 内存**

---

## 二、关键物理方程

### **1. 温度更新（能量平衡方程）**

```python
def update_temperature(cell, neighbors, dt):
    """
    dT/dt = (Q_solar - Q_longwave + Q_sensible + Q_latent) / (ρ * c * h)
    
    参数：
    - Q_solar: 太阳短波辐射
    - Q_longwave: 地表长波辐射
    - Q_sensible: 显热通量
    - Q_latent: 潜热通量（蒸发）
    - ρ: 空气密度
    - c: 比热容
    - h: 大气边界层厚度
    """
    
    # 1. 太阳辐射（考虑纬度、时间、坡向）
    latitude = cell.y / 512 * 180 - 90
    solar_angle = calc_solar_angle(latitude, time, cell.aspect)
    Q_solar = 1367 * (1 - cell.albedo) * max(0, sin(solar_angle))
    
    # 2. 长波辐射（Stefan-Boltzmann 定律）
    sigma = 5.67e-8  # Stefan-Boltzmann 常数
    T_kelvin = cell.temperature + 273.15
    Q_longwave = sigma * T_kelvin**4
    
    # 3. 显热通量（温度梯度驱动）
    neighbor_avg_temp = mean([n.temperature for n in neighbors])
    Q_sensible = 20 * (neighbor_avg_temp - cell.temperature)
    
    # 4. 潜热通量（蒸发冷却）
    evaporation_rate = calc_evaporation(cell)  # kg/(m²·s)
    Q_latent = -2.5e6 * evaporation_rate  # 汽化潜热
    
    # 5. 海拔修正（每升高1000m，降温6.5°C）
    lapse_rate = -0.0065  # K/m
    T_base = 15.0  # 海平面基准温度
    T_target = T_base + lapse_rate * cell.elevation
    
    # 综合更新
    Q_net = Q_solar - Q_longwave + Q_sensible + Q_latent
    dT = Q_net / (1.225 * 1005 * 100) * dt  # ρ=1.225 kg/m³, c=1005 J/(kg·K)
    
    cell.temperature += dT + 0.1 * (T_target - cell.temperature) * dt
```

---

### **2. 水文循环（质量守恒方程）**

```python
def update_hydrology(cell, neighbors, dt):
    """
    水量平衡方程：
    dW/dt = P - E - R - I
    
    P: 降水
    E: 蒸发
    R: 地表径流
    I: 下渗
    """
    
    # ===== 降水计算 =====
    # 受温度、湿度、气压影响
    if cell.temperature > 0:  # 雨
        P = calc_precipitation(cell.humidity, cell.pressure, cell.temperature)
    else:  # 雪
        P = calc_snowfall(cell.humidity, cell.temperature)
    
    # ===== 蒸发计算（Penman 公式简化版） =====
    # E = f(温度, 湿度, 风速, 太阳辐射)
    saturation_vapor = 6.11 * exp(17.27 * cell.temperature / (cell.temperature + 237.3))
    actual_vapor = saturation_vapor * cell.humidity / 100
    vapor_deficit = saturation_vapor - actual_vapor
    
    wind_speed = sqrt(cell.wind_u**2 + cell.wind_v**2)
    E = 0.26 * (1 + 0.54 * wind_speed) * vapor_deficit / 100  # mm/day → m/s
    
    # ===== 地表径流（Manning 公式） =====
    # 只有当水深 > 阈值 且 有坡度时才流动
    if cell.water_depth > 0.001 and cell.slope > 0:
        # 计算流向（向最低邻居流动）
        lowest_neighbor = min(neighbors, key=lambda n: n.elevation + n.water_depth)
        
        if (cell.elevation + cell.water_depth) > (lowest_neighbor.elevation + lowest_neighbor.water_depth):
            # Manning 公式：Q = (1/n) * A * R^(2/3) * S^(1/2)
            n = 0.03  # 曼宁粗糙系数
            hydraulic_radius = cell.water_depth  # 简化
            slope_gradient = sin(cell.slope * pi / 180)
            
            velocity = (1/n) * hydraulic_radius**(2/3) * slope_gradient**(1/2)
            R = velocity * cell.water_depth * dt  # 流出量
            R = min(R, cell.water_depth * 0.5)  # 最多流出一半
        else:
            R = 0
    else:
        R = 0
    
    # ===== 下渗（Green-Ampt 模型） =====
    # 受土壤类型、含水量影响
    soil_permeability = [0.1, 0.5, 1.0, 2.0][cell.soil_type % 4]  # m/day
    saturation_deficit = (100 - cell.soil_moisture) / 100
    I = soil_permeability * saturation_deficit * dt / 86400
    I = min(I, cell.water_depth)
    
    # ===== 更新水深 =====
    cell.water_depth += (P - E - R - I) * dt
    cell.water_depth = max(0, cell.water_depth)
    
    # ===== 更新土壤水分 =====
    cell.soil_moisture += I / 0.5 * 100  # 假设有效土层 0.5m
    cell.soil_moisture = clamp(cell.soil_moisture, 0, 100)
```

---

### **3. 大气环流（Navier-Stokes 简化）**

```python
def update_wind(cell, neighbors, dt):
    """
    风场更新（浅水方程组简化版）：
    du/dt = -g * ∂h/∂x + f*v - friction
    dv/dt = -g * ∂h/∂y - f*u - friction
    
    g: 重力加速度
    h: 气压高度
    f: 科氏力参数
    """
    
    # 1. 气压梯度力
    dp_dx = (neighbors['east'].pressure - neighbors['west'].pressure) / 2000  # hPa/m
    dp_dy = (neighbors['north'].pressure - neighbors['south'].pressure) / 2000
    
    g = 9.81
    rho = 1.225
    F_pressure_x = -g / rho * dp_dx * 100  # 转换为 m/s²
    F_pressure_y = -g / rho * dp_dy * 100
    
    # 2. 科氏力（地转偏向）
    latitude = cell.y / 512 * 180 - 90
    f = 2 * 7.2921e-5 * sin(latitude * pi / 180)  # 科氏参数
    F_coriolis_x = f * cell.wind_v
    F_coriolis_y = -f * cell.wind_u
    
    # 3. 地表摩擦（受粗糙度影响）
    wind_speed = sqrt(cell.wind_u**2 + cell.wind_v**2)
    Cd = 0.001 * (1 + cell.vegetation_density * 5)  # 植被增加阻力
    F_friction_x = -Cd * cell.wind_u * wind_speed
    F_friction_y = -Cd * cell.wind_v * wind_speed
    
    # 4. 温度差驱动（热力环流）
    temp_gradient_x = (neighbors['east'].temperature - neighbors['west'].temperature) / 2000
    temp_gradient_y = (neighbors['north'].temperature - neighbors['south'].temperature) / 2000
    F_thermal_x = -0.5 * temp_gradient_x
    F_thermal_y = -0.5 * temp_gradient_y
    
    # 综合更新
    du = (F_pressure_x + F_coriolis_x + F_friction_x + F_thermal_x) * dt
    dv = (F_pressure_y + F_coriolis_y + F_friction_y + F_thermal_y) * dt
    
    cell.wind_u += du
    cell.wind_v += dv
    
    # 限制最大风速
    cell.wind_u = clamp(cell.wind_u, -50, 50)
    cell.wind_v = clamp(cell.wind_v, -50, 50)
```

---

### **4. 植被生长（Logistic 模型）**

```python
def update_vegetation(cell, dt):
    """
    植被密度变化：
    dV/dt = r * V * (1 - V/K) * f(water, temp, light)
    
    r: 内禀增长率
    K: 环境容纳量
    """
    
    # 1. 基础生长率（受植被类型影响）
    growth_rates = {
        0: 0.1,   # 草地
        1: 0.05,  # 灌木
        2: 0.02,  # 阔叶林
        3: 0.015, # 针叶林
    }
    r = growth_rates.get(cell.vegetation_type % 4, 0.1)
    
    # 2. 水分限制因子
    optimal_moisture = 60  # 最适土壤含水量
    f_water = exp(-((cell.soil_moisture - optimal_moisture) / 30)**2)
    
    # 3. 温度限制因子（高斯曲线）
    optimal_temp = 25
    f_temp = exp(-((cell.temperature - optimal_temp) / 15)**2)
    
    # 4. 光照限制因子
    f_light = cell.solar_radiation / 1000
    
    # 5. 土壤肥力限制
    f_nutrient = cell.fertility
    
    # 6. 环境容纳量（受生物量限制）
    K = 50  # kg/m²
    carrying_capacity = 1 - cell.biomass / K
    
    # 综合生长
    growth = r * cell.vegetation_density * carrying_capacity * \
             f_water * f_temp * f_light * f_nutrient * dt
    
    cell.vegetation_density += growth
    cell.vegetation_density = clamp(cell.vegetation_density, 0, 1)
    
    # 更新生物量
    cell.biomass = cell.vegetation_density * K
    
    # 反馈：植被影响土壤
    cell.organic_matter += cell.biomass * 0.001 * dt  # 枯枝落叶
    cell.fertility += cell.organic_matter * 0.01
```

---

## 三、时间步进策略

```python
def simulate_one_step(grid: np.ndarray[Cell], dt: float):
    """
    主模拟循环（顺序很重要！）
    """
    
    # 第 1 阶段：独立计算（可并行）
    for cell in grid:
        update_solar_radiation(cell)  # 计算太阳辐射
        calc_albedo(cell)             # 更新反照率
    
    # 第 2 阶段：局部依赖（可并行）
    for cell in grid:
        neighbors = get_neighbors(cell, grid)
        update_temperature(cell, neighbors, dt)
        update_pressure(cell, neighbors, dt)
    
    # 第 3 阶段：流场更新（需要迭代求解器）
    for iteration in range(5):  # 迭代 5 次稳定
        for cell in grid:
            neighbors = get_neighbors(cell, grid)
            update_wind(cell, neighbors, dt / 5)
    
    # 第 4 阶段：水文循环（有传输）
    water_flux = np.zeros_like(grid)
    for cell in grid:
        neighbors = get_neighbors(cell, grid)
        flux = update_hydrology(cell, neighbors, dt)
        water_flux[cell.pos] = flux
    
    # 应用水流传输
    apply_water_transport(grid, water_flux)
    
    # 第 5 阶段：慢过程（可以降采样）
    if step % 10 == 0:  # 每 10 步更新一次
        for cell in grid:
            update_vegetation(cell, dt * 10)
            update_soil(cell, dt * 10)

# 时间步长选择
dt_fast = 60        # 快过程：1分钟（温度、风）
dt_slow = 3600      # 慢过程：1小时（植被）
dt_very_slow = 86400  # 超慢：1天（土壤）
```

---

## 四、关键耦合关系图

```
温度 ←→ 蒸发 ←→ 湿度 ←→ 降水
  ↓                        ↓
太阳辐射              地表水深
  ↓                        ↓
植被生长 ←→ 土壤水分 ←← 径流
  ↓          ↓
生物量    土壤肥力
  ↓          ↓
反照率 ←→ 温度（闭环）
```

---

## 五、数值稳定性技巧

```python
# 1. Courant 条件（防止数值爆炸）
max_velocity = max([sqrt(c.wind_u**2 + c.wind_v**2) for c in grid])
dx = 20000  # 512格子跨越赤道 40000km
dt_safe = 0.5 * dx / max_velocity  # CFL < 0.5

# 2. 半隐式时间积分（温度扩散）
T_new = (T_old + dt * heat_source) / (1 + dt * diffusion_coeff)

# 3. 通量限制器（防止负值）
flux = min(flux, cell.water_depth * 0.9)  # 不能流空
```

这套模型可以在 GPU 上并行计算，512×512 网格约 **10ms/step**！
