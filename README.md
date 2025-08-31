# ShowReady: Production Label Suite

A comprehensive desktop application designed for the theatre and live production industry to create, manage, and print professional loom and case labels. Built with Python, FastAPI, and a modern React frontend, this tool streamlines the process of organizing and identifying equipment for any show.

### Features

* **Dual Label Editors**: Separate, purpose-built interfaces for creating both small-format loom labels and large-format case labels. The logic for generating these PDFs is handled by `app/pdf_utils.py`.

* **Show Manager**: A centralized system to manage different shows. Each show can have its own logo and contact information, as seen in `frontend/src/views/DashboardView.js` and `frontend/src/views/ShowInfoView.js`.

* **Saved Label Sheets**: Save and load entire lists of loom or case labels. This is perfect for quickly reprinting common sets of labels without re-entering data.

* **Advanced Print Placement**: For printing corrections or one-off labels, a visual interface allows you to place labels in specific slots on a physical sheet, preventing waste. This is implemented in `frontend/src/components/AdvancedPrintModal.js` and `frontend/src/components/LabelManagerView.js`.

* **Rack Builder**: A drag-and-drop interface for building virtual AV racks with a library of default and custom equipment templates. The core functionality is in `frontend/src/views/RackBuilderView.js` and `frontend/src/components/RackComponent.js`.

* **Admin Panel**: A restricted view for administrators to manage the default equipment library by creating, updating, and deleting folders and equipment templates. See `frontend/src/views/AdminView.js` and `app/api.py` for API routes.

* **Modern Interface**: Built with a clean, dark-themed GUI that is easy to navigate using the styles in `frontend/src/index.css`.

* **Flexible Data Import/Export**: Import and export label lists as CSV files to integrate with other software and workflows.

* **Supabase Integration**: The backend uses Supabase for user authentication, SSO setup, and data management for shows and equipment libraries, as configured in `app/api.py`.

### Installation

This application is built with Python and a React frontend, requiring a few external libraries. You will also need a Supabase project for the database and authentication.

#### 1. Clone the Repository

First, clone this repository to your local machine using Git. Open your terminal or command prompt and run:

```
git clone [https://github.com/V1d1o7/ShowReady.git](https://github.com/V1d1o7/ShowReady.git)
cd ShowReady

```

#### 2. Environment Variables

You need to create two `.env` files. The `.gitignore` file in the root directory ensures these files are not committed to Git.

**Backend `.env` File**

Create a file named `.env` in the **root directory** of the project with the following content:

```
# Supabase connection details
SUPABASE_URL="<your_supabase_project_url>"
SUPABASE_KEY="<your_supabase_service_role_key>"

# Optional Supabase auth secrets (if enabled in config.toml)
OPENAI_API_KEY="<your_openai_api_key>"
S3_HOST="<your_s3_host>"
S3_REGION="<your_s3_region>"
S3_ACCESS_KEY="<your_s3_access_key>"
S3_SECRET_KEY="<your_s3_secret_key>"
SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN="<your_twilio_auth_token>"
SUPABASE_AUTH_EXTERNAL_APPLE_SECRET="<your_apple_secret>"

```

**Frontend `.env` File**

Create a file named `.env` in the `frontend/` directory of the project with the following content:

```
# Public keys for the React frontend
REACT_APP_SUPABASE_URL="<your_supabase_project_url>"
REACT_APP_SUPABASE_ANON_KEY="<your_supabase_anon_key>"

```

#### 3. Backend Prerequisites

Ensure you have Python 3 installed. From the project root directory, install the Python dependencies:

```
pip install -r requirements.txt

```

#### 4. Frontend Prerequisites

Navigate to the `frontend/` directory and install the Node.js dependencies:

```
npm install

```

### Usage

1. **Launch the Application**: In one terminal, start the Python backend from the project root:

   ```
   uvicorn app.main:app --reload
   
   ```

   In a second terminal, start the React frontend from the `frontend/` directory:

   ```
   npm start
   
   ```

2. **Navigate**: Use the sidebar on the left to switch between the **Loom Labels**, **Case Labels**, and **Show Manager** sections.

3. **Manage Shows**: Start in the **Show Manager** to create a new show profile and set a default logo.

4. **Create Labels**: Navigate to the appropriate label editor. The Case Labeler will automatically load the logo from your active show.

5. **Print**: Use the **Generate PDF** button for full, sequential sheets, or the **Advanced Print** button to place labels in specific slots for correction prints.

### Loom Label Editor

### Case Label Editor

### Show Manager

### Advanced Print Window
