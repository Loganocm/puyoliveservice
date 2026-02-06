import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { SettingsManager } from '../core/SettingsManager';


export class SettingsOverlay {
    container: Container;
    private background: Graphics;
    private isVisible: boolean = false;
    private sliders: {
        label: string,
        key: keyof typeof SettingsManager,
        min: number,
        max: number,
        step: number,
        valueText: Text,
        handle: Graphics,
        track: Graphics,
        width: number
    }[] = [];

    constructor() {
        this.container = new Container();
        this.container.visible = false;

        this.background = new Graphics();
        this.background.rect(0, 0, 400, 500);
        this.background.fill({ color: 0x000000, alpha: 0.9 });
        this.background.stroke({ color: 0xFFFFFF, width: 2 });
        this.container.addChild(this.background);

        // Header
        const header = new Text({
            text: "HANDLING TUNINGS",
            style: new TextStyle({ fontFamily: 'Arial', fontSize: 24, fill: 'white', fontWeight: 'bold' })
        });
        header.x = 20;
        header.y = 20;
        this.container.addChild(header);

        // Create Sliders
        this.createSlider("ARR (Auto Repeat Rate)", 'arr', 0, 5, 1, 60);
        this.createSlider("DAS (Delayed Auto Shift)", 'das', 1, 20, 1, 120);
        this.createSlider("SDF (Soft Drop Factor)", 'sdf', 1, 50, 1, 180); // Max 50 as requested
        this.createSlider("ARE (Spawn Delay)", 'are', 0, 30, 1, 240);
        this.createSlider("Line Clear Delay", 'lineClearDelay', 0, 60, 1, 300);

        this.createCheckbox("Soft Drop Prot. (Fresh Press)", 'softDropProtection', 360);

        // Position Container (Center Screen approx)
        this.container.x = (1000 - 400) / 2;
        this.container.y = (800 - 500) / 2;

        // Interactive
        this.container.eventMode = 'static';
    }

    private createCheckbox(label: string, key: keyof typeof SettingsManager, y: number) {
        const style = new TextStyle({ fontFamily: 'Arial', fontSize: 16, fill: 'white' });
        
        const labelText = new Text({ text: label, style });
        labelText.x = 20;
        labelText.y = y;
        this.container.addChild(labelText);

        const box = new Graphics();
        box.x = 300;
        box.y = y;
        box.eventMode = 'static';
        box.cursor = 'pointer';

        const redraw = () => {
            box.clear();
            box.rect(0, 0, 20, 20);
            box.stroke({ color: 0xFFFFFF, width: 2 });
            if ((SettingsManager as any)[key]) {
                 box.fill(0x00FF00);
            } else {
                 box.fill(0x000000); // clear
            }
        };
        redraw();

        box.on('pointerdown', () => {
             const val = !(SettingsManager as any)[key];
             (SettingsManager as any)[key] = val;
             SettingsManager.save();
             redraw();
        });

        this.container.addChild(box);
    }

    private createSlider(label: string, key: any, min: number, max: number, step: number, y: number) {
        const style = new TextStyle({ fontFamily: 'Arial', fontSize: 16, fill: 'white' });

        const labelText = new Text({ text: label, style });
        labelText.x = 20;
        labelText.y = y;
        this.container.addChild(labelText);

        const valueText = new Text({ text: String((SettingsManager as any)[key]), style });
        valueText.x = 340;
        valueText.y = y;
        this.container.addChild(valueText);

        // Track
        const track = new Graphics();
        track.rect(0, 0, 300, 4);
        track.fill({ color: 0x555555 });
        track.x = 20;
        track.y = y + 25;
        track.eventMode = 'static';
        track.cursor = 'pointer';
        this.container.addChild(track);

        // Handle
        const handle = new Graphics();
        handle.circle(0, 0, 8);
        handle.fill({ color: 0x00FF00 });
        handle.x = 20; // Init at 0
        handle.y = y + 27;
        handle.eventMode = 'static';
        handle.cursor = 'pointer';
        this.container.addChild(handle);

        const sliderWidth = 300;

        // Interaction Logic
        const updateValue = (localX: number) => {
            let pct = localX / sliderWidth;
            pct = Math.max(0, Math.min(1, pct));

            const range = max - min;
            let val = min + range * pct;

            // Snap to step
            val = Math.round(val / step) * step;

            // Write to Settings
            (SettingsManager as any)[key] = val;
            SettingsManager.save();

            // Update UI
            valueText.text = String(val);
            handle.x = 20 + (val - min) / range * sliderWidth;
        };

        const onDrag = (e: any) => {
            const localPos = track.toLocal(e.global);
            updateValue(localPos.x);
        };

        let dragging = false;

        handle.on('pointerdown', (e) => {
            dragging = true;
            onDrag(e);
            e.stopPropagation();
        });

        track.on('pointerdown', (e) => {
            dragging = true;
            onDrag(e);
            e.stopPropagation();
        });

        // Global move/up listener logic needed if trailing off, 
        // but for simple overlay, local move usually ok if track is wide enough.
        // Better: use stage listeners for drag end.
        // For simplicity:
        handle.on('globalpointermove', (e) => { if (dragging) onDrag(e); });
        handle.on('globalpointerup', () => { dragging = false; });
        handle.on('globalpointerupoutside', () => { dragging = false; });
        track.on('globalpointermove', (e) => { if (dragging) onDrag(e); }); // redundant but safer

        // Init visual position
        const currentVal = (SettingsManager as any)[key];
        handle.x = 20 + (currentVal - min) / (max - min) * sliderWidth;

        this.sliders.push({
            label, key, min, max, step, valueText, handle, track, width: sliderWidth
        });
    }

    public toggle() {
        this.isVisible = !this.isVisible;
        this.container.visible = this.isVisible;
    }
}
