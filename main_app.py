import customtkinter as ctk
from tkinterdnd2 import TkinterDnD
import json
import os

# Import the new frame-based classes from our modules
from loom_label_frame import LoomLabelFrame
from case_label_frame import CaseLabelFrame
from show_manager_frame import ShowManagerFrame

# Create a new root class that inherits from both CTk and the DnD library
class CTkDnD(ctk.CTk, TkinterDnD.DnDWrapper):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.TkdndVersion = TkinterDnD._require(self)

class App(CTkDnD):
    def __init__(self):
        super().__init__()

        self.title("Production Label Suite")
        self.geometry("1600x900")

        # Set the overall grid layout
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        # --- Navigation Frame (Sidebar) ---
        self.nav_frame = ctk.CTkFrame(self, width=140, corner_radius=0)
        self.nav_frame.grid(row=0, column=0, sticky="nsew")
        self.nav_frame.grid_rowconfigure(4, weight=1)

        self.nav_title = ctk.CTkLabel(self.nav_frame, text="Production Label Suite", font=ctk.CTkFont(size=20, weight="bold"))
        self.nav_title.grid(row=0, column=0, padx=20, pady=(20, 10))

        self.loom_label_button = ctk.CTkButton(self.nav_frame, text="Loom Labels", command=self.loom_label_event)
        self.loom_label_button.grid(row=1, column=0, padx=20, pady=10)

        self.case_label_button = ctk.CTkButton(self.nav_frame, text="Case Labels", command=self.case_label_event)
        self.case_label_button.grid(row=2, column=0, padx=20, pady=10)

        self.show_manager_button = ctk.CTkButton(self.nav_frame, text="Show Manager", command=self.show_manager_event)
        self.show_manager_button.grid(row=3, column=0, padx=20, pady=10)

        # --- Content Frames ---
        self.loom_label_frame = LoomLabelFrame(self, show_toast=self.show_toast)
        self.case_label_frame = CaseLabelFrame(self, show_toast=self.show_toast)
        self.show_manager_frame = ShowManagerFrame(self, show_toast=self.show_toast)

        # --- Toast Notification Label ---
        self.toast_label = ctk.CTkLabel(self, text="", fg_color="green", text_color="white", corner_radius=5)

        self.select_frame("loom_label")

    def show_toast(self, message, color="green"):
        self.toast_label.configure(text=message, fg_color=color)
        self.toast_label.place(relx=0.01, rely=0.95, anchor="sw")
        self.toast_label.after(3000, self.hide_toast)

    def hide_toast(self):
        self.toast_label.place_forget()

    def select_frame(self, name):
        buttons = {
            "loom_label": self.loom_label_button,
            "case_label": self.case_label_button,
            "show_manager": self.show_manager_button
        }
        frames = {
            "loom_label": self.loom_label_frame,
            "case_label": self.case_label_frame,
            "show_manager": self.show_manager_frame
        }

        for btn_name, button in buttons.items():
            button.configure(fg_color=("gray75", "gray25") if name == btn_name else "transparent")
        
        for frame in frames.values():
            frame.grid_forget()

        if name == "case_label":
            frames[name].load_default_data(self.get_active_show_data())
        
        frames[name].grid(row=0, column=1, sticky="nsew")

    def loom_label_event(self): self.select_frame("loom_label")
    def case_label_event(self): self.select_frame("case_label")
    def show_manager_event(self): self.select_frame("show_manager")
    
    def get_active_show_data(self):
        config_file = "shows.json"
        if not os.path.exists(config_file): return None
        try:
            with open(config_file, 'r') as f: data = json.load(f)
            active_show_name = data.get("active_show")
            if active_show_name: return data.get("shows", {}).get(active_show_name)
        except Exception as e: print(f"Could not load active show data: {e}")
        return None

if __name__ == "__main__":
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    app = App()
    app.mainloop()
