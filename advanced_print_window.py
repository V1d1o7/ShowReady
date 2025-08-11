import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox

class AdvancedPrintWindow(ctk.CTkToplevel):
    def __init__(self, master, labels_data, pdf_creation_func, show_toast, rows, cols):
        super().__init__(master)
        self.transient(master)
        self.grab_set()
        self.title("Advanced Print Placement")
        self.geometry("800x800")

        self.labels_data = labels_data
        self.pdf_creation_func = pdf_creation_func
        self.show_toast = show_toast
        self.rows = rows
        self.cols = cols
        self.placement = {} # Dictionary to store {slot_index: label_index}
        self.selected_label_index = None

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # --- Source List (Left) ---
        source_frame = ctk.CTkFrame(self, width=250)
        source_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        source_frame.grid_rowconfigure(1, weight=1)
        
        ctk.CTkLabel(source_frame, text="1. Select a Label", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, pady=10)
        
        self.source_list = tk.Listbox(source_frame, bg="#2a2d2e", fg="white", border=0, selectbackground="#22559b", highlightthickness=0, exportselection=False)
        self.source_list.grid(row=1, column=0, padx=10, pady=5, sticky="nsew")
        for i, label in enumerate(self.labels_data):
            display_name = list(label.values())[0]
            self.source_list.insert(tk.END, f"{i+1}: {display_name}")
        
        self.source_list.bind('<<ListboxSelect>>', self.on_list_select)

        # --- Target Grid (Right) ---
        target_frame = ctk.CTkFrame(self)
        target_frame.grid(row=0, column=1, padx=(0, 20), pady=20, sticky="nsew")
        target_frame.grid_columnconfigure(0, weight=1)
        target_frame.grid_rowconfigure(1, weight=1)
        
        ctk.CTkLabel(target_frame, text="2. Click a Slot to Place or Remove", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, pady=10)
        
        self.grid_slots = []
        grid_container = ctk.CTkFrame(target_frame, fg_color="transparent")
        grid_container.grid(row=1, column=0, sticky="") # Center the grid

        # Dynamically create the grid based on rows and cols
        for i in range(self.rows * self.cols):
            row, col = i % self.rows, i // self.rows
            slot = ctk.CTkButton(grid_container, text=f"{i+1}", width=150, height=80, fg_color="gray20", text_color="gray50",
                                 command=lambda index=i: self.on_slot_click(index))
            slot.grid(row=row, column=col, padx=5, pady=5)
            self.grid_slots.append(slot)

        # --- Action Buttons ---
        action_frame = ctk.CTkFrame(self, fg_color="transparent")
        action_frame.grid(row=1, column=0, columnspan=2, pady=(0, 20))
        ctk.CTkButton(action_frame, text="Generate PDF", command=self.generate_placed_pdf).pack(side="left", padx=10)
        ctk.CTkButton(action_frame, text="Reset Placements", command=self.reset_placements).pack(side="left", padx=10)

    def on_list_select(self, event):
        selection = self.source_list.curselection()
        if selection:
            self.selected_label_index = selection[0]

    def on_slot_click(self, slot_index):
        if slot_index in self.placement:
            self.clear_slot(slot_index)
            return

        if self.selected_label_index is None:
            self.show_toast("Please select a label from the list first.", "orange")
            return
            
        if self.selected_label_index in self.placement.values():
            for s_idx, l_idx in list(self.placement.items()):
                if l_idx == self.selected_label_index:
                    self.clear_slot(s_idx)
                    break
        
        self.placement[slot_index] = self.selected_label_index
        self.update_slot_display(slot_index, self.selected_label_index)

    def update_slot_display(self, slot_index, label_index):
        slot = self.grid_slots[slot_index]
        display_name = list(self.labels_data[label_index].values())[0]
        slot.configure(text=f"{slot_index+1}\n---\n{display_name}", fg_color="#1f6aa5")

    def clear_slot(self, slot_index):
        if slot_index in self.placement:
            del self.placement[slot_index]
        
        slot = self.grid_slots[slot_index]
        slot.configure(text=f"{slot_index+1}", fg_color="gray20")

    def reset_placements(self):
        for i in range(self.rows * self.cols):
            self.clear_slot(i)
        self.show_toast("Placements have been reset.", "blue")

    def generate_placed_pdf(self):
        if not self.placement:
            messagebox.showwarning("No Placements", "You haven't placed any labels on the grid.")
            return
        
        filepath = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF files", "*.pdf")])
        if not filepath: return

        try:
            self.pdf_creation_func(self.labels_data, filepath, placement=self.placement)
            self.show_toast("PDF generated successfully!")
            self.destroy()
        except Exception as e:
            messagebox.showerror("PDF Error", f"Could not generate PDF: {e}")
