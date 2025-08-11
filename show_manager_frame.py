import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import customtkinter as ctk
import json
import os
from app_utils import get_app_data_path

class ShowManagerFrame(ctk.CTkFrame):
    def __init__(self, master, show_toast):
        super().__init__(master)
        self.show_toast = show_toast
        self.config_file_path = get_app_data_path("shows.show")
        self.data = self.load_data()
        self._create_widgets()
        self.populate_show_list()
        self.bind_shortcuts() # Add call to bind shortcuts

    def _create_widgets(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        list_frame = ctk.CTkFrame(self)
        list_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        list_frame.grid_rowconfigure(0, weight=1)
        list_frame.grid_columnconfigure(0, weight=1)

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#2a2d2e", foreground="white", fieldbackground="#2a2d2e", borderwidth=0)
        style.map('Treeview', background=[('selected', '#22559b')])
        style.configure("Treeview.Heading", background="#565b5e", foreground="white", relief="flat")
        style.map("Treeview.Heading", background=[('active', '#3484F0')])
        
        self.tree = ttk.Treeview(list_frame, columns=("name", "active"), show="headings")
        self.tree.heading("name", text="Show Name")
        self.tree.heading("active", text="Active")
        self.tree.column("active", width=60, anchor="center")
        self.tree.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")
        self.tree.bind("<<TreeviewSelect>>", self.on_show_select)

        details_frame = ctk.CTkFrame(self)
        details_frame.grid(row=0, column=1, padx=(0, 20), pady=20, sticky="nsew")
        details_frame.grid_columnconfigure(1, weight=1)

        self.detail_widgets = {}
        fields = {
            "Show Name": "show_name", "Show Logo": "logo_path", 
            "Production Video": "production_video", "Production Manager": "production_manager",
            "PM Email": "pm_email"
        }
        
        for i, (label, key) in enumerate(fields.items()):
            ctk.CTkLabel(details_frame, text=f"{label}:").grid(row=i, column=0, padx=10, pady=8, sticky="w")
            entry = ctk.CTkEntry(details_frame)
            entry.grid(row=i, column=1, padx=10, pady=8, sticky="ew")
            self.detail_widgets[key] = entry
        
        logo_btn = ctk.CTkButton(details_frame, text="...", width=30, command=self.browse_logo)
        logo_btn.grid(row=1, column=2, padx=(0, 10))

        btn_frame = ctk.CTkFrame(details_frame, fg_color="transparent")
        btn_frame.grid(row=len(fields), column=0, columnspan=3, pady=20)
        
        ctk.CTkButton(btn_frame, text="Add New", command=self.add_new_show).pack(side="left", padx=5)
        ctk.CTkButton(btn_frame, text="Update Selected", command=self.update_show).pack(side="left", padx=5)
        ctk.CTkButton(btn_frame, text="Delete Selected", command=self.delete_show).pack(side="left", padx=5)

        ctk.CTkButton(details_frame, text="Set as Active Show", command=self.set_active_show).grid(row=len(fields)+1, column=0, columnspan=3, pady=10, padx=10, sticky="ew")

    def bind_shortcuts(self):
        """Binds keyboard shortcuts for the Show Manager."""
        self.master.bind_all("<Control-i>", lambda event: self.import_shows())
        self.master.bind_all("<Command-i>", lambda event: self.import_shows())
        self.master.bind_all("<Control-e>", lambda event: self.export_shows())
        self.master.bind_all("<Command-e>", lambda event: self.export_shows())

    def load_data(self):
        if not os.path.exists(self.config_file_path): return {"active_show": None, "shows": {}}
        try:
            with open(self.config_file_path, 'r') as f: return json.load(f)
        except Exception: return {"active_show": None, "shows": {}}

    def save_data(self):
        try:
            with open(self.config_file_path, 'w') as f: json.dump(self.data, f, indent=4)
        except IOError: messagebox.showerror("Error", "Could not save data.")

    def populate_show_list(self):
        self.tree.delete(*self.tree.get_children())
        active_show = self.data.get("active_show")
        for name in sorted(self.data.get("shows", {})):
            self.tree.insert("", "end", values=(name, "★" if name == active_show else ""), iid=name)

    def on_show_select(self, event=None):
        if not self.tree.selection():
            self.clear_details()
            return
        show_name = self.tree.selection()[0]
        show_data = self.data["shows"].get(show_name, {})
        self.detail_widgets["show_name"].delete(0, "end")
        self.detail_widgets["show_name"].insert(0, show_name)
        for key, widget in self.detail_widgets.items():
            if key != "show_name":
                widget.delete(0, "end")
                widget.insert(0, show_data.get(key, ""))

    def clear_details(self):
        for widget in self.detail_widgets.values(): widget.delete(0, "end")

    def browse_logo(self):
        path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if path:
            self.detail_widgets["logo_path"].delete(0, "end")
            self.detail_widgets["logo_path"].insert(0, path)

    def add_new_show(self):
        show_name = self.detail_widgets["show_name"].get()
        if not show_name: messagebox.showerror("Error", "Show Name cannot be empty."); return
        if show_name in self.data["shows"]: messagebox.showerror("Error", "Show name already exists."); return
        self.data["shows"][show_name] = {k: w.get() for k, w in self.detail_widgets.items() if k != "show_name"}
        self.save_data()
        self.populate_show_list()
        self.clear_details()
        self.show_toast(f"Show '{show_name}' added.")

    def update_show(self):
        if not self.tree.selection(): messagebox.showerror("Error", "No show selected."); return
        original_name, new_name = self.tree.selection()[0], self.detail_widgets["show_name"].get()
        if not new_name: messagebox.showerror("Error", "Show Name cannot be empty."); return
        if original_name != new_name:
            if new_name in self.data["shows"]: messagebox.showerror("Error", "New show name already exists."); return
            del self.data["shows"][original_name]
            if self.data["active_show"] == original_name: self.data["active_show"] = new_name
        self.data["shows"][new_name] = {k: w.get() for k, w in self.detail_widgets.items() if k != "show_name"}
        self.save_data()
        self.populate_show_list()
        self.show_toast(f"Show '{new_name}' updated.")

    def delete_show(self):
        if not self.tree.selection(): messagebox.showerror("Error", "No show selected."); return
        show_name = self.tree.selection()[0]
        if messagebox.askyesno("Confirm", f"Delete '{show_name}'?"):
            del self.data["shows"][show_name]
            if self.data["active_show"] == show_name: self.data["active_show"] = None
            self.save_data()
            self.populate_show_list()
            self.clear_details()
            self.show_toast(f"Show '{show_name}' deleted.")

    def set_active_show(self):
        if not self.tree.selection(): messagebox.showerror("Error", "No show selected."); return
        show_name = self.tree.selection()[0]
        self.data["active_show"] = show_name
        self.save_data()
        self.populate_show_list()
        self.show_toast(f"'{show_name}' is now the active show.")

    def import_shows(self):
        path = filedialog.askopenfilename(filetypes=[("Show files", "*.show")])
        if not path or not messagebox.askyesno("Confirm", "This will overwrite your current show list. Are you sure?"): return
        try:
            with open(path, 'r') as f: self.data = json.load(f)
            self.save_data()
            self.populate_show_list()
            self.show_toast("Show data imported successfully.")
        except Exception as e: messagebox.showerror("Import Error", f"Could not import file: {e}")

    def export_shows(self):
        path = filedialog.asksaveasfilename(defaultextension=".show", filetypes=[("Show files", "*.show")])
        if not path: return
        try:
            with open(path, 'w') as f: json.dump(self.data, f, indent=4)
            self.show_toast("Show data exported successfully.")
        except Exception as e: messagebox.showerror("Export Error", f"Could not export file: {e}")
