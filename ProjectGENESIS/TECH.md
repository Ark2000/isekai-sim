# 参考资料

- [2D Clouds](https://www.shadertoy.com/view/4tdSWr)
看了一下，是利用fractal, noise, fbm这些技术，生成的视觉效果很棒的2D云层，效果很出众，代码很简单，可以参考，用来增强云层的视觉效果！

- [Realtime shadow casting on 2D terrain](https://www.youtube.com/watch?v=bMTeCqNkId8)
他的高度图带阴影投射效果，视觉效果看起来很棒，可以改进我的阴影系统！

- [Noise Generator](https://noisegen.bubblebirdstudio.com/)
可以抄抄他们的噪声代码，无缝噪声，用来生成初始地形。

# 相关技术

## 波动方程、浅水方程， Shallow Water Equation (SWE)

浅水方程假设水在垂直方向上的速度一样，也就是水很“浅”，这是一个重要的假设。详细可参考维基百科 https://en.wikipedia.org/wiki/Shallow_water_equations

## Hydraulic Erosion 水力侵蚀

sabastian lague的[视频](https://www.youtube.com/watch?v=eaXk97ujbPQ)在这一方面做的很好，可以参考。可以通过水流改变地形形状，使得高度图看起来更自然（比如说生成沟壑、冲积平原）。这一方面大概有两个思路，一个是使用Particle-based Hydraulic Erosion，是目前游戏开发和PCG中最流行的算法，原理是模拟无数个“水滴”随机落在地图上，首先在随机位置生成水滴，然后水滴根据当前高度的梯度向下移动，如果移动速度快，水滴携带泥沙的能力强，就能从地面带走高度（侵蚀），如果移动速度慢或者进行平地，泥沙沉淀，就增加地面高度（沉积），最后是蒸发，水滴体积随时间减少，直到消失。效果非常逼真，能形成自然的河道和冲积扇，实现相对简单。第二种呢是grid-based/Eulerian Erosion

哦，对了，有一个2011年的游戏，From Dust，在这方面做得很好（但为什么暴死了呢...），可以去看看。
