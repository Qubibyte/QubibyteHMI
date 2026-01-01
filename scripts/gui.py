import sys
import time
import os
import math
import tkinter as tk
import tkinter.font as tkFont
import subprocess
import datetime
import socket

# === Add PIL path ===
script_dir = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(script_dir, "..", "libraries"))

from PIL import Image, ImageTk
import psutil

# === Configuration ===
testingmode = 1

# === Color Utilities ===
def rgb_to_hex(rgb):
    return "#%02x%02x%02x" % rgb

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip("#")
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def interpolate_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

STARTUP_BACKGROUND_COLOR = "#121212"
BACKGROUND_COLOR = "#3C1E82"
EVERYWHERE_BLUE = "#0687C9"
ALLATONCE_PINK = "#AB6FAF"
everywhere_color = hex_to_rgb(EVERYWHERE_BLUE)
all_at_once_color = hex_to_rgb(ALLATONCE_PINK)
startup_bg_color = hex_to_rgb(STARTUP_BACKGROUND_COLOR)

# === Global Variables ===
started = 0
currentgui = "startup"
logoLabel = None
circle_frame = None
circle_canvas = None
system_info_label = None
everywhere_text = None
all_at_once_text = None
startup_frame = None
logo_label = None
canvas = None
prompt_label = None
logo_scale = 1
LOGO_SCALE_STEP = 0.2
LOGO_MAX_SCALE = 10.0
SLOGAN_FADE_STEPS = 200
SLOGAN_FADE_DELAY = 6
prompt_fade_step = 0
prompt_fade_direction = 1
PROMPT_FADE_STEPS = 100
button_elements = []

buttons_info = {
    "CIRCUIT BUILDER": ("#2F8D80", "circuitbuilder.png", (115,115)),
    "CALIBRATION": ("#A8782F", "calibration.png", (95,95)),
    "LESSONS": ("#724A97", "lessons.png", (155,155)),
    "SETTINGS": ("#2A61AF", "settings.png", (85,85)),
    "EXIT": ("#8F2323", "exit.png", (170,170)),
}

# === Load Logo ===
logo_original = Image.open(os.path.join(script_dir, "..", "media", "logo.png"))
logo_fav = Image.open(os.path.join(script_dir, "..", "media", "fav.png"))

# === App Window ===
win = tk.Tk()
win.title("Qubibyte HMI")

if testingmode:
    win.geometry("1280x720")
    print("Screen dimensions: 1280 x 720 (testing mode)")
else:
    win.attributes("-fullscreen", True)
    win.overrideredirect(True)
    win.config(cursor="none")
    screen_w = win.winfo_screenwidth()
    screen_h = win.winfo_screenheight()
    win.geometry(f"{screen_w}x{screen_h}+0+0")
    print(f"Screen dimensions: {screen_w} x {screen_h} (fullscreen mode)")

win.configure(bg=BACKGROUND_COLOR)
win.update()
WINDOW_WIDTH = win.winfo_width()
WINDOW_HEIGHT = win.winfo_height()

# === Fonts ===
try:
    buttonFont = tkFont.Font(family="Khand", size=16, weight="bold")
    promptFont = tkFont.Font(family="Khand", size=48, weight="bold")
    sloganFont = tkFont.Font(family="Jockey One", size=60, weight="bold")
except:
    buttonFont = tkFont.Font(family="Helvetica", size=16, weight="bold")
    promptFont = tkFont.Font(family="Helvetica", size=48, weight="bold")
    sloganFont = tkFont.Font(family="Helvetica", size=60, weight="bold")

def load_startup_gui():
    global startup_frame, canvas, logo_label, prompt_label

    # === Startup Screen ===
    startup_frame = tk.Frame(win, bg=STARTUP_BACKGROUND_COLOR)
    startup_frame.pack(fill="both", expand=True)

    canvas = tk.Canvas(startup_frame, bg=STARTUP_BACKGROUND_COLOR, highlightthickness=0)
    canvas.pack(fill="both", expand=True)

    logo_label = tk.Label(startup_frame, bg=STARTUP_BACKGROUND_COLOR)
    logo_label.place(relx=0.5, rely=0.4, anchor="center")

    prompt_label = tk.Label(startup_frame, text="CLICK ANYWHERE TO BEGIN",
                            font=promptFont, bg=STARTUP_BACKGROUND_COLOR)


    
    # === Bind startup clicks ===
    startup_frame.bind("<Button-1>", lambda event: load("main"))
    canvas.bind("<Button-1>", lambda event: load("main"))
    logo_label.bind("<Button-1>", lambda event: load("main"))
    prompt_label.bind("<Button-1>", lambda event: load("main"))
    #win.bind("<Button-1>", lambda event: load("main"))



    # === Start ===
    init_canvas_text()
    animate_logo()
    win.mainloop()

def unload_startup_gui():
    global startup_frame, canvas, logo_label, prompt_label
    startup_frame.destroy()
    canvas.destroy()
    logo_label.destroy()
    prompt_label.destroy()
    


def init_canvas_text():
    global everywhere_text, all_at_once_text, canvas
    win.update()

    everywhere_text = canvas.create_text(int(WINDOW_WIDTH * 0.328125), int(WINDOW_HEIGHT * 0.75),
                                        text="EVERYWHERE,", font=sloganFont,
                                        fill=STARTUP_BACKGROUND_COLOR, anchor="s")
    all_at_once_text = canvas.create_text(int(WINDOW_WIDTH * 0.671875), int(WINDOW_HEIGHT * 0.75),
                                        text="ALL AT ONCE.", font=sloganFont,
                                        fill=STARTUP_BACKGROUND_COLOR, anchor="s")


def animate_logo():
    if started:
        return
    global logo_scale
    if logo_scale <= LOGO_MAX_SCALE:
        sizex = int(53 * logo_scale)
        sizey = int(27 * logo_scale)
        resized = logo_original.resize((sizex, sizey), Image.LANCZOS)
        logo = ImageTk.PhotoImage(resized)
        logo_label.config(image=logo)
        logo_label.image = logo
        logo_scale += LOGO_SCALE_STEP
        win.after(7, animate_logo)
    else:
        fade_in_slogan(0)


def fade_in_slogan(step):
    if started:
        return
    if step <= SLOGAN_FADE_STEPS:
        t = step / SLOGAN_FADE_STEPS
        new_everywhere_color = interpolate_color(startup_bg_color, everywhere_color, t)
        new_all_at_once_color = interpolate_color(startup_bg_color, all_at_once_color, t)
        canvas.itemconfig(everywhere_text, fill=rgb_to_hex(new_everywhere_color))
        canvas.itemconfig(all_at_once_text, fill=rgb_to_hex(new_all_at_once_color))
        win.after(SLOGAN_FADE_DELAY, lambda: fade_in_slogan(step + 1))
    else:
        prompt_label.place(relx=0.5, rely=0.95, anchor="s")
        fade_prompt()


# === Prompt Fade-In/Out Animation ===
def fade_prompt():
    if started:
        return
    global prompt_fade_step, prompt_fade_direction
    t = prompt_fade_step / PROMPT_FADE_STEPS
    interp_color = interpolate_color(startup_bg_color, (255, 255, 255), t)
    prompt_label.config(fg=rgb_to_hex(interp_color))
    prompt_fade_step += prompt_fade_direction
    if prompt_fade_step >= PROMPT_FADE_STEPS or prompt_fade_step <= 0:
        prompt_fade_direction *= -1
    win.after(10, fade_prompt)

# === Top Bar ===
def load_top_bar():
    global system_info_label
    top_bar = tk.Frame(win, bg=BACKGROUND_COLOR, height=27)
    top_bar.pack(fill="x", side="top")

    try:
        logoImage = logo_original.resize((53, 27), Image.LANCZOS)
        logo = ImageTk.PhotoImage(logoImage)
        logoLabel = tk.Label(top_bar, image=logo, bg=BACKGROUND_COLOR)
        logoLabel.image = logo
        logoLabel.pack(side="left", padx=20)
    except Exception as e:
        print(f"Failed to load image: {e}")

    # === System Info Stuff in Top Bar ===
    system_info_label = tk.Label(top_bar, text="", font=buttonFont, fg="white", bg=BACKGROUND_COLOR)
    system_info_label.pack(side="right", padx=20)

def update_system_info():
    now = datetime.datetime.now().strftime("%H:%M")
    temp = get_cpu_temperature()
    system_info_label.config(text=f"{temp}   {now}")
    win.after(5000, update_system_info)

def get_cpu_temperature():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            temp_f = (int(f.read()) / 1000) * 9/5 + 32
            return f"{temp_f:.1f}*F"
    except:
        return ""

def load(gui, event=None):
    global currentgui
    if gui == "startup":
        load_startup_gui()
    if gui == "topbar":
        load_top_bar()
    if gui == "main":
        global started
        if not started:
            started = 1
            unload("startup")
            load("topbar")
            update_system_info()
        else:
            unload(currentgui)
        load_main_gui()
        currentgui = gui
    if gui == "circuitbuilder":
        unload(currentgui)
        load_circuitbuilder_gui()
        currentgui = gui
    
def unload(gui):
    if gui == "startup":
        unload_startup_gui()
    if gui == "main":
        unload_main_gui()

# === Main GUI full load-up ===
def load_main_gui():
    global logoLabel, circle_frame, circle_canvas, icon_images

    # === Circle Layout ===
    icon_images = {}

    for name, (color, filename, size) in buttons_info.items():
        try:
            path = os.path.join(script_dir, "..", "media", filename)
            img = Image.open(path).resize(size, Image.LANCZOS)
            icon_images[name] = ImageTk.PhotoImage(img)
        except Exception as e:
            print(f"Failed to load icon '{filename}' for '{name}': {e}")
            icon_images[name] = None

    circle_frame = tk.Frame(win, bg=BACKGROUND_COLOR)
    circle_frame.pack(expand=True, fill="both")

    circle_canvas = tk.Canvas(circle_frame, width=WINDOW_WIDTH, height=WINDOW_HEIGHT, highlightthickness=0)
    circle_canvas.pack()

    draw_circle_buttons(circle_canvas)

def unload_main_gui():
    circle_frame.destroy()

def draw_circle_buttons(canvas):
    canvas.delete("all")
    button_elements.clear()

    if not hasattr(canvas, "image_refs"):
        canvas.image_refs = []
    else:
        canvas.image_refs.clear()

    try:
        bg_path = os.path.join(script_dir, "..", "media", "background.png")
        bg_img = Image.open(bg_path).resize((WINDOW_WIDTH, WINDOW_HEIGHT), Image.LANCZOS)
        bg_photo = ImageTk.PhotoImage(bg_img)
        canvas.bg_photo = bg_photo
        canvas.create_image(0, 0, anchor="nw", image=bg_photo)
    except Exception as e:
        print(f"Failed to load background image: {e}")

    cx, cy = WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2
    radius = WINDOW_WIDTH * 0.140625
    angle_step = 2 * math.pi / len(buttons_info)
    start_angle = -math.pi / 2

    for i, (text, (color, imagepath, imagesize)) in enumerate(buttons_info.items()):
        angle = start_angle + i * angle_step
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)

        DIST = 95
        STEPS = 200
        base_rgb = hex_to_rgb(color)
        lighter_rgb = tuple(min(255, base_rgb[i] + 60) for i in range(3))

        for j in range(STEPS):
            t = j / STEPS
            interp_color = interpolate_color(base_rgb, lighter_rgb, t)
            fill = rgb_to_hex(interp_color)
            shrink = DIST * t
            canvas.create_oval(
                x - DIST + shrink, y - DIST + shrink,
                x + DIST - shrink, y + DIST - shrink,
                fill=fill, outline=""
            )

        icon_img = icon_images.get(text)
        if icon_img:
            icon_id = canvas.create_image(x, y-10, image=icon_img)
            canvas.image_refs.append(icon_img)
        else:
            icon_id = None

        text_id = canvas.create_text(x, y + 55, text=text, fill="white", font=buttonFont)
        button_elements.append((text, icon_id, text_id))

        if text == "EXIT":
            def make_exit_callback():
                return lambda e: win.destroy()
            callback = make_exit_callback()
            for item_id in (icon_id, text_id):
                if item_id:
                    canvas.tag_bind(item_id, "<Button-1>", callback)
        elif text == "CIRCUIT BUILDER":
            for item_id in (icon_id, text_id):
                if item_id:
                    canvas.tag_bind(item_id, "<Button-1>", lambda event: load("circuitbuilder"))
            
def load_circuitbuilder_gui(event=None):
    circuitbuilder_frame = tk.Frame(win, bg=STARTUP_BACKGROUND_COLOR)
    circuitbuilder_frame.pack(expand=True, fill="both")

    circuitbuilder_canvas = tk.Canvas(
        circuitbuilder_frame,
        width=WINDOW_WIDTH / 2,
        height=WINDOW_HEIGHT / 2,
        highlightthickness=0,
        bg="white"
    )
    circuitbuilder_canvas.place(relx=0.5, rely=0.5, anchor="center")

    start_x = 50
    spacing_x = 100
    qubit_y_positions = [50, 100]

    # Draw qubit wires
    for y in qubit_y_positions:
        circuitbuilder_canvas.create_line(start_x, y, start_x + 3 * spacing_x, y, width=2)

    # === Draggable Item Storage ===
    draggable_items = {}

    # --- HADAMARD GATE ---
    h_x = start_x + spacing_x
    h_y = qubit_y_positions[0]
    h_size = 30
    h_rect = circuitbuilder_canvas.create_rectangle(h_x - h_size/2, h_y - h_size/2, h_x + h_size/2, h_y + h_size/2, fill="lightblue")
    h_text = circuitbuilder_canvas.create_text(h_x, h_y, text="H", font=("Arial", 14, "bold"))
    draggable_items[h_rect] = {'type': 'gate', 'offset': (0, 0)}
    draggable_items[h_text] = {'type': 'label', 'linked': h_rect}

    # --- CNOT GATE ---
    cnot_x = start_x + 2 * spacing_x
    control_y = qubit_y_positions[0]
    target_y = qubit_y_positions[1]
    c_dot = circuitbuilder_canvas.create_oval(cnot_x - 4, control_y - 4, cnot_x + 4, control_y + 4, fill="black")
    c_line = circuitbuilder_canvas.create_line(cnot_x, control_y, cnot_x, target_y, width=2)
    radius = 10
    t_circle = circuitbuilder_canvas.create_oval(cnot_x - radius, target_y - radius, cnot_x + radius, target_y + radius)
    t_horiz = circuitbuilder_canvas.create_line(cnot_x - radius, target_y, cnot_x + radius, target_y)
    t_vert = circuitbuilder_canvas.create_line(cnot_x, target_y - radius, cnot_x, target_y + radius)

    # Group CNOT pieces into one logical gate for dragging
    cnot_group = [c_dot, c_line, t_circle, t_horiz, t_vert]
    for item in cnot_group:
        draggable_items[item] = {'type': 'cnot', 'group': cnot_group, 'offset': (0, 0)}

    # --- QUBIT LABELS ---
    circuitbuilder_canvas.create_text(start_x - 20, qubit_y_positions[0], text="q0", font=("Arial", 12))
    circuitbuilder_canvas.create_text(start_x - 20, qubit_y_positions[1], text="q1", font=("Arial", 12))

    # === DRAG HANDLERS ===
    drag_data = {'item': None, 'offset_x': 0, 'offset_y': 0}

    def on_press(event):
        item = circuitbuilder_canvas.find_closest(event.x, event.y)[0]
        if item in draggable_items:
            drag_data['item'] = item
            coords = circuitbuilder_canvas.coords(item)
            if len(coords) >= 2:
                x, y = coords[0], coords[1]
                drag_data['offset_x'] = event.x - x
                drag_data['offset_y'] = event.y - y

    def on_motion(event):
        item = drag_data['item']
        if item and item in draggable_items:
            dx = event.x - drag_data['offset_x']
            dy = event.y - drag_data['offset_y']
            data = draggable_items[item]

            if data['type'] == 'gate':
                # Move rectangle and label together
                linked_text = None
                for key, val in draggable_items.items():
                    if val.get('linked') == item:
                        linked_text = key
                        break
                coords = circuitbuilder_canvas.coords(item)
                cx = (coords[0] + coords[2]) / 2
                cy = (coords[1] + coords[3]) / 2
                delta_x = dx - cx
                delta_y = dy - cy
                circuitbuilder_canvas.move(item, delta_x, delta_y)
                if linked_text:
                    circuitbuilder_canvas.move(linked_text, delta_x, delta_y)

            elif data['type'] == 'cnot':
                group = data['group']
                # Move all elements in the group
                for g_item in group:
                    circuitbuilder_canvas.move(g_item, event.x - drag_data['offset_x'], event.y - drag_data['offset_y'])
                drag_data['offset_x'] = event.x
                drag_data['offset_y'] = event.y

    def on_release(event):
        drag_data['item'] = None

    circuitbuilder_canvas.bind("<ButtonPress-1>", on_press)
    circuitbuilder_canvas.bind("<B1-Motion>", on_motion)
    circuitbuilder_canvas.bind("<ButtonRelease-1>", on_release)



load(currentgui)