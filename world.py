"""
世界系统 - 管理整个模拟世界的基础结构
"""
import random
from typing import List, Dict
from dataclasses import dataclass, field
from enum import Enum


class WorldState(Enum):
    """世界状态"""
    RUNNING = "running"
    PAUSED = "paused"
    STEP = "step"  # 单步执行


@dataclass
class WorldConfig:
    """世界配置"""
    width: int = 2000  # 世界宽度
    height: int = 2000  # 世界高度
    time_scale: float = 1.0  # 时间缩放（1.0 = 正常速度）
    tick_rate: int = 60  # 每秒tick数


@dataclass
class World:
    """世界类 - 管理整个模拟世界"""
    config: WorldConfig = field(default_factory=WorldConfig)
    state: WorldState = WorldState.PAUSED
    current_tick: int = 0
    current_time: float = 0.0  # 游戏内时间（天）
    
    def __post_init__(self):
        """初始化后处理"""
        pass
    
    def tick(self, delta_time: float):
        """世界tick - 推进时间"""
        if self.state == WorldState.RUNNING:
            self.current_tick += 1
            self.current_time += delta_time * self.config.time_scale
        elif self.state == WorldState.STEP:
            self.current_tick += 1
            self.current_time += delta_time * self.config.time_scale
            self.state = WorldState.PAUSED  # 单步执行后暂停
    
    def get_days_passed(self) -> float:
        """获取已过去的天数"""
        return self.current_time
    
    def pause(self):
        """暂停世界"""
        self.state = WorldState.PAUSED
    
    def resume(self):
        """恢复运行"""
        self.state = WorldState.RUNNING
    
    def step(self):
        """单步执行"""
        self.state = WorldState.STEP
    
    def set_time_scale(self, scale: float):
        """设置时间缩放"""
        self.config.time_scale = max(0.0, min(10.0, scale))  # 限制在0-10倍速
