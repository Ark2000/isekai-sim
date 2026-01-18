# 如何启动程序

在 `ProjectGENISIS/src`下面开个http服务器就行了，`python -m http.server 8000`，或者随便什么方法。

# 画布操作

- 拖拽画布：空格键+鼠标左键，或者鼠标中键
- 缩放画布：鼠标滚轮
- 画笔绘制：鼠标左键绘制，右键擦除

# 数据面板操作

- ViewPort
  - Reset Viewport [Button]: 重制画布的缩放和位置状态
- Performance: 性能相关设置
  - Current FPS [Text]: 显示当前GPU刷新的频率，目前有BUG，之后修。
  - Frame Time [Text]: 同上，显示帧刷新间隔时间
  - Target FPS [Slider]: 限制GPU刷新频率，目前有BUG。
- World Sim
  - Tool [Selector]: 当前画布画笔的模式，目前有 Edit Water/Cloud/Temperature/Terrain 四种模式
  - Generator: 地图生成器选项
    - Scale [Slider]: 噪声的scale
    - Seed [Slider]: 噪声的种子
    - Generate Terrain [Button]: 利用噪声生成新的高度图（也就是Terrain）
  - Brush: 控制用户画笔的行为
    - Value [Slider]: 画笔强度
    - Radius [Slider]: 画笔半径
    - Random [Slider]: 画笔随机扰动的程度
    - Limit [Checkbox]: 是否限制画笔的目标值。在该模式下，画笔绘制的结果会尽可能逼近目标值（绘制的时候不超过目标值，擦除的时候不低于目标值，也就是说不会画过头）
    - Limit Val [Slider]: Limit生效后，其目标值。
  - Environment：一些模拟环境全局参数设置
    - Wind X [Slider]: 全局风力x
    - Wind Y [Slider]: 全局风力y
  - Physics Params: 这一部分是重头戏了，物理模拟环境的调参
    - SWE (Shallow Water): 名字起的不好，应该叫流体模拟设置
      - Water Mode [Selector]: 可以选择水体模拟算法，VPM虚拟管道模型或者SWE浅水方程。目前VPM算法的数值稳定性问题很大，会有棋盘震荡现象。
      - Water Speed [Slider]: 水体速度控制参数，有问题，疑似会打破CFL稳定条件。
      - Water Damping [Slider]: 水体粘稠程度参数，越大动能衰减的越快，0的话就是完全没有动能损失，疯狂四处流动。
    - Advanced (Danger): 跳过...这一部分参数不应该暴露出来的，不能乱调。
    - Cloud Physics: 控制云的一些物理参数，暂时跳过，还在实现中
      - Decay [Slider]
      - Rain Thres [Slider]
      - Evap Rate [Slider]
      - Cond Rate [Slider]
    - Thermal Physics: 热力学模拟，暂时掉过
      - Diffusion [Slider]
      - Inertia [Slider]
      - Thermal Wind [Slider]
    - Water Physics: 水文参数，控制水循环的，暂时跳过
      - Evaporation [Slider]
  - Layer Visibility [MultiCheckbox]: 控制图层的可见性，目前有六个图层，分别是 Terrain / Hillshade / Water / Temp / Cloud / Wind，Hillshade是纯视觉效果，给Terrain加上投影。
  - Pixel Data [CheckBox]: 调试功能，可以显示鼠标当前位置的模拟数据信息。

# 怎么玩

- TODO，具像化描述一些模拟过程，比如水是怎么流动的，云是怎么形成的，等等。