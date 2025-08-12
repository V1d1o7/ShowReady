Production Label Suite (PVPy)
=============================

A comprehensive desktop application designed for the theatre and live production industry to create, manage, and print professional loom and case labels. Built with Python and a modern GUI, this tool streamlines the process of organizing and identifying equipment for any show.

<img width="1920" height="1040" alt="Main Window" src="https://github.com/user-attachments/assets/2115605a-4f32-4e59-aee4-53660868afbf" />


Features
--------

-   **Dual Label Editors**: Separate, purpose-built interfaces for creating both small-format loom labels and large-format case labels.

-   **Show Manager**: A centralized system to manage different shows. Each show can have its own default logo and contact information, making it easy to switch between productions.

-   **Saved Label Sheets**: Save and load entire lists of loom or case labels. Perfect for quickly reprinting common sets of labels without re-entering data.

-   **Advanced Print Placement**: For printing corrections or one-off labels, a visual interface allows you to place labels in specific slots on a physical sheet, preventing waste.

-   **Modern Interface**: Built with a clean, dark-themed GUI that is easy to navigate.

-   **Flexible Data Import/Export**: Import and export label lists as CSV files to integrate with other software and workflows.

Installation
------------

This application is built with Python and requires a few external libraries.

### 1\. Clone the Repository

First, clone this repository to your local machine using Git. Open your terminal or command prompt and run:

```
git clone https://github.com/V1d1o7/PVPy.git
cd PVPy

```

### 2\. Prerequisites

-   Ensure you have Python 3 installed on your system. You can download it from [python.org](https://www.python.org/).

### 3\. Install Required Libraries

Once you are inside the project folder in your terminal, run the following command to install all the necessary packages at once:

```
pip install customtkinter Pillow reportlab tkinterdnd2

```

Usage
-----

1.  **Launch the Application**: With your terminal still in the project folder, run the main application script:

    ```
    python main_app.py

    ```

2.  **Navigate**: Use the sidebar on the left to switch between the **Loom Labels**, **Case Labels**, and **Show Manager** sections.

3.  **Manage Shows**: It's recommended to start in the **Show Manager**. Here you can create a profile for your show and set a default logo. Make sure to set your show as "Active".

4.  **Create Labels**: Navigate to the appropriate label editor. The Case Labeler will automatically load the logo from your active show.

5.  **Print**: Use the "Generate PDF" button for full, sequential sheets, or the "Advanced Print" button to place labels in specific slots for correction prints.

### Loom Label Editor

<img width="1920" height="1040" alt="Main Window" src="https://github.com/user-attachments/assets/2115605a-4f32-4e59-aee4-53660868afbf" />


### Case Label Editor

<img width="1920" height="1040" alt="image" src="https://github.com/user-attachments/assets/302efbb3-ba6a-4e4a-accb-6e7e9f854b72" />


### Show Manager

<img width="1920" height="1040" alt="image" src="https://github.com/user-attachments/assets/45b31bf7-f554-4d9f-8fb7-71eed70809d7" />


### Advanced Print Window

<img width="802" height="832" alt="image" src="https://github.com/user-attachments/assets/91c5f1e2-1e4a-41a2-91e7-3b9ff44ab479" />
