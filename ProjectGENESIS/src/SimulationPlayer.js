export class SimulationPlayer {
    constructor(tickFunc) {
        this.tickFunc = tickFunc;

        this.isSimulating = false;
        this.simulationInterval = null;
        this.simulationSpeed = 20;
    }

    setupGUI(guiFolder) {
        this.guiFolder = guiFolder.addFolder({ title: 'Simulation'});
        this.guiFolder.expanded = true;
        this.toggleButton = this.guiFolder.addButton({ title: 'Start Simulation' }).on('click', () => this.onToggleButtonClick());
        this.nextTickButton = this.guiFolder.addButton({ title: 'Next Tick' }).on('click', () => this.onNextTickButtonClick());
        this.guiFolder.addBinding(this, 'simulationSpeed', { min: 1, max: 100, step: 1 , label: 'speed'}).on('change', () => {
            if (this.isSimulating) {
                clearInterval(this.simulationInterval);
                this.simulationInterval = setInterval(() => {
                    this.tickFunc();
                }, 1000 / this.simulationSpeed);
            }
        });
    }

    onToggleButtonClick() {
        this.toggleSimulation();
    }

    onNextTickButtonClick() {
        this.tickFunc();
    }

    toggleSimulation() {
        if (this.isSimulating) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
            this.isSimulating = false;
            this.toggleButton.title = 'Start Simulation';
        } else {
            this.simulationInterval = setInterval(() => {
                this.tickFunc();
            }, 1000 / this.simulationSpeed);
            this.isSimulating = true;
            this.toggleButton.title = "Stop Simulation";
        }
    }
}

