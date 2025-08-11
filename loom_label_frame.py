import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser
import customtkinter as ctk
import csv
import json
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import Color, black
from reportlab.pdfgen import canvas
import copy
from advanced_print_window import AdvancedPrintWindow

# --- PDF Generation Logic ---
COLOR_MAP = {
    'aliceblue': '#F0F8FF', 'antiquewhite': '#FAEBD7', 'aqua': '#00FFFF', 'aquamarine': '#7FFFD4', 'azure': '#F0FFFF', 'beige': '#F5F5DC', 'bisque': '#FFE4C4', 'black': '#000000', 'blanchedalmond': '#FFEBCD', 'blue': '#0000FF', 'blueviolet': '#8A2BE2', 'brown': '#A52A2A', 'burlywood': '#DEB887', 'cadetblue': '#5F9EA0', 'chartreuse': '#7FFF00', 'chocolate': '#D2691E', 'coral': '#FF7F50', 'cornflowerblue': '#6495ED', 'cornsilk': '#FFF8DC', 'crimson': '#DC143C', 'cyan': '#00FFFF', 'darkblue': '#00008B', 'darkcyan': '#008B8B', 'darkgoldenrod': '#B8860B', 'darkgray': '#A9A9A9', 'darkgreen': '#006400', 'darkgrey': '#A9A9A9', 'darkkhaki': '#BDB76B', 'darkmagenta': '#8B008B', 'darkolivegreen': '#556B2F', 'darkorange': '#FF8C00', 'darkorchid': '#9932CC', 'darkred': '#8B0000', 'darksalmon': '#E9967A', 'darkseagreen': '#8FBC8F', 'darkslateblue': '#483D8B', 'darkslategray': '#2F4F4F', 'darkslategrey': '#2F4F4F', 'darkturquoise': '#00CED1', 'darkviolet': '#9400D3', 'deeppink': '#FF1493', 'deepskyblue': '#00BFFF', 'dimgray': '#696969', 'dimgrey': '#696969', 'dodgerblue': '#1E90FF', 'firebrick': '#B22222', 'floralwhite': '#FFFAF0', 'forestgreen': '#228B22', 'fuchsia': '#FF00FF', 'gainsboro': '#DCDCDC', 'ghostwhite': '#F8F8FF', 'gold': '#FFD700', 'goldenrod': '#DAA520', 'gray': '#808080', 'green': '#008000', 'greenyellow': '#ADFF2F', 'grey': '#808080', 'honeydew': '#F0FFF0', 'hotpink': '#FF69B4', 'indianred': '#CD5C5C', 'indigo': '#4B0082', 'ivory': '#FFFFF0', 'khaki': '#F0E68C', 'lavender': '#E6E6FA', 'lavenderblush': '#FFF0F5', 'lawngreen': '#7CFC00', 'lemonchiffon': '#FFFACD', 'lightblue': '#ADD8E6', 'lightcoral': '#F08080', 'lightcyan': '#E0FFFF', 'lightgoldenrodyellow': '#FAFAD2', 'lightgray': '#D3D3D3', 'lightgreen': '#90EE90', 'lightgrey': '#D3D3D3', 'lightpink': '#FFB6C1', 'lightsalmon': '#FFA07A', 'lightseagreen': '#20B2AA', 'lightskyblue': '#87CEFA', 'lightslategray': '#778899', 'lightslategrey': '#778899', 'lightsteelblue': '#B0C4DE', 'lightyellow': '#FFFFE0', 'lime': '#00FF00', 'limegreen': '#32CD32', 'linen': '#FAF0E6', 'magenta': '#FF00FF', 'maroon': '#800000', 'mediumaquamarine': '#66CDAA', 'mediumblue': '#0000CD', 'mediumorchid': '#BA55D3', 'mediumpurple': '#9370DB', 'mediumseagreen': '#3CB371', 'mediumslateblue': '#7B68EE', 'mediumspringgreen': '#00FA9A', 'mediumturquoise': '#48D1CC', 'mediumvioletred': '#C71585', 'midnightblue': '#191970', 'mintcream': '#F5FFFA', 'mistyrose': '#FFE4E1', 'moccasin': '#FFE4B5', 'navajowhite': '#FFDEAD', 'navy': '#000080', 'oldlace': '#FDF5E6', 'olive': '#808000', 'olivedrab': '#6B8E23', 'orange': '#FFA500', 'orangered': '#FF4500', 'orchid': '#DA70D6', 'palegoldenrod': '#EEE8AA', 'palegreen': '#98FB98', 'paleturquoise': '#AFEEEE', 'palevioletred': '#DB7093', 'papayawhip': '#FFEFD5', 'peachpuff': '#FFDAB9', 'peru': '#CD853F', 'pink': '#FFC0CB', 'plum': '#DDA0DD', 'powderblue': '#B0E0E6', 'purple': '#800080', 'rebeccapurple': '#663399', 'red': '#FF0000', 'rosybrown': '#BC8F8F', 'royalblue': '#4169E1', 'saddlebrown': '#8B4513', 'salmon': '#FA8072', 'sandybrown': '#F4A460', 'seagreen': '#2E8B57', 'seashell': '#FFF5EE', 'sienna': '#A0522D', 'silver': '#C0C0C0', 'skyblue': '#87CEEB', 'slateblue': '#6A5ACD', 'slategray': '#708090', 'slategrey': '#708090', 'snow': '#FFFAFA', 'springgreen': '#00FF7F', 'steelblue': '#4682B4', 'tan': '#D2B48C', 'teal': '#008080', 'thistle': '#D8BFD8', 'tomato': '#FF6347', 'turquoise': '#40E0D0', 'violet': '#EE82EE', 'wheat': '#F5DEB3', 'white': '#FFFFFF', 'whitesmoke': '#F5F5F5', 'yellow': '#FFFF00', 'yellowgreen': '#9ACD32'
}
def parse_color(color_string):
    color_string = color_string.lower().strip()
    if color_string in COLOR_MAP: hex_val = COLOR_MAP[color_string]
    elif color_string.startswith('#') and len(color_string) in [4, 7]: hex_val = color_string
    else: return black
    hex_val = hex_val.lstrip('#')
    if len(hex_val) == 3: hex_val = "".join([c*2 for c in hex_val])
    try:
        r, g, b = (int(hex_val[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        return Color(r, g, b)
    except ValueError: return black

def create_label_pdf(labels_data, output_filepath, placement=None):
    LABEL_WIDTH, LABEL_HEIGHT = 2.5 * inch, 1 * inch
    TOP_MARGIN, LEFT_MARGIN = 0.625 * inch, 0.325 * inch
    HORIZONTAL_SPACING, VERTICAL_SPACING = 0.175 * inch, 0.25 * inch
    CORNER_RADIUS = 0.0625 * inch
    
    c = canvas.Canvas(output_filepath, pagesize=letter)
    page_width, page_height = letter
    iterator = placement.items() if placement else enumerate(labels_data)
    for item in iterator:
        if placement:
            slot_index, label_index = item
            label = labels_data[label_index]
            page_pos = slot_index
        else:
            page_pos, label = item
        row, col = page_pos % 8, page_pos // 8
        x = LEFT_MARGIN + (col * (LABEL_WIDTH + HORIZONTAL_SPACING))
        y = page_height - TOP_MARGIN - (row * (LABEL_HEIGHT + VERTICAL_SPACING)) - LABEL_HEIGHT
        center_x, center_y = x + LABEL_WIDTH / 2, y + LABEL_HEIGHT / 2
        loom_name, user_color_str = label.get('loom_name', ''), label.get('color', 'black')
        source_text, dest_text = label.get('source', ''), label.get('destination', '')
        font_size = 14
        c.setFont("Helvetica-Bold", font_size)
        c.setFillColor(black)
        c.drawCentredString(center_x, center_y - (font_size * 0.25), loom_name)
        bar_color = parse_color(user_color_str)
        c.setFillColor(bar_color)
        bar_height, bar_y_offset = 0.05 * inch, 0.18 * inch
        c.roundRect(x, center_y + bar_y_offset, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        c.roundRect(x, center_y - bar_y_offset - bar_height, LABEL_WIDTH, bar_height, CORNER_RADIUS, fill=1, stroke=0)
        c.setFont("Helvetica", 7)
        c.setFillColor(black)
        padding, bottom_y = 0.08 * inch, y + 0.1 * inch
        c.drawString(x + padding, bottom_y, f"SRC: {source_text}")
        c.drawRightString(x + LABEL_WIDTH - padding, bottom_y, f"DST: {dest_text}")
    c.save()

class LoomLabelFrame(ctk.CTkFrame):
    def __init__(self, master, show_toast):
        super().__init__(master)
        self.show_toast = show_toast
        self.labels_data = []
        self.sheets_data = {}
        self.current_sheet_name = None
        self._create_widgets()

    def _create_widgets(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(1, weight=1)
        sheet_manager_frame = ctk.CTkFrame(self, width=250)
        sheet_manager_frame.grid(row=0, column=0, rowspan=3, padx=20, pady=20, sticky="nsew")
        sheet_manager_frame.grid_rowconfigure(1, weight=1)
        ctk.CTkLabel(sheet_manager_frame, text="Sheets in Show", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, columnspan=2, padx=10, pady=10)
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#2a2d2e", foreground="white", fieldbackground="#2a2d2e", borderwidth=0)
        style.map('Treeview', background=[('selected', '#22559b')])
        style.configure("Treeview.Heading", background="#565b5e", foreground="white", relief="flat")
        self.sheet_tree = ttk.Treeview(sheet_manager_frame, columns=("name"), show="headings")
        self.sheet_tree.heading("name", text="Sheet Name")
        self.sheet_tree.grid(row=1, column=0, columnspan=2, padx=10, pady=5, sticky="nsew")
        
        # --- Sheet Manager Buttons ---
        sheet_btn_frame = ctk.CTkFrame(sheet_manager_frame, fg_color="transparent")
        sheet_btn_frame.grid(row=2, column=0, columnspan=2, padx=10, pady=10, sticky="ew")
        sheet_btn_frame.grid_columnconfigure((0, 1), weight=1)
        ctk.CTkButton(sheet_btn_frame, text="Load Sheet", command=self.load_selected_sheet).grid(row=0, column=0, padx=2, pady=2, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Delete Sheet", command=self.delete_selected_sheet).grid(row=0, column=1, padx=2, pady=2, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Import Sheet", command=self.import_sheet_from_file).grid(row=1, column=0, padx=2, pady=2, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Export Sheet", command=self.export_sheet_to_file).grid(row=1, column=1, padx=2, pady=2, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Save Current", command=self.save_current_sheet).grid(row=2, column=0, padx=2, pady=2, sticky="ew")
        ctk.CTkButton(sheet_btn_frame, text="Save as New...", command=self.save_as_new_sheet).grid(row=2, column=1, padx=2, pady=2, sticky="ew")
        
        input_frame = ctk.CTkFrame(self)
        input_frame.grid(row=0, column=1, padx=(0, 20), pady=20, sticky="new")
        input_frame.grid_columnconfigure((1, 3), weight=1)
        ctk.CTkLabel(input_frame, text="Loom Name:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.loom_name_entry = ctk.CTkEntry(input_frame)
        self.loom_name_entry.grid(row=0, column=1, padx=10, pady=5, sticky="ew")
        ctk.CTkLabel(input_frame, text="Color:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        color_frame = ctk.CTkFrame(input_frame, fg_color="transparent")
        color_frame.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        color_frame.grid_columnconfigure(0, weight=1)
        self.color_entry = ctk.CTkEntry(color_frame)
        self.color_entry.grid(row=0, column=0, sticky="ew")
        self.color_picker_button = ctk.CTkButton(color_frame, text="...", width=30, command=self.pick_color)
        self.color_picker_button.grid(row=0, column=1, padx=(5,0))
        ctk.CTkLabel(input_frame, text="Source:").grid(row=0, column=2, padx=10, pady=5, sticky="w")
        self.source_entry = ctk.CTkEntry(input_frame)
        self.source_entry.grid(row=0, column=3, padx=10, pady=5, sticky="ew")
        ctk.CTkLabel(input_frame, text="Destination:").grid(row=1, column=2, padx=10, pady=5, sticky="w")
        self.destination_entry = ctk.CTkEntry(input_frame)
        self.destination_entry.grid(row=1, column=3, padx=10, pady=5, sticky="ew")
        ctk.CTkButton(input_frame, text="Add Label", command=self.add_label).grid(row=2, column=1, pady=10, sticky="w")
        ctk.CTkButton(input_frame, text="Update Selected", command=self.update_selected_label).grid(row=2, column=3, pady=10, sticky="e")
        
        display_frame = ctk.CTkFrame(self)
        display_frame.grid(row=1, column=1, padx=(0, 20), sticky="nsew")
        display_frame.grid_columnconfigure(0, weight=1)
        display_frame.grid_rowconfigure(0, weight=1)
        columns = ("loom_name", "color", "source", "destination")
        self.tree = ttk.Treeview(display_frame, columns=columns, show="headings")
        self.tree.heading("loom_name", text="Loom Name"); self.tree.heading("color", text="Color"); self.tree.heading("source", text="Source"); self.tree.heading("destination", text="Destination")
        self.tree.grid(row=0, column=0, sticky="nsew"); self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        scrollbar = ctk.CTkScrollbar(display_frame, command=self.tree.yview); scrollbar.grid(row=0, column=1, sticky="ns"); self.tree.configure(yscrollcommand=scrollbar.set)
        
        action_button_frame = ctk.CTkFrame(self, fg_color="transparent")
        action_button_frame.grid(row=2, column=1, padx=(0, 20), pady=20, sticky="e")
        ctk.CTkButton(action_button_frame, text="Advanced Print", command=self.open_advanced_print).pack(side="left", padx=5)
        ctk.CTkButton(action_button_frame, text="Generate PDF", command=self.generate_pdf_from_gui).pack(side="left", padx=5)

    def get_sheets_data(self):
        """Commits any pending changes in the editor before returning all sheet data."""
        if self.current_sheet_name and self.current_sheet_name in self.sheets_data:
            self.sheets_data[self.current_sheet_name] = self.labels_data
        return self.sheets_data

    def import_sheet_from_file(self):
        filepath = filedialog.askopenfilename(filetypes=[("Loom Sheet files", "*.sheet")])
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
        if not self.sheet_tree.selection():
            messagebox.showerror("Error", "Please select a sheet from the list to export.")
            return
        
        sheet_name = self.sheet_tree.selection()[0]
        sheet_data = self.sheets_data.get(sheet_name)

        if not sheet_data:
             messagebox.showerror("Error", f"Could not find data for sheet '{sheet_name}'.")
             return

        filepath = filedialog.asksaveasfilename(
            defaultextension=".sheet",
            filetypes=[("Loom Sheet files", "*.sheet")],
            initialfile=f"{sheet_name}.sheet"
        )
        if not filepath: return
        try:
            with open(filepath, 'w') as f: json.dump(sheet_data, f, indent=4)
            self.show_toast(f"Sheet '{sheet_name}' exported successfully.")
        except Exception as e: messagebox.showerror("Error", f"Could not export file: {e}")

    def load_show_data(self, loom_sheets_data):
        self.sheets_data = loom_sheets_data if isinstance(loom_sheets_data, dict) else {}
        self.populate_sheet_list()
        self.labels_data = []
        self.current_sheet_name = None
        self.update_treeview()

    def open_advanced_print(self):
        if not self.labels_data: messagebox.showwarning("No Labels", "There are no labels in the current list to print."); return
        AdvancedPrintWindow(self, self.labels_data, create_label_pdf, self.show_toast, rows=8, cols=3)
    def pick_color(self):
        color_info = colorchooser.askcolor(title="Choose color")
        if color_info and color_info[1]: self.color_entry.delete(0, tk.END); self.color_entry.insert(0, color_info[1])
    
    def populate_sheet_list(self):
        self.sheet_tree.delete(*self.sheet_tree.get_children())
        for name in sorted(self.sheets_data.keys()): self.sheet_tree.insert("", "end", values=(name,), iid=name)
        
    def load_selected_sheet(self):
        if not self.sheet_tree.selection(): return
        sheet_name = self.sheet_tree.selection()[0]
        sheet_data = self.sheets_data.get(sheet_name, [])
        
        if not isinstance(sheet_data, list):
            messagebox.showwarning("Data Error", f"The sheet '{sheet_name}' has malformed data. It will be treated as an empty sheet.")
            self.labels_data = []
        else:
            self.labels_data = copy.deepcopy(sheet_data)
            
        self.current_sheet_name = sheet_name
        self.update_treeview()
        self.show_toast(f"Sheet '{sheet_name}' loaded.")

    def delete_selected_sheet(self):
        if not self.sheet_tree.selection(): return
        sheet_name = self.sheet_tree.selection()[0]
        if messagebox.askyesno("Confirm Delete", f"Delete sheet '{sheet_name}'? This cannot be undone."):
            del self.sheets_data[sheet_name]
            if self.current_sheet_name == sheet_name:
                self.labels_data = []
                self.current_sheet_name = None
                self.update_treeview()
            self.populate_sheet_list()
            self.show_toast(f"Sheet '{sheet_name}' deleted.")

    def save_current_sheet(self):
        if not self.current_sheet_name:
            messagebox.showerror("Error", "No sheet is currently loaded. Use 'Save as New...' to create a new sheet.")
            return
        
        if messagebox.askyesno("Confirm Save", f"This will overwrite the sheet '{self.current_sheet_name}'. Continue?"):
            self.sheets_data[self.current_sheet_name] = self.labels_data
            self.show_toast(f"Sheet '{self.current_sheet_name}' saved successfully.")

    def save_as_new_sheet(self):
        if not self.labels_data: 
            messagebox.showerror("Error", "There are no labels in the current list to save."); 
            return
        dialog = ctk.CTkInputDialog(text="Enter a name for this new sheet:", title="Save as New Sheet")
        sheet_name = dialog.get_input()
        if not sheet_name: return
        if sheet_name in self.sheets_data and not messagebox.askyesno("Confirm Overwrite", f"A sheet named '{sheet_name}' already exists. Overwrite it?"): return
        self.sheets_data[sheet_name] = self.labels_data
        self.populate_sheet_list()
        self.show_toast(f"Sheet '{sheet_name}' saved.")

    def add_label(self):
        if not self.loom_name_entry.get(): return
        if not isinstance(self.labels_data, list):
            self.labels_data = []
        self.labels_data.append({"loom_name": self.loom_name_entry.get(), "color": self.color_entry.get(), "source": self.source_entry.get(), "destination": self.destination_entry.get()})
        self.update_treeview(); self.clear_entries()
    def update_selected_label(self):
        if not self.tree.selection(): return
        index = self.tree.index(self.tree.selection()[0])
        self.labels_data[index] = {"loom_name": self.loom_name_entry.get(), "color": self.color_entry.get(), "source": self.source_entry.get(), "destination": self.destination_entry.get()}
        self.update_treeview()
    def delete_selected_label(self):
        if self.tree.selection() and messagebox.askyesno("Confirm Delete", "Delete selected label from the list?"):
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
        if not isinstance(self.labels_data, list):
            return
        for label in self.labels_data:
            if isinstance(label, dict):
                self.tree.insert("", "end", values=(
                    label.get("loom_name", ""), 
                    label.get("color", ""), 
                    label.get("source", ""), 
                    label.get("destination", "")
                ))
            else:
                print(f"Warning: Skipped malformed label data: {label}")
    def clear_entries(self):
        self.loom_name_entry.delete(0, "end"); self.color_entry.delete(0, "end"); self.source_entry.delete(0, "end"); self.destination_entry.delete(0, "end"); self.loom_name_entry.focus()
    def on_tree_select(self, event):
        if not self.tree.selection(): return
        index = self.tree.index(self.tree.selection()[0]); label_data = self.labels_data[index]
        self.clear_entries(); self.loom_name_entry.insert(0, label_data.get("loom_name", "")); self.color_entry.insert(0, label_data.get("color", "")); self.source_entry.insert(0, label_data.get("source", "")); self.destination_entry.insert(0, label_data.get("destination", ""))
    def import_csv(self):
        filepath = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")])
        if not filepath: return
        try:
            with open(filepath, "r", newline="", encoding='utf-8') as f:
                reader = csv.DictReader(f)
                required_headers = ["loom_name", "color", "source", "destination"]
                if not all(h in reader.fieldnames for h in required_headers):
                    messagebox.showerror("Import Error", f"CSV must have the following headers: {', '.join(required_headers)}")
                    return
                self.labels_data = list(reader)
            self.update_treeview(); self.show_toast("Labels imported from CSV.")
        except Exception as e: messagebox.showerror("File Error", f"Could not load file: {e}")
    def export_csv(self):
        if not self.labels_data: return
        filepath = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV files", "*.csv")])
        if not filepath: return
        try:
            with open(filepath, "w", newline="", encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=["loom_name", "color", "source", "destination"]); writer.writeheader(); writer.writerows(self.labels_data)
            self.show_toast("Labels exported to CSV.")
        except IOError as e: messagebox.showerror("Save Error", f"Could not save file: {e}")
    def generate_pdf_from_gui(self):
        if not self.labels_data: return
        filepath = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF files", "*.pdf")])
        if not filepath: return
        try:
            create_label_pdf(self.labels_data, filepath); self.show_toast("PDF generated successfully!")
        except Exception as e: messagebox.showerror("PDF Error", f"Could not generate PDF: {e}")
