"""
模拟系统 - 管理整个模拟的循环和更新
"""
from typing import List
from world import World, WorldConfig
from npc import NPC


class Simulation:
    """模拟类 - 管理整个模拟系统"""
    
    def __init__(self, config: WorldConfig = None):
        """初始化模拟"""
        self.world = World(config=config or WorldConfig())
        self.npcs: List[NPC] = []
        self._initialize_npcs()
    
    def _initialize_npcs(self, count: int = 100):
        """初始化NPC"""
        for i in range(count):
            npc = NPC(
                id=i,
                x=random.uniform(0, self.world.config.width),
                y=random.uniform(0, self.world.config.height),
                name=f"Citizen_{i}",
                occupation=random.choice(["farmer", "merchant", "craftsman", "guard"]),
                wealth=random.uniform(50, 500),
                age=random.randint(18, 60)
            )
            self.npcs.append(npc)
    
    def update(self, delta_time: float):
        """更新模拟"""
        # 更新世界
        self.world.tick(delta_time)
        
        # 更新所有NPC
        for npc in self.npcs:
            npc.update(
                delta_time,
                self.world.config.width,
                self.world.config.height
            )
    
    def get_npc_count(self) -> int:
        """获取NPC数量"""
        return len(self.npcs)
    
    def get_all_npcs(self) -> List[NPC]:
        """获取所有NPC"""
        return self.npcs
    
    def add_npc(self, npc: NPC):
        """添加NPC"""
        self.npcs.append(npc)
    
    def remove_npc(self, npc_id: int):
        """移除NPC"""
        self.npcs = [npc for npc in self.npcs if npc.id != npc_id]
