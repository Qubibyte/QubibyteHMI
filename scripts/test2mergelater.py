import tkinter as tk

# Configuration
WINDOW_WIDTH, WINDOW_HEIGHT = 1280, 720
BACKGROUND = "#121212"
GATE_BANK_WIDTH = 180
GATE_SIZE = 40
TIMESTEP_COUNT = 12
TIMESTEP_SPACING = 80
QUBIT_SPACING = 60
LEFT_MARGIN = 200
TOP_MARGIN = 60

# Gate Definitions
GATES = {
    "H": "lightblue",
    "X": "red",
    "Y": "orange",
    "Z": "yellow",
    "S": "green",
    "T": "cyan",
    "RX": "pink",
    "RY": "magenta",
    "RZ": "purple",
    "CX": "gray",
    "CZ": "white"
}

class QuantumCircuitBuilder:
    def __init__(self, root):
        self.root = root
        self.root.title("Quantum Circuit Builder")
        self.qubit_count = 0
        self.gates_on_grid = {}  # (timestep, qubit): (gate, color)
        self.dragging = {}

        # Layout frames
        self.main_frame = tk.Frame(root, bg=BACKGROUND)
        self.main_frame.pack(fill="both", expand=True)

        self.gate_bank = tk.Frame(self.main_frame, bg=BACKGROUND, width=GATE_BANK_WIDTH)
        self.gate_bank.pack(side="left", fill="y")

        self.canvas = tk.Canvas(self.main_frame, bg="white")
        self.canvas.pack(side="right", fill="both", expand=True)

        self.setup_ui()

    def setup_ui(self):
        # Build gate bank
        for g, c in GATES.items():
            lbl = tk.Label(self.gate_bank, text=g, bg=c, width=10, height=2)
            lbl.pack(pady=5)
            lbl.bind("<Button-1>", self.start_drag)

        # Add/remove qubit buttons
        tk.Button(self.gate_bank, text="+ Qubit", command=self.add_qubit).pack(pady=10)
        tk.Button(self.gate_bank, text="- Qubit", command=self.remove_qubit).pack()

        self.draw_grid()

    def add_qubit(self):
        self.qubit_count += 1
        self.draw_grid()

    def remove_qubit(self):
        if self.qubit_count > 0:
            self.qubit_count -= 1
            self.gates_on_grid = {
                (t, q): val for (t, q), val in self.gates_on_grid.items() if q < self.qubit_count
            }
            self.draw_grid()

    def draw_grid(self):
        self.canvas.delete("all")
        self.grid_highlights = []

        for q in range(self.qubit_count):
            y = TOP_MARGIN + q * QUBIT_SPACING
            self.canvas.create_text(LEFT_MARGIN - 30, y, text=f"q{q}", font=("Arial", 12))
            self.canvas.create_line(LEFT_MARGIN, y,
                                    LEFT_MARGIN + TIMESTEP_SPACING * TIMESTEP_COUNT, y, width=2)

            for t in range(TIMESTEP_COUNT):
                x = LEFT_MARGIN + t * TIMESTEP_SPACING
                if (t, q) not in self.gates_on_grid:
                    # Draw translucent highlight on empty grid slot
                    box = self.canvas.create_rectangle(
                        x - GATE_SIZE // 2, y - GATE_SIZE // 2,
                        x + GATE_SIZE // 2, y + GATE_SIZE // 2,
                        fill="gray", stipple="gray12", outline=""
                    )
                    self.grid_highlights.append(box)

        # Draw all actual gates
        for (t, q), (g, c) in self.gates_on_grid.items():
            if q >= self.qubit_count:
                continue
            x = LEFT_MARGIN + t * TIMESTEP_SPACING
            y = TOP_MARGIN + q * QUBIT_SPACING
            self.canvas.create_rectangle(x - GATE_SIZE // 2, y - GATE_SIZE // 2,
                                         x + GATE_SIZE // 2, y + GATE_SIZE // 2,
                                         fill=c)
            self.canvas.create_text(x, y, text=g)

    def start_drag(self, event):
        widget = event.widget
        gate = widget.cget("text")
        color = widget.cget("bg")

        # Ghost label for dragging
        ghost = tk.Label(self.canvas, text=gate, bg=color, width=5, height=2)
        ghost.place(x=event.x_root - self.root.winfo_rootx(),
                    y=event.y_root - self.root.winfo_rooty())

        self.dragging = {"gate": gate, "color": color, "ghost": ghost}
        self.canvas.bind("<Motion>", self.drag_move)
        self.canvas.bind("<ButtonRelease-1>", self.drag_drop)

    def drag_move(self, event):
        if "ghost" in self.dragging:
            self.dragging["ghost"].place(x=event.x, y=event.y)
            self.highlight_slot_under_cursor(event.x, event.y)

    def drag_drop(self, event):
        ghost = self.dragging.pop("ghost", None)
        if ghost:
            ghost.destroy()

        gate = self.dragging.get("gate")
        color = self.dragging.get("color")

        self.canvas.delete("snap_highlight")

        for t in range(TIMESTEP_COUNT):
            x = LEFT_MARGIN + t * TIMESTEP_SPACING
            if abs(event.x - x) < GATE_SIZE:
                for q in range(self.qubit_count):
                    y = TOP_MARGIN + q * QUBIT_SPACING
                    if abs(event.y - y) < GATE_SIZE:
                        self.gates_on_grid[(t, q)] = (gate, color)
                        self.draw_grid()
                        return

        self.canvas.unbind("<Motion>")
        self.canvas.unbind("<ButtonRelease-1>")

    def highlight_slot_under_cursor(self, x_mouse, y_mouse):
        self.canvas.delete("snap_highlight")
        closest = None
        min_dist = float("inf")

        for t in range(TIMESTEP_COUNT):
            x = LEFT_MARGIN + t * TIMESTEP_SPACING
            for q in range(self.qubit_count):
                y = TOP_MARGIN + q * QUBIT_SPACING
                if (t, q) in self.gates_on_grid:
                    continue
                dist = ((x - x_mouse) ** 2 + (y - y_mouse) ** 2) ** 0.5
                if dist < min_dist and dist < GATE_SIZE:
                    min_dist = dist
                    closest = (x, y)

        if closest:
            x, y = closest
            self.canvas.create_rectangle(
                x - GATE_SIZE // 2, y - GATE_SIZE // 2,
                x + GATE_SIZE // 2, y + GATE_SIZE // 2,
                fill="gray", stipple="gray50", outline="black",
                tags="snap_highlight"
            )

# === Main App Launch ===
if __name__ == "__main__":
    root = tk.Tk()
    root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
    app = QuantumCircuitBuilder(root)
    root.mainloop()
