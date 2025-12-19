/**
 * GENESIS-GUI v1.0
 * ----------------
 * 一个轻量级、零依赖、工业/硬核风格的 Web 调试 GUI 库。
 * 专为 Project GENESIS 设计，支持实时参数绑定、监控与多图层管理。
 * 
 * 核心组件:
 * - Pane: 主控制面板，支持自动注入样式。
 * - Folder: 支持多级嵌套的折叠容器。
 * - Binding: 双向数据绑定，支持数值(Slider)、布尔(Switch)、下拉菜单(Select)及只读监控。
 * - Button: 触发式操作按钮。
 * - LayerToggles: 紧凑的网格化图层可见性切换器。
 * 
 * 快速开始:
 *   const gui = new Pane();
 *   const folder = gui.addFolder({ title: 'Physics' });
 *   folder.addBinding(obj, 'speed', { min: 0, max: 10, step: 0.1 });
 *   folder.addButton({ title: 'Reset' }).on('click', () => reset());
 */

class Pane {
    constructor(options = {}) {
        this.container = options.container || document.body;
        this.expanded = options.expanded !== false;
        this.bindings = [];
        
        // 样式注入
        if (!document.getElementById('genesis-gui-styles')) {
            const style = document.createElement('style');
            style.id = 'genesis-gui-styles';
            style.textContent = `
                .genesis-gui {
                    position: fixed; top: 10px; right: 10px; width: 230px;
                    max-height: 95vh; overflow-y: auto; overflow-x: hidden;
                    background: #111;
                    border: 1.5px solid #aaa;
                    color: #ccc; font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 10px; z-index: 10000; box-shadow: 4px 4px 0px rgba(0,0,0,0.5);
                    scrollbar-width: thin; scrollbar-color: #666 #111;
                    padding: 0;
                }
                .genesis-gui::-webkit-scrollbar { width: 3px; }
                .genesis-gui::-webkit-scrollbar-thumb { background: #444; }
                
                .genesis-gui-header {
                    background: #aaa; color: #111; padding: 2px 6px;
                    font-weight: bold; font-size: 9px; letter-spacing: 0.1em;
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 1.5px solid #aaa;
                }
                
                .genesis-folder { border-bottom: 1px solid rgba(255,255,255,0.05); }
                .genesis-folder-header {
                    display: flex; align-items: center; padding: 4px 8px;
                    cursor: pointer; background: #1a1a1a;
                    border-bottom: 1px solid rgba(255,255,255,0.02);
                    transition: all 0.2s; font-weight: bold;
                    color: #bbb; text-transform: uppercase;
                }
                .genesis-folder-header:hover { background: #252525; color: #eee; }
                
                .genesis-folder.depth-1 > .genesis-folder-header { background: #151515; border-left: 2px solid #444; }
                .genesis-folder.depth-2 > .genesis-folder-header { background: #111; border-left: 4px solid #333; }
                .genesis-folder.depth-3 > .genesis-folder-header { background: #0d0d0d; border-left: 6px solid #222; }
                
                .genesis-row { 
                    display: flex; align-items: center; padding: 2px 8px; 
                    min-height: 18px; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.02);
                }
                .genesis-label { 
                    flex: 0 0 70px; color: #666; font-size: 9px; 
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; 
                    text-transform: uppercase;
                }
                .genesis-control { flex: 1; display: flex; align-items: center; min-width: 0; }
                
                .genesis-monitor-val {
                    flex: 1; color: #0f0; font-size: 9px; text-align: right;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                
                .genesis-input, .genesis-select {
                    width: 100%; background: #0d0d0d; border: 1px solid #333;
                    color: #bbb; font-size: 9px; padding: 1px 4px; border-radius: 0; 
                    outline: none; transition: all 0.2s;
                    font-family: inherit; height: 16px;
                }
                .genesis-input:focus, .genesis-select:focus { border-color: #666; background: #151515; color: #eee; }
                
                .genesis-slider-container { display: flex; flex: 1; align-items: center; gap: 8px; width: 100%; }
                .genesis-slider {
                    flex: 1; -webkit-appearance: none; background: #222;
                    height: 2px; border-radius: 0; outline: none; cursor: pointer;
                    min-width: 0;
                }
                .genesis-slider::-webkit-slider-thumb {
                    -webkit-appearance: none; width: 8px; height: 8px; 
                    background: #888; border: 1px solid #111; border-radius: 0;
                }
                .genesis-slider:hover::-webkit-slider-thumb { background: #aaa; }
                
                .genesis-value-num {
                    width: 42px; background: rgba(0,0,0,0.3); border: 1px solid #222;
                    color: #aaa; font-size: 9px; text-align: right;
                    font-family: inherit; outline: none;
                    padding: 1px 3px; border-radius: 0;
                    flex-shrink: 0;
                }
                .genesis-value-num:focus { color: #fff; border-color: #666; background: #1a1a1a; }

                .genesis-btn {
                    width: calc(100% - 12px); padding: 4px; background: #1a1a1a;
                    border: 1px solid #444; border-radius: 0;
                    color: #aaa; font-size: 9px; cursor: pointer; transition: all 0.1s;
                    margin: 4px 6px; text-transform: uppercase; font-weight: bold;
                    font-family: inherit;
                }
                .genesis-btn:hover { background: #aaa; color: #111; border-color: #aaa; }
                .genesis-btn:active { transform: translate(1px, 1px); }
                
                .genesis-grid { 
                    display: grid; grid-template-columns: repeat(2, 1fr); 
                    gap: 0; border: 1px solid rgba(255,255,255,0.05); margin: 4px 6px;
                }
                .genesis-toggle {
                    background: #111; border: 0.5px solid rgba(255,255,255,0.05);
                    padding: 5px 2px; font-size: 9px; color: #444; cursor: pointer;
                    transition: all 0.1s; text-align: center; border-radius: 0;
                    font-weight: bold;
                }
                .genesis-toggle.active { background: #888; color: #111; border-color: #888; }
                .genesis-toggle:hover:not(.active) { background: #1a1a1a; color: #666; }
                
                .genesis-switch {
                    position: relative; width: 100%; height: 16px;
                    background: #0d0d0d; border: 1px solid #333;
                    cursor: pointer; transition: all 0.2s;
                    box-sizing: border-box;
                }
                .genesis-switch::after {
                    content: 'OFF'; position: absolute; right: 15%; top: 50%;
                    transform: translateY(-50%); font-size: 8px; color: #444;
                    font-weight: bold; transition: all 0.2s; z-index: 1;
                }
                .genesis-switch::before {
                    content: ''; position: absolute; left: 2px; top: 2px; bottom: 2px;
                    width: calc(50% - 4px); background: #333;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 2;
                }
                .genesis-switch.active { border-color: #888; background: #151515; }
                .genesis-switch.active::after { content: 'ON'; color: #888; left: 15%; right: auto; }
                .genesis-switch.active::before { background: #888; left: calc(50% + 2px); }
                
                .genesis-deco-bar {
                    height: 6px; background: repeating-linear-gradient(
                        45deg, #aaa, #aaa 1px, #111 1px, #111 3px
                    );
                    margin: 2px 0; opacity: 0.5;
                }
                
                .genesis-tooltip {
                    position: fixed; background: #aaa; color: #111;
                    padding: 3px 6px; font-size: 9px; font-weight: bold;
                    pointer-events: none; z-index: 10001;
                    display: none; border: 1px solid #000;
                    box-shadow: 3px 3px 0px rgba(0,0,0,0.5);
                    max-width: 180px; white-space: pre-wrap;
                    line-height: 1.2;
                }
                .has-hint {
                    text-decoration: underline dotted #444;
                    cursor: help;
                }
            `;
            document.head.appendChild(style);
        }

        this.element = document.createElement('div');
        this.element.className = 'genesis-gui';
        
        const header = document.createElement('div');
        header.className = 'genesis-gui-header';
        header.innerHTML = `<span>PROJECT_GENESIS</span><span>V1.0</span>`;
        this.element.appendChild(header);
        
        const deco = document.createElement('div');
        deco.className = 'genesis-deco-bar';
        this.element.appendChild(deco);

        // Tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'genesis-tooltip';
        document.body.appendChild(this.tooltip);

        this.container.appendChild(this.element);
    }
    
    addFolder(options = {}) { return new Folder(this.element, { ...options, depth: 0, pane: this }); }
    addBinding(obj, prop, options = {}) { return this.addFolder().addBinding(obj, prop, options); }
    addButton(options = {}) { return this.addFolder().addButton(options); }
    addBlade(options = {}) {
        if (options.view === 'separator') {
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1.5px; background: #444; margin: 6px 0;';
            this.element.appendChild(sep);
        }
        return { dispose: () => {} };
    }
    refresh() {
        this.bindings.forEach(b => b.refresh());
    }
}

class Folder {
    constructor(parent, options = {}) {
        this.title = options.title || 'Folder';
        this.expanded = options.expanded !== false;
        this.depth = options.depth || 0;
        this.pane = options.pane;
        
        this.element = document.createElement('div');
        this.element.className = 'genesis-folder' + (this.depth > 0 ? ` depth-${this.depth}` : '');
        
        this.header = document.createElement('div');
        this.header.className = 'genesis-folder-header';
        this.header.onclick = () => this.toggle();
        
        const prefix = '>'.repeat(this.depth);
        const prefixSpan = document.createElement('span');
        prefixSpan.textContent = prefix ? prefix + ' ' : '';
        prefixSpan.style.color = '#444';
        prefixSpan.style.marginRight = '4px';
        
        this.arrow = document.createElement('span');
        this.arrow.innerHTML = this.expanded ? '[-] ' : '[+] ';
        this.arrow.style.width = '20px';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = this.title;
        
        this.header.appendChild(this.arrow);
        if (prefix) this.header.appendChild(prefixSpan);
        this.header.appendChild(titleSpan);
        this.element.appendChild(this.header);
        
        this.content = document.createElement('div');
        this.content.style.display = this.expanded ? 'block' : 'none';
        this.element.appendChild(this.content);
        
        parent.appendChild(this.element);
    }
    
    toggle() {
        this.expanded = !this.expanded;
        this.content.style.display = this.expanded ? 'block' : 'none';
        this.arrow.innerHTML = this.expanded ? '[-] ' : '[+] ';
    }
    
    addFolder(options = {}) { return new Folder(this.content, { ...options, depth: this.depth + 1, pane: this.pane }); }
    addBinding(obj, prop, options = {}) { 
        const b = new Binding(this.content, obj, prop, options, this.pane);
        if (this.pane) this.pane.bindings.push(b);
        return b;
    }
    addButton(options = {}) { return new Button(this.content, options); }
    addBlade(options = {}) {
        if (options.view === 'separator') {
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;';
            this.content.appendChild(sep);
        }
        return { dispose: () => {} };
    }
    addLayerToggles(layers) { return new LayerToggles(this.content, layers); }
}

class Binding {
    constructor(parent, obj, prop, options = {}, pane = null) {
        this.obj = obj; this.prop = prop; this.options = options;
        this.label = options.label || prop;
        this.readonly = options.readonly === true;
        this.pane = pane;
        
        this.element = document.createElement('div');
        this.element.className = 'genesis-row';
        
        const label = document.createElement('label');
        label.className = 'genesis-label';
        
        const labelText = document.createElement('span');
        labelText.textContent = this.label;
        if (options.hint) labelText.className = 'has-hint';
        label.appendChild(labelText);
        
        this.element.appendChild(label);
        
        if (options.hint && this.pane && this.pane.tooltip) {
            let timer = null;
            labelText.onmouseenter = (e) => {
                timer = setTimeout(() => {
                    const tooltip = this.pane.tooltip;
                    tooltip.textContent = options.hint;
                    tooltip.style.display = 'block';
                    const rect = labelText.getBoundingClientRect();
                    tooltip.style.left = (rect.left - 5) + 'px';
                    tooltip.style.top = (rect.bottom + 5) + 'px';
                }, 400);
            };
            labelText.onmouseleave = () => {
                clearTimeout(timer);
                if (this.pane && this.pane.tooltip) {
                    this.pane.tooltip.style.display = 'none';
                }
            };
        }
        
        const controlWrap = document.createElement('div');
        controlWrap.className = 'genesis-control';
        
        const val = this.getValue();
        
        if (this.readonly) {
            this.display = document.createElement('div');
            this.display.className = 'genesis-monitor-val';
            this.display.textContent = this.formatValue(val);
            controlWrap.appendChild(this.display);
        } else if (options.options) {
            this.control = document.createElement('select');
            this.control.className = 'genesis-select';
            for (const [k, v] of Object.entries(options.options)) {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = k;
                this.control.appendChild(opt);
            }
            this.control.value = val;
            this.control.onchange = () => this.setValue(this.control.value);
            controlWrap.appendChild(this.control);
        } else if (typeof val === 'boolean') {
            const sw = document.createElement('div');
            sw.className = 'genesis-switch' + (val ? ' active' : '');
            sw.onclick = () => {
                const newVal = !this.getValue();
                this.setValue(newVal);
                sw.className = 'genesis-switch' + (newVal ? ' active' : '');
            };
            this.control = sw;
            controlWrap.appendChild(this.control);
        } else {
            const container = document.createElement('div');
            container.className = 'genesis-slider-container';
            
            this.slider = document.createElement('input');
            this.slider.type = 'range'; this.slider.className = 'genesis-slider';
            if (options.min !== undefined) this.slider.min = options.min;
            if (options.max !== undefined) this.slider.max = options.max;
            if (options.step !== undefined) this.slider.step = options.step;
            this.slider.value = val;
            
            this.num = document.createElement('input');
            this.num.type = 'text'; this.num.className = 'genesis-value-num';
            this.num.value = this.formatValue(val);
            
            this.slider.oninput = () => { 
                const v = parseFloat(this.slider.value);
                this.num.value = this.formatValue(v); 
                this.setValue(v); 
            };
            this.num.onchange = () => {
                let v = parseFloat(this.num.value);
                if (isNaN(v)) v = 0;
                this.slider.value = v;
                this.setValue(v);
                this.num.value = this.formatValue(v);
            };
            
            container.appendChild(this.slider);
            container.appendChild(this.num);
            this.control = container;
            controlWrap.appendChild(this.control);
        }
        
        this.element.appendChild(controlWrap);
        parent.appendChild(this.element);
    }
    getValue() { return this.obj[this.prop]; }
    setValue(v) { this.obj[this.prop] = v; }
    formatValue(v) {
        if (typeof v === 'number') {
            const formatted = v.toFixed(2).replace(/\.?0+$/, '');
            return this.options.suffix ? `${formatted}${this.options.suffix}` : formatted;
        }
        return v;
    }
    refresh() {
        const val = this.getValue();
        if (this.readonly) {
            this.display.textContent = this.formatValue(val);
        } else if (this.control && this.control.className.includes('genesis-switch')) {
            this.control.className = 'genesis-switch' + (val ? ' active' : '');
        } else if (this.slider && this.num) {
            this.slider.value = val;
            this.num.value = this.formatValue(val);
        } else if (this.control && this.control.tagName === 'SELECT') {
            this.control.value = val;
        }
    }
}

class Button {
    constructor(parent, options = {}) {
        this.btn = document.createElement('button');
        this.btn.className = 'genesis-btn';
        this.btn.textContent = options.title || 'Button';
        parent.appendChild(this.btn);
    }
    on(evt, cb) { if (evt === 'click') this.btn.onclick = cb; return this; }
}

class LayerToggles {
    constructor(parent, layers) {
        const container = document.createElement('div');
        container.className = 'genesis-grid';
        layers.forEach(l => {
            const btn = document.createElement('div');
            btn.className = 'genesis-toggle';
            btn.textContent = l.label.replace('Show ', '').toUpperCase();
            const update = () => {
                const active = l.getValue();
                btn.className = 'genesis-toggle' + (active ? ' active' : '');
            };
            btn.onclick = () => { l.setValue(!l.getValue()); update(); };
            update();
            container.appendChild(btn);
        });
        parent.appendChild(container);
    }
}

export { Pane };
