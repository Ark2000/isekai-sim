"""
NPC系统 - 管理所有NPC的行为和状态
"""
import random
import math
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum


class NPCState(Enum):
    """NPC状态"""
    IDLE = "idle"
    MOVING = "moving"
    WORKING = "working"
    RESTING = "resting"


@dataclass
class NPC:
    """NPC类 - 代表世界中的一个个体"""
    id: int
    x: float
    y: float
    state: NPCState = NPCState.IDLE
    
    # 基础属性
    age: int = 20  # 年龄
    health: float = 100.0  # 健康值
    energy: float = 100.0  # 精力值
    
    # 移动相关
    target_x: Optional[float] = None
    target_y: Optional[float] = None
    speed: float = 50.0  # 移动速度（像素/秒）
    
    # 社会属性
    name: str = ""
    occupation: str = "citizen"
    wealth: float = 100.0  # 财富
    
    # 关系网络（简化版）
    relationships: Dict[int, float] = field(default_factory=dict)  # {npc_id: relationship_value}
    
    def __post_init__(self):
        """初始化后处理"""
        if not self.name:
            self.name = f"NPC_{self.id}"
    
    def update(self, delta_time: float, world_width: int, world_height: int):
        """更新NPC状态"""
        # 更新精力（随时间恢复）
        self.energy = min(100.0, self.energy + 10.0 * delta_time)
        
        # 根据状态执行行为
        if self.state == NPCState.MOVING:
            self._update_movement(delta_time, world_width, world_height)
        elif self.state == NPCState.IDLE:
            # 随机决定是否开始移动
            if random.random() < 0.01:  # 1%概率开始移动
                self._set_random_target(world_width, world_height)
        elif self.state == NPCState.RESTING:
            if self.energy >= 100.0:
                self.state = NPCState.IDLE
        elif self.state == NPCState.WORKING:
            self.energy -= 5.0 * delta_time
            if self.energy <= 0:
                self.state = NPCState.RESTING
    
    def _update_movement(self, delta_time: float, world_width: int, world_height: int):
        """更新移动"""
        if self.target_x is None or self.target_y is None:
            self.state = NPCState.IDLE
            return
        
        # 计算到目标的距离
        dx = self.target_x - self.x
        dy = self.target_y - self.y
        distance = math.sqrt(dx * dx + dy * dy)
        
        if distance < 5.0:  # 到达目标
            self.x = self.target_x
            self.y = self.target_y
            self.target_x = None
            self.target_y = None
            self.state = NPCState.IDLE
        else:
            # 移动
            move_distance = self.speed * delta_time
            if move_distance > distance:
                move_distance = distance
            
            self.x += (dx / distance) * move_distance
            self.y += (dy / distance) * move_distance
            
            # 边界检查
            self.x = max(0, min(world_width, self.x))
            self.y = max(0, min(world_height, self.y))
    
    def _set_random_target(self, world_width: int, world_height: int):
        """设置随机目标"""
        self.target_x = random.uniform(0, world_width)
        self.target_y = random.uniform(0, world_height)
        self.state = NPCState.MOVING
    
    def get_position(self) -> Tuple[float, float]:
        """获取位置"""
        return (self.x, self.y)
    
    def set_target(self, x: float, y: float):
        """设置移动目标"""
        self.target_x = x
        self.target_y = y
        self.state = NPCState.MOVING
