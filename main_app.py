import customtkinter as ctk
from tkinterdnd2 import TkinterDnD
import tkinter as tk
from tkinter import filedialog, messagebox
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

        self.title("Production Label Suite DEV!")
        self.geometry("1600x900")

        self.current_show_data = None
        self.current_show_filepath = None
        self.active_frame_name = None

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

        self.show_manager_button = ctk.CTkButton(self.nav_frame, text="Show Info", command=self.show_manager_event)
        self.show_manager_button.grid(row=3, column=0, padx=20, pady=10)

        # --- Content Frames ---
        self.frames = {
            "loom_label": LoomLabelFrame(self, show_toast=self.show_toast),
            "case_label": CaseLabelFrame(self, show_toast=self.show_toast),
            "show_manager": ShowManagerFrame(self, show_toast=self.show_toast)
        }

        self.toast_label = ctk.CTkLabel(self, text="", fg_color="green", text_color="white", corner_radius=5)

        self.create_menubar()
        self.new_show()
        self.select_frame("loom_label")

    def create_menubar(self):
        self.menubar = tk.Menu(self)
        self.config(menu=self.menubar)

        # --- File Menu ---
        self.file_menu = tk.Menu(self.menubar, tearoff=0)
        self.menubar.add_cascade(label="File", menu=self.file_menu)
        # Use lambdas to ensure a consistent call signature (event=None for menu clicks)
        self.file_menu.add_command(label="New Show", command=lambda: self.new_show(), accelerator="Ctrl+N")
        self.file_menu.add_command(label="Open Show...", command=lambda: self.open_show(), accelerator="Ctrl+O")
        self.file_menu.add_separator()
        self.file_menu.add_command(label="Save Show", command=lambda: self.save_show(), accelerator="Ctrl+S")
        self.file_menu.add_command(label="Save Show As...", command=lambda: self.save_show_as(), accelerator="Ctrl+Shift+S")
        self.file_menu.add_separator()
        self.file_menu.add_command(label="Import Sheet from File...", command=lambda: self.call_active_frame_method('import_sheet_from_file'))
        self.file_menu.add_command(label="Export Selected Sheet...", command=lambda: self.call_active_frame_method('export_sheet_to_file'))
        self.file_menu.add_separator()
        self.file_menu.add_command(label="Import Sheet from CSV...", command=lambda: self.call_active_frame_method('import_csv'), accelerator="Ctrl+I")
        self.file_menu.add_command(label="Export Sheet to CSV...", command=lambda: self.call_active_frame_method('export_csv'), accelerator="Ctrl+E")

        # --- Edit Menu ---
        self.edit_menu = tk.Menu(self.menubar, tearoff=0)
        self.menubar.add_cascade(label="Edit", menu=self.edit_menu)
        self.edit_menu.add_command(label="Duplicate Selected", command=lambda: self.call_active_frame_method('duplicate_selected_label'), accelerator="Ctrl+D")
        self.edit_menu.add_command(label="Delete Selected", command=lambda: self.call_active_frame_method('delete_selected_label'), accelerator="Delete")
        self.edit_menu.add_separator()
        self.edit_menu.add_command(label="Clear Current List", command=lambda: self.call_active_frame_method('clear_all_labels'))
        
        self.bind_shortcuts()

    def bind_shortcuts(self):
        """Binds all global shortcuts to their respective handler functions."""
        # File operations
        self.bind_all("<Control-n>", self.new_show)
        self.bind_all("<Command-n>", self.new_show)
        self.bind_all("<Control-o>", self.open_show)
        self.bind_all("<Command-o>", self.open_show)
        self.bind_all("<Control-s>", self.save_show)
        self.bind_all("<Command-s>", self.save_show)
        self.bind_all("<Control-Shift-S>", self.save_show_as)
        self.bind_all("<Command-Shift-S>", self.save_show_as)
        
        # Frame-specific operations routed through a factory
        self.bind_all("<Control-i>", self.call_active_frame_method_factory('import_csv', require_modifier=True))
        self.bind_all("<Command-i>", self.call_active_frame_method_factory('import_csv', require_modifier=True))
        self.bind_all("<Control-e>", self.call_active_frame_method_factory('export_csv', require_modifier=True))
        self.bind_all("<Command-e>", self.call_active_frame_method_factory('export_csv', require_modifier=True))
        self.bind_all("<Control-d>", self.call_active_frame_method_factory('duplicate_selected_label', require_modifier=True))
        self.bind_all("<Command-d>", self.call_active_frame_method_factory('duplicate_selected_label', require_modifier=True))
        
        # Operations without modifiers
        self.bind_all("<Delete>", self.call_active_frame_method_factory('delete_selected_label'))
        self.bind_all("<BackSpace>", self.call_active_frame_method_factory('delete_selected_label'))

    def is_event_from_text_widget(self, event):
        """Checks if the event originated from a text input widget."""
        if event and hasattr(event, 'widget'):
            # Check for CTk and standard Tkinter text widgets
            return isinstance(event.widget, (ctk.CTkEntry, ctk.CTkTextbox, tk.Entry, tk.Text))
        return False

    def call_active_frame_method_factory(self, method_name, require_modifier=False):
        """
        Factory to create a handler for routing calls to the active frame.
        This prevents shortcuts from firing when typing in text fields.
        """
        def handler(event=None):
            print(f"[DEBUG] Shortcut invoked. Method: '{method_name}', Key: '{event.keysym if event else 'N/A'}', Widget: {type(event.widget).__name__ if event else 'N/A'}")
            
            # 1. Ignore shortcut if focus is on a text widget
            if self.is_event_from_text_widget(event):
                print(f"[DEBUG] Ignoring shortcut: Focus is on a text widget.")
                return

            # 2. If a modifier is required, verify it was pressed
            if event and require_modifier:
                # Control mask = 4, Command mask = 8
                if not (event.state & 4 or event.state & 8):
                    print(f"[DEBUG] Ignoring shortcut '{event.keysym}': Modifier key not detected in state {event.state}.")
                    return

            # 3. If checks pass, execute the method
            self.call_active_frame_method(method_name)
        return handler

    def call_active_frame_method(self, method_name):
        """Calls a method on the currently active frame if it exists."""
        if self.active_frame_name:
            active_frame = self.frames[self.active_frame_name]
            if hasattr(active_frame, method_name):
                getattr(active_frame, method_name)()
            else:
                print(f"[DEBUG] Method '{method_name}' not found on active frame '{self.active_frame_name}'.")
        else:
            print(f"[DEBUG] No active frame to call method '{method_name}'.")

    def show_toast(self, message, color="green"):
        self.toast_label.configure(text=message, fg_color=color)
        self.toast_label.place(relx=0.01, rely=0.95, anchor="sw")
        self.toast_label.after(3000, self.hide_toast)

    def hide_toast(self):
        self.toast_label.place_forget()

    def select_frame(self, name):
        self.active_frame_name = name
        buttons = { "loom_label": self.loom_label_button, "case_label": self.case_label_button, "show_manager": self.show_manager_button }
        
        for btn_name, button in buttons.items():
            button.configure(fg_color=("gray75", "gray25") if name == btn_name else "transparent")
        
        for frame in self.frames.values():
            frame.grid_forget()
        
        self.frames[name].grid(row=0, column=1, sticky="nsew")
        self.update_menubar_state(name)

    def update_menubar_state(self, frame_name):
        is_label_frame = frame_name in ["loom_label", "case_label"]
        menu_state = "normal" if is_label_frame else "disabled"
        
        self.file_menu.entryconfig("Import Sheet from File...", state=menu_state)
        self.file_menu.entryconfig("Export Selected Sheet...", state=menu_state)
        self.file_menu.entryconfig("Import Sheet from CSV...", state=menu_state)
        self.file_menu.entryconfig("Export Sheet to CSV...", state=menu_state)
        self.menubar.entryconfig("Edit", state=menu_state)

    # --- Shortcut Handlers ---

    def new_show(self, event=None):
        if event: # Called by a shortcut
            print(f"[DEBUG] Shortcut triggered for 'New Show'. Key: '{event.keysym}', State: {event.state}, Widget: {type(event.widget).__name__}")
            if self.is_event_from_text_widget(event):
                print("[DEBUG] Ignoring 'New Show' shortcut: Focus is on a text widget.")
                return
            if not (event.state & 4 or event.state & 8): # Check for Ctrl or Command
                 print(f"[DEBUG] Ignoring 'New Show' shortcut: Modifier key not detected in state {event.state}.")
                 return
        else: # Called by the menu
            print("[DEBUG] Menu triggered 'New Show'")
        
        self.current_show_data = {"info": {}, "loom_sheets": {}, "case_sheets": {}}
        self.current_show_filepath = None
        self.update_all_frames()
        self.title("Production Label Suite - Untitled Show")

    def open_show(self, event=None):
        if event:
            print(f"[DEBUG] Shortcut triggered for 'Open Show'. Key: '{event.keysym}', State: {event.state}, Widget: {type(event.widget).__name__}")
            if self.is_event_from_text_widget(event):
                print("[DEBUG] Ignoring 'Open Show' shortcut: Focus is on a text widget.")
                return
            if not (event.state & 4 or event.state & 8):
                 print(f"[DEBUG] Ignoring 'Open Show' shortcut: Modifier key not detected in state {event.state}.")
                 return
        else:
            print("[DEBUG] Menu triggered 'Open Show'")

        path = filedialog.askopenfilename(filetypes=[("Show Files", "*.show")])
        if not path: return
        try:
            with open(path, 'r') as f: self.current_show_data = json.load(f)
            self.current_show_filepath = path
            self.update_all_frames()
            self.title(f"Production Label Suite - {os.path.basename(path)}")
            self.show_toast("Show loaded successfully.")
        except Exception as e:
            messagebox.showerror("Error", f"Could not open show file: {e}")

    def save_show(self, event=None):
        if event:
            print(f"[DEBUG] Shortcut triggered for 'Save Show'. Key: '{event.keysym}', State: {event.state}, Widget: {type(event.widget).__name__}")
            if self.is_event_from_text_widget(event):
                print("[DEBUG] Ignoring 'Save Show' shortcut: Focus is on a text widget.")
                return
            if not (event.state & 4 or event.state & 8):
                 print(f"[DEBUG] Ignoring 'Save Show' shortcut: Modifier key not detected in state {event.state}.")
                 return
        else:
            print("[DEBUG] Menu triggered 'Save Show'")

        if not self.current_show_filepath:
            self.save_show_as()
        else:
            self._write_show_file(self.current_show_filepath)

    def save_show_as(self, event=None):
        if event:
            print(f"[DEBUG] Shortcut triggered for 'Save Show As'. Key: '{event.keysym}', State: {event.state}, Widget: {type(event.widget).__name__}")
            if self.is_event_from_text_widget(event):
                print("[DEBUG] Ignoring 'Save Show As' shortcut: Focus is on a text widget.")
                return
            # Shift mask = 1, Ctrl = 4, Command = 8
            if not ((event.state & 1) and (event.state & 4 or event.state & 8)):
                 print(f"[DEBUG] Ignoring 'Save Show As' shortcut: Modifiers not detected in state {event.state}.")
                 return
        else:
            print("[DEBUG] Menu triggered 'Save Show As'")

        path = filedialog.asksaveasfilename(defaultextension=".show", filetypes=[("Show Files", "*.show")])
        if not path: return
        self._write_show_file(path)
        self.current_show_filepath = path
        self.title(f"Production Label Suite - {os.path.basename(path)}")

    def _write_show_file(self, path):
        try:
            self.current_show_data["info"] = self.frames["show_manager"].get_data()
            self.current_show_data["loom_sheets"] = self.frames["loom_label"].sheets_data
            self.current_show_data["case_sheets"] = self.frames["case_label"].sheets_data
            with open(path, 'w') as f: json.dump(self.current_show_data, f, indent=4)
            self.show_toast("Show saved successfully.")
        except Exception as e:
            messagebox.showerror("Error", f"Could not save show file: {e}")

    def update_all_frames(self):
        self.frames["show_manager"].load_show_data(self.current_show_data.get("info", {}))
        self.frames["loom_label"].load_show_data(self.current_show_data.get("loom_sheets", {}))
        self.frames["case_label"].load_show_data(self.current_show_data.get("case_sheets", {}))

    def loom_label_event(self): self.select_frame("loom_label")
    def case_label_event(self): self.select_frame("case_label")
    def show_manager_event(self): self.select_frame("show_manager")

if __name__ == "__main__":
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    app = App()
    app.mainloop()
