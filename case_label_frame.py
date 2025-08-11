import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import customtkinter as ctk
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import black, lightgrey
from reportlab.pdfgen import canvas
import os
import csv
import json
import copy
from tkinterdnd2 import DND_FILES
from advanced_print_window import AdvancedPrintWindow

# --- PDF Generation Logic ---
def create_case_label_pdf(image_path, labels_data, output_filepath, placement=None):
    LABEL_WIDTH = 8.5 * inch
    LABEL_HEIGHT = 5.5 * inch
    c = canvas.Canvas(output_filepath, pagesize=letter)
    
    if placement:
        # Advanced print: one page, specific slots
        for slot_index, label_index in placement.items():
            label_info = labels_data[label_index]
            send_to_text = label_info.get("send_to", "")
            contents_text = label_info.get("contents", "")
            draw_single_case_label(c, slot_index, image_path, send_to_text, contents_text)
    else:
        # Standard print: one page per label
        for label_info in labels_data:
            send_to_text = label_info.get("send_to", "")
            contents_text = label_info.get("contents", "")
            draw_single_case_label(c, 0, image_path, send_to_text, contents_text)
            draw_single_case_label(c, 1, image_path, send_to_text, contents_text)
            c.showPage()
    c.save()

def draw_single_case_label(c, label_index, image_path, send_to_text, contents_text):
    LABEL_WIDTH = 8.5 * inch
    LABEL_HEIGHT = 5.5 * inch
    y_start = LABEL_HEIGHT if label_index == 0 else 0
    padding = 0.25 * inch
    center_x = LABEL_WIDTH / 2
    c.setStrokeColor(lightgrey)
    c.setLineWidth(2)
    corner_radius = 0.1 * inch
    box_x, box_y = padding, y_start + padding
    box_width, box_height = LABEL_WIDTH - (2 * padding), LABEL_HEIGHT - (2 * padding)
    c.roundRect(box_x, box_y, box_width, box_height, corner_radius, stroke=1, fill=0)
    h_line_y = y_start + LABEL_HEIGHT - (2.0 * inch)
    c.line(box_x, h_line_y, box_x + box_width, h_line_y)
    v_line_x = 4.5 * inch
    c.line(v_line_x, h_line_y, v_line_x, box_y + box_height)
    if image_path and os.path.exists(image_path):
        try:
            img_box_width, img_box_height = v_line_x - box_x, (box_y + box_height) - h_line_y
            img_box_center_x, img_box_center_y = box_x + (img_box_width / 2), h_line_y + (img_box_height / 2)
            max_img_width, max_img_height = 4.0 * inch, 1.6 * inch
            img = Image.open(image_path)
            img_width, img_height = img.size
            ratio = min(max_img_width / img_width, max_img_height / img_height)
            new_width, new_height = img_width * ratio, img_height * ratio
            img_x, img_y = img_box_center_x - (new_width / 2), img_box_center_y - (new_height / 2)
            c.drawImage(image_path, img_x, img_y, width=new_width, height=new_height, mask='auto')
        except Exception as e:
            c.setFont("Helvetica", 10)
            c.drawCentredString(box_x + (v_line_x - box_x)/2, h_line_y + 0.5*inch, "Image failed to load.")
    c.setFillColor(black)
    c.setFont("Helvetica", 20)
    c.drawString(v_line_x + (0.1 * inch), (box_y + box_height) - (0.3 * inch), "SEND TO:")
    font_size = 48
    text_to_draw = send_to_text.upper()
    max_text_width = (box_x + box_width) - v_line_x - (0.2 * inch)
    while c.stringWidth(text_to_draw, "Helvetica-Bold", font_size) > max_text_width and font_size > 8: font_size -= 1
    c.setFont("Helvetica-Bold", font_size)
    send_to_box_center_x = v_line_x + ((box_x + box_width - v_line_x) / 2)
    c.drawCentredString(send_to_box_center_x, y_start + LABEL_HEIGHT - (1.35 * inch), text_to_draw)
    c.setFont("Helvetica", 20)
    c.drawString(padding + (0.1 * inch), h_line_y - (0.3 * inch), "CONTENTS:")
    c.setFont("Helvetica-Bold", 28)
    lines = contents_text.split('\n')
    line_height = 34
    total_text_height = len(lines) * line_height
    content_area_height = h_line_y - box_y
    content_area_center_y = box_y + (content_area_height / 2)
    content_start_y = content_area_center_y + (total_text_height / 2) - line_height + 10
    for i, line in enumerate(lines): c.drawCentredString(center_x, content_start_y - (i * line_height), line.upper())

class CaseLabelFrame(ctk.CTkFrame):
    def __init__(self, master, show_toast):
        super().__init__(master)
        self.show_toast = show_toast
        self.image_path = None
        self.labels_data = [] 
        self.sheets_data = {}
        self._create_widgets()
        self.bind_shortcuts()

    def _create_widgets(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(1, weight=1)
        sheet_manager_frame = ctk.CTkFrame(self, width=250)
        sheet_manager_frame.grid(row=0, column=0, rowspan=3, padx=20, pady=20, sticky="nsew")
        sheet_manager_frame.grid_rowconfigure(1, weight=1)
        ctk.CTkLabel(sheet_manager_frame, text="Sheets in Show", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=10, pady=10)
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#2a2d2e", foreground="white", fieldbackground="#2a2d2e", borderwidth=0, rowheight=40)
        style.map('Treeview', background=[('selected', '#22559b')])
        style.configure("Treeview.Heading", background="#565b5e", foreground="white", relief="flat", font=('Calibri', 12, 'bold'))
        self.sheet_tree = ttk.Treeview(sheet_manager_frame, columns=("name"), show="headings")
        self.sheet_tree.heading("name", text="Sheet Name")
        self.sheet_tree.grid(row=1, column=0, padx=10, pady=5, sticky="nsew")
        sheet_btn_frame = ctk.CTkFrame(sheet_manager_frame, fg_color="transparent")
        sheet_btn_frame.grid(row=2, column=0, padx=10, pady=10, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Load", command=self.load_selected_sheet).pack(side="left", expand=True, padx=2)
        ctk.CTkButton(sheet_btn_frame, text="Delete", command=self.delete_selected_sheet).pack(side="left", expand=True, padx=2)
        main_editor_frame = ctk.CTkFrame(self, fg_color="transparent")
        main_editor_frame.grid(row=0, column=1, rowspan=3, padx=(0, 20), pady=20, sticky="nsew")
        main_editor_frame.grid_columnconfigure(0, weight=1)
        main_editor_frame.grid_rowconfigure(2, weight=3) # Main content area
        main_editor_frame.grid_rowconfigure(3, weight=1) # Action area
        
        input_frame = ctk.CTkFrame(main_editor_frame)
        input_frame.grid(row=1, column=0, pady=(0, 20), sticky="ew")
        input_frame.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(input_frame, text="Send To:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.send_to_entry = ctk.CTkEntry(input_frame)
        self.send_to_entry.grid(row=0, column=1, padx=10, pady=5, sticky="ew")
        ctk.CTkLabel(input_frame, text="Contents:").grid(row=1, column=0, padx=10, pady=5, sticky="nw")
        self.contents_text = ctk.CTkTextbox(input_frame, height=100)
        self.contents_text.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        ctk.CTkButton(input_frame, text="Add Label", command=self.add_label).grid(row=2, column=0, padx=10, pady=10)
        ctk.CTkButton(input_frame, text="Update Selected", command=self.update_selected_label).grid(row=2, column=1, padx=10, pady=10, sticky="e")
        
        display_frame = ctk.CTkFrame(main_editor_frame)
        display_frame.grid(row=2, column=0, sticky="nsew")
        display_frame.grid_columnconfigure(0, weight=1)
        display_frame.grid_rowconfigure(0, weight=1)
        columns = ("send_to", "contents")
        self.tree = ttk.Treeview(display_frame, columns=columns, show="headings")
        self.tree.heading("send_to", text="Send To"); self.tree.heading("contents", text="Contents"); self.tree.column("send_to", width=250)
        self.tree.grid(row=0, column=0, sticky="nsew"); self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        scrollbar = ctk.CTkScrollbar(display_frame, command=self.tree.yview); scrollbar.grid(row=0, column=1, sticky="ns"); self.tree.configure(yscrollcommand=scrollbar.set)
        
        action_frame = ctk.CTkFrame(main_editor_frame)
        action_frame.grid(row=3, column=0, pady=20, sticky="nsew")
        action_frame.grid_columnconfigure(0, weight=1); action_frame.grid_columnconfigure(1, weight=1)
        image_pane = ctk.CTkFrame(action_frame); image_pane.grid(row=0, column=0, padx=(0,10), sticky="ns")
        self.img_preview_label = ctk.CTkLabel(image_pane, text="No image selected\n\n(Drop image here)"); self.img_preview_label.pack(pady=5, padx=5, expand=True)
        ctk.CTkButton(image_pane, text="Upload Image", command=self.upload_image).pack(pady=5, padx=5, side="bottom")
        self.img_preview_label.drop_target_register(DND_FILES); self.img_preview_label.dnd_bind('<<Drop>>', self.on_image_drop)
        
        button_pane = ctk.CTkFrame(action_frame)
        button_pane.grid(row=0, column=1, padx=(10,0), sticky="nsew")
        button_pane.grid_columnconfigure(0, weight=1)
        ctk.CTkButton(button_pane, text="Advanced Print", command=self.open_advanced_print).pack(pady=5, padx=5, fill="x")
        ctk.CTkButton(button_pane, text="Generate PDF", command=self.generate_pdf).pack(pady=10, padx=5, fill="x")

    def bind_shortcuts(self):
        """Widget-specific shortcuts are removed and handled globally by the main app."""
        pass

    def import_sheet_from_file(self):
        filepath = filedialog.askopenfilename(filetypes=[("Case Sheet files", "*.sheet")])
        if not filepath: return
        try:
            with open(filepath, 'r') as f: data = json.load(f)
            sheet_name = os.path.splitext(os.path.basename(filepath))[0]
            if sheet_name in self.sheets_data and not messagebox.askyesno("Confirm Overwrite", f"A sheet named '{sheet_name}' already exists in this show. Overwrite it?"): return
            self.sheets_data[sheet_name] = data
            self.populate_sheet_list()
            self.show_toast(f"Imported and added sheet '{sheet_name}'.")
        except Exception as e: messagebox.showerror("File Error", f"Could not open or read file: {e}")

    def export_sheet_to_file(self):
        if not self.labels_data: messagebox.showerror("Error", "There are no labels in the current list to export."); return
        filepath = filedialog.asksaveasfilename(defaultextension=".sheet", filetypes=[("Case Sheet files", "*.sheet")])
        if not filepath: return
        try:
            with open(filepath, 'w') as f: json.dump(self.labels_data, f, indent=4)
            self.show_toast("Current sheet exported successfully.")
        except Exception as e: messagebox.showerror("Error", f"Could not export file: {e}")

    def load_show_data(self, case_sheets_data):
        self.sheets_data = case_sheets_data
        self.populate_sheet_list()
        self.labels_data = []
        self.update_treeview()
        if self.master.current_show_data and 'info' in self.master.current_show_data:
            logo_path = self.master.current_show_data['info'].get('logo_path')
            if logo_path and os.path.exists(logo_path):
                self.image_path = logo_path
                self.update_image_preview()
            else:
                self.image_path = None
                self.update_image_preview()

    def open_advanced_print(self):
        if not self.labels_data: messagebox.showwarning("No Labels", "There are no labels in the current list to print."); return
        if not self.image_path: messagebox.showwarning("No Image", "An image must be selected for Advanced Print."); return
        AdvancedPrintWindow(self, self.labels_data, self.create_advanced_pdf, self.show_toast, rows=2, cols=1)
    def create_advanced_pdf(self, labels_data, output_filepath, placement):
        create_case_label_pdf(self.image_path, labels_data, output_filepath, placement=placement)
    def on_image_drop(self, event):
        path = event.data.strip('{}')
        if os.path.exists(path): self.image_path = path; self.update_image_preview(); self.show_toast("Image loaded successfully.")
    def populate_sheet_list(self):
        self.sheet_tree.delete(*self.sheet_tree.get_children())
        for name in sorted(self.sheets_data.keys()): self.sheet_tree.insert("", "end", values=(name,), iid=name)
    def load_selected_sheet(self):
        if not self.sheet_tree.selection(): return
        sheet_name = self.sheet_tree.selection()[0]
        self.labels_data = self.sheets_data.get(sheet_name, [])
        self.update_treeview(); self.show_toast(f"Sheet '{sheet_name}' loaded.")
    def delete_selected_sheet(self):
        if not self.sheet_tree.selection(): return
        sheet_name = self.sheet_tree.selection()[0]
        if messagebox.askyesno("Confirm Delete", f"Delete sheet '{sheet_name}'? This cannot be undone."):
            del self.sheets_data[sheet_name]; self.populate_sheet_list(); self.show_toast(f"Sheet '{sheet_name}' deleted.")
    def save_as_new_sheet(self):
        if not self.labels_data: messagebox.showerror("Error", "There are no labels in the current list to save."); return
        dialog = ctk.CTkInputDialog(text="Enter a name for this new sheet:", title="Save as New Sheet"); sheet_name = dialog.get_input()
        if not sheet_name: return
        if sheet_name in self.sheets_data and not messagebox.askyesno("Confirm Overwrite", f"A sheet named '{sheet_name}' already exists. Overwrite it?"): return
        self.sheets_data[sheet_name] = self.labels_data; self.populate_sheet_list(); self.show_toast(f"Sheet '{sheet_name}' saved.")
    def add_label(self):
        send_to, contents = self.send_to_entry.get(), self.contents_text.get("1.0", "end-1c").strip()
        if not send_to: messagebox.showerror("Error", "'Send To' cannot be empty."); return
        self.labels_data.append({"send_to": send_to, "contents": contents}); self.update_treeview(); self.clear_entries()
    def update_selected_label(self):
        if not self.tree.selection(): return
        index = self.tree.index(self.tree.selection()[0])
        self.labels_data[index] = {"send_to": self.send_to_entry.get(), "contents": self.contents_text.get("1.0", "end-1c").strip()}
        self.update_treeview()
    def delete_selected_label(self):
        if self.tree.selection() and messagebox.askyesno("Confirm Delete", "Delete selected label?"):
            index = self.tree.index(self.tree.selection()[0]); del self.labels_data[index]; self.update_treeview(); self.clear_entries()
    def duplicate_selected_label(self):
        if not self.tree.selection(): messagebox.showerror("Error", "No label selected to duplicate."); return
        index = self.tree.index(self.tree.selection()[0]); original_label_data = self.labels_data[index]
        duplicated_label_data = copy.deepcopy(original_label_data)
        self.labels_data.insert(index + 1, duplicated_label_data); self.update_treeview(); self.show_toast("Label duplicated.")
    def clear_all_labels(self):
        if messagebox.askyesno("Confirm Clear", "Clear all labels from the current list?"):
            self.labels_data.clear(); self.update_treeview(); self.clear_entries()
    def update_treeview(self):
        self.tree.delete(*self.tree.get_children())
        for label in self.labels_data:
            if isinstance(label, dict):
                self.tree.insert("", "end", values=(label.get("send_to", ""), label.get("contents", "").split('\n', 1)[0]))
            else:
                print(f"Warning: Skipped malformed label data: {label}")
    def clear_entries(self):
        self.send_to_entry.delete(0, "end"); self.contents_text.delete("1.0", "end"); self.send_to_entry.focus()
    def on_tree_select(self, event):
        if not self.tree.selection(): return
        index = self.tree.index(self.tree.selection()[0]); label_data = self.labels_data[index]
        self.clear_entries(); self.send_to_entry.insert(0, label_data.get("send_to", "")); self.contents_text.insert("1.0", label_data.get("contents", ""))
    def import_csv(self):
        filepath = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")])
        if not filepath: return
        try:
            with open(filepath, "r", newline="", encoding='utf-8') as f:
                reader = csv.DictReader(f)
                if "send_to" not in reader.fieldnames or "contents" not in reader.fieldnames: messagebox.showerror("Import Error", "CSV must have 'send_to' and 'contents' headers."); return
                self.labels_data = list(reader)
            self.update_treeview(); self.show_toast("Labels imported from CSV.")
        except Exception as e: messagebox.showerror("File Error", f"Could not load file: {e}")
    def export_csv(self):
        if not self.labels_data: return
        filepath = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV files", "*.csv")])
        if not filepath: return
        try:
            with open(filepath, "w", newline="", encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=["send_to", "contents"]); writer.writeheader(); writer.writerows(self.labels_data)
            self.show_toast("Labels exported to CSV.")
        except IOError as e: messagebox.showerror("Save Error", f"Could not save file: {e}")
    def update_image_preview(self):
        if not self.image_path: self.img_preview_label.configure(image=None, text="No image selected\n\n(Drop image here)"); return
        try:
            pil_image = Image.open(self.image_path)
            ctk_image = ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=(150, 150 * pil_image.height / pil_image.width))
            self.img_preview_label.configure(image=ctk_image, text="")
        except Exception as e: self.image_path = None; self.img_preview_label.configure(image=None, text="Error: Cannot display image")
    def upload_image(self):
        path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if path: self.image_path = path; self.update_image_preview()
    def generate_pdf(self):
        if not self.labels_data: messagebox.showerror("Error", "There are no labels in the list to generate a PDF."); return
        if not self.image_path and not messagebox.askyesno("No Image", "You have not selected an image for this batch. Continue without one?"): return
        filepath = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF files", "*.pdf")])
        if not filepath: return
        try:
            create_case_label_pdf(self.image_path, self.labels_data, filepath); self.show_toast("PDF generated successfully!")
        except Exception as e: messagebox.showerror("PDF Error", f"Could not create PDF: {e}")