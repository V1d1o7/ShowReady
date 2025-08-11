import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
import json
import os
from tkinterdnd2 import DND_FILES
from PIL import Image

class ShowManagerFrame(ctk.CTkFrame):
    def __init__(self, master, show_toast):
        super().__init__(master)
        self.show_toast = show_toast
        self._create_widgets()

    def _create_widgets(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Main container frame
        details_frame = ctk.CTkFrame(self)
        details_frame.pack(padx=20, pady=20, expand=True, fill="both")
        details_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(details_frame, text="Current Show Information", font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=0, columnspan=3, pady=(0, 20))

        self.detail_widgets = {}
        fields = {
            "Show Name": "show_name", 
            "Show Logo": "logo_path", 
            "Production Video": "production_video", 
            "Production Manager": "production_manager",
            "PM Email": "pm_email"
        }
        
        for i, (label, key) in enumerate(fields.items()):
            ctk.CTkLabel(details_frame, text=f"{label}:").grid(row=i+1, column=0, padx=10, pady=8, sticky="w")
            entry = ctk.CTkEntry(details_frame)
            entry.grid(row=i+1, column=1, padx=10, pady=8, sticky="ew")
            self.detail_widgets[key] = entry
        
        logo_btn = ctk.CTkButton(details_frame, text="...", width=30, command=self.browse_logo)
        logo_btn.grid(row=2, column=2, padx=(0, 10))
        
        # Image Preview and Drop Target
        self.img_preview_label = ctk.CTkLabel(details_frame, text="No image selected\n\n(Drop image here)", height=150)
        self.img_preview_label.grid(row=len(fields)+1, column=0, columnspan=3, pady=20, sticky="ew")
        self.img_preview_label.drop_target_register(DND_FILES)
        self.img_preview_label.dnd_bind('<<Drop>>', self.on_image_drop)

    def on_image_drop(self, event):
        path = event.data.strip('{}')
        if os.path.exists(path):
            self.detail_widgets["logo_path"].delete(0, tk.END)
            self.detail_widgets["logo_path"].insert(0, path)
            self.update_image_preview(path)
            self.show_toast("Image loaded successfully.")

    def browse_logo(self):
        path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if path:
            self.detail_widgets["logo_path"].delete(0, tk.END)
            self.detail_widgets["logo_path"].insert(0, path)
            self.update_image_preview(path)

    def update_image_preview(self, image_path):
        if not image_path or not os.path.exists(image_path):
            self.img_preview_label.configure(image=None, text="No image selected\n\n(Drop image here)")
            return
        try:
            pil_image = Image.open(image_path)
            ctk_image = ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=(150, 150 * pil_image.height / pil_image.width))
            self.img_preview_label.configure(image=ctk_image, text="")
        except Exception as e:
            self.img_preview_label.configure(image=None, text="Error: Cannot display image")
            print(f"Image preview error: {e}")

    def load_show_data(self, show_info_data):
        """Receives the 'info' dictionary from the main app and populates the fields."""
        for key, widget in self.detail_widgets.items():
            widget.delete(0, tk.END)
            widget.insert(0, show_info_data.get(key, ""))
        
        self.update_image_preview(show_info_data.get("logo_path"))

    def get_data(self):
        """Called by the main app to retrieve the current data before saving."""
        return {key: widget.get() for key, widget in self.detail_widgets.items()}
